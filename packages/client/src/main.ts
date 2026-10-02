// M0 client: starts the sim worker, shows the step and hash, and draws a flat
// plane with one placeholder block per entity, interpolated between steps.
import * as THREE from 'three';
import { ANGLE_TURN, hashHex, STEPS_PER_SECOND, WU_PER_METRE } from '@blockyrts/sim';
import { STATE_STRIDE, type FromWorker, type StateMessage, type ToWorker } from './messages.ts';

const STEP_MS = 1000 / STEPS_PER_SECOND;
/** Placeholder team colour from the model pipeline (decision 8). */
const TEAM_BLUE = new THREE.Color(52 / 255, 96 / 255, 178 / 255);
const NEUTRAL_GREY = new THREE.Color(0.55, 0.55, 0.5);

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) >>> 0;

const el = (id: string): HTMLElement => document.getElementById(id)!;
el('seed').textContent = String(seed);

// Scene: a 4 x 4 chunk ground plane (115.2 m) with chunk lines.
const canvas = el('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c8);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 60, 20);
scene.add(sun);

const GROUND = 4 * 28.8;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND, GROUND).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x5d7a3a }),
);
scene.add(ground);
const grid = new THREE.GridHelper(GROUND, 4, 0x2c3a1c, 0x2c3a1c);
grid.position.y = 0.01;
scene.add(grid);

// Camera: fixed angle, limited zoom (Controls > Camera); pan with the arrow keys.
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1000);
const PITCH = THREE.MathUtils.degToRad(55);
const focus = new THREE.Vector3(0, 0, 0);
let distance = 45;
const MIN_DISTANCE = 15;
const MAX_DISTANCE = 90;
function placeCamera(): void {
  camera.position.set(focus.x, focus.y + Math.sin(PITCH) * distance, focus.z + Math.cos(PITCH) * distance);
  camera.lookAt(focus);
}
placeCamera();

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Entities: one instanced block each, 0.45 m square and 1.69 m tall.
const MAX_ENTITIES = 1024;
const blockGeometry = new THREE.BoxGeometry(0.45, 1.69, 0.45).translate(0, 0.845, 0);
// A nose so the heading is visible.
const blocks = new THREE.InstancedMesh(blockGeometry, new THREE.MeshLambertMaterial(), MAX_ENTITIES);
blocks.count = 0;
scene.add(blocks);
const noses = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.15, 0.15, 0.2).translate(0, 1.45, -0.3),
  new THREE.MeshLambertMaterial({ color: 0xffe08a }),
  MAX_ENTITIES,
);
noses.count = 0;
scene.add(noses);

// Interpolation keeps the last two states and blends by the time since the newest arrived.
let prev: StateMessage | null = null;
let curr: StateMessage | null = null;
let currAt = 0;
let ownIds: number[] = [];
let stepsSeen = 0;
let rateFrom = performance.now();

const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker): void => worker.postMessage(msg);
worker.onmessage = (ev: MessageEvent<FromWorker>) => {
  const msg = ev.data;
  prev = curr;
  curr = msg;
  currAt = performance.now();
  ownIds = msg.ownIds;
  stepsSeen++;
  el('step').textContent = String(msg.step);
  if (msg.hashStep > 0) {
    el('hash').textContent = hashHex(msg.hash);
    el('hash-step').textContent = String(msg.hashStep);
  }
  if (msg.count > 0 && blocks.count === 0) colourBlocks(msg);
};
send({ type: 'start', seed });

function colourBlocks(msg: StateMessage): void {
  for (let i = 0; i < msg.count; i++) {
    blocks.setColorAt(i, msg.data[i * STATE_STRIDE + 3] === 0 ? TEAM_BLUE : NEUTRAL_GREY);
  }
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
}

// Right-click on the ground: move all of the player's units there.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 2 || ownIds.length === 0) return;
  pointer.set((ev.offsetX / canvas.clientWidth) * 2 - 1, -(ev.offsetY / canvas.clientHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(ground)[0];
  if (!hit) return;
  send({
    type: 'order',
    order: {
      kind: 'move',
      player: 0,
      units: ownIds,
      x: Math.round(hit.point.x * WU_PER_METRE),
      z: Math.round(hit.point.z * WU_PER_METRE),
    },
  });
});

canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    distance = THREE.MathUtils.clamp(distance * Math.exp(ev.deltaY * 0.001), MIN_DISTANCE, MAX_DISTANCE);
    placeCamera();
  },
  { passive: false },
);

const keys = new Set<string>();
window.addEventListener('keydown', (ev) => keys.add(ev.key));
window.addEventListener('keyup', (ev) => keys.delete(ev.key));

const dummy = new THREE.Object3D();
let lastFrame = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  const pan = distance * 0.8 * dt;
  if (keys.has('ArrowLeft')) focus.x -= pan;
  if (keys.has('ArrowRight')) focus.x += pan;
  if (keys.has('ArrowUp')) focus.z -= pan;
  if (keys.has('ArrowDown')) focus.z += pan;
  focus.x = THREE.MathUtils.clamp(focus.x, -GROUND / 2, GROUND / 2);
  focus.z = THREE.MathUtils.clamp(focus.z, -GROUND / 2, GROUND / 2);
  placeCamera();

  if (curr) {
    const alpha = prev && prev.count === curr.count ? Math.min(1, (now - currAt) / STEP_MS) : 1;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      const cx = curr.data[o]!;
      const cz = curr.data[o + 1]!;
      const px = prev && alpha < 1 ? prev.data[o]! : cx;
      const pz = prev && alpha < 1 ? prev.data[o + 1]! : cz;
      dummy.position.set((px + (cx - px) * alpha) / WU_PER_METRE, 0, (pz + (cz - pz) * alpha) / WU_PER_METRE);
      dummy.rotation.y = (curr.data[o + 2]! / ANGLE_TURN) * Math.PI * 2;
      dummy.updateMatrix();
      blocks.setMatrixAt(i, dummy.matrix);
      noses.setMatrixAt(i, dummy.matrix);
    }
    blocks.count = curr.count;
    noses.count = curr.count;
    blocks.instanceMatrix.needsUpdate = true;
    noses.instanceMatrix.needsUpdate = true;
  }

  if (now - rateFrom >= 1000) {
    el('rate').textContent = `(${Math.round((stepsSeen * 1000) / (now - rateFrom))} steps/s)`;
    stepsSeen = 0;
    rateFrom = now;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
