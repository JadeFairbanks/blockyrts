// What dusk decides about the coming night (Rising difficulty; Table 8;
// Day and night): each player's difficulty reading (town size, provoked
// tribes and creatures, how deep their units and buildings stand), whether
// fog rolls in, the goblin horde that comes for outlying lights over the
// limit, the new lairs, and the tribes making camp.

import { buildingSpec, OUTLYING_M } from '../buildings/data.ts';
import { buildingCentre, isLit, nearMainBase, outlyingLights } from '../buildings/lights.ts';
import { floorDiv, length2d } from '../fixed.ts';
import { UnitKind, WILD, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import { Nature, speciesSpec } from '../animals/species.ts';
import { addMob } from '../combat/mob-ai.ts';
import { Mob } from '../combat/mobs.ts';
import { edgePointNear } from '../combat/spawn.ts';
import { brightTonight } from './bright.ts';
import { bandAtWu } from './cells.ts';
import { DEPTH_PM, FOG_CHANCE_PCT, FOG_FROM_NIGHT } from './data.ts';
import { placeLairs } from './lairs.ts';
import { Role, type DuskReading } from './types.ts';

/** Town size: buildings beyond the first 10 add 2% each (Table 8); walls, gates, towers and lights do not count (s). */
const TOWN_FREE = 10;
const TOWN_PM_EACH = 20;
/** Provoked: +10% per village at war with the player, +5% per territorial creature hunting them (Table 8). */
const WAR_PM = 100;
const HUNTER_PM = 50;
/** Depth weighting is capped at doubling the base budget (s). */
const DEPTH_CAP_PM = 1000;
/** The dusk goblin horde (Table 17): 3 cutters and 1 slinger per light over the limit, 1 chief per 5, at most 40. */
const HORDE = { cutters: 3, slingers: 1, chiefEvery: 5, max: 40 };

function counts(b: { kind: number; complete: boolean }): boolean {
  const s = buildingSpec(b.kind);
  return b.complete && !s.defence && !s.light && !s.trophy;
}

/** A territorial creature hunting one of the player's units (Table 8: provoked). */
function huntersOf(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Animal || e.owner[i] !== WILD || e.hp[i]! <= 0 || !e.target[i]) continue;
    const nature = speciesSpec(e.mob[i]!).nature;
    if (nature !== Nature.Territorial && nature !== Nature.Nest && nature !== Nature.Hunter) continue;
    const t = e.indexOf(e.target[i]!);
    if (t >= 0 && e.owner[t] === player) n++;
  }
  return n;
}

/** Reads a player's difficulty at dusk: town and provoked factors, and the depth weighting with its deepest asset. */
export function readDusk(state: SimState, player: number): DuskReading {
  let buildings = 0;
  for (const b of state.buildings.list) if (b.owner === player && counts(b)) buildings++;
  const townPm = 1000 + TOWN_PM_EACH * Math.max(0, buildings - TOWN_FREE);
  let wars = 0;
  for (const v of state.threats.villages) if (v.war & (1 << player)) wars++;
  const provokedPm = 1000 + WAR_PM * wars + HUNTER_PM * huntersOf(state, player);
  // Depth: every unit and building outside the Heartland adds by its band; the deepest is the anchor the extras come for.
  let depthPm = 0;
  let ax = 0;
  let az = 0;
  let band: number = Band.Heartland;
  let building = 0;
  let far = -1;
  const note = (x: number, z: number, id: number): void => {
    const b = bandAtWu(state, x, z);
    depthPm += DEPTH_PM[b]!;
    const d = length2d(x, z);
    if (b > band || (b === band && b !== Band.Heartland && d > far)) {
      band = b;
      ax = x;
      az = z;
      building = id;
      far = d;
    }
  };
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
    if (e.kind[i] !== UnitKind.Worker && e.kind[i] !== UnitKind.Warrior && e.kind[i] !== UnitKind.Mage) continue;
    note(e.x[i]!, e.z[i]!, 0);
  }
  for (const b of state.buildings.list) {
    // A trophy (Patch 7) is a small item, not a holding the extras come for.
    if (b.owner !== player || buildingSpec(b.kind).trophy) continue;
    const [x, z] = buildingCentre(b);
    note(x, z, b.id);
  }
  return { townPm, provokedPm, depthPm: Math.min(DEPTH_CAP_PM, depthPm), ax, az, band, building };
}

/** Fog rolls in for the night (Table 8): it clears with the day. */
export function startFog(state: SimState, night: number): void {
  state.threats.fog = night + 1;
  state.events.push({ player: -1, kind: 'alert', text: 'Fog is rolling in: tonight everyone sees half as far and torches light half as much.' });
}

/**
 * The dusk goblin horde (Table 8, Table 17): for each player with more
 * outlying lights than tonight's limit, goblins come out of the dark edge
 * nearest those lights and go for them.
 */
export function duskHorde(state: SimState, night: number): void {
  for (let p = 0; p < state.players.length; p++) {
    // A Bright Night sends no goblins for the lights either (Patch 5 decisions 2.8: no waves).
    if (state.players[p]!.out || brightTonight(state, p)) continue;
    const { halves, limit } = outlyingLights(state, p, night);
    if (halves <= limit * 2) continue;
    const over = floorDiv(halves + 1, 2) - limit;
    const lights = outlyingList(state, p);
    if (lights.length === 0) continue;
    let sx = 0;
    let sz = 0;
    for (const [x, z] of lights) {
      sx += x;
      sz += z;
    }
    const [ex, ez] = edgePointNear(state, p, floorDiv(sx, lights.length), floorDiv(sz, lights.length));
    const kinds: number[] = [];
    for (let k = 0; k < over; k++) {
      for (let c = 0; c < HORDE.cutters; c++) kinds.push(Mob.GoblinCutter);
      for (let c = 0; c < HORDE.slingers; c++) kinds.push(Mob.GoblinSlinger);
      if ((k + 1) % HORDE.chiefEvery === 0) kinds.push(Mob.GoblinChief);
    }
    kinds.length = Math.min(kinds.length, HORDE.max);
    const e = state.entities;
    kinds.forEach((m, k) => {
      const i = addMob(state, m, p, ex + ((k % 5) - 2) * 6000, ez + (floorDiv(k, 5) % 5 - 2) * 6000, night);
      const [lx, lz] = lights[k % lights.length]!;
      e.role[i] = Role.Aimed;
      e.homeX[i] = lx;
      e.homeZ[i] = lz;
    });
  }
}

/** The player's lit lights out beyond their main bases (the outlying count's lights), wu. */
function outlyingList(state: SimState, player: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    const light = buildingSpec(b.kind).light;
    if (!light || light.outlyingHalves === 0 || !isLit(b)) continue;
    if (nearMainBase(state, b, OUTLYING_M)) continue;
    out.push(buildingCentre(b));
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Everything dusk decides, for the night that follows (night `night`). */
export function atDusk(state: SimState, night: number): void {
  if (state.peaceful) return;
  state.threats.dusk = state.players.map((_, p) => readDusk(state, p));
  if (night >= FOG_FROM_NIGHT && state.rng.weather.nextInt(100) < FOG_CHANCE_PCT) startFog(state, night);
  duskHorde(state, night);
  placeLairs(state, night);
}
