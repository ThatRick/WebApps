/**
 * Satellite pass calculator
 * Finds satellite passes over observer location
 */

import { SatellitePropagator } from './propagator';
import { azimuthToDirection } from './coordinates';
import type {
  TLEData,
  SatellitePass,
  SatellitePosition,
  Observer,
  Parameters,
  PassCalculationProgress
} from '../types';

export class PassCalculator {
  private observer: Observer;
  private parameters: Parameters;

  constructor(observer: Observer, parameters: Parameters) {
    this.observer = observer;
    this.parameters = parameters;
  }

  /**
   * Filter satellites that could potentially be visible
   * Reduces calculation load significantly
   */
  filterCandidateSatellites(satellites: TLEData[]): TLEData[] {
    const filtered: TLEData[] = [];

    for (const sat of satellites) {
      const propagator = new SatellitePropagator(sat);

      if (!propagator.isValid()) {
        continue;
      }

      // Check if orbital parameters allow visibility
      if (propagator.couldBeVisible(this.observer.latitude)) {
        filtered.push(sat);
      }
    }

    console.log(`Filtered ${satellites.length} satellites down to ${filtered.length} candidates`);
    return filtered;
  }

  /**
   * Find all passes for given satellites within time range
   */
  async* findPasses(
    satellites: TLEData[],
    startTime: Date,
    endTime: Date,
    onProgress?: (progress: PassCalculationProgress) => void
  ): AsyncGenerator<SatellitePass> {
    const candidates = this.filterCandidateSatellites(satellites);
    let satellitesProcessed = 0;
    let passesFound = 0;

    for (const satTle of candidates) {
      const propagator = new SatellitePropagator(satTle);

      if (!propagator.isValid()) {
        satellitesProcessed++;
        continue;
      }

      // Find passes for this satellite
      const passes = this.findSatellitePasses(propagator, startTime, endTime);

      for (const pass of passes) {
        passesFound++;
        yield pass;
      }

      satellitesProcessed++;

      // Report progress
      if (onProgress) {
        onProgress({
          satellitesProcessed,
          totalSatellites: candidates.length,
          passesFound,
          currentSatellite: propagator.getName()
        });
      }

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Find all passes for a single satellite
   */
  private findSatellitePasses(
    propagator: SatellitePropagator,
    startTime: Date,
    endTime: Date
  ): SatellitePass[] {
    const passes: SatellitePass[] = [];

    // Coarse scan to find potential pass windows
    const coarseStep = 5 * 60 * 1000; // 5 minutes in milliseconds
    let currentTime = new Date(startTime);
    let wasVisible = false;
    let passStart: Date | null = null;
    let passPositions: SatellitePosition[] = [];

    while (currentTime <= endTime) {
      const position = propagator.propagate(
        currentTime,
        this.observer.latitude,
        this.observer.longitude
      );

      if (position && position.elevation >= this.parameters.min_elevation_deg) {
        if (!wasVisible) {
          // Pass started
          passStart = new Date(currentTime);
          passPositions = [position];
          wasVisible = true;
        } else {
          passPositions.push(position);
        }
      } else {
        if (wasVisible && passStart) {
          // Pass ended - refine it
          const refinedPass = this.refinePass(
            propagator,
            passStart,
            currentTime
          );

          if (refinedPass) {
            passes.push(refinedPass);
          }

          wasVisible = false;
          passStart = null;
          passPositions = [];
        }
      }

      currentTime = new Date(currentTime.getTime() + coarseStep);
    }

    // Handle pass that extends beyond end time
    if (wasVisible && passStart) {
      const refinedPass = this.refinePass(
        propagator,
        passStart,
        endTime
      );

      if (refinedPass) {
        passes.push(refinedPass);
      }
    }

    return passes;
  }

  /**
   * Refine a pass with finer time resolution
   */
  private refinePass(
    propagator: SatellitePropagator,
    approxStart: Date,
    approxEnd: Date
  ): SatellitePass | null {
    const fineStep = 10 * 1000; // 10 seconds
    const positions: SatellitePosition[] = [];

    // Extend search window slightly
    const searchStart = new Date(approxStart.getTime() - 2 * 60 * 1000); // 2 min before
    const searchEnd = new Date(approxEnd.getTime() + 2 * 60 * 1000); // 2 min after

    let currentTime = searchStart;
    let maxElevation = 0;
    let maxElevationTime: Date | null = null;
    let maxElevationPosition: SatellitePosition | null = null;
    let passStartTime: Date | null = null;
    let passEndTime: Date | null = null;

    while (currentTime <= searchEnd) {
      const position = propagator.propagate(
        currentTime,
        this.observer.latitude,
        this.observer.longitude
      );

      if (position && position.elevation >= this.parameters.min_elevation_deg) {
        if (!passStartTime) {
          passStartTime = new Date(currentTime);
        }

        positions.push(position);
        passEndTime = new Date(currentTime);

        if (position.elevation > maxElevation) {
          maxElevation = position.elevation;
          maxElevationTime = new Date(currentTime);
          maxElevationPosition = position;
        }
      }

      currentTime = new Date(currentTime.getTime() + fineStep);
    }

    if (!passStartTime || !passEndTime || !maxElevationTime || !maxElevationPosition || positions.length < 2) {
      return null;
    }

    // Check distance constraint
    if (maxElevationPosition.distance > this.parameters.max_distance_km) {
      return null;
    }

    // Calculate visibility
    const visibility = propagator.calculateVisibility(
      maxElevationPosition,
      this.observer.latitude,
      this.observer.longitude
    );

    // Get start and movement directions
    const startPosition = positions[0];

    const startAzimuth = Math.round(startPosition.azimuth);
    const startDirection = azimuthToDirection(startAzimuth);

    // Calculate movement direction using middle position for clearer distinction
    let movementAzimuth: number | undefined;
    let movementDirection: string | undefined;

    if (positions.length >= 3) {
      // Use middle position to get clear movement direction
      const midIndex = Math.floor(positions.length / 2);
      const midPosition = positions[midIndex];
      movementAzimuth = Math.round(midPosition.azimuth);
      movementDirection = azimuthToDirection(movementAzimuth);
    } else if (positions.length >= 2) {
      // Use last position if only a few positions
      const lastPosition = positions[positions.length - 1];
      movementAzimuth = Math.round(lastPosition.azimuth);
      movementDirection = azimuthToDirection(movementAzimuth);
    }

    // Format times to local timezone (UTC+2)
    const tzOffset = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

    const formatLocal = (date: Date): string => {
      const local = new Date(date.getTime() + tzOffset);
      return local.toISOString().slice(0, -1); // Remove 'Z' since it's local
    };

    return {
      satellite: propagator.getName(),
      start_time_utc: passStartTime.toISOString(),
      start_time_local: formatLocal(passStartTime),
      max_elevation: Math.round(maxElevation),
      max_elevation_time_utc: maxElevationTime.toISOString(),
      max_elevation_time_local: formatLocal(maxElevationTime),
      end_time_utc: passEndTime.toISOString(),
      end_time_local: formatLocal(passEndTime),
      duration_seconds: Math.round((passEndTime.getTime() - passStartTime.getTime()) / 1000),
      max_distance_km: Math.round(maxElevationPosition.distance),
      positions: [], // Not storing positions to save memory
      visibility_rating: visibility.rating,
      visibility_category: visibility.category,
      start_azimuth: startAzimuth,
      start_direction: startDirection,
      movement_azimuth: movementAzimuth,
      movement_direction: movementDirection
    };
  }
}
