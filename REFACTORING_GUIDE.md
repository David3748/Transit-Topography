# App.js Refactoring Guide

This document provides a detailed plan for refactoring `js/app.js` (53KB, 1328 lines) into smaller, focused modules.

## Current Structure Analysis

### File Statistics
- **Size**: 53KB
- **Lines**: 1,328
- **Primary concerns**: 7+ (UI, city management, map, origin, settings, export, data loading)
- **Global state variables**: 20+

### Main Functional Areas

1. **City Management** (20% of file)
   - City configuration and constants
   - City loading and switching
   - City detection from coordinates

2. **UI Management** (25% of file)
   - Controls (opacity, resolution, time, toggles)
   - Modals (city selector, help)
   - Keyboard shortcuts
   - Progress bars and legends

3. **Map Management** (15% of file)
   - Leaflet map initialization
   - Layer management
   - Station and line rendering

4. **Origin Management** (20% of file)
   - Origin point handling
   - Address search (LocationIQ)
   - Geocoding and reverse geocoding
   - Origin label updates

5. **Settings Management** (10% of file)
   - URL parameter handling
   - State persistence
   - Theme management

6. **Export Management** (5% of file)
   - PNG image export

7. **Data Loading** (5% of file)
   - Coordinating data fetch operations

## Proposed Module Structure

```
js/
├── app.js                  # Main orchestrator (reduced to ~200 lines)
├── managers/
│   ├── CityManager.js      # City loading, switching, configuration
│   ├── UIManager.js        # UI controls, modals, keyboard
│   ├── MapManager.js       # Map initialization, layers, rendering
│   ├── OriginManager.js    # Origin handling, search, geocoding
│   ├── SettingsManager.js  # State, URL params, persistence
│   └── ExportManager.js    # Image export functionality
├── error-handler.js        # ✓ Already created
├── utils.js                # ✓ Already exists
├── canvas-layer.js         # ✓ Already exists
├── spatial-index.js        # ✓ Already exists
└── render-worker.js        # ✓ Already exists
```

## Detailed Refactoring Plan

### Phase 1: Create Manager Interfaces

Create skeleton files with clear interfaces for each manager.

---

### Module 1: CityManager

**File**: `js/managers/CityManager.js`

**Responsibilities**:
- Load city configurations
- Switch between cities
- Detect city from coordinates
- Manage city-related data

**Extracted from app.js**:
- Lines 9-203 (Constants: WALKING_NETWORK_CITIES, CITIES, REGIONS)
- Lines 544-608 (City modal and grid)
- Lines 1126-1210 (loadCity function)
- Lines 1288-1318 (detectCity function)

**Interface**:
```javascript
export class CityManager {
    constructor(app) {
        this.app = app;
        this.cities = CITIES;
        this.regions = REGIONS;
        this.currentCity = null;
    }

    /**
     * Load a city's transit data
     * @param {string} cityId - City identifier
     * @returns {Promise<void>}
     */
    async loadCity(cityId) { }

    /**
     * Get city configuration
     * @param {string} cityId
     * @returns {Object} City config
     */
    getCityConfig(cityId) { }

    /**
     * Detect city from coordinates
     * @param {number} lat
     * @param {number} lon
     * @returns {string|null} City ID
     */
    detectCity(lat, lon) { }

    /**
     * Get cities in a region
     * @param {string} region
     * @returns {Array<Object>}
     */
    getCitiesByRegion(region) { }
}
```

**Dependencies**:
- `ErrorHandler` for error display
- `TransitFetcher` for data loading
- `WaterMask`, `BuildingMask`, `WalkingNetwork` classes

**State**:
- `currentCity` - Currently loaded city
- `cities` - City configurations
- `regions` - Region names

---

### Module 2: UIManager

**File**: `js/managers/UIManager.js`

**Responsibilities**:
- Initialize and manage all UI controls
- Handle keyboard shortcuts
- Manage modals (city selector, help)
- Update progress bars and legends

**Extracted from app.js**:
- Lines 456-542 (initUI function)
- Lines 610-656 (City modal management)
- Lines 658-710 (Keyboard handling)
- Lines 1212-1259 (Progress and legend)
- Lines 1261-1286 (Help modal)

**Interface**:
```javascript
export class UIManager {
    constructor(app) {
        this.app = app;
        this.elements = {};
    }

    /**
     * Initialize all UI elements
     */
    init() { }

    /**
     * Show/hide city selector modal
     */
    toggleCityModal() { }

    /**
     * Show/hide help modal
     */
    toggleHelpModal() { }

    /**
     * Update progress bar
     * @param {number} progress - 0 to 1
     * @param {string} message
     */
    updateProgress(progress, message) { }

    /**
     * Update legend
     * @param {number} maxTime - Max travel time
     */
    updateLegend(maxTime) { }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} event
     */
    handleKeyboard(event) { }

    /**
     * Get control values
     * @returns {Object} Current UI state
     */
    getControlValues() { }
}
```

**Dependencies**:
- Various DOM elements
- Event delegation

**State**:
- `elements` - Cached DOM references
- UI control values (opacity, resolution, time, etc.)

---

### Module 3: MapManager

**File**: `js/managers/MapManager.js`

**Responsibilities**:
- Initialize Leaflet map
- Manage map layers
- Render stations and transit lines
- Handle map interactions

**Extracted from app.js**:
- Lines 306-364 (initMap function)
- Lines 712-850 (renderStations, renderLines, toggleStations, toggleLines)

**Interface**:
```javascript
export class MapManager {
    constructor(app) {
        this.app = app;
        this.map = null;
        this.layers = {
            tile: null,
            stations: null,
            lines: null,
            canvas: null
        };
    }

    /**
     * Initialize Leaflet map
     * @param {string} containerId - Map container element ID
     * @returns {L.Map} Leaflet map instance
     */
    initMap(containerId) { }

    /**
     * Update map tiles for theme
     * @param {boolean} isDarkMode
     */
    updateTiles(isDarkMode) { }

    /**
     * Render station markers
     */
    renderStations() { }

    /**
     * Render transit lines
     */
    renderLines() { }

    /**
     * Toggle station visibility
     */
    toggleStations() { }

    /**
     * Toggle line visibility
     */
    toggleLines() { }

    /**
     * Center map on coordinates
     * @param {Array<number>} coords - [lat, lng]
     * @param {number} zoom
     */
    centerOn(coords, zoom) { }
}
```

**Dependencies**:
- Leaflet.js
- `IsochoneCanvasLayer`
- `TransitGraph` for data

**State**:
- `map` - Leaflet map instance
- `layers` - Map layers
- `showStations` - Station visibility state
- `showLines` - Line visibility state

---

### Module 4: OriginManager

**File**: `js/managers/OriginManager.js`

**Responsibilities**:
- Handle origin point selection
- Address search and geocoding
- Origin label updates
- Origin marker management

**Extracted from app.js**:
- Lines 367-454 (prepareOrigin, updateOrigin, updateOriginLabel)
- Lines 937-1104 (initAddressSearch and related functions)

**Interface**:
```javascript
export class OriginManager {
    constructor(app) {
        this.app = app;
        this.origin = null;
        this.originMarker = null;
        this.searchCache = new Map();
    }

    /**
     * Set origin from coordinates
     * @param {number} lat
     * @param {number} lon
     * @param {boolean} updateMap - Whether to pan map
     */
    setOrigin(lat, lon, updateMap = true) { }

    /**
     * Initialize address search
     */
    initAddressSearch() { }

    /**
     * Fetch address suggestions
     * @param {string} query
     * @returns {Promise<Array>}
     */
    async fetchSuggestions(query) { }

    /**
     * Update origin label from coordinates
     * @param {number} lat
     * @param {number} lon
     */
    async updateOriginLabel(lat, lon) { }

    /**
     * Get current origin
     * @returns {Array<number>|null} [lat, lng] or null
     */
    getOrigin() { }
}
```

**Dependencies**:
- LocationIQ API for geocoding
- Nominatim API for reverse geocoding
- Leaflet for markers
- `ErrorHandler` for API errors

**State**:
- `origin` - [lat, lng]
- `originMarker` - Leaflet marker
- `searchCache` - Cache for search results

---

### Module 5: SettingsManager

**File**: `js/managers/SettingsManager.js`

**Responsibilities**:
- Manage application settings
- URL parameter handling
- State persistence
- Theme management

**Extracted from app.js**:
- URL parameter logic (scattered throughout)
- Theme toggle (lines 712-735)
- Settings state management

**Interface**:
```javascript
export class SettingsManager {
    constructor(app) {
        this.app = app;
        this.settings = this.loadSettings();
    }

    /**
     * Load settings from URL or localStorage
     * @returns {Object} Settings object
     */
    loadSettings() { }

    /**
     * Save settings to URL and localStorage
     */
    saveSettings() { }

    /**
     * Get setting value
     * @param {string} key
     * @returns {any}
     */
    get(key) { }

    /**
     * Set setting value
     * @param {string} key
     * @param {any} value
     */
    set(key, value) { }

    /**
     * Toggle dark mode
     */
    toggleDarkMode() { }

    /**
     * Generate shareable URL
     * @returns {string} URL with current state
     */
    generateShareURL() { }
}
```

**Dependencies**:
- `utils.js` (getUrlParams, updateUrl)
- localStorage API

**State**:
- `settings` object containing:
  - `city`
  - `opacity`
  - `pixelSize`
  - `maxTime`
  - `isDarkMode`
  - `showStations`
  - `showLines`
  - `walkingEnabled`

---

### Module 6: ExportManager

**File**: `js/managers/ExportManager.js`

**Responsibilities**:
- Export map to PNG
- Handle canvas operations
- File download

**Extracted from app.js**:
- Lines 852-935 (exportImage function)

**Interface**:
```javascript
export class ExportManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Export current view to PNG
     * @returns {Promise<void>}
     */
    async exportToPNG() { }

    /**
     * Generate filename for export
     * @returns {string}
     */
    generateFilename() { }

    /**
     * Trigger file download
     * @param {Blob} blob
     * @param {string} filename
     */
    downloadFile(blob, filename) { }
}
```

**Dependencies**:
- Leaflet map instance
- Canvas API
- `ErrorHandler`

---

### Module 7: Refactored App.js

**New Structure**:
```javascript
import { UIManager } from './managers/UIManager.js';
import { CityManager } from './managers/CityManager.js';
import { MapManager } from './managers/MapManager.js';
import { OriginManager } from './managers/OriginManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { ExportManager } from './managers/ExportManager.js';
import { ErrorHandler } from './error-handler.js';

class TransitTopographyApp {
    constructor() {
        // Initialize managers
        this.settings = new SettingsManager(this);
        this.city = new CityManager(this);
        this.map = new MapManager(this);
        this.origin = new OriginManager(this);
        this.ui = new UIManager(this);
        this.export = new ExportManager(this);

        // Core dependencies (keep these in app.js)
        this.transitGraph = new TransitGraph();
        this.transitFetcher = new TransitFetcher();
        this.waterMask = new WaterMask();
        this.buildingMask = new BuildingMask();
        this.walkingNetwork = new WalkingNetwork();
    }

    async init() {
        try {
            // Initialize in order
            this.map.initMap('map');
            this.ui.init();
            this.origin.initAddressSearch();

            // Load initial city if specified
            const urlParams = this.settings.loadSettings();
            if (urlParams.city) {
                await this.city.loadCity(urlParams.city);
            }
        } catch (error) {
            ErrorHandler.showError('Failed to initialize app', error, 'UNKNOWN');
        }
    }

    // Slim coordination methods
    async calculateIsochrone() {
        // Coordinate between managers
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.transitApp = new TransitTopographyApp();
    window.transitApp.init();
});
```

**Reduced to**: ~200-300 lines (from 1328)

---

## Refactoring Steps

### Step 1: Create Manager Directory
```bash
mkdir -p js/managers
```

### Step 2: Extract One Manager at a Time

For each manager:

1. **Create skeleton file** with interface
2. **Copy relevant code** from app.js
3. **Refactor dependencies** - Pass app instance or specific dependencies
4. **Update imports** in app.js
5. **Test thoroughly** - Ensure no regressions
6. **Commit** - One manager per commit

**Recommended order**:
1. SettingsManager (smallest, fewest dependencies)
2. ExportManager (isolated functionality)
3. CityManager (foundational)
4. MapManager (depends on CityManager)
5. OriginManager (depends on MapManager)
6. UIManager (depends on all others)

### Step 3: Update App.js

1. Remove extracted code
2. Import new managers
3. Initialize managers in constructor
4. Update method calls to use managers
5. Keep only coordination logic

### Step 4: Testing Checklist

After each manager extraction:

- [ ] City loading works
- [ ] Origin selection works
- [ ] Isochrone calculation works
- [ ] All UI controls work
- [ ] Address search works
- [ ] Export works
- [ ] URL parameters work
- [ ] Dark mode works
- [ ] No console errors

### Step 5: Documentation

Update ARCHITECTURE.md with new module structure.

---

## Benefits of Refactoring

### Maintainability
- **Single Responsibility** - Each module has one clear purpose
- **Easier to understand** - Smaller files, focused logic
- **Easier to test** - Isolated functionality

### Scalability
- **Add features easily** - Clear place for new functionality
- **Parallel development** - Multiple developers can work on different managers
- **Reduce merge conflicts** - Changes isolated to specific modules

### Performance
- **Code splitting** - Load modules on demand
- **Tree shaking** - Remove unused code
- **Better caching** - Smaller files cache independently

### Testing
- **Unit tests** - Test each manager independently
- **Mocks** - Easy to mock dependencies
- **Integration tests** - Test manager interactions

---

## Common Pitfalls to Avoid

### 1. Over-abstraction
Don't create too many layers. Keep it simple.

### 2. Tight Coupling
Pass specific dependencies, not entire app instance if possible.

### 3. Breaking Changes
Test thoroughly after each extraction.

### 4. Incomplete Extraction
Ensure all related code moves together.

### 5. Lost State
Carefully track shared state between managers.

---

## Example: Extracting ExportManager

Here's a complete example of extracting one manager:

**Before (in app.js)**:
```javascript
async exportImage() {
    // 80 lines of export code
}
```

**After**:

**js/managers/ExportManager.js**:
```javascript
import { ErrorHandler } from '../error-handler.js';

export class ExportManager {
    constructor(app) {
        this.app = app;
    }

    async exportToPNG() {
        try {
            const map = this.app.map.map;
            const canvas = this.app.map.layers.canvas.getCanvas();
            // Export logic here
        } catch (error) {
            ErrorHandler.showError('Export failed', error, 'EXPORT');
        }
    }

    generateFilename() {
        const city = this.app.city.currentCity;
        const timestamp = new Date().toISOString().slice(0, 10);
        return `transit-topography-${city}-${timestamp}.png`;
    }
}
```

**js/app.js**:
```javascript
import { ExportManager } from './managers/ExportManager.js';

class TransitTopographyApp {
    constructor() {
        this.export = new ExportManager(this);
    }

    // Old exportImage() method removed
}
```

**Update UI binding**:
```javascript
// Before
document.getElementById('export-btn').onclick = () => app.exportImage();

// After
document.getElementById('export-btn').onclick = () => app.export.exportToPNG();
```

---

## Timeline Estimate

- **ExportManager**: 2 hours
- **SettingsManager**: 3 hours
- **CityManager**: 4 hours
- **MapManager**: 4 hours
- **OriginManager**: 4 hours
- **UIManager**: 5 hours
- **Testing & Bug Fixes**: 6 hours
- **Documentation**: 2 hours

**Total**: ~30 hours for complete refactoring

---

## Future Improvements

After refactoring:

1. **Add TypeScript** - Type safety for all managers
2. **Add Unit Tests** - Test each manager independently
3. **Event System** - Pub/sub for manager communication
4. **State Management** - Centralized state with Redux/Zustand
5. **Lazy Loading** - Load managers on demand

---

## Conclusion

This refactoring will transform the codebase from a monolithic 1,328-line file into a modular, maintainable structure. Each manager will have clear responsibilities and be easy to understand, test, and extend.

**Start small, test thoroughly, and iterate.**

---

**Last Updated**: 2026-01-15
