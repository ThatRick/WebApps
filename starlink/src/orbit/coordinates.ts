/**
 * Coordinate transformations and geometric calculations
 * Ported from Python starlink_pass_calculator.py
 */

const EARTH_RADIUS_KM = 6371.0;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

export function radToDeg(rad: number): number {
  return (rad * 180.0) / Math.PI;
}

/**
 * Calculate great circle distance between two points on Earth using Haversine formula
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = degToRad(lat1);
  const lon1Rad = degToRad(lon1);
  const lat2Rad = degToRad(lat2);
  const lon2Rad = degToRad(lon2);

  const dlat = lat2Rad - lat1Rad;
  const dlon = lon2Rad - lon1Rad;

  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate 3D distance from satellite to observer
 */
export function calculateGroundDistance(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number
): number {
  const groundDist = haversineDistance(satLat, satLon, obsLat, obsLon);
  const distance = Math.sqrt(groundDist ** 2 + satAlt ** 2);
  return distance;
}

/**
 * Calculate elevation angle of satellite from observer's perspective
 */
export function calculateElevation(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number
): number {
  const groundDist = haversineDistance(satLat, satLon, obsLat, obsLon);

  if (groundDist < 0.1) {
    return 90.0;
  }

  const elevation = radToDeg(Math.atan2(satAlt, groundDist));
  return elevation;
}

/**
 * Calculate azimuth (bearing) from observer to satellite
 * Returns angle in degrees (0° = north, 90° = east, 180° = south, 270° = west)
 */
export function calculateAzimuth(
  satLat: number,
  satLon: number,
  obsLat: number,
  obsLon: number
): number {
  const obsLatRad = degToRad(obsLat);
  const satLatRad = degToRad(satLat);
  const dlonRad = degToRad(satLon - obsLon);

  const y = Math.sin(dlonRad) * Math.cos(satLatRad);
  const x =
    Math.cos(obsLatRad) * Math.sin(satLatRad) -
    Math.sin(obsLatRad) * Math.cos(satLatRad) * Math.cos(dlonRad);

  const azimuthRad = Math.atan2(y, x);
  const azimuth = (radToDeg(azimuthRad) + 360) % 360;

  return azimuth;
}

/**
 * Convert azimuth to compass direction (N, NE, E, SE, S, SW, W, NW)
 */
export function azimuthToDirection(azimuth: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.floor((azimuth + 22.5) / 45) % 8;
  return directions[index];
}

/**
 * Calculate Julian Date for a given date/time
 */
export function julianDate(date: Date): number {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1; // JavaScript months are 0-indexed
  const day =
    date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400;

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);

  const jd =
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5;

  return jd;
}

/**
 * Calculate Greenwich Mean Sidereal Time (GMST) in radians
 */
export function gmst(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0;
  let gmstDeg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  gmstDeg = gmstDeg % 360;
  if (gmstDeg < 0) gmstDeg += 360;
  return degToRad(gmstDeg);
}
