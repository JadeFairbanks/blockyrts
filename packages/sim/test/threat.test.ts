// Patch 3 (Jade's notes; picks in blueprint/patch3-threat-waves-picks.md):
// every night monster's threat is worked out from its numbers and traits,
// never set by hand; each lair sends a night's worth of its own sleepers'
// threat; the wanderers come three times as thick; and each player's waves
// are planned on their own budget.

import { describe, expect, it } from 'vitest';
import {
  addLair,
  addMob,
  Area,
  BP,
  buildingCentre,
  BuildingKind,
  Comes,
  createWorld,
  damagePerSecond100,
  effectiveHealth100,
  lairBudgetTenths,
  lairCompany,
  LAIRS,
  lairSpawns,
  Mob,
  MOBS,
  mobSpec,
  nightBudgetTenths,
  nightMobs,
  OVER_WALL_REACH,
  rowThreatTenths,
  settleDeaths,
  THREAT,
  threatInput,
  threatPct,
  threatTenths,
  Trait,
  TRAIT_PCT,
  UnitKind,
  patchRoll,
  patchRolls,
  WILD_DENSITY_PCT,
  WU_PER_METRE,
  type SimState,
  type ThreatInput,
} from '../src/index.ts';

const M = WU_PER_METRE;

/** A plain body: no armour, one blow on one unit, no range or traits. */
const BODY: ThreatInput = {
  hp: 60, armourBp: 0, pierceBp: BP, bluntBp: BP, blockBp: 0, damage: 8, poison: 0, attackSteps: 32, area: Area.One,
  splash: 0, vsWalls: 0, range: 0, reach: M, speed: 2, once: false, traits: [],
};

function nightMonsters(): typeof MOBS {
  return MOBS.filter((m) => m.role === 0 && m.comes !== Comes.Never);
}

describe('threat worked out from a monster\'s numbers', () => {
  it('gives every night monster a threat, and nothing else one', () => {
    for (const m of MOBS) {
      if (m.role === 0 && m.comes !== Comes.Never) expect(m.threatTenths, m.name).toBeGreaterThan(0);
      else expect(m.threatTenths, m.name).toBe(0);
    }
    expect(mobSpec(Mob.Morvath).threatTenths).toBe(0);
  });

  it('is what the algorithm makes of each row, so a new monster gets its threat from its row alone', () => {
    for (const m of nightMonsters()) expect(rowThreatTenths(m), m.name).toBe(m.threatTenths);
    // A zombie twice as tough, or hitting twice as hard, is worth more; one as tough and as hard is worth the same.
    const zombie = mobSpec(Mob.Zombie);
    expect(rowThreatTenths({ ...zombie })).toBe(zombie.threatTenths);
    expect(rowThreatTenths({ ...zombie, hp: zombie.hp * 2 })).toBeGreaterThan(zombie.threatTenths);
    expect(rowThreatTenths({ ...zombie, damage: zombie.damage * 2 })).toBeGreaterThan(zombie.threatTenths);
  });

  it('makes a zombie one and a half threat points, a body with two thirds of its health and damage one', () => {
    expect(mobSpec(Mob.Zombie).threatTenths).toBe(15);
    expect(effectiveHealth100({ ...BODY, hp: THREAT.unitHealth })).toBe(THREAT.unitHealth * 100);
  });

  it('rates the giant spider by its numbers: less over the zombie than the roster had it, and level with one on a zombie\'s bite', () => {
    const spider = mobSpec(Mob.GiantSpider);
    const zombie = mobSpec(Mob.Zombie);
    // Jade's example: the roster had it at three zombies. Its bite (16 every 1.3 s, two and a half times a zombie's) is what
    // keeps it above one; with a zombie's bite its 40 health, speed and climbing come out level with a zombie.
    expect(spider.threatTenths).toBeLessThan(2 * zombie.threatTenths);
    expect(rowThreatTenths({ ...spider, damage: zombie.damage, attackSteps: zombie.attackSteps })).toBe(zombie.threatTenths);
  });

  it('never falls as health or damage rises', () => {
    let last = 0;
    for (let hp = 10; hp <= 2000; hp += 10) {
      const t = threatTenths({ ...BODY, hp });
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    last = 0;
    for (let damage = 1; damage <= 200; damage++) {
      const t = threatTenths({ ...BODY, damage });
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('counts armour, a weak spot to arrows and a sweeping blow', () => {
    expect(effectiveHealth100({ ...BODY, armourBp: 2000 })).toBeGreaterThan(effectiveHealth100(BODY));
    expect(effectiveHealth100({ ...BODY, pierceBp: BP >> 1 })).toBeGreaterThan(effectiveHealth100(BODY));
    expect(effectiveHealth100({ ...BODY, bluntBp: BP * 2 })).toBeLessThan(effectiveHealth100(BODY));
    expect(damagePerSecond100({ ...BODY, area: Area.Arc })).toBeGreaterThan(damagePerSecond100(BODY));
  });

  it('adds nothing for a melee flyer, about a fifth for a ranged flyer and about a twentieth for a climber (Jade\'s notes)', () => {
    const base = threatPct(BODY);
    expect(threatPct({ ...BODY, traits: [Trait.MeleeFlyer] }) - base).toBe(0);
    expect(threatPct({ ...BODY, traits: [Trait.RangedFlyer] }) - base).toBe(20);
    expect(threatPct({ ...BODY, traits: [Trait.Climber] }) - base).toBe(5);
    expect(TRAIT_PCT.length).toBe(Object.keys(Trait).length);
    for (const [name, t] of Object.entries(Trait)) {
      if (t === Trait.WeakBack) expect(TRAIT_PCT[t], name).toBeLessThan(0);
      else expect(TRAIT_PCT[t], name).toBeGreaterThanOrEqual(0);
    }
  });

  it('reads flying, climbing and breaking walls from each monster\'s row', () => {
    expect(threatInput(mobSpec(Mob.CaveBat)).traits).toContain(Trait.MeleeFlyer);
    expect(threatInput(mobSpec(Mob.Scorchwing)).traits).toContain(Trait.RangedFlyer);
    expect(threatInput(mobSpec(Mob.GiantSpider)).traits).toContain(Trait.Climber);
    expect(threatInput(mobSpec(Mob.Cinderling)).traits).toContain(Trait.WoodClimber);
    expect(threatInput(mobSpec(Mob.Zombie)).traits).not.toContain(Trait.MeleeFlyer);
  });

  it('strikes over walls from the same reach the fight does', () => {
    expect(Math.floor((THREAT.overWallReachCm * M) / 100)).toBe(OVER_WALL_REACH);
  });

  it('counts what a slime splits into', () => {
    const slime = mobSpec(Mob.Slime);
    expect(slime.splitsInto).toEqual([[Mob.SmallSlime, 2]]);
    expect(rowThreatTenths({ ...slime, splitsInto: [] })).toBeLessThan(slime.threatTenths);
  });
});

describe('a slime that dies', () => {
  it('still splits into two small slimes half a metre either side of where it fell', () => {
    const s = createWorld(1, { players: 1, peaceful: true });
    const home = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
    const x = home[0] + 60 * M;
    const z = home[1];
    const i = addMob(s, Mob.Slime, 0, x, z, 0);
    const e = s.entities;
    e.hp[i] = 0;
    s.dying.push(e.id[i]!);
    settleDeaths(s);
    const small: number[] = [];
    for (let k = 0; k < e.count; k++) if (e.kind[k] === UnitKind.Mob && e.mob[k] === Mob.SmallSlime && e.hp[k]! > 0) small.push(k);
    expect(small.length).toBe(2);
    expect(small.map((k) => e.x[k]! - x).sort((a, b) => a - b)).toEqual([-(M >> 1), M >> 1]);
  });
});

describe('lairs\' budgets (Jade\'s notes: a budget per lair by its threat)', () => {
  it('give every lair a budget from the night it can first come, larger for the stronger lairs', () => {
    for (const l of LAIRS) {
      const night = Math.max(1, l.firstNight);
      expect(lairCompany(l.mob, night).length, `${l.mob}`).toBeGreaterThan(0);
      expect(lairBudgetTenths(l.mob, night), `${l.mob}`).toBeGreaterThan(0);
    }
    // A mass grave's bloated corpses are worth more than a cave mouth's bats and rats.
    expect(lairBudgetTenths(Mob.LairMassGrave, 12)).toBeGreaterThan(lairBudgetTenths(Mob.LairCaveMouth, 12));
  });

  it('send their own budget on top of the dark edge\'s, out of their own kinds', () => {
    const night = 12;
    const s = createWorld(1, { players: 1 });
    const home = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
    const spec = LAIRS.find((l) => l.mob === Mob.LairMassGrave)!;
    const id = addLair(s, spec, 0, home[0] + 150 * M, home[1], night);
    const planned = nightMobs(s, 0, night);
    const fromLair = planned.filter((p) => p.src === id);
    const spent = fromLair.reduce((n, p) => n + mobSpec(p.mob).threatTenths, 0);
    expect(spent).toBeGreaterThanOrEqual(lairBudgetTenths(Mob.LairMassGrave, night));
    for (const p of fromLair) expect(lairSpawns(Mob.LairMassGrave)).toContain(p.mob);
  });
});

describe('waves per player', () => {
  /** The threat each player's night spends from the dark edge. */
  function edgeSpend(s: SimState, player: number, night: number): number {
    return nightMobs(s, player, night).filter((p) => p.src === 0).reduce((n, p) => n + mobSpec(p.mob).threatTenths, 0);
  }

  it('plans each player\'s night on their own budget, so two players face twice the monsters', () => {
    for (const night of [3, 12, 40]) {
      const s = createWorld(2, { players: 2 });
      const edge = Math.floor((nightBudgetTenths(night) * 800) / 1000);
      for (const p of [0, 1]) expect(edgeSpend(s, p, night), `night ${night} player ${p}`).toBeGreaterThanOrEqual(edge);
    }
  });
});

describe('wanderers (Jade\'s notes: triple the wandering night monsters)', () => {
  it('roll three times in every patch, so about three times the monsters come out of the same land', () => {
    expect(WILD_DENSITY_PCT).toBe(300);
    let rolls = 0;
    let more = 0;
    let once = 0;
    for (let p = 0; p < 400; p++) {
      const px = (p % 20) - 10;
      const pz = Math.floor(p / 20) - 10;
      rolls += patchRolls(1, 12, px, pz);
      const all = [0, 1, 2].map((k) => patchRoll(1, 12, px, pz, 1000, k)[1]).reduce((a, b) => a + b, 0);
      once += patchRoll(1, 12, px, pz, 1000)[1];
      more += all;
    }
    expect(rolls).toBe(1200);
    expect(more / once).toBeGreaterThan(2.7);
    expect(more / once).toBeLessThan(3.3);
  });
});
