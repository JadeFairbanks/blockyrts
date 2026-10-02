// The step function: the only way the simulation advances. Inputs in, state
// changed in place, a small result out.

import { clamp, floorDiv, HASH_INTERVAL_STEPS, headingTowards, length2d, WORLD_EDGE_WU, WU_PER_METRE } from './fixed.ts';
import { canonicalOrders, type Order } from './orders.ts';
import { hashState } from './serialize.ts';
import { FOG_INTERVAL_STEPS, NEUTRAL, OrderKind, revealAroundUnits, type SimState } from './state.ts';

/** How far a wanderer strays per leg, and how far from the origin it may roam. */
const WANDER_LEG_WU = 15 * WU_PER_METRE;
const WANDER_BOUND_WU = 40 * WU_PER_METRE;

export interface StepResult {
  /** The step number the state has now reached. */
  step: number;
  /** The state hash, present every HASH_INTERVAL_STEPS steps (the desync hook). */
  hash?: number;
}

function applyOrders(state: SimState, orders: readonly Order[]): void {
  const e = state.entities;
  for (const order of canonicalOrders(orders)) {
    switch (order.kind) {
      case 'move': {
        const tx = clamp(order.x, -WORLD_EDGE_WU, WORLD_EDGE_WU);
        const tz = clamp(order.z, -WORLD_EDGE_WU, WORLD_EDGE_WU);
        for (const id of order.units) {
          const i = e.indexOf(id);
          if (i < 0 || e.owner[i] !== order.player) continue;
          e.order[i] = OrderKind.Move;
          e.targetX[i] = tx;
          e.targetZ[i] = tz;
        }
        break;
      }
      case 'stop':
        for (const id of order.units) {
          const i = e.indexOf(id);
          if (i < 0 || e.owner[i] !== order.player) continue;
          e.order[i] = OrderKind.Idle;
        }
        break;
      case 'terrain':
        state.world.editBox(order.x0, order.z0, order.x1, order.z1, order.bottom, order.top, order.material);
        break;
      case 'debugReveal':
        if (order.player < state.world.players) state.world.reveal(order.player, order.x, order.z, order.radius);
        break;
      case 'debugHarvest':
        state.world.harvest(order.cx, order.cz, order.index, order.amount, state.step);
        break;
    }
  }
}

function moveEntities(state: SimState): void {
  const e = state.entities;
  const ai = state.rng.ai;
  for (let i = 0; i < e.count; i++) {
    if (e.order[i] === OrderKind.Idle) {
      const at = e.wanderAt[i]!;
      if (e.owner[i] === NEUTRAL && at !== 0 && state.step >= at) {
        e.order[i] = OrderKind.Move;
        e.targetX[i] = clamp(e.x[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
        e.targetZ[i] = clamp(e.z[i]! + ai.range(-WANDER_LEG_WU, WANDER_LEG_WU), -WANDER_BOUND_WU, WANDER_BOUND_WU);
      }
      continue;
    }
    const dx = e.targetX[i]! - e.x[i]!;
    const dz = e.targetZ[i]! - e.z[i]!;
    if (dx === 0 && dz === 0) {
      e.order[i] = OrderKind.Idle;
      continue;
    }
    e.heading[i] = headingTowards(dx, dz);
    const speed = e.speed[i]!;
    const dist = length2d(dx, dz);
    if (dist <= speed) {
      e.x[i] = e.targetX[i]!;
      e.z[i] = e.targetZ[i]!;
      e.order[i] = OrderKind.Idle;
      if (e.owner[i] === NEUTRAL) e.wanderAt[i] = state.step + ai.range(20, 100);
    } else {
      e.x[i] = e.x[i]! + floorDiv(dx * speed, dist);
      e.z[i] = e.z[i]! + floorDiv(dz * speed, dist);
    }
    // Stand on the land. Climbing, wading and blocking come with Moving over the land (M2).
    e.y[i] = state.world.groundY(e.x[i]!, e.z[i]!, e.y[i]!);
  }
}

/**
 * Advances the state by one step (50 ms of game time). `orders` are every
 * player's orders for this step; they are applied before anything moves.
 */
export function step(state: SimState, orders: readonly Order[] = []): StepResult {
  applyOrders(state, orders);
  moveEntities(state);
  state.world.flowWater();
  state.step++;
  if (state.step % FOG_INTERVAL_STEPS === 0) revealAroundUnits(state);
  if (state.step % HASH_INTERVAL_STEPS === 0) return { step: state.step, hash: hashState(state) };
  return { step: state.step };
}
