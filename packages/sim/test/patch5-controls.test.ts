// Jade's Patch 5, controls and selection (sections 11 and UI-13, UI-14,
// GP-15, GP-25): repairs cost the building's own materials; autorepair and
// Repair all; only as many go into a building as it has room for, the best
// ranged first; shared control covers combat units only; and several
// buildings each train one, as many as the stock pays for.
import { describe, expect, it } from 'vitest';
import {
  addMage,
  addWarrior,
  Blocked,
  BuildingKind,
  buildingWorth,
  commandable,
  createWorld,
  FOODS,
  haveOf,
  levelSpec,
  maxHealth,
  placeBuilding,
  placementBlocked,
  Product,
  repairCost,
  Res,
  School,
  step,
  Troop,
  UnitKind,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

function run(s: SimState, orders: Order[] = [], n = 1): SimEvent[] {
  const heard: SimEvent[] = [];
  step(s, orders);
  heard.push(...s.events);
  for (let k = 1; k < n; k++) {
    step(s);
    heard.push(...s.events);
  }
  return heard;
}

const bigHouse = (s: SimState): Building => s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;

/** A finished building of a kind on the first free spot east of the main base. */
function place(s: SimState, kind: number, from = 12): Building {
  const b = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + from + dx, b.z + dz) === Blocked.None) return placeBuilding(s, 0, kind, 0, b.x + from + dx, b.z + dz, true);
      }
    }
  }
  throw new Error('no free spot');
}

const workers = (s: SimState): number[] => [...Array(s.entities.count).keys()].filter((i) => s.entities.owner[i] === 0 && s.entities.kind[i] === UnitKind.Worker);

describe('repairs (Patch 5, UI-13 and GP-25)', () => {
  it('cost the building\'s own materials for the health restored, many small repairs the same as one, and stop when the stock runs out', () => {
    const worth = [[Res.Stone, 100], [Res.SoftwoodLumber, 7]] as const;
    expect(repairCost(worth, 1000, 0, 1000)).toEqual(worth);
    const sum = [0, 0];
    for (let hp = 0; hp < 1000; hp += 3) for (const [r, n] of repairCost(worth, 1000, hp, Math.min(1000, hp + 3))) sum[r === Res.Stone ? 0 : 1]! += n;
    expect(sum).toEqual([100, 7]);

    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const pool = s.players[0]!.pool;
    const max = maxHealth(b);
    b.hp = max - 200;
    const before = Int32Array.from(pool);
    run(s, [{ kind: 'work', player: 0, units: [s.entities.id[0]!], building: b.id }]);
    for (let k = 0; k < 30000 && b.hp < max; k++) run(s);
    expect(b.hp).toBe(max);
    // A line that takes any lumber is paid from the kinds in stock.
    for (const [r, n] of repairCost(buildingWorth(b), max, max - 200, max)) expect(haveOf(before, r) - haveOf(pool, r)).toBe(n);

    // With nothing in the stock the worker says why and stops.
    b.hp = 10;
    pool.fill(0);
    const heard = run(s, [{ kind: 'work', player: 0, units: [s.entities.id[0]!], building: b.id }], 2000);
    expect(heard.some((ev) => ev.kind === 'alert' && ev.text.startsWith('Not enough'))).toBe(true);
    // Only what a single unit of a material would buy goes up free, as the cost is rounded on the health still missing.
    expect(b.hp).toBeLessThan(10 + 24);
  });

  it('autorepair sends a worker to what is damaged near it and back to its round; Repair all calls the idle first and never a farm\'s workers', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const b = bigHouse(s);
    const [a] = workers(s);
    for (const [r] of buildingWorth(b)) s.players[0]!.pool[r] = 10000;
    b.hp = maxHealth(b) - 300;
    run(s, [{ kind: 'autoRepair', player: 0, units: [e.id[a!]!], on: 1 }, { kind: 'forage', player: 0, units: [e.id[a!]!] }], 12);
    expect(e.autoRepair[a!]).toBe(1);
    // In front of its gathering round, which it goes back to.
    expect(e.queue[a!]![0]?.t).toBe('work');
    expect(e.queue[a!]!.at(-1)?.t).toBe('forage');

    // Repair all: d works a farm and stays; c, idle, repairs and then gathers.
    const s2 = createWorld(1, { peaceful: true });
    const b2 = bigHouse(s2);
    for (const [r] of buildingWorth(b2)) s2.players[0]!.pool[r] = 10000;
    const farm = place(s2, BuildingKind.Farm, 8);
    const [, c2, d2] = workers(s2);
    s2.entities.queue[d2!] = [{ t: 'job', b: farm.id }];
    b2.hp = maxHealth(b2) - 300;
    run(s2, [{ kind: 'repairNearby', player: 0 }]);
    expect(s2.entities.queue[c2!]!.map((o) => o.t)).toEqual(['work', 'forage']);
    expect(s2.entities.queue[d2!]!.map((o) => o.t)).toEqual(['job']);
  });
});

describe('going into buildings (Patch 5, CT-2 and CT-3)', () => {
  it('fills a tower\'s top with the best ranged first, then mages; melee and engines stay out', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const tower = place(s, BuildingKind.Tower);
    const [bx, bz] = [e.x[0]!, e.z[0]!];
    const melee = addWarrior(s, 0, bx, bz, Troop.Close, 2);
    const mage = addMage(s, 0, bx, bz, School.Battle);
    const r1 = addWarrior(s, 0, bx, bz, Troop.Ranger, 1);
    const r3 = addWarrior(s, 0, bx, bz, Troop.Ranger, 3);
    const r2 = addWarrior(s, 0, bx, bz, Troop.Ranger, 2);
    const ids = [melee, mage, r1, r3, r2].map((i) => e.id[i]!);
    run(s, [{ kind: 'enter', player: 0, units: ids, building: tower.id }]);
    const going = [melee, mage, r1, r3, r2].filter((i) => e.queue[i]![0]?.t === 'enter');
    expect(going.sort()).toEqual([mage, r1, r3, r2].sort());
  });

  it('sends only as many workers to a farm as it takes, the nearest, and shares the rest out over the next farm clicked', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const f1 = place(s, BuildingKind.Farm, 8);
    const f2 = place(s, BuildingKind.Farm, -14);
    const four = workers(s);
    const ids = four.map((i) => e.id[i]!);
    const room = levelSpec(BuildingKind.Farm, 1).workers;
    run(s, [
      { kind: 'assign', player: 0, units: ids, building: f1.id, queued: true },
      { kind: 'assign', player: 0, units: ids, building: f2.id, queued: true },
    ]);
    const at = (b: Building): number[] => four.filter((i) => e.queue[i]!.some((o) => o.t === 'job' && o.b === b.id));
    expect(at(f1)).toHaveLength(room);
    expect(at(f2)).toHaveLength(Math.min(room, four.length - room));
    expect(at(f1).some((i) => at(f2).includes(i))).toBe(false);
  });
});

describe('shared control and training (Patch 5, UI-14 and GP-15)', () => {
  it('shares combat units only (not workers or woodsmen), and says once what the stock lacks for several trainings in a step', () => {
    const s = createWorld(1, { peaceful: true, players: 2 });
    const e = s.entities;
    s.players[1]!.share = 1;
    const theirWorker = [...Array(e.count).keys()].find((i) => e.owner[i] === 1 && e.kind[i] === UnitKind.Worker)!;
    const theirTroop = addWarrior(s, 1, e.x[theirWorker]!, e.z[theirWorker]!);
    expect(commandable(s, 0, theirTroop, true)).toBe(true);
    expect(commandable(s, 0, theirWorker, true)).toBe(false);
    // Nor their woodsmen (decisions: "Workers, woodsmen and buildings are no longer shared").
    const theirWoodsman = addWarrior(s, 1, e.x[theirWorker]!, e.z[theirWorker]!, Troop.Woodsman, 1, 0);
    expect(commandable(s, 0, theirWoodsman, true)).toBe(false);

    const b = bigHouse(s);
    for (const r of FOODS) s.players[0]!.pool[r] = 0;
    const train: Order = { kind: 'produce', player: 0, building: b.id, product: Product.Worker, count: 1 };
    const heard = run(s, [train, train, train]);
    expect(b.queue.length).toBe(0);
    expect(heard.filter((ev) => ev.kind === 'alert' && ev.player === 0 && ev.text.startsWith('Not enough'))).toHaveLength(1);
  });
});
