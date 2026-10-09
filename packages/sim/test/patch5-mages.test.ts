// Patch 5's mages (split section 17): autocast (MB-14, MB-15, MB-18), Energy
// dart (MB-16), no melee (MB-21), the arc limit (MB-23), the training bar's
// numbers (MB-24), Area blast (MB-25), group casting (VX-10) and three demon
// horns for each mana crystal (decision 2.5).
import { describe, expect, it } from 'vitest';
import {
  addAnimal,
  addMage,
  autocastOn,
  BuildingKind,
  buildingCentre,
  CYCLE_STEPS,
  createWorld,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  hashState,
  MANA_SCALE,
  NEUTRAL,
  mageTrainingProgress,
  Mob,
  payRankCrystals,
  placeBuilding,
  rankCrystalsIn,
  Res,
  School,
  serializeState,
  setMageRank,
  Species,
  WILD,
  Spell,
  SPELLS,
  step,
  UnitKind,
  WALK_SPEED_WU,
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

function warrior(s: SimState): number {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior) return i;
  throw new Error('no warrior');
}

function spawn(s: SimState, mob: number, x: number, z: number): number {
  run(s, 1, [{ kind: 'debugSpawn', player: 0, mob, x, z }]);
  const e = s.entities;
  let last = -1;
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === mob) last = i;
  return last;
}

/** A peaceful world at night with a mage of a school 60 m out from the first warrior, in the dark where monsters do not burn, and the warrior far from her. */
function setUp(school: number, rank = 1): { s: SimState; m: number; w: number } {
  const s = createWorld(1, { peaceful: true });
  s.step = CYCLE_STEPS + DAY_STEPS + DUSK_STEPS;
  const e = s.entities;
  const w = warrior(s);
  const m = addMage(s, 0, e.x[w]! + 60 * M, e.z[w]!, school);
  setMageRank(s, m, rank);
  e.mana[m] = 1000 * MANA_SCALE;
  return { s, m, w };
}

/** A giant rat (no tricks: it neither splits nor rises) at a spot: its entity id, and its health after its first step. */
function rat(s: SimState, x: number, z: number): { id: number; hp: number } {
  const id = s.entities.id[spawn(s, Mob.GiantRat, x, z)]!;
  step(s);
  return { id, hp: hpOf(s, id) };
}

/** A unit's health by entity id (units move in the table as others die), 0 once it is gone. */
function hpOf(s: SimState, id: number): number {
  const i = s.entities.indexOf(id);
  return i < 0 ? 0 : Math.max(0, s.entities.hp[i]!);
}

const autocast = (s: SimState, m: number, spell: number, on: boolean): void => run(s, 1, [{ kind: 'autocast', player: 0, units: [s.entities.id[m]!], spell, on: on ? 1 : 0 }]);

const alerts = (s: SimState): string[] => s.events.filter((ev) => ev.kind === 'alert').map((ev) => ev.text);

describe('autocast (MB-14, MB-15, MB-18)', () => {
  it('starts a battle mage on Arcane bolt and Counterspell, and a support mage on Heal and Energy dart', () => {
    const battle = setUp(School.Battle);
    expect(autocastOn(battle.s, battle.m, Spell.ArcaneBolt)).toBe(true);
    expect(autocastOn(battle.s, battle.m, Spell.Counterspell)).toBe(true);
    expect(autocastOn(battle.s, battle.m, Spell.Beam)).toBe(false);
    const support = setUp(School.Support);
    expect(autocastOn(support.s, support.m, Spell.Heal)).toBe(true);
    expect(autocastOn(support.s, support.m, Spell.EnergyDart)).toBe(true);
    expect(autocastOn(support.s, support.m, Spell.Quicken)).toBe(false);
  });

  it('keeps one attack spell on a battle mage: a new one takes the old one off, the last cannot come off', () => {
    const { s, m } = setUp(School.Battle, 2);
    autocast(s, m, Spell.Beam, true);
    expect(autocastOn(s, m, Spell.Beam)).toBe(true);
    expect(autocastOn(s, m, Spell.ArcaneBolt)).toBe(false);
    // Counterspell stays on beside it.
    expect(autocastOn(s, m, Spell.Counterspell)).toBe(true);
    autocast(s, m, Spell.Counterspell, false);
    autocast(s, m, Spell.Beam, false);
    expect(alerts(s)).toContain('A battle mage always keeps one spell on autocast.');
    expect(autocastOn(s, m, Spell.Beam)).toBe(true);
    // A spell she has not learned cannot go on.
    autocast(s, m, Spell.AreaBlast, true);
    expect(alerts(s)).toContain('Area blast is learned at rank 4.');
    expect(autocastOn(s, m, Spell.AreaBlast)).toBe(false);
  });

  it('lets a support mage have several on, or none, and keeps them in a save', () => {
    const { s, m } = setUp(School.Support, 2);
    autocast(s, m, Spell.Quicken, true);
    expect([Spell.Heal, Spell.Quicken, Spell.EnergyDart].map((sp) => autocastOn(s, m, sp))).toEqual([true, true, true]);
    for (const sp of [Spell.Heal, Spell.Quicken, Spell.EnergyDart]) autocast(s, m, sp, false);
    expect(s.entities.autocast[m]).toBe(0);
    autocast(s, m, Spell.Heal, true);
    const copy = deserializeState(serializeState(s));
    expect(copy.entities.autocast[m]).toBe(s.entities.autocast[m]);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('fighting with spells only (MB-14, MB-16, MB-21)', () => {
  it('sends a fresh support mage at a zombie with Energy dart, from range', () => {
    const { s, m } = setUp(School.Support);
    const e = s.entities;
    const me = e.id[m]!;
    const { id: z, hp } = rat(s, e.x[m]! + 12 * M, e.z[m]!);
    const mana = e.mana[m]!;
    run(s, 1, [{ kind: 'attack', player: 0, units: [me], target: z }]);
    run(s, 6 * SEC);
    expect(hpOf(s, z)).toBeLessThan(hp);
    expect(mana - e.mana[e.indexOf(me)]!).toBeGreaterThanOrEqual(SPELLS[Spell.EnergyDart]!.mana * MANA_SCALE);
  });

  it('never fights in melee: with no attack spell on autocast she says so and does not attack', () => {
    const { s, m } = setUp(School.Support);
    const e = s.entities;
    autocast(s, m, Spell.EnergyDart, false);
    const { id: z, hp } = rat(s, e.x[m]! + 1 * M, e.z[m]!);
    step(s, [{ kind: 'attack', player: 0, units: [e.id[m]!], target: z }]);
    const said: string[] = [];
    for (let k = 0; k < 5 * SEC; k++) {
      said.push(...alerts(s));
      step(s);
    }
    expect(said).toContain('A support mage has no attack spell on autocast. Right-click one of her spells to set one.');
    expect(hpOf(s, z)).toBe(hp);
  });

  it('does not swing her wand when her mana is gone', () => {
    const { s, m } = setUp(School.Battle);
    const e = s.entities;
    const me = e.id[m]!;
    const { id: z, hp } = rat(s, e.x[m]! + 1 * M, e.z[m]!);
    e.mana[m] = 0;
    run(s, 1, [{ kind: 'attack', player: 0, units: [me], target: z }]);
    for (let k = 0; k < 4 * SEC; k++) {
      e.mana[e.indexOf(me)] = 0;
      step(s);
    }
    expect(hpOf(s, z)).toBe(hp);
  });
});

describe('a cast order goes to every selected mage who knows it (VX-10)', () => {
  it('has two battle mages both bolt the zombie', () => {
    const { s, m } = setUp(School.Battle);
    const e = s.entities;
    const m2 = addMage(s, 0, e.x[m]!, e.z[m]! + 2 * M, School.Battle);
    e.mana[m2] = 1000 * MANA_SCALE;
    const z = spawn(s, Mob.Zombie, e.x[m]! + 10 * M, e.z[m]!);
    e.hp[z] = 1000;
    const before = [e.mana[m]!, e.mana[m2]!];
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[m]!, e.id[m2]!], spell: Spell.ArcaneBolt, target: e.id[z]!, x: 0, z: 0, auto: 0 }]);
    run(s, 2 * SEC);
    expect(e.mana[m]!).toBeLessThan(before[0]!);
    expect(e.mana[m2]!).toBeLessThan(before[1]!);
  });
});

describe('Area blast (MB-25)', () => {
  it('cast on a unit lands where it is, and hurts every unit that is not a player\'s, hostile or not', () => {
    const { s, m, w } = setUp(School.Battle, 4);
    const e = s.entities;
    const z = spawn(s, Mob.Zombie, e.x[m]! + 12 * M, e.z[m]!);
    const deer = addAnimal(s, Species.Deer, WILD, e.x[z]! + 1 * M, e.z[z]! + 1 * M, 0, 0);
    // A wanderer nobody owns is "non player" too (MB-25).
    const stray = e.add(s.nextEntityId++, NEUTRAL, e.x[z]!, e.y[z]!, e.z[z]! - 1 * M, WALK_SPEED_WU, UnitKind.Wanderer);
    // The warrior stands in the blast too: a player's own unit is spared.
    e.x[w] = e.x[z]! - 1 * M;
    e.z[w] = e.z[z]!;
    e.hp[z] = 1000;
    e.hp[deer] = 1000;
    e.hp[stray] = 1000;
    const hp = { z: e.hp[z]!, deer: e.hp[deer]!, stray: e.hp[stray]!, w: e.hp[w]! };
    run(s, 1, [{ kind: 'cast', player: 0, units: [e.id[m]!], spell: Spell.AreaBlast, target: e.id[z]!, x: 0, z: 0, auto: 0 }]);
    run(s, 3 * SEC);
    expect(e.hp[z]!).toBeLessThan(hp.z);
    expect(e.hp[deer]!).toBeLessThan(hp.deer);
    expect(e.hp[stray]!).toBeLessThan(hp.stray);
    expect(e.hp[w]).toBe(hp.w);
  });
});

describe('the Magi Sanctum (MB-24, decision 2.5)', () => {
  it('takes three demon horns for each mana crystal, horns first', () => {
    const pool = new Int32Array(64);
    pool[Res.ManaCrystal] = 1;
    pool[Res.DemonHorn] = 7;
    expect(rankCrystalsIn(pool)).toBe(3);
    expect(payRankCrystals(pool, 2)).toBe(true);
    expect([pool[Res.ManaCrystal], pool[Res.DemonHorn]]).toEqual([1, 1]);
    expect(payRankCrystals(pool, 2)).toBe(false);
    expect(payRankCrystals(pool, 1)).toBe(true);
    expect([pool[Res.ManaCrystal], pool[Res.DemonHorn]]).toEqual([0, 1]);
  });

  it('trains a mage on 6 demon horns in place of 2 mana crystals, with the training bar\'s numbers on the way', () => {
    const { s, m } = setUp(School.Support, 3);
    const e = s.entities;
    const p = s.players[0]!;
    const big = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    const sanctum = placeBuilding(s, 0, BuildingKind.MagiSanctum, 0, big.x + 16, big.z, true);
    const [x, z] = buildingCentre(sanctum);
    e.x[m] = x + 8 * M;
    e.z[m] = z;
    e.xp[m] = 100000;
    p.pool[Res.ManaCrystal] = 0;
    p.pool[Res.DemonHorn] = 6;
    p.pool[Res.Venison] = 200;
    run(s, 1, [{ kind: 'trainRank', player: 0, units: [e.id[m]!], building: sanctum.id }]);
    let seen: { done: number; total: number } | null = null;
    for (let k = 0; k < 200 * SEC && e.rank[m] === 3; k++) {
      seen = mageTrainingProgress(s, m) ?? seen;
      step(s);
    }
    expect(e.rank[m]).toBe(4);
    expect(p.pool[Res.DemonHorn]).toBe(0);
    expect(seen).not.toBeNull();
    expect(seen!.done).toBeGreaterThan(0);
    expect(seen!.done).toBeLessThanOrEqual(seen!.total);
  });
});
