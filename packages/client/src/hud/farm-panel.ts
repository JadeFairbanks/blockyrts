// A farm's harvest in the selection panel (Jade, patch notes 1): a progress
// bar that keeps filling while farmers work, a line saying when the harvest
// comes in, how much and its food value, and what the band does to the
// yield. More farmers fill the bar faster; the harvest itself stays the same.
// The bar and its line move in place between the panel's redraws.
import { RESOURCES, Res, STEPS_PER_SECOND } from '@blockyrts/sim';
import type { FarmInfo } from '../messages.ts';

/** Names that change for one item; the rest (wheat, corn, flax) read the same either way. */
const ONE: Readonly<Partial<Record<number, string>>> = {
  [Res.Potatoes]: 'potato',
  [Res.Carrots]: 'carrot',
  [Res.Herbs]: 'medicinal herb',
  [Res.Eggs]: 'egg',
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "45 seconds", "1 minute", "3 minutes 40 seconds". */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return plural(s, 'second');
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? plural(m, 'minute') : `${plural(m, 'minute')} ${plural(rest, 'second')}`;
}

/** "6 wheat", "1 potato", "8 potatoes". */
export function itemsText(n: number, res: number): string {
  const name = RESOURCES[res]?.name.toLowerCase() ?? 'items';
  return `${n} ${n === 1 ? (ONE[res] ?? name) : name}`;
}

/** The harvest line under the bar, or '' where nothing grows. */
export function harvestText(f: FarmInfo): string {
  if (!f.grows) return '';
  const made = f.res === Res.Eggs ? 'laid' : 'produced';
  const what = f.items > 0 ? itemsText(f.items, f.res) : `less than one ${ONE[f.res] ?? RESOURCES[f.res]?.name.toLowerCase() ?? 'item'} (it carries over)`;
  const food = f.food > 0 ? `, giving a food value of ${f.food}` : '';
  if (f.stepsLeft > 0) return `In ${durationText(f.stepsLeft / STEPS_PER_SECOND)}, ${what} will be ${made}${food}.`;
  return `No farmer at work, so the bar stands still. When it fills, ${what} will be ${made}${food}.`;
}

/** The panel's harvest block: the line, the bar and the band line, updated in place. */
export class FarmBlock {
  private readonly text: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly band: HTMLElement;

  constructor(parent: HTMLElement) {
    const box = document.createElement('div');
    box.className = 'sel-farm';
    this.text = document.createElement('div');
    this.text.className = 'sel-row farm-harvest';
    this.bar = document.createElement('div');
    this.bar.className = 'farm-bar';
    this.fill = document.createElement('span');
    this.bar.append(this.fill);
    this.band = document.createElement('div');
    this.band.className = 'sel-row farm-band';
    box.append(this.text, this.bar, this.band);
    parent.append(box);
  }

  update(f: FarmInfo): void {
    const text = harvestText(f);
    if (this.text.textContent !== text) this.text.textContent = text;
    this.text.hidden = text === '';
    this.bar.hidden = !f.grows;
    const w = `${Math.max(0, Math.min(1000, f.done)) / 10}%`;
    if (this.fill.style.width !== w) this.fill.style.width = w;
    this.bar.classList.toggle('still', f.stepsLeft === 0);
    if (this.band.textContent !== f.band) this.band.textContent = f.band;
    this.band.hidden = f.band === '';
  }
}
