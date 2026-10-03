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
    // The gap between remarks is 0.6 to 1.4 times 9 s at random: pin it to 9 s so the count below is exact.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const anchor = { head: () => ({ x: 100, y: 100 }) };
  const speakers = (): Array<[number, string]> => [[7, 'worker']];

  it('says nothing while paused, and the wait for the next remark stands still', () => {
    const root = new FakeEl();
    const bubbles = new SpeechBubbles(root as unknown as HTMLElement);
    const say = vi.spyOn(bubbles, 'say');
    bubbles.update(0, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(1); // the first remark is due at once
    // A minute paused, frame by frame: nobody speaks.
    for (let t = 1000; t <= 61000; t += 50) bubbles.update(t, anchor, speakers, true);
    expect(say).toHaveBeenCalledTimes(1);
    // Carrying on, the next remark still waits its 9 s from before the pause: due at 70 s, the one after at 79 s.
    for (let t = 61050; t < 70000; t += 50) bubbles.update(t, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(1);
    for (let t = 70000; t <= 75000; t += 50) bubbles.update(t, anchor, speakers);
    expect(say).toHaveBeenCalledTimes(2);
  });
});
