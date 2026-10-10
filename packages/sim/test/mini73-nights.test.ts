import { describe, expect, it } from 'vitest';
import { NIGHT_BUDGET, nightBudgetTenths } from '../src/combat/spawn.ts';

// The budget before mini patch 7.3: 12 + (n - 1) + 3n + 0.04n^2, in tenths.
const before = (n: number): number => 120 + 10 * Math.max(0, n - 1) + 30 * n + Math.floor((40 * n * n) / 100);

describe('mini patch 7.3: the nights raised at the start', () => {
  it('raises night 1 by about 10%, back to the old budget by night 50, rounded down to whole threat, never below the old and never easier than the night before', () => {
    expect(nightBudgetTenths(1)).toBe(160);
    let last = 0;
    for (let n = 1; n <= 120; n++) {
      const t = nightBudgetTenths(n);
      expect(Number.isInteger(t), `night ${n}`).toBe(true);
      expect(t, `night ${n}`).toBeGreaterThanOrEqual(before(n));
      expect(t, `night ${n}`).toBeGreaterThanOrEqual(last);
      if (n >= NIGHT_BUDGET.frontEndNight) expect(t, `night ${n}`).toBe(before(n));
      last = t;
    }
    // A raised night is whole threat; one whose rounding would fall below the old budget keeps the old.
    for (let n = 1; n < NIGHT_BUDGET.frontEndNight; n++) {
      const t = nightBudgetTenths(n);
      expect(t % 10 === 0 || t === before(n), `night ${n}`).toBe(true);
    }
  });
});
