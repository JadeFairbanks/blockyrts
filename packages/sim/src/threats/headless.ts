// The Headless God Idol (Jade's Patch 5, SCB-4): "If you have this idol, you
// can use its special effect by right clicking it from your inventory and you
// can avoid having waves of monsters sent against you and instead you can use
// it to unleash devastating waves of monsters against a faction you are at
// war with or declare war on one with it. This special effect takes 15 nights
// to become available again, after you use it."
//
// Used from the inventory on one of the factions the player knows (the client
// lists them, those at war first), it marks the coming night: war is declared
// if there was none, and as that night falls the player's waves come out of
// the dark round the faction instead (combat/spawn.ts) and go for its people
// and break its buildings (Role.Unleashed). The rest of the world's monsters
// come as ever. Picks (s) in blueprint/patch5-mobs-picks.md.

import { nextNight, brightFor } from '../circles/bright.ts';
import { clockAt } from '../clock.ts';
import { forward, gap, hurtUnit } from '../combat/combat.ts';
import { engageUnit, walkMob } from '../combat/mob-ai.ts';
import type { MobSpec } from '../combat/mobs.ts';
import { Res } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { FactionKind, Status } from '../peoples/data.ts';
import { factionById, warFaction, type Faction } from '../peoples/types.ts';
import { declareWar, factionTitle } from '../peoples/war.ts';
import { hash32 } from '../rng.ts';
import { OrderKind, PEOPLES, UnitKind, type PendingSpawn, type SimState } from '../state.ts';
import { Role } from './types.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;

/** Its numbers: Jade's 15 nights; the rest picks (s). */
export const HEADLESS = {
  /** SCB-4: "This special effect takes 15 nights to become available again". */
  everyNights: 15,
  /** The waves come out of the dark 40 to 60 m from the faction's middle (s). */
  ringMinM: 40,
  ringMaxM: 60,
  /** They go for its people within 30 m of them, and its buildings within 150 m of its middle (s). */
  sightM: 30,
  villageM: 150,
} as const;

/** The faction a unit's group belongs to for war and peace (a caravan's kingdom), or undefined. */
function topOf(state: SimState, group: number): Faction | undefined {
  const f = factionById(state.peoples, group);
  return f ? warFaction(state.peoples, f) : undefined;
}

/** The factions a player can turn their waves on: settled ones they know (seen, met or at war), not a mercenary camp or a caravan, by id. */
export function headlessTargets(state: SimState, player: number): Faction[] {
  const side = (1 << state.players.length) - 1;
  const b = 1 << player;
  const out: Faction[] = [];
  for (const f of state.peoples.factions) {
    if (!f.built || f.status !== Status.Settled || f.kind === FactionKind.MercCamp || f.kind === FactionKind.ElfCaravan) continue;
    if (warFaction(state.peoples, f) !== f) continue;
    if ((f.seen & side) === 0 && ((f.met | f.war) & b) === 0) continue;
    out.push(f);
  }
  return out.sort((a, c) => a.id - c.id);
}

/** The night the idol can next be used for, or -1 when it is ready. */
export function headlessReadyNight(state: SimState, player: number): number {
  const last = state.circles.headless[player] ?? -1;
  if (last < 0) return -1;
  const ready = last + HEADLESS.everyNights;
  return nextNight(state.step) >= ready ? -1 : ready;
}

/** Why a player cannot use the idol now ('' when they can); `faction` is the one chosen, or -1 when only the menu asks. */
export function headlessProblem(state: SimState, player: number, faction: number): string {
  if ((state.players[player]!.pool[Res.HeadlessIdol] ?? 0) <= 0) return 'You have no Headless God Idol.';
  if (state.peaceful) return 'No waves come in a peaceful game.';
  const ready = headlessReadyNight(state, player);
  if (ready >= 0) {
    const n = ready - nextNight(state.step);
    return `The idol can unleash your waves again in ${n} ${n === 1 ? 'night' : 'nights'}.`;
  }
  if (brightFor(state, player, nextNight(state.step))) return 'The coming night is a Bright Night for you: no waves will come to unleash.';
  const targets = headlessTargets(state, player);
  if (targets.length === 0) return 'You know of no faction to unleash your waves on.';
  if (faction >= 0 && !targets.some((f) => f.id === faction)) return 'Your waves cannot be sent against them.';
  return '';
}

/** The quest menu's row for the idol (decisions 3.6, QoL 3): whose its night's waves are, or how long until it can be used again. */
export function headlessRows(state: SimState, player: number): Array<[string, string]> {
  const used = state.circles.headless[player] ?? -1;
  if (used >= 0 && used >= clockAt(state.step).cycle) {
    const f = factionById(state.peoples, state.circles.headlessFaction[player] ?? 0);
    return [['Headless God Idol', `Night ${used}: your waves fall on ${f ? factionTitle(f) : 'your enemy'}.`]];
  }
  const ready = headlessReadyNight(state, player);
  if (ready >= 0) {
    const n = ready - nextNight(state.step);
    return [['Headless God Idol', `Ready again in ${n} ${n === 1 ? 'night' : 'nights'}.`]];
  }
  return (state.players[player]!.pool[Res.HeadlessIdol] ?? 0) > 0 ? [['Headless God Idol', 'Ready: use it from your inventory.']] : [];
}

/** Uses the idol on a faction: war, if there was none, and the coming night's waves are theirs. */
export function useHeadless(state: SimState, player: number, faction: number): void {
  const f = factionById(state.peoples, faction);
  if (!f) {
    state.events.push({ player, kind: 'alert', text: 'Choose the faction to unleash your waves on.' });
    return;
  }
  const night = nextNight(state.step);
  state.circles.headless[player] = night;
  state.circles.headlessFaction[player] = f.id;
  if (!(f.war & (1 << player))) declareWar(state, player, f.id, 'With the Headless God Idol you have declared war on');
  state.events.push({ player, kind: 'alert', text: `The Headless God Idol grins. On night ${night} your waves will fall on ${factionTitle(f)} instead of you.`, x: f.x, z: f.z, faction: f.id });
}

/** The faction a player's waves fall on tonight (a night's number), or undefined. */
export function headlessTonight(state: SimState, player: number, night: number): Faction | undefined {
  if ((state.circles.headless[player] ?? -1) !== night) return undefined;
  const f = factionById(state.peoples, state.circles.headlessFaction[player] ?? 0);
  return f && f.status === Status.Settled ? f : undefined;
}

/** Tonight's waves of a player turn on a faction (combat/spawn.ts, at nightfall): every one of them comes out round it. */
export function unleash(state: SimState, planned: PendingSpawn[], player: number, f: Faction): void {
  for (const s of planned) {
    s.role = Role.Unleashed;
    s.src = 0;
    s.ax = f.x;
    s.az = f.z;
    s.placed = 0;
  }
  if (planned.length > 0) state.events.push({ player, kind: 'alert', text: `Night falls, and your waves pour out of the dark around ${factionTitle(f)}.`, x: f.x, z: f.z, faction: f.id });
}

/** Where a group of unleashed monsters comes out: a standable spot 40 to 60 m from the faction's middle, the same on every machine. */
export function unleashedSpot(state: SimState, x: number, z: number, group: number): [number, number] {
  for (let k = 0; k < 12; k++) {
    const h = hash32(state.seed ^ 0x68646c73, group, state.step >> 6, k);
    const d = (HEADLESS.ringMinM + ((h >>> 16) % (HEADLESS.ringMaxM - HEADLESS.ringMinM + 1))) * M;
    const [fx, fz] = forward(h & 0xffff);
    const gx = floorDiv(x + floorDiv(fx * d, 65536), COL);
    const gz = floorDiv(z + floorDiv(fz * d, 65536), COL);
    if (state.nav.standable(gx, gz, WALKER) && state.buildings.solidAt(gx, gz) === 0) return [gx * COL + (COL >> 1), gz * COL + (COL >> 1)];
  }
  return [x + HEADLESS.ringMinM * M, z];
}

/** One of the faction's people or beasts an unleashed monster may go for. */
function personOf(state: SimState, f: Faction, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.inside[j] === 0 && e.owner[j] === PEOPLES && e.role[j] !== Role.Structure && topOf(state, e.group[j]!) === f;
}

/** One of the faction's buildings standing. */
function buildingOf(state: SimState, f: Faction, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.owner[j] === PEOPLES && e.kind[j] === UnitKind.Mob && e.role[j] === Role.Structure && topOf(state, e.group[j]!) === f;
}

/** An unleashed monster: the faction's people near it, then its buildings, nearest first; with none left it prowls the ruins till dawn. */
export function runUnleashed(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const f = topOf(state, e.group[i]!);
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  let t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t >= 0 && (!f || (!personOf(state, f, t) && !buildingOf(state, f, t)))) t = -1;
  // Looked for every half second, staggered by id (s).
  if (t < 0 && f && (state.step + e.id[i]!) % (STEPS_PER_SECOND >> 1) === 0) {
    let bestD = 0;
    for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, HEADLESS.sightM * M)) {
      if (!personOf(state, f, j)) continue;
      const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
      if (d > HEADLESS.sightM * M || (t >= 0 && d >= bestD)) continue;
      t = j;
      bestD = d;
    }
    if (t < 0) {
      for (const j of state.grid.nearOthers(hx, hz, HEADLESS.villageM * M)) {
        if (!buildingOf(state, f, j)) continue;
        const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
        if (t >= 0 && (d > bestD || (d === bestD && e.id[j]! >= e.id[t]!))) continue;
        t = j;
        bestD = d;
      }
    }
  }
  if (t >= 0) return engageUnit(state, i, spec, t);
  e.target[i] = 0;
  // To the faction's middle, then about its ruins.
  if (length2d(hx - e.x[i]!, hz - e.z[i]!) > 20 * M) {
    walkMob(state, i, spec, hx, hz);
    return;
  }
  if ((state.step + e.id[i]! * 3) % (8 * STEPS_PER_SECOND) === 0) {
    const h = hash32(state.seed ^ 0x70726f77, e.id[i]!, state.step);
    const [fx, fz] = forward(h & 0xffff);
    const d = ((h >>> 16) % 25) * M;
    e.targetX[i] = hx + floorDiv(fx * d, 65536);
    e.targetZ[i] = hz + floorDiv(fz * d, 65536);
  }
  if (e.targetX[i] === 0 && e.targetZ[i] === 0) {
    e.targetX[i] = hx;
    e.targetZ[i] = hz;
  }
  if (walkMob(state, i, spec, e.targetX[i]!, e.targetZ[i]!)) e.order[i] = OrderKind.Idle;
}

/** An unleashed monster's blow on one of the faction's buildings lands (lateHooks.mobBlow): its damage against walls, through nothing (s). */
export function headlessBlow(state: SimState, i: number, spec: MobSpec, t: number): void {
  const e = state.entities;
  const f = topOf(state, e.group[i]!);
  if (!f || !buildingOf(state, f, t) || gap(state, i, t) > Math.max(spec.reach, spec.range) + M) return;
  const damage = Math.max(1, floorDiv(spec.vsWalls * e.power[i]!, 1000));
  hurtUnit(state, t, { damage, from: e.id[i]!, projectile: false, blunt: true, pierce: false, exact: true });
}
