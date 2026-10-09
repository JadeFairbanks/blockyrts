// What the night's waves go for (Jade's Patch 5 MB-1: "they should just
// attack all players' bases and units in an intelligent way, still coming
// in waves"). A player's targets are their bases, each a knot of their
// buildings, and their parties, the units out in the open away from every
// base. Each group of the night picks one, by its worth (a building's or a
// unit's), and comes out of the dark edge near it; on the way it fights
// whatever it meets, and once there it breaks the base or hunts the nearest
// target left. These are worked out from the state when asked, never kept
// in it, so a loaded save goes for the same targets.

import { buildingCentre } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { floorDiv, WU_PER_METRE } from '../fixed.ts';
import type { Xoshiro128 } from '../rng.ts';
import { UnitKind, type SimState } from '../state.ts';
import { isGoal } from './fields.ts';

/** The numbers (s: picks, in blueprint/patch5-mobs-picks.md). */
export const WAVE_AIMS = {
  /** A player's buildings within this many metres of the first of a knot are one base. */
  baseM: 30,
  /** Their units farther than this many metres outside every base are out in the open: a party. */
  openM: 30,
  /** Units out in the open this many metres from the first of a party are one party. */
  partyM: 20,
  /** A base is worth this much a building to the night's groups... */
  buildingWorth: 3,
  /** ...and a party this much a unit. */
  unitWorth: 2,
  /** A group comes out of the dark edge at most this many metres farther from its target than the nearest spot. */
  edgeSpreadM: 60,
  /** A group sent for a base takes up the town's paths (its buildings one by one) this many metres from it. */
  baseReachM: 40,
};

/** One target: its middle (wu), its worth and whether it is a base (else a party). */
export interface Aim {
  x: number;
  z: number;
  worth: number;
  base: boolean;
}

interface Knot {
  /** The first one's spot: the rest join within the distance of it. */
  ax: number;
  az: number;
  sx: number;
  sz: number;
  n: number;
  box: [number, number, number, number];
}

function knot(x: number, z: number): Knot {
  return { ax: x, az: z, sx: x, sz: z, n: 1, box: [x, z, x, z] };
}

function join(k: Knot, x: number, z: number): void {
  k.sx += x;
  k.sz += z;
  k.n++;
  k.box = [Math.min(k.box[0], x), Math.min(k.box[1], z), Math.max(k.box[2], x), Math.max(k.box[3], z)];
}

/** Gathers points into knots, each within `r` of its first, in the order given. */
function knots(points: ReadonlyArray<readonly [number, number]>, r: number): Knot[] {
  const out: Knot[] = [];
  const r2 = r * r;
  for (const [x, z] of points) {
    const k = out.find((o) => (o.ax - x) ** 2 + (o.az - z) ** 2 <= r2);
    if (k) join(k, x, z);
    else out.push(knot(x, z));
  }
  return out;
}

/** Not state: each player's bases as the building list stood at a revision. */
const baseCache = new WeakMap<object, { rev: number; bases: Map<number, Knot[]> }>();

function basesOf(state: SimState, player: number): Knot[] {
  let c = baseCache.get(state.buildings);
  if (!c || c.rev !== state.buildings.rev) {
    c = { rev: state.buildings.rev, bases: new Map() };
    baseCache.set(state.buildings, c);
  }
  let k = c.bases.get(player);
  if (!k) {
    const pts: Array<[number, number]> = [];
    for (const b of state.buildings.list as readonly Building[]) if (b.owner === player && isGoal(b.kind)) pts.push(buildingCentre(b));
    k = knots(pts, WAVE_AIMS.baseM * WU_PER_METRE);
    c.bases.set(player, k);
  }
  return k;
}

/** Whether a unit is one the waves may hunt down in the open: a living worker, troop, mage or engine of a player, outdoors. */
function huntable(state: SimState, j: number, player: number): boolean {
  const e = state.entities;
  if (e.owner[j] !== player || e.hp[j]! <= 0 || e.inside[j] !== 0) return false;
  const k = e.kind[j];
  return k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage || k === UnitKind.Engine;
}

/** Not state: every player's targets at one step (parties move). */
const aimCache = new WeakMap<SimState, { step: number; aims: Map<number, Aim[]> }>();

/** A player's targets now: their bases, then their parties out in the open. */
export function aimsOf(state: SimState, player: number): readonly Aim[] {
  let c = aimCache.get(state);
  if (!c || c.step !== state.step) {
    c = { step: state.step, aims: new Map() };
    aimCache.set(state, c);
  }
  const had = c.aims.get(player);
  if (had) return had;
  const a = WAVE_AIMS;
  const bases = basesOf(state, player);
  const out: Aim[] = bases.map((k) => ({ x: floorDiv(k.sx, k.n), z: floorDiv(k.sz, k.n), worth: k.n * a.buildingWorth, base: true }));
  const open = a.openM * WU_PER_METRE;
  const e = state.entities;
  const pts: Array<[number, number]> = [];
  for (let j = 0; j < e.count; j++) {
    if (!huntable(state, j, player)) continue;
    const x = e.x[j]!;
    const z = e.z[j]!;
    if (bases.some((k) => x >= k.box[0] - open && x <= k.box[2] + open && z >= k.box[1] - open && z <= k.box[3] + open)) continue;
    pts.push([x, z]);
  }
  for (const k of knots(pts, a.partyM * WU_PER_METRE)) out.push({ x: floorDiv(k.sx, k.n), z: floorDiv(k.sz, k.n), worth: k.n * a.unitWorth, base: false });
  c.aims.set(player, out);
  return out;
}

/** A target picked by worth on a stream; null when there is none. */
export function pickAim(rng: Xoshiro128, aims: readonly Aim[]): Aim | null {
  let total = 0;
  for (const a of aims) total += a.worth;
  if (total <= 0) return null;
  let r = rng.nextInt(total);
  for (const a of aims) {
    if (r < a.worth) return a;
    r -= a.worth;
  }
  return aims[aims.length - 1]!;
}

/** The target nearest a point (the first of equals); null when there is none. */
export function nearestAim(aims: readonly Aim[], x: number, z: number): Aim | null {
  let best: Aim | null = null;
  let bestD = 0;
  for (const a of aims) {
    const d = (a.x - x) ** 2 + (a.z - z) ** 2;
    if (best && d >= bestD) continue;
    best = a;
    bestD = d;
  }
  return best;
}

/** Whether a point is one of a player's bases: within a base's reach of the middle of one. */
export function atBase(state: SimState, player: number, x: number, z: number): boolean {
  const r = WAVE_AIMS.baseM * WU_PER_METRE;
  return basesOf(state, player).some((k) => (floorDiv(k.sx, k.n) - x) ** 2 + (floorDiv(k.sz, k.n) - z) ** 2 <= r * r);
}
