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
// Jade's Patch 5: a necromancer's bubble stays 20 s unless he says something
// else first (hold 'linger'), and each unit on screen remarks on what is
// round it once every 1 to 4.5 minutes of play (GP-28, hud/remarks.ts).
// A keeper's words while it waits for a Yes or No stay until it says
// something else (hold 'held', MB-11 and MF-10), and a question asked of
// every player by one speaker (a Bog guardian's promise) shows this
// player's own, with its buttons, over the others'.
import { REMARKS, type BubbleHold } from '@blockyrts/sim';
import { oneIsSingular } from './wording.ts';
import type { YesNoButtons } from './yes-no.ts';

/** How long a bubble stays, ms: a base and a little more per character (s). Jade's Patch 5 (UI-19): a second longer than before (3.5 s). */
const BUBBLE_MS = 4500;
const BUBBLE_MS_PER_CHAR = 40;
/** A long bubble (hold 'long') stays this many times as long (Jade's Patch 3: twice). */
const LONG_BUBBLE_TIMES = 2;
/** At most this many bubbles at once; the oldest goes. */
const MAX_BUBBLES = 10;
/** A 'linger' bubble stays this long, ms (Jade's Patch 5: the necromancer's 20 s). */
const LINGER_MS = 20_000;
/** A 'held' bubble stays until its speaker says something else; this long at most, ms (s: 30 minutes). */
const HELD_MS = 1_800_000;
/** Each unit on screen remarks once in this many ms of play, a fresh wait each time (Jade's Patch 5: 1 to 4.5 minutes)... */
const REMARK_MIN_MS = 60_000;
const REMARK_MAX_MS = 270_000;
/** ...the speakers are looked over this often, ms, and at most this many remark at once (s). */
const REMARK_POLL_MS = 500;
const REMARKS_AT_ONCE = 2;

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
  /** Hold 'held': it stays until its speaker says something else, and is never dropped for room. */
  held: boolean;
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
  /** Ms of play (the game not paused), which the remarks wait on, and when each unit on screen remarks next. */
  private playMs = 0;
  private readonly remarkAt = new Map<number, number>();

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
    const ms = hold === 'held' ? HELD_MS : hold === 'linger' ? LINGER_MS : (BUBBLE_MS + text.length * BUBBLE_MS_PER_CHAR) * (hold === 'long' ? LONG_BUBBLE_TIMES : 1);
    this.bubbles.push({ key, who, el, until: now + ms, bar: hold === 'bar' && !who.building, sat: false, held: hold === 'held' });
    while (this.bubbles.length > MAX_BUBBLES) {
      const k = this.bubbles.findIndex((b) => !b.held);
      this.bubbles.splice(k < 0 ? 0 : k, 1)[0]!.el.remove();
    }
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
    // One speaker asking every player (Jade's Patch 5: a Bog guardian's promise): this player's own question, with its buttons, is the one shown.
    const other = this.questions.find((q) => q.key === key);
    if (other && !buttons) return;
    if (other && !other.buttons) this.closeAsk(other.ask);
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

  /** Yes's tooltip has new words (the stock it counts has changed, Patch 3). Returns whether the question is up here with its buttons. */
  retell(ask: number, yes: string): boolean {
    const q = this.questions.find((x) => x.ask === ask);
    if (!q?.buttons) return false;
    q.buttons.describe('yes', yes);
    return true;
  }

  /** Every question up now (ask numbers). */
  openAsks(): number[] {
    return this.questions.map((q) => q.ask);
  }

  /**
   * Places every bubble over its speaker, drops the old ones, and has each
   * unit on screen remark once every 1 to 4.5 minutes of play (`speakers`:
   * candidates with their voice, e.g. 'halfling' or 'worker'; `line` what one
   * says, from what is round it, else a line of its REMARKS). `paused`: the
   * game is stopped, so nobody remarks and the waits stand still. `step`:
   * the game's step, which questions wait on. `sitting`: the units sitting at
   * a timed action now, whose 'bar' bubbles stay.
   */
  update(
    now: number,
    anchor: BubbleAnchor,
    speakers: () => Array<[number, string]>,
    paused = false,
    step = 0,
    sitting: ReadonlySet<number> = new Set(),
    line?: (id: number, voice: string) => string | null,
  ): void {
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
    if (paused) return;
    this.playMs += dt;
    if (this.playMs < this.nextRemark) return;
    this.nextRemark = this.playMs + REMARK_POLL_MS;
    const wait = (): number => REMARK_MIN_MS + Math.random() * (REMARK_MAX_MS - REMARK_MIN_MS);
    const seen = new Set<number>();
    let said = 0;
    for (const [id, voice] of speakers()) {
      seen.add(id);
      const at = this.remarkAt.get(id);
      // A unit just come on screen waits its first while, as it does between remarks.
      if (at === undefined) {
        this.remarkAt.set(id, this.playMs + wait());
        continue;
      }
      if (at > this.playMs || said >= REMARKS_AT_ONCE) continue;
      this.remarkAt.set(id, this.playMs + wait());
      if (this.bubbles.some((b) => b.key === `e:${id}`) || this.asking({ id }) || anchor.head(id) === null) continue;
      const own = REMARKS[voice];
      const text = line ? line(id, voice) : own && own.length > 0 ? own[Math.floor(Math.random() * own.length)]! : null;
      if (!text) continue;
      this.say(id, text, now, 'remark');
      said++;
    }
    for (const id of this.remarkAt.keys()) if (!seen.has(id)) this.remarkAt.delete(id);
  }

  private drop(key: string): void {
    const k = this.bubbles.findIndex((b) => b.key === key);
    if (k < 0) return;
    this.bubbles[k]!.el.remove();
    this.bubbles.splice(k, 1);
  }
}
