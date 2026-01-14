#!/usr/bin/env python3
"""
Test real-time satellite position tracking
Check if distance is changing correctly as satellite approaches
"""

import sys
from datetime import datetime, timedelta

sys.path.insert(0, '/home/user/WebApps/starlink')
from starlink_pass_calculator import (
    get_cached_tle_data, parse_tle_data,
    propagate_satellite, tle_to_orbital_elements,
    calculate_ground_distance, calculate_elevation
)

def test_satellite_approach():
    """Test that satellite distance decreases as it approaches a pass"""
    print("=" * 70)
    print("TEST: Satellite Approach Distance")
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
            break

    if not target_sat:
        print("ERROR: STARLINK-5619 not found")
        return False

    name, line1, line2 = target_sat
    elements = tle_to_orbital_elements(line1, line2)

    # Observer location (Jyväskylä)
    obs_lat = 62.2426
    obs_lon = 25.7473

    # Start time: Now
    start_time = datetime.utcnow()

    # Track position every minute for 60 minutes
    print(f"\nTracking from {start_time.strftime('%H:%M:%S')} UTC")
    print(f"Observer: {obs_lat}°N, {obs_lon}°E\n")
    print(f"{'Time':>8} {'Elev':>6} {'Distance':>10} {'ΔDist':>8}")
    print("-" * 40)

    prev_distance = None
    distances = []

    for minutes in range(0, 61, 5):  # Every 5 minutes for 1 hour
        current_time = start_time + timedelta(minutes=minutes)

        try:
            sat_lat, sat_lon, sat_alt = propagate_satellite(elements, current_time)
            distance = calculate_ground_distance(sat_lat, sat_lon, sat_alt, obs_lat, obs_lon)
            elevation = calculate_elevation(sat_lat, sat_lon, sat_alt, obs_lat, obs_lon)

            distances.append({
                'time': current_time,
                'distance': distance,
                'elevation': elevation,
                'minutes': minutes
            })

            delta = ""
            if prev_distance is not None:
                change = distance - prev_distance
                delta = f"{change:+.1f} km"

            time_str = f"+{minutes}min"
            print(f"{time_str:>8} {elevation:>6.1f}° {distance:>9.0f} km {delta:>8}")

            prev_distance = distance

        except Exception as e:
            print(f"{minutes:>8} ERROR: {e}")

    # Analyze the trend
    print("\n" + "=" * 70)
    print("ANALYSIS:")
    print("=" * 70)

    # Find if distance is decreasing anywhere (indicating approach)
    decreasing_periods = []
    for i in range(1, len(distances)):
        if distances[i]['distance'] < distances[i-1]['distance']:
            decreasing_periods.append(i)

    if decreasing_periods:
        print(f"✓ Distance decreases during {len(decreasing_periods)} periods")
        print(f"  First decrease at +{distances[decreasing_periods[0]]['minutes']} min")

        # Find minimum distance
        min_dist_idx = min(range(len(distances)), key=lambda i: distances[i]['distance'])
        min_dist = distances[min_dist_idx]
        print(f"  Minimum distance: {min_dist['distance']:.0f} km at +{min_dist['minutes']} min")
        print(f"  Elevation at minimum: {min_dist['elevation']:.1f}°")
    else:
        print("✗ Distance NEVER decreases - satellite is moving away or orbit calculation is wrong!")

    # Check if distance changes linearly
    if len(distances) >= 3:
        # Calculate rate of change
        rates = []
        for i in range(1, len(distances)):
            dt = (distances[i]['time'] - distances[i-1]['time']).total_seconds()
            dd = distances[i]['distance'] - distances[i-1]['distance']
            rate = dd / dt * 1000  # m/s
            rates.append(rate)

        avg_rate = sum(rates) / len(rates)
        rate_variance = sum((r - avg_rate)**2 for r in rates) / len(rates)

        print(f"\nRate of change:")
        print(f"  Average: {avg_rate/1000:.2f} km/s")
        print(f"  Variance: {rate_variance/1e6:.2f} (km/s)²")

        if rate_variance < 0.1e6:  # Very low variance
            print("  ⚠ WARNING: Rate is nearly constant (linear) - this is suspicious!")
            print("  Real satellites should show varying rates as they approach/recede")

    return len(decreasing_periods) > 0


if __name__ == '__main__':
    success = test_satellite_approach()
    exit(0 if success else 1)
