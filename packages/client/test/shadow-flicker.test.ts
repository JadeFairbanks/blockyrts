// Jade's shadow flicker report: shadows of buildings, land and units blinked
// out and back. Every mesh now has its shadow flags from the moment it joins
// the world (they came from a sweep once a second, so redrawn land and new
// buildings went without for up to a second), and the shadow box covers the
// ground on screen at every zoom and moves in whole shadow-map texels, so
// shadow edges hold still as the camera pans.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_DISTANCE, MIN_DISTANCE, RtsCamera } from '../src/camera/rts-camera.ts';
import { aimSun, keepShadowFlags, setUpSun, SHADOW_ABOVE_M, SHADOW_BELOW_M, SHADOW_MAP_SIZE, SHADOW_STEP_M, SUN_FROM, sunBox } from '../src/world/sun-shadows.ts';

const box = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
const glass = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }));
const flags = (m: THREE.Mesh): string => `${m.castShadow ? 'casts' : 'no cast'}, ${m.receiveShadow ? 'takes' : 'no take'}`;

describe('every mesh has its shadow flags from its first frame', () => {
  it('flags what is in the scene already', () => {
    const scene = new THREE.Scene();
    const m = box();
    scene.add(m);
    keepShadowFlags(scene);
    expect(flags(m)).toBe('casts, takes');
  });

  it('flags a chunk of land the moment it is added: its land and cubes cast, its water only takes', () => {
    const scene = new THREE.Scene();
    keepShadowFlags(scene);
    // As world-view.ts installs a redrawn chunk: a group made first, then added whole.
    const group = new THREE.Group();
    const land = box();
    const water = glass();
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 4);
    group.add(land, water, cubes);
    expect(flags(land)).toBe('no cast, no take');
    scene.add(group);
    expect(flags(land)).toBe('casts, takes');
    expect(flags(cubes)).toBe('casts, takes');
    expect(flags(water)).toBe('no cast, takes');
  });

  it('flags what is added later to a group already in the scene, at any depth', () => {
    const scene = new THREE.Scene();
    keepShadowFlags(scene);
    // As units-view.ts adds a new body pool to its group of unit models.
    const bodies = new THREE.Group();
    scene.add(bodies);
    const pool = box();
    bodies.add(pool);
    expect(flags(pool)).toBe('casts, takes');
    const inner = new THREE.Group();
    bodies.add(inner);
    const deeper = box();
    inner.add(deeper);
    expect(flags(deeper)).toBe('casts, takes');
    // Moved from one group to another, it keeps them.
    scene.add(deeper);
    expect(flags(deeper)).toBe('casts, takes');
  });

  it('leaves lines and sprites alone', () => {
    const scene = new THREE.Scene();
    keepShadowFlags(scene);
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    scene.add(lines, sprite);
    expect(lines.castShadow || lines.receiveShadow || sprite.castShadow || sprite.receiveShadow).toBe(false);
  });
});

/** The game's camera at a zoom and screen shape, looking at (x, z) on flat ground at height 0. */
function camera(w: number, h: number, distance: number, x = 0, z = 0): RtsCamera {
  const cam = new RtsCamera(() => ({ minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 }), null);
  cam.resize(w, h);
  cam.setView({ x, z, distance });
  return cam;
}

/** Where a world point falls in the sun's shadow camera, metres across its view. */
function inSunView(sun: THREE.DirectionalLight, p: THREE.Vector3): THREE.Vector3 {
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  return p.clone().applyMatrix4(sun.shadow.camera.matrixWorldInverse);
}

const SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720],
  [1920, 1080],
  [2560, 1080],
  [1024, 768],
  [800, 1280],
];
const ZOOMS = [MIN_DISTANCE, 18, 24, 36, 48, MAX_DISTANCE];

describe('the shadow box', () => {
  it('holds the ground on screen at every zoom and screen shape, with hills and dips round the focus', () => {
    for (const [w, h] of SCREENS) {
      for (const d of ZOOMS) {
        const cam = camera(w, h, d, 310.7, -122.3);
        const sun = new THREE.DirectionalLight();
        setUpSun(sun);
        const b = aimSun(sun, cam.camera, 0);
        const sc = sun.shadow.camera;
        expect(sc.right, `${w}x${h} at ${d} m`).toBe(b.half);
        for (const y of [SHADOW_ABOVE_M, 0, -SHADOW_BELOW_M]) {
          for (const corner of cam.footprint() ?? []) {
            // The screen corner's ray down to this height.
            const eye = cam.camera.position;
            const p = eye.clone().add(corner.clone().sub(eye).multiplyScalar((eye.y - y) / (eye.y - corner.y)));
            const l = inSunView(sun, p);
            expect(Math.max(sc.left - l.x, l.x - sc.right, sc.bottom - l.y, l.y - sc.top), `${w}x${h} at ${d} m, ground ${y} m`).toBeLessThan(0);
          }
        }
      }
    }
  });

  it('is sized in steps, smaller zoomed in (sharper shadows) than zoomed out', () => {
    const halves = ZOOMS.map((d) => sunBox(camera(1920, 1080, d).camera, 0).half);
    for (const half of halves) expect(half % SHADOW_STEP_M).toBe(0);
    for (let i = 1; i < halves.length; i++) expect(halves[i]!).toBeGreaterThan(halves[i - 1]!);
    // At the start's zoom on a wide screen its texels are no bigger than the old fixed 90 m box's.
    expect(sunBox(camera(1920, 1080, 36).camera, 0).texel).toBeLessThanOrEqual(90 / SHADOW_MAP_SIZE);
  });

  it('moves in whole texels as the camera pans, so a shadow edge stays on the same texels', () => {
    const sun = new THREE.DirectionalLight();
    setUpSun(sun);
    // A fixed corner of a building, and where it falls within its shadow-map texel at each step of a slow pan.
    const p = new THREE.Vector3(12.34, 3.21, -5.67);
    const within: number[][] = [];
    let half = 0;
    for (let k = 0; k < 40; k++) {
      const cam = camera(1920, 1080, 36, k * 0.173, k * 0.0911);
      const b = aimSun(sun, cam.camera, 0);
      if (k === 0) half = b.half;
      expect(b.half).toBe(half);
      const l = inSunView(sun, p);
      const tx = (l.x - sun.shadow.camera.left) / b.texel;
      const ty = (l.y - sun.shadow.camera.bottom) / b.texel;
      within.push([tx - Math.floor(tx), ty - Math.floor(ty)]);
    }
    for (const [fx, fy] of within) {
      expect(Math.abs(fx! - within[0]![0]!)).toBeLessThan(1e-4);
      expect(Math.abs(fy! - within[0]![1]!)).toBeLessThan(1e-4);
    }
  });

  it('keeps the sun shining from the same place, whatever the camera does', () => {
    const sun = new THREE.DirectionalLight();
    setUpSun(sun);
    const from = SUN_FROM.clone().normalize();
    for (const d of ZOOMS) {
      aimSun(sun, camera(1600, 900, d, -40 + d, 77 - d).camera, 3.4);
      const dir = sun.position.clone().sub(sun.target.position).normalize();
      expect(dir.distanceTo(from)).toBeLessThan(1e-9);
    }
  });
});
