# Starlink Pass Calculator

A real-time Starlink satellite pass tracker for Jyväskylä, Finland.

## Features

- **Automated Updates**: GitHub Action runs every 6 hours to fetch latest satellite data
- **Real-time Tracking**: Calculates upcoming satellite passes within 500km radius
- **Web Interface**: Interactive dashboard showing pass times, elevation, and duration
- **Live Countdown**: Real-time countdown to next satellite pass

## How It Works

1. **Data Collection**: Python script downloads Two-Line Element (TLE) data from Celestrak
2. **Pass Calculation**: Calculates satellite orbital positions and pass times
3. **JSON Export**: Outputs pass data to `docs/passes.json`
4. **Web Display**: Interactive HTML dashboard loads and displays the data
5. **Auto-Update**: GitHub Action runs every 6 hours to refresh the data

## Files

- `starlink_pass_calculator.py` - Main calculation script
- `docs/index.html` - Web interface
- `docs/passes.json` - Generated pass data (auto-updated)
- `.gitignore` - Excludes cache files

## GitHub Action Automation

The workflow (`.github/workflows/update-passes.yml`) runs:
- Every 6 hours (cron: `0 */6 * * *`)
- On manual trigger
- When starlink files are pushed to main

## Access

Visit the web interface at: `/starlink/docs/` on the deployed GitHub Pages site.

## Configuration

Default location: **Jyväskylä, Finland** (62.2426°N, 25.7473°E)
- Max distance: 500 km
- Forecast: 24 hours ahead
- Timezone: UTC+2 (Finland winter time)

To change location, edit the workflow file parameters:
```yaml
--lat 62.2426 \
--lon 25.7473 \
```

## Data Source

Satellite orbital data from [Celestrak](https://celestrak.org/)
