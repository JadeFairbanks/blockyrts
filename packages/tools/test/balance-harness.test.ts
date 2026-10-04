import { describe, expect, it } from 'vitest';
import { runNight } from '../src/harness/defence.ts';
import { pacingCheck, supplyCheck, TIERS } from '../src/harness/pacing.ts';

describe('balance harness', () => {
  it('times every tier of the pacing check from the sim tables', () => {
    const rows = pacingCheck();
    expect(rows.map((r) => r.tier)).toEqual(TIERS.map((t) => t.name));
    for (const r of rows) {
      expect(Number.isFinite(r.materialS) && r.materialS > 0).toBe(true);
      expect(r.night).toBeGreaterThan(0);
    }
    // Each tier comes after the one before.
    for (let k = 1; k < rows.length; k++) expect(rows[k]!.night).toBeGreaterThanOrEqual(rows[k - 1]!.night);
  });

  it('carries the night 110 town on its Farms (mini balance: 7 Farms give 120 supply for 105 units, 14 farmers)', () => {
    const s = supplyCheck();
    expect(s).toMatchObject({ supplyCap: 120, supplyUsed: 105, nutritionPerDay: 210, farmersNeeded: 14, ok: true });
  });

  it('runs night 0 against its fixture: the fence keeps the monsters from the house and the warriors live (the three starting cudgels and a spear)', () => {
    const r = runNight(1, 0);
    expect(r.night).toBe(0);
    expect(r.mobs).toBeGreaterThanOrEqual(10);
    // Since patch notes 1 the Big House's sheds are solid and two workers set down on them step off, and the
    // bats swoop and pull off, so the band ends the bat fight a little apart. The spear then walks right up to
    // its stabbing spot (not to within 1.5 m of it, where it stood out of reach of the north-east corner and the
    // zombies chewed through the fence), stabs over and the fence holds. A column lost is allowed for.
    expect(r.outcome).not.toBe('lost');
    expect(r.wallsLost).toBeLessThanOrEqual(1);
    expect(r.baseHpLostPct).toBe(0);
    expect(r.warriorsLost).toBe(0);
    expect(r.workersLost).toBe(0);
    expect(r.killed).toBeGreaterThanOrEqual(8);
  }, 120_000);
});
