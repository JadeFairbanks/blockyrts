// The HUD revamp's layout (patch notes 1): the bottom strip runs the whole
// bottom edge, spare room becomes a wider card, smaller screens scale the
// whole HUD, and a phone folds the panels away. Jade's Patch 2: the portrait
// sits between the middle and the card, and the card's buttons are squares
// sized to fill it, at least twice their old width and height, the card
// growing upward only when they cannot fit at that.
import { describe, expect, it } from 'vitest';
import {
  BUTTON_FLOOR,
  BUTTON_MIN,
  buttonIcon,
  buttonRoom,
  CARD_PAD,
  cardInner,
  cardWidth,
  DEFAULT_ROWS,
  fitButtons,
  GAP,
  hudLayout,
  isPhone,
  MAX_COLS,
  MIDDLE_H,
  MIDDLE_MIN,
  MIDDLE_TARGET,
  SLOT,
  squares,
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
      // minimap | middle | portrait | card, edge to edge, no gaps (Jade's Patch 2 moved the portrait next to the card).
      expect(g.minimap.x).toBe(0);
      expect(g.middle.x).toBe(g.minimap.w);
      expect(g.portrait.x).toBe(g.middle.x + g.middle.w);
      expect(g.portrait.x + g.portrait.w + g.card.w).toBe(w);
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
      expect(g.portrait.x + g.portrait.w + g.card.w).toBe(w);
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
    // Landscape: the selection fits beside the card, the portrait next to the card.
    expect(g.stacked).toBe(false);
    expect(g.portrait.x).toBe(g.middle.x + g.middle.w);
    expect(g.portrait.x + g.portrait.w + g.card.w).toBe(844);
  });

  it('puts the open panel above the card on a phone held upright', () => {
    const g = hudLayout({ width: 390, height: 844, topRight: TOP_RIGHT });
    expect(g.stacked).toBe(true);
    expect(g.portrait.x + g.portrait.w).toBe(390);
    expect(g.middle.x + g.middle.w).toBe(g.portrait.x);
    expect(g.card.w).toBeLessThanOrEqual(0.6 * 390 + 1);
  });
});

describe('square buttons (Jade\'s Patch 2)', () => {
  it('is at least twice the old button each way', () => {
    expect(BUTTON_MIN).toBe(2 * SLOT);
    expect(BUTTON_FLOOR).toBe(SLOT);
  });

  it('makes the biggest squares that fit, filled like a book with the fewest gaps', () => {
    // Six buttons in a 10-column card's standard space: 3 by 2 of 108 px.
    const g = hudLayout({ width: 1920, height: 1080, topRight: TOP_RIGHT });
    const inner = cardInner(g);
    expect(inner).toEqual({ w: cardWidth(MAX_COLS) - 2 * CARD_PAD, h: DEFAULT_ROWS * (SLOT + GAP) - GAP });
    expect(squares(6, inner.w, inner.h)).toEqual({ size: 108, cols: 3, rows: 2 });
    // One button fills the card's height.
    expect(squares(1, inner.w, inner.h)).toEqual({ size: inner.h, cols: 1, rows: 1 });
    // Ties go to the grid with the fewest empty places.
    expect(squares(4, 220, 220)).toEqual({ size: 108, cols: 2, rows: 2 });
  });

  it('keeps the card at its size when the buttons fit at the minimum, as big as they go', () => {
    const fit = fitButtons(6, 556, 220, 800);
    expect(fit).toEqual({ size: 108, cols: 3, rows: 2, height: 220, shown: 6 });
    expect(fit.size).toBeGreaterThanOrEqual(BUTTON_MIN);
  });

  it('grows the card upward just enough when they cannot fit at the minimum', () => {
    // Eleven worker buttons in a 10-column card: 3 rows of 104 px, 4 to a row.
    const fit = fitButtons(11, 556, 220, 800);
    expect(fit.size).toBe(BUTTON_MIN);
    expect(fit.height).toBe(3 * BUTTON_MIN + 2 * GAP);
    expect(fit.cols * fit.rows).toBeGreaterThanOrEqual(11);
    expect(fit.shown).toBe(11);
    // A 5-column card holds two a row: six troop buttons take three rows.
    const narrow = fitButtons(6, 276, 220, 800);
    expect(narrow).toMatchObject({ size: BUTTON_MIN, cols: 2, rows: 3, height: 3 * BUTTON_MIN + 2 * GAP });
  });

  it('shrinks them under the top right block on a short screen, never below the old size, and pages past that', () => {
    const fit = fitButtons(11, 276, 220, 488);
    expect(fit.height).toBe(488);
    expect(fit.size).toBeLessThan(BUTTON_MIN);
    expect(fit.size).toBeGreaterThanOrEqual(BUTTON_FLOOR);
    expect(fit.shown).toBe(11);
    const long = fitButtons(80, 276, 220, 488);
    expect(long.size).toBe(BUTTON_FLOOR);
    expect(long.shown).toBe(buttonRoom(276, 488).cols * buttonRoom(276, 488).rows);
    expect(long.shown).toBeLessThan(80);
  });

  it('never reaches the top right block on any screen', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1024, 768],
      [844, 390],
    ] as const) {
      const g = hudLayout({ width: w, height: h, topRight: TOP_RIGHT });
      const inner = cardInner(g);
      expect(g.maxH).toBeGreaterThanOrEqual(inner.h);
      for (const n of [1, 6, 11, 15, 30]) {
        const fit = fitButtons(n, inner.w, inner.h, g.maxH);
        expect((fit.height + 2 * CARD_PAD) * g.scale + TOP_RIGHT * g.scale, `${w} x ${h}, ${n} buttons`).toBeLessThanOrEqual(h);
        expect(fit.cols * fit.size + (fit.cols - 1) * GAP).toBeLessThanOrEqual(inner.w);
        expect(fit.rows * fit.size + (fit.rows - 1) * GAP).toBeLessThanOrEqual(fit.height);
      }
    }
  });

  it('draws the kit pictures at whole or half steps up with the button', () => {
    expect(buttonIcon(52)).toBe(32);
    expect(buttonIcon(104)).toBe(64);
    expect(buttonIcon(89)).toBe(48);
    expect(buttonIcon(220)).toBe(128);
  });
});
