// The generated world on screen: chunks meshed by the mesh workers at full
// detail near the camera and less detail farther out, water, props and
// scenery as instanced cubes, fog of war (black unexplored; explored and
// unseen darkened, Jade's Patch 3), the units with outlines round the
// player's own that are hidden, and the hooks the controls shell needs:
// ground picking, selectable things, the minimap and the camera limits.
import * as THREE from 'three';
import { PLAYER_COLOURS as LOBBY_COLOURS } from '@blockyrts/protocol';
import {
  clockAt,
  COLUMNS_PER_CHUNK,
  gearSpec,
  Line,
  linePiece,
  Troop,
  MONSTERS,
  mobSpec,
  NEUTRAL,
  NO_CARRY,
  Period,
  RESOURCES,
  unitOrderText,
  propInfo,
  floorDiv,
  footprintRect,
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
  unitTitle,
  School,
  FactionKind,
  LEADER_NAMES,
  PEOPLES,
  peopleUnitSpec,
  engineSpec,
  mountSpec,
  Mount,
  IDOL_AREA_M,
} from '@blockyrts/sim';
import type { WorldHooks } from '../hud/shell.ts';
import type { GameInfo } from '../game/game-info.ts';
import type { DeltasMessage, FogMessage, StateMessage, VisionMessage } from '../messages.ts';
import { S, SpellOn, STATE_STRIDE, UnitFlag } from '../messages.ts';
import { ENEMY, ENEMY_RED, HIDDEN, inSight, unitSide } from '../minimap/things.ts';
import { boundsHolding } from '../minimap/transform.ts';
import type { ModelLibrary } from '../models/index.ts';
import { NOBODY, type GroundPicker, type MinimapSource, type Selectable, type SelectableSource } from '../selection/types.ts';
import type { FromMesh, MeshResult, PropSummary, ToMesh } from './mesh-messages.ts';
import { CHUNK_M, COLUMN_M, UNIT_M, type MeshArrays } from './mesher.ts';
import { CUBE_STRIDE } from './props-gen.ts';
import { propDetails, propLabel } from './plant-text.ts';
import { circlePieceDetails, circlePieceLabel } from './circle-text.ts';
import { BuildingsView } from './buildings-view.ts';
import { TavernView } from './tavern-view.ts';
import { UnitsView } from './units-view.ts';
import { PortraitView } from './portrait-view.ts';
import { FishView } from './fish-view.ts';
import { LootView } from './loot-view.ts';
import { glitterOfResource, WorldFx, type GlitterSpot } from './sparkle.ts';
import { Overlay } from './overlay.ts';
import { fowPatch, patchMaterial, type FowUniforms } from './fog-material.ts';
import { PropModelsView, PROP_VIEW_IDS, type PlacedProp } from './prop-models-view.ts';
import { loadTerrainTextures, loadWaterTextures, setTerrainBands, terrainPatch, terrainUniforms, waterPatch, waterUniforms } from './terrain-textures.ts';
import { HiddenOutlines, type OutlineStats, type OwnDraw } from './hidden-outlines.ts';
import { HoverOutline, type HoverParts } from './hover-outline.ts';
import { aimSun, keepShadowFlags, setUpSun } from './sun-shadows.ts';
import { cycleSeconds, newSkyMoment, SKY_MID_DAY, skyAt } from './sky-light.ts';
import { FogDrift } from './fog-drift.ts';

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
/**
 * The day's light from the lighting sheet (sky-light.ts), matched so its
 * mid-day is as bright as the game's: the sun's strength at the sheet's 1, and
 * the ambient light's at the sheet's mid-day. The sheet's distance fog is a
 * fraction of this view depth (the top of the screen at the farthest zoom is
 * about 86 m away), and fades out over as far again.
 */
const SUN_PEAK = 1.7;
const HEMI_DAY = 1.15;
const HEMI_DAY_COLOUR = new THREE.Color(0xdfefff);
const VIEW_DEPTH_M = 100;
/**
 * A Bright Night (Patch 5, SCA-6: "Illuminated by a full, smiling moon whose
 * light casts an eerie but also comforting subtle white glowing gradient over
 * the night"): the night lit whiter and brighter, and a pale moonlit haze that
 * grows with distance, so the land glows towards the top of the screen. Near a
 * Lunar circle the Moon Roses' musk tints the air slightly rosy (SCA-8) (s).
 */
const BRIGHT_HEMI = new THREE.Color(0xc4d0ec);
const BRIGHT_MOON = new THREE.Color(0xe6ecff);
const BRIGHT_HAZE = 0x8f9bb8;
const BRIGHT_HAZE_NEAR_M = 40;
const BRIGHT_HAZE_FAR_M = 520;
const ROSY = new THREE.Color(0xffc8dc);
const ROSY_M = 70;
/** The minimap keeps this much land round a mark outside the explored land, metres, so a lair's dot is never cut at its edge. */
const MARK_MARGIN_M = 10;
const FOG_TILES_PER_CHUNK = 16;
/** Seconds between redraws of full-detail chunks so growing trees and regrowing bushes show. */
const GROWTH_REFRESH_S = 20;
const WORLD_EDGE_M = WORLD_EDGE_WU / WU_PER_METRE;

/** Player colours when the lobby gives none: the lobby's own list in order (decision 8's placeholder blue is player 1). */
export const PLAYER_COLOURS = LOBBY_COLOURS.map((c) => new THREE.Color(c.hex));
const NEUTRAL_COLOUR = new THREE.Color(0x8a8a80);
/** The dark edge round each unit and building on the minimap (s). */
const MINIMAP_EDGE = 'rgba(10, 10, 8, 0.85)';
/** The minimap colour of each people (Halflings, Runkin, Elves, Dwarves). */
const PEOPLE_MARKS = ['#8ac850', '#b08050', '#50c0a8', '#a8a8b8'];

const UNIT_NAMES = ['Worker', 'Warrior', 'Wanderer', 'Monster', 'Animal', 'Mage', 'Engine'];
const UNIT_TYPE_KEYS = ['worker', 'warrior', 'wanderer', 'mob', 'animal', 'mage:support', 'engine'];

/** A gear id's name, or '' for an empty slot. */
const gearName = (id: number): string => (id ? gearSpec(id).name : '');

/** A troop's kit lines in words (units/kits.ts Line). */
const LINE_WORDS = ['weapon', 'armour', 'shield', 'arrows'];

/** "Upgrading the weapon to Bronze spear: 40%." for a unit with an upgrade under way, or ''. */
function upgradeText(d: Int32Array, o: number, kind: 'worker' | 'warrior' | 'mage'): string {
  const line = d[o + S.upLine]! - 1;
  if (line < 0) return '';
  const h = { kind, troop: d[o + S.troop]!, w: d[o + S.wTier]!, a: d[o + S.aTier]!, s: d[o + S.sTier]!, t: d[o + S.tips]! };
  const piece = linePiece(h, line, d[o + S.upTo]!);
  const what = kind === 'worker' ? 'tools' : kind === 'mage' ? (line === Line.Weapon ? 'wand' : 'robe') : (LINE_WORDS[line] ?? 'kit');
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

/** The world rectangle (metres) a minimap canvas shows under its current transform. */
function visibleOn(ctx: CanvasRenderingContext2D): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const m = ctx.getTransform();
  return { minX: -m.e / m.a, minZ: -m.f / m.d, maxX: (ctx.canvas.width - m.e) / m.a, maxZ: (ctx.canvas.height - m.f) / m.d };
}


function geometryOf(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3, true));
  g.setAttribute('mat', new THREE.BufferAttribute(a.mats, 1));
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
  /** Its gold and silver, to glitter (Patch 5, VX-6). */
  glitter: GlitterSpot[];
  meshedAt: number;
  /** The scenery cubes, and each prop's cubes in them by its key (first, count), for the hover outline. */
  cubes: THREE.InstancedMesh | null;
  ranges: Map<string, readonly [number, number]>;
  /** Its props drawn with their own models (Patch 5), and the models it would use that have not loaded yet. */
  models: PlacedProp[];
  wants: string[];
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
  /** The land's tiles and where the bands lie, for its shader. */
  private readonly terrain = terrainUniforms();
  private readonly water = waterUniforms();
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
  /** Outlines round the player's own units hidden from the camera (Jade's Patch 3), drawn by match.ts after the world. */
  private readonly outlines: HiddenOutlines;
  /** Patch 5 (UI-5): the white silhouette round what the cursor is over, and its keys and unit and building ids. */
  private readonly hoverOutline = new HoverOutline();
  private hoverList: readonly Selectable[] = [];
  private readonly hoverKeys = new Set<string>();
  private readonly hoverUnits = new Set<number>();
  private readonly hoverBuildings = new Set<number>();
  /** The selection's portrait, drawn by match.ts into the HUD's portrait window after the world. */
  readonly portrait: PortraitView;
  private readonly lootView: LootView;
  /** The world props' own models (Patch 5). */
  private readonly propModels: PropModelsView;
  /** Prop models loaded since the mesh workers were last told, and when they were. */
  private propModelsNew: string[] = [];
  private propModelsToldAt = 0;
  /** Prop models a chunk asked the library for. */
  private readonly propModelsAsked = new Set<string>();
  /** Gold and silver glitter (Patch 5, VX-6). */
  private readonly fx: WorldFx;
  private glitterDirty = true;
  private lastFx = 0;
  /** A fog night's drifting fog banks (Patch 5). */
  private readonly fogDrift: FogDrift;
  /** The live fish in the water and the woodsmen's catches (Patch 5, FR-2). */
  private readonly fishView: FishView;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private viewRing = QUARTER_DETAIL_RING;
  private shadows = false;
  readonly buildings: BuildingsView;
  /** The Tavern's lit windows, smoke and bar (Patch 5). */
  private readonly taverns: TavernView;
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
    // Everything added to the world casts and takes the sun's shadows from its first frame (sun-shadows.ts).
    keepShadowFlags(scene);
    scene.background = new THREE.Color(0x07080a);
    // Fog nights (Table 8): a grey fog that closes in round the view; out of sight while there is none.
    scene.fog = new THREE.Fog(FOG_COLOUR, FOG_OFF_M, FOG_OFF_M * 2);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.15);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
    // Shadows (Settings: graphics), when on: a box round the ground on screen, aimed each frame by aimSun.
    setUpSun(sun);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.fogDrift = new FogDrift(scene, (x, z) => this.heightAt(x, z));

    const tex = new THREE.DataTexture(this.fowData, FOW_TILES, FOW_TILES, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.fow = { fowTex: { value: tex }, fowArea: { value: new THREE.Vector3(0, 0, FOW_TILES * FOW_TILE_M) }, fowAll: { value: 0 } };
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // The land's pixel tiles (Patch 5, VX-1) over the fog of war's patch; flat colour and noise until they load.
    const fog = fowPatch(this.fow, false);
    const tiles = terrainPatch(this.terrain);
    this.terrainMat.onBeforeCompile = (shader) => {
      fog(shader);
      tiles(shader);
    };
    this.terrainMat.customProgramCacheKey = () => 'fow-terrain';
    void loadTerrainTextures(this.terrain).catch((err: unknown) => console.warn('terrain textures not loaded; drawing flat colours', err));
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    // The water's animated tiles (Patch 5) over the fog of war's patch; flat blue until they load.
    const waterTiles = waterPatch(this.water);
    this.waterMat.onBeforeCompile = (shader) => {
      fog(shader);
      waterTiles(shader);
    };
    this.waterMat.customProgramCacheKey = () => 'fow-water';
    void loadWaterTextures(this.water).catch((err: unknown) => console.warn('water tiles not loaded; drawing flat blue', err));
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

    this.unitsView = new UnitsView(scene, this.fow);
    this.outlines = new HiddenOutlines(scene, this.unitsView, this.colours[this.player] ?? NEUTRAL_COLOUR);
    this.buildings = new BuildingsView(scene, this.fow, this.colours);
    this.taverns = new TavernView(scene);
    this.portrait = new PortraitView(this.colours, NEUTRAL_COLOUR);
    this.overlay = new Overlay(scene);
    this.lootView = new LootView(scene);
    this.propModels = new PropModelsView(scene, { key: 'fow', apply: fowPatch(this.fow, false) });
    this.fx = new WorldFx(scene);
    this.fishView = new FishView(scene);

    const ground: GroundPicker = (ray) => this.pick(ray);
    const selectables: SelectableSource = { candidates: () => this.candidates() };
    const minimap: MinimapSource = {
      bounds: () => this.minimapBounds(),
      paint: (ctx) => this.paintMinimap(ctx),
      version: () => this.minimapVersion,
      paintThings: (ctx, dpr, shown) => this.paintMinimapThings(ctx, dpr, shown),
      focus: () => this.minimapFocus,
    };
    this.hooks = {
      ground,
      selectables,
      minimap,
      limits: () => ({ minX: -WORLD_EDGE_M, maxX: WORLD_EDGE_M, minZ: -WORLD_EDGE_M, maxZ: WORLD_EDGE_M }),
      hover: (list) => this.setHover(list),
    };
  }

  /** What the cursor is over this frame (Patch 5, UI-5): drawn with a white silhouette from the next frame. */
  private setHover(list: readonly Selectable[]): void {
    this.hoverList = list;
    this.hoverKeys.clear();
    this.hoverUnits.clear();
    this.hoverBuildings.clear();
    for (const t of list) {
      this.hoverKeys.add(t.key);
      if (t.key.startsWith('e:')) this.hoverUnits.add(Number(t.key.slice(2)));
      else if (t.key.startsWith('b:')) this.hoverBuildings.add(Number(t.key.slice(2)));
    }
    this.buildings.hovered = this.hoverBuildings;
  }

  /** What the hover outline draws: the hovered units, buildings, loot and props, and where they stand. */
  private hoverParts(): HoverParts {
    const { models, meshes } = this.buildings.hoverParts();
    const cubes: Array<{ mesh: THREE.InstancedMesh; first: number; count: number }> = [];
    const boxes: OwnDraw[] = [];
    for (const t of this.hoverList) {
      // Trees are picked by their trunk; their crowns reach further out.
      const wide = t.key.startsWith('p:') ? 2.5 : 0.3;
      boxes.push({ id: 0, x: t.centre.x, y: t.centre.y - t.halfSize.y - 0.2, z: t.centre.z, h: t.halfSize.y * 2 + 0.6, r: Math.max(t.halfSize.x, t.halfSize.z) + wide, outlined: false });
      if (!t.key.startsWith('p:')) continue;
      const at = /^p:(-?\d+),(-?\d+):/.exec(t.key);
      const c = at ? this.chunks.get(ck(Number(at[1]), Number(at[2]))) : undefined;
      const range = c?.ranges.get(t.key);
      if (c?.cubes && range && range[1] > 0) cubes.push({ mesh: c.cubes, first: range[0], count: range[1] });
    }
    return {
      units: this.hoverUnits.size > 0 ? { group: this.unitsView.bodyGroup, pass: (m) => this.unitsView.passPools(m) } : null,
      models: [...models, ...this.propModels.hovered()],
      meshes,
      sprites: this.lootView.hoverSprites(this.hoverKeys),
      cubes,
      boxes,
    };
  }

  /** The model library (opened by main.ts before the match starts); models swap in as they load. */
  setModels(lib: ModelLibrary): void {
    this.models = lib;
    this.unitsView.setModels(lib);
    this.fishView.setModels(lib);
    this.ghostUnits?.setModels(lib);
    this.buildings.setModels(lib);
    this.portrait.setModels(lib);
    this.propModels.setModels(lib);
    for (const id of lib.models.keys()) if (PROP_VIEW_IDS.has(id)) this.propModelsNew.push(id);
    for (const c of this.chunks.values()) this.askPropModels(c.wants);
    lib.onLoad((m) => {
      if (PROP_VIEW_IDS.has(m.id)) this.propModelsNew.push(m.id);
    });
  }

  /** The prop models chunks in view are waiting for load next. */
  private askPropModels(ids: readonly string[]): void {
    const lib = this.models;
    if (!lib) return;
    for (const id of ids) {
      if (this.propModelsAsked.has(id)) continue;
      this.propModelsAsked.add(id);
      lib.request(id);
    }
  }

  /**
   * Tells the mesh workers about the prop models loaded since last time (at
   * most once a second, as they arrive in a rush), and remeshes the chunks
   * that wanted them: their props swap from cubes to models.
   */
  private tellPropModels(now: number): void {
    const lib = this.models;
    if (!lib || this.propModelsNew.length === 0 || now - this.propModelsToldAt < 1000) return;
    this.propModelsToldAt = now;
    const ids = new Set(this.propModelsNew);
    this.propModelsNew = [];
    const bounds: Array<[string, number, number, number, number, number, number]> = [];
    for (const id of ids) {
      const b = lib.models.get(id)?.boundingBox;
      if (b) bounds.push([id, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    }
    for (const w of this.workers) w.postMessage({ type: 'propModels', bounds } satisfies ToMesh);
    for (const c of this.chunks.values()) if (c.wants.some((id) => ids.has(id))) c.version++;
    // An idol's model draws on an altar already in view.
    this.propModels.invalidate();
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
        u.label = this.title(d, o, kind);
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
        const troop = d[o + S.troop]!;
        // The artillery crewman (Patch 2) is its own type: its own card and subgroup, never upgraded or sent hunting; so are the
        // woodsman, not one of the army F2 selects (Jade's WD-4), and the Dreadnought (Patch 5).
        const dread = troop === Troop.Dreadnought;
        u.typeKey = troop === Troop.Crew ? 'warrior:crew' : troop === Troop.Woodsman ? 'warrior:woods' : dread ? 'warrior:dreadnought' : 'warrior';
        // A double click's types (Jade's Patch 5, CT-5): cavalry (anyone mounted), close melee, long melee, and every other kind its own.
        u.clickType = d[o + S.mount] !== Mount.None || troop === Troop.Cavalry ? 'warrior:cavalry' : `warrior:${troop}`;
        u.label = this.title(d, o, kind);
        // Rangers fight close with their fists, which go unsaid; the brawler's pistol comes first.
        const weapon = troop === Troop.Ranger ? '' : gearName(d[o + S.weapon]!);
        const tips = d[o + S.tips] ? 'poison tips' : '';
        const gear = [gearName(d[o + S.ranged]!), tips, weapon, gearName(d[o + S.shield]!), gearName(d[o + S.armour]!) || 'no armour'].filter((x) => x);
        const shield = troop === Troop.Close ? `, shield tier ${d[o + S.sTier]}` : '';
        // The Dreadnought's mace and plate are his own, with no tiers (Patch 5).
        const details = [health, `${capital(gear.map((x) => x.toLowerCase()).join(', '))}.`, dread ? 'A smash, then a sweep at everything in front of him, every 3 s.' : `Weapon tier ${d[o + S.wTier]}, armour tier ${d[o + S.aTier]}${shield}.`];
        this.lootLine(details, id);
        const up = upgradeText(d, o, 'warrior');
        if (up) details.push(up);
        const mount = d[o + S.mount]!;
        if (mount !== Mount.None) details.push(`Riding a ${mountSpec(mount).name.toLowerCase()} (health ${d[o + S.mountHp]} / ${d[o + S.mountMax]}).`);
        // A rider is as tall as his mount and him; the Dreadnought stands 2.5 m (Patch 5).
        if (dread) u.halfSize.set(0.5, 1.25, 0.5);
        else u.halfSize.set(mount !== Mount.None ? 0.6 : 0.3, mount !== Mount.None ? 1.3 : 0.85, mount !== Mount.None ? 0.6 : 0.3);
        if (owner === this.player) {
          const q = this.game?.queues.get(id) ?? [];
          details.push(q.length > 1 ? `${unitOrderText(q[0])}, then ${q.length - 1} more.` : `${unitOrderText(q[0])}.`);
        }
        u.details = details;
      } else if (kind === UnitKind.Mage) {
        const school = d[o + S.school]!;
        u.label = this.title(d, o, kind);
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
        // A mana crystal's guardian is named for what it guards (Jade's Patch 5, MB-13).
        const guardian = (d[o + S.flags]! & UnitFlag.Guardian) !== 0;
        u.label = guardian ? 'Mana crystal guardian' : spec.name;
        u.typeKey = `mob:${spec.id}`;
        u.owner = MONSTERS;
        u.halfSize.set(spec.halfWidth / WU_PER_METRE, spec.height / WU_PER_METRE / 2, spec.halfWidth / WU_PER_METRE);
        u.details = guardian ? [`${spec.name}. It keeps to its crystal and never comes back once killed.`, health] : [health];
      } else if (kind === UnitKind.Engine) {
        const spec = engineSpec(d[o + S.mob]!);
        u.label = spec.name;
        u.typeKey = `engine:${spec.id}`;
        u.halfSize.set(spec.halfWidth / WU_PER_METRE, spec.height / WU_PER_METRE / 2, spec.halfWidth / WU_PER_METRE);
        const crew = d[o + S.crew]! % 1000;
        const hauled = d[o + S.crew]! >= 1000;
        const details = [health, `Crew ${crew} of ${spec.crew} ${spec.mobile >= 0 ? 'garrison ' : ''}artillery crewmen.`, hauled ? 'Hauled by its animal, which stands in for its crew: it fires with none.' : crew >= spec.crew && spec.pushed > 0 ? 'Pushed by its crew.' : spec.pushed > 0 ? 'Needs a horse or an ox, or its crew, to move.' : 'Fixed in place.'];
        if (d[o + S.inside] !== 0) details.push('On the Citadel\'s engine platform, for good.');
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
    this.unitsView.onHits(msg.hits, (x, z) => this.seenNow(x, z), performance.now(), (id) => this.game?.unit(id) ?? null);
    this.fishView.onHits(msg.hits, (x, z) => this.seenNow(x, z), performance.now());
  }

  /** A worker's, troop's or mage's name: the sim's unitTitle, so it reads the same as its bubbles and lines. */
  private title(d: Int32Array, o: number, kind: number): string {
    return unitTitle({ kind, troop: d[o + S.troop]!, wTier: d[o + S.wTier]!, rank: d[o + S.rank]!, school: d[o + S.school]! });
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
      // Patch 5 (GP-46): any of their buildings opens trade, or the hire box at a mercenary camp.
      const what = f?.kind === FactionKind.MercCamp ? 'Right click it to hire mercenaries.' : 'Right click it to trade. One of your units must be within 10 m of one of their buildings.';
      u.details = [title, health, f?.war ? 'At war with you.' : what];
      return;
    }
    const spec = peopleUnitSpec(mob);
    if (owner !== PEOPLES) {
      // A mercenary the local player (or an ally) hired: theirs for good (Patch 5).
      if (owner === NEUTRAL || owner >= 8) return;
      u.label = `Mercenary ${spec.name.toLowerCase()}`;
      u.typeKey = `merc:${mob}`;
      u.details = [health, owner === this.player ? 'Hired for good. It takes 1 supply and eats like any troop.' : 'Hired by an ally.'];
      return;
    }
    const id = d[o + S.id]!;
    const leader = f !== null && f.leader === id;
    u.label = leader ? `${LEADER_NAMES[f.kind] ?? 'Elder'} (${spec.name})` : spec.name;
    u.typeKey = `people:${mob}`;
    u.owner = PEOPLES;
    u.halfSize.set(0.3, spec.heightCm / 200, 0.3);
    const what = f?.war ? 'At war with you.' : f?.kind === FactionKind.MercCamp ? 'Right click to hire mercenaries. One of your units must be within 10 m of their camp.' : leader || f?.kind === FactionKind.ElfCaravan ? 'Right click to trade. One of your units must be within 10 m of one of their buildings.' : '';
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
      this.glitterDirty = true;
      const sig = `${info.marks.map((m) => `${m.mob},${m.x},${m.z},${m.war ? 1 : 0}`).join(';')}|${info.peoples.map((f) => `${f.id},${f.x >> 12},${f.z >> 12},${f.war ? 1 : 0},${f.status}`).join(';')}`;
      if (sig !== this.marksSig) {
        this.marksSig = sig;
        this.markPoints = info.marks.map((m) => ({ x: m.x / WU_PER_METRE, z: m.z / WU_PER_METRE }));
        this.minimapVersion++;
      }
    });
  }

  private marksSig = '';
  /** The camera's focus as of the last frame, which the minimap follows over land too big to show whole (Patch 5 BG-5). */
  private minimapFocus: { x: number; z: number } | null = null;
  /** Where the minimap's marks stand, metres: it always shows them, explored land or not (Patch 3: every lair). */
  private markPoints: Array<{ x: number; z: number }> = [];

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
    // Every mesh keeps its shadow flags (keepShadowFlags), so the setting is the sun's alone.
    if (g.shadows !== this.shadows) {
      this.shadows = g.shadows;
      this.sun.castShadow = g.shadows;
    }
  }

  /** Aims the sun's shadow box at the ground on screen; call once the camera has moved for the frame, just before it is drawn. */
  aimSun(camera: THREE.Camera, focus: THREE.Vector3): void {
    if (this.shadows) aimSun(this.sun, camera, focus.y);
  }

  update(now: number, focus: THREE.Vector3): void {
    this.minimapFocus = focus;
    this.updateUnits(now);
    this.lootView.update(now);
    this.tellPropModels(now);
    this.propModels.update(this.modelChunks(), this.game?.info?.circles, this.hoverKeys);
    this.updateFx(now);
    this.fishView.update(now, focus, (id) => this.game?.unit(id) ?? null);
    this.updateSky();
    this.fogDrift.update(this.fogK, focus, now);
    this.terrain.terrainTime.value = now / 1000;
    this.water.waterTime.value = now / 1000;
    if (this.game) this.buildings.update(this.game, now, focus);
    if (this.game) this.taverns.update(this.game, now, focus, this.buildings.darkness);
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

  /** The props drawn with models, chunk by chunk. */
  private *modelChunks(): Iterable<readonly PlacedProp[]> {
    for (const c of this.chunks.values()) if (c.lod === 1 && c.models.length > 0) yield c.models;
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
      this.chunks.set(key, { cx, cz, lod: 0, want: w, pending: 0, version: 0, meshedVersion: -1, requested: 0, group: null, heights: null, size: 0, props: [], glitter: [], meshedAt: 0, cubes: null, ranges: new Map(), models: [], wants: [] });
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
    if (msg.type === 'bands') {
      setTerrainBands(this.terrain, msg.anchors.map(([x, z]) => ({ x: x * COLUMN_M, z: z * COLUMN_M })), msg.starts.map((s) => s * COLUMN_M));
      return;
    }
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
    c.cubes = null;
    c.ranges.clear();
    if (m.cubes && m.cubes.length > 0) group.add((c.cubes = this.cubesMesh(m.cubes)));
    this.scene.add(group);
    group.updateMatrixWorld(true);
    c.group = group;
    c.lod = m.lod;
    c.heights = m.heights;
    c.size = m.size;
    c.props = m.props.map((p) => this.propSelectable(c, p));
    c.glitter = this.glitterOf(c, m.props);
    this.glitterDirty = true;
    this.fishView.setChunk(ck(c.cx, c.cz), c.cx, c.cz, m.props);
    for (const p of m.props) c.ranges.set(`p:${c.cx},${c.cz}:${p.index}`, [p.first, p.cubes]);
    c.models = [];
    for (const p of m.props) if (p.model) c.models.push({ key: `p:${c.cx},${c.cz}:${p.index}`, kind: p.kind, variant: p.variant, ox: c.cx * CHUNK_M, oz: c.cz * CHUNK_M, model: p.model });
    c.wants = m.wants;
    this.askPropModels(m.wants);
    this.propModels.invalidate();
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
      label: circlePieceLabel(p.kind, p.variant, p.amount) ?? propLabel(p.kind, p.stage, p.amount),
      details: [...propDetails(p.kind, p.stage, p.amount, p.most, p.nextAt < 0 ? -1 : p.nextAt - this.simStep), ...circlePieceDetails(p.kind, p.stage, p.amount, p.variant)],
      // A sapling holds nothing yet, so there is nothing to gather.
      resource: info.resource && p.amount > 0 ? info.resource : '',
      prop: { kind: p.kind, variant: p.variant, gx: c.cx * COLUMNS_PER_CHUNK + p.lx, gz: c.cz * COLUMNS_PER_CHUNK + p.lz, amount: p.amount },
    };
  }

  /** A chunk's gold and silver props that still hold some, to glitter. */
  private glitterOf(c: ChunkView, props: readonly PropSummary[]): GlitterSpot[] {
    const out: GlitterSpot[] = [];
    for (const p of props) {
      const colour = p.amount > 0 ? glitterOfResource(propInfo(p.kind).resource) : 0;
      if (colour) out.push({ x: c.cx * CHUNK_M + p.x, y: p.y, z: c.cz * CHUNK_M + p.z, r: Math.max(p.hx, p.hz, 0.2), colour });
    }
    return out;
  }

  /** The glitter winks on what is near the view, the flashes fade. */
  private updateFx(now: number): void {
    const dt = this.lastFx ? Math.min(0.1, (now - this.lastFx) / 1000) : 0;
    this.lastFx = now;
    if (this.glitterDirty) {
      this.glitterDirty = false;
      const spots = this.lootView.glitter();
      for (const c of this.chunks.values()) if (c.lod === 1) for (const g of c.glitter) spots.push(g);
      this.fx.setSpots(spots);
    }
    this.fx.update(dt, (x, z) => this.seenNow(x, z));
  }

  private dropChunk(c: ChunkView): void {
    this.glitterDirty = true;
    this.fishView.dropChunk(ck(c.cx, c.cz));
    if (!c.group) return;
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    c.group = null;
    c.lod = 0;
    c.cubes = null;
    c.ranges.clear();
    if (c.models.length > 0) this.propModels.invalidate();
    c.models = [];
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

  /** Godmode's unit on the cursor (Jade's Patch 5): one state row, drawn solid by a units view of its own where the cursor points. */
  private ghostUnits: UnitsView | null = null;
  private readonly ghostMsg: StateMessage = { type: 'state', step: 0, hash: 0, hashStep: 0, count: 0, data: new Int32Array(STATE_STRIDE), shots: new Int32Array(0), hits: [] };

  /** Shows a unit's state row standing at a point (metres) on the ground, or nothing (null). */
  setUnitGhost(row: Int32Array | null, x: number, z: number): void {
    const m = this.ghostMsg;
    if (!row) {
      m.count = 0;
      return;
    }
    if (!this.ghostUnits) {
      this.ghostUnits = new UnitsView(this.scene);
      if (this.models) this.ghostUnits.setModels(this.models);
    }
    m.data.set(row);
    m.data[S.x] = Math.round(x * WU_PER_METRE);
    m.data[S.z] = Math.round(z * WU_PER_METRE);
    m.data[S.y] = Math.round(this.groundAt(x, z) * WU_PER_METRE);
    m.count = 1;
  }

  private updateGhostUnit(now: number): void {
    const g = this.ghostUnits;
    if (!g) return;
    g.update({
      curr: this.ghostMsg,
      prev: null,
      sinceMs: 0,
      now,
      player: this.player,
      colours: this.colours,
      neutral: NEUTRAL_COLOUR,
      seen: () => true,
      known: () => true,
      ruins: [],
      groundAt: (x, z) => this.groundAt(x, z),
      place: () => undefined,
    });
  }

  private updateUnits(now: number): void {
    this.updateGhostUnit(now);
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
      outlined: this.outlines.outlined,
      hovered: this.hoverUnits,
      ruins: this.game?.info?.ruins ?? [],
      groundAt: (x, z) => this.groundAt(x, z),
      place: (i, x, y, z) => {
        const u = this.units[i];
        if (u) u.centre.set(x, y + u.halfSize.y, z);
      },
    });
  }

  /** After the scene is drawn to the screen: the outlines round the player's own units hidden behind things. */
  renderOutlines(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, now: number): void {
    this.outlines.render(renderer, camera, now);
    if (this.hoverList.length > 0) this.hoverOutline.render(renderer, camera, this.hoverParts());
  }

  /** What the outlines have cost so far, for the debug tools and the browser checks. */
  get outlineStats(): OutlineStats {
    return this.outlines.stats;
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

  /** The sheet's light now, and how much stronger the game's ambient light is than the sheet's numbers. */
  private readonly sky = newSkyMoment();
  private readonly hemiScale = (HEMI_DAY * luminance(HEMI_DAY_COLOUR)) / (SKY_MID_DAY.ambientI * luminance(SKY_MID_DAY.ambient));
  /** How thick the fog is drawn, 0 to 1, easing towards the sim's fog night. */
  private fogK = 0;
  /** How bright the night is drawn, 0 to 1, and how rosy, easing towards a Bright Night's (Patch 5). */
  private brightK = 0;
  private rosyK = 0;
  private lastSky = 0;

  /** How dark it is: 0 by day, rising through dusk to 1 at night, falling through dawn. */
  darkness(): number {
    const c = clockAt(this.simStep);
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

  /**
   * The light of the moment, from the lighting sheet: warm white by day, deep
   * orange at dusk, cool blue moonlight at night and pink-gold at dawn, with
   * the fog night's own values while the fog is in.
   */
  private updateSky(): void {
    const k = this.darkness();
    const c = clockAt(this.simStep);
    // The fog rolls in and lifts over a few seconds.
    const now = performance.now();
    const dt = this.lastSky ? Math.min(0.1, (now - this.lastSky) / 1000) : 0;
    this.lastSky = now;
    const want = this.game?.info?.fog ? 1 : 0;
    this.fogK += Math.sign(want - this.fogK) * Math.min(Math.abs(want - this.fogK), dt / 4);
    const m = skyAt(cycleSeconds(c.period, c.into / Math.max(1, c.into + c.left)), this.fogK, this.sky);
    this.hemi.color.copy(m.ambient);
    this.hemi.intensity = m.ambientI * this.hemiScale;
    this.sun.color.copy(m.light);
    this.sun.intensity = m.lightI * SUN_PEAK;
    this.sun.shadow.intensity = Math.min(1, m.shadow / SKY_MID_DAY.shadow);
    (this.scene.background as THREE.Color).copy(m.edge);
    this.buildings.darkness = k;
    this.unitsView.darkness = k;
    this.buildings.fog = this.fogK * k;
    this.terrain.terrainNight.value = k;
    // A Bright Night comes on and goes over a few seconds too, and only shows in the dark.
    const [bright, rosy] = this.brightHere();
    this.brightK += Math.sign(bright - this.brightK) * Math.min(Math.abs(bright - this.brightK), dt / 4);
    this.rosyK += Math.sign(rosy - this.rosyK) * Math.min(Math.abs(rosy - this.rosyK), dt / 4);
    const b = this.brightK * k;
    if (b > 0.001) {
      this.hemi.intensity += 0.4 * b;
      this.hemi.color.lerp(BRIGHT_HEMI, 0.7 * b).lerp(ROSY, 0.18 * this.rosyK * k);
      this.sun.intensity += 0.5 * b;
      this.sun.color.lerp(BRIGHT_MOON, 0.8 * b);
    }
    const fog = this.scene.fog as THREE.Fog;
    if (this.fogK <= 0.001 && b > 0.001) {
      // The moonlit haze: nothing near, paler with distance.
      fog.near = BRIGHT_HAZE_NEAR_M;
      fog.far = BRIGHT_HAZE_FAR_M / b;
      fog.color.setHex(BRIGHT_HAZE).lerp(ROSY, 0.25 * this.rosyK);
    } else if (this.fogK <= 0.001) {
      // The sheet's haze: none by day, closing in on the far land at dusk and night.
      fog.near = m.fogD >= 0.999 ? FOG_OFF_M : VIEW_DEPTH_M * m.fogD;
      fog.far = fog.near * 2;
      fog.color.copy(m.fog);
    } else {
      const off = (1 - this.fogK) * 400;
      fog.near = FOG_NEAR_M + off;
      fog.far = FOG_FAR_M + off;
      fog.color.copy(m.fog);
    }
  }

  /**
   * Whether the night is bright where the camera looks (anyone's Bright Night,
   * or a Moon Goddess idol's night within 200 m of its circle), and whether
   * the Moon Roses' musk is in the air there (a bright night near a Lunar circle).
   */
  private brightHere(): [number, number] {
    const v = this.game?.info?.circles;
    const f = this.minimapFocus;
    if (!v || !f) return [0, 0];
    let bright = v.brightSky;
    for (const [, x, z] of v.idolAreas) if (Math.hypot(x / WU_PER_METRE - f.x, z / WU_PER_METRE - f.z) < IDOL_AREA_M) bright = true;
    if (!bright) return [0, 0];
    let rosy = 0;
    for (const [x, z] of v.roses) if (Math.hypot(x / WU_PER_METRE - f.x, z / WU_PER_METRE - f.z) < ROSY_M) rosy = 1;
    return [1, rosy];
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

  /** The explored land, grown to hold every mark (Patch 3: a lair out in unexplored land still shows its dot). */
  private minimapBounds(): { minX: number; minZ: number; maxX: number; maxZ: number } {
    const b = this.exploredBounds;
    const land = b.any ? { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ } : { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
    return boundsHolding(land, this.markPoints, MARK_MARGIN_M);
  }

  private paintMinimap(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = false;
    // Only the tiles on the canvas: past MAX_MINIMAP_SIDE the minimap shows a window of the land (Patch 5 BG-5).
    const v = visibleOn(ctx);
    for (const t of this.minimapTiles.values()) {
      if (!t.rgba) continue;
      const x = t.cx * CHUNK_M;
      const z = t.cz * CHUNK_M;
      if (x > v.maxX || z > v.maxZ || x + CHUNK_M < v.minX || z + CHUNK_M < v.minZ) continue;
      ctx.drawImage(t.canvas, x, z, CHUNK_M, CHUNK_M);
    }
  }

  /**
   * Over the land (Patch 2, Jade): every player's buildings as their
   * footprints (at least 2 px) and units as 2 px dots in that player's colour,
   * enemies the players' side sees in red; then the marks on top. Each has a
   * 1 px dark edge (s), drawn under all the colours so a crowd reads as one
   * patch, and so green still shows on grass.
   */
  private paintMinimapThings(ctx: CanvasRenderingContext2D, dpr: number, shown?: { minX: number; minZ: number; maxX: number; maxZ: number }): void {
    const px = 1 / Math.max(1e-6, ctx.getTransform().a);
    const dot = 2 * dpr * px;
    const edge = dpr * px;
    const colours = new Map<number, string>();
    const colour = (side: number): string => {
      let c = colours.get(side);
      if (c === undefined) {
        c = side === ENEMY ? ENEMY_RED : `#${(this.colours[side] ?? NEUTRAL_COLOUR).getHexString()}`;
        colours.set(side, c);
      }
      return c;
    };
    // x, z, width, depth in metres, then the colour, for every thing in drawing order.
    const rects: number[] = [];
    const sides: string[] = [];
    for (const b of this.game?.info?.buildings ?? []) {
      if (b.owner >= this.players) continue;
      const [x0, z0, x1, z1] = footprintRect(b);
      const w = Math.max(dot, (x1 - x0 + 1) * COLUMN_M);
      const d = Math.max(dot, (z1 - z0 + 1) * COLUMN_M);
      rects.push((x0 + x1 + 1) * COLUMN_M * 0.5 - w / 2, (z0 + z1 + 1) * COLUMN_M * 0.5 - d / 2, w, d);
      sides.push(colour(b.owner));
    }
    const st = this.curr;
    if (st) {
      const v = st.data;
      const atWar = (group: number): boolean => this.game?.faction(group)?.war === true;
      // Enemies last, so a foe among your men still shows.
      for (const enemies of [false, true]) {
        for (let i = 0; i < st.count; i++) {
          const o = i * STATE_STRIDE;
          const side = unitSide({ owner: v[o + S.owner]!, flags: v[o + S.flags]!, group: v[o + S.group]!, hp: v[o + S.hp]!, inside: v[o + S.inside]! }, this.players, atWar);
          if (side === HIDDEN || (side === ENEMY) !== enemies) continue;
          const x = v[o + S.x]!;
          const z = v[o + S.z]!;
          if (enemies && !this.showAll && !inSight(this.vision, VISION_STRIDE, x, z)) continue;
          rects.push(x / WU_PER_METRE - dot / 2, z / WU_PER_METRE - dot / 2, dot, dot);
          sides.push(colour(side));
        }
      }
    }
    ctx.fillStyle = MINIMAP_EDGE;
    for (let k = 0; k < rects.length; k += 4) ctx.fillRect(rects[k]! - edge, rects[k + 1]! - edge, rects[k + 2]! + 2 * edge, rects[k + 3]! + 2 * edge);
    for (let k = 0; k < rects.length; k += 4) {
      ctx.fillStyle = sides[k >> 2]!;
      ctx.fillRect(rects[k]!, rects[k + 1]!, rects[k + 2]!, rects[k + 3]!);
    }
    // Every lair (dark red squares; Patch 3: explored land or not) and the goblin villages (ochre rings, red at war) the players have found (Table 15: minimap marks).
    for (const m of this.game?.info?.marks ?? []) {
      let x = m.x / WU_PER_METRE;
      let z = m.z / WU_PER_METRE;
      // Off the part of the land shown (Patch 5 BG-5): pinned to its edge and fainter, so every lair still shows which way it lies.
      const inset = 5 * px;
      const off = shown !== undefined && (x < shown.minX || x > shown.maxX || z < shown.minZ || z > shown.maxZ);
      if (off) {
        x = Math.min(shown.maxX - inset, Math.max(shown.minX + inset, x));
        z = Math.min(shown.maxZ - inset, Math.max(shown.minZ + inset, z));
      }
      ctx.globalAlpha = off ? 0.6 : 1;
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
    ctx.globalAlpha = 1;
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
    this.propModels.dispose();
    this.fogDrift.dispose();
    this.models?.dispose();
  }
}

/** A colour's brightness to the eye, in linear light. */
function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
