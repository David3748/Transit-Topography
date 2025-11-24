<!-- 2cae6fba-32fe-4e23-8100-147e4daa02e6 2a5889bc-55cd-4d7c-a23f-37cffda54fb4 -->
# Transit Topography Enhancements

## Features to Implement

### 1. Dark Mode

Add a theme toggle with dark map tiles and inverted UI colors.

**Changes:**

- `index.html`: Add dark mode CSS variables and toggle button
- `js/app.js`: Theme state management, localStorage persistence
- Use CartoDB Dark Matter tiles for dark mode: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`

### 2. Show Transit Stations

Display station markers as small dots on the map.

**Changes:**

- `js/app.js`: Add `stationLayer` (Leaflet CircleMarker layer group)
- Render stations after loading transit data with color-coded markers by line
- Toggle visibility with checkbox in UI

### 3. Debounced Rendering

Prevent excessive redraws during rapid pan/zoom.

**Changes:**

- `js/canvas-layer.js`: Add 150ms debounce to `redraw()` calls
- Cancel pending renders when new movement starts

### 4. Progressive Rendering

Show low-resolution preview immediately, then refine.

**Changes:**

- `js/canvas-layer.js` and `js/render-worker.js`:
- First pass: pixelSize = 16 (fast preview)
- Second pass: pixelSize = user setting (full quality)
- Display "Refining..." indicator during second pass

### 5. Export as Image

Download current isochrone view as PNG.

**Changes:**

- `index.html`: Add "Export" button next to Share button
- `js/app.js`: Use `html2canvas` or manual canvas compositing to capture map + overlay
- Include legend and attribution in export

### 6. Keyboard Shortcuts

Add hotkeys for common actions.

**Shortcuts:**

- `D` - Toggle dark mode
- `+`/`=` - Zoom in
- `-` - Zoom out
- `S` - Toggle stations
- `L` - Toggle transit lines
- `E` - Export image
- `?` - Show help modal

**Changes:**

- `js/app.js`: Add `keydown` event listener
- `index.html`: Add help modal showing shortcuts

### 9. Show Transit Lines

Draw transit routes as colored polylines.

**Changes:**

- `transit_engine.js`: Store edge geometry (line segments between stations)
- `js/app.js`: Add `transitLinesLayer` (Leaflet Polyline layer group)
- Color lines by route type (subway = bold, bus = thin dashed)
- Toggle visibility with checkbox

---

## Implementation Order

1. **Debounced Rendering** (quick fix, improves UX immediately)
2. **Dark Mode** (visual, self-contained)
3. **Keyboard Shortcuts** (depends on dark mode toggle)
4. **Show Transit Stations** (adds visual context)
5. **Show Transit Lines** (builds on station data)
6. **Progressive Rendering** (rendering improvement)
7. **Export as Image** (final polish)

---

## File Changes Summary

| File | Changes |
|------|---------|
| `index.html` | Dark mode CSS, toggle button, export button, shortcuts modal, station/line toggles |
| `js/app.js` | Theme management, keyboard handler, station/line layers, export function |
| `js/canvas-layer.js` | Debounce logic, progressive render (two-pass) |
| `js/render-worker.js` | Support for progressive render passes |
| `transit_engine.js` | Store line geometry for route visualization |

### To-dos

- [ ] Move canvas rendering to Web Worker with OffscreenCanvas
- [ ] Implement k-d tree or grid spatial index for station lookups
- [ ] Add polygon simplification to generate_city_data.py
- [ ] Implement tile-based caching for computed isochrones
- [ ] Extract inline JavaScript from index.html into modules
- [ ] Add progress indicator, click-to-query, and URL sharing