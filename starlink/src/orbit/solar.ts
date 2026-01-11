/**
 * Solar position and visibility calculations
 * Ported from Python starlink_pass_calculator.py
 */

import { julianDate, gmst, degToRad, radToDeg } from './coordinates';
import type { VisibilityInfo } from '../types';

const EARTH_RADIUS_KM = 6371.0;

/**
 * Calculate sun's position (elevation and azimuth) for given location and time
 * Returns [elevation, azimuth] in degrees
 */
export function calculateSolarPosition(
  date: Date,
  lat: number,
  lon: number
): [number, number] {
  const jd = julianDate(date);
  const n = jd - 2451545.0;

  // Mean longitude of sun
  const L = (280.460 + 0.9856474 * n) % 360;

  // Mean anomaly
  const g = degToRad((357.528 + 0.9856003 * n) % 360);

  // Ecliptic longitude
  const lambdaSun = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);

  // Obliquity of ecliptic
  const epsilon = degToRad(23.439 - 0.0000004 * n);

  // Right ascension and declination
  const lambdaRad = degToRad(lambdaSun);
  const alpha = radToDeg(
    Math.atan2(Math.cos(epsilon) * Math.sin(lambdaRad), Math.cos(lambdaRad))
  );
  const delta = radToDeg(Math.asin(Math.sin(epsilon) * Math.sin(lambdaRad)));

  // Local hour angle
  const gmstDeg = (radToDeg(gmst(jd)) % 360);
  const lha = (gmstDeg + lon - alpha) % 360;

  // Convert to horizontal coordinates
  const latRad = degToRad(lat);
  const deltaRad = degToRad(delta);
  const lhaRad = degToRad(lha);

  // Elevation
  const sinAlt =
    Math.sin(latRad) * Math.sin(deltaRad) +
    Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(lhaRad);
  const elevation = radToDeg(Math.asin(sinAlt));

  // Azimuth
  let cosAz =
    (Math.sin(deltaRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));
  cosAz = Math.max(-1, Math.min(1, cosAz)); // Clamp to [-1, 1]
  let azimuth = radToDeg(Math.acos(cosAz));

  if (Math.sin(lhaRad) > 0) {
    azimuth = 360 - azimuth;
  }

  return [elevation, azimuth];
}

/**
 * Determine if satellite is illuminated by the sun
 */
export function isSatelliteIlluminated(
  satAlt: number,
  sunElevation: number
): boolean {
  // Calculate Earth's shadow angle from satellite's perspective
  const earthShadowAngle = -Math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + satAlt)) * (180 / Math.PI);

  // Satellite is illuminated if sun is above the shadow angle
  return sunElevation > earthShadowAngle;
}

/**
 * Calculate visibility rating (0-100) and category
 *
 * Best viewing conditions:
 * - Observer is in darkness (sun below horizon)
 * - Satellite is illuminated by sun
 * - Satellite is high in the sky
 */
export function calculateVisibilityRating(
  sunElevation: number,
  satIlluminated: boolean,
  satElevation: number
): VisibilityInfo {
  if (!satIlluminated) {
    return {
      rating: 0,
      category: 'Poor',
      isIlluminated: false,
      sunElevation
    };
  }

  // Base rating on observer darkness and satellite elevation
  let rating = 0;

  // Observer darkness component (0-50 points)
  // Best: -18° (astronomical twilight) or darker
  // Civil twilight: -6°, Nautical: -12°, Astronomical: -18°
  if (sunElevation <= -18) {
    rating += 50; // Excellent darkness
  } else if (sunElevation <= -12) {
    rating += 40; // Good darkness (nautical twilight)
  } else if (sunElevation <= -6) {
    rating += 25; // Fair darkness (civil twilight)
  } else if (sunElevation < 0) {
    rating += 10; // Marginal (near sunset/sunrise)
  }

  // Satellite elevation component (0-50 points)
  // Higher elevation = better visibility
  rating += Math.min(50, (satElevation / 90) * 50);

  // Determine category
  let category: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  if (rating >= 75) {
    category = 'Excellent';
  } else if (rating >= 50) {
    category = 'Good';
  } else if (rating >= 25) {
    category = 'Fair';
  } else {
    category = 'Poor';
  }

  return {
    rating: Math.round(rating),
    category,
    isIlluminated: satIlluminated,
    sunElevation
  };
}
