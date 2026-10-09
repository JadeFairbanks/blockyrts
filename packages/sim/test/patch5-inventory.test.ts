// Patch 5's unit inventory and the main base (Jade's GP-5, GP-6, GP-7, GP-2,
// GP-10, GP-13 and GP-27): one good unloaded or dropped, drop-offs taken by
// themselves, an item from the stock put on, shelter deeper inside or up on
// the ramparts, and eating by the quarter.
import { describe, expect, it } from 'vitest';
import {
  addMage,
  addWarrior,
  BuildingKind,
  createWorld,
  DROPPED,
  eatAt,
  eatNeed,
  ENTER_IN,
  ENTER_TOP,
  goesInside,
  ITEM_WAY,
  Line,
  Mount,
  onTop,
  Res,
  SAFE_TEXT,
  School,
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
function eastOf(s: SimState, m: number): [number, number] {
  const [, z0, x1, z1] = solidRect(bigHouse(s));
  return [(x1 + 1) * WU_PER_COLUMN + m * M, (((z0 + z1 + 1) * WU_PER_COLUMN) >> 1)];
}

/** One of player 0's workers, idle, standing `m` metres east of the Big House. */
function worker(s: SimState, m: number): number {
  const e = s.entities;
  const i = [...Array(e.count).keys()].find((j) => e.owner[j] === 0 && e.kind[j] === UnitKind.Worker)!;
  [e.x[i], e.z[i]] = eastOf(s, m);
  e.queue[i] = [];
  return i;
}

const world = (): SimState => createWorld(1, { peaceful: true });

describe('the unit inventory (GP-6, GP-7)', () => {
  it('has a unit near a drop-off hand in what it carries by itself, with no walk', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const near = worker(s, 2);
    e.carryRes[near] = Res.Stone;
    e.carryAmt[near] = 5;
    e.bag[near] = [Res.Hides, 3];
    const stone = pool[Res.Stone]!;
    const hides = pool[Res.Hides]!;
    run(s, 2 * SEC);
    expect(pool[Res.Stone]).toBe(stone + 5);
    expect(pool[Res.Hides]).toBe(hides + 3);
    expect(e.carryAmt[near]).toBe(0);
    expect(e.bag[near]).toEqual([]);
    // Farther out, it keeps its load.
    const far = worker(s, 20);
    e.carryRes[far] = Res.Stone;
    e.carryAmt[far] = 5;
    run(s, 2 * SEC);
    expect(e.carryAmt[far]).toBe(5);
  });

  it('drops one good on the ground at its feet, where nobody picks it up by themselves', () => {
    const s = world();
    const e = s.entities;
    const i = worker(s, 20);
    e.bag[i] = [Res.Venison, 3, Res.Hides, 2];
    run(s, 1, [{ kind: 'dropItem', player: 0, units: [e.id[i]!], res: Res.Venison }]);
    expect(e.bag[i]).toEqual([Res.Hides, 2]);
    const pile = s.loot.find((l) => l.res === Res.Venison)!;
    expect(pile).toMatchObject({ amt: 3, owner: DROPPED, x: e.x[i], z: e.z[i] });
    run(s, 5 * SEC);
    expect(s.loot.some((l) => l.id === pile.id)).toBe(true);
    expect(e.bag[i]).toEqual([Res.Hides, 2]);
  });

  it('unloads one good at the nearest drop-off and carries on', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const i = worker(s, 20);
    e.bag[i] = [Res.Hides, 3];
    const hides = pool[Res.Hides]!;
    run(s, 1, [{ kind: 'unloadItem', player: 0, units: [e.id[i]!], res: Res.Hides }]);
    runUntil(s, () => pool[Res.Hides] === hides + 3, 60 * SEC);
    expect(e.bag[i]).toEqual([]);
    // Unload all (-1) with nothing carried gives it nothing to do.
    run(s, 2 * SEC);
    const before = JSON.stringify(e.queue[i]);
    run(s, 1, [{ kind: 'unloadItem', player: 0, units: [e.id[i]!], res: -1 }]);
    expect(JSON.stringify(e.queue[i])).toBe(before);
  });
});

describe('Equip from the stock (GP-2)', () => {
  it('sends the unit to put the item on, paid now, as Upgrade equipment does with a ready item', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [x, z] = eastOf(s, 6);
    const sword = addWarrior(s, 0, x, z, Troop.Close, 1);
    const spear = addWarrior(s, 0, x, z + 2 * M, Troop.Long, 1);
    pool[Res.SteelSideSword] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[spear]!], res: Res.SteelSideSword }]);
    expect(pool[Res.SteelSideSword]).toBe(1);
    expect(s.events.some((ev) => ev.kind === 'speech' && ev.speaker === e.id[spear] && ev.text === 'I cannot use a steel side-sword.')).toBe(true);
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[sword]!], res: Res.SteelSideSword }]);
    expect(pool[Res.SteelSideSword]).toBe(0);
    expect(e.queue[sword]![0]).toMatchObject({ t: 'kitUp', line: Line.Weapon, to: 7, ways: ITEM_WAY, paid: 1 });
    runUntil(s, () => e.wTier[sword] === 7, 120 * SEC);
  });
});

describe('the main base as a shelter (GP-5, GP-10)', () => {
  it('sends melee and workers deeper inside and rangers and mages up top; the Big House takes everyone inside', () => {
    const s = world();
    const b = bigHouse(s);
    const [x, z] = eastOf(s, 6);
    const melee = addWarrior(s, 0, x, z, Troop.Close, 1);
    const ranger = addWarrior(s, 0, x, z, Troop.Ranger, 1);
    const mage = addMage(s, 0, x, z, School.Support);
    const rider = addWarrior(s, 0, x, z, Troop.Cavalry, 1);
    s.entities.mount[rider] = Mount.Horse;
    const w = worker(s, 6);
    // The Big House has no ramparts.
    for (const i of [melee, ranger, mage, w]) expect(goesInside(s, i, b)).toBe(true);
    expect(goesInside(s, rider, b)).toBe(false);
    b.level = 2;
    expect(goesInside(s, melee, b)).toBe(true);
    expect(goesInside(s, w, b)).toBe(true);
    expect(goesInside(s, ranger, b)).toBe(false);
    expect(goesInside(s, mage, b)).toBe(false);
  });

  it('takes a melee troop deeper inside, and the panel\'s arrow moves it up on the ramparts and back', () => {
    const s = world();
    const e = s.entities;
    const b = bigHouse(s);
    b.level = 2;
    const [x, z] = eastOf(s, 4);
    const melee = addWarrior(s, 0, x, z, Troop.Close, 1);
    run(s, 1, [{ kind: 'enter', player: 0, units: [e.id[melee]!], building: b.id }]);
    runUntil(s, () => e.inside[melee] === b.id, 30 * SEC);
    expect(e.queue[melee]![0]).toMatchObject({ t: 'enter', auto: ENTER_IN });
    expect(onTop(s, melee)).toBe(false);
    run(s, 1, [{ kind: 'shelter', player: 0, building: b.id, unit: e.id[melee]! }]);
    expect(e.queue[melee]![0]).toMatchObject({ t: 'enter', auto: ENTER_TOP });
    expect(onTop(s, melee)).toBe(true);
    run(s, 1, [{ kind: 'shelter', player: 0, building: b.id, unit: e.id[melee]! }]);
    expect(onTop(s, melee)).toBe(false);
    expect(e.inside[melee]).toBe(b.id);
  });

  it('says "I feel safe in here" once for workers going in one after another', () => {
    const s = world();
    const e = s.entities;
    const b = bigHouse(s);
    const ids = [...Array(e.count).keys()].filter((j) => e.owner[j] === 0 && e.kind[j] === UnitKind.Worker);
    expect(ids.length).toBeGreaterThan(1);
    const said: string[] = [];
    step(s, [{ kind: 'enter', player: 0, units: ids.map((j) => e.id[j]!), building: b.id }]);
    for (let k = 0; k < 40 * SEC && !ids.every((j) => e.inside[j] === b.id); k++) {
      step(s);
      for (const ev of s.events) if (ev.kind === 'speech' && ev.building === b.id) said.push(ev.text);
    }
    expect(ids.every((j) => e.inside[j] === b.id)).toBe(true);
    expect(said.filter((t) => t === SAFE_TEXT)).toHaveLength(1);
  });
});

describe('eating to heal (GP-13, GP-27)', () => {
  it('costs 1 food for each quarter of health missing, 4 for a full heal, and none at full health', () => {
    expect(eatNeed(100, 100)).toBe(0);
    expect(eatNeed(99, 100)).toBe(1);
    expect(eatNeed(75, 100)).toBe(1);
    expect(eatNeed(60, 100)).toBe(2);
    expect(eatNeed(1, 100)).toBe(4);
    expect(eatNeed(0, 100)).toBe(4);
  });

  it('heals fully for the food it needs, says how much, and does not eat at full health', () => {
    const s = world();
    const e = s.entities;
    const i = worker(s, 2);
    const max = e.maxHp[i]!;
    expect(eatAt(s, i)).toBe('I am not hurt.');
    run(s, 1, [{ kind: 'eat', player: 0, units: [e.id[i]!], building: 0 }]);
    expect(e.queue[i]!.length).toBe(0);
    e.hp[i] = Math.floor(max / 2);
    s.events.length = 0;
    expect(eatAt(s, i)).toBe('');
    expect(s.events.some((ev) => ev.kind === 'speech' && /^I need 2 food to heal\. I'm eating /.test(ev.text))).toBe(true);
    run(s, 11 * SEC);
    expect(e.hp[i]).toBe(max);
  });
});
