/**
 * Image Loader Utilities
 * =======================
 * Helper functions for working with images in the timeline:
 *   - Generating responsive `srcset` attributes
 *   - Building placeholder data URIs for lazy loading
 *   - Selecting a random subset of images for the landing page
 *
 * These utilities are consumed by both Astro server components (at build
 * time) and React client islands (at runtime).
 *
 * @module utils/imageLoader
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Responsive image widths used across the site.
 * Sharp generates a variant for each width during the build step.
 */
export const RESPONSIVE_WIDTHS = [400, 800, 1200, 1920] as const;

/** Placeholder colour for images that haven't loaded yet. */
export const PLACEHOLDER_COLOR = '#1a1a1a';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Describes a single image entry in the timeline content collection. */
export interface TimelineImage {
  src: string;
  alt: string;
  caption?: string;
}

/* ------------------------------------------------------------------ */
/*  Functions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns a tiny 1×1 SVG data URI used as a placeholder `src` while
 * the real image loads. This prevents layout shifts (CLS) because the
 * browser can render the element at the correct aspect ratio immediately.
 *
 * @param width  - Intrinsic width  (used to compute aspect ratio)
 * @param height - Intrinsic height (used to compute aspect ratio)
 * @param color  - Fill colour (defaults to a dark surface)
 * @returns A base64-encoded SVG data URI
 */
export function getPlaceholderDataUri(
  width: number = 400,
  height: number = 300,
  color: string = PLACEHOLDER_COLOR,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  // btoa is available in both Node (≥16) and browsers
  const encoded = typeof btoa !== 'undefined'
    ? btoa(svg)
    : Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Picks `count` random items from an array without replacement.
 * Used on the landing page to select a diverse subset of photos
 * for the floating animation.
 *
 * Uses the Fisher–Yates shuffle on a shallow copy so the original
 * array is never mutated.
 *
 * @param items - The source array
 * @param count - How many items to pick (clamped to array length)
 * @returns A new array with `count` randomly selected items
 *
 * @example
 * pickRandom([1, 2, 3, 4, 5], 3); // e.g. [4, 1, 5]
 */
export function pickRandom<T>(items: ReadonlyArray<T>, count: number): T[] {
  const shuffled = [...items];
  // Fisher–Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Returns a CSS `object-position` value that keeps faces roughly
 * centred. A simple heuristic: default to "center 30%" which works
 * well for portrait-style photos where faces tend to sit in the
 * upper-third of the frame.
 *
 * In the future this could accept face-detection coordinates from a
 * pre-processing step.
 */
export function getFocusPosition(): string {
  return 'center 30%';
}

/**
 * Generates an `onerror` handler string for inline HTML that swaps a
 * broken image with a themed placeholder. Used in server-rendered
 * Astro components where we can't attach React event handlers.
 *
 * @returns An inline JS string suitable for the `onerror` attribute
 */
export function getImageErrorHandler(): string {
  return `this.onerror=null;this.src='${getPlaceholderDataUri()}';this.alt='Image unavailable';`;
}
