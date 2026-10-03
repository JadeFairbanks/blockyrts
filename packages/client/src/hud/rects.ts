// Screen rectangles in CSS pixels and the drag box clamp (Controls > Selecting
// units and buildings: "the drag box never covers the HUD"). Pure, no DOM.

export interface Pt {
  x: number;
  y: number;
}

/** A screen rectangle: x0/y0 inclusive, x1/y1 exclusive. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function rectFromDom(r: { left: number; top: number; right: number; bottom: number }): Rect {
  return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
}

/** Whether a point is in a rectangle, counting its left and top border but not its right and bottom. */
export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x0 && p.x < r.x1 && p.y >= r.y0 && p.y < r.y1;
}

/** Whether a point is strictly inside a rectangle (its border does not count). */
function strictlyInside(p: Pt, r: Rect): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
}

/** Whether two rectangles share any area or touch. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/** The rectangle spanned by two corners. */
export function rectFromCorners(a: Pt, b: Pt): Rect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function padRect(r: Rect, pad: number): Rect {
  return { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad };
}

/**
 * Where the moving corner of a drag box goes for a given cursor position.
 * The box stops at the window edges and at HUD panels as if they were walls:
 * while the cursor is over a panel, the corner slides along the panel border
 * that faces the drag start, following the cursor along that border.
 */
export function clampBoxCorner(start: Pt, cursor: Pt, panels: readonly Rect[], width: number, height: number): Pt {
  const p = { x: Math.min(Math.max(cursor.x, 0), width), y: Math.min(Math.max(cursor.y, 0), height) };
  // Panels can sit next to each other, so a clamp can land on a neighbour; a few passes settle it.
  for (let pass = 0; pass < 4; pass++) {
    const panel = panels.find((r) => strictlyInside(p, r));
    if (!panel) break;
    // Only the borders the drag start is outside of can act as the wall.
    const walls: Pt[] = [];
    if (start.y <= panel.y0) walls.push({ x: p.x, y: panel.y0 });
    if (start.y >= panel.y1) walls.push({ x: p.x, y: panel.y1 });
    if (start.x <= panel.x0) walls.push({ x: panel.x0, y: p.y });
    if (start.x >= panel.x1) walls.push({ x: panel.x1, y: p.y });
    // A wall point on a neighbouring panel's border is no wall: the panels touch there (the bottom strip runs edge to edge).
    const free = walls.filter((c) => !panels.some((r) => r !== panel && c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1));
    let best: Pt | undefined;
    for (const c of free.length > 0 ? free : walls) {
      if (!best || Math.abs(c.x - p.x) + Math.abs(c.y - p.y) < Math.abs(best.x - p.x) + Math.abs(best.y - p.y)) best = c;
    }
    if (!best) break; // The start itself is under this panel (the view was panned): nothing to clamp against.
    p.x = best.x;
    p.y = best.y;
  }
  return p;
}
