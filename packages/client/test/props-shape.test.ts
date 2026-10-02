import { PropKind } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { CUBE_STRIDE, propCubes } from '../src/world/props-gen.ts';

interface Cube {
  cx: number;
  by: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  rgb: number;
}

const cubesOf = (kind: number, variant: number, size = 1000): Cube[] => {
  const out: number[] = [];
  propCubes({ kind, lx: 0, lz: 0, y: 0, variant, stage: 2, size }, out);
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

const STICK = 0x7a5a3a;

describe('tree and hazel proportions', () => {
  it('every hazel stick tip ends inside a leaf clump', () => {
    for (let variant = 1; variant < 400; variant++) {
      for (const size of [1000, 600, 300]) {
        const cubes = cubesOf(PropKind.Hazel, variant * 7919, size);
        const sticks = cubes.filter((c) => c.rgb === STICK);
        const leaves = cubes.filter((c) => c.rgb !== STICK);
        expect(sticks.length).toBeGreaterThanOrEqual(4);
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
        for (const size of [1000, 500]) {
          const [trunk, ...crown] = cubesOf(kind, variant * 104729, size);
          const tip = trunk!.by + trunk!.sy;
          expect(crown.some((l) => inside(l, trunk!.cx, tip, trunk!.cz)), `kind ${kind} variant ${variant}`).toBe(true);
          // The trunk is thinner than every crown cube, so it never shows through a side.
          for (const l of crown) expect(l.sx).toBeGreaterThan(trunk!.sx);
        }
      }
    }
  });
});
