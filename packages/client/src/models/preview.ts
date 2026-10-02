// Manual check page for the model pipeline: /models-preview.html in dev.
// URL options: clip=walk, view=front|back|side|top|game, t=<seconds> (freeze
// the clips at that time), parts=<name,name> or parts=all, heading=<degrees>,
// ids=<id,id> (models to show), lib=<url> (library folder, default /models/),
// spacing=<metres>.
// The front row keeps the placeholder team blue; the back row is red.
import * as THREE from 'three';
import { InstancedModel, loadModelLibrary } from './index.ts';

const params = new URLSearchParams(location.search);
const clip = params.get('clip') ?? 'walk';
const view = params.get('view') ?? 'front';
const frozen = params.has('t') ? Number(params.get('t')) : null;
const partsParam = params.get('parts') ?? '';
const heading = THREE.MathUtils.degToRad(Number(params.get('heading') ?? 0));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c8);
scene.fog = new THREE.Fog(0x9fb8c8, 20, 60);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-6, 10, -8);
sun.castShadow = true;
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d7a3a }));
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(40, 40 / 0.45, 0x4c6630, 0x4c6630));

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
const target = new THREE.Vector3(0, 0.85, 0.6);
const cameraAt: Record<string, [number, number, number]> = {
  front: [0, 1.4, -6.5], // looking along +Z at the models' faces (they face -Z)
  back: [0, 1.4, 7.5],
  side: [8, 1.4, 0.6],
  top: [0, 9, -1],
  game: [0, 8, -6],
};
camera.position.set(...(cameraAt[view] ?? cameraAt.front ?? [0, 1.4, -6.5]));
camera.lookAt(target);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const library = await loadModelLibrary(params.get('lib') ?? '/models/');
const ids = (params.get('ids') ?? 'worker,warrior,mage').split(',').filter((id) => library.models.has(id));
const spacing = Number(params.get('spacing') ?? 1.2);
const red = new THREE.Color(0xc0392b);
const rows = ids.map((id, column) => {
  const model = new InstancedModel(library.get(id), 4);
  for (const part of model.model.partNames) {
    if (partsParam === 'all' || partsParam.split(',').includes(part)) model.setPartVisible(part, true);
  }
  model.object.castShadow = true;
  model.object.receiveShadow = true;
  scene.add(model.object);
  return { model, x: ((ids.length - 1) / 2 - column) * spacing };
});

const info = document.getElementById('info');
if (info) info.textContent = `${ids.join(', ')}: clip "${clip}", view ${view}. Front row: placeholder blue; back row: red.`;

const start = performance.now();
function frame(): void {
  const time = frozen ?? (performance.now() - start) / 1000;
  for (const { model, x } of rows) {
    model.setInstance(0, x, 0, 0, heading, clip, time, null);
    model.setInstance(1, x, 0, 1.8, heading, clip, time + 0.25, red);
    model.setCount(2);
    model.commit();
  }
  renderer.render(scene, camera);
  (window as unknown as { previewReady?: boolean }).previewReady = true;
  requestAnimationFrame(frame);
}
frame();
