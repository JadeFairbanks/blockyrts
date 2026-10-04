// The generated world on screen: chunks meshed by the mesh workers at full
// detail near the camera and less detail farther out, water, props and
// scenery as instanced cubes, fog of war (black unexplored, grey explored and
// unseen), the units, and the hooks the controls shell needs: ground
// picking, selectable things, the minimap and the camera limits.
import * as THREE from 'three';
import {
  clockAt,
  COLUMNS_PER_CHUNK,
  gearSpec,
  Line,
  linePiece,
  Troop,
  TROOP_NAMES,
  MONSTERS,
  mobSpec,
  RANK_NAMES as UNIT_RANK_NAMES,
  NEUTRAL,
  NO_CARRY,
  Period,
  RESOURCES,
  unitOrderText,
  propInfo,
  floorDiv,
  UnitKind,
  VISION_STRIDE,
  WORLD_EDGE_WU,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type ChunkDelta,
  isGame,
  itemsText,
  speciesSpec,
  WILD,
  mageTitle,
  School,
  FactionKind,
  LEADER_NAMES,
  Mob,
  PEOPLES,
  peopleUnitSpec,
  TRADE_BUILDINGS,
  engineSpec,
  mountSpec,
  Mount,
  Skill,
} from '@blockyrts/sim';
import type { WorldHooks } from '../hud/shell.ts';
import type { GameInfo } from '../game/game-info.ts';
import type { DeltasMessage, FogMessage, StateMessage, VisionMessage } from '../messages.ts';
import { S, SpellOn, STATE_STRIDE, UnitFlag } from '../messages.ts';
import type { ModelLibrary } from '../models/index.ts';
import { NOBODY, type GroundPicker, type MinimapSource, type Selectable, type SelectableSource } from '../selection/types.ts';
import type { FromMesh, MeshResult, PropSummary, ToMesh } from './mesh-messages.ts';
import { CHUNK_M, COLUMN_M, UNIT_M, type MeshArrays } from './mesher.ts';
import { CUBE_STRIDE } from './props-gen.ts';
import { propDetails, propLabel } from './plant-text.ts';
import { BuildingsView } from './buildings-view.ts';
import { UnitsView } from './units-view.ts';
import { PortraitView } from './portrait-view.ts';
import { LootView } from './loot-view.ts';
import { Overlay } from './overlay.ts';
import { patchMaterial, type FowUniforms } from './fog-material.ts';

/** Chunk rings around the camera focus at each level of detail (Chebyshev distance in chunks). */
const FULL_DETAIL_RING = 2;
const HALF_DETAIL_RING = 4;
const QUARTER_DETAIL_RING = 7;
/** Fog of war texture: 1.8 m tiles (4 columns), 256 a side (460 m), centred on the focus chunk. */
const FOW_TILE_M = 4 * COLUMN_M;
const FOW_TILES = 256;
const FOG_COLOUR = 0x8a9098;
/** Where the fog of a fog night starts and where it hides everything, metres from the camera; and the same far off when there is none. */
const FOG_NEAR_M = 28;
const FOG_FAR_M = 95;
const FOG_OFF_M = 100000;
const FOG_TILES_PER_CHUNK = 16;
/** Seconds between redraws of full-detail chunks so growing trees and regrowing bushes show. */
const GROWTH_REFRESH_S = 20;
const WORLD_EDGE_M = WORLD_EDGE_WU / WU_PER_METRE;

/** Player colours (decision 8's placeholder blue is player 1). */
export const PLAYER_COLOURS = [0x3460b2, 0xc03a2a, 0x2a9a4a, 0xd0a020, 0x8a3ac0, 0x2ab0b0, 0xe07020, 0xe0e0e0].map((c) => new THREE.Color(c));
const NEUTRAL_COLOUR = new THREE.Color(0x8a8a80);
/** The minimap colour of each people (Halflings, Runkin, Elves, Dwarves). */
const PEOPLE_MARKS = ['#8ac850', '#b08050', '#50c0a8', '#a8a8b8'];

const UNIT_NAMES = ['Worker', 'Warrior', 'Wanderer', 'Monster', 'Animal', 'Mage', 'Engine'];
const RANK_NAMES = ['', 'Labourer', 'Hand', 'Master worker', 'Rank 4', 'Rank 5'];
const UNIT_TYPE_KEYS = ['worker', 'warrior', 'wanderer', 'mob', 'animal', 'mage:support', 'engine'];
/** Skills a warrior's details list (Skill bits). */
const SKILL_TEXT: ReadonlyArray<readonly [number, string]> = [
  [Skill.Cannon, 'cannon crew'],
];

/** A gear id's name, or '' for an empty slot. */
const gearName = (id: number): string => (id ? gearSpec(id).name : '');

/** "Upgrading the weapon to Bronze spear: 40%." for a unit with an upgrade under way, or ''. */
function upgradeText(d: Int32Array, o: number, kind: 'worker' | 'warrior' | 'mage'): string {
  const line = d[o + S.upLine]! - 1;
  if (line < 0) return '';
  const h = { kind, troop: d[o + S.troop]!, w: d[o + S.wTier]!, a: d[o + S.aTier]! };
  const piece = linePiece(h, line, d[o + S.upTo]!);
  const what = kind === 'worker' ? 'tools' : kind === 'mage' ? (line === Line.Weapon ? 'wand' : 'robe') : line === Line.Weapon ? 'weapon' : 'armour';
  const done = d[o + S.upDone]!;
  return `Upgrading the ${what}${piece ? ` to ${piece.name}` : ''}${done > 0 ? `: ${Math.floor(done / 10)}%` : ' (on the way)'}.`;
}

/** "Quickened, fortified." for the spells on a unit, or ''. */
export function spellsOnText(bits: number): string {
  const out: string[] = [];
  if (bits & SpellOn.Quicken) out.push('quickened');
  if (bits & SpellOn.Fortify) out.push('fortified');
  if (bits & SpellOn.Rally) out.push('rallied');
  if (bits & SpellOn.Warding) out.push('warded');
  if (bits & SpellOn.Healing) out.push('being healed');
  if (bits & SpellOn.Hexed) out.push('hexed');
  return out.length ? `${capital(out.join(', '))}.` : '';
}

const ck = (cx: number, cz: number): string => `${cx},${cz}`;
const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);


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
  /** Each player's colour from the lobby (by sim player); the default order otherwise. */
  colours?: readonly string[] | undefined;
}

export class WorldView {
  readonly hooks: WorldHooks;
  readonly scene: THREE.Scene;
  private readonly seed: number;
  private readonly players: number;
  private readonly player: number;
  private readonly colours: THREE.Color[];
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
  /** The fog texture's explored layer (0 or 128) for the current window, kept until the land explored or the window changes. */
  private readonly exploredLayer = new Uint8Array(FOW_TILES * FOW_TILES);
  private exploredLayerDirty = true;
  /** What the players' side sees now (VisionMessage sources), and whether it changed since the fog was last drawn. */
  private vision: Int32Array = new Int32Array(0);
  private visionFresh = false;
  /** Explored fog bits, the whole side's, per chunk. */
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
  private readonly unitsView: UnitsView;
  /** The selection's portrait, drawn by match.ts into the HUD's portrait window after the world. */
  readonly portrait: PortraitView;
  private readonly lootView: LootView;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private viewRing = QUARTER_DETAIL_RING;
  private shadows = false;
  private lastShadowSweep = 0;
  readonly buildings: BuildingsView;
  readonly overlay: Overlay;
  private game: GameInfo | null = null;
  /** Unit keys inside buildings this step (not drawn, not selectable). */
  private readonly insideKeys = new Set<string>();

  constructor(opts: WorldViewOptions) {
    this.scene = opts.scene;
    this.seed = opts.seed;
    this.players = opts.players;
    this.player = opts.player;
    this.colours = PLAYER_COLOURS.map((c, p) => (opts.colours?.[p] ? new THREE.Color(opts.colours[p]) : c));

    const scene = this.scene;
    scene.background = new THREE.Color(0x07080a);
    // Fog nights (Table 8): a grey fog that closes in round the view; out of sight while there is none.
    scene.fog = new THREE.Fog(FOG_COLOUR, FOG_OFF_M, FOG_OFF_M * 2);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.15);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
    sun.position.set(40, 80, 25);
    // Shadows (Settings: graphics), when on: a 90 m square round the camera's focus.
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 260;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.sun = sun;

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

    this.unitsView = new UnitsView(scene);
    this.buildings = new BuildingsView(scene, this.fow, this.colours);
    this.portrait = new PortraitView(this.colours, NEUTRAL_COLOUR);
    this.overlay = new Overlay(scene);
    this.lootView = new LootView(scene);

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

  /** The model library (opened by main.ts before the match starts); models swap in as they load. */
  setModels(lib: ModelLibrary): void {
    this.models = lib;
    this.unitsView.setModels(lib);
    this.buildings.setModels(lib);
    this.portrait.setModels(lib);
  }

  // ---- From the sim worker ----

  onState(msg: StateMessage): void {
    this.prev = this.curr;
    this.curr = msg;
    this.currAt = performance.now();
    this.simStep = msg.step;
    const d = msg.data;
    this.units.length = msg.count;
    this.insideKeys.clear();
    for (let i = 0; i < msg.count; i++) {
      const o = i * STATE_STRIDE;
      const id = d[o + S.id]!;
      const owner = d[o + S.owner]!;
      const kind = d[o + S.kind]!;
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
          details: [],
        };
        this.units[i] = u;
      }
      // A cannon in a Citadel's port stays on the roof, and the men up on a top stand there, where they can be picked.
      if (d[o + S.inside] !== 0 && kind !== UnitKind.Engine && !(d[o + S.flags]! & UnitFlag.OnTop)) this.insideKeys.add(key);
      const health = `Health ${d[o + S.hp]} / ${d[o + S.maxHp]}`;
      if (kind === UnitKind.Worker) {
        const rank = d[o + S.rank]!;
        u.label = `Worker (${RANK_NAMES[rank] ?? `rank ${rank}`})`;
        const tools = [d[o + S.toolChop]!, d[o + S.toolBreak]!, d[o + S.toolBuild]!, d[o + S.toolCut]!].filter((t, k, all) => t !== 0 && all.indexOf(t) === k);
        const details = [health, tools.length ? `${capital(tools.map((t) => gearName(t).toLowerCase()).join(', '))} (tool tier ${d[o + S.wTier]}).` : 'No tools.'];
        const carry = d[o + S.carryRes]!;
        if (carry !== NO_CARRY && d[o + S.carryAmt]! > 0) details.push(`Carrying ${d[o + S.carryAmt]} ${RESOURCES[carry]?.name.toLowerCase() ?? ''}.`);
        this.lootLine(details, id);
        const up = upgradeText(d, o, 'worker');
        if (up) details.push(up);
        if (owner === this.player) {
          const q = this.game?.queues.get(id) ?? [];
          details.push(q.length > 1 ? `${unitOrderText(q[0])}, then ${q.length - 1} more.` : `${unitOrderText(q[0])}.`);
        }
        u.details = details;
      } else if (kind === UnitKind.Warrior) {
        const rank = d[o + S.rank]!;
        const troop = d[o + S.troop]!;
        u.label = `${TROOP_NAMES[troop] ?? 'Warrior'} (${UNIT_RANK_NAMES.warrior[rank] ?? `rank ${rank}`})`;
        // Rangers fight close with their fists, which go unsaid; the brawler's pistol comes first.
        const weapon = troop === Troop.Ranger ? '' : gearName(d[o + S.weapon]!);
        const gear = [gearName(d[o + S.ranged]!), weapon, gearName(d[o + S.shield]!), gearName(d[o + S.armour]!) || 'no armour'].filter((x) => x);
        const details = [health, `${capital(gear.map((x) => x.toLowerCase()).join(', '))}.`, `Weapon tier ${d[o + S.wTier]}, armour tier ${d[o + S.aTier]}.`];
        this.lootLine(details, id);
        const up = upgradeText(d, o, 'warrior');
        if (up) details.push(up);
        const skills = SKILL_TEXT.filter(([bit]) => (d[o + S.skills]! & bit) !== 0).map(([, t]) => t);
        if (skills.length > 0) details.push(`Trained in ${skills.join(', ')}.`);
        const mount = d[o + S.mount]!;
        if (mount !== Mount.None) details.push(`Riding a ${mountSpec(mount).name.toLowerCase()} (health ${d[o + S.mountHp]} / ${d[o + S.mountMax]}).`);
        u.halfSize.set(mount !== Mount.None ? 0.6 : 0.3, mount !== Mount.None ? 1.3 : 0.85, mount !== Mount.None ? 0.6 : 0.3);
        if (owner === this.player) {
          const q = this.game?.queues.get(id) ?? [];
          details.push(q.length > 1 ? `${unitOrderText(q[0])}, then ${q.length - 1} more.` : `${unitOrderText(q[0])}.`);
        }
        u.details = details;
      } else if (kind === UnitKind.Mage) {
        const rank = d[o + S.rank]!;
        const school = d[o + S.school]!;
        u.label = mageTitle(school, rank);
        u.typeKey = school === School.Battle ? 'mage:battle' : 'mage:support';
        const worn = [gearName(d[o + S.weapon]!), gearName(d[o + S.armour]!)].filter((x) => x);
        const details = [health, `Mana ${d[o + S.mana]} / ${d[o + S.maxMana]}`, worn.length ? `${worn.join(', ')}.` : 'No wand.'];
        this.lootLine(details, id);
        const up = upgradeText(d, o, 'mage');
        if (up) details.push(up);
        const on = spellsOnText(d[o + S.spells]!);
        if (on) details.push(on);
        if (owner === this.player) {
          const q = this.game?.queues.get(id) ?? [];
          details.push(q.length > 1 ? `${unitOrderText(q[0])}, then ${q.length - 1} more.` : `${unitOrderText(q[0])}.`);
        }
        u.details = details;
      } else if (kind === UnitKind.Mob) {
        const spec = mobSpec(d[o + S.mob]!);
        u.label = spec.name;
        u.typeKey = `mob:${spec.id}`;
        u.owner = MONSTERS;
        u.halfSize.set(spec.halfWidth / WU_PER_METRE, spec.height / WU_PER_METRE / 2, spec.halfWidth / WU_PER_METRE);
        u.details = [health];
      } else if (kind === UnitKind.Engine) {
        const spec = engineSpec(d[o + S.mob]!);
        u.label = spec.name;
        u.typeKey = `engine:${spec.id}`;
        u.halfSize.set(spec.halfWidth / WU_PER_METRE, spec.height / WU_PER_METRE / 2, spec.halfWidth / WU_PER_METRE);
        const crew = d[o + S.crew]! % 1000;
        const hauled = d[o + S.crew]! >= 1000;
        const details = [health, `Crew ${crew} of ${spec.crew}${spec.crewSkill ? ' (trained cannon crew)' : ''}.`, hauled ? 'Hauled by its animal.' : crew >= spec.crew && spec.pushed > 0 ? 'Pushed by its crew.' : spec.pushed > 0 ? 'Needs a horse or an ox, or its crew, to move.' : 'Fixed in place.'];
        if (d[o + S.inside] !== 0) details.push('In a cannon port.');
        if (owner === this.player) {
          const q = this.game?.queues.get(id) ?? [];
          details.push(`${unitOrderText(q[0])}.`);
        }
        u.details = details;
      } else if (kind === UnitKind.Animal) {
        const spec = speciesSpec(d[o + S.mob]!);
        const flags = d[o + S.flags]!;
        const young = (flags & UnitFlag.Young) !== 0;
        const wild = owner === WILD;
        const name = spec.name.toLowerCase();
        u.label = `${young ? 'Young ' : ''}${wild ? (young ? 'wild ' : 'Wild ') : ''}${young || wild ? name : spec.name}`;
        u.typeKey = `animal:${wild ? 'wild' : 'own'}:${spec.id}`;
        u.owner = wild ? NOBODY : owner;
        const scale = young ? 0.5 : 1;
        u.halfSize.set((spec.halfWidth * scale) / WU_PER_METRE, (spec.height * scale) / WU_PER_METRE / 2, (spec.halfWidth * scale) / WU_PER_METRE);
        const details = [health];
        if (!wild && d[o + S.partner]) details.push('Working with a worker.');
        if (wild && spec.tameAt.length > 0) details.push('Can be tamed by a worker (Tame).');
        else if (wild && isGame(spec.id)) details.push('Game: right-click it with warriors to hunt it, or send them out with Hunt (N).');
        u.details = details;
      }
      const group = d[o + S.group]!;
      if (group !== 0 && kind !== UnitKind.Animal && (owner === PEOPLES || (owner === NEUTRAL && kind === UnitKind.Mob) || (owner < 8 && kind !== UnitKind.Mob))) this.peoplesLabel(u, d, o, owner, kind, group, health);
    }
    this.unitsView.onHits(msg.hits, (x, z) => this.seenNow(x, z), performance.now());
  }

  /** The loot one of the local player's units carries, for its panel. */
  private lootLine(details: string[], id: number): void {
    const bag = this.game?.info?.bags.find(([u]) => u === id)?.[1];
    if (bag && bag.length > 0) details.push(`Loot: ${itemsText(bag)}.`);
  }

  /** One of the neutral peoples' units or buildings, one they left standing, or a hired mercenary: its name, faction and what to do with it. */
  private peoplesLabel(u: Selectable, d: Int32Array, o: number, owner: number, kind: number, group: number, health: string): void {
    const f = this.game?.faction(group) ?? null;
    const title = f ? f.title : 'One of the neutral peoples';
    const mob = d[o + S.mob]!;
    if (kind === UnitKind.Mob) {
      const spec = mobSpec(mob);
      if (owner === NEUTRAL) {
        u.label = `Abandoned ${spec.name.toLowerCase()}`;
        u.typeKey = `ruin:${mob}`;
        u.owner = NOBODY;
        u.details = [health, 'Its people left it. Workers can break it down for its materials: select workers, press A, then click it.'];
        return;
      }
      u.label = spec.name;
      u.typeKey = `peoples:${mob}`;
      u.owner = PEOPLES;
      const trade = TRADE_BUILDINGS.includes(mob) || mob === Mob.ElfCaravanWagon;
      u.details = [title, health, f?.war ? 'At war with you.' : trade ? 'Right click it with one of your units to trade.' : ''].filter(Boolean);
      return;
    }
    const spec = peopleUnitSpec(mob);
    if (owner !== PEOPLES) {
      // A mercenary the local player (or an ally) hired: theirs until dusk.
      if (owner === NEUTRAL || owner >= 8) return;
      u.label = `Mercenary ${spec.name.toLowerCase()}`;
      u.typeKey = `merc:${mob}`;
      u.details = [health, owner === this.player ? 'Hired until dusk, when it walks back to its camp.' : 'Hired by an ally until dusk.'];
      return;
    }
    const id = d[o + S.id]!;
    const leader = f !== null && f.leader === id;
    u.label = leader ? `${LEADER_NAMES[f.kind] ?? 'Elder'} (${spec.name})` : spec.name;
    u.typeKey = `people:${mob}`;
    u.owner = PEOPLES;
    u.halfSize.set(0.3, spec.heightCm / 200, 0.3);
    const what = f?.war ? 'At war with you.' : f?.kind === FactionKind.MercCamp ? 'Right click with one of your units to hire mercenaries.' : leader || f?.kind === FactionKind.ElfCaravan ? 'Right click with one of your units to trade.' : '';
    const details = [title, health];
    if (kind === UnitKind.Mage) details.push(`Mana ${d[o + S.mana]} / ${d[o + S.maxMana]}`);
    if (what) details.push(what);
    u.details = details;
  }

  /** The screen's copy of the game (buildings, order lists) for the buildings and the unit panels. */
  setGame(game: GameInfo): void {
    this.game = game;
    // Lairs and villages found, a village going to war or a lair cleared repaint the minimap.
    game.onInfoUpdate((info) => {
      this.lootView.sync(info.loot);
      const sig = `${info.marks.map((m) => `${m.mob},${m.x},${m.z},${m.war ? 1 : 0}`).join(';')}|${info.peoples.map((f) => `${f.id},${f.x >> 12},${f.z >> 12},${f.war ? 1 : 0},${f.status}`).join(';')}`;
      if (sig !== this.marksSig) {
        this.marksSig = sig;
        this.minimapVersion++;
      }
    });
  }

  private marksSig = '';

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
    this.exploredLayerDirty = true;
    this.minimapVersion++;
  }

  /** What the players' side sees now: drawn into the fog on the next frame or two. */
  onVision(msg: VisionMessage): void {
    this.vision = msg.sources;
    this.visionFresh = true;
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

  /** Graphics settings: how many chunk rings are drawn round the camera, and sun shadows. */
  setGraphics(g: { viewRing: number; shadows: boolean }): void {
    if (g.viewRing !== this.viewRing) {
      this.viewRing = g.viewRing;
      if (Number.isFinite(this.focusChunk.cx)) this.chooseChunks(this.focusChunk.cx, this.focusChunk.cz);
    }
    if (g.shadows !== this.shadows) {
      this.shadows = g.shadows;
      this.sun.castShadow = g.shadows;
      this.markShadows();
    }
  }

  /** Every mesh casts and takes shadows while they are on (new ones join on the next sweep). */
  private markShadows(): void {
    const on = this.shadows;
    this.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = o as THREE.Mesh;
      const see = (Array.isArray(m.material) ? m.material[0] : m.material)?.transparent !== true;
      m.castShadow = on && see;
      m.receiveShadow = on;
    });
  }

  update(now: number, focus: THREE.Vector3): void {
    if (this.shadows) {
      this.sun.target.position.set(focus.x, focus.y, focus.z);
      this.sun.position.set(focus.x + 40, focus.y + 80, focus.z + 25);
      if (now - this.lastShadowSweep > 1000) {
        this.lastShadowSweep = now;
        this.markShadows();
      }
    }
    this.updateUnits(now);
    this.lootView.update(now);
    this.updateSky();
    if (this.game) this.buildings.update(this.game, now, focus);
    const fcx = Math.floor(focus.x / CHUNK_M);
    const fcz = Math.floor(focus.z / CHUNK_M);
    if (fcx !== this.focusChunk.cx || fcz !== this.focusChunk.cz) {
      this.focusChunk = { cx: fcx, cz: fcz };
      this.chooseChunks(fcx, fcz);
      this.fowDirty = true;
      this.exploredLayerDirty = true;
    }
    if (now - this.lastGrowth > GROWTH_REFRESH_S * 1000) {
      this.lastGrowth = now;
      for (const c of this.chunks.values()) if (c.lod === 1) c.version++;
    }
    this.pump();
    // Sight moves with the units: redrawn at most ten times a second as the sim reports it.
    if (this.fowDirty || (this.visionFresh && now - this.fowLastSeen > 100)) {
      this.fowLastSeen = now;
      this.rebuildFog();
    }
  }

  /** Which chunks to draw at which detail around the focus; explored land and its edge only, unless showing all. */
  private chooseChunks(fcx: number, fcz: number): void {
    const want = new Map<string, number>();
    const r = this.viewRing;
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
    return {
      key: `p:${c.cx},${c.cz}:${p.index}`,
      kind: 'node',
      owner: NOBODY,
      typeKey: `node:${info.name.toLowerCase()}`,
      centre: new THREE.Vector3(x, p.y, z),
      halfSize: new THREE.Vector3(p.hx, p.hy, p.hz),
      label: propLabel(p.kind, p.stage, p.amount),
      details: propDetails(p.kind, p.stage, p.amount, p.most, p.nextAt < 0 ? -1 : p.nextAt - this.simStep),
      // A sapling holds nothing yet, so there is nothing to gather.
      resource: info.resource && p.amount > 0 ? info.resource : '',
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
    this.visionFresh = false;
    const f = this.focusChunk;
    if (Number.isNaN(f.cx)) return;
    const half = FOW_TILES / FOG_TILES_PER_CHUNK / 2;
    const ox = (f.cx - half) * FOG_TILES_PER_CHUNK;
    const oz = (f.cz - half) * FOG_TILES_PER_CHUNK;
    if (this.exploredLayerDirty) {
      this.exploredLayerDirty = false;
      const layer = this.exploredLayer;
      layer.fill(0);
      const chunksAcross = FOW_TILES / FOG_TILES_PER_CHUNK;
      for (let j = 0; j < chunksAcross; j++) {
        for (let i = 0; i < chunksAcross; i++) {
          const bits = this.explored.get(ck(f.cx - half + i, f.cz - half + j));
          if (!bits) continue;
          for (let t = 0; t < 256; t++) {
            if ((bits[t >> 3]! & (1 << (t & 7))) === 0) continue;
            const tx = i * FOG_TILES_PER_CHUNK + (t & 15);
            const tz = j * FOG_TILES_PER_CHUNK + (t >> 4);
            layer[tz * FOW_TILES + tx] = 128;
          }
        }
      }
    }
    const data = this.fowData;
    data.set(this.exploredLayer);
    // Seen now: within the sight of any player's units or buildings (the players share their vision).
    // The same integer test as the sim's World.revealRect, so seen land is the land the sim explores.
    const v = this.vision;
    const tileWu = WU_PER_COLUMN * 4;
    const halfTile = tileWu >> 1;
    for (let o = 0; o < v.length; o += VISION_STRIDE) {
      const x0 = v[o + 1]!;
      const z0 = v[o + 2]!;
      const x1 = v[o + 3]!;
      const z1 = v[o + 4]!;
      const r = v[o + 5]!;
      const r2 = r * r;
      const tx0 = Math.max(ox, floorDiv(x0 - r, tileWu));
      const tx1 = Math.min(ox + FOW_TILES - 1, floorDiv(x1 + r, tileWu));
      const tz0 = Math.max(oz, floorDiv(z0 - r, tileWu));
      const tz1 = Math.min(oz + FOW_TILES - 1, floorDiv(z1 + r, tileWu));
      for (let tz = tz0; tz <= tz1; tz++) {
        const ccz = tz * tileWu + halfTile;
        const dz = ccz < z0 ? z0 - ccz : ccz > z1 ? ccz - z1 : 0;
        const row = (tz - oz) * FOW_TILES - ox;
        for (let tx = tx0; tx <= tx1; tx++) {
          const ccx = tx * tileWu + halfTile;
          const dx = ccx < x0 ? x0 - ccx : ccx > x1 ? ccx - x1 : 0;
          if (dx * dx + dz * dz <= r2) data[row + tx] = 255;
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
    this.unitsView.update({
      curr,
      prev: this.prev,
      sinceMs: now - this.currAt,
      now,
      player: this.player,
      colours: this.colours,
      neutral: NEUTRAL_COLOUR,
      seen: (x, z) => this.seenNow(x, z),
      known: (x, z) => this.exploredNow(x, z),
      ruins: this.game?.info?.ruins ?? [],
      groundAt: (x, z) => this.groundAt(x, z),
      place: (i, x, y, z) => {
        const u = this.units[i];
        if (u) u.centre.set(x, y + u.halfSize.y, z);
      },
    });
  }

  /** Whether a point (metres) is explored by the players (near the view; the debug show-all shows everything). */
  exploredNow(x: number, z: number): boolean {
    if (this.showAll) return true;
    const a = this.fow.fowArea.value;
    const tx = Math.floor((x - a.x) / FOW_TILE_M);
    const tz = Math.floor((z - a.y) / FOW_TILE_M);
    if (tx < 0 || tz < 0 || tx >= FOW_TILES || tz >= FOW_TILES) return false;
    return this.fowData[tz * FOW_TILES + tx]! >= 128;
  }

  /** Whether a point (metres) is in sight of the players' units or buildings now; everything is, with the debug show-all. */
  seenNow(x: number, z: number): boolean {
    if (this.showAll) return true;
    const a = this.fow.fowArea.value;
    const tx = Math.floor((x - a.x) / FOW_TILE_M);
    const tz = Math.floor((z - a.y) / FOW_TILE_M);
    if (tx < 0 || tz < 0 || tx >= FOW_TILES || tz >= FOW_TILES) return false;
    return this.fowData[tz * FOW_TILES + tx] === 255;
  }

  // ---- Day and night ----

  private readonly dayHemi = new THREE.Color(0xdfefff);
  private readonly nightHemi = new THREE.Color(0x5a6a9a);
  private readonly duskHemi = new THREE.Color(0xffb880);
  private readonly daySun = new THREE.Color(0xfff2dc);
  private readonly nightSun = new THREE.Color(0x8aa0d8);
  private readonly duskSun = new THREE.Color(0xff9a5a);
  private readonly bloodHemi = new THREE.Color(0xb05048);
  private readonly bloodSun = new THREE.Color(0xff5a40);
  /** How thick the fog is drawn, 0 to 1, easing towards the sim's fog night. */
  private fogK = 0;
  private lastSky = 0;

  /** How dark it is: 0 by day, rising through dusk to 1 at night, falling through dawn. */
  darkness(): number {
    const c = clockAt(this.simStep, this.game?.info?.blood);
    const f = c.into / (c.into + c.left);
    switch (c.period) {
      case Period.Day:
        return 0;
      case Period.Dusk:
        return f;
      case Period.Night:
        return 1;
      case Period.Dawn:
        return 1 - f;
    }
  }

  /** The light of the period: warm at dusk and dawn, dim and blue at night (still bright enough to play). */
  private updateSky(): void {
    const k = this.darkness();
    const warm = Math.max(0, 1 - Math.abs(k - 0.5) * 2) * 0.8;
    this.hemi.intensity = 1.15 - 0.72 * k;
    this.hemi.color.copy(this.dayHemi).lerp(this.nightHemi, k).lerp(this.duskHemi, warm * 0.4);
    this.sun.intensity = 1.7 - 1.35 * k;
    this.sun.color.copy(this.daySun).lerp(this.nightSun, k).lerp(this.duskSun, warm);
    // A blood night: the night light turns red.
    const info = this.game?.info;
    const c = clockAt(this.simStep, info?.blood);
    if (info?.blood.includes(c.cycle) && c.period !== Period.Day) {
      this.hemi.color.lerp(this.bloodHemi, k * 0.55);
      this.sun.color.lerp(this.bloodSun, k * 0.6);
    }
    this.buildings.darkness = k;
    // The fog rolls in and lifts over a few seconds.
    const now = performance.now();
    const dt = this.lastSky ? Math.min(0.1, (now - this.lastSky) / 1000) : 0;
    this.lastSky = now;
    const want = info?.fog ? 1 : 0;
    this.fogK += Math.sign(want - this.fogK) * Math.min(Math.abs(want - this.fogK), dt / 4);
    const fog = this.scene.fog as THREE.Fog;
    if (this.fogK <= 0.001) {
      fog.near = FOG_OFF_M;
      fog.far = FOG_OFF_M * 2;
    } else {
      const off = (1 - this.fogK) * 400;
      fog.near = FOG_NEAR_M + off;
      fog.far = FOG_FAR_M + off;
      fog.color.setHex(FOG_COLOUR).multiplyScalar(1 - 0.6 * k);
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
    for (const u of this.units) if (!this.insideKeys.has(u.key)) yield u;
    yield* this.buildings.selectables();
    yield* this.lootView.selectables();
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
    // Lairs (dark red squares) and goblin villages (ochre rings, red at war) the player has found (Table 15: minimap marks).
    const px = 1 / Math.max(1e-6, ctx.getTransform().a);
    for (const m of this.game?.info?.marks ?? []) {
      const x = m.x / WU_PER_METRE;
      const z = m.z / WU_PER_METRE;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = '#000000';
      if (m.mob >= 0) {
        const r = 3.5 * px;
        ctx.fillStyle = '#c0302a';
        ctx.fillRect(x - r, z - r, r * 2, r * 2);
        ctx.strokeRect(x - r, z - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, z, 4.5 * px, 0, Math.PI * 2);
        ctx.fillStyle = m.war ? '#ff4030' : '#d8a040';
        ctx.fill();
        ctx.stroke();
      }
    }
    // The neutral peoples found: a diamond in each people's colour, ringed red at war.
    for (const f of this.game?.info?.peoples ?? []) {
      const x = f.x / WU_PER_METRE;
      const z = f.z / WU_PER_METRE;
      const r = 4.5 * px;
      ctx.beginPath();
      ctx.moveTo(x, z - r);
      ctx.lineTo(x + r, z);
      ctx.lineTo(x, z + r);
      ctx.lineTo(x - r, z);
      ctx.closePath();
      ctx.fillStyle = f.kind === FactionKind.MercCamp ? '#e09040' : (PEOPLE_MARKS[f.people] ?? '#c0c0c0');
      ctx.fill();
      ctx.lineWidth = (f.war ? 2 : 1.5) * px;
      ctx.strokeStyle = f.war ? '#ff3020' : '#000000';
      ctx.stroke();
    }
  }

  /** Ground height in metres, 0 where nothing is drawn. */
  groundAt(x: number, z: number): number {
    return this.heightAt(x, z) ?? 0;
  }

  /** A resource node's selectable by chunk and index, if its chunk is drawn at full detail. */
  node(cx: number, cz: number, index: number): Selectable | undefined {
    const c = this.chunks.get(ck(cx, cz));
    return c?.props.find((p) => p.key === `p:${cx},${cz}:${index}`);
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
