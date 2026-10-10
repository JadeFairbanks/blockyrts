import { describe, expect, it } from 'vitest';
import { NIGHT_BUDGET, nightBudgetTenths } from '../src/combat/spawn.ts';

// The budget before mini patch 7.3: 12 + (n - 1) + 3n + 0.04n^2, in tenths.
const before = (n: number): number => 120 + 10 * Math.max(0, n - 1) + 30 * n + Math.floor((40 * n * n) / 100);

describe('mini patch 7.3: the nights raised at the start', () => {
  it('raises night 1 by 10%, back to the old budget by night 50, whole tenths, never below the old and never easier than the night before', () => {
    expect(nightBudgetTenths(1)).toBe(165);
    let last = 0;
    for (let n = 1; n <= 120; n++) {
      const t = nightBudgetTenths(n);
      expect(Number.isInteger(t), `night ${n}`).toBe(true);
      expect(t, `night ${n}`).toBeGreaterThanOrEqual(before(n));
      expect(t, `night ${n}`).toBeGreaterThanOrEqual(last);
      if (n >= NIGHT_BUDGET.frontEndNight) expect(t, `night ${n}`).toBe(before(n));
      last = t;
    }
    // Rounded to whole threat points instead, it still never falls below the old budget.
    const whole = { ...NIGHT_BUDGET, frontRoundTenths: 10 };
    expect(nightBudgetTenths(1, whole)).toBe(160);
    for (let n = 1; n <= 60; n++) expect(nightBudgetTenths(n, whole)).toBeGreaterThanOrEqual(before(n));
  });
});
