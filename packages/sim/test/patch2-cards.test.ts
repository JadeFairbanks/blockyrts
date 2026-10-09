// Patch 2's training cards (round 2b): the Magi Sanctum trains mages with
// their wand and robe picked, tiers 1 to 6, defaulting to the best the stock
// pays for with the wand first; every card's padlock is a sim order, kept
// per building and saved with the game; the Big House has no cards and
// takes no lock.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  buildingSpec,
  createWorld,
  deserializeState,
  FOODS,
  hashState,
  mageDefault,
  mageLock,
  mageMaxMana,
  mageOf,
  mageOffered,
  mageProduct,
  mageSchoolsAt,
  MANA_SCALE,
  placeBuilding,
  placementBlocked,
  Product,
  productProblem,
  productsOf,
  Res,
  ROBE_GEAR,
  School,
  serializeState,
  step,
  troopDefault,
  troopOf,
  Troop,
  troopProduct,
  UnitKind,
  WAND_GEAR,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const SEC = 20;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A finished building of a kind near the Big House, on the first free spot. */
function built(s: SimState, kind: number): Building {
  const h = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, h.x + 16 + dx, h.z + dz) === Blocked.None) return placeBuilding(s, 0, kind, 0, h.x + 16 + dx, h.z + dz, true);
      }
    }
  }
  throw new Error('no free spot');
}

/** Everything a kit tier can need: every research, the best forge and the top main base level, whatever the game counts. */
function everythingKnown(s: SimState): void {
  s.players[0]!.research = 0x7fffffff;
  const forge = built(s, BuildingKind.Forge);
  forge.level = buildingSpec(BuildingKind.Forge).levels.length;
  bigHouse(s).level = buildingSpec(BuildingKind.MainBase).levels.length;
}

function mages(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mage) out.push(i);
  return out;
}

describe('Patch 2: the Magi Sanctum\'s cards', () => {
  it('offers support and battle mages with wands and robes 1 to 6, and keeps the main base\'s mages apart', () => {
    const s = createWorld(1, { peaceful: true });
    const sanctum = built(s, BuildingKind.MagiSanctum);
    expect(mageSchoolsAt(sanctum)).toEqual([School.Support, School.Battle]);
    expect(mageSchoolsAt(bigHouse(s))).toEqual([]);
    expect(mageOffered(sanctum, School.Battle, 6, 6)).toBe(true);
    expect(mageOffered(sanctum, School.Battle, 0, 1)).toBe(false);
    expect(mageOffered(sanctum, School.Support, 1, 7)).toBe(false);
    // The cards replace the plain buttons: the Sanctum no longer lists the hazel-and-homespun products.
    expect(productsOf(sanctum)).not.toContain(Product.SupportMage);
    expect(productsOf(sanctum)).not.toContain(Product.BattleMage);
    // The product keeps the school and both tiers, and is not mistaken for a troop.
    const p = mageProduct(School.Support, 4, 2);
    expect(mageOf(p)).toEqual({ school: School.Support, w: 4, a: 2 });
    expect(troopOf(p)).toBeUndefined();
    expect(mageOf(troopProduct(Troop.Cavalry, 8, 8))).toBeUndefined();
    expect(productProblem(s, bigHouse(s), p)).toBe('This building cannot make that.');
  });

  it('trains a mage with the wand and robe picked, paying for both', () => {
    const s = createWorld(1, { peaceful: true });
    everythingKnown(s);
    const b = built(s, BuildingKind.MagiSanctum);
    const p = s.players[0]!;
    // A copper-tipped wand (5 sticks, 1 copper ingot) and a leather-trimmed robe (3 flax, 1 leather).
    p.pool[Res.Sticks] = 5;
    p.pool[Res.CopperIngot] = 1;
    p.pool[Res.Flax] = 3;
    p.pool[Res.Leather] = 1;
    p.pool[Res.Venison] = 200;
    const product = mageProduct(School.Support, 2, 2);
    expect(productProblem(s, b, product)).toBe('');
    const food = (): number => FOODS.reduce<number>((n, f) => n + p.pool[f]!, 0);
    const before = food();
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product, count: 1 }]);
    expect([p.pool[Res.Sticks], p.pool[Res.CopperIngot], p.pool[Res.Flax], p.pool[Res.Leather]]).toEqual([0, 0, 0, 0]);
    expect(food()).toBeLessThan(before);
    // 60 s of training and the kit's 20 s and 20 s.
    for (let k = 0; k < 100 * SEC + 5 && mages(s).length === 0; k++) step(s);
    const [m] = mages(s);
    expect(m).toBeDefined();
    const e = s.entities;
    expect(e.school[m!]).toBe(School.Support);
    expect([e.wTier[m!], e.aTier[m!]]).toEqual([2, 2]);
    expect([e.weapon[m!], e.armour[m!]]).toEqual([WAND_GEAR[2], ROBE_GEAR[2]]);
    expect(e.mana[m!]).toBe(mageMaxMana(1, 2));
    expect(e.mana[m!]).toBeGreaterThan(90 * MANA_SCALE);
  });

  it('defaults to the best the stock pays for, the wand first', () => {
    const s = createWorld(1, { peaceful: true });
    everythingKnown(s);
    const b = built(s, BuildingKind.MagiSanctum);
    const pool = s.players[0]!.pool;
    pool.fill(0);
    for (const r of [Res.HardwoodLumber, Res.SteelIngot, Res.Flax, Res.HardenedLeather, Res.CopperIngot, Res.Sticks]) pool[r] = 10;
    // 3 mana crystals: the crystal staff takes 2, so the robe that fits is the warded robe (1), not the vestments (2).
    pool[Res.ManaCrystal] = 3;
    expect(mageDefault(s, b, School.Battle)).toEqual({ w: 5, a: 4 });
    // 1 crystal: no crystal staff, so the copper-tipped wand, and the warded robe takes the crystal.
    pool[Res.ManaCrystal] = 1;
    expect(mageDefault(s, b, School.Battle)).toEqual({ w: 2, a: 4 });
    // Nothing at all: the lowest tiers, which then wait for the goods.
    pool.fill(0);
    expect(mageDefault(s, b, School.Battle)).toEqual({ w: 1, a: 1 });
  });

  it('keeps a padlock per card, saved with the game; the Big House takes none', () => {
    const s = createWorld(1, { peaceful: true });
    const sanctum = built(s, BuildingKind.MagiSanctum);
    const barracks = built(s, BuildingKind.Barracks);
    const base = bigHouse(s);
    expect(mageLock(School.Support)).toBe(6);
    expect(mageLock(School.Battle)).toBe(7);
    run(s, 1, [
      { kind: 'troopLock', player: 0, building: sanctum.id, troop: mageLock(School.Battle), lock: 1 + 3 * 10 + 2 },
      { kind: 'troopLock', player: 0, building: barracks.id, troop: Troop.Long, lock: 1 + 4 * 10 + 1 },
      // Refused: tiers the card does not have, a mage card at the Barracks, any lock at the Big House.
      { kind: 'troopLock', player: 0, building: sanctum.id, troop: mageLock(School.Support), lock: 1 + 0 * 10 + 1 },
      { kind: 'troopLock', player: 0, building: barracks.id, troop: mageLock(School.Support), lock: 1 + 1 * 10 + 1 },
      { kind: 'troopLock', player: 0, building: base.id, troop: Troop.Close, lock: 1 + 1 * 10 + 1 },
    ]);
    expect(sanctum.locks[mageLock(School.Battle)]).toBe(33);
    expect(sanctum.locks[mageLock(School.Support)] ?? 0).toBe(0);
    expect(barracks.locks[Troop.Long]).toBe(42);
    expect(barracks.locks[mageLock(School.Support)] ?? 0).toBe(0);
    expect(base.locks[Troop.Close] ?? 0).toBe(0);
    // A locked card trains its kit whatever the stock.
    expect(mageDefault(s, sanctum, School.Battle)).toEqual({ w: 3, a: 2 });
    expect(troopDefault(s, barracks, Troop.Long)).toEqual({ w: 4, a: 1, s: 0 });
    // Close melee's padlock keeps its shield too (Patch 5): 1 + shield x 100 + weapon x 10 + armour.
    run(s, 1, [{ kind: 'troopLock', player: 0, building: barracks.id, troop: Troop.Close, lock: 1 + 3 * 100 + 4 * 10 + 1 }]);
    expect(troopDefault(s, barracks, Troop.Close)).toEqual({ w: 4, a: 1, s: 3 });
    // Saved and loaded: the padlocks come back, and the game is the same.
    const loaded = deserializeState(serializeState(s));
    expect(hashState(loaded)).toBe(hashState(s));
    expect(loaded.buildings.list.find((b) => b.id === sanctum.id)!.locks[mageLock(School.Battle)]).toBe(33);
    // Picking another tier on a locked card moves the lock; the padlock alone opens it.
    run(s, 1, [{ kind: 'troopLock', player: 0, building: sanctum.id, troop: mageLock(School.Battle), lock: 1 + 6 * 10 + 6 }]);
    expect(mageDefault(s, sanctum, School.Battle)).toEqual({ w: 6, a: 6 });
    run(s, 1, [{ kind: 'troopLock', player: 0, building: sanctum.id, troop: mageLock(School.Battle), lock: 0 }]);
    expect(sanctum.locks[mageLock(School.Battle)]).toBe(0);
  });
});
