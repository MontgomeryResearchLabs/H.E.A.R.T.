# H.E.A.R.T.
H.E.A.R.T. - Hybrid Engine for Archiving Relationship Timeline

A chronological photo & video timeline web application built with Astro, React, and TypeScript over a 6-day span using Claude (Anthropic) as an AI development partner across four iterative sessions. I handled all architecture, design, and project management decisions while using Claude to accelerate component implementation, debug issues, and maintain a living handoff document that preserved context between sessions.

Features an islands architecture that ships zero JavaScript for static content while selectively hydrating interactive widgets.

## Features

- **Timeline Feed** — Vertically scrolling, chronological feed of photos, videos, text blocks, and milestone cards
- **Interactive Map** — Leaflet.js world map with heart markers, location clustering, and carousel popups
- **3D Photo Gallery** — Three.js WebGL scene with photos arranged in a helical spiral, orbit controls, and lightbox integration
- **Music Player** — Ambient audio with play/pause, skip, scrub bar, and auto-advance
- **Calendar Navigation** — Month/year picker that scrolls the timeline to any date
- **Fullscreen Lightbox** — Image overlay with keyboard navigation, triggered from any photo entry

## Tech Stack

| Technology | Role |
|---|---|
| Astro 4.x | Static site generator — pages pre-rendered at build time |
| React 18 | Interactive island components (map, player, lightbox, gallery) |
| TypeScript | Strict mode, Zod schema validation |
| Tailwind CSS | Utility-first styling with custom colour tokens |
| Leaflet.js | Interactive map (CDN-loaded) |
| Three.js | WebGL 3D photo gallery (CDN-loaded) |
| Sharp | Build-time image optimisation (WebP, AVIF, responsive sizes) |
| Cloudflare Pages | Static hosting with global CDN |

## Architecture

```
Astro (Static HTML)
├── Landing Page
│   └── FloatingPhotos.tsx [React Island]
│
└── Timeline Page (static content + React islands)
    ├── MusicPlayer.tsx      — fixed bottom-right
    ├── CalendarNav.tsx       — fixed button → modal
    ├── MapViewer.tsx         — fixed button → map modal
    ├── PhotoViewer3D.tsx     — fixed button → 3D gallery modal
    ├── LightboxViewer.tsx    — overlay, event-driven
    └── YearbookPDF.tsx       — fixed button → print overlay
```

**Key design decisions:**

- **Islands architecture** — React only loads for interactive widgets. The timeline content is plain HTML.
- **Browser-native inter-component communication** — Islands use `CustomEvent` on `window` rather than shared state (Redux/Zustand would require a single React tree, defeating the islands pattern).
- **CDN-loaded heavy libraries** — Leaflet (~40KB) and Three.js (~150KB) load on-demand when the user opens the relevant modal, keeping initial page load fast.
- **JSON content collection** — Each timeline entry is a standalone JSON file validated by a Zod schema at build time.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
# → http://localhost:4321
```

### Build

```bash
npm run build    # Static build → /dist
npm run preview  # Preview the build locally
```

## Adding Content

### Photos

1. Export from Photos.app as JPEG
2. Place in `src/assets/images/YYYY/MM/`
3. Create a JSON file in `src/content/timeline/`:

```json
{
  "id": "beach-day",
  "date": "2023-08-15T14:00:00-04:00",
  "type": "photo",
  "location": {
    "name": "Tulum, Mexico",
    "latitude": 20.2114,
    "longitude": -87.4654
  },
  "images": [
    {
      "src": "/src/assets/images/2023/08/beach.jpg",
      "alt": "Description",
      "caption": "Optional caption"
    }
  ]
}
```

### Videos

1. Convert to MP4: `ffmpeg -i input.MOV -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4`
2. Place in `public/videos/YYYY/MM/`
3. Create a JSON file with `"type": "video"`

### Milestones

```json
{
  "id": "one-year",
  "date": "2024-07-04T00:00:00-04:00",
  "type": "milestone",
  "milestone": {
    "title": "One Year Together",
    "description": "365 days of love and laughter.",
    "icon": "🎉"
  },
  "images": []
}
```

Any entry type can include a `location` object to appear on the map.

## Deployment

Push to GitHub → connect to Cloudflare Pages → build command: `npm run build` → output directory: `dist`. No adapter needed.

## Built With Claude

This project was developed across **4 sessions over 6 days** using [Claude](https://claude.ai) (Anthropic) as an AI development partner. Here's how the workflow broke down:

| Session | Focus | What I Did | What Claude Did |
|---|---|---|---|
| 1 | Foundation | Defined the tech stack, design direction (valentine theme, gradient, clouds), and data architecture | Implemented the base Astro project, light theme, cloud CSS, floating photos component |
| 2 | Map & Video | Decided on Leaflet for mapping, designed the location schema, planned video support | Built MapViewer with clustering/carousel popups, added video rendering, updated Zod schema |
| 3 | Music | Specified player UX (skip logic, scrub, auto-advance)| Rewrote MusicPlayer with full transport controls|
| 4 | 3D Gallery & Polish | Chose helix layout for 3D gallery, identified and reported the skip-back SVG bug | Built PhotoViewer3D with Three.js, fixed the broken SVG, created handoff documentation |

**My role:** All architecture and design decisions, tech stack selection, feature prioritisation, content schema design, testing/QA, deployment, and project management across sessions.

**Claude's role:** Component implementation from my specifications, debugging from my bug reports, and maintaining a handoff document so context carried between sessions.

A structured handoff document (`HANDOFF.md`) was maintained across all sessions — it tracked every change, documented component internals, and listed known issues. This is the same practice I'd use handing off work to a human teammate.

## License

MIT
