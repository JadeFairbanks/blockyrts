// Patch 7's equipment handling (plan section 7): Keep in bag, Give, Scrap from
// a unit at the Workshop, Equip from the bag on the spot, Take off and Drop,
// Equip from the stock for several units, the Dreadnought's refusal and the
// pickup prompt.
import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  Blocked,
  BuildingKind,
  createWorld,
  placeBuilding,
  placementBlocked,
  Res,
  solidRect,
  step,
  STEPS_PER_SECOND,
  Troop,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): void {
  for (let k = 0; k < max; k++) {
    if (done()) return;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

/** A point east of the Big House's walls, `m` metres out, in wu. */
function eastOf(s: SimState, m: number, dz = 0): [number, number] {
  const [, z0, x1, z1] = solidRect(bigHouse(s));
  return [(x1 + 1) * WU_PER_COLUMN + m * M, (((z0 + z1 + 1) * WU_PER_COLUMN) >> 1) + dz * M];
}

/** One of player 0's workers, idle, standing `m` metres east of the Big House. */
function worker(s: SimState, m: number, dz = 0): number {
  const e = s.entities;
  const i = [...Array(e.count).keys()].find((j) => e.owner[j] === 0 && e.kind[j] === UnitKind.Worker && e.queue[j]!.length === 0 && !e.bag[j]!.length)!;
  [e.x[i], e.z[i]] = eastOf(s, m, dz);
  e.queue[i] = [{ t: 'hold' }];
  return i;
}

/** A finished Workshop of player 0's somewhere east of the Big House. */
function workshop(s: SimState): Building {
  const [x, z] = eastOf(s, 12);
  const cx = Math.floor(x / WU_PER_COLUMN);
  const cz = Math.floor(z / WU_PER_COLUMN);
  for (let r = 0; r < 40; r++) {
    for (const [sx, sz] of [[cx + r, cz], [cx, cz + r], [cx, cz - r]] as const) {
      if (placementBlocked(s, 0, BuildingKind.Workshop, sx, sz) === Blocked.None) return placeBuilding(s, 0, BuildingKind.Workshop, 0, sx, sz, true);
    }
  }
  throw new Error('no room for a Workshop');
}

const world = (): SimState => createWorld(1, { peaceful: true });

function said(s: SimState, i: number, text: string): boolean {
  return s.events.some((ev) => ev.kind === 'speech' && ev.speaker === s.entities.id[i] && ev.text === text);
}

describe('Keep in bag', () => {
  it('keeps a locked good in the bag near a drop-off while the rest goes in, and lets it go when freed', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const i = worker(s, 2);
    e.bag[i] = [Res.Hides, 3, Res.SteelSideSword, 1];
    const swords = pool[Res.SteelSideSword]!;
    const hides = pool[Res.Hides]!;
    run(s, 2 * SEC, [{ kind: 'keepItem', player: 0, units: [e.id[i]!], res: Res.SteelSideSword, on: 1 }]);
    expect(pool[Res.Hides]).toBe(hides + 3);
    expect(pool[Res.SteelSideSword]).toBe(swords);
    expect(e.bag[i]).toEqual([]);
    expect(e.kept[i]).toEqual([Res.SteelSideSword, 1]);
    run(s, 2 * SEC, [{ kind: 'keepItem', player: 0, units: [e.id[i]!], res: Res.SteelSideSword, on: 0 }]);
    expect(pool[Res.SteelSideSword]).toBe(swords + 1);
    expect(e.kept[i]).toEqual([]);
  });

  it('still unloads and drops a kept good when told to, and the lock goes with it', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const i = worker(s, 20);
    e.kept[i] = [Res.SteelSideSword, 1];
    const swords = pool[Res.SteelSideSword]!;
    run(s, 1, [{ kind: 'unloadItem', player: 0, units: [e.id[i]!], res: Res.SteelSideSword }]);
    runUntil(s, () => pool[Res.SteelSideSword] === swords + 1, 60 * SEC);
    expect(e.kept[i]).toEqual([]);
  });
});

describe('Give', () => {
  it('walks the piece over to another unit and hands it into its bag', () => {
    const s = world();
    const e = s.entities;
    const giver = worker(s, 20);
    const [x, z] = eastOf(s, 30, 6);
    const taker = addWarrior(s, 0, x, z, Troop.Close, 1);
    e.queue[taker] = [{ t: 'hold' }];
    e.kept[giver] = [Res.SteelSideSword, 1];
    run(s, 1, [{ kind: 'giveItem', player: 0, units: [e.id[giver]!], res: Res.SteelSideSword, target: e.id[taker]! }]);
    expect(e.queue[giver]![0]).toMatchObject({ t: 'give', id: e.id[taker], res: Res.SteelSideSword });
    runUntil(s, () => e.bag[taker]!.length > 0, 60 * SEC);
    expect(e.bag[taker]).toEqual([Res.SteelSideSword, 1]);
    expect(e.kept[giver]).toEqual([]);
    expect(e.queue[giver]![0]).toEqual({ t: 'hold' });
  });

  it('keeps the piece when the other unit\'s bag is full, and says so', () => {
    const s = world();
    const e = s.entities;
    const giver = worker(s, 20);
    const [x, z] = eastOf(s, 22);
    const taker = addWarrior(s, 0, x, z, Troop.Close, 1);
    e.queue[taker] = [{ t: 'hold' }];
    e.kept[taker] = [Res.Stone, 1000];
    e.kept[giver] = [Res.SteelSideSword, 1];
    run(s, 1, [{ kind: 'giveItem', player: 0, units: [e.id[giver]!], res: Res.SteelSideSword, target: e.id[taker]! }]);
    let full = false;
    runUntil(s, () => (full ||= said(s, giver, 'Their bag is full.')), 60 * SEC);
    expect(e.kept[giver]).toEqual([Res.SteelSideSword, 1]);
  });
});

describe('Scrap from a unit', () => {
  it('walks the piece to the Workshop and queues it there to be scrapped', () => {
    const s = world();
    const e = s.entities;
    const shop = workshop(s);
    const i = worker(s, 20);
    e.kept[i] = [Res.SteelSideSword, 1];
    run(s, 1, [{ kind: 'scrapItem', player: 0, units: [e.id[i]!], res: Res.SteelSideSword, worn: 0, building: 0 }]);
    expect(e.queue[i]![0]).toMatchObject({ t: 'scrap', b: shop.id, res: Res.SteelSideSword, worn: 0 });
    runUntil(s, () => shop.queue.length > 0, 60 * SEC);
    expect(shop.queue[0]!.paid).toEqual([[Res.SteelSideSword, 1]]);
    expect(e.kept[i]).toEqual([]);
  });

  it('says so when there is no Workshop', () => {
    const s = world();
    const e = s.entities;
    const i = worker(s, 20);
    e.bag[i] = [Res.SteelSideSword, 1];
    run(s, 1, [{ kind: 'scrapItem', player: 0, units: [e.id[i]!], res: Res.SteelSideSword, worn: 0, building: 0 }]);
    expect(said(s, i, 'There is no Workshop to scrap it at.')).toBe(true);
    expect(e.bag[i]).toEqual([Res.SteelSideSword, 1]);
  });
});
