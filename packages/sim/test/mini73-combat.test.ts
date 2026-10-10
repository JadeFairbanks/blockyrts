// Mini patch 7.3 (Jade): any good moves between the stock and a unit's bag
// at a store point, with no bar and a bubble saying what changed hands;
// poison and magic pass armour, magic passes shields; armour stops at 50%;
// a player's unit's damage spells do 4 less.
import { describe, expect, it } from 'vitest';
import {
  addMage,
  addWarrior,
  ARMOUR_CAP_BP,
  ARMOUR_GEAR,
  buildingCentre,
  BuildingKind,
  createWorld,
  fetchAmount,
  gearSpec,
  hurtUnit,
  PEOPLES,
  PLAYER_SPELL_CUT,
  Res,
  School,
  shieldBlock,
  Spell,
  spellAmount,
  spellDamage,
  spellSpec,
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
function swordsman(s: SimState, m: number, weapon = 1, armour = 0, shield = 0): number {
  const [, z0, x1, z1] = solidRect(bigHouse(s));
  const i = addWarrior(s, 0, (x1 + 1) * WU_PER_COLUMN + m * M, ((z0 + z1 + 1) * WU_PER_COLUMN) >> 1, Troop.Close, weapon, armour, shield);
  s.entities.queue[i] = [{ t: 'hold' }];
  return i;
}

function said(s: SimState, i: number, text: string): boolean {
  return s.events.some((ev) => ev.kind === 'speech' && ev.speaker === s.entities.id[i] && ev.text === text);
}

const world = (): SimState => createWorld(1, { peaceful: true });

describe('any good to and from the stock (mini patch 7.3)', () => {
  it('fetches a good that is no food or gear, as many as fit, kept, and says what it got', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    pool[Res.CopperOre] = 500;
    const i = swordsman(s, 30);
    run(s, 1, [{ kind: 'fetchFood', player: 0, units: [e.id[i]!], res: Res.CopperOre }]);
    const o = e.queue[i]![0]!;
    expect(o.t).toBe('fetch');
    const n = o.t === 'fetch' ? o.n : 0;
    expect(n).toBeGreaterThan(1);
    expect(n).toBe(fetchAmount(Res.CopperOre, n, 500));
    runUntil(s, () => e.kept[i]!.length > 0, 60 * SEC);
    expect(e.kept[i]).toEqual([Res.CopperOre, n]);
    expect(pool[Res.CopperOre]).toBe(500 - n);
    expect(said(s, i, `Got ${n} copper ore.`)).toBe(true);
    // No bar: the fetch is done on arrival.
    expect(e.queue[i]![0]).toEqual({ t: 'hold' });
  });

  it('fetches one piece of gear into the bag, and the drag counts what the stock has', () => {
    expect(fetchAmount(Res.SteelSideSword, 5, 3)).toBe(1);
    expect(fetchAmount(Res.Stone, 20, 7)).toBe(7);
    expect(fetchAmount(Res.Blueberries, 20, 9)).toBe(4);
    expect(fetchAmount(Res.Stone, 0, 7)).toBe(0);
  });

  it('says what it handed in on an Unload', () => {
    const s = world();
    const e = s.entities;
    const pool = s.players[0]!.pool;
    const before = pool[Res.CopperOre]!;
    const i = swordsman(s, 30);
    e.bag[i] = [Res.CopperOre, 3];
    run(s, 1, [{ kind: 'unloadItem', player: 0, units: [e.id[i]!], res: Res.CopperOre }]);
    runUntil(s, () => e.bag[i]!.length === 0, 60 * SEC);
    expect(pool[Res.CopperOre]).toBe(before + 3);
    expect(said(s, i, 'Handed in 3 copper ore.')).toBe(true);
  });

  it('gives all of a good that fits, and both say so', () => {
    const s = world();
    const e = s.entities;
    const a = swordsman(s, 30);
    const b = swordsman(s, 32);
    e.bag[a] = [Res.CopperOre, 3];
    run(s, 1, [{ kind: 'giveItem', player: 0, units: [e.id[a]!], res: Res.CopperOre, target: e.id[b]! }]);
    runUntil(s, () => e.bag[a]!.length === 0, 30 * SEC);
    expect(e.bag[b]).toEqual([Res.CopperOre, 3]);
    expect(said(s, a, 'Here, take 3 copper ore.')).toBe(true);
    expect(said(s, b, 'Got 3 copper ore.')).toBe(true);
  });
});

describe('poison, magic, shields and the armour cap (mini patch 7.3)', () => {
  it('lets a poison blow through armour, as magic', () => {
    const s = world();
    const e = s.entities;
    const a = swordsman(s, 30, 5, 8);
    const hp = e.hp[a]!;
    hurtUnit(s, a, { damage: 40, from: 0, projectile: false, blunt: false, pierce: false, poison: true, roll: 0 });
    expect(hp - e.hp[a]!).toBe(40);
  });

  it('blocks a physical shot with a shield but not a magic one', () => {
    const s = world();
    const e = s.entities;
    const a = swordsman(s, 30, 1, 0, 3);
    const b = swordsman(s, 33, 1, 0, 3);
    expect(shieldBlock(s, a)).toBeGreaterThan(0);
    const shot = { damage: 40, from: 0, projectile: true, blunt: false, pierce: true, roll: 0 };
    const hpA = e.hp[a]!;
    const hpB = e.hp[b]!;
    hurtUnit(s, a, shot);
    hurtUnit(s, b, { ...shot, pierce: false, spell: true });
    expect(hpA - e.hp[a]!).toBeLessThan(40);
    expect(hpB - e.hp[b]!).toBe(40);
  });

  it('caps armour at 50%, the top harness exactly there', () => {
    expect(ARMOUR_CAP_BP).toBe(5000);
    expect(gearSpec(ARMOUR_GEAR[8]!).armourBp).toBe(5000);
    for (const g of ARMOUR_GEAR) if (g) expect(gearSpec(g).armourBp ?? 0).toBeLessThanOrEqual(ARMOUR_CAP_BP);
  });

  it('takes 4 off a player\'s mage\'s damage spells, not off a people\'s', () => {
    const s = world();
    const [x, z] = buildingCentre(bigHouse(s));
    const m = addMage(s, 0, x + 30 * M, z, School.Battle);
    for (const sp of [Spell.ArcaneBolt, Spell.Fireball, Spell.AreaBlast, Spell.EnergyDart]) {
      expect(spellDamage(s, m, spellSpec(sp))).toBe(spellAmount(s, m, spellSpec(sp)) - PLAYER_SPELL_CUT);
    }
    s.entities.owner[m] = PEOPLES;
    expect(spellDamage(s, m, spellSpec(Spell.ArcaneBolt))).toBe(spellAmount(s, m, spellSpec(Spell.ArcaneBolt)));
  });
});
