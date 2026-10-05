// The start basin and each player's pocket (The world: Start basin, Each
// player's pocket; Table 9: Start pocket contents). Pocket places are pure
// functions of the seed and the player count.
//
// Jade's mini patch (2026-10-04): in a game for two or more, the main bases
// stand 10 to 15 m apart, measured between the buildings' outer edges, and
// from five players on they stand in a line, so no base can be ringed by the
// others. Two to four players make one tight group (two side by side, three
// in a triangle, four in a square), every pair 10 to 15 m apart. Each base's
// resources lie in its own yard, on the side facing away from the others; a
// game for one keeps the old pocket, with its resources all round the Big
// House.

import { atan2Angle, ceilDiv, cos16, floorDiv, length2d, sin16 } from '../fixed.ts';
import { CELL_RING_SHIFT, metresToColumns, RING_SCALE_PER_MILLE, type WorldLayout } from './layout.ts';
import { hash2 } from './noise.ts';

export interface Pocket {
  player: number;
  /** Centre in columns: where the Big House stands. */
  x: number;
  z: number;
  /** 16-bit angle pointing away from the other players' bases; the pocket's resources lie that way. */
  outward: number;
  /**
   * Half the angle of the yard the pocket's resources lie in, either side of
   * `outward` (16-bit); 0 for a game for one, whose pocket has its resources
   * all round the Big House.
   */
  yard: number;
  /** Table 9 water: a stream stretch of at least 60 m2 or a pond of 40 m2, within 60 m. */
  water: PocketWater;
  /** Table 9 iron: a bog with 40 bog iron (80% of pockets) or an iron rock of 60 (20%). */
  bog: boolean;
  /** Where the iron lies: the bog's middle or the iron rock, columns. */
  iron: { x: number; z: number };
}

export interface PocketWater {
  kind: 'stream' | 'pond';
  /** Centre (pond) or the middle of the stretch (stream), columns. */
  x: number;
  z: number;
  /** Pond radius or the stream's half width, columns. */
  radius: number;
  /** Stream: half the stretch's length and its direction (16-bit angle). */
  halfLength: number;
  angle: number;
}

/** A flat site kept for a Halfling village (Table 9; the villages themselves arrive with the neutral peoples). */
export interface VillageSite {
  x: number;
  z: number;
  radius: number;
}

/** Flat radius of a pocket and the width of its blend back into the land (Table 9: about 60 m across). */
export const POCKET_FLAT_COLUMNS = metresToColumns(30);
export const POCKET_BLEND_COLUMNS = metresToColumns(25);
/**
 * A side of the Big House's plot, in columns (6.3 m). Every level of the main
 * base stands inside it (buildings/footprints.ts), so its edge is the
 * building's outer edge, the one the mini patch measures from.
 */
const MAIN_BASE_PLOT_COLUMNS = 14;
/** The mini patch's gap between neighbouring main bases in a game for two or more, edge to edge (Jade): 10 to 15 m. */
export const BASE_GAP_MIN_M = 10;
export const BASE_GAP_MAX_M = 15;
/**
 * How far each base's stone outcrop (Table 9's one of 200) stands from the
 * middle of its Big House, metres (Jade's Patch 4: "make sure at least one is
 * by each starting base location"): 11 to 16 m, so 6.5 to 13 m out from the
 * plot's edge, well inside the 20 m the main base sees from the start, and in
 * view on the first screen (s). Before Patch 4 it lay with the loose stone,
 * 18 to 30 m out in a game for one and 24 to 38 m in a yard, often past that
 * sight in the dark.
 */
export const START_OUTCROP_NEAR_M = 11;
export const START_OUTCROP_FAR_M = 16;

/** Half the yard's angle by the shape of the group (s): wide for two, narrower as the group closes round. */
const YARD_TWO = floorDiv(80 * 65536, 360);
const YARD_THREE = floorDiv(60 * 65536, 360);
const YARD_FOUR = floorDiv(45 * 65536, 360);
const YARD_LINE = floorDiv(40 * 65536, 360);
/** How close a yard's water and iron may come to any Big House's plot (s). */
const YARD_FEATURE_CLEAR = metresToColumns(10);
/** A pocket stream's meander either side of its line (generate.ts: up to 5 columns), plus its half width. */
const STREAM_MEANDER = 5;
/** Half a Big House plot's diagonal, columns: how far the plot reaches from its middle. */
const PLOT_REACH = 10;
/** A pocket bog's reach: its 7 m radius plus the noise on its edge (generate.ts). */
const POCKET_BOG_COLUMNS = metresToColumns(7) + 3;

/** How far a pocket's iron reaches from its middle, columns: a bog's edge, or the rock itself. */
export function ironReach(pocket: Pocket): number {
  return pocket.bog ? POCKET_BOG_COLUMNS : 2;
}

/** A point at `dist` columns and 16-bit angle `a` from (x, z). */
export function polar(x: number, z: number, a: number, dist: number): { x: number; z: number } {
  return { x: x + floorDiv(dist * cos16(a), 65536), z: z + floorDiv(dist * sin16(a), 65536) };
}

/** The squared gap between two Big House plots centred at (ax, az) and (bx, bz), in columns: 0 if they touch or overlap. */
export function baseGapSq(ax: number, az: number, bx: number, bz: number): number {
  const gx = Math.max(0, Math.abs(ax - bx) - MAIN_BASE_PLOT_COLUMNS);
  const gz = Math.max(0, Math.abs(az - bz) - MAIN_BASE_PLOT_COLUMNS);
  return gx * gx + gz * gz;
}

/** Whether a squared gap in columns lies in the mini patch's 10 to 15 m (a column is 9/20 m, so 81 g^2 lies between 400 x 10^2 and 400 x 15^2). */
export function baseGapInRange(sq: number): boolean {
  return 81 * sq >= 400 * BASE_GAP_MIN_M * BASE_GAP_MIN_M && 81 * sq <= 400 * BASE_GAP_MAX_M * BASE_GAP_MAX_M;
}

/** How far (x, z) lies from the Big House plot centred at (bx, bz), in columns: 0 on or inside it. */
export function distanceToPlot(x: number, z: number, bx: number, bz: number): number {
  const half = MAIN_BASE_PLOT_COLUMNS >> 1;
  const dx = Math.max(0, Math.abs(x - bx) - half);
  const dz = Math.max(0, Math.abs(z - bz) - half);
  return length2d(dx, dz);
}

/** How far (x, z) lies outside a pocket's water, in columns, its meander allowed for: 0 on it. */
export function distanceToWater(w: PocketWater, x: number, z: number): number {
  if (w.kind === 'pond') return Math.max(0, length2d(x - w.x, z - w.z) - w.radius);
  // Distance from the stretch's line segment.
  const ux = cos16(w.angle);
  const uz = sin16(w.angle);
  const rx = x - w.x;
  const rz = z - w.z;
  const along = Math.max(-w.halfLength, Math.min(w.halfLength, floorDiv(rx * ux + rz * uz, 65536)));
  const px = w.x + floorDiv(along * ux, 65536);
  const pz = w.z + floorDiv(along * uz, 65536);
  return Math.max(0, length2d(x - px, z - pz) - w.radius - STREAM_MEANDER);
}

/**
 * How much nearer (x, z) lies to its own Big House at (ox, oz), facing
 * `outward`, than to any other base in `others` whose yard faces the same
 * way (within a quarter turn), columns: negative where another such base is
 * nearer (s). In a line, a yard's props and iron stay in its own stretch of
 * its side; the bases across the line face away, and a group's yards all
 * face apart, so neither counts.
 */
export function ownSideRoom(x: number, z: number, ox: number, oz: number, outward: number, others: ReadonlyArray<{ x: number; z: number; outward: number }>): number {
  const own = length2d(x - ox, z - oz);
  let room = Infinity;
  for (const o of others) {
    if (o.x === ox && o.z === oz) continue;
    const turn = ((o.outward - outward + 32768) & 0xffff) - 32768;
    if (Math.abs(turn) >= 16384) continue;
    room = Math.min(room, length2d(x - o.x, z - o.z) - own);
  }
  return room;
}

/**
 * How far along its line a yard's stretch runs either side of its Big House,
 * columns: 2 m short of halfway to the nearest other base whose yard faces
 * the same way (ownSideRoom), or Infinity in a group, where none does.
 */
export function yardStretch(own: { x: number; z: number; outward: number }, others: ReadonlyArray<{ x: number; z: number; outward: number }>): number {
  let half = Infinity;
  for (const o of others) {
    if (o.x === own.x && o.z === own.z) continue;
    const turn = ((o.outward - own.outward + 32768) & 0xffff) - 32768;
    if (Math.abs(turn) < 16384) half = Math.min(half, (length2d(o.x - own.x, o.z - own.z) >> 1) - metresToColumns(2));
  }
  return half;
}

/** (x, z) pulled in along a line to the edge of its yard's stretch, if it lies past it (s). */
export function keepToStretch(x: number, z: number, own: { x: number; z: number; outward: number }, stretch: number): { x: number; z: number } {
  if (stretch === Infinity) return { x, z };
  const ax = cos16((own.outward + 16384) & 0xffff);
  const az = sin16((own.outward + 16384) & 0xffff);
  const u = floorDiv((x - own.x) * ax + (z - own.z) * az, 65536);
  if (Math.abs(u) <= stretch) return { x, z };
  const over = u > 0 ? u - stretch : u + stretch;
  return { x: x - floorDiv(over * ax, 65536), z: z - floorDiv(over * az, 65536) };
}

/** Where a main base stands, and which way its yard faces. */
interface Stand {
  x: number;
  z: number;
  outward: number;
  yard: number;
}

/**
 * The places of the main bases round the basin's middle (mx, mz). A game
 * for one keeps its Big House on the middle. Two, three and four make a tight
 * group; five to eight a straight line (s: a line, not an arc) along the
 * basin's long way. Gaps are set from the seed inside the mini patch's range,
 * a column or two clear of each end so the grid never takes a pair outside
 * it: at least 10.8 to 14.0 m for two and for a line, whose neighbours all
 * stand the same step apart, and up to 14.5 m where a slanting step rounds
 * up on the grid.
 */
function stands(layout: WorldLayout, mx: number, mz: number, rot: number, roll: number): Stand[] {
  const n = layout.players;
  if (n === 1) return [{ x: mx, z: mz, outward: rot, yard: 0 }];
  // The range in columns (a column is 9/20 m): lo the least whole gap of at least the minimum, hi the most within the maximum.
  const lo = ceilDiv(BASE_GAP_MIN_M * 20, 9);
  const hi = floorDiv(BASE_GAP_MAX_M * 20, 9);
  const out: Stand[] = [];
  if (n === 4) {
    // A square of four, side by side on the grid: the least gap across each side, which keeps each diagonal
    // (1.41 times it) inside the range: 23 columns, 10.35 m across a side and 14.6 m across a diagonal.
    const d = MAIN_BASE_PLOT_COLUMNS + lo;
    const near = -(d >> 1);
    const far = d - (d >> 1);
    const corners: Array<[number, number, number]> = [
      [near, near, 40960],
      [far, near, 57344],
      [far, far, 8192],
      [near, far, 24576],
    ];
    for (let p = 0; p < 4; p++) {
      const [dx, dz, a] = corners[(p + roll) & 3]!;
      out.push({ x: mx + dx, z: mz + dz, outward: a, yard: YARD_FOUR });
    }
    return out;
  }
  if (n === 3) {
    // A triangle round the middle with its smallest gap 10.8 to 11.7 m; its widest is then at most 2.6 m more
    // (the plots are square), and a turn of the triangle that the grid pushes past the range is passed over.
    const target = lo + 1 + (roll % 3);
    for (let turn = 0; turn < 16; turn++) {
      const rot3 = (rot + turn * 1365) & 0xffff;
      for (let r = 8; r < 400; r++) {
        out.length = 0;
        for (let k = 0; k < 3; k++) {
          const a = (rot3 + floorDiv(k * 65536, 3)) & 0xffff;
          const c = polar(mx, mz, a, r);
          out.push({ x: c.x, z: c.z, outward: a, yard: YARD_THREE });
        }
        const g = [baseGapSq(out[0]!.x, out[0]!.z, out[1]!.x, out[1]!.z), baseGapSq(out[1]!.x, out[1]!.z, out[2]!.x, out[2]!.z), baseGapSq(out[0]!.x, out[0]!.z, out[2]!.x, out[2]!.z)];
        if (Math.min(...g) < target * target) continue;
        if (Math.max(...g) <= hi * hi) return out;
        break;
      }
    }
    throw new Error('no room for a triangle of main bases');
  }
  // Two side by side, or a line of five to eight. A line runs along the basin's long way, so the bases at its ends
  // keep their yards inside the basin; two take the seed's own bearing. Every neighbour stands the same whole step
  // of columns from the last, so every gap along the line is the same.
  let along = rot;
  if (n >= 5) {
    const ids = layout.basinIds();
    const a = layout.site(ids[ids.length === 2 ? 0 : 1]!);
    const b = layout.site(ids[ids.length === 2 ? 1 : 2]!);
    along = atan2Angle(b.z - a.z, b.x - a.x);
  }
  const target = lo + 1 + (roll % (hi - lo - 2));
  let sx = 0;
  let sz = 0;
  for (let d = MAIN_BASE_PLOT_COLUMNS + target; d < 1000; d++) {
    const step = polar(0, 0, along, d);
    if (baseGapSq(0, 0, step.x, step.z) < target * target) continue;
    sx = step.x;
    sz = step.z;
    break;
  }
  for (let k = 0; k < n; k++) {
    // Two face away from each other; a line's yards alternate sides, so a base's yard never borders a neighbour's.
    const outward = n === 2 ? (k === 0 ? along + 32768 : along) : k % 2 === 0 ? along + 16384 : along - 16384;
    out.push({ x: mx + k * sx - floorDiv((n - 1) * sx, 2), z: mz + k * sz - floorDiv((n - 1) * sz, 2), outward: outward & 0xffff, yard: n === 2 ? YARD_TWO : YARD_LINE });
  }
  return out;
}

/** The land as generated, as settle() judges it (WorldGen). */
export interface LandProbe {
  /**
   * How far the land falls short of fit for a start pocket's water, iron or
   * prop at each of the points given (x0, z0, x1, z1, ...), 0 where it is
   * dry, near sea level and level. `step` is how far apart, in columns, the
   * land is compared for levelness.
   */
  landMisfit(points: readonly number[], step: number): number;
  /** Whether a worker can walk straight out from a Big House at (x0, z0) to (x1, z1). */
  landWalk(x0: number, z0: number, x1: number, z1: number): boolean;
}

/**
 * A try at a pocket's water or iron: how much room it leaves (at least 0 to
 * take it), the points its land must be fit at, and the spot its workers
 * must walk out to (the near bank of water).
 */
interface Try<T> {
  value: T;
  room: number;
  points: number[];
  walk: { x: number; z: number };
}

/** How far a try's land falls short when its workers cannot walk out to it (choose). */
const WALK_MISFIT = 512;

export class StartBasin {
  readonly pockets: Pocket[] = [];
  readonly villages: VillageSite[] = [];
  /**
   * How many pockets have their water and iron settled on fit land (settle
   * below): the land carves only these, so a pocket's tries are judged on the
   * land as it is before its own water and bog are cut into it.
   */
  settled = 0;
  private readonly stands: Stand[];
  private readonly seed: number;

  constructor(layout: WorldLayout) {
    const seed = layout.seed;
    this.seed = seed;
    const n = layout.players;
    const h = (k: number): number => hash2(seed, 0x706f636b, k);
    const rot = h(0) & 0xffff;
    // Basin middle: the mean of the basin sites.
    let mx = 0;
    let mz = 0;
    const basin = layout.basinIds().map((id) => layout.site(id));
    for (const s of basin) {
      mx += s.x;
      mz += s.z;
    }
    mx = floorDiv(mx, basin.length);
    mz = floorDiv(mz, basin.length);
    this.stands = stands(layout, mx, mz, rot, h(1));
    for (let p = 0; p < n; p++) {
      const st = this.stands[p]!;
      const hp = h(10 + p);
      const bog = (hp >>> 21) % 10 < 8;
      // Water and iron are their first tries until settle() finds them fit land.
      const water = this.waterTry(p, 0).value;
      this.pockets.push({ player: p, x: st.x, z: st.z, outward: st.outward, yard: st.yard, water, bog, iron: { x: st.x, z: st.z } });
      this.pockets[p]!.iron = this.ironTry(p, water, 0).value;
    }
    // Table 9 (s): one Halfling village per basin cell, each in its own pocket at least 120 m from every player
    // pocket. The basin is too small to hold them beside the player pockets, so they sit in the first ring. The
    // mini patch brings the rings 30% closer, so the 120 m comes 30% closer with them (84 m), which keeps the
    // villages in the first ring as before; a village with no room there takes the second ring (s).
    const minDist = metresToColumns(floorDiv(120 * RING_SCALE_PER_MILLE, 1000));
    for (let v = 0; v < layout.basinCells; v++) {
      let found = false;
      for (let ring = 1; ring <= 2 && !found; ring++) {
        const count = layout.ringCellCount(ring);
        for (let tries = 0; tries < count; tries++) {
          const k = (floorDiv(v * count, layout.basinCells) + tries + (h(100) % count)) % count;
          const s = layout.site(ring * CELL_RING_SHIFT + k);
          const far = this.pockets.every((pk) => length2d(pk.x - s.x, pk.z - s.z) >= minDist + POCKET_FLAT_COLUMNS);
          const apart = this.villages.every((vs) => length2d(vs.x - s.x, vs.z - s.z) >= minDist);
          if (far && apart) {
            this.villages.push({ x: s.x, z: s.z, radius: metresToColumns(25) });
            found = true;
            break;
          }
        }
      }
    }
  }

  /**
   * Settles every pocket's water and iron, in player order, on the first of
   * 48 tries that has room and fit land its workers can walk straight out to
   * from the Big House (the mini patch's carving fix: with
   * the rings 30% closer the basin's own barrier edge runs nearer the start,
   * and a ridge or ravine there must not take a pocket's iron or water out of
   * its workers' reach). The first 24 keep to where the water and iron
   * always lay, so a pocket on good land is unchanged; the last 24 range wider
   * and nearer the Big House. With no such try, the try with the most room on
   * fit land, else the one on the land nearest fit.
   */
  settle(land: LandProbe): void {
    for (let p = 0; p < this.pockets.length; p++) {
      const pocket = this.pockets[p]!;
      pocket.water = choose((t) => this.waterTry(p, t), land, pocket);
      pocket.iron = choose((t) => this.ironTry(p, pocket.water, t), land, pocket);
      this.settled = p + 1;
    }
  }

  /** Try t at pocket p's water. */
  private waterTry(p: number, t: number): Try<PocketWater> {
    const st = this.stands[p]!;
    const hp = hash2(this.seed, 0x706f636b, 10 + p);
    const stream = ((hp >>> 20) & 1) === 0;
    let a: number;
    let d: number;
    if (st.yard === 0) {
      // A game for one: 35 to 50 m out on its own bearing away from the stand; later tries swing either side.
      const swing = ((t + 1) >> 1) * (t & 1 ? 2730 : -2730);
      const r = t === 0 ? hp : hash2(hp, 0x77617472, t);
      a = (st.outward + 24000 + ((hp & 0xfff) - 2048) + swing) & 0xffff;
      d = metresToColumns(35 + ((t === 0 ? hp >>> 12 : r >>> 16) % 16)) - (t < 24 ? 0 : metresToColumns(5));
    } else {
      // A yard: out along its middle at 46 to 56 m; the wide tries take most of the yard at 38 to 56 m (s).
      const r = hash2(hp, 0x77617472, t);
      const spread = t < 24 ? 250 : 700;
      a = (st.outward + floorDiv(floorDiv(((r & 0xffff) - 32768) * spread, 32768) * st.yard, 1024)) & 0xffff;
      d = t < 24 ? metresToColumns(46) + ((r >>> 16) % metresToColumns(10)) : metresToColumns(38) + ((r >>> 16) % metresToColumns(18));
    }
    const c = polar(st.x, st.z, a, d);
    const w = makeWater(stream, c.x, c.z, a);
    // Fit land at its middle and ends (a stream) or round its edge (a pond).
    const points: number[] = [w.x, w.z];
    if (w.kind === 'stream') {
      for (const f of [-1024, -512, 512, 1024]) {
        const e = polar(w.x, w.z, w.angle, floorDiv(w.halfLength * f, 1024));
        points.push(e.x, e.z);
      }
    } else {
      for (let k = 0; k < 4; k++) {
        const e = polar(w.x, w.z, k * 16384, w.radius + 2);
        points.push(e.x, e.z);
      }
    }
    // The near bank, on the line out from the Big House.
    const walk = polar(st.x, st.z, a, d - w.radius - (w.kind === 'stream' ? STREAM_MEANDER : 0) - 3);
    const room = Math.min(this.waterRoom(w), ownSideRoom(w.x, w.z, st.x, st.z, st.outward, this.stands));
    return { value: w, room, points, walk };
  }

  /** Try t at pocket p's iron, beside its water `own`. */
  private ironTry(p: number, own: PocketWater, t: number): Try<{ x: number; z: number }> {
    const st = this.stands[p]!;
    const pocket = this.pockets[p]!;
    let c: { x: number; z: number };
    if (st.yard === 0) {
      // A game for one: 40 to 55 m out, behind and to one side; later tries swing either side.
      const ri = hash2(this.seed, 0x69726f6e, p);
      const r = t === 0 ? ri : hash2(ri, 0x69726f6e, t);
      const swing = ((t + 1) >> 1) * (t & 1 ? 2730 : -2730);
      const d = metresToColumns(40 + ((r >>> 12) % 16)) - (t < 24 ? 0 : metresToColumns(6));
      c = polar(st.x, st.z, (st.outward - 27000 + ((ri & 0xfff) - 2048) + swing) & 0xffff, d);
    } else {
      // A yard: to one side, 42 to 56 m out; the wide tries take either side at 34 to 56 m (s).
      const hp = hash2(this.seed, 0x706f636b, 10 + p);
      const r = hash2(hp, 0x69726f6e, t);
      const side = ((hp >>> 24) ^ (t < 24 ? 0 : t)) & 1 ? 1 : -1;
      const f = t < 24 ? 560 + floorDiv((r & 0xffff) * 340, 65536) : 300 + floorDiv((r & 0xffff) * 600, 65536);
      const d = t < 24 ? metresToColumns(42) + ((r >>> 16) % metresToColumns(14)) : metresToColumns(34) + ((r >>> 16) % metresToColumns(22));
      c = polar(st.x, st.z, (st.outward + side * floorDiv(f * st.yard, 1024)) & 0xffff, d);
      // In a line, within its own stretch of its side, its bog too.
      c = keepToStretch(c.x, c.z, st, yardStretch(st, this.stands) - (pocket.bog ? POCKET_BOG_COLUMNS : 2));
    }
    const points: number[] = [c.x, c.z];
    if (pocket.bog) {
      for (let k = 0; k < 4; k++) {
        const e = polar(c.x, c.z, k * 16384, metresToColumns(7));
        points.push(e.x, e.z);
      }
    }
    const room = Math.min(this.ironRoom(own, c.x, c.z, pocket.bog), ownSideRoom(c.x, c.z, st.x, st.z, st.outward, this.stands));
    return { value: c, room, points, walk: c };
  }

  /** Room round a pocket's water, columns: how far it keeps clear of every Big House and the earlier pockets' water and iron, less what each needs. */
  private waterRoom(w: PocketWater): number {
    let room = Infinity;
    for (const s of this.stands) room = Math.min(room, distanceToWater(w, s.x, s.z) - PLOT_REACH - YARD_FEATURE_CLEAR);
    // The earlier pockets' water, from five points along this stretch (a pond: its middle).
    const pts: Array<[number, number]> = [[w.x, w.z]];
    if (w.kind === 'stream') {
      for (const f of [-1024, -512, 512, 1024]) {
        const c = polar(w.x, w.z, w.angle, floorDiv(w.halfLength * f, 1024));
        pts.push([c.x, c.z]);
      }
    }
    const reach = w.kind === 'pond' ? w.radius : w.radius + STREAM_MEANDER;
    for (let i = 0; i < this.settled; i++) {
      const pk = this.pockets[i]!;
      for (const [x, z] of pts) room = Math.min(room, distanceToWater(pk.water, x, z) - reach - metresToColumns(8));
      room = Math.min(room, distanceToWater(w, pk.iron.x, pk.iron.z) - ironReach(pk) - metresToColumns(4));
    }
    return room;
  }

  /** Room round a pocket's iron, columns: clear of every Big House, its own water and the earlier pockets' water and iron. */
  private ironRoom(own: PocketWater, x: number, z: number, bog: boolean): number {
    const reach = bog ? POCKET_BOG_COLUMNS : 2;
    let room = distanceToWater(own, x, z) - reach - metresToColumns(4);
    for (const s of this.stands) room = Math.min(room, distanceToPlot(x, z, s.x, s.z) - reach - YARD_FEATURE_CLEAR);
    for (let i = 0; i < this.settled; i++) {
      const pk = this.pockets[i]!;
      room = Math.min(room, distanceToWater(pk.water, x, z) - reach - metresToColumns(4));
      room = Math.min(room, length2d(x - pk.iron.x, z - pk.iron.z) - reach - ironReach(pk) - metresToColumns(4));
    }
    return room;
  }

  /**
   * How much a column is pulled flat towards sea level by a pocket or a
   * village site, 0 to 1024.
   */
  flatness(x: number, z: number): number {
    let best = 0;
    const far = POCKET_FLAT_COLUMNS + POCKET_BLEND_COLUMNS;
    for (const p of this.pockets) {
      if (Math.abs(x - p.x) >= far || Math.abs(z - p.z) >= far) continue;
      best = Math.max(best, falloff(length2d(x - p.x, z - p.z), POCKET_FLAT_COLUMNS, POCKET_BLEND_COLUMNS));
    }
    for (const v of this.villages) {
      const vfar = v.radius + POCKET_BLEND_COLUMNS;
      if (Math.abs(x - v.x) >= vfar || Math.abs(z - v.z) >= vfar) continue;
      best = Math.max(best, falloff(length2d(x - v.x, z - v.z), v.radius, POCKET_BLEND_COLUMNS));
    }
    return best;
  }
}

/**
 * The first of 48 tries with room and fit land the pocket's workers can walk
 * out to; else the such try with the most room; else the one on the land
 * nearest that. Always the same one for a seed.
 */
function choose<T>(make: (t: number) => Try<T>, land: LandProbe, pocket: Pocket): T {
  let best: Try<T> | null = null;
  let bestScore = -Infinity;
  for (let t = 0; t < 48; t++) {
    const k = make(t);
    const miss = land.landMisfit(k.points, 2) + (land.landWalk(pocket.x, pocket.z, k.walk.x, k.walk.z) ? 0 : WALK_MISFIT);
    if (miss === 0 && k.room >= 0) return k.value;
    // Fit land outranks room: a pocket's iron a little near another's beats iron on a ridge.
    const score = miss === 0 ? Math.min(k.room, 1_000_000) : -1_000_000 - miss;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best!.value;
}

/** A pocket's stream stretch (across its bearing) or pond at (x, z). */
function makeWater(stream: boolean, x: number, z: number, bearing: number): PocketWater {
  return stream
    ? { kind: 'stream', x, z, radius: metresToColumns(1) + 1, halfLength: metresToColumns(18), angle: (bearing + 16384) & 0xffff }
    : { kind: 'pond', x, z, radius: metresToColumns(4), halfLength: 0, angle: 0 };
}

/** 1024 inside `inner`, falling smoothly to 0 over `blend` beyond it. */
export function falloff(d: number, inner: number, blend: number): number {
  if (d <= inner) return 1024;
  if (d >= inner + blend) return 0;
  const t = 1024 - floorDiv((d - inner) * 1024, blend);
  return (t * t * (3072 - 2 * t)) >> 20;
}
