// The loading screen before a match (mini patch 7.3): one of the art kit's
// four loading pictures (K11: workers felling a giant oak, a wall at night,
// a Dwarf city gate, a burning Rift scar), what is happening on the dark
// strip along its foot, and the kit's gold bar in its trough under it.
import { el } from './dom.ts';

/** What the screen says while the models and pictures load. */
export const LOADING_TEXT = 'Loading the models and pictures…';

const ART = import.meta.glob<string>('../../../assets/src/ui/loading_*.png', { eager: true, query: '?no-inline', import: 'default' });

export class LoadingScreen {
  readonly overlay: HTMLElement;
  private readonly line: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly count: HTMLElement;

  constructor(parent: HTMLElement) {
    this.overlay = el('div', 'overlay start-overlay', undefined, parent);
    this.overlay.dataset.page = 'loading';
    const box = el('div', 'loading-screen', undefined, this.overlay);
    const art = el('div', 'loading-art', undefined, box);
    const pictures = Object.values(ART);
    // Any of the four, a different one from time to time; only the look depends on it.
    if (pictures.length > 0) art.style.backgroundImage = `url('${pictures[Math.floor(Math.random() * pictures.length)]}')`;
    this.line = el('p', 'loading-line', LOADING_TEXT, art);
    const bar = el('div', 'loading-bar', undefined, box);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    this.fill = el('span', '', undefined, bar);
    this.count = el('p', 'loading-count', '', box);
    this.progress(0, 0);
  }

  /** The bar: `done` of `total` loaded. */
  progress(done: number, total: number): void {
    const pc = total > 0 ? Math.min(100, Math.floor((done * 100) / total)) : 0;
    this.fill.style.width = `${pc}%`;
    this.fill.parentElement!.setAttribute('aria-valuenow', String(pc));
    this.count.textContent = total > 0 ? `${pc}% (${done.toLocaleString()} of ${total.toLocaleString()} models and pictures)` : '';
  }

  /** What is happening now. */
  say(text: string): void {
    if (this.line.textContent !== text) this.line.textContent = text;
  }

  remove(): void {
    this.overlay.remove();
  }
}
