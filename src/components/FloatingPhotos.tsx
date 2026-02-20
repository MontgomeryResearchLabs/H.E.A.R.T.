/**
 * FloatingPhotos.tsx — Landing Page Hero Component
 * ==================================================
 * A React island that renders 15–20 photo frames floating over the
 * dark grid background. Each photo is randomly positioned and given a
 * unique looping animation (drift + float) via Framer Motion.
 *
 * Interactions
 * ------------
 * - **Hover**: Subtle scale-up + pink glow border
 * - **Click**: Navigates to the photo's position in the timeline
 *
 * Performance Notes
 * -----------------
 * - Uses `translate3d` (via Framer Motion's hardware-accelerated
 *   transforms) rather than top/left to keep animations on the GPU.
 * - Images are lazy-loaded; only ~20 are rendered at a time.
 * - Positions are calculated once on mount and memoised.
 *
 * @module components/FloatingPhotos
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A photo to display on the landing page. */
export interface FloatingPhoto {
  /** URL to the optimised image file */
  src: string;
  /** Accessible alt text */
  alt: string;
  /** Display date (e.g. "Jul 4, 2023") */
  date: string;
  /** Hash fragment id for scroll-to in /timeline, e.g. "first-date" */
  timelineId: string;
}

interface FloatingPhotosProps {
  photos: FloatingPhoto[];
}

/** Internal type for a photo enriched with random layout values. */
interface PositionedPhoto extends FloatingPhoto {
  /** Horizontal position as a percentage (0–85) */
  x: number;
  /** Vertical position as a percentage (0–85) */
  y: number;
  /** Rotation in degrees (-12 to +12) */
  rotation: number;
  /** Z-index layer (0–3) — creates depth */
  layer: number;
  /** Animation duration in seconds (4–8) — variety keeps it organic */
  animDuration: number;
  /** Animation delay in seconds (0–3) — stagger the start */
  animDelay: number;
  /** Photo frame width class name */
  sizeClass: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Available Tailwind width classes for photo frames (varied sizes). */
const SIZE_CLASSES = [
  'w-28 h-36 md:w-36 md:h-44',   // small
  'w-32 h-40 md:w-44 md:h-52',   // medium
  'w-36 h-48 md:w-52 md:h-64',   // large
  'w-40 h-52 md:w-56 md:h-72',   // extra large
];

/**
 * Generates deterministic-feeling random layout values for each photo.
 * Called once on mount so positions don't jump on re-renders.
 */
function positionPhotos(photos: FloatingPhoto[]): PositionedPhoto[] {
  return photos.map((photo, i) => {
    /**
     * Position logic:
     * - Few photos (≤6): cluster tightly in the centre (30%–60% x range)
     * - More photos (7+): spread across the screen (5%–80% x range)
     * This way a small collection feels focused, and a large one fills the page.
     */
    const isFewPhotos = photos.length <= 6;
    const xMin = isFewPhotos ? 25 : 5;
    const xRange = isFewPhotos ? 40 : 75;
    const yMin = isFewPhotos ? 20 : 4;
    const yRange = isFewPhotos ? 50 : 74;

    return {
      ...photo,
      x:            Math.random() * xRange + xMin,
      y:            Math.random() * yRange + yMin,
      rotation:     Math.random() * 24 - 12,
      layer:        Math.floor(Math.random() * 4),
      animDuration: Math.random() * 4 + 4,
      animDelay:    Math.random() * 3,
      sizeClass:    SIZE_CLASSES[i % SIZE_CLASSES.length],
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FloatingPhotos({ photos }: FloatingPhotosProps): JSX.Element {
  const [isLoaded, setIsLoaded] = useState(false);

  // Compute positions once and memoise so they survive re-renders
  const positioned = useMemo(() => positionPhotos(photos), [photos]);

  // Delay entrance animations until after first paint
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Navigate to the corresponding timeline entry when a photo is clicked.
   * Uses hash-based navigation so Astro's router handles the page change.
   */
  const handlePhotoClick = (timelineId: string): void => {
    window.location.href = `/timeline#${timelineId}`;
  };

  return (
    <div className="relative w-full h-full overflow-hidden" aria-label="Floating photo gallery">
      <AnimatePresence>
        {isLoaded &&
          positioned.map((photo, index) => (
            <motion.button
              key={`${photo.timelineId}-${index}`}
              className={`
                absolute photo-frame cursor-pointer group
                ${photo.sizeClass}
              `}
              style={{
                left: `${photo.x}%`,
                top:  `${photo.y}%`,
                zIndex: photo.layer,
              }}
              // --- Entrance animation ---
              initial={{ opacity: 0, scale: 0.8, rotate: photo.rotation }}
              animate={{
                opacity: 1,
                scale: 1,
                rotate: photo.rotation,
                // Continuous floating motion (y-axis drift)
                y: [0, -8 - photo.layer * 2, 0],
                // Subtle horizontal sway
                x: [0, 3 + photo.layer, 0],
              }}
              transition={{
                // Entrance
                opacity:  { duration: 0.6, delay: photo.animDelay },
                scale:    { duration: 0.6, delay: photo.animDelay },
                // Looping float
                y: {
                  duration: photo.animDuration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: photo.animDelay,
                },
                x: {
                  duration: photo.animDuration * 1.3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: photo.animDelay + 0.5,
                },
              }}
              // --- Hover: slight scale + glow ---
              whileHover={{ scale: 1.08 }}
              onClick={() => handlePhotoClick(photo.timelineId)}
              aria-label={`View "${photo.alt}" in timeline — ${photo.date}`}
            >
              {/* The actual photo */}
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback for missing images: show a pink-tinted placeholder
                  const target = e.currentTarget;
                  target.onerror = null;
                  target.style.background = 'linear-gradient(135deg, #831843 0%, #9f1239 100%)';
                  target.src = '';
                  target.alt = 'Image unavailable';
                }}
              />

              {/* Date overlay — visible on hover */}
              <div
                className="
                  absolute inset-x-0 bottom-0 py-1.5 px-2
                  bg-gradient-to-t from-black/70 to-transparent
                  text-xs text-white/90 font-sans text-center
                  opacity-0 group-hover:opacity-100 transition-opacity duration-300
                "
              >
                {photo.date}
              </div>
            </motion.button>
          ))}
      </AnimatePresence>
    </div>
  );
}
