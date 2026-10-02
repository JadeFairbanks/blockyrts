import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  Blocked,
  BuildingKind,
  buildingCentre,
  clockAt,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  destroyBuilding,
  DUSK_STEPS,
  hashState,
  Item,
  Mob,
  nightBudgetTenths,
  NIGHT_STEPS,
  Period,
  pickNight,
  placeBuilding,
  placementBlocked,
  serializeState,
  step,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Order,
  type SimState,
} from '../src/index.ts';

const NIGHT_START = DAY_STEPS + DUSK_STEPS;
const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);
const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function bigHouse(s: SimState, player = 0) {
  return s.buildings.list.find((b) => b.owner === player && b.kind === BuildingKind.MainBase);
}

function walls(s: SimState): number {
  return s.buildings.list.filter((b) => b.kind === BuildingKind.Wall && b.hp > 0).length;
}

/** Units of a player that are alive, by kind. */
function alive(s: SimState, kind: number, player = 0): number {
  const e = s.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.kind[i] === kind && e.hp[i]! > 0) n++;
  return n;
}

/** The player's own units, by entity id. */
function ownIds(s: SimState, player = 0): number[] {
  const e = s.entities;
  const ids: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior)) ids.push(e.id[i]!);
  return ids;
}

/** Spots just inside a ring 4 columns out from the Big House, one per unit. */
function insideSpots(s: SimState): Array<[number, number]> {
  const b = bigHouse(s)!;
  return [[b.x - 2, b.z + 7], [b.x + 15, b.z + 7], [b.x + 7, b.z - 2], [b.x + 7, b.z + 15], [b.x - 2, b.z - 2], [b.x + 15, b.z + 15]];
}

/** Brings every unit inside the ring line, then closes a softwood wall ring round the Big House (resource props are cleared for it). */
function fenceIn(s: SimState): void {
  const spots = insideSpots(s);
  run(s, 900, ownIds(s).map((id, n) => ({ kind: 'move', player: 0, units: [id], x: centre(spots[n]![0]), z: centre(spots[n]![1]) }) as Order));
  const b = bigHouse(s)!;
  const pad = 4;
  for (let x = b.x - pad; x <= b.x + 13 + pad; x++) {
    for (let z = b.z - pad; z <= b.z + 13 + pad; z++) {
      if (x !== b.x - pad && x !== b.x + 13 + pad && z !== b.z - pad && z !== b.z + 13 + pad) continue;
      const r = placementBlocked(s, 0, BuildingKind.Wall, x, z);
      if (r === Blocked.None || r === Blocked.Node) placeBuilding(s, 0, BuildingKind.Wall, 0, x, z, true);
    }
  }
}

/** Moves the clock to the start of a night (tests only: the world is peaceful, so nothing is planned). */
function toNight(s: SimState, night: number): void {
  s.step = night * CYCLE_STEPS + NIGHT_START;
}

describe('night 0', () => {
  it('is survived by the starting warrior and four workers behind a softwood fence', () => {
    const s = createWorld(1);
    const e = s.entities;
    expect(e.weapon[4]).toBe(Item.SpearFlint);
    expect(e.backup[4]).toBe(Item.Club);
    fenceIn(s);
    run(s, NIGHT_START + NIGHT_STEPS + 20 - s.step);
    expect(clockAt(s.step).period).toBe(Period.Dawn);
    expect(s.over).toBe(0);
    expect(bigHouse(s)!.hp).toBe(1200);
    expect(alive(s, UnitKind.Warrior)).toBe(1);
    expect(alive(s, UnitKind.Worker)).toBe(4);
    // Every mob that came was killed or is burning in the dawn.
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob) expect(e.mob[i]).toBe(Mob.SmallSlime);
  });

  it('never ends the game while the Big House stands', () => {
    for (const seed of [2, 3, 4]) {
      const s = createWorld(seed);
      fenceIn(s);
      run(s, NIGHT_START + NIGHT_STEPS + 20 - s.step);
      expect(s.over).toBe(0);
      expect(bigHouse(s)).toBeDefined();
    }
  });

  it('sends the fixed first-night pick: 4 zombies, 2 bats, 2 rats, a spider and a slime', () => {
    const s = createWorld(1);
    const picked = pickNight(s, 0).sort((a, b) => a - b);
    expect(picked).toEqual([Mob.Zombie, Mob.Zombie, Mob.Zombie, Mob.Zombie, Mob.CaveBat, Mob.CaveBat, Mob.GiantRat, Mob.GiantRat, Mob.GiantSpider, Mob.Slime]);
    expect(nightBudgetTenths(0)).toBe(120);
    expect(nightBudgetTenths(10)).toBe(460);
  });
});

describe('the fence against later nights', () => {
  it('lets skeleton archers on night 5 shoot over it', () => {
    const s = createWorld(1, { peaceful: true });
    fenceIn(s);
    toNight(s, 5);
    const b = bigHouse(s)!;
    const [cx, cz] = buildingCentre(b);
    const before = walls(s);
    const e = s.entities;
    const hp = new Map<number, number>();
    for (let i = 0; i < e.count; i++) hp.set(e.id[i]!, e.hp[i]!);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.SkeletonArcher, x: cx + 16 * WU_PER_METRE, z: cz }]);
    let archer = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.SkeletonArcher) archer = e.id[i]!;
    let hurt = 0;
    for (let k = 0; k < 600 && hurt === 0; k++) {
      step(s);
      for (let i = 0; i < e.count; i++) {
        if (e.kind[i] === UnitKind.Mob) continue;
        if (e.hp[i]! < (hp.get(e.id[i]!) ?? 0) && e.attacker[i] === archer) hurt++;
      }
    }
    expect(hurt).toBeGreaterThan(0);
    expect(walls(s)).toBe(before);
  });

  it('is broken by a skeleton bomber on night 10', () => {
    const s = createWorld(1, { peaceful: true });
    fenceIn(s);
    toNight(s, 10);
    const [cx, cz] = buildingCentre(bigHouse(s)!);
    const before = walls(s);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.SkeletonBomber, x: cx + 18 * WU_PER_METRE, z: cz + 2 * WU_PER_METRE }]);
    const texts: string[] = [];
    for (let k = 0; k < 900 && walls(s) === before; k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(walls(s)).toBeLessThan(before);
    expect(texts).toContain('A wall has been broken.');
  });
});

describe('digging', () => {
  /** How many steps a zombie sent at the Big House from the east spends in a strip of ground, with or without a trench dug there, and whether it gets there. */
  function zombieThrough(trench: boolean): { inStrip: number; reached: boolean } {
    const s = createWorld(1, { peaceful: true });
    toNight(s, 1);
    // Nobody home to fight it: the zombie marches on the Big House.
    for (const id of ownIds(s)) s.entities.remove(id);
    const [hx, hz] = buildingCentre(bigHouse(s)!);
    // A strip 3 columns wide and 30 long across the way from the east, 10 m out; the trench is 1.6 m deep.
    const tx = col(hx) + 22;
    const z0 = col(hz) - 15;
    const z1 = col(hz) + 15;
    let low = 1 << 30;
    let high = 0;
    for (let x = tx; x < tx + 3; x++) {
      for (let z = z0; z <= z1; z++) {
        low = Math.min(low, s.world.topAt(x, z));
        high = Math.max(high, s.world.topAt(x, z));
      }
    }
    if (trench) step(s, [{ kind: 'terrain', player: 0, x0: tx, z0, x1: tx + 2, z1, bottom: low - 14, top: high + 1, material: 0 }]);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.Zombie, x: hx + 24 * WU_PER_METRE, z: hz }]);
    const e = s.entities;
    let zombie = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.Zombie) zombie = e.id[i]!;
    let inStrip = 0;
    let reached = false;
    for (let k = 0; k < 1200 && !reached; k++) {
      step(s);
      const i = e.indexOf(zombie);
      expect(i).toBeGreaterThanOrEqual(0);
      const x = col(e.x[i]!);
      const z = col(e.z[i]!);
      if (x >= tx && x <= tx + 2 && z >= z0 && z <= z1) inStrip++;
      if (Math.hypot(e.x[i]! - hx, e.z[i]! - hz) < 9 * WU_PER_METRE) reached = true;
    }
    return { inStrip, reached };
  }

  it('a trench turns zombies aside', () => {
    const open = zombieThrough(false);
    expect(open.inStrip).toBeGreaterThan(0);
    expect(open.reached).toBe(true);
    const dug = zombieThrough(true);
    expect(dug.inStrip).toBe(0);
    expect(dug.reached).toBe(true);
  });
});

describe('equipment', () => {
  it('Equip Best hands out flint spears', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s)!;
    const [hx, hz] = buildingCentre(b);
    const e = s.entities;
    const fresh = [addWarrior(s, 0, hx + 12 * WU_PER_METRE, hz), addWarrior(s, 0, hx + 14 * WU_PER_METRE, hz)];
    for (const i of fresh) e.weapon[i] = Item.Club;
    const ids = fresh.map((i) => e.id[i]!);
    run(s, 2, [{ kind: 'debugGive', player: 0, item: Item.SpearFlint, count: 2 }]);
    run(s, 600, [{ kind: 'equipBest', player: 0, units: ids }]);
    for (const id of ids) expect(e.weapon[e.indexOf(id)]).toBe(Item.SpearFlint);
    expect(s.players[0]!.items[Item.SpearFlint]).toBe(0);
  });
});

describe('losing', () => {
  it('losing every worker with no main base or farm ends the game with the nights survived', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = 3 * CYCLE_STEPS + 100;
    destroyBuilding(s, bigHouse(s)!.id);
    step(s);
    expect(s.over).toBe(0);
    for (const id of ownIds(s)) s.entities.remove(id);
    const texts: string[] = [];
    for (let k = 0; k < 3; k++) {
      step(s);
      texts.push(...s.events.map((ev) => ev.text));
    }
    expect(s.over).toBeGreaterThan(0);
    expect(texts).toContain('The game is over. Nights survived: 3.');
  });
});

describe('determinism with monsters', () => {
  it('a save made mid-fight carries on to the same hash', () => {
    const s = createWorld(5);
    fenceIn(s);
    run(s, NIGHT_START + 1200 - s.step);
    expect(s.entities.count).toBeGreaterThan(6);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    run(s, 600);
    run(copy, 600);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('orders for units that are gone', () => {
  it('are ignored, whatever the order', () => {
    const s = createWorld(1, { peaceful: true });
    const gone = [999];
    const orders: Order[] = [
      { kind: 'move', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'attackMove', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'patrol', player: 0, units: gone, x: 0, z: 0 },
      { kind: 'attack', player: 0, units: gone, target: 999 },
      { kind: 'hold', player: 0, units: gone },
      { kind: 'equipBest', player: 0, units: gone },
      { kind: 'equipItem', player: 0, unit: 999, slot: 1, item: 3 },
      { kind: 'lock', player: 0, units: gone, lock: 1 },
      { kind: 'dig', player: 0, units: gone, x0: 0, z0: 0, x1: 1, z1: 1, level: -4, level2: 0, tunnel: 0 },
      { kind: 'earthwork', player: 0, units: gone, variant: 0, x0: 0, z0: 0, x1: 1, z1: 1, level: 4, level2: 0, axis: 0 },
      { kind: 'trainSkill', player: 0, units: gone, building: 999, skill: 1 },
    ];
    const before = hashState(s);
    expect(() => step(s, orders)).not.toThrow();
    const fresh = createWorld(1, { peaceful: true });
    step(fresh);
    expect(hashState(s)).toBe(hashState(fresh));
    expect(before).not.toBe(hashState(s));
  });
});
