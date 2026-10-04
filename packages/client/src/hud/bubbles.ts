// Speech bubbles (Unit speech): a short text over a unit's head for a few
// seconds when it speaks, and now and then a random remark from a unit on
// screen. Remarks are the screen's alone: never sent to the sim, never in
// the message panel, never kept, and never while the game is paused (Jade's
// patch notes 1: the wait for the next one stands still too). Buildings
// speak too (Patch 2), over the middle of the roof.
//
// Questions (Patch 2, round 3) are bubbles that stay until answered, for 10 s
// of game time (Jade's Patch 3; so they stand still while paused), with Yes
// and No buttons for their owner only; while one is up over a speaker, the
// speaker's other lines do not cover it.
//
// Jade's Patch 3: what a unit says as it sits down to a timed action stays
// up while the bar over its head runs (hold 'bar'), and the main base's
// word of advice at the start stays twice as long as a bubble (hold 'long').
import { REMARKS, type BubbleHold } from '@blockyrts/sim';
import { oneIsSingular } from './wording.ts';
import type { YesNoButtons } from './yes-no.ts';

/** How long a bubble stays, ms: a base and a little more per character (s). */
const BUBBLE_MS = 3500;
const BUBBLE_MS_PER_CHAR = 40;
/** A long bubble (hold 'long') stays this many times as long (Jade's Patch 3: twice). */
const LONG_BUBBLE_TIMES = 2;
/** At most this many bubbles at once; the oldest goes. */
const MAX_BUBBLES = 10;
/** A random remark from some unit on screen about this often, ms (s). */
const REMARK_EVERY_MS = 9000;

export interface BubbleAnchor {
  /** Screen position of the top of the unit's head, px, or null when off screen or out of sight. */
  head(id: number): { x: number; y: number } | null;
  /** Screen position of the middle of a building's roof, px, or null when off screen or out of sight. */
  roof(id: number): { x: number; y: number } | null;
}

/** Who a bubble is over: a unit (entity id) or a building (building id). */
export interface Speaker {
  id: number;
  building?: boolean;
}

interface Bubble {
  key: string;
  who: Speaker;
  el: HTMLElement;
  until: number;
  /** Hold 'bar': it stays while its unit sits at its timed action; `sat` once the bar was seen (until then, the usual time). */
  bar: boolean;
  sat: boolean;
}

interface QuestionBubble {
  ask: number;
  key: string;
  who: Speaker;
  el: HTMLElement;
  /** The game step it stops waiting (the sim ends it then too). */
  until: number;
  buttons: YesNoButtons | null;
}

function keyOf(who: Speaker): string {
  return `${who.building ? 'b' : 'e'}:${who.id}`;
}

export class SpeechBubbles {
  private readonly layer: HTMLElement;
  private readonly bubbles: Bubble[] = [];
  private readonly questions: QuestionBubble[] = [];
  private nextRemark = 0;
  private lastUpdate = -1;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'bubbles';
    parent.append(this.layer);
  }

  /** A unit says something: its bubble replaces any it had (a question it asked stays). */
  say(id: number, text: string, now: number, kind: 'own' | 'foreign' | 'remark' = 'own', hold?: BubbleHold): void {
    this.speak({ id }, text, now, kind, hold);
  }

  /** A unit or building says something; `hold` keeps the bubble up longer than usual (see the top). */
  speak(who: Speaker, text: string, now: number, kind: 'own' | 'foreign' | 'remark' = 'own', hold?: BubbleHold): void {
    const key = keyOf(who);
    if (this.asking(who)) return;
    this.drop(key);
    const el = document.createElement('div');
    el.className = `bubble ${kind}`;
    el.textContent = oneIsSingular(text);
    el.hidden = true;
    this.layer.append(el);
    const ms = (BUBBLE_MS + text.length * BUBBLE_MS_PER_CHAR) * (hold === 'long' ? LONG_BUBBLE_TIMES : 1);
    this.bubbles.push({ key, who, el, until: now + ms, bar: hold === 'bar' && !who.building, sat: false });
    while (this.bubbles.length > MAX_BUBBLES) this.bubbles.shift()!.el.remove();
  }

  /** Whether a unit or building has a question up. */
  asking(who: Speaker): boolean {
    const key = keyOf(who);
    return this.questions.some((q) => q.key === key);
  }

  /**
   * A question goes up over its speaker until `until` (a game step), with
   * its Yes and No buttons when this player owns it (`buttons`), the bubble
   * alone for everyone else. Any bubble the speaker had goes.
   */
  ask(ask: number, who: Speaker, text: string, until: number, buttons: YesNoButtons | null): void {
    this.closeAsk(ask);
    const key = keyOf(who);
    this.drop(key);
    const el = document.createElement('div');
    el.className = `bubble question${buttons ? ' mine' : ''}`;
    const words = document.createElement('span');
    words.className = 'q-text';
    words.textContent = oneIsSingular(text);
    el.append(words);
    if (buttons) el.append(buttons.el);
    el.hidden = true;
    this.layer.append(el);
    this.questions.push({ ask, key, who, el, until, buttons });
  }

  /** A question ends: answered here or elsewhere, unanswered in time, or its speaker gone. Returns whether it was up. */
  closeAsk(ask: number): boolean {
    const k = this.questions.findIndex((q) => q.ask === ask);
    if (k < 0) return false;
    const q = this.questions[k]!;
    q.buttons?.dispose();
    q.el.remove();
    this.questions.splice(k, 1);
    return true;
  }

  /** Every question up now (ask numbers). */
  openAsks(): number[] {
    return this.questions.map((q) => q.ask);
  }

  /**
   * Places every bubble over its speaker, drops the old ones, and now and then
   * has a unit on screen make a random remark (`speakers`: candidates with
   * their remark list key, e.g. 'halfling' or 'worker'). `paused`: the game
   * is stopped, so nobody remarks and the wait for the next remark stands
   * still. `step`: the game's step, which questions wait on. `sitting`: the
   * units sitting at a timed action now, whose 'bar' bubbles stay.
   */
  update(now: number, anchor: BubbleAnchor, speakers: () => Array<[number, string]>, paused = false, step = 0, sitting: ReadonlySet<number> = new Set()): void {
    const dt = this.lastUpdate < 0 ? 0 : now - this.lastUpdate;
    this.lastUpdate = now;
    const at = (who: Speaker): { x: number; y: number } | null => (who.building ? anchor.roof(who.id) : anchor.head(who.id));
    const place = (el: HTMLElement, p: { x: number; y: number } | null): void => {
      el.hidden = p === null;
      if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    };
    for (let k = this.bubbles.length - 1; k >= 0; k--) {
      const b = this.bubbles[k]!;
      // A timed action's line stays while its bar runs and goes when the bar does (Jade's Patch 3).
      const bar = b.bar && sitting.has(b.who.id);
      if (bar) b.sat = true;
      if ((b.bar && b.sat && !bar) || (!bar && now >= b.until)) {
        b.el.remove();
        this.bubbles.splice(k, 1);
        continue;
      }
      place(b.el, at(b.who));
    }
    for (const q of [...this.questions]) {
      if (step >= q.until) {
        this.closeAsk(q.ask);
        continue;
      }
      place(q.el, at(q.who));
    }
    if (paused) {
      this.nextRemark += dt;
      return;
    }
    if (now < this.nextRemark) return;
    this.nextRemark = now + REMARK_EVERY_MS * (0.6 + Math.random() * 0.8);
    const list = speakers().filter(([id]) => !this.bubbles.some((b) => b.key === `e:${id}`) && !this.asking({ id }) && anchor.head(id) !== null);
    if (list.length === 0) return;
    const [id, key] = list[Math.floor(Math.random() * list.length)]!;
    const lines = REMARKS[key];
    if (!lines || lines.length === 0) return;
    this.say(id, lines[Math.floor(Math.random() * lines.length)]!, now, 'remark');
  }

  private drop(key: string): void {
    const k = this.bubbles.findIndex((b) => b.key === key);
    if (k < 0) return;
    this.bubbles[k]!.el.remove();
    this.bubbles.splice(k, 1);
  }
}
