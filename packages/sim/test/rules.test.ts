import { describe, expect, it } from 'vitest';
import {
  burnThisStep,
  CYCLE_STEPS,
  damageTaken,
  drawEvenly,
  healXpTenths,
  killXpTenths,
  madeItemVp,
  rankDamageBonusBp,
  rankSpellPowerBonusBp,
  rankSpreadReductionBp,
  shareXp,
  totalArmourBp,
  trinketVp,
  withBonus,
} from '../src/index.ts';

describe('armour and damage', () => {
  it('adds armour pieces and caps them at 75%', () => {
    expect(totalArmourBp([1000, 2000])).toBe(3000);
    expect(totalArmourBp([5000, 4000])).toBe(7500);
    expect(totalArmourBp([])).toBe(0);
  });
  it('rounds down and never deals less than 1', () => {
    expect(damageTaken({ damage: 12, armourBp: 0 })).toBe(12);
    expect(damageTaken({ damage: 12, armourBp: 2500 })).toBe(9);
    expect(damageTaken({ damage: 13, armourBp: 2500 })).toBe(9); // 9.75 rounds down
    expect(damageTaken({ damage: 1, armourBp: 7500 })).toBe(1);
    expect(damageTaken({ damage: 100, armourBp: 9900 })).toBe(25); // capped at 75%
    expect(damageTaken({ damage: 0, armourBp: 0 })).toBe(0);
  });
  it('applies the mob modifier after armour', () => {
    expect(damageTaken({ damage: 20, armourBp: 5000, modifierBp: 15000 })).toBe(15);
    expect(damageTaken({ damage: 20, armourBp: 5000, modifierBp: 5000 })).toBe(5);
  });
  it('lets shields cut projectiles only, after armour', () => {
    expect(damageTaken({ damage: 20, armourBp: 0, shieldBlockBp: 3000, projectile: true })).toBe(14);
    expect(damageTaken({ damage: 20, armourBp: 0, shieldBlockBp: 3000 })).toBe(20);
    expect(damageTaken({ damage: 20, armourBp: 5000, shieldBlockBp: 3000, projectile: true })).toBe(7);
  });
});

describe('fire', () => {
  it('spreads a per-second burn over the 20 steps exactly', () => {
    for (const perSecond of [0, 1, 7, 20, 33, 250]) {
      let sum = 0;
      for (let k = 0; k < 20; k++) sum += burnThisStep(perSecond, k);
      expect(sum).toBe(perSecond);
    }
  });
});

describe('experience', () => {
  it('is 2 x threat, or HP / 50 at least 1 without a threat', () => {
    expect(killXpTenths(124, 30)).toBe(248);
    expect(killXpTenths(null, 400)).toBe(80);
    expect(killXpTenths(null, 20)).toBe(10);
  });
  it('shares a kill equally with the remainder to the lowest ids', () => {
    expect(shareXp(100, [7, 3, 5])).toEqual([[3, 34], [5, 33], [7, 33]]);
    expect(shareXp(10, [4, 4])).toEqual([[4, 10]]);
    expect(shareXp(10, [])).toEqual([]);
    const shares = shareXp(248, [9, 1, 4, 2]);
    expect(shares.reduce((s, [, x]) => s + x, 0)).toBe(248);
  });
  it('gives a healer 1 XP per 25 health', () => {
    expect(healXpTenths(25)).toBe(10);
    expect(healXpTenths(30)).toBe(12);
  });
});

describe('ranks', () => {
  it('give +5% damage, +10% spell power and -10% spread per rank above the first', () => {
    expect(rankDamageBonusBp(1)).toBe(0);
    expect(rankDamageBonusBp(5)).toBe(2000);
    expect(withBonus(30, rankDamageBonusBp(5))).toBe(36); // Table 1: Hero +20%, steel sword 36
    expect(rankSpellPowerBonusBp(6)).toBe(5000); // Grand Magician x1.5
    expect(rankSpreadReductionBp(3)).toBe(2000);
  });
});

describe('food', () => {
  it('has a 3 min, 40 s, 3 min, 40 s cycle', () => {
    expect(CYCLE_STEPS).toBe(8800);
  });
  it('draws evenly and passes a run-out food share on', () => {
    expect(drawEvenly([10, 10, 10], 6)).toEqual({ draws: [2, 2, 2], shortfall: 0 });
    expect(drawEvenly([10, 10, 10], 7)).toEqual({ draws: [3, 2, 2], shortfall: 0 });
    expect(drawEvenly([1, 10, 10], 9)).toEqual({ draws: [1, 4, 4], shortfall: 0 });
    expect(drawEvenly([1, 0, 2], 9)).toEqual({ draws: [1, 0, 2], shortfall: 6 });
    expect(drawEvenly([], 3)).toEqual({ draws: [], shortfall: 3 });
  });
});

describe('trade value', () => {
  it('values made items and trinkets', () => {
    expect(madeItemVp(6)).toBe(12);
    expect(trinketVp(10, 1)).toBe(25);
    expect(trinketVp(10, 4)).toBe(40);
    expect(trinketVp(10, 'special')).toBe(50);
    expect(() => trinketVp(10, 5)).toThrow();
  });
});
