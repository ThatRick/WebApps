#!/usr/bin/env python3
"""
Test suite for satellite pass calculations and display
Verifies that server calculations produce correct and sensible results
"""

import sys
import json
from datetime import datetime, timedelta

sys.path.insert(0, '/home/user/WebApps/starlink')
from starlink_pass_calculator import (
    get_cached_tle_data, parse_tle_data, find_passes_parallel,
    azimuth_to_direction
)

def test_pass_sanity():
    """Test that calculated passes have sensible values"""
    print("=" * 70)
    print("TEST: Pass Data Sanity Checks")
    print("=" * 70)

    # Load TLE data
    tle_data = get_cached_tle_data()
    assert tle_data, "Failed to load TLE data"

    satellites = parse_tle_data(tle_data)
    print(f"✓ Loaded {len(satellites)} satellites")

    # Calculate passes
    passes = find_passes_parallel(
        satellites,
        observer_lat=62.2426,
        observer_lon=25.7473,
        max_distance_km=500,
        hours_ahead=24,
        time_step_seconds=30
    )

    print(f"✓ Found {len(passes)} passes\n")

    # Test each pass
    issues = []
    for i, p in enumerate(passes[:20], 1):  # Test first 20 passes
        satellite = p['satellite']

        # Check max elevation is reasonable
        if p['max_elevation'] < 0 or p['max_elevation'] > 90:
            issues.append(f"Pass {i} ({satellite}): Invalid max_elevation = {p['max_elevation']}°")

        # Check distance is within bounds
        if p['min_distance'] < 0 or p['min_distance'] > 500:
            issues.append(f"Pass {i} ({satellite}): Invalid min_distance = {p['min_distance']} km")

        # Check duration is reasonable (should be > 0 and < 20 minutes)
        if p['duration'] < 0 or p['duration'] > 1200:
            issues.append(f"Pass {i} ({satellite}): Invalid duration = {p['duration']} seconds")

        # Check azimuths are valid (0-360)
        if not (0 <= p['start_azimuth'] <= 360):
            issues.append(f"Pass {i} ({satellite}): Invalid start_azimuth = {p['start_azimuth']}°")

        if 'movement_azimuth' in p and p['movement_azimuth'] is not None:
            if not (0 <= p['movement_azimuth'] <= 360):
                issues.append(f"Pass {i} ({satellite}): Invalid movement_azimuth = {p['movement_azimuth']}°")

        # Check times are in future
        start_time = p['start_time']
        if isinstance(start_time, str):
            start_time = datetime.fromisoformat(start_time.replace('Z', ''))
        if start_time < datetime.utcnow():
            issues.append(f"Pass {i} ({satellite}): Start time is in the past")

        # Print pass details
        print(f"Pass {i}: {satellite}")
        print(f"  Start:      {p['start_time']}")
        print(f"  Appears:    {p['start_direction']} ({p['start_azimuth']}°)")
        print(f"  Movement:   {p.get('movement_direction', 'N/A')} ({p.get('movement_azimuth', 'N/A')}°)")
        print(f"  Max Elev:   {p['max_elevation']}°")
        print(f"  Min Dist:   {p['min_distance']} km")
        print(f"  Duration:   {p['duration']} seconds")
        print()

    # Report issues
    if issues:
        print("\n" + "!" * 70)
        print("ISSUES FOUND:")
        print("!" * 70)
        for issue in issues:
            print(f"  ✗ {issue}")
        return False
    else:
        print("✓ All passes have valid data")
        return True


def test_direction_calculation():
    """Test that appearance direction and movement direction are different"""
    print("\n" + "=" * 70)
    print("TEST: Direction Calculation")
    print("=" * 70)

    tle_data = get_cached_tle_data()
    satellites = parse_tle_data(tle_data)

    passes = find_passes_parallel(
        satellites[:1000],  # Test subset for speed
        observer_lat=62.2426,
        observer_lon=25.7473,
        max_distance_km=500,
        hours_ahead=24,
        time_step_seconds=30
    )

    same_direction_count = 0
    total_passes = len(passes)

    for p in passes:
        start_dir = p['start_direction']
        movement_dir = p.get('movement_direction')

        if start_dir == movement_dir:
            same_direction_count += 1

    same_pct = (same_direction_count / total_passes * 100) if total_passes > 0 else 0

    print(f"Passes with same start and movement direction: {same_direction_count}/{total_passes} ({same_pct:.1f}%)")

    if same_pct > 50:
        print("✗ FAIL: More than 50% of passes have same start and movement direction")
        print("  This suggests the movement direction calculation is incorrect")
        return False
    else:
        print(f"✓ PASS: Only {same_pct:.1f}% of passes have identical directions")
        return True


def test_server_json_output():
    """Test that server-generated JSON has all required fields"""
    print("\n" + "=" * 70)
    print("TEST: Server JSON Output Format")
    print("=" * 70)

    try:
        with open('/home/user/WebApps/starlink/docs/passes.json', 'r') as f:
            data = json.load(f)

        print(f"✓ Loaded passes.json")
        print(f"  Total passes: {data['total_passes']}")
        print(f"  Generated at: {data['generated_at']}")

        # Check first pass has all required fields
        if data['passes']:
            p = data['passes'][0]
            required_fields = [
                'satellite', 'start_time_utc', 'start_time_local',
                'max_elevation', 'max_elevation_time_utc', 'end_time_utc',
                'duration_seconds', 'max_distance_km',
                'start_azimuth', 'start_direction',
                'movement_azimuth', 'movement_direction'
            ]

            missing_fields = [f for f in required_fields if f not in p]

            if missing_fields:
                print(f"✗ FAIL: Missing fields in pass data: {missing_fields}")
                return False
            else:
                print(f"✓ All required fields present")
                print(f"\nSample pass data:")
                print(f"  Satellite: {p['satellite']}")
                print(f"  Appears: {p['start_direction']} ({p['start_azimuth']}°)")
                print(f"  Movement: {p['movement_direction']} ({p['movement_azimuth']}°)")
                print(f"  Max Elevation: {p['max_elevation']}°")
                print(f"  Max Distance: {p['max_distance_km']} km")
                return True
        else:
            print("✗ FAIL: No passes in JSON")
            return False

    except Exception as e:
        print(f"✗ FAIL: Error loading JSON: {e}")
        return False


def main():
    """Run all tests"""
    print("\n" + "=" * 70)
    print("STARLINK PASS CALCULATION TEST SUITE")
    print("=" * 70)
    print()

    results = {
        'Pass Sanity Checks': test_pass_sanity(),
        'Direction Calculation': test_direction_calculation(),
        'Server JSON Output': test_server_json_output()
    }

    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)

    for test_name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {test_name}")

    all_passed = all(results.values())
    print()
    if all_passed:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == '__main__':
    exit(main())
