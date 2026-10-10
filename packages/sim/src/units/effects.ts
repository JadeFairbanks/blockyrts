// The special effects of epic and legendary loot (Patch 7, plan section 4.5;
// Jade, 22:04 UTC 2026-10-09: "suggest other special effects or buffs from
// each epic and above item that is not tiered (that is dropped/loot)", and at
// 22:08: "Yes do all of those"). Every epic or legendary piece taken from a
// monster or a people has one, each an echo of what its monster does; ladder
// pieces have none. A piece works while it is held or worn (the effect is on
// its gear row, units/kits.ts GearSpec.effect); the archfiend's greatsword
// works on the troops round its holder too. The bog guardian's club and
// Morvath's staff cannot be wielded: they are trophies, placed anywhere as a
// small item (Jade, 22:08: "you can place them as a small item (same size
// they display at on the mob) wherever you like, and they have an aoe radius
// of that effect of 15m each"; buildings/data.ts BogTrophy and
// VictorsTrophy). The lich's Deathless Shroud raises skeleton archers for
// its wearer and keeps debuffs off them (Jade, 23:05 UTC: Grave guard). Two
// copies of the same piece in reach of one unit count once; different
// effects add up (the plan's rule). Only the players' units
// feel them: a people's own Elf glaive and longbow do nothing more than they
// did. Everything here is worked out from the state as it stands, in
// integers; nothing here is state.

import { BuildingKind, buildingSpec } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import type { Building, BuildingStore } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { Mob, mobSpec } from '../combat/mobs.ts';
import { Res } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { MONSTERS, standY, UnitKind, type SimState } from '../state.ts';
import { dropMark, MarkKind, markOn } from '../threats/marks.ts';
import { Role } from '../threats/types.ts';
import { LootEffect, GEAR, RISEN_BOW_GEAR, Troop } from './kits.ts';

/** Fury (the fiend's cleaver, as the fiend's frenzy): its holder attacks this much faster, bp, while its health is under this share of its most, per mille. */
export const FURY = { attackBp: 2000, underPm: 500 };

/** Warlord (the archfiend's greatsword, as the archfiend's command): the players' troops within this reach of its holder, the holder too, deal this much more damage, bp. */
export const WARLORD = { damageBp: 1000, reach: 15 * WU_PER_METRE };

/** Reaper (the Elf glaive): it keeps its critical hits at the edge of its reach, and its holder moves this much faster, bp. */
export const REAPER = { moveBp: 1000 };

/**
 * Far sight (the Elf longbow): its arrows ignore this share of what they
 * hit's armour, bp, and its holder sees this much farther at dusk and night,
 * wu (s: 5 m, a little farther, as Jade's plan has it; a fog night halves it
 * with the rest of the holder's sight).
 */
export const FAR_SIGHT = { armourCutBp: 2000, darkSight: 5 * WU_PER_METRE };

/**
 * The Fae set (the Fae star wand and the Fae Guardian's robe, worn
 * together; each also restores mana 25% faster on its own, on its row): the
 * players' units within this reach of the mage wearing both, the mage too, heal
 * this much every so often (s: 1 health every 3 s, within 8 m).
 */
export const FAE_SET = { heal: 1, everySteps: 3 * STEPS_PER_SECOND, reach: 8 * WU_PER_METRE };

/** The bog trophy (the bog guardian's club, as its bog): the night's monsters within this reach of it move this much slower, bp (Jade: 15 m). */
export const BOG_TROPHY = { slowBp: 1000, reach: 15 * WU_PER_METRE };

/**
 * Victor's trophy (Morvath's staff): the players' units within this reach
 * of it gain this much to everything, bp (Jade: 15 m): damage, protection,
 * attack speed, move speed, work speed and spell power (the plan's
 * "everything").
 */
export const VICTORS_TROPHY = { bonusBp: 500, reach: 15 * WU_PER_METRE };

/**
 * Grave guard (the Deathless Shroud, the lich's robe; Jade, 23:05 UTC
 * 2026-10-09: "when you take damage wearing the lich's robes ... it spawns a
 * friendly skeleton archer, up to 1 every 12 seconds"): a skeleton archer
 * rises beside the mage wearing it, the mage's player's to order as a
 * mercenary is (Role.Risen), with this much health, for this long; then it
 * falls at once (Jade: "it loses all its hp instantly and plays the death
 * animation"). The wearer is also immune to debuffs (cleanse).
 */
export const GRAVE_GUARD = { everySteps: 12 * STEPS_PER_SECOND, lifeSteps: 25 * STEPS_PER_SECOND, hp: 10 };

/** What a risen skeleton archer is called, in its panel and its lines. */
export const RISEN_NAME = 'Risen skeleton archer';

/** An effect's name, the pieces that carry it and what it does, for the gear's hover and How to play. */
export interface EffectSpec {
  id: LootEffect;
  name: string;
  /** The goods that carry it. */
  items: readonly Res[];
  /** What it does, in one line. */
  text: string;
}

const pct = (bp: number): number => floorDiv(bp, 100);
const metres = (wu: number): number => floorDiv(wu, WU_PER_METRE);
const seconds = (steps: number): number => floorDiv(steps, STEPS_PER_SECOND);

/** Every effect, by id (LootEffect.None has no row of its own: it is the empty first one). */
export const LOOT_EFFECTS: readonly EffectSpec[] = [
  { id: LootEffect.None, name: 'None', items: [], text: '' },
  { id: LootEffect.Fury, name: 'Fury', items: [Res.FiendCleaver], text: `Its holder attacks ${pct(FURY.attackBp)}% faster while below ${floorDiv(FURY.underPm, 10)}% health.` },
  { id: LootEffect.Warlord, name: 'Warlord', items: [Res.ArchfiendGreatsword], text: `Your troops within ${metres(WARLORD.reach)} m of its holder, the holder too, deal ${pct(WARLORD.damageBp)}% more damage.` },
  { id: LootEffect.Reaper, name: 'Reaper', items: [Res.ElfGlaive], text: `Critical hits at the edge of its reach, and its holder moves ${pct(REAPER.moveBp)}% faster.` },
  { id: LootEffect.FarSight, name: 'Far sight', items: [Res.ElfLongbow], text: `Its arrows ignore ${pct(FAR_SIGHT.armourCutBp)}% of armour, and its holder sees ${metres(FAR_SIGHT.darkSight)} m farther at dusk and night.` },
  {
    id: LootEffect.FaeSet,
    name: 'Fae set',
    items: [Res.FaeStarWand, Res.FaeGuardianRobe],
    text: `Each piece restores mana 25% faster. Worn together, your units within ${metres(FAE_SET.reach)} m of the mage, the mage too, heal ${FAE_SET.heal} health every ${seconds(FAE_SET.everySteps)} s.`,
  },
  { id: LootEffect.BogTrophy, name: 'Bog trophy', items: [Res.BogGuardianClub], text: `Place it anywhere as a trophy: night monsters within ${metres(BOG_TROPHY.reach)} m of it move ${pct(BOG_TROPHY.slowBp)}% slower.` },
  {
    id: LootEffect.VictorsTrophy,
    name: "Victor's trophy",
    items: [Res.MorvathStaff],
    text: `Place it anywhere as a trophy: your units within ${metres(VICTORS_TROPHY.reach)} m of it gain ${pct(VICTORS_TROPHY.bonusBp)}% damage, protection, attack speed, move speed, work speed and spell power.`,
  },
  {
    id: LootEffect.GraveGuard,
    name: 'Grave guard',
    items: [Res.DeathlessShroud],
    text: `When the mage wearing it takes damage, a skeleton archer with ${GRAVE_GUARD.hp} health rises beside the mage to fight for you for ${seconds(GRAVE_GUARD.lifeSteps)} s, at most one every ${seconds(GRAVE_GUARD.everySteps)} s. The wearer cannot be poisoned, slowed, hexed, sickened, rooted or cursed.`,
  },
];

export function lootEffectSpec(fx: number): EffectSpec | undefined {
  return fx > 0 ? LOOT_EFFECTS[fx] : undefined;
}

/** The effect a gear row carries (LootEffect.None for none). */
export function gearEffect(gear: number): number {
  return gear ? (GEAR[gear]?.effect ?? LootEffect.None) : LootEffect.None;
}

/** The effect a good carries, in hand or worn or as a trophy (LootEffect.None for none): for the hover over an item in the stock or a bag. */
export function itemEffect(res: number): number {
  for (const s of LOOT_EFFECTS) if (s.items.includes(res as Res)) return s.id;
  return LootEffect.None;
}

/** The trophy a building kind is: its effect, or LootEffect.None for every other building. */
export function trophyEffect(kind: number): number {
  if (kind === BuildingKind.BogTrophy) return LootEffect.BogTrophy;
  if (kind === BuildingKind.VictorsTrophy) return LootEffect.VictorsTrophy;
  return LootEffect.None;
}

/** How far a trophy's effect reaches round it, wu (0 for a building that is no trophy). */
export function trophyReach(kind: number): number {
  const fx = trophyEffect(kind);
  return fx === LootEffect.BogTrophy ? BOG_TROPHY.reach : fx === LootEffect.VictorsTrophy ? VICTORS_TROPHY.reach : 0;
}

/** Whether a unit holds or wears a piece with an effect: its weapon (a mage's wand), its bow or gun, its shield or its armour (a mage's robe). */
export function wields(state: SimState, i: number, fx: number): boolean {
  const e = state.entities;
  return gearEffect(e.weapon[i]!) === fx || gearEffect(e.ranged[i]!) === fx || gearEffect(e.shield[i]!) === fx || gearEffect(e.armour[i]!) === fx;
}

/** One of the players' units (a worker, a troop or a mage; not an animal or an engine). */
function ours(state: SimState, i: number): boolean {
  const e = state.entities;
  const k = e.kind[i];
  return e.owner[i]! < state.players.length && (k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage);
}

/** Not state: each building store's trophies, looked for again whenever its list changes (BuildingStore.rev). */
const trophyLists = new WeakMap<BuildingStore, { rev: number; list: Building[] }>();

function trophies(state: SimState): readonly Building[] {
  const store = state.buildings;
  let c = trophyLists.get(store);
  if (!c || c.rev !== store.rev) {
    c = { rev: store.rev, list: store.list.filter((b) => buildingSpec(b.kind).trophy !== undefined) };
    trophyLists.set(store, c);
  }
  return c.list;
}

/** Whether a finished trophy of a kind stands within its reach of a point (wu), whoever's it is. */
export function nearTrophy(state: SimState, kind: number, x: number, z: number): boolean {
  const list = trophies(state);
  if (list.length === 0) return false;
  const r = trophyReach(kind);
  for (const b of list) {
    if (b.kind !== kind || !b.complete || b.hp <= 0) continue;
    const [bx, bz] = buildingCentre(b);
    if (dist2(x, z, bx, bz) <= r * r) return true;
  }
  return false;
}

/** Victor's trophy on one of the players' units: its bonus, bp, while it stands in reach of one. */
function victorBp(state: SimState, i: number): number {
  if (!ours(state, i)) return 0;
  const e = state.entities;
  return nearTrophy(state, BuildingKind.VictorsTrophy, e.x[i]!, e.z[i]!) ? VICTORS_TROPHY.bonusBp : 0;
}

/** Warlord on one of the players' troops: its bonus, bp, while it or a troop of the players within reach holds the archfiend's greatsword. */
function warlordBp(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Warrior || !ours(state, i)) return 0;
  if (gearEffect(e.weapon[i]!) === LootEffect.Warlord) return WARLORD.damageBp;
  const r = WARLORD.reach;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.hp[j]! <= 0 || gearEffect(e.weapon[j]!) !== LootEffect.Warlord || !ours(state, j)) continue;
    if (dist2(e.x[i]!, e.z[i]!, e.x[j]!, e.z[j]!) <= r * r) return WARLORD.damageBp;
  }
  return 0;
}

/** More damage a unit deals, bp: Warlord for the players' troops near the archfiend's greatsword, and Victor's trophy. */
export function effectDamageBp(state: SimState, i: number): number {
  return warlordBp(state, i) + victorBp(state, i);
}

/** How much faster a unit attacks, bp: Fury with the fiend's cleaver below half health, and Victor's trophy. */
export function effectAttackBp(state: SimState, i: number): number {
  if (!ours(state, i)) return 0;
  const e = state.entities;
  const fury = gearEffect(e.weapon[i]!) === LootEffect.Fury && e.hp[i]! * 1000 < e.maxHp[i]! * FURY.underPm ? FURY.attackBp : 0;
  return fury + victorBp(state, i);
}

/** Protection a unit gains, bp, as one more piece of armour (still under the armour cap): Victor's trophy. */
export function effectArmourBp(state: SimState, i: number): number {
  return victorBp(state, i);
}

/** How much faster a unit moves, bp: Reaper with the Elf glaive, and Victor's trophy. */
export function effectMoveBp(state: SimState, i: number): number {
  if (!ours(state, i)) return 0;
  return (gearEffect(state.entities.weapon[i]!) === LootEffect.Reaper ? REAPER.moveBp : 0) + victorBp(state, i);
}

/** How much faster a worker works, bp (gathering, building, repairing, upgrading and digging): Victor's trophy. */
export function effectWorkBp(state: SimState, i: number): number {
  return victorBp(state, i);
}

/** Spell power a mage gains, bp: Victor's trophy. */
export function effectSpellBp(state: SimState, i: number): number {
  return victorBp(state, i);
}

/** Sight a unit gains, wu: Far sight with the Elf longbow, at dusk and night. */
export function effectSightWu(state: SimState, i: number): number {
  if (gearEffect(state.entities.ranged[i]!) !== LootEffect.FarSight || !ours(state, i)) return 0;
  return isDark(state.step) ? FAR_SIGHT.darkSight : 0;
}

/** The share of armour a unit's shots ignore, bp: Far sight with the Elf longbow. */
export function shotArmourCutBp(state: SimState, i: number): number {
  return gearEffect(state.entities.ranged[i]!) === LootEffect.FarSight && ours(state, i) ? FAR_SIGHT.armourCutBp : 0;
}

/** A monster of the night: marching on a town, sent for a point, or wandering the wild (threats/types.ts Role). */
function nightMob(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.owner[i] !== MONSTERS || e.kind[i] !== UnitKind.Mob) return false;
  const role = e.role[i];
  return role === Role.Night || role === Role.Aimed || role === Role.Wild;
}

/** How much slower a monster moves, bp: a night monster within reach of a bog trophy. */
export function mobSlowBp(state: SimState, i: number): number {
  if (!nightMob(state, i)) return 0;
  const e = state.entities;
  return nearTrophy(state, BuildingKind.BogTrophy, e.x[i]!, e.z[i]!) ? BOG_TROPHY.slowBp : 0;
}

/** Whether a unit is one of the players' mages wearing the whole Fae set: the Fae star wand and the Fae Guardian's robe. */
export function wearsFaeSet(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mage && gearEffect(e.weapon[i]!) === LootEffect.FaeSet && gearEffect(e.armour[i]!) === LootEffect.FaeSet && ours(state, i);
}

/** Whether a unit is one of the players' mages wearing the Deathless Shroud. */
export function wearsShroud(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mage && gearEffect(e.armour[i]!) === LootEffect.GraveGuard && ours(state, i);
}

/** Whether a unit is a skeleton archer the Deathless Shroud raised (Role.Risen). */
export function isRisen(state: SimState, i: number): boolean {
  return state.entities.role[i] === Role.Risen;
}

/** Whether nothing that lingers on a unit can take hold of it (the Deathless Shroud's wearer): for those that put one on at once, as the Root spell. */
export function debuffImmune(state: SimState, i: number): boolean {
  return wearsShroud(state, i);
}

/**
 * Takes every debuff off the Shroud's wearer (s: what lingers on a unit and
 * does it harm): poison, venom and burning, the slows of a grasp, a web or a
 * sting, a hex, a miasma's sickness, entangling roots and Touch of the
 * Grave. A grab, a toss or a slime's engulf is a blow, not a debuff, and
 * still lands.
 */
function cleanse(state: SimState, i: number): void {
  const e = state.entities;
  e.slowUntil[i] = 0;
  e.slowBp[i] = 0;
  e.hexUntil[i] = 0;
  e.dotUntil[i] = 0;
  e.dotLeft[i] = 0;
  e.sickUntil[i] = 0;
  const id = e.id[i]!;
  if (markOn(state, id, MarkKind.Roots) >= 0) {
    dropMark(state, id, MarkKind.Roots);
    e.heldUntil[i] = 0;
  }
  dropMark(state, id, MarkKind.Grave);
}

/** Where a risen archer may stand beside its mage, tried in turn, wu: a metre to one side, then the others. */
const BESIDE: ReadonlyArray<readonly [number, number]> = [[WU_PER_METRE, 0], [-WU_PER_METRE, 0], [0, WU_PER_METRE], [0, -WU_PER_METRE]];

/** A skeleton archer rises beside the Shroud's wearer w (Grave guard): its player's, as the skeleton archer is, with the skeleton archer's bow. Returns its index. */
function raiseArcher(state: SimState, w: number): number {
  const e = state.entities;
  const spec = mobSpec(Mob.SkeletonArcher);
  let x = e.x[w]!;
  let z = e.z[w]!;
  for (const [dx, dz] of BESIDE) {
    if (!state.nav.standable(floorDiv(x + dx, WU_PER_COLUMN), floorDiv(z + dz, WU_PER_COLUMN), WALKER)) continue;
    x += dx;
    z += dz;
    break;
  }
  const j = e.add(state.nextEntityId++, e.owner[w]!, x, standY(state, x, z), z, spec.speed, UnitKind.Warrior);
  e.troop[j] = Troop.Ranger;
  e.mob[j] = Mob.SkeletonArcher;
  e.role[j] = Role.Risen;
  e.hp[j] = GRAVE_GUARD.hp;
  e.maxHp[j] = GRAVE_GUARD.hp;
  e.ranged[j] = RISEN_BOW_GEAR;
  e.homeX[j] = x;
  e.homeZ[j] = z;
  e.heading[j] = e.heading[w]!;
  // When it falls (abilityAt is a monster's clock, never a player's troop's).
  e.abilityAt[j] = state.step + GRAVE_GUARD.lifeSteps;
  state.grid.insert(e, j);
  return j;
}

/** Steps a unit out of the building it is in (units/behaviour.ts leaveBuilding), installed by step.ts: this module loads before that one. */
export const risenHooks: { leave: (state: SimState, i: number) => void } = { leave: () => {} };

/** A risen archer's time is up: it drops to 0 health at once and dies as any unit does (settleDeaths), out in the open so its fall is seen. */
function fallRisen(state: SimState, i: number): void {
  const e = state.entities;
  if (e.inside[i] !== 0) risenHooks.leave(state, i);
  e.hp[i] = 0;
  state.dying.push(e.id[i]!);
}

/**
 * Every step: the Deathless Shroud keeps debuffs off its wearers and raises
 * a skeleton archer for one hurt since the last step, once its 12 s are up
 * (abilityAt, unused by the players' mages, holds when the next may rise; a
 * mage sheltering inside raises none); a risen archer whose time is up
 * falls. Then, every few seconds (FAE_SET.everySteps), the Fae set heals.
 */
export function updateLootEffects(state: SimState): void {
  const e = state.entities;
  const now = state.step;
  let raise: number[] | null = null;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0) continue;
    if (e.role[i] === Role.Risen) {
      if (e.abilityAt[i]! <= now) fallRisen(state, i);
      continue;
    }
    if (!wearsShroud(state, i)) continue;
    cleanse(state, i);
    // Hurt this step, or last step after this ran; and not before its last archer's 12 s were up.
    const hurt = e.hurtAt[i]!;
    if (hurt !== 0 && hurt + 1 >= now && hurt >= e.abilityAt[i]! && e.inside[i] === 0) (raise ??= []).push(i);
  }
  for (const w of raise ?? []) {
    e.abilityAt[w] = now + GRAVE_GUARD.everySteps;
    raiseArcher(state, w);
  }
  if (now % FAE_SET.everySteps === 0) faeHeal(state);
}

/**
 * Each of the players' mages out in the open wearing the whole Fae set heals
 * the players' units round the mage, the mage too, once each however many
 * such mages are near (no two copies of an effect count twice). A unit
 * sheltering inside a building is out of reach.
 */
function faeHeal(state: SimState): void {
  const e = state.entities;
  const healed = new Set<number>();
  const r = FAE_SET.reach;
  for (let m = 0; m < e.count; m++) {
    if (e.hp[m]! <= 0 || e.inside[m] !== 0 || !wearsFaeSet(state, m)) continue;
    for (const j of state.grid.nearOthers(e.x[m]!, e.z[m]!, r)) {
      if (healed.has(j) || e.hp[j]! <= 0 || e.hp[j]! >= e.maxHp[j]! || !ours(state, j)) continue;
      if (dist2(e.x[m]!, e.z[m]!, e.x[j]!, e.z[j]!) > r * r) continue;
      healed.add(j);
      e.hp[j] = Math.min(e.maxHp[j]!, e.hp[j]! + FAE_SET.heal);
    }
  }
}

/** A good the trophy at a building stands for (undefined for every other building): what goes back to the stock when it is picked up or knocked down. */
export function trophyItem(kind: number): Res | undefined {
  return buildingSpec(kind).trophy?.item;
}
