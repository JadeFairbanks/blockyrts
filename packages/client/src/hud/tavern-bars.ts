// The Tavern's bar in the shared stack over buildings (Patch 5, Jade, GP-20
// with UI-18): while one of the player's own Taverns is open for business, a
// silver bar fills to its till's next silver ingot. A Dreadnought being hired
// there is its queue's gold bar, which the stack draws for every building.
import type { BuildingInfo } from '../messages.ts';
import type { StackBar } from './world-marks.ts';

/** The till's colour: silver. */
export const TILL_COLOUR = '#c8d2dc';

/** A Tavern's bars for the stack over it ('b:<id>'): its till's while it is the player's own and open for business. */
export function tillBars(key: string, buildings: ReadonlyMap<number, BuildingInfo>, player: number): StackBar[] {
  if (!key.startsWith('b:')) return [];
  const b = buildings.get(Number(key.slice(2)));
  const t = b && b.owner === player && b.complete ? b.tavern : null;
  return t?.open ? [{ frac: Math.max(0, Math.min(1, t.done / 1000)), colour: TILL_COLOUR }] : [];
}
