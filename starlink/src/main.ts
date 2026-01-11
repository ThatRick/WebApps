/**
 * Starlink Pass Tracker - Main Application
 */

import type { PassesData, PassCalculationProgress } from './types';
import { OrbitManager } from './orbit/orbitManager';

class StarlinkPassTracker {
  private passesData: PassesData | null = null;
  private countdownInterval: number | null = null;
  private orbitManager: OrbitManager | null = null;
  private useClientCalculation: boolean = false;

  constructor() {
    // Check URL parameter for client-side calculation mode
    const urlParams = new URLSearchParams(window.location.search);
    this.useClientCalculation = urlParams.get('calc') === 'client';

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadPasses();
    // Refresh every 10 minutes
    setInterval(() => this.loadPasses(), 600000);
  }

  private async loadPasses(): Promise<void> {
    try {
      if (this.useClientCalculation) {
        await this.loadAndCalculate();
      } else {
        await this.loadPreCalculated();
      }
      this.displayData();
    } catch (error) {
      console.error('Error loading passes:', error);
      this.showError();
    }
  }

  private async loadPreCalculated(): Promise<void> {
    console.log('Loading pre-calculated passes...');
    const response = await fetch('passes.json');
    if (!response.ok) throw new Error('Failed to load passes.json');
    const data: PassesData = await response.json();
    this.passesData = data;
    console.log(`Loaded ${data.total_passes} pre-calculated passes`);
  }

  private async loadAndCalculate(): Promise<void> {
    console.log('Using client-side orbit calculations...');

    // Show calculating message
    this.showCalculating();

    if (!this.orbitManager) {
      this.orbitManager = new OrbitManager();
    }

    // Load TLE data
    await this.orbitManager.loadTLEData();

    // Calculate passes with progress updates
    this.passesData = await this.orbitManager.calculatePasses(24, (progress) => {
      this.updateCalculationProgress(progress);
    });

    console.log(`Calculated ${this.passesData.total_passes} passes`);
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
    if (!this.passesData) return;

    const now = new Date();
    const futurePasses = this.passesData.passes.filter(
      p => new Date(p.start_time_utc) > now
    );

    if (futurePasses.length > 0) {
      const next = futurePasses[0];

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
    } else {
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

    if (satelliteEl) satelliteEl.textContent = 'Ei tulevia ylilentoja';
    if (timeEl) timeEl.textContent = '-';
    if (appearEl) appearEl.textContent = '';
    if (movementEl) movementEl.textContent = '';
    if (countdownEl) countdownEl.textContent = '';
    if (visibilityEl) visibilityEl.style.display = 'none';
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

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new StarlinkPassTracker());
} else {
  new StarlinkPassTracker();
}
