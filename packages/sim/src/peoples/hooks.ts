// What the rest of the simulation asks of the peoples, as hooks the step
// installs (as the death and animal hooks are), so combat, the units and the
// animals need not import the peoples' modules.

import type { SimState } from '../state.ts';
import type { MobSpec } from '../combat/mobs.ts';

export const peoplesHooks: {
  /** One of the peoples' units or buildings died (`taker` the player whose unit hit it last, or -1). */
  death: (state: SimState, i: number, taker: number) => void;
  /** An abandoned building of theirs was broken down (salvage for the workers' player). */
  salvage: (state: SimState, i: number, taker: number) => void;
  /** An Elf caravan's wagon moves (a mob of role People). */
  wagon: (state: SimState, i: number, spec: MobSpec) => void;
  /** A beast of theirs (or one called by a Grovesinger) takes its step. */
  beast: (state: SimState, i: number) => void;
  /** A player's unit took wood from a tree (Elves' tree warnings). */
  treeCut: (state: SimState, i: number, x: number, z: number) => void;
  /** A mob or a wild animal died, `taker` the player whose unit killed it, or -1 (the quests' kills, Patch 5). */
  kill: (state: SimState, i: number, taker: number) => void;
} = { death: () => {}, salvage: () => {}, wagon: () => {}, beast: () => {}, treeCut: () => {}, kill: () => {} };
