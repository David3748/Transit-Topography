/**
 * Transit Topography - Main Application
 */

import { debounce, normalizeQuery, getUrlParams, updateUrl } from './utils.js';
import { IsochoneCanvasLayer } from './canvas-layer.js';

// City configurations (loaded from server)
const CITIES = {
    'nyc': {
        center: [40.7527, -73.9772],
        zoom: 13,
        files: ['transit_data/nyc.json'],
        busFiles: ['transit_data/nyc_bus.json', 'transit_data/nyc_bus_manhattan_bus.json', 'transit_data/nyc_bus_brooklyn_bus.json'],
        water: 'transit_data/water_nyc.json'
    },
    'sf': {
        center: [37.7749, -122.4194],
        zoom: 12,
        files: ['transit_data/sf.json', 'transit_data/sf_muni.json'],
        busFiles: ['transit_data/sf_bus.json', 'transit_data/sf_muni_bus.json'],
        water: 'transit_data/water_sf.json'
    },
    'boston': {
        center: [42.3601, -71.0589],
        zoom: 13,
        files: ['transit_data/boston.json'],
        busFiles: ['transit_data/boston_bus.json'],
        water: 'transit_data/water_boston.json'
    },
    'chicago': {
        center: [41.8781, -87.6298],
        zoom: 12,
        files: ['transit_data/chicago.json'],
        busFiles: ['transit_data/chicago_bus.json'],
        water: 'transit_data/water_chicago.json'
    },
    'other': { center: null, zoom: null, files: [], busFiles: [], water: null }
};

// Configuration constants
const WALK_SPEED_MPS = 1.3;  // ~4.7 km/h
const TRANSFER_PENALTY_SEC = 300;  // 5 mins

class TransitTopographyApp {
    constructor() {
        this.map = null;
        this.origin = [40.7527, -73.9772];
        this.originMarker = null;
        this.canvasLayer = null;
        this.transitGraph = null;
        this.transitFetcher = null;
        this.waterMask = null;
        this.networkTimes = new Map();
        this.currentCity = 'nyc';
        
        // UI state
        this.opacity = 0.6;
        this.pixelSize = 4;
        
        // Bind methods
        this.updateOrigin = this.updateOrigin.bind(this);
        this.loadCity = this.loadCity.bind(this);
    }

    async init() {
        // Initialize transit engine components
        this.transitGraph = new TransitGraph();
        this.transitFetcher = new TransitFetcher(this.transitGraph);
        this.waterMask = new WaterMask();
        
        // Check URL parameters
        const params = getUrlParams();
        if (params.city && CITIES[params.city]) {
            this.currentCity = params.city;
            const city = CITIES[params.city];
            if (city.center) {
                this.origin = [...city.center];
            }
        }
        if (params.lat && params.lng) {
            this.origin = [params.lat, params.lng];
        }
        
        // Initialize map
        this.initMap();
        
        // Initialize canvas layer with progress callback
        this.canvasLayer = new IsochoneCanvasLayer({
            origin: this.origin,
            pixelSize: this.pixelSize,
            opacity: this.opacity,
            walkSpeedMps: WALK_SPEED_MPS,
            onProgress: (progress) => this.updateProgress(progress),
            onComplete: () => this.hideProgress()
        });
        this.canvasLayer.transitGraph = this.transitGraph;
        this.canvasLayer.waterMask = this.waterMask;
        this.canvasLayer.addTo(this.map);
        
        // Initialize UI
        this.initUI();
        this.initAddressSearch();
        this.initDataFetching();
        
        // Update city selector
        document.getElementById('city-select').value = this.currentCity;
        
        // Auto-load if city is specified
        if (params.city && CITIES[params.city] && CITIES[params.city].files.length > 0) {
            setTimeout(() => this.loadCity(), 500);
        }
    }

    initMap() {
        if (typeof L === 'undefined') {
            alert('Leaflet library failed to load. Please check your internet connection.');
            return;
        }

        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView(this.origin, CITIES[this.currentCity]?.zoom || 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Add Origin Marker
        const markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);'></div>",
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        this.originMarker = L.marker(this.origin, { icon: markerIcon }).addTo(this.map);

        // Map click handler
        this.map.on('click', (e) => {
            this.updateOrigin(e.latlng.lat, e.latlng.lng);
        });
        
        // Click-to-query travel time
        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            const travelTime = this.canvasLayer.getTravelTime(e.latlng.lat, e.latlng.lng);
            if (travelTime !== null) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<strong>Travel Time:</strong> ${travelTime.toFixed(1)} minutes`)
                    .openOn(this.map);
            }
        });
    }

    updateOrigin(lat, lng, labelText = null) {
        this.origin = [lat, lng];
        this.originMarker.setLatLng(this.origin);
        this.map.panTo(this.origin);

        if (labelText) {
            document.getElementById('origin-label').innerText = labelText;
        } else {
            this.updateOriginLabel({ lat, lon: lng });
        }
        
        // Update URL
        updateUrl(this.currentCity, lat, lng);

        // Calculate Network Times
        if (this.transitGraph.nodes.size > 0) {
            const entryNodes = [];
            for (const [id, node] of this.transitGraph.nodes) {
                const dist = this.transitGraph.distHaversine(lat, lng, node.lat, node.lon);
                if (dist < 2000) {
                    const walkTime = dist / WALK_SPEED_MPS;
                    entryNodes.push({ id, initialWalkTime: walkTime });
                }
            }

            this.networkTimes = this.transitGraph.calculateNetworkTimes(entryNodes, TRANSFER_PENALTY_SEC);
            this.canvasLayer.setNetworkTimes(this.networkTimes);
        }

        this.canvasLayer.setOrigin(this.origin);
        this.canvasLayer.redraw();
    }

    async updateOriginLabel(latlng) {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lon}&zoom=18&addressdetails=1`);
            const data = await resp.json();
            const road = data.address.road || "New Location";
            const suburb = data.address.suburb || data.address.neighbourhood || data.address.city_district || data.address.city || "Unknown Location";
            document.getElementById('origin-label').innerText = `${road} (${suburb})`;

            const city = data.address.city || data.address.town || data.address.village || data.address.county || "NYC";
            document.getElementById('city-title').innerText = city;
        } catch (e) {
            document.getElementById('origin-label').innerText = `${latlng.lat.toFixed(4)}, ${latlng.lon.toFixed(4)}`;
        }
    }

    initUI() {
        // Opacity slider
        document.getElementById('opacity-slider').addEventListener('input', (e) => {
            this.opacity = parseFloat(e.target.value);
            this.canvasLayer.setOpacity(this.opacity);
            this.canvasLayer.redraw();
        });

        // Resolution select
        document.getElementById('res-select').addEventListener('change', (e) => {
            this.pixelSize = parseInt(e.target.value);
            this.canvasLayer.setPixelSize(this.pixelSize);
            this.canvasLayer.redraw();
        });
    }

    initAddressSearch() {
        const label = document.getElementById('origin-label');
        const container = document.getElementById('search-container');
        const input = document.getElementById('origin-input');
        const list = document.getElementById('suggestions-list');

        // Show input on click
        label.addEventListener('click', () => {
            label.classList.add('hidden');
            container.classList.remove('hidden');
            input.value = "";
            input.focus();
        });

        // Fetch suggestions with debounce
        const fetchSuggestions = debounce(async (rawQuery) => {
            if (!rawQuery || rawQuery.length < 3) {
                list.classList.add('hidden');
                return;
            }

            if (typeof LOCATIONIQ_API_KEY === 'undefined' || LOCATIONIQ_API_KEY === 'YOUR_LOCATIONIQ_API_KEY') {
                console.warn("LocationIQ API Key not set.");
                return;
            }

            const query = normalizeQuery(rawQuery);

            try {
                const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query)}&limit=5&dedupe=1`;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error("LocationIQ API Error: " + resp.statusText);
                const data = await resp.json();
                this.renderSuggestions(data, list, input, container, label);
            } catch (e) {
                console.error("Search error", e);
            }
        }, 300);

        input.addEventListener('input', (e) => fetchSuggestions(e.target.value));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const firstItem = list.querySelector('li');
                if (firstItem) firstItem.click();
            }
            if (e.key === 'Escape') {
                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            if (!container.classList.contains('hidden') && !container.contains(e.target) && !label.contains(e.target)) {
                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
            }
        });
    }

    renderSuggestions(results, list, input, container, label) {
        list.innerHTML = '';
        if (!results || results.length === 0) {
            list.classList.add('hidden');
            return;
        }

        results.forEach(item => {
            const li = document.createElement('li');
            li.className = "px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 text-sm text-gray-700 last:border-0";

            const name = item.display_name.split(',')[0];
            const address = item.display_name.substring(name.length + 2);

            li.innerHTML = `
                <div class="font-semibold text-gray-900">${name}</div>
                <div class="text-xs text-gray-500 truncate">${address}</div>
            `;

            li.addEventListener('click', () => {
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                this.updateOrigin(lat, lon, name);

                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
                input.classList.add('rounded');
                input.classList.remove('rounded-t');
            });

            list.appendChild(li);
        });

        list.classList.remove('hidden');
        input.classList.remove('rounded');
        input.classList.add('rounded-t');
    }

    initDataFetching() {
        const btn = document.getElementById('fetch-stations-btn');
        const citySelect = document.getElementById('city-select');
        const busToggle = document.getElementById('bus-toggle');

        citySelect.addEventListener('change', (e) => {
            const cityKey = e.target.value;
            const city = CITIES[cityKey];
            if (city && city.center) {
                this.currentCity = cityKey;
                this.origin = city.center;
                this.map.setView(this.origin, city.zoom);
                this.updateOrigin(this.origin[0], this.origin[1], "City Center");
                this.loadCity();
            }
        });

        btn.addEventListener('click', () => this.loadCity());
    }

    async loadCity() {
        const cityKey = this.currentCity;
        const city = CITIES[cityKey];
        const loading = document.getElementById('loading-overlay');
        const countLabel = document.getElementById('station-count');
        const busToggle = document.getElementById('bus-toggle');

        try {
            loading.classList.remove('hidden');
            countLabel.classList.add('hidden');

            let count = 0;
            if (city && city.files && city.files.length > 0) {
                this.transitGraph.clear();

                // Load Rail data
                for (const file of city.files) {
                    try {
                        await this.transitFetcher.loadStaticGraph(file, false);
                    } catch (e) {
                        console.warn(`Failed to load ${file}:`, e);
                    }
                }

                // Load Bus data if toggled
                if (busToggle.checked && city.busFiles) {
                    for (const file of city.busFiles) {
                        try {
                            await this.transitFetcher.loadStaticGraph(file, false);
                        } catch (e) {
                            console.warn("Bus data not found:", e);
                        }
                    }
                }

                count = this.transitGraph.stations.length;

                // Load Water Data
                if (city.water) {
                    await this.waterMask.loadWaterData(city.water);
                }
            } else {
                const bounds = this.map.getBounds();
                count = await this.transitFetcher.fetchRoutes(bounds);
            }

            // Generate Transfers
            this.transitGraph.generateTransferEdges(200);

            countLabel.innerText = `Loaded ${count} stations for ${cityKey.toUpperCase()}`;
            countLabel.classList.remove('hidden');

            // Recalculate Times
            this.updateOrigin(this.origin[0], this.origin[1]);

        } catch (err) {
            console.error(err);
            alert(`Failed to load data for ${cityKey}. Error: ${err.message}`);
        } finally {
            loading.classList.add('hidden');
        }
    }

    updateProgress(progress) {
        const overlay = document.getElementById('loading-overlay');
        const text = overlay.querySelector('span');
        if (!overlay.classList.contains('hidden')) return;
        
        // Show progress overlay for rendering
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.remove('hidden');
            const progressText = progressOverlay.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = `Computing ${progress}%...`;
            }
        }
    }

    hideProgress() {
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.add('hidden');
        }
    }
}

// Export for global access
window.TransitTopographyApp = TransitTopographyApp;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new TransitTopographyApp();
    app.init();
    window.transitApp = app;
});

