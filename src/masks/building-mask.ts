import type { OverpassResponse } from '../types';

export class BuildingMask {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    polygons: [number, number][][] = [];
    isLoaded: boolean = false;
    enabled: boolean = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }

    async loadBuildingData(url: string): Promise<void> {
        try {
            const cacheKey = `buildings_cache_${url}`;
            const cached = localStorage.getItem(cacheKey);
            let data: OverpassResponse | null = null;

            if (cached) {
                try {
                    const cacheData = JSON.parse(cached);
                    if (Date.now() - cacheData.timestamp < 7 * 24 * 60 * 60 * 1000) {
                        data = cacheData.data;
                    }
                } catch {
                    console.warn('Building cache parse error');
                }
            }

            if (!data) {
                const resp = await fetch(url);
                if (!resp.ok) {
                    console.warn(`Building data not found: ${url}`);
                    this.isLoaded = false;
                    return;
                }
                data = await resp.json();

                try {
                    localStorage.setItem(
                        cacheKey,
                        JSON.stringify({
                            timestamp: Date.now(),
                            data: data,
                        })
                    );
                } catch {
                    console.warn('Buildings too large to cache');
                }
            }

            this.polygons = [];

            data!.elements.forEach(el => {
                if (el.type === 'way' && el.geometry) {
                    const poly = el.geometry.map(p => [p.lat, p.lon] as [number, number]);
                    if (poly.length >= 4) {
                        this.polygons.push(poly);
                    }
                }
            });

            this.isLoaded = true;
        } catch (err) {
            console.warn('Building data not available:', (err as Error).message);
            this.isLoaded = false;
        }
    }

    updateCanvas(map: L.Map): void {
        if (!this.isLoaded || !this.enabled) return;

        const size = map.getSize();
        if (this.canvas.width !== size.x || this.canvas.height !== size.y) {
            this.canvas.width = size.x;
            this.canvas.height = size.y;
        }

        this.ctx.clearRect(0, 0, size.x, size.y);
        this.ctx.fillStyle = 'black';

        const bounds = map.getBounds();
        const north = bounds.getNorth() + 0.01;
        const south = bounds.getSouth() - 0.01;
        const east = bounds.getEast() + 0.01;
        const west = bounds.getWest() - 0.01;

        this.polygons.forEach(poly => {
            const firstPt = poly[0];
            if (
                firstPt[0] < south ||
                firstPt[0] > north ||
                firstPt[1] < west ||
                firstPt[1] > east
            ) {
                const inBounds = poly.some(
                    pt => pt[0] >= south && pt[0] <= north && pt[1] >= west && pt[1] <= east
                );
                if (!inBounds) return;
            }

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
