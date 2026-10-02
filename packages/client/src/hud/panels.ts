// The registry of solid HUD panels (Controls > Screen layout and mouse zones):
// each panel's rectangle, padding included, belongs to the HUD and never to
// the game view. The input manager, edge panning, the drag box and the
// selection filter all read these rectangles.
import { pointInRect, rectFromDom, type Pt, type Rect } from './rects.ts';

export interface PanelRect {
  id: string;
  el: HTMLElement;
  rect: Rect;
}

export class HudPanels {
  private readonly entries: { id: string; el: HTMLElement }[] = [];
  private measured: PanelRect[] = [];
  private plain: Rect[] = [];

  register(id: string, el: HTMLElement): void {
    el.dataset.panel = id;
    this.entries.push({ id, el });
    this.measure();
  }

  /** Re-reads every panel's rectangle; call once a frame and after layout changes. Hidden panels drop out. */
  measure(): void {
    this.measured = [];
    for (const { id, el } of this.entries) {
      if (!el.isConnected || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      this.measured.push({ id, el, rect: rectFromDom(r) });
    }
    this.plain = this.measured.map((m) => m.rect);
  }

  list(): readonly PanelRect[] {
    return this.measured;
  }

  rects(): readonly Rect[] {
    return this.plain;
  }

  /** The panel under a screen point, or null for the game view. */
  at(p: Pt): PanelRect | null {
    // Later entries are drawn on top (dropdowns are registered after their bar).
    for (let i = this.measured.length - 1; i >= 0; i--) {
      if (pointInRect(p, this.measured[i]!.rect)) return this.measured[i]!;
    }
    return null;
  }

  /** Whether a screen point is in the game view: inside the window and under no panel. */
  inGameView(p: Pt): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight && this.at(p) === null;
  }
}
