// What a player's unit does at a stone circle: leave the Goddess her gifts
// (Jade's answer 9), take an idol from the altar (SCA-4, SCB-4), open a
// bluestone chest and take what is in it (SC-6). The unit walks there first;
// the act happens once it stands within reach.

import { canAfford, pay, Res, RESOURCES, type Cost } from '../economy/resources.ts';
import { floorDiv, length2d, WU_PER_COLUMN } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { say } from '../peoples/speech.ts';
import type { SimState } from '../state.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { dropLoot } from '../units/loot.ts';
import { Act, FAILED, MOVING, walkTo } from '../units/behaviour.ts';
import { nextNight } from './bright.ts';
import { CircleProp, CircleType, GIFT_GOLD, GIFT_ROSES, GIFT_SILVER, circleMetres as m, REACH_M } from './data.ts';
import { chestLoot, circlePieces, circleSite, idolOf, type CirclePiece } from './place.ts';

const COL = WU_PER_COLUMN;
const CONTINUE = false;
const DONE = true;

/** The acts, as a circle order's `act`. */
export const CircleAct = { Gift: 0, TakeIdol: 1, OpenChest: 2, TakeChest: 3 } as const;
export type CircleAct = (typeof CircleAct)[keyof typeof CircleAct];
export const CIRCLE_ACTS = 4;

/** What a player's side did to a circle, for its guardian (SCA-3; the encounters set the hook). */
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

function disturbed(state: SimState, circle: number, unit: number, what: Disturb): void {
  circleHooks.disturbed?.(state, circle, unit, what);
}

// ----- chests -----

/** A circle's chest number `n`. */
export function chestPiece(state: SimState, circle: number, n: number): CirclePiece | undefined {
  return circlePieces(state.world.layout, circle).find((p) => p.prop === CircleProp.Chest && p.look === n);
}

/** The slots still filled in a chest, a bit each. */
export function chestMask(state: SimState, circle: number, n: number): number {
  const key = circle * 8 + n;
  const list = state.circles.chests;
  for (let k = 0; k < list.length; k += 2) if (list[k] === key) return list[k + 1]!;
  return chestPiece(state, circle, n)?.amount ?? 0;
}

function setChestMask(state: SimState, circle: number, n: number, mask: number): void {
  const key = circle * 8 + n;
  const list = state.circles.chests;
  for (let k = 0; k < list.length; k += 2) {
    if (list[k] === key) {
      list[k + 1] = mask;
      return;
    }
  }
  let at = 0;
  while (at < list.length && list[at]! < key) at += 2;
  list.splice(at, 0, key, mask);
}

/** A chest's five slots (SC-6): what each holds, or null once taken (or never filled). */
export function chestSlots(state: SimState, circle: number, n: number): Array<[number, number] | null> {
  const p = chestPiece(state, circle, n);
  if (!p) return [];
  const loot = chestLoot(state.world.layout.seed, p.gx, p.gz);
  const mask = chestMask(state, circle, n);
  return loot.map((item, k) => (mask & (1 << k) ? item : null));
}

// ----- where and whether -----

/** Where a unit goes for an act, wu: the altar in the middle, or the chest. */
export function actSpot(state: SimState, circle: number, act: number, arg: number): [number, number] | null {
  const s = circleSite(state.world.layout, circle);
  if (!s) return null;
  if (act === CircleAct.Gift || act === CircleAct.TakeIdol) return [s.x, s.z];
  const p = chestPiece(state, circle, act === CircleAct.TakeChest ? floorDiv(arg, 8) : arg);
  return p ? [p.gx * COL + (COL >> 1), p.gz * COL + (COL >> 1)] : null;
}

/** The lavish gifts a player would leave (answer 9): 5 gold, or 35 silver when they have not the gold, and 3 Moon Roses. */
export function giftCost(state: SimState, player: number): Cost {
  const gold: Cost = [[Res.Gold, GIFT_GOLD], [Res.MoonRose, GIFT_ROSES]];
  const silver: Cost = [[Res.Silver, GIFT_SILVER], [Res.MoonRose, GIFT_ROSES]];
  return canAfford(state.players[player]!.pool, gold) || !canAfford(state.players[player]!.pool, silver) ? gold : silver;
}

/** Why a player cannot do an act at a circle now, or '' (for the panel's greyed buttons, and checked again on arrival). */
export function actProblem(state: SimState, player: number, circle: number, act: number, arg: number): string {
  const s = circleSite(state.world.layout, circle);
  if (!s) return 'There is no stone circle there.';
  switch (act) {
    case CircleAct.Gift: {
      if (s.type !== CircleType.Lunar) return 'Only the Moon Goddess takes gifts, at her altar in a Great White Ape Lunar Circle.';
      if (state.circles.taken.includes(circle)) return 'The Goddess\'s idol is gone from this altar.';
      if (state.circles.blessed[player]! >= 0) return 'The Moon Goddess has already blessed you.';
      const p = state.players[player]!.pool;
      if (p[Res.MoonRose]! < GIFT_ROSES) return `The Goddess asks for ${GIFT_ROSES} Moon Roses, with ${GIFT_GOLD} gold or ${GIFT_SILVER} silver.`;
      if (p[Res.Gold]! < GIFT_GOLD && p[Res.Silver]! < GIFT_SILVER) return `The Goddess asks for ${GIFT_GOLD} gold or ${GIFT_SILVER} silver, with ${GIFT_ROSES} Moon Roses.`;
      return '';
    }
    case CircleAct.TakeIdol:
      if (idolOf(s.type) < 0) return 'The dais on this altar is empty.';
      if (state.circles.taken.includes(circle)) return 'The idol has already been taken.';
      return '';
    case CircleAct.OpenChest:
      return chestPiece(state, circle, arg) ? '' : 'There is no chest there.';
    case CircleAct.TakeChest: {
      const slots = chestSlots(state, circle, floorDiv(arg, 8));
      return slots[arg % 8] ? '' : 'That space in the chest is empty.';
    }
  }
  return 'Nothing to do there.';
}

/** The player's unit standing within reach of an act's spot, nearest first, or -1. */
export function unitAt(state: SimState, player: number, x: number, z: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = m(REACH_M) + 1;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
    const d = length2d(e.x[i]! - x, e.z[i]! - z);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

// ----- doing it -----

/** Does an act with a unit that stands within reach, or has it say why it cannot. */
export function doAct(state: SimState, i: number, circle: number, act: number, arg: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  const why = actProblem(state, player, circle, act, arg);
  if (why) {
    say(state, i, why, true);
    return;
  }
  const s = circleSite(state.world.layout, circle)!;
  switch (act) {
    case CircleAct.Gift: {
      pay(state.players[player]!.pool, giftCost(state, player));
      const night = nextNight(state.step);
      state.circles.blessed[player] = night;
      state.events.push({
        player,
        kind: 'alert',
        text: 'The Moon Goddess accepts your gifts and blesses you. One night in every ten will be a Bright Night for you, starting with the coming night.',
        x: s.x,
        z: s.z,
      });
      return;
    }
    case CircleAct.TakeIdol: {
      const idol = idolOf(s.type);
      const list = state.circles.taken;
      let at = 0;
      while (at < list.length && list[at]! < circle) at++;
      list.splice(at, 0, circle);
      dropLoot(state, s.x, s.z, [[idol, 1]], { killer: i, owner: player, brag: 0, src: 0 });
      state.events.push({ player, kind: 'info', text: `Your unit took the ${RESOURCES[idol]!.name} from the altar.`, x: s.x, z: s.z });
      disturbed(state, circle, i, Disturb.Idol);
      return;
    }
    case CircleAct.OpenChest:
      state.events.push({ player, kind: 'info', text: 'The bluestone chest\'s stone slab slides open.', chest: circle * 8 + arg, x: e.x[i]!, z: e.z[i]! });
      return;
    case CircleAct.TakeChest: {
      const n = floorDiv(arg, 8);
      const slot = arg % 8;
      const item = chestSlots(state, circle, n)[slot]!;
      setChestMask(state, circle, n, chestMask(state, circle, n) & ~(1 << slot));
      // Into the unit's bag as far as it fits; the rest is laid on the ground by the chest for the side to pick up.
      const [x, z] = actSpot(state, circle, act, arg)!;
      dropLoot(state, x, z, [item], { killer: i, owner: player, brag: 0, src: 0 });
      disturbed(state, circle, i, Disturb.Chest);
      return;
    }
  }
}

/** One step of a unit's circle order: walk within reach, then act. */
export function runCircle(state: SimState, i: number, o: Extract<UnitOrder, { t: 'circle' }>): boolean {
  const e = state.entities;
  const spot = actSpot(state, o.circle, o.act, o.arg);
  if (!spot) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const [x, z] = spot;
  if (length2d(e.x[i]! - x, e.z[i]! - z) > m(REACH_M)) {
    const r = walkTo(state, i, { ...pointGoal(floorDiv(x, COL), floorDiv(z, COL)), max: floorDiv(m(REACH_M), COL) - 1 });
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      say(state, i, 'I cannot reach that spot in the stone circle.', true);
      return DONE;
    }
  }
  doAct(state, i, o.circle, o.act, o.arg);
  return DONE;
}
