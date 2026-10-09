// The bar over each boosted farm (Jade's UI-17: "A mirrored progress bar is
// visible above each farm"): the same bonemeal boost as the panel's "Boost
// remaining" bar, emptying as it wears off. It goes in the farm's bar stack
// over the world (world-marks.ts), under its other bars.

import type { BuildingInfo } from '../messages.ts';
import type { StackBar } from './world-marks.ts';

/** The boost bar's colour, as the panel's (hud.css .sel-bar.boost). */
export const BOOST_COLOUR = '#c9d98a';

/** The boost bar for a thing's stack ('b:<id>'): a farm boosted now has one, everything else none. */
export function boostStackBars(key: string, building: (id: number) => BuildingInfo | undefined): readonly StackBar[] {
  if (!key.startsWith('b:')) return [];
  const v = building(Number(key.slice(2)))?.boost;
  if (!v || v.left <= 0) return [];
  return [{ frac: Math.min(v.left, v.whole) / Math.max(1, v.whole), colour: BOOST_COLOUR }];
}
