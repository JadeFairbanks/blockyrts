// Patch 5: the ground the players' buildings wear (the art set's path and
// tilled soil tiles), and running water drawn with its own tile. After it:
// the Big House stands on the ground it is on, grass if any of it is.
import { describe, expect, it } from 'vitest';
import { BuildingKind, ChunkBuilder, CHUNK_COLUMNS, footprintRect, Mat, solidRect, WATER_PER_UNIT } from '@blockyrts/sim';
import { groundMarks, Mark, PATH_RING } from '../src/world/ground-marks.ts';
import { grassUnder, MATCHES_GROUND } from '../src/world/ground-under.ts';
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

  it('lays no path under or round the Big House: its ground is what it stands on, all of it grass if any of it is', () => {
    expect(MATCHES_GROUND.has(BuildingKind.MainBase)).toBe(true);
    const base = { ...farm, id: 4, kind: BuildingKind.MainBase, x: 10, z: 10, farm: null, grass: Mat.Grass };
    const [x0, z0, x1, z1] = footprintRect(base);
    // A Storehouse beside it: its path round it stops at the Big House's edge.
    const store = { ...farm, id: 5, kind: BuildingKind.Storehouse, x: x1 + 2, z: z0, farm: null };
    const m = groundMarks([base, store], 0, 0, 64);
    for (const [x, z] of [[x0, z0], [x1, z1], [x1, z0], [x0, z1]] as const) expect(at(m, x, z)).toBe(Mark.Grass);
    expect(at(m, x0 - 1, z0)).toBe(Mark.None);
    expect(at(m, x0, z1 + PATH_RING)).toBe(Mark.None);
    expect(at(m, x1 + 1, z0)).toBe(Mark.Path);
    // Dry grass draws as dry grass; no grass at all leaves its own ground, and no path is laid over it.
    expect(at(groundMarks([{ ...base, grass: Mat.DryGrass }], 0, 0, 64), x0, z0)).toBe(Mark.DryGrass);
    expect(at(groundMarks([{ ...base, grass: 0 }, store], 0, 0, 64), x1, z0)).toBe(Mark.Own);
    expect(at(groundMarks([{ ...base, grass: undefined }], 0, 0, 64), x0, z0)).toBe(Mark.Own);
  });

  it('finds the grass a footprint touches, across chunk edges', () => {
    // Soil everywhere but a grass column at (-1, -1) and dry grass at (5, 5).
    const land = {
      columns: (cx: number, cz: number) => ({
        topMaterial: (i: number) => {
          const x = cx * 64 + (i % 64);
          const z = cz * 64 + Math.floor(i / 64);
          return x === -1 && z === -1 ? Mat.Grass : x === 5 && z === 5 ? Mat.DryGrass : Mat.Soil;
        },
      }),
    };
    expect(grassUnder(land, [-3, -3, 6, 6])).toBe(Mat.Grass);
    expect(grassUnder(land, [0, 0, 6, 6])).toBe(Mat.DryGrass);
    expect(grassUnder(land, [-1, -1, -1, -1])).toBe(Mat.Grass);
    expect(grassUnder(land, [0, 0, 4, 4])).toBe(0);
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
