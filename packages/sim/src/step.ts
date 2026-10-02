// The step function: the only way the simulation advances. Inputs in, state
// changed in place, a small result out.

import { computeEnclosed, outlyingLights, updateLights } from './buildings/lights.ts';
import { updateBuildings } from './buildings/production.ts';
import { updateMines } from './buildings/mining.ts';
import { clockAt, Period, periodMessage, periodStarting } from './clock.ts';
import { applyOrders } from './commands.ts';
import { clamp, floorDiv, HASH_INTERVAL_STEPS, headingTowards, length2d, WU_PER_METRE } from './fixed.ts';
import type { Order } from './orders.ts';
import { hashState } from './serialize.ts';
import { FOG_INTERVAL_STEPS, NEUTRAL, OrderKind, revealAroundUnits, UnitKind, type SimState } from './state.ts';
import { Act, leaveBuilding, resetWalk, runUnit } from './units/behaviour.ts';
import { hurtHooks, settleDeaths } from './combat/combat.ts';
import { installDeathHooks, updateElimination } from './combat/deaths.ts';
import { onUnitHurt } from './combat/fight.ts';
import { mobBudget, runMob, updateSun } from './combat/mob-ai.ts';
import { updateProjectiles } from './combat/projectiles.ts';
import { updateSpawns } from './combat/spawn.ts';
import { updateGear } from './units/gear.ts';
import { updateFood } from './economy/food.ts';
import { installAnimalHooks, runAnimal, updateAnimals } from './animals/animals.ts';

installDeathHooks();
installAnimalHooks();
hurtHooks.unit = onUnitHurt;

/** How far a wanderer strays per leg, and how far from the origin it may roam. */
const WANDER_LEG_WU = 15 * WU_PER_METRE;
const WANDER_BOUND_WU = 40 * WU_PER_METRE;

export interface StepResult {
  /** The step number the state has now reached. */
  step: number;
  /** The state hash, present every HASH_INTERVAL_STEPS steps (the desync hook). */
  hash?: number;
}

/** M0's wanderers: neutral units that walk straight to random points, drawing on the 'ai' stream. */
function wander(state: SimState, i: number): void {
  const e = state.entities;
  const ai = state.rng.ai;
  if (e.order[i] === OrderKind.Idle) {
    const at = e.wanderAt[i]!;
    if (at !== 0 && state.step >= at) {
      e.order[i] = OrderKind.Move;
      e.targetX[i] = clamp(e.x[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
      e.targetZ[i] = clamp(e.z[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
    }
    return;
  }
  const dx = e.targetX[i]! - e.x[i]!;
  const dz = e.targetZ[i]! - e.z[i]!;
  if (dx === 0 && dz === 0) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  e.heading[i] = headingTowards(dx, dz);
  const speed = e.speed[i]!;
  const dist = length2d(dx, dz);
  if (dist <= speed) {
    e.x[i] = e.targetX[i]!;
    e.z[i] = e.targetZ[i]!;
    e.order[i] = OrderKind.Idle;
    e.wanderAt[i] = state.step + ai.range(20, 100);
  } else {
    e.x[i] = e.x[i]! + floorDiv(dx * speed, dist);
    e.z[i] = e.z[i]! + floorDiv(dz * speed, dist);
  }
  e.y[i] = state.world.groundY(e.x[i]!, e.z[i]!, e.y[i]!);
}

/** What happens as a period begins: the alert, and at dusk the outlying count and enclosures, at day the shelters empty. */
function periodChange(state: SimState): void {
  const p = periodStarting(state.step);
  if (p === -1) return;
  const c = clockAt(state.step);
  state.events.push({ player: -1, kind: 'period', text: periodMessage(c) });
  if (p === Period.Dusk) {
    computeEnclosed(state);
    for (let player = 0; player < state.players.length; player++) {
      const { halves, limit } = outlyingLights(state, player, c.cycle);
      if (halves > limit * 2) {
        const n = floorDiv(halves + 1, 2);
        state.events.push({ player, kind: 'alert', text: `Too many lights burn outside the base: ${n}, and the limit tonight is ${limit}. Goblins will come for them.` });
      }
    }
  }
  if (p === Period.Day) {
    // Units sent home at dusk come out at daybreak and carry on with what they were doing.
    const e = state.entities;
    for (let i = 0; i < e.count; i++) {
      const h = e.queue[i]![0];
      if (h?.t !== 'enter' || h.auto !== 1) continue;
      e.queue[i]!.shift();
      e.act[i] = Act.Start;
      e.timer[i] = 0;
      resetWalk(state, i);
      if (e.inside[i] !== 0) leaveBuilding(state, i);
    }
  }
}

/**
 * Advances the state by one step (50 ms of game time). `orders` are every
 * player's orders for this step; they are applied before anything moves.
 */
export function step(state: SimState, orders: readonly Order[] = []): StepResult {
  state.events = [];
  state.hits = [];
  state.dying = [];
  state.falling = [];
  state.paths.searches = 0;
  mobBudget.searches = 0;
  const e = state.entities;
  state.grid.rebuild(e);
  applyOrders(state, orders);
  periodChange(state);
  updateSpawns(state);
  updateAnimals(state);
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    if (e.owner[i] === NEUTRAL && e.kind[i] === UnitKind.Wanderer) wander(state, i);
    else if (e.kind[i] === UnitKind.Mob) runMob(state, i);
    else if (e.kind[i] === UnitKind.Animal) runAnimal(state, i);
    else runUnit(state, i);
  }
  updateProjectiles(state);
  updateSun(state);
  updateFood(state);
  settleDeaths(state);
  updateBuildings(state);
  updateMines(state);
  updateLights(state);
  updateGear(state);
  updateElimination(state);
  state.world.flowWater();
  state.step++;
  if (state.step % FOG_INTERVAL_STEPS === 0) revealAroundUnits(state);
  if (state.step % HASH_INTERVAL_STEPS === 0) return { step: state.step, hash: hashState(state) };
  return { step: state.step };
}
