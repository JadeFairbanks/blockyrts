// The Deadlands' mana crystal guardians (Jade's Patch 5, MB-13): "Deadlands
// mana crystal nodes (total yield: 5) are guarded by on average 2-3 of a
// medly of the strongest mobs found in the deadlands who do not burn at
// night and have a blue glow effect to them looking like pulsing thin light
// with some particles. Has a tooltip "Mana crystal guardian". Protects mana
// crystals aggroing onto whoever comes near, but staying within 5m of the
// crystal. They chase up to 8m away but return to no more than 5m away when
// their target gets too far. Also aggros with higher priority to any worker
// trying to gather the crystals. Once killed, they do not respawn and the
// mana crystals are unprotected, ready to mine."
//
// The land is made as it is first seen, so each crystal's guardians come
// when one of the players' units first comes within 60 m of it (s), out of
// sight, and the crystal is marked guarded for the rest of the game
// (state.threats.guarded): killed, they never come back. They are the
// Deadlands' lair guardians, the ash golem and the mana wraith, 2 or 3 of
// them by a coin toss, each kind by another (s). The sun never touches them
// (combat/mob-ai.ts inShade). The client draws their glow (UnitFlag.Guardian).

import { clockOf } from '../clock.ts';
import { COLUMNS_PER_CHUNK, floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { forward } from '../combat/combat.ts';
import { addMob, engageUnit, playerUnit, troopAggro, walkMob } from '../combat/mob-ai.ts';
import { Mob, type MobSpec } from '../combat/mobs.ts';
import { WALKER } from '../nav/grid.ts';
import { hash32 } from '../rng.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import { PropKind } from '../world/props.ts';
import { colKey } from '../world/world.ts';
import { bandAtWu } from './cells.ts';
import { provoker } from './foes.ts';
import { Role } from './types.ts';

const M = WU_PER_METRE;

/** Their numbers (s: picks, in blueprint/patch5-mobs-picks.md). */
export const CRYSTAL_GUARDS = {
  /** Jade: 2 to 3 a crystal. */
  min: 2,
  max: 3,
  /** Jade: they keep within 5 m of the crystal and chase no farther than 8 m from it. */
  leashM: 5,
  chaseM: 8,
  /** They come when one of the players' units first comes within this many metres of the crystal (s). */
  wakeM: 60,
  /** They stand this many metres round it (s). */
  postM: 3,
  /** Looked for this often, steps (s). */
  everySteps: 2 * STEPS_PER_SECOND,
};

/** What guards a crystal: the strongest of the Deadlands' creatures (its lairs' guardians). */
export const GUARDIAN_KINDS: readonly Mob[] = [Mob.AshGolem, Mob.ManaWraith];

/** Not state: the mana crystals a chunk was made with, as [column x, column z, prop index]; the land a seed makes never changes. */
const crystalCache = new WeakMap<object, Map<number, Array<readonly [number, number, number]>>>();

function crystalsIn(state: SimState, cx: number, cz: number): ReadonlyArray<readonly [number, number, number]> {
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
      if (r.kind === PropKind.ManaCrystal) list.push([cx * COLUMNS_PER_CHUNK + r.lx, cz * COLUMNS_PER_CHUNK + r.lz, k]);
    }
    m.set(key, list);
  }
  return list;
}

/** A crystal's middle, wu, from its column. */
function crystalWu(gx: number, gz: number): [number, number] {
  return [gx * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), gz * WU_PER_COLUMN + (WU_PER_COLUMN >> 1)];
}

/** Puts a crystal's guardians round it, for the player whose unit came near. */
function postGuards(state: SimState, gx: number, gz: number, foe: number): void {
  const [x, z] = crystalWu(gx, gz);
  const h = hash32(state.seed ^ 0x67726473, gx, gz);
  const n = CRYSTAL_GUARDS.min + ((h >>> 0) % (CRYSTAL_GUARDS.max - CRYSTAL_GUARDS.min + 1));
  const night = clockOf(state).cycle;
  const r = CRYSTAL_GUARDS.postM * M;
  const e = state.entities;
  for (let k = 0; k < n; k++) {
    const mob = GUARDIAN_KINDS[(h >>> (8 + k)) & 1]!;
    const [fx, fz] = forward(((h >>> 16) + floorDiv(k * 65536, n)) & 0xffff);
    let px = x + floorDiv(fx * r, 65536);
    let pz = z + floorDiv(fz * r, 65536);
    if (!state.nav.standable(floorDiv(px, WU_PER_COLUMN), floorDiv(pz, WU_PER_COLUMN), WALKER)) {
      px = x;
      pz = z;
    }
    const i = addMob(state, mob, foe, px, pz, night);
    e.role[i] = Role.Guardian;
    e.homeX[i] = x;
    e.homeZ[i] = z;
  }
}

/**
 * Each step, every 2 s: a mana crystal of the Deadlands that one of the
 * players' units has come within 60 m of for the first time gets its
 * guardians, and is guarded from then on.
 */
export function updateGuardians(state: SimState): void {
  if (state.peaceful || state.step % CRYSTAL_GUARDS.everySteps !== 0) return;
  const e = state.entities;
  const wake = CRYSTAL_GUARDS.wakeM * M;
  const chunkWu = COLUMNS_PER_CHUNK * WU_PER_COLUMN;
  const guarded = state.threats.guarded;
  for (let j = 0; j < e.count; j++) {
    const o = e.owner[j]!;
    if (o >= state.players.length || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.kind[j] === UnitKind.Animal) continue;
    const x = e.x[j]!;
    const z = e.z[j]!;
    // Only out where the Deadlands are within reach: the far edge of the reach is in them, or the unit is.
    if (bandAtWu(state, x, z) < Band.Barrens) continue;
    for (let cz = floorDiv(z - wake, chunkWu); cz <= floorDiv(z + wake, chunkWu); cz++) {
      for (let cx = floorDiv(x - wake, chunkWu); cx <= floorDiv(x + wake, chunkWu); cx++) {
        for (const [gx, gz, k] of crystalsIn(state, cx, cz)) {
          const key = colKey(gx, gz);
          if (guarded.has(key)) continue;
          const [px, pz] = crystalWu(gx, gz);
          if (length2d(px - x, pz - z) > wake) continue;
          if (bandAtWu(state, px, pz) !== Band.Deadlands) {
            guarded.add(key);
            continue;
          }
          guarded.add(key);
          // A crystal already mined out has nothing to guard.
          if ((state.world.prop(cx, cz, k, state.step)?.amount ?? 0) <= 0) continue;
          postGuards(state, gx, gz, o);
        }
      }
    }
  }
}

/** A worker of the players' trying to gather the crystal a guardian keeps (its order is to gather the prop on that column). */
function gatherer(state: SimState, i: number, chase: (j: number) => boolean): number {
  const e = state.entities;
  const gx = floorDiv(e.homeX[i]!, WU_PER_COLUMN);
  const gz = floorDiv(e.homeZ[i]!, WU_PER_COLUMN);
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.nearOthers(e.homeX[i]!, e.homeZ[i]!, CRYSTAL_GUARDS.chaseM * M)) {
    if (e.kind[j] !== UnitKind.Worker || !playerUnit(state, j) || !chase(j)) continue;
    const o = e.queue[j]![0];
    if (!o || o.t !== 'gather') continue;
    const r = state.world.propRecords(o.cx, o.cz)[o.i];
    if (!r || o.cx * COLUMNS_PER_CHUNK + r.lx !== gx || o.cz * COLUMNS_PER_CHUNK + r.lz !== gz) continue;
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/**
 * What a crystal's guardian does (threats/foes.ts runs it): a worker trying
 * to gather its crystal first, then a troop that hurt it, whoever hurt it,
 * and else the nearest of the players' units within 8 m of the crystal; it
 * chases no farther than 8 m from the crystal, and with nobody there walks
 * back to within 5 m of it.
 */
export function runGuardian(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  const chaseWu = CRYSTAL_GUARDS.chaseM * M;
  const chase = (j: number): boolean => length2d(e.x[j]! - hx, e.z[j]! - hz) <= chaseWu;
  const away = length2d(e.x[i]! - hx, e.z[i]! - hz);
  let t = -1;
  if (away <= chaseWu) {
    t = gatherer(state, i, chase);
    if (t < 0) {
      const had = e.target[i] ? e.indexOf(e.target[i]!) : -1;
      if (had >= 0 && playerUnit(state, had) && chase(had)) t = had;
    }
    const turn = troopAggro(state, i, spec, t, (j) => playerUnit(state, j) && chase(j));
    if (turn >= 0 && (t < 0 || e.kind[t] !== UnitKind.Worker)) t = turn;
    if (t < 0) {
      const a = provoker(state, i);
      if (a >= 0 && chase(a)) t = a;
    }
    if (t < 0) {
      let bestD = 0;
      for (const j of state.grid.nearOthers(hx, hz, chaseWu)) {
        if (!playerUnit(state, j) || !chase(j)) continue;
        const d = length2d(e.x[j]! - hx, e.z[j]! - hz);
        if (t < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[t]!)) {
          t = j;
          bestD = d;
        }
      }
    }
  }
  if (t >= 0) {
    engageUnit(state, i, spec, t);
    return;
  }
  e.target[i] = 0;
  if (away > CRYSTAL_GUARDS.leashM * M - M) {
    walkMob(state, i, spec, hx, hz);
    return;
  }
  e.order[i] = OrderKind.Idle;
}

/** Whether a mob is a mana crystal's guardian (the client's glow and tooltip). */
export function isCrystalGuardian(state: SimState, i: number): boolean {
  return state.entities.kind[i] === UnitKind.Mob && state.entities.role[i] === Role.Guardian;
}
