// The Stone Circle items a player uses from the inventory (decisions 3.6:
// one right-click menu for every usable item, "Use" greyed out with a reason
// when it cannot be used): the Pan Flute (SC-11), the Moon Goddess idol
// (SCA-5, answer 2.8), the Headless God Idol (SCB-4: threats/headless.ts) and
// enchanted wine from a mage's bag (answer 2.5). Each is a row, so more items
// can be added the same way.

import { Nature, speciesSpec } from '../animals/species.ts';
import { Res } from '../economy/resources.ts';
import { length2d } from '../fixed.ts';
import { MANA_SCALE } from '../magic/spells.ts';
import { manaCap } from '../magic/mages.ts';
import { say } from '../peoples/speech.ts';
import { UnitKind, WILD, type SimState } from '../state.ts';
import { homeBaseNear } from '../units/forage.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { hash32 } from '../rng.ts';
import { headlessProblem, useHeadless } from '../threats/headless.ts';
import { nextNight } from './bright.ts';
import { IDOL_USE_EVERY_NIGHTS, circleMetres as m, PAN_FLUTE_RADIUS_M, PAN_FLUTE_STOP_M, PAN_FLUTE_USES } from './data.ts';

/** Where an item is used from: the player's inventory, or the bag of a unit of the player's. */
export const UseFrom = { Stock: 0, Bag: 1 } as const;
export type UseFrom = (typeof UseFrom)[keyof typeof UseFrom];

export interface ItemUse {
  res: Res;
  from: UseFrom;
  /** The menu's word for using it. */
  label: string;
  /** Why it cannot be used now, or '' (unit: the unit whose bag it is in, -1 for the inventory; arg: what it is used on, -1 for none: the Headless God Idol's faction). */
  problem: (state: SimState, player: number, unit: number, arg: number) => string;
  /** Uses it (the order is checked against `problem` first). */
  use: (state: SimState, player: number, unit: number, arg: number) => void;
}

/** Enchanted wine refills this much mana (answer 2.5). */
export const WINE_MANA = 50;

/** Animals that keep to themselves (SC-11: "neutral animals"): the grazers that flee or only fight back. */
function neutral(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Animal || e.owner[i] !== WILD || e.hp[i]! <= 0) return false;
  const n = speciesSpec(e.mob[i]!).nature;
  return n === Nature.Shy || n === Nature.FightsBack;
}

/**
 * The Pan Flute (SC-11): "a peaceful tune on the flute which attracts all
 * neutral animals in a 300 m radius towards the player's base". It is played
 * where the unit using it stands, or at the main base; the animals it reaches
 * make their home by the main base nearest them (s).
 */
function playFlute(state: SimState, player: number, unit: number): void {
  const e = state.entities;
  const ps = state.players[player]!;
  const base = homeBaseNear(state, player, unit >= 0 ? e.x[unit]! : 0, unit >= 0 ? e.z[unit]! : 0);
  const [bx, bz] = buildingCentre(base!);
  const [px, pz] = unit >= 0 ? [e.x[unit]!, e.z[unit]!] : [bx, bz];
  let n = 0;
  for (let i = 0; i < e.count; i++) {
    if (!neutral(state, i) || length2d(e.x[i]! - px, e.z[i]! - pz) > m(PAN_FLUTE_RADIUS_M)) continue;
    const h = hash32(state.seed, 0x666c7574, e.id[i]!);
    const spread = m(PAN_FLUTE_STOP_M);
    e.homeX[i] = bx + ((h & 0xffff) % (spread * 2 + 1)) - spread;
    e.homeZ[i] = bz + (((h >>> 16) & 0xffff) % (spread * 2 + 1)) - spread;
    e.wanderAt[i] = state.step;
    n++;
  }
  const c = state.circles;
  if (c.flute[player] === 0) c.flute[player] = PAN_FLUTE_USES;
  c.flute[player] = c.flute[player]! - 1;
  let tail = `${c.flute[player]} ${c.flute[player] === 1 ? 'play' : 'plays'} left on the flute.`;
  if (c.flute[player] === 0) {
    ps.pool[Res.PanFlute] = ps.pool[Res.PanFlute]! - 1;
    tail = 'The flute is worn out.';
  }
  const heard = n === 0 ? 'no animal is near enough to hear it.' : n === 1 ? '1 animal turns toward your base.' : `${n} animals turn toward your base.`;
  state.events.push({ player, kind: 'info', text: `A peaceful tune drifts from the Pan Flute: ${heard} ${tail}`, x: px, z: pz });
}

/** The night a player's idol can next be used for, or -1 when it is ready (answer 2.8: again after 10 nights). */
export function idolReadyNight(state: SimState, player: number): number {
  const last = state.circles.idolNight[player] ?? -1;
  if (last < 0) return -1;
  const ready = last + IDOL_USE_EVERY_NIGHTS;
  return nextNight(state.step) >= ready ? -1 : ready;
}

export const ITEM_USES: readonly ItemUse[] = [
  {
    res: Res.PanFlute,
    from: UseFrom.Stock,
    label: 'Play',
    problem: (state, player) => {
      if (state.players[player]!.pool[Res.PanFlute]! <= 0) return 'You have no Pan Flute.';
      return homeBaseNear(state, player, 0, 0) ? '' : 'The animals need a main base to go to.';
    },
    use: playFlute,
  },
  {
    res: Res.MoonIdol,
    from: UseFrom.Stock,
    label: 'Use',
    problem: (state, player) => {
      if (state.players[player]!.pool[Res.MoonIdol]! <= 0) return 'You have no Moon Goddess Idol.';
      const ready = idolReadyNight(state, player);
      if (ready < 0) return '';
      const n = ready - nextNight(state.step);
      return `The idol can light another night in ${n} ${n === 1 ? 'night' : 'nights'}.`;
    },
    use: (state, player) => {
      const night = nextNight(state.step);
      state.circles.idolNight[player] = night;
      state.events.push({ player, kind: 'alert', text: `The idol glows softly. Night ${night} will be a Bright Night for you.` });
    },
  },
  {
    // SCB-4: "unleash devastating waves of monsters against a faction you are at war with or declare war on one with it", on the faction chosen.
    res: Res.HeadlessIdol,
    from: UseFrom.Stock,
    label: 'Use',
    problem: (state, player, _unit, arg) => headlessProblem(state, player, arg),
    use: (state, player, _unit, arg) => useHeadless(state, player, arg),
  },
  {
    res: Res.EnchantedWine,
    from: UseFrom.Bag,
    label: 'Drink',
    problem: (state, player, unit) => {
      const e = state.entities;
      if (unit < 0 || e.owner[unit] !== player || e.kind[unit] !== UnitKind.Mage) return 'Only a mage can drink enchanted wine for mana.';
      if (!bagHas(state, unit, Res.EnchantedWine)) return 'This mage carries no enchanted wine.';
      return e.mana[unit]! >= manaCap(state, unit) ? 'This mage\'s mana is already full.' : '';
    },
    use: (state, _player, unit) => {
      const e = state.entities;
      takeFromBag(state, unit, Res.EnchantedWine, 1);
      e.mana[unit] = Math.min(manaCap(state, unit), e.mana[unit]! + WINE_MANA * MANA_SCALE);
      say(state, unit, 'The enchanted wine fills me with power.', false, true);
    },
  },
];

/** An item's use row, or undefined for an item with no use. */
export function itemUse(res: number): ItemUse | undefined {
  return ITEM_USES.find((u) => u.res === res);
}

/** Why an item cannot be used now ('' when it can; a reason for every item without a use). */
export function useProblem(state: SimState, player: number, res: number, unit = -1, arg = -1): string {
  const u = itemUse(res);
  if (!u) return 'This item has no use of its own.';
  return u.problem(state, player, unit, arg);
}

/** Uses an item (the useItem order). */
export function useItem(state: SimState, player: number, res: number, unit: number, arg = -1): void {
  const u = itemUse(res);
  if (!u) return;
  const why = u.problem(state, player, unit, arg);
  if (why) {
    if (unit >= 0 && state.entities.owner[unit] === player) say(state, unit, why, true);
    else state.events.push({ player, kind: 'alert', text: why });
    return;
  }
  u.use(state, player, unit, arg);
}

function bagHas(state: SimState, i: number, res: number): boolean {
  const g = state.entities.bag[i]!;
  for (let k = 0; k < g.length; k += 2) if (g[k] === res && g[k + 1]! > 0) return true;
  return false;
}

function takeFromBag(state: SimState, i: number, res: number, n: number): void {
  const g = state.entities.bag[i]!;
  for (let k = 0; k < g.length; k += 2) {
    if (g[k] !== res) continue;
    g[k + 1] = g[k + 1]! - n;
    if (g[k + 1]! <= 0) g.splice(k, 2);
    return;
  }
}
