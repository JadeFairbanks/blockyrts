// The generated world on screen: chunks meshed by the mesh workers at full
// detail near the camera and less detail farther out, water, props and
// scenery as instanced cubes, fog of war (black unexplored, grey explored and
// unseen), the units, and the hooks the controls shell needs: ground
// picking, selectable things, the minimap and the camera limits.
import * as THREE from 'three';
import {
  COLUMNS_PER_CHUNK,
  NEUTRAL,
  OrderKind,
  propInfo,
  PropShape,
  SIGHT_WU,
  UnitKind,
  WORLD_EDGE_WU,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type ChunkDelta,
} from '@blockyrts/sim';
import type { WorldHooks } from '../hud/shell.ts';
import type { DeltasMessage, FogMessage, StateMessage } from '../messages.ts';
import { STATE_STRIDE } from '../messages.ts';
import { InstancedModel, loadModelLibrary, type ModelLibrary } from '../models/index.ts';
import { NOBODY, type GroundPicker, type MinimapSource, type Selectable, type SelectableSource } from '../selection/types.ts';
import type { FromMesh, MeshResult, PropSummary, ToMesh } from './mesh-messages.ts';
import { CHUNK_M, COLUMN_M, UNIT_M, type MeshArrays } from './mesher.ts';
import { CUBE_STRIDE } from './props-gen.ts';

const STEP_MS = 50;
/** Chunk rings around the camera focus at each level of detail (Chebyshev distance in chunks). */
const FULL_DETAIL_RING = 2;
const HALF_DETAIL_RING = 4;
const QUARTER_DETAIL_RING = 7;
/** Fog of war texture: 1.8 m tiles (4 columns), 256 a side (460 m), centred on the focus chunk. */
const FOW_TILE_M = 4 * COLUMN_M;
const FOW_TILES = 256;
const FOG_TILES_PER_CHUNK = 16;
/** Seconds between redraws of full-detail chunks so growing trees and regrowing bushes show. */
const GROWTH_REFRESH_S = 20;
const MAX_UNITS = 2048;
const WORLD_EDGE_M = WORLD_EDGE_WU / WU_PER_METRE;

/** Player colours (decision 8's placeholder blue is player 1). */
export const PLAYER_COLOURS = [0x3460b2, 0xc03a2a, 0x2a9a4a, 0xd0a020, 0x8a3ac0, 0x2ab0b0, 0xe07020, 0xe0e0e0].map((c) => new THREE.Color(c));
const NEUTRAL_COLOUR = new THREE.Color(0x8a8a80);
const UNIT_NAMES = ['Worker', 'Warrior', 'Wanderer'];
const UNIT_TYPE_KEYS = ['worker', 'warrior', 'wanderer'];

const ck = (cx: number, cz: number): string => `${cx},${cz}`;

// ---------------------------------------------------------------------------
// Shaders: the pixel texture and the fog of war, patched into Lambert.
// ---------------------------------------------------------------------------

interface FowUniforms {
  fowTex: { value: THREE.DataTexture };
  fowArea: { value: THREE.Vector3 };
  fowAll: { value: number };
}

function patchMaterial(mat: THREE.Material, fow: FowUniforms, pixelNoise: boolean): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fow);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;\nvarying vec3 vFowN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vFowWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vFowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  vFowN = objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D fowTex;
uniform vec3 fowArea;
uniform float fowAll;
varying vec3 vFowWorld;
varying vec3 vFowN;`,
      )
      .replace(
        '#include <color_fragment>',
        pixelNoise
          ? `#include <color_fragment>
  {
    vec3 cell = floor((vFowWorld - vFowN * 0.02) / 0.1125);
    float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.9 + 0.18 * n;
  }`
          : '#include <color_fragment>',
      )
      .replace(
        '#include <dithering_fragment>',
        `{
    vec2 fuv = (vFowWorld.xz - fowArea.xy) / fowArea.z;
    float f = (fuv.x < 0.0 || fuv.y < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) ? 0.0 : texture2D(fowTex, fuv).r;
    f = max(f, fowAll);
    float explored = smoothstep(0.08, 0.4, f);
    float seen = smoothstep(0.6, 0.9, f);
    vec3 grey = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11))) * 0.55;
    gl_FragColor.rgb = mix(vec3(0.0), mix(grey, gl_FragColor.rgb, seen), explored);
  }
#include <dithering_fragment>`,
      );
  };
}

function geometryOf(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3, true));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------

interface ChunkView {
  cx: number;
  cz: number;
  /** The detail it is drawn at (sample step in columns), 0 when nothing is drawn yet. */
  lod: number;
  /** The detail it should be drawn at. */
  want: number;
  /** Request in flight, or 0. */
  pending: number;
  /** Bumped by every delta for the chunk; a result made before the latest delta is redone. */
  version: number;
  meshedVersion: number;
  /** The version the request in flight was made from. */
  requested: number;
  group: THREE.Group | null;
  heights: Int16Array | null;
  size: number;
  props: Selectable[];
  meshedAt: number;
}

export interface WorldViewOptions {
  scene: THREE.Scene;
  seed: number;
  players: number;
  player: number;
}

export class WorldView {
  readonly hooks: WorldHooks;
  readonly scene: THREE.Scene;
  private readonly seed: number;
  private readonly players: number;
  private readonly player: number;
  private readonly workers: Worker[] = [];
  private readonly inflight: number[] = [];
  private readonly requests = new Map<number, { key: string; worker: number }>();
  private nextId = 1;
  private readonly chunks = new Map<string, ChunkView>();
  private readonly terrainMat: THREE.MeshLambertMaterial;
  private readonly waterMat: THREE.MeshLambertMaterial;
  private readonly cubeMat: THREE.MeshLambertMaterial;
  private readonly cubeGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly fow: FowUniforms;
  private readonly fowData = new Uint8Array(FOW_TILES * FOW_TILES);
  private fowDirty = true;
  private fowLastSeen = 0;
  /** Explored fog bits of the local player, per chunk. */
  private readonly explored = new Map<string, Uint8Array>();
  private exploredBounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0, any: false };
  private showAll = false;
  private focusChunk = { cx: Number.NaN, cz: Number.NaN };
  private simStep = 0;
  private lastGrowth = 0;
  /** Milliseconds per mesh result, for the debug readout. */
  lastMeshMs = 0;

  // Minimap tiles: 16 x 16 per chunk, explored tiles only.
  private readonly minimapTiles = new Map<string, { cx: number; cz: number; rgba: Uint8ClampedArray | null; canvas: HTMLCanvasElement; pending: boolean }>();
  private minimapVersion = 1;

  // Units.
  private prev: StateMessage | null = null;
  private curr: StateMessage | null = null;
  private currAt = 0;
  private readonly units: Selectable[] = [];
  private models: ModelLibrary | null = null;
  private readonly unitModels: InstancedModel[] = [];
  private readonly fallback: THREE.InstancedMesh;
  private readonly fallbackDummy = new THREE.Object3D();

  constructor(opts: WorldViewOptions) {
    this.scene = opts.scene;
    this.seed = opts.seed;
    this.players = opts.players;
    this.player = opts.player;

    const scene = this.scene;
    scene.background = new THREE.Color(0x07080a);
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
    sun.position.set(40, 80, 25);
    scene.add(sun);

    const tex = new THREE.DataTexture(this.fowData, FOW_TILES, FOW_TILES, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.fow = { fowTex: { value: tex }, fowArea: { value: new THREE.Vector3(0, 0, FOW_TILES * FOW_TILE_M) }, fowAll: { value: 0 } };
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    patchMaterial(this.terrainMat, this.fow, true);
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    patchMaterial(this.waterMat, this.fow, false);
    this.cubeMat = new THREE.MeshLambertMaterial();
    patchMaterial(this.cubeMat, this.fow, true);

    const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<FromMesh>) => this.onMesh(ev.data, i);
      w.postMessage({ type: 'init', seed: this.seed, players: this.players } satisfies ToMesh);
      this.workers.push(w);
      this.inflight.push(0);
    }

    this.fallback = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 1.69, 0.45).translate(0, 0.845, 0), new THREE.MeshLambertMaterial(), MAX_UNITS);
    this.fallback.count = 0;
    this.fallback.frustumCulled = false;
    scene.add(this.fallback);
    void this.loadModels();

    const ground: GroundPicker = (ray) => this.pick(ray);
    const selectables: SelectableSource = { candidates: () => this.candidates() };
    const minimap: MinimapSource = {
      bounds: () => this.minimapBounds(),
      paint: (ctx) => this.paintMinimap(ctx),
      version: () => this.minimapVersion,
    };
    this.hooks = {
      ground,
      selectables,
      minimap,
      limits: () => ({ minX: -WORLD_EDGE_M, maxX: WORLD_EDGE_M, minZ: -WORLD_EDGE_M, maxZ: WORLD_EDGE_M }),
    };
  }

  private async loadModels(): Promise<void> {
    try {
      const lib = await loadModelLibrary(`${import.meta.env.BASE_URL}models/`);
      this.models = lib;
      for (const id of ['worker', 'warrior']) {
        const m = new InstancedModel(lib.get(id), MAX_UNITS);
        m.object.frustumCulled = false;
        this.unitModels.push(m);
        this.scene.add(m.object);
      }
      this.fallback.visible = false;
    } catch (err) {
      console.warn('unit models not loaded; drawing blocks', err);
    }
  }

  // ---- From the sim worker ----

  onState(msg: StateMessage): void {
    this.prev = this.curr;
    this.curr = msg;
    this.currAt = performance.now();
    this.simStep = msg.step;
    const d = msg.data;
    this.units.length = msg.count;
    for (let i = 0; i < msg.count; i++) {
      const o = i * STATE_STRIDE;
      const id = d[o]!;
      const owner = d[o + 1]!;
      const kind = d[o + 2]!;
      const key = `e:${id}`;
      let u = this.units[i];
      if (!u || u.key !== key) {
        u = {
          key,
          kind: 'unit',
          owner: owner === NEUTRAL ? NOBODY : owner,
          typeKey: UNIT_TYPE_KEYS[kind] ?? 'unit',
          centre: new THREE.Vector3(),
          halfSize: new THREE.Vector3(0.3, 0.85, 0.3),
          label: UNIT_NAMES[kind] ?? 'Unit',
          details: kind === UnitKind.Warrior ? ['Placeholder warrior until combat (M3).'] : kind === UnitKind.Worker ? ['Gathering and building arrive in M2.'] : [],
        };
        this.units[i] = u;
      }
    }
  }

  onDeltas(msg: DeltasMessage): void {
    const deltas: ChunkDelta[] = msg.deltas;
    for (const w of this.workers) w.postMessage({ type: 'deltas', deltas } satisfies ToMesh);
    for (const d of deltas) {
      // Edits change a chunk's side faces next door too.
      for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const c = this.chunks.get(ck(d.cx + dx, d.cz + dz));
        if (c) c.version++;
      }
      const t = this.minimapTiles.get(ck(d.cx, d.cz));
      if (t) this.requestMinimap(t.cx, t.cz);
    }
  }

  onFog(msg: FogMessage): void {
    for (const [cx, cz, bits] of msg.chunks) {
      const key = ck(cx, cz);
      // Newly explored land brings new chunks into view.
      if (!this.explored.has(key)) this.focusChunk.cx = Number.NaN;
      this.explored.set(key, bits);
      const b = this.exploredBounds;
      const x0 = cx * CHUNK_M;
      const z0 = cz * CHUNK_M;
      if (!b.any) Object.assign(b, { minX: x0, minZ: z0, maxX: x0 + CHUNK_M, maxZ: z0 + CHUNK_M, any: true });
      else {
        b.minX = Math.min(b.minX, x0);
        b.minZ = Math.min(b.minZ, z0);
        b.maxX = Math.max(b.maxX, x0 + CHUNK_M);
        b.maxZ = Math.max(b.maxZ, z0 + CHUNK_M);
      }
      const t = this.minimapTiles.get(key);
      if (!t) this.requestMinimap(cx, cz);
      else this.maskTile(t);
    }
    this.fowDirty = true;
    this.minimapVersion++;
  }

  /** Debug: draw the whole land with no fog (the sim's fog is unchanged). */
  setShowAll(on: boolean): void {
    this.showAll = on;
    this.fow.fowAll.value = on ? 1 : 0;
    this.focusChunk.cx = Number.NaN;
  }

  get showingAll(): boolean {
    return this.showAll;
  }

  // ---- Per frame ----

  update(now: number, focus: THREE.Vector3): void {
    this.updateUnits(now);
    const fcx = Math.floor(focus.x / CHUNK_M);
    const fcz = Math.floor(focus.z / CHUNK_M);
    if (fcx !== this.focusChunk.cx || fcz !== this.focusChunk.cz) {
      this.focusChunk = { cx: fcx, cz: fcz };
      this.chooseChunks(fcx, fcz);
      this.fowDirty = true;
    }
    if (now - this.lastGrowth > GROWTH_REFRESH_S * 1000) {
      this.lastGrowth = now;
      for (const c of this.chunks.values()) if (c.lod === 1) c.version++;
    }
    this.pump();
    if (this.fowDirty || now - this.fowLastSeen > 200) {
      this.fowLastSeen = now;
      this.rebuildFog();
    }
  }

  /** Which chunks to draw at which detail around the focus; explored land and its edge only, unless showing all. */
  private chooseChunks(fcx: number, fcz: number): void {
    const want = new Map<string, number>();
    const r = QUARTER_DETAIL_RING;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = fcx + dx;
        const cz = fcz + dz;
        if (!this.showAll && !this.nearExplored(cx, cz)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        want.set(ck(cx, cz), d <= FULL_DETAIL_RING ? 1 : d <= HALF_DETAIL_RING ? 2 : 4);
      }
    }
    for (const [key, c] of this.chunks) {
      const w = want.get(key);
      if (w === undefined) {
        this.dropChunk(c);
        this.chunks.delete(key);
      } else c.want = w;
    }
    for (const [key, w] of want) {
      if (this.chunks.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      this.chunks.set(key, { cx, cz, lod: 0, want: w, pending: 0, version: 0, meshedVersion: -1, requested: 0, group: null, heights: null, size: 0, props: [], meshedAt: 0 });
    }
  }

  private nearExplored(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.explored.has(ck(cx + dx, cz + dz))) return true;
    return false;
  }

  /** Sends mesh requests, nearest first, keeping each worker a couple deep. */
  private pump(): void {
    const todo: ChunkView[] = [];
    for (const c of this.chunks.values()) {
      if (c.pending) continue;
      if (c.lod !== c.want || c.meshedVersion !== c.version) todo.push(c);
    }
    if (todo.length === 0) return;
    const f = this.focusChunk;
    // Missing chunks first, then nearest.
    todo.sort((a, b) => (a.lod === 0 ? 0 : 1) - (b.lod === 0 ? 0 : 1) || Math.max(Math.abs(a.cx - f.cx), Math.abs(a.cz - f.cz)) - Math.max(Math.abs(b.cx - f.cx), Math.abs(b.cz - f.cz)));
    for (const c of todo) {
      let best = -1;
      for (let i = 0; i < this.workers.length; i++) if (this.inflight[i]! < 2 && (best < 0 || this.inflight[i]! < this.inflight[best]!)) best = i;
      if (best < 0) return;
      const id = this.nextId++;
      c.pending = id;
      this.inflight[best]!++;
      this.requests.set(id, { key: ck(c.cx, c.cz), worker: best });
      c.requested = c.version;
      this.workers[best]!.postMessage({ type: 'mesh', id, cx: c.cx, cz: c.cz, lod: c.want, simStep: this.simStep, scenery: true } satisfies ToMesh);
    }
  }

  private onMesh(msg: FromMesh, worker: number): void {
    if (msg.type === 'minimap') {
      this.onMinimap(msg.cx, msg.cz, msg.rgba);
      return;
    }
    this.inflight[worker] = Math.max(0, this.inflight[worker]! - 1);
    this.requests.delete(msg.id);
    this.lastMeshMs = msg.ms;
    const c = this.chunks.get(ck(msg.cx, msg.cz));
    if (!c || c.pending !== msg.id) return;
    c.pending = 0;
    c.meshedVersion = c.requested;
    this.install(c, msg);
  }

  private install(c: ChunkView, m: MeshResult): void {
    this.dropChunk(c);
    const group = new THREE.Group();
    group.position.set(c.cx * CHUNK_M, 0, c.cz * CHUNK_M);
    group.add(new THREE.Mesh(geometryOf(m.land), this.terrainMat));
    if (m.water) {
      const water = new THREE.Mesh(geometryOf(m.water), this.waterMat);
      water.renderOrder = 1;
      group.add(water);
    }
    if (m.cubes && m.cubes.length > 0) group.add(this.cubesMesh(m.cubes));
    this.scene.add(group);
    group.updateMatrixWorld(true);
    c.group = group;
    c.lod = m.lod;
    c.heights = m.heights;
    c.size = m.size;
    c.props = m.props.map((p) => this.propSelectable(c, p));
    c.meshedAt = performance.now();
  }

  private cubesMesh(cubes: Float32Array): THREE.InstancedMesh {
    const n = cubes.length / CUBE_STRIDE;
    const mesh = new THREE.InstancedMesh(this.cubeGeo, this.cubeMat, n);
    const mat = mesh.instanceMatrix.array as Float32Array;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * CUBE_STRIDE;
      const m = i * 16;
      mat.fill(0, m, m + 16);
      mat[m] = cubes[o + 3]!;
      mat[m + 5] = cubes[o + 4]!;
      mat[m + 10] = cubes[o + 5]!;
      mat[m + 12] = cubes[o]!;
      mat[m + 13] = cubes[o + 1]!;
      mat[m + 14] = cubes[o + 2]!;
      mat[m + 15] = 1;
      const rgb = cubes[o + 6]!;
      colours[i * 3] = ((rgb >> 16) & 255) / 255;
      colours[i * 3 + 1] = ((rgb >> 8) & 255) / 255;
      colours[i * 3 + 2] = (rgb & 255) / 255;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  private propSelectable(c: ChunkView, p: PropSummary): Selectable {
    const info = propInfo(p.kind);
    const x = c.cx * CHUNK_M + p.x;
    const z = c.cz * CHUNK_M + p.z;
    const tree = info.shape === PropShape.Tree;
    const stage = tree ? ['seed', 'sapling', ''][p.stage] : '';
    const holds = info.resource ? `${p.amount} ${info.resource}` : info.yield === 0 ? 'no lumber' : '';
    const details: string[] = [];
    if (info.resource) {
      details.push(`Gatherers: ${info.gatherers} at a time; ${info.perLoad} per load.`);
      details.push(`Tool needed: ${['none', 'hardwood', 'flint', 'copper', 'bronze', 'bloom iron', 'wrought iron', 'refined iron', 'steel', 'high quality steel'][info.tool]}.`);
    }
    if (stage) details.push(`Growing: ${stage}.`);
    return {
      key: `p:${c.cx},${c.cz}:${p.index}`,
      kind: 'node',
      owner: NOBODY,
      typeKey: `node:${info.name.toLowerCase()}`,
      centre: new THREE.Vector3(x, p.y, z),
      halfSize: new THREE.Vector3(p.hx, p.hy, p.hz),
      label: holds ? `${info.name} (${holds})` : info.name,
      details,
    };
  }

  private dropChunk(c: ChunkView): void {
    if (!c.group) return;
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    c.group = null;
    c.lod = 0;
  }

  // ---- Fog of war ----

  private rebuildFog(): void {
    this.fowDirty = false;
    const f = this.focusChunk;
    if (Number.isNaN(f.cx)) return;
    const half = FOW_TILES / FOG_TILES_PER_CHUNK / 2;
    const ox = (f.cx - half) * FOG_TILES_PER_CHUNK;
    const oz = (f.cz - half) * FOG_TILES_PER_CHUNK;
    const data = this.fowData;
    data.fill(0);
    const chunksAcross = FOW_TILES / FOG_TILES_PER_CHUNK;
    for (let j = 0; j < chunksAcross; j++) {
      for (let i = 0; i < chunksAcross; i++) {
        const bits = this.explored.get(ck(f.cx - half + i, f.cz - half + j));
        if (!bits) continue;
        for (let t = 0; t < 256; t++) {
          if ((bits[t >> 3]! & (1 << (t & 7))) === 0) continue;
          const tx = i * FOG_TILES_PER_CHUNK + (t & 15);
          const tz = j * FOG_TILES_PER_CHUNK + (t >> 4);
          data[tz * FOW_TILES + tx] = 128;
        }
      }
    }
    // Seen now: within sight of the player's units.
    const s = this.curr;
    if (s) {
      const tileWu = WU_PER_COLUMN * 4;
      for (let i = 0; i < s.count; i++) {
        const o = i * STATE_STRIDE;
        if (s.data[o + 1] !== this.player) continue;
        const sight = SIGHT_WU[s.data[o + 2]! as 0 | 1 | 2] ?? SIGHT_WU[0];
        const ux = s.data[o + 3]! / tileWu - ox;
        const uz = s.data[o + 5]! / tileWu - oz;
        const r = sight / tileWu;
        for (let tz = Math.max(0, Math.floor(uz - r)); tz <= Math.min(FOW_TILES - 1, Math.ceil(uz + r)); tz++) {
          for (let tx = Math.max(0, Math.floor(ux - r)); tx <= Math.min(FOW_TILES - 1, Math.ceil(ux + r)); tx++) {
            const dx = tx + 0.5 - ux;
            const dz = tz + 0.5 - uz;
            if (dx * dx + dz * dz <= r * r) data[tz * FOW_TILES + tx] = 255;
          }
        }
      }
    }
    this.fow.fowArea.value.set(ox * FOW_TILE_M, oz * FOW_TILE_M, FOW_TILES * FOW_TILE_M);
    this.fow.fowTex.value.needsUpdate = true;
  }

  // ---- Units ----

  private updateUnits(now: number): void {
    const curr = this.curr;
    if (!curr) return;
    const prev = this.prev && this.prev.count === curr.count ? this.prev : null;
    const alpha = prev ? Math.min(1, (now - this.currAt) / STEP_MS) : 1;
    const counts = [0, 0];
    const t = now / 1000;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      const d = curr.data;
      const p = prev && alpha < 1 ? prev.data : d;
      const x = (p[o + 3]! + (d[o + 3]! - p[o + 3]!) * alpha) / WU_PER_METRE;
      const y = (p[o + 4]! + (d[o + 4]! - p[o + 4]!) * alpha) / WU_PER_METRE;
      const z = (p[o + 5]! + (d[o + 5]! - p[o + 5]!) * alpha) / WU_PER_METRE;
      const heading = (d[o + 6]! / 65536) * Math.PI * 2;
      const owner = d[o + 1]!;
      const kind = d[o + 2]!;
      const moving = d[o + 7] !== OrderKind.Idle;
      const colour = owner === NEUTRAL ? NEUTRAL_COLOUR : (PLAYER_COLOURS[owner] ?? NEUTRAL_COLOUR);
      this.units[i]?.centre.set(x, y + 0.85, z);
      if (this.unitModels.length > 0) {
        const m = kind === UnitKind.Warrior ? 1 : 0;
        const model = this.unitModels[m]!;
        model.setInstance(counts[m]!++, x, y, z, heading, moving ? 'walk' : 'idle', t + (d[o]! % 7) * 0.37, colour);
      } else {
        const dummy = this.fallbackDummy;
        dummy.position.set(x, y, z);
        dummy.rotation.y = heading;
        dummy.updateMatrix();
        this.fallback.setMatrixAt(i, dummy.matrix);
        this.fallback.setColorAt(i, colour);
      }
    }
    if (this.unitModels.length > 0) {
      this.unitModels.forEach((m, k) => {
        m.setCount(counts[k]!);
        m.commit();
      });
    } else {
      this.fallback.count = curr.count;
      this.fallback.instanceMatrix.needsUpdate = true;
      if (this.fallback.instanceColor) this.fallback.instanceColor.needsUpdate = true;
    }
  }

  // ---- Hooks ----

  /** Ground height in metres at a point, from whatever detail is drawn there; null where nothing is. */
  heightAt(x: number, z: number): number | null {
    const cx = Math.floor(x / CHUNK_M);
    const cz = Math.floor(z / CHUNK_M);
    const c = this.chunks.get(ck(cx, cz));
    if (!c || !c.heights) return null;
    const step = COLUMNS_PER_CHUNK / c.size;
    const i = Math.min(c.size - 1, Math.floor((x - cx * CHUNK_M) / (COLUMN_M * step)));
    const j = Math.min(c.size - 1, Math.floor((z - cz * CHUNK_M) / (COLUMN_M * step)));
    return c.heights[j * c.size + i]! * UNIT_M;
  }

  private readonly pickPoint = new THREE.Vector3();
  private pick(ray: THREE.Raycaster): THREE.Vector3 | null {
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const p = this.pickPoint;
    let prevT = 0;
    let t = 0;
    for (let n = 0; n < 4000 && t < 2000; n++) {
      p.copy(o).addScaledVector(d, t);
      const h = this.heightAt(p.x, p.z) ?? 0;
      if (p.y <= h) {
        // Refine between the last point above the ground and this one.
        let a = prevT;
        let b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          p.copy(o).addScaledVector(d, m);
          if (p.y <= (this.heightAt(p.x, p.z) ?? 0)) b = m;
          else a = m;
        }
        return o.clone().addScaledVector(d, b);
      }
      prevT = t;
      t += Math.max(0.2, Math.min(4, (p.y - h) * 0.5));
    }
    return null;
  }

  private *candidates(): Iterable<Selectable> {
    yield* this.units;
    for (const c of this.chunks.values()) if (c.lod === 1) yield* c.props;
  }

  // ---- Minimap ----

  private requestMinimap(cx: number, cz: number): void {
    const key = ck(cx, cz);
    let t = this.minimapTiles.get(key);
    if (!t) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      t = { cx, cz, rgba: null, canvas, pending: false };
      this.minimapTiles.set(key, t);
    }
    if (t.pending) return;
    t.pending = true;
    const w = (cx * 7 + cz * 13) & 0x7fffffff;
    this.workers[w % this.workers.length]!.postMessage({ type: 'minimap', id: 0, cx, cz } satisfies ToMesh);
  }

  private onMinimap(cx: number, cz: number, rgba: Uint8ClampedArray): void {
    const t = this.minimapTiles.get(ck(cx, cz));
    if (!t) return;
    t.pending = false;
    t.rgba = rgba;
    this.maskTile(t);
  }

  /** Copies the tile's colours onto its canvas where explored. */
  private maskTile(t: { cx: number; cz: number; rgba: Uint8ClampedArray | null; canvas: HTMLCanvasElement }): void {
    if (!t.rgba) return;
    const bits = this.explored.get(ck(t.cx, t.cz));
    const img = new ImageData(16, 16);
    for (let k = 0; k < 256; k++) {
      if (!bits || (bits[k >> 3]! & (1 << (k & 7))) === 0) continue;
      img.data.set(t.rgba.subarray(k * 4, k * 4 + 4), k * 4);
    }
    t.canvas.getContext('2d')!.putImageData(img, 0, 0);
    this.minimapVersion++;
  }

  private minimapBounds(): { minX: number; minZ: number; maxX: number; maxZ: number } {
    const b = this.exploredBounds;
    if (!b.any) return { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
    return { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ };
  }

  private paintMinimap(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = false;
    for (const t of this.minimapTiles.values()) {
      if (!t.rgba) continue;
      ctx.drawImage(t.canvas, t.cx * CHUNK_M, t.cz * CHUNK_M, CHUNK_M, CHUNK_M);
    }
  }

  /** The props selected right now that a debug fell can take from: chunk and index. */
  static propKey(key: string): { cx: number; cz: number; index: number } | null {
    const m = /^p:(-?\d+),(-?\d+):(\d+)$/.exec(key);
    return m ? { cx: Number(m[1]), cz: Number(m[2]), index: Number(m[3]) } : null;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) this.dropChunk(c);
    this.models?.dispose();
  }
}
