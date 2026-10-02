// Food, supply and health (Food, supply and health; Table 6): the town eats
// from the food stock four times a day, every kind of food evenly and never
// one kept back with Don't eat. Workers (with working animals) and troops
// (warriors and research facilities) are fed as two groups, so Rations (F9)
// can feed one and starve the other. Starving units are slowed and, after
// three days of it, lose health; fed units heal by themselves. Eating at a
// building heals half of a unit's health over 10 s.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { CYCLE_STEPS, NUTRITION_PER_CYCLE } from '../rules.ts';
import { UnitKind, type SimState } from '../state.ts';
import { BuildingKind } from '../buildings/data.ts';
import { RESOURCES, payNutrition, Res } from './resources.ts';
import { Role } from '../threats/types.ts';

/** Rations (F9): who is fed. */
export const Rations = { Everyone: 0, TroopsOnly: 1, WorkersOnly: 2 } as const;
export const RATIONS_TEXT = ['Feed everyone', 'Troops only', 'Workers only'] as const;

/** The town eats four times a day (s), so a shortage shows within a quarter of a day. */
export const MEAL_STEPS = floorDiv(CYCLE_STEPS, 4);
/** Natural healing and starving harm come every 15 s, 1% of maximum health each (doc). */
export const HEALTH_TICK_STEPS = 15 * STEPS_PER_SECOND;
/** Starving units move 20% slower (s). */
export const STARVING_SLOW_BP = 2000;
/** Three full day-night cycles of starving before health is lost (doc). */
export const STARVE_HARM_AFTER_STEPS = 3 * CYCLE_STEPS;
/** Upkeep per cycle: a unit and a research facility 2 (header rule), a working horse 2, a working ox 3 (Table 6). */
export const FACILITY_UPKEEP = 2;
/** Eating at a building: 2 nutrition, half of maximum health over 10 s (Table 6). */
export const EAT_NUTRITION = 2;
export const EAT_HEAL_PER_MILLE = 500;
export const EAT_STEPS = 10 * STEPS_PER_SECOND;
/** Medicine taken while eating (s): a bandage heals another 20% slowly (over 30 s), a remedy another 50% over the same 10 s. */
export const BANDAGE_HEAL_PER_MILLE = 200;
export const BANDAGE_STEPS = 30 * STEPS_PER_SECOND;
export const REMEDY_HEAL_PER_MILLE = 500;

/** Food upkeep per cycle of a working animal: set by animals/species.ts, which knows the species. */
export const animalUpkeep: { of: (state: SimState, i: number) => number } = { of: () => 0 };

/** Per-cycle upkeep of each group: workers and working animals, and troops with research facilities. */
export function upkeep(state: SimState, player: number): { workers: number; troops: number } {
  const e = state.entities;
  let workers = 0;
  let troops = 0;
  for (let i = 0; i < e.count; i++) {
    // Mercenaries are fed by their camp.
    if (e.owner[i] !== player || e.hp[i]! <= 0 || e.role[i] === Role.Mercenary) continue;
    const k = e.kind[i];
    if (k === UnitKind.Worker) workers += NUTRITION_PER_CYCLE;
    else if (k === UnitKind.Warrior || k === UnitKind.Mage) troops += NUTRITION_PER_CYCLE;
    else if (k === UnitKind.Animal) workers += animalUpkeep.of(state, i);
  }
  for (const b of state.buildings.list) if (b.owner === player && b.complete && b.kind === BuildingKind.ScholarsLodge) troops += FACILITY_UPKEEP;
  return { workers, troops };
}

/** Whether the group a unit belongs to is starving now (and since when), or 0. */
export function starvingSince(state: SimState, i: number): number {
  const e = state.entities;
  const p = state.players[e.owner[i]!];
  if (!p) return 0;
  if (e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Mage) return p.starveTroops;
  if (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Animal) return p.starveWorkers;
  return 0;
}

/**
 * One group's meal: a quarter of its daily upkeep, paid from what was eaten
 * beyond need at the last meal, then from whole foods. Returns whether the
 * group was fed.
 */
function feed(state: SimState, player: number, perCycle: number): boolean {
  const p = state.players[player]!;
  // Upkeep per meal is a quarter of the daily upkeep; `fed` holds what is left of whole foods, in quarters.
  const need = perCycle;
  if (p.fed >= need) {
    p.fed -= need;
    return true;
  }
  const whole = floorDiv(need - p.fed + 3, 4);
  const taken = payNutrition(p.pool, whole, p.dontEat);
  if (!taken) return need === 0;
  let got = 0;
  for (const [res, n] of taken) got += RESOURCES[res]!.nutrition * n;
  p.fed += got * 4 - need;
  return true;
}

function setStarving(state: SimState, player: number, troops: boolean, fed: boolean): void {
  const p = state.players[player]!;
  const was = troops ? p.starveTroops : p.starveWorkers;
  const now = fed ? 0 : was || Math.max(1, state.step);
  if (troops) p.starveTroops = now;
  else p.starveWorkers = now;
  if (!was && now) {
    state.events.push({ player, kind: 'alert', text: troops ? 'Your troops are starving: warriors are slowed and research has stopped.' : 'Your workers are starving and slowed. Find more food or change the rations.' });
  } else if (was && !now) {
    state.events.push({ player, kind: 'info', text: troops ? 'Your troops are fed again.' : 'Your workers are fed again.' });
  }
}

/** Every meal time: each player's groups eat, or starve. */
function meals(state: SimState): void {
  for (let player = 0; player < state.players.length; player++) {
    const p = state.players[player]!;
    if (p.out) continue;
    const u = upkeep(state, player);
    const feedWorkers = p.rations !== Rations.TroopsOnly;
    const feedTroops = p.rations !== Rations.WorkersOnly;
    // Workers eat first (s), so the town that grows the food keeps working.
    setStarving(state, player, false, feedWorkers ? feed(state, player, u.workers) : u.workers === 0);
    setStarving(state, player, true, feedTroops ? feed(state, player, u.troops) : u.troops === 0);
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
    if (!tick || e.owner[i]! >= state.players.length) continue;
    const since = starvingSince(state, i);
    const pm = Math.max(1, floorDiv(e.maxHp[i]!, 100));
    if (!since) {
      if (e.hp[i]! < e.maxHp[i]!) e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + pm);
    } else if (state.step - since >= STARVE_HARM_AFTER_STEPS) {
      e.hp[i] = e.hp[i]! - pm;
      if (e.hp[i]! <= 0) {
        e.hp[i] = 0;
        state.dying.push(e.id[i]!);
      }
    }
  }
}

/** a / b rounded up, for positive b. */
function ceilDiv(a: number, b: number): number {
  return floorDiv(a + b - 1, b);
}

export function updateFood(state: SimState): void {
  if (state.step > 0 && state.step % MEAL_STEPS === 0) meals(state);
  health(state);
}

/** Healing over time from now (eating, medicine): adds to what is already coming. */
export function mend(state: SimState, i: number, amount: number, steps: number): void {
  const e = state.entities;
  const left = e.mendUntil[i]! > state.step ? e.mendLeft[i]! : 0;
  e.mendLeft[i] = left + amount;
  e.mendUntil[i] = Math.max(e.mendUntil[i]!, state.step + steps);
}

/** A unit eats at a building (Food: Eating): 2 nutrition for half its health over 10 s, and the best medicine in stock if it is badly hurt. Returns '' or why not. */
export function eatAt(state: SimState, i: number): string {
  const e = state.entities;
  const p = state.players[e.owner[i]!]!;
  if (!payNutrition(p.pool, EAT_NUTRITION, p.dontEat)) return `Not enough food to eat (${EAT_NUTRITION} food).`;
  const max = e.maxHp[i]!;
  const missing = max - e.hp[i]!;
  mend(state, i, floorDiv(max * EAT_HEAL_PER_MILLE, 1000), EAT_STEPS);
  // Medicine for what eating leaves unhealed: a remedy if one is in stock, else a bandage (s).
  const after = missing - floorDiv(max * EAT_HEAL_PER_MILLE, 1000);
  if (after > 0 && p.pool[Res.Remedy]! > 0) {
    p.pool[Res.Remedy] = p.pool[Res.Remedy]! - 1;
    mend(state, i, floorDiv(max * REMEDY_HEAL_PER_MILLE, 1000), EAT_STEPS);
  } else if (after > 0 && p.pool[Res.Bandage]! > 0) {
    p.pool[Res.Bandage] = p.pool[Res.Bandage]! - 1;
    mend(state, i, floorDiv(max * BANDAGE_HEAL_PER_MILLE, 1000), BANDAGE_STEPS);
  }
  return '';
}

/** Buildings that hold food, where a unit can eat (s): main bases, storehouses and cooking buildings. */
export function servesFood(kind: number): boolean {
  return kind === BuildingKind.MainBase || kind === BuildingKind.Storehouse || kind === BuildingKind.Cooking;
}
