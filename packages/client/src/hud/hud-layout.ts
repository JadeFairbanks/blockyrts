// Where the HUD's panels go for a screen size (HUD revamp, patch notes 1): the
// bottom strip runs the whole bottom edge, minimap | portrait | middle |
// command card, and the room the middle does not need becomes more card
// columns. On a smaller screen every panel shrinks by one scale so nothing is
// lost; on a phone the panels fold away under buttons in the bottom left
// corner and the command card stays out. Pure, so the sizes can be tested.

/** One command card button, its gap, and the frame round the slots (unscaled CSS px). */
export const SLOT = 52;
export const GAP = 4;
export const PITCH = SLOT + GAP;
export const CARD_PAD = 12;
/** The card's fixed block: 3 rows of 5 with the grid keys, always at the bottom right. */
export const CLASSIC_COLS = 5;
export const CLASSIC_ROWS = 3;
export const CLASSIC_SLOTS = CLASSIC_COLS * CLASSIC_ROWS;
/** One row more than the fixed block by default (patch notes: taller than the middle). */
export const DEFAULT_ROWS = 4;
/** The card stops widening here; any more room goes to the middle. */
export const MAX_COLS = 10;
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
  cols: number;
  /** Rows when nothing needs more. */
  rows: number;
  /** Most rows a long menu may grow to before it pages, keeping clear of the top right block. */
  maxRows: number;
  minimap: Box;
  portrait: Box;
  middle: Box;
  /** The card at its default rows; x is from the right edge. */
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

/** How many rows fit under the top right block at a scale. */
function rowsUnder(height: number, scale: number, topRight: number): number {
  const room = height / scale - topRight - 8;
  return Math.max(CLASSIC_ROWS, Math.floor((room - 2 * CARD_PAD + GAP) / PITCH));
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
    maxRows: Math.max(rows, rowsUnder(H, s, input.topRight)),
    minimap: { x: 0, w: mmW, h: px(MINIMAP_H) },
    portrait: { x: mmW, w: ptW, h: px(ch) },
    middle: { x: mmW + ptW, w: W - mmW - ptW - cardW, h: px(MIDDLE_H) },
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
    maxRows: Math.max(rows, rowsUnder(H, s, input.topRight)),
    minimap: { x: left, w: Math.min(px(MINIMAP_W), span), h: Math.min(px(MINIMAP_H), Math.round(H * 0.5)) },
    portrait: { x: left, w: ptW, h: stripH },
    middle: { x: left + ptW, w: span - ptW, h: stripH },
    card: { x: 0, w: cardW, h: cardH },
    folds: { x: 0, w: foldW, h: H },
    stacked,
  };
}

/**
 * The cells of a card with these columns and rows, in the order the card's
 * entries fill them: entries 0 to 14 are the fixed block at the bottom right
 * (row by row, so the grid keys keep their places), then the extra slots,
 * first those beside the block (row by row), then the rows above it from the
 * bottom up, so a long menu grows upward. Each cell is [row, col] from the
 * top left.
 */
export function cardCells(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const top = rows - CLASSIC_ROWS;
  const left = cols - CLASSIC_COLS;
  for (let r = 0; r < CLASSIC_ROWS; r++) for (let c = 0; c < CLASSIC_COLS; c++) out.push([top + r, left + c]);
  for (let r = 0; r < CLASSIC_ROWS; r++) for (let c = 0; c < left; c++) out.push([top + r, c]);
  for (let r = top - 1; r >= 0; r--) for (let c = 0; c < cols; c++) out.push([r, c]);
  return out;
}

/** The rows a card needs to show its last entry (the default at least, the most at most). */
export function rowsFor(lastEntry: number, cols: number, rows: number, maxRows: number): number {
  let r = rows;
  while (r < maxRows && cols * r <= lastEntry) r++;
  return r;
}

/** Extra slots past the fixed block for a card of these columns and rows. */
export function extraSlots(cols: number, rows: number): number {
  return cols * rows - CLASSIC_SLOTS;
}
