// Generated rocks and trees (Terrain, Generated rocks and trees): every prop
// is a few unrotated cuboids built from its seeded variant, so every machine
// draws the same tree, and all of them draw as one instanced cube per chunk.
// Also the scenery: grass tufts, pebbles and flowers, decoration only.
//
// Cubes go into a flat list, CUBE_STRIDE numbers each: centre x, bottom y,
// centre z, size x, y, z (metres, relative to the chunk corner), colour.

import { PropKind, Stage, hash2 } from '@blockyrts/sim';
import { COLUMN_M, UNIT_M } from './mesher.ts';

export const CUBE_STRIDE = 7;

/** A prop as the mesh worker sees it. */
export interface PropLike {
  kind: number;
  lx: number;
  lz: number;
  /** Ground under it, terrain units. */
  y: number;
  variant: number;
  stage: number;
  /** Per mille of full size. */
  size: number;
}

/** A small seeded random stream from a prop's variant. */
class Rand {
  private n = 0;
  constructor(private readonly seed: number) {}
  /** 0 to 1. */
  next(): number {
    return (hash2(this.seed, this.n++, 0x5eed) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
}

const shade = (rgb: number, f: number): number => {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * f));
  const b = Math.min(255, Math.round((rgb & 255) * f));
  return (r << 16) | (g << 8) | b;
};

interface Species {
  trunk: number;
  leaves: number;
  height: [number, number];
  trunkWidth: number;
  /** Canopy shape: tiers (conifer), ball (small hardwood), broad (large hardwood), dead, thorn. */
  form: 'tiers' | 'ball' | 'broad' | 'dead' | 'thorn';
}

const SPECIES: Record<number, Species> = {
  [PropKind.Pine]: { trunk: 0x6b4a2f, leaves: 0x2f5a32, height: [9, 13], trunkWidth: 0.35, form: 'tiers' },
  [PropKind.Spruce]: { trunk: 0x5a3e28, leaves: 0x24483a, height: [8, 12], trunkWidth: 0.35, form: 'tiers' },
  [PropKind.SmallSoftwood]: { trunk: 0x6b4a2f, leaves: 0x3a6a3a, height: [4.5, 6.5], trunkWidth: 0.25, form: 'tiers' },
  [PropKind.Birch]: { trunk: 0xd8d4c8, leaves: 0x7aa04a, height: [7, 9], trunkWidth: 0.25, form: 'ball' },
  [PropKind.Hornbeam]: { trunk: 0x8a8a80, leaves: 0x4f7f38, height: [7, 9.5], trunkWidth: 0.3, form: 'ball' },
  [PropKind.Oak]: { trunk: 0x5a4430, leaves: 0x3f6b2a, height: [12, 16], trunkWidth: 0.9, form: 'broad' },
  [PropKind.Beech]: { trunk: 0x7d7a6e, leaves: 0x55803a, height: [13, 17], trunkWidth: 0.8, form: 'broad' },
  [PropKind.DeadTree]: { trunk: 0x5e5446, leaves: 0, height: [5, 8], trunkWidth: 0.35, form: 'dead' },
  [PropKind.Thornwood]: { trunk: 0x3a2f2a, leaves: 0, height: [3, 5], trunkWidth: 0.25, form: 'thorn' },
};

/**
 * Tree proportions (Jade, 2026-10-02): crowns about 20% smaller, shrinking from
 * the top so the trunk tip stays hidden, and trunks about 20% thicker. The
 * catalogue tree models on review/batch-2 were adjusted the same way.
 */
export const CROWN_SCALE = 0.8;
export const TRUNK_SCALE = 1.2;
/** Hazel sticks about 10% shorter, and cut further (to 82% at most) so every tip ends inside the leaves. */
export const HAZEL_STICK_SCALE = 0.9;
export const HAZEL_STICK_MIN_SCALE = 0.82;

/** Ore colours on a stone outcrop. */
const ORE: Record<number, number> = {
  [PropKind.CopperOutcrop]: 0x4f9a7a,
  [PropKind.TinOutcrop]: 0xc8c8d2,
  [PropKind.CoalSeam]: 0x222226,
  [PropKind.IronRock]: 0x9a4a2a,
  [PropKind.MarbleRock]: 0xeeebe4,
  [PropKind.LeadOre]: 0x6e7480,
  [PropKind.SurfaceGold]: 0xe0b830,
};
const PATCH: Record<number, number> = {
  [PropKind.BogIron]: 0x8a4a28,
  [PropKind.ClayBank]: 0xb07450,
  [PropKind.Sand]: 0xdcc890,
  [PropKind.Saltpetre]: 0xe8e4d8,
  [PropKind.Sulphur]: 0xd8c830,
  [PropKind.HotSpringSulphur]: 0xe0d040,
};

/** Adds one prop's cubes. */
export function propCubes(p: PropLike, out: number[]): void {
  const r = new Rand(p.variant);
  // Place within the column, off-centre a little.
  const x = (p.lx + 0.5) * COLUMN_M + r.range(-0.1, 0.1);
  const z = (p.lz + 0.5) * COLUMN_M + r.range(-0.1, 0.1);
  const y = p.y * UNIT_M;
  const cube = (cx: number, by: number, cz: number, sx: number, sy: number, sz: number, rgb: number): void => {
    out.push(x + cx, y + by, z + cz, sx, sy, sz, rgb);
  };
  const species = SPECIES[p.kind];
  if (species) {
    if (p.stage === Stage.Seed) {
      cube(0, 0, 0, 0.08, 0.12, 0.08, 0x6a8a3a);
      return;
    }
    const s = p.size / 1000;
    const height = r.range(species.height[0], species.height[1]) * s;
    const tw = Math.max(0.08, species.trunkWidth * TRUNK_SCALE * Math.sqrt(s));
    const tint = r.range(0.9, 1.1);
    const leaves = shade(species.leaves, tint);
    switch (species.form) {
      case 'tiers': {
        const trunkH = height * 0.3;
        const crownH = (height - trunkH) * CROWN_SCALE;
        const tiers = Math.max(2, Math.round(r.range(3, 5) * Math.min(1, s * 1.5)));
        // The trunk ends halfway up the top tier.
        cube(0, 0, 0, tw, trunkH + crownH * (1 - 0.5 / tiers), tw, species.trunk);
        const base = height * 0.42 * (species.height[0] < 6 ? 0.8 : 1);
        for (let t = 0; t < tiers; t++) {
          const f = 1 - t / tiers;
          const w = (base * f + 0.3 * s) * CROWN_SCALE;
          const ty = trunkH + (crownH * t) / tiers;
          cube(r.range(-0.05, 0.05), ty, r.range(-0.05, 0.05), w, (crownH / tiers) * 1.15, w, shade(leaves, 0.92 + t * 0.04));
        }
        break;
      }
      case 'ball': {
        const trunkH = height * 0.45;
        const w = height * 0.45 * CROWN_SCALE;
        const ch = height * CROWN_SCALE;
        cube(0, 0, 0, tw, trunkH + Math.min(0.5, ch * 0.3), tw, species.trunk);
        cube(0, trunkH, 0, w, ch * 0.45, w, leaves);
        cube(r.range(-0.3, 0.3) * w, trunkH + ch * 0.3, r.range(-0.3, 0.3) * w, w * 0.65, ch * 0.25, w * 0.65, shade(leaves, 1.08));
        cube(r.range(-0.4, 0.4) * w, trunkH - 0.2 * s, r.range(-0.4, 0.4) * w, w * 0.5, ch * 0.2, w * 0.5, shade(leaves, 0.9));
        break;
      }
      case 'broad': {
        const trunkH = height * 0.4;
        cube(0, 0, 0, tw, trunkH + 1 * s, tw, species.trunk);
        const w = height * 0.65 * CROWN_SCALE;
        const ch = height * CROWN_SCALE;
        cube(0, trunkH, 0, w, ch * 0.35, w, leaves);
        for (let b = 0; b < 4; b++) {
          const a = (b / 4) * Math.PI * 2 + r.range(0, 1);
          cube(Math.cos(a) * w * 0.35, trunkH + ch * r.range(0.1, 0.3), Math.sin(a) * w * 0.35, w * r.range(0.4, 0.55), ch * 0.25, w * r.range(0.4, 0.55), shade(leaves, r.range(0.88, 1.1)));
        }
        cube(0, trunkH + ch * 0.3, 0, w * 0.6, ch * 0.2, w * 0.6, shade(leaves, 1.1));
        break;
      }
      case 'dead': {
        cube(0, 0, 0, tw, height, tw, species.trunk);
        for (let b = 0; b < 3; b++) {
          const len = r.range(0.8, 1.6) * s;
          const by = height * r.range(0.45, 0.85);
          if (r.next() < 0.5) cube((r.next() < 0.5 ? -1 : 1) * len * 0.5, by, 0, len, tw * 0.6, tw * 0.6, shade(species.trunk, 0.9));
          else cube(0, by, (r.next() < 0.5 ? -1 : 1) * len * 0.5, tw * 0.6, tw * 0.6, len, shade(species.trunk, 0.9));
        }
        break;
      }
      case 'thorn': {
        let cx = 0;
        let cz = 0;
        let by = 0;
        const seg = 4;
        for (let t = 0; t < seg; t++) {
          const h = height / seg;
          cube(cx, by, cz, tw, h + 0.05, tw, species.trunk);
          by += h;
          cx += r.range(-0.25, 0.25) * s;
          cz += r.range(-0.25, 0.25) * s;
          cube(cx + r.range(-0.4, 0.4), by - h * 0.5, cz + r.range(-0.4, 0.4), 0.5 * s, 0.08, 0.08, 0x2a221e);
        }
        break;
      }
    }
    return;
  }
  switch (p.kind) {
    case PropKind.Hazel: {
      const s = p.size / 1000;
      const stems = r.int(4, 6);
      // Sticks stand inside the lower leaf clump (1.6 s wide), so a small bush keeps them in too.
      const spread = 0.35 * Math.min(1, s / 0.5);
      const sticks: [number, number, number][] = [];
      for (let t = 0; t < stems; t++) {
        const ox = r.range(-spread, spread);
        const oz = r.range(-spread, spread);
        sticks.push([ox, oz, s > 0 ? r.range(1.6, 2.4) * s : 0.25]);
      }
      if (s > 0) {
        const lowTop = 2.1 * s;
        cube(0, 0.9 * s, 0, 1.6 * s, 1.2 * s, 1.6 * s, shade(0x5a8a35, r.range(0.9, 1.1)));
        const tx = r.range(-0.3, 0.3);
        const tz = r.range(-0.3, 0.3);
        const topTop = 2.3 * s;
        cube(tx, 1.6 * s, tz, 1.0 * s, 0.7 * s, 1.0 * s, shade(0x6a9a40, r.range(0.95, 1.1)));
        for (const [ox, oz, len] of sticks) {
          // A tip ends a little below the top of the clump it is under.
          const underTop = Math.abs(ox - tx) < 0.5 * s && Math.abs(oz - tz) < 0.5 * s;
          const cap = (underTop ? topTop : lowTop) - 0.08 * s;
          const h = Math.max(len * HAZEL_STICK_MIN_SCALE, Math.min(len * HAZEL_STICK_SCALE, cap));
          cube(ox, 0, oz, 0.06, h, 0.06, 0x7a5a3a);
        }
      } else {
        for (const [ox, oz, len] of sticks) cube(ox, 0, oz, 0.06, len, 0.06, 0x7a5a3a);
      }
      return;
    }
    case PropKind.Herbs:
    case PropKind.WildFlax: {
      const s = Math.max(0.15, p.size / 1000);
      const leaf = p.kind === PropKind.Herbs ? 0x4f8a3a : 0x6f9a5a;
      const flower = p.kind === PropKind.Herbs ? 0xe8e0f0 : 0x7a9ae0;
      for (let t = 0; t < 5; t++) {
        const ox = r.range(-0.25, 0.25);
        const oz = r.range(-0.25, 0.25);
        const h = r.range(0.25, 0.5) * s;
        cube(ox, 0, oz, 0.05, h, 0.05, leaf);
        if (p.size > 0) cube(ox, h, oz, 0.08, 0.06, 0.08, flower);
      }
      return;
    }
    case PropKind.LooseStone:
    case PropKind.FlintScatter: {
      const colour = p.kind === PropKind.LooseStone ? 0x8a8c8e : 0x45464c;
      const n = r.int(3, 6);
      for (let t = 0; t < n; t++) {
        const w = r.range(0.12, 0.3);
        cube(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4), w, w * r.range(0.4, 0.8), w * r.range(0.7, 1.2), shade(colour, r.range(0.85, 1.1)));
      }
      return;
    }
    case PropKind.StoneOutcrop:
    case PropKind.CopperOutcrop:
    case PropKind.TinOutcrop:
    case PropKind.CoalSeam:
    case PropKind.IronRock:
    case PropKind.MarbleRock:
    case PropKind.LeadOre:
    case PropKind.SurfaceGold: {
      const big = p.kind === PropKind.StoneOutcrop ? 1.5 : p.kind === PropKind.SurfaceGold ? 0.5 : 1.1;
      const stone = p.kind === PropKind.MarbleRock ? 0xe4e1da : p.kind === PropKind.CoalSeam ? 0x55555a : 0x86888a;
      const n = r.int(3, 6);
      for (let t = 0; t < n; t++) {
        const w = r.range(0.4, 1) * big;
        cube(r.range(-0.5, 0.5) * big, 0, r.range(-0.5, 0.5) * big, w, w * r.range(0.5, 1.1), w * r.range(0.7, 1.2), shade(stone, r.range(0.85, 1.08)));
      }
      const ore = ORE[p.kind];
      if (ore !== undefined) {
        for (let t = 0; t < r.int(3, 5); t++) {
          const w = r.range(0.12, 0.25) * big;
          cube(r.range(-0.45, 0.45) * big, r.range(0.1, 0.5) * big, r.range(-0.45, 0.45) * big, w, w, w, shade(ore, r.range(0.9, 1.15)));
        }
      }
      return;
    }
    case PropKind.Carcass: {
      // Where an animal fell, until its meat is taken: a body on its side and a little blood (s).
      const big = p.variant === 13 ? 1.6 : p.variant === 1 || p.variant === 4 ? 0.35 : 1;
      cube(0, 0, 0, 0.5 * big, 0.3 * big, 1 * big, shade(0x6a4a34, r.range(0.85, 1.1)));
      cube(0, 0, 0.6 * big, 0.3 * big, 0.25 * big, 0.3 * big, shade(0x5a3e2a, r.range(0.85, 1.1)));
      cube(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3), 0.6 * big, 0.02, 0.5 * big, 0x6a1010);
      return;
    }
    case PropKind.FishTrout:
    case PropKind.FishSalmon:
    case PropKind.FishCatfish: {
      // A fishing stretch: a few silver flashes at the water's edge.
      const colour = p.kind === PropKind.FishTrout ? 0xb8c8c8 : p.kind === PropKind.FishSalmon ? 0xd89a80 : 0x6a705a;
      for (let t = 0; t < r.int(3, 5); t++) cube(r.range(-0.6, 0.6), 0.02, r.range(-0.6, 0.6), 0.25, 0.05, 0.08, shade(colour, r.range(0.85, 1.15)));
      return;
    }
    case PropKind.SurfaceGem:
    case PropKind.ManaCrystal: {
      const colour = p.kind === PropKind.ManaCrystal ? 0x5ad8e8 : 0xc03a6a;
      const big = p.kind === PropKind.ManaCrystal ? 1 : 0.4;
      for (let t = 0; t < r.int(3, 5); t++) {
        const w = r.range(0.12, 0.25) * big;
        cube(r.range(-0.3, 0.3) * big, 0, r.range(-0.3, 0.3) * big, w, r.range(0.5, 1.4) * big, w, shade(colour, r.range(0.85, 1.15)));
      }
      return;
    }
    default: {
      const colour = PATCH[p.kind] ?? 0xff00ff;
      for (let t = 0; t < r.int(3, 6); t++) {
        const w = r.range(0.5, 1.2);
        cube(r.range(-0.6, 0.6), 0, r.range(-0.6, 0.6), w, 0.06, w * r.range(0.6, 1.3), shade(colour, r.range(0.88, 1.1)));
      }
    }
  }
}

/** Grass tufts, pebbles and flowers on one column of open ground (decoration only). */
export function sceneryCubes(seed: number, gx: number, gz: number, lx: number, lz: number, top: number, material: number, out: number[]): void {
  const h = hash2(seed ^ 0x5ce4e, gx, gz) >>> 0;
  const roll = h % 1000;
  const x = (lx + 0.5) * COLUMN_M;
  const z = (lz + 0.5) * COLUMN_M;
  const y = top * UNIT_M;
  const jx = (((h >>> 10) & 15) - 7.5) * 0.02;
  const jz = (((h >>> 14) & 15) - 7.5) * 0.02;
  if (material === 1 || material === 2) {
    const grass = material === 1 ? 0x6a9a40 : 0xa8a058;
    if (roll < 70) {
      out.push(x + jx, y, z + jz, 0.05, 0.18 + ((h >>> 18) & 7) * 0.025, 0.05, grass);
      out.push(x + jx + 0.07, y, z + jz - 0.04, 0.05, 0.12 + ((h >>> 21) & 7) * 0.02, 0.05, shade(grass, 1.1));
    } else if (roll < 78) {
      const flower = [0xe8d84a, 0xe8e8f0, 0xc85a8a, 0x8a7ae0][(h >>> 24) & 3]!;
      out.push(x + jx, y, z + jz, 0.03, 0.2, 0.03, 0x4f7f30);
      out.push(x + jx, y + 0.2, z + jz, 0.08, 0.05, 0.08, flower);
    } else if (roll < 81) {
      out.push(x + jx, y, z + jz, 0.12, 0.06, 0.1, 0x8a8a86);
    }
  } else if (material === 3 || material === 6 || material === 17 || material === 15) {
    if (roll < 25) out.push(x + jx, y, z + jz, 0.1, 0.05, 0.12, 0x7e7c78);
  }
}
