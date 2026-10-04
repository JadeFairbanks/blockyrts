// Jade's Patch 3, client rendering: land explored but out of sight is
// darkened with most of its colour kept (no longer greyscale), on the land
// and on the models standing on it; and the player's own units 80% or more
// hidden from the camera get an outline, judged from a measuring picture's
// pixel counts with a little hysteresis so it does not flicker.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstancedModel, MarkMode, type ModelData } from '../src/models/index.ts';
import { fowPatch, REMEMBERED_BRIGHTNESS, REMEMBERED_COLOUR, type FowUniforms } from '../src/world/fog-material.ts';
import { countCoverage, grow, HIDDEN_OFF, HIDDEN_ON, HiddenSet, HOLD_MS, MIN_PIXELS, screenBox, type OwnDraw, type Tally } from '../src/world/hidden-outlines.ts';

const fow = (): FowUniforms => ({
  fowTex: { value: new THREE.DataTexture(new Uint8Array(4), 2, 2, THREE.RedFormat) },
  fowArea: { value: new THREE.Vector3(0, 0, 1) },
  fowAll: { value: 0 },
});

/** A Lambert material's shader as three.js hands it to onBeforeCompile. */
const lambert = (): THREE.WebGLProgramParametersWithUniforms =>
  ({ uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }) as unknown as THREE.WebGLProgramParametersWithUniforms;

/** A one-bone, one-triangle model, enough to build an InstancedModel without a GPU. */
function tinyModel(): ModelData {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  g.setAttribute('bone', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 1));
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 1));
  g.setIndex([0, 1, 2]);
  return {
    id: 'tiny',
    category: 'test',
    sidecar: {} as ModelData['sidecar'],
    geometry: g,
    texture: new THREE.Texture(),
    boneCount: 1,
    boneNames: ['root'],
    partNames: [],
    clips: new Map(),
    boundingBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0)),
    restWorld: [new THREE.Matrix4()],
  };
}

describe('the fog of war look (Patch 3)', () => {
  it('darkens remembered land and keeps most of its colour instead of turning it grey', () => {
    expect(REMEMBERED_BRIGHTNESS).toBeGreaterThan(0.4);
    expect(REMEMBERED_BRIGHTNESS).toBeLessThan(0.8);
    expect(REMEMBERED_COLOUR).toBeGreaterThan(0.5);
    expect(REMEMBERED_COLOUR).toBeLessThan(1);
    const shader = lambert();
    fowPatch(fow(), true)(shader);
    expect(shader.fragmentShader).toContain(`lit, ${REMEMBERED_COLOUR.toFixed(3)}) * ${REMEMBERED_BRIGHTNESS.toFixed(3)}`);
    // The old greyscale: luminance alone, darkened.
    expect(shader.fragmentShader).not.toContain('vec3 grey');
    expect(shader.fragmentShader).toContain('uniform sampler2D fowTex');
    expect(shader.vertexShader).toContain('vFowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz');
    expect(shader.uniforms).toHaveProperty('fowTex');
  });

  it('reaches the instanced models too, after their own patch, as a program of their own', () => {
    const plain = new InstancedModel(tinyModel(), 4);
    const fogged = new InstancedModel(tinyModel(), 4, { key: 'fow', apply: fowPatch(fow(), false) });
    const mat = fogged.object.material as THREE.MeshLambertMaterial;
    const shader = lambert();
    mat.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('team_bf');
    expect(shader.fragmentShader).toContain('uniform sampler2D fowTex');
    expect(shader.fragmentShader).toContain('remembered');
    expect(shader.vertexShader).toContain('bone_bf * vec4(transformed, 1.0)');
    expect(shader.vertexShader).toContain('vFowWorld');
    expect(mat.customProgramCacheKey()).not.toBe((plain.object.material as THREE.Material).customProgramCacheKey());
  });
});

describe('the mark material and marks', () => {
  it('marks an own unit by id, negative when outlined, and clears with the next setInstance', () => {
    const m = new InstancedModel(tinyModel(), 4);
    const mark = m.object.geometry.getAttribute('mark') as THREE.InstancedBufferAttribute;
    m.setInstance(1, 0, 0, 0, 0, '', 0, null);
    m.setMark(1, 42, false);
    expect(mark.array[1]).toBe(42);
    m.setMark(1, 42, true);
    expect(mark.array[1]).toBe(-42);
    m.setInstance(1, 0, 0, 0, 0, '', 0, null);
    expect(mark.array[1]).toBe(0);
  });

  it('swaps to the flat mark material and back, neither giving way to a scene override', () => {
    const m = new InstancedModel(tinyModel(), 4);
    const own = m.object.material as THREE.Material;
    expect(own.allowOverride).toBe(false);
    m.useMarkMaterial(true);
    const flat = m.object.material as THREE.ShaderMaterial;
    expect(flat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(flat.allowOverride).toBe(false);
    expect(flat.blending).toBe(THREE.NoBlending);
    expect(flat.vertexShader).toContain('attribute float mark');
    m.useMarkMaterial(false);
    expect(m.object.material).toBe(own);
    expect(MarkMode.Ids).not.toBe(MarkMode.Outlined);
  });
});

/** RGBA pixels from 32-bit values (little-endian: red low, alpha high). */
const pixels = (values: number[]): Uint8Array => new Uint8Array(new Uint32Array(values).buffer);
const id = (n: number): number => n & 0xffffff;
const BLOCK = 0xff000000;

describe('counting the measuring picture', () => {
  it('counts each unit seen on the left and whole on the right, skipping empty and blocked pixels', () => {
    // Two rows of 4: the left 2 are the scene, the right 2 the units alone.
    const px = pixels([id(5), BLOCK, id(5), id(5), 0, id(70000), id(5), id(70000)]);
    const out = new Map<number, Tally>();
    countCoverage(px, 4, 2, 2, out);
    expect(out.get(5)).toEqual({ seen: 1, all: 3 });
    expect(out.get(70000)).toEqual({ seen: 1, all: 1 });
    expect(out.size).toBe(2);
  });
});

describe('which units are outlined', () => {
  const tally = (hidden: number, all = 100): Map<number, Tally> => new Map([[7, { seen: Math.round(all * (1 - hidden)), all }]]);

  it('turns on at 80% hidden, not below', () => {
    const h = new HiddenSet();
    h.update(tally(HIDDEN_ON - 0.01), 0);
    expect(h.ids.has(7)).toBe(false);
    h.update(tally(HIDDEN_ON), 100);
    expect(h.ids.has(7)).toBe(true);
  });

  it('keeps the outline down to 70% and for a moment after, then lets it go', () => {
    const h = new HiddenSet();
    h.update(tally(0.9), 0);
    h.update(tally(HIDDEN_OFF + 0.02), HOLD_MS + 10);
    expect(h.ids.has(7)).toBe(true);
    h.update(tally(0.2), HOLD_MS / 2);
    expect(h.ids.has(7)).toBe(true);
    h.update(tally(0.2), HOLD_MS + 1);
    expect(h.ids.has(7)).toBe(false);
  });

  it('leaves a unit too small to judge as it was, and drops one no longer drawn', () => {
    const h = new HiddenSet();
    h.update(tally(0.9), 0);
    h.update(tally(0, MIN_PIXELS - 1), HOLD_MS * 2);
    expect(h.ids.has(7)).toBe(true);
    h.update(new Map(), HOLD_MS * 3);
    expect(h.ids.has(7)).toBe(false);
  });
});

describe('where the units stand on the screen', () => {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 2000);
  camera.position.set(0, 20, 14);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const draw = (x: number, z: number, outlined = false): OwnDraw => ({ id: 1, x, y: 0, z, h: 1.7, r: 0.4, outlined });

  it('boxes a unit in the middle of the view round the middle of the screen', () => {
    const b = screenBox([draw(0, 0)], camera, 1920, 1080, false, camera.near)!;
    expect(b).not.toBeNull();
    expect(b.x).toBeLessThan(960);
    expect(b.x + b.w).toBeGreaterThan(960);
    expect(b.w).toBeLessThan(200);
  });

  it('is not stretched by a unit off the screen, skips those behind the camera, and can keep to the outlined', () => {
    const one = screenBox([draw(0, 0)], camera, 1920, 1080, false, camera.near)!;
    expect(screenBox([draw(0, 0), draw(500, 0)], camera, 1920, 1080, false, camera.near)).toEqual(one);
    expect(screenBox([draw(0, 80)], camera, 1920, 1080, false, camera.near)).toBeNull();
    expect(screenBox([draw(0, 0)], camera, 1920, 1080, true, camera.near)).toBeNull();
    expect(screenBox([draw(0, 0, true)], camera, 1920, 1080, true, camera.near)).toEqual(one);
  });

  it('grows a box and keeps it on the screen', () => {
    expect(grow({ x: 5, y: 10, w: 20, h: 20 }, 8, 100, 100)).toEqual({ x: 0, y: 2, w: 33, h: 36 });
    expect(grow({ x: 90, y: 90, w: 10, h: 10 }, 8, 100, 100)).toEqual({ x: 82, y: 82, w: 18, h: 18 });
  });
});
