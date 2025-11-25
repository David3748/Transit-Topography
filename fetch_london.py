"""
Fetch London Underground data from TfL API and convert to transit graph format.
TfL API allows anonymous access at 50 requests/minute.
"""

import requests
import json
import time
import os

TFL_API_BASE = "https://api.tfl.gov.uk"
OUTPUT_DIR = "transit_data"

def fetch_tube_lines():
    """Get all tube lines"""
    print("Fetching tube lines...")
    r = requests.get(f"{TFL_API_BASE}/Line/Mode/tube")
    r.raise_for_status()
    return r.json()

def fetch_line_stations(line_id):
    """Get all stations for a specific line"""
    r = requests.get(f"{TFL_API_BASE}/Line/{line_id}/StopPoints")
    r.raise_for_status()
    return r.json()

def fetch_line_route(line_id):
    """Get route sequence for a line"""
    r = requests.get(f"{TFL_API_BASE}/Line/{line_id}/Route/Sequence/all")
    r.raise_for_status()
    return r.json()

def main():
    nodes = {}
    edges = {}
    
    # Get all tube lines
    lines = fetch_tube_lines()
    print(f"Found {len(lines)} tube lines")
    
    for line in lines:
        line_id = line['id']
        line_name = line['name']
        print(f"  Processing {line_name} line...")
        
        time.sleep(0.5)  # Rate limiting
        
        try:
            # Get stations for this line
            stations = fetch_line_stations(line_id)
            
            for station in stations:
                station_id = station['naptanId']
                if station_id not in nodes:
                    nodes[station_id] = {
                        "id": station_id,
                        "lat": round(station['lat'], 5),
                        "lon": round(station['lon'], 5),
                        "name": station['commonName'].replace(' Underground Station', '')
                    }
            
            time.sleep(0.5)  # Rate limiting
            
            # Get route sequence to build edges
            route_data = fetch_line_route(line_id)
            
            for direction in ['orderedLineRoutes', 'stopPointSequences']:
                if direction in route_data:
                    for sequence in route_data[direction]:
                        stop_points = sequence.get('stopPoint', [])
                        for i in range(len(stop_points) - 1):
                            s1 = stop_points[i]
                            s2 = stop_points[i + 1]
                            
                            from_id = s1.get('id') or s1.get('stationId')
                            to_id = s2.get('id') or s2.get('stationId')
                            
                            if from_id and to_id:
                                edge_key = (from_id, to_id)
                                reverse_key = (to_id, from_id)
                                
                                # Average tube travel time between stations is ~2 minutes
                                if edge_key not in edges and reverse_key not in edges:
                                    edges[edge_key] = 120  # 2 minutes in seconds
                                    
        except Exception as e:
            print(f"    Error processing {line_name}: {e}")
            continue
    
    # Also get DLR and Overground for more coverage
    for mode in ['dlr', 'overground', 'elizabeth-line']:
        print(f"  Processing {mode}...")
        time.sleep(0.5)
        
        try:
            r = requests.get(f"{TFL_API_BASE}/Line/Mode/{mode}")
            if r.status_code == 200:
                mode_lines = r.json()
                
                for line in mode_lines:
                    line_id = line['id']
                    time.sleep(0.5)
                    
                    try:
                        stations = fetch_line_stations(line_id)
                        for station in stations:
                            station_id = station['naptanId']
                            if station_id not in nodes:
                                nodes[station_id] = {
                                    "id": station_id,
                                    "lat": round(station['lat'], 5),
                                    "lon": round(station['lon'], 5),
                                    "name": station['commonName'].replace(' Underground Station', '').replace(' DLR Station', '').replace(' Rail Station', '')
                                }
                        
                        time.sleep(0.5)
                        route_data = fetch_line_route(line_id)
                        
                        for direction in ['orderedLineRoutes', 'stopPointSequences']:
                            if direction in route_data:
                                for sequence in route_data[direction]:
                                    stop_points = sequence.get('stopPoint', [])
                                    for i in range(len(stop_points) - 1):
                                        s1 = stop_points[i]
                                        s2 = stop_points[i + 1]
                                        
                                        from_id = s1.get('id') or s1.get('stationId')
                                        to_id = s2.get('id') or s2.get('stationId')
                                        
                                        if from_id and to_id:
                                            edge_key = (from_id, to_id)
                                            reverse_key = (to_id, from_id)
                                            
                                            if edge_key not in edges and reverse_key not in edges:
                                                edges[edge_key] = 120
                    except:
                        continue
        except:
            continue
    
    # Convert edges to list format
    final_edges = []
    for (u, v), weight in edges.items():
        final_edges.append({
            "from": u,
            "to": v,
            "weight": weight
        })
    
    output_data = {
        "nodes": list(nodes.values()),
        "edges": final_edges
    }
    
    # Save the data
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    output_file = os.path.join(OUTPUT_DIR, "london.json")
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"\nSaved {len(nodes)} stations and {len(final_edges)} edges to {output_file}")
    
    # Also fetch water data for London
    fetch_london_water()

def fetch_london_water():
    """Fetch water polygons for London from Overpass API"""
    from shapely.geometry import Polygon, MultiPolygon
    
    print("\nFetching London water data...")
    
    lat, lon = 51.51, -0.13
    delta = 0.25  # Larger area for London
    s, w, n, e = lat - delta, lon - delta, lat + delta, lon + delta
    
    query = f"""
    [out:json][timeout:120];
    (
      way["natural"="water"]({s},{w},{n},{e});
      relation["natural"="water"]({s},{w},{n},{e});
      way["waterway"="riverbank"]({s},{w},{n},{e});
    );
    out geom;
    """
    
    try:
        r = requests.post("https://overpass-api.de/api/interpreter", data=query, timeout=180)
        r.raise_for_status()
        data = r.json()
        
        print(f"  Found {len(data.get('elements', []))} water elements")
        
        output_file = os.path.join(OUTPUT_DIR, "water_london.json")
        with open(output_file, 'w') as f:
            json.dump(data, f)
        
        print(f"  Saved to {output_file}")
        
    except Exception as e:
        print(f"  Error fetching water data: {e}")

if __name__ == "__main__":
    main()

