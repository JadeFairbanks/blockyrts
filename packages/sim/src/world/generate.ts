// Turning the world layout into land: the columns of a chunk, their water and
// the props standing on them (Terrain, What the land is made of; The world;
// Generated rocks and trees; Water; Table 5; Table 9). Every value is a pure
// function of the seed, the player count and the column's position.

import { COLUMNS_PER_CHUNK, floorDiv, length2d } from '../fixed.ts';
import { CHUNK_SHIFT, ChunkBuilder, NO_WATER, WATER_PER_UNIT, type ChunkColumns } from './chunk.ts';
import { Band, BAND_WANDER_M, caveFoot, EdgeType, Look, metresToColumns, metresToUnits, type Cell, type Edge, type WorldLayout } from './layout.ts';
import { Mat } from './materials.ts';
import { centred, hash2, valueNoise } from './noise.ts';
import { PropKind, PROPS, PropShape } from './props.ts';
import { distanceToPlot, distanceToWater, falloff, ironReach, keepToStretch, ownSideRoom, polar, POCKET_BLEND_COLUMNS, POCKET_FLAT_COLUMNS, START_OUTCROP_FAR_M, START_OUTCROP_NEAR_M, StartBasin, yardStretch, type Pocket } from './start.ts';

/** A generated prop: a resource node, tree or bush on the land. */
export interface PropRecord {
  kind: number;
  /** Column inside the chunk. */
  lx: number;
  lz: number;
  /** Ground height under it, terrain units. */
  y: number;
  /** Hash for the look of this one. */
  variant: number;
  /** Age in steps at step 0 (trees grow from it). */
  age: number;
  /** What it holds. */
  amount: number;
}

export interface GeneratedChunk {
  columns: ChunkColumns;
  props: PropRecord[];
}

/** Low-detail samples of a chunk: one column every `step` columns (far terrain and the minimap). */
export interface LowResChunk {
  step: number;
  size: number;
  top: Int16Array;
  material: Uint8Array;
  /** Water surface in 32nds of a terrain unit, or NO_WATER. */
  water: Int16Array;
}

interface Site {
  id: number;
  x: number;
  z: number;
}

interface PairInfo {
  edge: Edge | null;
  ux: number;
  uz: number;
  mx2: number;
  mz2: number;
  len: number;
}

interface Pond {
  x: number;
  z: number;
  r: number;
  level: number;
  depth: number;
}
interface Stream {
  x: number;
  z: number;
  dx: number;
  dz: number;
  half: number;
  width: number;
  depth: number;
}
export interface Bog {
  x: number;
  z: number;
  r: number;
}
/** A hot spring: its pool's middle, columns, and its water level, terrain units. */
export interface Spring {
  x: number;
  z: number;
  level: number;
}
interface CellFeatures {
  ponds: Pond[];
  streams: Stream[];
  bogs: Bog[];
  /** Jade's Patch 5 (MF-2): where the cell's large mana crystal lies, or null (placeLargeCrystal). */
  crystal: { x: number; z: number } | null;
}
/** WL-6's mini mountain: its peak, columns, its foot's radius, columns, and its height, terrain units. */
export interface Landmark {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/**
 * Stone outcrops in the Heartland's scatter, per 10,000 candidate spots (one
 * spot every 1.8 m of level open ground, after the trees): 4, twice the 2
 * before Patch 4 (Jade: "double the amount of stone outcroppings spawning
 * randomly in heartlands"). Each pocket's own flat ground takes no
 * scatter, and its outcrop is Table 9's (START_OUTCROP_NEAR_M).
 */
export const HEARTLAND_STONE_OUTCROPS_PER_10000 = 4;

/**
 * Trees per 10,000 candidate spots, by cell look: on its open ground and in
 * its thick parts (a meadow's groves, a wood's middle). Jade's Patch 5
 * (WL-1): "Trees grow too thick ... forest areas become impassable ...
 * Reduce the maximum forest density by a lot". Before Patch 5 a wood's middle
 * took 3200 and its edges 700, a meadow's groves 1800 and its grass 300 (s).
 */
export const TREES_PER_10000: ReadonlyArray<readonly [number, number]> = [
  [150, 900],
  [400, 1200],
  [120, 120],
  [50, 50],
  [300, 300],
];
/** The Heartland's trees at this share of those, per mille (WL-1: "This is especially egregious in heartlands") (s). */
export const HEARTLAND_TREES_PM = 800;

/** Nothing natural lies deeper than 6 m below sea level (Jade's Patch 5, WL-2: "hard cap"), terrain units. */
export const NATURAL_FLOOR_UNITS = metresToUnits(6);
/**
 * Below this the land's large-scale lows ease off rather than run down to
 * that floor, terrain units (s): they come no lower than twice this, so a
 * ravine or a river in low land still has its depth before the floor.
 */
export const LOWLAND_KNEE_UNITS = 18;

/**
 * Gentle rolling hills (Jade's Patch 5, WL-3: "gentle rolling hills to some
 * but not all sections of heartlands, barrens and deadlands"): how much of
 * them each band has, in Band order, 1024 for all.
 */
export const HILL_BAND_WEIGHT: readonly number[] = [1024, 0, 0, 1024, 1024];
/**
 * Their height from trough to crest, terrain units (s): 64 (7.2 m) over
 * about 115 m, with a quarter of that again in smaller swells, so they are
 * never steeper than a unit walks.
 */
export const HILL_HEIGHT_UNITS = 64;
/** No hills within 50 m of a start (WL-3), metres; they ease in over HILL_BLEND_M beyond. */
export const HILL_START_CLEAR_M = 50;
/**
 * The ground stays flat round every cell's middle, where the villages, the
 * peoples' camps, the lairs' clearings and the bogs lie (WL-3: "for village
 * and other things like them the gound must be flat there. Bogs for example
 * never on hills"): a quarter of the cell's size and this much more, metres (s).
 */
export const HILL_SITE_CLEAR_M = 20;
export const HILL_BLEND_M = 25;

/** WL-6: a mini mountain this far from the first player's Big House, metres (her 100 to 125 m), its peak 11 to 14 m high (9 m and up) (s). */
export const LANDMARK_DISTANCE_M = 112;
export const LANDMARK_PEAK_MIN_M = 11;
export const LANDMARK_PEAK_MAX_M = 14;
/** Its foot's radius, metres (s). */
export const LANDMARK_RADIUS_M = 22;

/** WL-5: a 3 m boulder in about one chunk in 4.5 ("about one every 4-5 generation chunks"), per mille. */
export const BOULDER_CHUNK_PM = 222;
/** None within this of a main base, metres (WL-5: "None within 40m of a players base"). */
export const BOULDER_BASE_CLEAR_M = 40;

/**
 * WL-10: flax grows only in fields, in about a third of the Heartland's,
 * the Fringe's and the Deepwoods' chunks: those with no trees or few, at
 * most this many (s), never in a bog.
 */
export const FLAX_FIELD_MAX_TREES = 6;
/**
 * The share of those few-trees chunks that grow a field, per mille, by band
 * at the chunk's middle: set so that about a third of all the band's chunks
 * do (s; seeds 1 to 3 out to 460 m: a few-trees chunk is about 56% of the
 * Heartland's and the Fringe's chunks and 80% of the Deepwoods', and four
 * in five of those have open ground for a field).
 */
export const FLAX_CHUNK_PM: readonly number[] = [740, 760, 490, 0, 0];
/** A field's plants, at most FLAX_FIELD_MAX ("Capped Max amount of flax per field"), in a clump of about this radius, metres (s). */
export const FLAX_FIELD_MIN = 8;
export const FLAX_FIELD_MAX = 16;
export const FLAX_FIELD_RADIUS_M = 5;
/** One plant in this many is the tall flax, twice the height and twice the flax (s). */
export const FLAX_TALL_ONE_IN = 6;

/**
 * GP-30: a chunk's edible mushrooms, 0 to 10 by its trees, one for every
 * MUSHROOM_TREES living trees there (s), each by a tree; none without
 * trees, none in the Barrens or the Deadlands.
 */
export const MUSHROOMS_MAX = 10;
export const MUSHROOM_TREES = 3;

/**
 * WL-11: a hot spring in 20% of the Barrens' and the Deadlands' chunks
 * ("20% chance of being one in a generation chunk"). This share of their
 * chunks tries for one, per mille: about one try in four finds no dry,
 * level ground for its pool among SPRING_TRIES spots in the chunk (the
 * Barrens' terraces, mesas and cliffs), so about 20% of them hold one (s;
 * seeds 1 and 2, out to 1150 m).
 */
export const HOT_SPRING_CHUNK_PM = 270;

/**
 * WL-4: on a mountain's lower slopes, per 10,000 candidate spots (s):
 * silver nodes very rarely, gold nodes very very rarely.
 */
export const MOUNTAIN_SILVER_PER_10000 = 6;
export const MOUNTAIN_GOLD_PER_10000 = 2;

/**
 * WL-9: an iron rock's iron rock on average by band, in Band order: the
 * Fringe's halved (and half as many), the Deepwoods' 20% less again, the
 * Barrens' and the Deadlands' the Fringe's before Patch 5. Each rock holds
 * 75% to 125% of its band's.
 */
export const IRON_ROCK_AVERAGE: readonly number[] = [0, 40, 32, 80, 80];
/** WL-9: the Deepwoods' iron rocks come at this share of the Fringe's count, per mille (20% fewer again). */
export const DEEPWOODS_IRON_ROCK_PM = 800;

/**
 * Resource nodes per 10,000 candidate spots, by band (Table 5's band
 * column), after the trees. Jade's Patch 5: coal rocks (WL-7), iron rock
 * (WL-9: the Fringe's halved, the Deepwoods' 20% fewer again, the Barrens'
 * and the Deadlands' as the Fringe's was), no flax but in its fields
 * (WL-10), marble that does spawn in the Fringe and the Deepwoods (GP-12),
 * and the berry bushes, fairly rare (GP-32) (s).
 */
export const NODES_PER_10000: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [PropKind.Hazel, 40], [PropKind.Herbs, 12], [PropKind.LooseStone, 10], [PropKind.FlintScatter, 8], [PropKind.StoneOutcrop, HEARTLAND_STONE_OUTCROPS_PER_10000],
    [PropKind.CopperOutcrop, 2], [PropKind.TinOutcrop, 1], [PropKind.BlackBerryBush, 3], [PropKind.RaspberryBush, 2],
  ],
  [
    [PropKind.StoneOutcrop, 10], [PropKind.CoalRock, 3], [PropKind.IronRock, 2], [PropKind.Herbs, 6], [PropKind.MarbleRock, 2],
    [PropKind.BlackBerryBush, 3], [PropKind.RaspberryBush, 2], [PropKind.BlueberryBush, 2],
  ],
  [
    [PropKind.StoneOutcrop, 8], [PropKind.MarbleRock, 4], [PropKind.LeadOre, 2], [PropKind.Herbs, 1], [PropKind.CoalRock, 2], [PropKind.IronRock, 2],
    [PropKind.BlackBerryBush, 2], [PropKind.BlueberryBush, 2],
  ],
  [[PropKind.StoneOutcrop, 8], [PropKind.MarbleRock, 4], [PropKind.LeadOre, 2], [PropKind.SurfaceGold, 2], [PropKind.SurfaceGem, 1], [PropKind.CoalRock, 2], [PropKind.IronRock, 4]],
  [[PropKind.MarbleRock, 4], [PropKind.SurfaceGold, 2], [PropKind.SurfaceGem, 2], [PropKind.ManaCrystal, 2], [PropKind.IronRock, 4]],
];
// Per-column flags kept while a chunk is generated, used to place props.
const F_WATER = 1;
const F_STONE = 2;
const F_BANK = 4;
const F_CLAY = 8;
const F_SALTPETRE = 16;
const F_MARSH = 32;
const F_FLAT = 64;
const F_BARRIER = 128;
/** A mountain's lower slopes (WL-4's silver and gold nodes). */
const F_MOUNTAIN = 256;

/** Everything one column's generation works out. Reused between columns. */
class Profile {
  ground = 0;
  smooth = 0;
  base = 0;
  water = NO_WATER;
  source = 0;
  surface: number = Mat.Grass;
  soil = 0;
  flags = 0;
  slab0 = 0;
  slab1 = 0;
  cave0 = 0;
  cave1 = 0;
  seam = 0;
  cell: Cell | null = null;
  /** The column's band and its cell's look in it (WL-8: the band follows the distance from the bases). */
  band: number = Band.Heartland;
  look: number = Look.Meadow;
  volcanic = false;
  bandF = 0;
  // Barrier effects while combining edges.
  raise = 0;
  carve = 0;
  riverBottom = 0;
  riverLevel = 0;
  river = false;
  marsh = false;
  marshWater = false;
  stone = false;
  ridgeCore = false;
}

/** Terraced hillsides per band, out of 1024 of the land (Barrens out only since Patch 5, WL-3). */
const TERRACE_AMOUNT: readonly number[] = [0, 0, 0, 700, 900];
/** Mesas per band, out of 65536 of the land (Barrens out only since Patch 5, WL-3; the Deepwoods had 6500). */
const MESA_AMOUNT: readonly number[] = [0, 0, 0, 12000, 16000];

/** The land of a chunk being generated, column by column, for placing its props. */
interface ChunkLand {
  top: Int16Array;
  flags: Uint16Array;
  surface: Uint8Array;
  bands: Uint8Array;
  looks: Uint8Array;
  cellOf: Cell[];
  /** Columns with a prop on them, or under a boulder. */
  taken: Uint8Array;
}
type AddProp = (kind: number, lx: number, lz: number, amount: number, age: number, variant: number) => void;

/** What a node holds as generated: its yield, or from its yield to its most by its variant (PropInfo.yieldMax). */
export function amountOf(kind: number, variant: number): number {
  const info = PROPS[kind]!;
  return info.yieldMax > info.yield ? info.yield + ((variant >>> 6) % (info.yieldMax - info.yield + 1)) : info.yield;
}

/** How far a column's ground rises or falls to its four neighbours inside the chunk, terrain units. */
function roughAt(top: Int16Array, lx: number, lz: number): number {
  const i = lz * N + lx;
  const y = top[i]!;
  let rough = 0;
  if (lx > 0) rough = Math.max(rough, Math.abs(top[i - 1]! - y));
  if (lx < N - 1) rough = Math.max(rough, Math.abs(top[i + 1]! - y));
  if (lz > 0) rough = Math.max(rough, Math.abs(top[i - N]! - y));
  if (lz < N - 1) rough = Math.max(rough, Math.abs(top[i + N]! - y));
  return rough;
}

/** Linear interpolation between band values by a band fraction (1024 per band). */
function lerpBand(table: readonly number[], bandF: number): number {
  const i = bandF >> 10;
  const f = bandF & 1023;
  const a = table[Math.min(i, 4)]!;
  const b = table[Math.min(i + 1, 4)]!;
  return a + (((b - a) * f) >> 10);
}

function smooth10(t: number): number {
  return (t * t * (3072 - 2 * t)) >> 20;
}

/** 1024 at x <= flat, easing to 0 at x = 1024 (x in 1/1024 of the half width). */
function shoulder(x: number, flat: number): number {
  if (x <= flat) return 1024;
  if (x >= 1024) return 0;
  return smooth10(1024 - floorDiv((x - flat) * 1024, 1024 - flat));
}

const N = COLUMNS_PER_CHUNK;
/** How far a yard's props keep off every Big House plot, and off every pocket's water and bog (s). */
const YARD_PLOT_CLEAR = metresToColumns(7);
const YARD_WATER_CLEAR = metresToColumns(2);
/** Fit land for the start pockets (landFit, s): within 12 terrain units (1.35 m) of sea level, and level to 3 units. */
const FIT_HEIGHT = 12;
const FIT_ROUGH = 3;
const FIT_SIDES: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Where a walk out from a Big House starts, columns from its middle: the edge of its plot (landWalk). */
const YARD_WALK_FROM = 8;
/** How wide the land's large-scale amplitudes blend from one band to the next, metres (s: the bands are 150 to 180 m wide since Patch 5). */
export const BAND_BLEND_M = 40;
/** A hot spring's middle keeps this far inside its chunk, columns, so its pool, rim and slope (SPRING_REACH) stay in it. */
const SPRING_MARGIN = 11;
/** Spots a spring's chunk tries for its pool (dry, level, clear of cliffs, mesas and ponds) before it goes without (s). */
const SPRING_TRIES = 24;
/** A spring's pool reaches 5 columns from its middle, its stone rim 8 and the slope of its rim down to the land this far (s). */
const SPRING_REACH = 10;
/** Where a spring's land is probed, columns from its middle, and how far it may rise and fall there, terrain units (s): its rim's slope meets the land a step from the lowest of it. */
const SPRING_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [10, 0],
  [-10, 0],
  [0, 10],
  [0, -10],
  [7, 7],
  [-7, 7],
  [7, -7],
  [-7, -7],
];
const SPRING_LEVEL_SPREAD = 8;
/** Half a boulder's footprint, columns: 3 m across. */
const BOULDER_HALF = 3;
/** A mountain's pass blends into its flanks over this, columns (s; a ridge's over 10). */
const MOUNTAIN_GAP_BLEND = 24;
/** A guarded bog's bog iron (MB-11: "doubled amounts of bog iron"): Table 9's 40, twice over. Every bog has a guardian. */
const GUARDED_BOG_IRON = 80;
/** A pocket bog's radius, columns: its 7 m before the noise on its edge (bogsNear). */
const POCKET_BOG_R = metresToColumns(7);
/** How many silver nuggets lie on a guarded bog's ground (MB-11, s). */
const BOG_NUGGETS_MIN = 3;
const BOG_NUGGETS_MAX = 6;
/** How far a cell's large mana crystal may lie from its site, columns: a quarter of at most 120 m (cellFeatures), and a step. */
const CRYSTAL_SPREAD = metresToColumns(30) + 2;
/** Where a large mana crystal tries to stand, columns from its spot, nearest first (placeLargeCrystal). */
const CRYSTAL_TRIES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
  [2, 2], [-2, 2], [2, -2], [-2, -2], [4, 0], [-4, 0], [0, 4], [0, -4],
];
/** A large mana crystal's yield (MF-4: "large mana crystal nodes with 40 mana crystals each"). */
const LARGE_CRYSTAL_AMOUNT = 40;
/** How far a large mana crystal keeps off its cell's ponds and bog and off the pockets, columns (s: 3.6 m). */
const CRYSTAL_CLEAR = 8;
/** MF-2: "In deadlands they appear at a 5% chance in every cell", per 100,000. */
const DEADLANDS_CRYSTAL_ODDS = 5000;
/** MF-2: "about 3 per band in all bands except Deadlands". */
const FAE_PER_BAND = 3;

/** The three sites nearest a point, nearest first (ties to the lowest id). */
function nearest3(x: number, z: number, cands: readonly Site[]): [Site, number, Site, number, Site, number] {
  let a: Site = cands[0]!;
  let b: Site = cands[0]!;
  let c: Site = cands[0]!;
  let da = Infinity;
  let db = Infinity;
  let dc = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const site = cands[i]!;
    const ex = site.x - x;
    const ez = site.z - z;
    const d = ex * ex + ez * ez;
    if (d < da || (d === da && site.id < a.id)) {
      c = b; dc = db;
      b = a; db = da;
      a = site; da = d;
    } else if (d < db || (d === db && site.id < b.id)) {
      c = b; dc = db;
      b = site; db = d;
    } else if (d < dc || (d === dc && site.id < c.id)) {
      c = site; dc = d;
    }
  }
  return [a, da, b, db, c, dc];
}

export class WorldGen {
  readonly layout: WorldLayout;
  readonly start: StartBasin;
  readonly seed: number;
  private readonly pairs = new Map<number, PairInfo>();
  private readonly features = new Map<number, CellFeatures>();
  private readonly pocketPropCache = new Map<number, Array<{ x: number; z: number; kind: number; amount: number }>>();
  /** Cell sites near each chunk the start pockets' land was probed in. */
  private readonly probeCands = new Map<number, Site[]>();
  private readonly bandBlend = metresToColumns(BAND_BLEND_M);
  /** The band borders' wander, trough to crest, columns (BAND_WANDER_M either way). */
  private readonly wanderSpan = metresToColumns(BAND_WANDER_M) * 2;
  /** WL-6's mini mountain within 100 to 125 m of the first player's start. */
  readonly landmark: Landmark;
  private readonly springs = new Map<number, Spring | null>();
  /** How many cells each band from the Heartland to the Barrens has (crystalOdds), and how far a bog strays from its cell's site (bogSpread). */
  private readonly bandCells: number[] = [];
  private spread = 0;
  private readonly p = new Profile();
  private readonly s: number[];

  constructor(layout: WorldLayout) {
    this.layout = layout;
    this.start = new StartBasin(layout);
    this.seed = layout.seed;
    // Independent noise seeds.
    this.s = [];
    for (let i = 0; i < 40; i++) this.s.push(hash2(this.seed, 0x6e6f6973, i));
    this.landmark = this.placeLandmark();
    // The pockets' water and iron go on fit land, judged on the land as generated (mini patch).
    this.start.settle(this);
  }

  /**
   * WL-6 ("guarantee at least one 9m+ tall cliff face/mini mountain within
   * 100-125m of one of the players spawn location"): a mini mountain whose
   * peak stands 112 m from the first player's Big House, out on its own side,
   * on the first of 32 bearings that keeps it clear of every other pocket, the
   * villages and the barrier edges (s).
   */
  private placeLandmark(): Landmark {
    const pk = this.start.pockets[0]!;
    const h = (k: number): number => hash2(this.seed, 0x6c6d6b, k);
    const radius = metresToColumns(LANDMARK_RADIUS_M);
    const height = metresToUnits(LANDMARK_PEAK_MIN_M + (h(0) % (LANDMARK_PEAK_MAX_M - LANDMARK_PEAK_MIN_M + 1)));
    const d = metresToColumns(LANDMARK_DISTANCE_M);
    let first: Landmark | null = null;
    for (let t = 0; t < 32; t++) {
      const swing = ((t + 1) >> 1) * (t & 1 ? 2048 : -2048);
      const c = polar(pk.x, pk.z, (pk.outward + swing + (h(1) & 0x7ff) - 1024) & 0xffff, d);
      const lm = { x: c.x, z: c.z, radius, height };
      first ??= lm;
      const clear = radius + metresToColumns(30);
      if (this.start.pockets.some((p) => length2d(p.x - lm.x, p.z - lm.z) < clear + POCKET_FLAT_COLUMNS)) continue;
      if (this.start.villages.some((v) => length2d(v.x - lm.x, v.z - lm.z) < clear + v.radius)) continue;
      if (this.clearOfBarriers(lm.x, lm.z, radius + metresToColumns(10))) return lm;
    }
    return first!;
  }

  /**
   * Whether no barrier edge (anything but low hills) comes within `margin`
   * columns of a point, allowing for the wander the edges take (profile).
   */
  private clearOfBarriers(x: number, z: number, margin: number): boolean {
    const [a, da, b, db, c, dc] = nearest3(x, z, this.layout.sitesNear(x, z, metresToColumns(200)));
    const wander = Math.max(40, Math.min(160, floorDiv(length2d(x, z), 30)));
    for (const [v, dv] of [[b, db], [c, dc]] as const) {
      if (v.id === a.id || !this.layout.adjacent(a.id, v.id)) continue;
      const e = this.layout.edge(a.id, v.id);
      if (e.type === EdgeType.Nothing || e.type === EdgeType.LowHills) continue;
      const len = Math.max(1, length2d(v.x - a.x, v.z - a.z));
      const reach = e.type === EdgeType.Cliff ? e.fade : e.type === EdgeType.River ? e.half + floorDiv(e.half, 3) + 2 : e.half;
      if (floorDiv(dv - da, 2 * len) < reach + margin + wander) return false;
    }
    return true;
  }

  /** The distance from the nearest main base the bands are measured by at a column, with the borders' wander (WL-8), columns. */
  private bandDistance(raw: number, x: number, z: number): number {
    return raw + centred(valueNoise(this.s[32]!, x, z, 7), this.wanderSpan);
  }

  /** A column's band (WL-8: by its distance from the nearest main base, the border wandering a little). */
  columnBand(x: number, z: number): Band {
    return this.layout.bandAtDistance(this.bandDistance(this.layout.startDistance(x, z), x, z));
  }

  /**
   * The hot spring a chunk holds, or null (Jade's Patch 5, WL-11: "hot
   * springs/sulfur more common, 20% chance of being one in a generation
   * chunk", in the Barrens and the Deadlands). Well inside the chunk, on
   * the first of its tries where the land under the pool and its rim is
   * dry and level (no cliff, ridge, mesa's edge, terrace step or pond
   * there) and no village stands.
   */
  chunkSpring(cx: number, cz: number): Spring | null {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    const known = this.springs.get(key);
    if (known !== undefined) return known;
    let spring: Spring | null = null;
    // While its spots are tried the chunk holds none, so the land probed there is the land without one.
    this.springs.set(key, null);
    const h = hash2(this.seed ^ 0x73707267, cx, cz);
    if (h % 1000 < HOT_SPRING_CHUNK_PM) {
      const span = N - 2 * SPRING_MARGIN;
      for (let k = 0; k < SPRING_TRIES && !spring; k++) {
        const hk = hash2(h, 0x73707267, k);
        const x = cx * N + SPRING_MARGIN + (hk % span);
        const z = cz * N + SPRING_MARGIN + ((hk >>> 16) % span);
        if (this.columnBand(x, z) < Band.Barrens || this.start.flatness(x, z) > 0) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (const [ox, oz] of SPRING_PROBES) {
          const g = this.probeGround(x + ox, z + oz);
          if (g === null) {
            hi = Infinity;
            break;
          }
          lo = Math.min(lo, g);
          hi = Math.max(hi, g);
        }
        if (hi - lo > SPRING_LEVEL_SPREAD) continue;
        spring = { x, z, level: hi + 1 };
      }
    }
    this.springs.set(key, spring);
    return spring;
  }

  /** The land's height at a column as generated, terrain units, or null where it lies under water. */
  private probeGround(x: number, z: number): number | null {
    const cx = floorDiv(x, N);
    const cz = floorDiv(z, N);
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let cands = this.probeCands.get(key);
    if (!cands) {
      cands = this.chunkCandidates(cx, cz);
      this.probeCands.set(key, cands);
    }
    const p = this.profile(x, z, cands);
    return p.flags & F_WATER ? null : p.ground;
  }

  /**
   * How far the land falls short of fit for a start pocket's water, iron or
   * prop at the points given (x0, z0, x1, z1, ...), 0 where it is fit: dry,
   * within 1.35 m of sea level, and level to within 3 terrain units of the
   * land `step` columns away on each side (s). A pocket on a ridge's flank or
   * a ravine's lip falls short, so its workers can always walk to what
   * Table 9 gives them; the shortfall is the terrain units past those limits,
   * and 64 for each wet column.
   */
  landMisfit(points: readonly number[], step: number): number {
    let miss = 0;
    for (let i = 0; i + 1 < points.length; i += 2) {
      const x = points[i]!;
      const z = points[i + 1]!;
      const g = this.probeGround(x, z);
      if (g === null) {
        miss += 64;
        continue;
      }
      miss += Math.max(0, Math.abs(g) - FIT_HEIGHT);
      for (const [dx, dz] of FIT_SIDES) {
        const n = this.probeGround(x + dx * step, z + dz * step);
        miss += n === null ? 64 : Math.max(0, Math.abs(n - g) - FIT_ROUGH);
      }
    }
    return miss;
  }

  /** Whether the land is fit at every point given (landMisfit is 0). */
  landFit(points: readonly number[], step: number): boolean {
    return this.landMisfit(points, step) === 0;
  }

  /**
   * Whether the land lets a worker walk straight from a pocket's Big House at
   * (x0, z0) out to (x1, z1): dry, and no rise or drop of more than 3 terrain
   * units from one column to the next along the way, from the edge of its
   * plot (s). Fit land at the far end can still sit in a pit or on a shelf
   * past a ravine's lip; this keeps Table 9's props where the workers reach.
   */
  landWalk(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const n = Math.max(Math.abs(dx), Math.abs(dz));
    let last: number | null = null;
    for (let i = Math.min(n, YARD_WALK_FROM); i <= n; i++) {
      const g = this.probeGround(x0 + floorDiv(dx * i, n), z0 + floorDiv(dz * i, n));
      if (g === null || (last !== null && Math.abs(g - last) > FIT_ROUGH)) return false;
      last = g;
    }
    return true;
  }

  /** Continuous band index (1024 per band) at a column, for amplitudes that must not seam (WL-8: by the distance from the nearest main base). */
  bandFrac(x: number, z: number): number {
    return this.bandFracAt(this.bandDistance(this.layout.startDistance(x, z), x, z));
  }

  /** Continuous band index (1024 per band) at a band distance (bandDistance). */
  private bandFracAt(d: number): number {
    let f = 0;
    const half = this.bandBlend >> 1;
    for (const edge of this.layout.bandStarts) {
      const v = floorDiv((d - (edge - half)) * 1024, this.bandBlend);
      f += Math.max(0, Math.min(1024, v));
    }
    return f;
  }

  /** Whether a mesa stands at a column (from the Barrens out since Patch 5, WL-3). */
  private mesaAt(x: number, z: number, bandF: number): boolean {
    const mesaAmt = lerpBand(MESA_AMOUNT, bandF);
    return mesaAmt > 0 && valueNoise(this.s[9]!, x, z, 7) > 65536 - mesaAmt;
  }

  /**
   * Gentle rolling hills (Jade's Patch 5, WL-3), terrain units: in some of
   * the Heartland, the Barrens and the Deadlands, never steeper than a unit
   * walks; none within 50 m of a start, and flat round the middle of each of
   * the three nearest cells (a, b, c), where villages, camps and bogs lie.
   * `raw` is the column's distance from the nearest main base.
   */
  private hills(x: number, z: number, raw: number, bandF: number, a: Site, b: Site, c: Site): number {
    let w = lerpBand(HILL_BAND_WEIGHT, bandF);
    if (w === 0) return 0;
    const s = this.s;
    // Some sections, not all.
    const m = valueNoise(s[33]!, x, z, 9);
    w = (w * smooth10(Math.max(0, Math.min(1024, floorDiv((m - 30000) * 1024, 12288))))) >> 10;
    if (w === 0) return 0;
    const blend = metresToColumns(HILL_BLEND_M);
    w = (w * (1024 - falloff(raw, metresToColumns(HILL_START_CLEAR_M), blend))) >> 10;
    for (const site of [a, b, c]) {
      if (w === 0) return 0;
      const clear = (this.layout.ringSize(floorDiv(site.id, 65536)) >> 2) + metresToColumns(HILL_SITE_CLEAR_M);
      const dx = Math.abs(x - site.x);
      const dz = Math.abs(z - site.z);
      if (dx >= clear + blend || dz >= clear + blend) continue;
      w = (w * (1024 - falloff(length2d(dx, dz), clear, blend))) >> 10;
    }
    if (w === 0) return 0;
    const n = centred(valueNoise(s[34]!, x, z, 8), HILL_HEIGHT_UNITS) + centred(valueNoise(s[35]!, x, z, 6), HILL_HEIGHT_UNITS >> 2);
    return (n * w) >> 10;
  }

  private pair(u: Site, v: Site): PairInfo {
    const key = u.id * 16777216 + v.id;
    let info = this.pairs.get(key);
    if (!info) {
      const ux = v.x - u.x;
      const uz = v.z - u.z;
      info = {
        edge: this.layout.adjacent(u.id, v.id) ? this.layout.edge(u.id, v.id) : null,
        ux,
        uz,
        mx2: u.x + v.x,
        mz2: u.z + v.z,
        len: Math.max(1, length2d(ux, uz)),
      };
      if (info.edge && info.edge.type === EdgeType.Nothing) info.edge = null;
      this.pairs.set(key, info);
    }
    return info;
  }

  /** Ponds, streams, bogs and springs inside a cell, placed well inside it. Unwarped coordinates. */
  cellFeatures(cell: Cell): CellFeatures {
    let f = this.features.get(cell.id);
    if (f) return f;
    f = { ponds: [], streams: [], bogs: [], crystal: null };
    const h = (k: number): number => hash2(this.seed, 0x66656174 + cell.id, k);
    const at = (k: number, frac: number): { x: number; z: number } =>
      polar(cell.x, cell.z, h(k) & 0xffff, floorDiv(cell.size * ((h(k) >>> 16) % frac), 1000));
    const lm = this.landmark;
    const clearOfPockets = (x: number, z: number, r: number): boolean =>
      this.start.pockets.every((p) => length2d(p.x - x, p.z - z) > POCKET_FLAT_COLUMNS + POCKET_BLEND_COLUMNS + r) &&
      this.start.villages.every((v) => length2d(v.x - x, v.z - z) > v.radius + POCKET_BLEND_COLUMNS + r) &&
      length2d(lm.x - x, lm.z - z) > lm.radius + 6 + r;
    const band = cell.band;
    const pondOdds = [400, 600, 700, 150, 0][band]!;
    const ponds = (h(1) % 1000 < pondOdds ? 1 : 0) + (h(2) % 1000 < floorDiv(pondOdds, 3) ? 1 : 0);
    for (let i = 0; i < ponds; i++) {
      const c = at(10 + i, 280);
      const r = metresToColumns(4 + (h(20 + i) % 6));
      if (!clearOfPockets(c.x, c.z, r)) continue;
      f.ponds.push({ x: c.x, z: c.z, r, level: this.smoothHeight(c.x, c.z) - 2, depth: metresToUnits(1) + (h(30 + i) % 8) });
    }
    const streamOdds = [500, 500, 200, 0, 0][band]!;
    if (h(3) % 1000 < streamOdds) {
      const c = at(40, 150);
      const a = h(41) & 0xffff;
      const half = floorDiv(cell.size * 3, 10);
      const end1 = polar(c.x, c.z, a, half);
      const end2 = polar(c.x, c.z, a + 32768, half);
      if (clearOfPockets(c.x, c.z, half)) {
        f.streams.push({
          x: c.x,
          z: c.z,
          dx: end1.x - end2.x,
          dz: end1.z - end2.z,
          half,
          width: metresToColumns(1) + (h(42) % 3),
          depth: 5 + (h(43) % 3),
        });
      }
    }
    const bogOdds = [500, 200, 0, 0, 0][band]!;
    if (h(4) % 1000 < bogOdds) {
      // On low ground (Jade's Patch 5, WL-3: "Bogs for example never on hills or high ground"): the lowest of six
      // spots near the cell's middle, where the land keeps flat of hills (HILL_SITE_CLEAR_M).
      let c = at(50, 250);
      let low = this.smoothHeight(c.x, c.z);
      for (let k = 1; k < 6; k++) {
        const o = at(150 + k, 250);
        const y = this.smoothHeight(o.x, o.z);
        if (y < low) {
          low = y;
          c = o;
        }
      }
      const r = metresToColumns(6 + (h(51) % 4));
      if (clearOfPockets(c.x, c.z, r)) f.bogs.push({ x: c.x, z: c.z, r });
    }
    // Jade's Patch 5 (MF-2): a large mana crystal, about 3 to a band but the Deadlands, where one cell in 20 has one; within 30 m of
    // the cell's site (s), clear of its water and bog and of the pockets and villages.
    if (h(5) % 100000 < this.crystalOdds(band)) {
      const c = polar(cell.x, cell.z, h(60) & 0xffff, floorDiv(Math.min(cell.size, metresToColumns(120)) * ((h(60) >>> 16) % 250), 1000));
      const clear = (x: number, z: number, r: number): boolean => length2d(x - c.x, z - c.z) > r + CRYSTAL_CLEAR;
      if (clearOfPockets(c.x, c.z, CRYSTAL_CLEAR) && f.ponds.every((o) => clear(o.x, o.z, o.r)) && f.bogs.every((o) => clear(o.x, o.z, o.r))) f.crystal = c;
    }
    this.features.set(cell.id, f);
    return f;
  }

  /**
   * A cell's chance of a large mana crystal, per 100,000 (MF-2): 3 over
   * the band's cells for the Heartland to the Barrens, 5% in the Deadlands.
   */
  private crystalOdds(band: Band): number {
    if (band === Band.Deadlands) return DEADLANDS_CRYSTAL_ODDS;
    if (this.bandCells.length === 0) {
      const count = [0, 0, 0, 0, 0];
      count[0] = this.layout.basinIds().length;
      for (let r = 1; r < this.layout.ringCount; r++) count[this.layout.bandOfRing(r)]! += this.layout.ringCellCount(r);
      for (let b = 0; b < 4; b++) this.bandCells.push(count[b]!);
    }
    return floorDiv(FAE_PER_BAND * 100000, Math.max(FAE_PER_BAND, this.bandCells[band]!));
  }

  /**
   * The large-scale height of the land before hills, barriers and detail,
   * terrain units. Its lows ease off below LOWLAND_KNEE_UNITS, never reaching
   * twice that, so nothing natural comes near the 6 m floor but ravines and
   * rivers (WL-2).
   */
  smoothHeight(x: number, z: number, bandF = this.bandFrac(x, z)): number {
    const s = this.s;
    const drift = centred(valueNoise(s[0]!, x, z, 11), lerpBand([0, 40, 100, 150, 200], bandF));
    const low = centred(valueNoise(s[1]!, x, z, 9), lerpBand([10, 40, 80, 110, 140], bandF));
    const mid = centred(valueNoise(s[2]!, x, z, 6), lerpBand([4, 16, 30, 40, 50], bandF));
    const y = drift + low + mid;
    if (y >= -LOWLAND_KNEE_UNITS) return y;
    const e = -LOWLAND_KNEE_UNITS - y;
    return -LOWLAND_KNEE_UNITS - floorDiv(LOWLAND_KNEE_UNITS * e, e + LOWLAND_KNEE_UNITS);
  }

  /** The pocket and village props of Table 9, in global columns. */
  pocketProps(pocket: Pocket): Array<{ x: number; z: number; kind: number; amount: number }> {
    const cached = this.pocketPropCache.get(pocket.player);
    if (cached) return cached;
    if (pocket.yard > 0) {
      // Yards are filled together, in player order, so each keeps clear of the others whichever chunk asks first.
      this.yardProps();
      return this.pocketPropCache.get(pocket.player)!;
    }
    const out: Array<{ x: number; z: number; kind: number; amount: number }> = [];
    const h = (a: number, b: number): number => hash2(this.seed, 0x7070 + pocket.player * 977 + a, b);
    const spacing = (x: number, z: number, min: number): boolean => out.every((o) => length2d(o.x - x, o.z - z) >= min);
    const place = (n: number, kind: number, amounts: readonly number[], bearing: number, spread: number, d0: number, d1: number, min: number): void => {
      for (let i = 0; i < n; i++) {
        for (let attempt = 0; attempt < 24; attempt++) {
          const r = h(kind * 64 + i, attempt);
          const a = (pocket.outward + bearing + floorDiv(((r & 0xffff) - 32768) * spread, 32768)) & 0xffff;
          const d = metresToColumns(d0) + ((r >>> 16) % Math.max(1, metresToColumns(d1 - d0)));
          const c = polar(pocket.x, pocket.z, a, d);
          if (attempt < 23 && (!spacing(c.x, c.z, min) || !this.landFit([c.x, c.z], 1) || !this.landWalk(pocket.x, pocket.z, c.x, c.z))) continue;
          out.push({ x: c.x, z: c.z, kind, amount: amounts[Math.min(i, amounts.length - 1)]! });
          break;
        }
      }
    };
    const softwood = [PropKind.Pine, PropKind.Spruce, PropKind.SmallSoftwood];
    // A stand of 24 softwood trees, 20 to 40 m from the Big House (480 lumber).
    for (let i = 0; i < 24; i++) place(1, softwood[h(900, i) % 3]!, [20], 0, 4500, 20, 40, 5);
    place(8, PropKind.Hazel, [10], 12000, 3500, 14, 26, 4);
    place(2, PropKind.CopperOutcrop, [60], -11000, 2500, 22, 34, 6);
    place(1, PropKind.TinOutcrop, [30], -11000, 2500, 22, 34, 6);
    place(2, PropKind.LooseStone, [40, 20], -18000, 2500, 18, 30, 5);
    // The outcrop on the stone's side but by the Big House, in its sight from the start (Jade's Patch 4).
    place(1, PropKind.StoneOutcrop, [200], -18000, 2500, START_OUTCROP_NEAR_M, START_OUTCROP_FAR_M, 6);
    place(2, PropKind.FlintScatter, [20], 32768, 6000, 12, 24, 4);
    place(2, PropKind.Herbs, [10], 32768, 6000, 12, 24, 4);
    place(2, PropKind.WildFlax, [10], 32768, 6000, 12, 24, 4);
    // Iron: a bog with 80 bog iron (40 before Jade's Patch 5, MB-11: doubled in every bog with a guardian), or an iron rock of 60.
    out.push({ x: pocket.iron.x, z: pocket.iron.z, kind: pocket.bog ? PropKind.BogIron : PropKind.IronRock, amount: pocket.bog ? GUARDED_BOG_IRON : 60 });
    this.pocketPropCache.set(pocket.player, out);
    return out;
  }

  /**
   * Table 9's set for every pocket with a yard (a game for two or more, Jade's
   * mini patch): the same props as a pocket of one, laid out in the yard on
   * the side away from the other bases, the softwood stand in its middle,
   * hazel, ores and stone to the sides and the small finds near the Big
   * House (s). Each prop keeps 7 m off every Big House, off every pocket's
   * water and bog, and its spacing from every prop already placed, the other
   * pockets' too, nearer its own Big House than any other on its side of a
   * line (ownSideRoom), on fit land its workers can walk straight out to; a prop
   * with no such spot in 32 tries takes the try with the most room on such
   * land, else the one with the most room.
   */
  private yardProps(): void {
    const all: Array<{ x: number; z: number; min: number }> = [];
    const pockets = this.start.pockets;
    // The least room left by any of them, so a try short of one is never taken over a spot on top of another prop.
    const room = (own: Pocket, x: number, z: number, min: number): number => {
      let r = ownSideRoom(x, z, own.x, own.z, own.outward, pockets);
      for (const pk of pockets) {
        r = Math.min(r, distanceToPlot(x, z, pk.x, pk.z) - YARD_PLOT_CLEAR);
        r = Math.min(r, distanceToWater(pk.water, x, z) - YARD_WATER_CLEAR);
        r = Math.min(r, length2d(x - pk.iron.x, z - pk.iron.z) - ironReach(pk) - YARD_WATER_CLEAR);
      }
      for (const o of all) {
        const need = Math.max(min, o.min);
        const dx = Math.abs(o.x - x);
        const dz = Math.abs(o.z - z);
        if (dx >= need + r || dz >= need + r) continue;
        r = Math.min(r, length2d(dx, dz) - need);
      }
      return r;
    };
    for (const pocket of pockets) {
      const out: Array<{ x: number; z: number; kind: number; amount: number }> = [];
      const h = (a: number, b: number): number => hash2(this.seed, 0x7070 + pocket.player * 977 + a, b);
      const stretch = yardStretch(pocket, pockets);
      // f and spread in 1/1024 of the yard's half angle either side of its middle.
      const place = (n: number, kind: number, amounts: readonly number[], f: number, spread: number, d0: number, d1: number, min: number): void => {
        const minC = metresToColumns(min);
        for (let i = 0; i < n; i++) {
          let best: { x: number; z: number } | null = null;
          let bestRoom = -Infinity;
          for (let attempt = 0; attempt < 32; attempt++) {
            const r = h(kind * 64 + i, attempt);
            const rel = floorDiv((f + floorDiv(((r & 0xffff) - 32768) * spread, 32768)) * pocket.yard, 1024);
            const d = metresToColumns(d0) + ((r >>> 16) % Math.max(1, metresToColumns(d1 - d0)));
            // In a line, within its own stretch of its side.
            const out = polar(pocket.x, pocket.z, (pocket.outward + rel) & 0xffff, d);
            const c = keepToStretch(out.x, out.z, pocket, stretch);
            // Fit land a worker can walk out to outranks room, as for the pockets' water and iron.
            let left = room(pocket, c.x, c.z, minC);
            if (left <= bestRoom) continue;
            if (!this.landFit([c.x, c.z], 1) || !this.landWalk(pocket.x, pocket.z, c.x, c.z)) left -= 1_000_000;
            if (left > bestRoom) {
              bestRoom = left;
              best = c;
            }
            if (left >= 0) break;
          }
          out.push({ x: best!.x, z: best!.z, kind, amount: amounts[Math.min(i, amounts.length - 1)]! });
          all.push({ x: best!.x, z: best!.z, min: minC });
        }
      };
      const softwood = [PropKind.Pine, PropKind.Spruce, PropKind.SmallSoftwood];
      // The stand first, out along the yard's middle 20 to 40 m from the Big House (480 lumber).
      for (let i = 0; i < 24; i++) place(1, softwood[h(900, i) % 3]!, [20], 0, 700, 20, 40, 5);
      place(8, PropKind.Hazel, [10], 600, 420, 12, 24, 4);
      // The outcrop on the stone's side but by the Big House, in its sight from the start (Jade's Patch 4), before
      // the small finds that share that side with it, so they make room for it.
      place(1, PropKind.StoneOutcrop, [200], -820, 200, START_OUTCROP_NEAR_M, START_OUTCROP_FAR_M, 6);
      place(2, PropKind.FlintScatter, [20], -600, 420, 12, 24, 4);
      place(2, PropKind.Herbs, [10], -600, 420, 12, 24, 4);
      place(2, PropKind.WildFlax, [10], -600, 420, 12, 24, 4);
      place(2, PropKind.CopperOutcrop, [60], 820, 200, 26, 40, 6);
      place(1, PropKind.TinOutcrop, [30], 820, 200, 26, 40, 6);
      place(2, PropKind.LooseStone, [40, 20], -820, 200, 24, 38, 5);
      out.push({ x: pocket.iron.x, z: pocket.iron.z, kind: pocket.bog ? PropKind.BogIron : PropKind.IronRock, amount: pocket.bog ? GUARDED_BOG_IRON : 60 });
      this.pocketPropCache.set(pocket.player, out);
    }
  }

  /**
   * Works out one column into `this.p`. `cands` are the cell sites near the
   * chunk; x and z are global column coordinates.
   */
  private profile(x: number, z: number, cands: readonly Site[]): Profile {
    const p = this.p;
    const s = this.s;
    const dist = length2d(x, z);
    // The band by the distance from the nearest main base (WL-8).
    const raw = this.layout.startDistance(x, z);
    const dBand = this.bandDistance(raw, x, z);
    const bandF = this.bandFracAt(dBand);
    p.bandF = bandF;
    // Cell membership and edges use warped coordinates so the edges wander.
    const amp = Math.max(40, Math.min(160, floorDiv(dist, 30)));
    const wx = x + centred(valueNoise(s[3]!, x, z, 7), amp) + centred(valueNoise(s[4]!, x, z, 5), amp >> 2);
    const wz = z + centred(valueNoise(s[5]!, x, z, 7), amp) + centred(valueNoise(s[6]!, x, z, 5), amp >> 2);
    const [a, da, b, db, c, dc] = nearest3(wx, wz, cands);
    const cell = this.layout.cell(a.id);
    p.cell = cell;
    const band = this.layout.bandAtDistance(dBand);
    const look = this.layout.lookOf(cell, band);
    p.band = band;
    p.look = look;
    p.volcanic = cell.volcanic && band === Band.Deadlands;

    // Base land: smooth hills, small detail, and the broken land of the deeper bands.
    const smooth = this.smoothHeight(x, z, bandF) + this.hills(x, z, raw, bandF, a, b, c);
    const small = centred(valueNoise(s[7]!, x, z, 3), lerpBand([3, 4, 5, 6, 7], bandF));
    let ground = smooth + small;
    p.smooth = smooth;
    p.base = ground;
    p.flags = 0;
    p.stone = false;
    p.ridgeCore = false;
    p.slab0 = 0;
    p.slab1 = 0;
    p.cave0 = 0;
    p.cave1 = 0;
    p.seam = 0;
    let plateau = false;
    // Terraces: stepped hillsides in patches, more of them deeper (deep land is more broken); since Patch 5 only from
    // the Barrens out, with no mini cliffs before them (WL-3).
    const terraceAmt = band >= Band.Barrens ? lerpBand(TERRACE_AMOUNT, bandF) : 0;
    if (valueNoise(s[8]!, x, z, 7) < terraceAmt * 64) {
      const step = 6 + (bandF >> 10);
      ground = floorDiv(ground, step) * step;
    }
    // Mesas from the Barrens out (the Deepwoods too before Patch 5); a few have soil on top (the rare, valuable plateau).
    if (band >= Band.Barrens && this.mesaAt(x, z, bandF)) {
      const top = floorDiv(smooth + metresToUnits(6) + (valueNoise(s[10]!, x, z, 9) >> 12) * 4, 4) * 4;
      if (top > ground) {
        ground = top;
        plateau = valueNoise(s[11]!, x, z, 9) > 48000;
        if (!plateau) p.stone = true;
      }
    }
    // Badlands: small ravines cut inside the cell.
    if (look === Look.Badlands) {
      const r = valueNoise(s[12]!, x, z, 6) - 32768;
      if (r > -1800 && r < 1800) ground -= metresToUnits(3) + ((r + 1800) >> 9);
    }
    // Boulders on rocky ground: before the Barrens low stones a unit steps over (WL-3: no mini cliffs).
    const boulderRate = look === Look.RockyScrub ? 30 : look === Look.Badlands || look === Look.DeadLand ? 15 : band >= Band.Fringe ? 4 : 1;
    const hb = hash2(s[13]!, x >> 2, z >> 2);
    if (hb % 1000 < boulderRate) {
      const ox = ((x >> 2) << 2) + 1 + ((hb >>> 10) & 1);
      const oz = ((z >> 2) << 2) + 1 + ((hb >>> 11) & 1);
      const rad = 1 + ((hb >>> 12) & 1);
      if (Math.abs(x - ox) < rad && Math.abs(z - oz) < rad) {
        ground += band >= Band.Barrens ? 4 + ((hb >>> 13) % 7) : 1 + ((hb >>> 13) & 1);
        p.stone = true;
      }
    }

    // Barriers: the edges between the three nearest cells.
    p.raise = 0;
    p.carve = 0;
    p.river = false;
    p.marsh = false;
    p.marshWater = false;
    p.riverBottom = 32767;
    p.riverLevel = 0;
    // Rivers narrow and shallow out towards a corner where they meet no other river.
    const lab = this.pair(a.id < b.id ? a : b, a.id < b.id ? b : a);
    const lac = this.pair(a.id < c.id ? a : c, a.id < c.id ? c : a);
    const toAB = floorDiv(db - da, 2 * lab.len);
    const toAC = floorDiv(dc - da, 2 * lac.len);
    const bx = this.pairEffect(a, b, da, db, wx, wz, x, z, toAC, lac.edge?.type === EdgeType.River);
    const cx = this.pairEffect(a, c, da, dc, wx, wz, x, z, toAB, lab.edge?.type === EdgeType.River);
    // Only edges of the cell the column is in: the line between the other two runs on into this cell past their corner.
    if (bx || cx) p.flags |= F_BARRIER;
    this.landmarkEffect(x, z);
    ground = ground + p.raise - p.carve;
    let waterLevel = -32768;
    let source = 0;
    let surfaceHint = -1;
    if (p.river) {
      if (p.riverBottom < ground) ground = p.riverBottom;
      waterLevel = p.riverLevel;
      source = 1;
      surfaceHint = Mat.Sand;
    }
    if (p.marsh) {
      ground -= 2;
      surfaceHint = Mat.Mud;
      if (p.marshWater) {
        const lvl = p.base - 2;
        ground = Math.min(ground, lvl - 2 - (hash2(s[14]!, x, z) & 1));
        waterLevel = Math.max(waterLevel, lvl);
      }
    }

    // Features inside the cell.
    const feat = this.cellFeatures(cell);
    for (const pond of feat.ponds) {
      if (Math.abs(x - pond.x) > pond.r + 6 || Math.abs(z - pond.z) > pond.r + 6) continue;
      const d = length2d(x - pond.x, z - pond.z) + centred(valueNoise(s[15]!, x, z, 3), 3);
      if (d <= pond.r) {
        const prof = shoulder(floorDiv(d * 1024, pond.r), 400);
        ground = Math.min(ground, pond.level - 1 - ((pond.depth * prof) >> 10));
        waterLevel = Math.max(waterLevel, pond.level);
        surfaceHint = Mat.Mud;
      } else if (d <= pond.r + 3) ground = Math.max(ground, pond.level + 1);
    }
    // Stream beds are sand: there is no gravel since Patch 5 (GP-45).
    for (const st of feat.streams) this.streamEffect(st, x, z, smooth, (g, lvl) => {
      ground = Math.min(ground, g);
      waterLevel = Math.max(waterLevel, lvl);
      source = 1;
      surfaceHint = Mat.Sand;
    });
    for (const bog of feat.bogs) {
      if (this.bogEffect(bog, x, z, smooth)) {
        ground = Math.min(ground, p.base - 1);
        surfaceHint = Mat.Mud;
        p.flags |= F_MARSH;
        if (valueNoise(s[16]!, x, z, 2) > 40000) {
          ground = Math.min(ground, smooth - 3);
          waterLevel = Math.max(waterLevel, smooth - 1);
        }
      }
    }
    // A hot spring, in its own chunk (WL-11).
    const spring = this.chunkSpring(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT);
    if (spring && Math.abs(x - spring.x) <= SPRING_REACH && Math.abs(z - spring.z) <= SPRING_REACH) {
      const d = length2d(x - spring.x, z - spring.z);
      if (d <= 5) {
        ground = spring.level - 4 + (d >> 1);
        waterLevel = spring.level;
        surfaceHint = Mat.Stone;
      } else if (d <= SPRING_REACH) {
        // A stone rim a unit above the water, its sinter falling away 2 units a column (a step) to meet the land.
        ground = Math.max(ground, spring.level + 1 - 2 * Math.max(0, d - 6));
        if (d <= 8) p.stone = true;
      }
    }

    // Pockets and village sites: flat, grassy and at sea level.
    const w = this.start.flatness(x, z);
    if (w > 0) {
      ground = (ground * (1024 - w)) >> 10;
      if (w > 512) {
        p.stone = false;
        p.slab0 = p.slab1 = 0;
        p.cave0 = p.cave1 = 0;
        if (waterLevel > -32768 && source === 1 && p.river) waterLevel = -32768;
        if (!p.river) {
          waterLevel = -32768;
          surfaceHint = -1;
        }
        p.flags |= F_FLAT;
      }
      if (w >= 1000) {
        ground = 0;
        waterLevel = -32768;
        surfaceHint = -1;
        p.marsh = false;
      }
    }
    // Only pockets whose water and iron are settled carve them (StartBasin.settle).
    for (let k = 0; k < this.start.settled; k++) {
      const pocket = this.start.pockets[k]!;
      const pw = pocket.water;
      if (Math.abs(x - pw.x) > pw.halfLength + pw.radius + 8 || Math.abs(z - pw.z) > pw.halfLength + pw.radius + 8) continue;
      if (pw.kind === 'pond') {
        const d = length2d(x - pw.x, z - pw.z);
        if (d <= pw.radius) {
          const prof = shoulder(floorDiv(d * 1024, pw.radius), 300);
          ground = -1 - ((9 * prof) >> 10);
          waterLevel = 0;
          surfaceHint = Mat.Mud;
        }
      } else {
        const st: Stream = {
          x: pw.x,
          z: pw.z,
          dx: polar(0, 0, pw.angle, pw.halfLength * 2).x,
          dz: polar(0, 0, pw.angle, pw.halfLength * 2).z,
          half: pw.halfLength,
          width: pw.radius,
          depth: 5,
        };
        this.streamEffect(st, x, z, 0, (g, lvl) => {
          ground = g;
          waterLevel = lvl;
          source = 1;
          surfaceHint = Mat.Sand;
        });
      }
      if (pocket.bog) {
        const iron = pocket.iron;
        if (this.bogEffect({ x: iron.x, z: iron.z, r: metresToColumns(7) }, x, z, 0)) {
          ground = Math.min(ground, -1);
          surfaceHint = Mat.Mud;
          p.flags |= F_MARSH;
          if (valueNoise(s[16]!, x, z, 2) > 42000 && length2d(x - iron.x, z - iron.z) > 4) {
            ground = -3;
            waterLevel = Math.max(waterLevel, -1);
          }
        }
      }
    }

    // Nothing natural more than 6 m below sea level (WL-2).
    ground = Math.max(ground, -NATURAL_FLOOR_UNITS);
    p.ground = ground;
    // Water.
    if (waterLevel > ground && waterLevel < 1000 && waterLevel > -1000) {
      p.water = waterLevel * WATER_PER_UNIT;
      p.source = source;
      p.flags |= F_WATER;
    } else {
      p.water = NO_WATER;
      p.source = 0;
    }
    if (p.marsh) p.flags |= F_MARSH;
    // Surface and soil.
    const volcanic = p.volcanic;
    const grassNoise = valueNoise(s[17]!, x, z, 4);
    // Surfaces follow the column's band (WL-8: as the raven flies from the nearest main base, the border wandering a little).
    const sb = band << 10;
    const grassiness = lerpBand([1000, 900, 700, 250, 0], sb) + (look === Look.Meadow ? 80 : look === Look.RockyScrub ? -250 : 0);
    let soil = lerpBand([22, 14, 9, 3, 1], sb) + centred(valueNoise(s[18]!, x, z, 5), 6);
    let surface: number;
    if (p.flags & F_WATER) {
      surface = surfaceHint >= 0 ? surfaceHint : Mat.Sand;
      soil = 2;
    } else if (surfaceHint === Mat.Mud || p.marsh) {
      surface = Mat.Mud;
      soil = Math.max(soil, 6);
    } else if (p.stone && !plateau) {
      surface = volcanic ? Mat.Basalt : Mat.Stone;
      soil = 0;
    } else if (p.flags & F_BANK) {
      surface = p.flags & F_CLAY ? Mat.Clay : Mat.Sand;
      soil = 4;
    } else if (surfaceHint === Mat.Stone) {
      surface = Mat.Stone;
      soil = 0;
    } else if (volcanic) {
      surface = grassNoise > 30000 ? Mat.Ash : Mat.DeadEarth;
      soil = Math.max(1, soil);
    } else if ((grassNoise >> 6) < grassiness) {
      // Thinning grass: lush near the start, patchy in the Deepwoods, dry in the Barrens.
      const thin = sb >= 3072 || (sb >= 2048 && (grassNoise >> 6) > grassiness - 250);
      surface = thin ? Mat.DryGrass : Mat.Grass;
    } else {
      surface = sb >= 4096 ? Mat.DeadEarth : Mat.Soil;
    }
    if (plateau && !(p.flags & F_WATER)) {
      surface = band >= Band.Deadlands ? Mat.DeadEarth : band >= Band.Barrens ? Mat.DryGrass : Mat.Grass;
      soil = Math.max(soil, 6);
    }
    if (p.flags & F_FLAT && !(p.flags & F_WATER) && surface !== Mat.Mud) {
      surface = Mat.Grass;
      soil = 22;
    }
    p.surface = surface;
    p.soil = Math.max(0, soil);
    if (p.stone) p.flags |= F_STONE;
    return p;
  }

  private streamEffect(st: Stream, x: number, z: number, smooth: number, apply: (ground: number, level: number) => void): void {
    // Distance from the segment, with a gentle meander.
    const len2 = st.dx * st.dx + st.dz * st.dz;
    if (len2 === 0) return;
    const rx = x - st.x;
    const rz = z - st.z;
    // Projection in 1/1024 of the half-length units along the segment (dx, dz spans the whole length).
    let tq = floorDiv((rx * st.dx + rz * st.dz) * 2048, len2);
    if (tq < -1024 || tq > 1024) return;
    tq = Math.max(-1024, Math.min(1024, tq));
    const along = floorDiv(tq * st.half, 1024);
    const lateral = floorDiv(rx * st.dz - rz * st.dx, Math.max(1, length2d(st.dx, st.dz)));
    const meander = centred(valueNoise(this.s[19]!, along + 4096, st.x, 5), 10);
    const d = Math.abs(lateral - meander);
    if (d > st.width) return;
    // Shallow at the two ends so the stretch begins and ends naturally.
    const endFade = shoulder(Math.abs(tq), 700);
    const level = smooth - 2;
    const depth = ((st.depth * endFade) >> 10) + 1;
    apply(level - depth + (d === st.width ? 2 : 0), level);
  }

  private bogEffect(bog: Bog, x: number, z: number, _smooth: number): boolean {
    if (Math.abs(x - bog.x) > bog.r + 6 || Math.abs(z - bog.z) > bog.r + 6) return false;
    const d = length2d(x - bog.x, z - bog.z) + centred(valueNoise(this.s[20]!, x, z, 3), 6);
    return d <= bog.r;
  }

  /**
   * Applies the barrier of the edge between sites u and v, if any, to the
   * profile. du and dv are squared distances from the warped point.
   */
  private pairEffect(u0: Site, v0: Site, du0: number, dv0: number, wx: number, wz: number, x: number, z: number, toCorner: number, cornerRiver: boolean): boolean {
    if (u0.id === v0.id) return false;
    const swap = u0.id > v0.id;
    const u = swap ? v0 : u0;
    const v = swap ? u0 : v0;
    const du = swap ? dv0 : du0;
    const dv = swap ? du0 : dv0;
    const info = this.pair(u, v);
    const e = info.edge;
    if (!e) return false;
    const diff = dv - du;
    const d = floorDiv(Math.abs(diff), 2 * info.len);
    const reach = e.type === EdgeType.Cliff ? e.fade : e.type === EdgeType.River ? e.half + floorDiv(e.half, 3) + 2 : e.half;
    if (d > reach) return false;
    const p = this.p;
    const side = diff >= 0 ? u.id : v.id;
    const t = floorDiv(info.ux * (2 * wz - info.mz2) - info.uz * (2 * wx - info.mx2), 2 * info.len);
    let g = 0;
    let arch = false;
    for (const gap of e.gaps) {
      const q = Math.abs(t - gap.t);
      const f = falloff(q, gap.half, e.mountain ? MOUNTAIN_GAP_BLEND : 10);
      if (f > g) {
        g = f;
        arch = gap.arch && q <= gap.half;
      }
    }
    const s = this.s;
    const x1024 = floorDiv(d * 1024, Math.max(1, e.half));
    switch (e.type) {
      case EdgeType.LowHills: {
        const bb = 1024 - ((x1024 * x1024) >> 10);
        const bump = (bb * bb) >> 10;
        const lump = 640 + (valueNoise(s[21]!, x, z, 5) >> 8) + (valueNoise(s[22]!, x, z, 3) >> 9);
        p.raise = Math.max(p.raise, (((e.height * bump) >> 10) * lump) >> 10);
        return true;
      }
      case EdgeType.Ridge: {
        if (e.mountain) return this.mountainEffect(e, d, t, g, side, x, z);
        const prof = shoulder(x1024, 360);
        if (prof === 0) return false;
        const rugged = 820 + (valueNoise(s[23]!, x, z, 3) >> 8);
        let r = (((e.height * prof) >> 10) * rugged) >> 10;
        if (prof < 1024) r = floorDiv(r, 7) * 7;
        const full = r;
        r = (r * (1024 - g)) >> 10;
        const clear = metresToUnits(4);
        if (arch && g >= 900 && full >= clear + 14) {
          p.slab0 = p.base + clear;
          p.slab1 = p.base + full;
        }
        if (r > p.raise) p.raise = r;
        if (r > 12) p.stone = true;
        if (r > 30) p.ridgeCore = true;
        this.caveEffect(e, d, t, r, side, x, z);
        return true;
      }
      case EdgeType.Cliff: {
        if (side !== e.upper) return true;
        const fx = floorDiv(d * 1024, Math.max(1, e.fade));
        const prof = shoulder(fx, 150);
        let r = (e.height * prof) >> 10;
        if (g > 0) {
          const ramp = Math.min(r, floorDiv(d * 3, 2));
          r = r + (((ramp - r) * g) >> 10);
        }
        if (r > p.raise) p.raise = r;
        if (d < 4 && g < 512) p.stone = true;
        return true;
      }
      case EdgeType.Ravine: {
        const prof = shoulder(x1024, 500);
        if (prof === 0) return false;
        let c = (e.height * prof) >> 10;
        c = floorDiv(c, 6) * 6;
        if (arch && g >= 900 && c >= 26) {
          p.slab0 = p.base - 12;
          p.slab1 = p.base;
        } else c = (c * (1024 - g)) >> 10;
        if (c > p.carve) p.carve = c;
        if (c > 8) p.stone = true;
        return true;
      }
      case EdgeType.River: {
        const level = p.smooth - 3;
        const taper = cornerRiver ? 1024 : Math.max(0, Math.min(1024, floorDiv(toCorner * 1024, e.half * 2)));
        const xr = taper === 1024 ? x1024 : floorDiv(x1024 * 1024, Math.max(1, taper));
        if (xr < 1024) {
          const depth = (((e.height * (1024 - ((g * 650) >> 10))) >> 10) * taper) >> 10;
          const prof = shoulder(xr, 450);
          const bottom = level - ((depth * prof) >> 10) - 1;
          p.river = true;
          p.riverLevel = level;
          if (bottom < p.riverBottom) p.riverBottom = bottom;
        } else {
          p.flags |= F_BANK;
          if (p.band === Band.Fringe && valueNoise(s[25]!, x, z, 4) > 36000) p.flags |= F_CLAY;
        }
        return true;
      }
      case EdgeType.Marsh: {
        const hx = x1024 + centred(valueNoise(s[26]!, x, z, 5), 300);
        if (hx >= 1024 || g >= 512) return false;
        p.marsh = true;
        if (valueNoise(s[27]!, x, z, 3) > 36000) p.marshWater = true;
        return true;
      }
      default:
        return false;
    }
  }

  /** A ridge's or a mountain's cave, opening on its side at its foot (caveFoot), where it stands `r` units high. */
  private caveEffect(e: Edge, d: number, t: number, r: number, side: number, x: number, z: number): void {
    const p = this.p;
    const cave = e.cave;
    if (!cave || side !== cave.side || r <= cave.height + 10) return;
    const foot = caveFoot(e);
    const cq = Math.abs(t - cave.t) + centred(valueNoise(this.s[24]!, x, z, 2), 3);
    if (cq <= cave.half && d <= foot + 2 && d >= foot - cave.depth) {
      p.cave0 = p.base;
      p.cave1 = p.base + cave.height - (d < foot - cave.depth + 3 ? 4 : 0);
      if (cave.saltpetre) p.flags |= F_SALTPETRE;
    }
  }

  /**
   * A mountain (Jade's Patch 5, WL-4: "more realistic looking mountains
   * (still just stone and dirt, no snow or new materials)"): broad and
   * peaked rather than a wall, its crest rising and falling into peaks and
   * saddles along its length, bare rock on its upper slopes and grass on its
   * lower ones, with no steps; a ragged foot. Its passes blend into its
   * flanks over MOUNTAIN_GAP_BLEND and lie open, with no arch over them.
   */
  private mountainEffect(e: Edge, d: number, t: number, g: number, side: number, x: number, z: number): boolean {
    const p = this.p;
    const s = this.s;
    // Its foot a little ragged, so the slopes do not run in straight lines: never past its half width.
    const xr = floorDiv(d * 1024, Math.max(1, e.half)) + ((valueNoise(s[36]!, x, z, 4) * 160) >> 16);
    if (xr >= 1024) return false;
    const u = 1024 - ((xr * xr) >> 10);
    const prof = (u * u) >> 10;
    // Peaks and saddles: 60% to 110% of its height along the crest (s), and a little roughness.
    const crest = 614 + ((valueNoise(s[37]!, x, z, 6) * 512) >> 16);
    const rough = 980 + (valueNoise(s[23]!, x, z, 3) >> 10);
    let r = (((((e.height * prof) >> 10) * crest) >> 10) * rough) >> 10;
    // Its passes lie open: no arch over a mountain's pass (a ridge's narrow gaps keep theirs).
    r = (r * (1024 - g)) >> 10;
    if (r > p.raise) p.raise = r;
    // Rock above a line 40% to 65% of the way up (s), wandering; grass and earth below.
    if (r > floorDiv(e.height * (410 + (valueNoise(s[38]!, x, z, 4) >> 8)), 1024)) p.stone = true;
    if (r > 30) p.ridgeCore = true;
    // Its lower slopes, where its silver and gold nodes lie (WL-4).
    if (xr > 560 && r > 0 && g < 512) p.flags |= F_MOUNTAIN;
    this.caveEffect(e, d, t, r, side, x, z);
    return true;
  }

  /**
   * WL-6's mini mountain: a peak 11 to 14 m high on a foot 44 m across, rock
   * on its upper slopes, steep enough that its upper faces stand as cliffs.
   */
  private landmarkEffect(x: number, z: number): void {
    const lm = this.landmark;
    if (Math.abs(x - lm.x) >= lm.radius || Math.abs(z - lm.z) >= lm.radius) return;
    const p = this.p;
    const s = this.s;
    const xr = floorDiv(length2d(x - lm.x, z - lm.z) * 1024, lm.radius) + ((valueNoise(s[36]!, x, z, 3) * 120) >> 16);
    if (xr >= 1024) return;
    const u = 1024 - ((xr * xr) >> 10);
    const prof = (u * u) >> 10;
    const rough = 980 + (valueNoise(s[23]!, x, z, 3) >> 10);
    const r = (((lm.height * prof) >> 10) * rough) >> 10;
    if (r > p.raise) p.raise = r;
    if (r > floorDiv(lm.height * 2, 5)) p.stone = true;
    if (xr > 560) p.flags |= F_MOUNTAIN;
  }

  /** Sites near a chunk, enough to answer the three-nearest question for every column in it. */
  private chunkCandidates(cx: number, cz: number): Site[] {
    const x0 = cx * N + (N >> 1);
    const z0 = cz * N + (N >> 1);
    const dist = length2d(x0, z0);
    const ring = this.layout.ringAt(dist);
    const size = this.layout.ringSize(Math.min(this.layout.ringCount - 1, ring + 1));
    return this.layout.sitesNear(x0, z0, 46 + 160 + floorDiv(size * 3, 2));
  }

  /** Generates a chunk's columns and props. */
  generateChunk(cx: number, cz: number): GeneratedChunk {
    const cands = this.chunkCandidates(cx, cz);
    const builder = new ChunkBuilder();
    const top = new Int16Array(N * N);
    const flags = new Uint16Array(N * N);
    const surface = new Uint8Array(N * N);
    const bands = new Uint8Array(N * N);
    const looks = new Uint8Array(N * N);
    const cellOf: Cell[] = [];
    const seamSeed = this.s[28]!;
    const oreSeed = this.s[29]!;
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const x = cx * N + lx;
        const z = cz * N + lz;
        const p = this.profile(x, z, cands);
        const i = lz * N + lx;
        builder.beginColumn(i);
        this.emit(builder, p, x, z, seamSeed, oreSeed);
        builder.water[i] = p.water;
        builder.source[i] = p.source;
        top[i] = p.ground;
        flags[i] = p.flags;
        surface[i] = p.surface;
        bands[i] = p.band;
        looks[i] = p.look;
        cellOf.push(p.cell!);
      }
    }
    const columns = builder.finish(cx, cz);
    const props = this.placeProps(cx, cz, { top, flags, surface, bands, looks, cellOf, taken: new Uint8Array(N * N) });
    return { columns, props };
  }

  /** Writes a column's layers from its profile, bottom to top. */
  private emit(b: ChunkBuilder, p: Profile, x: number, z: number, seamSeed: number, oreSeed: number): void {
    const ground = p.ground;
    const bottom = Math.min(ground, 0) - 36;
    const volcanic = p.volcanic;
    const rock = volcanic ? Mat.Basalt : Mat.Stone;
    const soilTop = p.surface === Mat.Grass || p.surface === Mat.DryGrass ? 1 : 0;
    const soilMat =
      p.surface === Mat.Mud ? Mat.Mud : p.surface === Mat.Ash ? Mat.Ash : p.surface === Mat.DeadEarth ? Mat.DeadEarth : p.surface === Mat.Sand || p.surface === Mat.Clay ? p.surface : Mat.Soil;
    const soil = Math.min(p.soil, ground - bottom - 1);
    // Clay or sand lens under the soil in places (Patch 5 took gravel out).
    const ln = valueNoise(oreSeed + 1, x, z, 5);
    const lens = p.soil > 0 && ln > 40000 ? (ln - 40000) >> 12 : 0;
    const lensMat = [Mat.Clay, Mat.Sand][hash2(oreSeed, x >> 5, z >> 5) % 2]!;
    const rockTop = ground - soil - lens;
    // Ore deeper down in places (found later by prospecting and mineshafts), vein iron inside ridges.
    const stack: number[] = [];
    const push = (y0: number, y1: number, m: number): void => {
      if (y1 <= y0) return;
      const n = stack.length;
      if (n > 0 && stack[n - 1] === m && stack[n - 2] === y0) stack[n - 2] = y1;
      else stack.push(y0, y1, m);
    };
    let seam0 = 0;
    let seam1 = 0;
    let seamMat: number = Mat.VeinIron;
    if (p.ridgeCore && p.band >= Band.Deepwoods) {
      const sn = valueNoise(seamSeed, x, z, 5);
      if (sn > 30000 && sn < 34000) {
        seam0 = p.base + floorDiv(p.raise, 3);
        seam1 = seam0 + 6;
        seamMat = Mat.VeinIron;
      } else if (sn > 60000 && p.band >= Band.Deepwoods) {
        seam0 = p.base + floorDiv(p.raise, 2);
        seam1 = seam0 + 5;
        seamMat = Mat.Marble;
      }
    } else {
      const on = valueNoise(oreSeed, x, z, 5);
      if (on > 58000) {
        const kinds = [
          [Mat.CopperOre, Mat.TinOre],
          [Mat.IronRock, Mat.Coal],
          [Mat.VeinIron, Mat.Coal],
          [Mat.VeinIron, Mat.Marble],
          [Mat.VeinIron, Mat.Coal],
        ][p.band]!;
        seamMat = kinds[hash2(oreSeed, x >> 6, z >> 6) & 1]!;
        seam1 = Math.min(rockTop - 6, bottom + 20);
        seam0 = seam1 - ((on - 58000) >> 10);
      }
    }
    if (seam1 > seam0 && seam0 > bottom && seam1 < rockTop) {
      push(bottom, seam0, rock);
      push(seam0, seam1, seamMat);
      push(seam1, rockTop, rock);
    } else push(bottom, rockTop, rock);
    push(rockTop, rockTop + lens, lensMat);
    push(ground - soil, ground - soilTop, soilMat);
    if (soilTop) push(ground - 1, ground, p.surface);
    if (p.surface === Mat.Stone || p.surface === Mat.Basalt) push(ground - 1, ground, p.surface);
    // Caves: an air pocket inside the stack.
    let out = stack;
    if (p.cave1 > p.cave0 && p.cave1 < ground - 4) {
      out = [];
      for (let k = 0; k < stack.length; k += 3) {
        const y0 = stack[k]!;
        const y1 = stack[k + 1]!;
        const m = stack[k + 2]!;
        if (y1 <= p.cave0 || y0 >= p.cave1) out.push(y0, y1, m);
        else {
          if (y0 < p.cave0) out.push(y0, p.cave0, m);
          if (y1 > p.cave1) out.push(p.cave1, y1, m);
        }
      }
    }
    for (let k = 0; k < out.length; k += 3) b.layer(out[k]!, out[k + 1]!, out[k + 2]!);
    if (p.slab1 > p.slab0 && p.slab0 > ground + 2) b.layer(p.slab0, p.slab1, rock);
  }

  /** Places trees and resource nodes on a generated chunk (Table 5 by band; Table 9 in the pockets; Jade's Patch 5 world). */
  private placeProps(cx: number, cz: number, c: ChunkLand): PropRecord[] {
    const { top, flags, surface, bands, looks, cellOf, taken } = c;
    const props: PropRecord[] = [];
    const x0 = cx * N;
    const z0 = cz * N;
    const add = (kind: number, lx: number, lz: number, amount: number, age: number, variant: number): void => {
      props.push({ kind, lx, lz, y: top[lz * N + lx]!, variant, age, amount });
      taken[lz * N + lx] = 1;
    };
    // Living trees' columns, for the mushrooms at their feet (GP-30) and the flax that wants few of them (WL-10).
    const trees: number[] = [];
    // Table 9: the pockets' guaranteed set.
    for (const pocket of this.start.pockets) {
      if (Math.abs(pocket.x - (x0 + 32)) > N + 160 || Math.abs(pocket.z - (z0 + 32)) > N + 160) continue;
      for (const pp of this.pocketProps(pocket)) {
        const lx = pp.x - x0;
        const lz = pp.z - z0;
        if (lx < 0 || lz < 0 || lx >= N || lz >= N) continue;
        const info = PROPS[pp.kind]!;
        add(pp.kind, lx, lz, pp.amount, info.regrowSteps + (hash2(this.seed, pp.x, pp.z) % 20000), hash2(this.seed ^ 0x5a5a, pp.x, pp.z));
        if (info.shape === PropShape.Tree) trees.push(lz * N + lx);
      }
    }
    this.placeBoulder(cx, cz, c, add);
    // Scatter on a 1.8 m grid: one candidate spot per 4 x 4 columns.
    const sd = this.s[30]!;
    const forest = this.s[31]!;
    for (let bz = 0; bz < N; bz += 4) {
      for (let bx = 0; bx < N; bx += 4) {
        const gx = x0 + bx;
        const gz = z0 + bz;
        const h = hash2(sd, gx, gz);
        const lx = bx + (h & 3);
        const lz = bz + ((h >>> 2) & 3);
        const i = lz * N + lx;
        const f = flags[i]!;
        if (f & F_FLAT || taken[i]) continue;
        const rough = roughAt(top, lx, lz);
        const roll = (h >>> 4) % 10000;
        const variant = hash2(sd ^ 0x7777, gx, gz);
        if (f & F_SALTPETRE) {
          if (roll < 900) add(PropKind.Saltpetre, lx, lz, 30, 0, variant);
          continue;
        }
        if (f & F_WATER) continue;
        if (f & F_BANK) {
          if (roll < 300) add(f & F_CLAY ? PropKind.ClayBank : PropKind.Sand, lx, lz, 100, 0, variant);
          continue;
        }
        if (rough > 2) continue;
        const band = bands[i]!;
        const look = looks[i]!;
        const stony = (f & F_STONE) !== 0;
        // WL-4: a mountain's lower slopes before the Barrens hold silver nodes very rarely and gold nodes very very rarely.
        if (f & F_MOUNTAIN && band < Band.Barrens) {
          const mr = (variant >>> 12) % 10000;
          const ore = mr < MOUNTAIN_GOLD_PER_10000 ? PropKind.GoldNode : mr < MOUNTAIN_GOLD_PER_10000 + MOUNTAIN_SILVER_PER_10000 ? PropKind.SilverNode : -1;
          if (ore >= 0) {
            add(ore, lx, lz, amountOf(ore, variant), 0, variant);
            continue;
          }
        }
        // Trees: in woods and groves, scattered in meadows, dead out in the Barrens and Deadlands (WL-1: far thinner).
        const forestN = valueNoise(forest, gx, gz, 6);
        const rates = TREES_PER_10000[look]!;
        let treeRate = (look === Look.Meadow && forestN > 52000) || (look === Look.Woodland && forestN > 22000) ? rates[1] : rates[0];
        if (band === Band.Heartland) treeRate = floorDiv(treeRate * HEARTLAND_TREES_PM, 1000);
        if (band === Band.Deepwoods) treeRate = floorDiv(treeRate, 2);
        if (stony || f & F_MARSH) treeRate = floorDiv(treeRate, 8);
        if (roll < treeRate) {
          const kind = this.treeKind(band, look, variant);
          if (kind < 0) continue;
          if ((kind === PropKind.Oak || kind === PropKind.Beech) && ((bx + bz) & 4) !== 0) continue;
          const info = PROPS[kind]!;
          const g = variant % 100;
          const grow = info.regrowSteps;
          const age = grow === 0 ? 0 : g < 6 ? (variant >>> 8) % floorDiv(grow, 10) : g < 16 ? floorDiv(grow, 10) + ((variant >>> 8) % floorDiv(grow * 9, 10)) : grow + ((variant >>> 8) % grow);
          add(kind, lx, lz, info.yield, age, variant);
          if (kind !== PropKind.DeadTree && kind !== PropKind.Thornwood) trees.push(i);
          continue;
        }
        // Other nodes, per spot, in 1/10000 (s).
        const r2 = roll - treeRate;
        if (r2 < 0) continue;
        const kind = this.nodeKind(band, look, f, r2, variant, surface[i]!);
        if (kind < 0) continue;
        const info = PROPS[kind]!;
        let amount = amountOf(kind, variant);
        if (kind === PropKind.SurfaceGold) amount = band >= Band.Deadlands ? 2 + (variant % 4) : 1 + (variant % 3);
        if (kind === PropKind.SurfaceGem && band >= Band.Deadlands) amount = 2 + (variant % 4);
        if (kind === PropKind.IronRock) amount = floorDiv(IRON_ROCK_AVERAGE[band]! * (750 + ((variant >>> 6) % 501)), 1000);
        add(kind, lx, lz, amount, info.regrowSteps, variant);
      }
    }
    this.placeFlax(cx, cz, c, trees.length, add);
    this.placeMushrooms(cx, cz, c, trees, add);
    // A hot spring's sulphur on its rim (WL-11), and bog iron at the Heartland's bogs, doubled (MB-11).
    const spring = this.chunkSpring(cx, cz);
    if (spring) add(PropKind.HotSpringSulphur, spring.x + 7 - x0, spring.z - z0, 20, 0, hash2(this.seed, spring.x + 7 - x0, spring.z - z0));
    const seen = new Set<number>();
    for (let k = 0; k < cellOf.length; k += 97) {
      const cell = cellOf[k]!;
      if (seen.has(cell.id)) continue;
      seen.add(cell.id);
      const feat = this.cellFeatures(cell);
      if (cell.band === Band.Heartland) {
        for (const bog of feat.bogs) {
          const bx = bog.x - x0;
          const bz = bog.z - z0;
          if (bx >= 0 && bz >= 0 && bx < N && bz < N) add(PropKind.BogIron, bx, bz, GUARDED_BOG_IRON, 0, hash2(this.seed, bog.x, bog.z));
        }
      }
    }
    // Jade's Patch 5: silver nuggets on the ground of every bog with a guardian (MB-11), and the large mana crystals the Fae Guardians keep (MF-2).
    for (const bog of this.bogsNear(x0 + (N >> 1), z0 + (N >> 1), N)) this.placeNuggets(bog, x0, z0, c, add);
    this.placeLargeCrystal(cx, cz, c, add);
    return props;
  }

  /**
   * Every bog whose middle lies within `radius` columns of (x, z): the
   * cells' (the Heartland's and the Fringe's) and the pockets' (Table 9's
   * iron). Since Jade's Patch 5 (MB-11) each has a Bog guardian: every bog
   * the land makes is some 110 to 250 m2, well over her "approximately 18m
   * squared".
   */
  bogsNear(x: number, z: number, radius: number): Bog[] {
    const out: Bog[] = [];
    for (const p of this.start.pockets) {
      if (p.bog && length2d(p.iron.x - x, p.iron.z - z) <= radius) out.push({ x: p.iron.x, z: p.iron.z, r: POCKET_BOG_R });
    }
    for (const site of this.layout.sitesNear(x, z, radius + this.bogSpread())) {
      const cell = this.layout.cell(site.id);
      if (cell.band > Band.Fringe) continue;
      for (const bog of this.cellFeatures(cell).bogs) if (length2d(bog.x - x, bog.z - z) <= radius) out.push(bog);
    }
    return out;
  }

  /**
   * The spots of every large mana crystal (MF-2) within `radius` columns of
   * (x, z): where each cell's stands, or a few columns round it
   * (placeLargeCrystal); a spot whose columns were all taken has none.
   */
  crystalsNear(x: number, z: number, radius: number): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (const site of this.layout.sitesNear(x, z, radius + CRYSTAL_SPREAD)) {
      const spot = this.cellFeatures(this.layout.cell(site.id)).crystal;
      if (spot && length2d(spot.x - x, spot.z - z) <= radius) out.push(spot);
    }
    return out;
  }

  /** How far a cell's bog may lie from the cell's site, columns: a quarter of the largest cell of the bands with bogs (cellFeatures). */
  private bogSpread(): number {
    if (this.spread === 0) {
      let most = 0;
      for (let r = 0; r < this.layout.ringCount; r++) if (this.layout.bandOfRing(r) <= Band.Deepwoods) most = Math.max(most, this.layout.ringSize(r));
      this.spread = floorDiv(most, 4) + 8;
    }
    return this.spread;
  }

  /**
   * A bog's silver nuggets (MB-11) that lie in this chunk: 3 to 6 of them
   * (s), 1 silver each, on the bog's ground within half its reach of its
   * middle, never on another prop. They do not grow back.
   */
  private placeNuggets(bog: Bog, x0: number, z0: number, c: ChunkLand, add: AddProp): void {
    const h = hash2(this.seed ^ 0x6e756767, bog.x, bog.z);
    const n = BOG_NUGGETS_MIN + (h % (BOG_NUGGETS_MAX - BOG_NUGGETS_MIN + 1));
    for (let k = 0; k < n; k++) {
      const hk = hash2(h, 0x6e756767, k);
      const at = polar(bog.x, bog.z, hk & 0xffff, 3 + ((hk >>> 16) % Math.max(1, (bog.r >> 1) - 2)));
      const lx = at.x - x0;
      const lz = at.z - z0;
      if (lx < 0 || lz < 0 || lx >= N || lz >= N || c.taken[lz * N + lx]) continue;
      add(PropKind.SilverNugget, lx, lz, 1, 0, hk);
    }
  }

  /**
   * The large mana crystal a chunk holds (MF-2, MF-4: "about 3 per band in
   * all bands except Deadlands. In deadlands they appear at a 5% chance in
   * every cell"): its cell's (cellFeatures), when that falls in this chunk,
   * on the first dry, level and free column at or round its spot.
   */
  private placeLargeCrystal(cx: number, cz: number, c: ChunkLand, add: AddProp): void {
    const x0 = cx * N;
    const z0 = cz * N;
    for (const site of this.layout.sitesNear(x0 + (N >> 1), z0 + (N >> 1), N + CRYSTAL_SPREAD)) {
      const spot = this.cellFeatures(this.layout.cell(site.id)).crystal;
      // Only the chunk its spot lies in places it, so no two chunks each find a column for it.
      if (!spot || spot.x >> CHUNK_SHIFT !== cx || spot.z >> CHUNK_SHIFT !== cz) continue;
      for (const [ox, oz] of CRYSTAL_TRIES) {
        const lx = spot.x + ox - x0;
        const lz = spot.z + oz - z0;
        if (lx < 0 || lz < 0 || lx >= N || lz >= N) continue;
        const i = lz * N + lx;
        if (c.taken[i] || c.flags[i]! & (F_WATER | F_BARRIER | F_MARSH | F_BANK)) continue;
        add(PropKind.LargeManaCrystal, lx, lz, LARGE_CRYSTAL_AMOUNT, 0, hash2(this.seed, spot.x, spot.z));
        break;
      }
    }
  }

  /**
   * WL-5: a 3 m boulder in about one chunk in 4.5, on dry level ground at
   * least 40 m from every main base, clear of the props round it; nothing
   * else is scattered under it.
   */
  private placeBoulder(cx: number, cz: number, c: ChunkLand, add: AddProp): void {
    const h = hash2(this.seed ^ 0x626f756c, cx, cz);
    if (h % 1000 >= BOULDER_CHUNK_PM) return;
    const { top, flags, taken } = c;
    const clear = metresToColumns(BOULDER_BASE_CLEAR_M) + BOULDER_HALF;
    for (let k = 0; k < 8; k++) {
      const hk = hash2(h, 0x626f, k);
      const lx = BOULDER_HALF + 1 + (hk % (N - 2 * BOULDER_HALF - 2));
      const lz = BOULDER_HALF + 1 + ((hk >>> 16) % (N - 2 * BOULDER_HALF - 2));
      if (this.layout.startDistance(cx * N + lx, cz * N + lz) < clear) continue;
      const y = top[lz * N + lx]!;
      let fit = true;
      for (let dz = -BOULDER_HALF; dz <= BOULDER_HALF && fit; dz++) {
        for (let dx = -BOULDER_HALF; dx <= BOULDER_HALF && fit; dx++) {
          const j = (lz + dz) * N + lx + dx;
          if (taken[j] || flags[j]! & (F_WATER | F_MARSH | F_FLAT | F_BANK) || Math.abs(top[j]! - y) > 4) fit = false;
        }
      }
      if (!fit) continue;
      add(PropKind.Boulder, lx, lz, PROPS[PropKind.Boulder]!.yield, 0, hash2(hk, lx, lz));
      for (let dz = -BOULDER_HALF; dz <= BOULDER_HALF; dz++) for (let dx = -BOULDER_HALF; dx <= BOULDER_HALF; dx++) taken[(lz + dz) * N + lx + dx] = 1;
      return;
    }
  }

  /**
   * WL-10: a flax field in a chunk of the Heartland, the Fringe or the
   * Deepwoods with no trees or few (about a third of their chunks): a clump
   * of 8 to 16 plants about 10 m across, ragged at its edge, a column apart
   * at least, never in a bog or on water. One plant in six is the tall flax.
   */
  private placeFlax(cx: number, cz: number, c: ChunkLand, treeCount: number, add: AddProp): void {
    if (treeCount > FLAX_FIELD_MAX_TREES) return;
    const { top, flags, bands, taken } = c;
    const h = hash2(this.seed ^ 0x666c6178, cx, cz);
    if ((h >>> 8) % 1000 >= FLAX_CHUNK_PM[bands[(N >> 1) * N + (N >> 1)]!]!) return;
    const R = metresToColumns(FLAX_FIELD_RADIUS_M);
    const span = N - 2 * (R + 1);
    const open = (j: number, lx: number, lz: number): boolean =>
      bands[j]! <= Band.Deepwoods && (flags[j]! & (F_WATER | F_MARSH | F_FLAT | F_BANK | F_SALTPETRE)) === 0 && roughAt(top, lx, lz) <= 2;
    for (let k = 0; k < 4; k++) {
      const hk = hash2(h, 0x6d6964, k);
      const mx = R + 1 + (hk % span);
      const mz = R + 1 + ((hk >>> 16) % span);
      if (!open(mz * N + mx, mx, mz) || flags[mz * N + mx]! & F_STONE) continue;
      const want = FLAX_FIELD_MIN + (hash2(hk, 0x6e, 0) % (FLAX_FIELD_MAX - FLAX_FIELD_MIN + 1));
      let n = 0;
      for (let t = 0; t < want * 6 && n < want; t++) {
        const ht = hash2(hk, 0x706c74, t);
        const dx = ((ht & 0xff) % (2 * R + 1)) - R;
        const dz = (((ht >>> 8) & 0xff) % (2 * R + 1)) - R;
        const lx = mx + dx;
        const lz = mz + dz;
        // A round clump with a ragged edge.
        const edge = 560 + (valueNoise(this.s[39]!, cx * N + lx, cz * N + lz, 2) >> 7);
        if ((dx * dx + dz * dz) * 1024 > R * R * edge) continue;
        const j = lz * N + lx;
        if (!open(j, lx, lz)) continue;
        let near = false;
        for (let oz = -1; oz <= 1 && !near; oz++) for (let ox = -1; ox <= 1 && !near; ox++) if (taken[j + oz * N + ox]) near = true;
        if (near) continue;
        const v = hash2(ht, lx, lz);
        const kind = v % FLAX_TALL_ONE_IN === 0 ? PropKind.FlaxTall : PropKind.WildFlax;
        add(kind, lx, lz, PROPS[kind]!.yield, PROPS[kind]!.regrowSteps, v);
        n++;
      }
      return;
    }
  }

  /**
   * GP-30: a chunk's edible mushrooms, 0 to 10 by its living trees, each at
   * the foot of one of them, 1 to 2 m from the trunk; none in the Barrens
   * or the Deadlands.
   */
  private placeMushrooms(cx: number, cz: number, c: ChunkLand, trees: readonly number[], add: AddProp): void {
    const want = Math.min(MUSHROOMS_MAX, floorDiv(trees.length, MUSHROOM_TREES));
    if (want === 0) return;
    const { top, flags, bands, taken } = c;
    const h = hash2(this.seed ^ 0x6d757368, cx, cz);
    let n = 0;
    for (let t = 0; t < want * 4 && n < want; t++) {
      const ht = hash2(h, 0x6d, t);
      const tree = trees[ht % trees.length]!;
      const at = polar(tree % N, floorDiv(tree, N), (ht >>> 8) & 0xffff, 2 + ((ht >>> 24) % 3));
      if (at.x < 0 || at.z < 0 || at.x >= N || at.z >= N) continue;
      const j = at.z * N + at.x;
      if (taken[j] || bands[j]! > Band.Deepwoods || flags[j]! & (F_WATER | F_MARSH | F_FLAT | F_BANK) || roughAt(top, at.x, at.z) > 2) continue;
      add(PropKind.Mushroom, at.x, at.z, PROPS[PropKind.Mushroom]!.yield, 0, hash2(ht, at.x, at.z));
      n++;
    }
  }

  private treeKind(band: number, look: number, v: number): number {
    const r = (v >>> 4) % 100;
    switch (band) {
      case Band.Heartland:
        return r < 40 ? PropKind.Pine : r < 75 ? PropKind.Spruce : r < 92 ? PropKind.SmallSoftwood : PropKind.Hazel;
      case Band.Fringe:
        return r < 25 ? PropKind.Pine : r < 45 ? PropKind.Spruce : r < 55 ? PropKind.SmallSoftwood : r < 77 ? PropKind.Birch : PropKind.Hornbeam;
      case Band.Deepwoods:
        return r < 50 ? PropKind.Oak : PropKind.Beech;
      default:
        return look === Look.DeadLand && r < 50 ? PropKind.Thornwood : PropKind.DeadTree;
    }
  }

  /** Resource nodes by band (NODES_PER_10000); chances per candidate spot in 1/10000 (s). */
  private nodeKind(band: number, look: number, f: number, r: number, v: number, surface: number): number {
    // Rocks come twice as often on rocky ground.
    const rocky = look === Look.RockyScrub || (f & F_STONE) !== 0;
    let acc = 0;
    for (const [kind, base] of NODES_PER_10000[band]!) {
      let chance = base;
      if (kind === PropKind.IronRock && band === Band.Deepwoods && (v >>> 3) % 1000 >= DEEPWOODS_IRON_ROCK_PM) chance = 0;
      if (rocky && PROPS[kind]!.shape === PropShape.Rocks) chance *= 2;
      acc += chance;
      if (r < acc) return kind;
    }
    if (band >= Band.Deadlands && (surface === Mat.Ash || surface === Mat.Basalt)) {
      acc += 8;
      if (r < acc) return PropKind.Sulphur;
    }
    return -1;
  }

  /** Low-detail samples of a chunk for far terrain and the minimap. */
  lowRes(cx: number, cz: number, step: number): LowResChunk {
    const size = floorDiv(N, step);
    const cands = this.chunkCandidates(cx, cz);
    const topA = new Int16Array(size * size);
    const mat = new Uint8Array(size * size);
    const water = new Int16Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const p = this.profile(cx * N + i * step + (step >> 1), cz * N + j * step + (step >> 1), cands);
        const k = j * size + i;
        topA[k] = p.slab1 > p.slab0 && p.slab0 > p.ground ? p.slab1 : p.ground;
        mat[k] = p.surface;
        water[k] = p.water;
      }
    }
    return { step, size, top: topA, material: mat, water };
  }
}
