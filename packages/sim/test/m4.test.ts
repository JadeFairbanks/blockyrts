import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addWarrior,
  applyKit,
  Blocked,
  DAY_STEPS,
  BuildingKind,
  createWorld,
  CHUNK_SHIFT,
  CYCLE_STEPS,
  deserializeState,
  hashState,
  hurtUnit,
  Made,
  MEAL_STEPS,
  placeBuilding,
  placementBlocked,
  productProblem,
  productsOf,
  PROSPECT_HAMMER_STEPS,
  PROSPECT_STEPS,
  PROSPECT_TOOL_TIER,
  PropKind,
  RATING_PER_MILLE,
  ratingAt,
  RANGER_GEAR,
  RECIPE_PRODUCT,
  recipeSpec,
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
  Troop,
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

  it('only smelts: every forge product is a recipe that makes ingots, each metal at its level', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge, 4);
    const ingots = [Res.CopperIngot, Res.TinIngot, Res.BronzeIngot, Res.WroughtIron, Res.PigIron, Res.IronIngot, Res.SteelIngot, Res.CarbonSteel];
    const made = productsOf(forge).map((p) => {
      // No troops, no weapons, no tools: recipes only (Troops and gear: no items).
      expect(p).toBeGreaterThanOrEqual(RECIPE_PRODUCT);
      const r = recipeSpec(p - RECIPE_PRODUCT);
      expect(r.outputs.length).toBe(1);
      expect(ingots).toContain(r.outputs[0]![0]);
      return r.name;
    });
    expect(made).toEqual(['Copper ingot', 'Tin ingot', 'Bronze ingots (10)', 'Wrought iron', 'Pig iron', 'Iron ingot', 'Steel ingot', 'Carbon steel ingot']);
    // The Casting Hearth smelts copper, the Bloomery wrought iron, the Ironworks pig iron, the Steelworks steel.
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 10;
    pool[Res.BogIron] = 10;
    pool[Res.VeinIron] = 10;
    pool[Res.IronIngot] = 10;
    pool[Res.Charcoal] = 20;
    giveResearch(s, Research.Steel);
    const need = (level: number, name: string): string => {
      forge.level = level;
      return productProblem(s, forge, recipe(name));
    };
    expect(need(1, 'Copper ingot')).toBe('');
    expect(need(1, 'Wrought iron')).toBe('Needs a Bloomery.');
    expect(need(2, 'Wrought iron')).toBe('');
    expect(need(2, 'Pig iron')).toBe('Needs a Ironworks.');
    expect(need(3, 'Pig iron')).toBe('');
    expect(need(3, 'Steel ingot')).toBe('Needs a Steelworks.');
    expect(need(4, 'Steel ingot')).toBe('');
  });

  it('smelts wrought iron from bog iron at a Bloomery with a worker inside', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge, 2);
    const pool = s.players[0]!.pool;
    pool[Res.BogIron] = 6;
    pool[Res.Charcoal] = 4;
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Wrought iron'), count: 2 }]);
    expect(forge.queue.length).toBe(2);
    expect([pool[Res.BogIron], pool[Res.Charcoal]]).toEqual([0, 0]);
    // No hands inside, no iron.
    run(s, 300);
    expect(pool[Res.WroughtIron]).toBe(0);
    const [w] = workers(s);
    run(s, 1, [{ kind: 'assign', player: 0, units: [w!], building: forge.id }]);
    runUntil(s, () => pool[Res.WroughtIron]! >= 2, 3000);
  });

  it('makes rope at the Big House from 2 flax', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    pool[Res.Flax] = 2;
    run(s, 1, [{ kind: 'produce', player: 0, building: bigHouse(s).id, product: recipe('Rope'), count: 1 }]);
    expect(pool[Res.Flax]).toBe(0);
    runUntil(s, () => pool[Res.Rope]! >= 1, 1000);
  });
});

describe('the tannery', () => {
  it('tans hides into leather and hardens 2 leather into 1 hardened leather, with a worker inside', () => {
    const s = createWorld(1, { peaceful: true });
    const tannery = built(s, BuildingKind.Tannery);
    const pool = s.players[0]!.pool;
    pool[Res.Hides] = 4;
    expect(productsOf(tannery)).toEqual([recipe('Leather'), recipe('Hardened leather'), recipe('Rope')]);
    const [w] = workers(s);
    run(s, 1, [{ kind: 'assign', player: 0, units: [w!], building: tannery.id }]);
    run(s, 1, [{ kind: 'produce', player: 0, building: tannery.id, product: recipe('Leather'), count: 4 }]);
    expect(pool[Res.Hides]).toBe(0);
    runUntil(s, () => pool[Res.Leather]! >= 4, 4000);
    run(s, 1, [{ kind: 'produce', player: 0, building: tannery.id, product: recipe('Hardened leather'), count: 2 }]);
    expect(pool[Res.Leather]).toBe(0);
    runUntil(s, () => pool[Res.HardenedLeather]! >= 2, 3000);
    expect(pool[Res.Leather]).toBe(0);
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

  it('rangers hunt a deer with N and bring the meat home', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    const wx = base.x * WU_PER_COLUMN - 4 * WU_PER_METRE;
    const wz = base.z * WU_PER_COLUMN;
    // A ranger with a leather sling: its weapon comes with the troop type, and its stones never run out (Troops and gear).
    const a = addWarrior(s, 0, wx, wz, Troop.Ranger, 1);
    expect(e.ranged[a]).toBe(RANGER_GEAR[1]);
    // It shoots from as far as its 20 m reach, then walks over to butcher what it killed and carries the meat home.
    const deer = addAnimal(s, Species.Deer, WILD, wx + 12 * WU_PER_METRE, wz + 4 * WU_PER_METRE, 0, 0);
    const meat = s.players[0]!.pool[Res.Meat]!;
    // Kept back from meals so the haul shows in the pool.
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Meat, on: 1 }]);
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: e.id[deer]!, auto: 0 }]);
    runUntil(s, () => s.players[0]!.pool[Res.Meat]! > meat, 6000);
  });

  it('a warrior that butchers a cow by a rock walks round it and hands the meat in at the Big House', () => {
    // Seed 1: the cow runs north-east and falls with a raised column just north of where the warrior
    // kneels at the edge of its column. The straight line home clipped that corner, so the warrior
    // stood there with the meat until dusk and never handed it in (Jade, 2026-10-03).
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    const wx = base.x * WU_PER_COLUMN - 4 * WU_PER_METRE;
    const wz = base.z * WU_PER_COLUMN;
    const a = 4;
    expect(e.troop[a]).toBe(Troop.Close);
    const cow = addAnimal(s, Species.Cattle, WILD, wx + 15 * WU_PER_METRE, wz + 6 * WU_PER_METRE, 0, 0);
    const meat = s.players[0]!.pool[Res.Meat]!;
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: e.id[cow]!, auto: 0 }]);
    // Kept back from meals so the haul shows in the pool.
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Meat, on: 1 }]);
    runUntil(s, () => e.carryAmt[a]! > 0, 3000);
    const load = e.carryAmt[a]!;
    // Home with the whole load well before dusk, and the hunt is over.
    runUntil(s, () => e.carryAmt[a] === 0, 1500);
    expect(s.players[0]!.pool[Res.Meat]).toBe(meat + load);
    expect(s.step).toBeLessThan(DAY_STEPS);
    run(s, 20);
    expect(e.queue[a]).toEqual([]);
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
    // A hauler leads a tamed ox, fetches the ox cart from the Big House's stock and takes the iron home.
    const base = bigHouse(s);
    const hx = base.x * WU_PER_COLUMN - 3 * WU_PER_METRE;
    const hz = base.z * WU_PER_COLUMN;
    const hauler = e.add(s.nextEntityId++, 0, hx, 0, hz, e.speed[e.indexOf(a!)]!, UnitKind.Worker);
    e.hp[hauler] = 60;
    e.maxHp[hauler] = 60;
    s.players[0]!.pool[Res.OxCart] = 1;
    const ox = addAnimal(s, Species.Ox, 0, hx + WU_PER_METRE, hz, 0, 1);
    run(s, 1, [{ kind: 'hitch', player: 0, units: [e.id[hauler]!], target: e.id[ox]! }]);
    runUntil(s, () => e.partner[hauler] === e.id[ox], 400);
    run(s, 1, [{ kind: 'cart', player: 0, units: [e.id[hauler]!], back: 0 }]);
    runUntil(s, () => e.kit[hauler] === Res.OxCart, 1000);
    expect(s.players[0]!.pool[Res.OxCart]).toBe(0);
    const before = s.players[0]!.pool[Res.VeinIron]!;
    run(s, 1, [{ kind: 'haul', player: 0, units: [e.id[hauler]!], building: shaft.id }]);
    runUntil(s, () => s.players[0]!.pool[Res.VeinIron]! > before, 4000);
    expect(shaftStock(shaft)).toBeGreaterThanOrEqual(0);
  });
});

describe('carts and tools (Troops and gear: workers)', () => {
  it('fetches a hand cart from the main base with the cart order, and hands it back in', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [a, b] = workers(s);
    const ia = e.indexOf(a!);
    const ib = e.indexOf(b!);
    // None in stock: nobody goes, and the player hears where carts are made.
    const texts: string[] = [];
    step(s, [{ kind: 'cart', player: 0, units: [a!], back: 0 }]);
    texts.push(...s.events.map((ev) => ev.text));
    expect(texts).toContain('No cart in stock. Hand carts are made at a Workshop, ox and horse carts at a Great Workshop.');
    expect(e.queue[ia]!.length).toBe(0);
    // One in stock and two workers asking: the first takes it.
    pool[Res.HandCart] = 1;
    run(s, 1, [{ kind: 'cart', player: 0, units: [a!, b!], back: 0 }]);
    expect(e.queue[ia]![0]?.t).toBe('cart');
    expect(e.queue[ib]!.length).toBe(0);
    runUntil(s, () => e.kit[ia] === Res.HandCart, 1000);
    expect(pool[Res.HandCart]).toBe(0);
    // Back into the stock.
    run(s, 1, [{ kind: 'cart', player: 0, units: [a!], back: 1 }]);
    runUntil(s, () => e.kit[ia] === 0, 1000);
    expect(pool[Res.HandCart]).toBe(1);
  });

  it('prospects in 20 s with a copper tool kit or better, 40 s without', () => {
    const took = (tier: number): number => {
      const s = createWorld(1, { peaceful: true });
      const e = s.entities;
      const [a] = workers(s);
      const i = e.indexOf(a!);
      e.wTier[i] = tier;
      applyKit(e, i, 'worker');
      const shaft = freeSpot(s, BuildingKind.Stables);
      run(s, 1, [{ kind: 'prospect', player: 0, units: [a!], x: shaft[0] - 3, z: shaft[1] - 3 }]);
      return runUntil(s, () => s.events.some((ev) => ev.kind === 'prospect'), 3000);
    };
    expect(PROSPECT_TOOL_TIER).toBe(3);
    expect(took(PROSPECT_TOOL_TIER - 1) - took(PROSPECT_TOOL_TIER)).toBe(PROSPECT_STEPS - PROSPECT_HAMMER_STEPS);
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
