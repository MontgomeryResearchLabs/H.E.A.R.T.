/**
 * MapViewer.tsx — Interactive World Map with Carousel Popups
 * ============================================================
 * A React island that renders an interactive map showing all timeline
 * entries that have location data. Locations at the same coordinates
 * (or within ~1km) are grouped into a single pin. Clicking a pin opens
 * a carousel popup letting the user browse all memories at that spot.
 *
 * Key Behaviours
 * --------------
 * - **Grouping**: Entries within ~0.01° lat/lng (~1km) are merged into
 *   one marker. This handles cases like multiple photo sets from the
 *   same city (e.g. 5 entries in Cancún across different trips).
 *
 * - **Carousel popup**: When a grouped pin has multiple entries, the
 *   popup shows left/right arrows and a dot indicator so the user can
 *   browse each memory. Single-entry pins show a simple popup.
 *
 * - **Marker icon**: If ANY entry in a group is a milestone, the pin
 *   uses the gold star icon. Otherwise it uses the pink heart.
 *
 * - **Journey line**: A dashed pink polyline connects the *first*
 *   entry from each location group in chronological order, tracing
 *   the couple's travel path across the world.
 *
 * Architecture
 * ------------
 * - Leaflet.js loaded from CDN (no npm dependency)
 * - CartoDB Positron tiles for a soft, light map aesthetic
 * - Framer Motion for modal open/close animation
 * - All popup HTML is vanilla (Leaflet requirement) with inline styles
 *   and a small JS carousel controller injected per popup
 *
 * @module components/MapViewer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single location entry to display on the map. */
export interface MapLocation {
  /** Unique ID matching the timeline entry (used for scroll-to linking) */
  id: string;
  /** Human-readable place name (e.g. "Cancún, Mexico") */
  name: string;
  /** GPS latitude in decimal degrees */
  latitude: number;
  /** GPS longitude in decimal degrees */
  longitude: number;
  /** ISO date string for display in the tooltip */
  date: string;
  /** Entry type — used to pick the marker icon variant */
  type: 'photo' | 'video' | 'text' | 'milestone';
  /** First image thumbnail (if photo type) for the popup preview */
  thumbnail?: string;
}

/**
 * A group of entries that share the same geographic location.
 * Created by the groupLocationsByProximity() function.
 */
interface LocationGroup {
  /** Display name — uses the name from the first entry */
  name: string;
  /** Average latitude of all entries in the group */
  latitude: number;
  /** Average longitude of all entries in the group */
  longitude: number;
  /** Whether any entry in the group is a milestone (affects icon) */
  hasMilestone: boolean;
  /** All entries at this location, sorted chronologically */
  entries: MapLocation[];
}

/** Props passed from timeline.astro at build time */
interface MapViewerProps {
  locations: MapLocation[];
}

/* ------------------------------------------------------------------ */
/*  Leaflet type declarations (loaded from CDN, not bundled)          */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    L: typeof import('leaflet');
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * Proximity threshold for grouping locations (in decimal degrees).
 * ~0.01° ≈ 1.1km at the equator. Entries within this distance are
 * treated as "the same place" and merged into one map pin.
 */
const PROXIMITY_THRESHOLD = 0.01;

/** Heart-shaped SVG marker for photo/video/text entries */
const HEART_MARKER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#ec4899" flood-opacity="0.4"/>
      </filter>
    </defs>
    <path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
         2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
         C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
         c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      fill="#ec4899" stroke="#be185d" stroke-width="0.5" filter="url(#shadow)"
    />
  </svg>
`;

/** Gold star marker for groups containing at least one milestone */
const MILESTONE_MARKER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
    <defs>
      <filter id="starshadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#f59e0b" flood-opacity="0.4"/>
      </filter>
    </defs>
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87
         1.18 6.88L12 17.77l-6.18 3.25L7 14.14
         2 9.27l6.91-1.01L12 2z"
      fill="#f59e0b" stroke="#d97706" stroke-width="0.5" filter="url(#starshadow)"
    />
  </svg>
`;

/* ------------------------------------------------------------------ */
/*  Helper: Group nearby locations into clusters                       */
/* ------------------------------------------------------------------ */

/**
 * Groups locations that are geographically close together (within
 * PROXIMITY_THRESHOLD degrees) into single LocationGroup objects.
 *
 * Algorithm: Simple greedy clustering. For each location, check if it
 * falls within the threshold of an existing group's centroid. If yes,
 * add it to that group. If no, start a new group.
 *
 * This is O(n*m) where n = locations, m = groups. Fine for the expected
 * scale (< 100 locations).
 */
function groupLocationsByProximity(locations: MapLocation[]): LocationGroup[] {
  const groups: LocationGroup[] = [];

  // Sort chronologically first so entries within each group stay in order
  const sorted = [...locations].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (const loc of sorted) {
    // Try to find an existing group close enough to this location
    let matched = false;

    for (const group of groups) {
      const latDiff = Math.abs(group.latitude - loc.latitude);
      const lngDiff = Math.abs(group.longitude - loc.longitude);

      if (latDiff < PROXIMITY_THRESHOLD && lngDiff < PROXIMITY_THRESHOLD) {
        // Add to existing group
        group.entries.push(loc);
        if (loc.type === 'milestone') group.hasMilestone = true;

        // Recalculate centroid (running average)
        const n = group.entries.length;
        group.latitude = group.entries.reduce((sum, e) => sum + e.latitude, 0) / n;
        group.longitude = group.entries.reduce((sum, e) => sum + e.longitude, 0) / n;

        matched = true;
        break;
      }
    }

    if (!matched) {
      // Start a new group
      groups.push({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        hasMilestone: loc.type === 'milestone',
        entries: [loc],
      });
    }
  }

  return groups;
}

/* ------------------------------------------------------------------ */
/*  Helper: Build popup HTML for a location group                      */
/* ------------------------------------------------------------------ */

/**
 * Generates the inner HTML for a Leaflet popup.
 *
 * - If the group has 1 entry: simple card with thumbnail, name, date, link.
 * - If the group has 2+ entries: a carousel with prev/next arrows, dot
 *   indicators, and the same card content for each slide.
 *
 * The carousel is driven by a tiny inline <script> that Leaflet injects
 * into the DOM when the popup opens. Each carousel instance uses a unique
 * ID so multiple popups don't interfere.
 */
function buildPopupHTML(group: LocationGroup): string {
  const entries = group.entries;
  const groupId = `carousel-${group.name.replace(/\W+/g, '-').toLowerCase()}-${Date.now()}`;
  const isCarousel = entries.length > 1;

  /**
   * Builds the card HTML for a single entry (used both for single-entry
   * popups and as individual slides in the carousel).
   */
  const buildEntryCard = (entry: MapLocation, index: number): string => {
    const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Type-specific icon for the badge
    const typeIcon =
      entry.type === 'milestone' ? '⭐'
      : entry.type === 'video' ? '🎬'
      : entry.type === 'text' ? '📝'
      : '📸';

    return `
      <div
        class="${groupId}-slide"
        data-slide-index="${index}"
        style="display: ${index === 0 ? 'block' : 'none'}; text-align: center;"
      >
        ${entry.thumbnail
          ? `<img
              src="${entry.thumbnail}"
              alt="${entry.name}"
              style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;"
            />`
          : `<div style="
              width: 100%; height: 60px; border-radius: 6px; margin-bottom: 8px;
              background: linear-gradient(135deg, #fce7f3, #fdf2f8);
              display: flex; align-items: center; justify-content: center;
              font-size: 24px;
            ">${typeIcon}</div>`
        }
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 14px; font-weight: 600; color: #831843; margin-bottom: 2px;">
          ${entry.name}
        </div>
        <div style="font-size: 12px; color: #9f1239; margin-bottom: 2px;">
          ${dateStr}
        </div>
        <div style="font-size: 11px; color: #d946ef; margin-bottom: 6px;">
          ${typeIcon} ${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
        </div>
        <a
          href="/timeline#${entry.id}"
          style="display: inline-block; font-size: 11px; color: #ec4899; text-decoration: none; border-bottom: 1px dotted #ec4899;"
          onclick="document.querySelector('.map-viewer-backdrop')?.click()"
        >
          View in Timeline →
        </a>
      </div>
    `;
  };

  // ---------- Single entry: simple popup ----------
  if (!isCarousel) {
    return `
      <div style="font-family: 'Lora', Georgia, serif; min-width: 180px;">
        ${buildEntryCard(entries[0], 0)}
      </div>
    `;
  }

  // ---------- Multiple entries: carousel popup ----------

  // Build dot indicators (one per slide)
  const dots = entries
    .map(
      (_, i) => `
      <span
        class="${groupId}-dot"
        data-dot-index="${i}"
        style="
          display: inline-block; width: 7px; height: 7px; border-radius: 50%;
          margin: 0 3px; cursor: pointer; transition: background 0.2s;
          background: ${i === 0 ? '#ec4899' : '#fbcfe8'};
        "
      ></span>
    `,
    )
    .join('');

  return `
    <div style="font-family: 'Lora', Georgia, serif; min-width: 200px; max-width: 240px; position: relative;">

      <!-- Slide container -->
      ${entries.map((entry, i) => buildEntryCard(entry, i)).join('')}

      <!-- Navigation arrows + dot indicators -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #fce7f3;">

        <!-- Previous arrow -->
        <button
          id="${groupId}-prev"
          style="
            width: 24px; height: 24px; border-radius: 50%; border: 1px solid #fbcfe8;
            background: white; color: #ec4899; font-size: 12px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.background='#fdf2f8'"
          onmouseout="this.style.background='white'"
          aria-label="Previous memory"
        >‹</button>

        <!-- Dot indicators -->
        <div style="display: flex; align-items: center;">${dots}</div>

        <!-- Next arrow -->
        <button
          id="${groupId}-next"
          style="
            width: 24px; height: 24px; border-radius: 50%; border: 1px solid #fbcfe8;
            background: white; color: #ec4899; font-size: 12px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.background='#fdf2f8'"
          onmouseout="this.style.background='white'"
          aria-label="Next memory"
        >›</button>
      </div>

      <!-- Counter label (e.g. "1 of 4 memories") -->
      <div
        id="${groupId}-counter"
        style="text-align: center; font-size: 10px; color: #f9a8d4; margin-top: 4px; font-family: system-ui, sans-serif;"
      >
        1 of ${entries.length} memories
      </div>

    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MapViewer({ locations }: MapViewerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  /* ---- Load Leaflet CSS + JS from CDN on first open ---- */
  const loadLeaflet = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.L) {
        setLeafletLoaded(true);
        resolve();
        return;
      }

      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      cssLink.crossOrigin = '';
      document.head.appendChild(cssLink);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => {
        setLeafletLoaded(true);
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Leaflet'));
      document.head.appendChild(script);
    });
  }, []);

  /* ---- Initialize map with grouped markers ---- */
  useEffect(() => {
    if (!isOpen || !leafletLoaded || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const L = window.L;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      /* ---- Create the map ---- */
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 18,
      }).addTo(map);

      /* ---- Custom icon factories ---- */
      const heartIcon = L.divIcon({
        html: HEART_MARKER_SVG,
        className: 'leaflet-heart-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -30],
      });

      const milestoneIcon = L.divIcon({
        html: MILESTONE_MARKER_SVG,
        className: 'leaflet-milestone-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -30],
      });

      /* ---- Group nearby locations ---- */
      const groups = groupLocationsByProximity(locations);

      const latLngs: L.LatLng[] = [];

      groups.forEach((group) => {
        const latLng = L.latLng(group.latitude, group.longitude);
        latLngs.push(latLng);

        // Use star icon if any entry in the group is a milestone
        const icon = group.hasMilestone ? milestoneIcon : heartIcon;

        // Build the popup HTML (single card or carousel)
        const popupHTML = buildPopupHTML(group);

        // Determine max popup width based on whether it's a carousel
        const maxWidth = group.entries.length > 1 ? 260 : 220;

        const marker = L.marker(latLng, { icon })
          .addTo(map)
          .bindPopup(popupHTML, {
            maxWidth,
            minWidth: 180,
            className: 'valentine-popup',
          });

        /**
         * Show entry count badge on markers with multiple memories.
         * Uses a second divIcon overlaid at the same position.
         */
        if (group.entries.length > 1) {
          const countBadge = L.divIcon({
            html: `<div style="
              background: #ec4899; color: white; font-size: 10px; font-weight: 700;
              font-family: system-ui, sans-serif;
              width: 18px; height: 18px; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 2px 6px rgba(236,72,153,0.4);
              border: 1.5px solid white;
            ">${group.entries.length}</div>`,
            className: 'leaflet-count-badge',
            iconSize: [18, 18],
            iconAnchor: [-2, 30], // Position to the top-right of the heart
          });

          L.marker(latLng, { icon: countBadge, interactive: false }).addTo(map);
        }
      });

      

      /* ---- Carousel controller via popupopen event ---- */
      /**
       * Leaflet strips <script> tags from popup HTML for security,
       * so we can't use inline scripts for the carousel. Instead,
       * we listen for Leaflet's `popupopen` event which fires AFTER
       * the popup DOM is fully rendered. At that point we can query
       * for the carousel buttons/dots and attach click handlers.
       */
      map.on('popupopen', () => {
        // Find all carousel prev/next buttons in the currently open popup
        const popupEl = document.querySelector('.leaflet-popup-content');
        if (!popupEl) return;

        const prevBtn = popupEl.querySelector('[id$="-prev"]') as HTMLButtonElement | null;
        const nextBtn = popupEl.querySelector('[id$="-next"]') as HTMLButtonElement | null;
        const counterEl = popupEl.querySelector('[id$="-counter"]') as HTMLElement | null;

        // If no prev/next buttons, this is a single-entry popup — nothing to wire
        if (!prevBtn || !nextBtn) return;

        // Extract the groupId from the prev button's ID (e.g. "carousel-cancun-123-prev")
        const btnId = prevBtn.id;
        const groupIdFromBtn = btnId.replace(/-prev$/, '');

        const slides = popupEl.querySelectorAll(`.${groupIdFromBtn}-slide`) as NodeListOf<HTMLElement>;
        const dots = popupEl.querySelectorAll(`.${groupIdFromBtn}-dot`) as NodeListOf<HTMLElement>;
        const total = slides.length;
        let current = 0;

        /**
         * Show the slide at the given index, hide all others,
         * update dot active states and the counter label.
         */
        function showSlide(idx: number) {
          // Wrap around for circular navigation
          if (idx < 0) idx = total - 1;
          if (idx >= total) idx = 0;
          current = idx;

          slides.forEach((s, i) => {
            s.style.display = i === current ? 'block' : 'none';
          });

          dots.forEach((d, i) => {
            (d as HTMLElement).style.background = i === current ? '#ec4899' : '#fbcfe8';
          });

          if (counterEl) {
            counterEl.textContent = `${current + 1} of ${total} memories`;
          }
        }

        // Attach click handlers to arrows
        prevBtn.onclick = (e) => {
          e.stopPropagation();
          showSlide(current - 1);
        };
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          showSlide(current + 1);
        };

        // Attach click handlers to dots for direct slide navigation
        dots.forEach((d) => {
          d.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(d.getAttribute('data-dot-index') || '0', 10);
            showSlide(idx);
          };
        });
      });

      /* ---- Fit bounds to show all markers ---- */
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
      } else {
        map.setView([20, 0], 2);
      }

      mapInstanceRef.current = map;
    }, 150);

    return () => clearTimeout(timer);
  }, [isOpen, leafletLoaded, locations]);

  /* ---- Cleanup map when modal closes ---- */
  useEffect(() => {
    if (!isOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  }, [isOpen]);

  /* ---- Handle opening ---- */
  const handleOpen = useCallback(async () => {
    try {
      await loadLeaflet();
    } catch (err) {
      console.error('MapViewer: Failed to load Leaflet', err);
    }
    setIsOpen(true);
  }, [loadLeaflet]);

  /* ---- Keyboard: close on ESC ---- */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  /* ---- Unique location count (groups, not individual entries) ---- */
  const uniqueLocationCount = groupLocationsByProximity(locations).length;
  const totalMemories = locations.length;

  return (
    <>
      {/* ---- Globe trigger button ---- */}
      <button
        onClick={handleOpen}
        className="
          fixed z-50 top-4 right-[4.5rem] md:top-6 md:right-[5rem]
          w-11 h-11 md:w-12 md:h-12
          flex items-center justify-center
          rounded-full border border-white/10
          bg-black/50 backdrop-blur-md
          text-white/80 hover:text-valentine-pink-400
          hover:border-valentine-pink-400/40
          transition-all duration-300
          shadow-lg
          group
        "
        aria-label={`Open map — ${uniqueLocationCount} locations, ${totalMemories} memories`}
        title="View our travel map"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300 group-hover:rotate-12"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>

        {/* Badge shows unique location count */}
        {uniqueLocationCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-valentine-pink-500 text-white text-[10px] font-sans font-bold shadow-md">
            {uniqueLocationCount}
          </span>
        )}
      </button>

      {/* ---- Map modal overlay ---- */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="map-viewer-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              className="relative w-full max-w-5xl h-[75vh] md:h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ---- Header bar ---- */}
              <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-sm border-b border-valentine-pink-100">
                <div className="flex items-center gap-3">
                  <span className="text-valentine-pink-500 text-lg">🌍</span>
                  <div>
                    <h2 className="font-display text-base md:text-lg text-valentine-pink-800 leading-tight">
                      Our Adventures
                    </h2>
                    <p className="text-xs text-valentine-pink-400 font-body">
                      {totalMemories} {totalMemories === 1 ? 'memory' : 'memories'} across{' '}
                      {uniqueLocationCount} {uniqueLocationCount === 1 ? 'place' : 'places'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-valentine-pink-50 text-valentine-pink-400 hover:text-valentine-pink-600 transition-colors"
                  aria-label="Close map"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* ---- Map container ---- */}
              <div
                ref={mapContainerRef}
                className="w-full h-full"
                style={{ paddingTop: '52px' }}
              />

              {/* ---- Empty state ---- */}
              {locations.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-valentine-pink-50/80">
                  <span className="text-5xl mb-4">🗺️</span>
                  <h3 className="font-display text-xl text-valentine-pink-700 mb-2">
                    No locations yet
                  </h3>
                  <p className="font-body text-sm text-valentine-pink-400 max-w-sm">
                    Add a <code className="bg-valentine-pink-100 px-1.5 py-0.5 rounded text-xs font-sans">location</code> field
                    to your timeline JSON entries to see pins on the map.
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Custom Leaflet popup + marker styles ---- */}
      <style>{`
        .leaflet-heart-marker,
        .leaflet-milestone-marker,
        .leaflet-count-badge {
          background: transparent !important;
          border: none !important;
        }

        .valentine-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(236, 72, 153, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(236, 72, 153, 0.15);
          padding: 4px;
        }

        .valentine-popup .leaflet-popup-content {
          margin: 10px 12px;
        }

        .valentine-popup .leaflet-popup-tip {
          box-shadow: 0 2px 8px rgba(236, 72, 153, 0.1);
          border: 1px solid rgba(236, 72, 153, 0.08);
        }

        .valentine-popup .leaflet-popup-close-button {
          color: #ec4899 !important;
          font-size: 18px;
          padding: 4px 6px;
        }

        .valentine-popup .leaflet-popup-close-button:hover {
          color: #be185d !important;
        }

        .leaflet-heart-marker:hover,
        .leaflet-milestone-marker:hover {
          transform: scale(1.2);
          transition: transform 0.2s ease;
        }
      `}</style>
    </>
  );
}
