import { describe, expect, it } from 'vitest';
import { edgePanDirection } from '../src/camera/edge-pan.ts';
import type { Rect } from '../src/hud/rects.ts';

const W = 1000;
const H = 600;
const minimap: Rect = { x0: 0, y0: 400, x1: 300, y1: 600 };
const commands: Rect = { x0: 700, y0: 420, x1: 1000, y1: 600 };
const floating: Rect = { x0: 8, y0: 100, x1: 300, y1: 300 }; // does not touch the edge
const panels = [minimap, commands, floating];

describe('edge panning zones', () => {
  it('only the outermost 4 px count', () => {
    expect(edgePanDirection(500, 300, W, H, panels)).toBeNull();
    expect(edgePanDirection(4, 200, W, H, panels)).toBeNull();
    expect(edgePanDirection(3, 200, W, H, panels)).toEqual({ dx: -1, dy: 0 });
    expect(edgePanDirection(996, 200, W, H, panels)).toEqual({ dx: 1, dy: 0 });
    expect(edgePanDirection(500, 0, W, H, panels)).toEqual({ dx: 0, dy: -1 });
    expect(edgePanDirection(500, 599, W, H, panels)).toEqual({ dx: 0, dy: 1 });
  });
  it('is off where a panel touches the edge', () => {
    expect(edgePanDirection(150, 599, W, H, panels)).toBeNull(); // bottom, along the minimap
    expect(edgePanDirection(1, 500, W, H, panels)).toBeNull(); // left, along the minimap
    expect(edgePanDirection(999, 500, W, H, panels)).toBeNull(); // right, along the command card
    expect(edgePanDirection(1, 200, W, H, panels)).toEqual({ dx: -1, dy: 0 }); // a panel 8 px in does not count
  });
  it('still works and is diagonal in the 20 px corners', () => {
    expect(edgePanDirection(10, 599, W, H, panels)).toEqual({ dx: -1, dy: 1 });
    expect(edgePanDirection(1, 585, W, H, panels)).toEqual({ dx: -1, dy: 1 });
    expect(edgePanDirection(990, 599, W, H, panels)).toEqual({ dx: 1, dy: 1 });
    expect(edgePanDirection(0, 0, W, H, panels)).toEqual({ dx: -1, dy: -1 });
    expect(edgePanDirection(999, 10, W, H, panels)).toEqual({ dx: 1, dy: -1 });
  });
});
