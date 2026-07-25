/**
 * Poster theme definitions — 8 artistic color palettes for transit isochrone posters.
 * Each theme is a plain serializable object (no methods) so it can be passed to a Web Worker.
 */

export interface PosterTheme {
    id: string;
    name: string;
    /** [bg, accent1, accent2] for UI swatch preview */
    previewColors: [string, string, string];

    /** Background fill */
    background: { type: 'solid'; color: string } | { type: 'radial'; inner: string; outer: string };

    /** 8 isochrone band colors from nearest → farthest */
    bands: string[];
    bandOpacity: number;

    waterColor: string | null;
    streetColor: string;
    streetOpacity: number;

    railLineColor: string;
    busLineColor: string;
    lineOpacity: number;

    railStationColor: string;
    busStationColor: string;
    stationRadius: number;

    vignetteIntensity: number;

    titleColor: string;
    subtitleColor: string;
    brandColor: string;
    titleFont: string;
}

export const POSTER_THEMES: Record<string, PosterTheme> = {
    noir: {
        id: 'noir',
        name: 'Noir',
        previewColors: ['#0a0a0a', '#ffffff', '#555555'],
        background: { type: 'radial', inner: '#1a1a1a', outer: '#000000' },
        bands: [
            '#ffffff',
            '#dedede',
            '#b8b8b8',
            '#909090',
            '#686868',
            '#484848',
            '#2a2a2a',
            '#181818',
        ],
        bandOpacity: 0.85,
        waterColor: '#050510',
        streetColor: '#333333',
        streetOpacity: 0.12,
        railLineColor: '#ffffff',
        busLineColor: '#888888',
        lineOpacity: 0.4,
        railStationColor: '#ffffff',
        busStationColor: '#999999',
        stationRadius: 3,
        vignetteIntensity: 0.7,
        titleColor: '#ffffff',
        subtitleColor: '#888888',
        brandColor: '#555555',
        titleFont: 'Inter',
    },
    blueprint: {
        id: 'blueprint',
        name: 'Blueprint',
        previewColors: ['#0a1628', '#67d4ff', '#2a6496'],
        background: { type: 'radial', inner: '#0f2440', outer: '#060e1c' },
        bands: [
            '#e0f4ff',
            '#a8e0ff',
            '#67c8ff',
            '#38a8e0',
            '#1a88c0',
            '#0e6898',
            '#064870',
            '#032840',
        ],
        bandOpacity: 0.8,
        waterColor: '#040c18',
        streetColor: '#1a4060',
        streetOpacity: 0.15,
        railLineColor: '#67d4ff',
        busLineColor: '#2a6496',
        lineOpacity: 0.5,
        railStationColor: '#a8e0ff',
        busStationColor: '#2a6496',
        stationRadius: 3,
        vignetteIntensity: 0.6,
        titleColor: '#e0f4ff',
        subtitleColor: '#67a0c0',
        brandColor: '#2a5080',
        titleFont: 'Inter',
    },
    neon: {
        id: 'neon',
        name: 'Neon',
        previewColors: ['#0d0d1a', '#ff2afc', '#00e5ff'],
        background: { type: 'radial', inner: '#14102a', outer: '#080610' },
        bands: [
            '#ff2afc',
            '#e040d0',
            '#b850e8',
            '#8060ff',
            '#5080ff',
            '#30b0ff',
            '#10d8e0',
            '#00ffcc',
        ],
        bandOpacity: 0.75,
        waterColor: '#06040e',
        streetColor: '#2a1848',
        streetOpacity: 0.15,
        railLineColor: '#ff2afc',
        busLineColor: '#6040a0',
        lineOpacity: 0.5,
        railStationColor: '#00e5ff',
        busStationColor: '#8060c0',
        stationRadius: 3,
        vignetteIntensity: 0.75,
        titleColor: '#00e5ff',
        subtitleColor: '#9070c0',
        brandColor: '#4a3070',
        titleFont: 'Inter',
    },
    ink_wash: {
        id: 'ink_wash',
        name: 'Ink Wash',
        previewColors: ['#f5f0e8', '#4a6078', '#8090a0'],
        background: { type: 'solid', color: '#f5f0e8' },
        bands: [
            '#2a3848',
            '#3a4c60',
            '#4a6078',
            '#607890',
            '#7890a8',
            '#90a8b8',
            '#b0c0cc',
            '#d0d8e0',
        ],
        bandOpacity: 0.6,
        waterColor: '#d8dce0',
        streetColor: '#a8a098',
        streetOpacity: 0.1,
        railLineColor: '#3a4860',
        busLineColor: '#8890a0',
        lineOpacity: 0.35,
        railStationColor: '#2a3848',
        busStationColor: '#7880a0',
        stationRadius: 2.5,
        vignetteIntensity: 0.3,
        titleColor: '#2a3040',
        subtitleColor: '#687888',
        brandColor: '#a0a8b0',
        titleFont: 'Inter',
    },
    sunset: {
        id: 'sunset',
        name: 'Sunset',
        previewColors: ['#1a0a0a', '#ff6830', '#c03060'],
        background: { type: 'radial', inner: '#2a1010', outer: '#100505' },
        bands: [
            '#ffe040',
            '#ffc020',
            '#ff9020',
            '#ff6830',
            '#e84830',
            '#c03060',
            '#882868',
            '#502060',
        ],
        bandOpacity: 0.8,
        waterColor: '#0a0408',
        streetColor: '#3a2020',
        streetOpacity: 0.12,
        railLineColor: '#ff8040',
        busLineColor: '#884040',
        lineOpacity: 0.45,
        railStationColor: '#ffc040',
        busStationColor: '#a06050',
        stationRadius: 3,
        vignetteIntensity: 0.7,
        titleColor: '#ffe0a0',
        subtitleColor: '#c08060',
        brandColor: '#704030',
        titleFont: 'Inter',
    },
    ocean: {
        id: 'ocean',
        name: 'Ocean',
        previewColors: ['#0a1a2e', '#20e8c8', '#1080a0'],
        background: { type: 'radial', inner: '#0e2840', outer: '#040e18' },
        bands: [
            '#e0fff8',
            '#a0f0e0',
            '#60e0c8',
            '#30c8b0',
            '#18a898',
            '#0e8880',
            '#066858',
            '#034838',
        ],
        bandOpacity: 0.78,
        waterColor: '#030a12',
        streetColor: '#184050',
        streetOpacity: 0.12,
        railLineColor: '#40e8d0',
        busLineColor: '#186868',
        lineOpacity: 0.45,
        railStationColor: '#80fff0',
        busStationColor: '#308888',
        stationRadius: 3,
        vignetteIntensity: 0.65,
        titleColor: '#c0fff0',
        subtitleColor: '#5098a0',
        brandColor: '#285868',
        titleFont: 'Inter',
    },
    forest: {
        id: 'forest',
        name: 'Forest',
        previewColors: ['#0a1a0a', '#80e840', '#308820'],
        background: { type: 'radial', inner: '#102810', outer: '#060e06' },
        bands: [
            '#e0ffc0',
            '#b0f070',
            '#80e840',
            '#58c828',
            '#38a818',
            '#288810',
            '#186808',
            '#0e4804',
        ],
        bandOpacity: 0.78,
        waterColor: '#040a06',
        streetColor: '#1a3818',
        streetOpacity: 0.12,
        railLineColor: '#80e840',
        busLineColor: '#306828',
        lineOpacity: 0.45,
        railStationColor: '#b0ff70',
        busStationColor: '#408830',
        stationRadius: 3,
        vignetteIntensity: 0.65,
        titleColor: '#c0ffa0',
        subtitleColor: '#6aa850',
        brandColor: '#2a5820',
        titleFont: 'Inter',
    },
    copper: {
        id: 'copper',
        name: 'Copper',
        previewColors: ['#1a1410', '#d8884a', '#4a8880'],
        background: { type: 'radial', inner: '#241c14', outer: '#0e0a06' },
        bands: [
            '#f0c880',
            '#d8a860',
            '#d08848',
            '#b87038',
            '#986030',
            '#785838',
            '#587060',
            '#4a8880',
        ],
        bandOpacity: 0.8,
        waterColor: '#080604',
        streetColor: '#38302a',
        streetOpacity: 0.12,
        railLineColor: '#d8884a',
        busLineColor: '#786050',
        lineOpacity: 0.4,
        railStationColor: '#f0c880',
        busStationColor: '#887060',
        stationRadius: 3,
        vignetteIntensity: 0.65,
        titleColor: '#f0d0a0',
        subtitleColor: '#a08868',
        brandColor: '#605040',
        titleFont: 'Inter',
    },
};

export function getTheme(id: string): PosterTheme {
    return POSTER_THEMES[id] || POSTER_THEMES.noir;
}
