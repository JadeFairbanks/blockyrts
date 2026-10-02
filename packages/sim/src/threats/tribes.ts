// Hostile tribes (Hostile tribes; Table 16): gnoll, kobold and hobgoblin
// bands that roam the Fringe and the Deepwoods by day. A new band turns up
// every other day while the world holds fewer than 20 tribesmen per player,
// in a Fringe or Deepwoods cell within 700 m of a town but 60 m from
// anything of the players' and outside their claimed land. A band walks
// from cell to cell; what it sees it chases until no one has seen it for
// 20 s; at dusk it makes camp round a fire and fights only what attacks it.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre, dist2, isClaimed } from '../buildings/lights.ts';
import { floorDiv, length2d, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import { addMob } from '../combat/mob-ai.ts';
import { cellAt, occupiedCells } from './cells.ts';
import { bandDue, TRIBE_CAP_PER_PLAYER, TRIBE_GIVE_UP_STEPS, TRIBE_KEEP_AWAY_WU, TRIBE_ODDS, TRIBE_SPAWN_RANGE_WU, TRIBES } from './data.ts';
import { nightNow } from './lairs.ts';
import { Role, type TribeBand } from './types.ts';

const COL = WU_PER_COLUMN;
/** A band picks its next cell once its first member is within 10 m of where it was going (s). */
const ARRIVED_WU = 10 * WU_PER_METRE;

function roams(band: Band): boolean {
  return band === Band.Fringe || band === Band.Deepwoods;
}

/** The tribesmen of a band, alive, in index order. */
export function members(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.role[i] === Role.Tribe && e.group[i] === id && e.hp[i]! > 0) out.push(i);
  return out;
}

function tribesmen(state: SimState): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.role[i] === Role.Tribe && e.hp[i]! > 0) n++;
  return n;
}

/** The players' towns: each main base's middle, wu, with its owner. */
function towns(state: SimState): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const b of state.buildings.list) {
    if (b.kind !== BuildingKind.MainBase || b.owner >= state.players.length || state.players[b.owner]!.out) continue;
    const [x, z] = buildingCentre(b);
    out.push([x, z, b.owner]);
  }
  return out;
}

/** Whether a spot keeps 60 m from every unit and building of the players and lies outside their claimed land. */
function keepsAway(state: SimState, x: number, z: number): boolean {
  const r2 = TRIBE_KEEP_AWAY_WU * TRIBE_KEEP_AWAY_WU;
  const e = state.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i]! < state.players.length && dist2(x, z, e.x[i]!, e.z[i]!) < r2) return false;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const [bx, bz] = buildingCentre(b);
    if (dist2(x, z, bx, bz) < r2) return false;
  }
  for (let p = 0; p < state.players.length; p++) if (isClaimed(state, p, x, z)) return false;
  return state.nav.standable(floorDiv(x, COL), floorDiv(z, COL), WALKER);
}

/**
 * At daybreak on a band's day (Table 16: every other day from day 3, s):
 * a new band of a tribe picked by the band's odds, when there is room
 * under the cap and a free spot near a town.
 */
export function spawnBand(state: SimState, cycle: number, force?: { tribe: number; x: number; z: number }): TribeBand | undefined {
  const live = state.players.filter((p) => !p.out).length;
  if (!force && (!bandDue(cycle) || tribesmen(state) >= TRIBE_CAP_PER_PLAYER * live)) return undefined;
  const rng = state.rng.ai;
  const layout = state.world.layout;
  let spot: [number, number] | undefined;
  let band: Band = Band.Fringe;
  if (force) {
    spot = [force.x, force.z];
    band = layout.cell(cellAt(state, force.x, force.z)).band;
  } else {
    const occupied = occupiedCells(state);
    const cells = new Set<number>();
    for (const [x, z] of towns(state)) {
      for (const s of layout.sitesNear(floorDiv(x, COL), floorDiv(z, COL), floorDiv(TRIBE_SPAWN_RANGE_WU, COL))) {
        if (occupied.has(s.id) || !roams(layout.cell(s.id).band)) continue;
        if (length2d(s.x * COL - x, s.z * COL - z) <= TRIBE_SPAWN_RANGE_WU) cells.add(s.id);
      }
    }
    const list = [...cells].sort((a, b) => a - b);
    for (let tries = 0; tries < 6 && list.length > 0 && !spot; tries++) {
      const k = rng.nextInt(list.length);
      const cell = layout.cell(list[k]!);
      list.splice(k, 1);
      const spread = Math.max(10, floorDiv(cell.size, 3));
      for (let t = 0; t < 4 && !spot; t++) {
        const x = (cell.x + rng.range(-spread, spread)) * COL + (COL >> 1);
        const z = (cell.z + rng.range(-spread, spread)) * COL + (COL >> 1);
        if (keepsAway(state, x, z)) {
          spot = [x, z];
          band = cell.band;
        }
      }
    }
  }
  if (!spot) return undefined;
  let tribe = force?.tribe ?? -1;
  if (tribe < 0) {
    const odds = TRIBE_ODDS[band] ?? TRIBE_ODDS[Band.Fringe]!;
    let r = rng.nextInt(100);
    tribe = TRIBES[TRIBES.length - 1]!.mob;
    for (let k = 0; k < TRIBES.length; k++) {
      if (r < odds[k]!) {
        tribe = TRIBES[k]!.mob;
        break;
      }
      r -= odds[k]!;
    }
  }
  const size = TRIBES.find((t) => t.mob === tribe)!;
  const n = size.min + rng.nextInt(size.max - size.min + 1);
  const id = state.nextEntityId++;
  const rec: TribeBand = { id, tribe, x: spot[0], z: spot[1], camp: 0, campX: 0, campZ: 0, target: 0, sawAt: 0 };
  state.threats.bands.push(rec);
  // Its quarry for elimination and score is the player whose town is nearest.
  let foe = 0;
  let best = -1;
  for (const [tx, tz, p] of towns(state)) {
    const d = dist2(tx, tz, spot[0], spot[1]);
    if (best < 0 || d < best) {
      best = d;
      foe = p;
    }
  }
  const night = nightNow(state);
  for (let k = 0; k < n; k++) {
    const i = addMob(state, tribe, foe, spot[0] + ((k % 3) - 1) * 2 * WU_PER_METRE, spot[1] + (floorDiv(k, 3) - 1) * 2 * WU_PER_METRE, night);
    state.entities.role[i] = Role.Tribe;
    state.entities.group[i] = id;
  }
  return rec;
}

/** Each second: bands with no one left go, a chase no one has seen for 20 s is given up, and a band that got where it was going picks the next cell. */
export function updateBands(state: SimState): void {
  const layout = state.world.layout;
  const e = state.entities;
  state.threats.bands = state.threats.bands.filter((band) => {
    const list = members(state, band.id);
    if (list.length === 0) return false;
    if (band.target && state.step - band.sawAt > TRIBE_GIVE_UP_STEPS) band.target = 0;
    if (band.camp || band.target) return true;
    const lead = list[0]!;
    if (length2d(e.x[lead]! - band.x, e.z[lead]! - band.z) > ARRIVED_WU) return true;
    // On to a neighbouring cell of the Fringe or the Deepwoods.
    const here = cellAt(state, e.x[lead]!, e.z[lead]!);
    const next = layout.neighboursOf(here).filter((c) => roams(layout.cell(c).band));
    if (next.length === 0) return true;
    const c = layout.cell(next[state.rng.ai.nextInt(next.length)]!);
    band.x = c.x * COL + (COL >> 1);
    band.z = c.z * COL + (COL >> 1);
    return true;
  });
}

/** At dusk every band makes camp where its first member stands; at daybreak it breaks camp. */
export function campBands(state: SimState, camp: boolean): void {
  const e = state.entities;
  for (const band of state.threats.bands) {
    const list = members(state, band.id);
    band.camp = camp && list.length > 0 ? 1 : 0;
    band.target = 0;
    if (band.camp) {
      band.campX = e.x[list[0]!]!;
      band.campZ = e.z[list[0]!]!;
    }
  }
}
