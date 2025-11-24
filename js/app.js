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
        water: 'transit_data/water_nyc.json',
        buildings: 'transit_data/buildings_nyc.json'
    },
    'sf': {
        center: [37.7749, -122.4194],
        zoom: 12,
        files: ['transit_data/sf.json', 'transit_data/sf_muni.json'],
        busFiles: ['transit_data/sf_bus.json', 'transit_data/sf_muni_bus.json'],
        water: 'transit_data/water_sf.json',
        buildings: 'transit_data/buildings_sf.json'
    },
    'boston': {
        center: [42.3601, -71.0589],
        zoom: 13,
        files: ['transit_data/boston.json'],
        busFiles: ['transit_data/boston_bus.json'],
        water: 'transit_data/water_boston.json',
        buildings: 'transit_data/buildings_boston.json'
    },
    'chicago': {
        center: [41.8781, -87.6298],
        zoom: 12,
        files: ['transit_data/chicago.json'],
        busFiles: ['transit_data/chicago_bus.json'],
        water: 'transit_data/water_chicago.json',
        buildings: 'transit_data/buildings_chicago.json'
    },
    'other': { center: null, zoom: null, files: [], busFiles: [], water: null, buildings: null }
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
        this.pixelSize = 4;
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

        // Dark mode toggle
        document.getElementById('theme-btn').addEventListener('click', this.toggleDarkMode);

        // Stations toggle
        const stationsToggle = document.getElementById('stations-toggle');
        stationsToggle.addEventListener('change', (e) => {
            this.showStations = e.target.checked;
            this.toggleStations();
        });

        // Lines toggle
        const linesToggle = document.getElementById('lines-toggle');
        linesToggle.addEventListener('change', (e) => {
            this.showLines = e.target.checked;
            this.toggleLines();
        });

        // Buildings/Realistic Walking toggle
        const buildingsToggle = document.getElementById('buildings-toggle');
        buildingsToggle.addEventListener('change', (e) => {
            if (this.buildingMask) {
                this.buildingMask.enabled = e.target.checked;
                this.canvasLayer.forceRedraw();
            }
        });

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
                
                // Load Building Data (optional - may not exist)
                if (city.buildings) {
                    await this.buildingMask.loadBuildingData(city.buildings);
                }
            } else {
                const bounds = this.map.getBounds();
                count = await this.transitFetcher.fetchRoutes(bounds);
            }

            // Generate Transfers
            this.transitGraph.generateTransferEdges(200);

            countLabel.innerText = `Loaded ${count} stations for ${cityKey.toUpperCase()}`;
            countLabel.classList.remove('hidden');

            // Update station/line layers if visible
            if (this.showStations) this.renderStations();
            if (this.showLines) this.renderLines();

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
}

// Export for global access
window.TransitTopographyApp = TransitTopographyApp;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new TransitTopographyApp();
    app.init();
    window.transitApp = app;
});

