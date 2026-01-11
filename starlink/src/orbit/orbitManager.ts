/**
 * Orbit Manager - Handles TLE data loading and pass calculations
 */

import { PassCalculator } from './calculator';
import type {
  TLEDataset,
  PassesData,
  SatellitePass,
  PassCalculationProgress
} from '../types';

export class OrbitManager {
  private tleDataset: TLEDataset | null = null;
  private calculatedPasses: SatellitePass[] = [];

  /**
   * Load TLE dataset from server
   */
  async loadTLEData(): Promise<TLEDataset> {
    console.log('Loading TLE dataset...');
    const response = await fetch('starlink-tle-data.json');

    if (!response.ok) {
      throw new Error(`Failed to load TLE data: ${response.statusText}`);
    }

    const dataset: TLEDataset = await response.json();
    this.tleDataset = dataset;
    console.log(`Loaded ${dataset.total_satellites} satellites`);

    return dataset;
  }

  /**
   * Calculate satellite passes from TLE data
   */
  async calculatePasses(
    hoursAhead: number = 24,
    onProgress?: (progress: PassCalculationProgress) => void
  ): Promise<PassesData> {
    if (!this.tleDataset) {
      throw new Error('TLE dataset not loaded');
    }

    console.log('Calculating satellite passes...');
    const startTime = performance.now();

    const calculator = new PassCalculator(
      this.tleDataset.observer,
      this.tleDataset.parameters
    );

    const now = new Date();
    const endTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    this.calculatedPasses = [];

    // Calculate passes for all satellites
    for await (const pass of calculator.findPasses(
      this.tleDataset.satellites,
      now,
      endTime,
      onProgress
    )) {
      this.calculatedPasses.push(pass);
    }

    // Sort by start time
    this.calculatedPasses.sort((a, b) =>
      new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime()
    );

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`Calculated ${this.calculatedPasses.length} passes in ${elapsed}s`);

    return this.getPassesData();
  }

  /**
   * Get calculated passes in PassesData format
   */
  getPassesData(): PassesData {
    if (!this.tleDataset) {
      throw new Error('TLE dataset not loaded');
    }

    return {
      observer: this.tleDataset.observer,
      parameters: this.tleDataset.parameters,
      generated_at: new Date().toISOString(),
      total_passes: this.calculatedPasses.length,
      passes: this.calculatedPasses
    };
  }

  /**
   * Check if TLE data is expired
   */
  isTLEDataExpired(): boolean {
    if (!this.tleDataset) return true;

    const expiresAt = new Date(this.tleDataset.cache_expires_at);
    return new Date() > expiresAt;
  }
}
