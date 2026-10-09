// What a player's unit does at a stone circle: leave the Goddess her gifts
// (Jade's answer 9), take an idol from the altar (SCA-4, SCB-4), open a
// bluestone chest and take what is in it (SC-6), buy from the Great White Ape
// (SCA-2). The unit walks there first; the act happens once it stands within
// reach.

import { canAfford, pay, Res, RESOURCES, type Cost } from '../economy/resources.ts';
import { floorDiv, headingTowards, length2d, WU_PER_COLUMN } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { peoplesHooks } from '../peoples/hooks.ts';
import { say } from '../peoples/speech.ts';
import type { SimState } from '../state.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { dropLoot } from '../units/loot.ts';
import { Act, FAILED, MOVING, walkTo } from '../units/behaviour.ts';
import { OrderKind, UnitKind } from '../state.ts';
import { BuildingKind } from '../buildings/data.ts';
import { PropKind } from '../world/props.ts';
import { BAND_NAMES } from '../world/layout.ts';
import { nextNight } from './bright.ts';
import { CIRCLE_TYPE_NAMES, CircleProp, CircleType, CLEARING_M, GIFT_GOLD, GIFT_ROSES, GIFT_SILVER, HAWTHORNE_FELL_STEPS, HAWTHORNE_LUMBER, circleMetres as m, PLANT_STEPS, REACH_M } from './data.ts';
import { circleHooks, Disturb, disturbed } from './disturb.ts';
import { chestLoot, circleNear, circlePieces, circleSite, circleSites, idolOf, type CirclePiece } from './place.ts';
import { hawthorneFelled, plantHawthorne, plantSpotProblem, propOn } from './trees.ts';

const COL = WU_PER_COLUMN;
const CONTINUE = false;
const DONE = true;

/**
 * The acts, as a circle order's `act`. Planting an Ancient Seed (SC-8) and
 * cutting down a bare Sweet Hawthorne are done on a column anywhere: their
 * order's `circle` is the column's x and `arg` its z. Buying from the Ape is
 * done beside him: `arg` is the good (0 hawthorne fruit, 1 honey, 2 enchanted
 * wine).
 */
export const CircleAct = { Gift: 0, TakeIdol: 1, OpenChest: 2, TakeChest: 3, Plant: 4, Fell: 5, Buy: 6 } as const;
export type CircleAct = (typeof CircleAct)[keyof typeof CircleAct];
export const CIRCLE_ACTS = 7;

/** Whether an act is done on a column rather than at a circle. */
export function onColumn(act: number): boolean {
  return act === CircleAct.Plant || act === CircleAct.Fell;
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
  if (onColumn(act)) return [circle * COL + (COL >> 1), arg * COL + (COL >> 1)];
  const s = circleSite(state.world.layout, circle);
  if (!s) return null;
  if (act === CircleAct.Gift || act === CircleAct.TakeIdol) return [s.x, s.z];
  if (act === CircleAct.Buy) return circleHooks.apeAt(state, circle);
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
  if (act === CircleAct.Plant) {
    if (state.players[player]!.pool[Res.AncientSeed]! <= 0) return 'You have no Ancient Seed.';
    return plantSpotProblem(state, circle, arg);
  }
  if (act === CircleAct.Fell) {
    const tree = propOn(state, circle, arg, PropKind.SweetHawthorne);
    if (!tree) return 'There is no Sweet Hawthorne there.';
    return tree.amount > 0 ? 'Pick its fruit first: a Sweet Hawthorne is cut down once it is bare.' : '';
  }
  const s = circleSite(state.world.layout, circle);
  if (!s) return 'There is no stone circle there.';
  switch (act) {
    case CircleAct.Buy:
      return circleHooks.buyProblem(state, player, circle, arg);
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

/** SC-8: the worker who plants a seed at a point (wu), "the nearest worker (who is not working in a farm or barn)", or -1. */
export function planter(state: SimState, player: number, x: number, z: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
    const o = e.queue[i]![0];
    if (o?.t === 'job') {
      const kind = state.buildings.get(o.b)?.kind;
      if (kind === BuildingKind.Farm || kind === BuildingKind.Barn) continue;
    }
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
  if (act === CircleAct.Plant) {
    const pool = state.players[player]!.pool;
    pool[Res.AncientSeed] = pool[Res.AncientSeed]! - 1;
    plantHawthorne(state, circle, arg);
    state.events.push({ player, kind: 'info', text: 'The Ancient Seed is in the ground. A Sweet Hawthorne will grow there over the next few nights.', x: e.x[i]!, z: e.z[i]! });
    return;
  }
  if (act === CircleAct.Fell) {
    const tree = propOn(state, circle, arg, PropKind.SweetHawthorne)!;
    const [x, z] = actSpot(state, circle, act, arg)!;
    state.world.removeProp(tree.cx, tree.cz, tree.index);
    hawthorneFelled(state, circle, arg);
    dropLoot(state, x, z, [[Res.HardwoodLumber, HAWTHORNE_LUMBER]], { killer: i, owner: player, brag: 0, src: 0 });
    peoplesHooks.treeCut(state, i, x, z);
    const ruin = circleNear(state.world.layout, x, z, CLEARING_M);
    if (ruin) disturbed(state, ruin.id, i, Disturb.CutHawthorne);
    return;
  }
  const s = circleSite(state.world.layout, circle)!;
  switch (act) {
    case CircleAct.Buy:
      circleHooks.buy(state, i, circle, arg);
      return;
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
      say(state, i, onColumn(o.act) ? 'I cannot reach that spot.' : o.act === CircleAct.Buy ? 'I cannot reach the Great White Ape.' : 'I cannot reach that spot in the stone circle.', true);
      return DONE;
    }
  }
  // Planting and cutting down take a while at the spot (s).
  if (onColumn(o.act)) {
    if (e.act[i] !== Act.Work) {
      if (actProblem(state, e.owner[i]!, o.circle, o.act, o.arg)) {
        doAct(state, i, o.circle, o.act, o.arg);
        return DONE;
      }
      e.act[i] = Act.Work;
      e.waitUntil[i] = state.step + (o.act === CircleAct.Plant ? PLANT_STEPS : HAWTHORNE_FELL_STEPS);
      e.heading[i] = headingTowards(x - e.x[i]!, z - e.z[i]!);
    }
    e.order[i] = o.act === CircleAct.Plant ? OrderKind.Farm : OrderKind.Chop;
    if (state.step < e.waitUntil[i]!) return CONTINUE;
  }
  doAct(state, i, o.circle, o.act, o.arg);
  return DONE;
}

/** How near the camera must look at a circle for the debugger's button to move on to the next one, metres. */
const SHOW_NEXT_M = 40;

/**
 * The debugger's Stone circle button: the camera goes to the circle nearest
 * to where it looks, or on to the next circle when it is already looking at
 * one, and the land round it is revealed.
 */
export function showCircle(state: SimState, player: number, x: number, z: number): void {
  const sites = circleSites(state.world.layout);
  if (sites.length === 0) {
    state.events.push({ player, kind: 'info', text: 'Debug: this world has no stone circle.' });
    return;
  }
  let near = sites[0]!;
  for (const s of sites) if (length2d(s.x - x, s.z - z) < length2d(near.x - x, near.z - z)) near = s;
  const site = length2d(near.x - x, near.z - z) < m(SHOW_NEXT_M) ? sites[(near.id + 1) % sites.length]! : near;
  state.world.reveal(site.x, site.z, m(CLEARING_M + 20));
  state.events.push({ player, kind: 'info', text: `Debug: ${CIRCLE_TYPE_NAMES[site.type]} ${site.id + 1} of ${sites.length}, in the ${BAND_NAMES[site.band]}.`, x: site.x, z: site.z, look: true });
}
