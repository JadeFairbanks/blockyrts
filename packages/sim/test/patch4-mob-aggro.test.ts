// Jade's Patch 4: monsters turn on the troops. A monster chasing a worker or
// breaking a building that a troop hurts switches to the nearest troop, not
// necessarily the one that hurt it (picks in blueprint/patch4-mob-aggro-picks.md).

import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  buildingCentre,
  BuildingKind,
  combatTroop,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  gap,
  hashState,
  hurtUnit,
  landAt,
  Mob,
  onTop,
  Role,
  runMob,
  serializeState,
  step,
  Troop,
  TROOP_AGGRO,
  UnitKind,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const NIGHT_START = DAY_STEPS + DUSK_STEPS;

interface Field {
  s: SimState;
  /** A spot in the open 40 m east of the Big House. */
  x: number;
  z: number;
  /** A worker of player 0 standing there, and the other starting units, sent 150 m off. */
  worker: number;
  others: number[];
}

/** A peaceful world (no waves) on night 1, with a worker out in the open and everyone else far off. */
function field(seed = 1): Field {
  const s = createWorld(seed, { peaceful: true });
  const e = s.entities;
  const house = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  const [hx, hz] = buildingCentre(house);
  const x = hx + 40 * M;
  const z = hz;
  let worker = -1;
  const others: number[] = [];
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== 0) continue;
    e.queue[i] = [];
    if (worker < 0 && e.kind[i] === UnitKind.Worker) {
      worker = i;
      landAt(s, i, x, z);
    } else {
      others.push(i);
      landAt(s, i, hx - 150 * M + others.length * 2 * M, hz + 150 * M);
    }
  }
  s.step = CYCLE_STEPS + NIGHT_START;
  return { s, x, z, worker, others };
}

/** The unit grid as a step builds it, after units were set down by hand. */
function fresh(s: SimState): void {
  s.grid.rebuild(s.entities, (i) => onTop(s, i));
}

function hit(s: SimState, mob: number, by: number): void {
  hurtUnit(s, mob, { damage: 1, from: s.entities.id[by]!, projectile: true, blunt: false, pierce: true });
}

function targetOf(s: SimState, i: number): number {
  return s.entities.indexOf(s.entities.target[i]!);
}

describe('a monster a troop hurts turns on the nearest troop (Jade\'s Patch 4)', () => {
  it('leaves the worker it chases for the nearest troop, not the archer that shot it', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    const sword = addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 5 * M, z - 18 * M, Troop.Ranger, 2);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
    hit(s, zombie, archer);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
    expect(combatTroop(s, sword)).toBe(true);
    expect(combatTroop(s, worker)).toBe(false);
    // The archer shooting again does not pull it off the troop it has.
    for (let k = 0; k < 40; k++) {
      s.step++;
      if (k % 10 === 0) hit(s, zombie, archer);
      fresh(s);
      runMob(s, zombie);
      expect(targetOf(s, zombie)).toBe(sword);
    }
    expect(e.hp[zombie]).toBeGreaterThan(0);
  });

  it('goes back to what it would do once no troop has hurt it for a while and its troop is out of reach', () => {
    const { s, x, z, worker } = field();
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    const sword = addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    fresh(s);
    runMob(s, zombie);
    hit(s, zombie, sword);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
    // The swordsman walks off 30 m, out of its chase, and nothing hurts it for TROOP_AGGRO.steps.
    landAt(s, sword, s.entities.x[zombie]!, s.entities.z[zombie]! + 30 * M);
    s.step += TROOP_AGGRO.steps;
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
    s.step++;
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
  });

  it('stops breaking a building for the nearest troop, even one farther than it sees, when that troop hurt it', () => {
    const { s } = field();
    const e = s.entities;
    const house = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    const [hx, hz] = buildingCentre(house);
    // A zombie at the Big House's west wall, breaking it.
    const zombie = addMob(s, Mob.Zombie, 0, hx - 9 * M, hz, 1);
    let k = 0;
    for (; k < 400 && e.target[zombie] !== house.id; k++) step(s);
    expect(e.target[zombie]).toBe(house.id);
    const wallHp = house.hp;
    // An archer 22 m off shoots it: beyond its 12 m sight and its 20 m chase, it still comes.
    const archer = addWarrior(s, 0, e.x[zombie]! - 22 * M, e.z[zombie]!, Troop.Ranger, 2);
    hit(s, zombie, archer);
    for (k = 0; k < 60 && targetOf(s, zombie) !== archer; k++) step(s);
    expect(targetOf(s, zombie)).toBe(archer);
    const before = gap(s, zombie, archer);
    // While the archer keeps shooting it comes on, and the Big House is left alone.
    for (k = 0; k < 60; k++) {
      if (k % 20 === 0) hit(s, zombie, archer);
      step(s);
    }
    expect(gap(s, zombie, archer)).toBeLessThan(before - 4 * M);
    expect(house.hp).toBeGreaterThanOrEqual(wallHp - 20);
  });

  it('looks round itself as far as it sees for a troop when the one that hurt it is out of its reach', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    // An archer it cannot get at (inside a building: up a tower, say), 6 m off.
    const archer = addWarrior(s, 0, x + 5 * M, z - 6 * M, Troop.Ranger, 2);
    const house = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    e.inside[archer] = house.id;
    const sword = addWarrior(s, 0, x + 5 * M, z + 15 * M, Troop.Close, 1);
    fresh(s);
    runMob(s, zombie);
    hit(s, zombie, archer);
    fresh(s);
    runMob(s, zombie);
    // The swordsman is 15 m off, past its 12 m look: it carries on after the worker.
    expect(targetOf(s, zombie)).toBe(worker);
    landAt(s, sword, x + 5 * M, z + 10 * M);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
  });

  it('looks half as far on a fog night', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    s.threats.fog = 1;
    const zombie = addMob(s, Mob.Zombie, 0, x + 3 * M, z, 1);
    const archer = addWarrior(s, 0, x + 3 * M, z - 2 * M, Troop.Ranger, 2);
    const house = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    e.inside[archer] = house.id;
    const sword = addWarrior(s, 0, x + 3 * M, z + 8 * M, Troop.Close, 1);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
    hit(s, zombie, archer);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
    landAt(s, sword, x + 3 * M, z + 5 * M);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
  });

  it('still turns when a worker hit it after the troop did', () => {
    const { s, x, z, worker } = field();
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    const sword = addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    fresh(s);
    runMob(s, zombie);
    hit(s, zombie, sword);
    hit(s, zombie, worker);
    expect(s.entities.attacker[zombie]).toBe(s.entities.id[worker]);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
  });

  it('is not turned by a worker\'s blow alone', () => {
    const { s, x, z, worker } = field();
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    fresh(s);
    runMob(s, zombie);
    hit(s, zombie, worker);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
  });

  it('is off with 0 in the editor', () => {
    const { s, x, z, worker } = field();
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    const sword = addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    const was = TROOP_AGGRO.steps;
    TROOP_AGGRO.steps = 0;
    try {
      fresh(s);
      runMob(s, zombie);
      hit(s, zombie, sword);
      fresh(s);
      runMob(s, zombie);
      expect(targetOf(s, zombie)).toBe(worker);
    } finally {
      TROOP_AGGRO.steps = was;
    }
  });

  it('turns a skeleton bomber on the nearest troop, and it goes off beside it', () => {
    const { s, x, z } = field();
    const e = s.entities;
    const bomber = addMob(s, Mob.SkeletonBomber, 0, x + 10 * M, z, 10);
    const sword = addWarrior(s, 0, x + 10 * M, z + 6 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 10 * M, z - 15 * M, Troop.Ranger, 2);
    e.hp[sword] = 10_000;
    e.maxHp[sword] = 10_000;
    hit(s, bomber, archer);
    fresh(s);
    runMob(s, bomber);
    expect(targetOf(s, bomber)).toBe(sword);
    let k = 0;
    for (; k < 200 && e.hp[bomber]! > 0; k++) {
      if (k % 20 === 0 && e.hp[bomber]! > 0) hit(s, bomber, archer);
      step(s);
    }
    expect(e.hp[e.indexOf(e.id[sword]!)]).toBeLessThan(10_000);
  });

  it('turns a wandering monster on the nearest troop rather than the one that hurt it', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const zombie = addMob(s, Mob.Zombie, 0, x + 3 * M, z, 1);
    e.role[zombie] = Role.Wild;
    e.homeX[zombie] = e.x[zombie]!;
    e.homeZ[zombie] = e.z[zombie]!;
    e.target[zombie] = e.id[worker]!;
    const sword = addWarrior(s, 0, x + 3 * M, z + 6 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 3 * M, z - 14 * M, Troop.Ranger, 2);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(worker);
    hit(s, zombie, archer);
    fresh(s);
    runMob(s, zombie);
    expect(targetOf(s, zombie)).toBe(sword);
  });

  it('turns a lair\'s guardian on the nearest troop within its leash', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const ghoul = addMob(s, Mob.Zombie, 0, x + 3 * M, z, 1);
    e.role[ghoul] = Role.Resident;
    e.homeX[ghoul] = x;
    e.homeZ[ghoul] = z;
    e.target[ghoul] = e.id[worker]!;
    const sword = addWarrior(s, 0, x + 3 * M, z + 6 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 3 * M, z - 14 * M, Troop.Ranger, 2);
    fresh(s);
    runMob(s, ghoul);
    expect(targetOf(s, ghoul)).toBe(worker);
    hit(s, ghoul, archer);
    fresh(s);
    runMob(s, ghoul);
    expect(targetOf(s, ghoul)).toBe(sword);
  });

  it('turns a tribesman and his band from their quarry onto the nearest troop', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const band = { id: 900_001, tribe: Mob.Gnoll, x, z, camp: 0, campX: 0, campZ: 0, target: e.id[worker]!, sawAt: s.step };
    s.threats.bands.push(band);
    const gnoll = addMob(s, Mob.Gnoll, 0, x + 3 * M, z, 1);
    e.role[gnoll] = Role.Tribe;
    e.group[gnoll] = band.id;
    const sword = addWarrior(s, 0, x + 3 * M, z + 6 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 3 * M, z - 14 * M, Troop.Ranger, 2);
    fresh(s);
    runMob(s, gnoll);
    expect(targetOf(s, gnoll)).toBe(worker);
    hit(s, gnoll, archer);
    fresh(s);
    runMob(s, gnoll);
    expect(targetOf(s, gnoll)).toBe(sword);
    expect(band.target).toBe(e.id[sword]);
  });

  it('keeps a gravewing on the troops instead of snatching a lone worker', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const wing = addMob(s, Mob.Gravewing, 0, x + 10 * M, z, 30);
    const sword = addWarrior(s, 0, x + 10 * M, z + 8 * M, Troop.Long, 1);
    fresh(s);
    runMob(s, wing);
    expect(targetOf(s, wing)).toBe(worker);
    hit(s, wing, sword);
    for (let k = 0; k < 20; k++) {
      s.step++;
      fresh(s);
      runMob(s, wing);
      if (e.atkAt[wing] === 0 && s.step >= e.atkNext[wing]!) expect(targetOf(s, wing)).toBe(sword);
    }
    expect(targetOf(s, wing)).toBe(sword);
  });

  it('peels a zombie off a worker when the idle warriors come to its help', () => {
    const { s, x, z, worker } = field();
    const e = s.entities;
    const zombie = addMob(s, Mob.Zombie, 0, x + 4 * M, z, 1);
    addWarrior(s, 0, x - 8 * M, z + 6 * M, Troop.Close, 1);
    addWarrior(s, 0, x - 8 * M, z - 6 * M, Troop.Close, 1);
    let turned = -1;
    for (let k = 0; k < 600 && e.hp[zombie]! > 0; k++) {
      step(s);
      const t = targetOf(s, zombie);
      if (turned < 0 && t >= 0 && combatTroop(s, t)) turned = s.step;
    }
    expect(turned).toBeGreaterThan(0);
    expect(e.hp[worker]).toBeGreaterThan(0);
  });

  it('carries on to the same hash from a save taken while it is turned', () => {
    const { s, x, z } = field();
    const zombie = addMob(s, Mob.Zombie, 0, x + 5 * M, z, 1);
    addWarrior(s, 0, x + 5 * M, z + 7 * M, Troop.Close, 1);
    const archer = addWarrior(s, 0, x + 5 * M, z - 18 * M, Troop.Ranger, 2);
    step(s);
    hit(s, zombie, archer);
    step(s);
    const copy = deserializeState(serializeState(s));
    for (let k = 0; k < 100; k++) {
      step(s);
      step(copy);
    }
    expect(hashState(copy)).toBe(hashState(s));
  });
});
