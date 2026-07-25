# Transit Topography

Interactive transit isochrone maps for 28 cities. Click anywhere to see how far you can go by public transit in a given time.

- Depart/arrive-by routing with time-of-day service levels
- Street-network walking for first/last mile (where available)
- Hover for live travel times; right-click for the best route
- Export as PNG, GeoJSON contours, or a themed poster
- Fully shareable URLs (city, origin, time, direction, options)

Live: https://transit-topography.netlify.app

## Development

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` and set `VITE_LOCATIONIQ_KEY` to enable LocationIQ
autocomplete (optional — search falls back to Nominatim without it).

## Checks

```sh
npm run test            # Vitest unit tests
npm run lint            # ESLint (flat config, typescript-eslint)
npm run format:check    # Prettier
npm run typecheck       # tsc --noEmit (strict)
npm run validate:data   # city-config ↔ transit_data manifest consistency
npm run test:routing    # routing-graph integration checks
npm run build           # all of the above + production bundle
```

`validate:data` checks `src/data/city-config.ts` against the checked-in `transit_data` files. Public city entries must have their required transit files available, and optional bus/water/building assets may only be referenced when the file exists.

Pull requests are gated by CI (`.github/workflows/ci.yml`) on all of the checks
above plus a production build. See [ARCHITECTURE.md](ARCHITECTURE.md) for a
system overview and [CONTRIBUTING.md](CONTRIBUTING.md) for workflow details.
