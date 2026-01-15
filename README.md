# Transit Topography

**Interactive transit isochrone visualization tool** - Discover how far you can travel using public transit from any point in 35+ cities worldwide.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://david3748.github.io/Transit-Topography/)

![Transit Topography Demo](https://via.placeholder.com/800x400/2563eb/ffffff?text=Transit+Topography+Demo)

## What is Transit Topography?

Transit Topography creates beautiful, color-coded maps showing **travel-time zones** (isochrones) from any location using public transit. Simply click anywhere on the map, and watch as the tool calculates and visualizes every reachable destination within your specified time limit.

### Key Features

- **35+ Cities** - Major metros across North America, Europe, Asia-Pacific, and South America
- **Real Street Networks** - Uses actual OpenStreetMap data for accurate walking routes
- **Interactive Visualization** - Click-to-set origin or search by address
- **Flexible Parameters** - Adjust travel time (15-90 min), resolution, and transit modes
- **Dark Mode** - Eye-friendly theme with matching map tiles
- **Export Options** - Download your visualizations as PNG images
- **Shareable Links** - URL parameters preserve your exact view and settings
- **Progressive Rendering** - Fast preview with high-quality refinement
- **Right-Click Analysis** - Query exact travel time to any point
- **Transit Overlays** - Toggle station markers and route lines

## Supported Cities

### North America (16 cities)
🇺🇸 New York City • San Francisco • Boston • Chicago • Washington DC • Los Angeles • Seattle • Portland • Philadelphia • Atlanta
🇨🇦 Toronto • Montreal • Vancouver
🇲🇽 Mexico City

### Europe (19 cities)
🇬🇧 London • 🇫🇷 Paris • 🇩🇪 Berlin • Munich • 🇳🇱 Amsterdam • 🇩🇰 Copenhagen • 🇪🇸 Madrid • Barcelona • 🇦🇹 Vienna • 🇸🇪 Stockholm • 🇳🇴 Oslo • 🇫🇮 Helsinki • 🇨🇿 Prague • 🇮🇹 Milan • 🇨🇭 Zurich

### Asia-Pacific (4 cities)
🇭🇰 Hong Kong • 🇸🇬 Singapore • 🇦🇺 Sydney • Melbourne

### South America (1 city)
🇧🇷 São Paulo

## Quick Start

### For Users

Visit **[https://david3748.github.io/Transit-Topography/](https://david3748.github.io/Transit-Topography/)** to start exploring!

**Basic Usage:**
1. Select a city from the dropdown
2. Click anywhere on the map to set your origin
3. Adjust travel time and settings
4. Explore the color-coded reachable zones

**Keyboard Shortcuts:**
- `R` - Recalculate isochrone
- `E` - Export to PNG
- `T` - Toggle dark mode
- `Esc` - Clear current isochrone

### For Developers

#### Prerequisites

- Python 3.8+ (for data generation scripts)
- Modern web browser with ES6 module support
- LocationIQ API key (for address search)

#### Local Development Setup

1. **Clone the repository**
```bash
git clone https://github.com/David3748/Transit-Topography.git
cd Transit-Topography
```

2. **Create config.js from template**
```bash
cp config.template.js config.js
```

Edit `config.js` and add your LocationIQ API key:
```javascript
window.CONFIG = {
    LOCATIONIQ_API_KEY: 'your_api_key_here'
};
```

Get a free API key at [LocationIQ](https://locationiq.com/).

3. **Serve locally**
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server -p 8000
```

4. **Open in browser**
```
http://localhost:8000
```

## Project Architecture

### Frontend Stack

- **Pure JavaScript (ES6 modules)** - No framework dependencies
- **Leaflet.js** - Interactive map rendering
- **Tailwind CSS** - Utility-first styling via CDN
- **Web Workers** - Background isochrone computation
- **HTML5 Canvas** - Custom overlay rendering

### Data Sources

- **GTFS Feeds** - Transit schedules from official agencies
- **OpenStreetMap** - Walking network data via Overpass API
- **LocationIQ** - Geocoding and address search

### Core Components

```
Transit-Topography/
├── index.html              # Main application entry point
├── js/
│   ├── app.js             # Application controller
│   ├── canvas-layer.js    # Leaflet canvas overlay
│   ├── render-worker.js   # Web Worker for computations
│   ├── spatial-index.js   # Grid-based spatial indexing
│   └── utils.js           # Utility functions
├── transit_engine.js       # Graph/pathfinding algorithms
├── transit_data/          # JSON transit network files
│   ├── *.json            # City transit graphs
│   ├── walking_*.json    # Street network data
│   ├── water_*.json      # Water polygon data
│   └── buildings_*.json  # Building footprints
└── Python scripts/        # Data generation tools
```

### How It Works

1. **Data Loading** - Fetch transit network (nodes + edges) for selected city
2. **Graph Construction** - Build weighted graph with stations and walking connections
3. **Dijkstra Pathfinding** - Calculate shortest paths from origin to all reachable nodes
4. **Isochrone Rendering** - Web Worker computes travel time for each pixel
5. **Canvas Overlay** - Draw color-coded visualization on map

## Data Generation

### Adding a New City

1. **Find GTFS feed** - Locate official transit data feed
2. **Add to cities_config.json**
```json
"city_code": {
  "name": "City Name",
  "gtfs_url": "https://...",
  "center": [lat, lon],
  "zoom": 12,
  "region": "north_america",
  "flag": "🇺🇸"
}
```

3. **Generate transit data**
```bash
python generate_city_data.py city_code
```

4. **Generate walking network** (optional but recommended)
```bash
python generate_walking_network.py city_code
```

5. **Test locally** - Reload app and verify data loads correctly

### Python Dependencies

```bash
pip install -r requirements.txt
```

Key packages:
- `pandas` - GTFS data processing
- `requests` - API requests
- `shapely` - Polygon operations

## Configuration

### cities_config.json

Each city entry supports:
- `name` - Display name
- `gtfs_url` - GTFS feed URL or "FETCH_VIA_TFL_API"
- `center` - [latitude, longitude]
- `zoom` - Default zoom level
- `region` - Grouping (north_america, europe, asia_pacific, south_america)
- `flag` - Country flag emoji
- `hidden` - (optional) Hide from city selector

### URL Parameters

Share specific views using URL parameters:

```
?city=nyc&lat=40.7580&lon=-73.9855&time=45&quality=medium&theme=dark
```

Parameters:
- `city` - City code
- `lat`, `lon` - Origin coordinates
- `time` - Travel time in minutes
- `quality` - Resolution (low, medium, high)
- `theme` - Interface theme (light, dark)
- `buses` - Include bus network (true, false)

## Performance

### Optimization Techniques

- **Grid-based spatial indexing** - O(1) station lookups
- **Web Workers** - Non-blocking UI during calculation
- **Progressive rendering** - Fast preview → high-quality
- **Tile-based caching** - Reuse computations when panning
- **Polygon simplification** - Reduced water/building data
- **Debounced rendering** - Prevent excessive redraws

### Data Sizes

Transit data files range from 12KB (Atlanta) to 6.5MB (Amsterdam with buses). Walking networks add 100KB-2MB depending on city size.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Required features:**
- ES6 modules
- Web Workers
- Canvas API
- Leaflet 1.9+

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (manual testing for now)
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Use ES6+ features
- Follow existing naming conventions
- Add comments for complex algorithms
- Keep functions focused and modular

## Roadmap

See [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) for detailed enhancement plans.

**Upcoming features:**
- Real-time transit data integration
- Accessibility improvements (WCAG 2.1 AA)
- Mobile-responsive design
- Points of Interest overlay
- Comparison mode (multiple origins)
- TypeScript migration
- Unit & integration tests
- Automated GTFS updates

## Technical Details

### Algorithms

**Dijkstra's Algorithm** - Used for shortest path calculation with time-based weights
**Grid Spatial Index** - Divides map into cells for efficient station queries
**Progressive Refinement** - Low-res preview (8px) → high-res (1px)

### Transfer Penalties

- Walk → Transit: Free
- Transit → Transit: 5 minutes (realistic transfer time)
- Transit → Walk: Free

### Walking Speed

Base walking speed: **5 km/h** (configurable in code)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Transit agencies** - For providing open GTFS data
- **OpenStreetMap** - Community-sourced geographic data
- **Leaflet.js** - Excellent mapping library
- **LocationIQ** - Geocoding API

## Support

- **Issues** - Report bugs at [GitHub Issues](https://github.com/David3748/Transit-Topography/issues)
- **Questions** - Open a discussion or issue
- **Feature Requests** - We'd love to hear your ideas!

## Citation

If you use this tool in research or publications:

```bibtex
@software{transit_topography,
  title = {Transit Topography: Interactive Transit Isochrone Visualization},
  author = {David3748},
  year = {2024},
  url = {https://github.com/David3748/Transit-Topography}
}
```

---

**Built with ❤️ for transit enthusiasts, urban planners, and data visualization lovers**

⭐ Star this repo if you find it useful!
