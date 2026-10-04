import { describe, expect, it } from 'vitest';
import { UnitKind } from '@blockyrts/sim';
import { bestScale, MIDDLE_MAX_SCALE, MIDDLE_MIN_SCALE } from '../src/hud/middle-fit.ts';
import { twoLines } from '../src/hud/selection-panel.ts';
import { hasRanks, xpView } from '../src/hud/xp-bar.ts';

// Jade's Patch 3, the middle HUD: the XP bar under the health bar, the name
// on two lines when it is too long for its share of the title row, and the
// one scale the title row and everything under it grow by to fill the section.

describe('the XP bar', () => {
  it('shows for workers, troops and mages only', () => {
    expect([UnitKind.Worker, UnitKind.Warrior, UnitKind.Mage].map(hasRanks)).toEqual([true, true, true]);
    expect([UnitKind.Animal, UnitKind.Mob, UnitKind.Engine].map(hasRanks)).toEqual([false, false, false]);
    expect(xpView(UnitKind.Animal, 0, 0, 0)).toBeNull();
  });

  it('fills to the next rank and names it, the rank now first', () => {
    expect(xpView(UnitKind.Warrior, 2, 120, 150)).toEqual({ pct: 80, tip: 'Soldier: 120 of 150 XP to Veteran.' });
    expect(xpView(UnitKind.Worker, 1, 30, 50)).toEqual({ pct: 60, tip: 'Labourer: 30 of 50 XP to Hand.' });
    expect(xpView(UnitKind.Warrior, 1, 0, 50)?.pct).toBe(0);
  });

  it('is full at the top rank', () => {
    expect(xpView(UnitKind.Warrior, 5, 1240, 0)).toEqual({ pct: 100, tip: 'Hero, the top rank: 1240 XP.' });
    expect(xpView(UnitKind.Mage, 6, 2400, 0)).toEqual({ pct: 100, tip: 'Grand Magician, the top rank: 2400 XP.' });
  });

  it('shows an empty bar where the sim names no next need', () => {
    expect(xpView(UnitKind.Worker, 1, 12, 0)).toEqual({ pct: 0, tip: 'Labourer: 12 XP.' });
  });

  it("says a mage above Adept Acolyte also trains at the Sanctum", () => {
    expect(xpView(UnitKind.Mage, 3, 120, 300)?.tip).toBe('Adept Acolyte: 120 of 300 XP to Mage, then training at the Magi Sanctum.');
    expect(xpView(UnitKind.Mage, 3, 320, 300)).toEqual({ pct: 100, tip: 'Adept Acolyte: 320 of 300 XP. Ready to train to Mage at the Magi Sanctum.' });
    expect(xpView(UnitKind.Mage, 1, 30, 40)?.tip).toBe('Novice Acolyte: 30 of 40 XP to Acolyte.');
  });

});

describe('a long name in the title row', () => {
  it('breaks where the longer line is shortest', () => {
    expect(twoLines('Support mage (Novice Acolyte)')).toBe('Support mage\n(Novice Acolyte)');
    expect(twoLines('Fortified Keep')).toBe('Fortified\nKeep');
    expect(twoLines('Artillery workshop')).toBe('Artillery\nworkshop');
    expect(twoLines('Barracks')).toBe('Barracks');
  });
});

describe('the middle filling its section', () => {
  // Content 100 px tall at its own size in a room 190 px tall: the scale is as big as the height allows.
  const tall = (natural: number, room: number) => (k: number) => natural * k <= room;

  it('grows to the largest twentieth that fits', () => {
    expect(bestScale(tall(100, 190))).toBe(1.9);
    expect(bestScale(tall(100, 199))).toBe(1.95);
  });

  it('stops at three times its own size', () => {
    expect(bestScale(tall(20, 190))).toBe(MIDDLE_MAX_SCALE);
  });

  it('shrinks a little before it scrolls, never past the least', () => {
    expect(bestScale(tall(200, 180))).toBe(0.9);
    expect(bestScale(tall(400, 180))).toBe(MIDDLE_MIN_SCALE);
  });

  it('keeps its own size when that fits exactly', () => {
    expect(bestScale(tall(190, 190))).toBe(1);
  });

  it('heeds the width too: a row that would run past it stops the growth', () => {
    // At 1.4 and above the title row would have to squeeze its bars.
    expect(bestScale((k) => k * 100 <= 190 && k < 1.4)).toBe(1.35);
  });
});
