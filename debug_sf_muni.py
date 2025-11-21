import generate_city_data
import json

# Load config from file
with open('cities_config.json', 'r') as f:
    config = json.load(f)

# Filter for sf_muni
if 'sf_muni' in config:
    generate_city_data.process_city('sf_muni', config['sf_muni'])
else:
    print("sf_muni not found in config")
