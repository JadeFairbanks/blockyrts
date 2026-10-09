// The woodsman (Patch 5, Jade's WD-1 to WD-7): trained at the Scholar's
// Lodge for "32 food to make plus 1 of (leather OR hides) plus 4 sticks and 4
// flax", he forages wild food and fishes (units/woods.ts). He carries a
// two-handed (long) weapon of any tier, starting with a wooden spear, and no
// armour; he deals 2 less damage than a warrior with the same gear, fights
// back like a warrior when attacked, and upgrades his weapon only at a main
// base. He takes 1 supply and eats like a worker (decisions 3.4).
//
// His middle-HUD line (WD-7) is "how much food the woodsman brought in vs
// consumed on average over the past 10 minutes", or over his life when that
// is shorter: his ledger, a minute at a time, kept with his other state.

import { Res, RESOURCES } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { UnitKind, type EntityStore, type SimState } from '../state.ts';
import { LONG_KITS, Troop, type Piece } from './kits.ts';

/**
 * Training a woodsman (Jade's WD-1): his food, and his time before his kit's
 * (s: as an artillery crewman's 30 s), so with the spear and the rod he takes
 * 50 s. He deals `damageLess` less than a warrior with the same weapon (WD-3).
 */
export const WOODSMAN = { food: 32, trainS: 30, damageLess: 2 };

/** His own kit beside his weapon (Jade's WD-1: the leather or hides and the flax): his fishing rod and line, drawn in his hand only while he fishes (FR-2: "the model doesn't walk around with this showing"). */
const WOODS_KIT: Piece = {
  tier: 1,
  name: 'Fishing rod and line',
  model: 'fishing_rod',
  // Not a gear item (GP-1): it comes with him and never goes to the stock.
  items: [],
  cost: [
    [[Res.Leather, 1], [Res.Flax, 4]],
    [[Res.Hides, 1], [Res.Flax, 4]],
  ],
  timeS: 10,
  need: 1,
};

/** What a new woodsman is paid for and made with: the wooden spear (Table 2d tier 1, 4 sticks) and his rod and line. */
export const WOODSMAN_KIT: readonly Piece[] = [LONG_KITS[1]!, WOODS_KIT];
/** His Command card letter at the Scholar's Lodge (no research there uses W). */
export const WOODSMAN_KEY = 'W';

/** Whether a unit is a woodsman. */
export function isWoodsman(e: EntityStore, i: number): boolean {
  return e.kind[i] === UnitKind.Warrior && e.troop[i] === Troop.Woodsman;
}

// ----- the food line (WD-7) -----

/** The ledger covers this many minutes (Jade: "over the past 10 minutes"). */
export const LEDGER_MINUTES = 10;
const MINUTE_STEPS = 60 * STEPS_PER_SECOND;
/** A meal's round (economy/food.ts MEAL_STEPS: four meals a day and night). */
const MEAL_STEPS = floorDiv(CYCLE_STEPS, 4);
/** Green once he brings in more than this much food over what he eats every 3 meals (Jade: yellow for "at least 1-3 food surplus every 3 eat cycles", green "if he is earning more"). */
export const WOODSMAN_GREEN_FOOD = 3;
/** His line's colour: red while he does not pay his keep, yellow, green. */
export const Keep = { Red: 0, Yellow: 1, Green: 2 } as const;
export type Keep = (typeof Keep)[keyof typeof Keep];

// A ledger is [the step it starts, the minute last written, then food in and
// food eaten in quarters for each of the last LEDGER_MINUTES minutes, the
// minute m at 2 + 2 * (m mod LEDGER_MINUTES)].
const START = 0;
const LAST = 1;
const HEAD = 2;

/** Starts a woodsman's ledger (when he is trained, or when it is first written). */
export function openLedger(state: SimState, i: number): void {
  const l = new Array<number>(HEAD + 2 * LEDGER_MINUTES).fill(0);
  l[START] = state.step;
  state.entities.ledger[i] = l;
}

/** The ledger brought up to now: minutes that went by with nothing written are cleared. Returns the minute now. */
function roll(state: SimState, l: number[]): number {
  const m = floorDiv(state.step - l[START]!, MINUTE_STEPS);
  const last = l[LAST]!;
  for (let k = Math.max(last + 1, m - LEDGER_MINUTES + 1); k <= m; k++) {
    const at = HEAD + 2 * (k % LEDGER_MINUTES);
    l[at] = 0;
    l[at + 1] = 0;
  }
  l[LAST] = Math.max(last, m);
  return m;
}

/** Writes food a woodsman brought in and food he ate, quarters of nutrition. */
export function ledgerAdd(state: SimState, i: number, brought: number, ate: number): void {
  const e = state.entities;
  if (!isWoodsman(e, i) || (brought === 0 && ate === 0)) return;
  if (e.ledger[i]!.length === 0) openLedger(state, i);
  const l = e.ledger[i]!;
  const at = HEAD + 2 * (roll(state, l) % LEDGER_MINUTES);
  l[at] = l[at]! + brought;
  l[at + 1] = l[at + 1]! + ate;
}

/** The food in a list of (resource, count) pairs, quarters of nutrition. */
export function foodIn(pairs: readonly number[]): number {
  let q = 0;
  for (let k = 0; k < pairs.length; k += 2) q += (RESOURCES[pairs[k]!]?.nutrition ?? 0) * 4 * pairs[k + 1]!;
  return q;
}

/** A woodsman's line: food brought in and eaten (quarters) over the last 10 minutes or his life, how long that is (steps), and its colour. */
export function woodsmanLedger(state: SimState, i: number): { brought: number; ate: number; steps: number; keep: Keep } {
  const l = state.entities.ledger[i]!;
  if (l.length === 0) return { brought: 0, ate: 0, steps: 0, keep: Keep.Yellow };
  const m = floorDiv(state.step - l[START]!, MINUTE_STEPS);
  let brought = 0;
  let ate = 0;
  // Read without writing: the minutes since the last entry hold nothing.
  for (let k = Math.max(0, m - LEDGER_MINUTES + 1); k <= Math.min(m, l[LAST]!); k++) {
    brought += l[HEAD + 2 * (k % LEDGER_MINUTES)]!;
    ate += l[HEAD + 2 * (k % LEDGER_MINUTES) + 1]!;
  }
  // The window: from the start of the oldest minute counted, at most 10 minutes, at least a second.
  const from = Math.max(l[START]!, l[START]! + (m - LEDGER_MINUTES + 1) * MINUTE_STEPS);
  const steps = Math.max(STEPS_PER_SECOND, state.step - from);
  // Surplus per 3 meals, quarters: (in - eaten) over the window, scaled to 3 meals.
  const per3 = floorDiv((brought - ate) * 3 * MEAL_STEPS, steps);
  const keep = brought < ate ? Keep.Red : per3 > WOODSMAN_GREEN_FOOD * 4 ? Keep.Green : Keep.Yellow;
  return { brought, ate, steps, keep };
}
