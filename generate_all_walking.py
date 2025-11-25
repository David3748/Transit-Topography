"""
Generate walking networks for ALL cities in Transit Topography
"""
import json
import requests
import os
import math
import time

OUTPUT_DIR = 'transit_data'

# All cities with their centers and radii
CITIES = {
    # North America
    'nyc': {'center': (40.75, -73.98), 'radius': 0.10},
    'sf': {'center': (37.77, -122.42), 'radius': 0.08},
    'boston': {'center': (42.36, -71.06), 'radius': 0.08},
    'chicago': {'center': (41.88, -87.63), 'radius': 0.10},
    'dc': {'center': (38.90, -77.03), 'radius': 0.08},
    'la': {'center': (34.05, -118.25), 'radius': 0.12},
    'seattle': {'center': (47.61, -122.33), 'radius': 0.08},
    'portland': {'center': (45.52, -122.68), 'radius': 0.08},
    'toronto': {'center': (43.65, -79.38), 'radius': 0.10},
    'montreal': {'center': (45.50, -73.57), 'radius': 0.08},
    'vancouver': {'center': (49.28, -123.12), 'radius': 0.08},
    'philly': {'center': (39.95, -75.17), 'radius': 0.08},
    
    # Europe
    'london': {'center': (51.51, -0.13), 'radius': 0.12},
    'paris': {'center': (48.86, 2.35), 'radius': 0.10},
    'berlin': {'center': (52.52, 13.40), 'radius': 0.10},
    'madrid': {'center': (40.42, -3.70), 'radius': 0.08},
    'barcelona': {'center': (41.39, 2.17), 'radius': 0.08},
    'rome': {'center': (41.90, 12.50), 'radius': 0.08},
    'milan': {'center': (45.46, 9.19), 'radius': 0.08},
    'amsterdam': {'center': (52.37, 4.90), 'radius': 0.06},
    'vienna': {'center': (48.21, 16.37), 'radius': 0.08},
    'prague': {'center': (50.08, 14.44), 'radius': 0.06},
    'stockholm': {'center': (59.33, 18.07), 'radius': 0.08},
    'copenhagen': {'center': (55.68, 12.57), 'radius': 0.06},
    'oslo': {'center': (59.91, 10.75), 'radius': 0.06},
    'helsinki': {'center': (60.17, 24.94), 'radius': 0.06},
    'munich': {'center': (48.14, 11.58), 'radius': 0.08},
    'hamburg': {'center': (53.55, 9.99), 'radius': 0.08},
    'zurich': {'center': (47.38, 8.54), 'radius': 0.06},
    'brussels': {'center': (50.85, 4.35), 'radius': 0.06},
    'lisbon': {'center': (38.72, -9.14), 'radius': 0.06},
    'warsaw': {'center': (52.23, 21.01), 'radius': 0.08},
    'budapest': {'center': (47.50, 19.04), 'radius': 0.08},
    'athens': {'center': (37.98, 23.73), 'radius': 0.06},
    
    # Asia
    'tokyo': {'center': (35.68, 139.76), 'radius': 0.12},
    'osaka': {'center': (34.69, 135.50), 'radius': 0.08},
    'seoul': {'center': (37.57, 126.98), 'radius': 0.10},
    'taipei': {'center': (25.03, 121.57), 'radius': 0.08},
    'singapore': {'center': (1.35, 103.82), 'radius': 0.06},
    'hongkong': {'center': (22.32, 114.17), 'radius': 0.06},
    'beijing': {'center': (39.90, 116.40), 'radius': 0.12},
    'shanghai': {'center': (31.23, 121.47), 'radius': 0.10},
    'delhi': {'center': (28.61, 77.21), 'radius': 0.10},
    'mumbai': {'center': (19.08, 72.88), 'radius': 0.08},
    'bangkok': {'center': (13.76, 100.50), 'radius': 0.08},
    
    # Oceania
    'sydney': {'center': (-33.87, 151.21), 'radius': 0.10},
    'melbourne': {'center': (-37.81, 144.96), 'radius': 0.10},
    
    # South America
    'mexico_city': {'center': (19.43, -99.13), 'radius': 0.10},
    'sao_paulo': {'center': (-23.55, -46.63), 'radius': 0.10},
    'buenos_aires': {'center': (-34.60, -58.38), 'radius': 0.10},
    'santiago': {'center': (-33.45, -70.67), 'radius': 0.08},
}


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def fetch_walking_network(city_key, city_data):
    output_file = os.path.join(OUTPUT_DIR, f"walking_{city_key}.json")
    
    # Skip if already exists
    if os.path.exists(output_file):
        size = os.path.getsize(output_file) / 1024 / 1024
        print(f"  {city_key}: Already exists ({size:.1f} MB), skipping")
        return True
    
    print(f"\n  Fetching {city_key}...")
    
    lat, lon = city_data['center']
    r = city_data['radius']
    s, w, n, e = lat - r, lon - r, lat + r, lon + r
    
    query = f'''
    [out:json][timeout:180];
    (
      way["highway"~"footway|path|pedestrian|steps|living_street|residential|tertiary|secondary|primary|service|cycleway"]({s},{w},{n},{e});
    );
    out body;
    >;
    out skel qt;
    '''
    
    try:
        resp = requests.post('https://overpass-api.de/api/interpreter', data=query, timeout=200)
        if not resp.ok:
            print(f"    Error: {resp.status_code}")
            return False
            
        data = resp.json()
        elements = data.get('elements', [])
        print(f"    Got {len(elements)} elements")
        
        if len(elements) < 100:
            print(f"    Too few elements, skipping")
            return False
        
        # Parse nodes and edges
        nodes = {}
        edges = []
        
        for el in elements:
            if el['type'] == 'node':
                nodes[el['id']] = {
                    'id': str(el['id']),
                    'lat': round(el['lat'], 6),
                    'lon': round(el['lon'], 6)
                }
        
        for el in elements:
            if el['type'] == 'way' and 'nodes' in el:
                way_nodes = el['nodes']
                for i in range(len(way_nodes) - 1):
                    n1_id, n2_id = way_nodes[i], way_nodes[i + 1]
                    if n1_id in nodes and n2_id in nodes:
                        n1, n2 = nodes[n1_id], nodes[n2_id]
                        dist = haversine(n1['lat'], n1['lon'], n2['lat'], n2['lon'])
                        walk_time = dist / 1.3
                        edges.append({'from': str(n1_id), 'to': str(n2_id), 'dist': round(dist, 1), 'time': round(walk_time, 1)})
                        edges.append({'from': str(n2_id), 'to': str(n1_id), 'dist': round(dist, 1), 'time': round(walk_time, 1)})
        
        # Dedupe
        seen = set()
        deduped = []
        for edge in edges:
            key = (edge['from'], edge['to'])
            if key not in seen:
                seen.add(key)
                deduped.append(edge)
        
        nodes_list = list(nodes.values())
        print(f"    Nodes: {len(nodes_list)}, Edges: {len(deduped)}")
        
        with open(output_file, 'w') as f:
            json.dump({'nodes': nodes_list, 'edges': deduped}, f)
        
        size = os.path.getsize(output_file) / 1024 / 1024
        print(f"    Saved ({size:.1f} MB)")
        return True
        
    except Exception as e:
        print(f"    Error: {e}")
        return False


def main():
    print("Generating walking networks for all cities...")
    print("=" * 50)
    
    success = []
    failed = []
    
    for city_key, city_data in CITIES.items():
        result = fetch_walking_network(city_key, city_data)
        if result:
            success.append(city_key)
        else:
            failed.append(city_key)
        
        # Be nice to OSM
        time.sleep(3)
    
    print("\n" + "=" * 50)
    print(f"Success: {len(success)} cities")
    print(f"Failed: {len(failed)} cities: {failed}")
    
    # Print list for updating WALKING_NETWORK_CITIES
    print("\nUpdate WALKING_NETWORK_CITIES to:")
    print(f"const WALKING_NETWORK_CITIES = {success};")


if __name__ == "__main__":
    main()

