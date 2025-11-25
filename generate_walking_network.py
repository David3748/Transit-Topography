"""
Generate walkable street network data for Transit Topography.
This fetches pedestrian-accessible paths from OpenStreetMap and creates a graph for walking routing.
"""

import os
import json
import requests
import time

OUTPUT_DIR = 'transit_data'

# City centers and bounding boxes
CITIES = {
    'nyc': {
        'name': 'New York City',
        'center': (40.75, -73.98),
        'radius': 0.15  # ~15km
    },
    'sf': {
        'name': 'San Francisco',
        'center': (37.77, -122.42),
        'radius': 0.12
    },
    'boston': {
        'name': 'Boston',
        'center': (42.36, -71.06),
        'radius': 0.10
    },
    'chicago': {
        'name': 'Chicago',
        'center': (41.88, -87.63),
        'radius': 0.15
    },
    'dc': {
        'name': 'Washington DC',
        'center': (38.90, -77.03),
        'radius': 0.10
    },
    'la': {
        'name': 'Los Angeles',
        'center': (34.05, -118.25),
        'radius': 0.20
    },
    'seattle': {
        'name': 'Seattle',
        'center': (47.61, -122.33),
        'radius': 0.12
    },
    'portland': {
        'name': 'Portland',
        'center': (45.52, -122.68),
        'radius': 0.10
    },
    'philadelphia': {
        'name': 'Philadelphia',
        'center': (39.95, -75.17),
        'radius': 0.12
    },
    'toronto': {
        'name': 'Toronto',
        'center': (43.65, -79.38),
        'radius': 0.15
    }
}


def fetch_walking_network(city_key, city_data):
    """Fetch walkable streets/paths from OpenStreetMap"""
    print(f"\nFetching walking network for {city_data['name']}...")
    
    lat, lon = city_data['center']
    r = city_data['radius']
    s, w, n, e = lat - r, lon - r, lat + r, lon + r
    
    # Query for walkable ways:
    # - footway, path, pedestrian, steps (always walkable)
    # - residential, tertiary, secondary, primary (usually have sidewalks)
    # - living_street, service (walkable)
    # - cycleway (often shared with pedestrians)
    query = f"""
    [out:json][timeout:180];
    (
      way["highway"~"footway|path|pedestrian|steps|living_street|residential|tertiary|secondary|primary|trunk|service|cycleway|track|unclassified"]({s},{w},{n},{e});
    );
    out body;
    >;
    out skel qt;
    """
    
    try:
        print(f"  Querying OSM (bbox: {s:.2f},{w:.2f},{n:.2f},{e:.2f})...")
        resp = requests.post(
            "https://overpass-api.de/api/interpreter",
            data=query,
            timeout=200
        )
        resp.raise_for_status()
        data = resp.json()
        
        elements = data.get('elements', [])
        print(f"  Received {len(elements)} elements")
        
        # Parse into nodes and edges
        nodes = {}  # id -> {lat, lon}
        edges = []  # [{from, to, distance}]
        
        # First pass: collect all nodes
        for el in elements:
            if el['type'] == 'node':
                nodes[el['id']] = {
                    'id': str(el['id']),
                    'lat': round(el['lat'], 6),
                    'lon': round(el['lon'], 6)
                }
        
        # Second pass: create edges from ways
        way_count = 0
        for el in elements:
            if el['type'] == 'way' and 'nodes' in el:
                way_nodes = el['nodes']
                highway_type = el.get('tags', {}).get('highway', '')
                
                # Determine walking speed based on road type
                # Footpaths are faster (no traffic), big roads slower (crossings)
                if highway_type in ['footway', 'path', 'pedestrian', 'living_street']:
                    speed_factor = 1.0  # Full walking speed
                elif highway_type in ['steps']:
                    speed_factor = 0.5  # Slower on stairs
                elif highway_type in ['residential', 'service', 'cycleway', 'track']:
                    speed_factor = 0.9
                else:  # Major roads
                    speed_factor = 0.8  # Slower due to crossings/traffic
                
                # Create edges between consecutive nodes
                for i in range(len(way_nodes) - 1):
                    n1_id = way_nodes[i]
                    n2_id = way_nodes[i + 1]
                    
                    if n1_id in nodes and n2_id in nodes:
                        n1 = nodes[n1_id]
                        n2 = nodes[n2_id]
                        
                        # Calculate distance
                        dist = haversine(n1['lat'], n1['lon'], n2['lat'], n2['lon'])
                        
                        # Walking time in seconds (1.3 m/s base speed)
                        walk_time = dist / (1.3 * speed_factor)
                        
                        edges.append({
                            'from': str(n1_id),
                            'to': str(n2_id),
                            'dist': round(dist, 1),
                            'time': round(walk_time, 1)
                        })
                        # Bidirectional
                        edges.append({
                            'from': str(n2_id),
                            'to': str(n1_id),
                            'dist': round(dist, 1),
                            'time': round(walk_time, 1)
                        })
                
                way_count += 1
        
        print(f"  Processed {way_count} ways")
        
        # Simplify: remove nodes with only 2 connections (merge edges)
        # This reduces graph size significantly
        nodes_list = list(nodes.values())
        
        # Build adjacency for simplification
        adj = {}
        for e in edges:
            if e['from'] not in adj:
                adj[e['from']] = []
            adj[e['from']].append(e)
        
        # Find nodes to keep (intersections, endpoints, every Nth node for density)
        keep_nodes = set()
        for node_id, neighbors in adj.items():
            # Keep if intersection (3+ connections) or endpoint (1 connection)
            unique_neighbors = set(e['to'] for e in neighbors)
            if len(unique_neighbors) != 2:
                keep_nodes.add(node_id)
        
        # Also keep every ~50th node to maintain some density
        all_node_ids = list(nodes.keys())
        for i, nid in enumerate(all_node_ids):
            if i % 50 == 0:
                keep_nodes.add(str(nid))
        
        # DON'T simplify - keep all nodes and edges for proper connectivity
        # The simplification was breaking edge connections
        filtered_nodes = nodes_list
        
        # Deduplicate edges
        filtered_edges = []
        seen_edges = set()
        for e in edges:
            edge_key = tuple(sorted([e['from'], e['to']]))
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                filtered_edges.append(e)
        
        print(f"  Final: {len(filtered_nodes)} nodes, {len(filtered_edges)} edges")
        
        # Save
        output = {
            'nodes': filtered_nodes,
            'edges': filtered_edges
        }
        
        if not os.path.exists(OUTPUT_DIR):
            os.makedirs(OUTPUT_DIR)
        
        output_file = os.path.join(OUTPUT_DIR, f"walking_{city_key}.json")
        with open(output_file, 'w') as f:
            json.dump(output, f)
        
        file_size = os.path.getsize(output_file) / 1024
        print(f"  Saved to {output_file} ({file_size:.1f} KB)")
        
        return True
        
    except Exception as e:
        print(f"  Error: {e}")
        return False


def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two points"""
    import math
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def main():
    print("=" * 60)
    print("Walking Network Generator for Transit Topography")
    print("=" * 60)
    
    for city_key, city_data in CITIES.items():
        success = fetch_walking_network(city_key, city_data)
        if success:
            # Be nice to OSM servers
            print("  Waiting 5 seconds before next request...")
            time.sleep(5)
        else:
            print(f"  Skipping {city_key} due to error")
    
    print("\n" + "=" * 60)
    print("Done!")


if __name__ == "__main__":
    main()

