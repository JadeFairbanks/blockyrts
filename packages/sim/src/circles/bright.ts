// Bright Nights (SCA-2, SCA-4 to SCA-6, SCA-8; Jade's answers 2.8 and 9): a
// full, smiling moon that lights the night. Which nights are bright, for whom
// and where, all worked out from the clock and the circles' state, so the
// waves (threats/), the sky (the client) and the Moon Roses ask the same thing.

import { clockAt, Period } from '../clock.ts';
import { length2d } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import type { SimState } from '../state.ts';
import { brightHooks } from '../threats/bright.ts';
import { BLESSED_EVERY_NIGHTS, CircleType, IDOL_AREA_EVERY_NIGHTS, IDOL_AREA_M, circleMetres as m } from './data.ts';
import { circleSites, type CircleSite } from './place.ts';

const SALT_MOON = 0x6d6f6f6e;

/** The night a step looks forward to: tonight while it has not yet fallen (day and dusk), else the one after. */
export function nextNight(step: number): number {
  const c = clockAt(step);
  return c.period === Period.Day || c.period === Period.Dusk ? c.cycle : c.cycle + 1;
}

/**
 * Whether a night is one of a player's Bright Nights: one in ten for the rest
 * of the game once the Goddess has blessed them, the first the night after
 * (SCA-2; answers 2.8 and 9), and the night a Moon Goddess idol was used for
 * (answer 2.8: "makes the next night bright for that player").
 */
export function brightFor(state: SimState, player: number, night: number): boolean {
  const c = state.circles;
  const b = c.blessed[player] ?? -1;
  if (b >= 0 && night >= b && (night - b) % BLESSED_EVERY_NIGHTS === 0) return true;
  return (c.idolNight[player] ?? -1) === night;
}

/** Whether any player still in has a Bright Night: the sky brightens for everyone (answer 2.8). */
export function skyBright(state: SimState, night: number): boolean {
  for (let p = 0; p < state.players.length; p++) if (!state.players[p]!.out && brightFor(state, p, night)) return true;
  return false;
}

/** Whether a Lunar circle still has its Moon Goddess idol on the altar (SCA-4). */
export function idolHome(state: SimState, s: CircleSite): boolean {
  return s.type === CircleType.Lunar && !state.circles.taken.includes(s.id);
}

/** Whether a circle's idol makes a night bright round it: one night in three (SCA-4; answer 2.8), each circle on its own nights. */
export function idolNight(state: SimState, s: CircleSite, night: number): boolean {
  if (!idolHome(state, s)) return false;
  return (night + (hash32(state.seed ^ SALT_MOON, s.id) % IDOL_AREA_EVERY_NIGHTS)) % IDOL_AREA_EVERY_NIGHTS === 0;
}

/** The Lunar circle whose idol makes this night bright at a point (wu), within 200 m of it (SCA-4), or undefined. */
export function idolAreaAt(state: SimState, x: number, z: number, night: number): CircleSite | undefined {
  for (const s of circleSites(state.world.layout)) {
    if (s.type !== CircleType.Lunar || length2d(s.x - x, s.z - z) >= m(IDOL_AREA_M)) continue;
    if (idolNight(state, s, night)) return s;
  }
  return undefined;
}

/** Whether a night is bright at a point (wu): anyone's Bright Night, or an idol's night there. The Moon Roses bloom where it is (SCA-8). */
export function brightAt(state: SimState, x: number, z: number, night: number): boolean {
  return skyBright(state, night) || idolAreaAt(state, x, z, night) !== undefined;
}

/** Whether it is a bright night now at a point (wu): night has fallen and it is bright there (Moon Roses open, the sky lightens). */
export function brightNow(state: SimState, x: number, z: number): boolean {
  const c = clockAt(state.step);
  return c.period === Period.Night && brightAt(state, x, z, c.cycle);
}

/** Nights from `night` to the player's next Bright Night (0: that night), or -1 for none coming (for the quest menu: decisions 3.6). */
export function nightsToBright(state: SimState, player: number, night: number): number {
  const c = state.circles;
  let best = -1;
  const idol = c.idolNight[player] ?? -1;
  if (idol >= night) best = idol - night;
  const b = c.blessed[player] ?? -1;
  if (b >= 0) {
    const n = night <= b ? b - night : (BLESSED_EVERY_NIGHTS - ((night - b) % BLESSED_EVERY_NIGHTS)) % BLESSED_EVERY_NIGHTS;
    if (best < 0 || n < best) best = n;
  }
  return best;
}

// The waves ask the same question (threats/bright.ts): which nights are a player's Bright Nights.
brightHooks.bright = brightFor;
