import type { OverpassResponse } from '../types';

export class WaterMask {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    polygons: [number, number][][] = [];
    isLoaded: boolean = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }

    async loadWaterData(url: string): Promise<void> {
        try {
            const cacheKey = `water_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data: OverpassResponse | null = null;

            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                        console.log(`Loaded water data from cache`);
                    }
                } catch {
                    console.warn('Water cache parse error');
                }
            }

            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Failed to load water data: ${resp.statusText}`);
                data = await resp.json();

                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch {
                    console.warn('Failed to cache water data (storage full?)');
                }
            }

            this.polygons = [];

            data!.elements.forEach(el => {
                if (el.type === 'way' && el.geometry) {
                    const poly = el.geometry.map(p => [p.lat, p.lon] as [number, number]);
                    this.polygons.push(poly);
                } else if (el.type === 'relation' && el.members) {
                    el.members.forEach(m => {
                        if (m.role === 'outer' && m.geometry) {
                            const poly = m.geometry.map(p => [p.lat, p.lon] as [number, number]);
                            this.polygons.push(poly);
                        }
                    });
                }
            });

            this.isLoaded = true;
            console.log(`Water Mask loaded: ${this.polygons.length} polygons`);
        } catch (err) {
            console.error("Error loading water mask:", err);
            this.isLoaded = false;
        }
    }

    updateCanvas(map: L.Map): void {
        if (!this.isLoaded) return;

        const size = map.getSize();
        if (this.canvas.width !== size.x || this.canvas.height !== size.y) {
            this.canvas.width = size.x;
            this.canvas.height = size.y;
        }

        this.ctx.clearRect(0, 0, size.x, size.y);
        this.ctx.fillStyle = 'black';

        this.polygons.forEach(poly => {
            this.ctx.beginPath();
            let first = true;
            poly.forEach(pt => {
                const point = map.latLngToContainerPoint(pt as unknown as L.LatLngExpression);
                if (first) {
                    this.ctx.moveTo(point.x, point.y);
                    first = false;
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
            this.ctx.closePath();
            this.ctx.fill();
        });
    }
}
