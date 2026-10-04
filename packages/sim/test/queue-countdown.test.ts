// The queue's countdown (Patch 2 bug fixes): the steps left the panel is sent
// for a building's head item are the sim's own, so the countdown falls by one
// step every step and reaches zero on the step the item is done. Before Patch
// 2 the client guessed the pace from the rounded per mille bar, and the Magi
// Sanctum's seconds jumped up and down by about ten while they fell.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  CRAFT_PACE,
  createWorld,
  Made,
  mageProduct,
  placeBuilding,
  placementBlocked,
  Product,
  productSpec,
  queueHead,
  RECIPE_PRODUCT,
  RECIPES,
  Res,
  Research,
  RESEARCH_PRODUCT,
  School,
  step,
  supplyCap,
  supplyUsed,
  Troop,
  troopProduct,
  workersAt,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A finished building of a kind and level on a clear spot near the Big House. */
function built(s: SimState, kind: number, level = 1): Building {
  const h = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = h.x + 16 + dx;
        const z = h.z + dz;
        if (placementBlocked(s, 0, kind, x, z) !== Blocked.None) continue;
        const b = placeBuilding(s, 0, kind, 0, x, z, true);
        b.level = level;
        return b;
      }
    }
  }
  throw new Error('no free spot');
}

function produce(s: SimState, b: Building, product: number): void {
  run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product, count: 1 }]);
  expect(b.queue.length).toBe(1);
}

/**
 * Steps the sim until the head item is done, checking at every step that the
 * steps left it reports are exactly the steps it then takes: one fewer each
 * step, and done on the step it says. Returns the steps it counted from.
 */
function countsDownExactly(s: SimState, b: Building): number {
  const item = b.queue[0]!;
  const start = queueHead(s, b)!.stepsLeft;
  expect(start).toBeGreaterThan(0);
  for (let k = 0; k < start; k++) {
    expect(b.queue[0]).toBe(item);
    expect(queueHead(s, b)!.stepsLeft).toBe(start - k);
    step(s);
  }
  expect(b.queue[0]).not.toBe(item);
  return start;
}

describe('the queue countdown is the sim\'s own time', () => {
  it('counts a Magi Sanctum\'s mage down one step a step, where the old guess swung (Jade\'s report)', () => {
    const s = createWorld(1, { peaceful: true });
    const sanctum = built(s, BuildingKind.MagiSanctum);
    const pool = s.players[0]!.pool;
    pool[Res.Sticks] = 20;
    pool[Res.Flax] = 6;
    pool[Res.Venison] = 200;
    // Patch 2: the Sanctum's support mage card, with a hazel wand and a homespun robe.
    const mage = mageProduct(School.Support, 1, 1);
    produce(s, sanctum, mage);
    // 1600 steps: the per mille bar moves 0 or 1 a step, unevenly; the countdown no longer reads it.
    expect(productSpec(mage).steps).toBe(1600);
    expect(countsDownExactly(s, sanctum)).toBeGreaterThan(1590);
  });

  it('does the same at the Barracks and the Big House', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    for (const r of [Res.HardwoodLumber, Res.Leather, Res.Flax, Res.Feathers, Res.Sticks, Res.Flint]) pool[r] = 20;
    pool[Res.Venison] = 200;
    const barracks = built(s, BuildingKind.Barracks);
    produce(s, barracks, troopProduct(Troop.Close, 2, 0));
    countsDownExactly(s, barracks);
    const house = bigHouse(s);
    produce(s, house, Product.Worker);
    countsDownExactly(s, house);
  });

  it('counts research down at the lodge\'s pace, four quarters a step at a Scholar\'s Lodge', () => {
    const s = createWorld(1, { peaceful: true });
    const lodge = built(s, BuildingKind.ScholarsLodge);
    built(s, BuildingKind.Forge);
    const p = s.players[0]!;
    p.pool[Res.CopperIngot] = 10;
    p.pool[Res.TinIngot] = 2;
    p.made |= Made.TinIngot;
    produce(s, lodge, RESEARCH_PRODUCT + Research.Bronze);
    const h = queueHead(s, lodge)!;
    // The whole is in quarters; the steps left are the quarters left over four, rounded up.
    expect(h.whole).toBe(productSpec(RESEARCH_PRODUCT + Research.Bronze).steps * 4);
    expect(h.stepsLeft).toBe(Math.ceil((h.whole - h.done) / 4));
    countsDownExactly(s, lodge);
    expect(p.research & (1 << Research.Bronze)).not.toBe(0);
  });

  it('counts a Forge\'s smelting down at the crafting pace, with no workers (Patch 2)', () => {
    const s = createWorld(1, { peaceful: true });
    const forge = built(s, BuildingKind.Forge);
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 40;
    pool[Res.Charcoal] = 20;
    pool[Res.HardwoodLumber] = 20;
    const copper = RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Copper ingot');
    produce(s, forge, copper);
    expect(workersAt(s, forge)).toBe(0);
    // The step that queues it already works it: nothing waits for hands.
    expect(forge.queue[0]!.progress).toBe(CRAFT_PACE);
    expect(queueHead(s, forge)!.stepsLeft).toBe(Math.ceil((productSpec(copper).steps - CRAFT_PACE) / CRAFT_PACE));
    countsDownExactly(s, forge);
  });

  it('is on hold (0 steps left) while nothing moves the item: no supply (Patch 2: crafting never waits for hands)', () => {
    // Ten units fill the Big House's supply: a new worker waits at its first step.
    const s = createWorld(1, { playerUnits: 10, warriors: 0, peaceful: true });
    const house = bigHouse(s);
    produce(s, house, Product.Worker);
    expect(supplyUsed(s, 0)).toBe(supplyCap(s, 0));
    expect(queueHead(s, house)!.stepsLeft).toBe(0);
    run(s, 20);
    expect(house.queue[0]!.progress).toBe(0);
    expect(queueHead(s, house)!.stepsLeft).toBe(0);

    const shop = built(s, BuildingKind.Workshop);
    produce(s, shop, RECIPE_PRODUCT + RECIPES.findIndex((r) => r.name === 'Planks from softwood'));
    expect(queueHead(s, shop)!.stepsLeft).toBeGreaterThan(0);
    const before = shop.queue[0]!.progress;
    run(s, 20);
    expect(shop.queue[0]!.progress).toBe(before + 20 * CRAFT_PACE);
  });
});
