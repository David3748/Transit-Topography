# Transit Topography

Interactive transit isochrone maps for 28 cities. Click anywhere to see how far you can go by public transit in a given time.

Live: https://transit-topography.netlify.app

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run validate:data
npm run build
```

`validate:data` checks `src/data/city-config.ts` against the checked-in `transit_data` files. Public city entries must have their required transit files available, and optional bus/water/building assets may only be referenced when the file exists.
