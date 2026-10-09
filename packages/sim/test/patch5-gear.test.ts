import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  ARMOUR_KITS,
  Blocked,
  BuildingKind,
  CLOSE_GEAR,
  CLOSE_KITS,
  createWorld,
  gearSpec,
  giveWaveGear,
  Line,
  LONG_KITS,
  OBSIDIAN_AXE_GEAR,
  piecesCost,
  pieceSteps,
  placeBuilding,
  placementBlocked,
  planPieces,
  queueHead,
  RANGER_KITS,
  RECIPE_PRODUCT,
  RECIPES,
  Res,
  SHIELD_KITS,
  stackLeft,
  step,
  STEPS_PER_SECOND,
  techOf,
  trainSteps,
  Troop,
  troopProduct,
  UnitKind,
  upgradeSteps,
  upgradeTarget,
  waveGearTier,
  type Building,
  type KitHolder,
  type Order,
  type PendingSpawn,
  type Piece,
  type SimState,
} from '../src/index.ts';

// Patch 5's gear (Jade's GP-1, GP-3, GP-26, BL-11 and the unused goods): items, scrapping, shields, drops.

const SEC = STEPS_PER_SECOND;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A finished building near the Big House. */
function built(s: SimState, kind: number): Building {
  const h = bigHouse(s);
  for (let r = 8; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, h.x + dx, h.z + dz) === Blocked.None) return placeBuilding(s, 0, kind, 0, h.x + dx, h.z + dz, true);
      }
    }
  }
  throw new Error('no free spot');
}

const close = (w: number, a = 0, sh = 0): KitHolder => ({ kind: 'warrior', troop: Troop.Close, w, a, s: sh, t: 0 });

describe('gear as items (GP-1, GP-3)', () => {
  it('puts a ready item on first, at no cost, in a fifth of the time and whatever is researched; a higher tier made from scratch wins', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    pool.fill(0);
    // A steel side-sword dropped by a wave, with no Forge or research for steel.
    pool[Res.SteelSideSword] = 1;
    const t = upgradeTarget(close(1), Line.Weapon, true, pool, techOf(s, 0));
    expect(t).toEqual({ to: 7, plan: { cost: [[Res.SteelSideSword, 1]], ways: expect.any(Number) } });
    if (!('to' in t)) return;
    expect(upgradeSteps(close(1), Line.Weapon, 7, t.plan.ways)).toBe(pieceSteps(CLOSE_KITS[7]!, true));
    expect(pieceSteps(CLOSE_KITS[7]!, true)).toBe((CLOSE_KITS[7]!.timeS * SEC) / 5);
    // A flint hand-axe in stock, but the materials for a copper short sword and a Forge: the higher tier is made.
    pool.fill(0);
    pool[Res.FlintHandAxe] = 1;
    pool[Res.CopperIngot] = 1;
    pool[Res.SoftwoodLumber] = 1;
    built(s, BuildingKind.Forge);
    expect(upgradeTarget(close(1), Line.Weapon, true, pool, techOf(s, 0))).toMatchObject({ to: 3, plan: { cost: [[Res.CopperIngot, 1], [Res.SoftwoodLumber, 1]] } });
  });

  it('trains a troop with the items in stock, each such piece in a fifth of its time', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    pool[Res.Venison] = 200;
    pool[Res.IronCoatOfPlates] = 1;
    pool[Res.Sticks] = 10;
    const barracks = built(s, BuildingKind.Barracks);
    // Iron armour needs a tier 3 main base to make, but a coat of plates in stock goes on.
    const product = troopProduct(Troop.Close, 1, 6);
    run(s, 1, [{ kind: 'produce', player: 0, building: barracks.id, product, count: 1 }]);
    expect(barracks.queue.length).toBe(1);
    expect(pool[Res.IronCoatOfPlates]).toBe(0);
    const head = barracks.queue[0]!;
    expect(trainSteps(head)).toBe((45 + CLOSE_KITS[1]!.timeS) * SEC + pieceSteps(ARMOUR_KITS[6]!, true));
    expect(queueHead(s, barracks)!.whole).toBe(trainSteps(head));
  });

  it('never makes training low and upgrading quicker than training high (BL-11)', () => {
    const ladders: ReadonlyArray<readonly Piece[]> = [CLOSE_KITS, LONG_KITS, RANGER_KITS, ARMOUR_KITS, SHIELD_KITS];
    const lineOf = [Line.Weapon, Line.Weapon, Line.Weapon, Line.Armour, Line.Shield];
    const troopOf = [Troop.Close, Troop.Long, Troop.Ranger, Troop.Close, Troop.Close];
    ladders.forEach((ladder, k) => {
      for (let lo = 1; lo < ladder.length; lo++) {
        for (let hi = lo + 1; hi < ladder.length; hi++) {
          const h: KitHolder = { kind: 'warrior', troop: troopOf[k]!, w: 1, a: 0, s: 0, t: 0 };
          if (lineOf[k] === Line.Weapon) h.w = lo;
          else if (lineOf[k] === Line.Armour) h.a = lo;
          else h.s = lo;
          const upgraded = pieceSteps(ladder[lo]!, false) + upgradeSteps(h, lineOf[k]!, hi);
          expect(upgraded, `${ladder[lo]!.name} to ${ladder[hi]!.name}`).toBeGreaterThanOrEqual(pieceSteps(ladder[hi]!, false));
        }
      }
    });
  });

  it('scraps a stack of items in one queue slot, giving each one\'s materials as it finishes, and more join it', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const workshop = built(s, BuildingKind.Workshop);
    const scrap = RECIPES.find((r) => r.scrap === Res.BronzeShortsword)!;
    expect(scrap.outputs).toEqual([[Res.BronzeIngot, 2], [Res.SoftwoodLumber, 1], [Res.Leather, 1]]);
    pool[Res.BronzeShortsword] = 3;
    const bronze = pool[Res.BronzeIngot]!;
    run(s, 1, [{ kind: 'produce', player: 0, building: workshop.id, product: RECIPE_PRODUCT + scrap.id, count: 10 }]);
    expect(workshop.queue.length).toBe(1);
    expect(stackLeft(workshop.queue[0]!)).toBe(3);
    expect(pool[Res.BronzeShortsword]).toBe(0);
    // 10 s each at the Workshop.
    run(s, 10 * SEC);
    expect(stackLeft(workshop.queue[0]!)).toBe(2);
    expect(pool[Res.BronzeIngot]).toBe(bronze + 2);
    // One more scrapped joins the stack in its slot.
    pool[Res.BronzeShortsword] = 1;
    run(s, 1, [{ kind: 'produce', player: 0, building: workshop.id, product: RECIPE_PRODUCT + scrap.id, count: 1 }]);
    expect(workshop.queue.length).toBe(1);
    expect(stackLeft(workshop.queue[0]!)).toBe(3);
    // Cancelled: the three not yet scrapped come back.
    run(s, 1, [{ kind: 'cancelProduce', player: 0, building: workshop.id, index: 0 }]);
    expect(workshop.queue.length).toBe(0);
    expect(pool[Res.BronzeShortsword]).toBe(3);
  });

  it('takes spider silk for rope and obsidian for flint, and gives the same kinds back', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    pool.fill(0);
    pool[Res.SpiderSilk] = 1;
    pool[Res.Obsidian] = 1;
    pool[Res.Feathers] = 1;
    pool[Res.HardwoodLumber] = 3;
    const bow = [RANGER_KITS[2]!];
    const plan = planPieces(bow, pool)!;
    expect(plan.cost).toEqual([[Res.Obsidian, 1], [Res.Feathers, 1], [Res.HardwoodLumber, 3], [Res.SpiderSilk, 1]]);
    expect(piecesCost(bow, plan.ways)).toEqual(plan.cost);
  });
});

describe('the obsidian hand-axe', () => {
  it('goes on as itself with the bronze shortsword\'s numbers, stays through other upgrades, goes back to stock as itself, and a troop trained with one holds it', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const w = [...Array(e.count).keys()].find((j) => e.owner[j] === 0 && e.kind[j] === UnitKind.Worker)!;
    const i = addWarrior(s, 0, e.x[w]!, e.z[w]!, Troop.Close, 1);
    const until = (done: () => boolean): void => {
      for (let k = 0; k < 200 * SEC && !done(); k++) step(s);
      expect(done()).toBe(true);
    };
    pool[Res.ObsidianHandAxe] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[i]!], res: Res.ObsidianHandAxe }]);
    until(() => e.wTier[i] === 4);
    expect(e.weapon[i]).toBe(OBSIDIAN_AXE_GEAR);
    expect(gearSpec(OBSIDIAN_AXE_GEAR)).toMatchObject({ name: 'Obsidian hand-axe', tier: 4, melee: gearSpec(CLOSE_GEAR[4]!).melee });
    // New armour leaves the axe in hand.
    const jerkin = ARMOUR_KITS[2]!.items[0]!;
    pool[jerkin] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[i]!], res: jerkin }]);
    until(() => e.aTier[i] === 2);
    expect(e.weapon[i]).toBe(OBSIDIAN_AXE_GEAR);
    // A better sword sends it back to stock as itself, not as a bronze shortsword.
    pool[Res.SteelSideSword] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[i]!], res: Res.SteelSideSword }]);
    until(() => e.wTier[i] === 7);
    expect(e.weapon[i]).toBe(CLOSE_GEAR[7]);
    expect([pool[Res.ObsidianHandAxe], pool[Res.BronzeShortsword]]).toEqual([1, 0]);
    // Trained with it, a new troop holds it too.
    pool[Res.Venison] = 200;
    const barracks = built(s, BuildingKind.Barracks);
    const first = s.nextEntityId;
    run(s, 1, [{ kind: 'produce', player: 0, building: barracks.id, product: troopProduct(Troop.Close, 4, 0), count: 1 }]);
    expect(pool[Res.ObsidianHandAxe]).toBe(0);
    const trained = (): number => [...Array(e.count).keys()].findIndex((j) => e.id[j]! >= first && e.kind[j] === UnitKind.Warrior);
    until(() => trained() >= 0);
    expect([e.wTier[trained()], e.weapon[trained()]]).toEqual([4, OBSIDIAN_AXE_GEAR]);
  });
});

describe('the night waves carry gear (GP-1)', () => {
  it('carry about 0.04 pieces a night per player, of the tier expected by then', () => {
    const s = createWorld(7, { peaceful: true });
    const plan = (): PendingSpawn[] => Array.from({ length: 30 }, (_, k) => ({ at: k, mob: 0, player: 0, group: 1, x: 0, z: 0, placed: 0, role: 0, ax: 0, az: 0, src: 0, gear: 0 }));
    let total = 0;
    for (let night = 1; night <= 100; night++) {
      const p = plan();
      giveWaveGear(s, p, 0, night);
      total += p.filter((x) => x.gear !== 0).length;
    }
    // 0.04 x (1 + 2 + ... + 100) = 202 on average.
    expect(total).toBeGreaterThan(170);
    expect(total).toBeLessThan(235);
    expect([waveGearTier(5), waveGearTier(15), waveGearTier(50)]).toEqual([4, 5, 8]);
  });
});
