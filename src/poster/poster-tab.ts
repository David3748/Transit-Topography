/**
 * Poster Tab UI — handles tab switching, theme selection, address search,
 * generation flow, progress display, and download.
 */

import { POSTER_THEMES } from './poster-themes';
import { PosterRenderer } from './poster-renderer';
import { trackEvent } from '../utils/analytics';
import { CITIES } from '../data/city-config';
import { formatHour } from '../utils/headway';
import type { PosterConfig } from '../types';
import type { TransitGraph } from '../core/transit-graph';
import type { WaterMask } from '../masks/water-mask';
import type { WalkingNetwork } from '../core/walking-network';

const LOCATIONIQ_API_KEY = import.meta.env.VITE_LOCATIONIQ_KEY || (window as any).LOCATIONIQ_API_KEY || '';

export class PosterTab {
    // Poster settings
    private selectedTheme: string = 'noir';
    private selectedRatio: string = '16:9';
    private selectedCity: string = 'nyc';
    private selectedOrigin: [number, number] = [40.7527, -73.9772];
    private selectedOriginLabel: string = 'Grand Central Terminal';
    private currentHour: number = 8;
    private maxTime: number = 30;

    // Rendering
    private renderer: PosterRenderer | null = null;
    private resultBlob: Blob | null = null;
    private resultUrl: string | null = null;

    // Shared app resources (set by main.ts)
    transitGraph!: TransitGraph;
    waterMask!: WaterMask;
    walkingNetwork!: WalkingNetwork;
    currentCityKey!: string;

    /** Called to load a different city's transit data */
    onCityChangeRequested!: (cityKey: string) => Promise<void>;
    /** Called to open the city modal */
    onOpenCityModal!: () => void;

    init(): void {
        this.initTabSwitching();
        this.renderThemeSwatches();
        this.initThemeSelection();
        this.initRatioSelection();
        this.initTimeSlider();
        this.initGenerateButton();
        this.initAddressSearch();
        this.initCityButton();
    }

    /** Sync poster tab state when explore tab changes city */
    syncCity(cityKey: string): void {
        this.selectedCity = cityKey;
        this.currentCityKey = cityKey;
        const cityData = CITIES[cityKey];
        if (cityData) {
            const label = document.getElementById('poster-city-label');
            if (label) label.textContent = `${cityData.flag} ${cityData.name}`;
        }
    }

    /** Sync poster tab origin when explore tab changes origin */
    syncOrigin(origin: [number, number], label: string): void {
        this.selectedOrigin = origin;
        this.selectedOriginLabel = label;
        const el = document.getElementById('poster-address-label');
        if (el) el.textContent = label;
    }

    // ── Tab switching ──────────────────────────────────────────────────────

    private initTabSwitching(): void {
        const tabExplore = document.getElementById('tab-explore')!;
        const tabPoster = document.getElementById('tab-poster')!;
        const panelExplore = document.getElementById('panel-explore')!;
        const panelPoster = document.getElementById('panel-poster')!;

        tabExplore.addEventListener('click', () => {
            tabExplore.classList.add('tab-active');
            tabPoster.classList.remove('tab-active');
            tabPoster.style.borderColor = 'transparent';
            tabPoster.style.color = 'var(--text-muted)';
            tabExplore.style.borderColor = 'var(--accent)';
            tabExplore.style.color = 'var(--accent)';
            panelExplore.classList.remove('hidden');
            panelPoster.classList.add('hidden');
        });

        tabPoster.addEventListener('click', () => {
            tabPoster.classList.add('tab-active');
            tabExplore.classList.remove('tab-active');
            tabExplore.style.borderColor = 'transparent';
            tabExplore.style.color = 'var(--text-muted)';
            tabPoster.style.borderColor = 'var(--accent)';
            tabPoster.style.color = 'var(--accent)';
            panelPoster.classList.remove('hidden');
            panelExplore.classList.add('hidden');
        });
    }

    // ── Theme swatches ─────────────────────────────────────────────────────

    private renderThemeSwatches(): void {
        const grid = document.getElementById('poster-theme-grid')!;
        grid.innerHTML = '';

        Object.values(POSTER_THEMES).forEach(theme => {
            const swatch = document.createElement('button');
            swatch.className = 'poster-theme-swatch';
            swatch.dataset.themeId = theme.id;
            swatch.title = theme.name;
            swatch.innerHTML = `
                <div class="w-full h-8 rounded-md overflow-hidden flex">
                    <div class="flex-1" style="background: ${theme.previewColors[0]}"></div>
                    <div class="flex-1" style="background: ${theme.previewColors[1]}"></div>
                    <div class="flex-1" style="background: ${theme.previewColors[2]}"></div>
                </div>
                <span class="text-[9px] mt-0.5 block" style="color: var(--text-muted)">${theme.name}</span>
            `;
            if (theme.id === this.selectedTheme) swatch.classList.add('active');
            grid.appendChild(swatch);
        });
    }

    private initThemeSelection(): void {
        document.getElementById('poster-theme-grid')!.addEventListener('click', (e) => {
            const swatch = (e.target as HTMLElement).closest('.poster-theme-swatch') as HTMLElement;
            if (!swatch?.dataset.themeId) return;

            document.querySelectorAll('.poster-theme-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            this.selectedTheme = swatch.dataset.themeId;
        });
    }

    // ── Aspect ratio ───────────────────────────────────────────────────────

    private initRatioSelection(): void {
        document.getElementById('poster-ratio-group')!.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('.poster-ratio-btn') as HTMLElement;
            if (!btn?.dataset.ratio) return;

            document.querySelectorAll('.poster-ratio-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.selectedRatio = btn.dataset.ratio;
        });
    }

    // ── Time slider ────────────────────────────────────────────────────────

    private initTimeSlider(): void {
        const slider = document.getElementById('poster-time-slider') as HTMLInputElement;
        const display = document.getElementById('poster-time-display')!;

        const updateDisplay = () => {
            this.currentHour = parseInt(slider.value) * 0.5;
            display.textContent = formatHour(this.currentHour);
        };

        slider.addEventListener('input', updateDisplay);
        updateDisplay();
    }

    // ── City button ────────────────────────────────────────────────────────

    private initCityButton(): void {
        const btn = document.getElementById('poster-city-btn')!;
        btn.addEventListener('click', () => {
            this.onOpenCityModal?.();
        });

        // Initialize label
        const cityData = CITIES[this.selectedCity];
        if (cityData) {
            document.getElementById('poster-city-label')!.textContent = `${cityData.flag} ${cityData.name}`;
        }
    }

    // ── Address search (LocationIQ) ────────────────────────────────────────

    private initAddressSearch(): void {
        const input = document.getElementById('poster-address-input') as HTMLInputElement;
        const list = document.getElementById('poster-suggestions-list')!;

        let searchTimer: ReturnType<typeof setTimeout>;
        const doSearch = (query: string) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
                if (query.length < 3) { list.classList.add('hidden'); return; }

                try {
                    let results: any[] = [];

                    if (LOCATIONIQ_API_KEY) {
                        const resp = await fetch(
                            `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query)}&limit=5&dedupe=1&format=json`
                        );
                        if (resp.ok) results = await resp.json();
                    }

                    if (!results || results.length === 0) {
                        const resp = await fetch(
                            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
                        );
                        if (!resp.ok) return;
                        results = await resp.json();
                    }

                    list.innerHTML = '';
                    if (!results || results.length === 0) {
                        list.classList.add('hidden');
                        return;
                    }
                    list.classList.remove('hidden');

                    for (const r of results) {
                        const li = document.createElement('li');
                        li.className = 'px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0';
                        li.textContent = r.display_name;
                        li.addEventListener('click', () => {
                            this.selectedOrigin = [parseFloat(r.lat), parseFloat(r.lon)];
                            this.selectedOriginLabel = r.display_name.split(',')[0];
                            document.getElementById('poster-address-label')!.textContent = this.selectedOriginLabel;
                            input.value = '';
                            list.classList.add('hidden');
                        });
                        list.appendChild(li);
                    }
                } catch { /* ignore search errors */ }
            }, 300);
        };

        input.addEventListener('input', () => doSearch(input.value));

        input.addEventListener('blur', () => {
            setTimeout(() => list.classList.add('hidden'), 200);
        });
    }

    // ── Generate button ────────────────────────────────────────────────────

    private initGenerateButton(): void {
        document.getElementById('poster-generate-btn')!.addEventListener('click', () => {
            this.startGeneration();
        });
    }

    private async startGeneration(): Promise<void> {
        const btn = document.getElementById('poster-generate-btn') as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = 'Rendering...';

        // Show progress, hide old result
        document.getElementById('poster-progress')!.classList.remove('hidden');
        document.getElementById('poster-result')!.classList.add('hidden');

        // Clean up previous blob URL
        if (this.resultUrl) {
            URL.revokeObjectURL(this.resultUrl);
            this.resultUrl = null;
        }

        const config: PosterConfig = {
            city: this.selectedCity,
            origin: this.selectedOrigin,
            originLabel: this.selectedOriginLabel,
            themeId: this.selectedTheme,
            aspectRatio: this.selectedRatio as PosterConfig['aspectRatio'],
            maxTime: parseInt((document.getElementById('poster-max-time') as HTMLSelectElement).value),
            hourOfDay: this.currentHour,
            includeBuses: false,
        };

        // Cancel any previous render
        this.renderer?.cancel();

        this.renderer = new PosterRenderer({
            onProgress: (pct, label) => {
                document.getElementById('poster-progress-pct')!.textContent = `${pct}%`;
                document.getElementById('poster-progress-label')!.textContent = label;
                (document.getElementById('poster-progress-bar') as HTMLElement).style.width = `${pct}%`;
            },
            onComplete: (blob) => {
                this.resultBlob = blob;
                this.resultUrl = URL.createObjectURL(blob);
                (document.getElementById('poster-preview') as HTMLImageElement).src = this.resultUrl;
                document.getElementById('poster-result')!.classList.remove('hidden');
                document.getElementById('poster-progress')!.classList.add('hidden');
                btn.disabled = false;
                btn.textContent = 'Render Poster';

                document.getElementById('poster-download-btn')!.onclick = () => {
                    if (!this.resultUrl) return;
                    trackEvent('poster-download');
                    const a = document.createElement('a');
                    a.href = this.resultUrl;
                    a.download = `transit-topography-${config.city}-${config.themeId}-${config.aspectRatio.replace(':', 'x')}.png`;
                    a.click();
                };
            },
            onError: (msg) => {
                console.error('Poster generation error:', msg);
                btn.disabled = false;
                btn.textContent = 'Render Poster';
                document.getElementById('poster-progress')!.classList.add('hidden');

                // Show error in progress label briefly
                const label = document.getElementById('poster-progress-label')!;
                label.textContent = msg;
                document.getElementById('poster-progress')!.classList.remove('hidden');
                (document.getElementById('poster-progress-bar') as HTMLElement).style.width = '0%';
                document.getElementById('poster-progress-pct')!.textContent = '';
            },
        });

        // Ensure correct city data is loaded
        if (this.selectedCity !== this.currentCityKey) {
            try {
                await this.onCityChangeRequested(this.selectedCity);
                this.currentCityKey = this.selectedCity;
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Render Poster';
                document.getElementById('poster-progress')!.classList.add('hidden');
                return;
            }
        }

        this.renderer.generate(config, this.transitGraph, this.waterMask, this.walkingNetwork);
    }
}
