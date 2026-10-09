// The bar over each boosted farm (Jade's UI-17: "A mirrored progress bar is
// visible above each farm"): the same bonemeal boost as the panel's "Boost
// remaining" bar, emptying as it wears off, with the boosts waiting beside it
// (her decisions 2.5). Drawn like the tinker bars, just over the roof.

import type { BuildingInfo } from '../messages.ts';

/** Where a building's roof is on screen, px, or null when it is off screen or out of sight. */
export type RoofAnchor = (id: number) => { x: number; y: number } | null;

export class BoostBars {
  private readonly layer: HTMLElement;
  private readonly bars = new Map<number, { el: HTMLElement; fill: HTMLElement; count: HTMLElement }>();

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'tinker-bars boost-bars';
    parent.append(this.layer);
  }

  /** Draws a bar over each farm boosted now, and drops the rest. */
  update(buildings: Iterable<BuildingInfo>, roof: RoofAnchor): void {
    const seen = new Set<number>();
    for (const b of buildings) {
      const v = b.boost;
      if (!v || v.left <= 0) continue;
      const at = roof(b.id);
      if (!at) continue;
      seen.add(b.id);
      let bar = this.bars.get(b.id);
      if (!bar) {
        const el = document.createElement('div');
        el.className = 'tinker-bar boost-bar';
        const fill = document.createElement('div');
        fill.className = 'tinker-fill';
        const count = document.createElement('span');
        count.className = 'boost-count';
        el.append(fill, count);
        this.layer.append(el);
        bar = { el, fill, count };
        this.bars.set(b.id, bar);
      }
      bar.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
      bar.fill.style.width = `${Math.round((Math.min(v.left, v.whole) * 100) / Math.max(1, v.whole))}%`;
      const text = v.queued > 0 ? `+${v.queued}` : '';
      if (bar.count.textContent !== text) bar.count.textContent = text;
    }
    for (const [id, bar] of this.bars) {
      if (seen.has(id)) continue;
      bar.el.remove();
      this.bars.delete(id);
    }
  }
}
