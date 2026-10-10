import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addWarrior,
  applyKit,
  bagEmpty,
  bagItems,
  bagTenthsLb,
  buildingCentre,
  Blocked,
  DAY_STEPS,
  DUSK_STEPS,
  BuildingKind,
  CRAFT_PACE,
  createWorld,
  CHUNK_SHIFT,
  CYCLE_STEPS,
  DebugThreat,
  deserializeState,
  hashState,
  hurtUnit,
  LOOT_BAG_TENTHS_LB,
  MEAL_STEPS,
  NIGHT_STEPS,
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
  RESOURCES,
  RESEARCH_PRODUCT,
  serializeState,
  settleDeaths,
  shaftDepth,
  SHAFT_STOCK_LIMIT,
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

const SEC = 20;

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
  it("has no Flint tools research at a Scholar's Lodge (flint gear needs none), and researches Bronze there with no tin ingot smelted first (mini balance)", () => {
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
    // Jade's mini balance: no tin ingot needs smelting first.
    run(s, 1, [{ kind: 'produce', player: 0, building: lodge.id, product: RESEARCH_PRODUCT + Research.Bronze, count: 1 }]);
    expect(lodge.queue.length).toBe(1);
    expect(pool[Res.BronzeIngot]).toBe(0);
    runUntil(s, () => (s.players[0]!.research & (1 << Research.Bronze)) !== 0, 4000);
    expect(lodge.queue.length).toBe(0);
    expect(pool[Res.BronzeIngot]).toBe(0);
  });

  it('smelts copper and tin at the Forge with no workers (Patch 2), then bronze', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 40;
    pool[Res.TinOre] = 10;
    pool[Res.Charcoal] = 20;
    pool[Res.HardwoodLumber] = 20;
    giveResearch(s, Research.FlintTools, Research.Bronze);
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

  it('burns 2 hardwood or 4 softwood to smelt a copper or tin ingot, where charcoal or coal takes 1 (mini balance)', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    const pool = s.players[0]!.pool;
    pool[Res.SoftwoodLumber] = 4;
    pool[Res.CopperOre] = 2;
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Copper ingot'), count: 1 }]);
    expect([pool[Res.SoftwoodLumber], pool[Res.CopperOre]]).toEqual([0, 0]);
    pool[Res.HardwoodLumber] = 2;
    pool[Res.TinOre] = 2;
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Tin ingot'), count: 1 }]);
    expect([pool[Res.HardwoodLumber], pool[Res.TinOre]]).toEqual([0, 0]);
    runUntil(s, () => pool[Res.TinIngot]! >= 1, 3000);
    expect(pool[Res.CopperIngot]).toBe(1);
  });

  it('smelts metals and makes charcoal, bricks, glass and gunpowder, each at its main base tier (Patch 2: no Forge levels)', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    const goods = [Res.CopperIngot, Res.TinIngot, Res.BronzeIngot, Res.WroughtIron, Res.PigIron, Res.IronIngot, Res.SteelIngot, Res.CarbonSteel, Res.Charcoal, Res.Bricks, Res.Glass, Res.Gunpowder];
    const made = productsOf(forge).map((p) => {
      // No troops, no weapons, no tools: recipes only (Troops and gear: no items).
      expect(p).toBeGreaterThanOrEqual(RECIPE_PRODUCT);
      const r = recipeSpec(p - RECIPE_PRODUCT);
      expect(r.outputs.length).toBe(1);
      expect(goods).toContain(r.outputs[0]![0]);
      return r.name;
    });
    expect(made).toEqual([
      'Copper ingot', 'Tin ingot', 'Bronze ingots (10)', 'Wrought iron', 'Pig iron', 'Iron ingot', 'Steel ingot', 'Carbon steel ingot',
      'Charcoal (3)', 'Bricks (4)', 'Glass', 'Gunpowder',
    ]);
    // Copper from the start, wrought iron and charcoal at main base tier 2, pig iron and steel at tier 3 (Patch 5: levels 3, 5 and 7 before).
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 10;
    pool[Res.BogIron] = 10;
    pool[Res.VeinIron] = 10;
    pool[Res.IronIngot] = 10;
    pool[Res.Charcoal] = 20;
    pool[Res.HardwoodLumber] = 10;
    giveResearch(s, Research.Steel);
    const need = (level: number, name: string): string => {
      bigHouse(s).level = level;
      return productProblem(s, forge, recipe(name));
    };
    expect(need(1, 'Copper ingot')).toBe('');
    expect(need(1, 'Wrought iron')).toBe('Needs a tier 2 main base.');
    expect(need(1, 'Charcoal (3)')).toBe('Needs a tier 2 main base.');
    expect(need(2, 'Wrought iron')).toBe('');
    expect(need(2, 'Charcoal (3)')).toBe('');
    expect(need(2, 'Pig iron')).toBe('Needs a tier 3 main base.');
    expect(need(2, 'Steel ingot')).toBe('Needs a tier 3 main base.');
    expect(need(3, 'Pig iron')).toBe('');
    expect(need(3, 'Steel ingot')).toBe('');
  });

  it('smelts wrought iron from bog iron at the Forge with no workers, at the crafting pace', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    bigHouse(s).level = 3;
    const pool = s.players[0]!.pool;
    pool[Res.BogIron] = 6;
    pool[Res.Charcoal] = 4;
    run(s, 1, [{ kind: 'produce', player: 0, building: forge.id, product: recipe('Wrought iron'), count: 2 }]);
    expect(forge.queue.length).toBe(2);
    expect([pool[Res.BogIron], pool[Res.Charcoal]]).toEqual([0, 0]);
    // Two batches of 10 s at twice the pace: about 10 s, with nobody inside.
    const took = runUntil(s, () => pool[Res.WroughtIron]! >= 2, 3000);
    expect(took).toBeLessThanOrEqual(2 * recipeSpec(recipe('Wrought iron') - RECIPE_PRODUCT).steps / CRAFT_PACE + 2);
    expect(forge.queue.length).toBe(0);
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

describe('the Workshop (Patch 2: the tannery, lumber mill and herbalist hut in one)', () => {
  it('tans hides into leather and hardens 2 leather into 1 hardened leather, with no workers', () => {
    const s = createWorld(1, { peaceful: true });
    const tannery = built(s, BuildingKind.Workshop);
    const pool = s.players[0]!.pool;
    pool[Res.Hides] = 4;
    for (const name of ['Leather', 'Hardened leather', 'Rope', 'Planks', 'Bandage', 'Healing remedy']) expect(productsOf(tannery)).toContain(recipe(name));
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
  it('cooks nothing: no recipe makes or takes a food (Patch 2: cooking is cut, meat is eaten raw)', () => {
    for (const r of RECIPES) {
      for (const [o] of r.outputs) expect(RESOURCES[o]!.nutrition, r.name).toBe(0);
      for (const way of r.inputs) for (const [i] of way) expect(RESOURCES[i]!.nutrition, r.name).toBe(0);
    }
  });

  it('Rations: troops only starves the workers but not the troops', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    // Food for the warrior's meals only.
    pool[Res.Venison] = 0;
    pool[Res.Trout] = 0;
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

  it('tames a wild horse with 15 food of plant food fed at 2 a second, and it follows its worker into a Barn (Patch 5)', () => {
    const s = createWorld(1, { peaceful: true });
    const stables = built(s, BuildingKind.Barn);
    // 15 food is 7½ farm fare: 8 are opened, half of the last left over (4 quarters).
    s.players[0]!.pool[Res.FarmFare] = 8;
    const e = s.entities;
    const w = e.indexOf(workers(s)[0]!);
    // Well away from the Barn, so that it has to be led there.
    const [bx, bz] = [stables.x * WU_PER_COLUMN, stables.z * WU_PER_COLUMN];
    e.x[w] = bx;
    e.z[w] = bz + 24 * WU_PER_METRE;
    const h = addAnimal(s, Species.Horse, WILD, bx, bz + 30 * WU_PER_METRE, 0, 0);
    const id = e.id[h]!;
    run(s, 1, [{ kind: 'tame', player: 0, units: [e.id[w]!], target: id }]);
    // The bar over its head fills for 7½ s once the worker stands by it.
    runUntil(s, () => e.tinker[e.indexOf(id)] !== 0, 2000);
    expect(e.tinker[e.indexOf(id)]).toBe(150);
    runUntil(s, () => e.owner[e.indexOf(id)] === 0, 200);
    expect([s.players[0]!.pool[Res.FarmFare], s.players[0]!.open[Res.FarmFare]]).toEqual([0, 4]);
    // It follows the worker to the Barn and joins it there.
    expect(e.partner[e.indexOf(id)]).toBe(e.id[w]);
    runUntil(s, () => e.home[e.indexOf(id)] === stables.id, 4000);
    expect(e.partner[e.indexOf(id)]).toBe(0);
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
    const meat = s.players[0]!.pool[Res.Venison]!;
    // Kept back from meals so the haul shows in the pool.
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Venison, on: 1 }]);
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: e.id[deer]!, auto: 0 }]);
    runUntil(s, () => s.players[0]!.pool[Res.Venison]! > meat, 6000);
  });

  it('a warrior that kills a cow by a rock takes the meat and walks round the rock to hand it in at the Big House', () => {
    // Seed 1: the cow runs north-east and falls with a raised column just north of where the warrior
    // stands at the edge of its column. The straight line home clipped that corner, so the warrior
    // once stood there with the meat until dusk and never handed it in (Jade, 2026-10-03).
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    const wx = base.x * WU_PER_COLUMN - 4 * WU_PER_METRE;
    const wz = base.z * WU_PER_COLUMN;
    const a = 4;
    expect(e.troop[a]).toBe(Troop.Close);
    const cow = addAnimal(s, Species.Cattle, WILD, wx + 15 * WU_PER_METRE, wz + 6 * WU_PER_METRE, 0, 0);
    const meat = s.players[0]!.pool[Res.Beef]!;
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[a]!], target: e.id[cow]!, auto: 0 }]);
    // Kept back from meals so the haul shows in the pool.
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.Beef, on: 1 }]);
    // No carcass to butcher: the meat goes straight into the bag of the warrior that killed it (Jade's play-test notes).
    const inBag = (): number => bagItems(s, a).find(([r]) => r === Res.Beef)?.[1] ?? 0;
    runUntil(s, () => inBag() > 0, 3000);
    const load = inBag();
    // Patch 2: a cow gives 20 beef, so the 25 lb bag takes 10 and the rest lies on the ground for the player.
    expect(load).toBe(10);
    expect(s.loot.filter((l) => l.res === Res.Beef).map((l) => [l.amt, l.owner])).toEqual([[10, 0]]);
    // With nothing else to do it hands the meat in, well before dusk, and walks back to where it stood.
    runUntil(s, () => bagEmpty(s, a), 1500);
    expect(s.players[0]!.pool[Res.Beef]).toBe(meat + load);
    expect(s.step).toBeLessThan(DAY_STEPS);
    runUntil(s, () => e.queue[a]!.length === 0, 1500);
  });

  it('a killed animal leaves no carcass: its meat and hide lie on the ground until a unit picks them up', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const w = e.indexOf(workers(s)[0]!);
    const boar = addAnimal(s, Species.Boar, WILD, e.x[w]! + 5 * WU_PER_METRE, e.z[w]!, 0, 0);
    const [bx, bz] = [col(e.x[boar]!), col(e.z[boar]!)];
    hurtUnit(s, boar, { damage: 10000, from: 0, projectile: false, blunt: false, pierce: false, roll: 0 });
    settleDeaths(s);
    expect(s.world.props(bx >> CHUNK_SHIFT, bz >> CHUNK_SHIFT, s.step).some((p) => p.kind === PropKind.Carcass)).toBe(false);
    const meat = s.loot.find((l) => l.res === Res.BoarMeat)!;
    expect(meat.amt).toBe(3);
    expect(s.loot.some((l) => l.res === Res.Hides)).toBe(true);
    // A right-click on it: the worker walks over and takes both, then hands them in, by itself this near the main base (Jade's Patch 5, GP-6).
    run(s, 1, [{ kind: 'dontEat', player: 0, res: Res.BoarMeat, on: 1 }]);
    const pool = s.players[0]!.pool;
    const [hides, boarMeat] = [pool[Res.Hides]!, pool[Res.BoarMeat]!];
    run(s, 1, [{ kind: 'pickUp', player: 0, units: [e.id[w]!], target: meat.id }]);
    runUntil(s, () => s.loot.length === 0, 600);
    runUntil(s, () => pool[Res.Hides]! > hides, 1500);
    expect(pool[Res.BoarMeat]).toBe(boarMeat + 3);
    expect(bagEmpty(s, w)).toBe(true);
  });

  it('a Barn with its hand at work breeds its pair, who meet with hearts, and slaughters for meat', () => {
    const s = createWorld(1, { peaceful: true });
    const farm = built(s, BuildingKind.Barn);
    const [x, z] = [farm.x * WU_PER_COLUMN, farm.z * WU_PER_COLUMN];
    const cow = addAnimal(s, Species.Cattle, 0, x, z - 6 * WU_PER_METRE, 0, 0);
    const bull = addAnimal(s, Species.Cattle, 0, x + 4 * WU_PER_METRE, z - 6 * WU_PER_METRE, 0, 1);
    s.entities.home[cow] = farm.id;
    s.entities.home[bull] = farm.id;
    s.entities.breedAt[cow] = 0;
    const herd = (): number => {
      let n = 0;
      for (let i = 0; i < s.entities.count; i++) if (s.entities.kind[i] === UnitKind.Animal && s.entities.home[i] === farm.id) n++;
      return n;
    };
    // No hand, no young.
    run(s, 200);
    expect(herd()).toBe(2);
    run(s, 1, [{ kind: 'assign', player: 0, units: [workers(s)[0]!], building: farm.id }]);
    let hearts = 0;
    runUntil(s, () => {
      hearts += s.hits.filter((h) => h.look === 'heart').length;
      return herd() === 3;
    }, 3000);
    expect(hearts).toBe(2);
    const meat = s.players[0]!.pool[Res.Beef]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: farm.id, product: SLAUGHTER_PRODUCT + Species.Cattle, count: 1 }]);
    // Patch 2: a cow gives 20 beef, twenty times a chicken's meat (Jade).
    runUntil(s, () => s.players[0]!.pool[Res.Beef]! >= meat + 20, 400);
    expect(herd()).toBe(2);
  });
});

describe('mining', () => {
  it('prospects a spot, and miners bring vein iron home in 25 lb bags with Deep Mining II (Patch 2)', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    // Placed straight on the camp's grass (the stone rule is placement's, tested in its own place).
    const shaft = built(s, BuildingKind.Mineshaft, 1, BuildingKind.Barn);
    // Patch 2: the shaft has no tiers; the research digs every shaft deeper.
    expect(shaftDepth(s, shaft)).toBe(1);
    giveResearch(s, Research.DeepMining2);
    expect(shaftDepth(s, shaft)).toBe(2);
    const [a, b, c, d] = workers(s);
    // Prospecting reports the spot's rating.
    run(s, 1, [{ kind: 'prospect', player: 0, units: [a!], x: shaft.x - 3, z: shaft.z - 3 }]);
    let report = '';
    runUntil(s, () => {
      report = s.events.find((ev) => ev.kind === 'prospect')?.text ?? report;
      return report !== '';
    }, 2000);
    expect(report).toMatch(/^Prospect: (Poor|Fair|Good|Rich)\./);
    // Four miners bring up the second depth's output.
    run(s, 1, [{ kind: 'assign', player: 0, units: [a!, b!, c!, d!], building: shaft.id }]);
    runUntil(s, () => shaft.stock.some(([r]) => r === Res.VeinIron), CYCLE_STEPS);
    expect(RATING_PER_MILLE[shaft.rating - 1]).toBe(RATING_PER_MILLE[ratingAt(s, shaft.x, shaft.z)]);
    // Patch 2 (Jade): no hauling. A miner stays down until a 25 lb bagful waits, carries it to the Big House and goes back down.
    const pool = s.players[0]!.pool;
    const before = pool[Res.VeinIron]!;
    const ids = [a!, b!, c!, d!];
    let heaviest = 0;
    let carried = false;
    runUntil(s, () => {
      for (const id of ids) {
        const i = e.indexOf(id);
        heaviest = Math.max(heaviest, bagTenthsLb(s, i));
        if (e.inside[i] !== shaft.id && bagTenthsLb(s, i) > 0) carried = true;
      }
      return pool[Res.VeinIron]! > before;
    }, CYCLE_STEPS);
    expect(carried).toBe(true);
    // A bagful: what still fits after it is less than the heaviest ore (5 lb).
    expect(heaviest).toBeGreaterThan(LOOT_BAG_TENTHS_LB - 50);
    expect(heaviest).toBeLessThanOrEqual(LOOT_BAG_TENTHS_LB);
    // They stay on the job, and what waits at the shaft stays under a bagful or so.
    for (const id of ids) expect(e.queue[e.indexOf(id)]![0]?.t).toBe('job');
    expect(shaftStock(shaft)).toBeLessThan(SHAFT_STOCK_LIMIT);
  });

  it('a miner takes its bag to a nearer Storehouse, and stays down at dusk and night until dawn (Patch 2)', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const base = bigHouse(s);
    // A shaft some 30 m out, with a Storehouse beside it.
    const near = (kind: number, x0: number, z0: number, like = kind): Building => {
      for (let r = 0; r < 40; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (const dz of [-r, r]) if (placementBlocked(s, 0, like, x0 + dx, z0 + dz) === Blocked.None) return placeBuilding(s, 0, kind, 0, x0 + dx, z0 + dz, true);
        }
      }
      throw new Error('no free spot');
    };
    // Placed on grass, as above.
    const shaft = near(BuildingKind.Mineshaft, base.x + 66, base.z, BuildingKind.Barn);
    const store = near(BuildingKind.Storehouse, shaft.x, shaft.z + 12);
    const [a] = workers(s);
    const i = e.indexOf(a!);
    run(s, 1, [{ kind: 'assign', player: 0, units: [a!], building: shaft.id }]);
    runUntil(s, () => e.inside[i] === shaft.id, 60 * SEC);
    // Down the shaft, a bagful waits: at night the miner stays down and digs on.
    s.step = DAY_STEPS + DUSK_STEPS;
    shaft.stock = [[Res.Stone, 6]];
    run(s, 5 * SEC);
    expect(e.inside[i]).toBe(shaft.id);
    expect(bagEmpty(s, i)).toBe(true);
    // At dawn it carries 25 lb out (5 stones, one left) to the Storehouse, the nearer drop-off.
    s.step = DAY_STEPS + DUSK_STEPS + NIGHT_STEPS;
    run(s, 2);
    expect(e.inside[i]).toBe(0);
    expect(bagItems(s, i)).toEqual([[Res.Stone, 5]]);
    expect(shaft.stock).toEqual([[Res.Stone, 1]]);
    const stone = s.players[0]!.pool[Res.Stone]!;
    runUntil(s, () => bagEmpty(s, i), 60 * SEC);
    expect(s.players[0]!.pool[Res.Stone]).toBe(stone + 5);
    const [sx, sz] = buildingCentre(store);
    const [hx, hz] = buildingCentre(base);
    expect(Math.hypot(e.x[i]! - sx, e.z[i]! - sz)).toBeLessThan(Math.hypot(e.x[i]! - hx, e.z[i]! - hz));
    // And back down it goes.
    runUntil(s, () => e.inside[i] === shaft.id, 60 * SEC);
    expect(e.queue[i]![0]).toEqual({ t: 'job', b: shaft.id });
  });

  it("the tester tools' Mine kit puts a finished Mineshaft and a Storehouse beside it, with Deep Mining I (Patch 2)", () => {
    const s = createWorld(1, { peaceful: true });
    const base = bigHouse(s);
    const [x, z] = buildingCentre(base);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.MineKit, x: x + 40 * WU_PER_METRE, z }]);
    const shaft = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.Mineshaft)!;
    const store = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.Storehouse)!;
    expect([shaft.complete, store.complete]).toEqual([true, true]);
    expect(store.x).toBeGreaterThan(shaft.x);
    expect(base.level).toBeGreaterThanOrEqual(3);
    expect(s.players[0]!.research & (1 << Research.DeepMining1)).not.toBe(0);
    // A worker assigned to it goes down the shaft.
    const [a] = workers(s);
    const i = s.entities.indexOf(a!);
    run(s, 1, [{ kind: 'assign', player: 0, units: [a!], building: shaft.id }]);
    runUntil(s, () => s.entities.inside[i] === shaft.id, 60 * SEC);
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
    expect(texts).toContain('No cart in stock. Carts are made at the Workshop: hand carts from main base tier 2, ox and horse carts from tier 3.');
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
      const shaft = freeSpot(s, BuildingKind.Barn);
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
