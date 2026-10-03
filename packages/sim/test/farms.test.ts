// Farm harvests (Jade, patch notes 1, 2026-10-03): no fallow days, a harvest
// bar each farmer at work fills by a step a step, a harvest that stays the
// same whatever the number of farmers, the band's cut on crop fields, and
// what the selection panel reads.
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  Band,
  bandAt,
  Blocked,
  BuildingKind,
  CYCLE_STEPS,
  createWorld,
  FARM_HARVEST_STEPS,
  farmBandLine,
  farmHarvest,
  harvestPerMille,
  placeBuilding,
  placementBlocked,
  Res,
  Species,
  step,
  UnitKind,
  workersAt,
  WU_PER_COLUMN,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

/** Player 0's workers, by entity id. */
function workers(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) out.push(e.id[i]!);
  return out;
}

/** A clear spot for a farm beside the Big House, searching outwards. */
function farmNearCamp(s: SimState, kind: number, level = 1): Building {
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = home.x + 16 + dx;
        const z = home.z + dz;
        if (placementBlocked(s, 0, kind, x, z) !== Blocked.None) continue;
        const b = placeBuilding(s, 0, kind, 0, x, z, true);
        b.level = level;
        return b;
      }
    }
  }
  throw new Error('no free spot');
}

/** A finished farm put down in the first stretch of a band, heading east from the camp (its band is all that matters here). */
function farmInBand(s: SimState, kind: number, band: Band, level = 1): Building {
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let k = 1; k < 4000; k++) {
    const x = home.x + k * 32;
    if (bandAt(s, x + 6, home.z + 6) !== band) continue;
    const b = placeBuilding(s, 0, kind, 0, x, home.z, true);
    b.level = level;
    return b;
  }
  throw new Error(`no ${band} found`);
}

/** Assigns farmers and waits until they are all at work. */
function manned(s: SimState, farm: Building, n: number): void {
  run(s, 1, [{ kind: 'assign', player: 0, units: workers(s).slice(0, n), building: farm.id }]);
  runUntil(s, () => workersAt(s, farm) === n, 3000);
}

describe('farm harvests', () => {
  it('a new field grows from the first step a farmer works it: no fallow days', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.CropField);
    manned(s, farm, 1);
    const before = farm.farmAcc;
    run(s, 10);
    expect(farm.farmAcc).toBe(before + 10);
    expect(s.buildings.list.some((b) => b.id === farm.id)).toBe(true);
  });

  it('one farmer of two still brings in a harvest: one farmer-day of work gives Table 6\'s 6 wheat', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.CropField);
    manned(s, farm, 1);
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.Wheat, items: 6, food: 12, grows: true, perStep: 1, whole: FARM_HARVEST_STEPS });
    farm.farmAcc = FARM_HARVEST_STEPS - 1;
    const wheat = pool[Res.Wheat]!;
    run(s, 1);
    expect(pool[Res.Wheat]).toBe(wheat + 6);
    expect(farm.farmAcc).toBe(0);
  });

  it('a second farmer fills the bar twice as fast, and the harvest stays the same', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.CropField);
    manned(s, farm, 2);
    expect(farmHarvest(s, farm)).toMatchObject({ items: 6, perStep: 2 });
    const before = farm.farmAcc;
    run(s, 10);
    expect(farm.farmAcc).toBe(before + 20);
    farm.farmAcc = FARM_HARVEST_STEPS - 1;
    const wheat = pool[Res.Wheat]!;
    run(s, 1);
    expect(pool[Res.Wheat]).toBe(wheat + 6);
    // The extra farmer's step of work carries into the next bar.
    expect(farm.farmAcc).toBe(1);
  });

  it('a tier 2 field takes three farmers: three times the pace, its harvest x1.5', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.CropField, 2);
    manned(s, farm, 3);
    expect(farmHarvest(s, farm)).toMatchObject({ items: 9, food: 18, perStep: 3 });
    farm.farmAcc = FARM_HARVEST_STEPS - 1;
    const wheat = pool[Res.Wheat]!;
    run(s, 1);
    expect(pool[Res.Wheat]).toBe(wheat + 9);
  });

  it('an unmanned field stands still', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.VegetableFarm);
    run(s, 50);
    expect(farm.farmAcc).toBe(0);
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.Potatoes, items: 8, food: 16, done: 0, perStep: 0 });
  });

  it('a field from a save made before harvest bars starts its bar afresh, with no windfall', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.CropField);
    // The old count was thousandths of an item times steps per day.
    farm.farmAcc = 3_000_000;
    run(s, 1);
    expect(farm.farmAcc).toBe(0);
    expect(pool[Res.Wheat]).toBe(0);
  });

  it('crop fields make half in the Fringe, carrying the half item to the next harvest', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const field = farmInBand(s, BuildingKind.CropField, Band.Fringe, 2);
    // 6 a farmer-day, x1.5 at tier 2, half in the Fringe: 4.5 a harvest.
    expect(harvestPerMille(s, field)).toBe(4500);
    expect(farmBandLine(s, field)).toBe('Half yield in the Fringe: crop fields make half in the Fringe and Deepwoods and nothing in the Barrens or Deadlands.');
    const got: number[] = [];
    for (let k = 0; k < 4; k++) {
      const next = farmHarvest(s, field)!.items;
      const wheat = pool[Res.Wheat]!;
      field.farmAcc = FARM_HARVEST_STEPS;
      run(s, 1);
      expect(pool[Res.Wheat]! - wheat).toBe(next);
      got.push(next);
    }
    expect(got).toEqual([4, 5, 4, 5]);
  });

  it('nothing grows on a crop field in the Barrens; vegetables grow in full there', () => {
    const s = createWorld(1, { peaceful: true });
    const field = farmInBand(s, BuildingKind.CropField, Band.Barrens);
    expect(farmHarvest(s, field)).toMatchObject({ grows: false, items: 0, perStep: 0 });
    expect(farmBandLine(s, field)).toBe('Nothing grows in the Barrens: crop fields make half in the Fringe and Deepwoods and nothing in the Barrens or Deadlands.');
    field.farmAcc = 100;
    run(s, 1);
    expect(field.farmAcc).toBe(100);
    const veg = farmInBand(s, BuildingKind.VegetableFarm, Band.Barrens);
    expect(farmHarvest(s, veg)).toMatchObject({ grows: true, items: 8 });
    expect(farmBandLine(s, veg)).toBe('Full yield in the Barrens: vegetable farms grow in full in every band.');
  });

  it('a field in the Heartland says what the band rule is', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.CropField);
    expect(farmBandLine(s, farm)).toBe('Full yield in the Heartland: crop fields make half in the Fringe and Deepwoods and nothing in the Barrens or Deadlands.');
    expect(farmBandLine(s, farmNearCamp(s, BuildingKind.HerbBed))).toBe('Full yield in the Heartland: herb beds grow in full in every band.');
  });

  it('a livestock farm\'s bar runs to the day\'s turn, when its hens lay', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.LivestockFarm);
    expect(farmHarvest(s, farm)).toBeNull();
    for (let k = 0; k < 2; k++) {
      const hen = addAnimal(s, Species.Chicken, 0, farm.x * WU_PER_COLUMN + k * 8000, farm.z * WU_PER_COLUMN, 0, 0);
      s.entities.home[hen] = farm.id;
    }
    // Kept back from the meals, so the count is the hens' alone.
    run(s, 5, [{ kind: 'dontEat', player: 0, res: Res.Eggs, on: 1 }]);
    const h = farmHarvest(s, farm)!;
    expect(h).toMatchObject({ res: Res.Eggs, items: 2, food: 2, grows: true, perStep: 1, whole: CYCLE_STEPS });
    const eggs = pool[Res.Eggs]!;
    run(s, h.whole - h.done);
    expect(pool[Res.Eggs]).toBe(eggs + 2);
    expect(farmHarvest(s, farm)!.done).toBe(0);
  });
});
