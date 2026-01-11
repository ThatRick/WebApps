"use strict";
(() => {
  // src/main.ts
  var StarlinkPassTracker = class {
    constructor() {
      this.passesData = null;
      this.countdownInterval = null;
      this.init();
    }
    async init() {
      await this.loadPasses();
      setInterval(() => this.loadPasses(), 6e5);
    }
    async loadPasses() {
      try {
        const response = await fetch("passes.json");
        if (!response.ok)
          throw new Error("Failed to load");
        this.passesData = await response.json();
        this.displayData();
      } catch (error) {
        console.error("Error loading passes:", error);
        this.showError();
      }
    }
    showError() {
      const loadingEl = document.getElementById("loading");
      const errorEl = document.getElementById("error");
      if (loadingEl)
        loadingEl.style.display = "none";
      if (errorEl)
        errorEl.style.display = "block";
    }
    displayData() {
      if (!this.passesData)
        return;
      const loadingEl = document.getElementById("loading");
      const contentEl = document.getElementById("content");
      if (loadingEl)
        loadingEl.style.display = "none";
      if (contentEl)
        contentEl.style.display = "block";
      this.displayInfoBar();
      this.displayStats();
      this.displayNextPass();
      this.displayPassesTable();
    }
    displayInfoBar() {
      if (!this.passesData)
        return;
      const obs = this.passesData.observer;
      const locationEl = document.getElementById("location");
      if (locationEl) {
        locationEl.textContent = `${obs.location_name} (${obs.latitude.toFixed(4)}\xB0N, ${obs.longitude.toFixed(4)}\xB0E)`;
      }
      const maxDistanceEl = document.getElementById("max-distance");
      if (maxDistanceEl) {
        maxDistanceEl.textContent = `${this.passesData.parameters.max_distance_km} km`;
      }
      const updatedEl = document.getElementById("updated");
      if (updatedEl) {
        const genDate = new Date(this.passesData.generated_at);
        updatedEl.textContent = genDate.toLocaleString("fi-FI");
      }
    }
    displayStats() {
      if (!this.passesData)
        return;
      const totalPassesEl = document.getElementById("total-passes");
      if (totalPassesEl) {
        totalPassesEl.textContent = this.passesData.total_passes.toString();
      }
      if (this.passesData.passes.length > 0) {
        const avgElev = this.passesData.passes.reduce((sum, p) => sum + p.max_elevation, 0) / this.passesData.passes.length;
        const avgElevEl = document.getElementById("avg-elevation");
        if (avgElevEl) {
          avgElevEl.textContent = `${avgElev.toFixed(1)}\xB0`;
        }
        const excellentCount = this.passesData.passes.filter(
          (p) => p.visibility_category === "Excellent"
        ).length;
        const excellentEl = document.getElementById("excellent-passes");
        if (excellentEl) {
          excellentEl.textContent = excellentCount.toString();
        }
      }
    }
    displayNextPass() {
      if (!this.passesData)
        return;
      const now = /* @__PURE__ */ new Date();
      const futurePasses = this.passesData.passes.filter(
        (p) => new Date(p.start_time_utc) > now
      );
      if (futurePasses.length > 0) {
        const next = futurePasses[0];
        const satelliteEl = document.getElementById("next-satellite");
        if (satelliteEl)
          satelliteEl.textContent = next.satellite;
        const timeEl = document.getElementById("next-time");
        if (timeEl)
          timeEl.textContent = this.formatTime(next.start_time_local);
        const appearEl = document.getElementById("next-appear");
        const movementEl = document.getElementById("next-movement");
        if (appearEl && next.start_direction && next.start_azimuth !== void 0) {
          appearEl.textContent = `\u{1F4CD} Ilmestyy: ${next.start_direction} (${next.start_azimuth}\xB0)`;
        }
        if (movementEl && next.movement_direction && next.movement_azimuth !== void 0) {
          movementEl.textContent = `\u279C Kulkusuunta: ${next.movement_direction} (${next.movement_azimuth}\xB0)`;
        }
        this.startCountdown(new Date(next.start_time_utc));
        const visibilityBadge = document.getElementById("next-visibility");
        if (visibilityBadge && next.visibility_category) {
          const category = next.visibility_category.toLowerCase();
          visibilityBadge.className = "visibility-badge visibility-" + category;
          const emoji = this.getVisibilityEmoji(category);
          visibilityBadge.textContent = `${emoji} N\xE4kyvyys: ${next.visibility_category}`;
          visibilityBadge.style.display = "inline-block";
        }
      } else {
        this.clearNextPass();
      }
    }
    clearNextPass() {
      const satelliteEl = document.getElementById("next-satellite");
      const timeEl = document.getElementById("next-time");
      const appearEl = document.getElementById("next-appear");
      const movementEl = document.getElementById("next-movement");
      const countdownEl = document.getElementById("countdown");
      const visibilityEl = document.getElementById("next-visibility");
      if (satelliteEl)
        satelliteEl.textContent = "Ei tulevia ylilentoja";
      if (timeEl)
        timeEl.textContent = "-";
      if (appearEl)
        appearEl.textContent = "";
      if (movementEl)
        movementEl.textContent = "";
      if (countdownEl)
        countdownEl.textContent = "";
      if (visibilityEl)
        visibilityEl.style.display = "none";
    }
    displayPassesTable() {
      if (!this.passesData)
        return;
      const tbody = document.getElementById("passes-body");
      if (!tbody)
        return;
      tbody.innerHTML = "";
      const now = /* @__PURE__ */ new Date();
      let displayIndex = 0;
      this.passesData.passes.forEach((pass) => {
        const startTime = new Date(pass.start_time_utc);
        const isPast = startTime < now;
        if (isPast)
          return;
        displayIndex++;
        const row = document.createElement("tr");
        const elevClass = this.getElevationClass(pass.max_elevation);
        const visibilityCategory = (pass.visibility_category || "Unknown").toLowerCase();
        const visibilityClass = `visibility-${visibilityCategory}`;
        const visibilityEmoji = this.getVisibilityEmoji(visibilityCategory);
        const appearDir = pass.start_direction || "N";
        const appearAz = pass.start_azimuth || 0;
        const moveDir = pass.movement_direction || "N";
        const moveAz = pass.movement_azimuth || 0;
        row.innerHTML = `
        <td>${displayIndex}</td>
        <td class="satellite-name-cell">${pass.satellite}</td>
        <td class="time-cell">${this.formatTime(pass.start_time_local)}</td>
        <td><strong>${appearDir}</strong> ${appearAz}\xB0</td>
        <td><strong>${moveDir}</strong> ${moveAz}\xB0</td>
        <td class="${elevClass}">${pass.max_elevation}\xB0</td>
        <td class="${visibilityClass}">${visibilityEmoji} ${pass.visibility_category || "N/A"}</td>
      `;
        tbody.appendChild(row);
      });
    }
    getElevationClass(elevation) {
      if (elevation >= 60)
        return "elevation-high";
      if (elevation >= 30)
        return "elevation-medium";
      return "elevation-low";
    }
    getVisibilityEmoji(category) {
      switch (category) {
        case "excellent":
          return "\u2605";
        case "good":
          return "\u25D0";
        case "fair":
          return "\u25D4";
        default:
          return "\u25CB";
      }
    }
    formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleString("fi-FI", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    startCountdown(targetDate) {
      if (this.countdownInterval !== null) {
        clearInterval(this.countdownInterval);
      }
      const update = () => {
        const now = /* @__PURE__ */ new Date();
        const diff = targetDate.getTime() - now.getTime();
        const countdownEl = document.getElementById("countdown");
        if (!countdownEl)
          return;
        if (diff <= 0) {
          countdownEl.textContent = "NYT!";
          if (this.countdownInterval !== null) {
            clearInterval(this.countdownInterval);
          }
          setTimeout(() => this.loadPasses(), 6e4);
          return;
        }
        const hours = Math.floor(diff / 36e5);
        const minutes = Math.floor(diff % 36e5 / 6e4);
        const seconds = Math.floor(diff % 6e4 / 1e3);
        countdownEl.textContent = `${hours}h ${minutes}min ${seconds}s`;
      };
      update();
      this.countdownInterval = window.setInterval(update, 1e3);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new StarlinkPassTracker());
  } else {
    new StarlinkPassTracker();
  }
})();
