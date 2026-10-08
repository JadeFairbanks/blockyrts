import { describe, expect, it } from 'vitest';
import { fitBounds, mapToWorld, MAX_MINIMAP_SIDE, minimapWindow, normalizeBounds, worldToMap, type Bounds } from '../src/minimap/transform.ts';

describe('minimap transform', () => {
  it('never shows less than 300 m a side', () => {
    expect(normalizeBounds({ minX: -50, minZ: -50, maxX: 50, maxZ: 50 })).toEqual({ minX: -150, minZ: -150, maxX: 150, maxZ: 150 });
    expect(normalizeBounds({ minX: 0, minZ: 0, maxX: 1000, maxZ: 100 })).toEqual({ minX: 0, minZ: -100, maxX: 1000, maxZ: 200 });
  });
  it('fits the bounds into the canvas, centred, and maps both ways', () => {
    const b = { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
    const t = fitBounds(b, 400, 200);
    expect(t.scale).toBeCloseTo(200 / 300);
    expect(worldToMap(t, 0, 0)).toEqual({ x: 200, y: 100 });
    expect(worldToMap(t, -150, -150)).toEqual({ x: 100, y: 0 });
    const w = mapToWorld(t, b, 300, 200);
    expect(w.x).toBeCloseTo(150);
    expect(w.z).toBeCloseTo(150);
    // Outside the shown area clamps to it.
    expect(mapToWorld(t, b, 0, 0).x).toBe(-150);
  });
});

describe('the minimap over endless land (Patch 5 BG-5)', () => {
  const home = { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
  // Units walked 4.8 km east: a long strip of explored land.
  const strip = { minX: -30, minZ: -173, maxX: 4810, maxZ: 173 };
  const side = (b: Bounds): [number, number] => [b.maxX - b.minX, b.maxZ - b.minZ];

  it('shows the land whole while it fits, as before', () => {
    expect(minimapWindow(home, null, { x: 0, z: 0 }, 352 / 262)).toBe(home);
  });

  it('past that shows a window round the camera, as large across as the minimap is', () => {
    const at = minimapWindow(strip, null, { x: 2400, z: 0 }, 352 / 262);
    const [w, h] = side(at);
    expect(w).toBeCloseTo(MAX_MINIMAP_SIDE * (352 / 262));
    expect(h).toBe(346);
    expect((at.minX + at.maxX) / 2).toBeCloseTo(2400);
    // So a chunk keeps its size on the map however far the units go.
    expect(fitBounds(at, 352, 262).scale).toBeGreaterThan(0.4);
    // Never off the land: at the base the window starts at its west edge.
    expect(minimapWindow(strip, null, { x: 0, z: 0 }, 352 / 262).minX).toBe(-30);
  });

  it('stays put while the camera is inside it, so the map never moves under a click or drag', () => {
    const a = minimapWindow(strip, null, { x: 2400, z: 0 }, 352 / 262);
    expect(minimapWindow(strip, a, { x: a.maxX, z: 0 }, 352 / 262)).toBe(a);
    // The camera leaving it brings the window round it again.
    const b = minimapWindow(strip, a, { x: a.maxX + 50, z: 0 }, 352 / 262);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(a.maxX + 50);
  });
});
