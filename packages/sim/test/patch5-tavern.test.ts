// Patch 5 (Jade, GP-19 to GP-21): the Tavern serves food while it is open for
// business and turns 18 food into a silver ingot, held to 3 decimals until
// Withdraw funds takes the whole ingots; it hires the Dreadnought for 100
// food and 15 gold ingots' worth of gold and silver (a gold is worth 7
// silver; a little over, never under), at most 1 at a tier 3 main base and 3
// at tier 4. He strikes a smash, then a sweep, by turns. He gets about by his
// own gait (decisions 3.8): 20% slower, never climbing, jumping 1.5 m, and
// running at double the food.
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  createWorld,
  DREADNOUGHT,
  dreadnoughtProduct,
  dreadnoughtProblem,
  Gait,
  gaitOf,
  gaitSpec,
  Hit,
  isDreadnought,
  meleeOf,
  moveSpeed,
  nextBlow,
  paysForDreadnought,
  placeBuilding,
  productProblem,
  Res,
  RESOURCES,
  SECOND_BLOW,
  Slot,
  step,
  supplyUsed,
  tavernInfo,
  UnitKind,
  WU_PER_METRE,
  WU_PER_TERRAIN_UNIT,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

/** A peaceful world, its main base at a tier, food and nothing else in the stock, and a finished Tavern beside the main base. */
function setup(tier: number): { s: SimState; tavern: Building } {
  const s = createWorld(1, { peaceful: true });
  for (const r of RESOURCES) if (r.nutrition === 0) s.players[0]!.pool[r.id] = 0;
  s.players[0]!.pool[Res.FarmFare] = 2000;
  const base = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  base.level = tier;
  const tavern = placeBuilding(s, 0, BuildingKind.Tavern, 0, base.x + 20, base.z, true);
  return { s, tavern };
}

function dreadnoughts(s: SimState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.entities.count; i++) if (s.entities.owner[i] === 0 && s.entities.hp[i]! > 0 && isDreadnought(s.entities, i)) out.push(i);
  return out;
}

describe('Patch 5: the Tavern', () => {
  it('serves a food every 3 s while open, makes a silver ingot of 18, and Withdraw funds takes only the whole ingots', () => {
    const { s, tavern } = setup(3);
    run(s, 1, [{ kind: 'tavernOpen', player: 0, building: tavern.id, open: 1 }]);
    let steps = 1;
    while (tavernInfo(tavern)!.food < 19) {
      step(s);
      steps++;
    }
    expect(steps).toBe(19 * 60);
    expect(tavernInfo(tavern)).toMatchObject({ open: true, whole: 1, thousandths: 55, madeWhole: 1, madeThousandths: 55 });
    const silver = s.players[0]!.pool[Res.Silver]!;
    run(s, 1, [{ kind: 'tavernWithdraw', player: 0, building: tavern.id }]);
    expect(s.players[0]!.pool[Res.Silver]).toBe(silver + 1);
    expect(tavernInfo(tavern)).toMatchObject({ whole: 0, thousandths: 55, madeWhole: 1, food: 19 });
    // Closed, it serves nothing more.
    run(s, 1, [{ kind: 'tavernOpen', player: 0, building: tavern.id, open: 0 }]);
    run(s, 200);
    expect(tavernInfo(tavern)).toMatchObject({ open: false, food: 19 });
  });
});

describe('Patch 5: the Dreadnought', () => {
  it('takes 15 gold ingots\' worth of gold and silver, a little over but never under', () => {
    expect(paysForDreadnought(15, 0)).toBe(true);
    expect(paysForDreadnought(0, 105)).toBe(true);
    expect(paysForDreadnought(14, 7)).toBe(true);
    expect(paysForDreadnought(10, 36)).toBe(true);
    expect(paysForDreadnought(14, 6)).toBe(false);
    expect(paysForDreadnought(0, 105 + DREADNOUGHT.overSilver)).toBe(true);
    expect(paysForDreadnought(0, 106 + DREADNOUGHT.overSilver)).toBe(false);
    expect(paysForDreadnought(16, 0)).toBe(false);
  });

  it('is hired for 100 food and the ingots, takes 8 supply, and is capped by the main base tier', () => {
    const tier2 = setup(2);
    expect(dreadnoughtProblem(tier2.s, 0)).toBe('Needs a tier 3 main base.');
    const { s, tavern } = setup(3);
    const pool = s.players[0]!.pool;
    pool[Res.Gold] = 10;
    pool[Res.Silver] = 40;
    const supply = supplyUsed(s, 0);
    run(s, 1, [{ kind: 'produce', player: 0, building: tavern.id, product: dreadnoughtProduct(10, 35), count: 1 }]);
    expect([pool[Res.Gold], pool[Res.Silver]]).toEqual([0, 5]);
    // The one being hired counts against the cap.
    expect(productProblem(s, tavern, dreadnoughtProduct(0, 105), 0)).toMatch(/^At most 1 Dreadnought at this main base tier/);
    run(s, DREADNOUGHT.trainS * 20 + 40);
    const [i] = dreadnoughts(s);
    expect(i).toBeDefined();
    expect([s.entities.hp[i!], s.entities.maxHp[i!]]).toEqual([DREADNOUGHT.hp, DREADNOUGHT.hp]);
    expect(supplyUsed(s, 0) - supply).toBe(DREADNOUGHT.supply);
    expect(dreadnoughtProblem(s, 0)).toMatch(/^At most 1 Dreadnought/);
    s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!.level = 4;
    expect(dreadnoughtProblem(s, 0)).toBe('');
  });

  it('smashes one, then sweeps everything in front of him, by turns', () => {
    const { s, tavern } = setup(4);
    s.players[0]!.pool[Res.Gold] = 15;
    run(s, 1, [{ kind: 'produce', player: 0, building: tavern.id, product: dreadnoughtProduct(15, 0), count: 1 }]);
    run(s, DREADNOUGHT.trainS * 20 + 40);
    const i = dreadnoughts(s)[0]!;
    const e = s.entities;
    e.atkWith[i] = nextBlow(s, i);
    expect(e.atkWith[i]).toBe(Slot.Weapon);
    expect(meleeOf(s, i)).toMatchObject({ damage: 140, hit: Hit.Stab });
    e.atkWith[i] = nextBlow(s, i);
    expect(e.atkWith[i]).toBe(SECOND_BLOW);
    expect(meleeOf(s, i)).toMatchObject({ damage: 70, hit: Hit.Sweep });
    expect(nextBlow(s, i)).toBe(Slot.Weapon);
  });

  it('walks a fifth slower than a warrior, never climbs, jumps 1.5 m and pays double for running', () => {
    const { s, tavern } = setup(3);
    s.players[0]!.pool[Res.Gold] = 15;
    run(s, 1, [{ kind: 'produce', player: 0, building: tavern.id, product: dreadnoughtProduct(15, 0), count: 1 }]);
    run(s, DREADNOUGHT.trainS * 20 + 40);
    const i = dreadnoughts(s)[0]!;
    const e = s.entities;
    const warrior = [...Array(e.count).keys()].find((k) => e.owner[k] === 0 && e.kind[k] === UnitKind.Warrior && !dreadnoughts(s).includes(k))!;
    expect(gaitOf(s, i)).toBe(Gait.Dreadnought);
    const g = gaitSpec(gaitOf(s, i));
    expect(g.climb).toBe(0);
    expect(Math.abs(g.jump * WU_PER_TERRAIN_UNIT - 1.5 * WU_PER_METRE)).toBeLessThan(WU_PER_TERRAIN_UNIT);
    expect(g.runFood).toBe(2 * gaitSpec(Gait.Fighter).runFood);
    expect(moveSpeed(s, i, false)).toBe(Math.floor((moveSpeed(s, warrior, false) * 8) / 10));
  });
});
