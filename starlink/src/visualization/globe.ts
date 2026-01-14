/**
 * 3D Globe Visualization using Three.js
 * Shows Earth, observer location, and satellite position in real-time
 */

import * as THREE from 'three';
import type { SatellitePosition } from '../types';

export class GlobeVisualization {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private earth: THREE.Mesh;
  private satelliteMesh: THREE.Mesh | null = null;
  private observerMesh: THREE.Mesh | null = null;
  private container: HTMLElement;
  private animationId: number | null = null;
  private mouseDown: boolean = false;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private targetRotationX: number = 0;
  private targetRotationY: number = 0;
  private rotationX: number = 0;
  private rotationY: number = 0;
  private lastTouchDistance: number = 0;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000510);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 15;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Create Earth
    this.earth = this.createEarth();
    this.scene.add(this.earth);

    // Add lights
    this.addLights();

    // Add stars
    this.addStars();

    // Setup mouse and touch controls
    this.setupControls();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start animation
    this.animate();
  }

  private createEarth(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(5, 64, 64);

    // Create a simple Earth material with continents
    const material = new THREE.MeshPhongMaterial({
      color: 0x2233ff,
      emissive: 0x112244,
      specular: 0x333333,
      shininess: 25,
      wireframe: false
    });

    const earth = new THREE.Mesh(geometry, material);

    // Add simple latitude/longitude grid
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      opacity: 0.3,
      transparent: true
    });

    // Latitude lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (90 - lat) * Math.PI / 180;
      const radius = 5 * Math.sin(phi);
      const y = 5 * Math.cos(phi);

      const points = [];
      for (let lon = 0; lon <= 360; lon += 10) {
        const theta = lon * Math.PI / 180;
        points.push(new THREE.Vector3(
          radius * Math.cos(theta),
          y,
          radius * Math.sin(theta)
        ));
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      earth.add(line);
    }

    // Longitude lines
    for (let lon = 0; lon < 360; lon += 20) {
      const points = [];
      const theta = lon * Math.PI / 180;

      for (let lat = -90; lat <= 90; lat += 5) {
        const phi = (90 - lat) * Math.PI / 180;
        const radius = 5 * Math.sin(phi);
        const y = 5 * Math.cos(phi);

        points.push(new THREE.Vector3(
          radius * Math.cos(theta),
          y,
          radius * Math.sin(theta)
        ));
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      earth.add(line);
    }

    return earth;
  }

  private addLights(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    this.scene.add(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    this.scene.add(directionalLight);
  }

  private addStars(): void {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      transparent: true,
      opacity: 0.8
    });

    const starsVertices = [];
    for (let i = 0; i < 1000; i++) {
      const x = (Math.random() - 0.5) * 100;
      const y = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(stars);
  }

  private setupControls(): void {
    const canvas = this.renderer.domElement;

    // Mouse controls
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.mouseDown) {
        const deltaX = e.clientX - this.mouseX;
        const deltaY = e.clientY - this.mouseY;

        this.targetRotationX += deltaY * 0.01;
        this.targetRotationY += deltaX * 0.01;

        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
      }
    });

    canvas.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.mouseDown = false;
    });

    // Zoom with mouse wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.01;
      this.camera.position.z = Math.max(8, Math.min(30, this.camera.position.z + delta));
    });

    // Touch controls
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        // Single touch - rotation
        this.mouseDown = true;
        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        // Two finger touch - prepare for pinch zoom
        this.mouseDown = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();

      if (e.touches.length === 1 && this.mouseDown) {
        // Single touch drag - rotation
        const deltaX = e.touches[0].clientX - this.mouseX;
        const deltaY = e.touches[0].clientY - this.mouseY;

        this.targetRotationX += deltaY * 0.01;
        this.targetRotationY += deltaX * 0.01;

        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.lastTouchDistance > 0) {
          const delta = (this.lastTouchDistance - distance) * 0.05;
          this.camera.position.z = Math.max(8, Math.min(30, this.camera.position.z + delta));
        }

        this.lastTouchDistance = distance;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.mouseDown = false;
      this.lastTouchDistance = 0;
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      this.mouseDown = false;
      this.lastTouchDistance = 0;
    });
  }

  /**
   * Set observer location (Jyväskylä by default)
   */
  setObserver(latitude: number, longitude: number): void {
    // Remove old observer marker
    if (this.observerMesh) {
      this.earth.remove(this.observerMesh);
    }

    // Convert lat/lon to 3D position on sphere
    const phi = (90 - latitude) * Math.PI / 180;
    const theta = (longitude + 180) * Math.PI / 180;

    const x = 5.1 * Math.sin(phi) * Math.cos(theta);
    const y = 5.1 * Math.cos(phi);
    const z = 5.1 * Math.sin(phi) * Math.sin(theta);

    // Create observer marker (red cone pointing up)
    const geometry = new THREE.ConeGeometry(0.2, 0.5, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.observerMesh = new THREE.Mesh(geometry, material);

    this.observerMesh.position.set(x, y, z);
    this.observerMesh.lookAt(0, 0, 0);
    this.observerMesh.rotateX(Math.PI);

    this.earth.add(this.observerMesh);
  }

  /**
   * Update satellite position in real-time
   */
  updateSatellite(position: SatellitePosition): void {
    // Remove old satellite
    if (this.satelliteMesh) {
      this.scene.remove(this.satelliteMesh);
    }

    // Convert lat/lon/alt to 3D position
    const earthRadius = 5; // Earth radius in our 3D scene
    const altitudeScale = position.altitude / 6371; // Scale altitude relative to Earth radius
    const radius = earthRadius + altitudeScale * 2; // Scale satellite distance

    const phi = (90 - position.latitude) * Math.PI / 180;
    const theta = (position.longitude + 180) * Math.PI / 180;

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    // Create satellite (small sphere)
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: position.elevation > 0 ? 0x00ff00 : 0xffaa00
    });
    this.satelliteMesh = new THREE.Mesh(geometry, material);
    this.satelliteMesh.position.set(x, y, z);

    this.scene.add(this.satelliteMesh);

    // Draw line from Earth to satellite
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x * 0.9, y * 0.9, z * 0.9),
      new THREE.Vector3(x, y, z)
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: position.elevation > 0 ? 0x00ff00 : 0xffaa00,
      opacity: 0.5,
      transparent: true
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.scene.add(line);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    // Smooth rotation
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.1;
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;

    // Apply rotation to camera around Earth
    const radius = this.camera.position.length();
    this.camera.position.x = radius * Math.sin(this.rotationY) * Math.cos(this.rotationX);
    this.camera.position.y = radius * Math.sin(this.rotationX);
    this.camera.position.z = radius * Math.cos(this.rotationY) * Math.cos(this.rotationX);
    this.camera.lookAt(0, 0, 0);

    // Rotate Earth slowly
    this.earth.rotation.y += 0.001;

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
