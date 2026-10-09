// "Click to tame animal" (Jade's GP-35): with a worker selected, a tooltip
// over a tameable wild animal for as long as the cursor is over it, saying
// what taming it costs. Right click sets the worker taming it (commands.ts
// animalOrder); the food comes from the stock, fed at 2 food a second.

import { speciesSpec } from '@blockyrts/sim';
import type { Selectable } from '../selection/types.ts';
import { entityIdOf } from '../selection/types.ts';

export class TameTip {
  private readonly el: HTMLElement;
  private readonly cost: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'chain-label tame-tip';
    this.el.hidden = true;
    const title = document.createElement('div');
    title.textContent = 'Right click to tame animal';
    this.cost = document.createElement('div');
    this.cost.className = 'chain-hint';
    this.el.append(title, this.cost);
    parent.append(this.el);
  }

  /** Shows the tip over the one wild animal under the cursor while workers are selected, else hides it. */
  update(workers: boolean, hovered: readonly Selectable[], head: (id: number) => { x: number; y: number } | null): void {
    const t = workers && hovered.length === 1 ? hovered[0]! : null;
    const id = t && t.kind === 'unit' && t.typeKey.startsWith('animal:wild:') ? entityIdOf(t.key) : null;
    const s = id !== null ? speciesSpec(Number(t!.typeKey.split(':')[2])) : null;
    const at = id !== null && s && s.tameAt.length > 0 ? head(id) : null;
    if (!at || !s) {
      this.el.hidden = true;
      return;
    }
    const text = `${s.tameFood} food of plant food from the stock`;
    if (this.cost.textContent !== text) this.cost.textContent = text;
    this.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%) translateY(-6px)`;
    this.el.hidden = false;
  }
}
