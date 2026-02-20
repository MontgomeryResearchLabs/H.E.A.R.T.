/**
 * Tailwind CSS Configuration
 * ===========================
 * Extends Tailwind with a custom Valentine's Day color palette (pinks & reds),
 * display and body font families, and a custom keyframe animation for pulsing
 * elements (used by the anniversary counter).
 *
 * Color tokens follow the standard Tailwind 50–900 scale so they work with
 * all Tailwind opacity/modifier utilities out of the box.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],

  theme: {
    extend: {
      /* ------------------------------------------------------------------ */
      /*  Custom Valentine's Day colour palette                              */
      /* ------------------------------------------------------------------ */
      colors: {
        'valentine-pink': {
          50:  '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899', // Primary pink
          600: '#db2777',
          700: '#be185d',
          800: '#9f1239',
          900: '#831843',
        },
        'valentine-red': {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444', // Primary red
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },

      /* ------------------------------------------------------------------ */
      /*  Typography                                                         */
      /* ------------------------------------------------------------------ */
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],   // Logo & headings
        body:    ['Lora', 'Georgia', 'serif'],                // Body text
        sans:    ['system-ui', '-apple-system', 'sans-serif'], // UI elements
      },

      /* ------------------------------------------------------------------ */
      /*  Animations                                                         */
      /* ------------------------------------------------------------------ */
      keyframes: {
        /** Gentle pulse used by the anniversary counter on the anniversary date */
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.7' },
        },
        /** Slow float for landing page photo frames */
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
      },
      animation: {
        'soft-pulse': 'soft-pulse 3s ease-in-out infinite',
        'float':      'float 6s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};
