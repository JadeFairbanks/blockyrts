// The stone circles' keepers (Jade's Patch 5): the Great White Ape of a Lunar
// Circle (SCA-1 to SCA-4), Silenus and his band of satyrs (SCS-1 to SCS-5)
// and the Lich with his necromancers and skeletons (SCB-1 to SCB-3).
//
// Each circle's keepers come when one of the players' units first comes
// within 60 m of its middle, and never come back once killed: the circle's
// Encounter record in state.threats.encounters stays. Its members are mobs of
// Role.Encounter whose home is the circle's middle.
//
// The Ape is at peace with the players and tends his Goddess's garden: he
// plants flowers and fruit trees, worships at the altar and drives monsters
// off the grounds. Picking fruit he watches. Cutting down a Sweet Hawthorne,
// taking from a chest or breaking a trilithon brings his warning, "Do not
// dare to defile the circle!": "I will do what I want!" and he rages, "Sorry!"
// and he stands down, but wronging the circle again after a Sorry is rage at
// once. Taking the idol is rage at once. Raging, he runs down that player's
// units on the grounds, leaps in with a thunderclap and throws them; after
// two minutes of fighting in all he is sworn against them for good and goes
// for their bases, workers first. At peace he sells his fruit, honey and wine.
//
// Silenus and his satyrs revel until a player attacks them or loots their
// circle (Jade's answer 8); then they hunt that player's units on the grounds,
// and go for them whenever they come near again. Silenus lashes with thorns,
// roots a unit in place, and once in five days becomes a sabretooth tiger who
// gives back Silenus as he was when it falls. The Trickster vanishes and
// comes back at the weakest of them; the Reveler lashes too.
//
// The Lich is hostile to every player: once one of the players sees him he
// speaks, his five necromancers each raise their skeletons once, and they
// fight. He gives up a follower's life for his own (Sacrificial Rite), and his
// Acrid Wind may bring Touch of the Grave, which spreads.
//
// Lines are in threats/encounter-lines.ts, what lies on units in
// threats/marks.ts, the Headless God Idol's waves in threats/headless.ts, and
// every number not Jade's is a pick (s) in blueprint/patch5-mobs-picks.md.

import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { dealtTenths, deathHooks, forward, gap, hurtUnit, peaceHooks, rollDamage, Side, sideOf } from '../combat/combat.ts';
import { Shot } from '../combat/items.ts';
import { addMob, attackBuilding, engageUnit, explode, lateHooks, walkMob } from '../combat/mob-ai.ts';
import { blowRollBp, blowTenths, bomber, Mob, mobSpec, type MobSpec } from '../combat/mobs.ts';
import { shotHooks } from '../combat/projectiles.ts';
import { Res } from '../economy/resources.ts';
import { WALKER } from '../nav/grid.ts';
import type { AnswerOrder } from '../orders.ts';
import { questTimerHooks } from '../peoples/quests.ts';
import { sayForeign } from '../peoples/speech.ts';
import { hash32 } from '../rng.ts';
import { CYCLE_STEPS, DAMAGE_ROLL } from '../rules.ts';
import { DamageKind, landAt, MONSTERS, OrderKind, standY, UnitKind, type SimState } from '../state.ts';
import { answerKinds, askForever, asksOf, closeAsksBy } from '../units/questions.ts';
import { Troop } from '../units/kits.ts';
import { CircleProp, CircleType, CLEARING_M } from '../circles/data.ts';
import { circleHooks, Disturb, type ApeView } from '../circles/disturb.ts';
import { circleSite, circleSites, pieceVariant, type CircleSite } from '../circles/place.ts';
import { plantHawthorne, plantSpotProblem } from '../circles/trees.ts';
import { PropKind } from '../world/props.ts';
import { nearestBuilding } from './foes.ts';
import { APE_ASK, APE_LINES, LICH_LINES, SATYR_LINES, SILENUS_LINES } from './encounter-lines.ts';
import { headlessBlow, headlessRows } from './headless.ts';
import { dropMark, MarkKind, markOn, putMark } from './marks.ts';
import { seenByPlayers } from './necromancer.ts';
import { Role, type Encounter } from './types.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;
const COL = WU_PER_COLUMN;

/** What a circle's keepers are doing: at peace, the Ape watching a fruit picker, his warning up, fighting, and the Ape sworn against a player for good. */
export const EncounterMode = { Calm: 0, Watching: 1, Warning: 2, Fighting: 3, Rampage: 4 } as const;
export type EncounterMode = (typeof EncounterMode)[keyof typeof EncounterMode];

/** The Ape's warning (units/questions.ts: Ask keeps 1 to 9, GreyAsk 10 to 15, night work 16, WorkAsk 17 to 19, the Barn hand 24, the keepers 27 and 28, the Workshop 30). */
export const EncounterAsk = { Warn: 29 } as const;

/** Their numbers: Jade's where she gave them, the rest picks (s), in blueprint/patch5-mobs-picks.md. */
export const ENCOUNTERS = {
  /** They come when one of the players' units first comes within this many metres of the circle's middle, looked for every 2 s (s, as the keepers'). */
  wakeM: 60,
  wakeEverySteps: 2 * SEC,
  /** The circle's grounds: its 60 m clearing (SC-2). They chase no farther than this from its middle (s). */
  groundsM: CLEARING_M,
  leashM: 80,
  /** A fight is over once none of their foes has been on the grounds for this long (s). */
  calmAfterS: 20,
  ape: {
    /** SCA-3: "If you pick some fruit he will watch you, but not warn you": this long (s). */
    watchS: 6,
    /** A greeting to the players' units on the grounds within this many metres of him, at most once in this long (s). */
    greetM: 30,
    greetGapS: 40,
    /** SCA-2: "He plants flowers and fruit trees sparsely around bare ground in the circle": one every 2 to 4 minutes, at most 12, within 8 to 30 m of the middle, one in four a Sweet Hawthorne (s). */
    plantS: [120, 240] as const,
    plantMax: 12,
    plantMinM: 8,
    plantMaxM: 30,
    hawthorneEvery: 4,
    /** He gives up on a spot he cannot reach in this long (s). */
    plantWalkS: 40,
    /** He worships at the altar about every 30 s while the players' units are within 40 m of it (s); his clip is 4 s. */
    worshipEveryS: 30,
    worshipNearM: 40,
    worshipSteps: 4 * SEC,
    /** Raging he runs (s: 2.7 m/s on his 1.8): haste, basis points. */
    runBp: 15000,
    /** SCA-2: "engage him in fights for long enough he may become permanently enraged": two minutes of fighting in all (s). */
    swornAfterS: 120,
    /** A taunt now and then while he rages (s). */
    tauntS: [8, 14] as const,
    /** SCA-2's [thunderclap]: "deals 5-10 dmg to the hp of all units in the 6 metre radius". He leaps at a foe 8 to 20 m off every 15 s (s), 1.2 s in the air after a 0.4 s crouch (his clip is 2.2 s). */
    leap: { minM: 8, maxM: 20, everyS: 15, crouchSteps: floorDiv(2 * SEC, 5), flightSteps: floorDiv(6 * SEC, 5), clipSteps: floorDiv(11 * SEC, 5), radiusM: 6, min: 5, max: 10, peakM: 4 },
    /** SCA-2's [grab enemy]: "toss them up to 30 metres away. Dealing 5 dmg per 10 metres": human units in his reach, every 18 s, thrown 12 to 30 m at 20 m/s, after 1.1 s in his hands (his clip is 2.3 s) (s). */
    toss: { everyS: 18, minM: 12, maxM: 30, holdSteps: floorDiv(11 * SEC, 10), clipSteps: floorDiv(23 * SEC, 10), metresPerSecond: 20, perTenMetres: 5, rollBp: DAMAGE_ROLL.physicalBp },
    /** SCA-2: "you can buy Sweet Hawthorne Fruit, Honey, enchanted wine from him": a bundle for a silver, 3 bundles of each a day (s). */
    goods: { fruit: 5, honey: 3, wine: 1, perDay: 3, silver: 1 },
  },
  silenus: {
    /** The satyrs with him: Tier II, Tricksters and Revelers; Tier III (s). */
    band: [
      [2, 2],
      [3, 3],
    ] as const,
    /** They revel every 20 to 40 s while the players' units are within 30 m (s). */
    revelS: [20, 40] as const,
    revelM: 30,
    /** Answer 8: they go for those who wronged them whenever they come this near the middle again (s). */
    grudgeM: 30,
    /** SCS-3, SCS-4: the lash "can reach 10 m ... for 30 dmg", "his deals 10 more dmg"; every 12 s (s). */
    lash: { m: 10, damage: 40, everyS: 12, castSteps: SEC, rollBp: DAMAGE_ROLL.magicBp },
    /** SCS-4: [entangling roots] "hold a target enemy unit in place for 20 seconds ... only once every two minutes", at up to 20 m (s). */
    roots: { m: 20, holdS: 20, everyS: 120, castSteps: 2 * SEC },
    /** SCS-5: "only do this transformation once every five days": when he is down to half his health (s). */
    tiger: { belowPct: 50, everyDays: 5, clipSteps: floorDiv(9 * SEC, 5) },
    /** SCS-5: "can [leap] up to 20 m": at a foe 6 to 20 m off every 10 s, 0.8 s in the air (s). */
    tigerLeap: { minM: 6, maxM: 20, everyS: 10, crouchSteps: floorDiv(3 * SEC, 10), flightSteps: floorDiv(4 * SEC, 5), clipSteps: floorDiv(9 * SEC, 5), peakM: 3 },
    fightS: [10, 16] as const,
  },
  satyr: {
    /** SCS-2: "vanishes and turns invisible for 10 seconds ... seeks out ... the weakest and lowest HP enemy": every 25 s, among their foes within 30 m (s). */
    vanishS: 10,
    vanishEveryS: 25,
    seekM: 30,
    /** SCS-3: the Reveler's lash, "reach 10 m ... 30 dmg"; every 12 s (s). */
    lash: { m: 10, damage: 30, everyS: 12, castSteps: SEC, rollBp: DAMAGE_ROLL.magicBp },
    /** Revelers drink now and then while they revel (s). */
    drinkS: [15, 30] as const,
  },
  lich: {
    /** SCB-1: "commands 5 necromancers and up to 10 skeletons of all types": each necromancer raises two once, the archers, barrow knights and bombers in turn (s). */
    necromancers: 5,
    raised: [Mob.SkeletonArcher, Mob.SkeletonArcher, Mob.SkeletonArcher, Mob.SkeletonArcher, Mob.BarrowKnight, Mob.BarrowKnight, Mob.BarrowKnight, Mob.BarrowKnight, Mob.SkeletonBomber, Mob.SkeletonBomber],
    /** They stand round him this far out (s). */
    ringM: 9,
    /** SCB-2: [Sacrificial Rite], "will prioritize its own survival": below 60% of his health, on the follower with the most health within 20 m, every 15 s (s). */
    ritePct: 60,
    riteM: 20,
    riteS: 15,
    riteSteps: floorDiv(16 * SEC, 5),
    /** SCB-2: [Touch of the Grave], "3 dmg every 5 seconds but cannot drop under 2 HP ... spread ... up to 5 metres away": 3 Acrid Wind hits in 10 bring it, it lasts 60 s, and it passes to an ally within 5 m one tick in four (s). */
    gravePm: 300,
    grave: { damage: 3, everyS: 5, floor: 2, lastS: 60, spreadM: 5, spreadPm: 250, rollBp: DAMAGE_ROLL.magicBp },
    quipS: [12, 20] as const,
  },
} as const;

/** Every encounter's circle middle by circle (not state: the circles a seed makes never change). */
function siteOf(state: SimState, r: Encounter): CircleSite {
  return circleSite(state.world.layout, r.circle)!;
}

/** One of a circle's lines, the same on every machine. */
function pick<T>(state: SimState, r: Encounter, lines: readonly T[], salt: number): T {
  return lines[hash32(state.seed ^ 0x656e63, r.circle, state.step, salt) % lines.length]!;
}

/** A step within a range of seconds from now, the same on every machine. */
function within(state: SimState, r: Encounter, [lo, hi]: readonly [number, number], salt: number): number {
  return state.step + lo * SEC + (hash32(state.seed ^ 0x77686e, r.circle, state.step, salt) % ((hi - lo) * SEC + 1));
}

/** One of the players' own units, alive and outside (the peoples' are not the circles' business). */
function playersOwn(state: SimState, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.inside[j] === 0 && sideOf(state, j) === Side.Players && e.kind[j] !== UnitKind.Animal;
}

/** A monster a keeper drives off: a living one of the night's, not one of the circles' keepers and not a lair or hut. */
function strayMonster(state: SimState, j: number): boolean {
  const e = state.entities;
  if (e.hp[j]! <= 0 || e.kind[j] !== UnitKind.Mob || e.owner[j] !== MONSTERS || e.role[j] === Role.Encounter) return false;
  const spec = mobSpec(e.mob[j]!);
  return spec.role !== Role.Structure && spec.id !== Mob.BombKeg;
}

function bit(player: number): number {
  return 1 << player;
}

/** Every player still in, as bits. */
function everyone(state: SimState): number {
  let bits = 0;
  for (let p = 0; p < state.players.length; p++) if (!state.players[p]!.out) bits |= bit(p);
  return bits;
}

/** The encounter a member belongs to (its home is its circle's middle), or undefined. */
export function encounterOf(state: SimState, i: number): Encounter | undefined {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || e.role[i] !== Role.Encounter) return undefined;
  for (const r of state.threats.encounters) {
    const s = siteOf(state, r);
    if (s.x === e.homeX[i] && s.z === e.homeZ[i]) return r;
  }
  return undefined;
}

/** A circle's encounter, or undefined. */
function encounterAt(state: SimState, circle: number): Encounter | undefined {
  return state.threats.encounters.find((r) => r.circle === circle);
}

/** The members of an encounter alive now, by index (lowest id first). */
function membersOf(state: SimState, r: Encounter): number[] {
  const e = state.entities;
  const s = siteOf(state, r);
  const out: number[] = [];
  for (const j of state.grid.near(s.x, s.z, (ENCOUNTERS.leashM + 40) * M)) {
    if (e.hp[j]! > 0 && e.kind[j] === UnitKind.Mob && e.role[j] === Role.Encounter && e.homeX[j] === s.x && e.homeZ[j] === s.z) out.push(j);
  }
  // The Ape on a rampage is far from home: he is the leader, looked up by id.
  const l = r.leader ? e.indexOf(r.leader) : -1;
  if (l >= 0 && e.hp[l]! > 0 && !out.includes(l)) out.push(l);
  return out.sort((a, b) => e.id[a]! - e.id[b]!);
}

function distTo(state: SimState, j: number, x: number, z: number): number {
  return length2d(state.entities.x[j]! - x, state.entities.z[j]! - z);
}

/** A column's middle, wu. */
function wuOf(c: number): number {
  return c * COL + (COL >> 1);
}

/** Where a walker can stand at or round a point, wu: the point itself if none is found. */
function standNear(state: SimState, x: number, z: number): [number, number] {
  const gx = floorDiv(x, COL);
  const gz = floorDiv(z, COL);
  for (let d = 0; d <= 6; d++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        if (state.nav.standable(gx + dx, gz + dz, WALKER) && state.buildings.solidAt(gx + dx, gz + dz) === 0) return [wuOf(gx + dx), wuOf(gz + dz)];
      }
    }
  }
  return [x, z];
}

/** A point `d` wu from (x, z) in a heading. */
function out16(x: number, z: number, heading: number, d: number): [number, number] {
  const [fx, fz] = forward(heading & 0xffff);
  return [x + floorDiv(fx * d, 65536), z + floorDiv(fz * d, 65536)];
}

// ----- coming -----

function addMember(state: SimState, r: Encounter, s: CircleSite, mob: number, foe: number, x: number, z: number): number {
  const e = state.entities;
  const [sx, sz] = standNear(state, x, z);
  // Night 0: Jade's numbers as they stand, however late in the game they come.
  const i = addMob(state, mob, foe, sx, sz, 0);
  e.role[i] = Role.Encounter;
  e.homeX[i] = s.x;
  e.homeZ[i] = s.z;
  e.heading[i] = headingTowards(s.x - sx, s.z - sz);
  return i;
}

function newEncounter(s: CircleSite, step: number): Encounter {
  const g = ENCOUNTERS.ape.goods;
  return {
    circle: s.id, type: s.type, leader: 0, mode: EncounterMode.Calm, foes: 0, sworn: 0, warned: 0, sorry: 0, robbed: 0, unit: 0, next: step + 5 * SEC, still: 0, since: step, roam: 0,
    plantAt: step + 30 * SEC, fought: 0, planted: 0, planting: 0, quietSince: step, heldHp: 0, heldMax: 0, changed: 0, leapX0: 0, leapZ0: 0, leapX1: 0, leapZ1: 0, leapAt: 0, leapEnd: 0,
    leapNext: 0, toss: 0, tossX0: 0, tossZ0: 0, tossX1: 0, tossZ1: 0, tossAt: 0, tossEnd: 0, tossNext: 0, lashNext: 0, rootsNext: 0, riteNext: 0, fruit: g.perDay, honey: g.perDay,
    wine: g.perDay, day: Math.max(0, floorDiv(step, CYCLE_STEPS)),
  };
}

/** A circle's keepers come: the Ape by the altar, Silenus among his satyrs, the Lich among his necromancers (s: where they stand). */
function bring(state: SimState, s: CircleSite, foe: number): void {
  const r = newEncounter(s, state.step);
  state.threats.encounters.push(r);
  const ring = (k: number, n: number, m: number): [number, number] => out16(s.x, s.z, s.heading + floorDiv(k * 65536, n), m * M);
  if (s.type === CircleType.Lunar) {
    const [x, z] = ring(0, 1, 6);
    r.leader = state.entities.id[addMember(state, r, s, Mob.GreatWhiteApe, foe, x, z)]!;
  } else if (s.type === CircleType.Silenus) {
    const [x, z] = ring(0, 1, 4);
    r.leader = state.entities.id[addMember(state, r, s, Mob.Silenus, foe, x, z)]!;
    const [tricksters, revelers] = ENCOUNTERS.silenus.band[s.tier >= 3 ? 1 : 0]!;
    const n = tricksters + revelers;
    for (let k = 0; k < n; k++) {
      const [mx, mz] = ring(k, n, 9);
      addMember(state, r, s, k < tricksters ? Mob.SatyrTrickster : Mob.SatyrReveler, foe, mx, mz);
    }
  } else if (s.type === CircleType.Boneyard) {
    const [x, z] = ring(0, 1, 4);
    r.leader = state.entities.id[addMember(state, r, s, Mob.Lich, foe, x, z)]!;
    const l = ENCOUNTERS.lich;
    for (let k = 0; k < l.necromancers; k++) {
      const [mx, mz] = ring(k, l.necromancers, l.ringM);
      addMember(state, r, s, Mob.Necromancer, foe, mx, mz);
    }
  }
}

/** Every 2 s: each typed circle one of the players' units has come within 60 m of for the first time gets its keepers (none in a peaceful game). */
function wake(state: SimState): void {
  const e = state.entities;
  const reach = ENCOUNTERS.wakeM * M;
  for (const s of circleSites(state.world.layout)) {
    if (s.type === CircleType.Generic || encounterAt(state, s.id)) continue;
    for (const j of state.grid.nearOthers(s.x, s.z, reach)) {
      if (!playersOwn(state, j) || distTo(state, j, s.x, s.z) > reach) continue;
      bring(state, s, e.owner[j]!);
      break;
    }
  }
}

// ----- turning -----

function setMode(state: SimState, r: Encounter, mode: EncounterMode): void {
  r.mode = mode;
  r.since = state.step;
  r.quietSince = state.step;
}

/** The leader's index, or -1 once he is dead. */
function leaderOf(state: SimState, r: Encounter): number {
  const e = state.entities;
  const i = r.leader ? e.indexOf(r.leader) : -1;
  return i >= 0 && e.hp[i]! > 0 ? i : -1;
}

/** The Ape's rage at a player: their units on the grounds are his to run down. */
function apeRage(state: SimState, r: Encounter, player: number, line: string): void {
  const i = leaderOf(state, r);
  if (i < 0) return;
  const e = state.entities;
  const b = bit(player);
  r.warned &= ~b;
  r.foes |= b;
  closeWarn(state, r, player);
  if (r.mode !== EncounterMode.Rampage) {
    if (r.mode !== EncounterMode.Fighting) {
      // He roars first (his clip), then runs.
      r.still = state.step + 2 * SEC;
      e.atkAt[i] = 0;
      state.hits.push({ look: 'enrage', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    }
    setMode(state, r, EncounterMode.Fighting);
  }
  r.next = within(state, r, ENCOUNTERS.ape.tauntS, 1);
  sayForeign(state, i, line, true);
}

/** The Ape's warning to a player (SCA-3): an actionable put to them, his words over him. */
function apeWarn(state: SimState, r: Encounter, player: number, unit: number): void {
  const i = leaderOf(state, r);
  if (i < 0) return;
  r.warned |= bit(player);
  r.unit = unit;
  if (r.mode === EncounterMode.Calm || r.mode === EncounterMode.Watching) setMode(state, r, EncounterMode.Warning);
  sayForeign(state, i, APE_ASK.text, true, -1, 0, 'held');
  putWarn(state, r, player);
}

/** The warning's question (not state: put up again after a load). */
function putWarn(state: SimState, r: Encounter, player: number): void {
  if (asksOf(state, r.leader, player, EncounterAsk.Warn)) return;
  askForever(state, { player, who: r.leader, building: false, q: EncounterAsk.Warn, units: r.unit ? [r.unit] : [], text: APE_ASK.text, yes: APE_ASK.yes, no: APE_ASK.no, foreign: true });
}

function closeWarn(state: SimState, r: Encounter, player: number): void {
  if (!r.leader || !asksOf(state, r.leader, player, EncounterAsk.Warn)) return;
  // Only this player's: the others' warnings stay up.
  const others = r.warned & ~bit(player);
  closeAsksBy(state, r.leader, [EncounterAsk.Warn]);
  for (let p = 0; p < state.players.length; p++) if (others & bit(p)) putWarn(state, r, p);
}

/** Silenus' band roused against a player (answer 8: attacked, or their circle looted), for good. */
function rouse(state: SimState, r: Encounter, player: number): void {
  const b = bit(player);
  const fresh = (r.foes & b) === 0;
  r.foes |= b;
  r.sworn |= b;
  if (r.mode !== EncounterMode.Fighting) setMode(state, r, EncounterMode.Fighting);
  const i = leaderOf(state, r);
  if (fresh && i >= 0) {
    sayForeign(state, i, pick(state, r, SILENUS_LINES.roused, 2), true);
    r.next = within(state, r, ENCOUNTERS.silenus.fightS, 3);
  }
}

/** The Lich's fight begins: every player is his foe (SCB-2), he speaks (SCB-3) and each necromancer raises his skeletons once (SCB-1). */
function lichAwakes(state: SimState, r: Encounter): void {
  const e = state.entities;
  r.foes = everyone(state);
  setMode(state, r, EncounterMode.Fighting);
  const i = leaderOf(state, r);
  if (i >= 0) sayForeign(state, i, LICH_LINES.seen, true);
  r.next = within(state, r, ENCOUNTERS.lich.quipS, 4);
  const l = ENCOUNTERS.lich;
  // The k-th necromancer standing (by id, the order they came in) raises the 2k-th and (2k+1)-th of the ten.
  const necros = membersOf(state, r).filter((j) => e.mob[j] === Mob.Necromancer).slice(0, l.necromancers);
  const s = siteOf(state, r);
  for (let k = 0; k < necros.length; k++) {
    const j = necros[k]!;
    for (let q = 0; q < 2; q++) {
      const mob = l.raised[k * 2 + q]!;
      const [x, z] = out16(e.x[j]!, e.z[j]!, e.heading[j]! + (q === 0 ? 16384 : -16384), 2 * M);
      const m = addMember(state, r, s, mob, e.foe[j]!, x, z);
      state.hits.push({ look: 'crimson', x: e.x[m]!, y: e.y[m]!, z: e.z[m]!, id: e.id[m]! });
    }
    state.hits.push({ look: 'summon', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: e.id[j]! });
  }
}

// ----- what the players do at a circle (circles/disturb.ts) -----

/** A player's unit did something to a circle. */
function onDisturbed(state: SimState, circle: number, unit: number, what: Disturb): void {
  const r = encounterAt(state, circle);
  const e = state.entities;
  if (!r || unit < 0 || e.owner[unit]! >= state.players.length) return;
  const player = e.owner[unit]!;
  const b = bit(player);
  if (r.type === CircleType.Lunar) {
    const i = leaderOf(state, r);
    if (i < 0) return;
    if (what === Disturb.Idol) {
      r.robbed |= b;
      return apeRage(state, r, player, APE_LINES.idol);
    }
    if (r.foes & b) return;
    if (what === Disturb.Fruit) {
      // He watches the picker, without a word.
      if (r.mode === EncounterMode.Calm) {
        setMode(state, r, EncounterMode.Watching);
        r.unit = e.id[unit]!;
      }
      return;
    }
    // Wronging the circle again after a Sorry, or before answering, or once sworn: rage.
    if (r.sorry & b || r.warned & b || r.sworn & b) return apeRage(state, r, player, pick(state, r, APE_LINES.rage, 5));
    return apeWarn(state, r, player, e.id[unit]!);
  }
  if (r.type === CircleType.Silenus) {
    if (what !== Disturb.Fruit) rouse(state, r, player);
    return;
  }
  if (r.type === CircleType.Boneyard && r.mode !== EncounterMode.Fighting && leaderOf(state, r) >= 0) lichAwakes(state, r);
}

/** One of a circle's keepers was hurt by one of the players' units (threats/update.ts onFoeHurt). */
export function encounterHurt(state: SimState, i: number, from: number): void {
  const e = state.entities;
  const a = e.indexOf(from);
  if (a < 0 || sideOf(state, a) !== Side.Players) return;
  const r = encounterOf(state, i);
  if (!r) return;
  const player = e.owner[a]!;
  if (r.type === CircleType.Lunar) {
    if (!(r.foes & bit(player))) apeRage(state, r, player, pick(state, r, APE_LINES.rage, 6));
  } else if (r.type === CircleType.Silenus) rouse(state, r, player);
  else if (r.mode !== EncounterMode.Fighting) lichAwakes(state, r);
}

/** The Ape's warning answered (units/questions.ts runs it once the question has closed). */
function answerWarn(state: SimState, o: AnswerOrder): void {
  const r = state.threats.encounters.find((x) => x.leader === o.who && x.type === CircleType.Lunar);
  if (!r || leaderOf(state, r) < 0 || state.players[o.player]?.out) return;
  const b = bit(o.player);
  if (!(r.warned & b)) return;
  if (o.yes === 1) return apeRage(state, r, o.player, pick(state, r, APE_LINES.rage, 7));
  // "Sorry!": he stands down.
  r.warned &= ~b;
  r.sorry |= b;
  sayForeign(state, leaderOf(state, r), pick(state, r, APE_LINES.forgiven, 8), true);
  if (r.warned === 0 && r.mode === EncounterMode.Warning) setMode(state, r, EncounterMode.Calm);
}

answerKinds.set(EncounterAsk.Warn, answerWarn);

// ----- each step -----

/** A foe of an encounter: one of the players' units whose player it fights. */
function foeUnit(state: SimState, r: Encounter, j: number): boolean {
  return playersOwn(state, j) && (r.foes & bit(state.entities.owner[j]!)) !== 0;
}

/** Whether any of an encounter's foes stands on its grounds. */
function foesOnGrounds(state: SimState, r: Encounter): boolean {
  const s = siteOf(state, r);
  const reach = ENCOUNTERS.groundsM * M;
  for (const j of state.grid.nearOthers(s.x, s.z, reach)) if (foeUnit(state, r, j) && distTo(state, j, s.x, s.z) <= reach) return true;
  return false;
}

/** Whether any of the players' units is within `m` metres of a point. */
function playersNear(state: SimState, x: number, z: number, m: number): boolean {
  for (const j of state.grid.nearOthers(x, z, m * M)) if (playersOwn(state, j) && distTo(state, j, x, z) <= m * M) return true;
  return false;
}

/** Each step: circles' keepers come, marks tick, leaps and throws fly, and each encounter takes its turns. */
export function updateEncounters(state: SimState): void {
  if (!state.peaceful && state.step % ENCOUNTERS.wakeEverySteps === 7) wake(state);
  tickMarks(state);
  const list = state.threats.encounters;
  if (list.length === 0) return;
  const second = state.step % SEC === 11;
  // A new day: the Ape's goods are full again.
  const day = floorDiv(state.step, CYCLE_STEPS);
  for (const r of list) {
    if (r.day !== day) {
      const g = ENCOUNTERS.ape.goods;
      r.day = day;
      r.fruit = g.perDay;
      r.honey = g.perDay;
      r.wine = g.perDay;
    }
    flights(state, r);
    const i = leaderOf(state, r);
    if (i < 0 && r.leader) {
      // The leader fell: whatever he was waiting on is over.
      if (r.type === CircleType.Lunar) closeAsksBy(state, r.leader, [EncounterAsk.Warn]);
      r.leader = 0;
      r.warned = 0;
    }
    if (r.type === CircleType.Lunar) tendApe(state, i, r, second);
    else if (r.type === CircleType.Silenus) tendSilenus(state, i, r, second);
    else tendLich(state, i, r, second);
  }
}

/** A fight that has had no foe on the grounds for 20 s is over (the Ape sworn against one of them goes after them instead). */
function quieten(state: SimState, r: Encounter, second: boolean): boolean {
  if (!second || r.mode !== EncounterMode.Fighting) return false;
  if (foesOnGrounds(state, r)) {
    r.quietSince = state.step;
    return false;
  }
  if (state.step - r.quietSince < ENCOUNTERS.calmAfterS * SEC) return false;
  r.foes = r.type === CircleType.Boneyard ? r.foes : 0;
  setMode(state, r, EncounterMode.Calm);
  return true;
}

function tendApe(state: SimState, i: number, r: Encounter, second: boolean): void {
  if (i < 0) return;
  const e = state.entities;
  const a = ENCOUNTERS.ape;
  const s = siteOf(state, r);
  if (second) for (let p = 0; p < state.players.length; p++) if (r.warned & bit(p) && !state.players[p]!.out) putWarn(state, r, p);
  switch (r.mode) {
    case EncounterMode.Calm: {
      if (!second) break;
      // A greeting to newcomers near him, at most once in 40 s.
      if (state.step >= r.next && playersNear(state, e.x[i]!, e.z[i]!, a.greetM)) {
        sayForeign(state, i, pick(state, r, APE_LINES.greet, 9), true);
        r.next = state.step + a.greetGapS * SEC;
      }
      break;
    }
    case EncounterMode.Watching:
      if (state.step - r.since >= a.watchS * SEC) {
        setMode(state, r, EncounterMode.Calm);
        r.unit = 0;
      }
      break;
    case EncounterMode.Warning:
      if (r.warned === 0) setMode(state, r, EncounterMode.Calm);
      else if (second && state.step >= r.next) {
        sayForeign(state, i, pick(state, r, APE_LINES.warning, 10), true);
        r.next = state.step + 12 * SEC;
      }
      break;
    case EncounterMode.Fighting: {
      if (second && foesOnGrounds(state, r)) {
        r.fought++;
        if (r.fought >= a.swornAfterS) {
          r.sworn |= r.foes;
          setMode(state, r, EncounterMode.Rampage);
          sayForeign(state, i, APE_LINES.sworn, true);
          r.next = within(state, r, a.tauntS, 11);
          break;
        }
      }
      if (quieten(state, r, second)) {
        sayForeign(state, i, pick(state, r, APE_LINES.calm, 12), true);
        r.roam = 0;
        break;
      }
      if (state.step >= r.next && e.target[i] !== 0) {
        sayForeign(state, i, pick(state, r, APE_LINES.taunt, 13), true);
        r.next = within(state, r, a.tauntS, 14);
      }
      apeMoves(state, i, r);
      break;
    }
    case EncounterMode.Rampage: {
      // Every player he is sworn against is out: he goes home.
      r.sworn &= everyone(state);
      if (r.sworn === 0) {
        r.foes = 0;
        setMode(state, r, EncounterMode.Calm);
        break;
      }
      r.foes = r.sworn;
      if (state.step >= r.next) {
        sayForeign(state, i, pick(state, r, APE_LINES.rampage, 15), true);
        r.next = within(state, r, [20, 35], 16);
      }
      apeMoves(state, i, r);
      break;
    }
  }
  // Raging he runs (the client's run clip too).
  if (r.mode === EncounterMode.Fighting || r.mode === EncounterMode.Rampage || (e.target[i] !== 0 && monsterAt(state, i, e.target[i]!) >= 0)) {
    e.fastUntil[i] = state.step + 2;
    e.fastBp[i] = a.runBp;
  }
  if (r.mode === EncounterMode.Calm && second && r.planting === 0 && state.step >= r.plantAt && r.planted < a.plantMax && e.target[i] === 0) startPlanting(state, i, r, s);
}

/** His leap and his throw, when the one he fights is where they reach (each step while he fights). */
function apeMoves(state: SimState, i: number, r: Encounter): void {
  const e = state.entities;
  const a = ENCOUNTERS.ape;
  if (state.step < r.still || r.leapEnd > state.step || r.toss) return;
  const t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t < 0 || !foeUnit(state, r, t)) return;
  const d = gap(state, i, t);
  const spec = mobSpec(e.mob[i]!);
  if (state.step >= r.tossNext && d <= spec.reach + M && tossable(state, t)) return grab(state, i, r, t);
  if (state.step >= r.leapNext && d >= a.leap.minM * M && d <= a.leap.maxM * M) leap(state, i, r, t, a.leap);
}

/** A unit the Ape can grab and throw (SCA-2: "human units"): a worker, warrior or mage on foot, not the Dreadnought (s). */
function tossable(state: SimState, t: number): boolean {
  const e = state.entities;
  const k = e.kind[t];
  if (k !== UnitKind.Worker && k !== UnitKind.Warrior && k !== UnitKind.Mage) return false;
  return e.mount[t] === 0 && e.inside[t] === 0 && e.troop[t] !== Troop.Dreadnought && e.heldUntil[t]! <= state.step;
}

/** A leap at a foe (the Ape's, ending in his thunderclap; the tiger's): it lands just short of them. */
function leap(state: SimState, i: number, r: Encounter, t: number, l: { everyS: number; crouchSteps: number; flightSteps: number; clipSteps: number }): void {
  const e = state.entities;
  const d = distTo(state, t, e.x[i]!, e.z[i]!);
  const short = Math.max(0, d - floorDiv(3 * M, 2));
  const h = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  const [x, z] = standNear(state, ...out16(e.x[i]!, e.z[i]!, h, short));
  r.leapX0 = e.x[i]!;
  r.leapZ0 = e.z[i]!;
  r.leapX1 = x;
  r.leapZ1 = z;
  r.leapAt = state.step + l.crouchSteps;
  r.leapEnd = r.leapAt + l.flightSteps;
  r.leapNext = state.step + l.everyS * SEC;
  r.still = state.step + l.clipSteps;
  e.heading[i] = h;
  e.atkAt[i] = 0;
  e.heldUntil[i] = r.leapEnd;
  state.hits.push({ look: 'leap', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

/** The Ape grabs one of them: held in his hands, then thrown off the Goddess's ground. */
function grab(state: SimState, i: number, r: Encounter, t: number): void {
  const e = state.entities;
  const a = ENCOUNTERS.ape.toss;
  r.toss = e.id[t]!;
  r.tossAt = state.step + a.holdSteps;
  r.tossEnd = 0;
  r.tossNext = state.step + a.everyS * SEC;
  r.still = state.step + a.clipSteps;
  e.atkAt[i] = 0;
  e.heldUntil[i] = r.still;
  e.heldUntil[t] = r.tossAt + 1;
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  state.hits.push({ look: 'grab', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]!, to: e.id[t]! });
}

/** The leaps and throws in the air: where the leaper and the thrown are each step, and what happens as they land. */
function flights(state: SimState, r: Encounter): void {
  const e = state.entities;
  if (r.leapEnd > 0) {
    const i = r.leader ? e.indexOf(r.leader) : -1;
    if (i < 0 || e.hp[i]! <= 0) r.leapEnd = 0;
    else if (state.step >= r.leapAt) {
      const span = Math.max(1, r.leapEnd - r.leapAt);
      const k = Math.min(span, state.step - r.leapAt);
      const x = r.leapX0 + floorDiv((r.leapX1 - r.leapX0) * k, span);
      const z = r.leapZ0 + floorDiv((r.leapZ1 - r.leapZ0) * k, span);
      if (k >= span) {
        landAt(state, i, r.leapX1, r.leapZ1);
        r.leapEnd = 0;
        if (r.type === CircleType.Lunar) thunderclap(state, i, r);
      } else {
        const peak = (r.type === CircleType.Lunar ? ENCOUNTERS.ape.leap.peakM : ENCOUNTERS.silenus.tigerLeap.peakM) * M;
        const ground = standY(state, x, z, e.y[i]!);
        e.x[i] = x;
        e.z[i] = z;
        e.y[i] = ground + floorDiv(4 * peak * k * (span - k), span * span);
      }
    }
  }
  if (r.toss) {
    const i = r.leader ? e.indexOf(r.leader) : -1;
    const t = e.indexOf(r.toss);
    if (t < 0 || e.hp[t]! <= 0 || (r.tossEnd === 0 && (i < 0 || e.hp[i]! <= 0))) {
      if (t >= 0 && e.hp[t]! > 0) landAt(state, t, e.x[t]!, e.z[t]!);
      r.toss = 0;
      return;
    }
    if (r.tossEnd === 0) {
      // In his hands, up over his head.
      const [hx, hz] = out16(e.x[i]!, e.z[i]!, e.heading[i]!, M);
      e.x[t] = hx;
      e.z[t] = hz;
      e.y[t] = e.y[i]! + floorDiv(mobSpec(e.mob[i]!).height * 3, 4);
      e.heldUntil[t] = state.step + 2;
      if (state.step >= r.tossAt) throwOff(state, i, r, t);
      return;
    }
    const span = Math.max(1, r.tossEnd - r.tossAt);
    const k = Math.min(span, state.step - r.tossAt);
    if (k >= span) {
      landAt(state, t, r.tossX1, r.tossZ1);
      const m = floorDiv(length2d(r.tossX1 - r.tossX0, r.tossZ1 - r.tossZ0), M);
      // Rolled here (Patch 7), so the dirt shows the damage it does.
      const dmg = rollDamage(state, floorDiv(m * ENCOUNTERS.ape.toss.perTenMetres, 10), ENCOUNTERS.ape.toss.rollBp);
      state.hits.push({ look: 'dirt', x: e.x[t]!, y: e.y[t]!, z: e.z[t]!, id: e.id[t]!, dmg });
      hurtUnit(state, t, { damage: dmg, from: r.leader, projectile: false, blunt: true, pierce: false, exact: true, roll: 0 });
      r.toss = 0;
      return;
    }
    const x = r.tossX0 + floorDiv((r.tossX1 - r.tossX0) * k, span);
    const z = r.tossZ0 + floorDiv((r.tossZ1 - r.tossZ0) * k, span);
    const peak = floorDiv(length2d(r.tossX1 - r.tossX0, r.tossZ1 - r.tossZ0), 4);
    e.x[t] = x;
    e.z[t] = z;
    e.y[t] = standY(state, x, z) + floorDiv(4 * peak * k * (span - k), span * span) + 2 * M;
    e.heldUntil[t] = state.step + 2;
  }
}

/** The throw: away from the circle's middle, 12 to 30 m, to where it can land. */
function throwOff(state: SimState, i: number, r: Encounter, t: number): void {
  const e = state.entities;
  const a = ENCOUNTERS.ape.toss;
  const s = siteOf(state, r);
  const away = e.x[i] === s.x && e.z[i] === s.z ? e.heading[i]! : headingTowards(e.x[i]! - s.x, e.z[i]! - s.z);
  const want = a.minM + state.rng.combat.nextInt(a.maxM - a.minM + 1);
  let x = e.x[t]!;
  let z = e.z[t]!;
  for (let m = want; m >= 2; m--) {
    const [px, pz] = out16(e.x[i]!, e.z[i]!, away, m * M);
    const gx = floorDiv(px, COL);
    const gz = floorDiv(pz, COL);
    if (state.nav.standable(gx, gz, WALKER) && state.buildings.solidAt(gx, gz) === 0) {
      x = wuOf(gx);
      z = wuOf(gz);
      break;
    }
  }
  r.tossX0 = e.x[t]!;
  r.tossZ0 = e.z[t]!;
  r.tossX1 = x;
  r.tossZ1 = z;
  const m = Math.max(1, floorDiv(length2d(x - r.tossX0, z - r.tossZ0), M));
  r.tossAt = state.step;
  r.tossEnd = state.step + Math.max(4, floorDiv(m * SEC, a.metresPerSecond));
  e.heldUntil[t] = r.tossEnd + 1;
  e.atkAt[t] = 0;
  e.path[t] = [];
  sayForeign(state, i, pick(state, r, APE_LINES.toss, 17), false);
}

/**
 * SCA-2's [thunderclap] as he lands: "5-10 dmg to the hp of all units in the
 * 6 metre radius", so every living unit there but himself takes it: his foes,
 * the night's monsters and a player at peace with him alike (a unit inside a
 * building, or a lair, is not on the ground to be shaken).
 */
function thunderclap(state: SimState, i: number, r: Encounter): void {
  const e = state.entities;
  const l = ENCOUNTERS.ape.leap;
  const rad = l.radiusM * M;
  state.hits.push({ look: 'thunder', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, rad + M)) {
    if (j === i || e.hp[j]! <= 0 || e.inside[j] !== 0 || distTo(state, j, e.x[i]!, e.z[i]!) > rad) continue;
    if (e.kind[j] === UnitKind.Mob && mobSpec(e.mob[j]!).role === Role.Structure) continue;
    // Already anywhere from 5 to 10: not rolled again (Patch 7).
    const dmg = l.min + state.rng.combat.nextInt(l.max - l.min + 1);
    hurtUnit(state, j, { damage: dmg, from: e.id[i]!, projectile: false, blunt: true, pierce: false, roll: 0 });
  }
  if (state.rng.combat.nextInt(3) === 0) sayForeign(state, i, pick(state, r, APE_LINES.thunder, 18), false);
}

/** A monster by entity id that a keeper may drive off its grounds, as an index, or -1. */
function monsterAt(state: SimState, i: number, id: number): number {
  const j = state.entities.indexOf(id);
  return j >= 0 && strayMonster(state, j) ? j : -1;
}

/** He picks a bare spot to plant and walks there (s: a flower, or a Sweet Hawthorne one time in four). */
function startPlanting(state: SimState, i: number, r: Encounter, s: CircleSite): void {
  const e = state.entities;
  const a = ENCOUNTERS.ape;
  r.plantAt = within(state, r, a.plantS, 19);
  for (let k = 0; k < 6; k++) {
    const h = hash32(state.seed ^ 0x706c6e74, r.circle, r.planted, k);
    const m = a.plantMinM + (h >>> 16) % (a.plantMaxM - a.plantMinM + 1);
    const [x, z] = out16(s.x, s.z, h & 0xffff, m * M);
    const gx = floorDiv(x, COL);
    const gz = floorDiv(z, COL);
    if (plantSpotProblem(state, gx, gz) || !state.nav.standable(gx, gz, WALKER)) continue;
    e.targetX[i] = wuOf(gx);
    e.targetZ[i] = wuOf(gz);
    // r.planting holds the step he gives up on the spot.
    r.planting = state.step + a.plantWalkS * SEC;
    return;
  }
}

/** He is at the spot: the flower or sapling goes in, and he plays his planting through. */
function plantNow(state: SimState, i: number, r: Encounter): void {
  const e = state.entities;
  const a = ENCOUNTERS.ape;
  r.planting = 0;
  const gx = floorDiv(e.targetX[i]!, COL);
  const gz = floorDiv(e.targetZ[i]!, COL);
  if (plantSpotProblem(state, gx, gz)) return;
  if ((r.planted + 1) % a.hawthorneEvery === 0) plantHawthorne(state, gx, gz);
  else {
    const look = hash32(state.seed, 0x666c7772, gx, gz) % 3;
    const variant = pieceVariant({ circle: r.circle, prop: CircleProp.Flower, gx, gz, heading: hash32(state.seed, gx, gz) & 0xffff, look, amount: 0 }, CircleType.Lunar);
    state.world.addProp(gx, gz, PropKind.RuinFlower, variant, 0, state.step);
  }
  r.planted++;
  r.still = state.step + floorDiv(33 * SEC, 10);
  state.hits.push({ look: 'plant', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

function tendSilenus(state: SimState, i: number, r: Encounter, second: boolean): void {
  const e = state.entities;
  const sl = ENCOUNTERS.silenus;
  const s = siteOf(state, r);
  if (r.mode === EncounterMode.Calm) {
    if (!second) return;
    // Answer 8: those who wronged them are hunted again whenever they come near.
    if (r.sworn) {
      for (const j of state.grid.nearOthers(s.x, s.z, sl.grudgeM * M)) {
        if (playersOwn(state, j) && r.sworn & bit(e.owner[j]!) && distTo(state, j, s.x, s.z) <= sl.grudgeM * M) {
          rouse(state, r, e.owner[j]!);
          return;
        }
      }
    }
    if (state.step >= r.next && playersNear(state, s.x, s.z, sl.revelM)) {
      const members = membersOf(state, r);
      if (members.length === 0) return;
      const j = members[hash32(state.seed, r.circle, state.step) % members.length]!;
      const lines = e.mob[j] === Mob.Silenus ? SILENUS_LINES.revel : SATYR_LINES.revel;
      sayForeign(state, j, pick(state, r, lines, 20), false);
      if (e.mob[j] === Mob.SatyrReveler) {
        state.hits.push({ look: 'drink', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: e.id[j]! });
        e.heldUntil[j] = state.step + floorDiv(11 * SEC, 5);
      }
      r.next = within(state, r, sl.revelS, 21);
    }
    return;
  }
  if (quieten(state, r, second)) {
    // Back to the feast: those who wronged them stay sworn.
    r.next = within(state, r, sl.revelS, 22);
    return;
  }
  if (i < 0) return;
  if (state.step >= r.next && e.target[i] !== 0) {
    sayForeign(state, i, pick(state, r, SILENUS_LINES.fight, 23), true);
    r.next = within(state, r, sl.fightS, 24);
  }
  if (state.step < r.still || r.leapEnd > state.step) return;
  // SCS-4, SCS-5: into the tiger once in five days, when he is hard pressed.
  if (e.mob[i] === Mob.Silenus && e.hp[i]! * 100 < e.maxHp[i]! * sl.tiger.belowPct && (r.changed === 0 || state.step - r.changed >= sl.tiger.everyDays * CYCLE_STEPS)) {
    return transform(state, i, r);
  }
  const t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t < 0 || !foeUnit(state, r, t)) return;
  const d = gap(state, i, t);
  if (e.mob[i] === Mob.Sabretooth) {
    const l = sl.tigerLeap;
    if (state.step >= r.leapNext && d >= l.minM * M && d <= l.maxM * M) leap(state, i, r, t, l);
    return;
  }
  if (state.step >= r.rootsNext && d <= sl.roots.m * M && e.heldUntil[t]! <= state.step) {
    r.rootsNext = state.step + sl.roots.everyS * SEC;
    return roots(state, i, r, t);
  }
  if (state.step >= r.lashNext && d <= sl.lash.m * M) {
    r.lashNext = state.step + sl.lash.everyS * SEC;
    r.still = state.step + sl.lash.castSteps;
    lash(state, i, t, sl.lash.damage, sl.lash.rollBp);
  }
}

/** SCS-4's [entangling roots]: the unit is held where it stands for 20 s. */
function roots(state: SimState, i: number, r: Encounter, t: number): void {
  const e = state.entities;
  const ro = ENCOUNTERS.silenus.roots;
  r.still = state.step + ro.castSteps;
  e.atkAt[i] = 0;
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  e.heldUntil[t] = state.step + ro.holdS * SEC;
  e.atkAt[t] = 0;
  putMark(state, e.id[t]!, MarkKind.Roots, state.step + ro.holdS * SEC, e.id[i]!);
  state.hits.push({ look: 'roots', x: e.x[t]!, y: e.y[t]!, z: e.z[t]!, id: e.id[t]!, to: e.id[i]! });
}

/** SCS-3's [lash of thorns]: a thorny vine whips one unit (Silenus' for 10 more). */
function lash(state: SimState, i: number, t: number, damage: number, roll: number): void {
  const e = state.entities;
  e.atkAt[i] = 0;
  e.atkNext[i] = Math.max(e.atkNext[i]!, state.step + ENCOUNTERS.silenus.lash.castSteps);
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  state.hits.push({ look: 'lash', x: e.x[t]!, y: e.y[t]!, z: e.z[t]!, id: e.id[t]!, to: e.id[i]! });
  hurtUnit(state, t, { damage, from: e.id[i]!, projectile: false, blunt: false, pierce: true, spell: true, roll });
}

/** Silenus becomes the sabretooth (SCS-5), keeping his own health for when it falls. */
function transform(state: SimState, i: number, r: Encounter): void {
  const e = state.entities;
  const tiger = mobSpec(Mob.Sabretooth);
  r.heldHp = e.hp[i]!;
  r.heldMax = e.maxHp[i]!;
  r.changed = state.step;
  r.still = state.step + ENCOUNTERS.silenus.tiger.clipSteps;
  e.mob[i] = Mob.Sabretooth;
  e.hp[i] = tiger.hp;
  e.maxHp[i] = tiger.hp;
  e.speed[i] = tiger.speed;
  e.atkAt[i] = 0;
  e.heldUntil[i] = r.still;
  state.hits.push({ look: 'transform', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
  sayForeign(state, i, SILENUS_LINES.tiger, true);
}

/** The tiger falls and Silenus is himself again, as he was (deathHooks.spare): true when it was the tiger. */
function spareSilenus(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.mob[i] !== Mob.Sabretooth || e.role[i] !== Role.Encounter) return false;
  const r = encounterOf(state, i);
  if (!r || r.leader !== e.id[i] || r.heldMax <= 0) return false;
  const him = mobSpec(Mob.Silenus);
  e.mob[i] = Mob.Silenus;
  e.hp[i] = Math.max(1, r.heldHp);
  e.maxHp[i] = r.heldMax;
  e.speed[i] = him.speed;
  e.atkAt[i] = 0;
  r.heldHp = 0;
  r.heldMax = 0;
  r.still = state.step + ENCOUNTERS.silenus.tiger.clipSteps;
  e.heldUntil[i] = r.still;
  state.hits.push({ look: 'transform', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
  sayForeign(state, i, SILENUS_LINES.back, true);
  return true;
}

function tendLich(state: SimState, i: number, r: Encounter, second: boolean): void {
  const e = state.entities;
  const l = ENCOUNTERS.lich;
  if (r.mode !== EncounterMode.Fighting) {
    // SCB-3: "When the lich becomes visible on screen to the player, it will attack".
    if (second && i >= 0 && seenByPlayers(state, e.x[i]!, e.z[i]!)) lichAwakes(state, r);
    return;
  }
  // Every player is his foe, the ones who came since too.
  r.foes = everyone(state);
  if (i < 0) return;
  if (state.step >= r.next && playersNear(state, e.x[i]!, e.z[i]!, 30)) {
    sayForeign(state, i, pick(state, r, LICH_LINES.quip, 25), true);
    r.next = within(state, r, l.quipS, 26);
  }
  if (second && state.step >= r.riteNext && e.hp[i]! * 100 < e.maxHp[i]! * l.ritePct) rite(state, i, r);
}

/** SCB-2's [Sacrificial Rite]: the follower with the most health near him dies, and its health is his. */
function rite(state: SimState, i: number, r: Encounter): void {
  const e = state.entities;
  const l = ENCOUNTERS.lich;
  let best = -1;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, l.riteM * M)) {
    if (j === i || e.hp[j]! <= 0 || e.kind[j] !== UnitKind.Mob || e.owner[j] !== MONSTERS || distTo(state, j, e.x[i]!, e.z[i]!) > l.riteM * M) continue;
    // "one of his follower units like the necromancers or skeletons, or any undead unit".
    const follower = e.role[j] === Role.Encounter && encounterOf(state, j) === r;
    if (!follower && !mobSpec(e.mob[j]!).undead) continue;
    if (mobSpec(e.mob[j]!).role === Role.Structure) continue;
    if (best < 0 || e.hp[j]! > e.hp[best]! || (e.hp[j] === e.hp[best] && e.id[j]! < e.id[best]!)) best = j;
  }
  if (best < 0) return;
  r.riteNext = state.step + l.riteS * SEC;
  const gain = Math.min(e.hp[best]!, e.maxHp[i]! - e.hp[i]!);
  e.hp[i] = e.hp[i]! + gain;
  state.hits.push({ look: 'rite', x: e.x[best]!, y: e.y[best]!, z: e.z[best]!, id: e.id[best]!, to: e.id[i]!, n: gain });
  sayForeign(state, i, pick(state, r, LICH_LINES.rite, 27), false);
  // Gone into him: no death, no experience.
  e.hp[best] = -1;
  state.dying.push(e.id[best]!);
  e.atkAt[i] = 0;
  e.heldUntil[i] = state.step + l.riteSteps;
}

// ----- what lies on units -----

/** Each step: marks run out; Touch of the Grave hurts every 5 s, never below 2 HP, and spreads (SCB-2). */
function tickMarks(state: SimState): void {
  const list = state.threats.marks;
  if (list.length === 0) return;
  const e = state.entities;
  const g = ENCOUNTERS.lich.grave;
  let kept = 0;
  const spreadTo: Array<[number, number]> = [];
  for (const m of list) {
    const j = e.indexOf(m.id);
    if (j < 0 || e.hp[j]! <= 0 || state.step >= m.until) {
      if (j >= 0 && m.kind === MarkKind.Vanished && e.hp[j]! > 0) state.hits.push({ look: 'ambush', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: m.id });
      continue;
    }
    list[kept++] = m;
    if (m.kind !== MarkKind.Grave || state.step < m.next) continue;
    m.next = state.step + g.everyS * SEC;
    // Rolled here (Patch 7), so the curse shows the damage it does, never past the floor.
    const d = Math.min(rollDamage(state, g.damage, g.rollBp), e.hp[j]! - g.floor);
    if (d > 0) {
      // A curse: magic (Patch 7).
      state.hits.push({ look: 'grave', x: e.x[j]!, y: e.y[j]! + M, z: e.z[j]!, id: m.id, dmg: d, dmgKind: DamageKind.Magic });
      hurtUnit(state, j, { damage: d, from: 0, projectile: false, blunt: false, pierce: false, exact: true, magic: true, roll: 0 });
    }
    // To an ally standing within 5 m, now and then.
    for (const k of state.grid.nearOthers(e.x[j]!, e.z[j]!, g.spreadM * M)) {
      if (k === j || e.hp[k]! <= 0 || e.owner[k] !== e.owner[j] || e.kind[k] === UnitKind.Animal || distTo(state, k, e.x[j]!, e.z[j]!) > g.spreadM * M) continue;
      if (markOn(state, e.id[k]!, MarkKind.Grave) >= 0 || state.rng.combat.nextInt(1000) >= g.spreadPm) continue;
      spreadTo.push([e.id[k]!, m.from]);
    }
  }
  list.length = kept;
  for (const [id, from] of spreadTo) if (markOn(state, id, MarkKind.Grave) < 0) putMark(state, id, MarkKind.Grave, state.step + g.lastS * SEC, from, state.step + g.everyS * SEC);
}

/** A shot struck a unit (combat/projectiles.ts shotHooks.hit): the Lich's Acrid Wind may bring Touch of the Grave, and a kill brings his line (SCB-2, SCB-3). */
function onShotHit(state: SimState, shot: number, shooter: number, t: number): void {
  if (shot !== Shot.AcridWind) return;
  const e = state.entities;
  const i = e.indexOf(shooter);
  if (e.hp[t]! <= 0) {
    if (i >= 0 && sideOf(state, t) === Side.Players) {
      const r = encounterOf(state, i);
      if (r) sayForeign(state, i, LICH_LINES.kill, true);
    }
    return;
  }
  if (sideOf(state, t) === Side.Monsters || state.rng.combat.nextInt(1000) >= ENCOUNTERS.lich.gravePm) return;
  const g = ENCOUNTERS.lich.grave;
  if (markOn(state, e.id[t]!, MarkKind.Grave) < 0) state.hits.push({ look: 'grave', x: e.x[t]!, y: e.y[t]! + M, z: e.z[t]!, id: e.id[t]! });
  putMark(state, e.id[t]!, MarkKind.Grave, state.step + g.lastS * SEC, shooter, state.step + g.everyS * SEC);
}

// ----- moving and fighting (threats/foes.ts runs it) -----

/** The foe a member goes for now: the one it has while it stays a foe in reach of the grounds, else the nearest within 30 m of it; -1 for none. */
function foeFor(state: SimState, i: number, r: Encounter): number {
  const e = state.entities;
  const s = siteOf(state, r);
  const leash = ENCOUNTERS.leashM * M;
  const ok = (j: number): boolean => foeUnit(state, r, j) && distTo(state, j, s.x, s.z) <= leash;
  const had = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (had >= 0 && ok(had)) return had;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, 30 * M)) {
    if (!ok(j)) continue;
    const d = distTo(state, j, e.x[i]!, e.z[i]!);
    if (d > 30 * M || (best >= 0 && (d > bestD || (d === bestD && e.id[j]! >= e.id[best]!)))) continue;
    best = j;
    bestD = d;
  }
  return best;
}

/** A spot to wander to round the middle, a new one every 12 s for each member (s), the same on every machine. */
function roam(state: SimState, i: number, r: Encounter, reachM: number, spec: MobSpec): void {
  const e = state.entities;
  const s = siteOf(state, r);
  if ((state.step + e.id[i]! * 7) % (12 * SEC) === 0 || (e.targetX[i] === 0 && e.targetZ[i] === 0)) {
    const h = hash32(state.seed ^ 0x726f616d, e.id[i]!, state.step);
    const d = (h >>> 16) % Math.max(1, reachM * M);
    [e.targetX[i], e.targetZ[i]] = out16(s.x, s.z, h & 0xffff, d);
  }
  if (walkMob(state, i, spec, e.targetX[i]!, e.targetZ[i]!)) e.order[i] = OrderKind.Idle;
}

/** Back home and stands about there. */
function goHome(state: SimState, i: number, r: Encounter, spec: MobSpec): void {
  const e = state.entities;
  const s = siteOf(state, r);
  e.target[i] = 0;
  if (distTo(state, i, s.x, s.z) > 14 * M) {
    if (walkMob(state, i, spec, s.x, s.z)) e.order[i] = OrderKind.Idle;
    return;
  }
  if ((state.step + e.id[i]!) % (12 * SEC) < 6 * SEC) roam(state, i, r, 12, spec);
  else e.order[i] = OrderKind.Idle;
}

export function runEncounter(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const r = encounterOf(state, i);
  if (!r) return;
  if (e.id[i] === r.leader && state.step < r.still) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  if (r.type === CircleType.Lunar) return runApe(state, i, r, spec);
  if (r.mode !== EncounterMode.Fighting) return goHome(state, i, r, spec);
  if (e.mob[i] === Mob.SatyrTrickster) return runTrickster(state, i, r, spec);
  const t = foeFor(state, i, r);
  if (t < 0) return goHome(state, i, r, spec);
  if (e.mob[i] === Mob.SatyrReveler && state.step >= e.abilityAt[i]! && gap(state, i, t) <= ENCOUNTERS.satyr.lash.m * M) {
    const l = ENCOUNTERS.satyr.lash;
    e.abilityAt[i] = state.step + l.everyS * SEC;
    return lash(state, i, t, l.damage, l.rollBp);
  }
  // A skeleton bomber goes off beside them, as on any night.
  if (bomber(spec) && gap(state, i, t) <= spec.reach + M) return explode(state, i, false);
  engageUnit(state, i, spec, t);
}

/** The Ape: his foes when he rages; on his rampage, their workers first, then their bases; else his garden, his altar and the monsters on his grounds. */
function runApe(state: SimState, i: number, r: Encounter, spec: MobSpec): void {
  const e = state.entities;
  const s = siteOf(state, r);
  if (r.mode === EncounterMode.Rampage) {
    const worker = (j: number): boolean => e.kind[j] === UnitKind.Worker;
    let t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
    if (t >= 0 && !foeUnit(state, r, t)) t = -1;
    if (t < 0) t = nearestFoe(state, r, e.x[i]!, e.z[i]!, 40 * M, worker);
    if (t < 0) t = nearestFoe(state, r, e.x[i]!, e.z[i]!, 20 * M, () => true);
    if (t >= 0) return engageUnit(state, i, spec, t);
    e.target[i] = 0;
    const b = nearestBuilding(state, e.x[i]!, e.z[i]!, 0, (x) => (r.sworn & bit(x.owner)) !== 0);
    if (b) return attackBuilding(state, i, spec, b);
    const far = nearestFoe(state, r, e.x[i]!, e.z[i]!, 400 * M, worker);
    if (far >= 0) return engageUnit(state, i, spec, far);
    return goHome(state, i, r, spec);
  }
  if (r.mode === EncounterMode.Fighting) {
    const t = foeFor(state, i, r);
    if (t >= 0) return engageUnit(state, i, spec, t);
    e.target[i] = 0;
    return goHome(state, i, r, spec);
  }
  // At peace: the monsters on the Goddess's ground first (SCA-2: "will attack monsters if they are within the grounds of the circle").
  const grounds = ENCOUNTERS.groundsM * M;
  let m = e.target[i] ? monsterAt(state, i, e.target[i]!) : -1;
  if (m >= 0 && distTo(state, m, s.x, s.z) > grounds) m = -1;
  if (m < 0 && (state.step + e.id[i]!) % 10 === 0) {
    let bestD = 0;
    for (const j of state.grid.near(s.x, s.z, grounds)) {
      if (!strayMonster(state, j)) continue;
      const d = distTo(state, j, s.x, s.z);
      if (d > grounds || (m >= 0 && d >= bestD)) continue;
      m = j;
      bestD = d;
    }
    if (m >= 0 && e.target[i] !== e.id[m]) sayForeign(state, i, pick(state, r, APE_LINES.monsters, 28), false);
  }
  if (m >= 0) {
    r.planting = 0;
    return engageUnit(state, i, spec, m);
  }
  e.target[i] = 0;
  if (r.mode === EncounterMode.Watching || r.mode === EncounterMode.Warning) {
    // He stands and stares at the one who did it.
    e.order[i] = OrderKind.Idle;
    const u = r.unit ? e.indexOf(r.unit) : -1;
    if (u >= 0) e.heading[i] = headingTowards(e.x[u]! - e.x[i]!, e.z[u]! - e.z[i]!);
    return;
  }
  if (r.planting) {
    if (state.step >= r.planting) {
      r.planting = 0;
      return;
    }
    if (walkMob(state, i, spec, e.targetX[i]!, e.targetZ[i]!)) plantNow(state, i, r);
    return;
  }
  // Now and then at the altar, worshipping, while someone is near to see it: he walks up to it first.
  const a = ENCOUNTERS.ape;
  if ((state.step + e.id[i]!) % (a.worshipEveryS * SEC) === 0 && playersNear(state, s.x, s.z, a.worshipNearM)) r.roam = state.step + 15 * SEC;
  if (state.step < r.roam) {
    if (distTo(state, i, s.x, s.z) > 5 * M) {
      walkMob(state, i, spec, s.x, s.z);
      return;
    }
    r.roam = 0;
    r.still = state.step + a.worshipSteps;
    e.order[i] = OrderKind.Idle;
    e.heading[i] = headingTowards(s.x - e.x[i]!, s.z - e.z[i]!);
    state.hits.push({ look: 'worship', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    if (hash32(state.seed, e.id[i]!, state.step) % 2 === 0) sayForeign(state, i, pick(state, r, APE_LINES.worship, 29), false);
    return;
  }
  roam(state, i, r, 20, spec);
}

/** The nearest unit of an encounter's foes within `rad` of a point that passes `may`, or -1. */
function nearestFoe(state: SimState, r: Encounter, x: number, z: number, rad: number, may: (j: number) => boolean): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.nearOthers(x, z, rad)) {
    if (!foeUnit(state, r, j) || !may(j)) continue;
    const d = length2d(e.x[j]! - x, e.z[j]! - z);
    if (d > rad) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** SCS-2's Trickster: vanishes now and then, and comes back at the weakest of them. */
function runTrickster(state: SimState, i: number, r: Encounter, spec: MobSpec): void {
  const e = state.entities;
  const sa = ENCOUNTERS.satyr;
  const hidden = markOn(state, e.id[i]!, MarkKind.Vanished) >= 0;
  if (hidden) {
    // "attempting to pick off the weakest and lowest HP enemy".
    const s = siteOf(state, r);
    let t = -1;
    for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, sa.seekM * M)) {
      if (!foeUnit(state, r, j) || distTo(state, j, s.x, s.z) > ENCOUNTERS.leashM * M) continue;
      if (t < 0 || e.hp[j]! < e.hp[t]! || (e.hp[j] === e.hp[t] && e.id[j]! < e.id[t]!)) t = j;
    }
    if (t < 0) return goHome(state, i, r, spec);
    e.target[i] = e.id[t]!;
    if (gap(state, i, t) > spec.reach) {
      walkMob(state, i, spec, e.x[t]!, e.z[t]!);
      return;
    }
    // In reach: he is there.
    dropMark(state, e.id[i]!, MarkKind.Vanished);
    state.hits.push({ look: 'ambush', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    if (hash32(state.seed, e.id[i]!, state.step) % 2 === 0) sayForeign(state, i, pick(state, r, SATYR_LINES.ambush, 30), false);
    return engageUnit(state, i, spec, t);
  }
  const t = foeFor(state, i, r);
  if (t < 0) return goHome(state, i, r, spec);
  if (state.step >= e.abilityAt[i]! && e.abilityAt[i] !== 0) {
    e.abilityAt[i] = state.step + sa.vanishEveryS * SEC;
    e.target[i] = 0;
    e.atkAt[i] = 0;
    putMark(state, e.id[i]!, MarkKind.Vanished, state.step + sa.vanishS * SEC, e.id[i]!);
    state.hits.push({ look: 'vanish', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    if (hash32(state.seed, e.id[i]!, state.step) % 2 === 0) sayForeign(state, i, pick(state, r, SATYR_LINES.vanish, 31), false);
    return;
  }
  // His first vanish comes a while into the fight.
  if (e.abilityAt[i] === 0) e.abilityAt[i] = state.step + 6 * SEC;
  engageUnit(state, i, spec, t);
}

/** A keeper's blow on a monster, or an unleashed monster's on a faction's building (combat/mob-ai.ts lateHooks.mobBlow). */
function mobBlow(state: SimState, i: number, spec: MobSpec, t: number): void {
  const e = state.entities;
  if (e.role[i] === Role.Unleashed) return headlessBlow(state, i, spec, t);
  if (!strayMonster(state, t) || gap(state, i, t) > spec.reach + M) return;
  hurtUnit(state, t, { damage: dealtTenths(state, i, blowTenths(state.rng.combat, spec)), from: e.id[i]!, projectile: false, blunt: true, pierce: false, roll: blowRollBp(spec, false) });
}

/** Whether a circle's keeper is at peace with a player (combat/combat.ts hostile): the Ape and Silenus' band until they are wronged; never the Lich's. */
export function encounterPeace(state: SimState, i: number, player: number): boolean {
  const r = encounterOf(state, i);
  if (!r) return false;
  if (r.type === CircleType.Boneyard) return false;
  return (r.foes & bit(player)) === 0;
}

// ----- the Ape's goods (SCA-2) -----

const APE_GOODS: readonly Res[] = [Res.HawthorneFruit, Res.Honey, Res.EnchantedWine];

function goodsLeft(r: Encounter, good: number): number {
  return good === 0 ? r.fruit : good === 1 ? r.honey : r.wine;
}

function bundleOf(good: number): number {
  const g = ENCOUNTERS.ape.goods;
  return good === 0 ? g.fruit : good === 1 ? g.honey : g.wine;
}

/** Why a player cannot trade with a circle's Ape now ('' when they can), whatever the good. */
function traderProblem(state: SimState, player: number, circle: number): string {
  const r = encounterAt(state, circle);
  if (!r || r.type !== CircleType.Lunar || leaderOf(state, r) < 0) return 'The Great White Ape is not here.';
  const b = bit(player);
  // SCA-2: "if you are peaceful towards the Great White Ape you can buy": the idol gone ends his trade only with its taker and those he is at war with.
  const gone = state.circles.taken.includes(circle);
  if (gone && (r.robbed & b || r.foes & b || r.sworn & b)) return 'The Goddess\'s idol is gone, and the Ape trades no more with you.';
  if (r.foes & b || r.sworn & b) return 'The Great White Ape is enraged with you.';
  if (r.warned & b) return 'Answer the Great White Ape first.';
  if (r.mode === EncounterMode.Fighting || r.mode === EncounterMode.Rampage) return 'The Great White Ape is fighting.';
  return '';
}

/** Why a player cannot buy a good from a circle's Ape now ('' when they can). */
function buyProblem(state: SimState, player: number, circle: number, good: number): string {
  if (good < 0 || good > 2) return 'He has nothing like that.';
  const why = traderProblem(state, player, circle);
  if (why) return why;
  if (goodsLeft(encounterAt(state, circle)!, good) <= 0) return 'He has no more of that today.';
  const g = ENCOUNTERS.ape.goods;
  if (state.players[player]!.pool[Res.Silver]! < g.silver) return `It costs ${g.silver} silver.`;
  return '';
}

/** A unit buys a bundle of a good from the Ape. */
function buy(state: SimState, unit: number, circle: number, good: number): void {
  const r = encounterAt(state, circle)!;
  const e = state.entities;
  const pool = state.players[e.owner[unit]!]!.pool;
  const g = ENCOUNTERS.ape.goods;
  pool[Res.Silver] = pool[Res.Silver]! - g.silver;
  pool[APE_GOODS[good]!] = pool[APE_GOODS[good]!]! + bundleOf(good);
  if (good === 0) r.fruit--;
  else if (good === 1) r.honey--;
  else r.wine--;
  const i = leaderOf(state, r);
  if (i >= 0) sayForeign(state, i, pick(state, r, APE_LINES.trade, 32), false);
}

/** Where a circle's Ape stands (a unit trading walks to him), or null. */
function apeAt(state: SimState, circle: number): [number, number] | null {
  const r = encounterAt(state, circle);
  const i = r ? leaderOf(state, r) : -1;
  return i >= 0 ? [state.entities.x[i]!, state.entities.z[i]!] : null;
}

function apesFor(state: SimState, player: number): ApeView[] {
  const out: ApeView[] = [];
  for (const r of state.threats.encounters) {
    if (r.type !== CircleType.Lunar || leaderOf(state, r) < 0) continue;
    const b = bit(player);
    out.push({ id: r.leader, circle: r.circle, left: [r.fruit, r.honey, r.wine], why: traderProblem(state, player, r.circle), peace: !(r.foes & b) && !(r.sworn & b) });
  }
  return out;
}

// ----- for the client -----

/** Whether a circle's keeper runs now (the client's run clip): the Ape raging, and the sabretooth always (6 m/s). */
export function encounterRuns(state: SimState, i: number): boolean {
  const r = encounterOf(state, i);
  if (!r) return false;
  if (state.entities.mob[i] === Mob.Sabretooth) return true;
  return r.type === CircleType.Lunar && r.leader === state.entities.id[i] && (r.mode === EncounterMode.Fighting || r.mode === EncounterMode.Rampage);
}

/** Whether entangling roots or Touch of the Grave lie on a unit now (the client draws them). */
export function rootedNow(state: SimState, i: number): boolean {
  return state.threats.marks.length > 0 && markOn(state, state.entities.id[i]!, MarkKind.Roots) >= 0;
}

export function graveNow(state: SimState, i: number): boolean {
  return state.threats.marks.length > 0 && markOn(state, state.entities.id[i]!, MarkKind.Grave) >= 0;
}

/** The quest menu's rows (decisions 3.6, QoL 3): the Ape's warning waiting on the player's answer, and his vengeance once sworn. */
function apeRows(state: SimState, player: number): Array<[string, string]> {
  const b = bit(player);
  const rows: Array<[string, string]> = [];
  for (const r of state.threats.encounters) {
    if (r.type !== CircleType.Lunar || leaderOf(state, r) < 0) continue;
    if (r.warned & b) rows.push(['The Great White Ape', `He waits for your answer: "${APE_ASK.text}"`]);
    else if (r.mode === EncounterMode.Rampage && r.sworn & b) rows.push(['The Great White Ape', 'Enraged for good: he is coming for your workers and your buildings.']);
  }
  return rows;
}

/** Installs the encounters' hooks (step.ts). */
export function installEncounters(): void {
  for (const h of [apeRows, headlessRows]) if (!questTimerHooks.includes(h)) questTimerHooks.push(h);
  lateHooks.mobBlow = mobBlow;
  shotHooks.hit = onShotHit;
  deathHooks.spare = spareSilenus;
  circleHooks.disturbed = onDisturbed;
  circleHooks.buyProblem = buyProblem;
  circleHooks.buy = buy;
  circleHooks.apeAt = apeAt;
  circleHooks.apes = apesFor;
  peaceHooks.encounter = encounterPeace;
}
