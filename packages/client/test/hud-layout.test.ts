// The HUD revamp's layout (patch notes 1): the bottom strip runs the whole
// bottom edge, spare room becomes card columns, the card grows upward for a
// long menu without reaching the top right block, smaller screens scale the
// whole HUD, and a phone folds the panels away.
import { describe, expect, it } from 'vitest';
import {
  cardCells,
  cardHeight,
  cardWidth,
  CLASSIC_SLOTS,
  DEFAULT_ROWS,
  extraSlots,
  hudLayout,
  isPhone,
  MAX_COLS,
  MIDDLE_H,
  MIDDLE_MIN,
  MIDDLE_TARGET,
  rowsFor,
} from '../src/hud/hud-layout.ts';

const TOP_RIGHT = 112;

describe('the bottom strip', () => {
  for (const [w, h] of [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [1280, 720],
  ] as const) {
    it(`spans the whole bottom edge at full size on ${w} x ${h}`, () => {
      const g = hudLayout({ width: w, height: h, topRight: TOP_RIGHT });
      expect(g.phone).toBe(false);
      expect(g.scale).toBe(1);
      // minimap | portrait | middle | card, edge to edge, no gaps.
      expect(g.minimap.x).toBe(0);
      expect(g.portrait.x).toBe(g.minimap.w);
      expect(g.middle.x).toBe(g.portrait.x + g.portrait.w);
      expect(g.middle.x + g.middle.w + g.card.w).toBe(w);
      // The card is taller than the middle by default (one more row), and the portrait is as tall as the card.
      expect(g.rows).toBe(DEFAULT_ROWS);
      expect(g.card.h).toBeGreaterThan(g.middle.h);
      expect(g.portrait.h).toBe(g.card.h);
      expect(g.middle.w).toBeGreaterThanOrEqual(MIDDLE_MIN);
    });
  }

  it('turns spare room into card columns, up to the most', () => {
    expect(hudLayout({ width: 1280, height: 720, topRight: TOP_RIGHT }).cols).toBe(5);
    const wide = hudLayout({ width: 1600, height: 900, topRight: TOP_RIGHT });
    expect(wide.cols).toBeGreaterThan(5);
    // The middle keeps its size; the columns took what was left.
    expect(wide.middle.w).toBeGreaterThanOrEqual(MIDDLE_TARGET);
    expect(wide.middle.w - MIDDLE_TARGET).toBeLessThan(56);
    const huge = hudLayout({ width: 2560, height: 1440, topRight: TOP_RIGHT });
    expect(huge.cols).toBe(MAX_COLS);
    expect(huge.card.w).toBe(cardWidth(MAX_COLS));
  });

  it('shrinks the whole HUD on a small laptop or a tablet, keeping every panel', () => {
    for (const [w, h] of [
      [1024, 768],
      [1024, 600],
      [1180, 820],
      [768, 1024],
    ] as const) {
      const g = hudLayout({ width: w, height: h, topRight: TOP_RIGHT });
      expect(g.phone, `${w} x ${h}`).toBe(false);
      expect(g.scale).toBeLessThan(1);
      expect(g.middle.x + g.middle.w + g.card.w).toBe(w);
      expect(g.middle.w).toBeGreaterThanOrEqual(Math.floor(MIDDLE_MIN * g.scale) - 1);
      expect(g.cols).toBe(5);
    }
  });

  it('never changes a desktop screen: full size from 1250 px wide and 700 tall', () => {
    expect(hudLayout({ width: 1250, height: 700, topRight: TOP_RIGHT }).scale).toBe(1);
    expect(hudLayout({ width: 1920, height: 1080, topRight: TOP_RIGHT }).middle.h).toBe(MIDDLE_H);
  });
});

describe('phones', () => {
  it('knows a phone either way up from a tablet', () => {
    expect(isPhone(844, 390)).toBe(true);
    expect(isPhone(390, 844)).toBe(true);
    expect(isPhone(667, 375)).toBe(true);
    expect(isPhone(1024, 768)).toBe(false);
    expect(isPhone(768, 1024)).toBe(false);
    expect(isPhone(1280, 720)).toBe(false);
  });

  it('keeps the card at thumb size with the fold buttons beside it', () => {
    const g = hudLayout({ width: 844, height: 390, topRight: TOP_RIGHT, open: 'info' });
    expect(g.phone).toBe(true);
    expect(g.rows).toBe(3);
    expect(g.card.h).toBeLessThanOrEqual(0.4 * 390 + 1);
    // A slot stays at least 40 px for a finger.
    expect(52 * g.scale).toBeGreaterThanOrEqual(40);
    expect(g.folds).not.toBeNull();
    // Landscape: the selection fits beside the card.
    expect(g.stacked).toBe(false);
    expect(g.middle.x + g.middle.w + g.card.w).toBe(844);
  });

  it('puts the open panel above the card on a phone held upright', () => {
    const g = hudLayout({ width: 390, height: 844, topRight: TOP_RIGHT });
    expect(g.stacked).toBe(true);
    expect(g.middle.x + g.middle.w).toBe(390);
    expect(g.card.w).toBeLessThanOrEqual(0.6 * 390 + 1);
  });
});

describe('card slots', () => {
  it('keeps the fixed 5 x 3 block at the bottom right, row by row', () => {
    const cells = cardCells(7, 4);
    expect(cells).toHaveLength(28);
    expect(cells.slice(0, 5)).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
    ]);
    expect(cells[14]).toEqual([3, 6]);
    // Every cell once.
    expect(new Set(cells.map(([r, c]) => `${r},${c}`)).size).toBe(28);
  });

  it('fills the slots beside the block first, then the rows above from the bottom up', () => {
    const cells = cardCells(7, 5);
    expect(cells[CLASSIC_SLOTS]).toEqual([2, 0]);
    expect(cells[CLASSIC_SLOTS + 1]).toEqual([2, 1]);
    expect(cells[CLASSIC_SLOTS + 6]).toEqual([1, 0]);
    expect(cells[cells.length - 1]).toEqual([0, 6]);
  });

  it('grows a long menu upward only as far as it may', () => {
    expect(rowsFor(-1, 5, 4, 9)).toBe(4);
    expect(rowsFor(19, 5, 4, 9)).toBe(4);
    expect(rowsFor(20, 5, 4, 9)).toBe(5);
    expect(rowsFor(40, 5, 4, 9)).toBe(9);
    expect(rowsFor(400, 5, 4, 9)).toBe(9);
    expect(extraSlots(5, 4)).toBe(5);
  });

  it('stops the card under the top right block', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1024, 768],
    ] as const) {
      const g = hudLayout({ width: w, height: h, topRight: TOP_RIGHT });
      expect(cardHeight(g.maxRows) * g.scale + TOP_RIGHT * g.scale).toBeLessThanOrEqual(h);
      expect(g.maxRows).toBeGreaterThanOrEqual(g.rows);
    }
  });
});
