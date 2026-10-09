// Farm harvests (Jade, patch notes 1, 2026-10-03): no fallow days, a harvest
// bar each farmer at work fills by a step a step, a harvest that stays the
// same whatever the number of farmers, and what the selection panel reads.
// Patch 2: one Farm of farm fare, in full in every band, and the Barn's hens
// and its animals. Patch 5: 10 farm fare a farmer-day (Jade's BL-8), the bar
// counted in FARM_PACE units so boosts are whole, and a Barn that needs its
// hand, whose animals eat plant food as night falls, less what they grazed.
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
  DAY_STEPS,
  DUSK_STEPS,
  FARM_HARVEST_STEPS,
  FARM_PACE,
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
    expect(farm.farmAcc).toBe(before + 10 * FARM_PACE);
    expect(s.buildings.list.some((b) => b.id === farm.id)).toBe(true);
  });

  it('one farmer of two still brings in a harvest: one farmer-day of work gives 10 farm fare (Patch 5, Jade: 20% more than 8)', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    manned(s, farm, 1);
    const whole = FARM_HARVEST_STEPS * FARM_PACE;
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.FarmFare, items: 10, food: 20, grows: true, perStep: FARM_PACE, whole });
    farm.farmAcc = whole - FARM_PACE;
    const fare = pool[Res.FarmFare]!;
    run(s, 1);
    expect(pool[Res.FarmFare]).toBe(fare + 10);
    expect(farm.farmAcc).toBe(0);
  });

  it('a second farmer fills the bar twice as fast, and the harvest stays the same', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    manned(s, farm, 2);
    expect(farmHarvest(s, farm)).toMatchObject({ items: 10, perStep: 2 * FARM_PACE });
    const before = farm.farmAcc;
    run(s, 10);
    expect(farm.farmAcc).toBe(before + 20 * FARM_PACE);
    farm.farmAcc = FARM_HARVEST_STEPS * FARM_PACE - FARM_PACE;
    const fare = pool[Res.FarmFare]!;
    run(s, 1);
    expect(pool[Res.FarmFare]).toBe(fare + 10);
    // The extra farmer's step of work carries into the next bar.
    expect(farm.farmAcc).toBe(FARM_PACE);
  });

  it('an unmanned Farm stands still', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = farmNearCamp(s, BuildingKind.Farm);
    run(s, 50);
    expect(farm.farmAcc).toBe(0);
    expect(farmHarvest(s, farm)).toMatchObject({ res: Res.FarmFare, items: 10, food: 20, done: 0, perStep: 0 });
  });

  it('a Farm from a save made before harvest bars starts its bar afresh, with no windfall', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Farm);
    // The old count was thousandths of an item times steps per day.
    farm.farmAcc = 3_000_000 * FARM_PACE;
    run(s, 1);
    expect(farm.farmAcc).toBe(0);
    expect(pool[Res.FarmFare]).toBe(0);
  });

  it('the Farm grows in full in every band (Patch 2: no crop field halves in the Fringe)', () => {
    const s = createWorld(1, { peaceful: true });
    expect(farmBandLine(s, farmNearCamp(s, BuildingKind.Farm))).toBe('Full yield in the Heartland: the Farm grows in full in every band.');
    for (const band of [Band.Fringe, Band.Barrens]) {
      const farm = farmInBand(s, BuildingKind.Farm, band);
      expect(harvestPerMille(s, farm)).toBe(10000);
      expect(farmHarvest(s, farm)).toMatchObject({ grows: true, items: 10 });
    }
    expect(farmBandLine(s, farmInBand(s, BuildingKind.Farm, Band.Barrens))).toBe('Full yield in the Barrens: the Farm grows in full in every band.');
    // Other buildings have no band line.
    expect(farmBandLine(s, farmNearCamp(s, BuildingKind.Barn))).toBe('');
  });

  it('a Barn\'s bar runs to the day\'s turn, when its hens lay, once its hand is at work (Patch 5)', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const farm = farmNearCamp(s, BuildingKind.Barn);
    expect(farmHarvest(s, farm)).toBeNull();
    for (let k = 0; k < 2; k++) {
      const hen = addAnimal(s, Species.Chicken, 0, farm.x * WU_PER_COLUMN + k * 8000, farm.z * WU_PER_COLUMN, 0, 0);
      s.entities.home[hen] = farm.id;
    }
    // No barn hand, no eggs.
    expect(farmHarvest(s, farm)).toBeNull();
    manned(s, farm, 1);
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

describe('the Barn (Patch 2; Patch 5: its hand and its animals\' feed)', () => {
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

  /** Runs the step on which night falls, when the Barn's animals eat (Patch 5). */
  function nightfall(s: SimState): void {
    s.step = CYCLE_STEPS * 2 + DAY_STEPS + DUSK_STEPS;
    step(s);
  }

  it('its animals eat plant food as night falls, even food kept back from meals; with its hand at work on grass they eat a quarter less', () => {
    const s = createWorld(1, { peaceful: true });
    const p = s.players[0]!;
    // Two cows and six hens: three stalls, and 2 + 2 + 6 x 1 = 10 food, 5 farm fare a day.
    const [barn] = barnWith(s, [Species.Cattle, Species.Cattle, ...Array<number>(6).fill(Species.Chicken)]);
    const none = '. No barn hand: nothing grazes, breeds, lays or is slaughtered until a worker is assigned';
    expect(buildingStatus(s, barn)).toBe(`8 animals; 3 of ${BARN_STALLS} stalls taken; they eat 10 food a day${none}`);
    p.pool[Res.FarmFare] = 12;
    p.kept[Res.FarmFare] = 1;
    nightfall(s);
    expect(p.pool[Res.FarmFare]).toBe(7);
    // A single hen eats half a farm fare: the rest of the one she opened waits for the next night.
    const s2 = createWorld(1, { peaceful: true });
    const [barn2] = barnWith(s2, [Species.Chicken]);
    expect(buildingStatus(s2, barn2)).toBe(`1 animal; 1 of ${BARN_STALLS} stalls taken; they eat 1 food a day${none}`);
    s2.players[0]!.pool[Res.FarmFare] = 1;
    s2.players[0]!.kept[Res.FarmFare] = 1;
    nightfall(s2);
    expect([s2.players[0]!.pool[Res.FarmFare], s2.players[0]!.open[Res.FarmFare]]).toEqual([0, 4]);
    // With a hand at work in the Heartland the cows eat 1½ and the hens ¾: 7½ food.
    const s3 = createWorld(1, { peaceful: true });
    const [barn3] = barnWith(s3, [Species.Cattle, Species.Cattle, ...Array<number>(6).fill(Species.Chicken)]);
    manned(s3, barn3, 1);
    expect(buildingStatus(s3, barn3)).toBe(`8 animals; 3 of ${BARN_STALLS} stalls taken; they eat 7½ food a day`);
  });

  it('with no plant food its animals go hungry and lose a tenth of their health, and the owner hears of it once', () => {
    const s = createWorld(1, { peaceful: true });
    const [, [cow, hen]] = barnWith(s, [Species.Cattle, Species.Chicken]);
    const e = s.entities;
    s.players[0]!.pool[Res.FarmFare] = 0;
    const hp = [e.hp[cow!]!, e.hp[hen!]!];
    nightfall(s);
    expect([e.hp[cow!], e.hp[hen!]]).toEqual([hp[0]! - e.maxHp[cow!]! / 10, hp[1]! - e.maxHp[hen!]! / 10]);
    expect(s.events.filter((v) => v.kind === 'alert' && v.text.startsWith('Your Barn animals went hungry')).length).toBe(1);
    // Never the last of it.
    e.hp[hen!] = 1;
    nightfall(s);
    expect(e.hp[hen!]).toBe(1);
  });

  it('a cow gives twenty times the food of a chicken (Jade)', () => {
    const food = (sp: number): number => speciesSpec(sp).meat * RESOURCES[sp === Species.Cattle ? Res.Beef : Res.Chicken]!.nutrition;
    expect(food(Species.Cattle)).toBe(20 * food(Species.Chicken));
    expect(speciesSpec(Species.Cattle).meat).toBe(20);
  });
});
