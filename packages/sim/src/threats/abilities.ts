// The shared core for abilities that cost mana and wait on a cooldown
// (Goblin villages: the goblin mage; milestone 6's mages in magic/ use the
// same mana scale and cooldown list). Snuff and Stumble hex are cast: the
// mana goes when the cast begins and the effect lands 40% into the goblin
// mage's attack time (combat/mob-ai.ts beginSpell), so a Counterspell can
// stop them on the way. Mana is
// kept in twentieths so it refills a whole twentieth each step (1 a second);
// each unit's cooldowns are pairs of ability and the step it is ready again.
// The goblin mage's three spells (Table 17): Snuff puts a light out from
// 20 m, Stumble hex slows one unit's moves and attacks by 20% for 4 s, and
// Spark toss throws a small fire bolt that sets dry wood smouldering.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, snuffLight } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Shot } from '../combat/items.ts';
import { mobSpec } from '../combat/mobs.ts';
import { buildingTop, fireAt, launch, ProjectileFlag } from '../combat/projectiles.ts';
import { SPARK } from './burns.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;
/** Mana is held in twentieths of a point. */
export const MANA_SCALE = 20;

export const Ability = { Snuff: 0, StumbleHex: 1, SparkToss: 2 } as const;
export type Ability = (typeof Ability)[keyof typeof Ability];

export interface AbilitySpec {
  id: Ability;
  name: string;
  /** Mana it costs (s) and its cooldown, steps. */
  mana: number;
  cooldown: number;
  range: number;
}

/** Table 17: Snuff 20 m, 8 s; Stumble hex 14 m, 6 s; Spark toss 14 m, 3 s. Costs (s): 15, 10 and 5 of the mage's 60. */
export const ABILITIES: readonly AbilitySpec[] = [
  { id: Ability.Snuff, name: 'Snuff', mana: 15, cooldown: 8 * SEC, range: 20 * M },
  { id: Ability.StumbleHex, name: 'Stumble hex', mana: 10, cooldown: 6 * SEC, range: 14 * M },
  { id: Ability.SparkToss, name: 'Spark toss', mana: 5, cooldown: 3 * SEC, range: 14 * M },
];

/** Stumble hex lasts 4 s. */
export const HEX_STEPS = 4 * SEC;

/** The most mana a unit holds, in twentieths. */
export function maxMana(state: SimState, i: number): number {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).mana * MANA_SCALE : 0;
}

/** The step an ability is ready again for a unit (0 when it never waited). */
function readyAt(state: SimState, i: number, a: Ability): number {
  const list = state.entities.cools[i]!;
  for (let k = 0; k < list.length; k += 2) if (list[k] === a) return list[k + 1]!;
  return 0;
}

/** Whether a unit can use an ability now: off cooldown, with the mana for it. */
export function canUse(state: SimState, i: number, a: Ability): boolean {
  return state.step >= readyAt(state, i, a) && state.entities.mana[i]! >= ABILITIES[a]!.mana * MANA_SCALE;
}

/** Pays an ability's mana and starts its cooldown. */
export function spend(state: SimState, i: number, a: Ability): void {
  const e = state.entities;
  const spec = ABILITIES[a]!;
  e.mana[i] = e.mana[i]! - spec.mana * MANA_SCALE;
  const list = e.cools[i]!;
  for (let k = 0; k < list.length; k += 2) {
    if (list[k] !== a) continue;
    list[k + 1] = state.step + spec.cooldown;
    return;
  }
  list.push(a, state.step + spec.cooldown);
}

/** Each step every caster's mana refills by a twentieth, to its most. */
export function refillMana(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0) continue;
    const max = maxMana(state, i);
    if (max > 0 && e.mana[i]! < max) e.mana[i] = e.mana[i]! + 1;
  }
}

// ----- the goblin mage's spells -----

/** Snuff lands: a lit light of the players goes out without damage (its mana went when the cast began). */
export function snuffEffect(state: SimState, i: number, b: Building): void {
  void i;
  if (!snuffLight(state, b)) return;
  const [x, z] = buildingCentre(b);
  state.hits.push({ look: 'burst', x, y: buildingTop(b), z, id: b.id });
  state.events.push({ player: b.owner, kind: 'alert', text: `A goblin mage snuffed out a ${buildingSpec(b.kind).name.toLowerCase()}. A worker can relight it.`, x, z });
}

/** Stumble hex lands: one unit moves and attacks 20% slower for 4 s. */
export function stumbleEffect(state: SimState, i: number, t: number): void {
  const e = state.entities;
  void i;
  e.hexUntil[t] = state.step + HEX_STEPS;
  state.hits.push({ look: 'spark', x: e.x[t]!, y: e.y[t]! + WU_PER_METRE, z: e.z[t]!, id: e.id[t]! });
}

/** Spark toss at a unit: a small fire bolt. */
export function castSparkAt(state: SimState, i: number, t: number): void {
  const e = state.entities;
  spend(state, i, Ability.SparkToss);
  const spec = mobSpec(e.mob[i]!);
  fireAt(state, i, e.x[i]!, e.y[i]! + floorDiv(spec.height * 2, 3), e.z[i]!, t, Shot.Spark, floorDiv(SPARK.damage * e.power[i]!, 1000), spec.spreadBp, ProjectileFlag.Fire | ProjectileFlag.Spell);
}

/** Spark toss at a building: dry wood smoulders where it lands. */
export function castSparkAtBuilding(state: SimState, i: number, b: Building): void {
  const e = state.entities;
  spend(state, i, Ability.SparkToss);
  const spec = mobSpec(e.mob[i]!);
  const [x, z] = buildingCentre(b);
  launch(state, i, e.x[i]!, e.y[i]! + floorDiv(spec.height * 2, 3), e.z[i]!, x, floorDiv(b.y * 900 + buildingTop(b), 2), z, Shot.Spark, floorDiv(SPARK.damage * e.power[i]!, 1000), ProjectileFlag.Fire | ProjectileFlag.Spell);
}
