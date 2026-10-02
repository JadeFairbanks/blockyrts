// Edge panning zones (Controls > Camera). Pure, no DOM.
import type { Rect } from '../hud/rects.ts';

/** The pan zone is only the outermost 4 px of the window. */
export const EDGE_ZONE_PX = 4;
/** Within 20 px of a corner the zone works even where a HUD panel touches the edge, and pans diagonally. */
export const EDGE_CORNER_PX = 20;
/** Panning starts once the cursor has stayed in a zone this long. */
export const EDGE_DELAY_S = 0.1;

export interface PanDir {
  /** -1, 0 or 1: screen left/right. */
  dx: number;
  /** -1, 0 or 1: screen up/down. */
  dy: number;
}

/**
 * The direction to pan for a cursor at (x, y) in a w x h window, or null when
 * the cursor is not in an active pan zone. A side's zone is switched off where
 * a HUD panel touches that side, except in the corners.
 */
export function edgePanDirection(
  x: number,
  y: number,
  w: number,
  h: number,
  panels: readonly Rect[],
  zone = EDGE_ZONE_PX,
  corner = EDGE_CORNER_PX,
): PanDir | null {
  const left = x < zone;
  const right = x >= w - zone;
  const top = y < zone;
  const bottom = y >= h - zone;
  if (!left && !right && !top && !bottom) return null;

  const nearL = x < corner;
  const nearR = x >= w - corner;
  const nearT = y < corner;
  const nearB = y >= h - corner;
  if ((nearL || nearR) && (nearT || nearB)) {
    return { dx: nearL ? -1 : 1, dy: nearT ? -1 : 1 };
  }

  // Along a side: off where a panel reaches into the zone strip at this point of the side.
  const covered = (strip: Rect): boolean =>
    panels.some((r) => r.x0 < strip.x1 && strip.x0 < r.x1 && r.y0 < strip.y1 && strip.y0 < r.y1);
  if (left && !covered({ x0: 0, y0: y, x1: zone, y1: y + 1 })) return { dx: -1, dy: 0 };
  if (right && !covered({ x0: w - zone, y0: y, x1: w, y1: y + 1 })) return { dx: 1, dy: 0 };
  if (top && !covered({ x0: x, y0: 0, x1: x + 1, y1: zone })) return { dx: 0, dy: -1 };
  if (bottom && !covered({ x0: x, y0: h - zone, x1: x + 1, y1: h })) return { dx: 0, dy: 1 };
  return null;
}
