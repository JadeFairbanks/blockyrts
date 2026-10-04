// Making room (Jade's Patch 3: anti-clumping). Units, animals and monsters
// standing on top of one another drift apart by themselves, just far enough
// that their bodies stop overlapping, onto ground they could walk to; nothing
// is ever a wall to anything else. After every unit has acted each step,
// each body standing about is pushed out of the bodies it overlaps: by half
// the overlap each when both can give way, by all of it when the other cannot.
//
// Who gives way, and how:
// - Idle (no orders, standing): freely, onto any column it could step to.
// - Fighting from where it stands, standing by an engine it crews, or by a
//   leader it follows: freely, but never farther from its target, engine or
//   leader than it may be (in reach, in range, within the follow distance),
//   so it fans out round what it fights instead of stacking on one spot.
// - At its job (chopping, mining, farming, digging, tinkering): only inside
//   the column it stands on, which its work never looks at, so the work goes
//   on at the same pace. Its bar, its node and its turn are untouched.
// - Walking somewhere (a unit or monster on its way, carrying, chasing,
//   fleeing): not at all, and it pushes no one: it passes through, so making
//   room never slows a worker down or turns it the wrong way, and a horde
//   reaches a wall where it would have.
// - Everyone else standing (on Hold, waiting its turn at a node, a cart,
//   an engine, a monster mid-swing or chewing at a wall, a lair): gives no
//   way, but others make room round it. A horde at a wall keeps chewing the
//   piece on its line to its foe, as it would with no making room.
//
// No push takes a body through a building, into water, up or down more than
// a stair step, or onto a building's plot it was not already on: bodies the
// land presses together stay overlapped. Flyers and climbers are left alone.
// Everything is integer maths over the entity arrays in index order, with a
// grid of 2 m buckets rebuilt each step (not state) and a cap on how many
// bodies each one looks at, so a step stays cheap with thousands of monsters.

import { ceilDiv, cos16, floorDiv, headingTowards, isqrt, length2d, sin16, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { gap, halfWidth, meleeOf, OVER_WALL_REACH, wallBetween } from '../combat/combat.ts';
import { Lock, RANGED_MIN_WU, rangedOf } from '../combat/fight.ts';
import { mobMover } from '../combat/mob-ai.ts';
import { flies, Moves, mobSpec } from '../combat/mobs.ts';
import { CREW_REACH_WU } from '../siege/data.ts';
import { landAt, OrderKind, PEOPLES, UnitKind, WILD, type SimState } from '../state.ts';
import { Role } from '../threats/types.ts';
import type { Mover } from '../nav/grid.ts';
import { FOLLOW_WU, moverOf } from './behaviour.ts';

/** How near two bodies stand before they make room: centre to centre, per mille of their two half widths together (s: 90%, so two workers stand 54 cm apart). 0 turns making room off. */
export const SPACING_PM = 900;
/** Room enough: bodies closer than the spacing by no more than this are left where they are, so nothing shuffles for a hair's breadth (s: 2 cm). */
export const SPACING_SLACK_WU = floorDiv(WU_PER_METRE * 2, 100);
/** The fastest a body steps aside to make room (s: 1 m/s, a third of a walk). */
export const SPREAD_SPEED_WU = floorDiv(WU_PER_METRE, STEPS_PER_SECOND);
/** Share of the overlap left that a body makes up each step, before the speed cap (s: half, so it eases to a stop). */
export const SPREAD_PULL_PM = 500;
/** Most bodies one body looks at in a step (the cost cap in a dense horde) (s). */
export const SPACING_SCAN = 32;
/** Most overlapping bodies one body makes room from at once (s). */
export const SPACING_NEIGHBOURS = 8;

/** How a body takes part (see the head of the file). */
const Part = {
  /** Not at all: walking, flying, climbing, inside, or not a body that stands. */
  None: 0,
  /** Gives no way; others make room round it. */
  Still: 1,
  /** Gives way freely. */
  Free: 2,
  /** Gives way within reach, range or the follow distance of something. */
  Tether: 3,
  /** Gives way only inside its own column. */
  Cell: 4,
} as const;

/** Bodies at least this wide (half width) are looked at by everyone rather than kept in the buckets: few and big (engines, colossi, lairs). */
const BIG_HALF_WU = floorDiv(WU_PER_METRE * 8, 10);
/** Buckets are 2^14 wu (2.05 m) square. */
const BUCKET_SHIFT = 14;
/** A body keeps this far off a column edge it may not step across (it never moves farther out than it stands): a quarter column, 11 cm. */
const EDGE_MARGIN_WU = WU_PER_COLUMN >> 2;
/** A shuffle at least this long a step shows: the body turns that way and walks; less, it settles in place. */
const SHUFFLE_SHOWS_WU = SPREAD_SPEED_WU >> 2;

// Not state: scratch rebuilt on every call.
let cap = 0;
let ent = new Int32Array(0);
let px = new Int32Array(0);
let pz = new Int32Array(0);
let hw = new Int32Array(0);
let part = new Uint8Array(0);
let pushX = new Int32Array(0);
let pushZ = new Int32Array(0);
let nextIn = new Int32Array(0);
/** A tethered body's anchor: the unit's index, the least and most gap it keeps, and whether a wall may not come between. */
let tRef = new Int32Array(0);
let tMin = new Int32Array(0);
let tMax = new Int32Array(0);
let tWall = new Uint8Array(0);
let slots = 0;
let keyX = new Int32Array(0);
let keyZ = new Int32Array(0);
let head = new Int32Array(0);
const big: number[] = [];

function grow(n: number): void {
  if (n <= cap) return;
  cap = Math.max(64, n * 2);
  ent = new Int32Array(cap);
  px = new Int32Array(cap);
  pz = new Int32Array(cap);
  hw = new Int32Array(cap);
  part = new Uint8Array(cap);
  pushX = new Int32Array(cap);
  pushZ = new Int32Array(cap);
  nextIn = new Int32Array(cap);
  tRef = new Int32Array(cap);
  tMin = new Int32Array(cap);
  tMax = new Int32Array(cap);
  tWall = new Uint8Array(cap);
  slots = 64;
  while (slots < cap * 2) slots *= 2;
  keyX = new Int32Array(slots);
  keyZ = new Int32Array(slots);
  head = new Int32Array(slots);
}

/** The bucket table's slot for a bucket: linear probing from its hash; an empty slot (head -1) when the bucket has no one. */
function slotOf(cx: number, cz: number): number {
  const mask = slots - 1;
  let s = (Math.imul(cx, 0x9e3779b1) ^ Math.imul(cz, 0x85ebca77)) & mask;
  while (head[s] !== -1 && (keyX[s] !== cx || keyZ[s] !== cz)) s = (s + 1) & mask;
  return s;
}

function mulPm(v: number, pm: number): number {
  return floorDiv(v * pm, 1000);
}

/** Whether a body gives way at all (and so takes half a pair's overlap rather than all of it). */
function gives(p: number): boolean {
  return part[p] !== Part.Still;
}

/**
 * Makes room for one step: every body standing about is eased out of the
 * bodies it overlaps (see the head of the file). Called once a step after
 * every unit has acted.
 */
export function updateSpacing(state: SimState): void {
  if (SPACING_PM <= 0) return;
  const e = state.entities;
  grow(e.count);
  big.length = 0;
  head.fill(-1);
  let n = 0;
  let maxSmall = 0;
  for (let i = 0; i < e.count; i++) {
    const p = classify(state, i, n);
    if (p === Part.None) continue;
    part[n] = p;
    ent[n] = i;
    px[n] = e.x[i]!;
    pz[n] = e.z[i]!;
    hw[n] = halfWidth(state, i);
    pushX[n] = 0;
    pushZ[n] = 0;
    if (hw[n]! >= BIG_HALF_WU) big.push(n);
    else {
      maxSmall = Math.max(maxSmall, hw[n]!);
      const s = slotOf(px[n]! >> BUCKET_SHIFT, pz[n]! >> BUCKET_SHIFT);
      if (head[s] === -1) {
        keyX[s] = px[n]! >> BUCKET_SHIFT;
        keyZ[s] = pz[n]! >> BUCKET_SHIFT;
      }
      nextIn[n] = head[s]!;
      head[s] = n;
    }
    n++;
  }
  if (n < 2) return;
  // How far each body is pushed, all from where everyone stood before anyone moved.
  for (let p = 0; p < n; p++) if (gives(p)) gather(state, p, maxSmall);
  for (let p = 0; p < n; p++) if (gives(p) && (pushX[p] !== 0 || pushZ[p] !== 0)) give(state, p);
}

/** Sums the pushes on body p from the bodies it overlaps, at most SPACING_NEIGHBOURS of the SPACING_SCAN it looks at. */
function gather(state: SimState, p: number, maxSmall: number): void {
  const r = mulPm(hw[p]! + maxSmall, SPACING_PM);
  const x = px[p]!;
  const z = pz[p]!;
  const cx0 = (x - r) >> BUCKET_SHIFT;
  const cx1 = (x + r) >> BUCKET_SHIFT;
  const cz0 = (z - r) >> BUCKET_SHIFT;
  const cz1 = (z + r) >> BUCKET_SHIFT;
  let scanned = 0;
  let hits = 0;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let q = head[slotOf(cx, cz)]!; q !== -1 && scanned < SPACING_SCAN && hits < SPACING_NEIGHBOURS; q = nextIn[q]!) {
        if (q === p) continue;
        scanned++;
        if (overlap(state, p, q)) hits++;
      }
    }
  }
  for (const q of big) {
    if (hits >= SPACING_NEIGHBOURS) break;
    if (q !== p && overlap(state, p, q)) hits++;
  }
}

/** Adds q's push on p if their bodies overlap by more than the slack; true if they do. */
function overlap(state: SimState, p: number, q: number): boolean {
  const want = mulPm(hw[p]! + hw[q]!, SPACING_PM);
  const near = want - SPACING_SLACK_WU;
  if (near <= 0) return false;
  const dx = px[p]! - px[q]!;
  const dz = pz[p]! - pz[q]!;
  if (dx >= near || dx <= -near || dz >= near || dz <= -near) return false;
  const d2 = dx * dx + dz * dz;
  if (d2 >= near * near) return false;
  const d = isqrt(d2);
  // Half the overlap each when both give way; all of it when q stands fast.
  const amount = gives(q) ? (want - d) >> 1 : want - d;
  if (d === 0) {
    // Exactly on top of each other: a way apart that only the pair decides, opposite for each.
    const e = state.entities;
    const a = e.id[ent[p]!]!;
    const b = e.id[ent[q]!]!;
    const angle = hash32(state.seed, Math.min(a, b), Math.max(a, b)) & 0xffff;
    const sign = a < b ? 1 : -1;
    pushX[p] = pushX[p]! + sign * floorDiv(cos16(angle) * amount, 65536);
    pushZ[p] = pushZ[p]! + sign * floorDiv(sin16(angle) * amount, 65536);
    return true;
  }
  pushX[p] = pushX[p]! + floorDiv(dx * amount, d);
  pushZ[p] = pushZ[p]! + floorDiv(dz * amount, d);
  return true;
}

/** Moves body p by its push, eased and capped, as far as its part and the land allow. */
function give(state: SimState, p: number): void {
  const e = state.entities;
  const i = ent[p]!;
  const kind = part[p]!;
  const mag = length2d(pushX[p]!, pushZ[p]!);
  if (mag === 0) return;
  const step = Math.min(SPREAD_SPEED_WU, Math.max(1, ceilDiv(mag * SPREAD_PULL_PM, 1000)));
  const dx = floorDiv(pushX[p]! * step, mag);
  const dz = floorDiv(pushZ[p]! * step, mag);
  if (dx === 0 && dz === 0) return;
  const x0 = e.x[i]!;
  const z0 = e.z[i]!;
  let nx = x0 + dx;
  let nz = z0 + dz;
  if (kind === Part.Tether) {
    const kept = tether(state, p, nx, nz);
    if (!kept) return;
    [nx, nz] = kept;
  }
  const m = e.kind[i] === UnitKind.Mob ? mobMover(mobSpec(e.mob[i]!)) : moverOf(state, i);
  const to = settle(state, i, nx, nz, m, kind !== Part.Cell);
  if (to[0] === x0 && to[1] === z0) return;
  if (kind === Part.Tether) {
    // The land may have turned the move: it still has to keep the tether, and a wall may not come between a fighter and its foe.
    if (!tether(state, p, to[0], to[1], true)) return;
    if (tWall[p] && walled(state, i, tRef[p]!, to[0], to[1])) return;
  }
  landAt(state, i, to[0], to[1]);
  // An idle body making room turns and steps that way; a small settling, a fighter or a worker just shifts.
  if (kind === Part.Free && length2d(to[0] - x0, to[1] - z0) >= SHUFFLE_SHOWS_WU) {
    e.order[i] = OrderKind.Move;
    e.heading[i] = headingTowards(to[0] - x0, to[1] - z0);
  }
}

/**
 * Where a tethered body may go towards (x, z): the point itself, or pulled
 * back to the farthest (and pushed out to the nearest) its tether allows,
 * never worse than where it stands now. With `exact`, only a point already
 * inside is kept (null otherwise).
 */
function tether(state: SimState, p: number, x: number, z: number, exact = false): [number, number] | null {
  const e = state.entities;
  const i = ent[p]!;
  // Gaps are edge to edge (combat.ts gap): the tether's limits plus the anchor's half width, centre to centre.
  const t = tRef[p]!;
  const ax = e.x[t]!;
  const az = e.z[t]!;
  const r = halfWidth(state, t);
  const now = length2d(e.x[i]! - ax, e.z[i]! - az);
  const most = Math.max(tMax[p]! + r, now);
  const least = tMin[p]! > 0 ? Math.min(tMin[p]! + r, now) : 0;
  const d = length2d(x - ax, z - az);
  if (d <= most && d >= least) return [x, z];
  if (exact || d === 0) return null;
  const to = d > most ? most : least;
  return [ax + floorDiv((x - ax) * to, d), az + floorDiv((z - az) * to, d)];
}

/** Whether a wall would stand between unit i at (x, z) and unit t (melee reach does not go through walls). */
function walled(state: SimState, i: number, t: number, x: number, z: number): boolean {
  const e = state.entities;
  const ox = e.x[i]!;
  const oz = e.z[i]!;
  e.x[i] = x;
  e.z[i] = z;
  const w = wallBetween(state, i, t);
  e.x[i] = ox;
  e.z[i] = oz;
  return w;
}

/**
 * How far towards (x, z) unit i can go this step, as a point: within its own
 * column always; across into the next only with `cross`, by a plain step (dry,
 * no higher or lower than a stair) its mover may make, and not onto a
 * building's plot it is not already on. A diagonal that is shut slides along
 * whichever side is open; what is left stops short of its column's edge by
 * the margin, so no one is shoved flat against a wall face.
 */
function settle(state: SimState, i: number, x: number, z: number, m: Mover, cross: boolean): [number, number] {
  const e = state.entities;
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  // Where the move heads, looked at a margin past where it ends.
  const ncx = floorDiv(x + ahead(x - e.x[i]!), WU_PER_COLUMN);
  const ncz = floorDiv(z + ahead(z - e.z[i]!), WU_PER_COLUMN);
  if (ncx === cx && ncz === cz) return [x, z];
  const inX = keepIn(x, cx, e.x[i]!);
  const inZ = keepIn(z, cz, e.z[i]!);
  if (!cross) return [inX, inZ];
  const layer = state.nav.layerAt(cx, cz, floorDiv(e.y[i]!, WU_PER_TERRAIN_UNIT));
  const plot = state.buildings.footprintAt(cx, cz);
  const open = (bx: number, bz: number): boolean => {
    const f = state.buildings.footprintAt(bx, bz);
    if (f !== 0 && f !== plot) return false;
    return state.nav.plainStep(cx, cz, layer, bx, bz, m) >= 0;
  };
  if (open(ncx, ncz)) return [x, z];
  if (ncx !== cx && open(ncx, cz)) return [x, inZ];
  if (ncz !== cz && open(cx, ncz)) return [inX, z];
  return [inX, inZ];
}

/** The margin, the way a move of d goes (none for no move). */
function ahead(d: number): number {
  return d > 0 ? EDGE_MARGIN_WU : d < 0 ? -EDGE_MARGIN_WU : 0;
}

/** v kept inside column c, off its edges by the margin, but never moved farther out than `now`. */
function keepIn(v: number, c: number, now: number): number {
  const lo = Math.min(c * WU_PER_COLUMN + EDGE_MARGIN_WU, now);
  const hi = Math.max((c + 1) * WU_PER_COLUMN - 1 - EDGE_MARGIN_WU, now);
  return Math.min(Math.max(v, lo), hi);
}

/** Order kinds of a unit at its job where it stands. */
function atWork(order: number): boolean {
  return order === OrderKind.Chop || order === OrderKind.Mine || order === OrderKind.Farm || order === OrderKind.Dig || order === OrderKind.Tinker;
}

/** Order kinds of a body on its way somewhere this step. */
function onTheMove(order: number): boolean {
  return order === OrderKind.Move || order === OrderKind.Carry || order === OrderKind.Swim || order === OrderKind.Climb || order === OrderKind.Flee;
}

/** Sets participant p's tether to a unit, keeping its gap (edge to edge) between `least` and `most`. */
function tieToUnit(p: number, t: number, least: number, most: number, wall: boolean): number {
  tRef[p] = t;
  tMin[p] = least;
  tMax[p] = most;
  tWall[p] = wall ? 1 : 0;
  return Part.Tether;
}

/** How unit i takes part this step (p is its participant slot, for a tether). */
function classify(state: SimState, i: number, p: number): number {
  const e = state.entities;
  if (e.hp[i]! <= 0 || e.inside[i] !== 0) return Part.None;
  const kind = e.kind[i]!;
  const order = e.order[i]!;
  if (kind === UnitKind.Wanderer) return Part.None;
  if (kind === UnitKind.Engine) return onTheMove(order) ? Part.None : Part.Still;
  if (kind === UnitKind.Mob) return classifyMob(state, i, p);
  if (kind === UnitKind.Animal) {
    if (onTheMove(order)) return Part.None;
    // A working animal, the peoples' beasts, one being tamed or one fighting stand fast.
    if (e.partner[i] || e.owner[i] === PEOPLES || e.target[i] !== 0 || (e.owner[i] === WILD && e.waitUntil[i]! > state.step)) return Part.Still;
    return order === OrderKind.Idle ? Part.Free : Part.Still;
  }
  // The players' and the peoples' workers, warriors and mages.
  if (e.heldUntil[i]! > state.step || e.partner[i]) return Part.Still;
  if (atWork(order)) return Part.Cell;
  if (onTheMove(order)) return Part.None;
  if (order !== OrderKind.Idle) return Part.Still;
  if (e.target[i] !== 0) {
    if (kind === UnitKind.Mage || e.atkAt[i] !== 0) return Part.Still;
    const t = e.indexOf(e.target[i]!);
    if (t < 0 || e.hp[t]! <= 0 || e.inside[t] !== 0) return Part.Still;
    const r = e.lock[i] === Lock.Melee ? null : rangedOf(state, i);
    if (r && (gap(state, i, t) > RANGED_MIN_WU || e.lock[i] === Lock.Ranged)) return tieToUnit(p, t, e.lock[i] === Lock.Ranged ? 0 : RANGED_MIN_WU + 1, r.range, false);
    const reach = meleeOf(state, i).reach;
    return tieToUnit(p, t, 0, reach, reach < OVER_WALL_REACH);
  }
  const o = e.queue[i]![0];
  if (!o) return e.chasing[i] === 0 ? Part.Free : Part.Still;
  if (o.t === 'follow') {
    const t = e.indexOf(o.id);
    if (t < 0 || t === i || e.inside[t] !== 0) return Part.Still;
    return tieToUnit(p, t, 0, FOLLOW_WU - (WU_PER_COLUMN >> 1) - halfWidth(state, t), false);
  }
  if (o.t === 'crew') {
    const t = e.indexOf(o.id);
    if (t < 0 || e.inside[t] !== 0) return Part.Still;
    return tieToUnit(p, t, 0, CREW_REACH_WU - WU_PER_METRE - (WU_PER_COLUMN >> 1) - halfWidth(state, t), false);
  }
  return Part.Still;
}

/** How a monster takes part this step. */
function classifyMob(state: SimState, i: number, p: number): number {
  const e = state.entities;
  const spec = mobSpec(e.mob[i]!);
  if (flies(spec) || e.climbUntil[i] !== 0) return Part.None;
  // Lairs, huts and totems, a loose bomb, one held by a slime or mid-swing: it stands fast.
  if (spec.role === Role.Structure || spec.moves === Moves.Still || e.heldUntil[i]! > state.step || e.atkAt[i] !== 0) return Part.Still;
  const order = e.order[i]!;
  // On its way: it passes through, as a unit walking does.
  if (onTheMove(order)) return Part.None;
  if (order !== OrderKind.Idle) return Part.Still;
  if (e.atkNext[i]! <= state.step) return Part.Free;
  // Getting its breath back between blows. Chewing at a wall or a building, it stands fast: the piece it chews is
  // the one on its line to its foe, so a horde shifted along a wall would share its bites out between the pieces.
  const what = e.atkWith[i]!;
  if (what === MOB_WITH.Building) return Part.Still;
  // Otherwise in reach (or range) of what it struck.
  const t = e.indexOf(e.target[i]!);
  if (t < 0 || e.hp[t]! <= 0 || e.inside[t] !== 0) return Part.Still;
  if (what === MOB_WITH.Unit) return tieToUnit(p, t, 0, spec.reach, spec.reach < OVER_WALL_REACH);
  if (what === MOB_WITH.Shot) return tieToUnit(p, t, spec.reach + WU_PER_METRE + 1, spec.range, false);
  if (what === MOB_WITH.Web) return tieToUnit(p, t, spec.reach + 1, spec.range, false);
  // Spells and putting out lights keep their own ranges: it stands.
  return Part.Still;
}

/** What a mob's attack is aimed at (combat/mob-ai.ts With): a unit, a building, a shot or a web. */
const MOB_WITH = { Unit: 0, Building: 1, Shot: 3, Web: 5 } as const;
