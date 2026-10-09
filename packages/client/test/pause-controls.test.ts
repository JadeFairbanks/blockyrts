// Jade's patch notes 1, the client pieces that need no browser: Space centres
// on the selection and the latest urgent message moves to F4, and nobody
// makes a random remark while the game is paused. The menu, the banner and
// the pause between two players are checked in a browser by
// test-e2e/m9-online.mjs and hud-check.mjs, and the relay's side in
// packages/server/test/room.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, clashes, keyFor } from '../src/input/bindings.ts';
import { SpeechBubbles } from '../src/hud/bubbles.ts';

describe('patch notes 1: camera keys', () => {
  it('puts Centre on the selection on Space and the latest urgent message on F4', () => {
    expect(keyFor({}, 'centre')).toBe('Space');
    expect(keyFor({}, 'urgent')).toBe('F4');
    expect(clashes({}, 'centre', 'Space')).toEqual([]);
    expect(clashes({}, 'urgent', 'F4')).toEqual([]);
    expect(ACTIONS.filter((a) => a.key === 'Space' || a.key === 'F4').map((a) => a.id)).toEqual(['centre', 'urgent']);
  });

  it('keeps a player’s own binding', () => {
    expect(keyFor({ centre: 'KeyK' }, 'centre')).toBe('KeyK');
  });
});

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

describe('patch notes 1: no random remarks while paused', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => new FakeEl() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const anchor = { head: () => ({ x: 100, y: 100 }), roof: () => null };
  const speakers = (): Array<[number, string]> => [[7, 'worker']];

  it('says nothing while paused, and the wait for the next remark stands still', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const say = vi.spyOn(bubbles, 'say');
    // Each unit's wait is 165 s, the middle of its 1 to 4.5 minutes (Jade's Patch 5, GP-28), counted from when it is first on screen.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    bubbles.update(0, anchor, speakers);
    for (let t = 50; t <= 164_000; t += 50) bubbles.update(t, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(0);
    // A minute paused just before it is due, frame by frame: nobody speaks.
    for (let t = 164_050; t <= 224_000; t += 50) bubbles.update(t, anchor, speakers, true);
    expect(say).toHaveBeenCalledTimes(0);
    // Carrying on, the wait still has its last second to run from before the pause.
    for (let t = 224_050; t <= 224_500; t += 50) bubbles.update(t, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(0);
    for (let t = 224_550; t <= 226_000; t += 50) bubbles.update(t, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(1);
  });
});
