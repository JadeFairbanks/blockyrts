// What units do each step (Units: Workers; Controls: Unit orders, Gathering
// resources, Building placement, Semi-automation). Each unit works through
// its own list of orders; the first is the current one and runs as a small
// state machine whose phase is the unit's `act`. Every decision reads only
// the state and the seeded streams, and units are visited in index order.

import { BuildingKind, buildingName, buildingSpec, levelSpec, RELIGHT_STEPS, SHELTER_LOSS_PER_MILLE, workSteps, type BuildingSpec } from '../buildings/data.ts';
import { computeEnclosed, buildingCentre, dist2, isSnuffed, relight } from '../buildings/lights.ts';
import { payFood, STARVING_SLOW_BP, starvingSince } from '../economy/food.ts';
import { canAffordAny, fishOf, meatOf, payAny, shortOfAny } from '../economy/food-kinds.ts';
import { BLOCKED_TEXT, Blocked, buildCost, buildRequirement, clearingOn, costMultiplier, mainBaseLevel, placementBlocked } from '../buildings/placement.ts';
import { constructionHealth, footprintRect, garrisonRoom, maxHealth, placedDims, solidRect, type Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { costText, RAW_CARRY_TENTHS_LB, Res, resourceByName, RESOURCES } from '../economy/resources.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { HEX_SLOW_BP } from '../rules.ts';
import { PERSON, SWIMMER, Walk, WALKER, WHEELS, type Mover } from '../nav/grid.ts';
import { Species } from '../animals/species.ts';
import { atGoal, pointGoal, type Goal } from '../nav/path.ts';
import { HOP_SLOW_BP, hoppingUp, isGod, landAt, NO_CARRY, OrderKind, placeBuilding, standY, stepOffSolid, UnitKind, WARRIOR_HEALTH_BY_RANK, type SimState } from '../state.ts';
import { WARRIOR_XP_TENTHS } from '../combat/combat.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { isFish, isSoftOre, isTree, propInfo, propJob, PropKind, PropShape, Tool, ToolJob } from '../world/props.ts';
import { carcassExtra } from '../animals/animals.ts';
import type { PropView } from '../world/world.ts';
import { ENTER_NIGHT, ENTER_TOP, type UnitOrder } from './unit-orders.ts';
import { carryCapacity, cartSpeed, onWheels, rawLimitTenthsLb } from './weight.ts';
import { canGarrison, fightStep } from '../combat/fight.ts';
import { freePost, onTop, spreadTop, unitsOnTop } from './top.ts';
import { refundKit, runCart, runKitUp } from './gear.ts';
import { digStairsOut, runDig, runStairs } from './dig.ts';
import { toolNeeded, toolTier } from './tools.ts';
import { aTroop } from './kits.ts';
import { runEat, runHitch, runHunt, runProspect, runTame } from './field.ts';
import { MAGE_XP_TENTHS, mageTrainingProblem, nextMageTraining, setMageRank } from '../magic/mages.ts';
import { SCHOOL_NAMES, Spell, spellSpec } from '../magic/spells.ts';
import { peoplesHooks } from '../peoples/hooks.ts';
import { askHooks, speakerName } from '../peoples/speech.ts';
import { mountedSpeed } from '../mounts/riding.ts';
import { runCrew, runMend, runRetrain } from '../siege/engines.ts';
import { addToBag, bagEmpty, bagFreeTenthsLb, handIn, lootIdle, runLoot } from './loot.ts';
import { fillBag, stockTenthsLb, workedOut } from '../buildings/mining.ts';
import { goesHome, nextNode, runForage } from './forage.ts';
import { tinker } from './tinker.ts';
import { Work, workXp } from './ranks.ts';

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
export const NODE_SEARCH_COLUMNS = floorDiv(NODE_SEARCH_M * WU_PER_METRE, WU_PER_COLUMN);
/** Double-tapped Repair looks this far for damaged buildings (s). */
export const REPAIR_SEARCH_M = 30;
/** A follower stays within this distance of its leader. */
export const FOLLOW_WU = 2 * WU_PER_METRE + (WU_PER_METRE >> 1);
/** Workers flee this far from an attacker (Table 1). */
export const FLEE_M = 10;
/** Builders that can work on one building at once (number tables, header: 4, or 8 on a main base). */
export function builderLimit(kind: number): number {
  return kind === BuildingKind.MainBase ? 8 : 4;
}
/** Gather, dig and build speed by tool tier, per mille (Table 2c): a job goes at the pace of the worker's tool for it. */
/** Fishing's pace per mille against a node's own load time: 1 fish per 10 s with any tool kit (Table 2c). */
const FISH_PACE = 1500;
export const TOOL_SPEED_PER_MILLE: readonly number[] = [1000, 1000, 1150, 1250, 1500, 1750, 2250, 2500, 3000, 3500];

export const MOVING = 0;
export const ARRIVED = 1;
export const FAILED = 2;
export type WalkResult = typeof MOVING | typeof ARRIVED | typeof FAILED;

const CONTINUE = false;
const DONE = true;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

export function columnCentre(c: number): number {
  return c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
}

/** An alert for a player; with a unit, it is that unit saying so (Unit speech: triggered speech), as a bubble over it and under its name in the panel. */
function alert(state: SimState, player: number, text: string, x?: number, z?: number, unit = -1): void {
  if (unit >= 0) {
    const e = state.entities;
    state.events.push({ player, kind: 'alert', text, x: e.x[unit]!, z: e.z[unit]!, speaker: e.id[unit]!, name: speakerName(state, unit), urgent: true });
    return;
  }
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
export function besideBuilding(b: { kind: number; x: number; z: number }): Goal {
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
    const there = atGoal(goal, cx, cz, unitLevel(state, i));
    if (there && (exactX === undefined || (e.x[i] === exactX && e.z[i] === exactZ))) return ARRIVED;
    if (there) {
      e.path[i] = [exactX!, exactZ!];
      e.pathOk[i] = 1;
    } else {
      if (state.paths.searches >= PATH_SEARCHES_PER_STEP) return MOVING;
      const r = state.paths.find(moverOf(state, i), cx, cz, goal, state.nav.layerAt(cx, cz, unitLevel(state, i)));
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
    if (atGoal(goal, cx, cz, unitLevel(state, i))) return ARRIVED;
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
  const speed = wet ? moveSpeed(state, i) >> 1 : moveSpeed(state, i);
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
  let ncx = col(nx);
  let ncz = col(nz);
  const m = moverOf(state, i);
  const level = unitLevel(state, i);
  if (ncx !== cx && ncz !== cz && state.nav.stepCost(cx, cz, ncx, ncz, m, level) < 0) {
    // A straight line from off the column's centre clips a corner the path goes round: slide along
    // whichever side is open this step (a hunter kneeling by a carcass at a column's edge got stuck here).
    if (state.nav.stepCost(cx, cz, ncx, cz, m, level) >= 0) nz = e.z[i]!;
    else if (state.nav.stepCost(cx, cz, cx, ncz, m, level) >= 0) nx = e.x[i]!;
    ncx = col(nx);
    ncz = col(nz);
  }
  if ((ncx !== cx || ncz !== cz) && state.nav.stepCost(cx, cz, ncx, ncz, m, level) < 0) {
    if ((e.stuck[i] = e.stuck[i]! + 1) > 3) {
      // Before giving up, once: a path's straight stretches run from column centres (nav/path.ts), and off
      // its column's centre the line can clip a drop the path passes by, so it steps back to the centre
      // and goes on from there (a digger leaving the rim of a pit cut the pit's corner and gave up, Patch 4).
      const mx = columnCentre(cx);
      const mz = columnCentre(cz);
      if (e.stuck[i] === 4 && (e.x[i] !== mx || e.z[i] !== mz)) {
        e.path[i] = [mx, mz, ...pts.slice(k)];
        e.pathAt[i] = 0;
        return MOVING;
      }
      return FAILED;
    }
    e.pathOk[i] = 2;
    return MOVING;
  }
  landAt(state, i, nx, nz);
  if (nx === tx && nz === tz) e.pathAt[i] = e.pathAt[i]! + 1;
  return MOVING;
}

/** The level a unit stands at, terrain units (its height, rounded down). */
export function unitLevel(state: SimState, i: number): number {
  return floorDiv(state.entities.y[i]!, WU_PER_TERRAIN_UNIT);
}

/**
 * How a unit gets about: on wheels with a cart (and the animal pulling it),
 * wild animals as walkers that never pass gates, everyone else as a person.
 * Armour no longer stops anyone swimming (Jade, 2026-10-03).
 */
export function moverOf(state: SimState, i: number): Mover {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Animal) {
    if (e.owner[i]! >= state.players.length) return e.mob[i] === Species.Crocodile || e.mob[i] === Species.GiantCrab ? SWIMMER : WALKER;
    const w = e.partner[i] ? e.indexOf(e.partner[i]!) : -1;
    return w >= 0 && onWheels(state, w) ? WHEELS : PERSON;
  }
  if (onWheels(state, i)) return WHEELS;
  return PERSON;
}

/** A unit's speed this step, wu: slowed by starving, by a grasp or a web, hastened by a howl or a shout (gear and loads weigh nothing, Jade). */
export function moveSpeed(state: SimState, i: number): number {
  const e = state.entities;
  const cart = cartSpeed(state, i);
  // A mount goes at its own pace (Table 14 speeds: a trot, a gallop at a foe).
  const mounted = e.mount[i] !== 0;
  const base = mounted ? mountedSpeed(state, i) : cart > 0 ? Math.min(cart, e.speed[i]!) : e.speed[i]!;
  let bp = 10000;
  if (starvingSince(state, i)) bp -= STARVING_SLOW_BP;
  if (e.slowUntil[i]! > state.step) bp -= e.slowBp[i]!;
  if (e.fastUntil[i]! > state.step) bp += e.fastBp[i]!;
  // A goblin mage's Stumble hex: 20% slower.
  if (e.hexUntil[i]! > state.step) bp -= HEX_SLOW_BP;
  // A support mage's Quicken: 25% faster.
  if (e.quickUntil[i]! > state.step) bp += spellSpec(Spell.Quicken).bp;
  // Hopping up a rise.
  if (hoppingUp(state, i)) bp -= HOP_SLOW_BP;
  return Math.max(1, floorDiv(base * bp, 10000));
}

// ----- nodes -----

/** A prop as it stands now, or undefined if it is gone. */
export function nodeView(state: SimState, cx: number, cz: number, index: number): PropView | undefined {
  return state.world.prop(cx, cz, index, state.step);
}

/** The resource a node gives, or -1: a carcass its animal's meat (its variant is the species), a fish stretch its fish (economy/food-kinds.ts). */
export function nodeResource(kind: number, variant = 0): number {
  if (kind === PropKind.Carcass) return meatOf(variant);
  if (isFish(kind)) return fishOf(kind);
  return resourceByName(propInfo(kind).resource);
}

/** Whether a worker can gather a node now: holding something (a sapling holds nothing yet), and its tool for the node's job is good enough. */
export function gatherable(state: SimState, i: number, view: PropView | undefined): view is PropView {
  if (!view || view.amount <= 0) return false;
  const info = propInfo(view.kind);
  return nodeResource(view.kind, view.variant) >= 0 && (info.tool === Tool.None || toolTier(state.entities, i, propJob(view.kind)) >= info.tool);
}

/** A worker's pace at a node, per mille: its tool for the job, x1.0 for a stone maul on soft ore (Table 2c). */
function gatherPace(state: SimState, i: number, kind: number): number {
  const tier = toolTier(state.entities, i, propJob(kind));
  if (tier === Tool.Stone && isSoftOre(kind)) return 1000;
  return TOOL_SPEED_PER_MILLE[tier] ?? 1000;
}

/** Units working a node right now, not counting `except`. */
export function workersOnNode(state: SimState, cx: number, cz: number, index: number, except: number): number {
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
  let best: { cx: number; cz: number; i: number } | null = null;
  let bestD = 0;
  for (let cz = (z - radius) >> CHUNK_SHIFT; cz <= (z + radius) >> CHUNK_SHIFT; cz++) {
    for (let cx = (x - radius) >> CHUNK_SHIFT; cx <= (x + radius) >> CHUNK_SHIFT; cx++) {
      for (const p of state.world.props(cx, cz, state.step)) {
        if (skip && skip.cx === cx && skip.cz === cz && skip.i === p.index) continue;
        // res -1: a node of anything the worker can gather.
        if ((res >= 0 && nodeResource(p.kind, p.variant) !== res) || !gatherable(state, i, p)) continue;
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

/** Whether a drop-off takes a resource; res -1 asks for one that takes everything (loot is handed in only there). */
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

/** Puts the unit's load into its owner's pool (the load counts only now), and its loot bag too at a drop-off that takes everything. */
export function unload(state: SimState, i: number, at?: Building): void {
  const e = state.entities;
  if (e.carryAmt[i]! > 0 && e.carryRes[i] !== NO_CARRY) {
    const pool = state.players[e.owner[i]!]!.pool;
    pool[e.carryRes[i]!] = pool[e.carryRes[i]!]! + e.carryAmt[i]!;
  }
  e.carryAmt[i] = 0;
  e.carryRes[i] = NO_CARRY;
  if (at && buildingSpec(at.kind).dropoff === 'all') handIn(state, i);
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
    // Godmode (Jade's Patch 5: "you can build anything instantly"): one step of work finishes it.
    b.progress = isGod(state, b.owner) ? total : b.progress + 1;
    b.hp += constructionHealth(b.kind, b.progress) - before;
    if (b.progress >= total) finishBuilding(state, b);
    return;
  }
  if (b.upgrading > 0) {
    b.upProgress = isGod(state, b.owner) ? workSteps(b.kind, b.upgrading) : b.upProgress + 1;
    if (b.upProgress >= workSteps(b.kind, b.upgrading)) {
      const oldMax = maxHealth(b);
      b.level = b.upgrading;
      b.upgrading = 0;
      b.upProgress = 0;
      b.hp += maxHealth(b) - oldMax;
      // The men up top move onto the new level's places.
      spreadTop(state, b);
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

export function goInside(state: SimState, i: number, b: Building): void {
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
  const inside = unitsInside(state, id);
  for (const j of inside) {
    e.inside[j] = 0;
    dropQueue(state, j);
    e.act[j] = Act.Start;
    resetWalk(state, j);
    e.hp[j] = e.hp[j]! - floorDiv(e.maxHp[j]! * SHELTER_LOSS_PER_MILLE, 1000);
    // Killed by the fall: settled with the step's other deaths.
    if (e.hp[j]! <= 0) {
      e.hp[j] = 0;
      state.dying.push(e.id[j]!);
    }
  }
  state.buildings.remove(id, (key) => state.world.touchNav(key));
  // The men who stood up top come down with it.
  for (const j of inside) if (e.y[j]! > b.y * WU_PER_TERRAIN_UNIT) e.y[j] = standY(state, e.x[j]!, e.z[j]!);
  const [x, z] = buildingCentre(b);
  if (!buildingSpec(b.kind).defence) alert(state, b.owner, `${buildingName(b.kind, b.level, b.variant)} was destroyed.`, x, z);
  computeEnclosed(state);
}

/** Clears a unit's orders, giving back what was paid for an upgrade it had not started. */
export function dropQueue(state: SimState, i: number): void {
  const e = state.entities;
  for (const o of e.queue[i]!) refundKit(state, i, o);
  e.queue[i] = [];
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
  dropQueue(state, i);
  breakCast(state, i);
  e.queue[i] = [o];
  e.target[i] = 0;
  e.chasing[i] = 0;
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
}

/** Clears a unit's orders (Stop). */
export function stopUnit(state: SimState, i: number): void {
  const e = state.entities;
  dropQueue(state, i);
  breakCast(state, i);
  e.target[i] = 0;
  e.chasing[i] = 0;
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  if (e.inside[i] !== 0) leaveBuilding(state, i);
}

/** A new order (not queued) or Stop breaks off a spell being cast (nothing is paid until it lands) or a Beam being held. */
function breakCast(state: SimState, i: number): void {
  const e = state.entities;
  e.castSpell[i] = 0;
  e.castAt[i] = 0;
  e.beamUntil[i] = 0;
  e.beamTarget[i] = 0;
  e.beamLeft[i] = 0;
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

function runGather(state: SimState, i: number, o: Extract<UnitOrder, { t: 'gather' }>): boolean {
  const e = state.entities;
  // Gathering by itself (the Gather button): at dusk it stops and the forage order behind takes it home, unless it works on through the night (Jade's Patch 4).
  const after = e.queue[i]![1]?.t;
  const nightForage = after === 'forage' && isDark(state.step);
  if (nightForage && goesHome(state, i)) return DONE;
  let view = nodeView(state, o.cx, o.cz, o.i);
  if (e.act[i] === Act.Start) {
    const kind = view?.kind ?? -1;
    if (view && nodeResource(kind, view.variant) >= 0 && view.amount > 0 && !gatherable(state, i, view)) {
      const info = propInfo(kind);
      alert(state, e.owner[i]!, `${info.name}: needs a ${toolNeeded(propJob(kind), info.tool)} or better.`, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    e.act[i] = Act.Walk;
  }
  // When a node has run out, go to the closest one of the same resource; with none nearby, a basic material
  // gives way to what the side needs most for the walk (saying why), else the last load goes home and it stands idle.
  // Working on through the night, the forage order behind chooses the next node, by the main base.
  const runOut = (res: number, near: [number, number]): boolean => {
    const alt = res >= 0 && !nightForage ? findNode(state, i, res, near[0], near[1], NODE_SEARCH_COLUMNS, o) : null;
    const next = alt ?? (res >= 0 && after !== 'hunt' && !nightForage ? nextNode(state, i, res, columnCentre(near[0]), columnCentre(near[1]), o, after === 'forage') : null);
    if (next) {
      o.cx = next.cx;
      o.cz = next.cz;
      o.i = next.i;
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
    // A hunter's or hauler's carcass is done: the hunt behind it carries on without a word; a gatherer working by itself looks farther.
    // One working by hand asks whether to look farther off (Patch 2, round 3) [before Patch 2: "I have run out of (resource) nearby." and it stood].
    if (res >= 0 && after !== 'hunt' && after !== 'forage') askHooks.ranOut(state, i, res);
    e.nodeI[i] = -1;
    return DONE;
  };
  const lastRes = e.carryRes[i] !== NO_CARRY ? e.carryRes[i]! : view ? nodeResource(view.kind, view.variant) : -1;
  const lastCol = (): [number, number] => (view ? nodeColumn(o, view) : [(o.cx << CHUNK_SHIFT) + 32, (o.cz << CHUNK_SHIFT) + 32]);
  switch (e.act[i]) {
    case Act.Walk: {
      if (!gatherable(state, i, view)) return runOut(lastRes, lastCol());
      const res = nodeResource(view.kind, view.variant);
      if (e.carryAmt[i]! > 0 && (e.carryRes[i] !== res || e.carryAmt[i]! >= carryCapacity(state, i, res))) {
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
          alert(state, e.owner[i]!, 'I cannot reach that.', e.x[i]!, e.z[i]!, i);
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
      if (!gatherable(state, i, view)) return runOut(lastRes, lastCol());
      const info = propInfo(view.kind);
      const res = nodeResource(view.kind, view.variant);
      const [nx, nz] = nodeColumn(o, view);
      e.heading[i] = headingTowards(columnCentre(nx) - e.x[i]!, columnCentre(nz) - e.z[i]!);
      e.order[i] = info.shape === PropShape.Tree || info.shape === PropShape.Bush ? OrderKind.Chop : info.shape === PropShape.Plant ? OrderKind.Farm : OrderKind.Mine;
      // Every tool kit fishes 1 fish per 10 s (Table 2c); other nodes go at the tool's pace.
      const pace = isFish(view.kind) ? FISH_PACE : gatherPace(state, i, view.kind);
      e.timer[i] = e.timer[i]! + pace;
      // A worker learns as it gathers (Patch 3: experience for the work, at the work's pace).
      workXp(state, i, Work.Gather, pace);
      const room = carryCapacity(state, i, res) - (e.carryRes[i] === res ? e.carryAmt[i]! : 0);
      const want = Math.max(1, Math.min(info.perLoad, room));
      // Less than a full load (the last of a cart, or 3 of the heavier ore, Patch 5) takes its share of the time (s).
      if (e.timer[i]! < floorDiv(info.loadSteps * 1000 * want, info.perLoad)) return CONTINUE;
      e.timer[i] = 0;
      const before = view.amount;
      const taken = state.world.harvest(o.cx, o.cz, o.i, want, state.step);
      // An Elf may be watching (Elves: tree warnings).
      if (taken > 0 && isTree(view.kind)) peoplesHooks.treeCut(state, i, columnCentre(nx), columnCentre(nz));
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
      // The rest of an emptied carcass: hides, leather or feathers, straight to the pool (s).
      if (before - taken <= 0 && view.kind === PropKind.Carcass) {
        const pool = state.players[e.owner[i]!]!.pool;
        for (const [r, n] of carcassExtra(view.variant)) pool[r] = pool[r]! + n;
      }
      // A cart or pack is filled at the node before the trip home, and so is a fisher's catch.
      if (e.carryAmt[i]! < carryCapacity(state, i, res) && (before - taken > 0 || isFish(view.kind))) return CONTINUE;
      // Patch 5 (Jade, BL-12: a cart worth using): a cart or pack with room left moves on to the nearest node of the same kind before the trip home (s).
      if (e.carryAmt[i]! < carryCapacity(state, i, res) && rawLimitTenthsLb(state, i) > RAW_CARRY_TENTHS_LB) {
        const alt = findNode(state, i, res, nx, nz, NODE_SEARCH_COLUMNS, o);
        if (alt) {
          o.cx = alt.cx;
          o.cz = alt.cz;
          o.i = alt.i;
          e.act[i] = Act.Walk;
          resetWalk(state, i);
          return CONTINUE;
        }
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
      // Gathering by itself, it weighs what to fetch again after every load (the stock has changed).
      if (after === 'forage') return DONE;
      view = nodeView(state, o.cx, o.cz, o.i);
      if (!gatherable(state, i, view)) return runOut(lastRes, lastCol());
      e.act[i] = Act.Walk;
      resetWalk(state, i);
      return CONTINUE;
    }
  }
  return DONE;
}

/** Resin from felling one softwood tree (s): torches need it and no node gives it. */
export const RESIN_PER_SOFTWOOD_TREE = 2;

/**
 * Walks the unit's load (or, with none, its loot bag) to a drop-off (a given
 * one, or the nearest that takes it) and unloads it there. With no way
 * there and `stairs`, a worker shut in a hole digs crude stairs out first
 * (units/dig.ts digStairsOut, Patch 4), and the walk goes on after.
 */
export function toDropoff(state: SimState, i: number, target: Building | null, stairs = false): WalkResult {
  const e = state.entities;
  const res = e.carryAmt[i]! > 0 ? e.carryRes[i]! : -1;
  const b = target ?? nearestDropoff(state, i, res);
  if (!b) {
    alert(state, e.owner[i]!, `There is nowhere to drop off ${RESOURCES[res]?.name.toLowerCase() ?? 'that'}. Build a storehouse.`, e.x[i]!, e.z[i]!, i);
    return FAILED;
  }
  const r = walkTo(state, i, besideBuilding(b));
  if (r === ARRIVED) unload(state, i, b);
  if (r === FAILED) {
    if (stairs && digStairsOut(state, i)) return MOVING;
    alert(state, e.owner[i]!, 'I cannot reach a drop-off.', e.x[i]!, e.z[i]!, i);
  }
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
  if (e.carryAmt[i] === 0 && bagEmpty(state, i)) return backToNode(state, i);
  // Unload in a hole a digger is shut in: it digs its way out first (Patch 4).
  const r = toDropoff(state, i, target, true);
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
    alert(state, owner, `I cannot reach the spot for the ${name.toLowerCase()}.`, wx, wz, i);
    return DONE;
  }
  // The cost is taken only now, when building begins; a blocked spot or a short pool cancels it with an alert.
  const why = buildRequirement(state, owner, o.kind);
  if (why) {
    alert(state, owner, `${name}: ${why}`, wx, wz, i);
    return DONE;
  }
  const blocked = placementBlocked(state, owner, o.kind, o.x, o.z, o.variant);
  if (blocked !== Blocked.None) {
    alert(state, owner, `The spot for the ${name.toLowerCase()} is blocked. ${BLOCKED_TEXT[blocked]}`, wx, wz, i);
    return DONE;
  }
  const cost = buildCost(state, owner, o.kind);
  const costMul = costMultiplier(state, owner, o.kind);
  const pool = state.players[owner]!.pool;
  if (!canAffordAny(pool, cost)) {
    alert(state, owner, `Not enough ${RESOURCES[shortOfAny(pool, cost)]!.name.toLowerCase()} to build the ${name.toLowerCase()} (${costText(cost)}).`, wx, wz, i);
    return DONE;
  }
  // Saplings and sprouting plants on the spot are pulled up first, one at a time (Building placement; seeds are trampled).
  const clear = clearingOn(state, o.kind, o.x, o.z, o.variant);
  if (clear) {
    if (e.act[i] !== Act.Work) {
      e.act[i] = Act.Work;
      e.timer[i] = 0;
    }
    e.heading[i] = headingTowards(columnCentre(clear.gx) - e.x[i]!, columnCentre(clear.gz) - e.z[i]!);
    e.order[i] = OrderKind.Farm;
    e.timer[i] = e.timer[i]! + 1;
    if (e.timer[i]! >= clear.steps) {
      state.world.removeProp(clear.cx, clear.cz, clear.i);
      e.timer[i] = 0;
    }
    return CONTINUE;
  }
  // "Any lumber" is paid from whichever lumber the stock holds most of; what was taken is kept for a cancel's refund.
  const paid = payAny(pool, cost);
  const b = placeBuilding(state, owner, o.kind, o.variant, o.x, o.z, false);
  b.hp = constructionHealth(o.kind, 0);
  b.costMul = costMul;
  b.paid = paid;
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
      alert(state, b.owner, 'I cannot reach that building.', e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    e.act[i] = Act.Work;
    e.timer[i] = 0;
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
  // Work goes at the pace of the worker's mallet or hammer (Table 2c: a stone hammer x1.15), a step of work per 1000.
  const pace = TOOL_SPEED_PER_MILLE[toolTier(e, i, ToolJob.Build)] ?? 1000;
  e.timer[i] = e.timer[i]! + pace;
  // A worker learns as it builds, upgrades or repairs (Patch 3).
  workXp(state, i, Work.Build, pace);
  while (e.timer[i]! >= 1000 && needsWork(b)) {
    e.timer[i] = e.timer[i]! - 1000;
    workOn(state, b);
  }
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

/**
 * Going into a building: workers shelter inside, everyone else goes up on
 * its top (units/top.ts). A worker sent up top (auto ENTER_TOP) goes up
 * while there is room there and shelters inside once it is full.
 */
function runEnter(state: SimState, i: number, o: Extract<UnitOrder, { t: 'enter' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  const worker = e.kind[i] === UnitKind.Worker;
  const topRoom = b && canGarrison(state, i) ? garrisonRoom(b) : 0;
  const shelter = b && worker ? shelterRoom(b) : 0;
  const up = topRoom > 0 && (!worker || o.auto === ENTER_TOP);
  if (!b || b.owner !== e.owner[i] || (!up && shelter === 0)) return DONE;
  if (e.inside[i] === b.id) {
    // Already in: sent up from the shelter below, or up top in a game saved before men stood on its posts.
    if (onTop(state, i) && e.y[i]! <= b.y * WU_PER_TERRAIN_UNIT) climbUp(state, i, b, o, topRoom);
    return CONTINUE;
  }
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) return DONE;
  // The top's places and the shelter's are counted apart.
  const top = up && unitsOnTop(state, b.id).length < topRoom;
  if (!top && (shelter === 0 || shelteredIn(state, b.id).length >= shelter)) {
    alert(state, b.owner, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} is full.`, e.x[i]!, e.z[i]!, i);
    return DONE;
  }
  // Going in at a drop-off leaves the load (and the loot) there.
  if (e.carryAmt[i]! > 0 && accepts(buildingSpec(b.kind), e.carryRes[i]!)) unload(state, i, b);
  else if (buildingSpec(b.kind).dropoff === 'all') handIn(state, i);
  goInside(state, i, b);
  e.act[i] = Act.Inside;
  if (top) climbUp(state, i, b, o, topRoom);
  // A worker whose way up was full shelters inside instead.
  else if (o.auto === ENTER_TOP) o.auto = shelterFallback(state);
  return CONTINUE;
}

/** A worker sent up top that shelters inside instead: in the dark it is in for the night and comes out at dawn once no monster is near (Jade's Patch 4, units/night-work.ts); by day it stays until let out. */
function shelterFallback(state: SimState): number {
  return isDark(state.step) ? ENTER_NIGHT : 0;
}

/** Up onto a building's top, on the first free place its level has for a man; a worker finding it full stays in the shelter below. */
function climbUp(state: SimState, i: number, b: Building, o: Extract<UnitOrder, { t: 'enter' }>, room: number): void {
  const e = state.entities;
  if (unitsOnTop(state, b.id).filter((j) => j !== i).length >= room) {
    if (e.kind[i] === UnitKind.Worker) o.auto = shelterFallback(state);
    return;
  }
  o.auto = ENTER_TOP;
  [e.x[i], e.y[i], e.z[i]] = freePost(state, b, i);
}

/** The workers sheltering inside a building (not up on its top), by index. */
export function shelteredIn(state: SimState, id: number): number[] {
  return unitsInside(state, id).filter((j) => !onTop(state, j));
}

/** Buildings that take assigned workers: the Farm, the Mineshaft and the Fishing dock (Patch 2: crafting buildings take none). */
export function takesWorkers(b: Building): boolean {
  return b.complete && levelSpec(b.kind, b.level).workers > 0;
}

/** The Farm (Patch 2: one kind of farm). */
export function isFarm(kind: number): boolean {
  return kind === BuildingKind.Farm;
}

/** The Barn's hand's day and night (Patch 5), set by units/barn-hand.ts so this module never imports the questions. */
export const jobHooks: { barn: (state: SimState, i: number, b: Building) => boolean } = { barn: () => false };

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

/** Where farmer number k stands in a farm's field: a grid of spots clear of the farmhouse in its north-west corner. */
function farmSpot(b: Building, k: number): [number, number] {
  const s = placedDims(b);
  // The farmhouse: the solid columns in the north-west quarter (a scarecrow or a well out in the field is not it).
  let sw = 0;
  let sd = 0;
  for (const [x, z] of s.cells) {
    if (x >= s.w >> 1 || z >= s.d >> 1) continue;
    sw = Math.max(sw, x + 1);
    sd = Math.max(sd, z + 1);
  }
  const x0 = b.x + s.ox;
  const z0 = b.z + s.oz;
  let fx = Math.min(x0 + sw + 1 + ((k & 1) === 0 ? 0 : (s.w - sw) >> 1), x0 + s.w - 1);
  const fz = Math.min(z0 + sd + 1 + ((k >> 1) & 1 ? (s.d - sd) >> 1 : 0), z0 + s.d - 1);
  // Off anything else that stands in the field, along the row.
  while (fx > x0 && solidOf(b, fx, fz)) fx--;
  return [fx, fz];
}

/** Whether a column is one of a building's solid ones. */
function solidOf(b: Building, x: number, z: number): boolean {
  const s = placedDims(b);
  const dx = x - b.x - s.ox;
  const dz = z - b.z - s.oz;
  return s.cells.some(([cx, cz]) => cx === dx && cz === dz);
}

function runJob(state: SimState, i: number, o: Extract<UnitOrder, { t: 'job' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !takesWorkers(b)) return DONE;
  const slot = assigned(state, b.id).indexOf(i);
  if (slot >= levelSpec(b.kind, b.level).workers) {
    if (e.act[i] === Act.Start) alert(state, b.owner, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} has all the workers it can take.`, e.x[i]!, e.z[i]!, i);
    return DONE;
  }
  if (b.kind === BuildingKind.Mineshaft) return runMiner(state, i, b);
  // Patch 5: the Barn's hand tends the animals outside by day (units/barn-hand.ts).
  if (b.kind === BuildingKind.Barn) return jobHooks.barn(state, i, b);
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  // Farmers work the field by day and shelter in their own farmhouse at dusk and night; mill hands work inside.
  const indoors = !isFarm(b.kind) || isDark(state.step);
  if (indoors) {
    if (e.inside[i] === b.id) {
      e.act[i] = Act.Work;
      // A dock hand learns as it fishes, by day as a gatherer works (Patch 3); a farmer sheltering for the night does not.
      if (!isDark(state.step)) workXp(state, i, Work.Gather);
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
  // A farmer in the field learns as it works (Patch 3).
  workXp(state, i, Work.Gather);
  return CONTINUE;
}

/**
 * A miner's trips (Patch 2, Jade: "the worker goes to it, disappears into
 * the mine for however long it takes to fill its inventory weight wise, and
 * then returns to drop off point"). It drops whatever it carries first, goes
 * down the shaft and digs (it counts as a miner only while down there); once
 * a 25 lb bagful waits, the miner who has been down longest takes it out to
 * the nearest main base or Storehouse, hands it in and comes back. At dusk
 * and at night it stays down and digs on, and carries out at dawn (s).
 */
function runMiner(state: SimState, i: number, b: Building): boolean {
  const e = state.entities;
  if (e.act[i] === Act.Start) {
    const res = e.carryAmt[i]! > 0 ? e.carryRes[i]! : -1;
    const loaded = e.carryAmt[i]! > 0 || !bagEmpty(state, i);
    e.act[i] = loaded && nearestDropoff(state, i, res) ? Act.ToDrop : Act.Walk;
    if (e.inside[i] === b.id) e.act[i] = Act.Work;
  }
  if (e.act[i] === Act.ToDrop) {
    const r = toDropoff(state, i, null);
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    e.act[i] = Act.Walk;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (e.act[i] !== Act.Work) {
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      alert(state, b.owner, 'A miner cannot reach the mineshaft.', e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    if (e.carryAmt[i]! > 0) unload(state, i);
    goInside(state, i, b);
    e.act[i] = Act.Work;
    e.timer[i] = 0;
    return CONTINUE;
  }
  if (e.inside[i] !== b.id) {
    e.act[i] = Act.Walk;
    return CONTINUE;
  }
  e.timer[i] = e.timer[i]! + 1;
  const dark = isDark(state.step);
  // A miner down the shaft learns as it digs, by day as a gatherer works (Patch 3).
  if (!dark) workXp(state, i, Work.Gather);
  if (dark || b.stock.length === 0 || firstMiner(state, b) !== i) return CONTINUE;
  const room = bagFreeTenthsLb(state, i);
  if (stockTenthsLb(b) < room && !workedOut(state, b)) return CONTINUE;
  for (const [res, n] of fillBag(b, room)) addToBag(state, i, res, n);
  if (bagEmpty(state, i)) return CONTINUE;
  leaveBuilding(state, i);
  resetWalk(state, i);
  e.act[i] = Act.ToDrop;
  return CONTINUE;
}

/** The miner down a shaft longest (ties to the lower index): the next to carry a bagful out. */
function firstMiner(state: SimState, b: Building): number {
  const e = state.entities;
  let best = -1;
  for (const j of assigned(state, b.id)) {
    if (e.inside[j] !== b.id || e.act[j] !== Act.Work) continue;
    if (best < 0 || e.timer[j]! > e.timer[best]!) best = j;
  }
  return best;
}

/** A worker relights a light that was put out: 2 s sitting beside it, at no cost (Table 18; Patch 2: lights need no fuel, and relighting is a timed action, units/tinker.ts). */
function runRelight(state: SimState, i: number, o: Extract<UnitOrder, { t: 'relight' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || !buildingSpec(b.kind).light || !b.complete || b.owner !== e.owner[i] || !isSnuffed(b)) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (e.act[i] === Act.Walk) {
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  // Sitting beside it, tinkering with the bar over its head (Jade's Patch 2 timed actions).
  if (!tinker(state, i, RELIGHT_STEPS)) return CONTINUE;
  relight(b);
  return DONE;
}

/** Rank training at the Barracks (Table 7): to Soldier, to Veteran. */
export const WARRIOR_RANK_TRAINING: ReadonlyArray<{ rank: number; food: number; steps: number; base: number; name: string }> = [
  { rank: 2, food: 30, steps: 60 * STEPS_PER_SECOND, base: 0, name: 'Soldier' },
  { rank: 3, food: 60, steps: 120 * STEPS_PER_SECOND, base: 0, name: 'Veteran' },
];

/** The rank training a warrior can take next at the Barracks, or undefined at rank 3 and above (Patch 3: workers rank up by working, never by training). */
export function nextRankTraining(rank: number): (typeof WARRIOR_RANK_TRAINING)[number] | undefined {
  return WARRIOR_RANK_TRAINING.find((t) => t.rank === rank + 1);
}

/** Where a unit trains its rank: warriors at the Barracks, mages at the Magi Sanctum; -1 for a worker, which ranks up by working (Patch 3). */
export function rankTrainedAt(kind: number): number {
  if (kind === UnitKind.Mage) return BuildingKind.MagiSanctum;
  return kind === UnitKind.Warrior ? BuildingKind.Barracks : -1;
}

/**
 * A mage's rank training at the Magi Sanctum (Table 7): food and mana
 * crystals (Adept Acolyte 2; the combat ranks 2, 5 and 10) are paid on arrival.
 */
function runMageTrain(state: SimState, i: number, b: Building): boolean {
  const e = state.entities;
  const t = nextMageTraining(e.rank[i]!);
  const player = state.players[b.owner]!;
  const who = SCHOOL_NAMES[e.school[i]!]!.toLowerCase();
  if (!t) return DONE;
  if (e.inside[i] !== b.id) {
    const why = mageTrainingProblem(state, i);
    if (why) {
      alert(state, b.owner, why, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    if (player.pool[Res.ManaCrystal]! < t.crystals) {
      alert(state, b.owner, `Training a ${who} to ${t.name} needs ${t.crystals} mana crystals.`, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    if (t.food > 0 && !payFood(player, t.food)) {
      alert(state, b.owner, `Not enough food to train a ${who} to ${t.name} (${t.food} food).`, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    player.pool[Res.ManaCrystal] = player.pool[Res.ManaCrystal]! - t.crystals;
    goInside(state, i, b);
    e.act[i] = Act.Inside;
    e.timer[i] = 0;
  }
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < t.steps) return CONTINUE;
  setMageRank(state, i, t.rank);
  // Trained to Acolyte or Adept, she counts as having that rank's experience (s), as warriors do.
  e.xp[i] = Math.max(e.xp[i]!, MAGE_XP_TENTHS[t.rank]!);
  leaveBuilding(state, i);
  state.events.push({ player: b.owner, kind: 'info', text: `A ${who} has trained to ${t.name}.`, x: e.x[i]!, z: e.z[i]! });
  return DONE;
}

function runTrain(state: SimState, i: number, o: Extract<UnitOrder, { t: 'train' }>): boolean {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mage) {
    const b = state.buildings.get(o.b);
    if (!b || b.kind !== BuildingKind.MagiSanctum || !b.complete || b.owner !== e.owner[i]) return DONE;
    return runMageTrain(state, i, b);
  }
  const b = state.buildings.get(o.b);
  // Only warriors train here: a worker ranks up by working (Patch 3).
  if (e.kind[i] !== UnitKind.Warrior) return DONE;
  const t = nextRankTraining(e.rank[i]!);
  if (!b || !t || b.kind !== rankTrainedAt(e.kind[i]!) || !b.complete || b.owner !== e.owner[i]) return DONE;
  if (e.inside[i] !== b.id) {
    if (mainBaseLevel(state, b.owner) < t.base) {
      alert(state, b.owner, `Training to ${t.name} needs a tier ${t.base} main base.`, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    if (!payFood(state.players[b.owner]!, t.food)) {
      alert(state, b.owner, `Not enough food to train ${aTroop(e.troop[i]!, e.wTier[i]!)} to ${t.name} (${t.food} food).`, e.x[i]!, e.z[i]!, i);
      return DONE;
    }
    if (e.carryAmt[i]! > 0 || !bagEmpty(state, i)) unload(state, i, b);
    goInside(state, i, b);
    e.act[i] = Act.Inside;
    e.timer[i] = 0;
  }
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < t.steps) return CONTINUE;
  e.rank[i] = t.rank;
  const hp = WARRIOR_HEALTH_BY_RANK[t.rank]!;
  e.hp[i] = e.hp[i]! + hp - e.maxHp[i]!;
  e.maxHp[i] = hp;
  // A trained warrior counts as having the experience of its rank, so combat carries on from there (s).
  e.xp[i] = Math.max(e.xp[i]!, WARRIOR_XP_TENTHS[t.rank]!);
  leaveBuilding(state, i);
  state.events.push({ player: b.owner, kind: 'info', text: `${aTroop(e.troop[i]!, e.wTier[i]!, true)} has trained to ${t.name}.`, x: e.x[i]!, z: e.z[i]! });
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
    case 'relight':
      return runRelight(state, i, o);
    case 'train':
      return runTrain(state, i, o);
    case 'attack':
      // The fight layer carries an attack out; reaching here means its target is gone.
      return DONE;
    case 'hold':
      return CONTINUE;
    case 'attackMove':
      return runMove(state, i, o as unknown as Extract<UnitOrder, { t: 'move' }>);
    case 'patrol':
      return runPatrol(state, i, o);
    case 'kitUp':
      return runKitUp(state, i, o);
    case 'cart':
      return runCart(state, i, o);
    case 'dig':
      return runDig(state, i, o);
    case 'stairs':
      return runStairs(state, i, o);
    case 'hunt':
      return runHunt(state, i, o);
    case 'tame':
      return runTame(state, i, o);
    case 'eat':
      return runEat(state, i, o);
    case 'hitch':
      return runHitch(state, i, o);
    case 'prospect':
      return runProspect(state, i, o);
    case 'cast':
      // The fight layer carries a cast out (magic/cast.ts); reaching here means it is over.
      return DONE;
    case 'crew':
      return runCrew(state, i, o);
    case 'mend':
      return runMend(state, i, o);
    case 'retrain':
      return runRetrain(state, i, o);
    case 'port':
      // Only an engine takes a cannon port (siege/engines.ts runEngine).
      return DONE;
    case 'loot':
      return runLoot(state, i, o);
    case 'forage':
      return runForage(state, i, o);
  }
}

/** Patrol: walk to one end, then the other, forever. */
function runPatrol(state: SimState, i: number, o: Extract<UnitOrder, { t: 'patrol' }>): boolean {
  const e = state.entities;
  const x = o.leg === 0 ? o.x : o.x2;
  const z = o.leg === 0 ? o.z : o.z2;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, pointGoal(col(x), col(z)), x, z);
  if (r === MOVING) return CONTINUE;
  o.leg ^= 1;
  resetWalk(state, i);
  return CONTINUE;
}

/** One step for one of the players' units. */
export function runUnit(state: SimState, i: number): void {
  const e = state.entities;
  e.order[i] = OrderKind.Idle;
  // A timed action sets it again on each step it goes on (units/tinker.ts).
  e.tinker[i] = 0;
  // Held by a slime: it cannot act until let go.
  if (e.heldUntil[i]! > state.step) return;
  // Inside a building's walls (a game saved before they were walls): out first.
  if (e.inside[i] === 0) stepOffSolid(state, i);
  if (fightStep(state, i)) return;
  // A few orders in a row may finish at once (a drop-off with nothing carried); bounded so a step stays short.
  for (let guard = 0; guard < 4; guard++) {
    const q = e.queue[i]!;
    const o = q[0];
    if (!o) {
      if (e.inside[i] !== 0) leaveBuilding(state, i);
      // Idle: loot near by is picked up, and in the day the bag handed in.
      else if (guard === 0) lootIdle(state, i);
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
