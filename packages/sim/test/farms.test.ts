// Farm harvests (Jade, patch notes 1, 2026-10-03): no fallow days, a harvest
// bar each farmer at work fills by a step a step, a harvest that stays the
// same whatever the number of farmers, and what the selection panel reads.
// Patch 2: one Farm of farm fare, in full in every band, and the Barn's hens
// and its animals, which eat farm fare every morning (they cannot graze).
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  Band,
  bandAt,
  Blocked,
  BARN_STALLS,
  buildingStatus,
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
  RESOURCES,
  Species,
  speciesSpec,
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
function farmNearCamp(s: SimState, kind: number): Building {
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = home.x + 16 + dx;
        const z = home.z + dz;
        if (placementBlocked(s, 0, kind, x, z) !== Blocked.None) continue;
        return placeBuilding(s, 0, kind, 0, x, z, true);
      }
    }
  }
  throw new Error('no free spot');
}

/** A finished farm put down in the first stretch of a band, heading east from the camp (its band is all that matters here). */
function farmInBand(s: SimState, kind: number, band: Band): Building {
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let k = 1; k < 4000; k++) {
    const x = home.x + k * 32;
    if (bandAt(s, x + 6, home.z + 6) !== band) continue;
    return placeBuilding(s, 0, kind, 0, x, home.z, true);
  }
  throw new Error(`no ${band} found`);
}

/** Assigns farmers and waits until they are all at work. */
function manned(s: SimState, farm: Building, n: number): void {
  run(s, 1, [{ kind: 'assign', player: 0, units: workers(s).slice(0, n), building: farm.id }]);
  runUntil(s, () => workersAt(s, farm) === n, 3000);
}

describe('farm harvests', () => {
  it('a new Farm grows from the first step a farmer works it: no fallow days', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.Farm);
    manned(s, farm, 1);
    const before = farm.farmAcc;
    run(s, 10);
    expect(farm.farmAcc).toBe(before + 10);
    expect(s.buildings.list.some((b) => b.id === farm.id)).toBe(true);
  });

  it('one farmer of two still brings in a harvest: one farmer-day of work gives 8 farm fare (Patch 2: the tier 1 crop field\'s pace)', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    manned(s, farm, 1);
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.FarmFare, items: 8, food: 16, grows: true, perStep: 1, whole: FARM_HARVEST_STEPS });
    farm.farmAcc = FARM_HARVEST_STEPS - 1;
    const fare = pool[Res.FarmFare]!;
    run(s, 1);
    expect(pool[Res.FarmFare]).toBe(fare + 8);
    expect(farm.farmAcc).toBe(0);
  });

  it('a second farmer fills the bar twice as fast, and the harvest stays the same', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    manned(s, farm, 2);
    expect(farmHarvest(s, farm)).toMatchObject({ items: 8, perStep: 2 });
    const before = farm.farmAcc;
    run(s, 10);
    expect(farm.farmAcc).toBe(before + 20);
    farm.farmAcc = FARM_HARVEST_STEPS - 1;
    const fare = pool[Res.FarmFare]!;
    run(s, 1);
    expect(pool[Res.FarmFare]).toBe(fare + 8);
    // The extra farmer's step of work carries into the next bar.
    expect(farm.farmAcc).toBe(1);
  });

  it('an unmanned Farm stands still', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.Farm);
    run(s, 50);
    expect(farm.farmAcc).toBe(0);
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.FarmFare, items: 8, food: 16, done: 0, perStep: 0 });
  });

  it('a Farm from a save made before harvest bars starts its bar afresh, with no windfall', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    // The old count was thousandths of an item times steps per day.
    farm.farmAcc = 3_000_000;
    run(s, 1);
    expect(farm.farmAcc).toBe(0);
    expect(pool[Res.FarmFare]).toBe(0);
  });

  it('the Farm grows in full in every band (Patch 2: no crop field halves in the Fringe)', () => {
    const s = createWorld(1, { peaceful: true });
    expect(farmBandLine(s, farmNearCamp(s, BuildingKind.Farm))).toBe('Full yield in the Heartland: the Farm grows in full in every band.');
    for (const band of [Band.Fringe, Band.Barrens]) {
      const farm = farmInBand(s, BuildingKind.Farm, band);
      expect(harvestPerMille(s, farm)).toBe(8000);
      expect(farmHarvest(s, farm)).toMatchObject({ grows: true, items: 8 });
    }
    expect(farmBandLine(s, farmInBand(s, BuildingKind.Farm, Band.Barrens))).toBe('Full yield in the Barrens: the Farm grows in full in every band.');
    // Other buildings have no band line.
    expect(farmBandLine(s, farmNearCamp(s, BuildingKind.Barn))).toBe('');
  });

  it('a Barn\'s bar runs to the day\'s turn, when its hens lay', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Barn);
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

describe('the Barn (Patch 2)', () => {
  /** A finished Barn by the camp with these grown animals at home (sex 0, hens that lay). */
  function barnWith(s: SimState, animals: readonly number[]): [Building, number[]] {
    const barn = farmNearCamp(s, BuildingKind.Barn);
    const out = animals.map((sp, k) => {
      const i = addAnimal(s, sp, 0, barn.x * WU_PER_COLUMN + k * 4000, barn.z * WU_PER_COLUMN - 8 * WU_PER_COLUMN, 0, 0);
      s.entities.home[i] = barn.id;
      return i;
    });
    return [barn, out];
  }

  /** Runs the step on which a new day starts, when the Barn's animals eat and its hens lay. */
  function dayTurn(s: SimState): void {
    s.step = CYCLE_STEPS * 2;
    step(s);
  }

  it('its animals eat farm fare every morning, even farm fare kept back from meals, whatever grass is near', () => {
    const s = createWorld(1, { peaceful: true });
    const p = s.players[0]!;
    // Two cows and six hens: three stalls, and 2 + 2 + 6 x 1 = 10 food, 5 farm fare a day.
    const [barn] = barnWith(s, [Species.Cattle, Species.Cattle, ...Array<number>(6).fill(Species.Chicken)]);
    expect(buildingStatus(s, barn)).toBe(`8 animals; 3 of ${BARN_STALLS} stalls taken; they eat 5 farm fare a day`);
    p.pool[Res.FarmFare] = 12;
    p.kept[Res.FarmFare] = 1;
    const eggs = p.pool[Res.Eggs]!;
    dayTurn(s);
    expect(p.pool[Res.FarmFare]).toBe(7);
    expect(p.pool[Res.Eggs]).toBe(eggs + 6);
    // A single hen eats half a farm fare: the rest of the one she opened waits for the next day.
    const s2 = createWorld(1, { peaceful: true });
    const [barn2] = barnWith(s2, [Species.Chicken]);
    expect(buildingStatus(s2, barn2)).toBe(`1 animal; 1 of ${BARN_STALLS} stalls taken; they eat ½ farm fare a day`);
    s2.players[0]!.pool[Res.FarmFare] = 1;
    s2.players[0]!.kept[Res.FarmFare] = 1;
    dayTurn(s2);
    expect([s2.players[0]!.pool[Res.FarmFare], s2.players[0]!.open[Res.FarmFare]]).toEqual([0, 4]);
  });

  it('with no farm fare its animals go hungry and lose a tenth of their health, and the owner hears of it once', () => {
    const s = createWorld(1, { peaceful: true });
    const [, [cow, hen]] = barnWith(s, [Species.Cattle, Species.Chicken]);
    const e = s.entities;
    s.players[0]!.pool[Res.FarmFare] = 0;
    const hp = [e.hp[cow!]!, e.hp[hen!]!];
    dayTurn(s);
    expect([e.hp[cow!], e.hp[hen!]]).toEqual([hp[0]! - e.maxHp[cow!]! / 10, hp[1]! - e.maxHp[hen!]! / 10]);
    expect(s.events.filter((v) => v.kind === 'alert' && v.text.startsWith('Your Barn animals went hungry')).length).toBe(1);
    // Never the last of it.
    e.hp[hen!] = 1;
    dayTurn(s);
    expect(e.hp[hen!]).toBe(1);
  });

  it('a cow gives twenty times the food of a chicken (Jade)', () => {
    const food = (sp: number): number => speciesSpec(sp).meat * RESOURCES[sp === Species.Cattle ? Res.Beef : Res.Chicken]!.nutrition;
    expect(food(Species.Cattle)).toBe(20 * food(Species.Chicken));
    expect(speciesSpec(Species.Cattle).meat).toBe(20);
  });
});
