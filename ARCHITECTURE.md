# Transit Topography — Architecture

This document describes the current architecture of the Transit Topography web
app as it exists in `src/` (TypeScript, built with Vite). The legacy pre-2025
JavaScript app under `js/` and `transit_engine.js` is kept for reference only
and is not part of the build.

## System Overview

Transit Topography is a fully client-side, statically hosted web app that draws
transit isochrones (travel-time zones) for 28 cities. There is no server-side
processing: all routing and rendering happen in the browser.

- **Language/build:** TypeScript (strict), Vite 6, Tailwind CSS 3
- **Map:** Leaflet with Carto basemap tiles
- **Routing:** Custom Dijkstra over pre-generated transit graphs (GTFS-derived JSON)
- **Rendering:** WebGL fragment-shader isochrone (default) → Web Worker CPU fallback → main-thread fallback
- **Offline:** Hand-rolled service worker (`sw.js`), cache-versioned per build

## Repository Layout (current)

```
index.html              App shell (loaded by Vite)
src/
  main.ts               Application controller (map, UI wiring, state)
  types/index.ts        Shared TypeScript interfaces
  core/
    transit-graph.ts    Station graph + Dijkstra (depart & arrive directions)
    transit-fetcher.ts  Loads transit_data JSON into the graph
    walking-network.ts  Street-network Dijkstra for last-mile times
    spatial-index.ts    Grid index for fast station lookups
    binary-heap.ts      Min-heap priority queue for Dijkstra
  rendering/
    canvas-layer.ts     Leaflet overlay; picks WebGL/worker/main-thread path
    webgl-renderer.ts   GPU isochrone renderer (default)
    render-worker.ts    CPU isochrone renderer in a Web Worker
    color-scale.ts      Single source of truth for the travel-time palette
  masks/
    water-mask.ts       Water polygons used as walking obstacles
    building-mask.ts    Building polygons used as walking obstacles
  poster/
    poster-tab.ts       Poster Studio UI (theme/format/time controls)
    poster-renderer.ts  Orchestrates poster generation
    poster-worker.ts    Off-main-thread poster rasterizer
    poster-themes.ts    Poster color themes
  data/
    city-config.ts      CITIES registry, speeds, transfer penalty, tile URLs
    city-manifest.ts    Per-city feature flags (bus/walking availability)
  utils/                debounce, haversine, headway model, url-params,
                        analytics (GoatCounter), focus-trap
transit_data/           Pre-generated per-city graphs/masks (checked in)
scripts/                Node validation/integration scripts (run in CI)
tests/unit/             Vitest unit tests
public/                 Static assets: icons, robots.txt, site.webmanifest,
                        _headers (Netlify security/cache headers)
sw.js                   Service worker (build-stamped into dist/)
```

## Runtime Architecture

```
┌────────────────────────────── UI (index.html) ─────────────────────────────┐
│ Explore panel   Poster Studio   City modal   Toasts   Keyboard shortcuts    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                            src/main.ts (TransitTopographyApp)
                                    │
        ┌───────────────────────────┼───────────────────────────────┐
        ▼                           ▼                               ▼
 TransitGraph                WalkingNetwork                 IsochoneCanvasLayer
 (Dijkstra over              (Dijkstra over street          (Leaflet overlay)
  station graph,              network for last-mile)
  depart/arrive)                     │                               │
        │                            │                    ┌──────────┴──────────┐
        ▼                            ▼                    ▼                     ▼
 TransitFetcher.loadStaticGraph  walking_*.json    WebGLRenderer       RenderWorker (CPU)
 (transit_data/*.json)                               (default)         (fallback)
        │                                                               │
        ▼                                                               ▼
 WaterMask / BuildingMask (obstacle polygons)              Main-thread CPU (last resort)
```

### Routing model

- `TransitGraph.calculateNetworkTimes(entryNodes, profile)` runs Dijkstra seeded
  with every station within 2 km of the origin. First-mile cost uses
  street-network times when a walking network is loaded, otherwise straight-line
  distance × the street-circuity factor (`EXIT_WALK_FACTOR = 1.4`, shared with
  all render paths and the shader).
  `profile` carries the time-of-day boarding wait (synthetic headway model in
  `utils/headway.ts`), a transfer penalty charged **only on walk-transfer
  links** between stations (line edges are penalty-free — dwell is baked into
  the GTFS-derived speeds), a direction (`depart` or `arrive` — arrive traverses
  the reversed graph for reverse isochrones), and a max-time cutoff.
- `WalkingNetwork.computeFromOrigin` runs a second Dijkstra over the street
  network (where available) so last-mile times follow streets instead of
  straight lines. `generateTransferEdges` adds short walk links between nearby
  stations via a grid index.

### Rendering pipeline

`IsochoneCanvasLayer` computes, per map viewport:

1. Collect active stations (network times within padded bounds).
2. Build an obstacle canvas from water/building masks.
3. Rasterize the walking network into a coarse time grid.
4. Render travel time → color band:
   - **WebGL (default):** fragment shader evaluates the field per pixel; the
     palette is generated from the same `BAND_STOPS` the CPU path uses. The
     per-pixel station scan is capped at 8192 stations, keeping the fastest.
   - **Worker (fallback):** same math on the CPU off-main-thread, with progress
     events and progressive refinement (coarse 8 px preview → full quality).
     The obstacle mask is transferred to the worker zero-copy.
   - **Main thread (last resort):** identical CPU path inline.

   The 150×150 walking-time grid is cached on (origin, bounds, network version)
   so playback/slider/opacity changes skip its 22.5k lookups.
5. `armReveal()` triggers a one-shot outward reveal animation on the next
   completed full-quality render (skipped under `prefers-reduced-motion`).

### Query & export paths

- **Hover inspector / best-route overlay** query a grid index over the network
  times (rebuilt on origin change), not a full station scan.
- **PNG export** rasterizes the current canvas.
- **GeoJSON export** samples the time field on a 240×240 lattice and extracts
  isochrone contours with marching squares (`src/export/contours.ts`), one
  MultiLineString per band boundary — usable in QGIS/kepler.gl.
- **Share URLs** capture city, origin, hour, direction, maxTime and bus flag,
  restored and validated on load (`src/utils/url-params.ts`).

`getTravelTime(lat, lng)` powers the hover inspector and the right-click
"best route" overlay (path reconstruction via Dijkstra predecessors).

### Poster Studio

`poster-tab.ts` → `poster-renderer.ts` → `poster-worker.ts` render high-res,
themed PNG posters off the main thread using the same graph/masks/walking data.

## Build & Deployment

- `npm run build` = validate:data → test:routing → unit tests → typecheck →
  `vite build`. The Vite plugin in `vite.config.ts` then copies `transit_data/`
  and stamps `sw.js` with the git hash (`__TT_BUILD_VERSION__` → cache busting).
- **GitHub Pages** via `.github/workflows/deploy.yml` (`VITE_BASE_URL=/Transit-Topography/`).
- **Netlify** uses the default SPA publish of `dist/`; `public/_headers` adds
  CSP/security headers and cache policies (assets immutable, transit_data 1
  week, sw.js must-revalidate). GitHub Pages ignores `_headers`.
- **CI:** `.github/workflows/ci.yml` gates PRs on format, lint, typecheck,
  unit tests, data validation, routing integration tests, and a build.

## Data Formats

### Transit graph (`transit_data/<city>.json`, `*_bus.json`)

```json
{ "nodes": [{ "id": "...", "lat": 40.75, "lon": -73.97 }],
  "edges": [{ "from": "a", "to": "b", "speed": 12.5 }] }
```

Edge weights are derived as `haversine(from, to) / speed` (seconds) at load time.

### Walking network (`transit_data/walking_<city>.json`)

Optimized v2 format: `nodes` is a flat `[[lat, lon], ...]` array and `edges` are
`[fromIdx, toIdx, seconds]`. A legacy object form is still accepted.

### Masks (`transit_data/water_*.json`, `buildings_*.json`)

Polygon arrays projected to the viewport and painted into an obstacle canvas;
obstacle pixels block straight-line walking paths in the CPU render paths.

## Testing & Quality Gates

| Command                 | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `npm run test`          | Vitest unit tests (graph, heap, spatial, colors…)  |
| `npm run validate:data` | city-config ↔ transit_data manifest consistency    |
| `npm run test:routing`  | Integration: build real city graphs, sanity-check  |
| `npm run typecheck`     | `tsc --noEmit` (strict)                            |
| `npm run lint`          | ESLint 9 flat config (typescript-eslint)           |
| `npm run format:check`  | Prettier                                           |
| `npm run build`         | All of the above + production bundle               |

## Browser Compatibility

- Chrome/Edge 90+, Firefox 90+, Safari 15+ (ES2020, OffscreenCanvas optional).
- WebGL preferred; automatic fallback to worker/main-thread rendering when
  unavailable (`?webgl=0` or `localStorage tt_webgl='false'` forces the fallback).
- Service worker registers only in production builds; app remains fully
  functional without it.
