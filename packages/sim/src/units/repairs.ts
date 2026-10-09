// Jade's Patch 5: autorepair (UI-13), a worker's own switch (a right click on
// Repair), with which it fixes anything of its owner's that is damaged within
// 8 m of it; and Repair all (GP-25), the button in place of a camera spot,
// which calls the workers within 20 m of each damaged building to repair it,
// idle ones first, never a farm's or barn's workers from their jobs. After the
// repair they go back to what they were doing, and those who were idle start
// gathering.
import { BuildingKind, workSteps } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { buildingWorth, repairCost } from '../buildings/repair.ts';
import { maxHealth, solidRect, type Building } from '../buildings/store.ts';
import { shortOfAny } from '../economy/food-kinds.ts';
import { RESOURCES } from '../economy/resources.ts';
import { ceilDiv, floorDiv, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { mendWhy } from '../siege/engines.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Act, builderLimit, giveOrder, resetWalk } from './behaviour.ts';
import { startForage } from './forage.ts';
import type { UnitOrder, UnitOrderType } from './unit-orders.ts';

/** A worker on autorepair fixes what is damaged within this many metres of it (Jade, UI-13). */
export const AUTO_REPAIR_M = 8;
/** How often (steps) a worker on autorepair looks round it, each on its own step by its id (s: half a second). */
export const AUTO_REPAIR_EVERY = 10;
/** Repair all calls the workers within this many metres of a damaged building (Jade, GP-25). */
export const REPAIR_CALL_M = 20;

/** What a worker on autorepair leaves for a repair and comes back to after (s): its gathering round, or nothing. A move, a build, a dig, a job or shelter is never broken off. */
const AUTO_REPAIR_OVER: ReadonlySet<UnitOrderType> = new Set<UnitOrderType>(['gather', 'forage', 'return', 'dropoff', 'loot']);

/** Squared distance (wu) from a point to the nearest edge of a building's solid part; 0 on it. */
function toBuilding2(b: Building, x: number, z: number): number {
  const [x0, z0, x1, z1] = solidRect(b);
  const dx = x < x0 * WU_PER_COLUMN ? x0 * WU_PER_COLUMN - x : x > (x1 + 1) * WU_PER_COLUMN ? x - (x1 + 1) * WU_PER_COLUMN : 0;
  const dz = z < z0 * WU_PER_COLUMN ? z0 * WU_PER_COLUMN - z : z > (z1 + 1) * WU_PER_COLUMN ? z - (z1 + 1) * WU_PER_COLUMN : 0;
  return dx * dx + dz * dz;
}

/** What one worker-step of repair on a building costs now (UI-13): empty when it is whole. */
function repairStepCost(b: Building): ReturnType<typeof repairCost> {
  const max = maxHealth(b);
  return repairCost(buildingWorth(b), max, b.hp, Math.min(max, b.hp + ceilDiv(max, workSteps(b.kind, b.level))));
}

/** The resource the owner's stock is short of for the next step of repair on a building, or -1. */
export function repairShort(state: SimState, b: Building): number {
  const pool = state.players[b.owner]?.pool;
  const cost = repairStepCost(b);
  if (cost.length === 0) return -1;
  return pool ? shortOfAny(pool, cost) : cost[0]![0];
}

/** A complete building of its owner's that has lost health and is not being upgraded. */
function damaged(b: Building): boolean {
  return b.complete && b.upgrading === 0 && b.hp < maxHealth(b);
}

/** The workers whose current order is to work on a building. */
function workersOn(state: SimState, id: number): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) {
    const o = e.queue[j]![0];
    if (o?.t === 'work' && o.b === id && e.hp[j]! > 0) n++;
  }
  return n;
}

/** Breaks off what a unit is doing for an order, which it goes back to after. */
function interrupt(state: SimState, i: number, o: UnitOrder): void {
  const e = state.entities;
  e.queue[i]!.unshift(o);
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
}

/**
 * A worker on autorepair, on its step: the worst-off damaged building or
 * engine of its owner's within AUTO_REPAIR_M of it, if the stock can pay for
 * the repair and the building has room for another builder.
 */
export function autoRepairStep(state: SimState, i: number): void {
  const e = state.entities;
  if ((state.step + e.id[i]!) % AUTO_REPAIR_EVERY !== 0) return;
  if (e.kind[i] !== UnitKind.Worker || e.inside[i] !== 0 || e.hp[i]! <= 0) return;
  const now = e.queue[i]![0];
  if (now && !AUTO_REPAIR_OVER.has(now.t)) return;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const reach2 = (AUTO_REPAIR_M * WU_PER_METRE) ** 2;
  let best: UnitOrder | null = null;
  let bestPm = 1000;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !damaged(b) || toBuilding2(b, x, z) > reach2) continue;
    const pm = floorDiv(b.hp * 1000, maxHealth(b));
    if (pm >= bestPm || repairShort(state, b) >= 0 || workersOn(state, b.id) >= builderLimit(b.kind)) continue;
    best = { t: 'work', b: b.id };
    bestPm = pm;
  }
  // Engines and cannons are fixed too (free, as before Patch 5).
  for (const j of state.grid.near(x, z, AUTO_REPAIR_M * WU_PER_METRE)) {
    if (e.kind[j] !== UnitKind.Engine || e.hp[j]! >= e.maxHp[j]! || dist2(e.x[j]!, e.z[j]!, x, z) > reach2 || mendWhy(state, i, j) !== '') continue;
    const pm = floorDiv(e.hp[j]! * 1000, e.maxHp[j]!);
    if (pm < bestPm || (pm === bestPm && best?.t === 'mend' && e.id[j]! < best.id)) {
      best = { t: 'mend', id: e.id[j]! };
      bestPm = pm;
    }
  }
  if (best) interrupt(state, i, best);
}

/** Workers a farm or a barn keeps at its job: never called away by Repair all (Jade, GP-25). */
function farmHand(state: SimState, o: UnitOrder | undefined): boolean {
  if (o?.t !== 'job') return false;
  const k = state.buildings.get(o.b)?.kind;
  return k === BuildingKind.Farm || k === BuildingKind.Barn;
}

/**
 * Repair all (GP-25): each damaged building of the player's, the worst first,
 * gets the workers within REPAIR_CALL_M of it, up to its builder limit:
 * idle workers first, then the nearest. A worker already building or
 * repairing, sheltering or up on a building, or working a farm or barn,
 * stays where it is. A busy worker goes back to its task after; an idle one
 * starts gathering. Returns how many were sent.
 */
export function callRepairs(state: SimState, player: number): number {
  const e = state.entities;
  const list = state.buildings.list.filter((b) => b.owner === player && damaged(b));
  if (list.length === 0) {
    state.events.push({ player, kind: 'alert', text: 'Nothing needs repairing.' });
    return 0;
  }
  const pm = (b: Building): number => floorDiv(b.hp * 1000, maxHealth(b));
  list.sort((a, b) => pm(a) - pm(b) || a.id - b.id);
  const reach2 = (REPAIR_CALL_M * WU_PER_METRE) ** 2;
  const taken = new Set<number>();
  let sent = 0;
  let short = -1;
  let shortAt: Building | null = null;
  for (const b of list) {
    const lack = repairShort(state, b);
    if (lack >= 0) {
      if (short < 0) {
        short = lack;
        shortAt = b;
      }
      continue;
    }
    const room = builderLimit(b.kind) - workersOn(state, b.id);
    if (room <= 0) continue;
    const near: Array<[number, number, number]> = [];
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.hp[i]! <= 0 || taken.has(i)) continue;
      const o = e.queue[i]![0];
      if (o?.t === 'work' || o?.t === 'repairAll' || o?.t === 'enter' || farmHand(state, o)) continue;
      const d = toBuilding2(b, e.x[i]!, e.z[i]!);
      if (d <= reach2) near.push([o ? 1 : 0, d, i]);
    }
    near.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    for (const [busy, , i] of near.slice(0, room)) {
      taken.add(i);
      sent++;
      if (busy) {
        interrupt(state, i, { t: 'work', b: b.id });
      } else {
        giveOrder(state, i, { t: 'work', b: b.id }, false);
        e.queue[i]!.push(startForage(state, i));
      }
    }
  }
  if (sent === 0) {
    const [x, z] = shortAt ? buildingCentre(shortAt) : buildingCentre(list[0]!);
    const text = short >= 0 ? `Not enough ${RESOURCES[short]!.name.toLowerCase()} to repair.` : `No free workers within ${REPAIR_CALL_M} m of a damaged building.`;
    state.events.push({ player, kind: 'alert', text, x, z });
  }
  return sent;
}
