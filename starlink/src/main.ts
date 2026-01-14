/**
 * Starlink Pass Tracker - Main Application
 */

import type { PassesData, PassCalculationProgress } from './types';
import { OrbitManager } from './orbit/orbitManager';

// Build timestamp - updated on each build
const BUILD_TIME = new Date().toISOString();

class DebugLogger {
  private logElement: HTMLElement | null = null;

  constructor() {
    this.logElement = document.getElementById('debug-log');
    this.showBuildTime();
  }

  private showBuildTime(): void {
    const buildTimeEl = document.getElementById('build-time');
    if (buildTimeEl) {
      const buildDate = new Date(BUILD_TIME);
      buildTimeEl.textContent = `Built: ${buildDate.toLocaleString('fi-FI')}`;
    }
  }

  log(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    console.log(`[${type.toUpperCase()}] ${message}`);

    if (this.logElement) {
      const entry = document.createElement('div');
      entry.className = `debug-entry ${type}`;
      const timestamp = new Date().toLocaleTimeString('fi-FI');
      entry.textContent = `[${timestamp}] ${message}`;
      this.logElement.appendChild(entry);

      // Auto-scroll to bottom
      this.logElement.scrollTop = this.logElement.scrollHeight;

      // Limit to 100 entries
      while (this.logElement.children.length > 100) {
        this.logElement.removeChild(this.logElement.firstChild!);
      }
    }
  }
}

const debugLogger = new DebugLogger();

class StarlinkPassTracker {
  private passesData: PassesData | null = null;
  private countdownInterval: number | null = null;
  private positionInterval: number | null = null;
  private orbitManager: OrbitManager | null = null;
  private useClientCalculation: boolean = false;
  private nextSatelliteName: string | null = null;

  constructor() {
    // Check URL parameter for calculation mode
    // Default to server-side (pre-calculated), can override with ?calc=client
    const urlParams = new URLSearchParams(window.location.search);
    this.useClientCalculation = urlParams.get('calc') === 'client';

    debugLogger.log(`Initialization: Using ${this.useClientCalculation ? 'client-side' : 'server-side'} calculation`, 'info');
    this.updateCalcModeBadge();
    this.init();
  }

  private updateCalcModeBadge(): void {
    const badge = document.getElementById('calc-mode-badge');
    if (!badge) return;

    if (this.useClientCalculation) {
      badge.className = 'status-badge status-client';
      badge.textContent = '⚙️ Client';
    } else {
      badge.className = 'status-badge status-server';
      badge.textContent = '⚙️ Palvelin';
    }
  }

  private updateTLEStatusBadge(status: 'loading' | 'ready' | 'error' | 'hidden'): void {
    const badge = document.getElementById('tle-status-badge');
    if (!badge) return;

    if (status === 'hidden') {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'inline-flex';

    switch (status) {
      case 'loading':
        badge.className = 'status-badge status-loading';
        badge.textContent = '📡 Ladataan TLE...';
        break;
      case 'ready':
        badge.className = 'status-badge status-ready';
        badge.textContent = '✓ Reaaliaikainen seuranta';
        break;
      case 'error':
        badge.className = 'status-badge status-error';
        badge.textContent = '⚠️ TLE lataus epäonnistui';
        break;
    }
  }

  private async init(): Promise<void> {
    await this.loadPasses();
    // Refresh every 10 minutes
    setInterval(() => this.loadPasses(), 600000);
  }

  private async loadPasses(): Promise<void> {
    try {
      debugLogger.log('Loading passes...', 'info');
      if (this.useClientCalculation) {
        await this.loadAndCalculate();
      } else {
        await this.loadPreCalculated();
      }
      debugLogger.log(`Loaded ${this.passesData?.total_passes || 0} passes`, 'info');
      this.displayData();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.log(`Error loading passes: ${errorMsg}`, 'error');
      console.error('Error loading passes:', error);
      this.showError();
    }
  }

  private async loadPreCalculated(): Promise<void> {
    debugLogger.log('Fetching pre-calculated passes.json...', 'info');
    const response = await fetch('passes.json');
    if (!response.ok) throw new Error(`Failed to load passes.json: ${response.status} ${response.statusText}`);
    const data: PassesData = await response.json();
    this.passesData = data;
    debugLogger.log(`Loaded ${data.total_passes} pre-calculated passes`, 'info');

    // Load TLE data in background for real-time tracking
    this.loadTLEDataInBackground();
  }

  private async loadTLEDataInBackground(): Promise<void> {
    try {
      this.updateTLEStatusBadge('loading');
      debugLogger.log('Loading TLE data in background for real-time tracking...', 'info');
      if (!this.orbitManager) {
        this.orbitManager = new OrbitManager();
      }
      await this.orbitManager.loadTLEData();
      debugLogger.log('TLE data loaded, enabling real-time tracking', 'info');
      this.updateTLEStatusBadge('ready');

      // Enable position tracking for the next satellite if available
      if (this.nextSatelliteName) {
        this.startPositionTracking();
      }
    } catch (error) {
      debugLogger.log('Failed to load TLE data for real-time tracking (continuing without it)', 'warn');
      console.warn('TLE data load failed:', error);
      this.updateTLEStatusBadge('error');
    }
  }

  private async loadAndCalculate(): Promise<void> {
    debugLogger.log('Starting client-side orbit calculations...', 'info');

    // Show calculating message
    this.showCalculating();

    if (!this.orbitManager) {
      this.orbitManager = new OrbitManager();
    }

    // Load TLE data
    this.updateTLEStatusBadge('loading');
    debugLogger.log('Loading TLE dataset...', 'info');
    try {
      await this.orbitManager.loadTLEData();
      debugLogger.log('TLE data loaded successfully', 'info');
      this.updateTLEStatusBadge('ready');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.log(`Failed to load TLE data: ${errorMsg}`, 'error');
      this.updateTLEStatusBadge('error');
      throw error;
    }

    // Calculate passes with progress updates
    debugLogger.log('Calculating satellite passes...', 'info');
    this.passesData = await this.orbitManager.calculatePasses(24, (progress) => {
      this.updateCalculationProgress(progress);
    });

    debugLogger.log(`Calculated ${this.passesData.total_passes} passes`, 'info');
  }

  private showCalculating(): void {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      const message = loadingEl.querySelector('p');
      if (message) {
        message.textContent = 'Lasketaan satelliittien ylilentoja...';
      }
    }
  }

  private updateCalculationProgress(progress: PassCalculationProgress): void {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      const message = loadingEl.querySelector('p');
      if (message) {
        const percent = ((progress.satellitesProcessed / progress.totalSatellites) * 100).toFixed(0);
        message.textContent = `Lasketaan: ${progress.satellitesProcessed}/${progress.totalSatellites} satelliittia (${percent}%) - ${progress.passesFound} ylilentoa löydetty`;
      }
    }
  }

  private showError(): void {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
  }

  private displayData(): void {
    if (!this.passesData) return;

    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    this.displayInfoBar();
    this.displayStats();
    this.displayNextPass();
    this.displayPassesTable();
  }

  private displayInfoBar(): void {
    if (!this.passesData) return;

    const obs = this.passesData.observer;
    const locationEl = document.getElementById('location');
    if (locationEl) {
      locationEl.textContent =
        `${obs.location_name} (${obs.latitude.toFixed(4)}°N, ${obs.longitude.toFixed(4)}°E)`;
    }

    const maxDistanceEl = document.getElementById('max-distance');
    if (maxDistanceEl) {
      maxDistanceEl.textContent = `${this.passesData.parameters.max_distance_km} km`;
    }

    const updatedEl = document.getElementById('updated');
    if (updatedEl) {
      const genDate = new Date(this.passesData.generated_at);
      updatedEl.textContent = genDate.toLocaleString('fi-FI');
    }
  }

  private displayStats(): void {
    if (!this.passesData) return;

    const totalPassesEl = document.getElementById('total-passes');
    if (totalPassesEl) {
      totalPassesEl.textContent = this.passesData.total_passes.toString();
    }

    if (this.passesData.passes.length > 0) {
      const avgElev = this.passesData.passes.reduce((sum, p) => sum + p.max_elevation, 0) /
                      this.passesData.passes.length;
      const avgElevEl = document.getElementById('avg-elevation');
      if (avgElevEl) {
        avgElevEl.textContent = `${avgElev.toFixed(1)}°`;
      }

      const excellentCount = this.passesData.passes.filter(
        p => p.visibility_category === 'Excellent'
      ).length;
      const excellentEl = document.getElementById('excellent-passes');
      if (excellentEl) {
        excellentEl.textContent = excellentCount.toString();
      }
    }
  }

  private displayNextPass(): void {
    if (!this.passesData) {
      debugLogger.log('displayNextPass: No passes data available', 'warn');
      return;
    }

    const now = new Date();
    debugLogger.log(`displayNextPass: Current time: ${now.toISOString()}`, 'info');
    debugLogger.log(`displayNextPass: Total passes in dataset: ${this.passesData.passes.length}`, 'info');

    const futurePasses = this.passesData.passes.filter(
      p => new Date(p.start_time_utc) > now
    );

    debugLogger.log(`displayNextPass: Future passes found: ${futurePasses.length}`, 'info');

    if (futurePasses.length > 0) {
      const next = futurePasses[0];
      debugLogger.log(`Next pass: ${next.satellite} at ${next.start_time_utc}`, 'info');

      const satelliteEl = document.getElementById('next-satellite');
      if (satelliteEl) satelliteEl.textContent = next.satellite;

      const timeEl = document.getElementById('next-time');
      if (timeEl) timeEl.textContent = this.formatTime(next.start_time_local);

      // Show directions
      const appearEl = document.getElementById('next-appear');
      const movementEl = document.getElementById('next-movement');
      if (appearEl && next.start_direction && next.start_azimuth !== undefined) {
        appearEl.textContent = `📍 Ilmestyy: ${next.start_direction} (${next.start_azimuth}°)`;
      }
      if (movementEl && next.movement_direction && next.movement_azimuth !== undefined) {
        movementEl.textContent = `➜ Kulkusuunta: ${next.movement_direction} (${next.movement_azimuth}°)`;
      }

      this.startCountdown(new Date(next.start_time_utc));

      // Show visibility
      const visibilityBadge = document.getElementById('next-visibility');
      if (visibilityBadge && next.visibility_category) {
        const category = next.visibility_category.toLowerCase();
        visibilityBadge.className = 'visibility-badge visibility-' + category;
        const emoji = this.getVisibilityEmoji(category);
        visibilityBadge.textContent = `${emoji} Näkyvyys: ${next.visibility_category}`;
        visibilityBadge.style.display = 'inline-block';
      }

      // Show pass data (max elevation and max distance from pass calculation)
      const elevationEl = document.getElementById('next-elevation');
      const distanceEl = document.getElementById('next-distance');

      if (elevationEl && next.max_elevation !== undefined) {
        const elevClass = next.max_elevation < 30 ? 'elevation-low' :
                         next.max_elevation >= 60 ? 'elevation-high' : 'elevation-medium';
        elevationEl.innerHTML = `📐 Elevaatio: <span class="${elevClass}">${next.max_elevation}°</span>`;
      }

      if (distanceEl && next.max_distance_km !== undefined) {
        distanceEl.textContent = `📏 Etäisyys: ${next.max_distance_km} km`;
      }

      // Start real-time position tracking if orbit manager is available
      this.nextSatelliteName = next.satellite;
      if (this.orbitManager) {
        this.startPositionTracking();
      }
    } else {
      debugLogger.log('No future passes available', 'warn');
      if (this.passesData.passes.length > 0) {
        const lastPass = this.passesData.passes[this.passesData.passes.length - 1];
        debugLogger.log(`Last pass was: ${lastPass.satellite} at ${lastPass.start_time_utc}`, 'info');
      }
      this.clearNextPass();
    }
  }

  private clearNextPass(): void {
    const satelliteEl = document.getElementById('next-satellite');
    const timeEl = document.getElementById('next-time');
    const appearEl = document.getElementById('next-appear');
    const movementEl = document.getElementById('next-movement');
    const countdownEl = document.getElementById('countdown');
    const visibilityEl = document.getElementById('next-visibility');
    const elevationEl = document.getElementById('next-elevation');
    const distanceEl = document.getElementById('next-distance');

    if (satelliteEl) satelliteEl.textContent = 'Ei tulevia ylilentoja';
    if (timeEl) timeEl.textContent = '-';
    if (appearEl) appearEl.textContent = '';
    if (movementEl) movementEl.textContent = '';
    if (countdownEl) countdownEl.textContent = '';
    if (visibilityEl) visibilityEl.style.display = 'none';
    if (elevationEl) elevationEl.textContent = '';
    if (distanceEl) distanceEl.textContent = '';

    // Stop position tracking
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
    this.nextSatelliteName = null;
  }

  private startPositionTracking(): void {
    // Clear existing interval
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
    }

    // Update immediately
    this.updateSatellitePosition();

    // Update every second
    this.positionInterval = window.setInterval(() => {
      this.updateSatellitePosition();
    }, 1000);
  }

  private updateSatellitePosition(): void {
    if (!this.orbitManager || !this.nextSatelliteName) return;

    const position = this.orbitManager.getSatellitePosition(this.nextSatelliteName);
    if (!position) return;

    // Only update display with real-time position if satellite is visible (elevation > 0)
    // Otherwise keep showing the pass data (max elevation/distance)
    if (position.elevation > 0) {
      const elevationEl = document.getElementById('next-elevation');
      const distanceEl = document.getElementById('next-distance');

      if (elevationEl) {
        const elevClass = position.elevation >= 60 ? 'elevation-high' :
                         position.elevation >= 30 ? 'elevation-medium' : 'elevation-low';
        elevationEl.innerHTML = `📐 Elevaatio: <span class="${elevClass}">${position.elevation.toFixed(1)}°</span> <span class="text-secondary">(live)</span>`;
      }

      if (distanceEl) {
        distanceEl.textContent = `📏 Etäisyys: ${Math.round(position.distance)} km`;
      }
    }
  }

  private displayPassesTable(): void {
    if (!this.passesData) return;

    const tbody = document.getElementById('passes-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const now = new Date();
    let displayIndex = 0;

    this.passesData.passes.forEach((pass) => {
      const startTime = new Date(pass.start_time_utc);
      const isPast = startTime < now;

      // Hide past passes
      if (isPast) return;

      displayIndex++;
      const row = document.createElement('tr');

      const elevClass = this.getElevationClass(pass.max_elevation);
      const visibilityCategory = (pass.visibility_category || 'Unknown').toLowerCase();
      const visibilityClass = `visibility-${visibilityCategory}`;
      const visibilityEmoji = this.getVisibilityEmoji(visibilityCategory);

      const appearDir = pass.start_direction || 'N';
      const appearAz = pass.start_azimuth || 0;
      const moveDir = pass.movement_direction || 'N';
      const moveAz = pass.movement_azimuth || 0;

      row.innerHTML = `
        <td>${displayIndex}</td>
        <td class="satellite-name-cell">${pass.satellite}</td>
        <td class="time-cell">${this.formatTime(pass.start_time_local)}</td>
        <td><strong>${appearDir}</strong> ${appearAz}°</td>
        <td><strong>${moveDir}</strong> ${moveAz}°</td>
        <td class="${elevClass}">${pass.max_elevation}°</td>
        <td class="${visibilityClass}">${visibilityEmoji} ${pass.visibility_category || 'N/A'}</td>
      `;
      tbody.appendChild(row);
    });
  }

  private getElevationClass(elevation: number): string {
    if (elevation >= 60) return 'elevation-high';
    if (elevation >= 30) return 'elevation-medium';
    return 'elevation-low';
  }

  private getVisibilityEmoji(category: string): string {
    switch (category) {
      case 'excellent': return '★';
      case 'good': return '◐';
      case 'fair': return '◔';
      default: return '○';
    }
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('fi-FI', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private startCountdown(targetDate: Date): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
    }

    const update = (): void => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();

      const countdownEl = document.getElementById('countdown');
      if (!countdownEl) return;

      if (diff <= 0) {
        countdownEl.textContent = 'NYT!';
        if (this.countdownInterval !== null) {
          clearInterval(this.countdownInterval);
        }
        // Reload after pass
        setTimeout(() => this.loadPasses(), 60000);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      countdownEl.textContent = `${hours}h ${minutes}min ${seconds}s`;
    };

    update();
    this.countdownInterval = window.setInterval(update, 1000);
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  debugLogger.log(`Uncaught error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  debugLogger.log(`Unhandled promise rejection: ${event.reason}`, 'error');
});

// Initialize the app when DOM is ready
debugLogger.log('DOM ready, initializing app...', 'info');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    debugLogger.log('DOMContentLoaded event fired', 'info');
    new StarlinkPassTracker();
  });
} else {
  debugLogger.log('DOM already loaded', 'info');
  new StarlinkPassTracker();
}
