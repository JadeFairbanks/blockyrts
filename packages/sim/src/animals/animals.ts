// Animals in the world (Animals; Wild herds; Game and other wild animals;
// Bears; Young animals; Fish; Table 6 livestock and grazing; Table 14
// taming). There is a fixed number of wild animals: each cell is stocked
// the first time the players come near it, and only breeding adds more.
// Wild animals graze round their spot, run, fight back, hunt in packs,
// stalk, guard or knock over torches by their nature; tamed ones belong to
// a farm or the Stables, graze round it by day, shelter in a pen and barn
// or the Stables by night, breed there and can be slaughtered.

import { BuildingKind, buildingName, footprintDims, OUTLYING_M } from '../buildings/data.ts';
import { buildingCentre, dist2, nearMainBase } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { RESOURCES, Res, type Cost } from '../economy/resources.ts';
import { animalUpkeep } from '../economy/food.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { OrderKind, standY, UnitKind, WILD, type SimState } from '../state.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { hash32 } from '../rng.ts';
import { Band } from '../world/layout.ts';
import { Mat } from '../world/materials.ts';
import { PropKind } from '../world/props.ts';
import { deathHooks, gap, hurtUnit, sideOf, Side } from '../combat/combat.ts';
import { stepToward } from '../combat/fight.ts';
import { hasWaterAt } from '../buildings/placement.ts';
import { BEAR_CAP, BREED_STEPS, breeds, Nature, Species, speciesSpec, SPECIES, YOUNG_STEPS, type SpeciesSpec } from './species.ts';

const COLUMN = WU_PER_COLUMN;
const M = WU_PER_METRE;

/** Cells are stocked when a player's unit is in one or next to it, looked at every 5 s (s). */
export const STOCK_CHECK_STEPS = 5 * STEPS_PER_SECOND;
/** Grazing animals wander within 10 m of their spot (s), choosing a new patch every 6 to 20 s. */
const GRAZE_WU = 10 * M;
/** A hurt animal runs for 8 s (s); a fight is given up 20 m (pack: 40 m) from its spot. */
const FLEE_STEPS = 8 * STEPS_PER_SECOND;
const GIVE_UP_WU = 20 * M;
const PACK_CHASE_WU = 40 * M;
/** Wolves see the players' units 15 m away; a lynx stalks a worker alone within 15 m and runs from 3 or more within 8 m (s). */
const PACK_SIGHT_WU = 15 * M;
const LONE_WU = 8 * M;
/** Frogs and crocodiles guard 6 m round their spot (s); bears 2 m, a mother with a cub 15 m (doc). */
const GUARD_WU = 6 * M;
const BEAR_NEAR_WU = 2 * M;
const BEAR_MOTHER_WU = 15 * M;
/** Badgers go for an outlying torch within 30 m every minute and run from units within 6 m (s). */
const BADGER_REACH_WU = 30 * M;
const BADGER_SHY_WU = 6 * M;
const BADGER_REST_STEPS = 60 * STEPS_PER_SECOND;
/** Tamed animals graze within 15 m of their home by day (s) and need its grass within 30 m (Table 6). */
const HOME_GRAZE_WU = 15 * M;
const GRASS_REACH_COLUMNS = floorDiv(30 * M, COLUMN);
/** A working animal walks 2 m behind its worker (s). */
const FOLLOW_WU = 2 * M;
/** How many animals each home holds (Table 4: livestock farm 6 / 10 / 16, Stables 6 stalls) and a pen and barn shelters at night (8). */
export function homeRoom(b: Building): number {
  if (!b.complete) return 0;
  if (b.kind === BuildingKind.LivestockFarm) return [6, 10, 16][b.level - 1] ?? 6;
  if (b.kind === BuildingKind.Stables) return 6;
  return 0;
}
const PEN_ROOM = 8;

function hash(state: SimState, ...v: number[]): number {
  return hash32(state.seed ^ 0x616e696d, ...v);
}

// ----- adding animals -----

/** Puts an animal in the world. `grownAt` is the step it grows up (0 for grown); `sex` 1 is a male. */
export function addAnimal(state: SimState, species: number, owner: number, x: number, z: number, grownAt: number, sex: number): number {
  const s = speciesSpec(species);
  const e = state.entities;
  const id = state.nextEntityId++;
  const i = e.add(id, owner, x, standY(state, x, z), z, s.walk, UnitKind.Animal);
  e.mob[i] = species;
  const young = grownAt > state.step;
  e.maxHp[i] = young ? s.hp >> 1 : s.hp;
  e.hp[i] = e.maxHp[i]!;
  e.rank[i] = 1;
  e.born[i] = young ? grownAt : 0;
  e.sex[i] = sex;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  e.breedAt[i] = (young ? grownAt : state.step) + BREED_STEPS;
  e.heading[i] = hash(state, id) & 0xffff;
  e.wanderAt[i] = state.step + 20 + (hash(state, id, 1) % 200);
  return i;
}

/** A column a land animal can stand on near (x, z), columns, or null. */
function landNear(state: SimState, x: number, z: number, water: boolean): [number, number] | null {
  for (let r = 0; r < 6; r++) {
    for (let k = 0; k < 8; k++) {
      const cx = x + ((k & 1 ? 1 : -1) * r * ((k >> 1) & 1)) + (k >= 4 ? r : 0);
      const cz = z + ((k & 2 ? 1 : -1) * r * (k & 1)) + (k >= 4 ? -r : 0);
      if (state.buildings.footprintAt(cx, cz) !== 0) continue;
      const wet = hasWaterAt(state, cx, cz);
      if (wet && !water) continue;
      if (!wet && !state.nav.standable(cx, cz, { id: 1, canSwim: false })) continue;
      return [cx, cz];
    }
  }
  return null;
}

/** Whether a column has water beside it (a bank: crabs, crocodiles). */
function nearWater(state: SimState, x: number, z: number): boolean {
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) if (hasWaterAt(state, x + dx, z + dz)) return true;
  return false;
}

/** Bears in the world. */
function bearCount(state: SimState): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Animal && e.mob[i] === Species.Bear) n++;
  return n;
}

/** How many groups of a species a cell holds at the start (Table 5 wild herds; game and creatures are my picks (s)). */
function groupsIn(state: SimState, s: SpeciesSpec, cell: number, band: Band): number {
  if (!s.bands.includes(band)) return 0;
  const roll = hash(state, cell, s.id, 7) % 100;
  switch (s.id) {
    // One pack, lynx or badger in every other cell (s).
    case Species.Wolf:
    case Species.Lynx:
    case Species.Badger:
      return roll < 50 ? 1 : 0;
    case Species.GiantFrog:
    case Species.Crocodile:
    case Species.GiantCrab:
      return roll < 60 ? s.perCell : 0;
    default:
      return s.perCell;
  }
}

/**
 * Stocks a cell with its wild animals: herds in pairs (one of each sex),
 * game, creatures, and in the Deepwoods a bear pair with a cub. Water
 * creatures need a bank, frogs a bog; a group finds its spot from the seed.
 */
export function stockCell(state: SimState, cellId: number): void {
  if (state.stockedCells.has(cellId)) return;
  state.stockedCells.add(cellId);
  const cell = state.world.layout.cell(cellId);
  const spread = Math.max(20, floorDiv(cell.size * 2, 5));
  for (const s of SPECIES) {
    const groups = groupsIn(state, s, cellId, cell.band);
    for (let g = 0; g < groups; g++) {
      if (s.id === Species.Bear && bearCount(state) + 3 > BEAR_CAP) break;
      const water = s.id === Species.Crocodile || s.id === Species.GiantCrab;
      const bog = s.id === Species.GiantFrog;
      let spot: [number, number] | null = null;
      for (let t = 0; t < (water || bog ? 24 : 4) && !spot; t++) {
        const h = hash(state, cellId, s.id, g, t);
        const cx = cell.x + ((h & 0xffff) % (spread * 2 + 1)) - spread;
        const cz = cell.z + (((h >>> 16) & 0xffff) % (spread * 2 + 1)) - spread;
        if (water && !nearWater(state, cx, cz)) continue;
        if (bog) {
          const layers = state.world.columnAt(cx, cz);
          if (layers[layers.length - 1] !== Mat.Mud) continue;
        }
        spot = landNear(state, cx, cz, false);
      }
      if (!spot) continue;
      const herd = breeds(s.id);
      const n = herd ? 2 : s.groupMin + (hash(state, cellId, s.id, g, 99) % (s.groupMax - s.groupMin + 1));
      for (let k = 0; k < n; k++) {
        const h = hash(state, cellId, s.id, g, k, 5);
        const x = spot[0] * COLUMN + (COLUMN >> 1) + ((h & 0xff) % (6 * COLUMN)) - 3 * COLUMN;
        const z = spot[1] * COLUMN + (COLUMN >> 1) + (((h >>> 8) & 0xff) % (6 * COLUMN)) - 3 * COLUMN;
        const i = addAnimal(state, s.id, WILD, x, z, 0, herd ? k & 1 : (h >>> 16) & 1);
        state.entities.homeX[i] = spot[0] * COLUMN + (COLUMN >> 1);
        state.entities.homeZ[i] = spot[1] * COLUMN + (COLUMN >> 1);
      }
      // A bear pair comes with a cub (doc).
      if (s.id === Species.Bear) {
        const i = addAnimal(state, s.id, WILD, spot[0] * COLUMN, spot[1] * COLUMN + 2 * COLUMN, state.step + YOUNG_STEPS, 0);
        state.entities.homeX[i] = spot[0] * COLUMN + (COLUMN >> 1);
        state.entities.homeZ[i] = spot[1] * COLUMN + (COLUMN >> 1);
      }
    }
  }
}

/** Fish water per column, in thousandths of a square metre (a column is 45 cm square). */
const COLUMN_AREA_MM2 = 2025;

/**
 * Stocks a chunk's water with fish (Fish): Heartland streams trout (1 per
 * 4 m2), Fringe streams salmon and Deepwoods pools giant catfish (1 per
 * 8 m2). The water's fish are shared out over stretches of bank about 4 m
 * apart, up to 4 a chunk (s), each starting full.
 */
export function stockChunk(state: SimState, cx: number, cz: number, key: number): void {
  if (state.stockedChunks.has(key)) return;
  state.stockedChunks.add(key);
  const N = 1 << CHUNK_SHIFT;
  const x0 = cx * N;
  const z0 = cz * N;
  const layout = state.world.layout;
  const band = layout.cell(layout.nearest(x0 + (N >> 1), z0 + (N >> 1))).band;
  const kind = band === Band.Heartland ? PropKind.FishTrout : band === Band.Fringe ? PropKind.FishSalmon : band === Band.Deepwoods ? PropKind.FishCatfish : -1;
  if (kind < 0) return;
  let water = 0;
  const banks: Array<[number, number]> = [];
  for (let z = z0; z < z0 + N; z++) {
    for (let x = x0; x < x0 + N; x++) {
      if (hasWaterAt(state, x, z)) {
        water++;
        continue;
      }
      if ((x & 7) !== 0 && (z & 7) !== 0) continue;
      if (hasWaterAt(state, x + 1, z) || hasWaterAt(state, x - 1, z) || hasWaterAt(state, x, z + 1) || hasWaterAt(state, x, z - 1)) banks.push([x, z]);
    }
  }
  const perM2Thousandths = kind === PropKind.FishTrout ? 4000 : 8000;
  const fish = floorDiv(water * COLUMN_AREA_MM2, perM2Thousandths);
  if (fish < 4 || banks.length === 0) return;
  const stretches = Math.min(4, banks.length);
  const each = floorDiv(fish, stretches);
  if (each < 2) return;
  for (let k = 0; k < stretches; k++) {
    const [x, z] = banks[floorDiv(k * banks.length, stretches)]!;
    state.world.addProp(x, z, kind, 0, each, state.step);
  }
}

/** Every 5 s: the cells and chunks the players' units are in or next to get their animals and fish. */
function updateStocking(state: SimState): void {
  const e = state.entities;
  const cells = new Set<number>();
  const chunks = new Map<number, [number, number]>();
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i]! >= state.players.length || e.inside[i] !== 0 || e.kind[i] === UnitKind.Animal) continue;
    const cx = floorDiv(e.x[i]!, COLUMN);
    const cz = floorDiv(e.z[i]!, COLUMN);
    cells.add(state.world.layout.nearest(cx, cz));
    const kx = cx >> CHUNK_SHIFT;
    const kz = cz >> CHUNK_SHIFT;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.set((kx + dx + 0x100000) * 0x200000 + (kz + dz + 0x100000), [kx + dx, kz + dz]);
  }
  const all = new Set<number>();
  for (const c of cells) {
    all.add(c);
    for (const n of state.world.layout.neighboursOf(c)) all.add(n);
  }
  for (const c of [...all].sort((a, b) => a - b)) stockCell(state, c);
  for (const [key, [kx, kz]] of [...chunks].sort((a, b) => a[0] - b[0])) stockChunk(state, kx, kz, key);
}

// ----- behaviour -----

function speedOf(state: SimState, i: number, running: boolean): number {
  const s = speciesSpec(state.entities.mob[i]!);
  const base = running ? s.run : s.walk;
  return hasWaterAt(state, floorDiv(state.entities.x[i]!, COLUMN), floorDiv(state.entities.z[i]!, COLUMN)) && s.swim ? s.swim : base;
}

/** Steps an animal towards a point; a blocked step picks a new patch next time. */
function goTo(state: SimState, i: number, x: number, z: number, running: boolean): boolean {
  const e = state.entities;
  if (length2d(x - e.x[i]!, z - e.z[i]!) <= (COLUMN >> 2)) return false;
  const ok = stepToward(state, i, x, z, speedOf(state, i, running));
  if (!ok) e.wanderAt[i] = state.step;
  return ok;
}

function graze(state: SimState, i: number, ax: number, az: number, radius: number): void {
  const e = state.entities;
  if (state.step >= e.wanderAt[i]!) {
    const h = hash(state, e.id[i]!, state.step);
    e.targetX[i] = ax + ((h & 0xffff) % (radius * 2 + 1)) - radius;
    e.targetZ[i] = az + (((h >>> 16) & 0xffff) % (radius * 2 + 1)) - radius;
    e.wanderAt[i] = state.step + 6 * STEPS_PER_SECOND + (h % (14 * STEPS_PER_SECOND));
  }
  if (!goTo(state, i, e.targetX[i]!, e.targetZ[i]!, false)) e.order[i] = OrderKind.Idle;
}

function flee(state: SimState, i: number, from: number): void {
  const e = state.entities;
  e.target[i] = 0;
  const ok = stepToward(state, i, e.x[from]!, e.z[from]!, -speedOf(state, i, true));
  if (!ok) graze(state, i, e.homeX[i]!, e.homeZ[i]!, GRAZE_WU);
}

/** Whether a unit is one of the players' that an animal may go for (outside, alive, not an animal). */
function prey(state: SimState, j: number): boolean {
  const e = state.entities;
  return j >= 0 && e.hp[j]! > 0 && e.inside[j] === 0 && sideOf(state, j) === Side.Players && e.kind[j] !== UnitKind.Animal;
}

/** Fights a unit: closes in at a run and bites, gores or swipes at its own pace. */
function fight(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  e.target[i] = e.id[t]!;
  if (gap(state, i, t) > s.reach) {
    goTo(state, i, e.x[t]!, e.z[t]!, true);
    return;
  }
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  e.order[i] = OrderKind.Attack;
  if (state.step < e.atkNext[i]! || s.damage <= 0) return;
  e.atkNext[i] = state.step + s.attackSteps;
  hurtUnit(state, t, { damage: s.damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false });
}

/** The players' unit that hurt it in the last 8 s, if still there. */
function recentAttacker(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.attacker[i] || state.step - e.hurtAt[i]! > FLEE_STEPS) return -1;
  const a = e.indexOf(e.attacker[i]!);
  return a >= 0 && e.hp[a]! > 0 && sideOf(state, a) === Side.Players ? a : -1;
}

function fromHome(state: SimState, i: number, t: number): number {
  const e = state.entities;
  return length2d(e.x[t]! - e.homeX[i]!, e.z[t]! - e.homeZ[i]!);
}

/** The players' units near a point, nearest first (ties to the lowest id). */
function nearbyPrey(state: SimState, x: number, z: number, r: number): number[] {
  const e = state.entities;
  const out: Array<[number, number]> = [];
  for (const j of state.grid.near(x, z, r)) {
    if (!prey(state, j)) continue;
    const d = length2d(e.x[j]! - x, e.z[j]! - z);
    if (d <= r) out.push([d, j]);
  }
  out.sort((a, b) => a[0] - b[0] || e.id[a[1]]! - e.id[b[1]]!);
  return out.map((p) => p[1]);
}

function keepTarget(state: SimState, i: number, reach: number): number {
  const e = state.entities;
  const t = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  if (t >= 0 && prey(state, t) && fromHome(state, i, t) <= reach) return t;
  e.target[i] = 0;
  return -1;
}

function runWild(state: SimState, i: number): void {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  // Held still by a worker taming it.
  if (e.waitUntil[i]! > state.step) {
    e.target[i] = 0;
    return;
  }
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  const a = recentAttacker(state, i);
  switch (s.nature) {
    case Nature.Shy:
      if (a >= 0) return flee(state, i, a);
      break;
    case Nature.FightsBack: {
      const t = a >= 0 && fromHome(state, i, a) <= GIVE_UP_WU ? a : keepTarget(state, i, GIVE_UP_WU);
      if (t >= 0) return fight(state, i, t);
      break;
    }
    case Nature.Pack: {
      let t = a >= 0 ? a : keepTarget(state, i, PACK_CHASE_WU);
      if (t < 0) {
        // The pack goes for the nearest unit any of them sees.
        t = nearbyPrey(state, e.x[i]!, e.z[i]!, PACK_SIGHT_WU)[0] ?? -1;
        if (t < 0) {
          for (const j of state.grid.near(e.x[i]!, e.z[i]!, GIVE_UP_WU)) {
            if (j === i || e.kind[j] !== UnitKind.Animal || e.mob[j] !== s.id || e.owner[j] !== WILD || !e.target[j]) continue;
            const k = e.indexOf(e.target[j]!);
            if (prey(state, k)) {
              t = k;
              break;
            }
          }
        }
      }
      if (t >= 0) return fight(state, i, t);
      break;
    }
    case Nature.Stalker: {
      const near = nearbyPrey(state, e.x[i]!, e.z[i]!, LONE_WU);
      if (near.length >= 3) return flee(state, i, near[0]!);
      let t = a >= 0 ? a : keepTarget(state, i, PACK_CHASE_WU);
      if (t < 0) {
        for (const j of nearbyPrey(state, e.x[i]!, e.z[i]!, PACK_SIGHT_WU)) {
          if (e.kind[j] !== UnitKind.Worker) continue;
          if (nearbyPrey(state, e.x[j]!, e.z[j]!, LONE_WU).length === 1) {
            t = j;
            break;
          }
        }
      }
      if (t >= 0) return fight(state, i, t);
      break;
    }
    case Nature.Territorial: {
      let t = a >= 0 && fromHome(state, i, a) <= GIVE_UP_WU ? a : keepTarget(state, i, GIVE_UP_WU);
      if (t < 0) t = nearbyPrey(state, hx, hz, GUARD_WU)[0] ?? -1;
      if (t >= 0) return fight(state, i, t);
      // Back to its spot and wait there.
      if (!goTo(state, i, hx, hz, false)) e.order[i] = OrderKind.Idle;
      return;
    }
    case Nature.TorchBreaker: {
      const near = nearbyPrey(state, e.x[i]!, e.z[i]!, BADGER_SHY_WU);
      if (near.length > 0) return flee(state, i, near[0]!);
      if (state.step >= e.abilityAt[i]! && !isDark(state.step)) {
        const torch = outlyingTorch(state, e.x[i]!, e.z[i]!);
        if (torch) {
          const [tx, tz] = buildingCentre(torch);
          if (length2d(tx - e.x[i]!, tz - e.z[i]!) > M) {
            goTo(state, i, tx, tz, false);
            return;
          }
          knockOver(state, torch, e.x[i]!, e.z[i]!);
          e.abilityAt[i] = state.step + BADGER_REST_STEPS;
          return;
        }
        e.abilityAt[i] = state.step + 10 * STEPS_PER_SECOND;
      }
      break;
    }
    case Nature.Bear: {
      let t = a >= 0 && fromHome(state, i, a) <= PACK_CHASE_WU ? a : keepTarget(state, i, PACK_CHASE_WU);
      if (t < 0) t = nearbyPrey(state, e.x[i]!, e.z[i]!, motherOfCub(state, i) ? BEAR_MOTHER_WU : BEAR_NEAR_WU)[0] ?? -1;
      if (t >= 0) return fight(state, i, t);
      break;
    }
  }
  e.target[i] = 0;
  graze(state, i, hx, hz, GRAZE_WU);
}

/** A grown she-bear with a cub of her spot nearby (Bears: attacks anything within 15 m). */
function motherOfCub(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.sex[i] !== 0 || e.born[i]! > state.step) return false;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, 10 * M)) if (j !== i && e.kind[j] === UnitKind.Animal && e.mob[j] === Species.Bear && e.born[j]! > state.step) return true;
  return false;
}

/** The nearest lit torch post or wall torch out beyond the base (Light and torches: outlying), within a badger's reach. */
function outlyingTorch(state: SimState, x: number, z: number): Building | undefined {
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if ((b.kind !== BuildingKind.TorchPost && b.kind !== BuildingKind.WallTorch) || !b.complete || b.fuelUntil <= state.step) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, x, z);
    if (d > BADGER_REACH_WU * BADGER_REACH_WU || (best && d >= bestD)) continue;
    if (nearMainBase(state, b, OUTLYING_M)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** A badger knocks a torch over (roster 6): it goes out and loses half its health (s). */
function knockOver(state: SimState, b: Building, x: number, z: number): void {
  b.fuelUntil = state.step;
  b.hp = Math.max(1, b.hp >> 1);
  state.events.push({ player: b.owner, kind: 'alert', text: 'A badger knocked over an outlying torch. Relight it.', x, z });
}

/** Where a tamed animal shelters at night: a pen and barn or the Stables with room near its home, else its home. */
function shelterFor(state: SimState, i: number, home: Building): Building | undefined {
  const e = state.entities;
  const [hx, hz] = buildingCentre(home);
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete) continue;
    const room = b.kind === BuildingKind.PenBarn ? PEN_ROOM : b.kind === BuildingKind.Stables ? 6 : 0;
    if (room === 0 || (shelteredIn(state, b.id) >= room && e.inside[i] !== b.id)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, hx, hz);
    if (d > (60 * M) * (60 * M) || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

function shelteredIn(state: SimState, id: number): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) if (e.inside[j] === id && e.kind[j] === UnitKind.Animal) n++;
  return n;
}

function goOutside(state: SimState, i: number): void {
  const e = state.entities;
  const b = state.buildings.get(e.inside[i]!);
  e.inside[i] = 0;
  if (!b) return;
  const [x, z] = buildingCentre(b);
  const { d } = footprintDims(b.kind, b.variant);
  e.x[i] = x;
  e.z[i] = z + ((d >> 1) + 2) * COLUMN;
  e.y[i] = standY(state, e.x[i]!, e.z[i]!);
}

function runTamed(state: SimState, i: number): void {
  const e = state.entities;
  e.target[i] = 0;
  // A working animal walks behind its worker.
  if (e.partner[i]) {
    const w = e.indexOf(e.partner[i]!);
    if (w >= 0 && e.hp[w]! > 0 && e.partner[w] === e.id[i]) {
      if (e.inside[i] !== 0) goOutside(state, i);
      const d = length2d(e.x[w]! - e.x[i]!, e.z[w]! - e.z[i]!);
      if (d > FOLLOW_WU) {
        const s = speciesSpec(e.mob[i]!);
        if (!stepToward(state, i, e.x[w]!, e.z[w]!, Math.min(s.run, Math.max(s.walk, d - FOLLOW_WU)))) {
          // Stuck behind: it catches up the way a led animal would.
          if (d > 6 * M) {
            e.x[i] = e.x[w]!;
            e.z[i] = e.z[w]!;
            e.y[i] = e.y[w]!;
          }
        }
      } else e.order[i] = OrderKind.Idle;
      return;
    }
    e.partner[i] = 0;
  }
  const home = state.buildings.get(e.home[i]!);
  if (!home || home.owner !== e.owner[i]) {
    e.home[i] = 0;
    const next = newHome(state, e.owner[i]!, e.mob[i]!);
    if (next) e.home[i] = next.id;
  }
  const b = state.buildings.get(e.home[i]!);
  const a = recentAttacker(state, i) >= 0 ? recentAttacker(state, i) : monsterNear(state, i);
  if (a >= 0 && e.inside[i] === 0) return flee(state, i, a);
  if (isDark(state.step) && b) {
    const shelter = shelterFor(state, i, b);
    if (shelter) {
      if (e.inside[i] === shelter.id) return;
      const [sx, sz] = buildingCentre(shelter);
      if (length2d(sx - e.x[i]!, sz - e.z[i]!) > 5 * M) {
        goTo(state, i, sx, sz, false);
        return;
      }
      e.inside[i] = shelter.id;
      e.x[i] = sx;
      e.z[i] = sz;
      return;
    }
  }
  if (e.inside[i] !== 0) {
    if (isDark(state.step)) return;
    goOutside(state, i);
  }
  if (!b) return graze(state, i, e.homeX[i]!, e.homeZ[i]!, GRAZE_WU);
  const [hx, hz] = buildingCentre(b);
  graze(state, i, hx, hz, HOME_GRAZE_WU);
}

/** A monster close by (tamed animals run from it). */
function monsterNear(state: SimState, i: number): number {
  const e = state.entities;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, 6 * M)) if (sideOf(state, j) === Side.Monsters && e.hp[j]! > 0) return j;
  return -1;
}

/** Animals at a home building. */
export function animalsAt(state: SimState, id: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) if (e.kind[j] === UnitKind.Animal && e.home[j] === id && e.hp[j]! > 0) out.push(j);
  return out;
}

/** The player's home with room for a species (Table 14: horses at the Stables; oxen at the Stables or a livestock farm; cattle and chickens at a livestock farm), nearest first. */
export function newHome(state: SimState, player: number, species: number, x?: number, z?: number): Building | undefined {
  const s = speciesSpec(species);
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== player || !b.complete || !s.tameAt.includes(b.kind)) continue;
    if (animalsAt(state, b.id).length >= homeRoom(b)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = x === undefined ? b.id : dist2(bx, bz, x, z!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** One step of an animal. */
export function runAnimal(state: SimState, i: number): void {
  const e = state.entities;
  e.order[i] = OrderKind.Idle;
  if (e.owner[i] === WILD) runWild(state, i);
  else runTamed(state, i);
}

// ----- each day -----

/** Raw crops a short-of-grass animal eats instead (Table 6), items counted by nutrition. */
const CROPS: readonly Res[] = [Res.Wheat, Res.Potatoes, Res.Carrots, Res.Corn];

function eatCrops(pool: Int32Array, need: number): boolean {
  let have = 0;
  for (const c of CROPS) have += pool[c]! * RESOURCES[c]!.nutrition;
  if (have < need) return false;
  let got = 0;
  while (got < need) {
    for (const c of CROPS) {
      if (got >= need) break;
      if (pool[c]! <= 0) continue;
      pool[c] = pool[c]! - 1;
      got += RESOURCES[c]!.nutrition;
    }
  }
  return true;
}

/** Grass within 30 m of a building, square metres, from a sample of every third column. */
function grassNear(state: SimState, b: Building): number {
  const [x, z] = buildingCentre(b);
  const cx = floorDiv(x, COLUMN);
  const cz = floorDiv(z, COLUMN);
  const r = GRASS_REACH_COLUMNS;
  let samples = 0;
  for (let dz = -r; dz <= r; dz += 3) {
    for (let dx = -r; dx <= r; dx += 3) {
      if (dx * dx + dz * dz > r * r || state.buildings.footprintAt(cx + dx, cz + dz) !== 0) continue;
      const layers = state.world.columnAt(cx + dx, cz + dz);
      const top = layers[layers.length - 1];
      if (top === Mat.Grass || top === Mat.DryGrass) samples++;
    }
  }
  // Each sample stands for 9 columns of 0.2025 m2.
  return floorDiv(samples * 9 * COLUMN_AREA_MM2, 1000);
}

/** The young grow up (Young animals). */
function growUp(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Animal || e.born[i] === 0 || e.born[i]! > state.step) continue;
    e.born[i] = 0;
    const hp = speciesSpec(e.mob[i]!).hp;
    e.hp[i] = e.hp[i]! + hp - e.maxHp[i]!;
    e.maxHp[i] = hp;
  }
}

/** A pair's young: wild pairs while their cell is not crowded, tamed pairs at a farm or the Stables with room (Wild herds; Table 6). */
function breed(state: SimState): void {
  const e = state.entities;
  const n0 = e.count;
  for (let i = 0; i < n0; i++) {
    if (e.kind[i] !== UnitKind.Animal || e.hp[i]! <= 0 || e.sex[i] !== 0 || e.born[i] !== 0 || !breeds(e.mob[i]!) || e.breedAt[i]! > state.step) continue;
    e.breedAt[i] = state.step + BREED_STEPS;
    const species = e.mob[i]!;
    const owner = e.owner[i]!;
    let male = -1;
    if (owner === WILD) {
      for (const j of state.grid.near(e.x[i]!, e.z[i]!, 30 * M)) if (e.kind[j] === UnitKind.Animal && e.mob[j] === species && e.owner[j] === WILD && e.sex[j] === 1 && e.born[j] === 0) male = j;
      if (male < 0) continue;
      // Crowding: no more than twice a cell's start (s); bears one pair and their cubs a cell, 60 in all (doc).
      const kin = state.grid.near(e.x[i]!, e.z[i]!, 60 * M).filter((j) => e.kind[j] === UnitKind.Animal && e.mob[j] === species && e.owner[j] === WILD).length;
      if (species === Species.Bear ? kin >= 4 || bearCount(state) >= BEAR_CAP : kin >= 4 * speciesSpec(species).perCell) continue;
    } else {
      const home = state.buildings.get(e.home[i]!);
      if (!home || (home.kind !== BuildingKind.LivestockFarm && home.kind !== BuildingKind.Stables)) continue;
      const herd = animalsAt(state, home.id);
      if (herd.length >= homeRoom(home)) continue;
      male = herd.find((j) => e.mob[j] === species && e.sex[j] === 1 && e.born[j] === 0) ?? -1;
      if (male < 0) continue;
    }
    const k = addAnimal(state, species, owner, e.x[i]!, e.z[i]! + COLUMN, state.step + YOUNG_STEPS, hash(state, e.id[i]!, state.step) & 1);
    e.homeX[k] = e.homeX[i]!;
    e.homeZ[k] = e.homeZ[i]!;
    e.home[k] = e.home[i]!;
    if (owner < state.players.length) state.events.push({ player: owner, kind: 'info', text: `A young ${speciesSpec(species).name.toLowerCase()} was born.`, x: e.x[i]!, z: e.z[i]! });
  }
}

/** Hens lay an egg a day at a livestock farm; herds short of grass eat crops or go hungry (Table 6). */
function livestockDay(state: SimState): void {
  const e = state.entities;
  for (const b of state.buildings.list) {
    if (!b.complete || (b.kind !== BuildingKind.LivestockFarm && b.kind !== BuildingKind.Stables)) continue;
    const herd = animalsAt(state, b.id).filter((j) => !e.partner[j]);
    if (herd.length === 0) continue;
    const pool = state.players[b.owner]!.pool;
    if (b.kind === BuildingKind.LivestockFarm) {
      const hens = herd.filter((j) => e.mob[j] === Species.Chicken && e.sex[j] === 0 && e.born[j] === 0).length;
      pool[Res.Eggs] = pool[Res.Eggs]! + hens;
    }
    let need = 0;
    for (const j of herd) need += speciesSpec(e.mob[j]!).grassM2;
    const grass = grassNear(state, b);
    if (grass >= need) continue;
    // The share of the herd the grass does not cover eats crops, or goes hungry and loses a tenth of its health (s).
    for (let k = herd.length - 1, short = need - grass; k >= 0 && short > 0; k--) {
      const j = herd[k]!;
      const s = speciesSpec(e.mob[j]!);
      short -= s.grassM2;
      if (!eatCrops(pool, s.cropNutrition)) e.hp[j] = Math.max(1, e.hp[j]! - floorDiv(e.maxHp[j]!, 10));
    }
  }
}

export function updateAnimals(state: SimState): void {
  if (state.step % STOCK_CHECK_STEPS === 0) updateStocking(state);
  // Each day as the sun comes up.
  if (state.step > 0 && state.step % CYCLE_STEPS === 0) {
    growUp(state);
    breed(state);
    livestockDay(state);
  }
}

// ----- deaths -----

/** An animal fell: its carcass is left where it lay (Hunting), a young one's half the meat. */
function onAnimalDeath(state: SimState, i: number): void {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  const meat = e.born[i]! > state.step ? Math.max(1, s.meat >> 1) : s.meat;
  state.world.addProp(floorDiv(e.x[i]!, COLUMN), floorDiv(e.z[i]!, COLUMN), PropKind.Carcass, s.id, meat, state.step);
  const owner = e.owner[i]!;
  if (owner < state.players.length) state.events.push({ player: owner, kind: 'alert', text: `A tamed ${s.name.toLowerCase()} has been killed.`, x: e.x[i]!, z: e.z[i]! });
  // Its worker lets go of the cart.
  if (e.partner[i]) {
    const w = e.indexOf(e.partner[i]!);
    if (w >= 0) e.partner[w] = 0;
  }
}

/** What the rest of a carcass gives once its meat is gone: hides, leather or feathers (Table 5). */
export function carcassExtra(variant: number): Cost {
  return SPECIES[variant]?.extra ?? [];
}

/** Working animals eat from the stock (Table 6: a working horse 2, a working ox 3 a day). */
function workingUpkeep(state: SimState, i: number): number {
  const e = state.entities;
  return e.partner[i] ? speciesSpec(e.mob[i]!).upkeep : 0;
}

export function installAnimalHooks(): void {
  deathHooks.animal = onAnimalDeath;
  animalUpkeep.of = workingUpkeep;
}

/** A short name for the selection panel. */
export function animalName(state: SimState, i: number): string {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  const young = e.born[i]! > state.step ? 'Young ' : '';
  const wild = e.owner[i] === WILD ? 'Wild ' : '';
  const home = e.home[i] ? state.buildings.get(e.home[i]!) : undefined;
  const where = home ? ` (${buildingName(home.kind, home.level, home.variant)})` : '';
  return `${young}${wild}${young || wild ? s.name.toLowerCase() : s.name}${where}`;
}
