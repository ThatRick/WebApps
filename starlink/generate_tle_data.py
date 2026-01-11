#!/usr/bin/env python3
"""
Generate TLE (Two-Line Element) dataset for Starlink satellites.
This data is used by the web client to calculate satellite passes in real-time.

Usage:
    python generate_tle_data.py --lat LATITUDE --lon LONGITUDE --max-distance KM --output OUTPUT_FILE
"""

import argparse
import urllib.request
import os
import json
from datetime import datetime, timedelta
from typing import List, Tuple, Optional

# Constants
CELESTRAK_STARLINK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"
TLE_CACHE_FILE = "starlink_tle_cache.txt"
CACHE_MAX_AGE_HOURS = 6


def download_tle_data(url: str = CELESTRAK_STARLINK_URL) -> str:
    """Download TLE data from Celestrak."""
    print(f"Downloading TLE data from: {url}")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read().decode('utf-8')
        print(f"Downloaded {len(data)} bytes of TLE data")
        return data
    except Exception as e:
        raise RuntimeError(f"Failed to download TLE data: {e}")


def get_cached_tle_data(cache_file: str = TLE_CACHE_FILE, max_age_hours: float = CACHE_MAX_AGE_HOURS) -> Optional[str]:
    """Get TLE data from cache if fresh."""
    if not os.path.exists(cache_file):
        return None

    file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(cache_file))
    if file_age > timedelta(hours=max_age_hours):
        print(f"Cache expired ({file_age}), will download fresh data")
        return None

    print(f"Using cached TLE data (age: {file_age})")
    with open(cache_file, 'r') as f:
        return f.read()


def save_tle_cache(data: str, cache_file: str = TLE_CACHE_FILE):
    """Save TLE data to cache."""
    with open(cache_file, 'w') as f:
        f.write(data)
    print(f"TLE data saved to cache: {cache_file}")


def parse_tle_data(tle_text: str) -> List[Tuple[str, str, str]]:
    """
    Parse TLE text into list of (name, line1, line2) tuples.
    """
    lines = [line.strip() for line in tle_text.strip().split('\n') if line.strip()]
    satellites = []

    i = 0
    while i < len(lines) - 2:
        # TLE format: name, line 1 (starts with "1 "), line 2 (starts with "2 ")
        if lines[i+1].startswith('1 ') and lines[i+2].startswith('2 '):
            name = lines[i]
            line1 = lines[i+1]
            line2 = lines[i+2]

            # Extract NORAD ID from line 1
            norad_id = line1[2:7].strip()

            satellites.append((name, line1, line2, norad_id))
            i += 3
        else:
            i += 1

    return satellites


def main():
    parser = argparse.ArgumentParser(
        description="Generate TLE dataset for Starlink satellites"
    )
    parser.add_argument('--lat', type=float, required=True,
                        help='Observer latitude in degrees')
    parser.add_argument('--lon', type=float, required=True,
                        help='Observer longitude in degrees')
    parser.add_argument('--location', type=str, default='Unknown',
                        help='Observer location name')
    parser.add_argument('--max-distance', type=float, default=500,
                        help='Maximum distance in km (default: 500)')
    parser.add_argument('--min-elevation', type=float, default=0,
                        help='Minimum elevation in degrees (default: 0)')
    parser.add_argument('--hours', type=int, default=24,
                        help='Hours to look ahead (default: 24)')
    parser.add_argument('--output', type=str, default='docs/starlink-tle-data.json',
                        help='Output JSON file (default: docs/starlink-tle-data.json)')
    parser.add_argument('--no-cache', action='store_true',
                        help='Force download fresh TLE data')

    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Generating TLE dataset for Starlink satellites")
    print(f"{'='*60}\n")

    # Get TLE data (cached or fresh)
    if args.no_cache:
        tle_text = download_tle_data()
        save_tle_cache(tle_text)
    else:
        tle_text = get_cached_tle_data()
        if tle_text is None:
            tle_text = download_tle_data()
            save_tle_cache(tle_text)

    # Parse TLE data
    print("\nParsing TLE data...")
    satellites = parse_tle_data(tle_text)
    print(f"Found {len(satellites)} Starlink satellites\n")

    # Generate output dataset
    now = datetime.utcnow()
    cache_expires = now + timedelta(hours=CACHE_MAX_AGE_HOURS)

    dataset = {
        "generated_at": now.isoformat() + "Z",
        "source": CELESTRAK_STARLINK_URL,
        "cache_expires_at": cache_expires.isoformat() + "Z",
        "total_satellites": len(satellites),
        "satellites": [
            {
                "name": name,
                "norad_id": norad_id,
                "line1": line1,
                "line2": line2
            }
            for name, line1, line2, norad_id in satellites
        ],
        "observer": {
            "latitude": args.lat,
            "longitude": args.lon,
            "elevation_m": 0,
            "location_name": args.location
        },
        "parameters": {
            "min_elevation_deg": args.min_elevation,
            "max_distance_km": args.max_distance,
            "hours_ahead": args.hours
        }
    }

    # Write JSON file
    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)

    with open(args.output, 'w') as f:
        json.dump(dataset, f, indent=2)

    file_size = os.path.getsize(args.output)
    print(f"{'='*60}")
    print(f"TLE dataset generated successfully!")
    print(f"Output: {args.output}")
    print(f"Size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    print(f"Satellites: {len(satellites)}")
    print(f"Cache expires: {cache_expires.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
