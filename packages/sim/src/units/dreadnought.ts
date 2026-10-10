// The Dreadnought (Patch 5, Jade, GP-21): a player's unit hired at the
// Tavern. He is a troop of his own type (units/kits.ts Troop.Dreadnought)
// with the mace and plate of his model (DREADNOUGHT_KIT): no kit to
// upgrade, no shield, no ranks. Patch 7 (plan 2.3): the mace is an item he
// can take off and swap for any two-handed area weapon, and his plate is the
// Fluted Gothic harness in his look; offered any other weapon he says
// "I need something for smashing." (sayNeedSmashing). He is paid for with 100 food and 15 gold
// ingots' worth of gold and silver, mixed as the player likes (one gold
// ingot is worth 7 silver), never under and at most a little over; he eats
// 3 food a meal and takes 8 supply; a player has at most 1 alive at a tier 3
// main base and 3 at tier 4. How he gets about is his row of the movement
// table (units/moves.ts GAITS, Gait.Dreadnought): he walks, and so runs, 20%
// slower than the standard units, pays double food for running, never climbs
// and jumps rises up to 1.5 m (decisions 3.8). Now and then he says
// something, with his war cry.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { addWarrior, OrderKind, UnitKind, type EntityStore, type SimState } from '../state.ts';
import { say } from '../peoples/speech.ts';
import { Role } from '../threats/types.ts';
import { DREADNOUGHT_GEAR, SMASHING_LINE, Troop } from './kits.ts';

/** The Dreadnought's row (Jade, GP-21; s where she gave no number). */
export const DREADNOUGHT = {
  /** Food paid when he is hired, besides the ingots (Jade: 100, not negotiable). */
  food: 100,
  /** His price in gold ingots, and one gold ingot's worth in silver ingots (Jade: 15 gold or 105 silver; a gold is worth 7 silver). */
  gold: 15,
  silverPerGold: 7,
  /** How far over the price a mixed payment may go, in silver's worth (s: under one gold's worth; Jade: slight overpaying, never under). */
  overSilver: 6,
  /** Seconds he takes to hire at the Tavern (s). */
  trainS: 60,
  /** Health (Jade: 200). */
  hp: 200,
  /** Supply he takes (Jade: 8). */
  supply: 8,
  /** Food he eats each meal (Jade: 3 every eating tick). */
  mealFood: 3,
  /** The most a player may have alive (and being hired) by main base tier, [tier 0, ..., tier 4] (Jade: 1 at tier 3, 3 at tier 4). */
  capByTier: [0, 0, 0, 1, 3] as readonly number[],
  /** Seconds between his remarks on average (s). */
  remarkS: 75,
};

/** What he says now and then, with his war cry (s). */
export const DREADNOUGHT_REMARKS: readonly string[] = [
  'Who said ogre? WHO SAID OGRE?',
  'My mother was a lady. A big lady.',
  'Point me at something that needs flattening.',
  'This mace has a name. You are not ready to hear it.',
  'Plate armour is not heavy. You are just small.',
  'Another night, another heap of monsters to sort out.',
  'Mind your toes.',
  'Leave the big ones to me.',
  'Somebody pour me another. After the fight, then.',
  'I heard that whisper. I hear everything.',
  'Ogres are short. I am not short. Think about it.',
];

/** What he says the moment he is hired (s). */
export const DREADNOUGHT_HIRED: readonly string[] = [
  'Silver well spent. Who needs smashing?',
  'The Dreadnought is here. You may stop worrying.',
  'Fed, paid and ready. Lead on.',
];

/** Whether unit i is a Dreadnought. */
export function isDreadnought(e: EntityStore, i: number): boolean {
  return e.kind[i] === UnitKind.Warrior && e.troop[i] === Troop.Dreadnought;
}

/** Supply unit i takes: the Dreadnought's 8, one for any other worker, warrior or mage (Table 4). */
export function unitSupply(e: EntityStore, i: number): number {
  // A skeleton archer the Deathless Shroud raised takes none (Patch 7, s: it stands 25 s).
  if (e.role[i] === Role.Risen) return 0;
  return isDreadnought(e, i) ? DREADNOUGHT.supply : 1;
}

/** His price in silver ingots' worth: 15 gold at 7 silver each, 105. */
export function dreadnoughtPrice(): number {
  return DREADNOUGHT.gold * DREADNOUGHT.silverPerGold;
}

/** What a mix of gold and silver ingots is worth in silver. */
export function ingotWorth(gold: number, silver: number): number {
  return gold * DREADNOUGHT.silverPerGold + silver;
}

/**
 * Whether a payment of gold and silver ingots hires him (Jade): worth at
 * least the price, never under, and at most a little over (overSilver).
 */
export function paysForDreadnought(gold: number, silver: number): boolean {
  if (gold < 0 || silver < 0 || gold > DREADNOUGHT.gold) return false;
  const worth = ingotWorth(gold, silver);
  return worth >= dreadnoughtPrice() && worth <= dreadnoughtPrice() + DREADNOUGHT.overSilver;
}

/** The most Dreadnoughts a player may have at a main base tier. */
export function dreadnoughtCap(baseTier: number): number {
  const caps = DREADNOUGHT.capByTier;
  return caps[Math.min(Math.max(baseTier, 0), caps.length - 1)]!;
}

/** A player's Dreadnoughts alive now. */
export function dreadnoughtsAlive(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.hp[i]! > 0 && isDreadnought(e, i)) n++;
  return n;
}

/** A new Dreadnought for a player at (x, z), wu; returns its index. */
export function addDreadnought(state: SimState, owner: number, x: number, z: number): number {
  const i = addWarrior(state, owner, x, z, Troop.Dreadnought, 0, 0);
  const e = state.entities;
  e.hp[i] = DREADNOUGHT.hp;
  e.maxHp[i] = DREADNOUGHT.hp;
  // He comes with his mace and the harness in his look; from then on they are his to swap (Patch 7).
  e.weapon[i] = DREADNOUGHT_GEAR.mace;
  e.armour[i] = DREADNOUGHT_GEAR.plate;
  // His slower walk is his gait's (units/moves.ts), on the standard walk addWarrior gives him.
  return i;
}

/** He says a line, with his war cry for everyone in sight of him. */
export function dreadnoughtSays(state: SimState, i: number, text: string): void {
  const e = state.entities;
  say(state, i, text, false, true);
  state.hits.push({ look: 'warcry', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

/** He says he needs something for smashing (plan 2.3), with his war cry: offered a weapon he cannot use, by a greyed click or a drag. */
export function sayNeedSmashing(state: SimState, i: number): void {
  dreadnoughtSays(state, i, SMASHING_LINE);
}

/** His line on being hired. */
export function dreadnoughtHired(state: SimState, i: number): void {
  const lines = DREADNOUGHT_HIRED;
  dreadnoughtSays(state, i, lines[(hash32(0x68697265, state.entities.id[i]!) >>> 0) % lines.length]!);
}

/**
 * His remarks: once a second each Dreadnought standing at ease (not fighting,
 * not walking, not inside) speaks with a chance of one in `remarkS`, a line
 * picked by the same hash, so every machine picks the same.
 */
export function updateDreadnoughts(state: SimState): void {
  if (state.step % STEPS_PER_SECOND !== 0) return;
  const e = state.entities;
  const second = floorDiv(state.step, STEPS_PER_SECOND);
  for (let i = 0; i < e.count; i++) {
    if (!isDreadnought(e, i) || e.hp[i]! <= 0 || e.owner[i]! >= state.players.length) continue;
    if (e.inside[i] !== 0 || e.atkAt[i] !== 0 || e.order[i] !== OrderKind.Idle) continue;
    const roll = hash32(0x64726561, e.id[i]!, second) >>> 0;
    if (roll % DREADNOUGHT.remarkS !== 0) continue;
    const lines = DREADNOUGHT_REMARKS;
    dreadnoughtSays(state, i, lines[floorDiv(roll, DREADNOUGHT.remarkS) % lines.length]!);
  }
}
