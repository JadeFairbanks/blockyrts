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

/** What a player's screen shows of a Great White Ape alive: his entity id, his circle, his goods left today, why the player cannot trade with him now, and whether he is at peace with them. */
export interface ApeView {
  id: number;
  circle: number;
  left: [number, number, number];
  why: string;
  peace: boolean;
}

/**
 * Hooks for the circles' encounters (the Great White Ape, Silenus, the
 * Lich): told whenever a player's unit disturbs a circle, and the Ape's
 * goods (SCA-2). Set by threats/encounters.ts; until then nothing listens and
 * there is no Ape to trade with.
 */
export const circleHooks: {
  disturbed: ((state: SimState, circle: number, unit: number, what: Disturb) => void) | null;
  /** Where a circle's Ape stands now, wu, or null. */
  apeAt: (state: SimState, circle: number) => [number, number] | null;
  /** Why a player cannot buy a good (0 hawthorne fruit, 1 honey, 2 enchanted wine) from a circle's Ape ('' when they can); and the purchase, by a unit beside him. */
  buyProblem: (state: SimState, player: number, circle: number, good: number) => string;
  buy: (state: SimState, unit: number, circle: number, good: number) => void;
  /** Every Ape alive, as a player sees him. */
  apes: (state: SimState, player: number) => ApeView[];
} = { disturbed: null, apeAt: () => null, buyProblem: () => 'The Great White Ape is not here.', buy: () => {}, apes: () => [] };

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
