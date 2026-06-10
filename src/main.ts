/**
 * Transit Topography - Main Application
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles/main.css';

import { debounce } from './utils/debounce';
import { normalizeQuery, getUrlParams, updateUrl } from './utils/url-params';
import { trackEvent } from './utils/analytics';
import { distHaversine } from './utils/haversine';
import { IsochoneCanvasLayer } from './rendering/canvas-layer';
import { TransitGraph } from './core/transit-graph';
import { TransitFetcher } from './core/transit-fetcher';
import { WaterMask } from './masks/water-mask';
import { BuildingMask } from './masks/building-mask';
import { WalkingNetwork } from './core/walking-network';
import { CITIES, TRANSFER_PENALTY_SEC, WALK_SPEED_MPS, TILE_URLS } from './data/city-config';
import { CITY_MANIFEST, getCityManifest } from './data/city-manifest';
import { getTransitPeriod, getBoardingWaitSec, formatHour } from './utils/headway';
import { PosterTab } from './poster/poster-tab';
import type { RoutingProfile } from './types';

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
    private pixelSize: number = 3;
    private maxTime: number = 30;
    private isDarkMode: boolean = false;
    private showStations: boolean = false;
    private showLines: boolean = false;
    private currentHour: number = 8; // 8 AM default
    private routingDirection: RoutingProfile['direction'] = 'depart';

    // Layers
    private tileLayer: L.TileLayer | null = null;
    private stationLayer: L.LayerGroup = L.layerGroup();
    private linesLayer: L.LayerGroup = L.layerGroup();

    // Poster tab
    private posterTab: PosterTab;

    constructor() {
        this.transitGraph = new TransitGraph();
        this.transitFetcher = new TransitFetcher(this.transitGraph);
        this.waterMask = new WaterMask();
        this.buildingMask = new BuildingMask();
        this.walkingNetwork = new WalkingNetwork();
        this.posterTab = new PosterTab();

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
        if (params.direction) {
            this.routingDirection = params.direction;
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

        // Initialize poster tab
        this.posterTab.transitGraph = this.transitGraph;
        this.posterTab.waterMask = this.waterMask;
        this.posterTab.walkingNetwork = this.walkingNetwork;
        this.posterTab.currentCityKey = this.currentCity;
        this.posterTab.onCityChangeRequested = async (cityKey: string) => {
            this.currentCity = cityKey;
            document.getElementById('city-title')!.textContent = CITIES[cityKey]?.name || cityKey;
            this.updateModeAvailability();
            await this.loadCity();
        };
        this.posterTab.onOpenCityModal = () => {
            document.getElementById('city-modal')!.classList.remove('hidden');
            (document.getElementById('city-search') as HTMLInputElement).value = '';
            (document.getElementById('city-search') as HTMLInputElement).focus();
            this.filterCities('');
        };
        this.posterTab.syncCity(this.currentCity);
        this.posterTab.init();

        document.getElementById('city-select')!.setAttribute('value', this.currentCity);
        const currentCityData = CITIES[this.currentCity];
        if (currentCityData) {
            document.getElementById('city-title')!.textContent = currentCityData.name;
        }
        this.updateModeAvailability();

        if (CITIES[this.currentCity]?.files.length > 0) {
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
            html: '<div class="origin-pulse"><div class="origin-pulse-ring"></div><div class="origin-pulse-core"></div></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });

        this.originMarker = L.marker(this.origin, { icon: markerIcon, keyboard: false }).addTo(this.map);

        this.map.on('click', (e) => {
            if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                this.updateOrigin(e.latlng.lat, e.latlng.lng);
            } else if (this.routeLayer) {
                this.clearRouteLayer();
            }
        });

        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            this.showRouteAt(e.latlng.lat, e.latlng.lng);
        });

        this.initHoverInspector();
    }

    // ── Hover travel-time inspector ──────────────────────────────────────
    private hoverTooltip: HTMLDivElement | null = null;
    private hoverRaf: number | null = null;

    private initHoverInspector(): void {
        const tooltip = document.createElement('div');
        tooltip.className = 'tt-tooltip';
        tooltip.innerHTML = `
            <div>
                <div class="tt-time">—</div>
                <div class="tt-mode">travel time</div>
            </div>`;
        document.body.appendChild(tooltip);
        this.hoverTooltip = tooltip;

        const mapEl = document.getElementById('map')!;

        let lastLat = 0;
        let lastLng = 0;
        let pendingX = 0;
        let pendingY = 0;
        let visible = false;

        const update = () => {
            this.hoverRaf = null;
            if (!this.canvasLayer || !this.map || !this.canvasLayer.dataReady) {
                tooltip.classList.remove('visible');
                visible = false;
                return;
            }
            const t = this.canvasLayer.getTravelTime(lastLat, lastLng);
            const timeEl = tooltip.querySelector('.tt-time') as HTMLElement;
            const modeEl = tooltip.querySelector('.tt-mode') as HTMLElement;

            if (t === null || t === undefined || !isFinite(t) || t > this.maxTime * 4) {
                timeEl.textContent = '—';
                timeEl.classList.add('tt-unreachable');
                modeEl.textContent = 'unreachable';
            } else {
                const mins = t < 1 ? t.toFixed(1) : Math.round(t).toString();
                timeEl.textContent = `${mins} min`;
                timeEl.classList.remove('tt-unreachable');
                modeEl.textContent = t <= this.maxTime ? 'travel time' : 'beyond max';
            }

            tooltip.style.left = `${pendingX}px`;
            tooltip.style.top  = `${pendingY}px`;
            if (!visible) {
                tooltip.classList.add('visible');
                visible = true;
            }
        };

        mapEl.addEventListener('mousemove', (e) => {
            if (!this.map) return;
            const point = this.map.mouseEventToLatLng(e);
            lastLat = point.lat;
            lastLng = point.lng;
            pendingX = e.clientX;
            pendingY = e.clientY;
            if (this.hoverRaf === null) {
                this.hoverRaf = requestAnimationFrame(update);
            }
        });

        mapEl.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
            visible = false;
        });
    }

    // ── Best-route visualization ─────────────────────────────────────────
    private routeLayer: L.LayerGroup | null = null;
    private routeClearTimer: ReturnType<typeof setTimeout> | null = null;

    private showRouteAt(lat: number, lng: number): void {
        const totalMin = this.canvasLayer?.getTravelTime(lat, lng);
        if (totalMin === null || totalMin === undefined || !isFinite(totalMin)) {
            this.toast('Unreachable from here', 'error');
            return;
        }

        // Find best exit station (min: time to station + walk to dest)
        let bestStationId: string | null = null;
        let bestTotalSec = Infinity;
        let bestExitWalkSec = 0;

        const transitMode = this.transitGraph.nodes.size > 0 && this.networkTimes.size > 0;
        if (transitMode) {
            for (const [id, time] of this.networkTimes) {
                const node = this.transitGraph.nodes.get(id);
                if (!node) continue;
                const dExit = distHaversine(lat, lng, node.lat, node.lon);
                const tExit = dExit / WALK_SPEED_MPS;
                const total = time + tExit;
                if (total < bestTotalSec) {
                    bestTotalSec = total;
                    bestStationId = id;
                    bestExitWalkSec = tExit;
                }
            }
        }

        // Walk-only time
        const walkOnlySec = distHaversine(this.origin[0], this.origin[1], lat, lng) / WALK_SPEED_MPS;
        const usingTransit = transitMode && bestStationId !== null && bestTotalSec < walkOnlySec - 30;

        // Draw the route
        this.clearRouteLayer();
        this.routeLayer = L.layerGroup().addTo(this.map!);

        // Destination marker
        const destIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7]
        });
        L.marker([lat, lng], { icon: destIcon, keyboard: false }).addTo(this.routeLayer);

        let summary = '';
        if (usingTransit) {
            const path = this.transitGraph.getPathTo(bestStationId!);
            const entryId = this.transitGraph.entryStations.get(bestStationId!) ?? path[0];
            const entryNode = this.transitGraph.nodes.get(entryId);
            const exitNode = this.transitGraph.nodes.get(bestStationId!);

            if (entryNode && exitNode) {
                // Walk leg: origin → entry station
                L.polyline(
                    [this.origin, [entryNode.lat, entryNode.lon]],
                    { color: '#64748b', weight: 3, opacity: 0.85, dashArray: '5, 6', lineCap: 'round' }
                ).addTo(this.routeLayer);

                // Transit leg(s): entry → ... → exit (follow the path)
                const coords: [number, number][] = path
                    .map(id => this.transitGraph.nodes.get(id))
                    .filter(n => !!n)
                    .map(n => [n!.lat, n!.lon]);
                if (coords.length >= 2) {
                    L.polyline(coords, {
                        color: '#2563eb', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round'
                    }).addTo(this.routeLayer);
                }

                // Walk leg: exit station → destination
                L.polyline(
                    [[exitNode.lat, exitNode.lon], [lat, lng]],
                    { color: '#64748b', weight: 3, opacity: 0.85, dashArray: '5, 6', lineCap: 'round' }
                ).addTo(this.routeLayer);

                // Mark entry / exit stations
                const stationIcon = (color: string) => L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.35);"></div>`,
                    iconSize: [12, 12], iconAnchor: [6, 6]
                });
                L.marker([entryNode.lat, entryNode.lon], { icon: stationIcon('#2563eb'), keyboard: false }).addTo(this.routeLayer);
                if (entryNode.id !== exitNode.id) {
                    L.marker([exitNode.lat, exitNode.lon], { icon: stationIcon('#2563eb'), keyboard: false }).addTo(this.routeLayer);
                }

                const entryWalkMin = (distHaversine(this.origin[0], this.origin[1], entryNode.lat, entryNode.lon) / WALK_SPEED_MPS) / 60;
                const exitWalkMin = bestExitWalkSec / 60;
                const transitMin = totalMin - entryWalkMin - exitWalkMin;
                const transfers = Math.max(0, path.length - 2);
                summary = `${Math.round(totalMin)} min: walk ${entryWalkMin.toFixed(1)}m → transit ${Math.max(0, transitMin).toFixed(1)}m${transfers > 0 ? ` (${transfers} transfer${transfers > 1 ? 's' : ''})` : ''} → walk ${exitWalkMin.toFixed(1)}m`;
            }
        } else {
            // Pure walking
            L.polyline(
                [this.origin, [lat, lng]],
                { color: '#64748b', weight: 3, opacity: 0.9, dashArray: '5, 6', lineCap: 'round' }
            ).addTo(this.routeLayer);
            summary = `${Math.round(totalMin)} min on foot`;
        }

        // Popup label at the destination
        L.popup({ closeButton: false, autoClose: false, closeOnClick: false, className: 'route-popup' })
            .setLatLng([lat, lng])
            .setContent(`<div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:2px;">Best route</div><div style="font-size:13px;font-weight:600;color:#0f172a;">${summary}</div>`)
            .openOn(this.map!);

        // Auto-clear after a few seconds
        if (this.routeClearTimer) clearTimeout(this.routeClearTimer);
        this.routeClearTimer = setTimeout(() => this.clearRouteLayer(), 8000);
    }

    private clearRouteLayer(): void {
        if (this.routeLayer) {
            this.map!.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
        this.map?.closePopup();
        if (this.routeClearTimer) {
            clearTimeout(this.routeClearTimer);
            this.routeClearTimer = null;
        }
    }

    // ── Toast notifications ──────────────────────────────────────────────
    private toastContainer: HTMLDivElement | null = null;
    private toast(message: string, kind: 'success' | 'error' | 'info' = 'info', durationMs = 2400): void {
        if (!this.toastContainer) {
            const c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
            this.toastContainer = c;
        }
        const t = document.createElement('div');
        t.className = `toast toast-${kind}`;
        t.innerHTML = `<span class="toast-msg"></span>`;
        (t.querySelector('.toast-msg') as HTMLElement).textContent = message;
        this.toastContainer.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 220);
        }, durationMs);
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
            this.networkTimes = this.transitGraph.calculateNetworkTimes(
                this.buildEntryNodes(lat, lng),
                this.getRoutingProfile()
            );
            this.canvasLayer!.setNetworkTimes(this.networkTimes);
        }

        this.canvasLayer!.setOrigin(this.origin);
        this.updateReachStats();

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

        updateUrl(this.currentCity, lat, lng, this.currentHour, this.routingDirection);

        // Update all render data BEFORE panning so the moveend-triggered
        // redraw already has the correct origin, walking times, and network times.
        if (this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
            this.walkingNetwork.computeFromOrigin(lat, lng);
            this.canvasLayer!.setWalkingNetwork(this.walkingNetwork);
        }

        if (this.transitGraph.nodes.size > 0) {
            this.networkTimes = this.transitGraph.calculateNetworkTimes(
                this.buildEntryNodes(lat, lng),
                this.getRoutingProfile()
            );
            this.canvasLayer!.setNetworkTimes(this.networkTimes);
        }

        this.canvasLayer!.setOrigin(this.origin);
        this.updateReachStats();

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

    private getRoutingProfile(): RoutingProfile {
        return {
            boardingWaitSec: getBoardingWaitSec(this.currentHour),
            transferPenaltySec: TRANSFER_PENALTY_SEC,
            direction: this.routingDirection,
            maxNetworkTimeSec: this.maxTime * 60 * 4
        };
    }

    private buildEntryNodes(lat: number, lng: number): Array<{ id: string; initialWalkTime: number }> {
        const entryNodes: Array<{ id: string; initialWalkTime: number }> = [];
        for (const [id, node] of this.transitGraph.nodes) {
            const dist = distHaversine(lat, lng, node.lat, node.lon);
            if (dist < 2000) {
                entryNodes.push({ id, initialWalkTime: dist / WALK_SPEED_MPS });
            }
        }
        return entryNodes;
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
            updateUrl(this.currentCity, this.origin[0], this.origin[1], this.currentHour, this.routingDirection);
            if (this.transitGraph.nodes.size > 0) {
                this.updateOrigin(this.origin[0], this.origin[1]);
            }
        });
        this.syncRoutingDirectionButtons();
        this.updateTimeDisplay();

        document.getElementById('time-play-btn')!.addEventListener('click', () => this.toggleTimePlayback());
        document.getElementById('depart-mode-btn')!.addEventListener('click', () => this.setRoutingDirection('depart'));
        document.getElementById('arrive-mode-btn')!.addEventListener('click', () => this.setRoutingDirection('arrive'));

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
            trackEvent('share-click');
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                this.toast('Link copied to clipboard', 'success');
            }).catch(err => {
                console.error('Failed to copy:', err);
                this.toast('Could not copy link — open dev tools to grab URL', 'error');
            });
        });
    }

    // ── Time playback (animate through 24 hours) ─────────────────────────
    private playbackTimer: ReturnType<typeof setInterval> | null = null;

    private toggleTimePlayback(): void {
        if (this.playbackTimer) {
            this.stopTimePlayback();
        } else {
            this.startTimePlayback();
        }
    }

    private startTimePlayback(): void {
        const btn = document.getElementById('time-play-btn')!;
        const playIcon = document.getElementById('time-play-icon')!;
        const pauseIcon = document.getElementById('time-pause-icon')!;
        const slider = document.getElementById('time-slider') as HTMLInputElement;

        btn.classList.add('is-playing');
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        btn.setAttribute('aria-label', 'Pause time animation');

        // Step every 800ms, advance 30 min per step
        this.playbackTimer = setInterval(() => {
            let next = parseInt(slider.value) + 1;
            if (next > 47) next = 0;
            slider.value = String(next);
            slider.dispatchEvent(new Event('input'));
        }, 800);

        this.toast('Playing 24-hour cycle — press Space to pause', 'info', 1800);
    }

    private stopTimePlayback(): void {
        if (this.playbackTimer) {
            clearInterval(this.playbackTimer);
            this.playbackTimer = null;
        }
        const btn = document.getElementById('time-play-btn')!;
        const playIcon = document.getElementById('time-play-icon')!;
        const pauseIcon = document.getElementById('time-pause-icon')!;
        btn.classList.remove('is-playing');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        btn.setAttribute('aria-label', 'Play time animation');
    }

    private updateTimeDisplay(): void {
        const period = getTransitPeriod(this.currentHour);
        const headwayMin = Math.round(period.headwaySec / 60);

        const timeDisplay = document.getElementById('time-display');
        const modeLabel = document.getElementById('time-mode-label');
        const serviceDot  = document.getElementById('service-dot');
        const serviceLabel = document.getElementById('service-label');

        if (timeDisplay)  timeDisplay.textContent = formatHour(this.currentHour);
        if (modeLabel) modeLabel.textContent = this.routingDirection === 'arrive' ? 'Arrival Time' : 'Departure Time';
        if (serviceDot)   serviceDot.style.backgroundColor = period.color;
        if (serviceLabel) serviceLabel.textContent = `${period.name} · ~${headwayMin} min frequency`;
    }

    private setRoutingDirection(direction: RoutingProfile['direction']): void {
        if (this.routingDirection === direction) return;
        this.routingDirection = direction;
        this.syncRoutingDirectionButtons();
        this.updateTimeDisplay();
        updateUrl(this.currentCity, this.origin[0], this.origin[1], this.currentHour, this.routingDirection);
        if (this.transitGraph.nodes.size > 0) {
            this.updateOrigin(this.origin[0], this.origin[1]);
        }
    }

    private syncRoutingDirectionButtons(): void {
        const depart = document.getElementById('depart-mode-btn');
        const arrive = document.getElementById('arrive-mode-btn');
        depart?.classList.toggle('active', this.routingDirection === 'depart');
        arrive?.classList.toggle('active', this.routingDirection === 'arrive');
        depart?.setAttribute('aria-pressed', String(this.routingDirection === 'depart'));
        arrive?.setAttribute('aria-pressed', String(this.routingDirection === 'arrive'));
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

        updateUrl(cityKey, this.origin[0], this.origin[1], this.currentHour, this.routingDirection);
        this.posterTab.syncCity(cityKey);
        this.posterTab.syncOrigin(this.origin, city.name);
        this.updateModeAvailability();
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
            case ' ': {
                e.preventDefault();
                this.toggleTimePlayback();
                break;
            }
            case '?':
                document.getElementById('help-modal')!.classList.toggle('hidden');
                break;
            case 'Escape':
                document.getElementById('help-modal')!.classList.add('hidden');
                document.getElementById('city-modal')!.classList.add('hidden');
                this.stopTimePlayback();
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
            this.toast('Export failed — please try again', 'error');
        } finally {
            btn.innerHTML = originalHTML;
            (btn as HTMLButtonElement).disabled = false;
        }
    }

    // ── Recent searches (persisted) ──────────────────────────────────────
    private readonly RECENT_KEY = 'tt_recent_searches_v1';
    private getRecentSearches(): Array<{ name: string; address: string; lat: number; lon: number; city?: string }> {
        try {
            const raw = localStorage.getItem(this.RECENT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }
    private addRecentSearch(entry: { name: string; address: string; lat: number; lon: number; city?: string }): void {
        const list = this.getRecentSearches().filter(r => !(Math.abs(r.lat - entry.lat) < 1e-4 && Math.abs(r.lon - entry.lon) < 1e-4));
        list.unshift(entry);
        const trimmed = list.slice(0, 5);
        try { localStorage.setItem(this.RECENT_KEY, JSON.stringify(trimmed)); } catch {}
        this.renderRecentSearches();
    }
    private renderRecentSearches(): void {
        const container = document.getElementById('recent-searches');
        if (!container) return;
        const recents = this.getRecentSearches();
        if (recents.length === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }
        container.classList.remove('hidden');
        container.innerHTML = '';
        recents.forEach((r) => {
            const chip = document.createElement('button');
            chip.className = 'recent-chip';
            chip.type = 'button';
            chip.textContent = r.name;
            chip.title = r.address;
            chip.addEventListener('click', async () => {
                if (r.city && CITIES[r.city] && r.city !== this.currentCity) {
                    this.currentCity = r.city;
                    document.getElementById('city-title')!.textContent = CITIES[r.city]?.name || r.city;
                    this.origin = [r.lat, r.lon];
                    await this.loadCity();
                }
                this.updateOrigin(r.lat, r.lon, r.name);
                const targetZoom = Math.max(this.map!.getZoom(), 15);
                this.map!.setView([r.lat, r.lon], targetZoom, { animate: true });
            });
            container.appendChild(chip);
        });
    }

    private initAddressSearch(): void {
        const label = document.getElementById('origin-label')!;
        const container = document.getElementById('search-container')!;
        const input = document.getElementById('origin-input') as HTMLInputElement;
        const list = document.getElementById('suggestions-list')!;

        this.renderRecentSearches();

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

            const normalizedQuery = normalizeQuery(query);

            try {
                let data: any[] = [];

                if (LOCATIONIQ_API_KEY) {
                    const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(normalizedQuery)}&limit=5&dedupe=1`;
                    const resp = await fetch(url);
                    if (resp.ok) {
                        data = await resp.json();
                    } else if (resp.status !== 404) {
                        throw new Error("LocationIQ API Error: " + resp.statusText);
                    }
                }

                // Fallback to Nominatim (free, no key) if LocationIQ unavailable or returned nothing
                if (!data || data.length === 0) {
                    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedQuery)}&limit=5&addressdetails=1`;
                    const resp = await fetch(nomUrl);
                    if (!resp.ok) throw new Error("Nominatim error: " + resp.statusText);
                    data = await resp.json();
                }

                this.renderSuggestions(data, list, input, container, label);
            } catch (e) {
                console.error("Search error", e);
                this.toast('Address search unavailable — please try again', 'error');
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
                updateUrl(this.currentCity, lat, lon, this.currentHour, this.routingDirection);

                // Update all render data BEFORE setView so the moveend-triggered
                // redraw uses the correct origin and computed times.
                if (this.walkingNetwork.isLoaded && this.walkingNetwork.enabled) {
                    this.walkingNetwork.computeFromOrigin(lat, lon);
                    this.canvasLayer!.setWalkingNetwork(this.walkingNetwork);
                }

                if (this.transitGraph.nodes.size > 0) {
                    this.networkTimes = this.transitGraph.calculateNetworkTimes(
                        this.buildEntryNodes(lat, lon),
                        this.getRoutingProfile()
                    );
                    this.canvasLayer!.setNetworkTimes(this.networkTimes);
                }

                this.canvasLayer!.setOrigin([lat, lon]);

                // Set view after data is ready
                const targetZoom = Math.max(this.map!.getZoom(), 15);
                this.map!.setView([lat, lon], targetZoom, { animate: true });

                // Persist to recent searches
                this.addRecentSearch({
                    name,
                    address: address || displayName,
                    lat, lon,
                    city: this.currentCity
                });
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
                this.updateModeAvailability();
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
            trackEvent('city-change');
            this.updateModeAvailability();
            const loadingText = loading.querySelector('.loading-text');
            if (loadingText) loadingText.textContent = `Loading ${city?.name || 'transit data'}…`;
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

                const manifest = getCityManifest(cityKey);
                if (manifest?.walkingFile) {
                    await this.walkingNetwork.loadNetwork(manifest.walkingFile);
                } else {
                    this.walkingNetwork.clear();
                    this.walkingNetwork.enabled = false;
                }
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

            this.updateReachStats();

            // Keep poster tab in sync
            this.posterTab.currentCityKey = cityKey;
            this.posterTab.transitGraph = this.transitGraph;
            this.posterTab.waterMask = this.waterMask;
            this.posterTab.walkingNetwork = this.walkingNetwork;

        } catch (err) {
            console.error(err);
            this.toast(`Failed to load ${cityKey.toUpperCase()}: ${(err as Error).message}`, 'error', 4000);
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
        this.updateReachStats();
    }

    private updateReachStats(): void {
        const card = document.getElementById('reach-stats');
        if (!card) return;
        if (this.networkTimes.size === 0 || this.transitGraph.nodes.size === 0) {
            card.classList.add('hidden');
            return;
        }

        const maxSec = this.maxTime * 60;
        let reachable = 0;
        let bestSec = Infinity;
        let bestId: string | null = null;
        let farthestKm = 0;

        for (const [id, time] of this.networkTimes) {
            if (time > maxSec) continue;
            reachable++;
            if (time < bestSec) {
                bestSec = time;
                bestId = id;
            }
            const node = this.transitGraph.nodes.get(id);
            if (node) {
                const km = distHaversine(this.origin[0], this.origin[1], node.lat, node.lon) / 1000;
                if (km > farthestKm) farthestKm = km;
            }
        }

        if (reachable === 0) {
            card.classList.add('hidden');
            return;
        }

        card.classList.remove('hidden');
        document.getElementById('reach-stats-time')!.textContent = String(this.maxTime);
        document.getElementById('reach-stats-stations')!.textContent = reachable.toLocaleString();

        const parts: string[] = [];
        if (farthestKm > 0) parts.push(`Reaches up to ${farthestKm.toFixed(1)} km`);
        if (bestId) {
            const m = Math.max(0, Math.round(bestSec / 60));
            parts.push(`Nearest station ${m} min`);
        }
        document.getElementById('reach-stats-detail')!.textContent = parts.join(' · ');
    }

    private updateWalkingNetworkUI(): void {
        const container = document.getElementById('walking-network-container');
        const citiesLabel = document.getElementById('walking-network-cities');
        const toggle = document.getElementById('walking-network-toggle') as HTMLInputElement;

        if (!container) return;

        const manifest = getCityManifest(this.currentCity);
        const hasWalkingData = manifest?.features.walking ?? false;

        if (hasWalkingData) {
            container.classList.remove('hidden');
            const walkingCityCount = Object.values(CITY_MANIFEST).filter(c => c.features.walking).length;
            if (citiesLabel) citiesLabel.textContent = `(${walkingCityCount} cities)`;
            toggle.checked = true;
            this.walkingNetwork.enabled = true;
        } else {
            container.classList.add('hidden');
            toggle.checked = false;
            this.walkingNetwork.enabled = false;
        }
    }

    private updateModeAvailability(): void {
        const manifest = getCityManifest(this.currentCity);
        const busToggle = document.getElementById('bus-toggle') as HTMLInputElement | null;
        const busLabel = document.querySelector('label[for="bus-toggle"]') as HTMLElement | null;

        if (busToggle) {
            busToggle.disabled = !(manifest?.features.bus ?? false);
            if (busToggle.disabled) {
                busToggle.checked = false;
            }
        }

        if (busLabel) {
            busLabel.classList.toggle('text-gray-400', !(manifest?.features.bus ?? false));
            busLabel.textContent = manifest?.features.bus ? 'Include Buses' : 'Bus Data Unavailable';
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

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
        const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;
        navigator.serviceWorker.register(serviceWorkerUrl).catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    }
});
