// The walk map on the 45 cm column grid (Terrain, Moving over the land;
// technical decision 6). Per column: the level a person stands at, whether a
// building's solid part fills it, and whether water there is shallow enough
// to wade or deep enough to swim; and under an overhang (a tunnel the workers
// dug, a cave, an arch) a second, lower floor with its roof, where there is
// headroom for a person. Built per chunk from the world on demand
// and rebuilt only for chunks whose land, water or buildings changed (the
// world bumps a chunk's walk-map version on every change). The walk map is a
// pure function of the state, so caching it can never cause a desync.

import { COLUMNS_PER_CHUNK } from '../fixed.ts';
import { CHUNK_SHIFT, chunkKey, NO_WATER, WATER_PER_UNIT } from '../world/chunk.ts';
import type { World } from '../world/world.ts';

const N = COLUMNS_PER_CHUNK;

/** Rises a person walks up at full speed, in terrain units (about 22 cm, a stair step). */
export const STEP_UNITS = 2;
/** Rises a person jumps or clambers up, slowing for a moment (33 to 45 cm). */
export const CLAMBER_UNITS = 4;
/** The largest drop a person steps or jumps down (about 1 m); more is treated like a cliff. */
export const DROP_UNITS = 9;
/** Water up to about waist height is waded (1 m, 9 terrain units). */
export const WADE_UNITS = 9;
/** A swimmer floats with the water surface this far above its feet's level, so it can climb out on a bank of about that height. */
const FLOAT_UNITS = 4;
/** Headroom a person needs to stand under a roof: 16 terrain units, 1.8 m (Moving over the land: headroom). */
export const HEADROOM_UNITS = 16;
/** No floor under an overhang on this column. */
export const NO_FLOOR = -32768;
/** Walk levels of a column: 0 its top, open to the sky; 1 the floor under its lowest overhang with headroom (a tunnel or cave). */
export const TOP = 0;
export const UNDER = 1;

/** Column flags. */
export const Walk = {
  /** A building's solid part, or no ground at all. */
  Blocked: 1,
  /** Water up to 1 m: walkers wade at half speed. */
  Wade: 2,
  /** Deeper water: only swimmers (unarmoured units) cross, at half speed. */
  Deep: 4,
  /** A gate's solid part (also Blocked): the players' units pass, monsters and enclosures do not. */
  Gate: 8,
} as const;

/** Movement abilities of a unit class. */
export interface Mover {
  /** One id per set of abilities: the pathfinder keeps a coarse edge cache per id. */
  id: number;
  /** Unarmoured units swim; armoured ones cannot (Water: Wading and swimming). */
  canSwim: boolean;
  /** The players' units walk through gates. */
  passGates?: boolean;
  /** Plans as if buildings were not there (monsters weigh breaking them separately). */
  ignoreBuildings?: boolean;
  /** Climbers ignore the climb limit and drops (Moving over the land; Threats: climbers). */
  climbs?: boolean;
  /** Wheels (carts) take no clamber or drop: only steps and ramps (Inventory and carrying weight: carts). */
  wheels?: boolean;
  /** Big creatures step and jump higher (Moving over the land: "scale with size"): the largest rise they jump, terrain units. */
  clamber?: number;
}

/** The players' units. */
export const PERSON: Mover = { id: 0, canSwim: true, passGates: true };
/** A walker that cannot swim or pass gates: closed regions (claimed land) and walking monsters. */
export const WALKER: Mover = { id: 1, canSwim: false };
/** Monsters planning a route: buildings are weighed as break costs, not walls. */
export const MOB_PLAN: Mover = { id: 2, canSwim: false, ignoreBuildings: true };
/** Climbing monsters planning a route. */
export const CLIMBER_PLAN: Mover = { id: 3, canSwim: false, ignoreBuildings: true, climbs: true };
/** Climbing monsters on the ground (walls are climbed by their own rule). */
export const CLIMBER: Mover = { id: 4, canSwim: false, climbs: true };
/** The players' units in body armour: they wade but cannot swim (Water: Wading and swimming). */
export const PERSON_ARMOURED: Mover = { id: 5, canSwim: false, passGates: true };
/** A worker with a cart, and the animal pulling one: no clambering, no deep water. */
export const WHEELS: Mover = { id: 6, canSwim: false, passGates: true, wheels: true };
/** Wild crocodiles and crabs: walkers that also swim. */
export const SWIMMER: Mover = { id: 7, canSwim: true };
/** Monsters 2.5 m tall and up on the ground: they jump rises of up to 6 units (67 cm) (s). */
export const BIG_WALKER: Mover = { id: 8, canSwim: false, clamber: 6 };
/** A digger shut in the hole it dug climbing out at its edge (Patch 4 (s), units/dig.ts): any rise, for that short way only. */
export const CLIMBING_OUT: Mover = { id: 9, canSwim: true, passGates: true, climbs: true };

interface NavChunk {
  version: number;
  /** Level a unit stands at, terrain units. */
  level: Int16Array;
  flags: Uint8Array;
  /** The floor under the highest overhang with a person's headroom, or NO_FLOOR, and the roof above it, terrain units. */
  under: Int16Array;
  roof: Int16Array;
}

/** Where buildings' solid parts are: per chunk, the solid local column indices, and which of them are gates. */
export interface SolidSource {
  solidIn(chunk: number): ReadonlySet<number> | undefined;
  gatesIn(chunk: number): ReadonlySet<number> | undefined;
}

export class NavGrid {
  private readonly chunks = new Map<number, NavChunk>();
  private last: NavChunk | null = null;
  private lastCx = 0;
  private lastCz = 0;
  private epoch = -1;

  constructor(
    readonly world: World,
    private readonly solids: SolidSource,
  ) {}

  private get(cx: number, cz: number): NavChunk {
    if (cx === this.lastCx && cz === this.lastCz && this.last && this.epoch === this.world.navEpoch) return this.last;
    this.epoch = this.world.navEpoch;
    return this.chunk(cx, cz);
  }

  private chunk(cx: number, cz: number): NavChunk {
    const key = chunkKey(cx, cz);
    const version = this.world.navVersion(key);
    let c = this.chunks.get(key);
    if (!c || c.version !== version) {
      c = this.build(cx, cz, key, version);
      this.chunks.set(key, c);
      if (this.chunks.size > 1024) {
        const oldest = this.chunks.keys().next().value!;
        this.chunks.delete(oldest);
      }
    }
    this.last = c;
    this.lastCx = cx;
    this.lastCz = cz;
    return c;
  }

  private build(cx: number, cz: number, key: number, version: number): NavChunk {
    const cols = this.world.columns(cx, cz);
    const level = new Int16Array(N * N);
    const flags = new Uint8Array(N * N);
    const under = new Int16Array(N * N).fill(NO_FLOOR);
    const roof = new Int16Array(N * N);
    const solid = this.solids.solidIn(key);
    const gates = this.solids.gatesIn(key);
    for (let i = 0; i < N * N; i++) {
      const top = cols.top(i);
      const w = cols.water[i]!;
      let lv = top;
      let f = 0;
      if (w !== NO_WATER && w > top * WATER_PER_UNIT) {
        const depth = w - top * WATER_PER_UNIT;
        if (depth > WADE_UNITS * WATER_PER_UNIT) {
          f |= Walk.Deep;
          lv = Math.max(top, (w >> 5) - FLOAT_UNITS);
        } else f |= Walk.Wade;
      }
      if (solid?.has(i)) f |= Walk.Blocked;
      if (gates?.has(i)) f |= Walk.Gate;
      level[i] = lv;
      flags[i] = f;
      // The highest gap between two layers that a person fits in.
      const s = cols.start[i]! * 3;
      for (let k = cols.count[i]! - 2; k >= 0; k--) {
        const floor = cols.layers[s + k * 3 + 1]!;
        const ceiling = cols.layers[s + (k + 1) * 3]!;
        if (ceiling - floor >= HEADROOM_UNITS) {
          under[i] = floor;
          roof[i] = ceiling;
          break;
        }
      }
    }
    return { version, level, flags, under, roof };
  }

  /** The standing level of a global column, terrain units. */
  level(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).level[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** The floor under a column's overhang (a tunnel or cave), or NO_FLOOR. */
  under(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).under[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** The roof over a column's lower floor, terrain units. */
  roof(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).roof[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** The level of a walk level of a column (TOP or UNDER), or NO_FLOOR. */
  levelOf(x: number, z: number, layer: number): number {
    return layer === TOP ? this.level(x, z) : this.under(x, z);
  }

  /** Which walk level of a column a unit at height y (terrain units) is on: the nearer one. */
  layerAt(x: number, z: number, y: number): number {
    const u = this.under(x, z);
    if (u === NO_FLOOR) return TOP;
    return Math.abs(y - u) < Math.abs(y - this.level(x, z)) ? UNDER : TOP;
  }

  /** The flags of a global column. */
  flags(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).flags[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** Whether a mover can stand on a column at all (on its top, or on the floor under its overhang). */
  standable(x: number, z: number, m: Mover, layer = TOP): boolean {
    if (layer === UNDER) return this.under(x, z) !== NO_FLOOR;
    const f = this.flags(x, z);
    if (f & Walk.Blocked && !m.ignoreBuildings && !(m.passGates && f & Walk.Gate)) return false;
    if (f & Walk.Deep && !m.canSwim) return false;
    return true;
  }

  /** The rise from one walk level to another, if the mover may make it there with room for its head; else null. */
  private rise(ax: number, az: number, la: number, bx: number, bz: number, lb: number, m: Mover): number | null {
    if (!this.standable(bx, bz, m, lb)) return null;
    const from = this.levelOf(ax, az, la);
    const to = this.levelOf(bx, bz, lb);
    const rise = to - from;
    if (!m.climbs && (rise > (m.clamber ?? CLAMBER_UNITS) || rise < -DROP_UNITS)) return null;
    if (m.wheels && (rise > STEP_UNITS || rise < -STEP_UNITS)) return null;
    // Under a roof, a person needs headroom above the higher of the two floors.
    const high = Math.max(from, to);
    if (la === UNDER && this.roof(ax, az) - high < HEADROOM_UNITS) return null;
    if (lb === UNDER && this.roof(bx, bz) - high < HEADROOM_UNITS) return null;
    return rise;
  }

  /**
   * The walk level a mover reaches on column (bx, bz) stepping from walk
   * level la of its neighbour (ax, az), or -1. A walker reaches at most one:
   * the two floors of a column are at least 17 units apart and a step spans
   * 13 at most; a climber takes the nearer.
   */
  layerTo(ax: number, az: number, la: number, bx: number, bz: number, m: Mover): number {
    const top = this.rise(ax, az, la, bx, bz, TOP, m);
    const under = this.under(bx, bz) === NO_FLOOR ? null : this.rise(ax, az, la, bx, bz, UNDER, m);
    if (top === null) return under === null ? -1 : UNDER;
    if (under === null) return TOP;
    return Math.abs(under) < Math.abs(top) ? UNDER : TOP;
  }

  /**
   * The cost of stepping from walk level la of column (ax, az) to its
   * neighbour (bx, bz), or -1 if the step is not allowed: 10 straight, 14
   * diagonal, +10 for a clamber, doubled in water. A diagonal step also needs
   * both straight steps beside it to be open, so units never cut a corner.
   */
  stepCostFrom(ax: number, az: number, la: number, bx: number, bz: number, m: Mover): number {
    const lb = this.layerTo(ax, az, la, bx, bz, m);
    if (lb < 0) return -1;
    const rise = this.rise(ax, az, la, bx, bz, lb, m)!;
    const diagonal = ax !== bx && az !== bz;
    if (diagonal && (this.layerTo(ax, az, la, bx, az, m) < 0 || this.layerTo(ax, az, la, ax, bz, m) < 0)) return -1;
    let cost = diagonal ? 14 : 10;
    if (rise > STEP_UNITS) cost += 10;
    // Climbing is slow: each terrain unit above a clamber costs a little more.
    if (rise > CLAMBER_UNITS) cost += (rise - CLAMBER_UNITS) * 4;
    if (lb === TOP && this.flags(bx, bz) & (Walk.Wade | Walk.Deep)) cost *= 2;
    return cost;
  }

  /**
   * stepCostFrom for a unit standing at height y (terrain units) on (ax, az),
   * or on the column's top when no height is given.
   */
  stepCost(ax: number, az: number, bx: number, bz: number, m: Mover, y?: number): number {
    return this.stepCostFrom(ax, az, y === undefined ? TOP : this.layerAt(ax, az, y), bx, bz, m);
  }

  /** Whether a step is plain: dry, level enough to walk at full speed. Returns the walk level it reaches, or -1. Paths are only straightened over plain steps. */
  plainStep(ax: number, az: number, la: number, bx: number, bz: number, m: Mover): number {
    const lb = this.layerTo(ax, az, la, bx, bz, m);
    if (lb < 0) return -1;
    if (lb === TOP && this.flags(bx, bz) & (Walk.Wade | Walk.Deep)) return -1;
    const rise = this.levelOf(bx, bz, lb) - this.levelOf(ax, az, la);
    if (rise > STEP_UNITS || rise < -DROP_UNITS) return -1;
    if (ax !== bx && az !== bz && (this.plainStep(ax, az, la, bx, az, m) < 0 || this.plainStep(ax, az, la, ax, bz, m) < 0)) return -1;
    return lb;
  }
}
