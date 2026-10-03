// Speech bubbles (Unit speech): a short text over a unit's head for a few
// seconds when it speaks, and now and then a random remark from a unit on
// screen. Remarks are the screen's alone: never sent to the sim, never in
// the message panel, never kept.
import { REMARKS } from '@blockyrts/sim';
import { oneIsSingular } from './wording.ts';

/** How long a bubble stays, ms: a base and a little more per character (s). */
const BUBBLE_MS = 3500;
const BUBBLE_MS_PER_CHAR = 40;
/** At most this many bubbles at once; the oldest goes. */
const MAX_BUBBLES = 10;
/** A random remark from some unit on screen about this often, ms (s). */
const REMARK_EVERY_MS = 9000;

export interface BubbleAnchor {
  /** Screen position of the top of the unit's head, px, or null when off screen or out of sight. */
  head(id: number): { x: number; y: number } | null;
}

interface Bubble {
  id: number;
  el: HTMLElement;
  until: number;
}

export class SpeechBubbles {
  private readonly layer: HTMLElement;
  private readonly bubbles: Bubble[] = [];
  private nextRemark = 0;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'bubbles';
    parent.append(this.layer);
  }

  /** A unit says something: its bubble replaces any it had. */
  say(id: number, text: string, now: number, kind: 'own' | 'foreign' | 'remark' = 'own'): void {
    this.drop(id);
    const el = document.createElement('div');
    el.className = `bubble ${kind}`;
    el.textContent = oneIsSingular(text);
    el.hidden = true;
    this.layer.append(el);
    this.bubbles.push({ id, el, until: now + BUBBLE_MS + text.length * BUBBLE_MS_PER_CHAR });
    while (this.bubbles.length > MAX_BUBBLES) this.bubbles.shift()!.el.remove();
  }

  /**
   * Places every bubble over its unit, drops the old ones, and now and then
   * has a unit on screen make a random remark (`speakers`: candidates with
   * their remark list key, e.g. 'halfling' or 'worker').
   */
  update(now: number, anchor: BubbleAnchor, speakers: () => Array<[number, string]>): void {
    for (let k = this.bubbles.length - 1; k >= 0; k--) {
      const b = this.bubbles[k]!;
      const at = now < b.until ? anchor.head(b.id) : null;
      if (now >= b.until) {
        b.el.remove();
        this.bubbles.splice(k, 1);
        continue;
      }
      b.el.hidden = at === null;
      if (at) b.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
    }
    if (now < this.nextRemark) return;
    this.nextRemark = now + REMARK_EVERY_MS * (0.6 + Math.random() * 0.8);
    const list = speakers().filter(([id]) => !this.bubbles.some((b) => b.id === id) && anchor.head(id) !== null);
    if (list.length === 0) return;
    const [id, key] = list[Math.floor(Math.random() * list.length)]!;
    const lines = REMARKS[key];
    if (!lines || lines.length === 0) return;
    this.say(id, lines[Math.floor(Math.random() * lines.length)]!, now, 'remark');
  }

  private drop(id: number): void {
    const k = this.bubbles.findIndex((b) => b.id === id);
    if (k < 0) return;
    this.bubbles[k]!.el.remove();
    this.bubbles.splice(k, 1);
  }
}
