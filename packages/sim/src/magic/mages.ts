// The mage herself (Magic: Mage types, Mage ranks and mana; Table 1 mage
// rows; Table 7 mage rows): adding one, her health, mana bar and refill by
// rank, the 10 s combat pause, spell power, experience and rank training at
// the Magi Sanctum, and her wand and robe tiers (Table 13: the wand sets
// spell power and the mana bar, the robe protection and mana regain). The
// casting itself is in cast.ts.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { rankSpellPowerBonusBp, XP_TENTHS } from '../rules.ts';
import { standY, UnitKind, WALK_SPEED_WU, type SimState } from '../state.ts';
import { applyKit, ROBE_KITS, WAND_KITS } from '../units/kits.ts';
import { COMBAT_PAUSE_STEPS, MANA_SCALE, MAGE_RANKS, MAGE_TOP_RANK, mageRank, School, SCHOOL_NAMES, Spell, spellSpec } from './spells.ts';

const SEC = STEPS_PER_SECOND;

/** Table 7: a new mage (Novice Acolyte) costs 50 food and a hazel wand and homespun robe (units/kits.ts), and takes 60 s plus the kit's time. */
export const MAGE_FOOD = 50;
export const MAGE_TRAIN_STEPS = 60 * SEC;
/** Mages are also trained at a main base of level 6 or higher (Magic). */
export const MAGE_MAIN_BASE_LEVEL = 6;

/** Experience for each mage rank, tenths (Table 1: Acolyte 40 to Grand Magician 2000), by rank. */
export const MAGE_XP_TENTHS: readonly number[] = [0, ...MAGE_RANKS.map((r) => r.xp * XP_TENTHS)];

/** Experience alone takes a mage to Adept Acolyte; the ranks above wait for her training at the Magi Sanctum (Table 7). */
export const MAGE_XP_RANK_LIMIT = 3;

/** Each rank's name, by rank. */
export const MAGE_RANK_NAMES: readonly string[] = ['', ...MAGE_RANKS.map((r) => r.name)];

export interface MageTraining {
  rank: number;
  food: number;
  /** Mana crystals from the pool. */
  crystals: number;
  /** A combat rank: her experience must reach it first (banked until then). */
  combat: boolean;
  steps: number;
  name: string;
}

/**
 * Table 7: to Acolyte 40 food in 60 s; to Adept Acolyte 60 food and 2 mana
 * crystals in 120 s; Mage, Master Mage and Grand Magician 2, 5 and 10 mana
 * crystals from stock (no rank-wand item) and 30 s each, once her
 * experience reaches the rank (banked until then).
 */
export const MAGE_RANK_TRAINING: readonly MageTraining[] = [
  { rank: 2, food: 40, crystals: 0, combat: false, steps: 60 * SEC, name: 'Acolyte' },
  { rank: 3, food: 60, crystals: 2, combat: false, steps: 120 * SEC, name: 'Adept Acolyte' },
  { rank: 4, food: 0, crystals: 2, combat: true, steps: 30 * SEC, name: 'Mage' },
  { rank: 5, food: 0, crystals: 5, combat: true, steps: 30 * SEC, name: 'Master Mage' },
  { rank: 6, food: 0, crystals: 10, combat: true, steps: 30 * SEC, name: 'Grand Magician' },
];

/** The training a mage can take next, or undefined at the top. */
export function nextMageTraining(rank: number): MageTraining | undefined {
  return MAGE_RANK_TRAINING.find((t) => t.rank === rank + 1);
}

/** Why a mage cannot start her next rank training, or '' (the food and crystals are checked on arrival). */
export function mageTrainingProblem(state: SimState, i: number): string {
  const e = state.entities;
  const t = nextMageTraining(e.rank[i]!);
  if (!t) return 'She is at the highest rank.';
  if (t.combat && e.xp[i]! < MAGE_XP_TENTHS[t.rank]!) return `Training to ${t.name} needs ${MAGE_RANKS[t.rank - 1]!.xp} experience from combat.`;
  return '';
}

export function isMage(state: SimState, i: number): boolean {
  return state.entities.kind[i] === UnitKind.Mage;
}

/** The most mana a mage of a rank holds with a wand tier, in twentieths (Table 13: the wand adds to the bar). */
export function mageMaxMana(rank: number, wand = 0): number {
  return (mageRank(rank).mana + (WAND_KITS[wand]?.mana ?? 0)) * MANA_SCALE;
}

/** A mage's own mana bar, in twentieths. */
export function manaCap(state: SimState, i: number): number {
  const e = state.entities;
  return mageMaxMana(e.rank[i]!, e.wTier[i]!);
}

/** A new Novice Acolyte of a school, with a full mana bar, a hazel wand and a homespun robe; returns her index. */
export function addMage(state: SimState, owner: number, x: number, z: number, school: number, wand = 1, robe = 1): number {
  const id = state.nextEntityId++;
  const e = state.entities;
  const i = e.add(id, owner, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Mage);
  e.school[i] = school === School.Battle ? School.Battle : School.Support;
  e.rank[i] = 1;
  e.hp[i] = mageRank(1).health;
  e.maxHp[i] = mageRank(1).health;
  e.wTier[i] = wand;
  e.aTier[i] = robe;
  applyKit(e, i, 'mage');
  e.mana[i] = manaCap(state, i);
  e.homeX[i] = x;
  e.homeZ[i] = z;
  return i;
}

/** Raises a mage to a rank: her health and her mana bar grow by the difference. */
export function setMageRank(state: SimState, i: number, rank: number): void {
  const e = state.entities;
  const before = mageRank(e.rank[i]!);
  const after = mageRank(rank);
  e.rank[i] = after.rank;
  e.hp[i] = e.hp[i]! + after.health - e.maxHp[i]!;
  e.maxHp[i] = after.health;
  e.mana[i] = Math.min(mageMaxMana(rank, e.wTier[i]!), e.mana[i]! + (after.mana - before.mana) * MANA_SCALE);
}

/** A mage's name for messages and the selection panel: "Battle mage (Acolyte)". */
export function mageTitle(school: number, rank: number): string {
  return `${SCHOOL_NAMES[school] ?? 'Mage'} (${MAGE_RANK_NAMES[rank] ?? `rank ${rank}`})`;
}

/**
 * Experience for a mage (combat.ts gainXp): she rises by herself to Adept
 * Acolyte; past that the experience is banked, and the first time it is
 * enough for the next rank the player is told to train her.
 */
export function mageGainXp(state: SimState, i: number, tenths: number): void {
  const e = state.entities;
  const before = e.xp[i]!;
  e.xp[i] = before + tenths;
  for (;;) {
    const r = e.rank[i]!;
    if (r >= MAGE_XP_RANK_LIMIT || r >= MAGE_TOP_RANK) break;
    if (e.xp[i]! < MAGE_XP_TENTHS[r + 1]!) return;
    setMageRank(state, i, r + 1);
    state.events.push({ player: e.owner[i]!, kind: 'info', text: `A ${SCHOOL_NAMES[e.school[i]!]!.toLowerCase()} has risen to ${MAGE_RANK_NAMES[r + 1]}.`, x: e.x[i]!, z: e.z[i]! });
  }
  const r = e.rank[i]!;
  if (r >= MAGE_TOP_RANK) return;
  const need = MAGE_XP_TENTHS[r + 1]!;
  if (before < need && e.xp[i]! >= need) {
    const t = nextMageTraining(r)!;
    state.events.push({ player: e.owner[i]!, kind: 'info', text: `A ${SCHOOL_NAMES[e.school[i]!]!.toLowerCase()} has the experience for ${t.name}. Train her at a Magi Sanctum (${t.crystals} mana crystals).`, x: e.x[i]!, z: e.z[i]! });
  }
}

/**
 * Spell power, bp over the spell's own amount: +10% a rank above the first,
 * multiplied by her wand's power (Table 13: x1.0 to x1.25), plus Rally's
 * +20% while it lasts.
 */
export function spellPowerBp(state: SimState, i: number): number {
  const e = state.entities;
  const wand = e.kind[i] === UnitKind.Mage ? (WAND_KITS[e.wTier[i]!]?.powerPct ?? 100) : 100;
  const rank = floorDiv((10000 + rankSpellPowerBonusBp(e.rank[i]!)) * wand, 100) - 10000;
  return rank + (e.rallyUntil[i]! > state.step ? spellSpec(Spell.Rally).bp : 0);
}

/**
 * In combat: hurt in the last 10 s (s). Casting is not combat, so a mage
 * behind the line keeps refilling; that is what lets a Grand Magician keep
 * up a bolt every 4 s (Table 13, how these were set).
 */
export function inCombat(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.hurtAt[i]! !== 0 && state.step - e.hurtAt[i]! < COMBAT_PAUSE_STEPS;
}

/** Each step every mage out of combat refills: her rank's rate in hundredths of a point a second is the same number of hundredths of a twentieth a step. */
export function refillMages(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    // A Grovesinger's mana comes from the trees (peoples/grove.ts).
    if (e.kind[i] !== UnitKind.Mage || e.hp[i]! <= 0 || e.school[i] === School.Grove) continue;
    const max = manaCap(state, i);
    if (e.mana[i]! >= max) {
      e.manaAcc[i] = 0;
      continue;
    }
    if (inCombat(state, i)) continue;
    // Her robe adds to her regain (Table 13: +0% to +25%).
    const acc = e.manaAcc[i]! + floorDiv(mageRank(e.rank[i]!).refill * (100 + (ROBE_KITS[e.aTier[i]!]?.regainPct ?? 0)), 100);
    e.mana[i] = Math.min(max, e.mana[i]! + floorDiv(acc, 100));
    e.manaAcc[i] = acc % 100;
  }
}
