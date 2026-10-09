// The necromancer (Jade's Patch 5, MB-5): "The necromancer spawns with every
// 10th wave of monsters, starting with 10. After wave 40, it spawns with
// every 5 waves instead. The necromancer is not a part of the threat level
// calculation re waves, he is an added threat on top of them. It tapers from
// 40 so that by 60 he comes in every other wave, and by 90 he is in every
// wave from there on." One comes for each player on those nights (in their
// share of the night, so not on their Bright Night), out of the dark edge
// with the waves, and burns at dawn with the rest (decisions, question 7).
// He summons 9 or 10 skeleton archers and zombies "as soon as the
// necromancer is seen by a players units or buildings", then every 60 s;
// his crimson bolt (combat/items.ts Shot.NecroBolt) does 35 to whoever it
// strikes and 35 to all within 0.5 m of it, every 10 s; he speaks as he
// summons and as he attacks, in bubbles that stay 20 s. His drops are his
// own (necromancerLoot). His row is in combat/mobs.ts.

import { clockAt } from '../clock.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { forward } from '../combat/combat.ts';
import { addMob, inheritRole } from '../combat/mob-ai.ts';
import { Mob, type MobSpec } from '../combat/mobs.ts';
import { isAnyRes } from '../economy/food-kinds.ts';
import { Res } from '../economy/resources.ts';
import { forgeStepOf } from '../buildings/production.ts';
import { hash32 } from '../rng.ts';
import { footprintWu, isGod, seesForSide, sightOf, buildingSight, type SimState } from '../state.ts';
import { ARMOUR_KITS, CLOSE_KITS, TIER_NEEDS, TOP_TIER } from '../units/kits.ts';
import type { Rolled } from './loot.ts';
import { Role } from './types.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

/** His numbers (s: picks, in blueprint/patch5-mobs-picks.md). */
export const NECROMANCER = {
  /** Jade: a summons every 60 s, each 9 or 10 mobs, half skeleton archers and half zombies. */
  summonSteps: 60 * SEC,
  summonMin: 9,
  summonMax: 10,
  /** They rise in a ring this many metres round him (s). */
  ringM: 3,
  /** Jade: his bubbles stay 20 s, unless he says something else first (client hud/bubbles.ts 'linger'). */
  bubbleS: 20,
  /** His drops (Jade): 2 to 4 weapons or armours of tier 3 to 5, or up to the highest a player can make when that is higher... */
  gearMin: 2,
  gearMax: 4,
  gearLowTier: 3,
  gearHighTier: 5,
  /** ...1 to 5 ingots of one kind... */
  ingotMin: 1,
  ingotMax: 5,
  /** ...2 to 8 bones, and a mana crystal one time in ten (per mille). */
  boneMin: 2,
  boneMax: 8,
  crystalPm: 100,
};

/** The ingots one of his drops can be (s): the forge's working metals, not silver, gold or carbon steel. */
export const NECROMANCER_INGOTS: readonly Res[] = [Res.CopperIngot, Res.TinIngot, Res.BronzeIngot, Res.WroughtIron, Res.PigIron, Res.IronIngot, Res.SteelIngot];

/** Whether a necromancer comes with a night's waves (decisions 3.4: 10, 20, 30, 40, then every 5th to 60, every 2nd from 60, and every night from 90). */
export function necromancerNight(night: number): boolean {
  if (night < 10) return false;
  if (night <= 40) return night % 10 === 0;
  if (night <= 60) return night % 5 === 0;
  if (night < 90) return night % 2 === 0;
  return true;
}

const SUMMON_LINES: readonly string[] = [
  'Rise, my servants. There is warm flesh nearby.',
  'The dead answer to me. Up, all of you!',
  'Your graves were never yours to keep. Rise!',
  'Bones, to me! Archers, nock your arrows!',
  'Come up from the cold earth and feast.',
];

const ATTACK_LINES: readonly string[] = [
  'Wither.',
  'Feel the cold of the grave.',
  'Your blood will feed the crimson.',
  'Kneel, and rot.',
  'Soon you will serve me too.',
];

/** Not state: the attack each necromancer last spoke at (its next attack's step), so he speaks once an attack. */
const spokeAt = new WeakMap<SimState, Map<number, number>>();

/** He speaks: a bubble over him for every player who sees it, staying 20 s (Jade). */
function speak(state: SimState, i: number, lines: readonly string[]): void {
  const e = state.entities;
  const text = lines[(hash32(state.seed, e.id[i]!, state.step) >>> 0) % lines.length]!;
  state.events.push({ player: -1, kind: 'speech', text, speaker: e.id[i]!, name: 'Necromancer', foreign: true, important: false, near: 0, quiet: true, hold: 'linger', x: e.x[i]!, z: e.z[i]! });
}

/** Whether any player's unit or building sees a point now (state.ts visionSources, read straight off the units and buildings). */
export function seenByPlayers(state: SimState, x: number, z: number): boolean {
  const e = state.entities;
  for (const j of state.grid.near(x, z, 40 * M)) {
    if (!seesForSide(state, j)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) <= sightOf(state, j)) return true;
  }
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const [x0, z0, x1, z1] = footprintWu(b);
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    const r = buildingSight(state, b);
    if (dx <= r && dz <= r && dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

/** His summons: 9 or 10, each a skeleton archer or a zombie by a coin toss, in a ring round him; they go where he goes. */
function summon(state: SimState, i: number): void {
  const e = state.entities;
  const rng = state.rng.combat;
  const n = NECROMANCER.summonMin + rng.nextInt(NECROMANCER.summonMax - NECROMANCER.summonMin + 1);
  const r = NECROMANCER.ringM * M;
  const night = clockAt(state.step).cycle;
  for (let k = 0; k < n; k++) {
    const mob = rng.nextInt(2) === 0 ? Mob.SkeletonArcher : Mob.Zombie;
    const [fx, fz] = forward(floorDiv(k * 65536, n));
    const j = addMob(state, mob, e.foe[i]!, e.x[i]! + floorDiv(fx * r, 65536), e.z[i]! + floorDiv(fz * r, 65536), night);
    inheritRole(state, i, j);
    if (e.role[i] === Role.Aimed) {
      e.role[j] = Role.Aimed;
      e.homeX[j] = e.homeX[i]!;
      e.homeZ[j] = e.homeZ[i]!;
    }
    state.hits.push({ look: 'crimson', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: e.id[j]! });
  }
  state.hits.push({ look: 'summon', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

/**
 * What a necromancer does before he fights (combat/mob-ai.ts lateHooks.act,
 * through threats/late-mobs.ts): his summons, the first once a player sees
 * him (e.abilityAt is 0 until then), and his word as each attack begins.
 * Never takes the step: he goes on to fight as any shooter does.
 */
export function necromancerAct(state: SimState, i: number, _spec: MobSpec, _t: number): boolean {
  const e = state.entities;
  const now = state.step;
  if (e.abilityAt[i] === 0) {
    // Looked for once a second (s).
    if ((now + e.id[i]!) % SEC === 0 && seenByPlayers(state, e.x[i]!, e.z[i]!)) {
      summon(state, i);
      speak(state, i, SUMMON_LINES);
      e.abilityAt[i] = now + NECROMANCER.summonSteps;
    }
  } else if (now >= e.abilityAt[i]!) {
    summon(state, i);
    speak(state, i, SUMMON_LINES);
    e.abilityAt[i] = now + NECROMANCER.summonSteps;
  }
  // An attack under way (begun at its next attack's step less his attack time): he speaks once for it.
  if (e.atkAt[i] !== 0 && e.atkNext[i]! > now) {
    let m = spokeAt.get(state);
    if (!m) {
      m = new Map();
      spokeAt.set(state, m);
    }
    if (m.get(e.id[i]!) !== e.atkNext[i]) {
      m.set(e.id[i]!, e.atkNext[i]!);
      if (m.size > 1024) m.clear();
      speak(state, i, ATTACK_LINES);
    }
  }
  return false;
}

/** The highest kit tier a player can make now: each tier's Forge step and research (units/kits.ts TIER_NEEDS); godmode all. */
export function topKitTier(state: SimState, player: number): number {
  const p = state.players[player];
  if (!p) return 0;
  if (isGod(state, player)) return TOP_TIER;
  const forge = forgeStepOf(state, player);
  let top = 0;
  for (const t of TIER_NEEDS) if (t.forge <= forge && t.research.every((r) => (p.research & (1 << r)) !== 0)) top = Math.max(top, t.tier);
  return top;
}

/**
 * What one of his weapon or armour drops is, as loot. Until gear can lie on
 * the ground as an item (the Gear thread's GP-1), a weapon or armour in
 * plunder comes as the materials that made it, as a goblin's club does
 * (threats/loot.ts): the close-melee weapon or the armour of that tier,
 * its first way of paying, less any "either lumber". The Gear thread sets
 * this hook to drop the piece itself.
 */
export const necromancerHooks = {
  gear: (_state: SimState, tier: number, armour: boolean): Array<[number, number]> => {
    const kit = armour ? ARMOUR_KITS[tier] : CLOSE_KITS[tier];
    const cost = kit?.cost[0] ?? [];
    return cost.filter(([r]) => !isAnyRes(r)).map(([r, n]) => [r, n] as [number, number]);
  },
};

/** His drops for the player who killed him, on the 'combat' stream (Jade's MB-5). */
export function necromancerLoot(state: SimState, player: number): Rolled {
  const rng = state.rng.combat;
  const n = NECROMANCER;
  const out: Rolled = { items: [], rarestPm: n.crystalPm };
  const top = Math.max(n.gearHighTier, Math.min(TOP_TIER, topKitTier(state, player)));
  const pieces = n.gearMin + rng.nextInt(n.gearMax - n.gearMin + 1);
  for (let k = 0; k < pieces; k++) {
    const tier = n.gearLowTier + rng.nextInt(top - n.gearLowTier + 1);
    out.items.push(...necromancerHooks.gear(state, tier, rng.nextInt(2) === 1));
  }
  out.items.push([NECROMANCER_INGOTS[rng.nextInt(NECROMANCER_INGOTS.length)]!, n.ingotMin + rng.nextInt(n.ingotMax - n.ingotMin + 1)]);
  out.items.push([Res.Bone, n.boneMin + rng.nextInt(n.boneMax - n.boneMin + 1)]);
  if (rng.nextInt(1000) < n.crystalPm) out.items.push([Res.ManaCrystal, 1]);
  return out;
}
