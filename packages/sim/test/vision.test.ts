// Vision (Fog of war): buildings see as units do, and the players share one
// picture, both the land explored and what is in sight now.

import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  BUILDING_SIGHT_M,
  buildingSight,
  ByteReader,
  ByteWriter,
  claimShapes,
  createWorld,
  DebugThreat,
  deserializeState,
  FOG_INTERVAL_STEPS,
  FOG_TILE_COLUMNS,
  footprintWu,
  hashState,
  isLair,
  LAIRS,
  Mob,
  placeBuilding,
  readWorld,
  seesForSide,
  serializeState,
  sideSees,
  sightOf,
  spawnPoint,
  step,
  Troop,
  addWarrior,
  UnitKind,
  VISION_STRIDE,
  visionSources,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const TILE = WU_PER_COLUMN * FOG_TILE_COLUMNS;
const tileOf = (wu: number): number => Math.floor(wu / TILE);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

/** Steps on to just after the next vision update. */
function toVision(s: SimState, orders: Order[] = []): void {
  run(s, 1, orders);
  while (s.step % FOG_INTERVAL_STEPS !== 0) step(s);
}

function bigHouse(s: SimState, player = 0): Building {
  return s.buildings.list.find((b) => b.owner === player && b.kind === BuildingKind.MainBase)!;
}

/** A building far out in land no one has explored: 1,350 m east of the start. */
function farBuilding(s: SimState, kind: number, owner = 0, dx = 3000): Building {
  const h = bigHouse(s);
  return placeBuilding(s, owner, kind, 0, h.x + dx, h.z, true);
}

function explored(s: SimState, x: number, z: number): boolean {
  return s.world.isExplored(tileOf(x), tileOf(z));
}

describe('buildings see', () => {
  it('keep the land out to their sight from their edge explored and in sight, with no unit near', () => {
    const s = createWorld(1, { peaceful: true });
    const b = farBuilding(s, BuildingKind.Storehouse);
    const [x0, z0, x1, z1] = footprintWu(b);
    const zm = (z0 + z1) >> 1;
    expect(explored(s, x1 + 9 * M, zm)).toBe(false);
    toVision(s);
    expect(buildingSight(s, b)).toBe(10 * M);
    expect(explored(s, x1 + 9 * M, zm)).toBe(true);
    expect(explored(s, x0 - 9 * M, zm)).toBe(true);
    expect(explored(s, x1 + 12 * M, zm)).toBe(false);
    // It is a source of the side's sight now, out from its footprint.
    const v = visionSources(s);
    let found = false;
    for (let o = 0; o < v.length; o += VISION_STRIDE) {
      if (v[o + 1] === x0 && v[o + 2] === z0 && v[o + 3] === x1 && v[o + 4] === z1) found = v[o + 5] === 10 * M && v[o] === 0;
    }
    expect(found).toBe(true);
  });

  it('see by their row of the table: the main base and towers 20 m, a brazier 14 m, the rest 10 m', () => {
    const s = createWorld(1, { peaceful: true });
    expect(buildingSight(s, bigHouse(s))).toBe(20 * M);
    expect(BUILDING_SIGHT_M[BuildingKind.Tower]).toBe(20);
    expect(BUILDING_SIGHT_M[BuildingKind.TowerStone]).toBe(20);
    expect(BUILDING_SIGHT_M[BuildingKind.Brazier]).toBe(14);
    expect(BUILDING_SIGHT_M[BuildingKind.Wall]).toBe(10);
    // Every building a player can own has a row.
    for (let k = 0; k <= BuildingKind.TowerStone; k++) {
      if (k === BuildingKind.Earthworks || k === BuildingKind.Ramp) continue;
      expect(BUILDING_SIGHT_M[k]).toBeGreaterThan(0);
    }
  });

  it('see half as far on a fog night', () => {
    const s = createWorld(1, { peaceful: true });
    const b = farBuilding(s, BuildingKind.Storehouse);
    // After the first day has begun, which clears any fog.
    run(s, 2);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Fog, x: 0, z: 0 }]);
    expect(buildingSight(s, b)).toBe(5 * M);
    toVision(s);
    const [, z0, x1, z1] = footprintWu(b);
    const zm = (z0 + z1) >> 1;
    expect(explored(s, x1 + 4 * M, zm)).toBe(true);
    expect(explored(s, x1 + 7 * M, zm)).toBe(false);
  });

  it('mark lairs in their sight found, which the side shares', () => {
    const s = createWorld(1, { peaceful: true });
    const b = farBuilding(s, BuildingKind.TowerStone);
    const [, z0, x1, z1] = footprintWu(b);
    // A barrow 18 m out from the tower's edge: beyond a 10 m building's sight, inside the tower's 20 m.
    expect(LAIRS[0]!.mob).toBe(Mob.LairBarrow);
    run(s, 1, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Lair, x: x1 + 18 * M, z: (z0 + z1) >> 1 }]);
    const e = s.entities;
    let lair = -1;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && isLair(e.mob[i]!)) lair = i;
    expect(lair).toBeGreaterThanOrEqual(0);
    expect(e.picked[lair]! & 1).toBe(0);
    toVision(s);
    expect(e.picked[lair]! & 1).toBe(1);
  });
});

describe('units see for the side', () => {
  it('in the open and on a tower, with its +10 m; not while sheltering inside', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const h = bigHouse(s);
    const tower = placeBuilding(s, 0, BuildingKind.TowerStone, 0, h.x + 30, h.z, true);
    const archer = addWarrior(s, 0, e.x[0]!, e.z[0]!, Troop.Ranger, 1, 0);
    expect(seesForSide(s, archer)).toBe(true);
    const open = sightOf(s, archer);
    e.inside[archer] = tower.id;
    expect(seesForSide(s, archer)).toBe(true);
    expect(sightOf(s, archer)).toBe(open + 10 * M);
    let worker = -1;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Worker && e.owner[i] === 0) worker = i;
    e.inside[worker] = h.id;
    expect(seesForSide(s, worker)).toBe(false);
  });
});

describe('the players share their vision', () => {
  it('every player\'s units and buildings are sources, and what one explores the others have', () => {
    const s = createWorld(3, { players: 2, peaceful: true });
    const v = visionSources(s);
    const owners = new Set<number>();
    for (let o = 0; o < v.length; o += VISION_STRIDE) owners.add(v[o]!);
    expect([...owners].sort()).toEqual([0, 1]);
    // Player 1's far building explores land in the one picture.
    const b = farBuilding(s, BuildingKind.Storehouse, 1);
    const [, z0, x1, z1] = footprintWu(b);
    toVision(s);
    expect(explored(s, x1 + 9 * M, (z0 + z1) >> 1)).toBe(true);
  });

  it('keep an attack on a target only a building sees, and drop it when no one sees it', () => {
    const attack = (withTower: boolean): boolean => {
      const s = createWorld(1, { peaceful: true });
      const e = s.entities;
      const h = bigHouse(s);
      let w = -1;
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Warrior && e.owner[i] === 0) w = i;
      // A rat 90 m east of the Big House: beyond the warrior's 24 m + 20 m.
      const x = (h.x + 200) * WU_PER_COLUMN;
      const z = h.z * WU_PER_COLUMN;
      if (withTower) placeBuilding(s, 0, BuildingKind.TowerStone, 0, h.x + 200 - 30, h.z, true);
      run(s, 1, [{ kind: 'debugSpawn', player: 0, mob: Mob.GiantRat, x, z }]);
      let rat = -1;
      for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.GiantRat) rat = i;
      expect(rat).toBeGreaterThanOrEqual(0);
      expect(sideSees(s, rat)).toBe(withTower);
      run(s, 1, [{ kind: 'attack', player: 0, units: [e.id[w]!], target: e.id[rat]! }]);
      return e.queue[w]![0]?.t === 'attack';
    };
    expect(attack(true)).toBe(true);
    expect(attack(false)).toBe(false);
  });
});

describe('night spawns on the shared dark edge', () => {
  it('keep 50 m off every player\'s claimed land', () => {
    const s = createWorld(5, { players: 2 });
    const shapes = [claimShapes(s, 0), claimShapes(s, 1)];
    const reach = 50 * M;
    for (let n = 0; n < 12; n++) {
      const [x, z] = spawnPoint(s, n & 1);
      for (const sh of shapes) {
        for (const [x0, z0, x1, z1] of sh.rects) {
          const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
          const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
          expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(reach * reach);
        }
      }
    }
  });
});

describe('saving the shared picture', () => {
  it('joins saves that kept one explored picture per player into one', () => {
    const s = createWorld(2, { players: 2, peaceful: true });
    const w = new ByteWriter();
    w.u8(2);
    w.u32(0);
    w.u32(0);
    w.u32(0);
    const a = new Uint8Array(32);
    a[0] = 0b0000_0001;
    const b = new Uint8Array(32);
    b[0] = 0b1000_0000;
    b[5] = 0xff;
    // Player 0 explored chunk (3, 4) and (9, 9); player 1 chunk (3, 4) too.
    w.u32(2);
    w.i32(3);
    w.i32(4);
    w.bytes(a);
    w.i32(9);
    w.i32(9);
    w.bytes(a);
    w.u32(1);
    w.i32(3);
    w.i32(4);
    w.bytes(b);
    w.u32(0);
    const world = readWorld(new ByteReader(w.finish()), s.seed);
    expect(world.explored.size).toBe(2);
    expect(world.isExplored(3 * 16 + 0, 4 * 16)).toBe(true);
    expect(world.isExplored(3 * 16 + 7, 4 * 16)).toBe(true);
    expect(world.isExplored(3 * 16 + 8, 4 * 16 + 2)).toBe(true);
    expect(world.isExplored(9 * 16, 9 * 16)).toBe(true);
    expect(world.isExplored(9 * 16 + 7, 9 * 16)).toBe(false);
  });

  it('resumes the same from a save taken between vision updates', () => {
    const s = createWorld(4, { players: 2, peaceful: true });
    const h = bigHouse(s);
    placeBuilding(s, 1, BuildingKind.TowerStone, 0, h.x + 170, h.z, true);
    run(s, 23);
    expect(s.step % FOG_INTERVAL_STEPS).not.toBe(0);
    const copy = deserializeState(serializeState(s));
    run(s, 57);
    run(copy, 57);
    expect(hashState(copy)).toBe(hashState(s));
    expect(copy.world.explored.size).toBe(s.world.explored.size);
  });
});
