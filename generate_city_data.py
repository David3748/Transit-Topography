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
        # 3. Filter for Rail/Subway if possible (Optional, but good for performance)
        # Route types: 0=Tram, 1=Subway, 2=Rail. 
        # We might need routes.txt to filter properly.
        if os.path.exists(os.path.join(temp_dir, 'routes.txt')):
            routes_df = pd.read_csv(os.path.join(temp_dir, 'routes.txt'), dtype=str)
            # Convert route_type to int for filtering
            routes_df['route_type'] = pd.to_numeric(routes_df['route_type'], errors='coerce')
            
            # Keep only subway (1) and rail (2) and tram (0) usually
            # But for now, let's keep everything to be safe or filter if it's too huge.
            # For NYC, it's mostly subway. For others, buses might bloat it.
            # Let's filter for Route Type 0, 1, 2 (Rail-based) to keep graph small for now.
            rail_route_ids = routes_df[routes_df['route_type'].isin([0, 1, 2])]['route_id']
            trips_df = trips_df[trips_df['route_id'].isin(rail_route_ids)]
            stop_times_df = stop_times_df[stop_times_df['trip_id'].isin(trips_df['trip_id'])]
            
            # Filter stops to only those in the filtered stop_times
            valid_stop_ids = stop_times_df['stop_id'].unique()
            stops_df = stops_df[stops_df['stop_id'].isin(valid_stop_ids)]

        # Build Graph
        print("Building graph...")
        nodes = {}
        edges = {} # (from, to) -> list of durations

        # 4. Build Nodes
        for _, row in stops_df.iterrows():
            nodes[str(row['stop_id'])] = {
                "id": str(row['stop_id']),
                "lat": round(float(row['stop_lat']), 5),
                "lon": round(float(row['stop_lon']), 5),
                "name": row['stop_name']
            }

        # 5. Build Edges (Connections)
        # We need to connect consecutive stops in a trip.
        
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

        stop_times_df['hour'] = stop_times_df['departure_time'].apply(get_hour)
        
        # Filter stop_times for 16-19 window
        relevant_stop_times = stop_times_df[(stop_times_df['hour'] >= 16) & (stop_times_df['hour'] <= 19)]
        
        if relevant_stop_times.empty:
            print(f"Warning: No trips found between 16:00 and 19:00 for {city_key}. Using all trips.")
            relevant_stop_times = stop_times_df

        # Get relevant trip_ids
        relevant_trip_ids = relevant_stop_times['trip_id'].unique()
        
        # Filter trips
        relevant_trips = trips_df[trips_df['trip_id'].isin(relevant_trip_ids)]

        # Calculate Edges
        # We need to sort stop_times by trip_id and stop_sequence
        # Ensure stop_sequence is int
        stop_times_df['stop_sequence'] = pd.to_numeric(stop_times_df['stop_sequence'])
        relevant_stop_times = relevant_stop_times.sort_values(['trip_id', 'stop_sequence'])
        
        # Group by trip_id
        grouped = relevant_stop_times.groupby('trip_id')

        for trip_id, group in grouped:
            stops = group.to_dict('records')
            for i in range(len(stops) - 1):
                s1 = stops[i]
                s2 = stops[i+1]
                
                from_id = str(s1['stop_id'])
                to_id = str(s2['stop_id'])
                
                # Calculate duration
                try:
                    t1 = time_to_seconds(s1['departure_time'])
                    t2 = time_to_seconds(s2['arrival_time'])
                    duration = t2 - t1
                    
                    if duration is not None and duration > 0 and duration < 7200: # Ignore > 2 hours (likely errors)
                        edge_key = (from_id, to_id)
                        if edge_key not in edges:
                            edges[edge_key] = []
                        edges[edge_key].append(duration)
                except Exception as e:
                    continue

        # Aggregate Edges (Median)
        final_edges = []
        for (u, v), durations in edges.items():
            if durations: # Ensure there are durations to calculate median from
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

        output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
        with open(output_file, 'w') as f:
            json.dump(output_data, f)
        
        print(f"Saved {len(nodes)} nodes and {len(final_edges)} edges to {output_file}")

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
        shutil.rmtree(temp_dir)

def main():
    config = load_config()
    for city_key, city_data in config.items():
        process_city(city_key, city_data)

if __name__ == "__main__":
    main()
