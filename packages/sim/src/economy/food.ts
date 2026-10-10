// Food, supply and health (Food, supply and health; Table 6). Every unit
// that eats has its meal four times a day, each at its own moment of the
// 110 s round (staggered by its id, so a big army does not eat, or talk, all
// at once), and research facilities eat at the top of the round. A meal is a
// quarter of the eater's daily upkeep, taken from the foods in stock in turn
// (one kind after another, never one kept back with Don't eat), so every
// kind is eaten evenly (patch 1). Nutrition is counted in quarters here and a
// started item's rest waits for the next meal of its kind, so no food value
// is ever lost or gained in splitting it (patch 1). Rations (F9) feed workers
// (with working animals) or troops (warriors, mages and hired mercenaries)
// only. A unit that misses a meal starves: slowed, no healing, and after
// three days of it, health lost every 15 s; fed units heal by themselves.
// Eating at a building heals a unit fully over 10 s for 4 food, 1 for each
// quarter of its health it lacks (Jade's Patch 5, GP-13); a unit at full
// health does not eat (GP-27).

import { ceilDiv, floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { HORSE_UPKEEP, Mount, mountSpec } from '../mounts/data.ts';
import { CYCLE_STEPS, NUTRITION_PER_CYCLE } from '../rules.ts';
import { hash32 } from '../rng.ts';
import { UnitKind, type BubbleHold, type PlayerState, type SimState } from '../state.ts';
import { BuildingKind } from '../buildings/data.ts';
import { FOODS, RESOURCES, Res } from './resources.ts';
import { Role } from '../threats/types.ts';
import { speakerName } from '../peoples/speech.ts';
import { isWoodsman, ledgerAdd } from '../units/woodsman.ts';
import { DREADNOUGHT, isDreadnought } from '../units/dreadnought.ts';

/** Rations (F9): who is fed. */
export const Rations = { Everyone: 0, TroopsOnly: 1, WorkersOnly: 2 } as const;
export const RATIONS_TEXT = ['Feed everyone', 'Troops only', 'Workers only'] as const;

/** The town eats four times a day (s), so a shortage shows within a quarter of a day. */
export const MEAL_STEPS = floorDiv(CYCLE_STEPS, 4);
/** Nutrition inside the meal accounts is counted in quarters, so a meal (a quarter of a day's upkeep) is always whole. */
export const QUARTERS = 4;
/** Natural healing and starving harm come every 15 s (doc). */
export const HEALTH_TICK_STEPS = 15 * STEPS_PER_SECOND;
/** Natural healing per tick: 1% of maximum health (doc), rounded, at least 1 (patch 1). */
export const HEAL_PER_MILLE = 10;
/** Starving harm per tick: 2% of maximum health, rounded, at least 1 (patch 1, Jade; the doc had 1%). */
export const STARVE_HARM_PER_MILLE = 20;
/** Starving units move 20% slower (s). */
export const STARVING_SLOW_BP = 2000;
/** Three full day-night cycles of starving before health is lost (doc). */
export const STARVE_HARM_AFTER_STEPS = 3 * CYCLE_STEPS;
/** Upkeep per cycle: a unit and a research facility 2 (header rule), a working horse 2, a working ox 3 (Table 6). */
export const FACILITY_UPKEEP = 2;
/**
 * Eating at a building (Jade's Patch 5, GP-13: "now costs 4 food for full
 * heal, or one food for every 25% needed"): 1 food for each quarter of its
 * health a unit lacks, rounded up, healing all of it over 10 s. (It was 2
 * food for half its health.)
 */
export const EAT_FULL_FOOD = 4;
export const EAT_STEPS = 10 * STEPS_PER_SECOND;
/** Medicine taken while eating, for what the food in stock leaves unhealed (s): a bandage heals another 20% slowly (over 30 s), a remedy another 50% over the same 10 s. */
export const BANDAGE_HEAL_PER_MILLE = 200;
export const BANDAGE_STEPS = 30 * STEPS_PER_SECOND;
export const REMEDY_HEAL_PER_MILLE = 500;

/** The food a unit needs to eat to heal fully at a building: 1 for each quarter of its health it lacks, rounded up; 0 at full health (GP-27: it does not eat). */
export function eatNeed(hp: number, maxHp: number): number {
  if (maxHp <= 0 || hp >= maxHp) return 0;
  return Math.min(EAT_FULL_FOOD, ceilDiv((maxHp - Math.max(0, hp)) * EAT_FULL_FOOD, maxHp));
}

/** Food upkeep per cycle of a working animal: set by animals/species.ts, which knows the species. */
export const animalUpkeep: { of: (state: SimState, i: number) => number } = { of: () => 0 };

// ----- the food in stock -----

/** One item of a food, in quarters of nutrition. */
export function itemQuarters(res: number): number {
  return (RESOURCES[res]?.nutrition ?? 0) * QUARTERS;
}

/** A player's food in quarters of nutrition: every whole item and the rest of each started one; with `eatable`, leaving out foods kept back. */
export function foodQuarters(p: PlayerState, eatable = false): number {
  let n = 0;
  for (const f of FOODS) if (!eatable || !p.kept[f]) n += p.pool[f]! * itemQuarters(f) + p.open[f]!;
  return n;
}

/** What the Food counter shows: the food value of everything in stock, in whole food (rounded down, so it never shows food that is not there). */
export function foodValue(p: PlayerState): number {
  return floorDiv(foodQuarters(p), QUARTERS);
}

/** Food (nutrition) that can be spent now on meals, training and the like: everything not kept back, in whole food. */
export function eatableFood(p: PlayerState): number {
  return floorDiv(foodQuarters(p, true), QUARTERS);
}

/** What a meal or a payment took: quarters of nutrition by food. */
export type FoodTaken = Array<[Res, number]>;

/**
 * Takes exactly `quarters` of nutrition from a player's foods, or nothing if
 * there is not that much. The kinds are visited in turn from the player's
 * meal turn (FOODS order), a piece at a time: what is left of a started item,
 * else a new item, opened. A kind kept back with Don't eat is skipped unless
 * `kept` says otherwise; `only` limits it to some foods (an animal's crops).
 * Whatever is left of the last item opened stays for the next meal of that
 * kind. The turn moves on past the first kind eaten from.
 */
export function takeFood(p: PlayerState, quarters: number, opts: { only?: readonly Res[]; kept?: boolean } = {}): FoodTaken | null {
  if (quarters <= 0) return [];
  const list = opts.only ?? FOODS;
  const usable = (f: Res): boolean => (opts.kept === true || !p.kept[f]) && (p.pool[f]! > 0 || p.open[f]! > 0);
  let have = 0;
  for (const f of list) if (usable(f)) have += p.pool[f]! * itemQuarters(f) + p.open[f]!;
  if (have < quarters || list.length === 0) return null;
  const taken = new Map<Res, number>();
  const start = opts.only ? 0 : p.mealTurn % list.length;
  let first = -1;
  let left = quarters;
  for (let k = start; left > 0; k = (k + 1) % list.length) {
    const f = list[k]!;
    if (!usable(f)) continue;
    if (p.open[f]! === 0) {
      p.pool[f] = p.pool[f]! - 1;
      p.open[f] = itemQuarters(f);
    }
    const t = Math.min(left, p.open[f]!);
    p.open[f] = p.open[f]! - t;
    left -= t;
    taken.set(f, (taken.get(f) ?? 0) + t);
    if (first < 0) first = k;
  }
  if (!opts.only) p.mealTurn = (first + 1) % list.length;
  return [...taken];
}

/** Gives back what takeFood took (a cancelled order): into each food's started item, whole items going back to the pool. */
export function giveFood(p: PlayerState, taken: ReadonlyArray<readonly [number, number]>): void {
  for (const [f, q] of taken) {
    const item = itemQuarters(f);
    if (item <= 0) continue;
    const all = p.open[f]! + q;
    p.pool[f] = p.pool[f]! + floorDiv(all, item);
    p.open[f] = all - floorDiv(all, item) * item;
  }
}

/** Takes whole food (nutrition) for a cost that says "food": training, eating at a building. */
export function payFood(p: PlayerState, food: number): FoodTaken | null {
  return takeFood(p, food * QUARTERS);
}

// ----- who eats -----

/** Whether a unit is in the troops' group for rations (warriors, mages, hired mercenaries) rather than the workers' (workers, woodsmen, working animals). */
function isTroop(state: SimState, i: number): boolean {
  const k = state.entities.kind[i];
  // The woodsman eats like a worker (decisions 3.4), with the workers.
  return (k === UnitKind.Warrior && !isWoodsman(state.entities, i)) || k === UnitKind.Mage;
}

/**
 * A unit's meal, in quarters of nutrition: a quarter of its daily upkeep.
 * Only units that eat have one: a player's workers, warriors and mages (a
 * hired mercenary while it is in the player's service), a cavalry rider's
 * horse with it, and working horses and oxen; never engines, the animals
 * in a Barn (they eat their farm fare at the day's turn, animals.ts) or
 * anything of the monsters', the wild's or the peoples'.
 */
export function mealQuarters(state: SimState, i: number): number {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner >= state.players.length || e.hp[i]! <= 0 || state.players[owner]!.out) return 0;
  const k = e.kind[i];
  let perCycle = 0;
  if (k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage) {
    // The peoples' units are never a player's; a hired mercenary is, for good (Patch 5), and eats like any troop.
    if (e.role[i] === Role.People) return 0;
    // A skeleton archer the Deathless Shroud raised eats nothing (Patch 7, s).
    if (e.role[i] === Role.Risen) return 0;
    // The Dreadnought eats 3 food a meal (Patch 5, Jade), in quarters.
    perCycle = isDreadnought(e, i) ? DREADNOUGHT.mealFood * QUARTERS : NUTRITION_PER_CYCLE;
    // A ridden horse eats as a working one (Table 6).
    if (e.mount[i] === Mount.Horse) perCycle += HORSE_UPKEEP;
  } else if (k === UnitKind.Animal) perCycle = animalUpkeep.of(state, i);
  // Four meals a cycle: a meal is a quarter of the daily upkeep, which in quarters of nutrition is the upkeep's number.
  return perCycle;
}

/** Where in the meal round a unit eats: its own moment, by its id (s). */
export function mealPhase(id: number): number {
  return (hash32(0x6d65616c, id) >>> 0) % MEAL_STEPS;
}

/** Steps until a unit's next meal (1 to MEAL_STEPS). */
export function nextMealIn(step: number, id: number): number {
  const d = (mealPhase(id) - (step % MEAL_STEPS) + MEAL_STEPS) % MEAL_STEPS;
  return d === 0 ? MEAL_STEPS : d;
}

/** When a unit began starving, or 0 while it is fed or does not eat. */
export function starvingSince(state: SimState, i: number): number {
  const h = state.entities.hungry[i]!;
  return h > 0 && mealQuarters(state, i) > 0 ? h : 0;
}

/** Health back (or lost) per 15 s tick: a share of maximum health in per mille, rounded, at least 1 (patch 1). */
export function healthPerTick(maxHp: number, perMille: number): number {
  return Math.max(1, floorDiv(maxHp * perMille + 500, 1000));
}

// ----- what they say -----

/** "½ food", "1 food", "1¾ food" for quarters of nutrition. */
export function foodAmountText(quarters: number): string {
  const whole = floorDiv(quarters, QUARTERS);
  const part = ['', '¼', '½', '¾'][quarters - whole * QUARTERS]!;
  return `${whole > 0 || !part ? whole : ''}${part} food`;
}

/** "a", "a and b", "a, b and c". */
function listText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * How a meal names a food (Patch 2: no amounts, and meat is never called raw,
 * Jade): farm fare is "a meal from the farm" (Jade), the rest "some" of it.
 */
export function mealFoodText(res: number): string {
  if (res === Res.FarmFare) return 'a meal from the farm';
  return `some ${RESOURCES[res]!.name.toLowerCase()}`;
}

/** "some venison", "some venison and some trout", "some venison, some trout and a meal from the farm". */
function mealText(taken: FoodTaken): string {
  return listText(taken.map(([f]) => mealFoodText(f)));
}

/** "1 minute", "4 minutes", "45 seconds" for a span of steps (rounded down; a minute or more is told in minutes). */
export function spanText(steps: number): string {
  const s = floorDiv(Math.max(0, steps), STEPS_PER_SECOND);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = floorDiv(s, 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

/** A meal's line (Patch 2, Jade: "I ate some trout", not "I ate 1/2 trouts"); the amount stays in the selection panel's hunger line. */
const MEAL_LINES: ReadonlyArray<(what: string) => string> = [
  (w) => `I ate ${w}.`,
  (w) => `I ate ${w}. Back to it.`,
  (w) => `Had ${w}. That hits the spot.`,
];

const NO_FOOD_LINES: readonly string[] = [
  'There wasn\'t enough food for me! I\'m starving.',
  'Not a crumb left for me. How am I meant to work on an empty belly?',
  'The stores are bare and my stomach is growling. There wasn\'t enough food for me!',
];

/**
 * A unit's line about a meal or its hunger: a bubble only (informational
 * lines stay out of the message panel, patch 1), except its first missed
 * meal, an alert (urgent) that reaches the panel too.
 */
function chatter(state: SimState, i: number, text: string, bubble: 'meal' | 'hungry', urgent = false, hold?: BubbleHold): void {
  const e = state.entities;
  // Animals do not talk; working horses and oxen eat and starve quietly.
  if (e.kind[i] === UnitKind.Animal) return;
  state.events.push({ player: e.owner[i]!, kind: 'speech', text, speaker: e.id[i]!, name: speakerName(state, i), x: e.x[i]!, z: e.z[i]!, bubble, ...(urgent ? { urgent: true } : {}), ...(hold ? { hold } : {}) });
}

function ateLine(state: SimState, i: number, taken: FoodTaken, starved: boolean): string {
  const e = state.entities;
  const what = mealText(taken);
  const line = starved ? `Food at last! I ate ${what}.` : MEAL_LINES[(hash32(e.id[i]!, floorDiv(state.step, MEAL_STEPS)) >>> 0) % MEAL_LINES.length]!(what);
  return e.mount[i] === Mount.Horse ? `${line} My horse ate too.` : line;
}

/** What a starving unit says at a meal it misses: the first time, that there was no food; after that, how it is. */
function hungryLine(state: SimState, i: number, rations: boolean, first: boolean): string {
  const e = state.entities;
  if (first) {
    if (rations) return `No food for me: the rations feed only the ${isTroop(state, i) ? 'workers' : 'troops'}. I'm starving.`;
    return NO_FOOD_LINES[(hash32(e.id[i]!, floorDiv(state.step, MEAL_STEPS)) >>> 0) % NO_FOOD_LINES.length]!;
  }
  const since = state.step - e.hungry[i]!;
  const slow = floorDiv(STARVING_SLOW_BP, 100);
  if (since < STARVE_HARM_AFTER_STEPS) {
    return `Still no food. Starving for ${spanText(since)}: I'm ${slow}% slower and can't heal. I start losing health in ${spanText(STARVE_HARM_AFTER_STEPS - since)}.`;
  }
  const harm = healthPerTick(e.maxHp[i]!, STARVE_HARM_PER_MILLE);
  return `Starving for ${spanText(since)}! I'm losing ${harm} health every ${floorDiv(HEALTH_TICK_STEPS, STEPS_PER_SECOND)} seconds. Feed me!`;
}

// ----- meals -----

/** Whether the rations feed a unit's group. */
function rationsFeed(p: PlayerState, troop: boolean): boolean {
  return troop ? p.rations !== Rations.WorkersOnly : p.rations !== Rations.TroopsOnly;
}

/** One unit's meal: it eats its share, says what it ate, or goes hungry and says so. Returns whether it changed anyone's starving. */
function unitMeal(state: SimState, i: number): boolean {
  const e = state.entities;
  const quarters = mealQuarters(state, i);
  const was = e.hungry[i]!;
  if (quarters === 0) {
    e.hungry[i] = 0;
    return was !== 0;
  }
  const p = state.players[e.owner[i]!]!;
  const troop = isTroop(state, i);
  const fed = rationsFeed(p, troop);
  const taken = fed ? takeFood(p, quarters) : null;
  if (taken) {
    chatter(state, i, ateLine(state, i, taken, was !== 0), 'meal');
    // A woodsman's food line counts what he eats (Jade's WD-7).
    ledgerAdd(state, i, 0, quarters);
    e.hungry[i] = 0;
    return was !== 0;
  }
  if (!was) e.hungry[i] = Math.max(1, state.step);
  chatter(state, i, hungryLine(state, i, !fed, was === 0), 'hungry', was === 0);
  return was === 0;
}

/** The research facilities' meal, at the top of each round: research stops while they go without. */
function facilityMeal(state: SimState, player: number): void {
  const p = state.players[player]!;
  let n = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.complete && b.kind === BuildingKind.ScholarsLodge) n++;
  const quarters = n * FACILITY_UPKEEP;
  const fed = quarters === 0 || (rationsFeed(p, true) && takeFood(p, quarters) !== null);
  const was = p.starveLodge;
  p.starveLodge = fed ? 0 : was || Math.max(1, state.step);
  if (!was && p.starveLodge) state.events.push({ player, kind: 'alert', text: 'Research has stopped: the Scholar\'s Lodge has had no food.' });
  else if (was && !p.starveLodge) state.events.push({ player, kind: 'info', text: 'The Scholar\'s Lodge is fed again, and research goes on.' });
}

/** Each group's starving, from its units: the alerts when a group starts or stops starving. */
function groupStarving(state: SimState, player: number): void {
  const e = state.entities;
  let workers = 0;
  let troops = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player) continue;
    const since = starvingSince(state, i);
    if (!since) continue;
    if (isTroop(state, i)) troops = troops ? Math.min(troops, since) : since;
    else workers = workers ? Math.min(workers, since) : since;
  }
  const p = state.players[player]!;
  const was = [p.starveWorkers, p.starveTroops];
  p.starveWorkers = workers;
  p.starveTroops = troops;
  if (!was[0] && workers) state.events.push({ player, kind: 'alert', text: 'Your workers are starving and slowed. Find more food or change the rations.' });
  else if (was[0] && !workers) state.events.push({ player, kind: 'info', text: 'Your workers are fed again.' });
  if (!was[1] && troops) state.events.push({ player, kind: 'alert', text: 'Your troops are starving and slowed. Find more food or change the rations.' });
  else if (was[1] && !troops) state.events.push({ player, kind: 'info', text: 'Your troops are fed again.' });
}

/** Every step: the units whose moment it is eat (or go hungry), and at the top of the round the research facilities. */
function meals(state: SimState): void {
  if (state.step === 0) return;
  const e = state.entities;
  const at = state.step % MEAL_STEPS;
  let changed = 0;
  for (let i = 0; i < e.count; i++) {
    // A unit no player owns has no meal; one that starved in a player's service (a mercenary let go) is no longer hungry.
    if (e.owner[i]! >= state.players.length && e.hungry[i] === 0) continue;
    if (mealPhase(e.id[i]!) !== at) continue;
    if (unitMeal(state, i) && e.owner[i]! < state.players.length) changed |= 1 << e.owner[i]!;
  }
  for (let player = 0; player < state.players.length; player++) {
    if (state.players[player]!.out) continue;
    if (at === 0) facilityMeal(state, player);
    // A death or a unit that stopped eating also ends a group's starving: checked at each health tick.
    if ((changed & (1 << player)) !== 0 || state.step % HEALTH_TICK_STEPS === 0) groupStarving(state, player);
  }
}

/** Health over time: eating and medicine, natural healing, starving harm and poison. */
function health(state: SimState): void {
  const e = state.entities;
  const tick = state.step % HEALTH_TICK_STEPS === 0;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    if (e.dotUntil[i]! > state.step && e.dotLeft[i]! > 0) {
      const d = Math.max(1, ceilDiv(e.dotLeft[i]!, e.dotUntil[i]! - state.step));
      e.dotLeft[i] = e.dotLeft[i]! - d;
      e.hp[i] = e.hp[i]! - d;
      if (e.hp[i]! <= 0) {
        e.hp[i] = 0;
        state.dying.push(e.id[i]!);
        continue;
      }
    }
    if (e.mendUntil[i]! > state.step && e.mendLeft[i]! > 0) {
      const h = Math.max(1, ceilDiv(e.mendLeft[i]!, e.mendUntil[i]! - state.step));
      e.mendLeft[i] = e.mendLeft[i]! - h;
      e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + h);
    }
    // Engines are repaired by workers, never mended by time (Table 2f).
    if (!tick || e.owner[i]! >= state.players.length || e.kind[i] === UnitKind.Engine) continue;
    const since = starvingSince(state, i);
    if (!since) {
      // In a plague bearer's miasma nothing heals by itself (roster 5.8).
      if (e.hp[i]! < e.maxHp[i]! && e.sickUntil[i]! <= state.step) e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + healthPerTick(e.maxHp[i]!, HEAL_PER_MILLE));
      // A ridden horse heals as the rider does (s).
      if (e.mount[i] === Mount.Horse) {
        const max = mountSpec(Mount.Horse).hp;
        e.mountHp[i] = Math.min(max, e.mountHp[i]! + healthPerTick(max, HEAL_PER_MILLE));
      }
    } else if (state.step - since >= STARVE_HARM_AFTER_STEPS) {
      e.hp[i] = e.hp[i]! - healthPerTick(e.maxHp[i]!, STARVE_HARM_PER_MILLE);
      if (e.hp[i]! <= 0) {
        e.hp[i] = 0;
        state.dying.push(e.id[i]!);
      }
    }
  }
}

export function updateFood(state: SimState): void {
  meals(state);
  health(state);
}

/** Healing over time from now (eating, medicine): adds to what is already coming. */
export function mend(state: SimState, i: number, amount: number, steps: number): void {
  const e = state.entities;
  const left = e.mendUntil[i]! > state.step ? e.mendLeft[i]! : 0;
  e.mendLeft[i] = left + amount;
  e.mendUntil[i] = Math.max(e.mendUntil[i]!, state.step + steps);
}

/**
 * A unit eats at a building (Food: Eating; Jade's Patch 5, GP-13): the food
 * its wound needs, 1 for each quarter of its health it lacks, healing all of
 * it over 10 s, and says how much it needed. Short of that, it eats what
 * there is and heals a quarter of its health for each, and the best
 * medicine in stock heals more of the rest, as it did before. Returns '' or
 * why not: nothing to eat, or not hurt (GP-27).
 */
export function eatAt(state: SimState, i: number): string {
  const e = state.entities;
  const p = state.players[e.owner[i]!]!;
  const max = e.maxHp[i]!;
  const need = eatNeed(e.hp[i]!, max);
  if (need === 0) return 'I am not hurt.';
  const n = Math.min(need, eatableFood(p));
  const taken = n > 0 ? payFood(p, n) : null;
  if (!taken) return 'Not enough food to eat.';
  const missing = max - e.hp[i]!;
  const heal = n >= need ? missing : Math.min(missing, floorDiv(max * n, EAT_FULL_FOOD));
  // Seated at a main base or storehouse, named plainly (Patch 2, s), in the present tense while it sits eating, its bubble up for as long as
  // the bar over its head runs (Jade's Patch 3); with what it needed (Patch 5).
  const foods = listText(taken.map(([f]) => RESOURCES[f]!.name.toLowerCase()));
  const text = n >= need ? `I need ${need} food to heal. I'm eating ${foods}.` : `I need ${need} food to heal, but there is only ${n}. I'm eating ${foods}.`;
  chatter(state, i, text, 'meal', false, 'bar');
  mend(state, i, heal, EAT_STEPS);
  // Medicine for what the food left unhealed: a remedy if one is in stock, else a bandage (s).
  if (missing - heal > 0 && p.pool[Res.Remedy]! > 0) {
    p.pool[Res.Remedy] = p.pool[Res.Remedy]! - 1;
    mend(state, i, floorDiv(max * REMEDY_HEAL_PER_MILLE, 1000), EAT_STEPS);
  } else if (missing - heal > 0 && p.pool[Res.Bandage]! > 0) {
    p.pool[Res.Bandage] = p.pool[Res.Bandage]! - 1;
    mend(state, i, floorDiv(max * BANDAGE_HEAL_PER_MILLE, 1000), BANDAGE_STEPS);
  }
  return '';
}

/** Buildings that hold food, where a unit can eat (s): main bases and storehouses (Patch 2 cut the cooking buildings). */
export function servesFood(kind: number): boolean {
  return kind === BuildingKind.MainBase || kind === BuildingKind.Storehouse;
}
