// Stone circles (Jade's Stone Circle document, SC-1 to SC-12 and SCA-4 to
// SCA-8, with her answers of 2026-10-08): the numbers and tables, as data
// rows. Where her text gives a number it is copied here with her item code;
// every other number is marked (s), a pick listed in
// blueprint/patch5-stone-circles-picks.md.

import { Res, TRINKET_BASE } from '../economy/resources.ts';
import { STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { Band } from '../world/layout.ts';

const M = WU_PER_METRE;

/** The bands that hold stone circles (SC-2: "Fringe, Deepwoods, Barrens"). */
export const CIRCLE_BANDS: readonly Band[] = [Band.Fringe, Band.Deepwoods, Band.Barrens];
/** Circles in each of those bands: 0 to 4 (Jade 2026-10-08: "make the stone circles rarity from 0-2 as it is now to 0-4"). Even odds (s). */
export const CIRCLES_PER_BAND_MAX = 4;
/** No two circles closer than this, centre to centre (s). */
export const CIRCLE_SPACING_M = 250;

/** The forest gives way round a circle (SC-2: "in a radius of 60 metres around the centre ... only zero to five softwood trees can spawn"). */
export const CLEARING_M = 60;
export const CLEARING_SOFTWOOD_MAX = 5;
/** No other generated prop (rocks, plants, ore) inside the ruin itself, out to the outer ring and a little beyond (s). */
export const RUIN_CLEAR_M = 34;

/** The four kinds of circle (SC-3): a Tier I ruin is always generic; Tier II and III are one of the three types. */
export const CircleType = { Generic: 0, Lunar: 1, Silenus: 2, Boneyard: 3 } as const;
export type CircleType = (typeof CircleType)[keyof typeof CircleType];
export const CIRCLE_TYPE_NAMES = ['Stone circle', 'Great White Ape Lunar Circle', 'Silenus Circle', 'Boneyard Circle'] as const;

/** Tier odds, per mille, for Tiers I, II and III (s). */
export const TIER_ODDS_PM: readonly number[] = [400, 350, 250];
/** Type odds for a Tier II or III circle, per mille: Lunar, Silenus, Boneyard (s: even). */
export const TYPE_ODDS_PM: readonly number[] = [334, 333, 333];

/** One ring of trilithons (SC-3: "one, two, or three rings; each ring is composed of ... trilithons"): its radius and how many stand round it (s). */
export interface RingRow {
  radiusM: number;
  trilithons: number;
}
/** The rings, innermost first: a Tier I circle has the first, Tier II the first two, Tier III all three (SC-3). A trilithon is 4.7 m wide. */
export const RINGS: readonly RingRow[] = [
  { radiusM: 12, trilithons: 8 },
  { radiusM: 20, trilithons: 12 },
  { radiusM: 28, trilithons: 16 },
];

/** The five trilithon states, as SC-3 numbers them. */
export const Trilithon = { Destroyed: 1, Poor: 2, Crumbled: 3, Intact: 4, Worn: 5 } as const;
export type Trilithon = (typeof Trilithon)[keyof typeof Trilithon];

export interface TrilithonRow {
  state: Trilithon;
  name: string;
  /** The model Jade supplied (stone_circle/INDEX.md). */
  model: string;
  /** Bluestone a worker gets breaking it down with iron tools or better (SC-4: "It takes iron tools, or superior to mine bluestone or destroy structures built out of it") (s). */
  bluestone: number;
}
export const TRILITHONS: readonly TrilithonRow[] = [
  { state: Trilithon.Destroyed, name: 'Destroyed trilithon', model: 'trilithon_destroyed', bluestone: 12 },
  { state: Trilithon.Poor, name: 'Trilithon in poor condition', model: 'trilithon_poor', bluestone: 30 },
  { state: Trilithon.Crumbled, name: 'Crumbled trilithon', model: 'trilithon_crumbled', bluestone: 24 },
  { state: Trilithon.Intact, name: 'Intact trilithon', model: 'trilithon_intact', bluestone: 45 },
  { state: Trilithon.Worn, name: 'Worn trilithon', model: 'trilithon_worn', bluestone: 40 },
];
export function trilithonRow(state: number): TrilithonRow {
  return TRILITHONS.find((t) => t.state === state) ?? TRILITHONS[3]!;
}

/** SC-3: "In each ring 40% to 70% of it should be composed of [4] intact trilithon, and [5] worn trilithon". */
export const STANDING_MIN_PCT = 40;
export const STANDING_MAX_PCT = 70;

/** Chests by tier (SC-3: "Tier I stone circles can have one Bluestone Chest, Tier II can have two Bluestone Chests, tier III Can have three"). Each always has its full count (s). */
export const CHESTS_BY_TIER: readonly number[] = [1, 2, 3];
/** SC-6: "There are five spaces in the chest for items." */
export const CHEST_SLOTS = 5;
/** Chests stand inside the first ring, this far from the middle (s). */
export const CHEST_RING_M = 6;
/** A unit this close to a chest, an altar or an idol can use it (s). */
export const REACH_M = 4;

/** One line of the chest loot table (SC-6). Every line rolls on its own; a chest keeps at most CHEST_SLOTS of them, the rarest first (s). */
export interface LootLine {
  /** SC-6's chance of the line, per cent. */
  pct: number;
  /** A Res (a number, as a trinket has no name of its own). */
  res: number;
  count: number;
}

/** The Gold Token, the first tier of gold trinket: SC-6's "Gold Trinket" (s). */
const GOLD_TOKEN = TRINKET_BASE + 6 * 4;

/** SC-6, line by line, in her order. */
export const CHEST_LOOT: readonly LootLine[] = [
  // "These items have a 50% chance to be in the Bluestone Chest"
  { pct: 50, res: Res.Bone, count: 10 },
  { pct: 50, res: Res.Gold, count: 5 },
  { pct: 50, res: Res.Obsidian, count: 3 },
  { pct: 50, res: Res.CopperOre, count: 30 },
  { pct: 50, res: Res.BluestoneTrinket, count: 1 },
  // "These items have a 30% chance of being in the bluestone chest"
  { pct: 30, res: Res.Gold, count: 10 },
  { pct: 30, res: Res.Obsidian, count: 6 },
  { pct: 30, res: Res.AncientSeed, count: 2 },
  { pct: 30, res: Res.Rubies, count: 1 },
  // "These items have a 10% chance of being in a bluestone chest"
  { pct: 10, res: GOLD_TOKEN, count: 10 },
  { pct: 10, res: Res.Gold, count: 20 },
  { pct: 10, res: Res.Obsidian, count: 14 },
  { pct: 10, res: Res.PanFlute, count: 1 },
];

/** Bluestone rubble piles strewn round a circle, by tier (SC-5), one large to two small (s). */
export const RUBBLE_BY_TIER: readonly number[] = [6, 10, 14];
/** Bluestone in a pile (s): large, small. */
export const RUBBLE_BLUESTONE = { large: 10, small: 5 } as const;

/** The plants and things that dress a circle, as the client draws them; `kind` is a CircleProp. */
export const CircleProp = {
  Trilithon: 0,
  Rubble: 1,
  Chest: 2,
  Altar: 3,
  MoonIdol: 4,
  HeadlessIdol: 5,
  Hawthorne: 6,
  MoonRose: 7,
  RuinBush: 8,
  RuinFern: 9,
  Moss: 10,
  Flower: 11,
  BonePile: 12,
  DeadTree: 13,
  ThornBush: 14,
  Softwood: 15,
} as const;
export type CircleProp = (typeof CircleProp)[keyof typeof CircleProp];

/** One kind of dressing round a circle: how many, by tier, and how far out (SC-2 "very overgrown with bushes, ferns, and moss"; SCA-7; SCS-1; SCB-1) (s). */
export interface DressRow {
  prop: CircleProp;
  byTier: readonly [number, number, number];
  minM: number;
  maxM: number;
}

const GREEN: readonly DressRow[] = [
  { prop: CircleProp.RuinBush, byTier: [12, 18, 24], minM: 4, maxM: 40 },
  { prop: CircleProp.RuinFern, byTier: [10, 14, 18], minM: 3, maxM: 38 },
  { prop: CircleProp.Moss, byTier: [12, 18, 24], minM: 2, maxM: 34 },
];

/** Dressing by circle type (CircleType order). */
export const DRESSING: readonly (readonly DressRow[])[] = [
  // Generic ruins: overgrown (SC-2).
  GREEN,
  // Lunar: "covered in a brightly coloured moss ... The whole area is populated by Sweet Hawthorne trees and also Moon Rose Bushes" (SCA-7), with the Ape's flowers (SCA-2).
  [
    ...GREEN,
    { prop: CircleProp.Hawthorne, byTier: [0, 5, 7], minM: 8, maxM: 40 },
    { prop: CircleProp.MoonRose, byTier: [0, 8, 12], minM: 4, maxM: 32 },
    { prop: CircleProp.Flower, byTier: [0, 10, 14], minM: 3, maxM: 30 },
  ],
  // Silenus: "Sweet Hawthorne trees loom above the ancient stones, baring a crop of fruit" (SCS-1).
  [...GREEN, { prop: CircleProp.Hawthorne, byTier: [0, 4, 6], minM: 8, maxM: 36 }],
  // Boneyard: "piled with the bones of the dead ... barren, with dead trees and thorny bushes sparsely dotting the ruins" (SCB-1).
  [
    { prop: CircleProp.BonePile, byTier: [0, 8, 12], minM: 3, maxM: 32 },
    { prop: CircleProp.DeadTree, byTier: [0, 3, 5], minM: 10, maxM: 40 },
    { prop: CircleProp.ThornBush, byTier: [0, 5, 8], minM: 4, maxM: 40 },
  ],
];

/** How much room each kind of piece keeps round itself, tenths of a metre, in CircleProp order (s): nothing is placed overlapping another. */
export const PIECE_ROOM_DM: readonly number[] = [26, 6, 9, 16, 0, 0, 22, 7, 8, 8, 9, 4, 7, 14, 6, 22];
/** Bone piles (SCB-1; Jade's model notes: "Gatherable as bones if desired"): bone in a large and a small pile (s), one large to two small. */
export const BONE_PILE_BONE = { large: 10, small: 5 } as const;

/** Where the 0 to 5 softwood trees of the clearing stand (SC-2), metres from the middle (s). */
export const CLEARING_TREES_MIN_M = 38;
export const CLEARING_TREES_MAX_M = 58;

// ----- Sweet Hawthorne (SC-8 to SC-10) -----

/** SC-8: "grows into a Sweet Hawthorne tree over four to six nights": 5 (s, the middle). */
export const HAWTHORNE_GROW_NIGHTS = 5;
/** SC-9: "gives 10 hawthorne fruit. It takes 3 days for a hawthorne harvest to regrow." */
export const HAWTHORNE_FRUIT = 10;
export const HAWTHORNE_REGROW_DAYS = 3;
// SC-9's 30 m and 35% for farms and animals are the Food thread's HAWTHORNE_M and HAWTHORNE_PCT (buildings/farm-boost.ts).
/** A planter spends this long setting the seed in the ground (s). */
export const PLANT_STEPS = 4 * STEPS_PER_SECOND;
/** Cutting down a fruitless Sweet Hawthorne takes as long as a birch and gives its lumber (s): hardwood, as the doc's black-wooded small hardwood. */
export const HAWTHORNE_FELL_STEPS = 20 * STEPS_PER_SECOND;
export const HAWTHORNE_LUMBER = 15;

// ----- The Pan Flute (SC-11) -----

/** SC-11: "It can be used 10 times ... attracts all neutral animals in a 300 m radius towards the player's base." */
export const PAN_FLUTE_USES = 10;
export const PAN_FLUTE_RADIUS_M = 300;
/** Lured animals walk until they are this near the main base (s). */
export const PAN_FLUTE_STOP_M = 25;

// ----- Bright Nights (SCA-4, SCA-6; Jade's answers 2.8 and question 9) -----

/** "Out of every ten nights a player blessed by The Moon Goddess will have a Bright Night" (SCA-2): one in ten, the first the night after the blessing (s). */
export const BLESSED_EVERY_NIGHTS = 10;
/** "200 metres from the idol there will be an area where bright nights have a tendency to occur" (SCA-4): one night in three there (answer 2.8). */
export const IDOL_AREA_M = 200;
export const IDOL_AREA_EVERY_NIGHTS = 3;
/** A taken idol used from the inventory makes the next night bright for its player, again after 10 nights (answer 2.8). */
export const IDOL_USE_EVERY_NIGHTS = 10;
/** The lavish gifts (question 9): 5 gold ingots, or 35 silver ingots, plus 3 Moon Roses, left at the altar by a unit. */
export const GIFT_GOLD = 5;
export const GIFT_SILVER = 35;
export const GIFT_ROSES = 3;
/** Moon Roses on a bush each Bright Night (s). */
export const ROSES_PER_BUSH = 3;

/** The idol's tool tip, in her words (SCA-5). */
export const MOON_IDOL_TIP = 'This evocative feminine idol inspires fierce devotion from the supplicants to the Goddess. It is said to have the power to illuminate the darkest of nights and ward monsters away, for one night at least.';

/** Metres to world units. */
export function circleMetres(metres: number): number {
  return metres * M;
}
