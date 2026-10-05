// The sun's shadows (Settings: graphics), kept steady (Jade's shadow flicker
// report). Two things made them blink: a mesh joined the world without its
// shadow flags and got them from a sweep once a second, so land redrawn after
// a tree fell, land redrawn every 20 s as plants grew, a chunk changing detail
// as the camera moved or a building rebuilt at its next stage lost its shadows
// for up to a second; and the shadow box slid with the camera by fractions of
// a shadow-map texel, so shadow edges crawled as it panned, and stopped short
// of the far corners of the screen when zoomed out. Now every mesh has its
// flags from the moment it is added, and the box covers the ground on screen
// and moves in whole texels.
import * as THREE from 'three';

/** Where the sun shines from, relative to the point it looks at, metres: high, from the right and behind the camera. */
export const SUN_FROM = new THREE.Vector3(40, 80, 25);
/** The shadow map's size, texels a side. */
export const SHADOW_MAP_SIZE = 2048;
/** Ground this far above and below the camera's focus is kept inside the box, metres. */
export const SHADOW_ABOVE_M = 6;
export const SHADOW_BELOW_M = 10;
/** Room round the ground on screen, metres, for the soft edge of a shadow just off it. */
export const SHADOW_MARGIN_M = 1.5;
/** The box's half size goes up and down in steps of this many metres as the camera zooms, and stays between the two limits. */
export const SHADOW_STEP_M = 4;
export const SHADOW_MIN_HALF_M = 16;
export const SHADOW_MAX_HALF_M = 100;
/** How far the shadow camera stands back from the middle of the box along the sun's rays, and its near and far planes, metres. */
const SUN_BACK_M = SUN_FROM.length();
const SHADOW_NEAR_M = 1;
const SHADOW_FAR_M = 260;
/** Longest stretch of a screen corner's ray that counts, metres (a ray that never comes down to the ground). */
const LONGEST_RAY_M = 400;

/** The sun's view: x and y across its rays (as three.js's lookAt makes them), z back along them towards the sun. */
const AXIS_Z = SUN_FROM.clone().normalize();
const AXIS_X = new THREE.Vector3(0, 1, 0).cross(AXIS_Z).normalize();
const AXIS_Y = AXIS_Z.clone().cross(AXIS_X);

/** The shadow box: its half size and texel, metres, and its middle in the sun's view (x, y across the rays, z along them). */
export interface SunBox {
  half: number;
  texel: number;
  x: number;
  y: number;
  z: number;
}

const NDC_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const eye = new THREE.Vector3();
const ray = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * The shadow box for a camera: the ground on screen, from SHADOW_BELOW_M
 * under groundY to SHADOW_ABOVE_M over it, seen along the sun's rays, with a
 * margin; its half size in SHADOW_STEP_M steps and its middle on the shadow
 * map's texel grid, so it only ever moves by whole texels. A caster's shadow
 * lands where the sun's ray through it meets the ground, so a box that holds
 * the ground on screen holds every shadow that falls on it.
 */
export function sunBox(camera: THREE.Camera, groundY: number): SunBox {
  camera.updateMatrixWorld();
  eye.setFromMatrixPosition(camera.matrixWorld);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [nx, ny] of NDC_CORNERS) {
    ray.set(nx, ny, 0.5).unproject(camera).sub(eye).normalize();
    for (const h of [groundY + SHADOW_ABOVE_M, groundY - SHADOW_BELOW_M]) {
      // Where the corner's ray meets this height; the eye itself when it is no higher, and the far end of the ray when it never gets there.
      const t = eye.y <= h ? 0 : ray.y < -1e-6 ? Math.min(LONGEST_RAY_M, (h - eye.y) / ray.y) : LONGEST_RAY_M;
      point.copy(eye).addScaledVector(ray, t);
      const px = point.dot(AXIS_X);
      const py = point.dot(AXIS_Y);
      const pz = point.dot(AXIS_Z);
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
      z0 = Math.min(z0, pz);
      z1 = Math.max(z1, pz);
    }
  }
  const need = Math.max(x1 - x0, y1 - y0) / 2 + SHADOW_MARGIN_M;
  const half = Math.min(SHADOW_MAX_HALF_M, Math.max(SHADOW_MIN_HALF_M, Math.ceil(need / SHADOW_STEP_M) * SHADOW_STEP_M));
  const texel = (2 * half) / SHADOW_MAP_SIZE;
  return { half, texel, x: Math.round((x0 + x1) / 2 / texel) * texel, y: Math.round((y0 + y1) / 2 / texel) * texel, z: (z0 + z1) / 2 };
}

/** Sets the sun up once: its shadow map and depth range (the box itself is set every frame by aimSun). */
export function setUpSun(sun: THREE.DirectionalLight): void {
  sun.position.copy(SUN_FROM);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const sc = sun.shadow.camera;
  sc.near = SHADOW_NEAR_M;
  sc.far = SHADOW_FAR_M;
  sc.left = sc.bottom = -SHADOW_MAX_HALF_M;
  sc.right = sc.top = SHADOW_MAX_HALF_M;
  sc.updateProjectionMatrix();
}

/** Points the sun and sizes its shadow box for this frame's camera; call after the camera has moved and before the frame is drawn. */
export function aimSun(sun: THREE.DirectionalLight, camera: THREE.Camera, groundY: number): SunBox {
  const box = sunBox(camera, groundY);
  const sc = sun.shadow.camera;
  if (sc.right !== box.half) {
    sc.left = sc.bottom = -box.half;
    sc.right = sc.top = box.half;
    sc.updateProjectionMatrix();
  }
  sun.target.position.set(0, 0, 0).addScaledVector(AXIS_X, box.x).addScaledVector(AXIS_Y, box.y).addScaledVector(AXIS_Z, box.z);
  sun.position.copy(sun.target.position).addScaledVector(AXIS_Z, SUN_BACK_M);
  return box;
}

/** A mesh's shadow flags: opaque ones cast shadows, every one takes them. */
function setFlags(o: THREE.Object3D): void {
  if (!(o as THREE.Mesh).isMesh) return;
  const m = o as THREE.Mesh;
  const material = Array.isArray(m.material) ? m.material[0] : m.material;
  m.castShadow = material?.transparent !== true;
  m.receiveShadow = true;
}

/**
 * Gives everything under root its shadow flags, now and the moment anything
 * is added under it later, at any depth, so nothing is ever drawn without
 * them. Whether shadows show at all is the sun's castShadow (the setting),
 * which costs nothing while it is off.
 */
export function keepShadowFlags(root: THREE.Object3D): void {
  const watched = new WeakSet<THREE.Object3D>();
  const onChild = (e: { child: THREE.Object3D }): void => mark(e.child);
  const mark = (top: THREE.Object3D): void => {
    top.traverse((o) => {
      setFlags(o);
      if (watched.has(o)) return;
      watched.add(o);
      o.addEventListener('childadded', onChild);
    });
  };
  mark(root);
}
