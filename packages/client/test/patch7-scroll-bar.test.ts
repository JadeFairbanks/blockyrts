// Patch 7's game-drawn scroll bar (Jade's J-16, plan section 7): the handle's
// size and place from the list, a drag of the handle and a click on the track.
import { describe, expect, it } from 'vitest';
import { dragTo, MIN_THUMB, PAGE_SHARE, pageTo, thumbOf } from '../src/hud/game-scroll.ts';

describe('the game scroll bar', () => {
  it('fills the track when the list fits, and shrinks the handle as the list grows', () => {
    expect(thumbOf(200, 200, 200, 0)).toEqual({ size: 200, at: 0 });
    expect(thumbOf(200, 200, 400, 0)).toEqual({ size: 100, at: 0 });
    // Never shorter than MIN_THUMB, however long the list.
    expect(thumbOf(200, 200, 100000, 0).size).toBe(MIN_THUMB);
  });

  it('moves the handle down the track as the list scrolls, to the bottom at the end', () => {
    expect(thumbOf(200, 200, 400, 100)).toEqual({ size: 100, at: 50 });
    expect(thumbOf(200, 200, 400, 200)).toEqual({ size: 100, at: 100 });
    // Past the end (a list that just got shorter) stays at the bottom.
    expect(thumbOf(200, 200, 400, 999).at).toBe(100);
  });

  it('scrolls the list by the handle\'s drag, within its room', () => {
    // 100 px of travel for 200 px of list: each pixel of drag is two of list.
    expect(dragTo(0, 30, 100, 200)).toBe(60);
    expect(dragTo(150, 80, 100, 200)).toBe(200);
    expect(dragTo(50, -80, 100, 200)).toBe(0);
    expect(dragTo(10, 5, 0, 200)).toBe(0);
  });

  it('pages toward a click on the track, by most of a screenful', () => {
    const page = Math.round(200 * PAGE_SHARE);
    expect(pageTo(0, 1, 200, 1000)).toBe(page);
    expect(pageTo(500, -1, 200, 1000)).toBe(500 - page);
    expect(pageTo(950, 1, 200, 1000)).toBe(1000);
    expect(pageTo(30, -1, 200, 1000)).toBe(0);
  });
});
