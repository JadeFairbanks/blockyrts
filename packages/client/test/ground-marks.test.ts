// Patch 5: the ground the players' buildings wear (the art set's path and
// tilled soil tiles), and running water drawn with its own tile.
import { describe, expect, it } from 'vitest';
import { BuildingKind, ChunkBuilder, CHUNK_COLUMNS, footprintRect, Mat, solidRect, WATER_PER_UNIT } from '@blockyrts/sim';
import { groundMarks, Mark, PATH_RING } from '../src/world/ground-marks.ts';
import { meshWater, WaterKind } from '../src/world/mesher.ts';

const farm = { id: 1, owner: 0, kind: BuildingKind.Farm, variant: 0, level: 1, upgrading: 0, x: 20, z: 20, farm: { res: 0, items: 0, food: 0, grows: true, done: 500, stepsLeft: 0, band: '' }, boost: null };
const at = (m: Uint8Array, x: number, z: number): number => m[z * 64 + x]!;

describe('ground marks (Patch 5)', () => {
  it('tills a Farm\'s field, treads its farmhouse and a path round it, and leaves walls and the peoples\' buildings alone', () => {
    const wall = { ...farm, id: 2, kind: BuildingKind.Wall, x: 50, z: 50, farm: null };
    const peoples = { ...farm, id: 3, kind: BuildingKind.Storehouse, owner: 252, x: 4, z: 50, farm: null };
    const m = groundMarks([farm, wall, peoples], 0, 0, 64);
    const [x0, z0, x1, z1] = footprintRect(farm);
    const [sx, sz] = solidRect(farm);
    expect(at(m, x1, z1)).toBe(Mark.Tilled);
    expect(at(m, sx, sz)).toBe(Mark.Path);
    expect(at(m, x0 - PATH_RING, z0)).toBe(Mark.Path);
    expect(at(m, x0 - PATH_RING - 1, z0)).toBe(Mark.None);
    expect(at(m, 50, 50)).toBe(Mark.None);
    expect(at(m, 4, 50)).toBe(Mark.None);
    // Wet while bonemeal works it, and freshly sown.
    const boosted = { ...farm, boost: { left: 100, whole: 2400, queued: 0, auto: false, hawthorne: false } };
    expect(at(groundMarks([boosted], 0, 0, 64), x1, z1)).toBe(Mark.TilledWet);
    const sown = { ...farm, farm: { ...farm.farm, done: 20 } };
    expect(at(groundMarks([sown], 0, 0, 64), x1, z1)).toBe(Mark.TilledWet);
  });

  it('draws a stream\'s shallow water with the stream tile, and its deep water and still water as before', () => {
    const b = new ChunkBuilder();
    for (let i = 0; i < CHUNK_COLUMNS; i++) {
      b.beginColumn(i);
      // Shallow everywhere but the last row, which is deep; the west half runs.
      b.layer(-40, i >= CHUNK_COLUMNS - 64 ? -20 : -2, Mat.Sand);
      b.water[i] = 0;
      if (i % 64 < 32) b.source[i] = 1;
    }
    const c = b.finish(0, 0);
    const w = meshWater({ centre: c, west: c, east: c, north: c, south: c })!;
    const kinds = new Set(w.mats);
    expect(kinds.has(WaterKind.Stream)).toBe(true);
    expect(kinds.has(WaterKind.Shallow)).toBe(true);
    expect(kinds.has(WaterKind.Deep)).toBe(true);
    expect(WATER_PER_UNIT).toBe(32);
  });
});
