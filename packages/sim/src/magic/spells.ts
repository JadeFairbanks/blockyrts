// The mages' magic as data (Magic: Mage types, Mage ranks and mana; Table 1
// mage rows; Table 13: Mage spells and mana). Each spell is a row here plus
// an effect in magic/cast.ts; a new spell is a new row (and a new effect
// only when none of the existing ones fits). Mana is in whole points here
// and in twentieths on the unit (threats/abilities.ts MANA_SCALE).

import { STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;

/** The two kinds of mage (Mage types); a unit's school field. */
export const School = { None: 0, Support: 1, Battle: 2 } as const;
export type School = (typeof School)[keyof typeof School];

export const SCHOOL_NAMES = ['', 'Support mage', 'Battle mage'] as const;

export interface MageRank {
  rank: number;
  name: string;
  /** Table 1: experience to reach the rank. */
  xp: number;
  health: number;
  /** Table 13: the mana bar, and its refill in hundredths of a point a second. */
  mana: number;
  refill: number;
}

/**
 * Table 1 and Table 13 by rank: Novice Acolyte to Grand Magician. Refill
 * from the doc's times to fill an empty bar (2:00, 1:49, 1:40, 1:32, 1:26,
 * 1:17). Spell power is +10% a rank (rules.ts rankSpellPowerBonusBp).
 */
export const MAGE_RANKS: readonly MageRank[] = [
  { rank: 1, name: 'Novice Acolyte', xp: 0, health: 70, mana: 100, refill: 83 },
  { rank: 2, name: 'Acolyte', xp: 40, health: 80, mana: 120, refill: 110 },
  { rank: 3, name: 'Adept Acolyte', xp: 120, health: 90, mana: 140, refill: 140 },
  { rank: 4, name: 'Mage', xp: 300, health: 100, mana: 160, refill: 174 },
  { rank: 5, name: 'Master Mage', xp: 800, health: 110, mana: 180, refill: 209 },
  { rank: 6, name: 'Grand Magician', xp: 2000, health: 120, mana: 200, refill: 260 },
];

export const MAGE_TOP_RANK = 6;

/** A mage's rank row (rank 1 to 6). */
export function mageRank(rank: number): MageRank {
  return MAGE_RANKS[Math.min(MAGE_TOP_RANK, Math.max(1, rank)) - 1]!;
}

/** Being in combat stops the refill for 10 s (Mage ranks and mana). */
export const COMBAT_PAUSE_STEPS = 10 * SEC;
/** Table 13: every spell takes 1.0 s to cast (s), except Counterspell, which answers at once (s). */
export const CAST_STEPS = 1 * SEC;
/** Table 1: a mage's leash (s). */
export const MAGE_LEASH_WU = 15 * M;
/** Table 1: a wand tap does 3 every 1.5 s. */
export const WAND_TAP = { damage: 3, attackSteps: 30 } as const;

export const Spell = {
  Heal: 0,
  Quicken: 1,
  Fortify: 2,
  Rally: 3,
  ArcaneBolt: 4,
  Beam: 5,
  Fireball: 6,
  AreaBlast: 7,
  Warding: 8,
  Counterspell: 9,
} as const;
export type Spell = (typeof Spell)[keyof typeof Spell];

/** What a spell is aimed at: one of the players' units, an enemy, a spot on the ground, or an enemy spell being cast. */
export type SpellTarget = 'ally' | 'enemy' | 'point' | 'counter';

/** The effect code that carries a spell out (magic/cast.ts EFFECTS). */
export type SpellEffect = 'heal' | 'quicken' | 'fortify' | 'rally' | 'bolt' | 'beam' | 'fireball' | 'blast' | 'ward' | 'counter';

export interface SpellSpec {
  id: Spell;
  name: string;
  /** Default hotkey: a letter of the name where the command card has one free (Command card and hotkeys). */
  key: string;
  school: School;
  /** The rank that learns it. */
  rank: number;
  /** Needs Hexcraft researched (Table 2a). */
  hexcraft: boolean;
  mana: number;
  /** Steps before it can be cast again. */
  cooldown: number;
  /** Cast range, wu. */
  range: number;
  /** A projectile flies (and can be blocked); otherwise it needs a clear line of sight to cast and then always lands. */
  projectile: boolean;
  target: SpellTarget;
  effect: SpellEffect;
  /** Healing, damage, or damage a second for a beam, at rank 1 (scaled by spell power). */
  amount: number;
  /** Splash or area radius, wu. */
  radius: number;
  /** How long its effect lasts, steps. */
  steps: number;
  /** A buff's strength, bp (Quicken 25%, Fortify 15% armour, Rally 20% damage). */
  bp: number;
  /** Damage against walls and buildings, where it differs (Arcane bolt 2, Area blast 40). */
  vsWalls: number;
  /** The mage's clip while casting it (Table 13 "clip"). */
  clip: 'cast_heal' | 'cast_bolt' | 'cast_beam' | 'cast_area';
  /** The catalogue models: what flies or shows where it lands, and the command card icon. */
  model: string;
  icon: string;
  /** A mage casts it by herself while idle, on Stop, attack-moving, patrolling or holding (s): the rank 1 spells and the counter. */
  auto: boolean;
  /** For the command card's tooltip. */
  text: string;
}

/** Table 13 (all values (s) unless the doc says otherwise; Warding and Counterspell's effects are Jade's). */
export const SPELLS: readonly SpellSpec[] = [
  {
    id: Spell.Heal, name: 'Heal', key: 'R', school: School.Support, rank: 1, hexcraft: false,
    mana: 15, cooldown: 2 * SEC, range: 12 * M, projectile: false, target: 'ally', effect: 'heal',
    amount: 30, radius: 0, steps: 3 * SEC, bp: 0, vsWalls: 0, clip: 'cast_heal', model: 'spell_heal_motes', icon: 'icon_spell_heal', auto: true,
    text: 'One of your units regains 30 health over 3 s (more at higher ranks).',
  },
  {
    id: Spell.Quicken, name: 'Quicken', key: 'K', school: School.Support, rank: 2, hexcraft: false,
    mana: 20, cooldown: 10 * SEC, range: 12 * M, projectile: false, target: 'ally', effect: 'quicken',
    amount: 0, radius: 0, steps: 8 * SEC, bp: 2500, vsWalls: 0, clip: 'cast_bolt', model: 'spell_quicken', icon: 'icon_spell_quicken', auto: false,
    text: 'One of your units moves and attacks 25% faster for 8 s.',
  },
  {
    id: Spell.Fortify, name: 'Fortify', key: 'F', school: School.Support, rank: 3, hexcraft: false,
    mana: 30, cooldown: 15 * SEC, range: 10 * M, projectile: false, target: 'point', effect: 'fortify',
    amount: 0, radius: 5 * M, steps: 10 * SEC, bp: 1500, vsWalls: 0, clip: 'cast_area', model: 'spell_fortify', icon: 'icon_spell_fortify', auto: false,
    text: 'Your units within 5 m of the spot get +15% armour for 10 s (armour still stops at 75%).',
  },
  {
    id: Spell.Rally, name: 'Rally', key: 'Y', school: School.Support, rank: 4, hexcraft: false,
    mana: 40, cooldown: 20 * SEC, range: 12 * M, projectile: false, target: 'point', effect: 'rally',
    amount: 0, radius: 6 * M, steps: 10 * SEC, bp: 2000, vsWalls: 0, clip: 'cast_beam', model: 'spell_rally', icon: 'icon_spell_rally', auto: false,
    text: 'Your units within 6 m of the spot do +20% damage for 10 s and are cured of poison and hexes.',
  },
  {
    id: Spell.ArcaneBolt, name: 'Arcane bolt', key: 'R', school: School.Battle, rank: 1, hexcraft: false,
    mana: 10, cooldown: 30, range: 18 * M, projectile: true, target: 'enemy', effect: 'bolt',
    amount: 20, radius: 0, steps: 0, bp: 0, vsWalls: 2, clip: 'cast_bolt', model: 'spell_bolt', icon: 'icon_spell_arcane_bolt', auto: true,
    text: 'A violet-white orb flies at one enemy for 20 damage (more at higher ranks). Walls and trees stop it.',
  },
  {
    id: Spell.Beam, name: 'Beam', key: 'B', school: School.Battle, rank: 2, hexcraft: false,
    mana: 25, cooldown: 6 * SEC, range: 14 * M, projectile: false, target: 'enemy', effect: 'beam',
    amount: 12, radius: 0, steps: 3 * SEC, bp: 0, vsWalls: 0, clip: 'cast_beam', model: 'spell_beam_segment', icon: 'icon_spell_beam', auto: false,
    text: 'A continuous beam burns one enemy for 12 a second for 3 s while the mage stands and holds it.',
  },
  {
    id: Spell.Fireball, name: 'Fireball', key: 'F', school: School.Battle, rank: 3, hexcraft: false,
    mana: 30, cooldown: 8 * SEC, range: 22 * M, projectile: true, target: 'enemy', effect: 'fireball',
    amount: 35, radius: 2 * M, steps: 5 * SEC, bp: 0, vsWalls: 30, clip: 'cast_bolt', model: 'spell_fireball', icon: 'icon_spell_fireball', auto: false,
    text: 'A lobbed fireball: 35 to what it hits and 15 to every enemy within 2 m. Three times as hard on wooden walls and buildings, 30 on stone, and wood burns 8 a second for 5 s.',
  },
  {
    id: Spell.AreaBlast, name: 'Area blast', key: 'T', school: School.Battle, rank: 4, hexcraft: false,
    mana: 50, cooldown: 15 * SEC, range: 16 * M, projectile: false, target: 'point', effect: 'blast',
    amount: 45, radius: 4 * M, steps: 0, bp: 0, vsWalls: 40, clip: 'cast_area', model: 'spell_area_ring', icon: 'icon_spell_area_blast', auto: false,
    text: 'A ring of force: 45 damage to every enemy within 4 m of the spot.',
  },
  {
    id: Spell.Warding, name: 'Warding', key: 'W', school: School.Support, rank: 2, hexcraft: true,
    mana: 30, cooldown: 30 * SEC, range: 10 * M, projectile: false, target: 'point', effect: 'ward',
    amount: 0, radius: 8 * M, steps: 30 * SEC, bp: 5000, vsWalls: 0, clip: 'cast_area', model: 'spell_warding', icon: 'icon_spell_warding', auto: false,
    text: 'Your units within 8 m of the spot take half damage from enemy spells for 30 s.',
  },
  {
    id: Spell.Counterspell, name: 'Counterspell', key: 'C', school: School.Battle, rank: 2, hexcraft: true,
    mana: 20, cooldown: 8 * SEC, range: 18 * M, projectile: false, target: 'counter', effect: 'counter',
    amount: 0, radius: 0, steps: 0, bp: 0, vsWalls: 0, clip: 'cast_bolt', model: 'spell_counterspell', icon: 'icon_spell_counterspell', auto: true,
    text: 'Cancels one enemy spell while it is being cast within 18 m; the enemy still spends its mana and waits out its cooldown. Mages who know it do it by themselves.',
  },
];

export function spellSpec(id: number): SpellSpec {
  const s = SPELLS[id];
  if (!s) throw new RangeError(`no spell ${id}`);
  return s;
}

/** Fireball: what lands beside the target, 15 of the 35 (Table 13). */
export const FIREBALL_SPLASH = 15;
/** Fireball: three times as hard on wooden walls and buildings (Table 13). */
export const FIREBALL_WOOD_MULTIPLIER = 3;
/** Fireball: wood it hits burns 8 a second for 5 s (Table 13). */
export const FIREBALL_BURN = { perSecond: 8, steps: 5 * SEC } as const;

/** Spells a mage of a school and rank knows, in table order; Hexcraft adds Warding and Counterspell from rank 2. */
export function spellsKnown(school: number, rank: number, hexcraft: boolean): Spell[] {
  return SPELLS.filter((s) => s.school === school && rank >= s.rank && (!s.hexcraft || hexcraft)).map((s) => s.id);
}

/** Every spell of a school, in table order (the command card shows them all, greyed until learned). */
export function schoolSpells(school: number): Spell[] {
  return SPELLS.filter((s) => s.school === school).map((s) => s.id);
}
