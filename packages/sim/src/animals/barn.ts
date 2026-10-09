// The Barn's hand (Patch 5, Jade's GP-37: "Barns must require one worker
// working in them to work"). A Barn works only while its assigned worker is
// at it, in its loft or out round it tending the animals: without him the
// animals stay in their stalls, nothing grazes, breeds or lays, and slaughter
// waits. This module only answers whether a Barn is tended; the hand himself
// is units/barn-hand.ts.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { length2d, WU_PER_METRE } from '../fixed.ts';
import type { SimState } from '../state.ts';
import { assigned } from '../units/behaviour.ts';

/** Barn animals walk and graze round their Barn by day within this (s): 15 m. */
export const BARN_YARD_WU = 15 * WU_PER_METRE;
/** The hand counts as at work within this of his Barn's middle (s): the yard and 5 m more. */
const AT_WORK_WU = BARN_YARD_WU + 5 * WU_PER_METRE;

/** Not state: which Barns are tended, worked out once a step (every Barn animal asks each step), the step it is for. */
const tendedCache = new WeakMap<SimState, { step: number; tended: Map<number, boolean> }>();

/** Whether a finished Barn's hand is at work: an assigned worker in its loft or out in its yard. */
export function barnTended(state: SimState, b: Building): boolean {
  if (!b.complete || b.kind !== BuildingKind.Barn) return false;
  let c = tendedCache.get(state);
  if (!c || c.step !== state.step) {
    c = { step: state.step, tended: new Map() };
    tendedCache.set(state, c);
  }
  const known = c.tended.get(b.id);
  if (known !== undefined) return known;
  const e = state.entities;
  const [x, z] = buildingCentre(b);
  let tended = false;
  for (const j of assigned(state, b.id)) if (e.inside[j] === b.id || length2d(e.x[j]! - x, e.z[j]! - z) <= AT_WORK_WU) tended = true;
  c.tended.set(b.id, tended);
  return tended;
}

/** The finished Barn whose hand a unit is (its order now is the job there), or undefined. */
export function barnOf(state: SimState, i: number): Building | undefined {
  const o = state.entities.queue[i]![0];
  if (o?.t !== 'job') return undefined;
  const b = state.buildings.get(o.b);
  return b && b.complete && b.kind === BuildingKind.Barn ? b : undefined;
}
