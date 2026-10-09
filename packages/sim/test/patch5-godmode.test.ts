// Jade's Patch 5 (EX-7 to EX-11): the new debugger's godmode builds and makes
// anything at once, for nothing and with nothing needed first, and places any
// unit, engine, animal, mob or lair; its other buttons raise every unit to the
// top rank, heal everything, kill chosen units, clear the monsters round a
// point and show the Elf kingdom. All of it is sim state, the same on every
// machine and in a save.
import { describe, expect, it } from 'vitest';
import {
  Blocked,
  BuildingKind,
  buildingCentre,
  createWorld,
  DebugTool,
  deserializeState,
  diffStates,
  FOG_TILE_COLUMNS,
  elfKingdom,
  GOD_SPAWNS,
  GOD_STOCK,
  hashState,
  MAGE_TOP_RANK,
  Mob,
  MONSTERS,
  Mount,
  placementBlocked,
  Product,
  Res,
  RESEARCH_PRODUCT,
  Research,
  serializeState,
  step,
  TOP_TIER,
  Troop,
  troopProduct,
  UnitKind,
  WILD,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

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

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

function freeSpot(s: SimState, kind: number): [number, number] {
  const b = bigHouse(s);
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, b.x + 20 + dx, b.z + dz) === Blocked.None) return [b.x + 20 + dx, b.z + dz];
      }
    }
  }
  throw new Error('no free spot');
}

const god = (on: boolean): Order => ({ kind: 'debugGod', player: 0, on: on ? 1 : 0 });

describe('godmode (Patch 5)', () => {
  it('fills the pool while on and puts the player\'s own stock back when it ends; a save keeps both', () => {
    const s = createWorld(5, { peaceful: true });
    const p = s.players[0]!;
    const before = Int32Array.from(p.pool);
    run(s, [god(true)]);
    expect(p.god).toBe(1);
    expect(p.pool[Res.SoftwoodLumber]).toBe(GOD_STOCK);
    expect(p.pool[Res.CarbonSteel]).toBe(GOD_STOCK);
    expect(Array.from(p.godPool)).toEqual(Array.from(before));
    // Spending comes back the next step.
    p.pool[Res.Stone] = 3;
    run(s);
    expect(p.pool[Res.Stone]).toBe(GOD_STOCK);
    const copy = deserializeState(serializeState(s));
    expect(diffStates(s, copy)).toBeNull();
    expect(hashState(copy)).toBe(hashState(s));
    run(s, [god(false)]);
    expect(p.god).toBe(0);
    expect(Array.from(p.pool)).toEqual(Array.from(before));
  });

  it('builds at once where it is placed, with no main base tier, research or worker trip needed, and upgrades at once', () => {
    const s = createWorld(5, { peaceful: true });
    const e = s.entities;
    expect(bigHouse(s).level).toBe(1);
    // Without godmode a Barracks needs a tier 2 main base.
    const [x, z] = freeSpot(s, BuildingKind.Barracks);
    const build: Order = { kind: 'build', player: 0, units: [e.id[0]!], building: BuildingKind.Barracks, variant: 0, x, z };
    run(s, [build], 5);
    expect(s.buildings.list.some((b) => b.kind === BuildingKind.Barracks)).toBe(false);
    run(s, [god(true), build]);
    const barracks = s.buildings.list.find((b) => b.kind === BuildingKind.Barracks)!;
    expect(barracks.complete).toBe(true);
    expect(barracks.hp).toBeGreaterThan(0);
    run(s, [{ kind: 'upgrade', player: 0, building: bigHouse(s).id }]);
    expect(bigHouse(s).level).toBe(2);
    expect(bigHouse(s).upgrading).toBe(0);
  });

  it('makes a top-tier cavalry troop with no horse, Forge or research, and a research, each in a step', () => {
    const s = createWorld(5, { peaceful: true });
    const e = s.entities;
    run(s, [god(true)]);
    const [x, z] = freeSpot(s, BuildingKind.Barracks);
    run(s, [{ kind: 'build', player: 0, units: [e.id[0]!], building: BuildingKind.Barracks, variant: 0, x, z }]);
    const barracks = s.buildings.list.find((b) => b.kind === BuildingKind.Barracks)!;
    const [lx, lz] = freeSpot(s, BuildingKind.ScholarsLodge);
    run(s, [{ kind: 'build', player: 0, units: [e.id[0]!], building: BuildingKind.ScholarsLodge, variant: 0, x: lx, z: lz }]);
    const lodge = s.buildings.list.find((b) => b.kind === BuildingKind.ScholarsLodge)!;
    const troops = (): number[] => [...Array(e.count).keys()].filter((i) => e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior);
    const had = troops().length;
    run(
      s,
      [
        { kind: 'produce', player: 0, building: barracks.id, product: troopProduct(Troop.Cavalry, TOP_TIER, TOP_TIER), count: 1 },
        { kind: 'produce', player: 0, building: lodge.id, product: RESEARCH_PRODUCT + Research.Bronze, count: 1 },
        { kind: 'produce', player: 0, building: bigHouse(s).id, product: Product.Worker, count: 1 },
      ],
      3,
    );
    const rider = troops().find((i) => e.troop[i] === Troop.Cavalry)!;
    expect(troops().length).toBe(had + 1);
    expect([e.wTier[rider], e.aTier[rider], e.mount[rider]]).toEqual([TOP_TIER, TOP_TIER, Mount.Horse]);
    expect(s.players[0]!.research & (1 << Research.Bronze)).not.toBe(0);
    expect(barracks.queue.length + lodge.queue.length + bigHouse(s).queue.length).toBe(0);
  });

  it('places every kind in GOD_SPAWNS: the players\' units theirs at their top kit, wild animals wild, monsters against the player', () => {
    const s = createWorld(5, { peaceful: true });
    const e = s.entities;
    const [bx, bz] = buildingCentre(bigHouse(s));
    const at = (k: number): Order => ({ kind: 'debugPlace', player: 0, what: k, x: bx + ((k % 10) - 5) * 4 * M, z: bz + 40 * M + Math.floor(k / 10) * 4 * M });
    // Not without godmode.
    const mine = (): number => [...Array(e.count).keys()].filter((i) => e.owner[i] === 0).length;
    const count = mine();
    run(s, [at(0)]);
    expect(mine()).toBe(count);
    run(s, [god(true)]);
    for (let k = 0; k < GOD_SPAWNS.length; k++) {
      const next = s.nextEntityId;
      run(s, [at(k)]);
      const i = e.indexOf(next);
      const spawn = GOD_SPAWNS[k]!;
      expect(i, spawn.name).toBeGreaterThanOrEqual(0);
      if (spawn.side === 'player') expect(e.owner[i], spawn.name).toBe(0);
      else if (spawn.side === 'wild') expect(e.owner[i], spawn.name).toBe(WILD);
      else expect([e.owner[i], e.foe[i]], spawn.name).toEqual([MONSTERS, 0]);
    }
    // The newest of a type: the start's close warriors come unarmoured.
    const troop = (t: number): number => [...Array(e.count).keys()].filter((i) => e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior && e.troop[i] === t).sort((p, q) => e.id[q]! - e.id[p]!)[0]!;
    expect([e.wTier[troop(Troop.Close)], e.aTier[troop(Troop.Close)]]).toEqual([TOP_TIER, TOP_TIER]);
    expect(e.mount[troop(Troop.Cavalry)]).toBe(Mount.Horse);
    // Morvath comes once; a second is refused while he is out.
    const morvath = GOD_SPAWNS.findIndex((g) => g.what === 'boss');
    const next = s.nextEntityId;
    run(s, [at(morvath)]);
    expect([...Array(e.count).keys()].filter((i) => e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.Morvath).length).toBe(1);
    // Nothing comes for the refused click: on this step the necromancer placed above may raise his dead (Patch 5, MB-5)
    // and wild animals may wander in, but no other monster.
    const added = [...Array(e.count).keys()].filter((i) => e.id[i]! >= next && e.kind[i] === UnitKind.Mob);
    expect(added.filter((i) => e.mob[i] !== Mob.Zombie && e.mob[i] !== Mob.SkeletonArcher)).toEqual([]);
  });

  it('raises every unit to the top rank, heals everything, kills chosen units and clears the monsters round a point', () => {
    const s = createWorld(5, { peaceful: true });
    const e = s.entities;
    const [bx, bz] = buildingCentre(bigHouse(s));
    run(s, [god(true)]);
    const mage = GOD_SPAWNS.findIndex((g) => g.what === 'mage');
    const zombie = GOD_SPAWNS.findIndex((g) => g.what === 'mob' && g.id === Mob.Zombie);
    run(s, [{ kind: 'debugPlace', player: 0, what: mage, x: bx + 20 * M, z: bz }]);
    run(s, [{ kind: 'debugTool', player: 0, tool: DebugTool.MaxRank, x: 0, z: 0 }]);
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== 0) continue;
      if (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior) expect(e.rank[i]).toBe(5);
      if (e.kind[i] === UnitKind.Mage) expect(e.rank[i]).toBe(MAGE_TOP_RANK);
    }
    e.hp[0] = 1;
    bigHouse(s).hp = 1;
    run(s, [{ kind: 'debugTool', player: 0, tool: DebugTool.HealAll, x: 0, z: 0 }]);
    expect(e.hp[0]).toBe(e.maxHp[0]);
    expect(bigHouse(s).hp).toBeGreaterThan(1);
    const victim = e.id[0]!;
    run(s, [{ kind: 'debugKill', player: 0, units: [victim] }]);
    expect(e.indexOf(victim)).toBe(-1);
    run(s, [{ kind: 'debugPlace', player: 0, what: zombie, x: bx + 30 * M, z: bz }]);
    run(s, [{ kind: 'debugPlace', player: 0, what: zombie, x: bx + 32 * M, z: bz }]);
    const zombies = (): number => [...Array(e.count).keys()].filter((i) => e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.Zombie && e.hp[i]! > 0).length;
    expect(zombies()).toBe(2);
    run(s, [{ kind: 'debugTool', player: 0, tool: DebugTool.ClearFoes, x: bx, z: bz }]);
    expect(zombies()).toBe(0);
  });

  it('shows the Elf kingdom: built where it stands, its land revealed, the camera sent there', () => {
    const s = createWorld(5, { peaceful: true });
    const heard = run(s, [{ kind: 'debugTool', player: 0, tool: DebugTool.ElfKingdom, x: 0, z: 0 }]);
    const k = elfKingdom(s);
    expect(k.built).not.toBe(0);
    const look = heard.find((ev) => ev.look);
    expect(look && [look.x, look.z]).toEqual([k.x, k.z]);
    const tile = (wu: number): number => Math.floor(wu / (WU_PER_COLUMN * FOG_TILE_COLUMNS));
    expect(s.world.isExplored(tile(k.x), tile(k.z))).toBe(true);
  });

  it('runs the same on two machines', () => {
    const a = createWorld(9, { peaceful: true });
    const b = createWorld(9, { peaceful: true });
    const [bx, bz] = buildingCentre(bigHouse(a));
    const orders: Order[] = [god(true), ...GOD_SPAWNS.map((_, k): Order => ({ kind: 'debugPlace', player: 0, what: k, x: bx + (k % 12) * 3 * M, z: bz + 30 * M + Math.floor(k / 12) * 3 * M }))];
    for (const s of [a, b]) {
      run(s, orders);
      run(s, [], 200);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});
