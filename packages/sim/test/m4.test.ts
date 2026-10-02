import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addWarrior,
  Blocked,
  BuildingKind,
  createWorld,
  CHUNK_SHIFT,
  CRAFT_PRODUCT,
  CYCLE_STEPS,
  deserializeState,
  hashState,
  hurtUnit,
  Item,
  Made,
  MEAL_STEPS,
  placeBuilding,
  placementBlocked,
  productsOf,
  PropKind,
  RATING_PER_MILLE,
  ratingAt,
  RECIPE_PRODUCT,
  RECIPES,
  Res,
  Research,
  RESEARCH_PRODUCT,
  serializeState,
  settleDeaths,
  shaftStock,
  SLAUGHTER_PRODUCT,
  Species,
  step,
  UnitKind,
  WILD,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);

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

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A clear spot for a building near the Big House, searching outwards. */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = b.x + 16 + dx;
        const z = b.z + dz;
        if (placementBlocked(s, 0, kind, x, z) === Blocked.None) return [x, z];
      }
    }
  }
  throw new Error('no free spot');
}

/** A finished building of a kind and level next to the camp. */
function built(s: SimState, kind: number, level = 1, spotLike = kind): Building {
  const [x, z] = freeSpot(s, spotLike);
  const b = placeBuilding(s, 0, kind, 0, x, z, true);
  b.level = level;
  return b;
}

/** Player 0's workers, by entity id. */
function workers(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) out.push(e.id[i]!);
  return out;
}

function giveResearch(s: SimState, ...r: number[]): void {
  for (const k of r) s.players[0]!.research |= 1 << k;
}

const recipe = (name: string): number => RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === name);

describe('research and the forge', () => {
  it("has no Flint tools research at a Scholar's Lodge (flint gear needs none), and researches Bronze there", () => {
    const s = createWorld(1, { peaceful: true });
    const lodge = built(s, BuildingKind.ScholarsLodge);
    built(s, BuildingKind.Forge);
    const pool = s.players[0]!.pool;
    pool[Res.Flint] = 50;
    pool[Res.SoftwoodLumber] = 50;
    expect(productsOf(lodge)).not.toContain(RESEARCH_PRODUCT + Research.FlintTools);
    run(s, 1, [{ kind: 'produce', player: 0, building: lodge.id, product: RESEARCH_PRODUCT + Research.FlintTools, count: 1 }]);
    expect(lodge.queue.length).toBe(0);
    pool[Res.CopperIngot] = 10;
    pool[Res.TinIngot] = 2;
    s.players[0]!.made |= Made.TinIngot;
    run(s, 1, [{ kind: 'produce', player: 0, building: lodge.id, product: RESEARCH_PRODUCT + Research.Bronze, count: 1 }]);
    expect(lodge.queue.length).toBe(1);
    runUntil(s, () => (s.players[0]!.research & (1 << Research.Bronze)) !== 0, 4000);
    expect(lodge.queue.length).toBe(0);
  });

  it('smelts copper and tin at a Casting Hearth with a worker inside, then bronze', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 40;
    pool[Res.TinOre] = 10;
    pool[Res.Charcoal] = 20;
    pool[Res.HardwoodLumber] = 20;
    giveResearch(s, Research.FlintTools, Research.Bronze);
    const [w] = workers(s);
    run(s, 1, [{ kind: 'assign', player: 0, units: [w!], building: forge.id }]);
    const orders: Order[] = [];
    for (let k = 0; k < 5; k++) orders.push({ kind: 'produce', player: 0, building: forge.id, product: recipe('Copper ingot'), count: 1 });
    run(s, 1, orders);
    expect(forge.queue.length).toBe(5);
    runUntil(s, () => pool[Res.CopperIngot]! >= 5, 4000);
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Tin ingot'), count: 1 }]);
    runUntil(s, () => pool[Res.TinIngot]! >= 1, 2000);
    pool[Res.CopperIngot] = 9;
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Bronze ingots (10)'), count: 1 }]);
    runUntil(s, () => pool[Res.BronzeIngot]! >= 10, 3000);
  });

  it('crafts a fishing rod at the Big House', () => {
    const s = createWorld(1, { peaceful: true });
    s.players[0]!.pool[Res.Flax] = 1;
    run(s, 1, [{ kind: 'produce', player: 0, building: bigHouse(s).id, product: CRAFT_PRODUCT + Item.FishingRod, count: 1 }]);
    runUntil(s, () => s.players[0]!.items[Item.FishingRod]! >= 1, 1000);
  });
});

describe('food', () => {
  it('cooks stew at a Great Kitchen', () => {
    const s = createWorld(1, { peaceful: true });
    const kitchen = built(s, BuildingKind.Cooking, 4);
    const pool = s.players[0]!.pool;
    pool[Res.Potatoes] = 20;
    pool[Res.Carrots] = 10;
    pool[Res.Meat] = 20;
    pool[Res.SoftwoodLumber] = 20;
    run(s, 1, [{ kind: 'produce', player: 0, building: kitchen.id, product: recipe(RECIPES.find((r) => r.outputs[0]![0] === Res.Stew)!.name), count: 1 }]);
    expect(kitchen.queue.length).toBe(1);
    runUntil(s, () => pool[Res.Stew]! > 0, 2000);
  });

  it('Rations: troops only starves the workers but not the troops', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    // Food for the warrior's meals only.
    pool[Res.Meat] = 0;
    pool[Res.Fish] = 0;
    pool[Res.Eggs] = 4;
    run(s, 1, [{ kind: 'rations', player: 0, rations: 1 }]);
    run(s, MEAL_STEPS + 2);
    expect(s.players[0]!.starveWorkers).toBeGreaterThan(0);
    expect(s.players[0]!.starveTroops).toBe(0);
  });

  it("keeps a food back with Don't eat", () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const eggs = pool[Res.Eggs]!;
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Eggs, on: 1 }]);
    run(s, MEAL_STEPS * 2 + 2);
    expect(pool[Res.Eggs]).toBe(eggs);
  });
});

describe('animals', () => {
  it('stocks the land round the camp with wild animals as the players arrive', () => {
    const s = createWorld(1, { peaceful: true });
    run(s, 2);
    const e = s.entities;
    let wild = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Animal && e.owner[i] === WILD) wild++;
    expect(wild).toBeGreaterThan(20);
  });

  it('tames a wild horse at the Stables with 5 carrots', () => {
    const s = createWorld(1, { peaceful: true });
    const stables = built(s, BuildingKind.Stables);
    s.players[0]!.pool[Res.Carrots] = 5;
    const e = s.entities;
    const w = e.indexOf(workers(s)[0]!);
    const h = addAnimal(s, Species.Horse, WILD, e.x[w]! + 6 * WU_PER_METRE, e.z[w]!, 0, 0);
    const id = e.id[h]!;
    run(s, 1, [{ kind: 'tame', player: 0, units: [e.id[w]!], target: id }]);
    runUntil(s, () => e.owner[e.indexOf(id)] === 0, 2000);
    expect(e.home[e.indexOf(id)]).toBe(stables.id);
    expect(s.players[0]!.pool[Res.Carrots]).toBe(0);
  });

  it('warriors hunt a deer with N and bring the meat home', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    const wx = base.x * WU_PER_COLUMN - 4 * WU_PER_METRE;
    const wz = base.z * WU_PER_COLUMN;
    const a = addWarrior(s, 0, wx, wz);
    e.ranged[a] = Item.JavelinsFlint;
    e.ammo[a] = 5;
    const deer = addAnimal(s, Species.Deer, WILD, wx + 12 * WU_PER_METRE, wz + 4 * WU_PER_METRE, 0, 0);
    const meat = s.players[0]!.pool[Res.Meat]!;
    // Kept back from meals so the haul shows in the pool.
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Meat, on: 1 }]);
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: e.id[deer]!, auto: 0 }]);
    runUntil(s, () => s.players[0]!.pool[Res.Meat]! > meat, 6000);
  });

  it('a killed animal leaves a carcass that workers butcher for meat and hides', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = e.indexOf(workers(s)[0]!);
    const boar = addAnimal(s, Species.Boar, WILD, e.x[w]! + 5 * WU_PER_METRE, e.z[w]!, 0, 0);
    const [bx, bz] = [col(e.x[boar]!), col(e.z[boar]!)];
    hurtUnit(s, boar, { damage: 10000, from: 0, projectile: false, blunt: false, pierce: false });
    settleDeaths(s);
    const view = s.world.props(bx >> CHUNK_SHIFT, bz >> CHUNK_SHIFT, s.step).find((p) => p.kind === PropKind.Carcass);
    expect(view?.amount).toBe(3);
  });

  it('a livestock farm breeds its pair and slaughters for meat', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = built(s, BuildingKind.LivestockFarm);
    const [x, z] = [farm.x * WU_PER_COLUMN, farm.z * WU_PER_COLUMN];
    const cow = addAnimal(s, Species.Cattle, 0, x, z, 0, 0);
    const bull = addAnimal(s, Species.Cattle, 0, x + WU_PER_METRE, z, 0, 1);
    s.entities.home[cow] = farm.id;
    s.entities.home[bull] = farm.id;
    s.entities.breedAt[cow] = CYCLE_STEPS;
    run(s, CYCLE_STEPS + 2);
    const herd = (): number => {
      let n = 0;
      for (let i = 0; i < s.entities.count; i++) if (s.entities.kind[i] === UnitKind.Animal && s.entities.home[i] === farm.id) n++;
      return n;
    };
    expect(herd()).toBe(3);
    const meat = s.players[0]!.pool[Res.Meat]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: farm.id, product: SLAUGHTER_PRODUCT + Species.Cattle, count: 1 }]);
    runUntil(s, () => s.players[0]!.pool[Res.Meat]! >= meat + 6, 400);
    expect(herd()).toBe(2);
  });
});

describe('mining', () => {
  it('prospects a spot, mines vein iron at a tier 2 shaft and hauls it home by ox cart', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    // Placed straight on the camp's grass (the stone rule is placement's, tested in its own place).
    const shaft = built(s, BuildingKind.Mineshaft, 2, BuildingKind.Stables);
    const [a, b, c, d] = workers(s);
    // Prospecting reports the spot's rating.
    run(s, 1, [{ kind: 'prospect', player: 0, units: [a!], x: shaft.x - 3, z: shaft.z - 3 }]);
    let report = '';
    runUntil(s, () => {
      report = s.events.find((ev) => ev.kind === 'prospect')?.text ?? report;
      return report !== '';
    }, 2000);
    expect(report).toMatch(/^Prospect: (Poor|Fair|Good|Rich)\./);
    // Four miners bring up the tier 2 output.
    run(s, 1, [{ kind: 'assign', player: 0, units: [a!, b!, c!, d!], building: shaft.id }]);
    runUntil(s, () => shaft.stock.some(([r]) => r === Res.VeinIron), CYCLE_STEPS);
    expect(RATING_PER_MILLE[shaft.rating - 1]).toBe(RATING_PER_MILLE[ratingAt(s, shaft.x, shaft.z)]);
    // A hauler with an ox cart and a tamed ox takes it to the Big House.
    const base = bigHouse(s);
    const hx = base.x * WU_PER_COLUMN - 3 * WU_PER_METRE;
    const hz = base.z * WU_PER_COLUMN;
    const hauler = e.add(s.nextEntityId++, 0, hx, 0, hz, e.speed[e.indexOf(a!)]!, UnitKind.Worker);
    e.hp[hauler] = 60;
    e.maxHp[hauler] = 60;
    e.kit[hauler] = Item.OxCart;
    const ox = addAnimal(s, Species.Ox, 0, hx + WU_PER_METRE, hz, 0, 1);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [e.id[hauler]!], target: e.id[ox]! }]);
    runUntil(s, () => e.partner[hauler] === e.id[ox], 400);
    const before = s.players[0]!.pool[Res.VeinIron]!;
    run(s, 1, [{ kind: 'haul', player: 0, units: [e.id[hauler]!], building: shaft.id }]);
    runUntil(s, () => s.players[0]!.pool[Res.VeinIron]! > before, 4000);
    expect(shaftStock(shaft)).toBeGreaterThanOrEqual(0);
  });
});

describe('save and load', () => {
  it('keeps the same hash through a snapshot with animals, sites and research', () => {
    const s = createWorld(3, { peaceful: true });
    run(s, 300);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    run(s, 200);
    run(copy, 200);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
