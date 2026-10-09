// Goblin villages (Goblin villages; Table 17). A village is placed in a
// cell the first time the players come near it: 1 Fringe cell in 12 and 1
// Deepwoods cell in 4 hold one, never the start basin. Its huts stand in a
// ring round a fire pit with a totem, inside a ring of stakes; 2 goblins
// live in each hut, with 2 archers and, in the Deepwoods and half the Fringe
// villages, a goblin mage. Goblins fight what comes near; a side that kills
// more than 4 of them, or kills one and breaks one of their buildings, is
// at war with the village: each day 30 s after dawn 60% of its fighters (at
// least 4) march on that side's nearest building, putting out lights on the
// way, and go home at dusk. At peace a village rebuilds a hut every 5 days.

import { buildingCentre } from '../buildings/lights.ts';
import { CLEARING_M } from '../circles/data.ts';
import { circleNear } from '../circles/place.ts';
import { cos16, floorDiv, length2d, sin16, TRIG_ONE, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { hash32 } from '../rng.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import { addMob } from '../combat/mob-ai.ts';
import { Mob } from '../combat/mobs.ts';
import { HUTS_PER_WOLF_RIDER, HUT_RING_WU, HUT_SALVAGE, WOLF_PEN_HUTS, RAID_MIN, RAID_SHARE_PCT, REBUILD_STEPS, VILLAGE_ONE_IN, WAR_KILLS } from './data.ts';
import { nightNow } from './lairs.ts';
import { raidFoe } from './foes.ts';
import { Role, type Village } from './types.ts';
import { Mount } from '../mounts/data.ts';
import { seat } from '../mounts/riding.ts';

const M = WU_PER_METRE;
const COL = WU_PER_COLUMN;
/** A village keeps 40 m from the players' units and buildings when it is placed (s). */
const VILLAGE_KEEP_AWAY_WU = 40 * M;
/** The totem stands 4 m from the fire pit (s). */
const TOTEM_WU = 4 * M;

/** The village's people and buildings, alive, in index order. */
export function villagers(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.group[i] === id && e.hp[i]! > 0 && (e.role[i] === Role.Village || e.role[i] === Role.Structure)) out.push(i);
  return out;
}

function huts(state: SimState, id: number): number[] {
  return villagers(state, id).filter((i) => state.entities.mob[i] === Mob.GoblinHut);
}

function fighters(state: SimState, id: number): number[] {
  return villagers(state, id).filter((i) => state.entities.role[i] === Role.Village);
}

function ringPoint(v: Village, k: number, n: number, r: number): [number, number] {
  const a = floorDiv(k * 65536, Math.max(1, n));
  return [v.x + floorDiv(r * cos16(a), TRIG_ONE), v.z + floorDiv(r * sin16(a), TRIG_ONE)];
}

function addVillager(state: SimState, v: Village, mob: number, x: number, z: number): number {
  const i = addMob(state, mob, 0, x, z, nightNow(state));
  state.entities.group[i] = v.id;
  return i;
}

/** A hut and its 2 goblins, in hut slot k of the village's ring. */
function addHut(state: SimState, v: Village, k: number): void {
  const [x, z] = ringPoint(v, k, v.size, HUT_RING_WU);
  addVillager(state, v, Mob.GoblinHut, x, z);
  for (const d of [-1, 1]) {
    const [gx, gz] = ringPoint(v, k * 4 + (d > 0 ? 1 : 3), v.size * 4, HUT_RING_WU - 2 * M);
    addVillager(state, v, Mob.VillageGoblin, gx + d * M, gz);
  }
}

/** Builds a village round a middle: huts, fire pit, totem, its goblins, archers and mage. */
export function buildVillage(state: SimState, cell: number, x: number, z: number, band: number, size: number, mage: boolean): Village {
  const v: Village = {
    id: state.nextEntityId++, cell, x, z, band, size, mage: mage ? 1 : 0, war: 0, warned: 0, razed: 0,
    kills: state.players.map(() => 0), rebuildAt: state.step + REBUILD_STEPS, raided: -1, seen: 0,
  };
  state.threats.villages.push(v);
  addVillager(state, v, Mob.GoblinFirePit, x, z);
  addVillager(state, v, Mob.GoblinTotem, x + TOTEM_WU, z + (TOTEM_WU >> 1));
  for (let k = 0; k < size; k++) addHut(state, v, k);
  for (const d of [-2, 2]) addVillager(state, v, Mob.GoblinArcher, x + d * M, z - 2 * M);
  if (mage) addVillager(state, v, Mob.GoblinMage, x - 2 * M, z + 2 * M);
  // A village of 4 huts or more keeps a wolf pen, and 1 wolf rider for every 2 huts (Table 17).
  if (size >= WOLF_PEN_HUTS) {
    addVillager(state, v, Mob.GoblinWolfPen, x - TOTEM_WU, z - (TOTEM_WU >> 1));
    for (let k = 0; k < floorDiv(size, HUTS_PER_WOLF_RIDER); k++) {
      const j = addVillager(state, v, Mob.GoblinWolfRider, x - TOTEM_WU + (k - 1) * 2 * M, z - TOTEM_WU);
      seat(state, j, Mount.Wolf);
    }
  }
  return v;
}

/** Whether a village may stand round a middle: standable, and 40 m from the players' units and buildings. */
function roomFor(state: SimState, x: number, z: number): boolean {
  if (!state.nav.standable(floorDiv(x, COL), floorDiv(z, COL), WALKER)) return false;
  // No village in a stone circle's clearing (Patch 5).
  if (circleNear(state.world.layout, x, z, CLEARING_M)) return false;
  const r = VILLAGE_KEEP_AWAY_WU;
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i]! < state.players.length && length2d(e.x[i]! - x, e.z[i]! - z) < r) return false;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const [bx, bz] = buildingCentre(b);
    if (length2d(bx - x, bz - z) < r) return false;
  }
  return true;
}

/** A cell the players come near for the first time: it may hold a goblin village (Table 17 frequency, from the seed). */
export function checkCell(state: SimState, cellId: number): void {
  const t = state.threats;
  if (state.peaceful || t.checked.has(cellId)) return;
  t.checked.add(cellId);
  const cell = state.world.layout.cell(cellId);
  const oneIn = VILLAGE_ONE_IN[cell.band];
  if (cell.ring === 0 || !oneIn) return;
  const h = hash32(state.seed ^ 0x676f626c, cellId);
  if (h % oneIn !== 0) return;
  const deep = cell.band === Band.Deepwoods;
  const size = deep ? 4 + ((h >>> 8) % 3) : 3 + ((h >>> 8) % 2);
  const mage = deep || ((h >>> 12) & 1) === 1;
  const spread = Math.max(8, floorDiv(cell.size, 4));
  for (let k = 0; k < 8; k++) {
    const hk = hash32(state.seed ^ 0x676f626c, cellId, k);
    const x = (cell.x + ((hk & 0xffff) % (spread * 2 + 1)) - spread) * COL + (COL >> 1);
    const z = (cell.z + (((hk >>> 16) & 0xffff) % (spread * 2 + 1)) - spread) * COL + (COL >> 1);
    if (!roomFor(state, x, z)) continue;
    buildVillage(state, cellId, x, z, cell.band, size, mage);
    return;
  }
}

// ----- war -----

/** A player's side did something to a village: a kill or a broken building. War after more than 4 kills, or a kill and a broken building; a warning one kill before. */
export function provokeVillage(state: SimState, v: Village, player: number, killed: boolean): void {
  if (player < 0 || player >= state.players.length) return;
  const bit = 1 << player;
  if (killed) v.kills[player] = (v.kills[player] ?? 0) + 1;
  else v.razed |= bit;
  if (v.war & bit) return;
  const kills = v.kills[player] ?? 0;
  const razed = (v.razed & bit) !== 0;
  if (kills >= WAR_KILLS || (kills >= 1 && razed)) {
    v.war |= bit;
    state.events.push({ player, kind: 'alert', text: 'A goblin village has declared war on you. Its warband will march on your nearest building after dawn.', x: v.x, z: v.z });
    return;
  }
  if ((v.warned & bit) === 0 && (kills === WAR_KILLS - 1 || (razed && kills === 0))) {
    v.warned |= bit;
    state.events.push({ player, kind: 'alert', text: 'The goblins are angry: one more kill and their village goes to war with you.', x: v.x, z: v.z });
  }
}

/** A village goblin or building fell to a player's side. Workers breaking down a hut take 5 sticks and 2 hides from it. */
export function onVillageLoss(state: SimState, i: number, taker: number, byWorker: boolean): void {
  const e = state.entities;
  const v = state.threats.villages.find((w) => w.id === e.group[i]);
  if (!v || taker < 0 || taker >= state.players.length) return;
  const structure = e.role[i] === Role.Structure;
  provokeVillage(state, v, taker, !structure);
  if (structure && e.mob[i] === Mob.GoblinHut && byWorker) {
    const pool = state.players[taker]!.pool;
    for (const [res, n] of HUT_SALVAGE) pool[res] = pool[res]! + n;
  }
}

/** 30 s after dawn: each village at war sends 60% of its fighters (at least 4) against that side. */
export function sendRaids(state: SimState, cycle: number): void {
  const e = state.entities;
  for (const v of state.threats.villages) {
    const enemy = raidFoe(v);
    if (enemy < 0 || state.players[enemy]?.out || v.raided === cycle) continue;
    v.raided = cycle;
    const list = fighters(state, v.id);
    if (list.length === 0) continue;
    const n = Math.min(list.length, Math.max(RAID_MIN, floorDiv(list.length * RAID_SHARE_PCT + 99, 100)));
    for (const i of list.slice(0, n)) e.act[i] = 1;
    state.events.push({ player: enemy, kind: 'alert', text: `A goblin warband of ${n} is marching on your nearest building.`, x: v.x, z: v.z });
  }
}

/** At dusk raiders go home. */
export function recallRaids(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.role[i] === Role.Village) e.act[i] = 0;
}

/** Each daybreak: a village at peace with everyone rebuilds a hut (and its goblins) every 5 days up to its size; a village with nothing left is gone. */
export function rebuildVillages(state: SimState): void {
  state.threats.villages = state.threats.villages.filter((v) => {
    const left = villagers(state, v.id);
    if (left.length === 0) return false;
    if (v.war !== 0 || state.step < v.rebuildAt) return true;
    v.rebuildAt = state.step + REBUILD_STEPS;
    const have = huts(state, v.id);
    if (have.length >= v.size) return true;
    // The first empty slot of the ring.
    const e = state.entities;
    for (let k = 0; k < v.size; k++) {
      const [x, z] = ringPoint(v, k, v.size, HUT_RING_WU);
      if (have.some((i) => length2d(e.x[i]! - x, e.z[i]! - z) < 2 * M)) continue;
      addHut(state, v, k);
      break;
    }
    return true;
  });
}
