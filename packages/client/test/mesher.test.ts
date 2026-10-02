import { describe, expect, it } from 'vitest';
import { ChunkBuilder, CHUNK_COLUMNS, Mat, NO_WATER, WATER_PER_UNIT, WorldGen, WorldLayout, type ChunkColumns } from '@blockyrts/sim';
import { meshChunk, meshLowRes, meshWater, UNIT_M, type MeshArrays } from '../src/world/mesher.ts';
import { CUBE_STRIDE, propCubes } from '../src/world/props-gen.ts';

/** A chunk whose column i has the layers layersOf(i) and optional water. */
function chunk(layersOf: (i: number) => number[][], water?: (i: number) => number): ChunkColumns {
  const b = new ChunkBuilder();
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    b.beginColumn(i);
    for (const [y0, y1, m] of layersOf(i)) b.layer(y0!, y1!, m!);
    if (water) b.water[i] = water(i);
  }
  return b.finish(0, 0);
}

const flat = (): ChunkColumns => chunk(() => [[-40, -1, Mat.Stone], [-1, 0, Mat.Grass]]);
const quads = (m: MeshArrays): number => m.indices.length / 6;

/** Normals of every quad, as 'x,y,z'. */
function facing(m: MeshArrays): Map<string, number> {
  const out = new Map<string, number>();
  for (let q = 0; q < quads(m); q++) {
    const k = `${Math.sign(m.normals[q * 12]!)},${Math.sign(m.normals[q * 12 + 1]!)},${Math.sign(m.normals[q * 12 + 2]!)}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

describe('chunk meshing', () => {
  it('draws flat land surrounded by flat land as one top face', () => {
    const c = flat();
    const m = meshChunk({ centre: c, west: c, east: c, north: c, south: c });
    expect(quads(m)).toBe(1);
    expect(m.positions[1]).toBeCloseTo(0);
  });

  it('draws a raised column as a top and four sides, merging the layers that show', () => {
    const c = chunk((i) => (i === 64 * 10 + 10 ? [[-40, -1, Mat.Stone], [-1, 0, Mat.Grass], [0, 8, Mat.Stone]] : [[-40, -1, Mat.Stone], [-1, 0, Mat.Grass]]));
    const m = meshChunk({ centre: c, west: c, east: c, north: c, south: c });
    const f = facing(m);
    expect(f.get('0,1,0')).toBeGreaterThanOrEqual(2);
    for (const side of ['1,0,0', '-1,0,0', '0,0,1', '0,0,-1']) expect(f.get(side)).toBe(1);
    // The side reaches from the ground to the top, 8 units.
    const ys = Array.from(m.positions.filter((_, k) => k % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(8 * UNIT_M);
  });

  it('shows the faces under an overhang and of a cave', () => {
    const c = chunk((i) => (i === 300 ? [[-40, -1, Mat.Stone], [-1, 0, Mat.Grass], [20, 24, Mat.Stone]] : [[-40, -1, Mat.Stone], [-1, 0, Mat.Grass]]));
    const m = meshChunk({ centre: c, west: c, east: c, north: c, south: c });
    expect(facing(m).get('0,-1,0')).toBe(1);
  });

  it('hides the border faces where a neighbour is missing, and shows them against lower land', () => {
    const high = chunk(() => [[-40, 10, Mat.Stone]]);
    const low = flat();
    const none = meshChunk({ centre: high, west: null, east: null, north: null, south: null });
    expect(quads(none)).toBe(1);
    const walled = meshChunk({ centre: high, west: low, east: low, north: low, south: low });
    // Four sides, each one face merged along the whole border.
    const f = facing(walled);
    for (const side of ['1,0,0', '-1,0,0', '0,0,1', '0,0,-1']) expect(f.get(side)).toBe(1);
  });

  it('draws still water as one surface and nothing where there is none', () => {
    const c = chunk(() => [[-40, -4, Mat.Mud]], () => 0);
    const w = meshWater({ centre: c, west: c, east: c, north: c, south: c });
    expect(w && quads(w)).toBe(1);
    const dry = flat();
    expect(meshWater({ centre: dry, west: dry, east: dry, north: dry, south: dry })).toBeNull();
    expect(c.water[0]).not.toBe(NO_WATER);
    expect(WATER_PER_UNIT).toBe(32);
  });

  it('meshes a generated chunk and its low-detail version', () => {
    const gen = new WorldGen(new WorldLayout(1, 1));
    const at = (x: number, z: number): ChunkColumns => gen.generateChunk(x, z).columns;
    const m = meshChunk({ centre: at(3, 3), west: at(2, 3), east: at(4, 3), north: at(3, 2), south: at(3, 4) });
    expect(quads(m)).toBeGreaterThan(10);
    expect(quads(m)).toBeLessThan(40000);
    const lr = meshLowRes(gen.lowRes(3, 3, 4));
    expect(quads(lr.land)).toBeGreaterThan(0);
    expect(quads(lr.land)).toBeLessThan(quads(m) + 1024);
  });
});

describe('generated props', () => {
  it('builds the same tree from the same variant and a smaller sapling', () => {
    const a: number[] = [];
    const b: number[] = [];
    propCubes({ kind: 0, lx: 3, lz: 4, y: 0, variant: 1234, stage: 2, size: 1000 }, a);
    propCubes({ kind: 0, lx: 3, lz: 4, y: 0, variant: 1234, stage: 2, size: 1000 }, b);
    expect(a).toEqual(b);
    expect(a.length % CUBE_STRIDE).toBe(0);
    const sapling: number[] = [];
    propCubes({ kind: 0, lx: 3, lz: 4, y: 0, variant: 1234, stage: 1, size: 300 }, sapling);
    const height = (cubes: number[]): number => {
      let h = 0;
      for (let k = 0; k < cubes.length; k += CUBE_STRIDE) h = Math.max(h, cubes[k + 1]! + cubes[k + 4]!);
      return h;
    };
    expect(height(sapling)).toBeLessThan(height(a) / 2);
  });

  it('builds something for every prop kind', () => {
    for (let kind = 0; kind < 30; kind++) {
      const out: number[] = [];
      propCubes({ kind, lx: 0, lz: 0, y: 0, variant: kind * 77, stage: 2, size: 1000 }, out);
      expect(out.length, `kind ${kind}`).toBeGreaterThan(0);
    }
  });
});
