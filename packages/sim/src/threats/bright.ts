// Bright Nights, the waves' side (Patch 5 decisions 2.8; Jade: "sure but
// they are not immune for monsters nearby attacking, uncluding from the
// waves going to other players. Remember: the wave size increases in
// general proportionally to the amount of players"). On a player's Bright
// Night the waves leave out that player's share, no wave is sent for their
// bases or units, and the wild wakes a third as full round only their units;
// any monster that comes near them still attacks as usual. Which nights are
// bright (the Goddess's blessing, the idols) is the Stone circles' to say:
// they set the hook, and until then no night is bright.

import { clockOf } from '../clock.ts';
import type { SimState } from '../state.ts';

export const brightHooks = {
  /** Whether a player has a Bright Night on a night (cycle number), from the state alone. */
  bright: (_state: SimState, _player: number, _night: number): boolean => false,
};

/** Whether a player's night tonight (or the night this dusk leads into) is bright. */
export function brightTonight(state: SimState, player: number): boolean {
  return brightHooks.bright(state, player, clockOf(state).cycle);
}
