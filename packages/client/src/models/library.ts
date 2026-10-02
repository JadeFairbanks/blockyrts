// Loads the converter's output (public/models/index.json, <id>.glb, <id>.json)
// and bakes every clip into per-frame bone matrices, ready for InstancedModel.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelIndex, ModelSidecar } from './format.ts';

/** Baked frames per second. The clips' own keys are 24 per second; frames are blended linearly. */
export const BAKE_FPS = 30;

/** Floats per baked bone matrix: an affine 3 x 4 matrix, column-major. */
export const BAKED_STRIDE = 12;

export interface BakedClip {
  name: string;
  /** Seconds. */
  length: number;
  loop: boolean;
  /** Number of frames, evenly spaced from 0 to length inclusive (at least 2). */
  frames: number;
  /** frames * bones * BAKED_STRIDE floats: for each frame and bone, bone world * inverse rest world. */
  data: Float32Array;
  /** Key moments in sim steps from the clip start. */
  keys: readonly number[];
}

export interface ModelData {
  id: string;
  category: string;
  sidecar: ModelSidecar;
  /** The converted mesh in rest pose: position, normal, uv, bone (float), part (float), index. */
  geometry: THREE.BufferGeometry;
  /** The model's texture (nearest filtering, sRGB). */
  texture: THREE.Texture;
  boneCount: number;
  boneNames: readonly string[];
  partNames: readonly string[];
  clips: ReadonlyMap<string, BakedClip>;
  /** Rest-pose bounds of the body without parts, metres. */
  boundingBox: THREE.Box3;
}

export interface ModelLibrary {
  readonly models: ReadonlyMap<string, ModelData>;
  /** The model with this id; throws if it is not in the library. */
  get(id: string): ModelData;
  dispose(): void;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status}`);
  return res;
}

function bake(gltfClip: THREE.AnimationClip | undefined, sidecar: ModelSidecar, rest: THREE.Object3D[], restInverse: THREE.Matrix4[], length: number): { frames: number; data: Float32Array } {
  const bones = sidecar.bones;
  const frames = Math.max(2, Math.ceil(length * BAKE_FPS) + 1);
  const data = new Float32Array(frames * bones.length * BAKED_STRIDE);
  const interpolants = bones.map((b) => {
    const find = (prop: string): THREE.Interpolant | null => {
      const track = gltfClip?.tracks.find((t) => t.name === `${b.name}.${prop}`);
      // createInterpolant picks linear, or spherical linear for quaternions; it is missing from the typings.
      return track ? (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant() : null;
    };
    return { position: find('position'), quaternion: find('quaternion'), scale: find('scale') };
  });
  const world = bones.map(() => new THREE.Matrix4());
  const local = new THREE.Matrix4();
  const skin = new THREE.Matrix4();
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const time = length > 0 ? (f / (frames - 1)) * length : 0;
    bones.forEach((b, i) => {
      const node = rest[i] as THREE.Object3D;
      const ip = interpolants[i];
      t.copy(node.position);
      q.copy(node.quaternion);
      s.copy(node.scale);
      if (ip?.position) t.fromArray(ip.position.evaluate(time));
      if (ip?.quaternion) q.fromArray(ip.quaternion.evaluate(time)).normalize();
      if (ip?.scale) s.fromArray(ip.scale.evaluate(time));
      local.compose(t, q, s);
      const w = world[i] as THREE.Matrix4;
      if (b.parent >= 0) w.multiplyMatrices(world[b.parent] as THREE.Matrix4, local);
      else w.copy(local);
      skin.multiplyMatrices(w, restInverse[i] as THREE.Matrix4);
      const e = skin.elements;
      const o = (f * bones.length + i) * BAKED_STRIDE;
      data[o] = e[0]; data[o + 1] = e[1]; data[o + 2] = e[2];
      data[o + 3] = e[4]; data[o + 4] = e[5]; data[o + 5] = e[6];
      data[o + 6] = e[8]; data[o + 7] = e[9]; data[o + 8] = e[10];
      data[o + 9] = e[12]; data[o + 10] = e[13]; data[o + 11] = e[14];
    });
  }
  return { frames, data };
}

async function loadModel(loader: GLTFLoader, baseUrl: string, entry: ModelIndex['models'][number]): Promise<ModelData> {
  const [sidecar, glbBytes] = await Promise.all([
    fetchOk(baseUrl + entry.json).then((r) => r.json() as Promise<ModelSidecar>),
    fetchOk(baseUrl + entry.glb).then((r) => r.arrayBuffer()),
  ]);
  const gltf = await loader.parseAsync(glbBytes, baseUrl);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`${entry.glb} has no mesh`);
  const source = (mesh as THREE.Mesh).geometry;
  const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const texture = material.map;
  if (!texture) throw new Error(`${entry.glb} has no texture`);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  // Copy the attributes into plain arrays; the integer _BONE and _PART become floats for the shader.
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = source.getAttribute(name);
    if (!a) throw new Error(`${entry.glb} has no ${name} attribute`);
    geometry.setAttribute(name, new THREE.BufferAttribute(Float32Array.from({ length: a.count * a.itemSize }, (_, k) => a.getComponent(Math.floor(k / a.itemSize), k % a.itemSize)), a.itemSize));
  }
  for (const [from, to] of [['_bone', 'bone'], ['_part', 'part']] as const) {
    const a = source.getAttribute(from);
    if (!a) throw new Error(`${entry.glb} has no ${from.toUpperCase()} attribute`);
    geometry.setAttribute(to, new THREE.BufferAttribute(Float32Array.from({ length: a.count }, (_, k) => a.getX(k)), 1));
  }
  if (source.index) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array), 1));
  source.dispose();
  material.dispose();

  // Rest pose from the glTF nodes, by bone name.
  const rest = sidecar.bones.map((b) => {
    const node = gltf.scene.getObjectByName(b.name);
    if (!node) throw new Error(`${entry.glb} has no node for bone ${b.name}`);
    return node;
  });
  const restWorld = sidecar.bones.map(() => new THREE.Matrix4());
  sidecar.bones.forEach((b, i) => {
    const node = rest[i] as THREE.Object3D;
    const local = new THREE.Matrix4().compose(node.position, node.quaternion, node.scale);
    const w = restWorld[i] as THREE.Matrix4;
    if (b.parent >= 0) w.multiplyMatrices(restWorld[b.parent] as THREE.Matrix4, local);
    else w.copy(local);
  });
  const restInverse = restWorld.map((m) => m.clone().invert());

  const clips = new Map<string, BakedClip>();
  for (const c of sidecar.clips) {
    const gltfClip = gltf.animations.find((a) => a.name === c.name);
    const { frames, data } = bake(gltfClip, sidecar, rest, restInverse, c.length);
    clips.set(c.name, { name: c.name, length: c.length, loop: c.loop, frames, data, keys: c.keys });
  }

  const { min, max } = sidecar.bounds;
  return {
    id: sidecar.id,
    category: sidecar.category,
    sidecar,
    geometry,
    texture,
    boneCount: sidecar.bones.length,
    boneNames: sidecar.bones.map((b) => b.name),
    partNames: sidecar.parts,
    clips,
    boundingBox: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
  };
}

/** Fetches index.json and every model it lists from `baseUrl` (default '/models/'). */
export async function loadModelLibrary(baseUrl = '/models/'): Promise<ModelLibrary> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const index = (await (await fetchOk(`${base}index.json`)).json()) as ModelIndex;
  const loader = new GLTFLoader();
  const list = await Promise.all(index.models.map((entry) => loadModel(loader, base, entry)));
  const models = new Map(list.map((m) => [m.id, m]));
  return {
    models,
    get(id: string): ModelData {
      const m = models.get(id);
      if (!m) throw new Error(`no model "${id}" in the library (have ${[...models.keys()].join(', ')})`);
      return m;
    },
    dispose(): void {
      for (const m of models.values()) {
        m.geometry.dispose();
        m.texture.dispose();
      }
    },
  };
}
