// The peoples' faction AI (Technical decisions 13: each unit thinks every 10
// steps, staggered by id; a faction is settled, at war, leaving or gone).
// Their people are units of the players' kinds run by the same fight layer
// and orders (units/behaviour.ts): this file only gives the orders. At peace
// fighters keep their posts and fight off monsters and beasts that come near;
// villagers wander among their buildings and go home at dark. At war the
// fighters go for the enemy's units near home and give up the chase farther
// out; a war band marches on the enemy's buildings and breaks them. Out of a
// fight they heal, and at peace a faction gains back a person every 3 days.
// Elf caravans visit those who have met the Elves, mercenaries work for a
// day, and the Grovesingers' mana comes from the trees.

import { buildingCentre } from '../buildings/lights.ts';
import { isDark, Period } from '../clock.ts';
import { floorDiv, isqrt, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { PEOPLES, UnitKind, WILD, type SimState } from '../state.ts';
import { fight, goTo, graze } from '../animals/animals.ts';
import { Species } from '../animals/species.ts';
import { dealt, gapToBuilding, hostile, hurtBuilding, meleeOf } from '../combat/combat.ts';
import { townCentre, vanish, walkMob } from '../combat/mob-ai.ts';
import { Mob, type MobSpec } from '../combat/mobs.ts';
import { Res } from '../economy/resources.ts';
import { inCombat } from '../magic/mages.ts';
import { MANA_SCALE, School } from '../magic/spells.ts';
import { giveOrder } from '../units/behaviour.ts';
import { handIn } from '../units/loot.ts';
import { nearestBuilding } from '../threats/foes.ts';
import { Role } from '../threats/types.ts';
import { Band } from '../world/layout.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { isTree } from '../world/props.ts';
import {
  CARAVAN_EVERY_STEPS, CARAVAN_FROM_WU, CARAVAN_STOP_WU, CHASE_WU, DEFEND_WU, FactionKind, GROVESINGER, HEAL_AFTER_STEPS, HEAL_EVERY_STEPS, HIRE_SILVER, LAYOUTS, LEAVE_STEPS, LINES,
  MERC_LINES, MERC_REFILL_STEPS, MERC_UNITS, People, peopleUnitSpec, REGROW_STEPS, SPEECH_NEAR_WU, Status, THINK_STEPS, TRADE_RANGE_WU, WANDER_DUSKS, WANDER_WU,
} from './data.ts';
import { addPerson, buildFaction, elfKingdom, fightersOf, isPerson, factionMembers, newFaction, peopleOf, ringPoint, structuresOf } from './factions.ts';
import { sayForeign } from './speech.ts';
import { restock } from './stock.ts';
import { UNTIL_DAWN } from './trade.ts';
import { factionById, warFaction, type Faction } from './types.ts';
import { leave, updateLeaving, updateRaids } from './war.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;
const SEC = STEPS_PER_SECOND;
/** A raider looks for the enemy's buildings within this distance of it before marching on the nearest anywhere (s). */
const RAID_LOOK_WU = 30 * M;
/** Beasts fight what is hostile within this distance of them, and no farther than this from home (s). */
const BEAST_AGGRO_WU = 15 * M;
const BEAST_LEASH_WU = 30 * M;
/** Grovesingers look for a tree, and refill, every 2 s. */
const MANA_EVERY_STEPS = 2 * SEC;
/** A raider marker in the unit's foe field: the player it raids, plus one. A mercenary walking home is marked 255. */
const HOMEWARD = 255;

/** Whether one of a faction's units thinks this step (each every 10 steps, staggered by id). */
function thinks(state: SimState, id: number): boolean {
  return (state.step + id) % THINK_STEPS === 0;
}

/** The enemy units of a faction (the players at war with it) near a point, nearest first. */
function enemyNear(state: SimState, i: number, x: number, z: number, r: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(x, z, r)) {
    if (e.hp[j]! <= 0 || e.inside[j] !== 0 || e.owner[j]! >= state.players.length || !hostile(state, i, j)) continue;
    const d = length2d(e.x[j]! - x, e.z[j]! - z);
    if (d > r) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** Walks a unit back to its post unless it is there or busy. */
function toPost(state: SimState, i: number): void {
  const e = state.entities;
  if (e.queue[i]!.length > 0 || e.chasing[i] !== 0 || e.target[i] !== 0) return;
  if (length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) <= 2 * M) return;
  giveOrder(state, i, { t: 'move', x: e.homeX[i]!, z: e.homeZ[i]! }, false);
}

/** A raider's step of thought: break the enemy's building in reach, else march on the nearest one. */
function raid(state: SimState, f: Faction, i: number): void {
  const e = state.entities;
  const player = e.foe[i]! - 1;
  if (!(warFaction(state.peoples, f).war & (1 << player)) || state.players[player]?.out) {
    // The war is over: the band goes home and is gone.
    e.foe[i] = HOMEWARD;
    giveOrder(state, i, { t: 'move', x: f.x, z: f.z }, false);
    return;
  }
  if (e.target[i] !== 0 || e.queue[i]![0]?.t === 'attack') return;
  const b = nearestBuilding(state, e.x[i]!, e.z[i]!, RAID_LOOK_WU, (o) => o.owner === player) ?? nearestBuilding(state, e.x[i]!, e.z[i]!, 0, (o) => o.owner === player);
  if (!b) return;
  const w = meleeOf(state, i);
  if (gapToBuilding(state, i, b) <= w.reach + (M >> 1)) {
    e.queue[i] = [];
    if (state.step < e.atkNext[i]!) return;
    const [bx, bz] = buildingCentre(b);
    e.heading[i] = 0;
    e.atkNext[i] = state.step + w.attackSteps;
    hurtBuilding(state, b, dealt(state, i, w.damage), bx, e.y[i]! + M, bz);
    state.hits.push({ look: 'swing', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    return;
  }
  const [bx, bz] = buildingCentre(b);
  const o = e.queue[i]![0];
  if (o?.t === 'attackMove' && length2d(o.x - bx, o.z - bz) < COL) return;
  giveOrder(state, i, { t: 'attackMove', x: bx, z: bz }, false);
}

/** One faction member's thought for this step. */
function think(state: SimState, f: Faction, i: number, war: boolean): void {
  const e = state.entities;
  const fighter = e.kind[i] !== UnitKind.Worker;
  if (!fighter) {
    // Villagers: home at dark and at war, else a stroll among their buildings now and then.
    if (e.queue[i]!.length > 0) return;
    if (war || isDark(state.step, state.blood)) {
      toPost(state, i);
      return;
    }
    const h = hash32(f.seed, e.id[i]!, floorDiv(state.step, THINK_STEPS));
    if (h % 12 !== 0) return;
    const r = WANDER_WU;
    giveOrder(state, i, { t: 'move', x: e.homeX[i]! + ((h >>> 8) % (2 * r + 1)) - r, z: e.homeZ[i]! + ((h >>> 20) % (2 * r + 1)) - r }, false);
    return;
  }
  // Too far from home: back to the post.
  if (length2d(e.x[i]! - f.x, e.z[i]! - f.z) > CHASE_WU) {
    e.target[i] = 0;
    e.chasing[i] = 0;
    giveOrder(state, i, { t: 'move', x: e.homeX[i]!, z: e.homeZ[i]! }, false);
    return;
  }
  if (war && e.target[i] === 0 && (e.queue[i]!.length === 0 || e.queue[i]![0]!.t === 'move')) {
    const t = enemyNear(state, i, f.x, f.z, DEFEND_WU);
    if (t >= 0) {
      giveOrder(state, i, { t: 'attack', id: e.id[t]! }, false);
      return;
    }
  }
  toPost(state, i);
}

/** A mercenary or a war band going home: gone once there, or when its walk ends. */
function homeward(state: SimState, i: number, f: Faction | undefined): void {
  const e = state.entities;
  if (!f || length2d(e.x[i]! - f.x, e.z[i]! - f.z) <= 4 * M || e.queue[i]!.length === 0) vanish(state, i);
}

/** Out of a fight for 10 s, the peoples heal 1 health every 2 s (s). */
function heal(state: SimState, i: number): void {
  const e = state.entities;
  if (e.hp[i]! >= e.maxHp[i]! || state.step - e.hurtAt[i]! < HEAL_AFTER_STEPS) return;
  e.hp[i] = e.hp[i]! + 1;
}

/** The people a faction of its size has by unit type, from its layout (s). */
function plan(f: Faction): Array<[number, number]> {
  const layout = LAYOUTS[f.kind];
  if (!layout) return [];
  const pct = [100, 100, 125, 150, 175][f.band] ?? 100;
  return layout.people.map(([unit, n]) => [unit, f.kind === FactionKind.ElfCaravan ? n : floorDiv(n * pct + 99, 100)]);
}

/** At peace for 3 days: one lost person comes back (a newcomer of the first type short). */
function regrow(state: SimState, f: Faction): void {
  if (f.kind === FactionKind.ElfCaravan || f.kind === FactionKind.MercCamp || f.war !== 0) return;
  const e = state.entities;
  const have = peopleOf(state, f.id);
  const ring = LAYOUTS[f.kind]!.ringWu;
  for (const [unit, n] of plan(f)) {
    const count = have.filter((j) => e.mob[j] === unit && e.foe[j] === 0).length;
    if (count >= n) continue;
    const [x, z] = ringPoint(f, count, n, peopleUnitSpec(unit).fighter ? ring >> 1 : floorDiv(ring * 3, 4), (f.seed & 0xffff) + 4096);
    addPerson(state, f, unit, x, z);
    return;
  }
}

/** Greets the players whose units come near for the first time; marks it seen; the Elves met start the caravans. */
function meet(state: SimState, f: Faction): void {
  const e = state.entities;
  const reach = (LAYOUTS[f.kind]?.ringWu ?? 10 * M) + SPEECH_NEAR_WU;
  let near = 0;
  for (const j of state.grid.near(f.x, f.z, reach)) {
    const o = e.owner[j]!;
    if (o >= state.players.length || e.hp[j]! <= 0 || length2d(e.x[j]! - f.x, e.z[j]! - f.z) > reach) continue;
    near |= 1 << o;
  }
  f.seen |= near;
  const fresh = near & ~f.met;
  if (!fresh) return;
  f.met |= fresh;
  const top = warFaction(state.peoples, f);
  top.met |= fresh;
  const speaker = f.leader ? e.indexOf(f.leader) : peopleOf(state, f.id)[0] ?? -1;
  for (let p = 0; p < state.players.length; p++) {
    if (!(fresh & (1 << p))) continue;
    if (speaker >= 0) sayForeign(state, speaker, f.kind === FactionKind.MercCamp ? MERC_LINES.greet : LINES[f.people as People].greet, true, p, f.id);
    if (f.people === People.Elf) {
      state.peoples.elvesMet |= 1 << p;
      const k = elfKingdom(state);
      if (!k.caravanAt[p]) k.caravanAt[p] = state.step + CARAVAN_EVERY_STEPS;
    }
  }
}

// ----- caravans -----

/** A caravan comes to a player who has met the Elves, every 5 days: in from 60 m out, it stops 14 m from their main base. */
function sendCaravan(state: SimState, kingdom: Faction, player: number): void {
  const centre = townCentre(state, player);
  if (!centre) return;
  const [cx, cz] = centre;
  const dx = kingdom.x - cx;
  const dz = kingdom.z - cz;
  const d = Math.max(1, isqrt(dx * dx + dz * dz));
  const layout = state.world.layout;
  const cell = layout.cell(layout.nearest(floorDiv(cx, COL), floorDiv(cz, COL)));
  const h = hash32(kingdom.seed, player, floorDiv(state.step, CARAVAN_EVERY_STEPS));
  const f = newFaction(state, FactionKind.ElfCaravan, cell.id, cx + floorDiv(dx * CARAVAN_FROM_WU, d), cz + floorDiv(dz * CARAVAN_FROM_WU, d), cell.band, h);
  f.parent = kingdom.id;
  f.visits = player;
  f.toX = cx + floorDiv(dx * CARAVAN_STOP_WU, d);
  f.toZ = cz + floorDiv(dz * CARAVAN_STOP_WU, d);
  buildFaction(state, f);
  f.met = kingdom.met;
  state.events.push({ player, kind: 'info', text: 'An Elf caravan is coming to trade. It leaves at dusk.', x: f.x, z: f.z, faction: f.id });
}

/** A visiting caravan's wagon rolls to its stop and its people keep beside it (installed as peoplesHooks.wagon). */
export function runWagon(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const f = factionById(state.peoples, e.group[i]!);
  // A caravan whose kingdom is at war with the player it visits stands its ground.
  if (!f || f.status !== Status.Settled || f.visits < 0 || warFaction(state.peoples, f).war & (1 << f.visits)) return;
  if (walkMob(state, i, spec, f.toX, f.toZ)) return;
  f.x = e.x[i]!;
  f.z = e.z[i]!;
}

/** Each caravan member keeps near the wagon as it rolls. */
function followWagon(state: SimState, f: Faction, i: number): void {
  const e = state.entities;
  const k = factionMembers(state, f.id).filter((j) => isPerson(state, j)).indexOf(i);
  const [x, z] = ringPoint(f, k, 5, 3 * M);
  e.homeX[i] = x;
  e.homeZ[i] = z;
  if (length2d(e.x[i]! - x, e.z[i]! - z) > 3 * M && e.target[i] === 0 && e.queue[i]!.length === 0) giveOrder(state, i, { t: 'move', x, z }, false);
}

// ----- mercenaries -----

/** A player hires mercenaries for the day: 2 silver each, from a camp with a unit of theirs within 15 m. */
export function hire(state: SimState, player: number, factionId: number, count: number): void {
  const f = factionById(state.peoples, factionId);
  const p = state.players[player];
  if (!f || !p || f.kind !== FactionKind.MercCamp || f.status !== Status.Settled) return;
  const e = state.entities;
  const near = factionMembers(state, f.id).some((m) => state.grid.near(e.x[m]!, e.z[m]!, TRADE_RANGE_WU).some((j) => e.owner[j] === player && e.hp[j]! > 0 && length2d(e.x[j]! - e.x[m]!, e.z[j]! - e.z[m]!) <= TRADE_RANGE_WU));
  // The camp's captain speaks for it, else whoever of it is about.
  const speaker = f.leader ? e.indexOf(f.leader) : peopleOf(state, f.id)[0] ?? structuresOf(state, f.id)[0] ?? -1;
  if (!near) {
    state.events.push({ player, kind: 'alert', text: 'Bring one of your units within 15 m of the camp to hire.', faction: f.id });
    return;
  }
  if (isDark(state.step, state.blood)) {
    if (speaker >= 0) sayForeign(state, speaker, MERC_LINES.home, true, player, f.id);
    return;
  }
  const n = Math.min(count, f.survivors);
  if (n <= 0) {
    if (speaker >= 0) sayForeign(state, speaker, MERC_LINES.none, true, player, f.id);
    return;
  }
  const cost = n * HIRE_SILVER;
  if (p.pool[Res.Silver]! < cost) {
    state.events.push({ player, kind: 'alert', text: `Hiring ${n} costs ${cost} silver; you have ${p.pool[Res.Silver]}.`, faction: f.id });
    return;
  }
  p.pool[Res.Silver] = p.pool[Res.Silver]! - cost;
  f.survivors -= n;
  f.met |= 1 << player;
  const units = MERC_UNITS[f.band as 1 | 2] ?? MERC_UNITS[Band.Fringe]!;
  for (let k = 0; k < n; k++) {
    const [x, z] = ringPoint(f, k, n, 4 * M, f.seed & 0xffff);
    const i = addPerson(state, f, units[k % 2]!, x, z);
    e.owner[i] = player;
    e.role[i] = Role.Mercenary;
  }
  if (speaker >= 0) sayForeign(state, speaker, MERC_LINES.hired, true, player, f.id);
  state.events.push({ player, kind: 'info', text: `${n} mercenar${n === 1 ? 'y' : 'ies'} hired until dusk.`, x: f.x, z: f.z, faction: f.id });
}

/** At dusk the day's work is done: every hired mercenary walks back to its camp and is there again tomorrow. */
function mercenariesHome(state: SimState): void {
  const e = state.entities;
  const told = new Set<number>();
  for (let i = 0; i < e.count; i++) {
    if (e.role[i] !== Role.Mercenary || e.hp[i]! <= 0 || e.owner[i] === PEOPLES) continue;
    const f = factionById(state.peoples, e.group[i]!);
    const player = e.owner[i]!;
    if (!told.has(player * 65536 + e.group[i]!)) {
      told.add(player * 65536 + e.group[i]!);
      state.events.push({ player, kind: 'speech', text: MERC_LINES.home, speaker: e.id[i]!, name: `Mercenary ${peopleUnitSpec(e.mob[i]!).name.toLowerCase()}`, x: e.x[i]!, z: e.z[i]! });
    }
    // Whatever loot it picked up is handed over to its hirer as it leaves (s).
    handIn(state, i);
    e.owner[i] = PEOPLES;
    e.foe[i] = HOMEWARD;
    e.queue[i] = [];
    e.target[i] = 0;
    if (f) {
      f.survivors = Math.min(f.size, f.survivors + 1);
      giveOrder(state, i, { t: 'move', x: f.x, z: f.z }, false);
    } else vanish(state, i);
  }
}

// ----- the beasts -----

/** One of the peoples' beasts: livestock grazes; wolves, bears and called animals fight what is hostile near them (installed as peoplesHooks.beast). */
export function runBeast(state: SimState, i: number): void {
  const e = state.entities;
  const livestock = e.mob[i] === Species.Chicken || e.mob[i] === Species.Cattle || e.mob[i] === Species.Ox || e.mob[i] === Species.Horse;
  if (!livestock && e.heldUntil[i]! <= state.step) {
    let t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
    if (t >= 0 && (e.hp[t]! <= 0 || !hostile(state, i, t) || length2d(e.x[t]! - e.homeX[i]!, e.z[t]! - e.homeZ[i]!) > BEAST_LEASH_WU)) t = -1;
    if (t < 0) {
      let bestD = 0;
      for (const j of state.grid.near(e.x[i]!, e.z[i]!, BEAST_AGGRO_WU)) {
        if (j === i || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.kind[j] === UnitKind.Mob && e.mob[j] === Mob.BombKeg || !hostile(state, i, j)) continue;
        const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
        if (d > BEAST_AGGRO_WU) continue;
        if (t < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[t]!)) {
          t = j;
          bestD = d;
        }
      }
    }
    if (t >= 0) {
      fight(state, i, t);
      return;
    }
    e.target[i] = 0;
    if (length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > 6 * M) {
      goTo(state, i, e.homeX[i]!, e.homeZ[i]!, true);
      return;
    }
  }
  graze(state, i, e.homeX[i]!, e.homeZ[i]!, 6 * M);
}

/** Called animals go wild again when the call ends. */
function releaseCalled(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.calledUntil[i] === 0 || e.calledUntil[i]! > state.step) continue;
    e.calledUntil[i] = 0;
    if (e.kind[i] !== UnitKind.Animal || e.owner[i] !== PEOPLES) continue;
    e.owner[i] = WILD;
    e.group[i] = 0;
    e.target[i] = 0;
  }
}

// ----- the Grovesingers' mana -----

/** Whether a living tree stands within 20 m of a point. */
function treeNear(state: SimState, x: number, z: number): boolean {
  const r = GROVESINGER.treeWu;
  const r2 = floorDiv(r, COL) ** 2;
  const cx = floorDiv(x, COL);
  const cz = floorDiv(z, COL);
  const rc = floorDiv(r, COL);
  for (let kz = (cz - rc) >> CHUNK_SHIFT; kz <= (cz + rc) >> CHUNK_SHIFT; kz++) {
    for (let kx = (cx - rc) >> CHUNK_SHIFT; kx <= (cx + rc) >> CHUNK_SHIFT; kx++) {
      for (const p of state.world.props(kx, kz, state.step)) {
        if (!isTree(p.kind) || p.stage === 0) continue;
        const dx = (kx << CHUNK_SHIFT) + p.lx - cx;
        const dz = (kz << CHUNK_SHIFT) + p.lz - cz;
        if (dx * dx + dz * dz <= r2) return true;
      }
    }
  }
  return false;
}

/** Every 2 s a Grovesinger out of combat refills: 1.5 a second near a living tree, 0.75 elsewhere, 0.3 in the Barrens and Deadlands (Table 13). */
function groveMana(state: SimState, i: number): void {
  const e = state.entities;
  const max = GROVESINGER.mana * MANA_SCALE;
  if (e.mana[i]! >= max || inCombat(state, i)) return;
  const band = state.world.gen.columnBand(floorDiv(e.x[i]!, COL), floorDiv(e.z[i]!, COL));
  const rate = band >= Band.Barrens ? GROVESINGER.barrenRefill : treeNear(state, e.x[i]!, e.z[i]!) ? GROVESINGER.nearTreeRefill : GROVESINGER.refill;
  // Hundredths of a point a second, for 2 s, in twentieths of a point.
  e.mana[i] = Math.min(max, e.mana[i]! + floorDiv(rate * MANA_EVERY_STEPS, 100));
}

// ----- each step -----

/** Each step: every faction's AI, the caravans' and raids' timers, called beasts, the Grovesingers' mana. */
export function updatePeoples(state: SimState): void {
  const e = state.entities;
  const ps = state.peoples;
  const dark = isDark(state.step, state.blood);
  for (const f of [...ps.factions]) {
    if (f.status === Status.Leaving) {
      if (thinks(state, f.id)) updateLeaving(state, f, LEAVE_STEPS);
      continue;
    }
    updateRaids(state, f);
    // The kingdom's caravans come whether or not anyone has found the kingdom yet.
    if (f.kind === FactionKind.ElfKingdom && f.status === Status.Settled && !dark) {
      for (let p = 0; p < state.players.length; p++) {
        const at = f.caravanAt[p]!;
        if (!at || state.step < at || state.players[p]!.out) continue;
        f.caravanAt[p] = state.step + CARAVAN_EVERY_STEPS;
        if (!(f.war & (1 << p))) sendCaravan(state, f, p);
      }
    }
    if (f.status !== Status.Settled || !f.built) continue;
    const top = warFaction(ps, f);
    const war = (top.war & everyoneBits(state)) !== 0;
    if (thinks(state, f.id)) meet(state, f);
    if (f.kind === FactionKind.MercCamp && f.size > 0 && state.step >= f.regrowAt) {
      f.regrowAt = state.step + MERC_REFILL_STEPS;
      if (f.survivors < f.size) f.survivors++;
    }
    if (!war && f.regrowAt && state.step >= f.regrowAt && f.kind !== FactionKind.MercCamp) {
      f.regrowAt = state.step + REGROW_STEPS;
      regrow(state, f);
    } else if (!f.regrowAt) f.regrowAt = state.step + (f.kind === FactionKind.MercCamp ? MERC_REFILL_STEPS : REGROW_STEPS);
  }
  if (state.step % THINK_STEPS === 0) releaseCalled(state);
  const healTick = state.step % HEAL_EVERY_STEPS === 0;
  const manaTick = state.step % MANA_EVERY_STEPS === 0;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0 || e.owner[i] !== PEOPLES || !isPerson(state, i)) continue;
    if (manaTick && e.kind[i] === UnitKind.Mage && e.school[i] === School.Grove) groveMana(state, i);
    if (healTick) heal(state, i);
    if (!thinks(state, e.id[i]!)) continue;
    const f = factionById(ps, e.group[i]!);
    if (e.foe[i] === HOMEWARD) {
      homeward(state, i, f);
      continue;
    }
    if (!f) continue;
    // A war band thinks wherever its people have gone (migrated Dwarves raid from afar).
    if (e.foe[i] !== 0) {
      raid(state, f, i);
      continue;
    }
    if (f.status !== Status.Settled) continue;
    if (f.kind === FactionKind.ElfCaravan && f.visits >= 0 && e.foe[i] === 0) {
      followWagon(state, f, i);
      continue;
    }
    think(state, f, i, (warFaction(ps, f).war & everyoneBits(state)) !== 0);
  }
  // Caravans gone and empty are dropped; the records of everyone else stay (their war, their kills).
  if (state.step % (10 * SEC) === 0) ps.factions = ps.factions.filter((f) => f.kind !== FactionKind.ElfCaravan || f.status !== Status.Gone || factionMembers(state, f.id).length > 0);
}

function everyoneBits(state: SimState): number {
  let bits = 0;
  state.players.forEach((p, k) => {
    if (!p.out) bits |= 1 << k;
  });
  return bits;
}

/** What a period's start brings the peoples: at dusk caravans count down and leave, mercenaries go home; at daybreak stock and moods refresh. */
export function peoplesAtPeriod(state: SimState, period: Period): void {
  const ps = state.peoples;
  if (period === Period.Dusk) {
    mercenariesHome(state);
    for (const f of ps.factions) {
      if (f.kind !== FactionKind.ElfCaravan || f.status !== Status.Settled) continue;
      // A visiting caravan leaves at dusk; a wandering one at the second dusk after it was found.
      if (f.visits < 0) {
        f.leaveAt += 1;
        if (f.leaveAt < WANDER_DUSKS) continue;
      }
      leave(state, f, false);
    }
  } else if (period === Period.Day) {
    for (const f of ps.factions) {
      if (f.status !== Status.Settled || !f.built) continue;
      restock(f);
      for (let p = 0; p < f.closedUntil.length; p++) {
        if (f.closedUntil[p] === UNTIL_DAWN) f.closedUntil[p] = 0;
        f.declines[p] = 0;
      }
    }
  }
}

/** The fighters still standing (for the Peoples panel's strength). */
export function strength(state: SimState, f: Faction): number {
  return fightersOf(state, f.id).length;
}
