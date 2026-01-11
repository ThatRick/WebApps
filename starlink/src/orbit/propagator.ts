/**
 * Satellite orbit propagator using satellite.js
 * Wraps SGP4 calculations with a clean interface
 */

import * as satellite from 'satellite.js';
import {
  calculateElevation,
  calculateAzimuth,
  calculateGroundDistance
} from './coordinates';
import { calculateSolarPosition, isSatelliteIlluminated, calculateVisibilityRating } from './solar';
import type { SatellitePosition, TLEData, OrbitalElements, VisibilityInfo } from '../types';

export class SatellitePropagator {
  private satrec: satellite.SatRec | null = null;
  private name: string;
  private noradId: string;

  constructor(tleData: TLEData) {
    this.name = tleData.name;
    this.noradId = tleData.norad_id;

    try {
      this.satrec = satellite.twoline2satrec(tleData.line1, tleData.line2);

      if (this.satrec.error) {
        console.warn(`Failed to parse TLE for ${this.name}: error ${this.satrec.error}`);
        this.satrec = null;
      }
    } catch (error) {
      console.error(`Exception parsing TLE for ${this.name}:`, error);
      this.satrec = null;
    }
  }

  /**
   * Check if propagator is valid
   */
  isValid(): boolean {
    return this.satrec !== null;
  }

  /**
   * Get satellite name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get NORAD ID
   */
  getNoradId(): string {
    return this.noradId;
  }

  /**
   * Get orbital elements from TLE
   */
  getOrbitalElements(): OrbitalElements | null {
    if (!this.satrec) return null;

    return {
      inclination: satellite.radiansToDegrees(this.satrec.inclo),
      meanMotion: this.satrec.no * 1440 / (2 * Math.PI), // Convert rad/min to rev/day
      eccentricity: this.satrec.ecco,
      period: (2 * Math.PI) / this.satrec.no // minutes
    };
  }

  /**
   * Propagate satellite to a specific time and calculate position relative to observer
   */
  propagate(date: Date, observerLat: number, observerLon: number): SatellitePosition | null {
    if (!this.satrec) return null;

    try {
      // Propagate satellite position
      const positionAndVelocity = satellite.propagate(this.satrec, date);

      // Check for errors (satellite.js returns false on error)
      if (!positionAndVelocity || !positionAndVelocity.position) {
        return null;
      }

      const positionEci = positionAndVelocity.position as satellite.EciVec3<number>;

      // Convert ECI to geodetic coordinates
      const gmst = satellite.gstime(date);
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);

      const satLat = satellite.degreesLat(positionGd.latitude);
      const satLon = satellite.degreesLong(positionGd.longitude);
      const satAlt = positionGd.height; // km

      // Calculate observer-relative values
      const elevation = calculateElevation(satLat, satLon, satAlt, observerLat, observerLon);
      const azimuth = calculateAzimuth(satLat, satLon, observerLat, observerLon);
      const distance = calculateGroundDistance(satLat, satLon, satAlt, observerLat, observerLon);

      return {
        latitude: satLat,
        longitude: satLon,
        altitude: satAlt,
        elevation,
        azimuth,
        distance,
        time: date
      };
    } catch (error) {
      console.error(`Propagation error for ${this.name} at ${date}:`, error);
      return null;
    }
  }

  /**
   * Calculate visibility information for a satellite position
   */
  calculateVisibility(
    position: SatellitePosition,
    observerLat: number,
    observerLon: number
  ): VisibilityInfo {
    const [sunElevation] = calculateSolarPosition(position.time, observerLat, observerLon);
    const satIlluminated = isSatelliteIlluminated(position.altitude, sunElevation);

    return calculateVisibilityRating(sunElevation, satIlluminated, position.elevation);
  }

  /**
   * Fast check if satellite could possibly be visible from observer location
   * Uses orbital parameters without full propagation
   */
  couldBeVisible(observerLat: number): boolean {
    if (!this.satrec) return false;

    const elements = this.getOrbitalElements();
    if (!elements) return false;

    // Check if satellite's orbital inclination allows it to pass over observer
    // For a satellite to be visible, its inclination must be >= observer's latitude
    // or <= 180 - observer's latitude (retrograde orbit)
    const absLat = Math.abs(observerLat);

    if (elements.inclination >= absLat && elements.inclination <= 180 - absLat) {
      return true;
    }
    if (elements.inclination >= 180 - absLat || elements.inclination <= absLat) {
      return true;
    }

    return false;
  }
}
