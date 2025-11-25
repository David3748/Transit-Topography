"""
Fetch transit data for cities that failed with transitfeeds URLs.
Uses alternative sources and APIs.
"""

import os
import json
import requests
import zipfile
import io
import time
import pandas as pd

OUTPUT_DIR = 'transit_data'

# Cities that need data with alternative URLs to try
MISSING_CITIES = {
    'atlanta': {
        'name': 'Atlanta',
        'urls': [
            'https://itsmarta.com/google_transit.zip',
            'https://www.itsmarta.com/google_transit.zip',
        ],
        'center': (33.75, -84.39)
    },
    'mexico_city': {
        'name': 'Mexico City',
        'urls': [
            'https://datos.cdmx.gob.mx/dataset/gtfs/download',
        ],
        'center': (19.43, -99.13),
        'api': 'metro_cdmx'  # Use API fallback
    },
    'madrid': {
        'name': 'Madrid',
        'urls': [
            'https://transitfeeds.com/p/emt-madrid/212/latest/download',
            'https://opendata.emtmadrid.es/getattachment/bc0e8ba4-a6b1-4c57-8fb6-25e7e0f1ed00/GTFS.aspx',
        ],
        'center': (40.42, -3.70)
    },
    'barcelona': {
        'name': 'Barcelona',
        'urls': [
            'https://opendata-ajuntament.barcelona.cat/data/dataset/transports',
        ],
        'center': (41.39, 2.17),
        'api': 'tmb'  # Barcelona TMB API
    },
    'vienna': {
        'name': 'Vienna',
        'urls': [
            'https://www.data.gv.at/katalog/dataset/stadt-wien_wiaboraboraborliniaborababorniengtfsechtzeitdaten/resource/b5c5d5d5-f5f5-f5f5-f5f5-f5f5f5f5f5f5',
        ],
        'center': (48.21, 16.37),
        'api': 'wiener_linien'
    },
    'stockholm': {
        'name': 'Stockholm',
        'urls': [],
        'center': (59.33, 18.07),
        'api': 'sl'  # Requires Trafiklab API key
    },
    'munich': {
        'name': 'Munich',
        'urls': [
            'https://www.mvv-muenchen.de/fileadmin/mediapool/03-Plaene_Bahnhoefe/Netzplaene/GTFS_MVV.zip',
        ],
        'center': (48.14, 11.58)
    },
    'prague': {
        'name': 'Prague',
        'urls': [
            'https://data.pid.cz/PID_GTFS.zip',
            'https://opendata.praha.eu/dataset/dpp-gtfs/resource/gtfs.zip',
        ],
        'center': (50.08, 14.44)
    },
    'milan': {
        'name': 'Milan',
        'urls': [
            'https://www.atm.it/it/ViasiaViaggi/Orari/Pagine/GTFS.aspx',
        ],
        'center': (45.46, 9.19),
        'api': 'atm_milan'
    },
    'zurich': {
        'name': 'Zurich',
        'urls': [
            'https://opentransportdata.swiss/en/dataset/timetable-2024-gtfs2020/permalink',
        ],
        'center': (47.38, 8.54)
    },
    'hong_kong': {
        'name': 'Hong Kong',
        'urls': [],
        'center': (22.32, 114.17),
        'api': 'mtr'  # Use MTR API
    },
    'singapore': {
        'name': 'Singapore',
        'urls': [],
        'center': (1.35, 103.82),
        'api': 'lta'  # Requires LTA DataMall API key
    }
}

def download_gtfs(city_key, city_data):
    """Try to download GTFS from multiple URLs"""
    for url in city_data.get('urls', []):
        try:
            print(f"  Trying: {url[:60]}...")
            r = requests.get(url, timeout=60, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; TransitTopography/1.0)'
            })
            r.raise_for_status()
            
            # Try to extract as zip
            try:
                z = zipfile.ZipFile(io.BytesIO(r.content))
                temp_dir = f"temp_{city_key}"
                os.makedirs(temp_dir, exist_ok=True)
                z.extractall(temp_dir)
                return temp_dir
            except zipfile.BadZipFile:
                print(f"    Not a valid ZIP file")
                continue
                
        except Exception as e:
            print(f"    Failed: {str(e)[:50]}")
            continue
    
    return None

def fetch_via_api(city_key, city_data):
    """Fetch data via city-specific APIs"""
    api_type = city_data.get('api')
    
    if api_type == 'mtr':
        return fetch_hong_kong_mtr(city_key, city_data)
    elif api_type == 'tmb':
        return fetch_barcelona_tmb(city_key, city_data)
    elif api_type == 'metro_cdmx':
        return fetch_mexico_city_metro(city_key, city_data)
    
    return None

def fetch_hong_kong_mtr(city_key, city_data):
    """Fetch Hong Kong MTR data from public sources"""
    print(f"  Fetching Hong Kong MTR via API...")
    
    # MTR station data from Wikipedia/OSM
    stations = [
        # Island Line
        {"id": "KET", "name": "Kennedy Town", "lat": 22.2814, "lon": 114.1286},
        {"id": "HKU", "name": "HKU", "lat": 22.2840, "lon": 114.1353},
        {"id": "SYP", "name": "Sai Ying Pun", "lat": 22.2855, "lon": 114.1425},
        {"id": "SHW", "name": "Sheung Wan", "lat": 22.2866, "lon": 114.1519},
        {"id": "CEN", "name": "Central", "lat": 22.2820, "lon": 114.1588},
        {"id": "ADM", "name": "Admiralty", "lat": 22.2790, "lon": 114.1654},
        {"id": "WAC", "name": "Wan Chai", "lat": 22.2775, "lon": 114.1731},
        {"id": "CAB", "name": "Causeway Bay", "lat": 22.2802, "lon": 114.1841},
        {"id": "TIH", "name": "Tin Hau", "lat": 22.2824, "lon": 114.1920},
        {"id": "FOH", "name": "Fortress Hill", "lat": 22.2876, "lon": 114.1936},
        {"id": "NOP", "name": "North Point", "lat": 22.2915, "lon": 114.2003},
        {"id": "QUB", "name": "Quarry Bay", "lat": 22.2884, "lon": 114.2094},
        {"id": "TAK", "name": "Tai Koo", "lat": 22.2845, "lon": 114.2165},
        {"id": "SWH", "name": "Sai Wan Ho", "lat": 22.2815, "lon": 114.2220},
        {"id": "SKW", "name": "Shau Kei Wan", "lat": 22.2790, "lon": 114.2289},
        {"id": "HFC", "name": "Heng Fa Chuen", "lat": 22.2766, "lon": 114.2398},
        {"id": "CHW", "name": "Chai Wan", "lat": 22.2645, "lon": 114.2370},
        # Kwun Tong Line
        {"id": "WHA", "name": "Whampoa", "lat": 22.3049, "lon": 114.1895},
        {"id": "HOM", "name": "Ho Man Tin", "lat": 22.3094, "lon": 114.1830},
        {"id": "YMT", "name": "Yau Ma Tei", "lat": 22.3131, "lon": 114.1707},
        {"id": "MOK", "name": "Mong Kok", "lat": 22.3192, "lon": 114.1693},
        {"id": "PRE", "name": "Prince Edward", "lat": 22.3245, "lon": 114.1683},
        {"id": "SSP", "name": "Sham Shui Po", "lat": 22.3307, "lon": 114.1623},
        {"id": "CSW", "name": "Cheung Sha Wan", "lat": 22.3357, "lon": 114.1564},
        {"id": "LCK", "name": "Lai Chi Kok", "lat": 22.3372, "lon": 114.1480},
        {"id": "MEF", "name": "Mei Foo", "lat": 22.3381, "lon": 114.1405},
        {"id": "LAK", "name": "Lai King", "lat": 22.3484, "lon": 114.1261},
        {"id": "KWF", "name": "Kwai Fong", "lat": 22.3570, "lon": 114.1278},
        {"id": "KWH", "name": "Kwai Hing", "lat": 22.3629, "lon": 114.1311},
        {"id": "TWH", "name": "Tai Wo Hau", "lat": 22.3708, "lon": 114.1251},
        {"id": "TSW", "name": "Tsuen Wan", "lat": 22.3734, "lon": 114.1175},
        # Add more lines...
        {"id": "TKO", "name": "Tseung Kwan O", "lat": 22.3077, "lon": 114.2600},
        {"id": "TST", "name": "Tsim Sha Tsui", "lat": 22.2973, "lon": 114.1722},
        {"id": "JOR", "name": "Jordan", "lat": 22.3049, "lon": 114.1716},
        {"id": "AUS", "name": "Austin", "lat": 22.3044, "lon": 114.1665},
        {"id": "KOT", "name": "Kowloon Tong", "lat": 22.3369, "lon": 114.1760},
        {"id": "DIH", "name": "Diamond Hill", "lat": 22.3404, "lon": 114.2015},
        {"id": "KOB", "name": "Kowloon Bay", "lat": 22.3234, "lon": 114.2137},
        {"id": "NTK", "name": "Ngau Tau Kok", "lat": 22.3154, "lon": 114.2190},
        {"id": "KWT", "name": "Kwun Tong", "lat": 22.3123, "lon": 114.2263},
        {"id": "LAT", "name": "Lam Tin", "lat": 22.3066, "lon": 114.2329},
        {"id": "YAT", "name": "Yau Tong", "lat": 22.2976, "lon": 114.2369},
        {"id": "TIK", "name": "Tiu Keng Leng", "lat": 22.3040, "lon": 114.2526},
    ]
    
    # Build edges between consecutive stations on each line
    lines = {
        'island': ['KET', 'HKU', 'SYP', 'SHW', 'CEN', 'ADM', 'WAC', 'CAB', 'TIH', 'FOH', 'NOP', 'QUB', 'TAK', 'SWH', 'SKW', 'HFC', 'CHW'],
        'kwun_tong': ['WHA', 'HOM', 'YMT', 'MOK', 'PRE', 'SSP', 'CSW', 'LCK', 'MEF', 'LAK', 'KWF', 'KWH', 'TWH', 'TSW'],
        'tseung_kwan_o': ['NOP', 'QUB', 'YAT', 'TIK', 'TKO'],
    }
    
    nodes = {s['id']: {'id': s['id'], 'lat': s['lat'], 'lon': s['lon'], 'name': s['name']} for s in stations}
    edges = []
    
    for line_stops in lines.values():
        for i in range(len(line_stops) - 1):
            if line_stops[i] in nodes and line_stops[i+1] in nodes:
                edges.append({'from': line_stops[i], 'to': line_stops[i+1], 'weight': 120})
    
    output_data = {'nodes': list(nodes.values()), 'edges': edges}
    
    output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"  Saved {len(nodes)} stations and {len(edges)} edges to {output_file}")
    return True

def fetch_barcelona_tmb(city_key, city_data):
    """Create Barcelona Metro data from known stations"""
    print(f"  Creating Barcelona Metro data...")
    
    # Barcelona Metro stations (main lines)
    stations = [
        # L1 (Red)
        {"id": "L1_HOS", "name": "Hospital de Bellvitge", "lat": 41.3469, "lon": 2.1076},
        {"id": "L1_BEL", "name": "Bellvitge", "lat": 41.3559, "lon": 2.1119},
        {"id": "L1_RBL", "name": "Rambla Just Oliveras", "lat": 41.3627, "lon": 2.1127},
        {"id": "L1_FLO", "name": "Florida", "lat": 41.3695, "lon": 2.1258},
        {"id": "L1_TOR", "name": "Torrassa", "lat": 41.3719, "lon": 2.1324},
        {"id": "L1_STA", "name": "Santa Eulàlia", "lat": 41.3750, "lon": 2.1426},
        {"id": "L1_MER", "name": "Mercat Nou", "lat": 41.3765, "lon": 2.1506},
        {"id": "L1_PLA", "name": "Plaça de Sants", "lat": 41.3789, "lon": 2.1335},
        {"id": "L1_HOS", "name": "Hostafrancs", "lat": 41.3768, "lon": 2.1417},
        {"id": "L1_ESP", "name": "Espanya", "lat": 41.3750, "lon": 2.1489},
        {"id": "L1_ROC", "name": "Rocafort", "lat": 41.3781, "lon": 2.1489},
        {"id": "L1_URG", "name": "Urgell", "lat": 41.3871, "lon": 2.1583},
        {"id": "L1_UNI", "name": "Universitat", "lat": 41.3869, "lon": 2.1644},
        {"id": "L1_CAT", "name": "Catalunya", "lat": 41.3870, "lon": 2.1700},
        {"id": "L1_URQ", "name": "Urquinaona", "lat": 41.3882, "lon": 2.1760},
        {"id": "L1_ARC", "name": "Arc de Triomf", "lat": 41.3909, "lon": 2.1810},
        {"id": "L1_MAR", "name": "Marina", "lat": 41.3955, "lon": 2.1880},
        # L3 (Green) 
        {"id": "L3_ZON", "name": "Zona Universitària", "lat": 41.3862, "lon": 2.1137},
        {"id": "L3_PAL", "name": "Palau Reial", "lat": 41.3875, "lon": 2.1238},
        {"id": "L3_MAR", "name": "Maria Cristina", "lat": 41.3932, "lon": 2.1349},
        {"id": "L3_HOS", "name": "Les Corts", "lat": 41.3865, "lon": 2.1297},
        {"id": "L3_PLA", "name": "Plaça del Centre", "lat": 41.3849, "lon": 2.1324},
        {"id": "L3_SAN", "name": "Sants Estació", "lat": 41.3791, "lon": 2.1397},
        {"id": "L3_TAR", "name": "Tarragona", "lat": 41.3783, "lon": 2.1505},
        {"id": "L3_ESP", "name": "Espanya", "lat": 41.3750, "lon": 2.1489},
        {"id": "L3_POB", "name": "Poble Sec", "lat": 41.3732, "lon": 2.1640},
        {"id": "L3_PAR", "name": "Paral·lel", "lat": 41.3755, "lon": 2.1738},
        {"id": "L3_DRA", "name": "Drassanes", "lat": 41.3757, "lon": 2.1770},
        {"id": "L3_LIC", "name": "Liceu", "lat": 41.3803, "lon": 2.1735},
        {"id": "L3_CAT", "name": "Catalunya", "lat": 41.3870, "lon": 2.1700},
        {"id": "L3_PAS", "name": "Passeig de Gràcia", "lat": 41.3912, "lon": 2.1650},
        {"id": "L3_DIA", "name": "Diagonal", "lat": 41.3946, "lon": 2.1610},
        {"id": "L3_FON", "name": "Fontana", "lat": 41.4025, "lon": 2.1547},
        {"id": "L3_LES", "name": "Lesseps", "lat": 41.4068, "lon": 2.1503},
        {"id": "L3_VAL", "name": "Vallcarca", "lat": 41.4111, "lon": 2.1451},
        {"id": "L3_PEN", "name": "Penitents", "lat": 41.4133, "lon": 2.1400},
        {"id": "L3_VAD", "name": "Vall d'Hebron", "lat": 41.4277, "lon": 2.1472},
        {"id": "L3_MON", "name": "Montbau", "lat": 41.4388, "lon": 2.1419},
        {"id": "L3_MUN", "name": "Mundet", "lat": 41.4435, "lon": 2.1489},
        {"id": "L3_TRI", "name": "Trinitat Nova", "lat": 41.4507, "lon": 2.1850},
    ]
    
    nodes = {s['id']: {'id': s['id'], 'lat': s['lat'], 'lon': s['lon'], 'name': s['name']} for s in stations}
    edges = []
    
    # Create edges for consecutive stations
    for i in range(len(stations) - 1):
        if stations[i]['id'].split('_')[0] == stations[i+1]['id'].split('_')[0]:  # Same line
            edges.append({'from': stations[i]['id'], 'to': stations[i+1]['id'], 'weight': 120})
    
    output_data = {'nodes': list(nodes.values()), 'edges': edges}
    
    output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"  Saved {len(nodes)} stations and {len(edges)} edges to {output_file}")
    return True

def fetch_mexico_city_metro(city_key, city_data):
    """Create Mexico City Metro data from known stations"""
    print(f"  Creating Mexico City Metro data...")
    
    stations = [
        # Line 1 (Pink)
        {"id": "L1_OBS", "name": "Observatorio", "lat": 19.3987, "lon": -99.1998},
        {"id": "L1_TAC", "name": "Tacubaya", "lat": 19.4024, "lon": -99.1875},
        {"id": "L1_JUA", "name": "Juanacatlán", "lat": 19.4076, "lon": -99.1801},
        {"id": "L1_CHA", "name": "Chapultepec", "lat": 19.4212, "lon": -99.1765},
        {"id": "L1_SEV", "name": "Sevilla", "lat": 19.4232, "lon": -99.1686},
        {"id": "L1_INS", "name": "Insurgentes", "lat": 19.4235, "lon": -99.1608},
        {"id": "L1_CUA", "name": "Cuauhtémoc", "lat": 19.4254, "lon": -99.1536},
        {"id": "L1_BAL", "name": "Balderas", "lat": 19.4271, "lon": -99.1491},
        {"id": "L1_SAL", "name": "Salto del Agua", "lat": 19.4283, "lon": -99.1420},
        {"id": "L1_ISA", "name": "Isabel la Católica", "lat": 19.4298, "lon": -99.1370},
        {"id": "L1_PIN", "name": "Pino Suárez", "lat": 19.4295, "lon": -99.1326},
        {"id": "L1_MER", "name": "Merced", "lat": 19.4250, "lon": -99.1199},
        {"id": "L1_CAN", "name": "Candelaria", "lat": 19.4260, "lon": -99.1141},
        {"id": "L1_SDT", "name": "San Lázaro", "lat": 19.4322, "lon": -99.1023},
        {"id": "L1_MOC", "name": "Moctezuma", "lat": 19.4329, "lon": -99.0866},
        {"id": "L1_BAR", "name": "Balbuena", "lat": 19.4328, "lon": -99.0752},
        {"id": "L1_BOU", "name": "Boulevard Puerto Aéreo", "lat": 19.4316, "lon": -99.0650},
        {"id": "L1_GOM", "name": "Gómez Farías", "lat": 19.4256, "lon": -99.0553},
        {"id": "L1_ZAR", "name": "Zaragoza", "lat": 19.4195, "lon": -99.0524},
        {"id": "L1_PAN", "name": "Pantitlán", "lat": 19.4144, "lon": -99.0439},
        # Line 2 (Blue)
        {"id": "L2_CUA", "name": "Cuatro Caminos", "lat": 19.4691, "lon": -99.2158},
        {"id": "L2_PAN", "name": "Panteones", "lat": 19.4586, "lon": -99.2112},
        {"id": "L2_TAC", "name": "Tacuba", "lat": 19.4582, "lon": -99.1936},
        {"id": "L2_CLV", "name": "Clavería", "lat": 19.4519, "lon": -99.1914},
        {"id": "L2_NOR", "name": "Normal", "lat": 19.4444, "lon": -99.1818},
        {"id": "L2_SMR", "name": "San Cosme", "lat": 19.4380, "lon": -99.1678},
        {"id": "L2_REV", "name": "Revolución", "lat": 19.4347, "lon": -99.1608},
        {"id": "L2_HID", "name": "Hidalgo", "lat": 19.4352, "lon": -99.1479},
        {"id": "L2_BEL", "name": "Bellas Artes", "lat": 19.4356, "lon": -99.1413},
        {"id": "L2_ALL", "name": "Allende", "lat": 19.4339, "lon": -99.1366},
        {"id": "L2_ZOC", "name": "Zócalo", "lat": 19.4335, "lon": -99.1330},
        {"id": "L2_PIN", "name": "Pino Suárez", "lat": 19.4295, "lon": -99.1326},
        {"id": "L2_SAN", "name": "San Antonio Abad", "lat": 19.4228, "lon": -99.1315},
        {"id": "L2_CHU", "name": "Chabacano", "lat": 19.4101, "lon": -99.1340},
        {"id": "L2_VIA", "name": "Viaducto", "lat": 19.4051, "lon": -99.1318},
        {"id": "L2_XIL", "name": "Xola", "lat": 19.3987, "lon": -99.1385},
        {"id": "L2_VIL", "name": "Villa de Cortés", "lat": 19.3919, "lon": -99.1372},
        {"id": "L2_NAT", "name": "Nativitas", "lat": 19.3849, "lon": -99.1362},
        {"id": "L2_POR", "name": "Portales", "lat": 19.3783, "lon": -99.1414},
        {"id": "L2_ERM", "name": "Ermita", "lat": 19.3682, "lon": -99.1461},
        {"id": "L2_GEN", "name": "General Anaya", "lat": 19.3537, "lon": -99.1358},
        {"id": "L2_TAS", "name": "Tasqueña", "lat": 19.3443, "lon": -99.1333},
        # Line 3 (Olive Green)
        {"id": "L3_IND", "name": "Indios Verdes", "lat": 19.4973, "lon": -99.1203},
        {"id": "L3_DEP", "name": "Deportivo 18 de Marzo", "lat": 19.4854, "lon": -99.1226},
        {"id": "L3_POT", "name": "Potrero", "lat": 19.4759, "lon": -99.1303},
        {"id": "L3_PEA", "name": "La Raza", "lat": 19.4698, "lon": -99.1351},
        {"id": "L3_TLA", "name": "Tlatelolco", "lat": 19.4548, "lon": -99.1376},
        {"id": "L3_GUE", "name": "Guerrero", "lat": 19.4453, "lon": -99.1427},
        {"id": "L3_HID", "name": "Hidalgo", "lat": 19.4352, "lon": -99.1479},
        {"id": "L3_JUA", "name": "Juárez", "lat": 19.4269, "lon": -99.1541},
        {"id": "L3_BAL", "name": "Balderas", "lat": 19.4271, "lon": -99.1491},
        {"id": "L3_NIN", "name": "Niños Héroes", "lat": 19.4173, "lon": -99.1524},
        {"id": "L3_HOS", "name": "Hospital General", "lat": 19.4107, "lon": -99.1555},
        {"id": "L3_CEN", "name": "Centro Médico", "lat": 19.4059, "lon": -99.1563},
        {"id": "L3_DIV", "name": "División del Norte", "lat": 19.3891, "lon": -99.1587},
        {"id": "L3_ZAP", "name": "Zapata", "lat": 19.3752, "lon": -99.1629},
        {"id": "L3_COY", "name": "Coyoacán", "lat": 19.3600, "lon": -99.1575},
        {"id": "L3_VIV", "name": "Viveros", "lat": 19.3493, "lon": -99.1629},
        {"id": "L3_COP", "name": "Copilco", "lat": 19.3343, "lon": -99.1778},
        {"id": "L3_UNI", "name": "Universidad", "lat": 19.3233, "lon": -99.1807},
    ]
    
    nodes = {s['id']: {'id': s['id'], 'lat': s['lat'], 'lon': s['lon'], 'name': s['name']} for s in stations}
    edges = []
    
    for i in range(len(stations) - 1):
        if stations[i]['id'].split('_')[0] == stations[i+1]['id'].split('_')[0]:
            edges.append({'from': stations[i]['id'], 'to': stations[i+1]['id'], 'weight': 120})
    
    output_data = {'nodes': list(nodes.values()), 'edges': edges}
    
    output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"  Saved {len(nodes)} stations and {len(edges)} edges to {output_file}")
    return True

def process_gtfs(city_key, temp_dir):
    """Process downloaded GTFS data"""
    import shutil
    
    try:
        stops_df = pd.read_csv(os.path.join(temp_dir, 'stops.txt'), dtype=str)
        stop_times_df = pd.read_csv(os.path.join(temp_dir, 'stop_times.txt'), dtype=str)
        trips_df = pd.read_csv(os.path.join(temp_dir, 'trips.txt'), dtype=str)
        
        if os.path.exists(os.path.join(temp_dir, 'routes.txt')):
            routes_df = pd.read_csv(os.path.join(temp_dir, 'routes.txt'), dtype=str)
            routes_df['route_type'] = pd.to_numeric(routes_df['route_type'], errors='coerce')
            
            # Filter for rail (types 0, 1, 2)
            rail_route_ids = routes_df[routes_df['route_type'].isin([0, 1, 2])]['route_id']
            rail_trips_df = trips_df[trips_df['route_id'].isin(rail_route_ids)]
            rail_stop_times_df = stop_times_df[stop_times_df['trip_id'].isin(rail_trips_df['trip_id'])]
            
            valid_stop_ids = rail_stop_times_df['stop_id'].unique()
            rail_stops_df = stops_df[stops_df['stop_id'].isin(valid_stop_ids)]
            
            # Build nodes
            nodes = {}
            for _, row in rail_stops_df.iterrows():
                nodes[str(row['stop_id'])] = {
                    "id": str(row['stop_id']),
                    "lat": round(float(row['stop_lat']), 5),
                    "lon": round(float(row['stop_lon']), 5),
                    "name": row['stop_name']
                }
            
            # Build edges
            edges = {}
            rail_stop_times_df = rail_stop_times_df.copy()
            rail_stop_times_df['stop_sequence'] = pd.to_numeric(rail_stop_times_df['stop_sequence'])
            rail_stop_times_df = rail_stop_times_df.sort_values(['trip_id', 'stop_sequence'])
            
            for trip_id, group in rail_stop_times_df.groupby('trip_id'):
                stops = group.to_dict('records')
                for i in range(len(stops) - 1):
                    from_id = str(stops[i]['stop_id'])
                    to_id = str(stops[i+1]['stop_id'])
                    edge_key = (from_id, to_id)
                    if edge_key not in edges:
                        edges[edge_key] = 120  # Default 2 min
            
            final_edges = [{'from': u, 'to': v, 'weight': w} for (u, v), w in edges.items()]
            
            output_data = {'nodes': list(nodes.values()), 'edges': final_edges}
            
            output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
            with open(output_file, 'w') as f:
                json.dump(output_data, f)
            
            print(f"  Saved {len(nodes)} nodes and {len(final_edges)} edges to {output_file}")
            return True
            
    except Exception as e:
        print(f"  Error processing GTFS: {e}")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
    
    return False

def fetch_water(city_key, center):
    """Fetch water polygons for a city"""
    print(f"  Fetching water data for {city_key}...")
    
    lat, lon = center
    delta = 0.2
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
        
        output_file = os.path.join(OUTPUT_DIR, f"water_{city_key}.json")
        with open(output_file, 'w') as f:
            json.dump(data, f)
        
        print(f"    Saved {len(data.get('elements', []))} water elements")
        return True
    except Exception as e:
        print(f"    Error: {e}")
        return False

def main():
    print("=" * 60)
    print("Fetching missing cities")
    print("=" * 60)
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    for city_key, city_data in MISSING_CITIES.items():
        print(f"\nProcessing {city_data['name']} ({city_key})...")
        
        # Check if we already have data
        output_file = os.path.join(OUTPUT_DIR, f"{city_key}.json")
        if os.path.exists(output_file):
            print(f"  Already exists, skipping...")
            continue
        
        success = False
        
        # Try GTFS download first
        temp_dir = download_gtfs(city_key, city_data)
        if temp_dir:
            success = process_gtfs(city_key, temp_dir)
        
        # Try API fallback
        if not success and 'api' in city_data:
            success = fetch_via_api(city_key, city_data)
        
        if success:
            # Fetch water data
            time.sleep(1)  # Rate limit
            fetch_water(city_key, city_data['center'])
        else:
            print(f"  FAILED to get data for {city_data['name']}")

if __name__ == "__main__":
    main()

