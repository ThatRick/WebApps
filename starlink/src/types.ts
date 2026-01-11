/**
 * TypeScript interfaces for Starlink Pass Tracker
 */

export interface Observer {
  latitude: number;
  longitude: number;
  elevation_m: number;
  location_name: string;
}

export interface Parameters {
  min_elevation_deg: number;
  max_distance_km: number;
  hours_ahead: number;
}

export interface SatellitePass {
  satellite: string;
  start_time_utc: string;
  start_time_local: string;
  max_elevation: number;
  max_elevation_time_utc: string;
  max_elevation_time_local: string;
  end_time_utc: string;
  end_time_local: string;
  duration_seconds: number;
  max_distance_km: number;
  positions: Array<[string, number, number, number, number]>; // [time, lat, lon, alt, elev]
  visibility_rating: number;
  visibility_category: string;
  start_azimuth: number;
  start_direction: string;
  movement_azimuth?: number;
  movement_direction?: string;
}

export interface PassesData {
  observer: Observer;
  parameters: Parameters;
  generated_at: string;
  total_passes: number;
  passes: SatellitePass[];
}

export interface CountdownTime {
  hours: number;
  minutes: number;
  seconds: number;
}
