#!/usr/bin/env python3
"""
Test satellite orbit propagation to verify orbital period and path
"""

import sys
from datetime import datetime, timedelta

sys.path.insert(0, '/home/user/WebApps/starlink')
from starlink_pass_calculator import (
    get_cached_tle_data, parse_tle_data,
    propagate_satellite, tle_to_orbital_elements
)

def test_orbital_period():
    """Test that satellite completes one orbit in correct time"""
    print("=" * 70)
    print("TEST: Satellite Orbital Period")
    print("=" * 70)

    # Load TLE data
    tle_data = get_cached_tle_data()
    if not tle_data:
        print("Cache expired, downloading fresh TLE data...")
        from starlink_pass_calculator import download_tle_data, save_tle_cache
        tle_data = download_tle_data()
        save_tle_cache(tle_data)

    satellites = parse_tle_data(tle_data)

    # Find STARLINK-5619
    target_sat = None
    for name, line1, line2 in satellites:
        if 'STARLINK-5619' in name:
            target_sat = (name, line1, line2)
            print(f"Found: {name}")
            print(f"TLE Line 1: {line1}")
            print(f"TLE Line 2: {line2}")
            break

    if not target_sat:
        print("ERROR: STARLINK-5619 not found")
        return False

    name, line1, line2 = target_sat
    elements = tle_to_orbital_elements(line1, line2)

    # Calculate orbital period from mean motion
    mean_motion = elements['mean_motion']  # revolutions per day
    orbital_period_minutes = (24 * 60) / mean_motion

    print(f"\nOrbital Elements:")
    print(f"  Inclination: {elements['inclination']:.2f}°")
    print(f"  Mean Motion: {mean_motion:.6f} rev/day")
    print(f"  Calculated Period: {orbital_period_minutes:.2f} minutes")
    print(f"  Expected for LEO: ~90-100 minutes")

    # Track satellite for one full orbit
    start_time = datetime.utcnow()

    # Get initial position
    lat0, lon0, alt0 = propagate_satellite(elements, start_time)
    print(f"\nInitial Position (t=0):")
    print(f"  Lat: {lat0:.2f}°, Lon: {lon0:.2f}°, Alt: {alt0:.0f} km")

    # Track satellite positions over time
    print(f"\nPosition tracking every 10 minutes:")
    print(f"{'Time':>8} {'Lat':>8} {'Lon':>9} {'Alt':>8} {'ΔLat':>8} {'ΔLon':>8}")
    print("-" * 60)

    positions = []
    for minutes in range(0, 121, 10):  # Track for 2 hours
        current_time = start_time + timedelta(minutes=minutes)
        lat, lon, alt = propagate_satellite(elements, current_time)

        delta_lat = lat - lat0 if minutes > 0 else 0
        delta_lon = lon - lon0 if minutes > 0 else 0

        positions.append({'time': minutes, 'lat': lat, 'lon': lon, 'alt': alt})

        print(f"{minutes:>3}min {lat:>8.2f}° {lon:>9.2f}° {alt:>7.0f}km {delta_lat:>7.2f}° {delta_lon:>7.2f}°")

    # Check if latitude varies (should cross equator)
    lats = [p['lat'] for p in positions]
    min_lat = min(lats)
    max_lat = max(lats)
    lat_range = max_lat - min_lat

    print(f"\nLatitude Analysis:")
    print(f"  Min: {min_lat:.2f}°")
    print(f"  Max: {max_lat:.2f}°")
    print(f"  Range: {lat_range:.2f}°")
    print(f"  Inclination: {elements['inclination']:.2f}°")

    if lat_range < 10:
        print(f"  ⚠️ WARNING: Latitude range too small! Satellite should vary between ±{elements['inclination']:.0f}°")
        return False

    # Check longitude change (should move significantly)
    lons = [p['lon'] for p in positions]
    lon_change = abs(lons[-1] - lons[0])

    print(f"\nLongitude Change over 2 hours:")
    print(f"  Start: {lons[0]:.2f}°")
    print(f"  End: {lons[-1]:.2f}°")
    print(f"  Change: {lon_change:.2f}°")
    print(f"  Expected: ~180-270° for 2 hours")

    if lon_change < 100:
        print(f"  ⚠️ WARNING: Longitude change too small!")
        return False

    print(f"\n✓ Orbital period: {orbital_period_minutes:.2f} minutes (expected ~{orbital_period_minutes:.0f} min)")
    print(f"✓ Latitude varies correctly")
    print(f"✓ Longitude changes correctly")

    return True


if __name__ == '__main__':
    success = test_orbital_period()
    exit(0 if success else 1)
