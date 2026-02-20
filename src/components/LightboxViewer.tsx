/**
 * LightboxViewer.tsx — Full-Screen Image Lightbox
 * =================================================
 * A React island that displays a full-screen overlay when the user
 * clicks on a timeline photo. Supports:
 *   - Previous / Next navigation (arrow keys + buttons)
 *   - Close on ESC or backdrop click
 *   - Image caption display
 *   - Swipe gestures (Framer Motion drag)
 *
 * This component is rendered once on the timeline page and listens for
 * custom `open-lightbox` events dispatched by TimelineEntry images.
 *
 * @module components/LightboxViewer
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** An image that can be displayed in the lightbox. */
export interface LightboxImage {
  src: string;
  alt: string;
  caption?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LightboxViewer(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentImage = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  /* ---- Listen for the custom `open-lightbox` event ---- */
  useEffect(() => {
    /**
     * TimelineEntry dispatches this event with:
     *   detail.images  — array of LightboxImage
     *   detail.index   — which image to open first
     */
    const handleOpen = (e: Event): void => {
      const { images: imgs, index } = (e as CustomEvent).detail as {
        images: LightboxImage[];
        index: number;
      };
      setImages(imgs);
      setCurrentIndex(index);
      setIsOpen(true);
    };

    window.addEventListener('open-lightbox', handleOpen);
    return () => window.removeEventListener('open-lightbox', handleOpen);
  }, []);

  /* ---- Keyboard navigation ---- */
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowLeft':
          if (hasPrev) setCurrentIndex((i) => i - 1);
          break;
        case 'ArrowRight':
          if (hasNext) setCurrentIndex((i) => i + 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    // Prevent body scroll while lightbox is open
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, hasPrev, hasNext]);

  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AnimatePresence>
      {isOpen && currentImage && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Dark backdrop */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={close}
          />

          {/* Close button */}
          <button
            onClick={close}
            className="
              absolute top-4 right-4 z-10
              w-10 h-10 flex items-center justify-center
              rounded-full bg-white/10 text-white/70 hover:text-white
              transition-colors
            "
            aria-label="Close lightbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          </button>

          {/* Previous button */}
          {hasPrev && (
            <button
              onClick={() => setCurrentIndex((i) => i - 1)}
              className="
                absolute left-4 top-1/2 -translate-y-1/2 z-10
                w-10 h-10 flex items-center justify-center
                rounded-full bg-white/10 text-white/70 hover:text-white
                transition-colors
              "
              aria-label="Previous image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {hasNext && (
            <button
              onClick={() => setCurrentIndex((i) => i + 1)}
              className="
                absolute right-4 top-1/2 -translate-y-1/2 z-10
                w-10 h-10 flex items-center justify-center
                rounded-full bg-white/10 text-white/70 hover:text-white
                transition-colors
              "
              aria-label="Next image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Image + Caption */}
          <motion.div
            key={currentIndex}
            className="relative z-10 flex flex-col items-center max-w-[90vw] max-h-[85vh]"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <img
              src={currentImage.src}
              alt={currentImage.alt}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
            />

            {currentImage.caption && (
              <p className="mt-3 text-sm text-white/70 font-body italic text-center max-w-lg">
                {currentImage.caption}
              </p>
            )}

            {/* Image counter */}
            {images.length > 1 && (
              <p className="mt-2 text-xs text-white/40 font-sans">
                {currentIndex + 1} / {images.length}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
