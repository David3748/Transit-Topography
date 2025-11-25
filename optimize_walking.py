"""
Optimize walking network data for smaller file sizes.

Optimizations:
1. Use index-based references instead of string IDs (saves ~50% of node data)
2. Remove unused 'dist' field from edges (saves ~25% of edge data)
3. Use arrays instead of objects (saves key names)
4. Reduce coordinate precision to 5 decimals (~1m accuracy)
5. Store edges as [fromIdx, toIdx, time] tuples

Format:
{
    "v": 2,  // version
    "nodes": [[lat, lon], [lat, lon], ...],  // index = node id
    "edges": [[fromIdx, toIdx, time], ...]
}
"""

import os
import json
import sys

def optimize_walking_file(input_path, output_path=None):
    """Convert walking JSON to optimized format."""
    if output_path is None:
        output_path = input_path  # Overwrite
    
    print(f"Processing {input_path}...")
    
    with open(input_path, 'r') as f:
        data = json.load(f)
    
    # Check if already optimized
    if data.get('v') == 2:
        print(f"  Already optimized, skipping")
        return
    
    original_size = os.path.getsize(input_path)
    
    # Build ID to index mapping
    id_to_idx = {}
    nodes = []
    
    for i, node in enumerate(data['nodes']):
        id_to_idx[node['id']] = i
        # Round to 5 decimals (~1m precision)
        nodes.append([round(node['lat'], 5), round(node['lon'], 5)])
    
    # Convert edges to index-based, remove 'dist'
    edges = []
    for edge in data['edges']:
        from_idx = id_to_idx.get(edge['from'])
        to_idx = id_to_idx.get(edge['to'])
        
        if from_idx is not None and to_idx is not None:
            # [fromIdx, toIdx, time]
            edges.append([from_idx, to_idx, round(edge['time'], 1)])
    
    optimized = {
        'v': 2,  # Version marker
        'nodes': nodes,
        'edges': edges
    }
    
    # Write with minimal whitespace
    with open(output_path, 'w') as f:
        json.dump(optimized, f, separators=(',', ':'))
    
    new_size = os.path.getsize(output_path)
    reduction = (1 - new_size / original_size) * 100
    
    print(f"  {original_size/1024/1024:.1f} MB -> {new_size/1024/1024:.1f} MB ({reduction:.0f}% reduction)")
    print(f"  {len(nodes)} nodes, {len(edges)} edges")
    
    return new_size


def main():
    transit_dir = 'transit_data'
    
    # Find all walking files
    walking_files = [f for f in os.listdir(transit_dir) if f.startswith('walking_') and f.endswith('.json')]
    
    print(f"Found {len(walking_files)} walking files to optimize\n")
    
    total_before = 0
    total_after = 0
    
    for filename in sorted(walking_files):
        path = os.path.join(transit_dir, filename)
        before = os.path.getsize(path)
        total_before += before
        
        after = optimize_walking_file(path)
        if after:
            total_after += after
        else:
            total_after += before
    
    print(f"\n{'='*50}")
    print(f"Total: {total_before/1024/1024:.1f} MB -> {total_after/1024/1024:.1f} MB")
    print(f"Overall reduction: {(1 - total_after/total_before)*100:.0f}%")


if __name__ == '__main__':
    main()

