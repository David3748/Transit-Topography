import { CITIES, WALKING_NETWORK_CITIES } from './city-config';
import type { CityConfig } from '../types';

export interface CityManifestEntry {
    id: string;
    name: string;
    flag: string;
    region: string;
    center: [number, number];
    zoom: number;
    transitFiles: string[];
    busFiles: string[];
    waterFile: string | null;
    buildingFile: string | null;
    walkingFile: string | null;
    features: {
        bus: boolean;
        water: boolean;
        buildings: boolean;
        walking: boolean;
    };
}

function createEntry(id: string, city: CityConfig): CityManifestEntry {
    const walking = WALKING_NETWORK_CITIES.includes(id);

    return {
        id,
        name: city.name,
        flag: city.flag,
        region: city.region,
        center: city.center,
        zoom: city.zoom,
        transitFiles: city.files,
        busFiles: city.busFiles ?? [],
        waterFile: city.water ?? null,
        buildingFile: city.buildings ?? null,
        walkingFile: walking ? `transit_data/walking_${id}.json` : null,
        features: {
            bus: (city.busFiles?.length ?? 0) > 0,
            water: Boolean(city.water),
            buildings: Boolean(city.buildings),
            walking
        }
    };
}

export const CITY_MANIFEST: Record<string, CityManifestEntry> = Object.fromEntries(
    Object.entries(CITIES).map(([id, city]) => [id, createEntry(id, city)])
);

export const PUBLISHED_CITY_COUNT = Object.keys(CITY_MANIFEST).length;

export function getCityManifest(cityId: string): CityManifestEntry | null {
    return CITY_MANIFEST[cityId] ?? null;
}
