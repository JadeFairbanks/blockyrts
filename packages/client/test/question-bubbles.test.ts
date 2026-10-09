// Patch 2, round 3: a question is a bubble that waits for its owner's Yes or
// No for 10 s of game time (Jade's Patch 3; standing still while paused), over
// the unit or the middle of the building's roof, and the speaker's other lines
// do not cover it. The buttons themselves are HUD buttons, checked in a
// browser. Jade's Patch 3 also holds some bubbles longer: a timed action's
// line while the bar runs, and the main base's advice twice as long; and a
// question's Yes tooltip takes new words when the stock it counts changes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechBubbles } from '../src/hud/bubbles.ts';
import type { YesNoButtons } from '../src/hud/yes-no.ts';

/** Just enough of an element for the bubble layer. */
class FakeEl {
  className = '';
  textContent = '';
  hidden = false;
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  private parent: FakeEl | null = null;
  append(...els: FakeEl[]): void {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
  }
  remove(): void {
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }
}

const anchor = { head: (id: number) => ({ x: id, y: 100 }), roof: (id: number) => ({ x: id, y: 50 }) };
const nobody = (): Array<[number, string]> => [];

function fakeButtons(): YesNoButtons & { dispose: ReturnType<typeof vi.fn>; describe: ReturnType<typeof vi.fn> } {
  return { el: new FakeEl(), dispose: vi.fn(), describe: vi.fn() } as unknown as YesNoButtons & { dispose: ReturnType<typeof vi.fn>; describe: ReturnType<typeof vi.fn> };
}

describe('question bubbles (Patch 2, round 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => new FakeEl() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a question over its unit, with its buttons, and lets nothing else cover it', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const layer = root.children[0]!;
    const buttons = fakeButtons();
    bubbles.ask(208, { id: 7 }, 'Three of us could use better kit. Upgrade?', 613, buttons);
    const q = layer.children[0]!;
    expect(q.className).toBe('bubble question mine');
    expect(q.children[0]!.textContent).toBe('Three of us could use better kit. Upgrade?');
    expect(q.children[1]).toBe(buttons.el);
    // Its speaker's other lines wait.
    bubbles.say(7, 'Upgraded to a flint spear.', 0);
    expect(layer.children.length).toBe(1);
    bubbles.update(0, anchor, nobody, false, 300);
    expect(q.hidden).toBe(false);
    expect(q.style.transform).toContain('translate(7px, 100px)');
  });

  it('shows another player\'s question without buttons, over a building\'s roof', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    bubbles.ask(9, { id: 3, building: true }, 'Three buildings are damaged. Repair them?', 700, null);
    const q = root.children[0]!.children[0]!;
    expect(q.className).toBe('bubble question');
    expect(q.children.length).toBe(1);
    bubbles.update(0, anchor, nobody, false, 10);
    expect(q.style.transform).toContain('translate(3px, 50px)');
  });

  it('waits in game time: paused it stays, and it goes at its last step', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const buttons = fakeButtons();
    bubbles.ask(1, { id: 7 }, "I'm hurt. Can I eat to heal?", 613, buttons);
    // A long pause: the game's step stands still.
    for (let t = 0; t < 120000; t += 1000) bubbles.update(t, anchor, nobody, true, 400);
    expect(bubbles.openAsks()).toEqual([1]);
    bubbles.update(121000, anchor, nobody, false, 613);
    expect(bubbles.openAsks()).toEqual([]);
    expect(buttons.dispose).toHaveBeenCalledTimes(1);
    expect(root.children[0]!.children.length).toBe(0);
  });

  it('closes on the answer, and then the speaker may talk again', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const buttons = fakeButtons();
    bubbles.ask(5, { id: 7 }, 'No more softwood nearby. Look farther off?', 613, buttons);
    expect(bubbles.closeAsk(5)).toBe(true);
    expect(bubbles.closeAsk(5)).toBe(false);
    expect(buttons.dispose).toHaveBeenCalledTimes(1);
    bubbles.say(7, "I'll fetch softwood from farther off.", 0);
    expect(root.children[0]!.children.map((c) => c.textContent)).toEqual(["I'll fetch softwood from farther off."]);
  });

  it("gives Yes's tooltip new words when the stock it counts changes (Jade's Patch 3), the bubble as it was", () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const buttons = fakeButtons();
    bubbles.ask(4, { id: 7 }, 'Four of us could use better tools. Upgrade?', 613, buttons);
    bubbles.ask(6, { id: 8 }, 'Three of us could use better kit. Upgrade?', 613, null);
    const q = root.children[0]!.children[0]!;
    expect(bubbles.retell(4, 'The stock pays for 2 of the 4.')).toBe(true);
    expect(buttons.describe).toHaveBeenCalledWith('yes', 'The stock pays for 2 of the 4.');
    expect(root.children[0]!.children[0]).toBe(q);
    expect(q.children[0]!.textContent).toBe('Four of us could use better tools. Upgrade?');
    // Another player's question has no buttons here; a closed one is gone.
    expect(bubbles.retell(6, 'x')).toBe(false);
    bubbles.closeAsk(4);
    expect(bubbles.retell(4, 'x')).toBe(false);
  });
});

describe("held bubbles (Jade's Patch 3)", () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => new FakeEl() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const texts = (root: FakeEl): string[] => root.children[0]!.children.map((c) => c.textContent);

  it("keeps a timed action's line up while its bar runs, however long, and drops it when the bar ends", () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    bubbles.say(7, 'Upgrading to bronze scale armour.', 0, 'own', 'bar');
    bubbles.say(8, 'Off to the forge for a bronze sword.', 0);
    const sitting = new Set([7]);
    for (let t = 0; t <= 60000; t += 500) bubbles.update(t, anchor, nobody, false, 0, sitting);
    expect(texts(root)).toEqual(['Upgrading to bronze scale armour.']);
    bubbles.update(60500, anchor, nobody, false, 0, new Set());
    expect(texts(root)).toEqual([]);
  });

  it('lets a held line go at the usual time when its bar never shows', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    bubbles.say(7, "I'm eating my fill of farm fare.", 0, 'own', 'bar');
    bubbles.update(1000, anchor, nobody, false, 0, new Set());
    expect(texts(root).length).toBe(1);
    bubbles.update(20000, anchor, nobody, false, 0, new Set());
    expect(texts(root)).toEqual([]);
  });

  it("keeps the main base's advice twice as long as a usual bubble", () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const text = 'If you upgrade all their tools you may not be able to make any structures right away, choose wisely.';
    bubbles.speak({ id: 3, building: true }, text, 0, 'own', 'long');
    bubbles.speak({ id: 4, building: true }, text, 0);
    // Patch 5 (UI-19): a second longer than the 3.5 s base before.
    const usual = 4500 + text.length * 40;
    bubbles.update(usual + 1, anchor, nobody);
    expect(texts(root)).toEqual([text]);
    bubbles.update(2 * usual - 1, anchor, nobody);
    expect(texts(root)).toEqual([text]);
    bubbles.update(2 * usual + 1, anchor, nobody);
    expect(texts(root)).toEqual([]);
  });
});
