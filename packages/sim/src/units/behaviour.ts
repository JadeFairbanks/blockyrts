// What units do each step (Units: Workers; Controls: Unit orders, Gathering
// resources, Building placement, Semi-automation). Each unit works through
// its own list of orders; the first is the current one and runs as a small
// state machine whose phase is the unit's `act`. Every decision reads only
// the state and the seeded streams, and units are visited in index order.

import { BuildingKind, buildingName, buildingSpec, levelSpec, REFUEL_STEPS, SHELTER_LOSS_PER_MILLE, workSteps, type BuildingSpec } from '../buildings/data.ts';
import { computeEnclosed, buildingCentre, dist2 } from '../buildings/lights.ts';
import { BLOCKED_TEXT, Blocked, buildRequirement, mainBaseLevel, placementBlocked } from '../buildings/placement.ts';
import { constructionHealth, footprintRect, maxHealth, solidRect, type Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { canAfford, costText, loadCapacity, pay, payNutrition, Res, resourceByName, RESOURCES, shortOf } from '../economy/resources.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { PERSON, Walk } from '../nav/grid.ts';
import { atGoal, pointGoal, type Goal } from '../nav/path.ts';
import { NO_CARRY, OrderKind, placeBuilding, standY, UnitKind, type SimState } from '../state.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { isTree, propInfo, PropShape, type Tool } from '../world/props.ts';
import type { PropView } from '../world/world.ts';
import type { UnitOrder } from './unit-orders.ts';

/** Phases of an order. */
export const Act = {
  /** Not begun: the order sets itself up on its first step. */
  Start: 0,
  Walk: 1,
  Work: 2,
  /** Carrying a load to a drop-off. */
  ToDrop: 3,
  /** Standing by: a node or building is full; try again at waitUntil. */
  Wait: 4,
  /** Inside a building. */
  Inside: 5,
} as const;

/** Path searches allowed per step, shared by every unit (the rest wait a step). */
export const PATH_SEARCHES_PER_STEP = 8;
/** How far a gatherer looks for another node of the same resource when one runs out or is full (s): 15 m. */
export const NODE_SEARCH_M = 15;
const NODE_SEARCH_COLUMNS = floorDiv(NODE_SEARCH_M * WU_PER_METRE, WU_PER_COLUMN);
/** Double-tapped Repair looks this far for damaged buildings (s). */
export const REPAIR_SEARCH_M = 30;
/** A follower stays within this distance of its leader. */
const FOLLOW_WU = 2 * WU_PER_METRE + (WU_PER_METRE >> 1);
/** Workers flee this far from an attacker (Table 1). */
export const FLEE_M = 10;
/** Builders that can work on one building at once (number tables, header: 4, or 8 on a main base). */
export function builderLimit(kind: number): number {
  return kind === BuildingKind.MainBase ? 8 : 4;
}
/** Gather speed by tool tier, per mille (Table 2c). */
export const TOOL_SPEED_PER_MILLE: readonly number[] = [1000, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 3500];
/** Worker health by rank (Table 1). */
export const WORKER_HEALTH_BY_RANK: readonly number[] = [60, 60, 70, 80, 90, 100];
/** Rank training at a main base (Table 7): to Hand, to Master. */
export const RANK_TRAINING: ReadonlyArray<{ rank: number; food: number; steps: number; base: number; name: string }> = [
  { rank: 2, food: 20, steps: 60 * STEPS_PER_SECOND, base: 2, name: 'Hand' },
  { rank: 3, food: 40, steps: 120 * STEPS_PER_SECOND, base: 5, name: 'Master worker' },
];

const MOVING = 0;
const ARRIVED = 1;
const FAILED = 2;
type WalkResult = typeof MOVING | typeof ARRIVED | typeof FAILED;

const CONTINUE = false;
const DONE = true;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

export function columnCentre(c: number): number {
  return c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
}

function alert(state: SimState, player: number, text: string, x?: number, z?: number): void {
  state.events.push(x === undefined || z === undefined ? { player, kind: 'alert', text } : { player, kind: 'alert', text, x, z });
}

/** Forgets the unit's path, so the next walk searches afresh. */
export function resetWalk(state: SimState, i: number): void {
  const e = state.entities;
  e.path[i] = [];
  e.pathAt[i] = 0;
  e.pathOk[i] = 2;
  e.stuck[i] = 0;
}

/** Next to a building's solid part (or on its walkable rim). */
function besideBuilding(b: { kind: number; x: number; z: number }): Goal {
  const [x0, z0, x1, z1] = solidRect(b);
  return { x0, z0, x1, z1, min: 1, max: 2 };
}

/**
 * One step of walking towards a goal: finds a path when the unit has none
 * (if the step's search budget allows), then follows it at walking speed,
 * half speed in water. A step the land no longer allows makes it search
 * again; after a few failed tries it gives up. With an exact point, the walk
 * ends there rather than anywhere in the goal's column.
 */
export function walkTo(state: SimState, i: number, goal: Goal, exactX?: number, exactZ?: number): WalkResult {
  const e = state.entities;
  const cx = col(e.x[i]!);
  const cz = col(e.z[i]!);
  if (e.pathOk[i] === 2) {
    const there = atGoal(goal, cx, cz);
    if (there && (exactX === undefined || (e.x[i] === exactX && e.z[i] === exactZ))) return ARRIVED;
    if (there) {
      e.path[i] = [exactX!, exactZ!];
      e.pathOk[i] = 1;
    } else {
      if (state.paths.searches >= PATH_SEARCHES_PER_STEP) return MOVING;
      const r = state.paths.find(PERSON, cx, cz, goal);
      const pts: number[] = [];
      for (let k = 0; k < r.points.length; k++) pts.push(columnCentre(r.points[k]!));
      if (exactX !== undefined && exactZ !== undefined && r.reached) {
        if (pts.length > 0) {
          pts[pts.length - 2] = exactX;
          pts[pts.length - 1] = exactZ;
        } else pts.push(exactX, exactZ);
      }
      if (pts.length === 0) return r.reached ? ARRIVED : FAILED;
      e.path[i] = pts;
      e.pathOk[i] = r.reached ? 1 : 0;
    }
    e.pathAt[i] = 0;
    const p = e.path[i]!;
    e.targetX[i] = p[p.length - 2]!;
    e.targetZ[i] = p[p.length - 1]!;
  }
  const pts = e.path[i]!;
  const k = e.pathAt[i]! * 2;
  if (k >= pts.length) {
    if (atGoal(goal, cx, cz)) return ARRIVED;
    if (e.pathOk[i] === 0) return FAILED;
    // The land changed under the path: search again, a few times at most.
    if ((e.stuck[i] = e.stuck[i]! + 1) > 3) return FAILED;
    e.pathOk[i] = 2;
    return MOVING;
  }
  const tx = pts[k]!;
  const tz = pts[k + 1]!;
  const dx = tx - e.x[i]!;
  const dz = tz - e.z[i]!;
  const flags = state.nav.flags(cx, cz);
  const wet = (flags & (Walk.Wade | Walk.Deep)) !== 0;
  const speed = wet ? e.speed[i]! >> 1 : e.speed[i]!;
  e.order[i] = flags & Walk.Deep ? OrderKind.Swim : e.carryAmt[i]! > 0 ? OrderKind.Carry : OrderKind.Move;
  if (dx === 0 && dz === 0) {
    e.pathAt[i] = e.pathAt[i]! + 1;
    return MOVING;
  }
  e.heading[i] = headingTowards(dx, dz);
  const dist = length2d(dx, dz);
  let nx: number;
  let nz: number;
  if (dist <= speed) {
    nx = tx;
    nz = tz;
  } else {
    nx = e.x[i]! + floorDiv(dx * speed, dist);
    nz = e.z[i]! + floorDiv(dz * speed, dist);
  }
  const ncx = col(nx);
  const ncz = col(nz);
  if ((ncx !== cx || ncz !== cz) && state.nav.stepCost(cx, cz, ncx, ncz, PERSON) < 0) {
    if ((e.stuck[i] = e.stuck[i]! + 1) > 3) return FAILED;
    e.pathOk[i] = 2;
    return MOVING;
  }
  e.x[i] = nx;
  e.z[i] = nz;
  e.y[i] = standY(state, nx, nz);
  if (nx === tx && nz === tz) e.pathAt[i] = e.pathAt[i]! + 1;
  return MOVING;
}

// ----- nodes -----

/** A prop as it stands now, or undefined if it is gone. */
export function nodeView(state: SimState, cx: number, cz: number, index: number): PropView | undefined {
  return state.world.prop(cx, cz, index, state.step);
}

/** The resource a node gives, or -1. */
export function nodeResource(kind: number): number {
  return resourceByName(propInfo(kind).resource);
}

/** Whether a node can be gathered now with a tool tier: grown, not empty, and the tool is good enough. */
function gatherable(view: PropView | undefined, tool: number): view is PropView {
  if (!view || view.amount <= 0 || view.stage !== 2) return false;
  const info = propInfo(view.kind);
  return nodeResource(view.kind) >= 0 && tool >= info.tool;
}

/** Units working a node right now, not counting `except`. */
function workersOnNode(state: SimState, cx: number, cz: number, index: number, except: number): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) {
    if (j === except || e.act[j] !== Act.Work) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'gather' && o.cx === cx && o.cz === cz && o.i === index) n++;
  }
  return n;
}

/**
 * The closest node of a resource within `radius` columns of a column that a
 * unit can gather and that has room for one more gatherer; ties go to the
 * lowest chunk and index. Null when there is none.
 */
export function findNode(state: SimState, i: number, res: number, x: number, z: number, radius: number, skip?: { cx: number; cz: number; i: number }): { cx: number; cz: number; i: number } | null {
  const tool = state.entities.tool[i]!;
  let best: { cx: number; cz: number; i: number } | null = null;
  let bestD = 0;
  for (let cz = (z - radius) >> CHUNK_SHIFT; cz <= (z + radius) >> CHUNK_SHIFT; cz++) {
    for (let cx = (x - radius) >> CHUNK_SHIFT; cx <= (x + radius) >> CHUNK_SHIFT; cx++) {
      for (const p of state.world.props(cx, cz, state.step)) {
        if (skip && skip.cx === cx && skip.cz === cz && skip.i === p.index) continue;
        if (nodeResource(p.kind) !== res || !gatherable(p, tool)) continue;
        const gx = (cx << CHUNK_SHIFT) + p.lx;
        const gz = (cz << CHUNK_SHIFT) + p.lz;
        const d = (gx - x) * (gx - x) + (gz - z) * (gz - z);
        if (d > radius * radius) continue;
        if (best && d >= bestD) continue;
        if (workersOnNode(state, cx, cz, p.index, i) >= propInfo(p.kind).gatherers) continue;
        best = { cx, cz, i: p.index };
        bestD = d;
      }
    }
  }
  return best;
}

function nodeColumn(o: { cx: number; cz: number; i: number }, view: PropView): [number, number] {
  return [(o.cx << CHUNK_SHIFT) + view.lx, (o.cz << CHUNK_SHIFT) + view.lz];
}

function accepts(spec: BuildingSpec, res: number): boolean {
  if (spec.dropoff === 'all') return true;
  return spec.dropoff === 'wood' && (res === Res.SoftwoodLumber || res === Res.HardwoodLumber);
}

/** The nearest finished drop-off of the unit's owner that takes a resource (straight-line distance; ties to the lower id). */
export function nearestDropoff(state: SimState, i: number, res: number): Building | null {
  const e = state.entities;
  let best: Building | null = null;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || !accepts(buildingSpec(b.kind), res)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(e.x[i]!, e.z[i]!, bx, bz);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Puts the unit's load into its owner's pool (the load counts only now). */
function unload(state: SimState, i: number): void {
  const e = state.entities;
  if (e.carryAmt[i]! > 0 && e.carryRes[i] !== NO_CARRY) {
    const pool = state.players[e.owner[i]!]!.pool;
    pool[e.carryRes[i]!] = pool[e.carryRes[i]!]! + e.carryAmt[i]!;
  }
  e.carryAmt[i] = 0;
  e.carryRes[i] = NO_CARRY;
}

// ----- buildings -----

/** Whether a building wants builders: unfinished, being upgraded, or damaged. */
export function needsWork(b: Building): boolean {
  return !b.complete || b.upgrading > 0 || b.hp < maxHealth(b);
}

/** One worker-step of work on a building: construction, then an upgrade, then repair. */
export function workOn(state: SimState, b: Building): void {
  if (!b.complete) {
    const total = workSteps(b.kind, 1);
    const before = constructionHealth(b.kind, b.progress);
    b.progress++;
    b.hp += constructionHealth(b.kind, b.progress) - before;
    if (b.progress >= total) finishBuilding(state, b);
    return;
  }
  if (b.upgrading > 0) {
    b.upProgress++;
    if (b.upProgress >= workSteps(b.kind, b.upgrading)) {
      const oldMax = maxHealth(b);
      b.level = b.upgrading;
      b.upgrading = 0;
      b.upProgress = 0;
      b.hp += maxHealth(b) - oldMax;
      const [x, z] = buildingCentre(b);
      state.events.push({ player: b.owner, kind: 'info', text: `Upgraded to ${buildingName(b.kind, b.level, b.variant)}.`, x, z });
    }
    return;
  }
  // Repair: a full repair takes as long as building the level did.
  const max = maxHealth(b);
  const ws = workSteps(b.kind, b.level);
  b.repairAcc += max;
  const n = floorDiv(b.repairAcc, ws);
  b.hp = Math.min(max, b.hp + n);
  b.repairAcc -= n * ws;
  if (b.hp >= max) b.repairAcc = 0;
}

function finishBuilding(state: SimState, b: Building): void {
  b.complete = true;
  b.doneAt = state.step;
  b.hp = Math.min(b.hp, maxHealth(b));
  const light = buildingSpec(b.kind).light;
  // A new light is lit with one fuel's worth (Table 18).
  if (light) b.fuelUntil = state.step + light.fuelSteps;
  const [x, z] = buildingCentre(b);
  state.events.push({ player: b.owner, kind: 'info', text: `${buildingName(b.kind, b.level, b.variant)} is finished.`, x, z });
  computeEnclosed(state);
}

/** Units inside a building, by index. */
export function unitsInside(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) if (e.inside[j] === id) out.push(j);
  return out;
}

/** A free column next to a building where units come out: south of its solid part, else the nearest open column round it. */
export function exitColumn(state: SimState, b: Building, n = 0): [number, number] {
  const [sx0, , sx1, sz1] = solidRect(b);
  const [fx0, fz0, fx1, fz1] = footprintRect(b);
  const mid = (sx0 + sx1) >> 1;
  const tries: Array<[number, number]> = [];
  // A row along the south side first, spreading out from the middle.
  for (let k = 0; k <= sx1 - sx0 + 2; k++) {
    const off = (k & 1) === 0 ? k >> 1 : -((k + 1) >> 1);
    tries.push([mid + off, sz1 + 1]);
  }
  for (let r = 1; r <= 6; r++) {
    for (let x = fx0 - r; x <= fx1 + r; x++) tries.push([x, fz1 + r], [x, fz0 - r]);
    for (let z = fz0 - r + 1; z <= fz1 + r - 1; z++) tries.push([fx0 - r, z], [fx1 + r, z]);
  }
  let found = 0;
  let first: [number, number] | null = null;
  for (const [x, z] of tries) {
    if (!state.nav.standable(x, z, PERSON)) continue;
    if (!first) first = [x, z];
    if (found++ === n) return [x, z];
  }
  return first ?? [mid, sz1 + 1];
}

/** Takes a unit out of the building it is in and stands it by the door. */
export function leaveBuilding(state: SimState, i: number): void {
  const e = state.entities;
  const b = state.buildings.get(e.inside[i]!);
  e.inside[i] = 0;
  if (!b) return;
  const [x, z] = exitColumn(state, b, i % 6);
  e.x[i] = columnCentre(x);
  e.z[i] = columnCentre(z);
  e.y[i] = standY(state, e.x[i]!, e.z[i]!);
  e.heading[i] = 32768;
}

function goInside(state: SimState, i: number, b: Building): void {
  const e = state.entities;
  e.inside[i] = b.id;
  const [x, z] = buildingCentre(b);
  e.x[i] = x;
  e.z[i] = z;
  e.y[i] = b.y * WU_PER_TERRAIN_UNIT;
  e.order[i] = OrderKind.Idle;
}

/** Workers a building shelters at its level. */
export function shelterRoom(b: Building): number {
  return b.complete ? levelSpec(b.kind, b.level).shelters : 0;
}

/**
 * A building is destroyed: the workers inside each lose 10% of their
 * maximum health and are left standing where it was (Workers: sheltering).
 */
export function destroyBuilding(state: SimState, id: number): void {
  const b = state.buildings.get(id);
  if (!b) return;
  const e = state.entities;
  const hurt: number[] = [];
  for (const j of unitsInside(state, id)) {
    e.inside[j] = 0;
    e.queue[j] = [];
    e.act[j] = Act.Start;
    resetWalk(state, j);
    e.hp[j] = e.hp[j]! - floorDiv(e.maxHp[j]! * SHELTER_LOSS_PER_MILLE, 1000);
    if (e.hp[j]! <= 0) hurt.push(e.id[j]!);
  }
  state.buildings.remove(id, (key) => state.world.touchNav(key));
  for (const uid of hurt) state.entities.remove(uid);
  const [x, z] = buildingCentre(b);
  alert(state, b.owner, `${buildingName(b.kind, b.level, b.variant)} was destroyed.`, x, z);
  computeEnclosed(state);
}

/** Puts a unit to flight: it runs 10 m straight away from an attacker, then carries on with its orders (Table 1, workers). */
export function fleeFrom(state: SimState, i: number, ax: number, az: number): void {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker) return;
  let dx = e.x[i]! - ax;
  let dz = e.z[i]! - az;
  if (dx === 0 && dz === 0) dz = 1;
  const d = length2d(dx, dz);
  dx = floorDiv(dx * FLEE_M * WU_PER_METRE, d);
  dz = floorDiv(dz * FLEE_M * WU_PER_METRE, d);
  if (e.inside[i] !== 0) return;
  e.queue[i]!.unshift({ t: 'move', x: e.x[i]! + dx, z: e.z[i]! + dz });
  e.act[i] = Act.Start;
  resetWalk(state, i);
}

// ----- the orders -----

/** Whether an order keeps a unit inside the building it is in. */
function keepsInside(o: UnitOrder | undefined, inside: number): boolean {
  if (!o || inside === 0) return false;
  return (o.t === 'enter' || o.t === 'job' || o.t === 'train') && o.b === inside;
}

/** Gives a unit an order: added to the end with Shift, otherwise replacing everything it was doing. */
export function giveOrder(state: SimState, i: number, o: UnitOrder, queued: boolean): void {
  const e = state.entities;
  const q = e.queue[i]!;
  if (queued && q.length > 0) {
    q.push(o);
    return;
  }
  e.queue[i] = [o];
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
}

/** Clears a unit's orders (Stop). */
export function stopUnit(state: SimState, i: number): void {
  const e = state.entities;
  e.queue[i] = [];
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  if (e.inside[i] !== 0) leaveBuilding(state, i);
}

/** The standable column nearest a column, searching rings out to `radius`; the column itself if none is found. */
export function nearestStandable(state: SimState, x: number, z: number, radius = 12): [number, number] {
  if (state.nav.standable(x, z, PERSON)) return [x, z];
  for (let r = 1; r <= radius; r++) {
    for (let k = -r; k <= r; k++) {
      for (const [cx, cz] of [[x + k, z - r], [x + k, z + r], [x - r, z + k], [x + r, z + k]] as const) {
        if (state.nav.standable(cx, cz, PERSON)) return [cx, cz];
      }
    }
  }
  return [x, z];
}

function runMove(state: SimState, i: number, o: Extract<UnitOrder, { t: 'move' }>): boolean {
  if (state.entities.act[i] === Act.Start) {
    // A point inside a building or a cliff: walk to the nearest place a unit can stand instead.
    const [cx, cz] = nearestStandable(state, col(o.x), col(o.z));
    if (cx !== col(o.x) || cz !== col(o.z)) {
      o.x = columnCentre(cx);
      o.z = columnCentre(cz);
    }
    state.entities.act[i] = Act.Walk;
  }
  return walkTo(state, i, pointGoal(col(o.x), col(o.z)), o.x, o.z) !== MOVING;
}

function runFollow(state: SimState, i: number, o: Extract<UnitOrder, { t: 'follow' }>): boolean {
  const e = state.entities;
  const t = e.indexOf(o.id);
  if (t < 0 || t === i) return DONE;
  if (e.inside[t] !== 0) return CONTINUE;
  const d = length2d(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  if (d <= FOLLOW_WU) {
    resetWalk(state, i);
    return CONTINUE;
  }
  // Look again for the leader once a second, as it moves.
  if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
  if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + STEPS_PER_SECOND;
  const r = walkTo(state, i, { ...pointGoal(col(e.x[t]!), col(e.z[t]!)), max: 2 });
  if (r !== MOVING) resetWalk(state, i);
  return CONTINUE;
}

function idleAlert(state: SimState, i: number, res: number): void {
  const e = state.entities;
  state.events.push({ player: e.owner[i]!, kind: 'idle', text: `A worker has run out of ${RESOURCES[res]!.name.toLowerCase()} nearby and is idle.`, x: e.x[i]!, z: e.z[i]! });
}

function runGather(state: SimState, i: number, o: Extract<UnitOrder, { t: 'gather' }>): boolean {
  const e = state.entities;
  let view = nodeView(state, o.cx, o.cz, o.i);
  const tool = e.tool[i]!;
  if (e.act[i] === Act.Start) {
    if (view && nodeResource(view.kind) >= 0 && view.stage === 2 && tool < propInfo(view.kind).tool) {
      alert(state, e.owner[i]!, `${propInfo(view.kind).name}: needs better tools than these.`, e.x[i]!, e.z[i]!);
      return DONE;
    }
    e.act[i] = Act.Walk;
  }
  // When a node has run out, go to the closest one of the same resource, or take the last load home and stand idle.
  const runOut = (res: number, near: [number, number]): boolean => {
    const alt = res >= 0 ? findNode(state, i, res, near[0], near[1], NODE_SEARCH_COLUMNS, o) : null;
    if (alt) {
      o.cx = alt.cx;
      o.cz = alt.cz;
      o.i = alt.i;
      e.act[i] = Act.Walk;
      resetWalk(state, i);
      return CONTINUE;
    }
    if (e.carryAmt[i]! > 0) {
      e.act[i] = Act.ToDrop;
      resetWalk(state, i);
      e.nodeI[i] = -1;
      return CONTINUE;
    }
    if (res >= 0) idleAlert(state, i, res);
    e.nodeI[i] = -1;
    return DONE;
  };
  const lastRes = e.carryRes[i] !== NO_CARRY ? e.carryRes[i]! : view ? nodeResource(view.kind) : -1;
  const lastCol = (): [number, number] => (view ? nodeColumn(o, view) : [(o.cx << CHUNK_SHIFT) + 32, (o.cz << CHUNK_SHIFT) + 32]);
  switch (e.act[i]) {
    case Act.Walk: {
      if (!gatherable(view, tool)) return runOut(lastRes, lastCol());
      const res = nodeResource(view.kind);
      if (e.carryAmt[i]! > 0 && (e.carryRes[i] !== res || e.carryAmt[i]! >= loadCapacity(res as Res))) {
        e.act[i] = Act.ToDrop;
        resetWalk(state, i);
        return CONTINUE;
      }
      const [nx, nz] = nodeColumn(o, view);
      const r = walkTo(state, i, { x0: nx, z0: nz, x1: nx, z1: nz, min: 1, max: 1 });
      if (r === MOVING) return CONTINUE;
      if (r === FAILED) {
        const alt = findNode(state, i, res, nx, nz, NODE_SEARCH_COLUMNS, o);
        if (!alt) {
          alert(state, e.owner[i]!, 'A worker cannot reach that.', e.x[i]!, e.z[i]!);
          return DONE;
        }
        o.cx = alt.cx;
        o.cz = alt.cz;
        o.i = alt.i;
        resetWalk(state, i);
        return CONTINUE;
      }
      // Node crowding: a full node sends the newcomer to the closest free one.
      if (workersOnNode(state, o.cx, o.cz, o.i, i) >= propInfo(view.kind).gatherers) {
        const alt = findNode(state, i, res, nx, nz, NODE_SEARCH_COLUMNS, o);
        if (alt) {
          o.cx = alt.cx;
          o.cz = alt.cz;
          o.i = alt.i;
          resetWalk(state, i);
        } else {
          e.act[i] = Act.Wait;
          e.waitUntil[i] = state.step + 2 * STEPS_PER_SECOND;
        }
        return CONTINUE;
      }
      e.act[i] = Act.Work;
      e.timer[i] = 0;
      return CONTINUE;
    }
    case Act.Wait:
      if (state.step >= e.waitUntil[i]!) {
        e.act[i] = Act.Walk;
        resetWalk(state, i);
      }
      return CONTINUE;
    case Act.Work: {
      if (!gatherable(view, tool)) return runOut(lastRes, lastCol());
      const info = propInfo(view.kind);
      const res = nodeResource(view.kind);
      const [nx, nz] = nodeColumn(o, view);
      e.heading[i] = headingTowards(columnCentre(nx) - e.x[i]!, columnCentre(nz) - e.z[i]!);
      e.order[i] = info.shape === PropShape.Tree || info.shape === PropShape.Bush ? OrderKind.Chop : info.shape === PropShape.Plant ? OrderKind.Farm : OrderKind.Mine;
      e.timer[i] = e.timer[i]! + (TOOL_SPEED_PER_MILLE[tool as Tool] ?? 1000);
      if (e.timer[i]! < info.loadSteps * 1000) return CONTINUE;
      e.timer[i] = 0;
      const room = loadCapacity(res as Res) - (e.carryRes[i] === res ? e.carryAmt[i]! : 0);
      const want = Math.max(1, Math.min(info.perLoad, room));
      const before = view.amount;
      const taken = state.world.harvest(o.cx, o.cz, o.i, want, state.step);
      if (taken > 0) {
        e.carryAmt[i] = (e.carryRes[i] === res ? e.carryAmt[i]! : 0) + taken;
        e.carryRes[i] = res;
      }
      e.nodeCx[i] = o.cx;
      e.nodeCz[i] = o.cz;
      e.nodeI[i] = o.i;
      // Felling a softwood tree also gives its resin, straight to the pool (s).
      if (before - taken <= 0 && isTree(view.kind) && res === Res.SoftwoodLumber) {
        const pool = state.players[e.owner[i]!]!.pool;
        pool[Res.Resin] = pool[Res.Resin]! + RESIN_PER_SOFTWOOD_TREE;
      }
      e.act[i] = Act.ToDrop;
      resetWalk(state, i);
      return CONTINUE;
    }
    case Act.ToDrop: {
      if (e.carryAmt[i] === 0) {
        e.act[i] = Act.Walk;
        return CONTINUE;
      }
      const r = toDropoff(state, i, null);
      if (r === MOVING) return CONTINUE;
      if (r === FAILED) return DONE;
      view = nodeView(state, o.cx, o.cz, o.i);
      if (!gatherable(view, tool)) return runOut(lastRes, lastCol());
      e.act[i] = Act.Walk;
      resetWalk(state, i);
      return CONTINUE;
    }
  }
  return DONE;
}

/** Resin from felling one softwood tree (s): torches need it and no node gives it. */
export const RESIN_PER_SOFTWOOD_TREE = 2;

/** Walks the unit's load to a drop-off (a given one, or the nearest that takes it) and unloads it there. */
function toDropoff(state: SimState, i: number, target: Building | null): WalkResult {
  const e = state.entities;
  const res = e.carryRes[i]!;
  const b = target ?? nearestDropoff(state, i, res);
  if (!b) {
    alert(state, e.owner[i]!, `There is nowhere to drop off ${RESOURCES[res]?.name.toLowerCase() ?? 'that'}. Build a storehouse.`, e.x[i]!, e.z[i]!);
    return FAILED;
  }
  const r = walkTo(state, i, besideBuilding(b));
  if (r === ARRIVED) unload(state, i);
  if (r === FAILED) alert(state, e.owner[i]!, 'A worker cannot reach a drop-off.', e.x[i]!, e.z[i]!);
  return r;
}

/** After a drop-off order, a gatherer with nothing else to do goes back to its node. */
function backToNode(state: SimState, i: number): boolean {
  const e = state.entities;
  const q = e.queue[i]!;
  if (q.length === 1 && e.nodeI[i]! >= 0) {
    q[0] = { t: 'gather', cx: e.nodeCx[i]!, cz: e.nodeCz[i]!, i: e.nodeI[i]! };
    e.act[i] = Act.Start;
    resetWalk(state, i);
    return CONTINUE;
  }
  return DONE;
}

function runReturn(state: SimState, i: number, target: Building | null): boolean {
  const e = state.entities;
  if (e.carryAmt[i] === 0) return backToNode(state, i);
  const r = toDropoff(state, i, target);
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) return DONE;
  return backToNode(state, i);
}

/** The incomplete building of a player at exactly a planned spot, if one was started. */
function startedAt(state: SimState, owner: number, kind: number, x: number, z: number): Building | undefined {
  return state.buildings.list.find((b) => b.owner === owner && b.kind === kind && b.x === x && b.z === z && !b.complete);
}

function runBuild(state: SimState, i: number, o: Extract<UnitOrder, { t: 'build' }>): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  const q = e.queue[i]!;
  const started = startedAt(state, owner, o.kind, o.x, o.z);
  if (started) {
    q[0] = { t: 'work', b: started.id };
    e.act[i] = Act.Start;
    return CONTINUE;
  }
  // Someone else already finished it: nothing left to do here.
  if (state.buildings.list.some((b) => b.owner === owner && b.kind === o.kind && b.x === o.x && b.z === o.z)) return DONE;
  const name = buildingName(o.kind, 1, o.variant);
  const r = walkTo(state, i, besideBuilding(o));
  if (r === MOVING) return CONTINUE;
  const [x0, z0] = footprintRect(o);
  const wx = columnCentre(x0);
  const wz = columnCentre(z0);
  if (r === FAILED) {
    alert(state, owner, `A worker cannot reach the spot for the ${name.toLowerCase()}.`, wx, wz);
    return DONE;
  }
  // The cost is taken only now, when building begins; a blocked spot or a short pool cancels it with an alert.
  const why = buildRequirement(state, owner, o.kind);
  if (why) {
    alert(state, owner, `${name}: ${why}`, wx, wz);
    return DONE;
  }
  const blocked = placementBlocked(state, owner, o.kind, o.x, o.z);
  if (blocked !== Blocked.None) {
    alert(state, owner, `The spot for the ${name.toLowerCase()} is blocked. ${BLOCKED_TEXT[blocked]}`, wx, wz);
    return DONE;
  }
  const cost = levelSpec(o.kind, 1).cost;
  const pool = state.players[owner]!.pool;
  if (!canAfford(pool, cost)) {
    alert(state, owner, `Not enough ${RESOURCES[shortOf(pool, cost)]!.name.toLowerCase()} to build the ${name.toLowerCase()} (${costText(cost)}).`, wx, wz);
    return DONE;
  }
  pay(pool, cost);
  const b = placeBuilding(state, owner, o.kind, o.variant, o.x, o.z, false);
  b.hp = constructionHealth(o.kind, 0);
  // Every worker on its way to this spot builds it now.
  for (let j = 0; j < e.count; j++) {
    const h = e.queue[j]![0];
    if (e.owner[j] === owner && h?.t === 'build' && h.kind === o.kind && h.x === o.x && h.z === o.z) {
      e.queue[j]![0] = { t: 'work', b: b.id };
      e.act[j] = Act.Start;
      if (j !== i) resetWalk(state, j);
    }
  }
  return CONTINUE;
}

/** Builders working on a building now, not counting `except`. */
function buildersOn(state: SimState, id: number, except: number): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) {
    if (j === except || e.act[j] !== Act.Work) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'work' && o.b === id) n++;
  }
  return n;
}

function runWork(state: SimState, i: number, o: Extract<UnitOrder, { t: 'work' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !needsWork(b)) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (e.act[i] === Act.Walk) {
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      alert(state, b.owner, 'A worker cannot reach that building.', e.x[i]!, e.z[i]!);
      return DONE;
    }
    e.act[i] = Act.Work;
  }
  if (e.act[i] === Act.Wait) {
    if (state.step < e.waitUntil[i]!) return CONTINUE;
    e.act[i] = Act.Work;
  }
  if (buildersOn(state, b.id, i) >= builderLimit(b.kind)) {
    e.act[i] = Act.Wait;
    e.waitUntil[i] = state.step + STEPS_PER_SECOND;
    return CONTINUE;
  }
  const [bx, bz] = buildingCentre(b);
  e.heading[i] = headingTowards(bx - e.x[i]!, bz - e.z[i]!);
  e.order[i] = OrderKind.Chop;
  workOn(state, b);
  return needsWork(b) ? CONTINUE : DONE;
}

function runRepairAll(state: SimState, i: number): boolean {
  const e = state.entities;
  const r = REPAIR_SEARCH_M * WU_PER_METRE;
  let best: Building | null = null;
  let bestPm = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || b.hp >= maxHealth(b)) continue;
    const [bx, bz] = buildingCentre(b);
    if (dist2(bx, bz, e.x[i]!, e.z[i]!) > r * r) continue;
    const pm = floorDiv(b.hp * 1000, maxHealth(b));
    if (!best || pm < bestPm) {
      best = b;
      bestPm = pm;
    }
  }
  if (!best) return DONE;
  e.queue[i]!.unshift({ t: 'work', b: best.id });
  e.act[i] = Act.Start;
  resetWalk(state, i);
  return CONTINUE;
}

function runEnter(state: SimState, i: number, o: Extract<UnitOrder, { t: 'enter' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || shelterRoom(b) === 0) return DONE;
  if (e.inside[i] === b.id) return CONTINUE;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) return DONE;
  if (unitsInside(state, b.id).length >= shelterRoom(b)) {
    alert(state, b.owner, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} is full.`, e.x[i]!, e.z[i]!);
    return DONE;
  }
  // Going in at a drop-off leaves the load there.
  if (e.carryAmt[i]! > 0 && accepts(buildingSpec(b.kind), e.carryRes[i]!)) unload(state, i);
  goInside(state, i, b);
  e.act[i] = Act.Inside;
  return CONTINUE;
}

/** Buildings that take assigned workers: farms of every kind and the lumber mill. */
export function takesWorkers(b: Building): boolean {
  return b.complete && levelSpec(b.kind, b.level).workers > 0 && (isFarm(b.kind) || b.kind === BuildingKind.LumberMill);
}

export function isFarm(kind: number): boolean {
  return kind === BuildingKind.CropField || kind === BuildingKind.VegetableFarm || kind === BuildingKind.HerbBed || kind === BuildingKind.LivestockFarm;
}

/** Workers whose current order is a job at a building, in index order. */
export function assigned(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) {
    const o = e.queue[j]![0];
    if (o?.t === 'job' && o.b === id) out.push(j);
  }
  return out;
}

/** Where farmer number k stands in a farm's field: a grid of spots clear of the farmhouse. */
function farmSpot(b: Building, k: number): [number, number] {
  const s = buildingSpec(b.kind);
  const [, , sw, sd] = s.solid;
  const fx = b.x + sw + 1 + ((k & 1) === 0 ? 0 : (s.w - sw) >> 1);
  const fz = b.z + sd + 1 + ((k >> 1) & 1 ? (s.d - sd) >> 1 : 0);
  return [Math.min(fx, b.x + s.w - 1), Math.min(fz, b.z + s.d - 1)];
}

function runJob(state: SimState, i: number, o: Extract<UnitOrder, { t: 'job' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !takesWorkers(b)) return DONE;
  const slot = assigned(state, b.id).indexOf(i);
  if (slot >= levelSpec(b.kind, b.level).workers) {
    if (e.act[i] === Act.Start) alert(state, b.owner, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} has all the workers it can take.`, e.x[i]!, e.z[i]!);
    return DONE;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  // Farmers work the field by day and shelter in their own farmhouse at dusk and night; mill hands work inside.
  const indoors = !isFarm(b.kind) || isDark(state.step);
  if (indoors) {
    if (e.inside[i] === b.id) {
      e.act[i] = Act.Work;
      return CONTINUE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    if (e.carryAmt[i]! > 0 && accepts(buildingSpec(b.kind), e.carryRes[i]!)) unload(state, i);
    goInside(state, i, b);
    e.act[i] = Act.Work;
    return CONTINUE;
  }
  if (e.inside[i] === b.id) {
    leaveBuilding(state, i);
    resetWalk(state, i);
    e.act[i] = Act.Walk;
  }
  const [sx, sz] = farmSpot(b, slot);
  if (e.act[i] !== Act.Work) {
    const r = walkTo(state, i, { ...pointGoal(sx, sz), max: 1 });
    if (r === MOVING) {
      e.act[i] = Act.Walk;
      return CONTINUE;
    }
    if (r === FAILED) return DONE;
    e.act[i] = Act.Work;
  }
  e.order[i] = OrderKind.Farm;
  return CONTINUE;
}

function runRefuel(state: SimState, i: number, o: Extract<UnitOrder, { t: 'refuel' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  const light = b ? buildingSpec(b.kind).light : undefined;
  if (!b || !light || !b.complete || b.owner !== e.owner[i]) return DONE;
  if (b.fuelUntil - state.step >= light.fuelSteps) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (e.act[i] === Act.Walk) {
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  e.order[i] = OrderKind.Chop;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < REFUEL_STEPS) return CONTINUE;
  const pool = state.players[b.owner]!.pool;
  if (pool[light.fuel]! <= 0) {
    alert(state, b.owner, `Not enough ${RESOURCES[light.fuel]!.name.toLowerCase()} to refuel the ${buildingSpec(b.kind).name.toLowerCase()}.`, e.x[i]!, e.z[i]!);
    return DONE;
  }
  pool[light.fuel] = pool[light.fuel]! - 1;
  b.fuelUntil = Math.max(b.fuelUntil, state.step) + light.fuelSteps;
  b.alerted &= ~2;
  return DONE;
}

/** The rank training a worker can take next, or undefined at rank 3 and above. */
export function nextRankTraining(rank: number): (typeof RANK_TRAINING)[number] | undefined {
  return RANK_TRAINING.find((t) => t.rank === rank + 1);
}

function runTrain(state: SimState, i: number, o: Extract<UnitOrder, { t: 'train' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  const t = nextRankTraining(e.rank[i]!);
  if (!b || !t || b.kind !== BuildingKind.MainBase || !b.complete || b.owner !== e.owner[i]) return DONE;
  if (e.inside[i] !== b.id) {
    if (mainBaseLevel(state, b.owner) < t.base) {
      alert(state, b.owner, `Training to ${t.name} needs a level ${t.base} main base.`, e.x[i]!, e.z[i]!);
      return DONE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    if (!payNutrition(state.players[b.owner]!.pool, t.food)) {
      alert(state, b.owner, `Not enough food to train a worker to ${t.name} (${t.food} food).`, e.x[i]!, e.z[i]!);
      return DONE;
    }
    if (e.carryAmt[i]! > 0) unload(state, i);
    goInside(state, i, b);
    e.act[i] = Act.Inside;
    e.timer[i] = 0;
  }
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < t.steps) return CONTINUE;
  e.rank[i] = t.rank;
  const hp = WORKER_HEALTH_BY_RANK[t.rank]!;
  e.hp[i] = e.hp[i]! + hp - e.maxHp[i]!;
  e.maxHp[i] = hp;
  leaveBuilding(state, i);
  state.events.push({ player: b.owner, kind: 'info', text: `A worker has trained to ${t.name}.`, x: e.x[i]!, z: e.z[i]! });
  return DONE;
}

function runOrder(state: SimState, i: number, o: UnitOrder): boolean {
  switch (o.t) {
    case 'move':
      return runMove(state, i, o);
    case 'follow':
      return runFollow(state, i, o);
    case 'gather':
      return runGather(state, i, o);
    case 'build':
      return runBuild(state, i, o);
    case 'work':
      return runWork(state, i, o);
    case 'repairAll':
      return runRepairAll(state, i);
    case 'return':
      return runReturn(state, i, null);
    case 'dropoff': {
      const b = state.buildings.get(o.b);
      if (!b || !b.complete || b.owner !== state.entities.owner[i]) return DONE;
      return runReturn(state, i, b);
    }
    case 'enter':
      return runEnter(state, i, o);
    case 'job':
      return runJob(state, i, o);
    case 'refuel':
      return runRefuel(state, i, o);
    case 'train':
      return runTrain(state, i, o);
  }
}

/** One step for one of the players' units. */
export function runUnit(state: SimState, i: number): void {
  const e = state.entities;
  e.order[i] = OrderKind.Idle;
  // A few orders in a row may finish at once (a drop-off with nothing carried); bounded so a step stays short.
  for (let guard = 0; guard < 4; guard++) {
    const q = e.queue[i]!;
    const o = q[0];
    if (!o) {
      if (e.inside[i] !== 0) leaveBuilding(state, i);
      return;
    }
    if (e.act[i] === Act.Start && e.inside[i] !== 0 && !keepsInside(o, e.inside[i]!)) leaveBuilding(state, i);
    if (!runOrder(state, i, o)) return;
    // Done: on to the next order.
    if (e.queue[i]![0] === o) e.queue[i]!.shift();
    e.act[i] = Act.Start;
    e.timer[i] = 0;
    resetWalk(state, i);
    if (e.queue[i]!.length > 0 && e.inside[i] !== 0 && !keepsInside(e.queue[i]![0], e.inside[i]!)) leaveBuilding(state, i);
  }
}
