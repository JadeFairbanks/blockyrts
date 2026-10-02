import { describe, expect, it } from 'vitest';
import { clampBoxCorner, type Rect } from '../src/hud/rects.ts';

// A 1000 x 600 window with a minimap bottom left, a selection panel bottom centre and a resource bar top right.
const W = 1000;
const H = 600;
const minimap: Rect = { x0: 0, y0: 400, x1: 300, y1: 600 };
const selection: Rect = { x0: 350, y0: 450, x1: 650, y1: 600 };
const resources: Rect = { x0: 700, y0: 0, x1: 1000, y1: 30 };
const panels = [minimap, selection, resources];

describe('the drag box corner', () => {
  it('follows the cursor in the game view', () => {
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: 600, y: 300 }, panels, W, H)).toEqual({ x: 600, y: 300 });
  });
  it('stops at the top of a panel below, sliding along it', () => {
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: 420, y: 520 }, panels, W, H)).toEqual({ x: 420, y: 450 });
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: 600, y: 590 }, panels, W, H)).toEqual({ x: 600, y: 450 });
  });
  it('stops at the side wall facing the start', () => {
    // Start right of the minimap and below its top: only its right edge can be the wall.
    expect(clampBoxCorner({ x: 320, y: 500 }, { x: 200, y: 550 }, panels, W, H)).toEqual({ x: 300, y: 550 });
  });
  it('picks the nearer wall when the start is diagonal to the panel', () => {
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: 290, y: 560 }, panels, W, H)).toEqual({ x: 300, y: 560 });
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: 100, y: 405 }, panels, W, H)).toEqual({ x: 100, y: 400 });
  });
  it('stops at the window edges', () => {
    expect(clampBoxCorner({ x: 500, y: 200 }, { x: -50, y: -20 }, panels, W, H)).toEqual({ x: 0, y: 0 });
  });
  it('stops under a top panel', () => {
    expect(clampBoxCorner({ x: 800, y: 200 }, { x: 900, y: 10 }, panels, W, H)).toEqual({ x: 900, y: 30 });
  });
  it('leaves the corner alone when the start itself was panned under a panel', () => {
    expect(clampBoxCorner({ x: 400, y: 500 }, { x: 420, y: 520 }, panels, W, H)).toEqual({ x: 420, y: 520 });
  });
});
