// The bar over a unit's head while it sits at a timed action beside a
// building (Jade's Patch 2, "Tinkering and a progress bar"): eating, Upgrade
// equipment, and the timed jobs to come. The sim says how far each one is
// (S.tinkerDone of S.tinkerOf, from units/tinker.ts); this only draws it,
// just above the head and under any speech bubble.

/** Where a unit's head is on screen, px, or null when it is off screen or out of sight (as the speech bubbles use). */
export type HeadAnchor = (id: number) => { x: number; y: number } | null;

export class TinkerBars {
  private readonly layer: HTMLElement;
  private readonly bars = new Map<number, { el: HTMLElement; fill: HTMLElement }>();

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'tinker-bars';
    parent.append(this.layer);
  }

  /** Draws a bar for each unit tinkering now ([id, steps done, steps it takes]) over its head, and drops the rest. */
  update(tinkering: ReadonlyArray<readonly [number, number, number]>, head: HeadAnchor): void {
    const seen = new Set<number>();
    for (const [id, done, of] of tinkering) {
      const at = of > 0 ? head(id) : null;
      if (!at) continue;
      seen.add(id);
      let bar = this.bars.get(id);
      if (!bar) {
        const el = document.createElement('div');
        el.className = 'tinker-bar';
        const fill = document.createElement('div');
        fill.className = 'tinker-fill';
        el.append(fill);
        this.layer.append(el);
        bar = { el, fill };
        this.bars.set(id, bar);
      }
      bar.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, 2px)`;
      bar.fill.style.width = `${Math.round((Math.min(done, of) * 100) / of)}%`;
    }
    for (const [id, bar] of this.bars) {
      if (seen.has(id)) continue;
      bar.el.remove();
      this.bars.delete(id);
    }
  }
}
