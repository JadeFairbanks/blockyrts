// What a player's screen needs to know about the stone circles: the Bright
// Night sky, the idols taken, why the altar's acts are greyed, the chests the
// player has opened and the items that can be used. Worked out from the
// state, never stored.

import { clockAt } from '../clock.ts';
import type { SimState } from '../state.ts';
import { actProblem, chestSlots, CircleAct } from './act.ts';
import { brightFor, idolNight, nextNight, nightsToBright, skyBright } from './bright.ts';
import { CircleType } from './data.ts';
import { ITEM_USES, UseFrom } from './items.ts';
import { circleSites } from './place.ts';

export interface CirclesView {
  /** This cycle's night: coming (day, dusk), fallen, or just gone (dawn). The sky and the roses follow it. */
  night: number;
  /** Someone still in has a Bright Night then: the full, smiling moon for everyone (answer 2.8). */
  brightSky: boolean;
  /** The player's own Bright Night then. */
  brightMine: boolean;
  /** The Goddess has blessed the player (answer 9): one Bright Night in ten for the rest of the game. */
  blessed: boolean;
  /** Nights from the coming night to the player's next Bright Night (0: the coming night), or -1 for none coming. */
  nextBright: number;
  /** The Lunar circles whose idol lights that night round it, within 200 m (SCA-4): circle, x, z (wu). */
  idolAreas: Array<[number, number, number]>;
  /** Where the Moon Roses grow (every Lunar circle's middle, wu), whose musk tints the air rosy on a bright night there (SCA-8). */
  roses: Array<[number, number]>;
  /** The circles whose idol has been taken. */
  taken: number[];
  /** Per circle with an altar: why the player cannot leave the Goddess her gifts, and why not take the idol ('' when they can). */
  acts: Array<[number, string, string]>;
  /** The chests the player opened: key (circle * 8 + chest) and their five slots, (resource, count) or null once taken. */
  chests: Array<[number, Array<[number, number] | null>]>;
  /** The items in the player's inventory that have a use (a mage's wine is used from the mage's own bag): resource, the menu's word, and why it cannot be used now ('' when it can). */
  uses: Array<[number, string, string]>;
}

/** The circles as a player sees them; `opened` are the chest keys the player has opened. */
export function circlesView(state: SimState, player: number, opened: readonly number[]): CirclesView {
  const night = clockAt(state.step).cycle;
  const idolAreas: Array<[number, number, number]> = [];
  const roses: Array<[number, number]> = [];
  const acts: Array<[number, string, string]> = [];
  for (const s of circleSites(state.world.layout)) {
    if (s.type === CircleType.Generic || s.type === CircleType.Silenus) continue;
    if (s.type === CircleType.Lunar) roses.push([s.x, s.z]);
    if (idolNight(state, s, night)) idolAreas.push([s.id, s.x, s.z]);
    acts.push([s.id, actProblem(state, player, s.id, CircleAct.Gift, 0), actProblem(state, player, s.id, CircleAct.TakeIdol, 0)]);
  }
  const pool = state.players[player]!.pool;
  return {
    night,
    brightSky: skyBright(state, night),
    brightMine: brightFor(state, player, night),
    blessed: (state.circles.blessed[player] ?? -1) >= 0,
    nextBright: nightsToBright(state, player, nextNight(state.step)),
    idolAreas,
    roses,
    taken: state.circles.taken.slice(),
    acts,
    chests: opened.map((key) => [key, chestSlots(state, key >> 3, key & 7)]),
    uses: ITEM_USES.filter((u) => u.from === UseFrom.Stock && (pool[u.res] ?? 0) > 0).map((u) => [u.res, u.label, u.problem(state, player, -1)]),
  };
}
