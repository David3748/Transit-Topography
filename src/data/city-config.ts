import type { CityConfig } from '../types';

export const WALKING_NETWORK_CITIES = [
    'nyc', 'sf', 'boston', 'chicago', 'dc', 'la',
    'seattle', 'portland', 'philly', 'toronto', 'montreal'
];

export const CITIES: Record<string, CityConfig> = {
    // North America
    'nyc': {
        name: 'New York City', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [40.7527, -73.9772], zoom: 13,
        files: ['transit_data/nyc.json'],
        busFiles: ['transit_data/nyc_bus.json', 'transit_data/nyc_bus_manhattan_bus.json', 'transit_data/nyc_bus_brooklyn_bus.json'],
        water: 'transit_data/water_nyc.json', buildings: 'transit_data/buildings_nyc.json'
    },
    'sf': {
        name: 'San Francisco', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [37.7749, -122.4194], zoom: 12,
        files: ['transit_data/sf.json', 'transit_data/sf_muni.json'],
        busFiles: ['transit_data/sf_bus.json', 'transit_data/sf_muni_bus.json'],
        water: 'transit_data/water_sf.json', buildings: 'transit_data/buildings_sf.json'
    },
    'boston': {
        name: 'Boston', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [42.3601, -71.0589], zoom: 13,
        files: ['transit_data/boston.json'], busFiles: ['transit_data/boston_bus.json'],
        water: 'transit_data/water_boston.json', buildings: 'transit_data/buildings_boston.json'
    },
    'chicago': {
        name: 'Chicago', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [41.8781, -87.6298], zoom: 12,
        files: ['transit_data/chicago.json'], busFiles: ['transit_data/chicago_bus.json'],
        water: 'transit_data/water_chicago.json', buildings: 'transit_data/buildings_chicago.json'
    },
    'dc': {
        name: 'Washington DC', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [38.9072, -77.0369], zoom: 12,
        files: ['transit_data/dc.json'], busFiles: ['transit_data/dc_bus.json'],
        water: 'transit_data/water_dc.json', buildings: 'transit_data/buildings_dc.json'
    },
    'la': {
        name: 'Los Angeles', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [34.0522, -118.2437], zoom: 11,
        files: ['transit_data/la.json'], busFiles: ['transit_data/la_bus.json'],
        water: 'transit_data/water_la.json', buildings: 'transit_data/buildings_la.json'
    },
    'seattle': {
        name: 'Seattle', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [47.6062, -122.3321], zoom: 11,
        files: ['transit_data/seattle.json'], busFiles: ['transit_data/seattle_bus.json'],
        water: 'transit_data/water_seattle.json', buildings: 'transit_data/buildings_seattle.json'
    },
    'portland': {
        name: 'Portland', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [45.5152, -122.6784], zoom: 12,
        files: ['transit_data/portland.json'], busFiles: ['transit_data/portland_bus.json'],
        water: 'transit_data/water_portland.json', buildings: 'transit_data/buildings_portland.json'
    },
    'toronto': {
        name: 'Toronto', flag: '\u{1F1E8}\u{1F1E6}', region: 'north_america',
        center: [43.6532, -79.3832], zoom: 12,
        files: ['transit_data/toronto.json'], busFiles: ['transit_data/toronto_bus.json'],
        water: 'transit_data/water_toronto.json', buildings: 'transit_data/buildings_toronto.json'
    },
    'montreal': {
        name: 'Montreal', flag: '\u{1F1E8}\u{1F1E6}', region: 'north_america',
        center: [45.5017, -73.5673], zoom: 12,
        files: ['transit_data/montreal.json'], busFiles: ['transit_data/montreal_bus.json'],
        water: 'transit_data/water_montreal.json', buildings: 'transit_data/buildings_montreal.json'
    },
    'vancouver': {
        name: 'Vancouver', flag: '\u{1F1E8}\u{1F1E6}', region: 'north_america',
        center: [49.2827, -123.1207], zoom: 12,
        files: ['transit_data/vancouver.json'], busFiles: ['transit_data/vancouver_bus.json'],
        water: 'transit_data/water_vancouver.json', buildings: 'transit_data/buildings_vancouver.json'
    },
    'philly': {
        name: 'Philadelphia', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [39.9526, -75.1652], zoom: 12,
        files: ['transit_data/philly.json'], busFiles: ['transit_data/philly_bus.json'],
        water: 'transit_data/water_philly.json', buildings: 'transit_data/buildings_philly.json'
    },
    'atlanta': {
        name: 'Atlanta', flag: '\u{1F1FA}\u{1F1F8}', region: 'north_america',
        center: [33.7490, -84.3880], zoom: 11,
        files: ['transit_data/atlanta.json'], busFiles: ['transit_data/atlanta_bus.json'],
        water: 'transit_data/water_atlanta.json', buildings: 'transit_data/buildings_atlanta.json'
    },
    'mexico_city': {
        name: 'Mexico City', flag: '\u{1F1F2}\u{1F1FD}', region: 'north_america',
        center: [19.4326, -99.1332], zoom: 12,
        files: ['transit_data/mexico_city.json'], busFiles: ['transit_data/mexico_city_bus.json'],
        water: 'transit_data/water_mexico_city.json', buildings: 'transit_data/buildings_mexico_city.json'
    },
    // Europe
    'london': {
        name: 'London', flag: '\u{1F1EC}\u{1F1E7}', region: 'europe',
        center: [51.5074, -0.1278], zoom: 11,
        files: ['transit_data/london.json'], busFiles: [],
        water: 'transit_data/water_london.json', buildings: 'transit_data/buildings_london.json'
    },
    'paris': {
        name: 'Paris', flag: '\u{1F1EB}\u{1F1F7}', region: 'europe',
        center: [48.8566, 2.3522], zoom: 12,
        files: ['transit_data/paris.json'], busFiles: ['transit_data/paris_bus.json'],
        water: 'transit_data/water_paris.json', buildings: 'transit_data/buildings_paris.json'
    },
    'berlin': {
        name: 'Berlin', flag: '\u{1F1E9}\u{1F1EA}', region: 'europe',
        center: [52.5200, 13.4050], zoom: 11,
        files: ['transit_data/berlin.json'], busFiles: ['transit_data/berlin_bus.json'],
        water: 'transit_data/water_berlin.json', buildings: 'transit_data/buildings_berlin.json'
    },
    'amsterdam': {
        name: 'Amsterdam', flag: '\u{1F1F3}\u{1F1F1}', region: 'europe',
        center: [52.3676, 4.9041], zoom: 12,
        files: ['transit_data/amsterdam.json'], busFiles: ['transit_data/amsterdam_bus.json'],
        water: 'transit_data/water_amsterdam.json', buildings: 'transit_data/buildings_amsterdam.json'
    },
    'copenhagen': {
        name: 'Copenhagen', flag: '\u{1F1E9}\u{1F1F0}', region: 'europe',
        center: [55.6761, 12.5683], zoom: 12,
        files: ['transit_data/copenhagen.json'], busFiles: ['transit_data/copenhagen_bus.json'],
        water: 'transit_data/water_copenhagen.json', buildings: 'transit_data/buildings_copenhagen.json'
    },
    'madrid': {
        name: 'Madrid', flag: '\u{1F1EA}\u{1F1F8}', region: 'europe',
        center: [40.4168, -3.7038], zoom: 12,
        files: ['transit_data/madrid.json'], busFiles: ['transit_data/madrid_bus.json'],
        water: 'transit_data/water_madrid.json', buildings: 'transit_data/buildings_madrid.json'
    },
    'barcelona': {
        name: 'Barcelona', flag: '\u{1F1EA}\u{1F1F8}', region: 'europe',
        center: [41.3851, 2.1734], zoom: 12,
        files: ['transit_data/barcelona.json'], busFiles: ['transit_data/barcelona_bus.json'],
        water: 'transit_data/water_barcelona.json', buildings: 'transit_data/buildings_barcelona.json'
    },
    'vienna': {
        name: 'Vienna', flag: '\u{1F1E6}\u{1F1F9}', region: 'europe',
        center: [48.2082, 16.3738], zoom: 12,
        files: ['transit_data/vienna.json'], busFiles: ['transit_data/vienna_bus.json'],
        water: 'transit_data/water_vienna.json', buildings: 'transit_data/buildings_vienna.json'
    },
    'stockholm': {
        name: 'Stockholm', flag: '\u{1F1F8}\u{1F1EA}', region: 'europe',
        center: [59.3293, 18.0686], zoom: 12,
        files: ['transit_data/stockholm.json'], busFiles: ['transit_data/stockholm_bus.json'],
        water: 'transit_data/water_stockholm.json', buildings: 'transit_data/buildings_stockholm.json'
    },
    'munich': {
        name: 'Munich', flag: '\u{1F1E9}\u{1F1EA}', region: 'europe',
        center: [48.1351, 11.5820], zoom: 12,
        files: ['transit_data/munich.json'], busFiles: ['transit_data/munich_bus.json'],
        water: 'transit_data/water_munich.json', buildings: 'transit_data/buildings_munich.json'
    },
    'oslo': {
        name: 'Oslo', flag: '\u{1F1F3}\u{1F1F4}', region: 'europe',
        center: [59.9139, 10.7522], zoom: 12,
        files: ['transit_data/oslo.json'], busFiles: ['transit_data/oslo_bus.json'],
        water: 'transit_data/water_oslo.json', buildings: 'transit_data/buildings_oslo.json'
    },
    'helsinki': {
        name: 'Helsinki', flag: '\u{1F1EB}\u{1F1EE}', region: 'europe',
        center: [60.1699, 24.9384], zoom: 12,
        files: ['transit_data/helsinki.json'], busFiles: ['transit_data/helsinki_bus.json'],
        water: 'transit_data/water_helsinki.json', buildings: 'transit_data/buildings_helsinki.json'
    },
    'prague': {
        name: 'Prague', flag: '\u{1F1E8}\u{1F1FF}', region: 'europe',
        center: [50.0755, 14.4378], zoom: 12,
        files: ['transit_data/prague.json'], busFiles: ['transit_data/prague_bus.json'],
        water: 'transit_data/water_prague.json', buildings: 'transit_data/buildings_prague.json'
    },
    // Asia-Pacific
    'hong_kong': {
        name: 'Hong Kong', flag: '\u{1F1ED}\u{1F1F0}', region: 'asia_pacific',
        center: [22.3193, 114.1694], zoom: 12,
        files: ['transit_data/hong_kong.json'], busFiles: ['transit_data/hong_kong_bus.json'],
        water: 'transit_data/water_hong_kong.json', buildings: 'transit_data/buildings_hong_kong.json'
    },
    'singapore': {
        name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}', region: 'asia_pacific',
        center: [1.3521, 103.8198], zoom: 12,
        files: ['transit_data/singapore.json'], busFiles: ['transit_data/singapore_bus.json'],
        water: 'transit_data/water_singapore.json', buildings: 'transit_data/buildings_singapore.json'
    },
    'sydney': {
        name: 'Sydney', flag: '\u{1F1E6}\u{1F1FA}', region: 'asia_pacific',
        center: [-33.8688, 151.2093], zoom: 12,
        files: ['transit_data/sydney.json'], busFiles: ['transit_data/sydney_bus.json'],
        water: 'transit_data/water_sydney.json', buildings: 'transit_data/buildings_sydney.json'
    },
    'melbourne': {
        name: 'Melbourne', flag: '\u{1F1E6}\u{1F1FA}', region: 'asia_pacific',
        center: [-37.8136, 144.9631], zoom: 12,
        files: ['transit_data/melbourne.json'], busFiles: ['transit_data/melbourne_bus.json'],
        water: 'transit_data/water_melbourne.json', buildings: 'transit_data/buildings_melbourne.json'
    },
    // South America
    'sao_paulo': {
        name: 'S\u00E3o Paulo', flag: '\u{1F1E7}\u{1F1F7}', region: 'south_america',
        center: [-23.5505, -46.6333], zoom: 12,
        files: ['transit_data/sao_paulo.json'], busFiles: ['transit_data/sao_paulo_bus.json'],
        water: 'transit_data/water_sao_paulo.json', buildings: 'transit_data/buildings_sao_paulo.json'
    }
};

export const REGION_LABELS: Record<string, string> = {
    'north_america': 'North America',
    'europe': 'Europe',
    'asia_pacific': 'Asia-Pacific',
    'south_america': 'South America'
};

export const WALK_SPEED_MPS = 1.3;
export const TRANSFER_PENALTY_SEC = 300;

export const TILE_URLS = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
