import { describe, expect, it } from 'vitest';
import { PropKind } from '@blockyrts/sim';
import { fishSpots } from '../src/world/fish-view.ts';
import { COLUMN_M } from '../src/world/mesher.ts';

// Patch 5 release check: a big fish keeps its whole length in the water, off the bank.
describe('the live fish', () => {
  it('swims round its spot in open water, and only along a narrow stream', () => {
    // One column with three open columns past it every way: a pond.
    const [pond] = fishSpots(PropKind.FishCatfish, [1, 2, 3], [3, 3, 3, 3]);
    expect(pond!.ax).toBeGreaterThan(0);
    expect(pond!.az).toBeGreaterThan(0);
    // A stream one column wide running along z: the 1.3 m catfish cannot turn across it.
    const [stream] = fishSpots(PropKind.FishCatfish, [1, 2, 3], [0, 0, 3, 3]);
    expect(stream!.ax).toBe(0);
    expect(stream!.az).toBeGreaterThan(0);
    expect(stream!.alongX).toBe(false);
    // Nose and tail stay in the water at the ends of its swim.
    expect(stream!.az + 0.65).toBeLessThanOrEqual((7 * COLUMN_M) / 2);
  });

  it('sits in the middle of the water round a column at the edge of a pond, and prefers water it fits in', () => {
    // Open water only toward +x: the spot moves out from the bank.
    const spots = fishSpots(PropKind.FishCatfish, [1, 2, 3, 5, 2, 3], [0, 3, 0, 0, 0, 0, 0, 0]);
    expect(spots).toHaveLength(1);
    expect(spots[0]!.x).toBeCloseTo(1 + 1.5 * COLUMN_M);
    // A lone column of water: the trout still shows, holding still.
    const [puddle] = fishSpots(PropKind.FishTrout, [1, 2, 3], [0, 0, 0, 0]);
    expect([puddle!.ax, puddle!.az]).toEqual([0, 0]);
  });
});
