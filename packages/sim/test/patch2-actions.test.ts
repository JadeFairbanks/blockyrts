// Jade's Patch 2 action menu rules in the sim: Attack used on a unit always
// attacks, a spell used on a unit always casts (but never a heal on an enemy),
// Upgrade equipment as one command, and the timed actions (tinkering) that
// eating and upgrading sit down for.
import { describe, expect, it } from 'vitest';
import {
  addMage,
  addMob,
  addWarrior,
  BuildingKind,
  buildingCentre,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  DUSK_STEPS,
  deserializeState,
  EAT_STEPS,
  hashState,
  kitHolder,
  launch,
  Line,
  MANA_SCALE,
  Mob,
  onUnitHurt,
  OrderKind,
  pendingKitUp,
  Res,
  School,
  serializeState,
  setMageRank,
  Shot,
  Spell,
  step,
  tinkering,
  tinkerProgress,
  Troop,
  UnitKind,
  WU_PER_METRE,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const SEC = 20;

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

function home(s: SimState): [number, number] {
  return buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
}

function worker(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) return i;
  throw new Error('no worker');
}

describe("Attack on a unit always attacks (Jade's Patch 2)", () => {
  it('sends warriors at one of their own workers when told to, and they hurt it', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = home(s);
    const w = addWarrior(s, 0, hx + 20 * M, hz, Troop.Close, 1);
    const target = worker(s);
    e.x[target] = hx + 22 * M;
    e.z[target] = hz;
    const hp = e.hp[target]!;
    run(s, 1, [{ kind: 'attack', player: 0, units: [e.id[w]!], target: e.id[target]! }]);
    expect(e.queue[w]![0]).toMatchObject({ t: 'attack', id: e.id[target] });
    runUntil(s, () => e.hp[target]! < hp, 20 * SEC);
  });

  it('lets an aimed shot hit the friendly unit it was aimed at, and fly past every other one', () => {
    for (const aimed of [true, false]) {
      const s = createWorld(1, { peaceful: true });
      const e = s.entities;
      const [hx, hz] = home(s);
      const archer = addWarrior(s, 0, hx + 20 * M, hz, Troop.Ranger, 1);
      const friend = addWarrior(s, 0, hx + 30 * M, hz, Troop.Close, 1);
      const hp = e.hp[friend]!;
      launch(s, archer, e.x[archer]!, e.y[archer]! + M, e.z[archer]!, e.x[friend]!, e.y[friend]! + M, e.z[friend]!, Shot.Arrow, 10, 0, 100, aimed ? e.id[friend]! : 0);
      run(s, 3 * SEC);
      expect(s.projectiles.length).toBe(0);
      expect(e.hp[friend]! < hp, aimed ? 'aimed at it' : 'not aimed at it').toBe(aimed);
    }
  });
});

describe("spells on a unit always cast, but never a heal on an enemy (Jade's Patch 2)", () => {
  it('casts an Arcane Bolt on your own warrior, and no Heal on a monster', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = home(s);
    const w = addWarrior(s, 0, hx + 20 * M, hz, Troop.Close, 1);
    const battle = addMage(s, 0, hx + 26 * M, hz, School.Battle);
    const support = addMage(s, 0, hx + 26 * M, hz + 2 * M, School.Support);
    for (const m of [battle, support]) {
      setMageRank(s, m, 3);
      e.mana[m] = 100 * MANA_SCALE;
    }
    const hp = e.hp[w]!;
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[battle]!], spell: Spell.ArcaneBolt, target: e.id[w]!, x: 0, z: 0, auto: 0 }]);
    runUntil(s, () => e.hp[w]! < hp, 10 * SEC);

    // A monster at night (by day it would fade), half hurt: Heal told to land on it never does.
    s.step = CYCLE_STEPS + DAY_STEPS + DUSK_STEPS;
    const zid = e.id[addMob(s, Mob.Zombie, 0, hx + 60 * M, hz, 0)]!;
    const z = e.indexOf(zid);
    e.hp[z] = Math.floor(e.maxHp[z]! / 2);
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[support]!], spell: Spell.Heal, target: zid, x: 0, z: 0, auto: 0 }]);
    for (let k = 0; k < 3 * SEC; k++) {
      step(s);
      const j = e.indexOf(zid);
      if (j >= 0) expect(e.healLeft[j]).toBe(0);
    }
    expect(e.queue[support]!.some((o) => o.t === 'cast')).toBe(false);
  });
});

describe("Upgrade equipment (Jade's Patch 2)", () => {
  it('gives every unit its weapon first, then armour, then a shield from what is left to the highest rank, and pays as planned', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [hx, hz] = home(s);
    const low = addWarrior(s, 0, hx, hz + 12 * M, Troop.Close, 1);
    const hero = addWarrior(s, 0, hx + 2 * M, hz + 12 * M, Troop.Close, 1);
    e.rank[hero] = 3;
    pool.fill(0);
    // Two flint hand-axes (2 sticks, 1 flint each), one leather jerkin (3 leather) and a wooden shield (3 planks, 1 leather), its own slot from Patch 5.
    pool[Res.Sticks] = 4;
    pool[Res.Flint] = 2;
    pool[Res.Leather] = 4;
    pool[Res.Planks] = 3;
    run(s, 1, [{ kind: 'upgradeEquipment', player: 0, units: [e.id[low]!, e.id[hero]!] }]);
    expect([pool[Res.Sticks], pool[Res.Flint], pool[Res.Leather], pool[Res.Planks]]).toEqual([0, 0, 0, 0]);
    expect(pendingKitUp(s, low, Line.Weapon)).toMatchObject({ to: 2 });
    expect(pendingKitUp(s, low, Line.Armour)).toBeUndefined();
    expect(pendingKitUp(s, hero, Line.Weapon)).toMatchObject({ to: 2 });
    expect(pendingKitUp(s, hero, Line.Armour)).toMatchObject({ to: 1 });
    expect(pendingKitUp(s, hero, Line.Shield)).toMatchObject({ to: 1 });
    expect(pendingKitUp(s, low, Line.Shield)).toBeUndefined();
    // The weapon goes on first.
    expect(e.queue[hero]![0]).toMatchObject({ t: 'kitUp', line: Line.Weapon });
    // They sit tinkering beside the building with the bar over their heads.
    let sat = false;
    runUntil(
      s,
      () => {
        if (tinkering(s, hero) && e.order[hero] === OrderKind.Tinker && tinkerProgress(s, hero)[1] > 0) sat = true;
        return e.wTier[low] === 2 && e.wTier[hero] === 2 && e.aTier[hero] === 1 && e.sTier[hero] === 1;
      },
      6000,
    );
    expect(sat).toBe(true);
    expect(e.aTier[low]).toBe(0);
    expect(kitHolder(s, hero)).toMatchObject({ w: 2, a: 1, s: 1 });
    // Each cudgel goes to stock as an item when the new weapon goes on (Patch 5, GP-3).
    expect([pool[Res.Sticks], pool[Res.WoodenCudgel]]).toEqual([0, 2]);
  });

  it('pays for nothing and says why when the stock is short', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [hx, hz] = home(s);
    const w = addWarrior(s, 0, hx, hz + 12 * M, Troop.Close, 1);
    pool.fill(0);
    const before = hashState(s);
    run(s, 1, [{ kind: 'upgradeEquipment', player: 0, units: [e.id[w]!] }]);
    expect(before).not.toBe(hashState(s));
    expect(e.queue[w]!.some((o) => o.t === 'kitUp')).toBe(false);
    expect(pool.every((n) => n === 0)).toBe(true);
  });
});

describe("seated meals (Jade's Patch 2: eating is a timed action)", () => {
  /** A hurt warrior sent to eat, stepped until it sits down; `meals` counts the meals it paid for at the table (its "I'm eating my fill of ..." line). */
  function hungry(): { s: SimState; i: number; go: (n: number) => void; meals: () => number } {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = home(s);
    const i = addWarrior(s, 0, hx + 10 * M, hz, Troop.Close, 1);
    const id = e.id[i]!;
    e.hp[i] = Math.floor(e.maxHp[i]! / 4);
    let meals = 0;
    const count = (): void => {
      meals += s.events.filter((v) => v.kind === 'speech' && v.speaker === id && v.text.startsWith("I'm eating my fill of ")).length;
    };
    step(s, [{ kind: 'eat', player: 0, units: [id], building: 0 }]);
    count();
    for (let k = 0; k < 30 * SEC && !tinkering(s, i); k++) {
      step(s);
      count();
    }
    expect(tinkering(s, i)).toBe(true);
    const go = (n: number): void => {
      for (let k = 0; k < n; k++) {
        step(s);
        count();
      }
    };
    return { s, i, go, meals: () => meals };
  }

  it('sits for 10 s with the bar over its head, paying for one meal, and heals', () => {
    const { s, i, go, meals } = hungry();
    const e = s.entities;
    expect(e.order[i]).toBe(OrderKind.Tinker);
    expect(tinkerProgress(s, i)).toEqual([1, EAT_STEPS]);
    expect(meals()).toBe(1);
    const hp = e.hp[i]!;
    go(EAT_STEPS - 2);
    expect(tinkerProgress(s, i)).toEqual([EAT_STEPS - 1, EAT_STEPS]);
    go(2);
    expect(tinkering(s, i)).toBe(false);
    expect(e.queue[i]!.some((o) => o.t === 'eat')).toBe(false);
    expect(e.hp[i]!).toBeGreaterThan(hp);
    go(2 * SEC);
    expect(meals()).toBe(1);
  });

  it('gets up at once when an enemy hits it, its health still coming back, and does not pay again', () => {
    const { s, i, go, meals } = hungry();
    const e = s.entities;
    const zombie = addMob(s, Mob.Zombie, 0, e.x[i]! + 30 * M, e.z[i]!, 0);
    onUnitHurt(s, i, e.id[zombie]!, true);
    expect(tinkering(s, i)).toBe(false);
    expect(e.queue[i]!.some((o) => o.t === 'eat')).toBe(false);
    expect(e.mendLeft[i]!).toBeGreaterThan(0);
    go(2 * SEC);
    expect(tinkering(s, i)).toBe(false);
    expect(meals()).toBe(1);
  });
});

describe("snapshots keep Patch 2's timed actions and aimed shots", () => {
  it('saves and loads a unit mid-meal and a shot in the air, and both go on the same', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const [hx, hz] = home(s);
    const i = addWarrior(s, 0, hx + 10 * M, hz, Troop.Close, 1);
    e.hp[i] = Math.floor(e.maxHp[i]! / 4);
    run(s, 1, [{ kind: 'eat', player: 0, units: [e.id[i]!], building: 0 }]);
    runUntil(s, () => tinkering(s, i), 30 * SEC);
    run(s, 40);
    const archer = addWarrior(s, 0, hx + 20 * M, hz + 20 * M, Troop.Ranger, 1);
    const friend = addWarrior(s, 0, hx + 34 * M, hz + 20 * M, Troop.Close, 1);
    launch(s, archer, e.x[archer]!, e.y[archer]! + M, e.z[archer]!, e.x[friend]!, e.y[friend]! + M, e.z[friend]!, Shot.Arrow, 10, 0, 100, e.id[friend]!);
    step(s);
    expect(s.projectiles[0]!.mark).toBe(e.id[friend]);
    const copy = deserializeState(serializeState(s));
    expect(tinkerProgress(copy, i)).toEqual(tinkerProgress(s, i));
    expect(copy.projectiles[0]!.mark).toBe(e.id[friend]);
    expect(hashState(copy)).toBe(hashState(s));
    run(s, EAT_STEPS);
    run(copy, EAT_STEPS);
    expect(hashState(copy)).toBe(hashState(s));
    expect(e.hp[friend]!).toBeLessThan(e.maxHp[friend]!);
  });
});
