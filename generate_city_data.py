import os
import json
import requests
import zipfile
import io
import pandas as pd
import math
import shutil

import traceback

CONFIG_FILE = 'cities_config.json'
OUTPUT_DIR = 'transit_data'

def load_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def download_and_extract_gtfs(url, extract_path):
    print(f"Downloading GTFS from {url}...")
    try:
        r = requests.get(url)
        r.raise_for_status()
        z = zipfile.ZipFile(io.BytesIO(r.content))
        z.extractall(extract_path)
        print("Download and extraction complete.")
        return True
    except Exception as e:
        print(f"Error downloading GTFS: {e}")
        return False

def process_city(city_key, city_data):
    print(f"Processing {city_data['name']} ({city_key})...")
    
    temp_dir = f"temp_{city_key}"
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    
    # Helper to parse time (HH:MM:SS) to seconds
    def time_to_seconds(t_str):
        try:
            h, m, s = map(int, t_str.split(':'))
            return h * 3600 + m * 60 + s
        except:
            return -1

    def get_hour(t):
        try:
            return int(t.split(':')[0])
        except:
            return -1

    # 1. Download GTFS
    if not download_and_extract_gtfs(city_data['gtfs_url'], temp_dir):
        return

    try:
        # 2. Load DataFrames
        stops_df = pd.read_csv(os.path.join(temp_dir, 'stops.txt'), dtype=str)
        stop_times_df = pd.read_csv(os.path.join(temp_dir, 'stop_times.txt'), dtype=str)
        trips_df = pd.read_csv(os.path.join(temp_dir, 'trips.txt'), dtype=str)

        # 3. Filter for Rail/Subway if possible (Optional, but good for performance)
        # Route types: 0=Tram, 1=Subway, 2=Rail. 
        # We might need routes.txt to filter properly.
        # 3. Load Routes and Filter
        if os.path.exists(os.path.join(temp_dir, 'routes.txt')):
            routes_df = pd.read_csv(os.path.join(temp_dir, 'routes.txt'), dtype=str)
            routes_df['route_type'] = pd.to_numeric(routes_df['route_type'], errors='coerce')
            
            # Define categories
            categories = [
                {"name": "rail", "types": [0, 1, 2], "suffix": ""},
                {"name": "bus", "types": [3], "suffix": "_bus"}
            ]
            
            for cat in categories:
                print(f"  Processing {cat['name']}...")
                target_route_ids = routes_df[routes_df['route_type'].isin(cat['types'])]['route_id']
                
                if target_route_ids.empty:
                    print(f"  No {cat['name']} routes found.")
                    continue
                    
                cat_trips_df = trips_df[trips_df['route_id'].isin(target_route_ids)]
                cat_stop_times_df = stop_times_df[stop_times_df['trip_id'].isin(cat_trips_df['trip_id'])]
                
                valid_stop_ids = cat_stop_times_df['stop_id'].unique()
                cat_stops_df = stops_df[stops_df['stop_id'].isin(valid_stop_ids)]
                
                # Build Graph for this category
                nodes = {}
                edges = {} 

                # Build Nodes
                for _, row in cat_stops_df.iterrows():
                    nodes[str(row['stop_id'])] = {
                        "id": str(row['stop_id']),
                        "lat": round(float(row['stop_lat']), 5),
                        "lon": round(float(row['stop_lon']), 5),
                        "name": row['stop_name']
                    }

                # Build Edges
                cat_stop_times_df['hour'] = cat_stop_times_df['departure_time'].apply(get_hour)
                relevant_stop_times = cat_stop_times_df[(cat_stop_times_df['hour'] >= 16) & (cat_stop_times_df['hour'] <= 19)]
                
                if relevant_stop_times.empty:
                    relevant_stop_times = cat_stop_times_df

                # Ensure stop_sequence is int
                relevant_stop_times['stop_sequence'] = pd.to_numeric(relevant_stop_times['stop_sequence'])
                relevant_stop_times = relevant_stop_times.sort_values(['trip_id', 'stop_sequence'])
                
                grouped = relevant_stop_times.groupby('trip_id')

                for trip_id, group in grouped:
                    stops = group.to_dict('records')
                    for i in range(len(stops) - 1):
                        s1 = stops[i]
                        s2 = stops[i+1]
                        
                        from_id = str(s1['stop_id'])
                        to_id = str(s2['stop_id'])
                        
                        try:
                            t1 = time_to_seconds(s1['departure_time'])
                            t2 = time_to_seconds(s2['arrival_time'])
                            duration = t2 - t1
                            
                            if duration is not None and duration > 0 and duration < 7200:
                                edge_key = (from_id, to_id)
                                if edge_key not in edges:
                                    edges[edge_key] = []
                                edges[edge_key].append(duration)
                        except:
                            continue

                # Aggregate Edges
                final_edges = []
                for (u, v), durations in edges.items():
                    if durations:
                        median_duration = sorted(durations)[len(durations) // 2]
                        final_edges.append({
                            "from": u,
                            "to": v,
                            "weight": median_duration
                        })

                # Output
                output_data = {
                    "nodes": list(nodes.values()),
                    "edges": final_edges
                }

                if not os.path.exists(OUTPUT_DIR):
                    os.makedirs(OUTPUT_DIR)

                output_file = os.path.join(OUTPUT_DIR, f"{city_key}{cat['suffix']}.json")
                with open(output_file, 'w') as f:
                    json.dump(output_data, f)
                
                print(f"  Saved {len(nodes)} nodes and {len(final_edges)} edges to {output_file}")

        # 6. Fetch Water Polygons
        fetch_water_polygons(city_key, city_data)

    except Exception as e:
        print(f"Error processing {city_key}: {e}")
        traceback.print_exc()
        # Debug prints
        try:
            print("Columns in stops.txt:", pd.read_csv(os.path.join(temp_dir, 'stops.txt')).columns.tolist())
            print("Columns in stop_times.txt:", pd.read_csv(os.path.join(temp_dir, 'stop_times.txt')).columns.tolist())
            print("Columns in trips.txt:", pd.read_csv(os.path.join(temp_dir, 'trips.txt')).columns.tolist())
        except:
            print("Could not read files for debug.")
    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def fetch_water_polygons(city_key, city_data):
    print(f"Fetching water polygons for {city_key}...")
    
    # Define bounds (approximate, or use a large box around the city center)
    # We can use the city center from config or hardcode a box for now.
    # Ideally, we should use the bounds of the transit network we just built, 
    # but we don't have that easily accessible here without re-reading.
    # Let's use a fixed large box around the center for simplicity.
    
    # Config doesn't have center in python script yet, it's in JS.
    # Let's add centers to cities_config.json or just hardcode for now.
    # Actually, let's look at cities_config.json
    
    # For now, let's use a generous box.
    # NYC: 40.75, -73.98
    centers = {
        'nyc': (40.75, -73.98),
        'sf': (37.77, -122.42),
        'boston': (42.36, -71.06),
        'chicago': (41.88, -87.63)
    }
    
    if city_key not in centers:
        print(f"Skipping water fetch for {city_key} (no center defined)")
        return

    lat, lon = centers[city_key]
    delta = 0.2 # +/- degrees (~20km)
    s, w, n, e = lat - delta, lon - delta, lat + delta, lon + delta
    
    query = f"""
    [out:json][timeout:60];
    (
      way["natural"="water"]({s},{w},{n},{e});
      relation["natural"="water"]({s},{w},{n},{e});
      way["waterway"="riverbank"]({s},{w},{n},{e});
      relation["waterway"="riverbank"]({s},{w},{n},{e});
      way["place"="ocean"]({s},{w},{n},{e}); 
    );
    out geom;
    """
    
    try:
        r = requests.post("https://overpass-api.de/api/interpreter", data=query)
        r.raise_for_status()
        data = r.json()
        
        # Save as GeoJSON-like structure or just raw Overpass JSON
        # Raw Overpass JSON is easier to parse if we keep logic in JS
        # But we want to simplify? 
        # Let's just save the raw JSON for now, the JS can handle it.
        
        output_file = os.path.join(OUTPUT_DIR, f"water_{city_key}.json")
        with open(output_file, 'w') as f:
            json.dump(data, f)
            
        print(f"Saved water data to {output_file} ({len(data.get('elements', []))} elements)")
        
    except Exception as e:
        print(f"Error fetching water for {city_key}: {e}")

def main():
    config = load_config()
    for city_key, city_data in config.items():
        process_city(city_key, city_data)

if __name__ == "__main__":
    main()
