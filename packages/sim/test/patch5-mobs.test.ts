// Jade's Patch 5, mobs and waves (picks in blueprint/patch5-mobs-picks.md):
// the damage cuts held in tenths, the waves going for every base and party
// (MB-1), their size with the player count (EX-3) and Bright Nights.

import { afterEach, describe, expect, it } from 'vitest';
import {
  aimsOf,
  brightHooks,
  buildingCentre,
  BuildingKind,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  DUSK_STEPS,
  landAt,
  Mob,
  mobSpec,
  Role,
  Species,
  speciesSpec,
  UnitKind,
  updateSpawns,
  wholeDamage,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;
const NIGHT_START = DAY_STEPS + DUSK_STEPS;

/** The threat each player's planned night holds, at nightfall of a night. */
function planned(s: SimState, night: number): number[] {
  s.step = night * CYCLE_STEPS + NIGHT_START;
  updateSpawns(s);
  const per = s.players.map(() => 0);
  for (const p of s.spawns) per[p.player]! += mobSpec(p.mob).threatTenths;
  return per;
}

afterEach(() => {
  brightHooks.bright = () => false;
});

describe('the damage cuts (BL-5, BL-9)', () => {
  it('hold the cut blows in tenths, each blow whole and the tenths as that share of one more', () => {
    expect(mobSpec(Mob.Zombie).damageTenths).toBe(76);
    expect(mobSpec(Mob.GiantRat).damageTenths).toBe(50);
    expect(speciesSpec(Species.Wolf).damageTenths).toBe(85);
    const s = createWorld(1);
    let sum = 0;
    for (let k = 0; k < 2000; k++) {
      s.step = k;
      const d = wholeDamage(s, 0, 85);
      expect(d === 8 || d === 9).toBe(true);
      sum += d;
    }
    expect(sum / 2000).toBeGreaterThan(8.4);
    expect(sum / 2000).toBeLessThan(8.6);
  });
});

describe('waves for every player (EX-3)', () => {
  it('double for two players and triple for three, each on its own share', () => {
    for (const night of [4, 20, 60]) {
      const one = planned(createWorld(5, { players: 1 }), night)[0]!;
      for (const n of [2, 3]) {
        const per = planned(createWorld(5, { players: n }), night);
        const total = per.reduce((a, b) => a + b, 0);
        expect(total / one, `night ${night}, ${n} players`).toBeGreaterThan(n * 0.9);
        expect(total / one, `night ${night}, ${n} players`).toBeLessThan(n * 1.1);
      }
    }
  });

  it('leave out a player\'s share on their Bright Night, and send no wave at all in single player', () => {
    brightHooks.bright = (_s, p) => p === 1;
    const per = planned(createWorld(5, { players: 2 }), 12);
    expect(per[0]).toBeGreaterThan(0);
    expect(per[1]).toBe(0);
    brightHooks.bright = () => true;
    expect(planned(createWorld(5, { players: 1 }), 12)[0]).toBe(0);
  });
});

describe('what the waves go for (MB-1)', () => {
  it('sends the night\'s groups for the bases and for parties out in the open, by worth', () => {
    const s = createWorld(7, { players: 1 });
    const house = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
    const e = s.entities;
    // Two workers 150 m off are a party.
    const out = [0, 1, 2, 3].filter((i) => e.owner[i] === 0 && e.kind[i] === UnitKind.Worker).slice(0, 2);
    out.forEach((i, k) => landAt(s, i, house[0] + 150 * M + k * M, house[1]));
    const aims = aimsOf(s, 0);
    const party = aims.find((a) => !a.base)!;
    expect(aims.some((a) => a.base)).toBe(true);
    expect(party.worth).toBe(4);
    expect(Math.abs(party.x - (house[0] + 150 * M))).toBeLessThan(2 * M);
    // Over a long night most groups go for the base and some for the party; every group is aimed.
    s.step = 30 * CYCLE_STEPS + NIGHT_START;
    updateSpawns(s);
    expect(s.spawns.length).toBeGreaterThan(0);
    for (const p of s.spawns) expect(p.role).toBe(Role.Aimed);
    const atParty = new Set(s.spawns.filter((p) => p.ax === party.x && p.az === party.z).map((p) => p.group));
    const groups = new Set(s.spawns.map((p) => p.group));
    expect(atParty.size).toBeGreaterThan(0);
    expect(atParty.size).toBeLessThan(groups.size);
  });
});
