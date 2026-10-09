// Life on the buildings after dark (VX-2, VX-3). Jade: "Occupied buildings
// where it makes sense (farm,barn, etc) have lit windows that cast light at
// night. Mainbases always have lit windows or built in torches at night,
// casting light." And: "farm chimneys have smoke particle effects at night,
// only if they are occupied by at least one worker. The bighouse campfire has
// smaller particle smoke effects from its pre-existing fire and also moving
// flame effects".
//
// Lit windows: warm panes added over the windows of the catalogue models (the
// tables below, read from their .bbmodel files: the windows a model has, and
// panes set on the walls facing the camera where it has too few) or round the
// walls of the block looks, brightening with the dark. The point lights of
// buildings-view.ts go to the nearest of them along with the flames. Smoke:
// soft grey puffs from a farmhouse's chimney top at night while a worker is
// in the Farm or at work on it, and smaller ones from the Big House's
// campfire, day and night, over flames that rise, sway and flicker. The Big
// House model has no spit roast, so none turns here.
//
// All pooled: three instanced meshes, one particle buffer and a little state
// per building; nothing is made per frame. Nothing shows where the fog of war
// hides it now (a lit window would tell who is home).
import * as THREE from 'three';
import { BuildingKind } from '@blockyrts/sim';
import type { BuildingInfo } from '../messages.ts';
import { Face, type Look, type Pane } from './building-looks.ts';
import type { FowUniforms } from './fog-material.ts';

/** Metres per Blockbench unit (the model converter's UNIT_METRES). */
const BB_M = 0.028125;
const MAX_PANES = 1024;
const MAX_PUFFS = 512;
const MAX_TONGUES = 96;
/** Glowing buildings that may take a point light. */
const MAX_SPOTS = 64;
/** Buildings farther than this from the focus draw no panes, smoke or flames (m). */
const NEAR_M = 80;
/** How long windows take to light up or go dark as workers come and go, s. */
const FADE_S = 0.8;
/** The window glow at full dark, linear rgb. */
const WARM = new THREE.Color(1.0, 0.62, 0.26);
/** Panes stand this far off the wall (m), and cover this share of the window (its frame shows round them). */
const LIFT_M = 0.02;
const INSET_W = 0.8;
const INSET_H = 0.84;
/** Kinds whose windows light while a worker is inside or at work there: the shelters (Jade: "where it makes sense (farm,barn, etc)"). */
const OCCUPIED_GLOW: ReadonlySet<number> = new Set([BuildingKind.Farm, BuildingKind.Barn]);
/** Chimney smoke at night: puffs a second at full dark. */
const CHIMNEY_RATE = 2.4;
/** The Big House campfire's smoke, always: puffs a second. */
const FIRE_SMOKE_RATE = 3;
/** Flame tongues per campfire, besides its core. */
const TONGUES = 6;

/** Each face's turn about +Y (cos, sin) from a plane facing +Z, and its outward normal. */
const FACES = [
  { c: -1, s: 0, nx: 0, nz: -1 },
  { c: 1, s: 0, nx: 0, nz: 1 },
  { c: 0, s: -1, nx: -1, nz: 0 },
  { c: 0, s: 1, nx: 1, nz: 0 },
] as const;

// ---- What the catalogue models have, in Blockbench units from the model's origin ----

/** Panes in a row on one face: the face's plane, where along it (x on a north or south face, z on a west or east one), at what heights (middles). */
function row(face: number, plane: number, along: readonly number[], ys: readonly number[], w = 8, h = 12): Pane[] {
  const ns = face === Face.N || face === Face.S;
  return ys.flatMap((y) => along.map((a) => ({ x: ns ? a : plane, y, z: ns ? plane : a, w, h, face })));
}

interface ModelGlow {
  panes: Pane[];
  /** Chimney tops that smoke (the model's fx_smoke). */
  smoke: THREE.Vector3[];
  /** Campfire hearths, where the flames stand. */
  fires: THREE.Vector3[];
}

function inMetres(panes: Pane[], smoke: ReadonlyArray<readonly [number, number, number]> = [], fires: ReadonlyArray<readonly [number, number, number]> = []): ModelGlow {
  const v = ([x, y, z]: readonly [number, number, number]): THREE.Vector3 => new THREE.Vector3(x * BB_M, y * BB_M, z * BB_M);
  return {
    panes: panes.map((p) => ({ x: p.x * BB_M, y: p.y * BB_M, z: p.z * BB_M, w: p.w * BB_M, h: p.h * BB_M, face: p.face })),
    smoke: smoke.map(v),
    fires: fires.map(v),
  };
}

/** The Citadel's four corner towers' arrow slits, two storeys on every face. */
function towerSlits(): Pane[] {
  const ys = [35, 117];
  return [-92, 92].flatMap((cz) =>
    [-92, 92].flatMap((cx) => [
      ...row(Face.N, cz - 24.5, [cx], ys, 2, 10),
      ...row(Face.S, cz + 24.5, [cx], ys, 2, 10),
      ...row(Face.W, cx - 24.5, [cz], ys, 2, 10),
      ...row(Face.E, cx + 24.5, [cz], ys, 2, 10),
    ]),
  );
}

/**
 * Model by model. The camera looks north, so south faces are the ones seen:
 * where a main base's windows are all on its north face (the Keep's and the
 * Citadel's keeps) the same windows are lit on its south face too, and the Big
 * House and the barn, which have none, get panes on their walls ("lit
 * windows or built in torches", Jade).
 */
const MODEL_GLOW: ReadonlyMap<string, ModelGlow> = new Map([
  ['farmhouse_t1', inMetres([...row(Face.S, 36.5, [0], [45]), ...row(Face.W, -32.5, [0], [45]), ...row(Face.E, 32.5, [0], [45])], [[18, 111, 22]])],
  ['farmhouse_t2', inMetres([...row(Face.S, 30.5, [-13.33, 13.33], [46.8]), ...row(Face.W, -40.5, [-10, 10], [46.8]), ...row(Face.E, 40.5, [-10, 10], [46.8])], [[28, 139, 12]])],
  ['farmhouse_t3', inMetres([...row(Face.S, 30.5, [-14, 14], [48.6]), ...row(Face.W, -42.5, [0], [48.6]), ...row(Face.E, 42.5, [0], [48.6])], [[-30, 145, 0]])],
  // The stand-in barn: the hayloft door, the gable ends' loft windows and windows low on its walls.
  [
    'pen_barn',
    inMetres([
      ...row(Face.N, -1.2, [0], [116], 20, 12),
      ...row(Face.S, 72, [-24, 24], [60]),
      ...row(Face.W, -48, [18, 54], [60]),
      ...row(Face.E, 48, [18, 54], [60]),
      ...row(Face.W, -48, [36], [118]),
      ...row(Face.E, 48, [36], [118]),
    ]),
  ],
  // Big House: panes on the hall's walls (it has no windows of its own) and the campfire by its door.
  [
    'main_base_l1',
    inMetres([...row(Face.S, 72, [-46, -24, -2], [40]), ...row(Face.W, -64, [-30, 4, 38], [40]), ...row(Face.E, 16, [-30, 4, 38], [40]), ...row(Face.N, -56, [-54], [40])], [], [[52, 4, -70]]),
  ],
  // Hall: its windows, two storeys (none over the door).
  [
    'main_base_l3',
    inMetres([
      ...row(Face.N, -56.5, [-32, 32], [46.8]),
      ...row(Face.N, -56.5, [-32, 0, 32], [121.8]),
      ...row(Face.S, 64.5, [-32, 0, 32], [46.8, 121.8]),
      ...row(Face.W, -64.5, [-26, 4, 34], [46.8, 121.8]),
      ...row(Face.E, 64.5, [-26, 4, 34], [46.8, 121.8]),
    ]),
  ],
  // Keep: the keep's windows (north, and the same on the south), its slits, and the wings' windows on their open faces.
  [
    'main_base_l6',
    inMetres([
      ...row(Face.N, -42.5, [-20, 20], [107, 167], 8, 14),
      ...row(Face.S, 42.5, [-20, 20], [107, 167], 8, 14),
      ...row(Face.N, -42.5, [0], [35, 120, 205], 2, 10),
      ...row(Face.S, 42.5, [0], [35, 120, 205], 2, 10),
      ...row(Face.W, -42.5, [0], [205], 2, 10),
      ...row(Face.E, 42.5, [0], [205], 2, 10),
      ...row(Face.N, -40.5, [-82, -62, 62, 82], [45, 97]),
      ...row(Face.S, 52.5, [-82, -62, 62, 82], [45, 97]),
      ...row(Face.W, -102.5, [-17, 6, 29], [45, 97]),
      ...row(Face.E, 102.5, [-17, 6, 29], [45, 97]),
    ]),
  ],
  // Citadel: the keep's windows (north, and the same on the south), its slits and the corner towers' slits.
  [
    'main_base_l10',
    inMetres([
      ...row(Face.N, -40.5, [-30, 0, 30], [128, 188, 238], 8, 16),
      ...row(Face.S, 64.5, [-30, 0, 30], [128, 188, 238], 8, 16),
      ...row(Face.N, -40.5, [0], [35, 101.7, 168.3], 2, 10),
      ...row(Face.S, 64.5, [0], [35, 101.7, 168.3], 2, 10),
      ...row(Face.W, -52.5, [12], [35, 101.7, 168.3], 2, 10),
      ...row(Face.E, 52.5, [12], [35, 101.7, 168.3], 2, 10),
      ...towerSlits(),
    ]),
  ],
]);

/** A catalogue model drawn for a building, from its anchor (buildings-view.ts catalogueIds). */
export interface GlowModel {
  id: string;
  dx: number;
  dz: number;
  scale: number;
}

/** Where a glowing building's light goes this frame: its middle, reach and brightness. */
export interface GlowSpot {
  p: THREE.Vector3;
  r: number;
  k: number;
}

interface GlowState {
  /** How lit its windows are, 0 to 1, easing as workers come and go. */
  on: number;
  /** Puffs owed to its chimneys and its campfire. */
  smoke: number;
  fire: number;
  /** The frame it was last seen in. */
  frame: number;
}

// Scratch, never kept.
const M = new THREE.Matrix4();
const COLOUR = new THREE.Color();
const SUM = new THREE.Vector3();
const FLAME_YELLOW = new THREE.Color(1.0, 0.86, 0.36);
const FLAME_ORANGE = new THREE.Color(1.0, 0.5, 0.1);
const FLAME_RED = new THREE.Color(0.78, 0.18, 0.05);
const SMOKE_DAY = new THREE.Color(0.62, 0.62, 0.6);
const SMOKE_NIGHT = new THREE.Color(0.3, 0.31, 0.34);

/** Instance matrix: turned (cos, sin) about +Y, sized, then moved. */
function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, c: number, s: number, sx: number, sy: number, sz: number): void {
  M.set(c * sx, 0, s * sz, x, 0, sy, 0, y, -s * sx, 0, c * sz, z, 0, 0, 0, 1);
  mesh.setMatrixAt(i, M);
}

/** Draws the first n instances, uploading only those. */
function show(mesh: THREE.InstancedMesh, n: number): void {
  mesh.count = n;
  if (n === 0) return;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}

/** A steady 0 to 1 from a number. */
function hash(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Only where the fog of war shows the building now: the glow dims (add), the
 * puff fades (alpha) or the flame is cut out (cut). Puffs also take their own
 * alpha from the puffAlpha attribute.
 */
function inSight(mat: THREE.Material, fow: FowUniforms, mode: 'add' | 'alpha' | 'cut', puff: boolean): void {
  const hide = mode === 'add' ? 'gl_FragColor.rgb *= seen;' : mode === 'alpha' ? 'gl_FragColor.a *= seen;' : 'if (seen < 0.5) discard;';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fow);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSightWorld;${puff ? '\nattribute float puffAlpha;\nvarying float vPuffAlpha;' : ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vSightWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSightWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif${puff ? '\n  vPuffAlpha = puffAlpha;' : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D fowTex;\nuniform vec3 fowArea;\nuniform float fowAll;\nvarying vec3 vSightWorld;${puff ? '\nvarying float vPuffAlpha;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${puff ? '\n  diffuseColor.a *= vPuffAlpha;' : ''}`)
      .replace(
        '#include <dithering_fragment>',
        `{
    vec2 suv = (vSightWorld.xz - fowArea.xy) / fowArea.z;
    float sf = (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) ? 0.0 : texture2D(fowTex, suv).r;
    float seen = smoothstep(0.6, 0.9, max(sf, fowAll));
    ${hide}
  }
#include <dithering_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `glow-${mode}${puff ? '-puff' : ''}`;
}

export class BuildingGlow {
  private readonly panes: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly puffs: THREE.InstancedMesh;
  private readonly puffAlpha: THREE.InstancedBufferAttribute;
  private readonly smokeMat: THREE.MeshBasicMaterial;
  /** Per puff: x y z, vx vy vz, age, life, start and end size, alpha, angle, spin, shade. */
  private readonly p = new Float32Array(MAX_PUFFS * 14);
  private puffN = 0;
  private paneN = 0;
  private tongueN = 0;
  private readonly states = new Map<number, GlowState>();
  private frame = 0;
  private last = 0;
  private dt = 0;
  /** Seconds, for the flames and the flicker. */
  private t = 0;
  private dark = 0;
  private readonly focus = new THREE.Vector3();
  /** The glowing buildings' lights this frame (spotCount of them), for buildings-view.ts. */
  readonly spots: readonly GlowSpot[] = Array.from({ length: MAX_SPOTS }, () => ({ p: new THREE.Vector3(), r: 0, k: 0 }));
  spotCount = 0;

  constructor(scene: THREE.Scene, fow: FowUniforms) {
    const paneMat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    inSight(paneMat, fow, 'add', false);
    this.panes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), paneMat, MAX_PANES);
    const flameMat = new THREE.MeshBasicMaterial();
    inSight(flameMat, fow, 'cut', false);
    this.flames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), flameMat, MAX_TONGUES);
    const puffGeo = new THREE.BoxGeometry(1, 1, 1);
    this.puffAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1);
    this.puffAlpha.setUsage(THREE.DynamicDrawUsage);
    puffGeo.setAttribute('puffAlpha', this.puffAlpha);
    this.smokeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    inSight(this.smokeMat, fow, 'alpha', true);
    this.puffs = new THREE.InstancedMesh(puffGeo, this.smokeMat, MAX_PUFFS);
    for (const m of [this.panes, this.flames, this.puffs]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Made now, so the colours never come late to the shader.
      m.setColorAt(0, COLOUR.setRGB(1, 1, 1));
      scene.add(m);
    }
  }

  /** Starts a frame: now in ms, darkness 0 by day to 1 at night, the camera's focus. */
  begin(now: number, darkness: number, focus: THREE.Vector3): void {
    this.dt = this.last > 0 ? Math.min(0.1, Math.max(0, (now - this.last) / 1000)) : 0;
    this.last = now;
    this.t = now / 1000;
    this.dark = darkness;
    this.focus.copy(focus);
    this.frame++;
    this.paneN = 0;
    this.tongueN = 0;
    this.spotCount = 0;
  }

  /**
   * One building, once a frame between begin() and end(): own is whether it is
   * the local player's. models are the catalogue models drawn for it (from the
   * anchor ax, az) or empty while its block look is drawn (from its level's
   * corner ox, oz); y is its floor.
   */
  add(b: BuildingInfo, own: boolean, models: readonly GlowModel[], look: Look | null, ax: number, az: number, ox: number, oz: number, y: number): void {
    const main = b.kind === BuildingKind.MainBase;
    if (!main && !OCCUPIED_GLOW.has(b.kind)) return;
    let st = this.states.get(b.id);
    if (!st) {
      st = { on: 0, smoke: 0, fire: 0, frame: 0 };
      this.states.set(b.id, st);
    }
    st.frame = this.frame;
    // "Occupied by at least one worker" (Jade): someone in it, or at work there.
    const occupied = b.inside.length > 0 || b.working > 0;
    const wants = b.complete && (main || (OCCUPIED_GLOW.has(b.kind) && occupied));
    st.on = Math.max(0, Math.min(1, st.on + (wants ? 1 : -1) * (this.dt / FADE_S)));
    const fx = ax - this.focus.x;
    const fz = az - this.focus.z;
    if (!b.complete || fx * fx + fz * fz > NEAR_M * NEAR_M) {
      st.smoke = 0;
      return;
    }
    const light = this.dark * st.on;
    const smokes = b.kind === BuildingKind.Farm && occupied && this.dark > 0.3;
    st.smoke = smokes ? st.smoke + this.dt * CHIMNEY_RATE * this.dark : 0;
    const first = this.paneN;
    SUM.set(0, 0, 0);
    if (models.length > 0) {
      for (const m of models) {
        const g = MODEL_GLOW.get(m.id);
        if (!g) continue;
        const x0 = ax + m.dx;
        const z0 = az + m.dz;
        if (light > 0.01) this.addPanes(g.panes, x0, y, z0, m.scale, light, b.id);
        if (smokes) for (const s of g.smoke) this.chimney(st, x0 + s.x * m.scale, y + s.y * m.scale, z0 + s.z * m.scale, m.scale);
        if (main) for (const f of g.fires) this.fire(st, x0 + f.x * m.scale, y + f.y * m.scale, z0 + f.z * m.scale, m.scale, b.id);
      }
    } else if (look) {
      if (light > 0.01) this.addPanes(look.windows, ox, y, oz, 1, light, b.id);
      if (smokes) for (const s of look.smoke) this.chimney(st, ox + s.x, y + s.y, oz + s.z, 1);
    }
    if (smokes) st.smoke -= Math.floor(st.smoke);
    // Its light: in the middle of its lit panes, low enough to light the ground round it. Only the player's own or a main base
    // (always lit) casts it, so no light tells through the fog who is home.
    const n = this.paneN - first;
    if (n > 0 && (own || main) && this.spotCount < MAX_SPOTS) {
      const spot = this.spots[this.spotCount++]!;
      spot.p.copy(SUM).divideScalar(n);
      spot.p.y = Math.min(spot.p.y, y + 2.4);
      spot.r = main ? 11 : 7;
      spot.k = (main ? 6 : 4) * light;
    }
  }

  private addPanes(panes: readonly Pane[], x0: number, y0: number, z0: number, k: number, light: number, seed: number): void {
    for (let i = 0; i < panes.length && this.paneN < MAX_PANES; i++) {
      const p = panes[i]!;
      const f = FACES[p.face] ?? FACES[1];
      const x = x0 + p.x * k + f.nx * LIFT_M;
      const y = y0 + p.y * k;
      const z = z0 + p.z * k + f.nz * LIFT_M;
      place(this.panes, this.paneN, x, y, z, f.c, f.s, p.w * k * INSET_W, p.h * k * INSET_H, 1);
      // A candle's flicker, each window its own.
      const flicker = 0.9 + 0.1 * Math.sin(this.t * 2.3 + seed + i * 1.7) * Math.sin(this.t * 5.3 + i * 0.9);
      const v = light * flicker;
      this.panes.setColorAt(this.paneN, COLOUR.setRGB(WARM.r * v, WARM.g * v, WARM.b * v));
      SUM.x += x;
      SUM.y += y;
      SUM.z += z;
      this.paneN++;
    }
  }

  /** Puffs from a chimney top, as many as are owed. */
  private chimney(st: GlowState, x: number, y: number, z: number, k: number): void {
    for (let n = Math.floor(st.smoke); n > 0; n--) this.spawn(x, y, z, k * 0.1, k * 0.38, 0.32, 3.2, 0.5);
  }

  /** The Big House campfire: flames rising from its hearth and a thinner smoke above them. */
  private fire(st: GlowState, x: number, y: number, z: number, k: number, seed: number): void {
    const u = BB_M * k;
    // Each tongue rises from the hearth, sways, shrinks and reddens, then starts again somewhere else on the logs.
    for (let i = 0; i <= TONGUES && this.tongueN < MAX_TONGUES; i++) {
      if (i === TONGUES) {
        // The core: low and bright, never still.
        const w = 4.2 + 0.6 * Math.sin(this.t * 11 + seed);
        const h = 6 + 1.6 * Math.sin(this.t * 13.7 + seed * 0.3) * Math.sin(this.t * 7.1);
        place(this.flames, this.tongueN, x, y + (h / 2) * u, z, Math.cos(this.t * 2), Math.sin(this.t * 2), w * u, h * u, w * u);
        this.flames.setColorAt(this.tongueN++, COLOUR.copy(FLAME_YELLOW).lerp(FLAME_ORANGE, 0.25));
        continue;
      }
      const period = 0.5 + 0.11 * (i % 3);
      const run = this.t / period + i / TONGUES + seed * 0.37;
      const cycle = Math.floor(run);
      const t = run - cycle;
      const h1 = hash(cycle * 7 + i * 131 + seed);
      const h2 = hash(cycle * 13 + i * 71 + seed + 0.5);
      const h3 = hash(cycle * 3 + i * 29 + seed + 0.25);
      const sway = Math.sin(this.t * 6 + i * 1.9) * 0.8 * t;
      const tx = x + ((h1 - 0.5) * 5 + sway) * u;
      const tz = z + (h2 - 0.5) * 5 * u;
      const ty = y + (1 + t * (10 + 6 * h3)) * u;
      const size = (3.2 + 1.6 * h3) * Math.pow(1 - t, 0.8) * u;
      const a = h1 * Math.PI;
      place(this.flames, this.tongueN, tx, ty, tz, Math.cos(a), Math.sin(a), size, size * 1.4, size);
      if (t < 0.35) COLOUR.copy(FLAME_YELLOW).lerp(FLAME_ORANGE, t / 0.35);
      else COLOUR.copy(FLAME_ORANGE).lerp(FLAME_RED, (t - 0.35) / 0.65);
      this.flames.setColorAt(this.tongueN++, COLOUR);
    }
    st.fire += this.dt * FIRE_SMOKE_RATE;
    for (; st.fire >= 1; st.fire--) this.spawn(x, y + 15 * u, z, k * 0.05, k * 0.18, 0.26, 2.0, 0.38);
  }

  /** A puff: where, its size at birth and at the end, how fast it rises, how long it lasts and how thick it is. */
  private spawn(x: number, y: number, z: number, s0: number, s1: number, rise: number, life: number, alpha: number): void {
    if (this.puffN >= MAX_PUFFS) return;
    const o = this.puffN++ * 14;
    const p = this.p;
    p[o] = x + (Math.random() - 0.5) * s0 * 0.5;
    p[o + 1] = y;
    p[o + 2] = z + (Math.random() - 0.5) * s0 * 0.5;
    // A light breeze from the west, and a little wander.
    p[o + 3] = 0.07 + (Math.random() - 0.5) * 0.08;
    p[o + 4] = rise * (0.8 + Math.random() * 0.4);
    p[o + 5] = -0.03 + (Math.random() - 0.5) * 0.08;
    p[o + 6] = 0;
    p[o + 7] = life * (0.8 + Math.random() * 0.4);
    p[o + 8] = s0;
    p[o + 9] = s1 * (0.85 + Math.random() * 0.3);
    p[o + 10] = alpha;
    p[o + 11] = Math.random() * Math.PI;
    p[o + 12] = (Math.random() - 0.5) * 1.2;
    p[o + 13] = 0.85 + Math.random() * 0.15;
  }

  /** Ends the frame: moves the smoke, and shows what was added. */
  end(): void {
    const dt = this.dt;
    const p = this.p;
    const alphas = this.puffAlpha.array as Float32Array;
    let w = 0;
    for (let r = 0; r < this.puffN; r++) {
      const o = r * 14;
      const age = p[o + 6]! + dt;
      if (age >= p[o + 7]!) continue;
      const d = w * 14;
      if (d !== o) p.copyWithin(d, o, o + 14);
      p[d + 6] = age;
      // Rising slows a little as it spreads.
      p[d + 4] = p[d + 4]! * (1 - 0.2 * dt);
      p[d] = p[d]! + p[d + 3]! * dt;
      p[d + 1] = p[d + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[d + 2]! + p[d + 5]! * dt;
      p[d + 11] = p[d + 11]! + p[d + 12]! * dt;
      const t = age / p[d + 7]!;
      const size = p[d + 8]! + (p[d + 9]! - p[d + 8]!) * Math.sqrt(t);
      const a = p[d + 11]!;
      place(this.puffs, w, p[d]!, p[d + 1]!, p[d + 2]!, Math.cos(a), Math.sin(a), size, size, size);
      const shade = p[d + 13]!;
      this.puffs.setColorAt(w, COLOUR.setRGB(shade, shade, shade));
      // In over the first tenth of its life, then out.
      alphas[w] = p[d + 10]! * Math.min(1, t * 10) * Math.pow(1 - t, 1.3);
      w++;
    }
    this.puffN = w;
    this.smokeMat.color.copy(SMOKE_DAY).lerp(SMOKE_NIGHT, this.dark);
    show(this.panes, this.paneN);
    show(this.flames, this.tongueN);
    show(this.puffs, this.puffN);
    if (this.puffN > 0) {
      this.puffAlpha.clearUpdateRanges();
      this.puffAlpha.addUpdateRange(0, this.puffN);
      this.puffAlpha.needsUpdate = true;
    }
    // Forget the buildings that are gone, now and then.
    if (this.frame % 120 === 0) {
      for (const [id, st] of this.states) if (st.frame !== this.frame) this.states.delete(id);
    }
  }
}
