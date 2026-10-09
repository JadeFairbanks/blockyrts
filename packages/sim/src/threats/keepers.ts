// The keepers (Jade's Patch 5): a Bog guardian in every bog (MB-11, MB-12)
// and a Fae Guardian over every large mana crystal (MF-1 to MF-12). Neither
// goes for anyone until it is wronged.
//
// The Bog guardian wanders his bog and greets the players' units that come
// into it, asking them not to disturb it. When one of them goes to take
// something from the bog he is outraged, and the gatherer stops and asks its
// player whether to carry on and risk angering him; that question and his
// bubble wait until it is answered. No, and he thanks them. Yes, or a blow
// struck at him, and he roars and runs down the one who wronged him. Once it
// is dead or out of his reach he asks every player to promise to leave his
// bog alone, running about it, alarmed now and then, until one answers. Yes,
// and there is peace again; No, and he goes to war on every player, units and
// bases, saying why as he goes. He walks slower than a walking worker and
// runs faster than a running one, and heals 2 a second on his bog, 1 off it.
//
// The Fae Guardian hovers low over her crystal (a polearm reaches her) and
// warns off those who come near. One that goes to mine it asks first, as at a
// bog, while she says "Don't you dare even touch my crystal, worm!"; Yes, and
// she kills whoever mines it. A blow struck at her and she is wrathful for
// good: high and fast (only bows, guns and spells reach her), going for every
// player's unit near her crystal. She heals 1 a second once nothing has hurt
// her for 10 s.
//
// Like the mana crystals' guardians (threats/guardians.ts) each comes when one
// of the players' units first comes within 60 m of its bog or crystal (s),
// and never comes back once killed: what it kept is marked in
// state.threats.guarded. Their questions are not state (units/questions.ts):
// a loaded game asks again whatever its keepers were waiting on. Lines are in
// threats/keeper-lines.ts, drops here (keeperLoot), picks in
// blueprint/patch5-mobs-picks.md.

import { COLUMNS_PER_CHUNK, floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { forward, Side, sideOf } from '../combat/combat.ts';
import { addMob, attackBuilding, engageUnit, walkMob } from '../combat/mob-ai.ts';
import { Mob, mobSpec, type MobSpec } from '../combat/mobs.ts';
import { Res, trinketRes, TRINKET_METALS } from '../economy/resources.ts';
import { WALKER } from '../nav/grid.ts';
import { hash32 } from '../rng.ts';
import type { AnswerOrder } from '../orders.ts';
import { say, sayForeign } from '../peoples/speech.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { giveOrder, stopUnit } from '../units/behaviour.ts';
import { ROBE_KITS, TOP_MAGE_TIER, WAND_KITS } from '../units/kits.ts';
import { answerKinds, askForever, asksOf, closeAsksBy } from '../units/questions.ts';
import { bogGuarded } from '../world/generate.ts';
import { metresToColumns } from '../world/layout.ts';
import { PropKind, propInfo, PropShape } from '../world/props.ts';
import { colKey } from '../world/world.ts';
import { nearestBuilding } from './foes.ts';
import { BOG_BUTTONS, BOG_LINES, FAE_BUTTONS, FAE_LINES } from './keeper-lines.ts';
import type { Rolled } from './loot.ts';
import { necromancerHooks } from './necromancer.ts';
import { Role, type Keeper } from './types.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

export const KeeperKind = { Bog: 0, Fae: 1 } as const;
export type KeeperKind = (typeof KeeperKind)[keyof typeof KeeperKind];

/**
 * What a keeper is doing. The Bog guardian: Calm, Asking (a gatherer's
 * question is up), Angry (after the one who wronged him), Pleading (his
 * promise is up) and War. The Fae Guardian: Calm, Asking, Defending (after a
 * thief) and Wrath (for good).
 */
export const KeeperMode = { Calm: 0, Asking: 1, Angry: 2, Pleading: 3, War: 4, Defending: 5, Wrath: 6 } as const;
export type KeeperMode = (typeof KeeperMode)[keyof typeof KeeperMode];

/** Their questions (units/questions.ts Ask keeps 1 to 9, GreyAsk 10 to 15, night work 16, WorkAsk 17 to 19, the Barn hand 24, the Workshop 30). */
export const KeeperAsk = {
  /** A gatherer at a bog or a fairy's crystal: carry on and risk angering its keeper? */
  Gather: 27,
  /** The Bog guardian, to every player: do you promise to leave my bog alone? */
  Promise: 28,
} as const;

/** Their numbers (Jade's where she gave them; the rest picks, in blueprint/patch5-mobs-picks.md). */
export const KEEPERS = {
  /** They come when one of the players' units first comes within this many metres of the bog or crystal (s, as MB-13's). */
  wakeM: 60,
  /** Looked for this often, steps (s). */
  wakeEverySteps: 2 * SEC,
  /** A gatherer within this many metres of what it gathers is trying to take it (s). */
  gatherM: 4,
  bog: {
    /** His run (s: 4.2 m/s against his 1.6 m/s walk; a running worker goes 3.57 m/s): his speed's extra, basis points. */
    runBp: 16250,
    /** MB-11: "regenerates 2hp per second when standing on bog, but only one per second if not on bog". */
    regenOnBog: 2,
    regenOffBog: 1,
    /** He greets newcomers to his bog at most once in this long, seconds (s). */
    greetGapS: 30,
    /** He gives up on the one who wronged him this many metres from his bog's middle (s), and pleads. */
    leashM: 50,
    /** He roars this long before he runs, steps (s: his clip's length). */
    roarSteps: floorDiv(3 * SEC, 2),
    /** A new spot to wander to every so many seconds: calm, and running about while he pleads (s). */
    wanderS: [8, 15],
    pleadWanderS: [3, 6],
    /** MB-11: "does alarm animation every 5-20 seconds" while his promise is up. */
    alarmS: [5, 20],
    /** A chasing line every so many seconds (s); a war line every 10 to 15 (s). */
    chaseLineS: 10,
    warLineS: [10, 15],
    /** At war he fights the players' units within this many metres of him on his way to their buildings (s). */
    warSightM: 20,
  },
  fae: {
    /** Her haste while she goes for a thief (s: her calm 2 m/s to her wrathful 4.5 m/s): basis points. */
    runBp: 12500,
    /** In her wrath she goes for the players' units within this many metres of her crystal, and chases no farther from it (s). */
    sightM: 22,
    leashM: 30,
    /** MF-5: "regenerates at 1 per second when it hasn't been attacked for at least 10 seconds". */
    regen: 1,
    restS: 10,
    /** She hovers within this many metres of her crystal (s). */
    hoverM: 4,
    wanderS: [5, 10],
    /** She warns the players' units within this many metres of her crystal, at most once in this long (s). */
    warnM: 20,
    warnGapS: 30,
    /** A line in her wrath every so many seconds while anyone is near (s). */
    fightLineS: [10, 14],
  },
} as const;

/** One of a keeper's lines, the same on every machine. */
function pick<T>(state: SimState, k: Keeper, lines: readonly T[], salt: number): T {
  return lines[hash32(state.seed ^ 0x6b656570, k.id, state.step, salt) % lines.length]!;
}

/** A step within a range of seconds from now, the same on every machine. */
function within(state: SimState, k: Keeper, [lo, hi]: readonly [number, number], salt: number): number {
  return state.step + lo * SEC + (hash32(state.seed ^ 0x77686e, k.id, state.step, salt) % ((hi - lo) * SEC + 1));
}

/** One of the players' own units, alive and outside (the peoples' are not the keepers' business). */
function playersOwn(state: SimState, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.inside[j] === 0 && sideOf(state, j) === Side.Players && e.kind[j] !== UnitKind.Animal;
}

function keeperOf(state: SimState, id: number): Keeper | undefined {
  return state.threats.keepers.find((k) => k.id === id);
}

// ----- coming -----

/** Not state: the large mana crystals a chunk was made with, as [column x, column z, prop index]; the land a seed makes never changes. */
const crystalCache = new WeakMap<object, Map<number, Array<readonly [number, number, number]>>>();

function largeCrystalsIn(state: SimState, cx: number, cz: number): ReadonlyArray<readonly [number, number, number]> {
  let m = crystalCache.get(state.world);
  if (!m) {
    m = new Map();
    crystalCache.set(state.world, m);
  }
  const key = cx * 0x10000 + cz;
  let list = m.get(key);
  if (!list) {
    list = [];
    const records = state.world.propRecords(cx, cz);
    for (let k = 0; k < records.length; k++) {
      const r = records[k]!;
      if (r.kind === PropKind.LargeManaCrystal) list.push([cx * COLUMNS_PER_CHUNK + r.lx, cz * COLUMNS_PER_CHUNK + r.lz, k]);
    }
    m.set(key, list);
  }
  return list;
}

/** A column's middle, wu. */
function wuOf(c: number): number {
  return c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
}

/** Where a walker can stand at or round a column, wu: the column itself if none is found. */
function standAt(state: SimState, gx: number, gz: number): [number, number] {
  for (let d = 0; d <= 6; d++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        if (state.nav.standable(gx + dx, gz + dz, WALKER)) return [wuOf(gx + dx), wuOf(gz + dz)];
      }
    }
  }
  return [wuOf(gx), wuOf(gz)];
}

function addKeeper(state: SimState, kind: KeeperKind, mob: Mob, foe: number, x: number, z: number, at: [number, number], r: number): void {
  const e = state.entities;
  // Night 0: Jade's numbers as they stand, however late in the game it comes.
  const i = addMob(state, mob, foe, at[0], at[1], 0);
  e.role[i] = Role.Keeper;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  state.threats.keepers.push({
    id: e.id[i]!, kind, x, z, r, mode: KeeperMode.Calm, unit: 0, cx: 0, cz: 0, pi: 0, next: 0, roam: 0, greeted: -KEEPERS.bog.greetGapS * SEC, seen: 0,
    since: state.step, still: 0, riled: 0,
  });
}

/**
 * Every 2 s: each bog over 18 m2 (bogGuarded) and large mana crystal one
 * of the players' units has come within 60 m of for the first time gets its
 * keeper (none in a peaceful game), and is kept from then on.
 */
function wakeKeepers(state: SimState): void {
  const e = state.entities;
  const gen = state.world.gen;
  const guarded = state.threats.guarded;
  const reach = metresToColumns(KEEPERS.wakeM);
  const looked = new Set<number>();
  for (let j = 0; j < e.count; j++) {
    const o = e.owner[j]!;
    if (o >= state.players.length || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.kind[j] === UnitKind.Animal) continue;
    const gx = floorDiv(e.x[j]!, WU_PER_COLUMN);
    const gz = floorDiv(e.z[j]!, WU_PER_COLUMN);
    // One look from each 8-column square the players' units stand in.
    const tile = colKey(gx >> 3, gz >> 3);
    if (looked.has(tile)) continue;
    looked.add(tile);
    for (const bog of gen.bogsNear(gx, gz, reach)) {
      const key = colKey(bog.x, bog.z);
      if (guarded.has(key) || !bogGuarded(bog)) continue;
      guarded.add(key);
      addKeeper(state, KeeperKind.Bog, Mob.BogGuardian, o, wuOf(bog.x), wuOf(bog.z), standAt(state, bog.x, bog.z), bog.r * WU_PER_COLUMN);
    }
    for (const spot of gen.crystalsNear(gx, gz, reach)) {
      for (const [cx, cz, k] of largeCrystalsIn(state, spot.x >> 6, spot.z >> 6)) {
        if (Math.abs(cx - spot.x) > 4 || Math.abs(cz - spot.z) > 4) continue;
        const key = colKey(cx, cz);
        if (guarded.has(key)) continue;
        guarded.add(key);
        if ((state.world.prop(spot.x >> 6, spot.z >> 6, k, state.step)?.amount ?? 0) <= 0) continue;
        addKeeper(state, KeeperKind.Fae, Mob.FaeGuardian, o, wuOf(cx), wuOf(cz), [wuOf(cx), wuOf(cz)], 0);
      }
    }
  }
}

// ----- what they keep -----

/** Whether a column lies in what a keeper keeps: within the bog's reach and a metre, or the fairy's crystal itself. */
function keeps(k: Keeper, gx: number, gz: number): boolean {
  if (k.kind === KeeperKind.Fae) return floorDiv(k.x, WU_PER_COLUMN) === gx && floorDiv(k.z, WU_PER_COLUMN) === gz;
  return length2d(wuOf(gx) - k.x, wuOf(gz) - k.z) <= k.r + M;
}

/** What a unit's head order gathers, if it lies in what the keeper keeps and the unit is within 4 m of it: the order and the prop's kind. */
function takingFrom(state: SimState, k: Keeper, j: number): { cx: number; cz: number; i: number; kind: number } | null {
  const e = state.entities;
  const o = e.queue[j]![0];
  if (!o || o.t !== 'gather') return null;
  const r = state.world.propRecords(o.cx, o.cz)[o.i];
  if (!r) return null;
  const gx = o.cx * COLUMNS_PER_CHUNK + r.lx;
  const gz = o.cz * COLUMNS_PER_CHUNK + r.lz;
  if (!keeps(k, gx, gz) || length2d(wuOf(gx) - e.x[j]!, wuOf(gz) - e.z[j]!) > KEEPERS.gatherM * M) return null;
  return { cx: o.cx, cz: o.cz, i: o.i, kind: r.kind };
}

/** The players' units taking from what a keeper keeps now, by index (lowest id first). */
function takers(state: SimState, k: Keeper): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (const j of state.grid.nearOthers(k.x, k.z, k.r + (KEEPERS.gatherM + 2) * M)) if (playersOwn(state, j) && takingFrom(state, k, j)) out.push(j);
  return out.sort((a, b) => e.id[a]! - e.id[b]!);
}

/** "digging up", "picking up": how a prop is taken, for the lines. */
function verbOf(kind: number): string {
  if (kind === PropKind.SilverNugget) return 'picking up';
  const shape = propInfo(kind).shape;
  if (shape === PropShape.Patch) return 'digging up';
  if (shape === PropShape.Tree) return 'chopping down';
  if (shape === PropShape.Rocks || shape === PropShape.Crystal) return 'mining';
  return 'picking';
}

function fill(line: string, kind: number): string {
  return line.replaceAll('{item}', propInfo(kind).name.toLowerCase()).replaceAll('{verb}', verbOf(kind));
}

/** A player's unit that wronged a keeper since its mode last changed (a blow in the last 5 s), or -1. */
function wronged(state: SimState, i: number, k: Keeper): number {
  const e = state.entities;
  if (!e.attacker[i] || e.hurtAt[i]! <= k.since || state.step - e.hurtAt[i]! > 5 * SEC) return -1;
  const a = e.indexOf(e.attacker[i]!);
  return a >= 0 && playersOwn(state, a) ? a : -1;
}

// ----- turning -----

function setMode(state: SimState, k: Keeper, mode: KeeperMode): void {
  // Whatever it was waiting on is over (not state: the questions).
  if (k.mode === KeeperMode.Asking && k.unit) closeAsksBy(state, k.unit, [KeeperAsk.Gather]);
  if (k.mode === KeeperMode.Pleading) closeAsksBy(state, k.id, [KeeperAsk.Promise]);
  k.mode = mode;
  k.since = state.step;
}

/** A unit started to take from what a keeper keeps: it stops and asks its player; the keeper is outraged until the answer. */
function ask(state: SimState, i: number, k: Keeper, j: number): void {
  const e = state.entities;
  const what = takingFrom(state, k, j)!;
  setMode(state, k, KeeperMode.Asking);
  k.unit = e.id[j]!;
  k.cx = what.cx;
  k.cz = what.cz;
  k.pi = what.i;
  stopUnit(state, j);
  state.hits.push({ look: 'alarm', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
  putAsk(state, i, k, j, what.kind);
}

/** The gatherer's question and the keeper's words while it waits (not state: put up again after a load). */
function putAsk(state: SimState, i: number, k: Keeper, j: number, kind: number): void {
  const e = state.entities;
  const bog = k.kind === KeeperKind.Bog;
  sayForeign(state, i, bog ? fill(pick(state, k, BOG_LINES.outraged, 1), kind) : FAE_LINES.touch, true, -1, 0, 'held');
  askForever(state, {
    player: e.owner[j]!, who: e.id[j]!, building: false, q: KeeperAsk.Gather, units: [e.id[j]!],
    text: fill(pick(state, k, bog ? BOG_LINES.ask : FAE_LINES.ask, 2), kind), yes: bog ? BOG_BUTTONS.askYes : FAE_BUTTONS.askYes, no: bog ? BOG_BUTTONS.askNo : FAE_BUTTONS.askNo,
  });
}

/** He roars and goes for the one who wronged him. */
function anger(state: SimState, i: number, k: Keeper, t: number): void {
  const e = state.entities;
  setMode(state, k, KeeperMode.Angry);
  k.unit = e.id[t]!;
  k.still = state.step + KEEPERS.bog.roarSteps;
  k.next = state.step + KEEPERS.bog.chaseLineS * SEC;
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  state.hits.push({ look: 'roar', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
  sayForeign(state, i, BOG_LINES.roar, true);
}

/** He asks every player for the promise, running about his bog. */
function plead(state: SimState, i: number, k: Keeper): void {
  setMode(state, k, KeeperMode.Pleading);
  k.unit = 0;
  k.next = within(state, k, KEEPERS.bog.alarmS, 3);
  k.roam = 0;
  state.entities.target[i] = 0;
  putPleas(state, i, k);
}

/** His promise, to every player still in who has not got it up (not state: asked again after a load). */
function putPleas(state: SimState, i: number, k: Keeper): void {
  for (let p = 0; p < state.players.length; p++) {
    if (state.players[p]!.out || asksOf(state, k.id, p, KeeperAsk.Promise)) continue;
    askForever(state, { player: p, who: k.id, building: false, q: KeeperAsk.Promise, units: [], text: BOG_LINES.promise, yes: BOG_BUTTONS.promiseYes, no: BOG_BUTTONS.promiseNo, foreign: true });
  }
}

/** The Fae Guardian flies high (out of a polearm's reach, and faster) or comes back down to her crystal. */
function fly(state: SimState, i: number, high: boolean): void {
  const e = state.entities;
  const mob = high ? Mob.FaeGuardianAloft : Mob.FaeGuardian;
  if (e.mob[i] === mob) return;
  e.mob[i] = mob;
  e.speed[i] = mobSpec(mob).speed;
}

/** She goes for a thief, or (wrathful) for everyone, and is riled for good. */
function rile(state: SimState, i: number, k: Keeper, t: number, wrath: boolean): void {
  const e = state.entities;
  // MF-3: "When aggroed, it flies higher, only able to be hit by ranged": for good in her wrath, while she goes for a thief otherwise.
  fly(state, i, true);
  if (wrath) {
    setMode(state, k, KeeperMode.Wrath);
    k.unit = 0;
    sayForeign(state, i, pick(state, k, FAE_LINES.wrath, 4), true);
    k.next = within(state, k, KEEPERS.fae.fightLineS, 5);
  } else {
    setMode(state, k, KeeperMode.Defending);
    k.unit = e.id[t]!;
    sayForeign(state, i, pick(state, k, FAE_LINES.thief, 6), true);
  }
  k.riled = 1;
  e.target[i] = t >= 0 ? e.id[t]! : 0;
}

// ----- each step -----

/** The Bog guardian's turns: what he notices, says and feels this step. */
function tendBog(state: SimState, i: number, k: Keeper, second: boolean): void {
  const e = state.entities;
  const b = KEEPERS.bog;
  const a = wronged(state, i, k);
  switch (k.mode) {
    case KeeperMode.Calm: {
      if (a >= 0) return anger(state, i, k, a);
      const t = takers(state, k);
      if (t.length > 0) return ask(state, i, k, t[0]!);
      if (!second) return;
      // A newcomer to his bog: a greeting, at most once in 30 s.
      let near = 0;
      for (const j of state.grid.nearOthers(k.x, k.z, k.r + 2 * M)) {
        if (playersOwn(state, j) && length2d(e.x[j]! - k.x, e.z[j]! - k.z) <= k.r + 2 * M) {
          near = 1;
          break;
        }
      }
      if (near && !k.seen && state.step - k.greeted >= b.greetGapS * SEC) {
        sayForeign(state, i, pick(state, k, BOG_LINES.greet, 7), true);
        k.greeted = state.step;
      }
      k.seen = near;
      return;
    }
    case KeeperMode.Asking: {
      const u = e.indexOf(k.unit);
      if (u < 0 || e.hp[u]! <= 0 || state.players[e.owner[u]!]?.out || length2d(e.x[u]! - k.x, e.z[u]! - k.z) > k.r + b.leashM * M) {
        setMode(state, k, KeeperMode.Calm);
        k.unit = 0;
        // His held words give way to these.
        sayForeign(state, i, pick(state, k, BOG_LINES.gone, 16), true);
        return;
      }
      if (a >= 0) return anger(state, i, k, a);
      holdOthers(state, k, BOG_LINES.wait);
      if (second && !asksOf(state, k.unit, e.owner[u]!, KeeperAsk.Gather)) putAsk(state, i, k, u, propKindAt(state, k));
      return;
    }
    case KeeperMode.Angry: {
      const t = e.indexOf(k.unit);
      // The one who wronged him is dead, hid or got away: he stops and asks for the promise.
      if (t < 0 || !playersOwn(state, t) || length2d(e.x[t]! - k.x, e.z[t]! - k.z) > b.leashM * M) return plead(state, i, k);
      if (state.step >= k.next && state.step >= k.still) {
        sayForeign(state, i, pick(state, k, BOG_LINES.chase, 8), false);
        k.next = state.step + b.chaseLineS * SEC;
      }
      return;
    }
    case KeeperMode.Pleading: {
      if (a >= 0) return anger(state, i, k, a);
      // Taking from his bog while he waits for the promise breaks the peace at once.
      const t = takers(state, k);
      if (t.length > 0) return anger(state, i, k, t[0]!);
      if (state.step >= k.next) {
        state.hits.push({ look: 'alarm', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
        k.next = within(state, k, b.alarmS, 9);
      }
      if (second) putPleas(state, i, k);
      return;
    }
    case KeeperMode.War: {
      if (state.step >= k.next) {
        sayForeign(state, i, pick(state, k, BOG_LINES.war, 10), true);
        k.next = within(state, k, b.warLineS, 11);
      }
      return;
    }
  }
}

/** The Fae Guardian's turns. */
function tendFae(state: SimState, i: number, k: Keeper, second: boolean): void {
  const e = state.entities;
  const f = KEEPERS.fae;
  const a = wronged(state, i, k);
  if (a >= 0 && k.mode !== KeeperMode.Wrath) return rile(state, i, k, a, true);
  switch (k.mode) {
    case KeeperMode.Calm: {
      const t = takers(state, k);
      if (t.length > 0) return ask(state, i, k, t[0]!);
      if (!second) return;
      let near = 0;
      for (const j of state.grid.nearOthers(k.x, k.z, f.warnM * M)) {
        if (playersOwn(state, j) && length2d(e.x[j]! - k.x, e.z[j]! - k.z) <= f.warnM * M) {
          near = 1;
          break;
        }
      }
      if (near && !k.seen && state.step - k.greeted >= f.warnGapS * SEC) {
        sayForeign(state, i, pick(state, k, FAE_LINES.warn, 12), true);
        k.greeted = state.step;
      }
      k.seen = near;
      return;
    }
    case KeeperMode.Asking: {
      const u = e.indexOf(k.unit);
      if (u < 0 || e.hp[u]! <= 0 || state.players[e.owner[u]!]?.out || length2d(e.x[u]! - k.x, e.z[u]! - k.z) > f.leashM * M) {
        setMode(state, k, KeeperMode.Calm);
        k.unit = 0;
        sayForeign(state, i, pick(state, k, FAE_LINES.gone, 17), true);
        return;
      }
      holdOthers(state, k, FAE_LINES.wait);
      if (second && !asksOf(state, k.unit, e.owner[u]!, KeeperAsk.Gather)) putAsk(state, i, k, u, PropKind.LargeManaCrystal);
      return;
    }
    case KeeperMode.Defending: {
      const t = e.indexOf(k.unit);
      if (t >= 0 && playersOwn(state, t) && length2d(e.x[t]! - k.x, e.z[t]! - k.z) <= f.leashM * M) return;
      if (t >= 0 && e.hp[t]! <= 0) sayForeign(state, i, pick(state, k, FAE_LINES.killed, 13), true);
      // The next thief, else she settles again.
      const next = takers(state, k);
      if (next.length > 0) {
        k.unit = e.id[next[0]!]!;
        return;
      }
      setMode(state, k, KeeperMode.Calm);
      fly(state, i, false);
      k.unit = 0;
      e.target[i] = 0;
      return;
    }
    case KeeperMode.Wrath: {
      if (state.step >= k.next && e.target[i] !== 0) {
        sayForeign(state, i, pick(state, k, FAE_LINES.fight, 14), true);
        k.next = within(state, k, f.fightLineS, 15);
      }
      return;
    }
  }
}

/** While a keeper's question is up, the players' other units that go to take from what it keeps stop and say why. */
function holdOthers(state: SimState, k: Keeper, lines: readonly string[]): void {
  for (const j of takers(state, k)) {
    if (state.entities.id[j] === k.unit) continue;
    stopUnit(state, j);
    say(state, j, lines[state.entities.id[j]! % lines.length]!);
  }
}

/** The kind of the prop a keeper's gatherer was stopped at (its words after a load), else bog iron. */
function propKindAt(state: SimState, k: Keeper): number {
  return state.world.propRecords(k.cx, k.cz)[k.pi]?.kind ?? PropKind.BogIron;
}

/** Each step: keepers come, the fallen go, and each living one takes its turns; once a second they heal. */
export function updateKeepers(state: SimState): void {
  if (!state.peaceful && state.step % KEEPERS.wakeEverySteps === 5) wakeKeepers(state);
  const list = state.threats.keepers;
  if (list.length === 0) return;
  const e = state.entities;
  const second = state.step % SEC === 9;
  let kept = 0;
  for (const k of list) {
    const i = e.indexOf(k.id);
    if (i < 0 || e.hp[i]! <= 0) {
      setMode(state, k, KeeperMode.Calm);
      continue;
    }
    list[kept++] = k;
    if (k.kind === KeeperKind.Bog) tendBog(state, i, k, second);
    else tendFae(state, i, k, second);
    // Running (MB-11: his roar, then his run; MF-3: hers once riled) is haste on his walk.
    const runs = k.kind === KeeperKind.Bog ? k.mode === KeeperMode.Angry || k.mode === KeeperMode.Pleading || k.mode === KeeperMode.War : k.mode === KeeperMode.Defending;
    if (runs) {
      e.fastUntil[i] = state.step + 2;
      e.fastBp[i] = k.kind === KeeperKind.Bog ? KEEPERS.bog.runBp : KEEPERS.fae.runBp;
    }
    if (second && e.hp[i]! < e.maxHp[i]!) {
      let heal = 0;
      if (k.kind === KeeperKind.Bog) heal = length2d(e.x[i]! - k.x, e.z[i]! - k.z) <= k.r ? KEEPERS.bog.regenOnBog : KEEPERS.bog.regenOffBog;
      else if (state.step - e.hurtAt[i]! >= KEEPERS.fae.restS * SEC) heal = KEEPERS.fae.regen;
      e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + heal);
    }
  }
  list.length = kept;
}

// ----- moving and fighting (threats/foes.ts runs it) -----

/** A spot to wander to, round what it keeps, the same on every machine. */
function roamTo(state: SimState, i: number, k: Keeper, reach: number, every: readonly [number, number], spec: MobSpec): void {
  const e = state.entities;
  if (state.step >= k.roam) {
    const h = hash32(state.seed ^ 0x726f616d, k.id, state.step);
    const d = (h >>> 16) % Math.max(1, reach);
    const [fx, fz] = forward(h & 0xffff);
    e.targetX[i] = k.x + floorDiv(fx * d, 65536);
    e.targetZ[i] = k.z + floorDiv(fz * d, 65536);
    k.roam = within(state, k, every, 16);
  }
  if (walkMob(state, i, spec, e.targetX[i]!, e.targetZ[i]!)) e.order[i] = OrderKind.Idle;
}

/** The nearest of the players' own units within `r` of a point that passes `may` (ties to the lowest id), or -1. */
function nearestOwn(state: SimState, x: number, z: number, r: number, may: (j: number) => boolean = () => true): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.nearOthers(x, z, r)) {
    if (!playersOwn(state, j) || !may(j)) continue;
    const d = length2d(e.x[j]! - x, e.z[j]! - z);
    if (d > r) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

export function runKeeper(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const k = keeperOf(state, e.id[i]!);
  if (!k) return;
  const b = KEEPERS.bog;
  const f = KEEPERS.fae;
  if (state.step < k.still) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  const go = (t: number): void => {
    if (t >= 0) engageUnit(state, i, spec, t);
  };
  switch (k.mode) {
    case KeeperMode.Calm:
      e.target[i] = 0;
      return k.kind === KeeperKind.Bog ? roamTo(state, i, k, floorDiv(k.r * 3, 5), b.wanderS, spec) : roamTo(state, i, k, f.hoverM * M, f.wanderS, spec);
    case KeeperMode.Asking: {
      // Stock-still, glaring at the one taking from it.
      e.target[i] = 0;
      e.order[i] = OrderKind.Idle;
      const u = e.indexOf(k.unit);
      if (u >= 0) e.heading[i] = headingTowards(e.x[u]! - e.x[i]!, e.z[u]! - e.z[i]!);
      return;
    }
    case KeeperMode.Angry:
    case KeeperMode.Defending:
      return go(e.indexOf(k.unit));
    case KeeperMode.Pleading:
      e.target[i] = 0;
      return roamTo(state, i, k, floorDiv(k.r * 3, 5), b.pleadWanderS, spec);
    case KeeperMode.War: {
      // The players' units near him first, then their buildings, nearest first: every player's, to the last.
      const t = nearestOwn(state, e.x[i]!, e.z[i]!, b.warSightM * M);
      if (t >= 0) return go(t);
      e.target[i] = 0;
      const at = nearestBuilding(state, e.x[i]!, e.z[i]!, 0, () => true);
      if (at) return attackBuilding(state, i, spec, at);
      const far = nearestOwn(state, e.x[i]!, e.z[i]!, 400 * M);
      if (far >= 0) return go(far);
      return roamTo(state, i, k, floorDiv(k.r * 3, 5), b.wanderS, spec);
    }
    case KeeperMode.Wrath: {
      const leash = f.leashM * M;
      const inLeash = (j: number): boolean => length2d(e.x[j]! - k.x, e.z[j]! - k.z) <= leash;
      const had = e.target[i] ? e.indexOf(e.target[i]!) : -1;
      let t = had >= 0 && playersOwn(state, had) && inLeash(had) ? had : -1;
      if (t < 0) t = nearestOwn(state, k.x, k.z, f.sightM * M, inLeash);
      if (t >= 0) return go(t);
      e.target[i] = 0;
      return roamTo(state, i, k, f.hoverM * M, f.wanderS, spec);
    }
  }
}

// ----- answers -----

/** Yes or No to a keeper's question (units/questions.ts runs it once the question has closed), from what the order carries. */
function answerKeeper(state: SimState, o: AnswerOrder): void {
  const e = state.entities;
  if (o.q === KeeperAsk.Gather) {
    const k = state.threats.keepers.find((x) => x.mode === KeeperMode.Asking && x.unit === o.who);
    const j = e.indexOf(o.who);
    const i = k ? e.indexOf(k.id) : -1;
    if (!k || i < 0 || j < 0 || e.owner[j] !== o.player || e.hp[j]! <= 0) return;
    if (o.yes !== 1) {
      setMode(state, k, KeeperMode.Calm);
      k.unit = 0;
      sayForeign(state, i, pick(state, k, k.kind === KeeperKind.Bog ? BOG_LINES.thanks : FAE_LINES.spared, 17), true);
      return;
    }
    // Carry on: the gather order back, and the keeper goes for it.
    giveOrder(state, j, { t: 'gather', cx: k.cx, cz: k.cz, i: k.pi }, false);
    if (k.kind === KeeperKind.Bog) anger(state, i, k, j);
    else rile(state, i, k, j, false);
    return;
  }
  if (o.q === KeeperAsk.Promise) {
    const k = keeperOf(state, o.who);
    const i = k ? e.indexOf(k.id) : -1;
    if (!k || i < 0 || k.mode !== KeeperMode.Pleading || state.players[o.player]?.out) return;
    if (o.yes === 1) {
      setMode(state, k, KeeperMode.Calm);
      k.roam = 0;
      sayForeign(state, i, BOG_LINES.peace, true);
    } else {
      setMode(state, k, KeeperMode.War);
      k.next = state.step + SEC;
    }
  }
}

answerKinds.set(KeeperAsk.Gather, answerKeeper);
answerKinds.set(KeeperAsk.Promise, answerKeeper);

// ----- what they drop -----

/** MB-11's gemstones. */
const GEMS: readonly Res[] = [Res.Emeralds, Res.Rubies, Res.Diamonds];
/** MF-6's food (s): wild berries. */
const FAE_FOOD: readonly Res[] = [Res.BlackBerries, Res.Raspberries, Res.Blueberries];

/** Their drops (s where Jade gave no number), in blueprint/patch5-mobs-picks.md. */
export const KEEPER_LOOT = {
  /** Jade's answer 4 (decisions): "4-10 sets of bronze to iron armour, 10-15 silver ingots, 0-2 gold ingots, a bog pear, 3-10 assorted weapons of tier 3-5, and 0-1 random gemstones". */
  bog: { armourMin: 4, armourMax: 10, armourLow: 4, armourHigh: 6, silverMin: 10, silverMax: 15, goldMax: 2, weaponsMin: 3, weaponsMax: 10, weaponLow: 3, weaponHigh: 5, gemPm: 500 },
  /** MF-6 and MF-11: trinkets, mid level weapons and/or armour, food, 2 to 5 mana crystals, and one wand or robe of any tier. */
  fae: { trinketsMin: 1, trinketsMax: 2, gearMin: 1, gearMax: 2, gearLow: 3, gearHigh: 5, foodMin: 3, foodMax: 6, crystalsMin: 2, crystalsMax: 5 },
} as const;

/** A keeper's drops on the 'combat' stream, or null for any other mob (combat/deaths.ts). */
export function keeperLoot(state: SimState, mob: number): Rolled | null {
  const rng = state.rng.combat;
  const roll = (lo: number, hi: number): number => lo + rng.nextInt(hi - lo + 1);
  const out: Rolled = { items: [], rarestPm: 0 };
  if (mob === Mob.BogGuardian) {
    const l = KEEPER_LOOT.bog;
    for (let n = roll(l.armourMin, l.armourMax); n > 0; n--) out.items.push(...necromancerHooks.gear(state, roll(l.armourLow, l.armourHigh), true));
    out.items.push([Res.Silver, roll(l.silverMin, l.silverMax)]);
    const gold = roll(0, l.goldMax);
    if (gold > 0) out.items.push([Res.Gold, gold]);
    out.items.push([Res.BogPear, 1]);
    for (let n = roll(l.weaponsMin, l.weaponsMax); n > 0; n--) out.items.push(...necromancerHooks.gear(state, roll(l.weaponLow, l.weaponHigh), false));
    if (rng.nextInt(1000) < l.gemPm) out.items.push([GEMS[rng.nextInt(GEMS.length)]!, 1]);
    return out;
  }
  if (mob === Mob.FaeGuardian || mob === Mob.FaeGuardianAloft) {
    const l = KEEPER_LOOT.fae;
    for (let n = roll(l.trinketsMin, l.trinketsMax); n > 0; n--) out.items.push([trinketRes(rng.nextInt(TRINKET_METALS.length), roll(1, 4)), 1]);
    for (let n = roll(l.gearMin, l.gearMax); n > 0; n--) out.items.push(...necromancerHooks.gear(state, roll(l.gearLow, l.gearHigh), rng.nextInt(2) === 1));
    out.items.push([FAE_FOOD[rng.nextInt(FAE_FOOD.length)]!, roll(l.foodMin, l.foodMax)]);
    out.items.push([Res.ManaCrystal, roll(l.crystalsMin, l.crystalsMax)]);
    const tier = roll(1, TOP_MAGE_TIER);
    const item = (rng.nextInt(2) === 1 ? ROBE_KITS : WAND_KITS)[tier]!.items[0];
    if (item !== undefined) out.items.push([item, 1]);
    return out;
  }
  return null;
}

// ----- for the client -----

/** Whether a keeper runs now (the client's run clip): the Bog guardian once wronged, until there is peace; the Fae Guardian once riled. */
export function keeperRuns(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || e.role[i] !== Role.Keeper) return false;
  const k = keeperOf(state, e.id[i]!);
  if (!k) return false;
  if (k.kind === KeeperKind.Fae) return k.mode === KeeperMode.Defending || k.mode === KeeperMode.Wrath;
  return k.mode === KeeperMode.Angry || k.mode === KeeperMode.Pleading || k.mode === KeeperMode.War;
}

/** Whether a keeper's tooltip warns (MB-12, MF-12): the Bog guardian's always (the client stops it after 10 s), the Fae Guardian's until she is riled. */
export function keeperWarns(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || e.role[i] !== Role.Keeper) return false;
  const k = keeperOf(state, e.id[i]!);
  return k !== undefined && (k.kind === KeeperKind.Bog || k.riled === 0);
}
