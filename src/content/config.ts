/**
 * Content Collection Schema — Timeline Entries
 * ==============================================
 * Defines the Zod validation schema for all timeline JSON files in
 * `src/content/timeline/`. Astro validates every file against this
 * schema at build time so malformed content is caught early.
 *
 * Entry Types
 * -----------
 * - **photo**     → One or more images with optional captions
 * - **video**     → One or more video clips with poster thumbnails
 * - **text**      → A prose block (description, poem, testimonial, paragraph)
 * - **milestone** → A special anniversary / life-event card
 *
 * Location Support
 * ----------------
 * Any entry type can optionally include a `location` object with:
 * - `name`      → Human-readable place name (e.g. "Cancún, Mexico")
 * - `latitude`  → GPS latitude coordinate
 * - `longitude` → GPS longitude coordinate
 *
 * @see https://docs.astro.build/en/guides/content-collections/
 */

import { defineCollection, z } from 'astro:content';

const timelineCollection = defineCollection({
  type: 'data',
  schema: z.object({
    /** Unique slug used for scroll anchors, e.g. "first-date" */
    id: z.string(),

    /** ISO 8601 date string — determines chronological ordering */
    date: z.coerce.date(),

    /** Discriminator that controls how the entry is rendered */
    type: z.enum(['photo', 'video', 'text', 'milestone']),

    /* ---- Location (optional, available for ALL entry types) ---- */

    /**
     * Geographic location where this memory took place.
     * When present, the entry appears as a pin on the MapViewer globe.
     * Coordinates should use decimal degrees (WGS 84).
     */
    location: z
      .object({
        /** Human-readable place name shown on the map tooltip */
        name: z.string(),
        /** GPS latitude in decimal degrees */
        latitude: z.number().min(-90).max(90),
        /** GPS longitude in decimal degrees */
        longitude: z.number().min(-180).max(180),
      })
      .optional(),

    /* ---- Photo-specific fields ---- */

    /** Array of images to display in a masonry grid (required when type = 'photo') */
    images: z
      .array(
        z.object({
          /** Path relative to /src/assets/images/ */
          src: z.string(),
          /** Accessible alt-text describing the image */
          alt: z.string(),
          /** Optional visible caption rendered below the image */
          caption: z.string().optional(),
        }),
      )
      .optional(),

    /* ---- Video-specific fields ---- */

    /**
     * Array of video clips to display (required when type = 'video').
     * Videos are rendered as native HTML5 <video> elements with controls.
     *
     * File placement: Put video files in `public/videos/YYYY/MM/` so they're
     * served as static assets (Astro doesn't process files in public/).
     *
     * Format tips:
     * - .mp4 (H.264) has the widest browser support — use this as default
     * - .webm is smaller but less compatible
     * - .mov from iPhone can be converted with: ffmpeg -i input.mov -c:v libx264 output.mp4
     */
    videos: z
      .array(
        z.object({
          /**
           * Path to the video file relative to public/.
           * Example: "/videos/2024/07/beach-sunset.mp4"
           */
          src: z.string(),
          /**
           * Optional poster/thumbnail image shown before playback.
           * If omitted, the browser shows the first frame.
           * Example: "/videos/2024/07/beach-sunset-poster.jpg"
           */
          poster: z.string().optional(),
          /** Accessible alt-text describing the video content */
          alt: z.string(),
          /** Optional visible caption rendered below the video */
          caption: z.string().optional(),
        }),
      )
      .optional(),

    /* ---- Text-specific fields ---- */

    /** Markdown content rendered as prose (required when type = 'text') */
    content: z.string().optional(),

    /** Visual styling variant for the text block */
    textType: z
      .enum(['description', 'poem', 'testimonial', 'paragraph'])
      .optional(),

    /* ---- Milestone-specific fields ---- */

    /** Milestone metadata (required when type = 'milestone') */
    milestone: z
      .object({
        /** Display title, e.g. "First Anniversary" */
        title: z.string(),
        /** Short description of the milestone */
        description: z.string().optional(),
        /** Emoji or icon identifier (e.g. "🎉") */
        icon: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = {
  timeline: timelineCollection,
};
