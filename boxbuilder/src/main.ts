import './style.css';
import {
  AmbientLight,
  AxesHelper,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  GridHelper,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import tableDrawing from './drawings/table.json';

type Vec3 = [number, number, number];

type BoxDefinition = {
  label?: string;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  color?: string;
};

type Drawing = {
  name: string;
  description?: string;
  boxes: BoxDefinition[];
};

const drawing: Drawing = tableDrawing as Drawing;

function init() {
  const root = document.getElementById('app');
  if (!(root instanceof HTMLDivElement)) {
    throw new Error('Sovellukselle ei löytynyt juurielementtiä.');
  }
  const container = root;

  const scene = new Scene();
  scene.background = new Color('#1c1c1c');

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const camera = new PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.4, 0);

  const ambient = new AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const dirLight = new DirectionalLight(0xffffff, 1);
  dirLight.position.set(4, 6, 3);
  scene.add(dirLight);

  const grid = new GridHelper(10, 10, 0x444444, 0x222222);
  grid.position.y = 0;
  scene.add(grid);

  const axes = new AxesHelper(1.5);
  axes.position.set(0, 0.001, 0);
  scene.add(axes);

  const overallBounds = new Box3();

  drawing.boxes.forEach((box) => {
    const geometry = new BoxGeometry(box.size[0], box.size[1], box.size[2]);
    const material = new MeshStandardMaterial({ color: box.color ?? '#c0b090' });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(box.position[0], box.position[1], box.position[2]);
    if (box.rotation) {
      mesh.rotation.set(box.rotation[0], box.rotation[1], box.rotation[2]);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = box.label ?? 'box';
    scene.add(mesh);

    const meshBounds = new Box3().setFromObject(mesh);
    overallBounds.union(meshBounds);
  });

  if (!overallBounds.isEmpty()) {
    const size = new Vector3();
    overallBounds.getSize(size);
    const center = new Vector3();
    overallBounds.getCenter(center);

    controls.target.copy(center);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const distance = maxDimension * 2.5;
    camera.position.copy(center.clone().add(new Vector3(distance, distance, distance)));
    camera.near = Math.max(0.1, maxDimension / 100);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
  } else {
    camera.position.set(3, 3, 3);
  }

  function onResize() {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  const preview = document.getElementById('drawingPreview');
  if (preview) {
    preview.textContent = JSON.stringify(drawing, null, 2);
  }
}

document.addEventListener('DOMContentLoaded', init);
