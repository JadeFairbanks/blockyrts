// Patch 7's equipment handling (plan section 7): Keep in bag, Give, Scrap from
// a unit at the Workshop, Equip from the bag on the spot, Take off and Drop,
// Equip from the stock for several units, the Dreadnought's refusal and the
// pickup prompt.
import { describe, expect, it } from 'vitest';
import {
  addDreadnought,
  addWarrior,
  ARMOUR_KITS,
  bagFreeTenthsLb,
  Blocked,
  BuildingKind,
  CLOSE_GEAR,
  CLOSE_KITS,
  createWorld,
  DREADNOUGHT_GEAR,
  dropLoot,
  DROPPED,
  itemGear,
  kitHolder,
  Line,
  ownGear,
  PICKUP_ASK,
  placeBuilding,
  placementBlocked,
  Res,
  RESOURCES,
  SMASHING_LINE,
  solidRect,
  step,
  STEPS_PER_SECOND,
  Troop,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimEvent,
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

/** A swordsman of player 0's with a tier of weapon and armour, standing `m` metres east of the Big House, holding. */
function swordsman(s: SimState, m: number, w = 1, a = 0, dz = 0): number {
  const [x, z] = eastOf(s, m, dz);
  const i = addWarrior(s, 0, x, z, Troop.Close, w, a);
  s.entities.queue[i] = [{ t: 'hold' }];
  return i;
}

/** The question a unit put up this step, if any. */
function asked(s: SimState, i: number): SimEvent | undefined {
  return s.events.find((ev) => ev.kind === 'question' && ev.speaker === s.entities.id[i] && !ev.ask?.closed);
}

const weight = (res: number): number => RESOURCES[res]!.weightTenthsLb;

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

describe('Equip from the bag', () => {
  it('puts a looted piece on where the unit stands, the old piece into its bag', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 20);
    e.bag[i] = [Res.FiendCleaver, 1];
    const old = CLOSE_KITS[1]!.items[0]!;
    run(s, 1, [{ kind: 'equipBag', player: 0, units: [e.id[i]!], res: Res.FiendCleaver }]);
    expect(e.weapon[i]).toBe(ownGear(Res.FiendCleaver));
    expect(e.wTier[i]).toBeGreaterThan(1);
    expect(e.bag[i]).toEqual([old, 1]);
    expect(said(s, i, "Using the fiend's cleaver now.")).toBe(true);
  });

  it('says why a piece does not fit, and refuses a swap when the old piece would not fit in the bag', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 20, 1, 2);
    e.bag[i] = [Res.GoblinSling, 1];
    run(s, 1, [{ kind: 'equipBag', player: 0, units: [e.id[i]!], res: Res.GoblinSling }]);
    expect(said(s, i, 'Only rangers use bows and slings.')).toBe(true);
    // A light piece in, a heavier one out, and the bag full to the brim.
    const jerkin = ARMOUR_KITS[2]!.items[0]!;
    e.bag[i] = [Res.GnollBracer, 1];
    const free = bagFreeTenthsLb(s, i);
    e.kept[i] = [Res.Stone, Math.floor(free / weight(Res.Stone))];
    expect(bagFreeTenthsLb(s, i) + weight(Res.GnollBracer)).toBeLessThan(weight(jerkin));
    run(s, 1, [{ kind: 'equipBag', player: 0, units: [e.id[i]!], res: Res.GnollBracer }]);
    expect(said(s, i, `My bag is too full for the ${RESOURCES[jerkin]!.name.toLowerCase()}.`)).toBe(true);
    expect(e.aTier[i]).toBe(2);
    expect(e.bag[i]).toEqual([Res.GnollBracer, 1]);
  });

  it('the Dreadnought refuses a weapon he cannot use, and swaps his mace for a two-handed area weapon', () => {
    const s = world();
    const e = s.entities;
    const [x, z] = eastOf(s, 20);
    const d = addDreadnought(s, 0, x, z);
    e.queue[d] = [{ t: 'hold' }];
    e.bag[d] = [Res.GoblinDagger, 1, Res.ElfGlaive, 1];
    run(s, 1, [{ kind: 'equipBag', player: 0, units: [e.id[d]!], res: Res.GoblinDagger }]);
    expect(said(s, d, SMASHING_LINE)).toBe(true);
    expect(e.weapon[d]).toBe(DREADNOUGHT_GEAR.mace);
    run(s, 1, [{ kind: 'equipBag', player: 0, units: [e.id[d]!], res: Res.ElfGlaive }]);
    expect(e.weapon[d]).toBe(itemGear(Res.ElfGlaive, kitHolder(s, d)!));
    expect(e.bag[d]).toEqual([Res.GoblinDagger, 1, Res.HeavySpikedMace, 1]);
  });
});

describe('Take off and Drop', () => {
  it('takes a worn piece off into the bag, kept there, or drops it on the ground', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 20, 3, 2);
    const jerkin = ARMOUR_KITS[2]!.items[0]!;
    const sword = CLOSE_KITS[3]!.items[0]!;
    run(s, 1, [{ kind: 'takeOff', player: 0, units: [e.id[i]!], line: Line.Armour, drop: 0 }]);
    expect([e.aTier[i], e.armour[i]]).toEqual([0, 0]);
    expect([e.bag[i], e.kept[i]]).toEqual([[], [jerkin, 1]]);
    // Idle by day, it does not hand the piece straight back in to the stock.
    run(s, 10 * SEC);
    expect(e.kept[i]).toEqual([jerkin, 1]);
    expect(s.players[0]!.pool[jerkin] ?? 0).toBe(0);
    run(s, 1, [{ kind: 'takeOff', player: 0, units: [e.id[i]!], line: Line.Weapon, drop: 1 }]);
    expect([e.wTier[i], e.weapon[i]]).toEqual([0, CLOSE_GEAR[0]]);
    expect(s.loot.some((l) => l.res === sword && l.amt === 1 && l.owner === DROPPED)).toBe(true);
    expect(said(s, i, `Dropped the ${RESOURCES[sword]!.name.toLowerCase()}.`)).toBe(true);
  });
});

describe('Equip from the stock (Patch 7)', () => {
  it('gives one each to several units, the highest rank first, while the stock lasts', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const units = [swordsman(s, 6), swordsman(s, 6, 1, 0, 2), swordsman(s, 6, 1, 0, 4)];
    [e.rank[units[0]!], e.rank[units[1]!], e.rank[units[2]!]] = [1, 3, 2];
    pool[Res.FiendCleaver] = 2;
    run(s, 1, [{ kind: 'equip', player: 0, units: units.map((i) => e.id[i]!), res: Res.FiendCleaver }]);
    expect(pool[Res.FiendCleaver]).toBe(0);
    expect(e.queue[units[0]!]![0]).toEqual({ t: 'hold' });
    runUntil(s, () => e.weapon[units[1]!] === ownGear(Res.FiendCleaver) && e.weapon[units[2]!] === ownGear(Res.FiendCleaver), 120 * SEC);
    expect(pool[CLOSE_KITS[1]!.items[0]!]).toBeGreaterThanOrEqual(2);
  });

  it('puts a lower piece on when one unit is told to, the better piece back to the stock', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const i = swordsman(s, 6, 8);
    const best = CLOSE_KITS[8]!.items[0]!;
    pool[Res.GoblinDagger] = 1;
    const before = pool[best]!;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[i]!], res: Res.GoblinDagger }]);
    expect(e.queue[i]![0]).toMatchObject({ t: 'putOn', res: Res.GoblinDagger, paid: 1 });
    runUntil(s, () => e.weapon[i] === ownGear(Res.GoblinDagger), 120 * SEC);
    expect(pool[best]).toBe(before + 1);
    expect(said(s, i, 'Using the goblin dagger now.')).toBe(true);
  });

  it('takes the Dreadnought to a store point for a great weapon, and he refuses one he cannot use', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const [x, z] = eastOf(s, 6);
    const d = addDreadnought(s, 0, x, z);
    e.queue[d] = [{ t: 'hold' }];
    pool[Res.SteelSideSword] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[d]!], res: Res.SteelSideSword }]);
    expect(said(s, d, SMASHING_LINE)).toBe(true);
    expect(pool[Res.SteelSideSword]).toBe(1);
    pool[Res.ElfGlaive] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[d]!], res: Res.ElfGlaive }]);
    expect(e.queue[d]![0]).toMatchObject({ t: 'putOn', res: Res.ElfGlaive });
    runUntil(s, () => e.weapon[d] !== DREADNOUGHT_GEAR.mace, 120 * SEC);
    expect(e.weapon[d]).toBe(itemGear(Res.ElfGlaive, kitHolder(s, d)!));
    expect(pool[Res.HeavySpikedMace]).toBe(1);
  });

  it('gives the piece back to the stock when the unit is called off on its way', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const i = swordsman(s, 30, 8);
    pool[Res.GoblinDagger] = 1;
    run(s, 1, [{ kind: 'equip', player: 0, units: [e.id[i]!], res: Res.GoblinDagger }]);
    expect(pool[Res.GoblinDagger]).toBe(0);
    run(s, 1, [{ kind: 'stop', player: 0, units: [e.id[i]!] }]);
    expect(pool[Res.GoblinDagger]).toBe(1);
  });
});

describe('Scrap a worn piece', () => {
  it('takes the piece the unit wears to the Workshop and queues it there', () => {
    const s = world();
    const e = s.entities;
    const shop = workshop(s);
    const i = swordsman(s, 20, 1, 2);
    const jerkin = ARMOUR_KITS[2]!.items[0]!;
    run(s, 1, [{ kind: 'scrapItem', player: 0, units: [e.id[i]!], res: jerkin, worn: 1, building: 0 }]);
    runUntil(s, () => shop.queue.length > 0, 60 * SEC);
    expect(shop.queue[0]!.paid).toEqual([[jerkin, 1]]);
    expect(e.aTier[i]).toBe(0);
  });
});

describe('the pickup prompt', () => {
  it('asks to use a piece that fits and beats what it has; Yes swaps it in', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 20);
    s.events = [];
    dropLoot(s, e.x[i]!, e.z[i]!, [[Res.FiendCleaver, 1]], { killer: i, owner: 0, brag: 0, src: 0 });
    const q = asked(s, i);
    expect(q?.text).toBe("Ooh, can I use this fiend's cleaver I just found?");
    expect(q?.ask).toMatchObject({ q: PICKUP_ASK, res: Res.FiendCleaver });
    run(s, 1, [{ kind: 'answer', player: 0, ask: q!.ask!.id, yes: 1, q: PICKUP_ASK, who: e.id[i]!, units: [e.id[i]!], res: Res.FiendCleaver }]);
    expect(e.weapon[i]).toBe(ownGear(Res.FiendCleaver));
    expect(e.bag[i]).toEqual([CLOSE_KITS[1]!.items[0]!, 1]);
  });

  it('No leaves it in the bag; a piece that is no better is not asked about', () => {
    const s = world();
    const e = s.entities;
    const i = swordsman(s, 20);
    const j = swordsman(s, 20, 8, 0, 6);
    s.events = [];
    dropLoot(s, e.x[i]!, e.z[i]!, [[Res.FiendCleaver, 1]], { killer: i, owner: 0, brag: 0, src: 0 });
    const q = asked(s, i)!;
    run(s, 1, [{ kind: 'answer', player: 0, ask: q.ask!.id, yes: 0, q: PICKUP_ASK, who: e.id[i]!, units: [e.id[i]!], res: Res.FiendCleaver }]);
    expect(e.bag[i]).toEqual([Res.FiendCleaver, 1]);
    expect(e.wTier[i]).toBe(1);
    s.events = [];
    dropLoot(s, e.x[j]!, e.z[j]!, [[Res.GoblinDagger, 1]], { killer: j, owner: 0, brag: 0, src: 0 });
    expect(e.bag[j]).toEqual([Res.GoblinDagger, 1]);
    expect(asked(s, j)).toBeUndefined();
  });

  it('a unit handed a piece with Give asks too', () => {
    const s = world();
    const e = s.entities;
    const giver = worker(s, 20);
    const taker = swordsman(s, 21);
    e.bag[giver] = [Res.FiendCleaver, 1];
    run(s, 1, [{ kind: 'giveItem', player: 0, units: [e.id[giver]!], res: Res.FiendCleaver, target: e.id[taker]! }]);
    let q: SimEvent | undefined;
    runUntil(s, () => (q ??= asked(s, taker)) !== undefined, 30 * SEC);
    expect(q!.text).toBe("Ooh, can I use this fiend's cleaver?");
  });
});
