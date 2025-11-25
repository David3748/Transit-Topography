/**
 * Transit Topography - Main Application
 */

import { debounce, normalizeQuery, getUrlParams, updateUrl } from './utils.js';
import { IsochoneCanvasLayer } from './canvas-layer.js';

// Cities with walking network data available
const WALKING_NETWORK_CITIES = [
    'nyc', 'sf', 'boston', 'chicago', 'dc', 'la', 
    'seattle', 'portland', 'philly', 'toronto', 'montreal'
];

// City configurations with metadata
const CITIES = {
    // North America
    'nyc': {
        name: 'New York City', flag: '🇺🇸', region: 'north_america',
        center: [40.7527, -73.9772], zoom: 13,
        files: ['transit_data/nyc.json'],
        busFiles: ['transit_data/nyc_bus.json', 'transit_data/nyc_bus_manhattan_bus.json', 'transit_data/nyc_bus_brooklyn_bus.json'],
        water: 'transit_data/water_nyc.json', buildings: 'transit_data/buildings_nyc.json'
    },
    'sf': {
        name: 'San Francisco', flag: '🇺🇸', region: 'north_america',
        center: [37.7749, -122.4194], zoom: 12,
        files: ['transit_data/sf.json', 'transit_data/sf_muni.json'],
        busFiles: ['transit_data/sf_bus.json', 'transit_data/sf_muni_bus.json'],
        water: 'transit_data/water_sf.json', buildings: 'transit_data/buildings_sf.json'
    },
    'boston': {
        name: 'Boston', flag: '🇺🇸', region: 'north_america',
        center: [42.3601, -71.0589], zoom: 13,
        files: ['transit_data/boston.json'], busFiles: ['transit_data/boston_bus.json'],
        water: 'transit_data/water_boston.json', buildings: 'transit_data/buildings_boston.json'
    },
    'chicago': {
        name: 'Chicago', flag: '🇺🇸', region: 'north_america',
        center: [41.8781, -87.6298], zoom: 12,
        files: ['transit_data/chicago.json'], busFiles: ['transit_data/chicago_bus.json'],
        water: 'transit_data/water_chicago.json', buildings: 'transit_data/buildings_chicago.json'
    },
    'dc': {
        name: 'Washington DC', flag: '🇺🇸', region: 'north_america',
        center: [38.9072, -77.0369], zoom: 12,
        files: ['transit_data/dc.json'], busFiles: ['transit_data/dc_bus.json'],
        water: 'transit_data/water_dc.json', buildings: 'transit_data/buildings_dc.json'
    },
    'la': {
        name: 'Los Angeles', flag: '🇺🇸', region: 'north_america',
        center: [34.0522, -118.2437], zoom: 11,
        files: ['transit_data/la.json'], busFiles: ['transit_data/la_bus.json'],
        water: 'transit_data/water_la.json', buildings: 'transit_data/buildings_la.json'
    },
    'seattle': {
        name: 'Seattle', flag: '🇺🇸', region: 'north_america',
        center: [47.6062, -122.3321], zoom: 11,
        files: ['transit_data/seattle.json'], busFiles: ['transit_data/seattle_bus.json'],
        water: 'transit_data/water_seattle.json', buildings: 'transit_data/buildings_seattle.json'
    },
    'portland': {
        name: 'Portland', flag: '🇺🇸', region: 'north_america',
        center: [45.5152, -122.6784], zoom: 12,
        files: ['transit_data/portland.json'], busFiles: ['transit_data/portland_bus.json'],
        water: 'transit_data/water_portland.json', buildings: 'transit_data/buildings_portland.json'
    },
    'toronto': {
        name: 'Toronto', flag: '🇨🇦', region: 'north_america',
        center: [43.6532, -79.3832], zoom: 12,
        files: ['transit_data/toronto.json'], busFiles: ['transit_data/toronto_bus.json'],
        water: 'transit_data/water_toronto.json', buildings: 'transit_data/buildings_toronto.json'
    },
    'montreal': {
        name: 'Montreal', flag: '🇨🇦', region: 'north_america',
        center: [45.5017, -73.5673], zoom: 12,
        files: ['transit_data/montreal.json'], busFiles: ['transit_data/montreal_bus.json'],
        water: 'transit_data/water_montreal.json', buildings: 'transit_data/buildings_montreal.json'
    },
    'vancouver': {
        name: 'Vancouver', flag: '🇨🇦', region: 'north_america',
        center: [49.2827, -123.1207], zoom: 12,
        files: ['transit_data/vancouver.json'], busFiles: ['transit_data/vancouver_bus.json'],
        water: 'transit_data/water_vancouver.json', buildings: 'transit_data/buildings_vancouver.json'
    },
    'philly': {
        name: 'Philadelphia', flag: '🇺🇸', region: 'north_america',
        center: [39.9526, -75.1652], zoom: 12,
        files: ['transit_data/philly.json'], busFiles: ['transit_data/philly_bus.json'],
        water: 'transit_data/water_philly.json', buildings: 'transit_data/buildings_philly.json'
    },
    'atlanta': {
        name: 'Atlanta', flag: '🇺🇸', region: 'north_america',
        center: [33.7490, -84.3880], zoom: 11,
        files: ['transit_data/atlanta.json'], busFiles: ['transit_data/atlanta_bus.json'],
        water: 'transit_data/water_atlanta.json', buildings: 'transit_data/buildings_atlanta.json'
    },
    'mexico_city': {
        name: 'Mexico City', flag: '🇲🇽', region: 'north_america',
        center: [19.4326, -99.1332], zoom: 11,
        files: ['transit_data/mexico_city.json'], busFiles: ['transit_data/mexico_city_bus.json'],
        water: 'transit_data/water_mexico_city.json', buildings: 'transit_data/buildings_mexico_city.json'
    },
    // Europe
    'london': {
        name: 'London', flag: '🇬🇧', region: 'europe',
        center: [51.5074, -0.1278], zoom: 11,
        files: ['transit_data/london.json'], busFiles: [],
        water: 'transit_data/water_london.json', buildings: 'transit_data/buildings_london.json'
    },
    'paris': {
        name: 'Paris', flag: '🇫🇷', region: 'europe',
        center: [48.8566, 2.3522], zoom: 12,
        files: ['transit_data/paris.json'], busFiles: ['transit_data/paris_bus.json'],
        water: 'transit_data/water_paris.json', buildings: 'transit_data/buildings_paris.json'
    },
    'berlin': {
        name: 'Berlin', flag: '🇩🇪', region: 'europe',
        center: [52.5200, 13.4050], zoom: 11,
        files: ['transit_data/berlin.json'], busFiles: ['transit_data/berlin_bus.json'],
        water: 'transit_data/water_berlin.json', buildings: 'transit_data/buildings_berlin.json'
    },
    'amsterdam': {
        name: 'Amsterdam', flag: '🇳🇱', region: 'europe',
        center: [52.3676, 4.9041], zoom: 12,
        files: ['transit_data/amsterdam.json'], busFiles: ['transit_data/amsterdam_bus.json'],
        water: 'transit_data/water_amsterdam.json', buildings: 'transit_data/buildings_amsterdam.json'
    },
    'copenhagen': {
        name: 'Copenhagen', flag: '🇩🇰', region: 'europe',
        center: [55.6761, 12.5683], zoom: 12,
        files: ['transit_data/copenhagen.json'], busFiles: ['transit_data/copenhagen_bus.json'],
        water: 'transit_data/water_copenhagen.json', buildings: 'transit_data/buildings_copenhagen.json'
    },
    'madrid': {
        name: 'Madrid', flag: '🇪🇸', region: 'europe',
        center: [40.4168, -3.7038], zoom: 12,
        files: ['transit_data/madrid.json'], busFiles: ['transit_data/madrid_bus.json'],
        water: 'transit_data/water_madrid.json', buildings: 'transit_data/buildings_madrid.json'
    },
    'barcelona': {
        name: 'Barcelona', flag: '🇪🇸', region: 'europe',
        center: [41.3851, 2.1734], zoom: 12,
        files: ['transit_data/barcelona.json'], busFiles: ['transit_data/barcelona_bus.json'],
        water: 'transit_data/water_barcelona.json', buildings: 'transit_data/buildings_barcelona.json'
    },
    // Vienna, Stockholm, Munich - GTFS not publicly available, requires API keys
    'oslo': {
        name: 'Oslo', flag: '🇳🇴', region: 'europe',
        center: [59.9139, 10.7522], zoom: 12,
        files: ['transit_data/oslo.json'], busFiles: ['transit_data/oslo_bus.json'],
        water: 'transit_data/water_oslo.json', buildings: 'transit_data/buildings_oslo.json'
    },
    'helsinki': {
        name: 'Helsinki', flag: '🇫🇮', region: 'europe',
        center: [60.1699, 24.9384], zoom: 12,
        files: ['transit_data/helsinki.json'], busFiles: ['transit_data/helsinki_bus.json'],
        water: 'transit_data/water_helsinki.json', buildings: 'transit_data/buildings_helsinki.json'
    },
    'prague': {
        name: 'Prague', flag: '🇨🇿', region: 'europe',
        center: [50.0755, 14.4378], zoom: 12,
        files: ['transit_data/prague.json'], busFiles: ['transit_data/prague_bus.json'],
        water: 'transit_data/water_prague.json', buildings: 'transit_data/buildings_prague.json'
    },
    // Milan, Zurich - GTFS not publicly available
    // Asia-Pacific
    'hong_kong': {
        name: 'Hong Kong', flag: '🇭🇰', region: 'asia_pacific',
        center: [22.3193, 114.1694], zoom: 12,
        files: ['transit_data/hong_kong.json'], busFiles: ['transit_data/hong_kong_bus.json'],
        water: 'transit_data/water_hong_kong.json', buildings: 'transit_data/buildings_hong_kong.json'
    },
    // Singapore - requires LTA DataMall API key
    'sydney': {
        name: 'Sydney', flag: '🇦🇺', region: 'asia_pacific',
        center: [-33.8688, 151.2093], zoom: 12,
        files: ['transit_data/sydney.json'], busFiles: ['transit_data/sydney_bus.json'],
        water: 'transit_data/water_sydney.json', buildings: 'transit_data/buildings_sydney.json'
    },
    'melbourne': {
        name: 'Melbourne', flag: '🇦🇺', region: 'asia_pacific',
        center: [-37.8136, 144.9631], zoom: 12,
        files: ['transit_data/melbourne.json'], busFiles: ['transit_data/melbourne_bus.json'],
        water: 'transit_data/water_melbourne.json', buildings: 'transit_data/buildings_melbourne.json'
    },
    // South America
    'sao_paulo': {
        name: 'São Paulo', flag: '🇧🇷', region: 'south_america',
        center: [-23.5505, -46.6333], zoom: 12,
        files: ['transit_data/sao_paulo.json'], busFiles: ['transit_data/sao_paulo_bus.json'],
        water: 'transit_data/water_sao_paulo.json', buildings: 'transit_data/buildings_sao_paulo.json'
    },
    'other': { name: 'Other', flag: '🌍', region: 'other', center: null, zoom: null, files: [], busFiles: [], water: null, buildings: null }
};

// Region display names
const REGIONS = {
    'north_america': 'North America',
    'europe': 'Europe',
    'asia_pacific': 'Asia-Pacific',
    'south_america': 'South America'
};

// Configuration constants
const WALK_SPEED_MPS = 1.3;  // ~4.7 km/h
const TRANSFER_PENALTY_SEC = 300;  // 5 mins

// Map tile URLs
const TILE_URLS = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};

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
        this.pixelSize = 2; // Default matches "High" in HTML
        this.maxTime = 30; // Max time in minutes
        this.isDarkMode = false;
        this.showStations = false;
        this.showLines = false;
        
        // Layers
        this.tileLayer = null;
        this.stationLayer = null;
        this.linesLayer = null;
        
        // Bind methods
        this.updateOrigin = this.updateOrigin.bind(this);
        this.loadCity = this.loadCity.bind(this);
        this.toggleDarkMode = this.toggleDarkMode.bind(this);
        this.toggleStations = this.toggleStations.bind(this);
        this.toggleLines = this.toggleLines.bind(this);
        this.exportImage = this.exportImage.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
    }

    async init() {
        // Initialize transit engine components
        this.transitGraph = new TransitGraph();
        this.transitFetcher = new TransitFetcher(this.transitGraph);
        this.waterMask = new WaterMask();
        this.buildingMask = new BuildingMask();
        this.walkingNetwork = new WalkingNetwork();
        
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
            onComplete: () => this.hideProgress(),
            onRefining: () => this.showRefining()
        });
        this.canvasLayer.transitGraph = this.transitGraph;
        this.canvasLayer.waterMask = this.waterMask;
        this.canvasLayer.buildingMask = this.buildingMask;
        this.canvasLayer.addTo(this.map);
        
        // Initialize UI
        this.initUI();
        this.initAddressSearch();
        this.initDataFetching();
        
        // Update city selector and title
        document.getElementById('city-select').value = this.currentCity;
        const currentCityData = CITIES[this.currentCity];
        if (currentCityData) {
            document.getElementById('city-title').textContent = currentCityData.name;
        }
        
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

        // Check for saved dark mode preference
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (this.isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.updateThemeIcons();
        }

        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView(this.origin, CITIES[this.currentCity]?.zoom || 13);

        // Store tile layer reference for theme switching
        this.tileLayer = L.tileLayer(this.isDarkMode ? TILE_URLS.dark : TILE_URLS.light, {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Initialize station and line layers
        this.stationLayer = L.layerGroup();
        this.linesLayer = L.layerGroup();

        // Add Origin Marker
        const markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);'></div>",
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        this.originMarker = L.marker(this.origin, { icon: markerIcon }).addTo(this.map);

        // Ctrl+click to set new origin
        this.map.on('click', (e) => {
            if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                this.updateOrigin(e.latlng.lat, e.latlng.lng);
            }
        });
        
        // Right-click to query travel time
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

    // Prepare origin data without triggering render (used during initial load)
    prepareOrigin(lat, lng, labelText = null) {
        this.origin = [lat, lng];
        this.originMarker.setLatLng(this.origin);
        this.map.setView(this.origin, this.map.getZoom(), { animate: false });

        if (labelText) {
            document.getElementById('origin-label').innerText = labelText;
        } else {
            this.updateOriginLabel({ lat, lon: lng });
        }
        
        // Compute walking network times from new origin
        if (this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            this.walkingNetwork.computeFromOrigin(lat, lng);
            this.canvasLayer.setWalkingNetwork(this.walkingNetwork);
        }

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

        // Compute walking network times from new origin
        if (this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            this.walkingNetwork.computeFromOrigin(lat, lng);
            this.canvasLayer.setWalkingNetwork(this.walkingNetwork);
        }

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
            this.canvasLayer.forceRedraw();
        });

        // Max time select
        document.getElementById('max-time-select').addEventListener('change', (e) => {
            this.maxTime = parseInt(e.target.value);
            this.canvasLayer.setMaxTime(this.maxTime);
            this.updateLegend();
            this.canvasLayer.forceRedraw();
        });

        // Dark mode toggle
        document.getElementById('theme-btn').addEventListener('click', this.toggleDarkMode);

        // Stations toggle
        document.getElementById('stations-toggle').addEventListener('change', (e) => {
            this.showStations = e.target.checked;
            this.toggleStations();
        });

        // Lines toggle
        document.getElementById('lines-toggle').addEventListener('change', (e) => {
            this.showLines = e.target.checked;
            this.toggleLines();
        });

        // Walking Network toggle
        document.getElementById('walking-network-toggle').addEventListener('change', (e) => {
            if (this.walkingNetwork) {
                this.walkingNetwork.enabled = e.target.checked;
                this.canvasLayer.forceRedraw();
            }
        });
        
        // Update walking network UI based on available cities
        this.updateWalkingNetworkUI();

        // Export button
        document.getElementById('export-btn').addEventListener('click', this.exportImage);

        // Help modal
        const helpBtn = document.getElementById('help-btn');
        const helpModal = document.getElementById('help-modal');
        const helpClose = document.getElementById('help-close');

        helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
        helpClose.addEventListener('click', () => helpModal.classList.add('hidden'));
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.classList.add('hidden');
        });

        // City selector modal
        this.initCityModal();

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard);

        // Share button functionality
        document.getElementById('share-btn').addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('share-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Copied!';
                btn.classList.add('bg-green-100', 'text-green-700');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('bg-green-100', 'text-green-700');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                prompt('Copy this link:', url);
            });
        });
    }

    initCityModal() {
        const cityTitleBtn = document.getElementById('city-title-btn');
        const cityModal = document.getElementById('city-modal');
        const cityModalClose = document.getElementById('city-modal-close');
        const citySearch = document.getElementById('city-search');

        // Populate city grids
        this.populateCityGrid();

        // Open modal when clicking city title
        cityTitleBtn.addEventListener('click', () => {
            cityModal.classList.remove('hidden');
            citySearch.value = '';
            citySearch.focus();
            this.filterCities('');
        });

        // Close modal
        cityModalClose.addEventListener('click', () => cityModal.classList.add('hidden'));
        cityModal.addEventListener('click', (e) => {
            if (e.target === cityModal) cityModal.classList.add('hidden');
        });

        // Search filter
        citySearch.addEventListener('input', (e) => {
            this.filterCities(e.target.value.toLowerCase());
        });

        // Keyboard navigation
        citySearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cityModal.classList.add('hidden');
            }
        });
    }

    populateCityGrid() {
        const regionContainers = {
            'north_america': document.getElementById('cities-north-america'),
            'europe': document.getElementById('cities-europe'),
            'asia_pacific': document.getElementById('cities-asia-pacific'),
            'south_america': document.getElementById('cities-south-america')
        };

        // Clear existing
        Object.values(regionContainers).forEach(c => c && (c.innerHTML = ''));

        // Add cities
        for (const [key, city] of Object.entries(CITIES)) {
            if (key === 'other' || !city.region || !regionContainers[city.region]) continue;

            const chip = document.createElement('button');
            chip.className = 'city-chip';
            chip.dataset.city = key;
            chip.dataset.name = city.name.toLowerCase();
            chip.innerHTML = `${city.flag} ${city.name}`;
            
            if (key === this.currentCity) {
                chip.classList.add('active');
            }

            chip.addEventListener('click', () => this.selectCity(key));
            regionContainers[city.region].appendChild(chip);
        }
    }

    filterCities(query) {
        const chips = document.querySelectorAll('.city-chip');
        const regionSections = document.querySelectorAll('.region-section');
        
        chips.forEach(chip => {
            const name = chip.dataset.name;
            const matches = !query || name.includes(query);
            chip.classList.toggle('hidden', !matches);
        });

        // Hide empty regions
        regionSections.forEach(section => {
            const visibleChips = section.querySelectorAll('.city-chip:not(.hidden)');
            section.style.display = visibleChips.length === 0 ? 'none' : 'block';
        });
    }

    selectCity(cityKey) {
        const city = CITIES[cityKey];
        if (!city || !city.center) return;

        // Update current city
        this.currentCity = cityKey;
        document.getElementById('city-select').value = cityKey;

        // Update title
        document.getElementById('city-title').textContent = city.name;

        // Update active chip
        document.querySelectorAll('.city-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.city === cityKey);
        });

        // Close modal
        document.getElementById('city-modal').classList.add('hidden');

        // Update map view
        this.origin = [...city.center];
        this.map.setView(this.origin, city.zoom);
        this.originMarker.setLatLng(this.origin);

        // Update URL
        updateUrl(cityKey, this.origin[0], this.origin[1]);

        // Load city data
        this.loadCity();
    }

    handleKeyboard(e) {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case '=':
            case '+':
                this.map.zoomIn();
                break;
            case '-':
                this.map.zoomOut();
                break;
            case '?':
                document.getElementById('help-modal').classList.toggle('hidden');
                break;
            case 'Escape':
                document.getElementById('help-modal').classList.add('hidden');
                document.getElementById('city-modal').classList.add('hidden');
                break;
        }
    }

    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);

        // Update document theme
        document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');

        // Swap tile layer
        this.map.removeLayer(this.tileLayer);
        this.tileLayer = L.tileLayer(this.isDarkMode ? TILE_URLS.dark : TILE_URLS.light, {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        // Move tile layer to back
        this.tileLayer.bringToBack();

        this.updateThemeIcons();
    }

    updateThemeIcons() {
        const lightIcon = document.getElementById('theme-icon-light');
        const darkIcon = document.getElementById('theme-icon-dark');
        if (this.isDarkMode) {
            lightIcon.classList.add('hidden');
            darkIcon.classList.remove('hidden');
        } else {
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
        }
    }

    toggleStations() {
        if (this.showStations) {
            this.renderStations();
            this.map.addLayer(this.stationLayer);
        } else {
            this.map.removeLayer(this.stationLayer);
        }
    }

    toggleLines() {
        if (this.showLines) {
            this.renderLines();
            this.map.addLayer(this.linesLayer);
        } else {
            this.map.removeLayer(this.linesLayer);
        }
    }

    renderStations() {
        this.stationLayer.clearLayers();
        
        if (!this.transitGraph || this.transitGraph.stations.length === 0) return;

        // Determine if station is rail or bus based on its connections
        const isRailStation = (stationId) => {
            const node = this.transitGraph.nodes.get(stationId);
            if (!node) return false;
            
            for (const [neighborId, weight] of node.neighbors) {
                const neighborNode = this.transitGraph.nodes.get(neighborId);
                if (!neighborNode) continue;
                
                const dist = this.transitGraph.distHaversine(
                    node.lat, node.lon,
                    neighborNode.lat, neighborNode.lon
                );
                const speed = dist / weight;
                
                // Rail connections are faster (> 6 m/s)
                if (speed > 6) return true;
            }
            return false;
        };
        
        this.transitGraph.stations.forEach((station) => {
            const isRail = isRailStation(station.id);
            
            // Different styling for rail vs bus
            const marker = L.circleMarker([station.lat, station.lon], {
                radius: isRail ? 5 : 3,
                fillColor: isRail ? '#3b82f6' : '#f97316',
                color: '#fff',
                weight: isRail ? 2 : 1,
                opacity: 1,
                fillOpacity: isRail ? 0.9 : 0.6
            });
            
            // Add tooltip with station name if available
            const node = this.transitGraph.nodes.get(station.id);
            if (node && node.name) {
                marker.bindTooltip(node.name, { 
                    direction: 'top', 
                    offset: [0, -5],
                    className: 'station-tooltip'
                });
            }
            
            this.stationLayer.addLayer(marker);
        });
    }

    renderLines() {
        this.linesLayer.clearLayers();
        
        if (!this.transitGraph || this.transitGraph.nodes.size === 0) return;

        // We need to identify actual transit edges vs transfer edges
        // Transfer edges are typically short walking distances (~1.3 m/s speed)
        // Transit edges are faster (subway ~8.3 m/s, bus ~5 m/s)
        
        const drawnEdges = new Set();

        // Draw only actual transit edges (not walking transfers)
        for (const [id, node] of this.transitGraph.nodes) {
            for (const [neighborId, weight] of node.neighbors) {
                // Avoid drawing the same edge twice
                const edgeKey = [id, neighborId].sort().join('-');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighborNode = this.transitGraph.nodes.get(neighborId);
                if (!neighborNode) continue;

                // Calculate distance between stations
                const dist = this.transitGraph.distHaversine(
                    node.lat, node.lon, 
                    neighborNode.lat, neighborNode.lon
                );
                
                // Calculate implied speed (m/s)
                const speed = dist / weight;
                
                // Walking speed is ~1.3 m/s, transit is 5-15 m/s
                // Skip if this looks like a walking transfer (speed < 2 m/s)
                if (speed < 2) continue;
                
                // Skip very short edges (< 100m) - likely duplicate stops
                if (dist < 100) continue;
                
                // Determine line style based on speed
                const isRail = speed > 6; // Subway/rail is faster
                const isBus = speed >= 2 && speed <= 6;
                
                // Color based on mode
                let color, lineWeight, opacity;
                if (isRail) {
                    color = '#3b82f6'; // Blue for rail
                    lineWeight = 3;
                    opacity = 0.8;
                } else {
                    color = '#f97316'; // Orange for bus
                    lineWeight = 2;
                    opacity = 0.5;
                }
                
                const line = L.polyline(
                    [[node.lat, node.lon], [neighborNode.lat, neighborNode.lon]],
                    {
                        color: color,
                        weight: lineWeight,
                        opacity: opacity,
                        dashArray: isBus ? '4, 4' : null
                    }
                );
                
                this.linesLayer.addLayer(line);
            }
        }
    }

    async exportImage() {
        const btn = document.getElementById('export-btn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></div> Exporting...';
        btn.disabled = true;

        try {
            // Create a composite canvas
            const mapContainer = document.getElementById('map');
            const rect = mapContainer.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = width;
            exportCanvas.height = height;
            const ctx = exportCanvas.getContext('2d');

            // Draw map tiles (approximate - we'll just use a solid background)
            ctx.fillStyle = this.isDarkMode ? '#0f172a' : '#f9fafb';
            ctx.fillRect(0, 0, width, height);

            // Draw the isochrone canvas
            if (this.canvasLayer && this.canvasLayer.canvas) {
                ctx.drawImage(this.canvasLayer.canvas, 0, 0);
            }

            // Add legend
            const legendX = 20;
            const legendY = height - 100;
            const legendWidth = 200;
            const legendHeight = 80;

            // Legend background
            ctx.fillStyle = this.isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 8);
            ctx.fill();

            // Legend title
            ctx.fillStyle = this.isDarkMode ? '#f1f5f9' : '#111827';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText('Travel Time (minutes)', legendX + 10, legendY + 20);

            // Legend colors
            const colors = [
                { color: 'rgb(59, 130, 246)', label: '0-5' },
                { color: 'rgb(6, 182, 212)', label: '5-10' },
                { color: 'rgb(16, 185, 129)', label: '10-15' },
                { color: 'rgb(132, 204, 22)', label: '15-20' },
                { color: 'rgb(250, 204, 21)', label: '20-25' },
                { color: 'rgb(249, 115, 22)', label: '25-30' }
            ];

            const blockWidth = (legendWidth - 20) / colors.length;
            colors.forEach((c, i) => {
                ctx.fillStyle = c.color;
                ctx.fillRect(legendX + 10 + i * blockWidth, legendY + 30, blockWidth - 2, 20);
            });

            // Legend labels
            ctx.fillStyle = this.isDarkMode ? '#94a3b8' : '#6b7280';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText('0', legendX + 10, legendY + 65);
            ctx.fillText('30m', legendX + legendWidth - 30, legendY + 65);

            // Attribution
            ctx.fillStyle = this.isDarkMode ? '#64748b' : '#9ca3af';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText('Transit Topography', legendX + 10, legendY + legendHeight - 5);

            // Download
            const link = document.createElement('a');
            link.download = `transit-topography-${this.currentCity}-${Date.now()}.png`;
            link.href = exportCanvas.toDataURL('image/png');
            link.click();

        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
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

            li.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                
                console.log('Address clicked:', name, 'lat:', lat, 'lon:', lon);
                
                if (isNaN(lat) || isNaN(lon)) {
                    console.error('Invalid coordinates:', item);
                    return;
                }
                
                // Hide search UI first
                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
                input.classList.add('rounded');
                input.classList.remove('rounded-t');
                
                // Auto-detect city from address
                const displayName = item.display_name || '';
                const detectedCity = this.detectCity(displayName);
                
                if (detectedCity && detectedCity !== this.currentCity) {
                    this.currentCity = detectedCity;
                    document.getElementById('city-select').value = detectedCity;
                    document.getElementById('city-title').textContent = CITIES[detectedCity]?.name || detectedCity;
                    
                    // Update active chip in city modal
                    document.querySelectorAll('.city-chip').forEach(chip => {
                        chip.classList.toggle('active', chip.dataset.city === detectedCity);
                    });
                    
                    // Set origin BEFORE loading city so loadCity uses correct coordinates
                    this.origin = [lat, lon];
                    
                    // Load the new city's transit data
                    await this.loadCity();
                }
                
                // Calculate target zoom (at least street level)
                const targetZoom = Math.max(this.map.getZoom(), 15);
                
                // Set the map view FIRST with immediate effect
                this.map.setView([lat, lon], targetZoom, { animate: true });
                
                // Now update origin (this will update marker, labels, network calculations)
                this.origin = [lat, lon];
                this.originMarker.setLatLng([lat, lon]);
                document.getElementById('origin-label').innerText = name;
                updateUrl(this.currentCity, lat, lon);
                
                // Compute transit network from new origin
                if (this.walkingNetwork && this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
                    this.walkingNetwork.computeFromOrigin(lat, lon);
                    this.canvasLayer.setWalkingNetwork(this.walkingNetwork);
                }

                if (this.transitGraph.nodes.size > 0) {
                    const entryNodes = [];
                    for (const [id, node] of this.transitGraph.nodes) {
                        const dist = this.transitGraph.distHaversine(lat, lon, node.lat, node.lon);
                        if (dist < 2000) {
                            const walkTime = dist / WALK_SPEED_MPS;
                            entryNodes.push({ id, initialWalkTime: walkTime });
                        }
                    }
                    this.networkTimes = this.transitGraph.calculateNetworkTimes(entryNodes, TRANSFER_PENALTY_SEC);
                    this.canvasLayer.setNetworkTimes(this.networkTimes);
                }

                this.canvasLayer.setOrigin([lat, lon]);
                this.canvasLayer.redraw();
                
                console.log('Map moved to:', lat, lon, 'zoom:', targetZoom);
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
            
            // Prevent rendering until all data is loaded
            this.canvasLayer.setDataReady(false);

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
                
                // Load Building Data (optional - may not exist)
                if (city.buildings) {
                    await this.buildingMask.loadBuildingData(city.buildings);
                }
                
                // Load Walking Network
                const walkingUrl = `transit_data/walking_${cityKey}.json`;
                await this.walkingNetwork.loadNetwork(walkingUrl);
            } else {
                const bounds = this.map.getBounds();
                count = await this.transitFetcher.fetchRoutes(bounds);
            }

            // Generate Transfers
            this.transitGraph.generateTransferEdges(200);

            countLabel.innerText = `Loaded ${count} stations for ${cityKey.toUpperCase()}`;
            countLabel.classList.remove('hidden');

            // Update walking network UI based on city
            this.updateWalkingNetworkUI();

            // Update station/line layers if visible
            if (this.showStations) this.renderStations();
            if (this.showLines) this.renderLines();

            // Compute everything first without rendering
            this.prepareOrigin(this.origin[0], this.origin[1]);
            
            // Now enable rendering and trigger single render
            this.canvasLayer.setDataReady(true);
            this.canvasLayer.redraw();

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

    showRefining() {
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.remove('hidden');
            const progressText = progressOverlay.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = 'Refining...';
            }
        }
    }

    updateLegend() {
        const labels = document.getElementById('legend-labels');
        if (!labels) return;
        
        const steps = 6;
        const interval = this.maxTime / steps;
        
        let html = '<span>0</span>';
        for (let i = 1; i <= steps; i++) {
            const time = Math.round(interval * i);
            html += `<span>${time}${i === steps ? 'm' : ''}</span>`;
        }
        labels.innerHTML = html;
    }

    updateWalkingNetworkUI() {
        const container = document.getElementById('walking-network-container');
        const citiesLabel = document.getElementById('walking-network-cities');
        const toggle = document.getElementById('walking-network-toggle');
        
        if (!container) return;
        
        const hasWalkingData = WALKING_NETWORK_CITIES.includes(this.currentCity);
        
        if (hasWalkingData) {
            container.classList.remove('hidden');
            // Show abbreviations of cities with walking data
            const abbrevs = WALKING_NETWORK_CITIES.map(c => c.toUpperCase()).join(', ');
            citiesLabel.textContent = `(${abbrevs})`;
            toggle.checked = true;
            if (this.walkingNetwork) {
                this.walkingNetwork.enabled = true;
            }
        } else {
            container.classList.add('hidden');
            toggle.checked = false;
            if (this.walkingNetwork) {
                this.walkingNetwork.enabled = false;
            }
        }
    }

    detectCity(addressString) {
        if (!addressString || typeof addressString !== 'string') return null;
        const addr = addressString.toLowerCase();
        
        // City detection patterns
        const cityPatterns = {
            'nyc': ['new york', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'nyc'],
            'sf': ['san francisco', 'sf', 'bay area'],
            'boston': ['boston', 'cambridge, ma', 'somerville, ma'],
            'chicago': ['chicago'],
            'dc': ['washington, d.c.', 'washington dc', 'district of columbia', 'd.c.'],
            'la': ['los angeles', 'la, ca', 'santa monica', 'hollywood'],
            'seattle': ['seattle', 'king county'],
            'portland': ['portland, or', 'portland, oregon'],
            'philadelphia': ['philadelphia', 'philly'],
            'toronto': ['toronto', 'ontario, canada']
        };
        
        for (const [cityKey, patterns] of Object.entries(cityPatterns)) {
            for (const pattern of patterns) {
                if (addr.includes(pattern)) {
                    // Check if this city exists in CITIES config
                    if (CITIES[cityKey]) {
                        return cityKey;
                    }
                }
            }
        }
        
        return null;
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

