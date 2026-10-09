// Loads the converter's output (public/models/index.json, <id>.glb, <id>.json)
// and bakes clips into per-frame bone matrices, ready for InstancedModel.
//
// The library streams: it opens as soon as index.json is in, then loads the
// models a few at a time, the ones asked for first (the starting bodies, then
// whatever comes into view), the rest in the background. A model the index
// lists lazy (a kit tier's or a building's other looks) loads only when asked
// for. A clip is baked the first time it is drawn. One model failing to load
// drops only that model.
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
  /** frames * bones * BAKED_STRIDE floats: for each frame and bone, bone world * inverse rest world. Baked on first read. */
  readonly data: Float32Array;
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
  /** Each bone's rest-pose world matrix (model space): where attachment slots sit. */
  restWorld: readonly THREE.Matrix4[];
}

export interface ModelLibrary {
  /** The models loaded so far. */
  readonly models: ReadonlyMap<string, ModelData>;
  /** The model with this id; throws if it is not loaded. */
  get(id: string): ModelData;
  /** Whether index.json lists this id (it may still be loading, or have failed). */
  listed(id: string): boolean;
  /** Moves a listed model that is not loaded yet to the front of the queue (a lazy one joins it). */
  request(id: string): void;
  /** Loads these ids first and resolves once each is loaded or has failed; ids not listed are skipped. */
  ready(ids: readonly string[]): Promise<void>;
  /** Calls back after each model arrives. */
  onLoad(cb: (model: ModelData) => void): void;
  /** Resolves once every listed model that is not lazy is loaded or has failed. */
  readonly done: Promise<void>;
  dispose(): void;
}

/** Models fetched at once. */
const PARALLEL_LOADS = 6;
/** Background order by category: what a match needs soonest first. */
const CATEGORY_ORDER = ['peoples', 'buildings', 'items', 'monsters', 'animals', 'projectiles-and-spells', 'mechanical', 'world-props'];

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status}`);
  return res;
}

export function bakedFrames(length: number): number {
  return Math.max(2, Math.ceil(length * BAKE_FPS) + 1);
}

function bake(gltfClip: THREE.AnimationClip | undefined, sidecar: ModelSidecar, rest: THREE.Object3D[], restInverse: THREE.Matrix4[], length: number): { frames: number; data: Float32Array } {
  const bones = sidecar.bones;
  const frames = bakedFrames(length);
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
    let data: Float32Array | null = null;
    clips.set(c.name, {
      name: c.name,
      length: c.length,
      loop: c.loop,
      frames: bakedFrames(c.length),
      get data(): Float32Array {
        data ??= bake(gltfClip, sidecar, rest, restInverse, c.length).data;
        return data;
      },
      keys: c.keys,
    });
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
    restWorld,
  };
}

/**
 * Fetches index.json from `baseUrl` (default '/models/') and starts loading
 * every model it lists, the `first` ids ahead of the rest. Resolves once the
 * index is in; models arrive in `models` as they load.
 */
export async function openModelLibrary(baseUrl = '/models/', first: readonly string[] = []): Promise<ModelLibrary> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const index = (await (await fetchOk(`${base}index.json`)).json()) as ModelIndex;
  const loader = new GLTFLoader();
  const entries = new Map(index.models.map((e) => [e.id, e]));
  const rank = (e: ModelIndex['models'][number]): number => {
    const k = CATEGORY_ORDER.indexOf(e.category);
    return k < 0 ? CATEGORY_ORDER.length : k;
  };
  const firstIds = first.filter((id) => entries.has(id));
  const firstSet = new Set(firstIds);
  // The queue is taken from the end: the background in reverse order, then the first ids on top. Lazy models wait to be asked for.
  const queue = [...index.models].filter((e) => !firstSet.has(e.id) && !e.lazy).sort((a, b) => rank(b) - rank(a)).map((e) => e.id);
  for (let k = firstIds.length - 1; k >= 0; k--) queue.push(firstIds[k]!);
  /** Ids queued or loading: the rest are lazy models nobody has asked for. */
  const queued = new Set(queue);
  /** How many queued models must settle before `done`. */
  let eager = queue.length;

  const models = new Map<string, ModelData>();
  const settled = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();
  const listeners: Array<(m: ModelData) => void> = [];
  let disposed = false;
  let running = 0;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));

  const settle = (id: string): void => {
    settled.add(id);
    for (const w of waiters.get(id) ?? []) w();
    waiters.delete(id);
    if (!entries.get(id)?.lazy || firstSet.has(id)) eager--;
    if (eager === 0) finish();
  };
  const pump = (): void => {
    while (!disposed && running < PARALLEL_LOADS && queue.length > 0) {
      const id = queue.pop()!;
      if (settled.has(id)) continue;
      running++;
      loadModel(loader, base, entries.get(id)!)
        .then((m) => {
          if (disposed) return;
          models.set(m.id, m);
          for (const cb of listeners) cb(m);
        })
        .catch((err: unknown) => console.warn(`model ${id} not loaded; drawing a stand-in`, err))
        .finally(() => {
          running--;
          settle(id);
          pump();
        });
    }
  };
  if (eager === 0) finish();
  pump();

  const request = (id: string): void => {
    if (!entries.has(id) || settled.has(id)) return;
    // A lazy model nobody asked for yet joins the queue on top.
    if (!queued.has(id)) {
      queued.add(id);
      queue.push(id);
      pump();
      return;
    }
    // Queued but not in the queue any more means it is loading now.
    const k = queue.lastIndexOf(id);
    if (k < 0 || k === queue.length - 1) return;
    queue.splice(k, 1);
    queue.push(id);
  };

  return {
    models,
    get(id: string): ModelData {
      const m = models.get(id);
      if (!m) throw new Error(`no model "${id}" in the library (have ${[...models.keys()].join(', ')})`);
      return m;
    },
    listed: (id) => entries.has(id),
    request,
    ready(ids: readonly string[]): Promise<void> {
      for (const id of ids) if (entries.get(id)?.lazy) request(id);
      const wait = ids.filter((id) => entries.has(id) && !settled.has(id));
      return Promise.all(
        wait.map(
          (id) =>
            new Promise<void>((resolve) => {
              const list = waiters.get(id) ?? [];
              list.push(resolve);
              waiters.set(id, list);
            }),
        ),
      ).then(() => undefined);
    },
    onLoad(cb): void {
      listeners.push(cb);
    },
    done,
    dispose(): void {
      disposed = true;
      for (const m of models.values()) {
        m.geometry.dispose();
        m.texture.dispose();
      }
    },
  };
}

/** Fetches index.json and every model it lists from `baseUrl` (default '/models/'), resolving once all are in. */
export async function loadModelLibrary(baseUrl = '/models/'): Promise<ModelLibrary> {
  const lib = await openModelLibrary(baseUrl);
  await lib.done;
  return lib;
}
