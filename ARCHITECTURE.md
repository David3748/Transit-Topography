# Transit Topography - Architecture Documentation

This document provides a comprehensive overview of Transit Topography's architecture, data structures, algorithms, and technical implementation.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [Data Structures](#data-structures)
6. [Algorithms](#algorithms)
7. [Performance Optimizations](#performance-optimizations)
8. [Browser Compatibility](#browser-compatibility)

---

## System Overview

Transit Topography is a **client-side web application** that visualizes transit accessibility through isochrones (travel-time zones). The architecture follows a **modular design** with clear separation of concerns:

- **Frontend**: Pure JavaScript with ES6 modules
- **Rendering**: Leaflet.js with custom Canvas overlay
- **Computation**: Web Workers for background processing
- **Data**: Pre-generated JSON files from GTFS feeds

**Key Design Principles:**
- Zero server-side processing (static hosting)
- Progressive enhancement (fast preview → high quality)
- Efficient spatial indexing for performance
- Modular, maintainable codebase

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │   City     │  │   Time     │  │  Quality   │  │  Export  │ │
│  │  Selector  │  │  Slider    │  │  Settings  │  │  Button  │ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                       app.js                               │ │
│  │  - Event handling     - State management                   │ │
│  │  - UI updates         - Data orchestration                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────┐  ┌────────────────────┐  ┌────────────────┐
│  Transit Engine │  │  Spatial Index     │  │  Canvas Layer  │
│  transit_engine │  │  spatial-index.js  │  │  canvas-layer  │
│                 │  │                    │  │                │
│  - Graph build  │  │  - Grid index      │  │  - Leaflet     │
│  - Dijkstra     │  │  - Fast lookups    │  │    overlay     │
│  - Pathfinding  │  │  - Nearest station │  │  - Canvas draw │
└─────────────────┘  └────────────────────┘  └────────────────┘
            │                                          │
            ▼                                          ▼
┌─────────────────────────────────────────┐  ┌────────────────┐
│          Web Worker                     │  │   Leaflet Map  │
│       render-worker.js                  │  │                │
│                                         │  │  - Base tiles  │
│  - Pixel-by-pixel calculation           │  │  - Panning     │
│  - Isochrone rendering                  │  │  - Zooming     │
│  - Non-blocking computation             │  │  - Markers     │
└─────────────────────────────────────────┘  └────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐            │
│  │   Transit   │  │   Walking    │  │   Water    │            │
│  │   Networks  │  │   Networks   │  │  Polygons  │            │
│  │  (*.json)   │  │(walking_*..) │  │(water_*...) │            │
│  └─────────────┘  └──────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Application Controller (`js/app.js`)

**Responsibilities:**
- Initialize application
- Load city data
- Handle user interactions
- Manage application state
- Coordinate between modules

**Key Functions:**
```javascript
initApp()                  // Application initialization
loadCityData(cityId)       // Load transit data for city
setOrigin(lat, lon)        // Set isochrone origin point
updateTime(minutes)        // Update travel time limit
calculateIsochrone()       // Trigger isochrone calculation
```

### 2. Transit Engine (`transit_engine.js`)

**Responsibilities:**
- Build weighted graph from transit data
- Implement Dijkstra's algorithm
- Calculate shortest paths
- Handle walking connections

**Data Structures:**
```javascript
// Node in transit graph
{
    id: string,
    name: string,
    lat: number,
    lon: number,
    type: 'station' | 'stop'
}

// Edge between nodes
{
    from: nodeId,
    to: nodeId,
    time: number (minutes),
    mode: 'walk' | 'subway' | 'bus' | 'tram'
}
```

**Key Functions:**
```javascript
buildGraph(nodes, edges)        // Construct graph
dijkstra(origin, maxTime)       // Find all reachable nodes
getShortestPath(from, to)       // Get specific route
```

### 3. Spatial Index (`js/spatial-index.js`)

**Responsibilities:**
- Efficient station lookups
- Nearest neighbor queries
- Grid-based spatial partitioning

**Algorithm:**
- Divides map into grid cells (typically 0.01° × 0.01°)
- Stores stations in appropriate cells
- O(1) average lookup time

**Key Functions:**
```javascript
buildIndex(stations)           // Build spatial grid
getNearestStation(lat, lon)    // Find closest station
getStationsInRadius(lat, lon, radius) // Range query
```

### 4. Canvas Layer (`js/canvas-layer.js`)

**Responsibilities:**
- Custom Leaflet overlay
- High-performance rendering
- Coordinate transformations

**Implementation:**
```javascript
class CanvasLayer extends L.Layer {
    onAdd(map)           // Add layer to map
    onRemove(map)        // Remove layer
    _update()            // Redraw on map change
    _reset()             // Recalculate positions
}
```

### 5. Render Worker (`js/render-worker.js`)

**Responsibilities:**
- Background computation
- Pixel-by-pixel travel time calculation
- Prevent UI blocking

**Message Protocol:**
```javascript
// Main → Worker
{
    type: 'render',
    data: { origin, maxTime, bounds, resolution }
}

// Worker → Main
{
    type: 'progress',
    progress: 0.5  // 0-1
}

{
    type: 'complete',
    imageData: ImageData
}
```

### 6. Error Handler (`js/error-handler.js`)

**Responsibilities:**
- Centralized error handling
- User-friendly error messages
- Error categorization and suggestions

**Usage:**
```javascript
ErrorHandler.showError(
    'Failed to load city data',
    error,
    'DATA_LOADING',
    8000
);
```

---

## Data Flow

### Isochrone Calculation Flow

```
1. User Action
   └─> Click map or search address
       │
       ▼
2. Set Origin
   └─> Update state with origin coordinates
       │
       ▼
3. Find Nearest Station
   └─> Spatial index lookup
       │
       ▼
4. Build Graph
   └─> Load transit + walking data
       │
       ▼
5. Run Dijkstra
   └─> Calculate shortest paths to all nodes
       │
       ▼
6. Start Web Worker
   └─> Pass graph and reachable nodes
       │
       ▼
7. Pixel-by-Pixel Calculation
   └─> For each pixel:
       - Find nearest station
       - Add walking time
       - Determine color band
       │
       ▼
8. Render to Canvas
   └─> Draw ImageData on canvas overlay
       │
       ▼
9. Display Result
   └─> Show isochrone on map
```

### City Loading Flow

```
1. Select City
   └─> User picks from dropdown
       │
       ▼
2. Load Configuration
   └─> Read cities_config.json
       │
       ▼
3. Fetch Transit Data
   └─> Load transit_data/city.json
       │
       ▼
4. Fetch Walking Data (if available)
   └─> Load transit_data/walking_city.json
       │
       ▼
5. Fetch Geographic Data (optional)
   └─> Load water_city.json, buildings_city.json
       │
       ▼
6. Build Spatial Index
   └─> Index all stations for fast lookup
       │
       ▼
7. Initialize UI
   └─> Enable controls, center map
```

---

## Data Structures

### Transit Data Format (`transit_data/*.json`)

```json
{
  "nodes": [
    {
      "id": "station_123",
      "name": "Central Station",
      "lat": 40.7580,
      "lon": -73.9855,
      "type": "station"
    }
  ],
  "edges": [
    {
      "from": "station_123",
      "to": "station_456",
      "time": 3.5,
      "mode": "subway",
      "line": "Red Line"
    }
  ]
}
```

### Walking Network Format (`transit_data/walking_*.json`)

```json
{
  "nodes": [
    {
      "id": "intersection_789",
      "lat": 40.7582,
      "lon": -73.9850
    }
  ],
  "edges": [
    {
      "from": "intersection_789",
      "to": "intersection_790",
      "distance": 120.5  // meters
    }
  ]
}
```

### Cities Configuration (`cities_config.json`)

```json
{
  "city_code": {
    "name": "City Name",
    "gtfs_url": "https://...",
    "center": [lat, lon],
    "zoom": 12,
    "region": "north_america",
    "flag": "🇺🇸",
    "hidden": false
  }
}
```

---

## Algorithms

### Dijkstra's Algorithm

**Purpose:** Find shortest paths from origin to all reachable nodes

**Implementation:**
```javascript
function dijkstra(graph, startNode, maxTime) {
    const distances = { [startNode]: 0 };
    const previous = {};
    const queue = new PriorityQueue();

    queue.enqueue(startNode, 0);

    while (!queue.isEmpty()) {
        const current = queue.dequeue();
        const currentTime = distances[current];

        if (currentTime > maxTime) continue;

        for (const edge of graph.getEdges(current)) {
            const newTime = currentTime + edge.time;

            if (newTime < (distances[edge.to] || Infinity)) {
                distances[edge.to] = newTime;
                previous[edge.to] = current;
                queue.enqueue(edge.to, newTime);
            }
        }
    }

    return { distances, previous };
}
```

**Complexity:**
- Time: O((V + E) log V) with priority queue
- Space: O(V)

### Transfer Penalties

- **Walk → Transit:** 0 minutes (free)
- **Transit → Transit:** 5 minutes (realistic transfer)
- **Transit → Walk:** 0 minutes (free)

### Walking Speed

- **Base speed:** 5 km/h (configurable)
- **Calculation:** `time = distance_meters / (5000/60)` minutes

### Progressive Rendering

1. **Preview pass:** 8px resolution (fast)
2. **Final pass:** 1px resolution (detailed)
3. **Progressive refinement:** Show preview while calculating final

**Benefits:**
- Immediate visual feedback
- Perceived performance improvement
- Cancellable for new requests

---

## Performance Optimizations

### 1. Spatial Indexing

**Problem:** Finding nearest station is O(N) for N stations

**Solution:** Grid-based spatial index

```
Grid size: 0.01° × 0.01° (~1km × 1km)
Lookup: O(1) average case
Memory: O(N) for N stations
```

### 2. Web Workers

**Problem:** Isochrone calculation blocks UI

**Solution:** Offload to Web Worker

**Benefits:**
- UI remains responsive
- Can be cancelled/interrupted
- Parallel processing (future)

### 3. Data Compression

**Current:** JSON files (uncompressed)

**Optimizations:**
- Reduce coordinate precision (6 decimal places)
- Simplify geometries (Douglas-Peucker)
- Remove redundant data

**Future:**
- Gzip/Brotli compression
- Binary formats (Protocol Buffers)
- Chunked loading

### 4. Tile-Based Caching

**Strategy:** Cache isochrone tiles to reuse during pan/zoom

**Implementation:**
```javascript
const tileCache = new Map();
const tileKey = `${originLat},${originLon},${time},${zoom}`;
tileCache.set(tileKey, imageData);
```

### 5. Debounced Rendering

**Problem:** Too many redraws during map interactions

**Solution:** Debounce with 150ms delay

```javascript
let renderTimeout;
function requestRender() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => render(), 150);
}
```

### 6. Viewport Culling

**Strategy:** Only render stations/lines within viewport

**Implementation:**
```javascript
const bounds = map.getBounds();
const visibleStations = stations.filter(s =>
    bounds.contains([s.lat, s.lon])
);
```

---

## Browser Compatibility

### Required Features

| Feature | Minimum Version |
|---------|----------------|
| ES6 Modules | Chrome 61, Firefox 60, Safari 11, Edge 16 |
| Web Workers | All modern browsers |
| Canvas API | All modern browsers |
| Fetch API | Chrome 42, Firefox 39, Safari 10.1, Edge 14 |
| Promise | Chrome 32, Firefox 29, Safari 8, Edge 12 |
| Arrow Functions | Chrome 45, Firefox 22, Safari 10, Edge 12 |

### Polyfills

Currently **no polyfills** used. Minimum supported versions:

- **Chrome:** 61+
- **Firefox:** 60+
- **Safari:** 11+
- **Edge:** 79+ (Chromium-based)

### Feature Detection

```javascript
// Check for required features
if (!window.Worker) {
    console.error('Web Workers not supported');
}

if (!window.fetch) {
    console.error('Fetch API not supported');
}
```

---

## Future Architecture Improvements

### Planned Enhancements

1. **TypeScript Migration**
   - Type safety
   - Better IDE support
   - Catch errors at compile time

2. **Build System**
   - Bundler (Vite/Rollup)
   - Minification
   - Tree shaking

3. **State Management**
   - Centralized state object
   - Pub/sub pattern
   - Time-travel debugging

4. **Testing Infrastructure**
   - Unit tests (Jest/Vitest)
   - Integration tests
   - Visual regression tests

5. **Performance Monitoring**
   - Web Vitals tracking
   - Performance marks
   - Error tracking

6. **Service Worker**
   - Offline support
   - Cache API
   - Background sync

7. **WebGL Rendering**
   - GPU-accelerated rendering
   - Handle larger datasets
   - Smoother animations

---

## References

- [Leaflet Documentation](https://leafletjs.com/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Dijkstra's Algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm)
- [GTFS Specification](https://gtfs.org/)

---

**Last Updated:** 2026-01-15
