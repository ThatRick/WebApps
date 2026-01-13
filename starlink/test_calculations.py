#!/usr/bin/env python3
"""
Test script for Starlink pass calculations
Validates that the calculation logic works correctly
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

def test_passes_json_validity():
    """Test that passes.json exists and is valid"""
    passes_file = Path(__file__).parent / 'docs' / 'passes.json'

    if not passes_file.exists():
        print("❌ FAIL: passes.json does not exist")
        return False

    with open(passes_file) as f:
        data = json.load(f)

    required_fields = ['generated_at', 'observer', 'parameters', 'total_passes', 'passes']
    for field in required_fields:
        if field not in data:
            print(f"❌ FAIL: Missing required field: {field}")
            return False

    print(f"✓ passes.json is valid")
    print(f"  Generated at: {data['generated_at']}")
    print(f"  Total passes: {data['total_passes']}")
    print(f"  Observer: {data['observer']['location_name']}")

    return True

def test_passes_are_future():
    """Test that there are future passes in the dataset"""
    passes_file = Path(__file__).parent / 'docs' / 'passes.json'

    with open(passes_file) as f:
        data = json.load(f)

    now = datetime.utcnow()
    generated_at = datetime.fromisoformat(data['generated_at'].replace('Z', '')).replace(tzinfo=None)

    # Check how old the data is
    age = now - generated_at
    print(f"\n📅 Data age: {age}")

    if age > timedelta(hours=24):
        print(f"⚠️  WARNING: Data is more than 24 hours old!")

    # Count future passes
    future_passes = []
    for p in data['passes']:
        pass_time = datetime.fromisoformat(p['start_time_utc'].replace('Z', '')).replace(tzinfo=None)
        if pass_time > now:
            future_passes.append(p)

    print(f"\n🛰️  Pass statistics:")
    print(f"  Total passes in file: {len(data['passes'])}")
    print(f"  Future passes: {len(future_passes)}")
    print(f"  Past passes: {len(data['passes']) - len(future_passes)}")

    if len(future_passes) == 0:
        print(f"❌ FAIL: No future passes found!")
        if len(data['passes']) > 0:
            last_pass = data['passes'][-1]
            last_time = datetime.fromisoformat(last_pass['start_time_utc'].replace('Z', '')).replace(tzinfo=None)
            print(f"  Last pass was: {last_pass['satellite']} at {last_time}")
            print(f"  That was {now - last_time} ago")
        return False

    # Show next few passes
    print(f"\n📡 Next {min(5, len(future_passes))} passes:")
    for i, p in enumerate(future_passes[:5]):
        pass_time = datetime.fromisoformat(p['start_time_utc'].replace('Z', '')).replace(tzinfo=None)
        time_until = pass_time - now
        hours = int(time_until.total_seconds() / 3600)
        minutes = int((time_until.total_seconds() % 3600) / 60)
        print(f"  {i+1}. {p['satellite']}")
        print(f"     Time: {pass_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
        print(f"     In: {hours}h {minutes}m")
        print(f"     Elevation: {p['max_elevation']:.1f}°")

    print(f"\n✓ Found {len(future_passes)} future passes")
    return True

def test_tle_data_validity():
    """Test that TLE data exists and is valid"""
    tle_file = Path(__file__).parent / 'docs' / 'starlink-tle-data.json'

    if not tle_file.exists():
        print("\n❌ FAIL: starlink-tle-data.json does not exist")
        return False

    with open(tle_file) as f:
        data = json.load(f)

    print(f"\n✓ TLE dataset is valid")
    print(f"  Total satellites: {data.get('total_satellites', 'unknown')}")
    print(f"  Generated at: {data.get('generated_at', 'unknown')}")

    if 'satellites' in data and len(data['satellites']) > 0:
        sample = data['satellites'][0]
        print(f"  Sample satellite: {sample.get('name', 'unknown')}")

    return True

def run_fresh_calculation():
    """Run a fresh calculation to verify the script works"""
    print("\n🔄 Running fresh calculation...")
    print("=" * 60)

    import subprocess

    try:
        result = subprocess.run(
            [
                'python3',
                'starlink_pass_calculator.py',
                '--lat', '62.2426',
                '--lon', '25.7473',
                '--max-distance', '500',
                '--hours', '24',
                '--tz', '2',
                '--no-cache',
                '--json', '/tmp/test_passes.json',
                '--top', '5'
            ],
            cwd=Path(__file__).parent,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            print(f"❌ FAIL: Calculation failed with exit code {result.returncode}")
            print(f"STDERR: {result.stderr}")
            return False

        print("✓ Calculation completed successfully")

        # Verify the output
        test_file = Path('/tmp/test_passes.json')
        if test_file.exists():
            with open(test_file) as f:
                data = json.load(f)
            print(f"  Generated {data['total_passes']} passes")

            # Check for future passes
            now = datetime.utcnow()
            future_count = sum(
                1 for p in data['passes']
                if datetime.fromisoformat(p['start_time_utc'].replace('Z', '')).replace(tzinfo=None) > now
            )
            print(f"  Future passes: {future_count}")

            if future_count == 0:
                print("⚠️  WARNING: Fresh calculation also found no future passes!")
                print("     This might indicate an issue with the calculation logic")

            test_file.unlink()  # Clean up
            return True
        else:
            print("❌ FAIL: Output file not created")
            return False

    except subprocess.TimeoutExpired:
        print("❌ FAIL: Calculation timed out after 120 seconds")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def main():
    print("=" * 60)
    print("Starlink Pass Calculation Tests")
    print("=" * 60)

    results = []

    # Test 1: Validate passes.json
    print("\n[TEST 1] Validating passes.json structure")
    print("-" * 60)
    results.append(("passes.json validity", test_passes_json_validity()))

    # Test 2: Check for future passes
    print("\n[TEST 2] Checking for future passes")
    print("-" * 60)
    results.append(("Future passes", test_passes_are_future()))

    # Test 3: Validate TLE data
    print("\n[TEST 3] Validating TLE dataset")
    print("-" * 60)
    results.append(("TLE data validity", test_tle_data_validity()))

    # Test 4: Run fresh calculation
    print("\n[TEST 4] Running fresh calculation")
    print("-" * 60)
    results.append(("Fresh calculation", run_fresh_calculation()))

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
