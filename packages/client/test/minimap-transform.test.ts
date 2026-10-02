import { describe, expect, it } from 'vitest';
import { fitBounds, mapToWorld, normalizeBounds, worldToMap } from '../src/minimap/transform.ts';

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
