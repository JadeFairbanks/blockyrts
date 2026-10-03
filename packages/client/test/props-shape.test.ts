import { HAZEL_GROWTH, PropKind, Stage, TREE_GROWTH } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { CUBE_STRIDE, HAZEL_STICK, propCubes } from '../src/world/props-gen.ts';

interface Cube {
  cx: number;
  by: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  rgb: number;
}

const cubesOf = (kind: number, variant: number, size = 1000, stage: number = Stage.Grown): Cube[] => {
  const out: number[] = [];
  propCubes({ kind, lx: 0, lz: 0, y: 0, variant, stage, size }, out);
  const cubes: Cube[] = [];
  for (let k = 0; k < out.length; k += CUBE_STRIDE) {
    const [cx, by, cz, sx, sy, sz, rgb] = out.slice(k, k + CUBE_STRIDE) as [number, number, number, number, number, number, number];
    cubes.push({ cx, by, cz, sx, sy, sz, rgb });
  }
  return cubes;
};

/** Whether the point lies inside the cube (a hair of slack on the faces). */
const inside = (c: Cube, x: number, y: number, z: number): boolean =>
  Math.abs(x - c.cx) <= c.sx / 2 + 1e-6 && Math.abs(z - c.cz) <= c.sz / 2 + 1e-6 && y >= c.by - 1e-6 && y <= c.by + c.sy + 1e-6;

const STICK = HAZEL_STICK;

describe('tree and hazel proportions', () => {
  it('every hazel stick tip ends inside a leaf clump, at every stage of growth', () => {
    for (let variant = 1; variant < 400; variant++) {
      for (const g of HAZEL_GROWTH) {
        const size = g.sizePm;
        const cubes = cubesOf(PropKind.Hazel, variant * 7919, size, g.stage);
        const sticks = cubes.filter((c) => c.rgb === STICK);
        const leaves = cubes.filter((c) => c.rgb !== STICK);
        expect(sticks.length).toBeGreaterThanOrEqual(g.stage === Stage.Sapling ? 3 : 4);
        for (const s of sticks) {
          const tip = s.by + s.sy;
          expect(leaves.some((l) => inside(l, s.cx, tip, s.cz)), `variant ${variant} size ${size}`).toBe(true);
        }
      }
    }
  });

  it('every tree trunk tip ends inside its crown', () => {
    const leafy = [PropKind.Pine, PropKind.Spruce, PropKind.SmallSoftwood, PropKind.Birch, PropKind.Hornbeam, PropKind.Oak, PropKind.Beech];
    for (const kind of leafy) {
      for (let variant = 1; variant < 100; variant++) {
        for (const g of TREE_GROWTH.filter((t) => t.stage !== Stage.Seed)) {
          const size = g.sizePm;
          const [trunk, ...crown] = cubesOf(kind, variant * 104729, size, g.stage);
          const tip = trunk!.by + trunk!.sy;
          expect(crown.some((l) => inside(l, trunk!.cx, tip, trunk!.cz)), `kind ${kind} variant ${variant}`).toBe(true);
          // The trunk is thinner than every crown cube, so it never shows through a side.
          for (const l of crown) expect(l.sx).toBeGreaterThan(trunk!.sx);
        }
      }
    }
  });
});

describe('plants grow in steps', () => {
  /** Height of the tallest cube top. */
  const height = (cubes: Cube[]): number => Math.max(...cubes.map((c) => c.by + c.sy));

  it('draws each tree stage taller than the one before, a sapling knee to shoulder high', () => {
    for (const kind of [PropKind.Pine, PropKind.SmallSoftwood, PropKind.Birch, PropKind.Oak]) {
      for (let variant = 1; variant < 40; variant++) {
        const heights = TREE_GROWTH.map((g) => height(cubesOf(kind, variant * 31337, g.sizePm, g.stage)));
        for (let k = 1; k < heights.length; k++) expect(heights[k]!, `kind ${kind} stage ${k}`).toBeGreaterThan(heights[k - 1]!);
        expect(heights[Stage.Sapling]!).toBeGreaterThanOrEqual(0.35);
        expect(heights[Stage.Sapling]!).toBeLessThan(2.2);
      }
    }
  });

  it('draws a hazel sapling as young shoots with leaves, more than a stub and smaller than a young bush', () => {
    for (let variant = 1; variant < 100; variant++) {
      const sapling = cubesOf(PropKind.Hazel, variant * 7919, 250, Stage.Sapling);
      const young = cubesOf(PropKind.Hazel, variant * 7919, 500, Stage.Young);
      expect(sapling.filter((c) => c.rgb !== STICK && c.sy > 0.1).length).toBeGreaterThanOrEqual(3);
      expect(height(sapling)).toBeGreaterThan(0.35);
      expect(height(sapling)).toBeLessThan(height(young));
    }
  });
});
