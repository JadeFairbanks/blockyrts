// Rolling a creature's drops (mob roster: drops are now and then, never on
// every kill; Jade's rule that killing is never a way to build wealth): one
// roll per row on the 'combat' stream, "silver or gold" half the time the
// other. A goblin's club or spear comes as the materials that made it
// (Troops and gear: weapons in plunder become their materials). What a kill
// drops is loot the units carry home (units/loot.ts), not the pool's at once.
// Patch 5 (GP-1): the night's waves carry a rare weapon, armour or shield,
// which a killed mob drops like the rest.

import type { PendingSpawn, SimState } from '../state.ts';
import type { Drop } from '../combat/mobs.ts';
import type { Res } from '../economy/resources.ts';
import { floorDiv } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { ARMOUR_KITS, CLOSE_KITS, LONG_KITS, RANGER_KITS, SHIELD_KITS } from '../units/kits.ts';

/** What a drop table gave: (resource, count) pairs in row order, and the chance of the rarest row that came up, per mille (1000 for none). */
export interface Rolled {
  items: Array<[number, number]>;
  rarestPm: number;
}

/** Rolls a drop table; adds what it gave to `got` (resource, count). */
export function rollDropList(state: SimState, drops: readonly Drop[], got?: Map<number, number>): Rolled {
  const rng = state.rng.combat;
  const out: Rolled = { items: [], rarestPm: 1000 };
  for (const d of drops) {
    if (rng.nextInt(1000) >= d.chancePm) continue;
    const n = d.min + rng.nextInt(d.max - d.min + 1);
    const res = d.alt !== undefined && rng.nextInt(2) === 1 ? d.alt : d.res;
    out.items.push([res, n]);
    out.rarestPm = Math.min(out.rarestPm, d.chancePm);
    got?.set(res, (got.get(res) ?? 0) + n);
  }
  return out;
}

/** Rolls a drop table straight into a player's pool; adds what it gave to `got` (resource, count). */
export function rollDrops(state: SimState, drops: readonly Drop[], player: number, got?: Map<number, number>): void {
  const ps = state.players[player];
  if (!ps) return;
  for (const [res, n] of rollDropList(state, drops, got).items) ps.pool[res] = ps.pool[res]! + n;
}

// ----- weapons and armour in the night's waves (Patch 5, GP-1) -----

/**
 * The night each kit tier is expected by (the balance harness's pacing
 * targets: bronze by night 4 to 6, wrought iron 13 to 18, steel 25 to 30,
 * muskets 40 to 48), by tier: a wave's dropped gear is of the best tier
 * players are expected to have by then (Jade: "at the tier players would be
 * expected the have then").
 */
export const GEAR_TIER_NIGHT: readonly number[] = [0, 1, 1, 3, 5, 15, 21, 27, 44];
/**
 * Gear a night's waves carry for each player, on average, per mille per
 * night (Jade, GP-1: "wave 5 giving an average of 0.2 weapons per player
 * ... and wave 50 giving an average of 2"): 40, so 0.04 a night, on at the
 * same slope past night 50.
 */
export const WAVE_GEAR_PM_PER_NIGHT = 40;

/** The tier of gear a night's waves drop. */
export function waveGearTier(night: number): number {
  let t = 0;
  for (let k = 0; k < GEAR_TIER_NIGHT.length; k++) if (GEAR_TIER_NIGHT[k]! <= night) t = k;
  return t;
}

/** What a night's waves may drop at a tier: each troop line's weapon, the armour, and the best shield the tier makes. */
function gearAtTier(tier: number): Res[] {
  const out: Res[] = [];
  for (const table of [CLOSE_KITS, LONG_KITS, RANGER_KITS, ARMOUR_KITS]) {
    const item = table[tier]?.items[0];
    if (item !== undefined) out.push(item);
  }
  let shield: Res | undefined;
  for (const s of SHIELD_KITS) if (s.tier > 0 && s.need <= tier) shield = s.items[0];
  if (shield !== undefined) out.push(shield);
  return out;
}

/**
 * Gives some of a player's planned mobs tonight a weapon, armour or shield
 * to carry, dropped as loot when one is killed (Patch 5, GP-1): on average
 * 0.04 a night per player, so a single player at night 5 sees one about one
 * night in five. How many, what and who carries it come from a hash of the
 * world seed, the night and the player, not from a random stream, so the
 * night's mobs come as they always did.
 */
export function giveWaveGear(state: SimState, planned: PendingSpawn[], player: number, night: number): void {
  if (planned.length === 0) return;
  const pm = WAVE_GEAR_PM_PER_NIGHT * night;
  const n = floorDiv(pm, 1000) + (hash32(state.seed, GEAR_SALT, night, player) % 1000 < pm % 1000 ? 1 : 0);
  const kinds = gearAtTier(waveGearTier(night));
  if (kinds.length === 0) return;
  for (let k = 0; k < n; k++) {
    const h = hash32(state.seed, GEAR_SALT, night, player, k + 1);
    const s = planned[h % planned.length]!;
    // One piece a mob: a second for the same mob goes to the next one along.
    let at = planned.indexOf(s);
    for (let tries = 0; tries < planned.length && planned[at]!.gear !== 0; tries++) at = (at + 1) % planned.length;
    if (planned[at]!.gear !== 0) return;
    planned[at]!.gear = kinds[floorDiv(h, 65536) % kinds.length]!;
  }
}

/** Salt for the wave gear hash ("gear"). */
const GEAR_SALT = 0x67656172;
