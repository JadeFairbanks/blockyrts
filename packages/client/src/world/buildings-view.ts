// Buildings on screen: each one's look at its level (a catalogue model when
// the model library has one, else the blocks from building-looks.ts). Being
// built, a modelled building shows its model's stage for the work done
// (Patch 5), else the blocks rise with it under scaffolding (an upgrade keeps
// the scaffolding too); at or below half health it wears its damaged look
// (a wall or rampart its cracked, then broken model, and its piece turns and
// corners with the defences beside it), an out light its unlit one, and a
// fallen building leaves its ruins for a while. Flames and point lights
// burn on lit lights, the placement ghost is the building's model seen
// through over its green and red tiles, and planned buildings are faint
// ghosts of their first stage (the block look until a model loads). Lit
// windows, chimney smoke and the Big House campfire are building-glow.ts's.
import * as THREE from 'three';
import { buildingName, buildingSpec, footprintDims, footprintRect, levelFootprint, NEUTRAL, placedDims, type UnitOrder } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import { InstancedModel, TURN_CLIP, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import { NOBODY, type Selectable } from '../selection/types.ts';
import { BuildingGlow } from './building-glow.ts';
import { makeLook, type Look } from './building-looks.ts';
import { fowPatch, patchMaterial, type FowUniforms } from './fog-material.ts';
import { COLUMN_M, UNIT_M } from './mesher.ts';
import { FOG_HALO, lightSource } from './sky-light.ts';

/** Point lights for the flames and lit windows nearest the camera (a fixed number, so shaders never recompile). */
const POINT_LIGHTS = 6;
const TORCH = lightSource('torch_post');
const BONFIRE = lightSource('campfire');
const LANTERN = lightSource('lantern');
type LightSource = ReturnType<typeof lightSource>;
/** A torch post lights 10 m; anything that reaches further is a bonfire. */
const TORCH_REACH_M = 10;
const MAX_TILES = 4096;
const MAX_MODEL_INSTANCES = 64;
/** Wall columns and rampart chunks come by the hundred (Patch 5: each is a catalogue model). */
const WALL_MODEL_INSTANCES = 1024;
const GREEN = new THREE.Color(0x3ee05a);
const RED = new THREE.Color(0xe0402a);
/** A model's being-built stages by thirds of the work (its construction_0, _33 and _66 sets). */
const STAGES = ['construction_0', 'construction_33', 'construction_66'] as const;
/** At or below this share of its health (per mille) a finished building wears its damaged look. */
const DAMAGED_AT = 500;
/** How long a fallen building's ruins stand (sim steps, 20 a second), sinking into the ground over the last of them. */
const RUIN_STEPS = 600;
const RUIN_SINK_STEPS = 100;
/** How see-through the placement ghost and a planned building are. */
const GHOST_OPACITY = 0.45;
const PLANNED_OPACITY = 0.22;
/** The effect anchors in a model where a lit light's flames burn. */
const FLAME_BONES = ['fx_flame', 'fx_fire'];
const UP = new THREE.Vector3(0, 1, 0);

/** Something that may take a point light: where, its reach and brightness, and its distance from the focus squared. */
interface LightSpot {
  p: THREE.Vector3;
  r: number;
  k: number;
  d: number;
  /** The lighting sheet's source it burns like. */
  src: LightSource;
}

/** A catalogue model of a building: its id, where it goes from the anchor (metres), its size, any tint and its turn about +Y (radians). */
export interface CatalogueModel {
  id: string;
  dx: number;
  dz: number;
  scale: number;
  tint?: number;
  yaw?: number;
}

interface Entry {
  sig: string;
  mesh: THREE.Mesh | null;
  scaffold: THREE.Mesh | null;
  flames: THREE.Mesh[];
  /** Where each flame burns, metres from the anchor. */
  flameAt: THREE.Vector3[];
  look: Look;
  selectable: Selectable;
  /** Catalogue models drawn for it (none: the block look). */
  models: CatalogueModel[];
  /** The building as last seen, for its ruins. */
  last: BuildingInfo;
}

/** A model of the placement ghost or a planned building, and where its anchor goes (metres). */
interface GhostModel {
  m: CatalogueModel;
  x: number;
  y: number;
  z: number;
  /** A wall or rampart piece: they come by the hundred. */
  wall: boolean;
}

/** A fallen building's ruins: where it stood and the step it fell. */
interface Ruin {
  b: BuildingInfo;
  models: CatalogueModel[];
  fell: number;
}

/** Which look of its models a building wears: its stage while being built, unlit for an out light, damaged at or below half health, else its own (''). */
function lookState(b: BuildingInfo): string {
  if (!b.complete) return STAGES[Math.min(STAGES.length - 1, Math.floor((b.built * STAGES.length) / 1000))]!;
  if (buildingSpec(b.kind).light && !b.lit) return 'unlit';
  // Walls and earth ramparts crack and break instead (damageLook).
  return buildingSpec(b.kind).defence !== 'wall' && b.hp * 1000 <= b.maxHp * DAMAGED_AT ? 'damaged' : '';
}

/** A building's models in one of their looks (state sets and texture variants, `<id>@<look>`). */
const dressed = (ms: readonly CatalogueModel[], look: string): CatalogueModel[] => ms.map((m) => ({ ...m, id: `${m.id}@${look}` }));

export interface GhostSpot {
  x: number;
  z: number;
  /** Tile reasons, row by row; null while the sim has not answered. */
  tiles: Uint8Array | null;
  /** A wall of a chain's stretch past where the stock runs out: drawn greyed. */
  short?: boolean;
}

export interface Ghost {
  kind: number;
  variant: number;
  spots: GhostSpot[];
  /** Whether it can be paid for now; an unaffordable ghost is drawn greyer. */
  affordable: boolean;
}

/** Blockbench units to a column: where the footprint table puts a model's origin. */
const MODEL_UNITS_PER_COLUMN = 16;

/**
 * Catalogue models for a building at its level, where they go from its
 * anchor (metres), their size and any tint (the footprint table,
 * footprints.ts). A gate turned north to south has its model turned with its
 * footprint (Patch 5: the gates' models run east to west).
 */
export function catalogueIds(b: Pick<BuildingInfo, 'kind' | 'level' | 'variant'>): CatalogueModel[] {
  const d = footprintDims(b.kind, b.variant, b.level);
  const turned = buildingSpec(b.kind).turns === true && b.variant === 1;
  return (levelFootprint(b.kind, b.level).models ?? []).map((m) => ({
    id: m.id,
    dx: (d.ox + (turned ? m.z : m.x) / MODEL_UNITS_PER_COLUMN) * COLUMN_M,
    dz: (d.oz + (turned ? m.x : m.z) / MODEL_UNITS_PER_COLUMN) * COLUMN_M,
    scale: (m.scalePm ?? 1000) / 1000,
    ...(m.tint !== undefined ? { tint: m.tint } : {}),
    ...(turned ? { yaw: Math.PI / 2 } : {}),
  }));
}

/** Below these per mille of its health a wall or an earth rampart shows its cracked, then its broken model, and its whole one again once repaired (Patch 5, Jade's UI-9: the look in place of a health bar). */
export const CRACKED_PER_MILLE = 700;
export const BROKEN_PER_MILLE = 400;

/** The damage look of a wall or an earth rampart: '', '_cracked' or '_broken' on its model id; '' for every other building. */
export function damageLook(b: Pick<BuildingInfo, 'kind' | 'hp' | 'maxHp' | 'complete'>): string {
  if (!b.complete || buildingSpec(b.kind).defence !== 'wall' || b.maxHp <= 0) return '';
  const pm = (b.hp * 1000) / b.maxHp;
  return pm < BROKEN_PER_MILLE ? '_broken' : pm < CRACKED_PER_MILLE ? '_cracked' : '';
}

/**
 * How a wall column or rampart chunk stands among the defences beside it
 * (Patch 5): a straight piece along x, or turned along z when its only
 * neighbours are north or south of it; a wall column joined on two sides
 * that meet at a corner is its corner piece, turned to them (the corner
 * models join north and west). `joined` says whether a defence stands on a
 * column.
 */
export function wallShape(b: Pick<BuildingInfo, 'kind' | 'x' | 'z'>, joined: (x: number, z: number) => boolean): { corner: boolean; yaw: number } {
  const n = buildingSpec(b.kind).w;
  const e = joined(b.x + n, b.z);
  const w = joined(b.x - 1, b.z);
  const s = joined(b.x, b.z + n);
  const no = joined(b.x, b.z - 1);
  if (n === 1 && (e || w) && (no || s)) {
    if (no && w) return { corner: true, yaw: 0 };
    if (w && s) return { corner: true, yaw: Math.PI / 2 };
    if (s && e) return { corner: true, yaw: Math.PI };
    return { corner: true, yaw: -Math.PI / 2 };
  }
  return { corner: false, yaw: (no || s) && !(e || w) ? Math.PI / 2 : 0 };
}

/** The columns every finished or started defence stands on (walls, ramparts, gates, towers), keyed "x,z". */
function defenceColumns(info: GameInfo): Set<string> {
  const out = new Set<string>();
  for (const b of info.buildings.values()) {
    if (!buildingSpec(b.kind).defence) continue;
    const d = footprintDims(b.kind, b.variant, b.level);
    for (const [cx, cz] of d.cells) out.add(`${b.x + d.ox + cx},${b.z + d.oz + cz}`);
  }
  return out;
}

/** A wall's or rampart's models in its shape and damage look (Patch 5). */
function shapedIds(b: BuildingInfo, joins: Set<string>): CatalogueModel[] {
  const ids = catalogueIds(b);
  const shape = wallShape(b, (x, z) => joins.has(`${x},${z}`));
  const look = damageLook(b);
  return ids.map((m) => ({ ...m, id: `${shape.corner ? m.id.replace(/^wall_/, 'wall_corner_') : m.id}${look}`, yaw: shape.yaw }));
}

export class BuildingsView {
  private readonly entries = new Map<number, Entry>();
  private readonly lookCache = new Map<string, Look>();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly ghostMaterial: THREE.MeshBasicMaterial;
  private readonly plannedMaterial: THREE.MeshBasicMaterial;
  private readonly scaffoldMaterial: THREE.MeshLambertMaterial;
  private readonly flameGeo = new THREE.BoxGeometry(0.16, 0.26, 0.16).translate(0, 0.13, 0);
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
  private readonly lights: THREE.PointLight[] = [];
  /** What may take a point light this frame, the first spotCount of them. */
  private readonly spots: LightSpot[] = [];
  private spotCount = 0;
  /** Lit windows, chimney smoke and the Big House campfire. */
  private readonly glow: BuildingGlow;
  private readonly tiles: THREE.InstancedMesh;
  private readonly ghostMeshes: THREE.Mesh[] = [];
  private ghostSig = '';
  private readonly plannedMeshes: THREE.Mesh[] = [];
  /** The ghost's and the planned buildings' models, where each goes (anchor metres), drawn see-through ('g:' and 'p:' draws). */
  private ghostModels: GhostModel[] = [];
  private plannedModels: GhostModel[] = [];
  private readonly ghostDraws = new Map<string, InstancedModel>();
  /** The last planned call, made again when a model it waits for arrives. */
  private replan: (() => void) | null = null;
  private models: ModelLibrary | null = null;
  /** Catalogue ids a building on the map has asked for. */
  private readonly wanted = new Set<string>();
  private readonly modelDraws = new Map<string, InstancedModel>();
  private ruins: Ruin[] = [];
  private readonly teamColours: readonly THREE.Color[];
  /** The fog of war on the catalogue models, as on the blocks (remembered buildings darkened). */
  private readonly modelFog: ModelShaderPatch;
  /** 0 by day, 1 at night: how bright the flames' lights are. */
  darkness = 0;
  /** 0 to 1, how deep a fog night's fog is: the lights shrink to soft orange halos (the lighting sheet). */
  fog = 0;
  /** Building ids the cursor is over, for their silhouette outline (Patch 5, UI-5). */
  hovered: ReadonlySet<number> = new Set();

  constructor(
    private readonly scene: THREE.Scene,
    fow: FowUniforms,
    teamColours: readonly THREE.Color[],
  ) {
    this.teamColours = teamColours;
    this.modelFog = { key: 'fow', apply: fowPatch(fow, false) };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    patchMaterial(this.material, fow, true);
    this.ghostMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false });
    this.plannedMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });
    this.scaffoldMaterial = new THREE.MeshLambertMaterial({ color: 0xb08a58 });
    patchMaterial(this.scaffoldMaterial, fow, false);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 10, 1.4);
      scene.add(l);
      this.lights.push(l);
    }
    this.glow = new BuildingGlow(scene, fow);
    const tileGeo = new THREE.PlaneGeometry(COLUMN_M * 0.9, COLUMN_M * 0.9).rotateX(-Math.PI / 2);
    this.tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), MAX_TILES);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 5;
    scene.add(this.tiles);
  }

  setModels(lib: ModelLibrary): void {
    this.models = lib;
    // Rebuild every building so those with catalogue models switch over, now and as models arrive.
    const rebuild = (): void => {
      for (const e of this.entries.values()) e.sig = '';
      this.ghostSig = '';
      this.replan?.();
    };
    rebuild();
    lib.onLoad((m) => {
      if (this.wanted.has(m.id)) rebuild();
    });
  }

  private teamColour(owner: number): THREE.Color {
    return this.teamColours[owner] ?? new THREE.Color(0x8a8a80);
  }

  private look(kind: number, level: number, variant: number, owner: number, fallow: boolean): Look {
    const key = `${kind}:${level}:${variant}:${owner}:${fallow ? 1 : 0}`;
    let l = this.lookCache.get(key);
    if (!l) {
      l = makeLook(kind, level, variant, this.teamColour(owner).getHex(), fallow);
      this.lookCache.set(key, l);
    }
    return l;
  }

  /** The models to draw for a building in a look (lookState), or none for the block look; `own` are its catalogue models (a wall's in its shape and damage look). */
  private hasModels(b: BuildingInfo, look: string, own: CatalogueModel[]): CatalogueModel[] {
    const lib = this.models;
    if (!lib || own.length === 0) return [];
    // A wall's other shapes, damage looks and ruins load with it, so it swaps at once (Patch 5).
    if (buildingSpec(b.kind).defence === 'wall') {
      this.loaded(catalogueIds(b).flatMap((m) => [m.id, m.id.replace(/^wall_/, 'wall_corner_')]).flatMap((id) => [id, `${id}_cracked`, `${id}_broken`, `${id}@ruined`]));
    }
    // Each model in the look where it has one.
    const want = look ? own.map((m) => (lib.listed(`${m.id}@${look}`) ? { ...m, id: `${m.id}@${look}` } : m)) : own;
    // Being built, every model needs its stage; else the blocks rise under scaffolding.
    if (!b.complete && want.some((m, k) => m.id === own[k]!.id)) return [];
    if (this.loaded(want.map((m) => m.id))) return want;
    // Until its look arrives, a finished building keeps its own.
    return b.complete && this.loaded(own.map((m) => m.id)) ? own : [];
  }

  /** Whether these models are loaded; the ones not loaded yet load next, and the building switches over when they arrive. */
  private loaded(ids: readonly string[]): boolean {
    const lib = this.models!;
    let all = true;
    for (const id of ids) {
      if (lib.models.has(id)) continue;
      all = false;
      if (this.wanted.has(id) || !lib.listed(id)) continue;
      this.wanted.add(id);
      lib.request(id);
    }
    return all;
  }

  /** Brings the meshes in line with the latest info; call once a frame. */
  update(info: GameInfo, now: number, focus: THREE.Vector3): void {
    const seen = new Set<number>();
    this.glow.begin(now, this.darkness, focus);
    const joins = defenceColumns(info);
    for (const b of info.buildings.values()) {
      seen.add(b.id);
      // A field where nothing grows lies bare.
      const fallow = b.farm !== null && !b.farm.grows;
      const look = lookState(b);
      // A wall's or rampart's piece and damage look change with its neighbours and its health (Patch 5).
      const ids = buildingSpec(b.kind).defence === 'wall' ? shapedIds(b, joins) : null;
      const shape = ids ? `:${ids.map((m) => `${m.id}@${m.yaw ?? 0}`).join(',')}` : '';
      const sig = `${b.kind}:${b.level}:${b.variant}:${b.owner}:${fallow ? 1 : 0}:${b.complete ? 1 : 0}:${b.upgrading}:${look}${shape}`;
      let e = this.entries.get(b.id);
      if (!e || e.sig !== sig) {
        if (e) this.drop(e);
        e = this.make(b, sig, fallow, look, ids ?? catalogueIds(b));
        this.entries.set(b.id, e);
      }
      e.last = b;
      // The look is drawn from its level's corner (a footprint that grows grows round the anchor); the scaffold from the anchor.
      const d = footprintDims(b.kind, b.variant, b.level);
      const ox = (b.x + d.ox) * COLUMN_M;
      const oz = (b.z + d.oz) * COLUMN_M;
      const oy = b.y * UNIT_M;
      if (e.mesh) {
        e.mesh.position.set(ox, oy, oz);
        e.mesh.scale.y = b.complete ? 1 : Math.max(0.08, b.built / 1000);
      }
      if (e.scaffold) e.scaffold.position.set(b.x * COLUMN_M, oy, b.z * COLUMN_M);
      for (let k = 0; k < e.flames.length; k++) {
        const f = e.flames[k]!;
        const p = e.flameAt[k]!;
        f.visible = b.lit;
        f.position.set(b.x * COLUMN_M + p.x, oy + p.y, b.z * COLUMN_M + p.z);
        const flicker = 0.85 + 0.25 * Math.sin(now / 90 + b.id * 1.7) * Math.sin(now / 37 + b.id);
        f.scale.set(1, flicker, 1);
      }
      this.glow.add(b, b.owner === info.player, e.models, e.mesh ? e.look : null, b.x * COLUMN_M, b.z * COLUMN_M, ox, oz, oy);
      this.fillSelectable(e.selectable, b, info);
    }
    this.glow.end();
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.drop(e);
        this.entries.delete(id);
        // Only a fallen building leaves a finished one's place (cancelling takes back an unfinished one).
        if (e.last.complete) this.fall(e.last, info.step, e.models);
      }
    }
    this.drawModels(info, now);
    this.placeLights(info, focus, now);
  }

  private make(b: BuildingInfo, sig: string, fallow: boolean, state: string, ids: CatalogueModel[]): Entry {
    const look = this.look(b.kind, b.level, b.variant, b.owner, fallow);
    const models = this.hasModels(b, state, ids);
    // A damaged building's ruins load now, ready for its fall.
    if (state === 'damaged' && this.models) this.loaded(dressed(catalogueIds(b), 'ruined').map((m) => m.id));
    let mesh: THREE.Mesh | null = null;
    if (models.length === 0) {
      mesh = new THREE.Mesh(look.geometry, this.material);
      mesh.matrixAutoUpdate = true;
      this.scene.add(mesh);
    }
    let scaffold: THREE.Mesh | null = null;
    // A model's being-built stages carry their own scaffolding.
    if ((!b.complete && models.length === 0) || b.upgrading) {
      scaffold = new THREE.Mesh(this.scaffoldGeometry(b, Math.max(1.6, look.height + 0.3)), this.scaffoldMaterial);
      this.scene.add(scaffold);
    }
    const flameAt = this.flamesOf(b, models, look);
    const flames = flameAt.map(() => {
      const f = new THREE.Mesh(this.flameGeo, this.flameMat);
      this.scene.add(f);
      return f;
    });
    // The click box covers the footprint it takes, an upgrade's while one is under way.
    const s = placedDims(b);
    const selectable: Selectable = {
      key: `b:${b.id}`,
      kind: 'building',
      owner: b.owner === NEUTRAL ? NOBODY : b.owner,
      typeKey: `building:${b.kind}:${b.level}`,
      centre: new THREE.Vector3(),
      halfSize: new THREE.Vector3((s.w * COLUMN_M) / 2, Math.max(0.4, look.height / 2), (s.d * COLUMN_M) / 2),
      label: b.name,
      details: [],
    };
    return { sig, mesh, scaffold, flames, flameAt, look, selectable, models, last: b };
  }

  /** Where a light's flames burn, metres from its anchor: at its models' flame anchors when it is drawn as models that have them, else where its block look puts them. */
  private flamesOf(b: BuildingInfo, models: readonly CatalogueModel[], look: Look): THREE.Vector3[] {
    if (!buildingSpec(b.kind).light) return [];
    const out: THREE.Vector3[] = [];
    for (const m of models) {
      const data = this.models!.get(m.id);
      data.boneNames.forEach((name, k) => {
        if (FLAME_BONES.includes(name)) out.push(new THREE.Vector3().setFromMatrixPosition(data.restWorld[k]!).multiplyScalar(m.scale).applyAxisAngle(UP, m.yaw ?? 0).add(new THREE.Vector3(m.dx, 0, m.dz)));
      });
    }
    if (out.length > 0) return out;
    const d = footprintDims(b.kind, b.variant, b.level);
    return look.flames.map((p) => p.clone().add(new THREE.Vector3(d.ox * COLUMN_M, 0, d.oz * COLUMN_M)));
  }

  /** A finished building fell: its ruins stand a while where it stood, when each of its models has them. */
  private fall(b: BuildingInfo, step: number, drawn: readonly CatalogueModel[]): void {
    const lib = this.models;
    // A wall's ruins keep its shape and turn (a corner's are the corner's), whatever its damage look.
    const own = buildingSpec(b.kind).defence === 'wall' && drawn.length > 0 ? drawn.map((m) => ({ ...m, id: m.id.replace(/_(cracked|broken)$/, '') })) : catalogueIds(b);
    const models = dressed(own, 'ruined');
    if (!lib || models.length === 0 || !models.every((m) => lib.listed(m.id))) return;
    this.loaded(models.map((m) => m.id));
    this.ruins.push({ b, models, fell: step });
  }

  private readonly scaffoldCache = new Map<string, THREE.BufferGeometry>();
  /** Poles at the corners and every 1.8 m round the solid part it is taking (an upgrade's), with two rails; from the anchor. */
  private scaffoldGeometry(b: BuildingInfo, h: number): THREE.BufferGeometry {
    const s = placedDims(b);
    const key = `${b.kind}:${b.variant}:${Math.max(b.level, b.upgrading)}:${h.toFixed(1)}`;
    let g = this.scaffoldCache.get(key);
    if (g) return g;
    const [sx, sz, sw, sd] = s.solid;
    const x0 = (s.ox + sx) * COLUMN_M - 0.15;
    const z0 = (s.oz + sz) * COLUMN_M - 0.15;
    const x1 = (s.ox + sx + sw) * COLUMN_M + 0.05;
    const z1 = (s.oz + sz + sd) * COLUMN_M + 0.05;
    const parts: THREE.BufferGeometry[] = [];
    const pole = (x: number, z: number): void => {
      parts.push(new THREE.BoxGeometry(0.1, h, 0.1).translate(x + 0.05, h / 2, z + 0.05));
    };
    for (let x = x0; x <= x1 + 0.01; x += Math.max(0.9, (x1 - x0) / Math.ceil((x1 - x0) / 1.8))) {
      pole(x, z0);
      pole(x, z1);
    }
    for (let z = z0; z <= z1 + 0.01; z += Math.max(0.9, (z1 - z0) / Math.ceil((z1 - z0) / 1.8))) {
      pole(x0, z);
      pole(x1, z);
    }
    for (const y of [h * 0.45, h * 0.9]) {
      parts.push(new THREE.BoxGeometry(x1 - x0 + 0.1, 0.06, 0.06).translate((x0 + x1) / 2 + 0.05, y, z0 + 0.05));
      parts.push(new THREE.BoxGeometry(x1 - x0 + 0.1, 0.06, 0.06).translate((x0 + x1) / 2 + 0.05, y, z1 + 0.05));
      parts.push(new THREE.BoxGeometry(0.06, 0.06, z1 - z0 + 0.1).translate(x0 + 0.05, y, (z0 + z1) / 2 + 0.05));
      parts.push(new THREE.BoxGeometry(0.06, 0.06, z1 - z0 + 0.1).translate(x1 + 0.05, y, (z0 + z1) / 2 + 0.05));
    }
    g = mergeBoxes(parts);
    this.scaffoldCache.set(key, g);
    return g;
  }

  private drop(e: Entry): void {
    if (e.mesh) this.scene.remove(e.mesh);
    if (e.scaffold) this.scene.remove(e.scaffold);
    for (const f of e.flames) this.scene.remove(f);
  }

  private fillSelectable(t: Selectable, b: BuildingInfo, info: GameInfo): void {
    const s = buildingSpec(b.kind);
    const h = t.halfSize.y;
    const [x0, z0, x1, z1] = footprintRect(b);
    t.centre.set(((x0 + x1 + 1) / 2) * COLUMN_M, b.y * UNIT_M + h, ((z0 + z1 + 1) / 2) * COLUMN_M);
    t.label = b.complete ? b.name : `${buildingName(b.kind, 1, b.variant)} (unfinished)`;
    const d: string[] = [];
    d.push(`Health ${b.hp} / ${b.maxHp}`);
    if (b.status) d.push(b.status);
    const light = s.light;
    if (light && b.complete) {
      d.push(b.lit ? 'Lit. It needs no fuel.' : 'Out: right click it with a worker to relight it.');
      d.push(`Light ${light.lightM} m${light.claimM > 0 ? `, claims ${light.claimM} m while lit` : ''}.`);
    }
    if (b.up.length > 0) d.push(`${b.up.length} up top.`);
    if (b.inside.length > b.up.length) d.push(`${b.inside.length - b.up.length} inside.`);
    void info;
    t.details = d;
  }

  /**
   * Catalogue models: one instanced draw per model id and tint (a stand-in
   * model dressed as another building draws apart), then the ruins. A
   * finished building's turning bones (the Big House's spit roast) turn
   * without stopping.
   */
  private drawModels(info: GameInfo, now: number): void {
    const lib = this.models;
    if (!lib) return;
    const counts = new Map<string, number>();
    const draw = (m: CatalogueModel, b: BuildingInfo, sink: number, hover: boolean, turning: boolean): void => {
      const key = m.tint === undefined ? m.id : `${m.id}#${m.tint}`;
      let d = this.modelDraws.get(key);
      const most = buildingSpec(b.kind).defence === 'wall' ? WALL_MODEL_INSTANCES : MAX_MODEL_INSTANCES;
      if (!d) {
        d = new InstancedModel(lib.get(m.id), most, this.modelFog);
        if (m.tint !== undefined) d.tint(m.tint);
        d.object.frustumCulled = false;
        this.scene.add(d.object);
        this.modelDraws.set(key, d);
      }
      const n = counts.get(key) ?? 0;
      if (n >= most) return;
      counts.set(key, n + 1);
      d.setInstance(n, b.x * COLUMN_M + m.dx, b.y * UNIT_M - sink, b.z * COLUMN_M + m.dz, m.yaw ?? 0, turning ? TURN_CLIP : '', now / 1000, this.teamColour(b.owner), m.scale);
      if (hover) d.setHover(n);
    };
    for (const b of info.buildings.values()) {
      const e = this.entries.get(b.id);
      if (e) for (const m of e.models) draw(m, b, 0, this.hovered.has(b.id), b.complete);
    }
    // Ruins stand, then sink out of sight.
    this.ruins = this.ruins.filter((r) => info.step - r.fell < RUIN_STEPS && info.step >= r.fell);
    for (const r of this.ruins) {
      const t = Math.max(0, info.step - r.fell - (RUIN_STEPS - RUIN_SINK_STEPS)) / RUIN_SINK_STEPS;
      for (const m of r.models) {
        if (!lib.models.has(m.id)) continue;
        draw(m, r.b, t * lib.get(m.id).sidecar.boundsWithParts.max[1] * m.scale, false, false);
      }
    }
    for (const [id, d] of this.modelDraws) {
      d.setCount(counts.get(id) ?? 0);
      d.commit();
    }
  }

  /** The flames and lit windows nearest the focus get the point lights, brighter in the dark. */
  private placeLights(info: GameInfo, focus: THREE.Vector3, now: number): void {
    this.spotCount = 0;
    for (const b of info.buildings.values()) {
      const e = this.entries.get(b.id);
      const light = buildingSpec(b.kind).light;
      if (!e || !light || !b.lit) continue;
      const src = light.lightM > TORCH_REACH_M ? BONFIRE : TORCH;
      for (const f of e.flames) this.addSpot(f.position, 0.3, light.lightM * 1.4, 9 * this.darkness, focus, src);
    }
    for (let i = 0; i < this.glow.spotCount; i++) {
      const g = this.glow.spots[i]!;
      this.addSpot(g.p, 0, g.r, g.k, focus, LANTERN);
    }
    // The nearest first, picked out without sorting.
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i]!;
      let best: LightSpot | null = null;
      for (let j = 0; j < this.spotCount; j++) {
        const s = this.spots[j]!;
        if (!best || s.d < best.d) best = s;
      }
      if (!best || best.d === Infinity || this.darkness <= 0.02) {
        l.intensity = 0;
        continue;
      }
      best.d = Infinity;
      // The lighting sheet's torch post and campfire (a bonfire) for flames, its lantern for lit windows, each flickering by its own amount.
      const src = best.src;
      const flicker = 1 - src.flicker * (0.5 + 0.5 * Math.sin(now * 0.011 + i * 2.3) * Math.sin(now * 0.0047 + i));
      l.position.copy(best.p);
      l.distance = best.r * (1 - 0.5 * this.fog);
      l.intensity = best.k * flicker * (1 - 0.3 * this.fog);
      l.color.copy(src.colour).lerp(FOG_HALO, this.fog);
    }
  }

  private addSpot(p: THREE.Vector3, up: number, r: number, k: number, focus: THREE.Vector3, src: LightSource): void {
    let s = this.spots[this.spotCount];
    if (!s) {
      s = { p: new THREE.Vector3(), r: 0, k: 0, d: 0, src };
      this.spots.push(s);
    }
    this.spotCount++;
    s.p.copy(p).y += up;
    s.r = r;
    s.k = k;
    s.d = s.p.distanceToSquared(focus);
    s.src = src;
  }

  /** What the hover outline draws of the buildings the cursor is over: catalogue models (their hovered instances) and code-built blocks. */
  hoverParts(): { models: InstancedModel[]; meshes: THREE.Mesh[] } {
    const models = [...this.modelDraws.values()].filter((d) => d.hoveredCount > 0);
    const meshes: THREE.Mesh[] = [];
    for (const id of this.hovered) {
      const m = this.entries.get(id)?.mesh;
      if (m) meshes.push(m);
    }
    return { models, meshes };
  }

  /** Every building's selectable, for the selection code. */
  *selectables(): Iterable<Selectable> {
    for (const e of this.entries.values()) yield e.selectable;
  }

  // ---- Ghosts ----

  /** The placement ghost: the look at each spot and a tile per footprint column, green or red. */
  setGhost(g: Ghost | null, owner: number, heightAt: (x: number, z: number) => number): void {
    // Rebuilt only when the ghost changes: where it is, the sim's answers, whether it can be paid for.
    const sig = g ? `${g.kind}:${g.variant}:${g.affordable}:${g.spots.map((s) => `${s.x},${s.z},${s.short ? 1 : 0},${s.tiles ? s.tiles.reduce((a, t, i) => a + t * (i + 1), 1) : 0}`).join(';')}` : '';
    if (sig === this.ghostSig) return;
    this.ghostSig = sig;
    for (const m of this.ghostMeshes) this.scene.remove(m);
    this.ghostMeshes.length = 0;
    this.ghostModels = [];
    let n = 0;
    if (g) {
      const s = footprintDims(g.kind, g.variant);
      const look = this.look(g.kind, 1, g.variant, owner, false);
      const colour = new THREE.Color();
      const m4 = new THREE.Matrix4();
      // A wall chain's columns join one another, its corners turned as built.
      const chain = new Set(g.spots.map((p) => `${p.x},${p.z}`));
      for (const spot of g.spots) {
        // The floor is the middle column's height, as in the sim.
        const midX = (spot.x + (s.w >> 1) + 0.5) * COLUMN_M;
        const midZ = (spot.z + (s.d >> 1) + 0.5) * COLUMN_M;
        const floor = heightAt(midX, midZ);
        const models = this.ghostLook(g.kind, g.variant, spot.x, spot.z, '', chain);
        if (models) {
          for (const m of models) this.ghostModels.push({ m, x: spot.x * COLUMN_M, y: floor, z: spot.z * COLUMN_M, wall: buildingSpec(g.kind).defence === 'wall' });
        } else {
          const mesh = new THREE.Mesh(look.geometry, this.ghostMaterial);
          mesh.position.set(spot.x * COLUMN_M, floor, spot.z * COLUMN_M);
          mesh.renderOrder = 6;
          this.scene.add(mesh);
          this.ghostMeshes.push(mesh);
        }
        for (let dz = 0; dz < s.d; dz++) {
          for (let dx = 0; dx < s.w; dx++) {
            if (n >= MAX_TILES) break;
            const t = spot.tiles ? spot.tiles[dz * s.w + dx]! : 0;
            const cx = (spot.x + dx + 0.5) * COLUMN_M;
            const cz = (spot.z + dz + 0.5) * COLUMN_M;
            m4.makeTranslation(cx, heightAt(cx, cz) + 0.04, cz);
            this.tiles.setMatrixAt(n, m4);
            colour.copy(spot.tiles ? (t === 0 ? GREEN : RED) : GREEN);
            if (!g.affordable || spot.short) colour.lerp(new THREE.Color(0x808080), 0.4);
            this.tiles.setColorAt(n, colour);
            n++;
          }
        }
      }
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.drawGhosts('g', this.ghostModels, GHOST_OPACITY, owner);
  }

  /** Planned but not started buildings in the local player's units' order lists: faint ghosts. */
  setPlanned(queues: ReadonlyMap<number, UnitOrder[]>, owner: number, heightAt: (x: number, z: number) => number): void {
    this.replan = () => this.setPlanned(queues, owner, heightAt);
    for (const m of this.plannedMeshes) this.scene.remove(m);
    this.plannedMeshes.length = 0;
    this.plannedModels = [];
    const builds: Array<{ kind: number; variant: number; x: number; z: number }> = [];
    const seen = new Set<string>();
    for (const q of queues.values()) {
      for (const o of q) {
        if (o.t !== 'build') continue;
        const key = `${o.kind}:${o.x}:${o.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        builds.push(o);
      }
    }
    // Planned walls join the planned walls beside them.
    const planned = new Set(builds.map((o) => `${o.x},${o.z}`));
    for (const o of builds) {
      const s = footprintDims(o.kind, o.variant);
      const y = heightAt((o.x + (s.w >> 1) + 0.5) * COLUMN_M, (o.z + (s.d >> 1) + 0.5) * COLUMN_M);
      // Its first stage where its models have stages, else the finished building.
      const models = this.ghostLook(o.kind, o.variant, o.x, o.z, STAGES[0], planned);
      if (models) {
        for (const m of models) this.plannedModels.push({ m, x: o.x * COLUMN_M, y, z: o.z * COLUMN_M, wall: buildingSpec(o.kind).defence === 'wall' });
        continue;
      }
      const mesh = new THREE.Mesh(this.look(o.kind, 1, o.variant, owner, false).geometry, this.plannedMaterial);
      mesh.position.set(o.x * COLUMN_M, y, o.z * COLUMN_M);
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.plannedMeshes.push(mesh);
    }
    this.drawGhosts('p', this.plannedModels, PLANNED_OPACITY, owner);
  }

  /**
   * A ghost's models at level 1, in a look where they have it, or null while
   * they load (or for a building with none): a wall column shaped and turned
   * by the columns of `joins` beside it, as a built one is by its neighbours.
   */
  private ghostLook(kind: number, variant: number, x: number, z: number, look: string, joins: ReadonlySet<string>): CatalogueModel[] | null {
    const lib = this.models;
    if (!lib) return null;
    const b = { kind, level: 1, variant, x, z };
    let ms = catalogueIds(b);
    if (ms.length === 0) return null;
    if (buildingSpec(kind).defence === 'wall') {
      const shape = wallShape(b, (cx, cz) => joins.has(`${cx},${cz}`));
      ms = ms.map((m) => ({ ...m, id: shape.corner ? m.id.replace(/^wall_/, 'wall_corner_') : m.id, yaw: shape.yaw }));
    }
    if (look) ms = ms.map((m) => (lib.listed(`${m.id}@${look}`) ? { ...m, id: `${m.id}@${look}` } : m));
    return this.loaded(ms.map((m) => m.id)) ? ms : null;
  }

  /** Draws see-through models ('g': the placement ghost, 'p': planned buildings), one instanced draw per model id. */
  private drawGhosts(prefix: string, list: readonly GhostModel[], opacity: number, owner: number): void {
    const lib = this.models;
    const counts = new Map<string, number>();
    if (lib) {
      for (const g of list) {
        const key = `${prefix}:${g.m.id}`;
        let d = this.ghostDraws.get(key);
        if (!d) {
          d = new InstancedModel(lib.get(g.m.id), g.wall ? WALL_MODEL_INSTANCES : MAX_MODEL_INSTANCES, this.modelFog);
          d.seeThrough(opacity);
          d.object.frustumCulled = false;
          this.scene.add(d.object);
          this.ghostDraws.set(key, d);
        }
        const n = counts.get(key) ?? 0;
        if (n >= d.maxInstances) continue;
        counts.set(key, n + 1);
        d.setInstance(n, g.x + g.m.dx, g.y, g.z + g.m.dz, g.m.yaw ?? 0, '', 0, this.teamColour(owner), g.m.scale);
      }
    }
    for (const [key, d] of this.ghostDraws) {
      if (!key.startsWith(`${prefix}:`)) continue;
      d.setCount(counts.get(key) ?? 0);
      d.commit();
    }
  }
}

function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.index ? p.index.count : p.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
