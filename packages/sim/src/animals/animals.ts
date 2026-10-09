// Animals in the world (Animals; Wild herds; Game and other wild animals;
// Bears; Young animals; Fish; Table 6 livestock and grazing; Table 14
// taming). There is a fixed number of wild animals: each cell is stocked
// the first time the players come near it, and only breeding adds more.
// Wild animals graze round their spot, run, fight back, hunt in packs,
// stalk, guard or knock over torches by their nature; tamed ones belong to
// a Barn (Patch 2). Patch 5 (Jade's GP-37 and BL-10): with the Barn's hand at
// work they graze round it by day in the Heartland, Fringe and Deepwoods,
// which saves a share of their feed, shelter in its stalls by night and eat
// plant food from the stock then; a grown female ready for young seeks out a
// male and they mate side by side, hearts over them both; and they can be
// slaughtered. A newly tamed animal follows its worker until it is within
// 5 m of a Barn of its owner's with room.

import { BARN_STALLS, BuildingKind, buildingName, CHICKENS_PER_STALL, OUTLYING_M } from '../buildings/data.ts';
import { fairyHooks, HAWTHORNE_PCT } from '../buildings/farm-boost.ts';
import { bandAt } from '../buildings/placement.ts';
import { BARN_YARD_WU, barnTended } from './barn.ts';
import { buildingCentre, dist2, isLit, nearMainBase, snuffLight } from '../buildings/lights.ts';
import { placedDims, type Building } from '../buildings/store.ts';
import { clockAt, isDark, Period } from '../clock.ts';
import { Res, type Cost } from '../economy/resources.ts';
import { animalUpkeep, QUARTERS, takeFood } from '../economy/food.ts';
import { ceilDiv, cos16, floorDiv, headingTowards, length2d, sin16, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS, DAY_STEPS, DUSK_STEPS } from '../rules.ts';
import { OrderKind, PEOPLES, standY, UnitKind, WILD, type SimState } from '../state.ts';
import { peoplesHooks } from '../peoples/hooks.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { hash32 } from '../rng.ts';
import { Band } from '../world/layout.ts';
import { distanceToWater } from '../world/start.ts';
import { Mat } from '../world/materials.ts';
import { PropKind } from '../world/props.ts';
import { deathHooks, gap, hurtUnit, sideOf, Side } from '../combat/combat.ts';
import { stepToward } from '../combat/fight.ts';
import { hasWaterAt } from '../buildings/placement.ts';
import { rollDropList } from '../threats/loot.ts';
import { dropLoot, lootBrag } from '../units/loot.ts';
import { meatOf } from '../economy/food-kinds.ts';
import { BEAR_CAP, breeds, inPairs, Nature, PLANT_FOODS, Species, speciesSpec, SPECIES, YOUNG_STEPS, type SpeciesSpec } from './species.ts';

const COLUMN = WU_PER_COLUMN;
const M = WU_PER_METRE;

/** What else a cell holds the first time the players come near it (threats/villages.ts: a goblin village). */
export const stockHooks: { cell: (state: SimState, cellId: number) => void } = { cell: () => {} };

/** Cells are stocked when a player's unit is in one or next to it, looked at every second (s). */
export const STOCK_CHECK_STEPS = STEPS_PER_SECOND;
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
/** A hunter that killed its quarry looks for the next within 60 m (s). */
const HUNTER_RESUME_WU = 60 * M;
/** Venom works over 5 s; a hornet's sting slows by 30% for 3 s (roster 6.1). */
const VENOM_STEPS = 5 * STEPS_PER_SECOND;
const STING = { slowBp: 3000, steps: 3 * STEPS_PER_SECOND };
const BEAR_MOTHER_WU = 15 * M;
/** Badgers go for an outlying torch within 30 m every minute and run from units within 6 m (s). */
const BADGER_REACH_WU = 30 * M;
const BADGER_SHY_WU = 6 * M;
const BADGER_REST_STEPS = 60 * STEPS_PER_SECOND;
/** A Barn animal that finds no plant food at nightfall loses this share of its health (s), never the last of it. */
export const BARN_HUNGER_PER_MILLE = 100;
/** Grazing round its Barn by day saves a quarter of an animal's feed (s; Jade: "This offsets their food cost slightly"). */
export const GRAZE_SAVES_PM = 250;
/** A working or newly tamed animal walks 2 m behind its worker (s). */
const FOLLOW_WU = 2 * M;
/** A newly tamed animal joins a Barn of its owner's with room once it is this near it (Jade, GP-35): 5 m. */
const JOIN_BARN_WU = 5 * M;
/** Farther behind its worker than this while he walks, it hurries to catch up within CATCH_UP_STEPS (Jade, GP-35): 10 m and 2 s. */
const CATCH_UP_WU = 10 * M;
const CATCH_UP_STEPS = 2 * STEPS_PER_SECOND;
/** Stuck, it is brought to its worker once he is this far off (Jade, GP-35): 5 m. */
const STUCK_WU = 5 * M;
/** A wild female ready for young looks for a male within 30 m (doc), and none is born where the kind already crowds 60 m round (s). */
const MATE_SEEK_WU = 30 * M;
const CROWD_WU = 60 * M;
/** A Barn's big animals and chickens. */
function herdOf(state: SimState, b: Building): [number, number] {
  const e = state.entities;
  let big = 0;
  let hens = 0;
  for (const j of animalsAt(state, b.id)) {
    if (e.mob[j] === Species.Chicken) hens++;
    else big++;
  }
  return [big, hens];
}

/** The stalls a herd takes (Patch 2, Jade): one for each big animal, one for every 6 chickens or part of 6. */
const stalls = (big: number, hens: number): number => big + floorDiv(hens + CHICKENS_PER_STALL - 1, CHICKENS_PER_STALL);

/** The stalls a Barn's animals take. */
export function stallsTaken(state: SimState, b: Building): number {
  const [big, hens] = herdOf(state, b);
  return stalls(big, hens);
}

/** Whether a finished Barn has a stall for one more animal of a species: a free stall, or for a chicken room in a stall of chickens. */
export function hasRoom(state: SimState, b: Building, species: number): boolean {
  if (!b.complete || b.kind !== BuildingKind.Barn) return false;
  const [big, hens] = herdOf(state, b);
  return species === Species.Chicken ? stalls(big, hens + 1) <= BARN_STALLS : stalls(big + 1, hens) <= BARN_STALLS;
}

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
  e.breedAt[i] = (young ? grownAt : state.step) + s.breedSteps;
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

/** Whether a column has water beside it (a bank: crabs, crocodiles, wild geese). */
function nearWater(state: SimState, x: number, z: number): boolean {
  for (let r = 1; r <= 3; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) if (hasWaterAt(state, x + dx, z + dz)) return true;
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
    case Species.WildGoose:
      return roll < 60 ? s.perCell : 0;
    // Territorial creatures (s): beetles in every other Fringe cell, a hornet nest in a third of the Deepwoods,
    // vipers and scorpions in half the Barrens, a griffin in one cell in five, a minotaur in one in four.
    case Species.GiantBeetle:
    case Species.Viper:
    case Species.GiantScorpion:
      return roll < 50 ? s.perCell : 0;
    case Species.GiantHornet:
      return roll < 33 ? 1 : 0;
    case Species.Griffin:
      return roll < 20 ? 1 : 0;
    case Species.Minotaur:
      return roll < 25 ? 1 : 0;
    default:
      return s.perCell;
  }
}

/** The stocked-cells key for one species in one cell. */
function stockKey(cellId: number, species: number): number {
  return cellId * 32 + species;
}

/** The first species a cell has not been stocked with yet, or -1. */
function unstocked(state: SimState, cellId: number): number {
  for (const s of SPECIES) if (!state.stockedCells.has(stockKey(cellId, s.id))) return s.id;
  return -1;
}

/**
 * Stocks a cell with its wild animals (or only one species of them): herds in pairs (one of each sex),
 * game, creatures, and in the Deepwoods a bear pair with a cub. Water
 * creatures need a bank, frogs a bog; a group finds its spot from the seed.
 */
export function stockCell(state: SimState, cellId: number, only = -1): void {
  const cell = state.world.layout.cell(cellId);
  const spread = Math.max(20, floorDiv(cell.size * 2, 5));
  // Water creatures look only along the cell's ponds and streams and frogs in its bogs, so a dry cell costs nothing to search.
  const feats = state.world.gen.cellFeatures(cell);
  const banks: Array<[number, number]> = [];
  for (const p of feats.ponds) banks.push([p.x + p.r + 1, p.z], [p.x - p.r - 1, p.z], [p.x, p.z + p.r + 1], [p.x, p.z - p.r - 1]);
  for (const st of feats.streams) for (const f of [-300, 0, 300]) banks.push([st.x + floorDiv(st.dx * f, 1000), st.z + floorDiv(st.dz * f, 1000)]);
  // Wild geese also take the start pockets' water (Table 9), most of the Heartland's water, a flock at each (s).
  const pocketBanks: Array<Array<[number, number]>> = [];
  for (const pk of state.world.gen.start.pockets) {
    const pw = pk.water;
    if (state.world.layout.nearest(pw.x, pw.z) !== cellId) continue;
    const own: Array<[number, number]> = [];
    pocketBanks.push(own);
    const r = pw.radius + 2;
    const across = pw.kind === 'pond' ? 0 : (pw.angle + 16384) & 0xffff;
    for (const a of [across, across + 32768]) {
      for (const f of pw.kind === 'pond' ? [0, 16384] : [-500, 0, 500]) {
        const along = floorDiv(pw.halfLength * f, 1000);
        const b = (a + f) & 0xffff;
        own.push(
          pw.kind === 'pond'
            ? [pw.x + floorDiv(r * cos16(b), 65536), pw.z + floorDiv(r * sin16(b), 65536)]
            : [pw.x + floorDiv(r * cos16(a) + along * cos16(pw.angle), 65536), pw.z + floorDiv(r * sin16(a) + along * sin16(pw.angle), 65536)],
        );
      }
    }
  }
  const bogs: Array<[number, number]> = [];
  for (const b of feats.bogs) bogs.push([b.x, b.z], [b.x + (b.r >> 1), b.z], [b.x - (b.r >> 1), b.z], [b.x, b.z + (b.r >> 1)], [b.x, b.z - (b.r >> 1)]);
  for (const s of SPECIES) {
    if (only >= 0 && s.id !== only) continue;
    const key = stockKey(cellId, s.id);
    if (state.stockedCells.has(key)) continue;
    state.stockedCells.add(key);
    const goose = s.id === Species.WildGoose;
    // Every start pocket's water has its own flock of geese (s), so feathers for longbows are always to be had.
    const groups = goose ? pocketBanks.length + groupsIn(state, s, cellId, cell.band) : groupsIn(state, s, cellId, cell.band);
    for (let g = 0; g < groups; g++) {
      if (s.id === Species.Bear && bearCount(state) + 3 > BEAR_CAP) break;
      const water = s.id === Species.Crocodile || s.id === Species.GiantCrab || s.id === Species.WildGoose;
      const bog = s.id === Species.GiantFrog;
      let spot: [number, number] | null = null;
      const places = goose && g < pocketBanks.length ? pocketBanks[g]! : water ? banks : bog ? bogs : null;
      for (let t = 0; t < (places ? places.length : 4) && !spot; t++) {
        const h = hash(state, cellId, s.id, g, t);
        if (places) {
          const [px, pz] = places[(h + t) % places.length]!;
          if (bog) {
            const layers = state.world.columnAt(px, pz);
            if (layers[layers.length - 1] !== Mat.Mud) continue;
          }
          const near = landNear(state, px, pz, false);
          if (near && (bog || nearWater(state, near[0], near[1]))) spot = near;
          continue;
        }
        const cx = cell.x + ((h & 0xffff) % (spread * 2 + 1)) - spread;
        const cz = cell.z + (((h >>> 16) & 0xffff) % (spread * 2 + 1)) - spread;
        spot = landNear(state, cx, cz, false);
      }
      if (!spot) continue;
      const herd = inPairs(s.id);
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
  let band = layout.cell(layout.nearest(x0 + (N >> 1), z0 + (N >> 1))).band;
  // A start pocket's water holds trout (Table 9) wherever its chunk falls: since Jade's mini patch made the
  // basin 30% smaller, a yard's stream or pond can reach a chunk whose middle lies in a Fringe cell. A chunk
  // it reaches lies within the chunk's half diagonal (46 columns, rounded up to 48) of its middle.
  if (band !== Band.Heartland && state.world.gen.start.pockets.some((p) => distanceToWater(p.water, x0 + (N >> 1), z0 + (N >> 1)) <= (N * 3) >> 2)) band = Band.Heartland;
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

/** Every second: the cells and chunks the players' units are in or next to get their animals and fish. */
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
  // Spread over the checks, as each needs fresh land generated: the cells the units stand in are stocked at once,
  // the cells next to them one species a check, and one chunk of fish a check (s).
  for (const c of [...cells].sort((a, b) => a - b)) stockCell(state, c);
  for (const c of [...all].sort((a, b) => a - b)) stockHooks.cell(state, c);
  for (const c of [...all].sort((a, b) => a - b)) {
    const species = unstocked(state, c);
    if (species < 0) continue;
    stockCell(state, c, species);
    break;
  }
  for (const [key, [kx, kz]] of [...chunks].sort((a, b) => a[0] - b[0])) {
    if (state.stockedChunks.has(key)) continue;
    stockChunk(state, kx, kz, key);
    break;
  }
}

// ----- behaviour -----

function speedOf(state: SimState, i: number, running: boolean): number {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  // A wounded animal tires: it runs at its health's share of full pace, never slower than it walks (s).
  const base = running ? Math.max(s.walk, floorDiv(s.run * e.hp[i]!, Math.max(1, e.maxHp[i]!))) : s.walk;
  return hasWaterAt(state, floorDiv(e.x[i]!, COLUMN), floorDiv(e.z[i]!, COLUMN)) && s.swim ? s.swim : base;
}

/** Steps an animal towards a point; a blocked step picks a new patch next time. */
export function goTo(state: SimState, i: number, x: number, z: number, running: boolean): boolean {
  const e = state.entities;
  if (length2d(x - e.x[i]!, z - e.z[i]!) <= (COLUMN >> 2)) return false;
  const ok = stepToward(state, i, x, z, speedOf(state, i, running));
  if (!ok) e.wanderAt[i] = state.step;
  return ok;
}

export function graze(state: SimState, i: number, ax: number, az: number, radius: number): void {
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

/** Whether a unit is one of the players' or the peoples' that an animal may go for (outside, alive, not an animal). */
function prey(state: SimState, j: number): boolean {
  const e = state.entities;
  if (j < 0 || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.kind[j] === UnitKind.Animal || e.kind[j] === UnitKind.Mob) return false;
  const side = sideOf(state, j);
  return side === Side.Players || side === Side.Peoples;
}

/** Fights a unit: closes in at a run and bites, gores or swipes at its own pace. */
export function fight(state: SimState, i: number, t: number): void {
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
  const d = hurtUnit(state, t, { damage: s.damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false });
  if (d <= 0 || e.hp[t]! <= 0) return;
  // Venom (vipers, scorpions): more over 5 s, renewed rather than piled up (s).
  if (s.venom > 0) {
    e.dotLeft[t] = Math.max(e.dotUntil[t]! > state.step ? e.dotLeft[t]! : 0, s.venom);
    e.dotUntil[t] = state.step + VENOM_STEPS;
    e.dotFrom[t] = e.id[i]!;
  }
  // A hornet's sting slows by 30% for 3 s (roster).
  if (s.id === Species.GiantHornet) {
    e.slowUntil[t] = state.step + STING.steps;
    e.slowBp[t] = STING.slowBp;
  }
}

/** The players' unit that hurt it in the last 8 s, if still there. */
function recentAttacker(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.attacker[i] || state.step - e.hurtAt[i]! > FLEE_STEPS) return -1;
  const a = e.indexOf(e.attacker[i]!);
  const side = a >= 0 ? sideOf(state, a) : Side.None;
  return a >= 0 && e.hp[a]! > 0 && (side === Side.Players || side === Side.Peoples) ? a : -1;
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
  // Held still by a worker taming it, its bar over its head (units/field.ts runTame); left alone, the bar goes.
  if (e.waitUntil[i]! > state.step) {
    e.target[i] = 0;
    return;
  }
  if (e.tinker[i] !== 0) {
    e.tinker[i] = 0;
    e.timer[i] = 0;
  }
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  const a = recentAttacker(state, i);
  // Game and herds ready for young seek a mate (Patch 5, Jade's BL-10), unless something just hurt them.
  if (a < 0 && (s.nature === Nature.Shy || s.nature === Nature.FightsBack || s.nature === Nature.Bear) && mateStep(state, i, undefined)) return;
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
    case Nature.Territorial:
    case Nature.Nest: {
      const chase = s.chase || GIVE_UP_WU;
      let t = a >= 0 && fromHome(state, i, a) <= chase ? a : keepTarget(state, i, chase);
      if (t < 0) t = nearbyPrey(state, s.roam ? e.x[i]! : hx, s.roam ? e.z[i]! : hz, s.guard || GUARD_WU)[0] ?? -1;
      // A disturbed nest all comes out.
      if (t < 0 && s.nature === Nature.Nest) t = mateTarget(state, i, s.id, chase);
      if (t >= 0) return fight(state, i, t);
      // Roamers wander round their spot; the rest go back to it and wait.
      if (s.roam) {
        e.target[i] = 0;
        return graze(state, i, hx, hz, s.roam);
      }
      if (!goTo(state, i, hx, hz, false)) e.order[i] = OrderKind.Idle;
      return;
    }
    case Nature.Hunter: {
      // Once disturbed it hunts the players until one side is dead: its quarry, then the nearest of the same side within 60 m.
      let t = a >= 0 ? a : keepTarget(state, i, Number.MAX_SAFE_INTEGER);
      if (t < 0 && e.timer[i]! > 0) t = nearbyPrey(state, e.x[i]!, e.z[i]!, HUNTER_RESUME_WU)[0] ?? -1;
      if (t < 0) t = nearbyPrey(state, hx, hz, s.guard || GUARD_WU)[0] ?? -1;
      if (t >= 0) {
        e.timer[i] = 1;
        return fight(state, i, t);
      }
      e.timer[i] = 0;
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

/** What a nest-mate of the same kind within reach is fighting, if one is; -1 for none. */
function mateTarget(state: SimState, i: number, species: number, chase: number): number {
  const e = state.entities;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, GIVE_UP_WU)) {
    if (j === i || e.kind[j] !== UnitKind.Animal || e.mob[j] !== species || e.owner[j] !== WILD || !e.target[j]) continue;
    const k = e.indexOf(e.target[j]!);
    if (prey(state, k) && fromHome(state, i, k) <= chase) return k;
  }
  return -1;
}

/** A grown she-bear with a cub of her spot nearby (Bears: attacks anything within 15 m). */
function motherOfCub(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.sex[i] !== 0 || e.born[i]! > state.step) return false;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, 10 * M)) if (j !== i && e.kind[j] === UnitKind.Animal && e.mob[j] === Species.Bear && e.born[j]! > state.step) return true;
  return false;
}

/** The nearest lit torch post out beyond the base (Light and torches: outlying), within a badger's reach. */
function outlyingTorch(state: SimState, x: number, z: number): Building | undefined {
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.kind !== BuildingKind.TorchPost || !isLit(b)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, x, z);
    if (d > BADGER_REACH_WU * BADGER_REACH_WU || (best && d >= bestD)) continue;
    if (nearMainBase(state, b, OUTLYING_M)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** A badger knocks a torch over (roster 6): it goes out until a worker relights it, and loses half its health (s). */
function knockOver(state: SimState, b: Building, x: number, z: number): void {
  snuffLight(b);
  b.hp = Math.max(1, b.hp >> 1);
  state.events.push({ player: b.owner, kind: 'alert', text: 'A badger knocked over an outlying torch. Relight it.', x, z });
}

/** Where a tamed animal shelters at night: its own Barn's stalls (Patch 2), when the Barn is finished. */
function shelterFor(home: Building): Building | undefined {
  return home.kind === BuildingKind.Barn && home.complete ? home : undefined;
}

function goOutside(state: SimState, i: number): void {
  const e = state.entities;
  const b = state.buildings.get(e.inside[i]!);
  e.inside[i] = 0;
  if (!b) return;
  const [x, z] = buildingCentre(b);
  const { d } = placedDims(b);
  e.x[i] = x;
  e.z[i] = z + ((d >> 1) + 2) * COLUMN;
  e.y[i] = standY(state, e.x[i]!, e.z[i]!);
}

function runTamed(state: SimState, i: number): void {
  const e = state.entities;
  // A working animal walks behind its worker; a newly tamed one follows its worker to a Barn (Jade, GP-35).
  if (e.partner[i]) {
    const w = e.indexOf(e.partner[i]!);
    if (w >= 0 && e.hp[w]! > 0 && e.partner[w] === e.id[i]) {
      e.target[i] = 0;
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
    if (w >= 0 && e.hp[w]! > 0 && e.home[i] === 0) return followToBarn(state, i, w);
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
  if (a >= 0 && e.inside[i] === 0) {
    e.target[i] = 0;
    return flee(state, i, a);
  }
  const shelter = b ? shelterFor(b) : undefined;
  // Out round the Barn by day only while its hand is at work, and only where there is grass (Patch 5, Jade); in its stalls the rest of the time.
  if (shelter && !grazesOut(state, shelter)) {
    e.target[i] = 0;
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
  if (e.inside[i] !== 0) goOutside(state, i);
  if (!b) {
    e.target[i] = 0;
    return graze(state, i, e.homeX[i]!, e.homeZ[i]!, GRAZE_WU);
  }
  if (mateStep(state, i, b)) return;
  e.target[i] = 0;
  const [hx, hz] = buildingCentre(b);
  graze(state, i, hx, hz, BARN_YARD_WU);
}

/** Not state: each Barn's band, which never changes. */
const grassCache = new WeakMap<Building, boolean>();

/** Whether a Barn stands where its animals find grass (Jade, GP-37): the Heartland, the Fringe or the Deepwoods. */
export function barnHasGrass(state: SimState, b: Building): boolean {
  let grass = grassCache.get(b);
  if (grass === undefined) {
    const [x, z] = buildingCentre(b);
    const band = bandAt(state, floorDiv(x, COLUMN), floorDiv(z, COLUMN));
    grass = band === Band.Heartland || band === Band.Fringe || band === Band.Deepwoods;
    grassCache.set(b, grass);
  }
  return grass;
}

/** Whether a Barn's animals are out grazing now: by day, with the hand at work and grass round it. */
function grazesOut(state: SimState, b: Building): boolean {
  return clockAt(state.step).period === Period.Day && barnTended(state, b) && barnHasGrass(state, b);
}

/** A finished Barn of a player's within JOIN_BARN_WU of a point (wu) with a stall for one more of a species, nearest first. */
function barnToJoin(state: SimState, player: number, species: number, x: number, z: number): Building | undefined {
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== player || b.kind !== BuildingKind.Barn || !b.complete) continue;
    const [bx, bz] = buildingCentre(b);
    const { w, d } = placedDims(b);
    const reach = JOIN_BARN_WU + (Math.max(w, d) >> 1) * COLUMN;
    const dd = dist2(bx, bz, x, z);
    if (dd > reach * reach || (best && dd >= bestD) || !hasRoom(state, b, species)) continue;
    best = b;
    bestD = dd;
  }
  return best;
}

/**
 * A newly tamed animal follows the worker who tamed it (Jade, GP-35) until it
 * is within 5 m of a Barn of its owner's with room, and is that Barn's from
 * then on. More than 10 m behind, it hurries to catch up within 2 s; stuck
 * (a cliff, a hole), it is brought to him once he is more than 5 m off, or
 * straight into the Barn once he stands within 5 m of one.
 */
function followToBarn(state: SimState, i: number, w: number): void {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  e.target[i] = 0;
  if (e.inside[i] !== 0) goOutside(state, i);
  const join = barnToJoin(state, e.owner[i]!, s.id, e.x[i]!, e.z[i]!);
  if (join) return joinBarn(state, i, join);
  // Its worker gone indoors: it waits by the door.
  if (e.inside[w] !== 0) return graze(state, i, e.x[i]!, e.z[i]!, 2 * M);
  const d = length2d(e.x[w]! - e.x[i]!, e.z[w]! - e.z[i]!);
  if (d <= FOLLOW_WU) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  const hurry = d > CATCH_UP_WU ? ceilDiv(d - FOLLOW_WU, CATCH_UP_STEPS) : Math.min(s.run, Math.max(s.walk, d - FOLLOW_WU));
  if (stepToward(state, i, e.x[w]!, e.z[w]!, Math.max(s.walk, hurry))) return;
  // Stuck: into the Barn its worker stands by, or to its worker once he is far enough off.
  const by = barnToJoin(state, e.owner[i]!, s.id, e.x[w]!, e.z[w]!);
  if (by) return joinBarn(state, i, by);
  if (d <= STUCK_WU) return;
  e.x[i] = e.x[w]!;
  e.z[i] = e.z[w]!;
  e.y[i] = e.y[w]!;
}

/** A newly tamed animal joins a Barn. */
function joinBarn(state: SimState, i: number, b: Building): void {
  const e = state.entities;
  e.partner[i] = 0;
  e.home[i] = b.id;
  const [hx, hz] = buildingCentre(b);
  e.homeX[i] = hx;
  e.homeZ[i] = hz;
  state.events.push({ player: e.owner[i]!, kind: 'info', text: `The tamed ${speciesSpec(e.mob[i]!).name.toLowerCase()} is in the ${buildingName(b.kind, b.level, b.variant).toLowerCase()} now.`, x: e.x[i]!, z: e.z[i]! });
}

// ----- having young (Patch 5, Jade's BL-10) -----

/** Whether an animal is a grown female ready for young. */
function readyForYoung(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.sex[i] === 0 && e.born[i] === 0 && breeds(e.mob[i]!) && e.breedAt[i]! <= state.step;
}

/** Whether animal m is a mate for female i: a grown male of her kind and side (in her Barn's yard when tamed). */
function mateFor(state: SimState, i: number, m: number, barn: Building | undefined): boolean {
  const e = state.entities;
  if (m < 0 || m === i || e.kind[m] !== UnitKind.Animal || e.hp[m]! <= 0 || e.mob[m] !== e.mob[i] || e.owner[m] !== e.owner[i]) return false;
  if (e.sex[m] !== 1 || e.born[m] !== 0) return false;
  return barn ? e.home[m] === barn.id && e.inside[m] === 0 && !e.partner[m] : true;
}

/** Whether there is room for one more of a female's kind: a free stall in her Barn, or in the wild her kind not crowding 60 m round (bears one pair and their cubs, 60 in all). */
function roomForYoung(state: SimState, i: number, barn: Building | undefined): boolean {
  const e = state.entities;
  const species = e.mob[i]!;
  if (barn) return hasRoom(state, barn, species);
  const kin = state.grid.near(e.x[i]!, e.z[i]!, CROWD_WU).filter((j) => e.kind[j] === UnitKind.Animal && e.mob[j] === species && e.owner[j] === e.owner[i] && e.hp[j]! > 0).length;
  return species === Species.Bear ? kin < 4 && bearCount(state) < BEAR_CAP : kin < 4 * speciesSpec(species).perCell;
}

/** The nearest mate for a female: in her Barn's yard, or within 30 m in the wild; -1 for none. */
function nearestMate(state: SimState, i: number, barn: Building | undefined): number {
  const e = state.entities;
  const r = barn ? 2 * BARN_YARD_WU : MATE_SEEK_WU;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, r)) {
    if (!mateFor(state, i, j, barn)) continue;
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (d > r || (best >= 0 && (d > bestD || (d === bestD && e.id[j]! > e.id[best]!)))) continue;
    best = j;
    bestD = d;
  }
  return best;
}

/** How long until a female is ready again: her kind's pace, 35% quicker within 30 m of a Sweet Hawthorne (Jade, SC-9). */
function breedPause(state: SimState, i: number): number {
  const e = state.entities;
  const steps = speciesSpec(e.mob[i]!).breedSteps;
  return fairyHooks.hawthorneNear(state, e.x[i]!, e.z[i]!) ? floorDiv(steps * 100, 100 + HAWTHORNE_PCT) : steps;
}

/**
 * A grown female ready for young (Jade, BL-10: "have them seek out a mate
 * when ready to mate"): she looks for a male of her kind once a second while
 * there is room for the young, walks to him, and once they stand side by side
 * hearts show over them both and the young is born. True while she is about
 * it, so nothing else moves her this step. Her mate is kept in her target.
 */
function mateStep(state: SimState, i: number, barn: Building | undefined): boolean {
  const e = state.entities;
  if (!readyForYoung(state, i)) return false;
  let m = e.target[i] ? e.indexOf(e.target[i]!) : -1;
  // Busy with something else (a bear's fight): not now.
  if (m >= 0 && e.kind[m] !== UnitKind.Animal) return false;
  if (!mateFor(state, i, m, barn)) {
    e.target[i] = 0;
    if ((state.step + e.id[i]!) % STEPS_PER_SECOND !== 0) return false;
    if (!roomForYoung(state, i, barn)) {
      // The wild kind is crowding: she tries again a day later; a full Barn has her wait for a stall.
      if (!barn) e.breedAt[i] = state.step + CYCLE_STEPS;
      return false;
    }
    m = nearestMate(state, i, barn);
    if (m < 0) return false;
    e.target[i] = e.id[m]!;
  }
  const s = speciesSpec(e.mob[i]!);
  if (length2d(e.x[m]! - e.x[i]!, e.z[m]! - e.z[i]!) > 2 * s.halfWidth + M) {
    if (!goTo(state, i, e.x[m]!, e.z[m]!, false)) e.target[i] = 0;
    return true;
  }
  e.target[i] = 0;
  haveYoung(state, i, m, barn);
  return true;
}

/** Side by side: hearts over the pair (the page draws them, BL-10) and the young is born by its mother (a Barn's needs a stall still). */
function haveYoung(state: SimState, i: number, m: number, barn: Building | undefined): void {
  const e = state.entities;
  if (barn && !hasRoom(state, barn, e.mob[i]!)) return;
  e.breedAt[i] = state.step + breedPause(state, i);
  for (const j of [i, m]) state.hits.push({ look: 'heart', x: e.x[j]!, y: e.y[j]!, z: e.z[j]!, id: e.id[j]! });
  const species = e.mob[i]!;
  const owner = e.owner[i]!;
  const k = addAnimal(state, species, owner, e.x[i]!, e.z[i]! + COLUMN, state.step + YOUNG_STEPS, hash(state, e.id[i]!, state.step) & 1);
  e.homeX[k] = e.homeX[i]!;
  e.homeZ[k] = e.homeZ[i]!;
  e.home[k] = e.home[i]!;
  if (owner < state.players.length) state.events.push({ player: owner, kind: 'info', text: `A young ${speciesSpec(species).name.toLowerCase()} was born.`, x: e.x[i]!, z: e.z[i]! });
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

/** The player's home with room for a species (Patch 2: every tamed animal lives in a Barn), nearest first. */
export function newHome(state: SimState, player: number, species: number, x?: number, z?: number): Building | undefined {
  const s = speciesSpec(species);
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== player || !b.complete || !s.tameAt.includes(b.kind)) continue;
    if (!hasRoom(state, b, species)) continue;
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
  // The peoples' beasts and livestock, and wild animals a Grovesinger called (peoples/ai.ts).
  else if (e.owner[i] === PEOPLES) peoplesHooks.beast(state, i);
  else runTamed(state, i);
}

// ----- each day -----

/**
 * What Barn animals eat (Patch 5, Jade's GP-37: "At night if they need to
 * eat, they can consume plant based foods"), taken from the stock even when
 * it is kept back from the units' meals, exact to the quarter (a started one
 * waits for the next night).
 */
const BARN_FOOD: readonly Res[] = PLANT_FOODS;

/** A Barn's animals at home, not out working with a worker (a working animal eats with the workers instead). */
function stalled(state: SimState, b: Building): number[] {
  const e = state.entities;
  return animalsAt(state, b.id).filter((j) => !e.partner[j]);
}

/** What one Barn animal eats a night, in quarters of nutrition: its feed, less what grazing saved by day where its hand let it out on grass. */
function feedQuarters(state: SimState, b: Building, species: number): number {
  const q = speciesSpec(species).barnFeed * QUARTERS;
  return barnTended(state, b) && barnHasGrass(state, b) ? q - floorDiv(q * GRAZE_SAVES_PM, 1000) : q;
}

/** What a Barn's animals eat a day, in quarters of nutrition. */
export function barnFeedQuarters(state: SimState, b: Building): number {
  const e = state.entities;
  let n = 0;
  for (const j of stalled(state, b)) n += feedQuarters(state, b, e.mob[j]!);
  return n;
}

/** What a Barn's animals eat a day, in food: "1", "2½", "¾" (rounded up to the quarter, so it never says less than they eat). */
export function barnFeedText(state: SimState, b: Building): string {
  const q = barnFeedQuarters(state, b);
  const whole = floorDiv(q, 4);
  const part = ['', '¼', '½', '¾'][q - whole * 4]!;
  return `${whole > 0 || !part ? whole : ''}${part}`;
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

/** Grown hens in a Barn, each laying an egg at the next day's turn while the barn hand is at work (Table 6; Patch 5). */
export function layingHens(state: SimState, b: Building): number {
  const e = state.entities;
  return animalsAt(state, b.id).filter((j) => !e.partner[j] && e.mob[j] === Species.Chicken && e.sex[j] === 0 && e.born[j] === 0).length;
}

/** Each day as the sun comes up, in every finished Barn with its hand at work: the hens lay an egg each (Table 6). */
function layEggs(state: SimState): void {
  for (const b of state.buildings.list) {
    if (!b.complete || b.kind !== BuildingKind.Barn || !barnTended(state, b)) continue;
    const player = state.players[b.owner]!;
    player.pool[Res.Eggs] = player.pool[Res.Eggs]! + layingHens(state, b);
  }
}

/**
 * Each night as it falls, in every finished Barn: every animal eats its feed
 * of plant food from the stock (Patch 5), less what it grazed by day. One that
 * finds none goes hungry and loses a tenth of its health
 * (BARN_HUNGER_PER_MILLE), never the last of it; its owner hears of it once
 * that night.
 */
function feedLivestock(state: SimState): void {
  const e = state.entities;
  const hungry = new Map<number, Building>();
  for (const b of state.buildings.list) {
    if (!b.complete || b.kind !== BuildingKind.Barn) continue;
    const herd = stalled(state, b);
    if (herd.length === 0) continue;
    const player = state.players[b.owner]!;
    for (const j of herd) {
      if (takeFood(player, feedQuarters(state, b, e.mob[j]!), { only: BARN_FOOD, kept: true }) !== null) continue;
      e.hp[j] = Math.max(1, e.hp[j]! - floorDiv(e.maxHp[j]! * BARN_HUNGER_PER_MILLE, 1000));
      if (!hungry.has(b.owner)) hungry.set(b.owner, b);
    }
  }
  for (const [player, b] of hungry) {
    const [x, z] = buildingCentre(b);
    state.events.push({ player, kind: 'alert', text: 'Your Barn animals went hungry: there was not enough plant food for them. Hungry animals lose health.', x, z });
  }
}

/** The step in each day the night falls on: the Barn animals' feed (Patch 5). */
const NIGHTFALL = DAY_STEPS + DUSK_STEPS;

export function updateAnimals(state: SimState): void {
  if (state.step % STOCK_CHECK_STEPS === 0) updateStocking(state);
  const into = state.step % CYCLE_STEPS;
  // Each day as the sun comes up (the young are born whenever a pair meets, Patch 5).
  if (state.step > 0 && into === 0) {
    growUp(state);
    layEggs(state);
  }
  if (into === NIGHTFALL) feedLivestock(state);
}

// ----- deaths -----

/**
 * An animal fell (Hunting, as Jade's play-test notes redid it): no carcass is
 * left to butcher. Its meat (a young one's half), hides or feathers, and a
 * creature's other drops are loot: the unit that killed it takes what fits,
 * and the rest lies on the ground for the killer's side, or anyone's when no
 * player's unit killed it (a tamed animal's for its owner).
 */
function onAnimalDeath(state: SimState, i: number): void {
  const e = state.entities;
  const s = speciesSpec(e.mob[i]!);
  const meat = e.born[i]! > state.step ? Math.max(1, s.meat >> 1) : s.meat;
  const a = e.attacker[i] ? e.indexOf(e.attacker[i]!) : -1;
  const killer = a >= 0 && e.owner[a]! < state.players.length ? a : -1;
  const owner = e.owner[i]!;
  const items: Array<[number, number]> = [];
  if (meat > 0) items.push([meatOf(s.id), meat]);
  for (const [r, n] of s.extra) items.push([r, n]);
  let brag = 0;
  // A creature's other drops, for the side whose unit last hurt it.
  if (s.loot.length > 0 && killer >= 0) {
    const rolled = rollDropList(state, s.loot);
    items.push(...rolled.items);
    brag = lootBrag(s.loot, rolled, false);
  }
  const side = killer >= 0 ? e.owner[killer]! : owner < state.players.length ? owner : -1;
  dropLoot(state, e.x[i]!, e.z[i]!, items, { killer, owner: side, brag, src: 0, prey: s.id + 1 });
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
