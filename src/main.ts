/**
 * Transit Topography - Main Application
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles/main.css';

import { debounce } from './utils/debounce';
import { normalizeQuery, getUrlParams, updateUrl } from './utils/url-params';
import { distHaversine } from './utils/haversine';
import { IsochoneCanvasLayer } from './rendering/canvas-layer';
import { TransitGraph } from './core/transit-graph';
import { TransitFetcher } from './core/transit-fetcher';
import { WaterMask } from './masks/water-mask';
import { BuildingMask } from './masks/building-mask';
import { WalkingNetwork } from './core/walking-network';
import { CITIES, WALKING_NETWORK_CITIES, WALK_SPEED_MPS, TILE_URLS } from './data/city-config';
import { getTransitPeriod, getBoardingWaitSec, formatHour } from './utils/headway';

const LOCATIONIQ_API_KEY = import.meta.env.VITE_LOCATIONIQ_KEY || (window as any).LOCATIONIQ_API_KEY || '';

class TransitTopographyApp {
    private map: L.Map | null = null;
    private origin: [number, number] = [40.7527, -73.9772];
    private originMarker: L.Marker | null = null;
    private canvasLayer: IsochoneCanvasLayer | null = null;
    private transitGraph: TransitGraph;
    private transitFetcher: TransitFetcher;
    private waterMask: WaterMask;
    private buildingMask: BuildingMask;
    private walkingNetwork: WalkingNetwork;
    private networkTimes: Map<string, number> = new Map();
    private currentCity: string = 'nyc';

    // UI state
    private opacity: number = 0.6;
    private pixelSize: number = 2;
    private maxTime: number = 30;
    private isDarkMode: boolean = false;
    private showStations: boolean = false;
    private showLines: boolean = false;
    private currentHour: number = 8; // 8 AM default

    // Layers
    private tileLayer: L.TileLayer | null = null;
    private stationLayer: L.LayerGroup = L.layerGroup();
    private linesLayer: L.LayerGroup = L.layerGroup();

    constructor() {
        this.transitGraph = new TransitGraph();
        this.transitFetcher = new TransitFetcher(this.transitGraph);
        this.waterMask = new WaterMask();
        this.buildingMask = new BuildingMask();
        this.walkingNetwork = new WalkingNetwork();

        this.updateOrigin = this.updateOrigin.bind(this);
        this.loadCity = this.loadCity.bind(this);
        this.toggleDarkMode = this.toggleDarkMode.bind(this);
        this.toggleStations = this.toggleStations.bind(this);
        this.toggleLines = this.toggleLines.bind(this);
        this.exportImage = this.exportImage.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
    }

    async init(): Promise<void> {
        // Check URL parameters
        const params = getUrlParams();
        if (params.city && CITIES[params.city]) {
            this.currentCity = params.city;
            const city = CITIES[params.city];
            if (city.center) {
                this.origin = [...city.center] as [number, number];
            }
        }
        if (params.lat && params.lng) {
            this.origin = [params.lat, params.lng];
        }
        if (params.hour !== null) {
            this.currentHour = Math.max(0, Math.min(23.5, params.hour));
        }

        this.initMap();

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
        this.canvasLayer.addTo(this.map!);

        this.initUI();
        this.initAddressSearch();
        this.initDataFetching();

        document.getElementById('city-select')!.setAttribute('value', this.currentCity);
        const currentCityData = CITIES[this.currentCity];
        if (currentCityData) {
            document.getElementById('city-title')!.textContent = currentCityData.name;
        }

        if (params.city && CITIES[params.city] && CITIES[params.city].files.length > 0) {
            setTimeout(() => this.loadCity(), 500);
        }
    }

    private initMap(): void {
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (this.isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.updateThemeIcons();
        }

        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView(this.origin, CITIES[this.currentCity]?.zoom || 13);

        this.tileLayer = L.tileLayer(this.isDarkMode ? TILE_URLS.dark : TILE_URLS.light, {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        const markerIcon = L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);'></div>",
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        this.originMarker = L.marker(this.origin, { icon: markerIcon }).addTo(this.map);

        this.map.on('click', (e) => {
            if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                this.updateOrigin(e.latlng.lat, e.latlng.lng);
            }
        });

        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            const travelTime = this.canvasLayer?.getTravelTime(e.latlng.lat, e.latlng.lng);
            if (travelTime !== null && travelTime !== undefined) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<strong>Travel Time:</strong> ${travelTime.toFixed(1)} minutes`)
                    .openOn(this.map!);
            }
        });
    }

    private prepareOrigin(lat: number, lng: number, labelText?: string): void {
        this.origin = [lat, lng];
        this.originMarker!.setLatLng(this.origin);

        if (labelText) {
            document.getElementById('origin-label')!.innerText = labelText;
        } else {
            this.updateOriginLabel({ lat, lon: lng });
        }

        // Update all render data BEFORE setView so any triggered redraws
        // use the correct origin and computed times.
        if (this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            this.walkingNetwork.computeFromOrigin(lat, lng);
            this.canvasLayer!.setWalkingNetwork(this.walkingNetwork);
        }

        if (this.transitGraph.nodes.size > 0) {
            const entryNodes: Array<{ id: string; initialWalkTime: number }> = [];
            for (const [id, node] of this.transitGraph.nodes) {
                const dist = distHaversine(lat, lng, node.lat, node.lon);
                if (dist < 2000) {
                    entryNodes.push({ id, initialWalkTime: dist / WALK_SPEED_MPS });
                }
            }

            this.networkTimes = this.transitGraph.calculateNetworkTimes(entryNodes, getBoardingWaitSec(this.currentHour));
            this.canvasLayer!.setNetworkTimes(this.networkTimes);
        }

        this.canvasLayer!.setOrigin(this.origin);

        // Set view after data is ready
        this.map!.setView(this.origin, this.map!.getZoom(), { animate: false });
    }

    updateOrigin(lat: number, lng: number, labelText?: string): void {
        this.origin = [lat, lng];
        this.originMarker!.setLatLng(this.origin);

        if (labelText) {
            document.getElementById('origin-label')!.innerText = labelText;
        } else {
            this.updateOriginLabel({ lat, lon: lng });
        }

        updateUrl(this.currentCity, lat, lng, this.currentHour);

        // Update all render data BEFORE panning so the moveend-triggered
        // redraw already has the correct origin, walking times, and network times.
        if (this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            this.walkingNetwork.computeFromOrigin(lat, lng);
            this.canvasLayer!.setWalkingNetwork(this.walkingNetwork);
        }

        if (this.transitGraph.nodes.size > 0) {
            const entryNodes: Array<{ id: string; initialWalkTime: number }> = [];
            for (const [id, node] of this.transitGraph.nodes) {
                const dist = distHaversine(lat, lng, node.lat, node.lon);
                if (dist < 2000) {
                    entryNodes.push({ id, initialWalkTime: dist / WALK_SPEED_MPS });
                }
            }

            this.networkTimes = this.transitGraph.calculateNetworkTimes(entryNodes, getBoardingWaitSec(this.currentHour));
            this.canvasLayer!.setNetworkTimes(this.networkTimes);
        }

        this.canvasLayer!.setOrigin(this.origin);

        // Pan after data is ready — the moveend event will trigger redraw
        // with the correct origin and transit data already set.
        this.map!.panTo(this.origin);
    }

    private async updateOriginLabel(latlng: { lat: number; lon: number }): Promise<void> {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lon}&zoom=18&addressdetails=1`);
            const data = await resp.json();
            const road = data.address.road || "New Location";
            const suburb = data.address.suburb || data.address.neighbourhood || data.address.city_district || data.address.city || "Unknown Location";
            document.getElementById('origin-label')!.innerText = `${road} (${suburb})`;

            const city = data.address.city || data.address.town || data.address.village || data.address.county || "NYC";
            document.getElementById('city-title')!.innerText = city;
        } catch {
            document.getElementById('origin-label')!.innerText = `${latlng.lat.toFixed(4)}, ${latlng.lon.toFixed(4)}`;
        }
    }

    private initUI(): void {
        document.getElementById('opacity-slider')!.addEventListener('input', (e) => {
            this.opacity = parseFloat((e.target as HTMLInputElement).value);
            this.canvasLayer!.setOpacity(this.opacity);
            this.canvasLayer!.redraw();
        });

        document.getElementById('res-select')!.addEventListener('change', (e) => {
            this.pixelSize = parseInt((e.target as HTMLSelectElement).value);
            this.canvasLayer!.setPixelSize(this.pixelSize);
            this.canvasLayer!.forceRedraw();
        });

        document.getElementById('max-time-select')!.addEventListener('change', (e) => {
            this.maxTime = parseInt((e.target as HTMLSelectElement).value);
            this.canvasLayer!.setMaxTime(this.maxTime);
            this.updateLegend();
            this.canvasLayer!.forceRedraw();
        });

        // Time-of-day slider
        const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
        // Restore slider position from currentHour (step=1 → 30-min increments)
        timeSlider.value = String(Math.round(this.currentHour * 2));
        timeSlider.addEventListener('input', () => {
            this.currentHour = parseInt(timeSlider.value) * 0.5;
            this.updateTimeDisplay();
            updateUrl(this.currentCity, this.origin[0], this.origin[1], this.currentHour);
            if (this.transitGraph.nodes.size > 0) {
                this.updateOrigin(this.origin[0], this.origin[1]);
            }
        });
        this.updateTimeDisplay();

        document.getElementById('theme-btn')!.addEventListener('click', this.toggleDarkMode);

        document.getElementById('stations-toggle')!.addEventListener('change', (e) => {
            this.showStations = (e.target as HTMLInputElement).checked;
            this.toggleStations();
        });

        document.getElementById('lines-toggle')!.addEventListener('change', (e) => {
            this.showLines = (e.target as HTMLInputElement).checked;
            this.toggleLines();
        });

        document.getElementById('walking-network-toggle')!.addEventListener('change', (e) => {
            this.walkingNetwork.enabled = (e.target as HTMLInputElement).checked;
            this.canvasLayer!.forceRedraw();
        });

        this.updateWalkingNetworkUI();

        document.getElementById('export-btn')!.addEventListener('click', this.exportImage);

        const helpBtn = document.getElementById('help-btn')!;
        const helpModal = document.getElementById('help-modal')!;
        const helpClose = document.getElementById('help-close')!;

        helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
        helpClose.addEventListener('click', () => helpModal.classList.add('hidden'));
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.classList.add('hidden');
        });

        this.initCityModal();
        document.addEventListener('keydown', this.handleKeyboard);

        document.getElementById('share-btn')!.addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('share-btn')!;
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

    private updateTimeDisplay(): void {
        const period = getTransitPeriod(this.currentHour);
        const headwayMin = Math.round(period.headwaySec / 60);

        const timeDisplay = document.getElementById('time-display');
        const serviceDot  = document.getElementById('service-dot');
        const serviceLabel = document.getElementById('service-label');

        if (timeDisplay)  timeDisplay.textContent = formatHour(this.currentHour);
        if (serviceDot)   serviceDot.style.backgroundColor = period.color;
        if (serviceLabel) serviceLabel.textContent = `${period.name} · ~${headwayMin} min frequency`;
    }

    private initCityModal(): void {
        const cityTitleBtn = document.getElementById('city-title-btn')!;
        const cityModal = document.getElementById('city-modal')!;
        const cityModalClose = document.getElementById('city-modal-close')!;
        const citySearch = document.getElementById('city-search') as HTMLInputElement;

        this.populateCityGrid();

        cityTitleBtn.addEventListener('click', () => {
            cityModal.classList.remove('hidden');
            citySearch.value = '';
            citySearch.focus();
            this.filterCities('');
        });

        cityModalClose.addEventListener('click', () => cityModal.classList.add('hidden'));
        cityModal.addEventListener('click', (e) => {
            if (e.target === cityModal) cityModal.classList.add('hidden');
        });

        citySearch.addEventListener('input', (e) => {
            this.filterCities((e.target as HTMLInputElement).value.toLowerCase());
        });

        citySearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cityModal.classList.add('hidden');
            }
        });
    }

    private populateCityGrid(): void {
        const regionContainers: Record<string, HTMLElement | null> = {
            'north_america': document.getElementById('cities-north-america'),
            'europe': document.getElementById('cities-europe'),
            'asia_pacific': document.getElementById('cities-asia-pacific'),
            'south_america': document.getElementById('cities-south-america')
        };

        Object.values(regionContainers).forEach(c => c && (c.innerHTML = ''));

        for (const [key, city] of Object.entries(CITIES)) {
            if (!city.region || !regionContainers[city.region]) continue;

            const chip = document.createElement('button');
            chip.className = 'city-chip';
            chip.dataset.city = key;
            chip.dataset.name = city.name.toLowerCase();
            chip.innerHTML = `${city.flag} ${city.name}`;

            if (key === this.currentCity) {
                chip.classList.add('active');
            }

            chip.addEventListener('click', () => this.selectCity(key));
            regionContainers[city.region]!.appendChild(chip);
        }
    }

    private filterCities(query: string): void {
        const chips = document.querySelectorAll('.city-chip') as NodeListOf<HTMLElement>;
        const regionSections = document.querySelectorAll('.region-section') as NodeListOf<HTMLElement>;

        chips.forEach(chip => {
            const name = chip.dataset.name || '';
            const matches = !query || name.includes(query);
            chip.classList.toggle('hidden', !matches);
        });

        regionSections.forEach(section => {
            const visibleChips = section.querySelectorAll('.city-chip:not(.hidden)');
            section.style.display = visibleChips.length === 0 ? 'none' : 'block';
        });
    }

    private selectCity(cityKey: string): void {
        const city = CITIES[cityKey];
        if (!city || !city.center) return;

        this.currentCity = cityKey;
        document.getElementById('city-title')!.textContent = city.name;

        document.querySelectorAll('.city-chip').forEach(chip => {
            chip.classList.toggle('active', (chip as HTMLElement).dataset.city === cityKey);
        });

        document.getElementById('city-modal')!.classList.add('hidden');

        this.origin = [...city.center] as [number, number];
        this.map!.setView(this.origin, city.zoom);
        this.originMarker!.setLatLng(this.origin);

        updateUrl(cityKey, this.origin[0], this.origin[1], this.currentHour);
        this.loadCity();
    }

    private handleKeyboard(e: KeyboardEvent): void {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

        switch (e.key) {
            case '=':
            case '+':
                this.map!.zoomIn();
                break;
            case '-':
                this.map!.zoomOut();
                break;
            case '[': {
                // Step time back 30 min
                const slider = document.getElementById('time-slider') as HTMLInputElement;
                const newVal = Math.max(0, parseInt(slider.value) - 1);
                slider.value = String(newVal);
                slider.dispatchEvent(new Event('input'));
                break;
            }
            case ']': {
                // Step time forward 30 min
                const slider = document.getElementById('time-slider') as HTMLInputElement;
                const newVal = Math.min(47, parseInt(slider.value) + 1);
                slider.value = String(newVal);
                slider.dispatchEvent(new Event('input'));
                break;
            }
            case '?':
                document.getElementById('help-modal')!.classList.toggle('hidden');
                break;
            case 'Escape':
                document.getElementById('help-modal')!.classList.add('hidden');
                document.getElementById('city-modal')!.classList.add('hidden');
                break;
        }
    }

    private toggleDarkMode(): void {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', String(this.isDarkMode));

        document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');

        this.map!.removeLayer(this.tileLayer!);
        this.tileLayer = L.tileLayer(this.isDarkMode ? TILE_URLS.dark : TILE_URLS.light, {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map!);

        this.tileLayer.bringToBack();
        this.updateThemeIcons();
    }

    private updateThemeIcons(): void {
        const lightIcon = document.getElementById('theme-icon-light')!;
        const darkIcon = document.getElementById('theme-icon-dark')!;
        if (this.isDarkMode) {
            lightIcon.classList.add('hidden');
            darkIcon.classList.remove('hidden');
        } else {
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
        }
    }

    private toggleStations(): void {
        if (this.showStations) {
            this.renderStations();
            this.map!.addLayer(this.stationLayer);
        } else {
            this.map!.removeLayer(this.stationLayer);
        }
    }

    private toggleLines(): void {
        if (this.showLines) {
            this.renderLines();
            this.map!.addLayer(this.linesLayer);
        } else {
            this.map!.removeLayer(this.linesLayer);
        }
    }

    private renderStations(): void {
        this.stationLayer.clearLayers();
        if (!this.transitGraph || this.transitGraph.stations.length === 0) return;

        const isRailStation = (stationId: string): boolean => {
            const node = this.transitGraph.nodes.get(stationId);
            if (!node) return false;

            for (const [neighborId, weight] of node.neighbors) {
                const neighborNode = this.transitGraph.nodes.get(neighborId);
                if (!neighborNode) continue;
                const dist = distHaversine(node.lat, node.lon, neighborNode.lat, neighborNode.lon);
                const speed = dist / weight;
                if (speed > 6) return true;
            }
            return false;
        };

        this.transitGraph.stations.forEach((station) => {
            const isRail = isRailStation(station.id);

            const marker = L.circleMarker([station.lat, station.lon], {
                radius: isRail ? 5 : 3,
                fillColor: isRail ? '#3b82f6' : '#f97316',
                color: '#fff',
                weight: isRail ? 2 : 1,
                opacity: 1,
                fillOpacity: isRail ? 0.9 : 0.6
            });

            this.stationLayer.addLayer(marker);
        });
    }

    private renderLines(): void {
        this.linesLayer.clearLayers();
        if (!this.transitGraph || this.transitGraph.nodes.size === 0) return;

        const drawnEdges = new Set<string>();

        for (const [id, node] of this.transitGraph.nodes) {
            for (const [neighborId, weight] of node.neighbors) {
                const edgeKey = [id, neighborId].sort().join('-');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighborNode = this.transitGraph.nodes.get(neighborId);
                if (!neighborNode) continue;

                const dist = distHaversine(node.lat, node.lon, neighborNode.lat, neighborNode.lon);
                const speed = dist / weight;

                if (speed < 2) continue;
                if (dist < 100) continue;

                const isRail = speed > 6;
                const isBus = speed >= 2 && speed <= 6;

                const color = isRail ? '#3b82f6' : '#f97316';
                const lineWeight = isRail ? 3 : 2;
                const lineOpacity = isRail ? 0.8 : 0.5;

                const line = L.polyline(
                    [[node.lat, node.lon], [neighborNode.lat, neighborNode.lon]],
                    {
                        color,
                        weight: lineWeight,
                        opacity: lineOpacity,
                        dashArray: isBus ? '4, 4' : undefined
                    }
                );

                this.linesLayer.addLayer(line);
            }
        }
    }

    private async exportImage(): Promise<void> {
        const btn = document.getElementById('export-btn')!;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<div class="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></div> Exporting...';
        (btn as HTMLButtonElement).disabled = true;

        try {
            const mapContainer = document.getElementById('map')!;
            const rect = mapContainer.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = width;
            exportCanvas.height = height;
            const ctx = exportCanvas.getContext('2d')!;

            ctx.fillStyle = this.isDarkMode ? '#0f172a' : '#f9fafb';
            ctx.fillRect(0, 0, width, height);

            if (this.canvasLayer?.canvas) {
                ctx.drawImage(this.canvasLayer.canvas, 0, 0);
            }

            const legendX = 20;
            const legendY = height - 100;
            const legendWidth = 200;
            const legendHeight = 80;

            ctx.fillStyle = this.isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 8);
            ctx.fill();

            ctx.fillStyle = this.isDarkMode ? '#f1f5f9' : '#111827';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText('Travel Time (minutes)', legendX + 10, legendY + 20);

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

            ctx.fillStyle = this.isDarkMode ? '#94a3b8' : '#6b7280';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText('0', legendX + 10, legendY + 65);
            ctx.fillText('30m', legendX + legendWidth - 30, legendY + 65);

            ctx.fillStyle = this.isDarkMode ? '#64748b' : '#9ca3af';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText('Transit Topography', legendX + 10, legendY + legendHeight - 5);

            const link = document.createElement('a');
            link.download = `transit-topography-${this.currentCity}-${Date.now()}.png`;
            link.href = exportCanvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            btn.innerHTML = originalHTML;
            (btn as HTMLButtonElement).disabled = false;
        }
    }

    private initAddressSearch(): void {
        const label = document.getElementById('origin-label')!;
        const container = document.getElementById('search-container')!;
        const input = document.getElementById('origin-input') as HTMLInputElement;
        const list = document.getElementById('suggestions-list')!;

        label.addEventListener('click', () => {
            label.classList.add('hidden');
            container.classList.remove('hidden');
            input.value = "";
            input.focus();
        });

        const fetchSuggestions = debounce(async (rawQuery: unknown) => {
            const query = rawQuery as string;
            if (!query || query.length < 3) {
                list.classList.add('hidden');
                return;
            }

            if (!LOCATIONIQ_API_KEY) {
                console.warn("LocationIQ API Key not set.");
                return;
            }

            const normalizedQuery = normalizeQuery(query);

            try {
                const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(normalizedQuery)}&limit=5&dedupe=1`;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error("LocationIQ API Error: " + resp.statusText);
                const data = await resp.json();
                this.renderSuggestions(data, list, input, container, label);
            } catch (e) {
                console.error("Search error", e);
            }
        }, 300);

        input.addEventListener('input', (e) => fetchSuggestions((e.target as HTMLInputElement).value));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const firstItem = list.querySelector('li');
                if (firstItem) (firstItem as HTMLElement).click();
            }
            if (e.key === 'Escape') {
                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            if (!container.classList.contains('hidden') && !container.contains(e.target as Node) && !label.contains(e.target as Node)) {
                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');
            }
        });
    }

    private renderSuggestions(results: any[], list: HTMLElement, input: HTMLInputElement, container: HTMLElement, label: HTMLElement): void {
        list.innerHTML = '';
        if (!results || results.length === 0) {
            list.classList.add('hidden');
            return;
        }

        results.forEach((item: any) => {
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

                if (isNaN(lat) || isNaN(lon)) return;

                list.classList.add('hidden');
                container.classList.add('hidden');
                label.classList.remove('hidden');

                const displayName = item.display_name || '';
                const detectedCity = this.detectCity(displayName);

                if (detectedCity && detectedCity !== this.currentCity) {
                    this.currentCity = detectedCity;
                    document.getElementById('city-title')!.textContent = CITIES[detectedCity]?.name || detectedCity;

                    document.querySelectorAll('.city-chip').forEach(chip => {
                        chip.classList.toggle('active', (chip as HTMLElement).dataset.city === detectedCity);
                    });

                    this.origin = [lat, lon];
                    await this.loadCity();
                }

                this.origin = [lat, lon];
                this.originMarker!.setLatLng([lat, lon]);
                document.getElementById('origin-label')!.innerText = name;
                updateUrl(this.currentCity, lat, lon, this.currentHour);

                // Update all render data BEFORE setView so the moveend-triggered
                // redraw uses the correct origin and computed times.
                if (this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
                    this.walkingNetwork.computeFromOrigin(lat, lon);
                    this.canvasLayer!.setWalkingNetwork(this.walkingNetwork);
                }

                if (this.transitGraph.nodes.size > 0) {
                    const entryNodes: Array<{ id: string; initialWalkTime: number }> = [];
                    for (const [id, node] of this.transitGraph.nodes) {
                        const dist = distHaversine(lat, lon, node.lat, node.lon);
                        if (dist < 2000) {
                            entryNodes.push({ id, initialWalkTime: dist / WALK_SPEED_MPS });
                        }
                    }
                    this.networkTimes = this.transitGraph.calculateNetworkTimes(entryNodes, getBoardingWaitSec(this.currentHour));
                    this.canvasLayer!.setNetworkTimes(this.networkTimes);
                }

                this.canvasLayer!.setOrigin([lat, lon]);

                // Set view after data is ready
                const targetZoom = Math.max(this.map!.getZoom(), 15);
                this.map!.setView([lat, lon], targetZoom, { animate: true });
            });

            list.appendChild(li);
        });

        list.classList.remove('hidden');
    }

    private initDataFetching(): void {
        const btn = document.getElementById('fetch-stations-btn')!;
        const citySelect = document.getElementById('city-select') as HTMLSelectElement;
        const busToggle = document.getElementById('bus-toggle') as HTMLInputElement;

        citySelect.addEventListener('change', (e) => {
            const cityKey = (e.target as HTMLSelectElement).value;
            const city = CITIES[cityKey];
            if (city && city.center) {
                this.currentCity = cityKey;
                this.origin = [...city.center] as [number, number];
                this.map!.setView(this.origin, city.zoom);
                this.updateOrigin(this.origin[0], this.origin[1], "City Center");
                this.loadCity();
            }
        });

        btn.addEventListener('click', () => this.loadCity());
    }

    private async loadCity(): Promise<void> {
        const cityKey = this.currentCity;
        const city = CITIES[cityKey];
        const loading = document.getElementById('loading-overlay')!;
        const countLabel = document.getElementById('station-count')!;
        const busToggle = document.getElementById('bus-toggle') as HTMLInputElement;

        try {
            loading.classList.remove('hidden');
            countLabel.classList.add('hidden');

            this.canvasLayer!.setDataReady(false);

            let count = 0;
            if (city && city.files && city.files.length > 0) {
                this.transitGraph.clear();

                for (const file of city.files) {
                    try {
                        await this.transitFetcher.loadStaticGraph(file, false);
                    } catch (e) {
                        console.warn(`Failed to load ${file}:`, e);
                    }
                }

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

                if (city.water) {
                    await this.waterMask.loadWaterData(city.water);
                }

                if (city.buildings) {
                    await this.buildingMask.loadBuildingData(city.buildings);
                }

                const walkingUrl = `transit_data/walking_${cityKey}.json`;
                await this.walkingNetwork.loadNetwork(walkingUrl);
            } else {
                const bounds = this.map!.getBounds();
                count = await this.transitFetcher.fetchRoutes(bounds);
            }

            this.transitGraph.generateTransferEdges(200);

            countLabel.innerText = `Loaded ${count} stations for ${cityKey.toUpperCase()}`;
            countLabel.classList.remove('hidden');

            this.updateWalkingNetworkUI();

            if (this.showStations) this.renderStations();
            if (this.showLines) this.renderLines();

            this.prepareOrigin(this.origin[0], this.origin[1]);

            this.canvasLayer!.setDataReady(true);
            this.canvasLayer!.redraw();

        } catch (err) {
            console.error(err);
            alert(`Failed to load data for ${cityKey}. Error: ${(err as Error).message}`);
        } finally {
            loading.classList.add('hidden');
        }
    }

    private updateProgress(progress: number): void {
        const overlay = document.getElementById('loading-overlay')!;
        if (!overlay.classList.contains('hidden')) return;

        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.remove('hidden');
            const progressText = progressOverlay.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = `Computing ${progress}%...`;
            }
        }
    }

    private hideProgress(): void {
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.add('hidden');
        }
    }

    private showRefining(): void {
        const progressOverlay = document.getElementById('progress-overlay');
        if (progressOverlay) {
            progressOverlay.classList.remove('hidden');
            const progressText = progressOverlay.querySelector('.progress-text');
            if (progressText) {
                progressText.textContent = 'Refining...';
            }
        }
    }

    private updateLegend(): void {
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

    private updateWalkingNetworkUI(): void {
        const container = document.getElementById('walking-network-container');
        const citiesLabel = document.getElementById('walking-network-cities');
        const toggle = document.getElementById('walking-network-toggle') as HTMLInputElement;

        if (!container) return;

        const hasWalkingData = WALKING_NETWORK_CITIES.includes(this.currentCity);

        if (hasWalkingData) {
            container.classList.remove('hidden');
            const abbrevs = WALKING_NETWORK_CITIES.map(c => c.toUpperCase()).join(', ');
            if (citiesLabel) citiesLabel.textContent = `(${abbrevs})`;
            toggle.checked = true;
            this.walkingNetwork.enabled = true;
        } else {
            container.classList.add('hidden');
            toggle.checked = false;
            this.walkingNetwork.enabled = false;
        }
    }

    private detectCity(addressString: string): string | null {
        if (!addressString) return null;
        const addr = addressString.toLowerCase();

        const cityPatterns: Record<string, string[]> = {
            'nyc': ['new york', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'nyc'],
            'sf': ['san francisco', 'sf', 'bay area'],
            'boston': ['boston', 'cambridge, ma', 'somerville, ma'],
            'chicago': ['chicago'],
            'dc': ['washington, d.c.', 'washington dc', 'district of columbia', 'd.c.'],
            'la': ['los angeles', 'la, ca', 'santa monica', 'hollywood'],
            'seattle': ['seattle', 'king county'],
            'portland': ['portland, or', 'portland, oregon'],
            'philly': ['philadelphia', 'philly'],
            'toronto': ['toronto', 'ontario, canada']
        };

        for (const [cityKey, patterns] of Object.entries(cityPatterns)) {
            for (const pattern of patterns) {
                if (addr.includes(pattern)) {
                    if (CITIES[cityKey]) {
                        return cityKey;
                    }
                }
            }
        }

        return null;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new TransitTopographyApp();
    app.init();
    (window as any).transitApp = app;
});
