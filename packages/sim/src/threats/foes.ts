// What the daytime foes do each step (Lairs; Hostile tribes; Goblin
// villages): a lair's residents keep to their lair, a tribe's band roams,
// chases what it sees and camps at dusk, and a goblin village's people guard
// their ground or, at war, march on the players' nearest building. The
// moving and striking is the night mobs' (combat/mob-ai.ts); this file only
// decides what each one goes for.

import { buildingCentre, dist2, isLit } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { clockOf, Period } from '../clock.ts';
import { length2d, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { OrderKind, type SimState } from '../state.ts';
import { gap } from '../combat/combat.ts';
import { attackBuilding, beginSpell, engageUnit, mobHooks, playerUnit, SpellWith, walkMob } from '../combat/mob-ai.ts';
import { Mob, type MobSpec } from '../combat/mobs.ts';
import { Ability, ABILITIES, canUse, spend } from './abilities.ts';
import { LAIR_AGGRO_WU, LAIR_LEASH_WU, TRIBE_SIGHT_WU, VILLAGE_AGGRO_WU, VILLAGE_CHASE_WU, HUT_RING_WU } from './data.ts';
import { throughFog } from './fog.ts';
import { Role, type TribeBand, type Village } from './types.ts';
import { peoplesHooks } from '../peoples/hooks.ts';
import { runWild } from './wanderers.ts';

const M = WU_PER_METRE;
/** A foe that was hurt goes for its attacker for this long. */
const PROVOKED_STEPS = 5 * STEPS_PER_SECOND;
/** Raiders put out the lights they pass within this distance (s). */
const RAID_LIGHT_WU = 15 * M;
/** A raider fights the players' units within this distance of it on the way (s). */
const RAID_FIGHT_WU = 12 * M;
/** Kobolds go for lit torches within their sight (Table 16; Table 18: kobolds). */
const KOBOLD_TORCH_WU = TRIBE_SIGHT_WU;

/** The players' unit that hurt a foe in the last 5 s, if it is still there; -1 for none. */
export function provoker(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.attacker[i] || state.step - e.hurtAt[i]! > PROVOKED_STEPS) return -1;
  const a = e.indexOf(e.attacker[i]!);
  return a >= 0 && playerUnit(state, a) ? a : -1;
}

/** The nearest of the players' units within a radius of a point (ties to the lowest id); -1 for none. */
export function nearestPlayerUnit(state: SimState, x: number, z: number, r: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.nearOthers(x, z, r)) {
    if (!playerUnit(state, j)) continue;
    const d = length2d(e.x[j]! - x, e.z[j]! - z);
    if (d > r) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** The nearest of the players' buildings to a point that passes a filter, within a radius (0 for any distance); undefined for none. */
export function nearestBuilding(state: SimState, x: number, z: number, r: number, filter: (b: Building) => boolean): Building | undefined {
  let best: Building | undefined;
  let bestD = 0;
  const r2 = r > 0 ? r * r : Number.MAX_VALUE;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length || b.hp <= 0 || !filter(b)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, x, z);
    if (d > r2 || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Stands at its post: walks back there and waits. */
function goHome(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  e.target[i] = 0;
  if (walkMob(state, i, spec, e.homeX[i]!, e.homeZ[i]!)) e.order[i] = OrderKind.Idle;
}

// ----- lair residents -----

/** A lair's guardian or woken sleeper: wakes to what comes within 12 m, chases it no farther than 30 m from the lair, then goes back. */
function runResident(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const lx = e.homeX[i]!;
  const lz = e.homeZ[i]!;
  const leash = (j: number): boolean => length2d(e.x[j]! - lx, e.z[j]! - lz) <= LAIR_LEASH_WU;
  let t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t >= 0 && (!playerUnit(state, t) || !leash(t))) t = -1;
  if (t < 0) {
    const a = provoker(state, i);
    if (a >= 0 && leash(a)) t = a;
  }
  if (t < 0) t = nearestPlayerUnit(state, e.x[i]!, e.z[i]!, throughFog(state, LAIR_AGGRO_WU));
  if (t >= 0 && leash(t)) {
    engageUnit(state, i, spec, t);
    return;
  }
  goHome(state, i, spec);
}

// ----- hostile tribes -----

export function bandOf(state: SimState, id: number): TribeBand | undefined {
  return state.threats.bands.find((b) => b.id === id);
}

/**
 * A tribesman: the band's quarry if it has one (chased anywhere until no
 * one has seen it for 20 s), else whatever of the players' it sees within
 * 30 m; kobolds go for lit torches and the rest break buildings they come
 * on; otherwise it walks with the band. At dusk the band camps and fights
 * only what attacks it.
 */
function runTribesman(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const band = bandOf(state, e.group[i]!);
  if (!band) {
    goHome(state, i, spec);
    return;
  }
  const sight = throughFog(state, TRIBE_SIGHT_WU);
  const a = provoker(state, i);
  if (band.camp) {
    if (a >= 0) {
      band.target = e.id[a]!;
      band.sawAt = state.step;
      engageUnit(state, i, spec, a);
      return;
    }
    const k = e.id[i]! % 8;
    const off = 3 * M;
    const x = band.campX + (k & 1 ? off : -off) * ((k >> 1) & 1);
    const z = band.campZ + (k & 2 ? off : -off) * ((k >> 2) & 1);
    goTo(state, i, spec, x, z);
    return;
  }
  let t = band.target ? e.indexOf(band.target) : -1;
  if (t >= 0 && !playerUnit(state, t)) {
    band.target = 0;
    t = -1;
  }
  if (a >= 0 && (t < 0 || gap(state, i, a) < gap(state, i, t))) t = a;
  if (t < 0) t = nearestPlayerUnit(state, e.x[i]!, e.z[i]!, sight);
  if (t >= 0) {
    if (band.target !== e.id[t]) band.sawAt = state.step;
    band.target = e.id[t]!;
    if (gap(state, i, t) <= sight) band.sawAt = state.step;
    engageUnit(state, i, spec, t);
    return;
  }
  const torch = spec.id === Mob.Kobold ? nearestBuilding(state, e.x[i]!, e.z[i]!, KOBOLD_TORCH_WU, isLit) : undefined;
  const b = torch ?? (spec.vsWalls > 0 ? nearestBuilding(state, e.x[i]!, e.z[i]!, sight, () => true) : undefined);
  if (b) {
    attackBuilding(state, i, spec, b);
    return;
  }
  const k = e.id[i]! % 6;
  goTo(state, i, spec, band.x + (k - 3) * M, band.z + ((k * 7) % 5 - 2) * M);
}

function goTo(state: SimState, i: number, spec: MobSpec, x: number, z: number): void {
  if (walkMob(state, i, spec, x, z)) state.entities.order[i] = OrderKind.Idle;
}

// ----- goblin villages -----

export function villageOf(state: SimState, id: number): Village | undefined {
  return state.threats.villages.find((v) => v.id === id);
}

/**
 * A village goblin. At home it attacks anything within 25 m of the stake
 * ring and chases it 40 m past the ring before going back. A raider (act 1)
 * marches on the nearest building of the side its village is at war with,
 * putting out the lights it passes and fighting what stands in its way.
 * Goblin mages hex what they fight, snuff lights and toss sparks.
 */
function runVillager(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const v = villageOf(state, e.group[i]!);
  if (!v) {
    goHome(state, i, spec);
    return;
  }
  const a = provoker(state, i);
  if (e.act[i] === 1) {
    const enemy = raidFoe(v);
    if (enemy < 0) {
      e.act[i] = 0;
    } else {
      let t = a >= 0 ? a : nearestPlayerUnit(state, e.x[i]!, e.z[i]!, throughFog(state, RAID_FIGHT_WU));
      // Raiders fight the side they are at war with, and whoever attacks them.
      if (t >= 0 && t !== a && e.owner[t] !== enemy) t = -1;
      if (t >= 0) {
        if (spec.mana > 0 && magic(state, i, t)) return;
        engageUnit(state, i, spec, t);
        return;
      }
      const light = nearestBuilding(state, e.x[i]!, e.z[i]!, RAID_LIGHT_WU, (b) => b.owner === enemy && isLit(b));
      if (light) {
        if (spec.mana > 0 && snuffNear(state, i, light)) return;
        attackBuilding(state, i, spec, light, true);
        return;
      }
      const goal = nearestBuilding(state, v.x, v.z, 0, (b) => b.owner === enemy);
      if (goal) {
        if (spec.mana > 0 && sparkNear(state, i, goal)) return;
        attackBuilding(state, i, spec, goal);
        return;
      }
      e.act[i] = 0;
    }
  }
  const near = (j: number, r: number): boolean => length2d(e.x[j]! - v.x, e.z[j]! - v.z) <= r;
  let t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t >= 0 && (!playerUnit(state, t) || !near(t, VILLAGE_CHASE_WU))) t = -1;
  if (t < 0 && a >= 0 && near(a, VILLAGE_CHASE_WU)) t = a;
  if (t < 0) t = nearestPlayerUnit(state, v.x, v.z, throughFog(state, VILLAGE_AGGRO_WU));
  if (t >= 0) {
    if (spec.mana > 0 && magic(state, i, t)) return;
    engageUnit(state, i, spec, t);
    return;
  }
  // A mage at home snuffs the players' lights that come near the village.
  if (spec.mana > 0) {
    const light = nearestBuilding(state, v.x, v.z, VILLAGE_AGGRO_WU, isLit);
    if (light && snuffNear(state, i, light)) return;
  }
  // Home: by day about the huts, at night by the fire.
  const night = clockOf(state).period === Period.Night;
  if (night && length2d(e.x[i]! - v.x, e.z[i]! - v.z) > HUT_RING_WU) {
    goTo(state, i, spec, v.x + ((e.id[i]! % 5) - 2) * M, v.z + ((e.id[i]! % 3) - 1) * M);
    return;
  }
  goHome(state, i, spec);
}

/** The player a village's raid goes against: the lowest-numbered one it is at war with that is still in, or -1. */
export function raidFoe(v: Village): number {
  if (v.war === 0) return -1;
  for (let p = 0; p < 8; p++) if (v.war & (1 << p)) return p;
  return -1;
}

/**
 * A goblin mage's spells against a unit: Stumble hex when it is not hexed
 * already. Returns true when it began casting. Spells are cast over 40% of
 * its attack time, standing (combat/mob-ai.ts beginSpell); the mana goes
 * when the cast begins, so a Counterspell stops the hex but not the cost.
 */
function magic(state: SimState, i: number, t: number): boolean {
  const e = state.entities;
  if (e.hexUntil[t]! > state.step || !canUse(state, i, Ability.StumbleHex) || gap(state, i, t) > ABILITIES[Ability.StumbleHex]!.range) return false;
  spend(state, i, Ability.StumbleHex);
  beginSpell(state, i, e.id[t]!, SpellWith.Hex);
  return true;
}

function snuffNear(state: SimState, i: number, b: Building): boolean {
  const e = state.entities;
  const [x, z] = buildingCentre(b);
  if (!canUse(state, i, Ability.Snuff) || length2d(x - e.x[i]!, z - e.z[i]!) > ABILITIES[Ability.Snuff]!.range) return false;
  spend(state, i, Ability.Snuff);
  beginSpell(state, i, b.id, SpellWith.Snuff);
  return true;
}

/** Spark toss at a building: it pays when the spark flies (castSparkAtBuilding), as at a unit. */
function sparkNear(state: SimState, i: number, b: Building): boolean {
  const e = state.entities;
  const [x, z] = buildingCentre(b);
  if (!canUse(state, i, Ability.SparkToss) || length2d(x - e.x[i]!, z - e.z[i]!) > ABILITIES[Ability.SparkToss]!.range) return false;
  beginSpell(state, i, b.id, SpellWith.Spark);
  return true;
}

function runFoe(state: SimState, i: number, spec: MobSpec): void {
  const role = state.entities.role[i]!;
  if (role === Role.Resident) runResident(state, i, spec);
  else if (role === Role.Tribe) runTribesman(state, i, spec);
  else if (role === Role.Village) runVillager(state, i, spec);
  else if (role === Role.People) peoplesHooks.wagon(state, i, spec);
  else if (role === Role.Wild) runWild(state, i, spec);
}

export function installFoes(): void {
  mobHooks.foe = runFoe;
}
