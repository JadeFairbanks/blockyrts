// Gathering by itself (Jade's play-test notes, 2026-10-03). The Gather
// button no longer waits for a click on a node: workers go out for the basic
// materials the side needs at its level, from nodes someone has seen, no
// farther than they must. When none is known within reach they look farther
// out, never more than 25 m into land no one has seen: round the edge of the
// explored land nearest the base first, sweeping on round it, so that on a
// blank map the search is a widening spiral, and where hunters or the player
// went farther they search the edges of that too. At dusk they come back to
// the nearest main base and go in, unless they may work on through the night
// and ask (Jade's Patch 4, units/night-work.ts); they come out again at dawn
// once no monster is near, or in the day, and carry on.
//
// The same choice, distance weighed against need, picks what a worker
// gathers next when its node runs out and there is no more of it nearby; it
// says why (10 flint and no stone, the flint closer: it still goes for the
// stone, because the side has none).
//
// Hunters and gatherers alike go no farther from the nearest main base than
// they can walk back from to within 4 m of it in the 40 s of dusk.

import { BuildingKind, forgeStep } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { mainBaseLevel } from '../buildings/placement.ts';
import { solidRect, type Building } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { Res, RESOURCES } from '../economy/resources.ts';
import { atan2Angle, cos16, floorDiv, length2d, sin16, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { mountSpec } from '../mounts/data.ts';
import { pointGoal } from '../nav/path.ts';
import { chatter, say } from '../peoples/speech.ts';
import { hash32 } from '../rng.ts';
import { DUSK_STEPS } from '../rules.ts';
import { UnitKind, type SimState } from '../state.ts';
import { CHUNK_SHIFT, chunkKey } from '../world/chunk.ts';
import { propInfo } from '../world/props.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import { Act, besideBuilding, columnCentre, FAILED, gatherable, MOVING, nearestDropoff, nearestStandable, nodeResource, resetWalk, shelterRoom, unitsInside, walkTo, workersOnNode } from './behaviour.ts';
import { bagEmpty } from './loot.ts';
import { ENTER_NIGHT, FORAGE_HOME, FORAGE_NIGHT, type UnitOrder } from './unit-orders.ts';
import { cartSpeed } from './weight.ts';

/** A basic material gatherers fetch by themselves once the side can use it: from main base tier `base` and Forge step `forge` (buildings/data.ts forgeStep; 0: no Forge needed), counted as plenty at `plenty` in the stock. */
export interface ForageGood {
  res: Res;
  base: number;
  forge: number;
  plenty: number;
}

/**
 * What gatherers fetch by themselves (s): wood, sticks, stone and flint from
 * the start; clay, sand and coal once the main base reaches tier 2 (the
 * Forge's bricks and wrought iron need them); copper and tin ore once a
 * Forge stands, bog iron and iron rock at its wrought iron step; marble
 * from main base tier 3 (the Citadel needs it). Each is wanted the more
 * the further the stock is below plenty.
 */
export const FORAGE_GOODS: readonly ForageGood[] = [
  { res: Res.SoftwoodLumber, base: 1, forge: 0, plenty: 120 },
  { res: Res.HardwoodLumber, base: 1, forge: 0, plenty: 80 },
  { res: Res.Sticks, base: 1, forge: 0, plenty: 40 },
  { res: Res.Stone, base: 1, forge: 0, plenty: 100 },
  { res: Res.Flint, base: 1, forge: 0, plenty: 40 },
  { res: Res.Clay, base: 2, forge: 0, plenty: 40 },
  { res: Res.Sand, base: 2, forge: 0, plenty: 30 },
  { res: Res.Coal, base: 2, forge: 0, plenty: 40 },
  { res: Res.CopperOre, base: 1, forge: 1, plenty: 40 },
  { res: Res.TinOre, base: 1, forge: 1, plenty: 20 },
  { res: Res.BogIron, base: 1, forge: 2, plenty: 40 },
  { res: Res.IronRock, base: 1, forge: 2, plenty: 40 },
  { res: Res.Marble, base: 3, forge: 0, plenty: 40 },
];
/** How much a material counts against distance, per mille: this much at plenty, rising to 1000 more at none (s). */
export const FORAGE_NEED_FLOOR_PM = 100;
/** A material the side has none of counts double again (s). */
export const FORAGE_EMPTY_PCT = 200;
/** Gatherers go no more than 25 m into land no one has seen (Jade). */
export const FORAGE_DARK_M = 25;
/** Each sixth of a turn round the base from the last bearing counts as this much farther, so the search sweeps round (s): 10 m. */
export const FORAGE_TURN_M = 10;
/** When its node runs out with no more of it nearby, a worker looks this far for what to gather next (s): 30 m. */
export const GATHER_SWITCH_M = 30;
/** Hunters and gatherers turn back at dusk from no farther than they can walk in the 40 s of dusk, paths taken as this much longer than a straight line, per mille (s). */
export const HOME_PATH_PM = 800;
/** ...to within 4 m of the nearest main base (Jade). */
export const HOME_SLACK_M = 4;

const M = WU_PER_METRE;
const CONTINUE = false;
const DONE = true;
/** A sixth of a turn, in 16-bit angle units. */
const SIXTH = 10923;
/** Kinds of quiet line, for chatter's spacing. */
const Talk = { Off: 1, Look: 2, Dusk: 4, Gone: 5 } as const;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

/**
 * Working through the night (Jade's Patch 4), set by units/night-work.ts so
 * this module never imports the questions: whether a worker that dusk finds
 * gathering by itself works on (and asks), where it may gather while it does,
 * and whether a shelter is clear of monsters for coming out at dawn.
 */
export const nightHooks: {
  workOn: (state: SimState, i: number, o: Extract<UnitOrder, { t: 'forage' }>) => boolean;
  reach: (state: SimState) => (x: number, z: number) => boolean;
  clear: (state: SimState, b: Building) => boolean;
} = { workOn: () => false, reach: () => () => true, clear: () => true };

// ----- home and reach -----

/** The main base a unit comes home to, and how far from it (wu, from the building's edge) it may go. */
export interface Home {
  b: Building;
  x: number;
  z: number;
  reach: number;
}

/** A unit's own pace when walking home: its mount's trot, its cart's pace, or its feet. */
function homePace(state: SimState, i: number): number {
  const e = state.entities;
  if (e.mount[i]) return mountSpec(e.mount[i]!).trot;
  const cart = cartSpeed(state, i);
  return cart > 0 ? Math.min(cart, e.speed[i]!) : e.speed[i]!;
}

/** The distance from a point to a building's solid part, wu. */
export function fromBuilding(b: Building, x: number, z: number): number {
  const [x0, z0, x1, z1] = solidRect(b);
  const wx0 = x0 * WU_PER_COLUMN;
  const wz0 = z0 * WU_PER_COLUMN;
  const wx1 = (x1 + 1) * WU_PER_COLUMN;
  const wz1 = (z1 + 1) * WU_PER_COLUMN;
  const dx = x < wx0 ? wx0 - x : x > wx1 ? x - wx1 : 0;
  const dz = z < wz0 ? wz0 - z : z > wz1 ? z - wz1 : 0;
  return length2d(dx, dz);
}

/** The player's finished main base nearest a point, or undefined. */
export function homeBaseNear(state: SimState, player: number, x: number, z: number): Building | undefined {
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== player || b.kind !== BuildingKind.MainBase || !b.complete) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, x, z);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/**
 * Where a unit is based, and how far out it may go: as far as it can walk
 * back from in dusk's 40 s at its own pace (paths a fifth longer than the
 * straight line), plus the 4 m it may stop short. Undefined with no main base.
 */
export function homeOf(state: SimState, i: number): Home | undefined {
  const e = state.entities;
  const b = homeBaseNear(state, e.owner[i]!, e.x[i]!, e.z[i]!);
  if (!b) return undefined;
  const [x, z] = buildingCentre(b);
  return { b, x, z, reach: HOME_SLACK_M * M + floorDiv(homePace(state, i) * DUSK_STEPS * HOME_PATH_PM, 1000) };
}

/** Whether a point lies beyond a unit's reach from home (never, with no main base). */
export function beyondReach(state: SimState, i: number, x: number, z: number): boolean {
  const h = homeOf(state, i);
  return h !== undefined && fromBuilding(h.b, x, z) > h.reach;
}

/**
 * The next place to look, out on the edge of the explored land within reach:
 * the edge nearest the base first, sweeping round from the bearing `from`
 * (16-bit angle round the base), then on into the dark as far as 25 m and the
 * reach allow. Null when no edge lies within reach.
 */
export function exploreTarget(state: SimState, h: Home, from: number): { x: number; z: number; ang: number } | null {
  const edge = state.world.darkEdge();
  const tile = WU_PER_COLUMN * FOG_TILE_COLUMNS;
  const turnWu = FORAGE_TURN_M * M;
  let best = -1;
  let bestCost = 0;
  let bestAng = 0;
  for (let k = 0; k < edge.length; k += 2) {
    const x = edge[k]! * tile + (tile >> 1);
    const z = edge[k + 1]! * tile + (tile >> 1);
    if (fromBuilding(h.b, x, z) > h.reach) continue;
    const ang = atan2Angle(z - h.z, x - h.x);
    const turn = (ang - from) & 0xffff;
    const cost = length2d(x - h.x, z - h.z) + floorDiv(turn * turnWu, SIXTH);
    if (best < 0 || cost < bestCost) {
      best = k;
      bestCost = cost;
      bestAng = ang;
    }
  }
  if (best < 0) return null;
  const ex = edge[best]! * tile + (tile >> 1);
  const ez = edge[best + 1]! * tile + (tile >> 1);
  // On into the dark, straight out from the base, no more than 25 m and never past the reach.
  const out = Math.max(0, Math.min(FORAGE_DARK_M * M, h.reach - fromBuilding(h.b, ex, ez)));
  const tx = ex + floorDiv(cos16(bestAng) * out, 65536);
  const tz = ez + floorDiv(sin16(bestAng) * out, 65536);
  const [cx, cz] = nearestStandable(state, col(tx), col(tz), 6);
  return { x: columnCentre(cx), z: columnCentre(cz), ang: bestAng };
}

/** A point within reach to look about from when the land within reach is all explored: a seeded bearing, half to most of the way out. */
export function wanderTarget(state: SimState, h: Home, i: number): { x: number; z: number; ang: number } {
  const r = hash32(state.seed, state.entities.id[i]!, state.step);
  const ang = r & 0xffff;
  const d = floorDiv(h.reach * (50 + ((r >>> 16) % 41)), 100) + floorDiv(WU_PER_COLUMN * 5, 2);
  const [cx, cz] = nearestStandable(state, col(h.x + floorDiv(cos16(ang) * d, 65536)), col(h.z + floorDiv(sin16(ang) * d, 65536)), 6);
  return { x: columnCentre(cx), z: columnCentre(cz), ang };
}

// ----- what the side needs -----

/** Whether the player has a finished Forge. */
function hasForge(state: SimState, player: number): boolean {
  return state.buildings.list.some((b) => b.owner === player && b.kind === BuildingKind.Forge && b.complete);
}

/** How much each material the side can use now is wanted, per mille (0 for one it cannot use yet), by resource. */
export function wants(state: SimState, player: number): Map<number, number> {
  const pool = state.players[player]!.pool;
  const base = mainBaseLevel(state, player);
  const forge = forgeStep(hasForge(state, player), base);
  const out = new Map<number, number>();
  for (const g of FORAGE_GOODS) {
    if (base < g.base || forge < g.forge) continue;
    const have = pool[g.res]!;
    const short = have >= g.plenty ? 0 : floorDiv((g.plenty - have) * 1000, g.plenty);
    const w = FORAGE_NEED_FLOOR_PM + short;
    out.set(g.res, have <= 0 ? floorDiv(w * FORAGE_EMPTY_PCT, 100) : w);
  }
  return out;
}

/** Whether a material is one gatherers fetch by themselves. */
export function basicMaterial(res: number): boolean {
  return FORAGE_GOODS.some((g) => g.res === res);
}

/** A node to gather and what it gives, and how far away it is, wu. */
export interface NodePick {
  cx: number;
  cz: number;
  i: number;
  res: number;
  d: number;
}

/**
 * The node a worker should gather next, near (x, z) wu: one of the
 * materials in `want` (resource to per mille), on explored land only, that
 * its tools can work and that has room, within `max` wu and passing `fits`.
 * Distance is weighed against need: the cost is the distance over the need,
 * the lowest wins (ties to the lower chunk and index). It looks in widening
 * rings and stops once no node farther out could do better.
 */
export function chooseNode(state: SimState, i: number, x: number, z: number, max: number, want: Map<number, number>, fits?: (x: number, z: number) => boolean, skip?: { cx: number; cz: number; i: number }): NodePick | null {
  if (want.size === 0) return null;
  let top = 0;
  for (const w of want.values()) top = Math.max(top, w);
  if (top <= 0) return null;
  const gx = col(x);
  const gz = col(z);
  const world = state.world;
  let best: NodePick | null = null;
  let bestCost = 0;
  const rings = [15 * M, 30 * M, 60 * M, 120 * M, 240 * M].filter((r) => r < max);
  rings.push(max);
  for (const r of rings) {
    const rc = floorDiv(r, WU_PER_COLUMN) + 1;
    for (let cz = (gz - rc) >> CHUNK_SHIFT; cz <= (gz + rc) >> CHUNK_SHIFT; cz++) {
      for (let cx = (gx - rc) >> CHUNK_SHIFT; cx <= (gx + rc) >> CHUNK_SHIFT; cx++) {
        // Land no one has seen holds nothing a worker knows of.
        if (!world.explored.has(chunkKey(cx, cz))) continue;
        for (const p of world.props(cx, cz, state.step)) {
          const res = nodeResource(p.kind);
          const w = res >= 0 ? (want.get(res) ?? 0) : 0;
          if (w <= 0) continue;
          if (skip && skip.cx === cx && skip.cz === cz && skip.i === p.index) continue;
          const px = (cx << CHUNK_SHIFT) + p.lx;
          const pz = (cz << CHUNK_SHIFT) + p.lz;
          const wx = columnCentre(px);
          const wz = columnCentre(pz);
          const d = length2d(wx - x, wz - z);
          if (d > r) continue;
          const cost = floorDiv(d * 1000, w);
          // The cheap tests first; ties go to the lower chunk row, chunk and index.
          if (best && notBetter(cost, cz, cx, p.index, bestCost, best)) continue;
          if (!world.isExplored(floorDiv(px, FOG_TILE_COLUMNS), floorDiv(pz, FOG_TILE_COLUMNS)) || !gatherable(state, i, p)) continue;
          if (fits && !fits(wx, wz)) continue;
          if (workersOnNode(state, cx, cz, p.index, i) >= propInfo(p.kind).gatherers) continue;
          best = { cx, cz, i: p.index, res, d };
          bestCost = cost;
        }
      }
    }
    // Nothing farther than r can cost less than r over the greatest need.
    if (best && bestCost <= floorDiv(r * 1000, top)) return best;
  }
  return best;
}

/** Whether a node at this cost and place loses to the best so far: a higher cost, or the same and later in chunk row, chunk and index order. */
function notBetter(cost: number, cz: number, cx: number, index: number, bestCost: number, best: NodePick): boolean {
  if (cost !== bestCost) return cost > bestCost;
  if (cz !== best.cz) return cz > best.cz;
  if (cx !== best.cx) return cx > best.cx;
  return index >= best.i;
}

// ----- a node runs out -----

function resName(res: number): string {
  return RESOURCES[res]!.short.toLowerCase();
}

/**
 * Its node ran out and there is no more of it nearby: the worker picks what
 * to gather next within 30 m (within its reach from home when it gathers by
 * itself), distance weighed against need, and says so. Only basic materials
 * switch like this; null when nothing will do.
 */
export function nextNode(state: SimState, i: number, res: number, x: number, z: number, skip: { cx: number; cz: number; i: number }, foraging: boolean): NodePick | null {
  if (!basicMaterial(res)) return null;
  const e = state.entities;
  const player = e.owner[i]!;
  const want = wants(state, player);
  // The material it was on counts even if the side has no use for more just now.
  if (!want.has(res)) want.set(res, FORAGE_NEED_FLOOR_PM);
  const h = foraging ? homeOf(state, i) : undefined;
  const max = h ? h.reach + fromBuilding(h.b, x, z) : GATHER_SWITCH_M * M;
  const fits = h ? (px: number, pz: number): boolean => fromBuilding(h.b, px, pz) <= h.reach : undefined;
  const pick = chooseNode(state, i, x, z, max, want, fits, skip);
  if (!pick) return null;
  const was = resName(res);
  const pool = state.players[player]!.pool;
  if (pick.res === res) {
    chatter(state, i, Talk.Gone, 30 * STEPS_PER_SECOND, `No more ${was} here. I'll fetch ${was} from farther off.`);
    return pick;
  }
  const now = resName(pick.res);
  const good = FORAGE_GOODS.find((g) => g.res === pick.res);
  const have = pool[pick.res]!;
  const low = have <= 0 ? 'out of' : good && have * 4 < good.plenty ? 'low on' : '';
  // Was something else it could use closer than what it chose? Then it says why it goes past it.
  const flat = new Map([...want.keys()].map((r) => [r, 1000]));
  const near = low ? chooseNode(state, i, x, z, pick.d, flat, fits, skip) : null;
  let line: string;
  if (low && near && near.res !== pick.res && near.d < pick.d) line = `No more ${was} here, and we're ${low} ${now}. I'll fetch ${now}, though there's ${resName(near.res)} closer.`;
  else if (low) line = `No more ${was} here. We're ${low} ${now}, so I'll gather that.`;
  else line = `No more ${was} here. I'll gather ${now} instead.`;
  chatter(state, i, Talk.Gone, 30 * STEPS_PER_SECOND, line);
  return pick;
}

// ----- the order -----

const DUSK_LINES = ['Getting dark. Back to the base.', 'Dusk already. Heading home.', 'Back to the base before nightfall.'] as const;

/** At dusk: drop off what it carries, then into the nearest main base for the night (out again at dawn once no monster is near, or in the day), or wait beside it when it is full. */
function homeForNight(state: SimState, i: number, o: Extract<UnitOrder, { t: 'forage' }>): boolean {
  const e = state.entities;
  if (o.k !== FORAGE_HOME) {
    o.k = FORAGE_HOME;
    resetWalk(state, i);
    chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, DUSK_LINES[e.id[i]! % DUSK_LINES.length]!);
  }
  if ((e.carryAmt[i]! > 0 || !bagEmpty(state, i)) && state.step >= e.waitUntil[i]!) {
    e.waitUntil[i] = state.step + 10 * STEPS_PER_SECOND;
    if (nearestDropoff(state, i, e.carryAmt[i]! > 0 ? e.carryRes[i]! : -1)) {
      e.queue[i]!.unshift({ t: 'return' });
      e.act[i] = Act.Start;
      resetWalk(state, i);
      return CONTINUE;
    }
  }
  const b = homeBaseNear(state, e.owner[i]!, e.x[i]!, e.z[i]!);
  if (!b) return CONTINUE;
  const inside = unitsInside(state, b.id).filter((j) => e.kind[j] === UnitKind.Worker).length;
  if (inside < shelterRoom(b)) {
    e.queue[i]!.unshift({ t: 'enter', b: b.id, auto: ENTER_NIGHT });
    e.act[i] = Act.Start;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (walkTo(state, i, besideBuilding(b)) !== MOVING) resetWalk(state, i);
  return CONTINUE;
}

/** In the dark: whether a worker gathering by itself works on through the night (Jade's Patch 4), decided once a night, the first dark step it gathers. */
function worksOnTonight(state: SimState, i: number, o: Extract<UnitOrder, { t: 'forage' }>): boolean {
  if (o.k === FORAGE_HOME) return false;
  if (o.k === FORAGE_NIGHT) return true;
  return nightHooks.workOn(state, i, o);
}

/** A worker gathering by itself at a node, in the dark: whether it stops now to go home for the night (not when it works on through the night). */
export function goesHome(state: SimState, i: number): boolean {
  const o = state.entities.queue[i]![1];
  return o?.t !== 'forage' || !worksOnTonight(state, i, o);
}

export function runForage(state: SimState, i: number, o: Extract<UnitOrder, { t: 'forage' }>): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker) return DONE;
  const p = clockAt(state.step).period;
  const dark = p === Period.Dusk || p === Period.Night;
  if (dark) {
    if (!worksOnTonight(state, i, o)) return homeForNight(state, i, o);
  } else if (o.k === FORAGE_HOME) {
    // Out again in the day, or at dawn once no monster is near the main base (Jade's Patch 4; before it, at daybreak).
    if (p === Period.Dawn) {
      const b = homeBaseNear(state, e.owner[i]!, e.x[i]!, e.z[i]!);
      if (b && !nightHooks.clear(state, b)) return CONTINUE;
    }
    o.k = 0;
    o.res = -1;
  } else if (o.k === FORAGE_NIGHT) o.k = 0;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const h = homeOf(state, i);
  if (o.k !== 1 || state.step >= e.waitUntil[i]!) {
    // Exploring, it looks again every 2 s for something it now knows of.
    e.waitUntil[i] = state.step + 2 * STEPS_PER_SECOND;
    const x = e.x[i]!;
    const z = e.z[i]!;
    const max = h ? h.reach + fromBuilding(h.b, x, z) : GATHER_SWITCH_M * M;
    const home = h ? (px: number, pz: number): boolean => fromBuilding(h.b, px, pz) <= h.reach : undefined;
    // Working on through the night, only what lies near a building (s).
    const near = dark ? nightHooks.reach(state) : undefined;
    const fits = near ? (px: number, pz: number): boolean => (!home || home(px, pz)) && near(px, pz) : home;
    const pick = chooseNode(state, i, x, z, max, wants(state, e.owner[i]!), fits);
    if (pick) {
      if (pick.res !== o.res) chatter(state, i, Talk.Off, 30 * STEPS_PER_SECOND, `Off to gather ${resName(pick.res)}.`);
      o.res = pick.res;
      if (o.k === 1) o.k = 0;
      e.queue[i]!.unshift({ t: 'gather', cx: pick.cx, cz: pick.cz, i: pick.i });
      e.act[i] = Act.Start;
      e.timer[i] = 0;
      resetWalk(state, i);
      return CONTINUE;
    }
    if (dark) {
      // Nothing left near the buildings: in for the night, never out into the dark looking.
      o.k = FORAGE_HOME;
      resetWalk(state, i);
      chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'Nothing left to gather near the buildings. Heading in.');
      return homeForNight(state, i, o);
    }
    if (o.k !== 1) {
      if (!h) {
        // Nowhere to come home to and nothing near: the player has to step in.
        say(state, i, 'Nothing we need around here, and no main base to work from.', true);
        return DONE;
      }
      // Nothing it knows of within reach: out to the edge of what has been seen.
      const t = exploreTarget(state, h, o.ang) ?? wanderTarget(state, h, i);
      o.x = t.x;
      o.z = t.z;
      o.ang = t.ang;
      o.k = 1;
      resetWalk(state, i);
      chatter(state, i, Talk.Look, 60 * STEPS_PER_SECOND, 'Nothing we need around here. Looking farther out.');
    }
  }
  if (o.k === 1) {
    const r = walkTo(state, i, { ...pointGoal(col(o.x), col(o.z)), max: 2 });
    if (r === MOVING) return CONTINUE;
    // Cliffs or water in the way: on round to the next bearing.
    if (r === FAILED) o.ang = (o.ang + 4096) & 0xffff;
    o.k = 0;
    e.waitUntil[i] = 0;
    resetWalk(state, i);
  }
  return CONTINUE;
}

/** The Gather button's order for a worker: gather by itself, the first sweep starting from the bearing it stands at round its base. */
export function startForage(state: SimState, i: number): UnitOrder {
  const e = state.entities;
  const h = homeOf(state, i);
  const ang = h ? atan2Angle(e.z[i]! - h.z, e.x[i]! - h.x) : 0;
  return { t: 'forage', res: -1, x: 0, z: 0, k: 0, ang };
}
