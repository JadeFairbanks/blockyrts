// The walk map on the 45 cm column grid (Terrain, Moving over the land;
// technical decision 6). Per column: the level a person stands at, whether a
// building's solid part fills it, and whether water there is shallow enough
// to wade or deep enough to swim. Built per chunk from the world on demand
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

interface NavChunk {
  version: number;
  /** Level a unit stands at, terrain units. */
  level: Int16Array;
  flags: Uint8Array;
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
    }
    return { version, level, flags };
  }

  /** The standing level of a global column, terrain units. */
  level(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).level[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** The flags of a global column. */
  flags(x: number, z: number): number {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return this.get(cx, cz).flags[(z - cz * N) * N + (x - cx * N)]!;
  }

  /** Whether a mover can stand on a column at all. */
  standable(x: number, z: number, m: Mover): boolean {
    const f = this.flags(x, z);
    if (f & Walk.Blocked && !m.ignoreBuildings && !(m.passGates && f & Walk.Gate)) return false;
    if (f & Walk.Deep && !m.canSwim) return false;
    return true;
  }

  /**
   * The cost of stepping from column (ax, az) to its neighbour (bx, bz), or
   * -1 if the step is not allowed: 10 straight, 14 diagonal, +10 for a
   * clamber, doubled in water. A diagonal step also needs both straight
   * steps beside it to be open, so units never cut a corner.
   */
  stepCost(ax: number, az: number, bx: number, bz: number, m: Mover): number {
    if (!this.standable(bx, bz, m)) return -1;
    const rise = this.level(bx, bz) - this.level(ax, az);
    if (!m.climbs && (rise > CLAMBER_UNITS || rise < -DROP_UNITS)) return -1;
    const diagonal = ax !== bx && az !== bz;
    if (diagonal && (this.stepCost(ax, az, bx, az, m) < 0 || this.stepCost(ax, az, ax, bz, m) < 0)) return -1;
    let cost = diagonal ? 14 : 10;
    if (rise > STEP_UNITS) cost += 10;
    // Climbing is slow: each terrain unit above a clamber costs a little more.
    if (rise > CLAMBER_UNITS) cost += (rise - CLAMBER_UNITS) * 4;
    if (this.flags(bx, bz) & (Walk.Wade | Walk.Deep)) cost *= 2;
    return cost;
  }

  /** Whether a step is plain: dry, level enough to walk at full speed. Paths are only straightened over plain steps. */
  plainStep(ax: number, az: number, bx: number, bz: number, m: Mover): boolean {
    if (!this.standable(bx, bz, m)) return false;
    if (this.flags(bx, bz) & (Walk.Wade | Walk.Deep)) return false;
    const rise = this.level(bx, bz) - this.level(ax, az);
    if (rise > STEP_UNITS || rise < -DROP_UNITS) return false;
    if (ax !== bx && az !== bz) return this.plainStep(ax, az, bx, az, m) && this.plainStep(ax, az, ax, bz, m);
    return true;
  }
}
