// Patch 7 (Jade): a unit eats food it carries where it stands, with the bar
// over its head, and food dragged from the stock onto a unit sends it to a
// store point to fetch some into its bag.
import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  BuildingKind,
  createWorld,
  deserializeState,
  EAT_STEPS,
  fetchCount,
  hashState,
  OrderKind,
  Res,
  serializeState,
  solidRect,
  step,
  STEPS_PER_SECOND,
  Troop,
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

/** A swordsman of player 0's, holding, `m` metres east of the Big House's walls. */
function swordsman(s: SimState, m: number): number {
  const [, z0, x1, z1] = solidRect(bigHouse(s));
  const i = addWarrior(s, 0, (x1 + 1) * WU_PER_COLUMN + m * M, ((z0 + z1 + 1) * WU_PER_COLUMN) >> 1, Troop.Close, 1);
  s.entities.queue[i] = [{ t: 'hold' }];
  return i;
}

function said(s: SimState, i: number, text: string): boolean {
  return s.events.some((ev) => ev.kind === 'speech' && ev.speaker === s.entities.id[i] && ev.text === text);
}

const world = (): SimState => createWorld(1, { peaceful: true });

describe('Eat from the bag', () => {
  it('eats where it stands with the bar over its head, heals fully over 10 s and carries on', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 40);
    e.hp[i] = Math.floor(e.maxHp[i]! / 4);
    e.bag[i] = [Res.Beef, 2];
    const [x, z] = [e.x[i], e.z[i]];
    const pool = s.players[0]!.pool[Res.Beef];
    run(s, 1, [{ kind: 'eatBag', player: 0, units: [e.id[i]!], res: Res.Beef }]);
    expect(e.queue[i]![0]).toMatchObject({ t: 'eat', res: Res.Beef });
    expect(e.order[i]).toBe(OrderKind.Tinker);
    // One beef is 4 food: a full heal (Jade's GP-13), the other kept for later.
    expect(e.bag[i]).toEqual([Res.Beef, 1]);
    expect(s.events.some((ev) => ev.kind === 'speech' && ev.speaker === e.id[i] && /^I need \d food to heal\. I'm eating beef from my bag\.$/.test(ev.text))).toBe(true);
    run(s, EAT_STEPS);
    expect(e.hp[i]).toBe(e.maxHp[i]);
    expect([e.x[i], e.z[i]]).toEqual([x, z]);
    expect(e.queue[i]![0]).toEqual({ t: 'hold' });
    expect(s.players[0]!.pool[Res.Beef]).toBe(pool);
  });

  it('short of food it eats what it carries and heals a quarter of its health for each', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 40);
    const max = e.maxHp[i]!;
    e.hp[i] = 1;
    e.kept[i] = [Res.Blueberries, 2];
    run(s, 1, [{ kind: 'eatBag', player: 0, units: [e.id[i]!], res: Res.Blueberries }]);
    expect(e.kept[i]).toEqual([]);
    run(s, EAT_STEPS);
    // Half its health back, and a natural healing tick (1%) may fall in the 10 s.
    expect(e.hp[i]).toBeGreaterThanOrEqual(1 + Math.floor((max * 2) / 4));
    expect(e.hp[i]).toBeLessThanOrEqual(2 + Math.floor((max * 2) / 4) + Math.floor(max / 100));
  });

  it('eats a woodsman-style gathered load too', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 40);
    e.hp[i] = e.maxHp[i]! - 1;
    e.carryRes[i] = Res.Blueberries;
    e.carryAmt[i] = 3;
    run(s, 1, [{ kind: 'eatBag', player: 0, units: [e.id[i]!], res: Res.Blueberries }]);
    expect(e.carryAmt[i]).toBe(2);
  });

  it('a unit not hurt says so and eats nothing', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 40);
    e.bag[i] = [Res.Beef, 1];
    run(s, 1, [{ kind: 'eatBag', player: 0, units: [e.id[i]!], res: Res.Beef }]);
    expect(said(s, i, 'I am not hurt.')).toBe(true);
    expect(e.bag[i]).toEqual([Res.Beef, 1]);
    expect(e.queue[i]).toEqual([{ t: 'hold' }]);
  });
});

describe('Fetch food', () => {
  it('walks to the main base, takes a full heal\'s worth into its bag, kept, and does not hand it back', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    pool[Res.Blueberries] = 10;
    const i = swordsman(s, 30);
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.Blueberries }]);
    expect(e.queue[i]![0]).toMatchObject({ t: 'fetch', res: Res.Blueberries, n: 4, b: bigHouse(s).id });
    expect(fetchCount(Res.Blueberries)).toBe(4);
    expect(fetchCount(Res.Beef)).toBe(1);
    expect(fetchCount(Res.Salmon)).toBe(2);
    runUntil(s, () => e.kept[i]!.length > 0, 60 * SEC);
    expect(e.kept[i]).toEqual([Res.Blueberries, 4]);
    expect(pool[Res.Blueberries]).toBe(6);
    expect(e.queue[i]![0]).toEqual({ t: 'hold' });
    // Beside the main base it keeps it, rather than handing it straight back in.
    run(s, 5 * SEC);
    expect(e.kept[i]).toEqual([Res.Blueberries, 4]);
    expect(pool[Res.Blueberries]).toBe(6);
  });

  it('takes only what is left in the stock', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    pool[Res.Blueberries] = 3;
    const i = swordsman(s, 30);
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.Blueberries }]);
    runUntil(s, () => e.kept[i]!.length > 0, 60 * SEC);
    expect(e.kept[i]).toEqual([Res.Blueberries, 3]);
    expect(pool[Res.Blueberries]).toBe(0);
  });

  it('refuses with a full bag, and with none in the stock', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    pool[Res.Blueberries] = 5;
    const i = swordsman(s, 30);
    e.kept[i] = [Res.Stone, 1000];
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.Blueberries }]);
    expect(said(s, i, 'My bag is too full for some blueberries.')).toBe(true);
    expect(e.queue[i]).toEqual([{ t: 'hold' }]);
    pool[Res.Raspberries] = 0;
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.Raspberries }]);
    expect(s.events.some((ev) => ev.kind === 'alert' && ev.text === 'There is no raspberries in the stock.')).toBe(true);
  });

  it('then eats what it fetched out in the field', () => {
    const s = world();
    const e = s.entities;
    s.players[0]!.pool[Res.Beef] = 2;
    const i = swordsman(s, 30);
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.Beef }]);
    runUntil(s, () => e.kept[i]!.length > 0, 60 * SEC);
    e.hp[i] = 1;
    run(s, 1, [{ kind: 'eatBag', player: 0, units: [e.id[i]!], res: Res.Beef }]);
    expect(e.kept[i]).toEqual([]);
    run(s, EAT_STEPS);
    expect(e.hp[i]).toBe(e.maxHp[i]);
  });
});

describe('saves', () => {
  it('keeps a meal from the bag and a fetch under way through a snapshot', () => {
    const s = world();
    const e = s.entities;
    s.players[0]!.pool[Res.Beef] = 2;
    const eater = swordsman(s, 40);
    e.hp[eater] = 1;
    e.bag[eater] = [Res.Beef, 1];
    const fetcher = swordsman(s, 30);
    run(s, 5, [
      { kind: 'eatBag', player: 0, units: [e.id[eater]!], res: Res.Beef },
      { kind: 'fetchFood', player: 0, units: [e.id[fetcher]!], res: Res.Beef },
    ]);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    expect(copy.entities.queue[fetcher]![0]).toEqual(e.queue[fetcher]![0]);
    expect(copy.entities.queue[eater]![0]).toEqual(e.queue[eater]![0]);
    run(s, 20 * SEC);
    run(copy, 20 * SEC);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
