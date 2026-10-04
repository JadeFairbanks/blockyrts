// Where the HUD's panels go for a screen size (HUD revamp, patch notes 1): the
// bottom strip runs the whole bottom edge, minimap | middle | portrait |
// command card (Jade's Patch 2 moves the portrait next to the card), and the
// room the middle does not need becomes a wider card. On a smaller screen
// every panel shrinks by one scale so nothing is lost; on a phone the panels
// fold away under buttons in the bottom left corner and the command card
// stays out. The card's buttons are squares sized to fill it (fitButtons).
// Pure, so the sizes can be tested.

/** One command card button before Patch 2, its gap, and the frame round the buttons (unscaled CSS px). The card's width is still counted in these. */
export const SLOT = 52;
export const GAP = 4;
export const PITCH = SLOT + GAP;
export const CARD_PAD = 12;
/** The card before Patch 2: 3 rows of 5 with the grid keys (a phone's card is still that size). */
export const CLASSIC_COLS = 5;
export const CLASSIC_ROWS = 3;
export const CLASSIC_SLOTS = CLASSIC_COLS * CLASSIC_ROWS;
/** The card's standard height: one row more than the classic block (patch notes: taller than the middle). */
export const DEFAULT_ROWS = 4;
/** The card stops widening here; any more room goes to the middle. */
export const MAX_COLS = 10;
/** Jade's Patch 2: an action button is at least twice as wide and twice as tall as before Patch 2 (4x its area). */
export const BUTTON_MIN = 2 * SLOT;
/** Where the screen is too short for the card to grow far enough, buttons shrink below the minimum, but never below the size before Patch 2 (s). */
export const BUTTON_FLOOR = SLOT;
/** The minimap with its utility bar along the top. */
export const MINIMAP_W = 352;
export const MINIMAP_H = 262;
/** The portrait is as tall as the card and a little narrower than tall. */
export const PORTRAIT_W = 196;
export const MIDDLE_TARGET = 520;
export const MIDDLE_MIN = 400;
export const MIDDLE_H = 190;
/** The phone's column of fold buttons. */
export const FOLD_W = 48;
/** Smallest scale before the phone layout takes over. */
export const MIN_SCALE = 0.55;
/** Below either of these the phone layout takes over (a phone either way up; a tablet is wider and taller). */
export const PHONE_WIDTH = 700;
export const PHONE_HEIGHT = 480;
/** The height the full HUD wants: the strip, the top right block and a usable view between. */
export const FULL_HEIGHT = 700;

export const cardWidth = (cols: number): number => 2 * CARD_PAD + cols * PITCH - GAP;
export const cardHeight = (rows: number): number => 2 * CARD_PAD + rows * PITCH - GAP;
/** The narrowest screen the strip fits at full size: the middle at its smallest beside a 5-column card. */
export const STRIP_MIN = MINIMAP_W + PORTRAIT_W + MIDDLE_MIN + cardWidth(CLASSIC_COLS);

/** A panel's place in screen px: from the left (or the right for the card), its width and height, all already scaled. */
export interface Box {
  x: number;
  w: number;
  h: number;
}

export interface HudGeometry {
  /** Phone layout: panels fold away under buttons. */
  phone: boolean;
  /** Every panel is drawn at this scale (1 on a desktop screen). */
  scale: number;
  /** The card's width, in columns of the button before Patch 2 (cardWidth). */
  cols: number;
  /** The card's standard height, in rows of the button before Patch 2 (cardHeight). */
  rows: number;
  /** The tallest the space inside the card's frame may grow (unscaled px), keeping clear of the top right block. */
  maxH: number;
  minimap: Box;
  portrait: Box;
  middle: Box;
  /** The card at its standard height; x is from the right edge. */
  card: Box;
  /** The phone's fold buttons, when shown. */
  folds: Box | null;
  /** Phone: the open panel goes above the card when there is no room beside it. */
  stacked: boolean;
}

export interface LayoutInput {
  width: number;
  height: number;
  /** The top right block's height at full size (it grows with the inventory's slot size). */
  topRight: number;
  /** Phone: which of the minimap or the selection is unfolded (they share the strip). */
  open?: 'map' | 'info' | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The scale the full layout needs, before the phone check. */
export function fullScale(width: number, height: number): number {
  return Math.min(1, width / STRIP_MIN, height / FULL_HEIGHT);
}

/** Phone layout: a screen too narrow or too short for the strip and a view above it, or one the strip would have to shrink past MIN_SCALE for. */
export function isPhone(width: number, height: number): boolean {
  return width < PHONE_WIDTH || height < PHONE_HEIGHT || fullScale(width, height) < MIN_SCALE;
}

/** The tallest the inside of a card with these standard rows may grow under the top right block at a scale (unscaled px). */
function heightUnder(height: number, scale: number, topRight: number, rows: number): number {
  const room = height / scale - topRight - 8;
  return Math.max(cardHeight(rows) - 2 * CARD_PAD, Math.floor(room - 2 * CARD_PAD));
}

export function hudLayout(input: LayoutInput): HudGeometry {
  const { width: W, height: H } = input;
  if (isPhone(W, H)) return phoneLayout(input);
  const s = fullScale(W, H);
  const room = W / s;
  // The middle keeps its size; what is left beyond it becomes card columns, up to MAX_COLS.
  const spare = room - MINIMAP_W - PORTRAIT_W - MIDDLE_TARGET - cardWidth(CLASSIC_COLS);
  const cols = clamp(CLASSIC_COLS + Math.floor(Math.max(0, spare) / PITCH), CLASSIC_COLS, MAX_COLS);
  const rows = DEFAULT_ROWS;
  const cw = cardWidth(cols);
  const ch = cardHeight(rows);
  // Screen px, rounded so neighbours meet without a hairline gap.
  const px = (v: number): number => Math.round(v * s);
  const mmW = px(MINIMAP_W);
  const ptW = px(PORTRAIT_W);
  const cardW = px(cw);
  return {
    phone: false,
    scale: s,
    cols,
    rows,
    maxH: heightUnder(H, s, input.topRight, rows),
    minimap: { x: 0, w: mmW, h: px(MINIMAP_H) },
    // Jade's Patch 2: the portrait sits between the middle and the card [before Patch 2: between the minimap and the middle].
    portrait: { x: W - cardW - ptW, w: ptW, h: px(ch) },
    middle: { x: mmW, w: W - mmW - ptW - cardW, h: px(MIDDLE_H) },
    card: { x: 0, w: cardW, h: px(ch) },
    folds: null,
    stacked: false,
  };
}

/**
 * A phone: the card (3 rows of 5) at the bottom right, sized for a thumb but
 * never more than 40% of the height or 60% of the width; the fold buttons in
 * the bottom left; the minimap or the selection beside the card when one is
 * unfolded, or above the card when the screen is too narrow for that.
 */
function phoneLayout(input: LayoutInput): HudGeometry {
  const { width: W, height: H } = input;
  const rows = CLASSIC_ROWS;
  const cols = CLASSIC_COLS;
  const s = clamp(Math.min((0.4 * H) / cardHeight(rows), (0.6 * W) / cardWidth(cols)), 0.5, 1);
  const px = (v: number): number => Math.round(v * s);
  const cardW = px(cardWidth(cols));
  const cardH = px(cardHeight(rows));
  const foldW = Math.round(FOLD_W * Math.max(s, 0.8));
  const beside = W - foldW - cardW;
  // The selection needs the portrait and a readable middle beside the card; else it goes above.
  const stacked = beside < px(PORTRAIT_W) + px(260);
  const left = foldW;
  const span = stacked ? W - foldW : beside;
  const ptW = px(PORTRAIT_W) > span * 0.4 ? Math.round(span * 0.34) : px(PORTRAIT_W);
  const stripH = stacked ? Math.min(px(MIDDLE_H), Math.round(H * 0.32)) : cardH;
  return {
    phone: true,
    scale: s,
    cols,
    rows,
    maxH: heightUnder(H, s, input.topRight, rows),
    minimap: { x: left, w: Math.min(px(MINIMAP_W), span), h: Math.min(px(MINIMAP_H), Math.round(H * 0.5)) },
    // The portrait next to the card here too (Jade's Patch 2).
    portrait: { x: left + span - ptW, w: ptW, h: stripH },
    middle: { x: left, w: span - ptW, h: stripH },
    card: { x: 0, w: cardW, h: cardH },
    folds: { x: 0, w: foldW, h: H },
    stacked,
  };
}

/** The space inside the card's frame at its standard size (unscaled px). */
export function cardInner(g: Pick<HudGeometry, 'cols' | 'rows'>): { w: number; h: number } {
  return { w: cardWidth(g.cols) - 2 * CARD_PAD, h: cardHeight(g.rows) - 2 * CARD_PAD };
}

/** Square buttons in a grid: their size (unscaled px), and the columns and rows they fill. */
export interface ButtonGrid {
  size: number;
  cols: number;
  rows: number;
}

export interface ButtonFit extends ButtonGrid {
  /** The space inside the card's frame, top to bottom (unscaled px): the standard height, or more when the card grew upward. */
  height: number;
  /** How many of the buttons show: all of them, unless they cannot fit even at the floor (a long menu then pages, CardSize.most). */
  shown: number;
}

/**
 * The biggest squares that hold n buttons in a space w by h, filled like a
 * book: the number of columns that gives the biggest squares, and of those
 * the one that leaves the fewest empty places.
 */
export function squares(n: number, w: number, h: number): ButtonGrid {
  const count = Math.max(1, n);
  let best: ButtonGrid = { size: -1, cols: 1, rows: count };
  for (let c = 1; c <= count; c++) {
    const r = Math.ceil(count / c);
    const size = Math.floor(Math.min((w - (c - 1) * GAP) / c, (h - (r - 1) * GAP) / r));
    if (size > best.size || (size === best.size && c * r < best.cols * best.rows)) best = { size, cols: c, rows: r };
  }
  return best;
}

/**
 * Jade's Patch 2 button sizing: the action menu's buttons are squares as big
 * as fit in the card at its standard size (w by h inside the frame), but never
 * under BUTTON_MIN. When they cannot all fit at the minimum, the card grows
 * upward just enough to hold them at it. Where the screen is too short for
 * that (the card stops under the top right block, maxH), they shrink to fit,
 * never under BUTTON_FLOOR (s); a menu too long even for that pages.
 */
export function fitButtons(n: number, w: number, h: number, maxH: number): ButtonFit {
  const count = Math.max(1, n);
  const here = squares(count, w, h);
  if (here.size >= BUTTON_MIN) return { ...here, height: h, shown: n };
  const top = Math.max(h, maxH);
  const perRow = Math.max(1, Math.floor((w + GAP) / (BUTTON_MIN + GAP)));
  const rows = Math.ceil(count / perRow);
  const need = rows * BUTTON_MIN + (rows - 1) * GAP;
  if (need <= top) {
    const height = Math.max(h, need);
    return { ...squares(count, w, height), height, shown: n };
  }
  const most = squares(count, w, top);
  if (most.size >= BUTTON_FLOOR) return { ...most, height: top, shown: n };
  const room = buttonRoom(w, top);
  return { size: BUTTON_FLOOR, cols: room.cols, rows: room.rows, height: top, shown: Math.min(n, room.cols * room.rows) };
}

/** The most buttons a card can show at once, at the floor size in a space w by h. */
export function buttonRoom(w: number, h: number): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.floor((w + GAP) / (BUTTON_FLOOR + GAP))), rows: Math.max(1, Math.floor((h + GAP) / (BUTTON_FLOOR + GAP))) };
}

/** The picture on a button this size: the 32 px kit pictures at a whole or half step up, about 60% of the button (unscaled px). */
export function buttonIcon(size: number): number {
  return Math.max(32, Math.floor((size * 0.62) / 16) * 16);
}
