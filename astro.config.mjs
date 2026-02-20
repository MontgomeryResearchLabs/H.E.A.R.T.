/**
 * Astro Configuration
 * ====================
 * Configures the Astro static site generator with:
 * - Static output mode (pre-renders all pages at build time)
 * - React integration for interactive "island" components
 * - Tailwind CSS for utility-first styling
 * - Sharp image service for build-time image optimization
 *
 * Cloudflare Pages Deployment
 * ----------------------------
 * For static sites, Cloudflare Pages works out of the box — no adapter
 * needed. Just point Cloudflare to the `dist/` output folder.
 * If you later switch to SSR (`output: 'server'`), uncomment the
 * adapter lines below.
 *
 * @see https://docs.astro.build/en/reference/configuration-reference/
 */

import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
// import cloudflare from '@astrojs/cloudflare'; // Uncomment if switching to SSR

export default defineConfig({
  // Pre-render everything as static HTML for maximum performance
  output: 'static',

  // Uncomment if you switch to output: 'server' or 'hybrid'
  // adapter: cloudflare(),

  integrations: [
    // Enable React components as interactive islands
    react(),

    // Tailwind CSS — we manage base styles in global.css
    tailwind({
      applyBaseStyles: false,
    }),
  ],

  image: {
    // Use Sharp for build-time image optimization (WebP, AVIF, responsive sizes)
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },

  vite: {
    ssr: {
      // Prevent Sharp from being bundled into SSR output (it's native code)
      external: ['sharp'],
    },
  },
});
