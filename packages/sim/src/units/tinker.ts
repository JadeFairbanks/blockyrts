// Timed actions beside a building (Jade's Patch 2, "Tinkering and a progress
// bar"): anything a unit has to do next to a building that takes time is done
// sitting down, hands together in front of the chest and head bowed over
// them, with a bar over its head that fills as it goes. Eating at a main
// base or storehouse (10 s) and Upgrade equipment (each piece's time) use it
// before Patch 2's other timed jobs; relighting a light (2 s) and eating to
// heal from a question are next. An order calls tinker() once a step from
// where it stands, with the timer at 0 when it sits down: the unit's timer
// counts the steps done and its tinker column says how many it takes, which
// is all the page needs for the bar and the pose (OrderKind.Tinker).
import { OrderKind, type SimState } from '../state.ts';

/** The longest timed action, steps (the tinker column is 16 bits): 54 minutes. */
export const TINKER_MAX_STEPS = 0xffff;

/**
 * One step of a timed action that takes `steps` steps: the unit sits and
 * tinkers, and its bar moves on a step. True on the step the bar is full,
 * when the action is done and the unit gets up.
 */
export function tinker(state: SimState, i: number, steps: number): boolean {
  const e = state.entities;
  const total = Math.max(1, Math.min(TINKER_MAX_STEPS, steps));
  e.order[i] = OrderKind.Tinker;
  e.tinker[i] = total;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < total) return false;
  e.tinker[i] = 0;
  return true;
}

/** Whether a unit sat tinkering on its last step. */
export function tinkering(state: SimState, i: number): boolean {
  return state.entities.tinker[i] !== 0;
}

/** How far a unit is through its timed action: [steps done, steps it takes], or [0, 0] when it is not tinkering. */
export function tinkerProgress(state: SimState, i: number): [number, number] {
  const e = state.entities;
  const total = e.tinker[i]!;
  if (total === 0) return [0, 0];
  return [Math.max(0, Math.min(total, e.timer[i]!)), total];
}
