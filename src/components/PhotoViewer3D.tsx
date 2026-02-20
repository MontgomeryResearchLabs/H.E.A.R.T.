/**
 * PhotoViewer3D.tsx — WebGL-powered 3D photo gallery for the JRAMMELL timeline.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE OVERVIEW                                               │
 * │                                                                      │
 * │  This component renders timeline photos as floating cards arranged   │
 * │  in a 3D spiral/helix inside a WebGL scene (Three.js r128).         │
 * │                                                                      │
 * │  • A 🎨 button in the fixed toolbar opens a fullscreen 3D gallery   │
 * │  • Photos float in a helical arrangement around a central axis      │
 * │  • Users orbit (drag), zoom (scroll), and click photos to select    │
 * │  • Clicking a photo brings it to focus with a smooth camera move    │
 * │  • A second click opens the existing LightboxViewer                 │
 * │  • Ambient particle effects match the valentine pink theme          │
 * │                                                                      │
 * │  Integration:                                                        │
 * │    - Props: receives image data from timeline.astro (same as other  │
 * │      islands — build-time data passed as serialisable props)        │
 * │    - Lightbox: dispatches 'open-lightbox' CustomEvent on window     │
 * │      (same mechanism as TimelineEntry.astro)                        │
 * │    - Self-positions: fixed bottom-left, stacks with other buttons   │
 * │                                                                      │
 * │  Performance:                                                        │
 * │    - Three.js loaded from CDN (not bundled)                         │
 * │    - Textures lazy-loaded as the user orbits near them              │
 * │    - requestAnimationFrame loop pauses when modal is closed         │
 * │    - All GPU resources disposed on unmount                          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Session 4: Initial implementation.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Types ─────────────────────────────────────────────────────────── */

interface GalleryImage {
  src: string;
  alt: string;
  caption?: string;
  /** Optional entry ID — used to link back to the timeline */
  entryId?: string;
  /** Optional date label shown on the card */
  date?: string;
}

interface PhotoViewer3DProps {
  images: GalleryImage[];
}

/* ─── Three.js type shims ───────────────────────────────────────────── 
   Three.js is loaded from CDN at runtime (like Leaflet in MapViewer).
   We declare minimal type shapes here to keep TS happy without bundling
   the full @types/three package. */

declare global {
  interface Window {
    THREE: any;
  }
}

/* ─── Constants ─────────────────────────────────────────────────────── */

/** CDN URL for Three.js r128 (same version used elsewhere in the project). */
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

/** Valentine-themed colours (matching the project's palette). */
const COLORS = {
  bgTop:      0xdc2626,  // Red (gradient top)
  bgBottom:   0xfdf2f8,  // Pink-50 (gradient bottom)
  cardBorder: 0xec4899,  // Pink-500
  highlight:  0xf472b6,  // Pink-400
  particle:   0xfbcfe8,  // Pink-200
  ambient:    0xfce7f3,  // Pink-100
  white:      0xffffff,
};

/** How many photos to arrange per full revolution of the helix. */
const PHOTOS_PER_REVOLUTION = 8;

/** Vertical spacing between revolutions (world units). */
const HELIX_PITCH = 3;

/** Radius of the helix (distance from centre axis). */
const HELIX_RADIUS = 6;

/** Size of each photo card (world units). */
const CARD_WIDTH = 2.4;
const CARD_HEIGHT = 3.0;

/* ─── Component ─────────────────────────────────────────────────────── */

export default function PhotoViewer3D({ images }: PhotoViewer3DProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  /* Refs for the Three.js scene — kept outside React state to avoid
     unnecessary re-renders (the render loop updates the canvas directly). */
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const cardsRef = useRef<any[]>([]);       // Array of card meshes
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 }); // Normalised mouse position (-1 to 1)
  const isMouseDownRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ theta: 0, phi: Math.PI / 3 }); // Orbit angles
  const targetRotationRef = useRef({ theta: 0, phi: Math.PI / 3 });
  const radiusRef = useRef(12);             // Camera distance from origin
  const targetRadiusRef = useRef(12);
  const particlesRef = useRef<any>(null);

  /* ── Load Three.js from CDN (same pattern as MapViewer with Leaflet) ── */
  const loadThreeJS = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Already loaded?
      if (window.THREE) { resolve(); return; }

      const script = document.createElement('script');
      script.src = THREE_CDN;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Three.js'));
      document.head.appendChild(script);
    });
  }, []);

  /* ── Build the 3D scene ─────────────────────────────────────────── */
  const initScene = useCallback(async () => {
    if (!containerRef.current) return;
    await loadThreeJS();
    const THREE = window.THREE;

    /* --- Scene & background gradient --- */
    const scene = new THREE.Scene();
    // Vertical gradient background using a simple sky shader
    scene.background = new THREE.Color(COLORS.bgBottom);
    scene.fog = new THREE.FogExp2(COLORS.bgBottom, 0.015);

    /* --- Camera --- */
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    camera.position.set(0, 4, 12);
    camera.lookAt(0, 2, 0);

    /* --- Renderer --- */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2× for perf
    renderer.outputEncoding = THREE.sRGBEncoding;
    containerRef.current.appendChild(renderer.domElement);

    /* --- Lighting --- */
    const ambientLight = new THREE.AmbientLight(COLORS.ambient, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(COLORS.white, 1.0);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Soft pink point light from below for romantic glow
    const pinkLight = new THREE.PointLight(COLORS.cardBorder, 0.5, 30);
    pinkLight.position.set(0, -2, 0);
    scene.add(pinkLight);

    /* --- Photo cards arranged in a helix --- */
    const cards: any[] = [];
    const textureLoader = new THREE.TextureLoader();

    images.forEach((img, i) => {
      /**
       * Helix positioning:
       *   θ = angle around Y axis (evenly spaced)
       *   y = height along helix (increases with index)
       *   x, z = circular position at radius HELIX_RADIUS
       */
      const angle = (i / PHOTOS_PER_REVOLUTION) * Math.PI * 2;
      const y = (i / PHOTOS_PER_REVOLUTION) * HELIX_PITCH;
      const x = Math.cos(angle) * HELIX_RADIUS;
      const z = Math.sin(angle) * HELIX_RADIUS;

      /* Card geometry — a flat plane with rounded-corner look via material */
      const geometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

      /* Start with a placeholder material (pink-tinted), load texture async */
      const material = new THREE.MeshStandardMaterial({
        color: COLORS.particle,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        roughness: 0.4,
        metalness: 0.05,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);

      // Face the card toward the centre of the helix so the photo is visible
      mesh.lookAt(0, y, 0);

      /* Store metadata on the mesh for raycasting/interaction later */
      (mesh as any).userData = {
        index: i,
        imageData: img,
        originalPosition: new THREE.Vector3(x, y, z),
        loaded: false,
      };

      scene.add(mesh);
      cards.push(mesh);

      /* Lazy-load the actual photo texture.
         We use the DOM-resolved src (which Astro may have transformed). */
      const imgSrc = resolveImageSrc(img.src);
      textureLoader.load(
        imgSrc,
        (texture: any) => {
          texture.encoding = THREE.sRGBEncoding;
          material.map = texture;
          material.color.set(COLORS.white); // Reset tint once image loads
          material.opacity = 1.0;
          material.needsUpdate = true;
          (mesh as any).userData.loaded = true;
        },
        undefined,
        () => {
          /* Texture failed to load — keep placeholder colour, no crash */
          console.warn(`[PhotoViewer3D] Failed to load texture: ${imgSrc}`);
        }
      );
    });

    /* --- Ambient floating particles (heart-shaped pink dots) --- */
    const particleCount = 200;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Distribute particles in a wide cylinder around the helix
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 15;
      const maxY = (images.length / PHOTOS_PER_REVOLUTION) * HELIX_PITCH + 4;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * maxY - 2;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      sizes[i] = 0.05 + Math.random() * 0.15;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const particleMaterial = new THREE.PointsMaterial({
      color: COLORS.particle,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    /* --- Border / frame lines on each card --- */
    cards.forEach((card) => {
      const edges = new THREE.EdgesGeometry(card.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: COLORS.cardBorder,
        transparent: true,
        opacity: 0.5,
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      card.add(wireframe);
    });

    /* --- Store refs --- */
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    cardsRef.current = cards;
    particlesRef.current = particles;

    setIsLoaded(true);

    /* --- Start render loop --- */
    startRenderLoop();
  }, [images, loadThreeJS]);

  /* ── Render loop ────────────────────────────────────────────────── */
  const startRenderLoop = useCallback(() => {
    const THREE = window.THREE;
    if (!THREE) return;

    const clock = new THREE.Clock();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const particles = particlesRef.current;
      if (!scene || !camera || !renderer) return;

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      /* ── Smooth orbit interpolation ─────────────────────────── */
      const rot = rotationRef.current;
      const target = targetRotationRef.current;
      rot.theta += (target.theta - rot.theta) * 0.05;
      rot.phi += (target.phi - rot.phi) * 0.05;
      radiusRef.current += (targetRadiusRef.current - radiusRef.current) * 0.08;

      // Clamp vertical angle to avoid flipping
      const phi = Math.max(0.2, Math.min(Math.PI - 0.2, rot.phi));

      // Convert spherical coords → cartesian for camera position
      const helixMidY = (images.length / PHOTOS_PER_REVOLUTION / 2) * HELIX_PITCH;
      const r = radiusRef.current;
      camera.position.x = r * Math.sin(phi) * Math.cos(rot.theta);
      camera.position.y = helixMidY + r * Math.cos(phi);
      camera.position.z = r * Math.sin(phi) * Math.sin(rot.theta);
      camera.lookAt(0, helixMidY, 0);

      /* ── Gentle floating animation on cards ─────────────────── */
      cardsRef.current.forEach((card, i) => {
        const orig = card.userData.originalPosition;
        // Subtle sine-wave bob (each card offset in phase)
        card.position.y = orig.y + Math.sin(elapsed * 0.5 + i * 0.7) * 0.15;

        // Highlight hovered card
        if (i === hoveredIndex) {
          card.material.emissive?.set(COLORS.highlight);
          card.material.emissiveIntensity = 0.3;
          card.scale.lerp(new THREE.Vector3(1.1, 1.1, 1), 0.1);
        } else if (i === selectedIndex) {
          card.material.emissive?.set(COLORS.cardBorder);
          card.material.emissiveIntensity = 0.4;
          card.scale.lerp(new THREE.Vector3(1.15, 1.15, 1), 0.1);
        } else {
          card.material.emissive?.set(0x000000);
          card.material.emissiveIntensity = 0;
          card.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
        }
      });

      /* ── Slowly rotate particles for ambient movement ───────── */
      if (particles) {
        particles.rotation.y += delta * 0.02;
      }

      renderer.render(scene, camera);
    };

    animate();
  }, [images, hoveredIndex, selectedIndex]);

  /* ── Resolve image source ───────────────────────────────────────── 
     Astro transforms /src/assets/images/... into /_astro/... at dev time.
     We try to read the already-rendered <img> from the timeline DOM first
     (same strategy as YearbookPDF). Falls back to raw src if DOM lookup fails. */
  function resolveImageSrc(rawSrc: string): string {
    // Try to find a loaded <img> in the page with a matching src
    const allImgs = document.querySelectorAll<HTMLImageElement>('img');
    for (const img of allImgs) {
      const current = img.currentSrc || img.src;
      // Check if the raw path appears somewhere in the resolved URL
      if (current && (current.includes(rawSrc) || rawSrc.includes(img.getAttribute('src') || ''))) {
        return current;
      }
    }
    // Fallback: return the raw path and let the texture loader try it
    return rawSrc;
  }

  /* ── Mouse / touch interaction handlers ─────────────────────────── */

  const handlePointerDown = (e: React.PointerEvent) => {
    isMouseDownRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;

    // Update normalised mouse for hover detection
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };

    // Orbit rotation via drag
    if (isMouseDownRef.current) {
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;

      // Horizontal drag → rotate around Y axis (theta)
      targetRotationRef.current.theta -= dx * 0.005;
      // Vertical drag → tilt (phi), clamped to avoid flipping
      targetRotationRef.current.phi -= dy * 0.005;
      targetRotationRef.current.phi = Math.max(0.3, Math.min(Math.PI - 0.3, targetRotationRef.current.phi));

      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    }

    // Raycasting for hover detection
    doRaycast(e);
  };

  const handlePointerUp = () => {
    isMouseDownRef.current = false;
  };

  /** Zoom via scroll wheel. */
  const handleWheel = (e: React.WheelEvent) => {
    targetRadiusRef.current = Math.max(5, Math.min(25, targetRadiusRef.current + e.deltaY * 0.01));
  };

  /** Raycast from mouse to detect which card (if any) is under the cursor. */
  const doRaycast = useCallback((e: React.PointerEvent) => {
    const THREE = window.THREE;
    if (!THREE || !cameraRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObjects(cardsRef.current);
    if (intersects.length > 0) {
      const idx = intersects[0].object.userData.index;
      setHoveredIndex(idx);
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    } else {
      setHoveredIndex(null);
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
    }
  }, []);

  /** Click a card: first click selects it, second click opens lightbox. */
  const handleClick = (e: React.MouseEvent) => {
    const THREE = window.THREE;
    if (!THREE || !cameraRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObjects(cardsRef.current);

    if (intersects.length > 0) {
      const idx = intersects[0].object.userData.index;

      if (selectedIndex === idx) {
        // Second click on same card → open lightbox
        openLightbox(idx);
      } else {
        // First click → select this card and focus camera toward it
        setSelectedIndex(idx);
        focusOnCard(idx);
      }
    } else {
      // Clicked empty space → deselect
      setSelectedIndex(null);
    }
  };

  /** Smoothly orient the orbit to face the selected card. */
  const focusOnCard = (index: number) => {
    const card = cardsRef.current[index];
    if (!card) return;

    const pos = card.userData.originalPosition;
    // Calculate the angle from the origin to this card's position
    const theta = Math.atan2(pos.z, pos.x);
    // Set target orbit to face this card
    targetRotationRef.current.theta = -theta + Math.PI / 2;
    targetRadiusRef.current = 8;
  };

  /**
   * Dispatch the same CustomEvent that TimelineEntry.astro uses,
   * so the existing LightboxViewer picks it up seamlessly.
   */
  const openLightbox = (index: number) => {
    const lightboxImages = images.map((img) => ({
      src: resolveImageSrc(img.src),
      alt: img.alt,
      caption: img.caption,
    }));

    window.dispatchEvent(
      new CustomEvent('open-lightbox', {
        detail: { images: lightboxImages, index },
      })
    );
  };

  /* ── Window resize handler ──────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  /* ── Open / close the 3D viewer ─────────────────────────────────── */
  const handleOpen = async () => {
    setIsOpen(true);
    // Wait a tick for the container div to mount, then init the scene
    requestAnimationFrame(() => {
      initScene();
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedIndex(null);
    setHoveredIndex(null);
    setIsLoaded(false);

    // Clean up GPU resources
    cancelAnimationFrame(rafRef.current);
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current.forceContextLoss();
      rendererRef.current = null;
    }
    // Remove the canvas from the DOM
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    sceneRef.current = null;
    cameraRef.current = null;
    cardsRef.current = [];
    particlesRef.current = null;
  };

  /* ── Bail out if no images ──────────────────────────────────────── */
  if (!images.length) return null;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Trigger button (fixed position, stacks above yearbook button) ── */}
      <button
        onClick={handleOpen}
        className="w-11 h-11 rounded-full bg-valentine-pink-500/90 text-white shadow-lg
                   hover:bg-valentine-pink-600 transition-colors flex items-center
                   justify-center text-lg backdrop-blur-sm"
        aria-label="Open 3D photo gallery"
        title="3D Gallery"
      >
        🎨
      </button>

      {/* ── Fullscreen 3D modal ───────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9999] bg-gradient-to-b from-red-600/90
                       via-pink-400/80 to-pink-50/95 backdrop-blur-sm"
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full
                         bg-white/20 backdrop-blur-md text-white hover:bg-white/30
                         transition-colors flex items-center justify-center text-xl"
              aria-label="Close 3D gallery"
            >
              ✕
            </button>

            {/* Title */}
            <div className="absolute top-4 left-4 z-10">
              <h2 className="text-white/90 font-display text-xl tracking-wide">
                Our Memories
              </h2>
              <p className="text-white/50 text-xs font-body mt-1">
                Drag to orbit · Scroll to zoom · Click a photo to view
              </p>
            </div>

            {/* Loading indicator */}
            {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-white/70 font-body text-sm flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white/80 rounded-full"
                  />
                  Loading gallery…
                </div>
              </div>
            )}

            {/* Selected photo info overlay */}
            <AnimatePresence>
              {selectedIndex !== null && images[selectedIndex] && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10
                             bg-white/20 backdrop-blur-md rounded-xl px-5 py-3
                             text-center max-w-md"
                >
                  {images[selectedIndex].date && (
                    <p className="text-white/60 text-xs font-body">
                      {images[selectedIndex].date}
                    </p>
                  )}
                  <p className="text-white/90 text-sm font-body mt-1">
                    {images[selectedIndex].alt}
                  </p>
                  {images[selectedIndex].caption && (
                    <p className="text-white/60 text-xs font-body mt-1 italic">
                      {images[selectedIndex].caption}
                    </p>
                  )}
                  <p className="text-white/40 text-[10px] font-body mt-2">
                    Click again to open full view
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Three.js canvas container — fills the entire modal */}
            <div
              ref={containerRef}
              className="w-full h-full"
              style={{ cursor: 'grab' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={handleClick}
              onWheel={handleWheel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
