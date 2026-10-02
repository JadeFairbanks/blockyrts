// Edge panning zones (Controls > Camera). Pure, no DOM.
import type { Rect } from '../hud/rects.ts';

/** Over the game view the pan zone is the outermost 4 px of the window. */
export const EDGE_ZONE_PX = 4;
/** Where a HUD panel touches the edge the zone thins to the outermost 2 px, so normal panel use never pans. */
export const EDGE_PANEL_ZONE_PX = 2;
/** Within 20 px of a corner a pan zone pans diagonally. */
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
 * the cursor is not in an active pan zone. Each side's zone is `zone` px deep
 * over the game view and `panelZone` px deep where a HUD panel sits under the
 * cursor at that side; near a corner an active zone pans diagonally.
 */
export function edgePanDirection(
  x: number,
  y: number,
  w: number,
  h: number,
  panels: readonly Rect[],
  zone = EDGE_ZONE_PX,
  corner = EDGE_CORNER_PX,
  panelZone = EDGE_PANEL_ZONE_PX,
): PanDir | null {
  if (x >= zone && x < w - zone && y >= zone && y < h - zone) return null;

  // A panel reaching into the full zone strip at this point of the side thins that side's zone.
  const covered = (strip: Rect): boolean =>
    panels.some((r) => r.x0 < strip.x1 && strip.x0 < r.x1 && r.y0 < strip.y1 && strip.y0 < r.y1);
  const depth = (strip: Rect): number => (covered(strip) ? panelZone : zone);
  const left = x < depth({ x0: 0, y0: y, x1: zone, y1: y + 1 });
  const right = x >= w - depth({ x0: w - zone, y0: y, x1: w, y1: y + 1 });
  const top = y < depth({ x0: x, y0: 0, x1: x + 1, y1: zone });
  const bottom = y >= h - depth({ x0: x, y0: h - zone, x1: x + 1, y1: h });
  if (!left && !right && !top && !bottom) return null;

  const nearL = x < corner;
  const nearR = x >= w - corner;
  const nearT = y < corner;
  const nearB = y >= h - corner;
  if ((nearL || nearR) && (nearT || nearB)) {
    return { dx: nearL ? -1 : 1, dy: nearT ? -1 : 1 };
  }
  return { dx: left ? -1 : right ? 1 : 0, dy: top ? -1 : bottom ? 1 : 0 };
}
