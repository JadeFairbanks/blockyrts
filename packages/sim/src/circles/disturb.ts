// Telling a stone circle's guardian what a player's side did there (SCA-3:
// the Great White Ape "will not attack you unless you disturb the grounds of
// the temple too much"). The encounters (the Ape, Silenus, the Lich) set the
// hook. Apart from act.ts, so the gathering code can tell it too without a
// loop of imports.

import { WU_PER_COLUMN } from '../fixed.ts';
import type { SimState } from '../state.ts';
import { PropKind } from '../world/props.ts';
import { CLEARING_M } from './data.ts';
import { circleNear } from './place.ts';

const COL = WU_PER_COLUMN;

/** What a player's side did to a circle, for its guardian (SCA-3). */
export const Disturb = { Chest: 0, Idol: 1, CutHawthorne: 2, Trilithon: 3, Fruit: 4 } as const;
export type Disturb = (typeof Disturb)[keyof typeof Disturb];

/**
 * Hooks for the circles' encounters (the Great White Ape, Silenus, the
 * Lich): told whenever a player's unit disturbs a circle. Set by the module
 * that brings them in; until then nothing listens.
 */
export const circleHooks: {
  disturbed: ((state: SimState, circle: number, unit: number, what: Disturb) => void) | null;
} = { disturbed: null };

export function disturbed(state: SimState, circle: number, unit: number, what: Disturb): void {
  circleHooks.disturbed?.(state, circle, unit, what);
}

/** A unit took from a prop on a column: picking a circle's Sweet Hawthorne fruit, or mining one of its trilithons. */
export function propTaken(state: SimState, unit: number, kind: number, gx: number, gz: number): void {
  if (kind !== PropKind.SweetHawthorne && kind !== PropKind.Trilithon) return;
  const what = kind === PropKind.SweetHawthorne ? Disturb.Fruit : Disturb.Trilithon;
  const s = circleNear(state.world.layout, gx * COL + (COL >> 1), gz * COL + (COL >> 1), CLEARING_M);
  if (s) disturbed(state, s.id, unit, what);
}
