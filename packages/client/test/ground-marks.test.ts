// Patch 5: the ground the players' buildings wear (the art set's path and
// tilled soil tiles), and running water drawn with its own tile. After it:
// the Big House and every building with walk space stand on the ground they
// are on, grass first; a Barn grass or dirt, a Farm dirt.
import { describe, expect, it } from 'vitest';
import { BuildingKind, ChunkBuilder, CHUNK_COLUMNS, footprintRect, Mat, solidRect, WATER_PER_UNIT } from '@blockyrts/sim';
import { groundMarks, Mark, PATH_RING } from '../src/world/ground-marks.ts';
import { drawsGround, GroundCache, groundUnder } from '../src/world/ground-under.ts';
import { meshWater, WaterKind } from '../src/world/mesher.ts';

const farm = { id: 1, owner: 0, kind: BuildingKind.Farm, variant: 0, level: 1, upgrading: 0, x: 20, z: 20, farm: { res: 0, items: 0, food: 0, grows: true, done: 500, stepsLeft: 0, band: '' }, boost: null };
const at = (m: Uint8Array, x: number, z: number): number => m[z * 64 + x]!;

describe('ground marks (Patch 5)', () => {
  it('tills a Farm\'s field on dirt with no path round it, treads a path round a tower, and leaves walls and the peoples\' towers alone', () => {
    const wall = { ...farm, id: 2, kind: BuildingKind.Wall, x: 50, z: 50, farm: null };
    const tower = { ...farm, id: 3, kind: BuildingKind.Tower, x: 40, z: 4, farm: null };
    const peoples = { ...tower, id: 4, owner: 252, x: 4, z: 50 };
    const m = groundMarks([farm, wall, tower, peoples], 0, 0, 64);
    const [x0, z0, x1, z1] = footprintRect(farm);
    const [sx, sz] = solidRect(farm);
    expect(at(m, x1, z1)).toBe(Mark.Tilled);
    expect(at(m, sx, sz)).toBe(Mark.Ground + Mat.Soil);
    expect(at(m, x0 - 1, z0)).toBe(Mark.None);
    const [tx0, tz0] = footprintRect(tower);
    expect(at(m, tx0 - PATH_RING, tz0)).toBe(Mark.Path);
    expect(at(m, tx0 - PATH_RING - 1, tz0)).toBe(Mark.None);
    expect(at(m, 50, 50)).toBe(Mark.None);
    expect(at(m, 4, 50)).toBe(Mark.None);
    // Wet while bonemeal works it, and freshly sown.
    const boosted = { ...farm, boost: { left: 100, whole: 2400, queued: 0, auto: false, hawthorne: false } };
    expect(at(groundMarks([boosted], 0, 0, 64), x1, z1)).toBe(Mark.TilledWet);
    const sown = { ...farm, farm: { ...farm.farm, done: 20 } };
    expect(at(groundMarks([sown], 0, 0, 64), x1, z1)).toBe(Mark.TilledWet);
  });

  it('draws the ground under the Big House and every building with walk space, over a neighbour\'s path', () => {
    expect(drawsGround({ kind: BuildingKind.MainBase, x: 0, z: 0, level: 4 })).toBe(true);
    expect(drawsGround({ kind: BuildingKind.Barracks, x: 0, z: 0 })).toBe(true);
    expect(drawsGround({ kind: BuildingKind.Tower, x: 0, z: 0 })).toBe(false);
    expect(drawsGround({ kind: BuildingKind.Bonfire, x: 0, z: 0 })).toBe(false);
    const base = { ...farm, id: 4, kind: BuildingKind.MainBase, x: 10, z: 10, farm: null, ground: Mat.Grass };
    const [x0, z0, x1, z1] = footprintRect(base);
    // A tower beside it: its path round it stops at the Big House's edge.
    const tower = { ...farm, id: 5, kind: BuildingKind.Tower, x: x1 + 2, z: z0, farm: null };
    const m = groundMarks([base, tower], 0, 0, 64);
    for (const [x, z] of [[x0, z0], [x1, z1], [x1, z0], [x0, z1]] as const) expect(at(m, x, z)).toBe(Mark.Ground + Mat.Grass);
    expect(at(m, x0 - 1, z0)).toBe(Mark.None);
    expect(at(m, x0, z1 + 1)).toBe(Mark.None);
    expect(at(m, x1 + 1, z0)).toBe(Mark.Path);
    // A peoples' building with walk space draws its ground too; one the worker has not read yet keeps its own columns.
    const lodge = { ...base, id: 6, kind: BuildingKind.Storehouse, owner: 252, x: 40, z: 40, ground: Mat.Sand };
    expect(at(groundMarks([lodge], 0, 0, 64), 40, 40)).toBe(Mark.Ground + Mat.Sand);
    expect(at(groundMarks([{ ...base, ground: undefined }], 0, 0, 64), x0, z0)).toBe(Mark.None);
  });

  it('reads the ground under a building: grass first, else the most of it; a Barn grass or dirt, a Farm dirt', () => {
    // Stone everywhere but a strip of sand at x 0 to 5, a grass column at (-1, -1) and dry grass at (30, 30).
    const top = (x: number, z: number): number =>
      x === -1 && z === -1 ? Mat.Grass : x === 30 && z === 30 ? Mat.DryGrass : x >= 0 && x <= 5 ? Mat.Sand : Mat.Stone;
    const land = { columns: (cx: number, cz: number) => ({ topMaterial: (i: number) => top(cx * 64 + (i % 64), cz * 64 + Math.floor(i / 64)) }) };
    const at0 = (kind: number, x: number, z: number) => ({ kind, x, z });
    // A Storehouse (8 x 8) across the chunk edge touching the grass column; on the dry grass; mostly on sand; mostly on stone.
    expect(groundUnder(land, at0(BuildingKind.Storehouse, -4, -4))).toBe(Mat.Grass);
    expect(groundUnder(land, at0(BuildingKind.Storehouse, 25, 25))).toBe(Mat.DryGrass);
    expect(groundUnder(land, at0(BuildingKind.Storehouse, 0, 10))).toBe(Mat.Sand);
    expect(groundUnder(land, at0(BuildingKind.Storehouse, 4, 10))).toBe(Mat.Stone);
    // A Mineshaft (6 wide) from x 3 is half sand, half stone: the lower material on a tie.
    expect(groundUnder(land, at0(BuildingKind.Mineshaft, 3, 10))).toBe(Math.min(Mat.Sand, Mat.Stone));
    expect(groundUnder(land, at0(BuildingKind.Barn, 0, 10))).toBe(Mat.Soil);
    expect(groundUnder(land, at0(BuildingKind.Barn, -10, -10))).toBe(Mat.Grass);
    expect(groundUnder(land, at0(BuildingKind.Farm, -10, -10))).toBe(Mat.Soil);
    // The cache reads the land again only when a chunk under the building changes.
    let reads = 0;
    let version = 0;
    const counted = { navEpoch: 0, navVersion: () => version, columns: (cx: number, cz: number) => { reads++; return land.columns(cx, cz); } };
    const cache = new GroundCache();
    const store = { id: 1, ...at0(BuildingKind.Storehouse, 4, 10) };
    expect(cache.of(counted, store)).toBe(Mat.Stone);
    const first = reads;
    counted.navEpoch++;
    expect(cache.of(counted, store)).toBe(Mat.Stone);
    expect(reads).toBe(first);
    version++;
    counted.navEpoch++;
    cache.of(counted, store);
    expect(reads).toBe(first * 2);
    expect(cache.of(counted, { id: 2, kind: BuildingKind.Tower, x: 0, z: 0 })).toBeUndefined();
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
