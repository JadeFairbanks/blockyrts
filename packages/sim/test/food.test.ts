// Patch 1's food: meals eaten evenly from every kind, exact to the quarter,
// only by the units that eat, with 2% starving harm and 1% healing, a line
// at each meal, and saves from before it still loading.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addEngine,
  addWarrior,
  createWorld,
  deserializeState,
  eatAt,
  Engine,
  FOODS,
  foodAmountText,
  foodQuarters,
  foodValue,
  hashState,
  HEAL_PER_MILLE,
  HEALTH_TICK_STEPS,
  healthPerTick,
  itemQuarters,
  MEAL_STEPS,
  mealFoodText,
  mealPhase,
  mealQuarters,
  MEATS,
  Mount,
  nextMealIn,
  nodeResource,
  OLD_SAVE_TEXT,
  payAny,
  PEOPLES,
  PropKind,
  QUARTERS,
  Res,
  RESOURCES,
  Role,
  serializeState,
  SNAPSHOT_VERSION,
  spanText,
  Species,
  STARVE_HARM_AFTER_STEPS,
  STARVE_HARM_PER_MILLE,
  starvingSince,
  step,
  updateFood,
  WU_PER_METRE,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

function run(s: SimState, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let k = 0; k < n; k++) {
    step(s);
    events.push(...s.events);
  }
  return events;
}

/** Player 0's units: the 4 workers and 3 warriors a game starts with. */
function eaters(s: SimState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.entities.count; i++) if (mealQuarters(s, i) > 0 && s.entities.owner[i] === 0) out.push(i);
  return out;
}

/** A world whose only food is 10 of each of these. */
function stocked(foods: readonly Res[]): SimState {
  const s = createWorld(1, { peaceful: true });
  const p = s.players[0]!;
  for (const f of FOODS) p.pool[f] = 0;
  for (const f of foods) p.pool[f] = 10;
  return s;
}

describe('meals', () => {
  it('eats every kind of food in turn, not all the meat first', () => {
    const foods = [Res.Venison, Res.Trout, Res.Eggs, Res.FarmFare, Res.Beef];
    const s = stocked(foods);
    const p = s.players[0]!;
    const before = foodQuarters(p);
    expect(eaters(s).length).toBe(7);
    // One round: each of the 7 eats once, half a food each.
    run(s, MEAL_STEPS);
    expect(before - foodQuarters(p)).toBe(7 * 2);
    // Seven meals went round the five kinds: every kind has been started.
    for (const f of foods) expect(p.pool[f]).toBe(9);
    // A day later every kind is still being eaten alike: no kind has had two more meals than another.
    run(s, 4 * MEAL_STEPS);
    const eaten = foods.map((f) => 10 * RESOURCES[f]!.nutrition * QUARTERS - p.pool[f]! * RESOURCES[f]!.nutrition * QUARTERS - p.open[f]!);
    expect(Math.max(...eaten) - Math.min(...eaten)).toBeLessThanOrEqual(2);
  });

  it('loses no food and gains none in splitting items between meals', () => {
    const s = stocked([Res.Venison, Res.Trout, Res.Eggs, Res.FarmFare, Res.Salmon]);
    const p = s.players[0]!;
    const before = foodQuarters(p);
    // Two days: 7 eaters x 2 food a day x 2, to the quarter.
    run(s, 8 * MEAL_STEPS);
    expect(before - foodQuarters(p)).toBe(7 * 2 * 2 * QUARTERS);
    // The counter is whole food, rounded down, and the pool holds whole items only.
    expect(foodValue(p)).toBe(Math.floor(foodQuarters(p) / QUARTERS));
    for (const f of FOODS) expect(p.open[f]!).toBeLessThan(itemQuarters(f));
  });

  it('a cavalry rider eats for its horse; engines, Barn animals and let-go mercenaries eat nothing at meals', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [x, z] = [e.x[0]!, e.z[0]!];
    const rider = addWarrior(s, 0, x + WU_PER_METRE, z);
    e.mount[rider] = Mount.Horse;
    const foot = addWarrior(s, 0, x + 2 * WU_PER_METRE, z);
    const cow = addAnimal(s, Species.Cattle, 0, x + 3 * WU_PER_METRE, z, 0, 0);
    const catapult = addEngine(s, 0, Engine.Catapult, x + 4 * WU_PER_METRE, z);
    const merc = addWarrior(s, 0, x + 5 * WU_PER_METRE, z);
    e.role[merc] = Role.Mercenary;
    // Half a food a meal on foot; a rider and horse 1 food (2 + 2 a day).
    expect([mealQuarters(s, foot), mealQuarters(s, rider), mealQuarters(s, cow), mealQuarters(s, catapult)]).toEqual([2, 4, 0, 0]);
    // A mercenary eats while hired, and not once it is let go at dusk.
    expect(mealQuarters(s, merc)).toBe(2);
    e.owner[merc] = PEOPLES;
    expect(mealQuarters(s, merc)).toBe(0);
    e.owner[merc] = 0;
    e.hp[merc] = 0;
    expect(mealQuarters(s, merc)).toBe(0);
  });

  it('only the units that eat starve: animals and engines never slow down or lose health', () => {
    const s = stocked([]);
    const e = s.entities;
    const [x, z] = [e.x[0]!, e.z[0]!];
    const warrior = addWarrior(s, 0, x + WU_PER_METRE, z);
    const cow = addAnimal(s, Species.Cattle, 0, x + 3 * WU_PER_METRE, z, 0, 0);
    const catapult = addEngine(s, 0, Engine.Catapult, x + 4 * WU_PER_METRE, z);
    run(s, MEAL_STEPS + 1);
    for (const i of eaters(s)) expect(starvingSince(s, i)).toBeGreaterThan(0);
    expect(s.players[0]!.starveWorkers).toBeGreaterThan(0);
    expect(s.players[0]!.starveTroops).toBeGreaterThan(0);
    expect([starvingSince(s, cow), starvingSince(s, catapult)]).toEqual([0, 0]);
    // Three days on, at a health tick: the warrior loses 2% of its health; the cow heals and the catapult is untouched.
    s.step = STARVE_HARM_AFTER_STEPS + 10 * HEALTH_TICK_STEPS;
    e.hungry[warrior] = 1;
    e.hungry[cow] = 1;
    e.hungry[catapult] = 1;
    e.hp[cow] = e.maxHp[cow]! - 50;
    const hp = [e.hp[warrior]!, e.hp[cow]!, e.hp[catapult]!];
    updateFood(s);
    expect(e.hp[warrior]).toBe(hp[0]! - healthPerTick(e.maxHp[warrior]!, STARVE_HARM_PER_MILLE));
    expect(e.hp[cow]).toBe(hp[1]! + healthPerTick(e.maxHp[cow]!, HEAL_PER_MILLE));
    expect(e.hp[catapult]).toBe(hp[2]);
  });

  it('starving harm is 2% of maximum health a tick and healing 1%, rounded, at least 1', () => {
    expect([100, 30, 75, 1000, 24, 26].map((max) => healthPerTick(max, STARVE_HARM_PER_MILLE))).toEqual([2, 1, 2, 20, 1, 1]);
    expect([100, 49, 150, 1000, 20].map((max) => healthPerTick(max, HEAL_PER_MILLE))).toEqual([1, 1, 2, 10, 1]);
  });

  it('a unit says what it ate at its meal, and complains when there was none', () => {
    const s = stocked([Res.Venison]);
    const e = s.entities;
    const w = eaters(s)[0]!;
    const id = e.id[w]!;
    const said = (events: SimEvent[]): SimEvent[] => events.filter((v) => v.speaker === id && v.bubble !== undefined);
    const meal = said(run(s, nextMealIn(s.step, id) + 1));
    expect(meal.length).toBe(1);
    expect(meal[0]!.bubble).toBe('meal');
    // Patch 2 (Jade): a plain line with no amount, "I ate some venison." or one like it.
    expect(meal[0]!.text).toMatch(/^(I ate some venison\.( Back to it\.)?|Had some venison\. That hits the spot\.)$/);
    // No food left: it says so, and at each meal it misses after that, how it is.
    s.players[0]!.pool[Res.Venison] = 0;
    s.players[0]!.open[Res.Venison] = 0;
    const missed = said(run(s, MEAL_STEPS));
    expect(missed.length).toBe(1);
    expect(missed[0]!.bubble).toBe('hungry');
    // The first missed meal is an alert for the message panel too; the meal and the status after it are bubbles only.
    expect([meal[0]!.urgent, missed[0]!.urgent]).toEqual([undefined, true]);
    const later = said(run(s, MEAL_STEPS));
    expect(later.length).toBe(1);
    expect(later[0]!.urgent).toBeUndefined();
    expect(later[0]!.text).toMatch(/Starving for 1 minute: I'm 20% slower and can't heal\. I start losing health in \d+ minutes\./);
  });

  it('staggers the meals by unit and counts down to the next one', () => {
    const s = createWorld(1, { peaceful: true });
    const phases = new Set(eaters(s).map((i) => mealPhase(s.entities.id[i]!)));
    expect(phases.size).toBe(7);
    const id = s.entities.id[eaters(s)[0]!]!;
    const left = nextMealIn(s.step, id);
    expect(left).toBeGreaterThanOrEqual(1);
    expect(left).toBeLessThanOrEqual(MEAL_STEPS);
    run(s, left);
    expect(nextMealIn(s.step, id)).toBe(MEAL_STEPS);
  });

  it('names the food plainly with no amount (Patch 2): farm fare is a meal from the farm, and a rider\'s horse eats too', () => {
    expect([Res.FarmFare, Res.Trout, Res.Eggs, Res.Beef, Res.FrogLegs].map(mealFoodText)).toEqual([
      'a meal from the farm',
      'some trout',
      'some eggs',
      'some beef',
      'some frog legs',
    ]);
    // Only farm fare in stock: the line is Jade's, or one of its two companions.
    const s = stocked([Res.FarmFare]);
    const e = s.entities;
    const lines = new Set<string>();
    const ids = eaters(s).map((i) => e.id[i]!);
    for (const ev of run(s, 8 * MEAL_STEPS)) if (ev.bubble === 'meal' && ids.includes(ev.speaker!)) lines.add(ev.text);
    expect([...lines].sort()).toEqual(['Had a meal from the farm. That hits the spot.', 'I ate a meal from the farm.', 'I ate a meal from the farm. Back to it.']);
    // Two kinds in one meal name both; nothing says raw or an amount.
    // The first to eat finds a quarter of a venison started, so its meal takes that and some trout.
    const two = stocked([Res.Venison, Res.Trout]);
    const soon = (i: number): number => nextMealIn(two.step, two.entities.id[i]!);
    const w = eaters(two).sort((a, b) => soon(a) - soon(b))[0]!;
    two.players[0]!.open[Res.Venison] = 1;
    two.players[0]!.pool[Res.Venison] = 0;
    two.players[0]!.mealTurn = FOODS.indexOf(Res.Venison);
    const said = run(two, soon(w) + 1).filter((v) => v.speaker === two.entities.id[w]! && v.bubble === 'meal');
    expect(said.length).toBe(1);
    expect(said[0]!.text).toMatch(/some venison and some trout/);
    expect(said[0]!.text).not.toMatch(/raw|food|½|¼/i);
    // A rider says its horse ate too; after going hungry the meal is "Food at last!".
    const r = stocked([Res.Salmon]);
    const rider = addWarrior(r, 0, r.entities.x[0]!, r.entities.z[0]! + WU_PER_METRE);
    r.entities.mount[rider] = Mount.Horse;
    r.entities.hungry[rider] = 1;
    const id = r.entities.id[rider]!;
    const meal = run(r, nextMealIn(r.step, id) + 1).filter((v) => v.speaker === id && v.bubble === 'meal');
    expect(meal.map((v) => v.text)).toEqual(['Food at last! I ate some salmon. My horse ate too.']);
  });

  it('a unit eating at a main base says it ate its fill', () => {
    const s = stocked([Res.FarmFare]);
    const w = eaters(s)[0]!;
    expect(eatAt(s, w)).toBe('');
    expect(s.events.filter((v) => v.speaker === s.entities.id[w]! && v.bubble === 'meal').map((v) => v.text)).toEqual(['I ate my fill of farm fare.']);
  });

  it('says amounts and spans in words, with the right plurals', () => {
    expect([2, 4, 3, 7, 8].map(foodAmountText)).toEqual(['½ food', '1 food', '¾ food', '1¾ food', '2 food']);
    expect([20, 59 * 20, 60 * 20, 61 * 20, 120 * 20].map(spanText)).toEqual(['1 second', '59 seconds', '1 minute', '1 minute', '2 minutes']);
  });
});

describe('food kinds', () => {
  it('a carcass gives its animal\'s meat and a fish stretch its fish', () => {
    expect([nodeResource(PropKind.Carcass, Species.Boar), nodeResource(PropKind.Carcass, Species.Cattle), nodeResource(PropKind.Carcass, Species.WildGoose)]).toEqual([
      Res.BoarMeat,
      Res.Beef,
      Res.GooseMeat,
    ]);
    expect([PropKind.FishTrout, PropKind.FishSalmon, PropKind.FishCatfish].map((k) => nodeResource(k))).toEqual([Res.Trout, Res.Salmon, Res.Catfish]);
  });

  it('pays "meat" in a recipe from the kinds most in stock', () => {
    const pool = new Int32Array(RESOURCES.length);
    pool[Res.Beef] = 3;
    pool[Res.Chicken] = 1;
    expect(payAny(pool, [[Res.AnyMeat, 2]])).toEqual([[Res.Beef, 2]]);
    pool[Res.Chicken] = 2;
    expect(payAny(pool, [[Res.AnyMeat, 3]])).toEqual([[Res.Beef, 1], [Res.Chicken, 2]]);
  });

  it('every meat and fish is a food with a name and a source', () => {
    for (const m of MEATS) {
      expect(RESOURCES[m]!.nutrition).toBe(4);
      expect(RESOURCES[m]!.name).not.toBe('');
    }
    expect(FOODS).not.toContain(Res.AnyMeat);
    expect(FOODS).not.toContain(Res.AnyFish);
  });
});

describe('saves', () => {
  it('keeps the open items and Don\'t eat through a save', () => {
    const s = stocked([Res.Venison, Res.Trout]);
    run(s, MEAL_STEPS);
    s.players[0]!.kept[Res.Trout] = 1;
    const back = deserializeState(serializeState(s));
    expect([...back.players[0]!.open]).toEqual([...s.players[0]!.open]);
    expect(back.players[0]!.kept[Res.Trout]).toBe(1);
    expect(hashState(back)).toBe(hashState(s));
  });

  it('refuses a save from an older version (Jade, Patch 2: every patch), with a plain sentence', () => {
    // Made on main before patch 1 (version 13) and after the hunting patch (version 14): both are older than Patch 2's.
    for (const name of ['save-v13-starving', 'save-v14-loot-starving']) {
      const bytes = new Uint8Array(gunzipSync(readFileSync(new URL(`./fixtures/${name}.bin.gz`, import.meta.url))));
      expect(() => deserializeState(bytes)).toThrow(OLD_SAVE_TEXT);
    }
    // A snapshot written now, its version set back by one, is refused the same way.
    const now = serializeState(stocked([Res.Venison]));
    now[4] = (SNAPSHOT_VERSION - 1) & 0xff;
    now[5] = (SNAPSHOT_VERSION - 1) >> 8;
    expect(() => deserializeState(now)).toThrow(OLD_SAVE_TEXT);
  });
});
