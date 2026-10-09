// Generated rocks and trees (Terrain, Generated rocks and trees): every prop
// is a few unrotated cuboids built from its seeded variant, so every machine
// draws the same tree, and all of them draw as one instanced cube per chunk.
// Plants are drawn at their growth stage (sim world/props.ts): a seed, a
// sapling with its own look, then the full look at each stage's size, so they
// grow in steps like crops. Also the scenery: grass tufts, pebbles and
// flowers, decoration only.
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

/** Hazel stick colour. */
export const HAZEL_STICK = 0x7a5a3a;
const HAZEL_LEAF = 0x6a9a40;

type CubeFn = (cx: number, by: number, cz: number, sx: number, sy: number, sz: number, rgb: number) => void;

/**
 * A tree sapling: a thin stem with a little crown of its species' leaves,
 * about an eighth of the grown tree's height (a conifer's crown in small
 * tiers, a broadleaf's in tufts). The stem's tip stays inside the crown.
 */
function saplingCubes(species: Species, r: Rand, s: number, cube: CubeFn): void {
  const h = Math.max(0.35, r.range(species.height[0], species.height[1]) * s);
  const leaves = shade(species.leaves, r.range(1.0, 1.15));
  const stem = Math.max(0.04, species.trunkWidth * 0.18);
  cube(0, 0, 0, stem, h * 0.94, stem, species.trunk);
  if (species.form === 'tiers') {
    for (let t = 0; t < 3; t++) {
      const w = h * (0.42 - t * 0.11);
      cube(r.range(-0.02, 0.02), h * (0.28 + t * 0.22), r.range(-0.02, 0.02), w, h * 0.26, w, shade(leaves, 0.94 + t * 0.05));
    }
    return;
  }
  const w = h * 0.5;
  cube(0, h * 0.5, 0, w, h * 0.5, w, leaves);
  for (let t = 0; t < 2; t++) {
    const side = t === 0 ? -1 : 1;
    cube(side * w * r.range(0.35, 0.5), h * r.range(0.35, 0.5), r.range(-0.2, 0.2) * w, w * 0.5, h * 0.25, w * 0.5, shade(leaves, r.range(0.9, 1.05)));
  }
}

/**
 * A hazel sapling: what grows back from the stump of a bush picked bare. A
 * low root clump with three to five young shoots, each with a tuft of leaves
 * at its tip, knee-high (Jade's patch notes 1: more than a stick nub).
 */
function hazelSaplingCubes(r: Rand, cube: CubeFn): void {
  cube(0, 0, 0, 0.3, 0.1, 0.3, 0x5e4630);
  const shoots = r.int(3, 5);
  for (let t = 0; t < shoots; t++) {
    const ox = r.range(-0.14, 0.14);
    const oz = r.range(-0.14, 0.14);
    const len = r.range(0.35, 0.6);
    cube(ox, 0, oz, 0.04, len, 0.04, HAZEL_STICK);
    const tuft = r.range(0.16, 0.24);
    cube(ox + r.range(-0.03, 0.03), len - tuft * 0.6, oz + r.range(-0.03, 0.03), tuft, tuft * 0.8, tuft, shade(HAZEL_LEAF, r.range(0.95, 1.15)));
  }
}

/** Ore colours on a stone outcrop. */
const ORE: Record<number, number> = {
  [PropKind.CopperOutcrop]: 0x4f9a7a,
  [PropKind.TinOutcrop]: 0xc8c8d2,
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

/** A rock with chunks set in its outside: coal rock, silver and gold nodes. */
interface Deposit {
  /** The rock's size, about metres across. */
  big: number;
  stone: number;
  chunk: number;
  /** A chunk's size, metres. */
  size: readonly [number, number];
  count: readonly [number, number];
}

const DEPOSIT: Record<number, Deposit> = {
  [PropKind.CoalRock]: { big: 1.15, stone: 0x7e8082, chunk: 0x1c1c20, size: [0.14, 0.32], count: [6, 9] },
  [PropKind.SilverNode]: { big: 0.85, stone: 0x86888a, chunk: 0xd6dae2, size: [0.07, 0.15], count: [4, 7] },
  [PropKind.GoldNode]: { big: 0.75, stone: 0x86888a, chunk: 0xe8c040, size: [0.06, 0.12], count: [3, 5] },
};

/**
 * A rock with chunks of something set in its outside (Jade's Patch 5, WL-7:
 * "small black chunks of various sizes and angles attached to the outside
 * ... attached fully and at least 30% clipping the rock they are attached
 * to"): a core block with a lower lump against one of its sides, and chunks
 * on its other sides and its top, each lying wholly within the face it sits
 * in and sunk 30% to 60% of its depth into the core. Cubes stay unrotated,
 * so a chunk's angle is drawn as a smaller block stepped against it, sunk
 * into the core as well. WL-4's silver and gold nodes are drawn the same
 * way with smaller chunks.
 */
function depositCubes(d: Deposit, r: Rand, cube: CubeFn): void {
  const hx = r.range(0.42, 0.55) * d.big;
  const hz = r.range(0.38, 0.5) * d.big;
  const h = r.range(0.7, 0.95) * d.big;
  cube(0, 0, 0, hx * 2, h, hz * 2, shade(d.stone, r.range(0.94, 1.04)));
  // Faces: 0 +x, 1 -x, 2 +z, 3 -z, 4 the top. The lump takes one side; the chunks the rest.
  const lump = r.int(0, 3);
  const lw = r.range(0.5, 0.7) * d.big;
  const lh = h * r.range(0.45, 0.65);
  const out = r.range(0.25, 0.4) * d.big;
  if (lump < 2) cube((lump === 0 ? 1 : -1) * (hx + out - lw / 2), 0, r.range(-0.2, 0.2) * hz, lw, lh, lw * r.range(0.8, 1.1), shade(d.stone, r.range(0.86, 0.98)));
  else cube(r.range(-0.2, 0.2) * hx, 0, (lump === 2 ? 1 : -1) * (hz + out - lw / 2), lw * r.range(0.8, 1.1), lh, lw, shade(d.stone, r.range(0.86, 0.98)));
  const n = r.int(d.count[0], d.count[1]);
  for (let t = 0; t < n; t++) {
    let face = r.int(0, 4);
    if (face === lump) face = 4;
    const c = r.range(d.size[0], d.size[1]);
    const sx = c * r.range(0.8, 1.2);
    const sy = c * r.range(0.7, 1.1);
    const sz = c * r.range(0.8, 1.2);
    const colour = shade(d.chunk, r.range(0.85, 1.35));
    const sink = r.range(0.3, 0.6);
    // The stepped block: smaller, beside the chunk along the face, sunk into the core too.
    const step = r.next() < 0.6;
    const k2 = r.range(0.3, 0.5);
    const s2 = 0.6;
    if (face === 4) {
      const px = r.range(-hx + sx / 2, hx - sx / 2);
      const pz = r.range(-hz + sz / 2, hz - sz / 2);
      cube(px, h - sink * sy, pz, sx, sy, sz, colour);
      if (step) {
        const qx = Math.max(-hx + (sx * s2) / 2, Math.min(hx - (sx * s2) / 2, px + (r.next() < 0.5 ? -1 : 1) * sx * 0.7));
        cube(qx, h - k2 * sy * s2, pz, sx * s2, sy * s2, sz * s2, shade(colour, 0.9));
      }
      continue;
    }
    const alongX = face >= 2;
    const half = alongX ? hz : hx;
    const depth = alongX ? sz : sx;
    const width = alongX ? sx : sz;
    const sign = face === 0 || face === 2 ? 1 : -1;
    const at = sign * (half + depth * (0.5 - sink));
    const along = r.range(-(alongX ? hx : hz) + width / 2, (alongX ? hx : hz) - width / 2);
    const by = r.range(0.05 * h, h - sy);
    if (alongX) cube(along, by, at, sx, sy, sz, colour);
    else cube(at, by, along, sx, sy, sz, colour);
    if (step) {
      const at2 = sign * (half + depth * s2 * (0.5 - k2));
      const by2 = Math.max(0, Math.min(h - sy * s2, by + (r.next() < 0.5 ? -1 : 1) * sy * 0.6));
      if (alongX) cube(along, by2, at2, sx * s2, sy * s2, sz * s2, shade(colour, 0.9));
      else cube(at2, by2, along, sx * s2, sy * s2, sz * s2, shade(colour, 0.9));
    }
  }
}

/**
 * WL-5: a 3 m boulder, about 3 m across, "more detailed than just a single
 * stone colored block, but ... still a cohesive object": one mass of
 * stacked blocks narrowing to a rounded top, bulges on its flanks, dark
 * cracks down two faces, and moss and lichen on its top and a flank, all in
 * shades of the same stone (s).
 */
function boulderCubes(r: Rand, cube: CubeFn): void {
  const base = shade(0x8a8a86, r.range(0.94, 1.04));
  const w = r.range(2.8, 3.1);
  // Tiers, x and z as shares of its width, heights in metres: 3 m in all.
  const tiers: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0.6, 0.92],
    [1.02, 0.9, 0.95],
    [0.9, 0.8, 0.85],
    [0.66, 0.5, 0.62],
    [0.38, 0.2, 0.36],
  ];
  let y = 0;
  for (const [fx, sy, fz] of tiers) {
    cube(r.range(-0.04, 0.04), y, r.range(-0.04, 0.04), w * fx, sy, w * fz, shade(base, r.range(0.93, 1.06)));
    y += sy;
  }
  // Bulges low on each flank, where it is widest.
  for (let f = 0; f < 4; f++) {
    const sign = f % 2 === 0 ? 1 : -1;
    const bw = r.range(0.9, 1.4);
    const bh = r.range(0.6, 1.0);
    const by = r.range(0.15, 0.9);
    const along = r.range(-0.6, 0.6);
    if (f < 2) cube(sign * (w * 0.5 - 0.18), by, along, 0.6, bh, bw, shade(base, r.range(0.9, 1.02)));
    else cube(along, by, sign * (w * 0.475 - 0.18), bw, bh, 0.6, shade(base, r.range(0.9, 1.02)));
  }
  // Dark cracks down two faces.
  for (let t = 0; t < 2; t++) {
    const sign = r.next() < 0.5 ? -1 : 1;
    const ch = r.range(0.6, 1.2);
    const cy = r.range(0.1, 1.5 - ch);
    if (t === 0) cube(sign * (w * 0.5 + 0.03), cy, r.range(-0.8, 0.8), 0.1, ch, 0.07, shade(base, 0.55));
    else cube(r.range(-0.8, 0.8), cy, sign * (w * 0.46 + 0.03), 0.07, ch, 0.1, shade(base, 0.55));
  }
  // Moss on its top and on the ledge where it narrows, lichen on the lower ledge.
  cube(r.range(-0.1, 0.1), y - 0.02, r.range(-0.1, 0.1), w * 0.34, 0.06, w * 0.3, shade(0x5f7a3a, r.range(0.9, 1.1)));
  cube((r.next() < 0.5 ? -1 : 1) * w * 0.3, 2.28, r.range(-0.3, 0.3), w * 0.3, 0.05, w * 0.35, shade(0x6a8040, r.range(0.85, 1.0)));
  for (let t = 0; t < 3; t++) cube((t === 1 ? -1 : 1) * w * 0.48, 1.48, r.range(-1, 1), 0.12, 0.04, r.range(0.15, 0.3), shade(0xa8a870, r.range(0.9, 1.1)));
}

/** GP-31's berry bushes: leaf colour, berry colour, and a bramble's arching canes for the black berry. */
const BERRY: Record<number, { leaf: number; berry: number; canes: boolean }> = {
  [PropKind.BlackBerryBush]: { leaf: 0x3e6a2e, berry: 0x2a1a34, canes: true },
  [PropKind.RaspberryBush]: { leaf: 0x5a8a3a, berry: 0xc8283e, canes: false },
  [PropKind.BlueberryBush]: { leaf: 0x4a6e52, berry: 0x4060c0, canes: false },
};

/** A berry bush: two leaf clumps on a short stem, its berries on the outside of the lower clump; picked, the berries are gone and the bush stays (s). */
function berryBushCubes(b: { leaf: number; berry: number; canes: boolean }, grown: boolean, r: Rand, cube: CubeFn): void {
  const w = r.range(0.9, 1.15);
  const h = r.range(0.7, 0.95);
  const low = h * 0.75;
  cube(0, 0, 0, 0.12, 0.15, 0.12, 0x5a4630);
  cube(0, 0.1, 0, w, low, w * 0.9, shade(b.leaf, r.range(0.92, 1.06)));
  cube(r.range(-0.15, 0.15) * w, h * 0.45, r.range(-0.15, 0.15) * w, w * 0.7, h * 0.55, w * 0.65, shade(b.leaf, r.range(1.04, 1.14)));
  if (b.canes) {
    for (let t = 0; t < 3; t++) {
      const sign = t === 1 ? -1 : 1;
      const len = r.range(0.35, 0.55);
      const cy = r.range(0.3, low);
      if (t === 2) cube(r.range(-0.2, 0.2), cy, sign * (w * 0.45 + len / 2 - 0.1), 0.04, 0.04, len, 0x6a3a40);
      else cube(sign * (w * 0.5 + len / 2 - 0.1), cy, r.range(-0.2, 0.2), len, 0.04, 0.04, 0x6a3a40);
    }
  }
  if (!grown) return;
  const n = r.int(8, 12);
  const bs = 0.07;
  for (let t = 0; t < n; t++) {
    const face = r.int(0, 3);
    const sign = face % 2 === 0 ? 1 : -1;
    const by = r.range(0.15, 0.1 + low - bs);
    const colour = shade(b.berry, r.range(0.85, 1.2));
    if (face < 2) cube(sign * (w / 2 + bs / 2 - 0.03), by, r.range(-0.4, 0.4) * w, bs, bs, bs, colour);
    else cube(r.range(-0.45, 0.45) * w, by, sign * (w * 0.45 + bs / 2 - 0.03), bs, bs, bs, colour);
  }
}

/**
 * Wild flax (WL-10: "3 different flax models with no practical difference
 * to give some visual depth, and a forth model twice as tall that gives
 * twice as much flax"), by its variant: an upright clump, a tighter clump
 * of more and thinner stems, and a looser clump leaning in the wind; the
 * tall flax is the upright clump at twice the height. Each in flower when
 * grown.
 */
function flaxCubes(look: number, tall: boolean, s: number, grown: boolean, r: Rand, cube: CubeFn): void {
  const leaf = 0x6f9a5a;
  const flower = 0x7a9ae0;
  const stems = look === 1 ? 8 : tall ? 7 : 5;
  const spread = look === 1 ? 0.16 : look === 2 ? 0.3 : 0.25;
  const thick = look === 1 ? 0.035 : 0.05;
  const tallness = tall ? 2 : 1;
  for (let t = 0; t < stems; t++) {
    const ox = r.range(-spread, spread);
    const oz = r.range(-spread, spread);
    const h = r.range(look === 1 ? 0.35 : 0.25, look === 1 ? 0.55 : 0.5) * s * tallness;
    let tx = ox;
    if (look === 2) {
      // Leaning: the upper half of the stem stepped over with the wind.
      cube(ox, 0, oz, thick, h * 0.55, thick, leaf);
      tx = ox + 0.06;
      cube(tx, h * 0.5, oz, thick, h * 0.5, thick, shade(leaf, 1.05));
    } else cube(ox, 0, oz, thick, h, thick, shade(leaf, look === 1 ? 0.95 : 1));
    if (grown) cube(tx, h, oz, 0.08, 0.06, 0.08, shade(flower, look === 1 ? 1.12 : r.range(0.95, 1.05)));
  }
}

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
    if (p.stage === Stage.Sapling) {
      saplingCubes(species, r, s, cube);
      return;
    }
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
      if (p.stage === Stage.Sapling) {
        hazelSaplingCubes(r, cube);
        return;
      }
      const s = p.size / 1000;
      const stems = r.int(4, 6);
      // Sticks stand inside the lower leaf clump (1.6 s wide), so a small bush keeps them in too.
      const spread = 0.35 * Math.min(1, s / 0.5);
      const sticks: [number, number, number][] = [];
      for (let t = 0; t < stems; t++) {
        const ox = r.range(-spread, spread);
        const oz = r.range(-spread, spread);
        sticks.push([ox, oz, r.range(1.6, 2.4) * s]);
      }
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
        cube(ox, 0, oz, 0.06, h, 0.06, HAZEL_STICK);
      }
      return;
    }
    case PropKind.Herbs: {
      // Sprouting: short green stems; half-grown: taller; grown: in flower.
      const s = p.size / 1000;
      for (let t = 0; t < 5; t++) {
        const ox = r.range(-0.25, 0.25);
        const oz = r.range(-0.25, 0.25);
        const h = r.range(0.25, 0.5) * s;
        cube(ox, 0, oz, 0.05, h, 0.05, 0x4f8a3a);
        if (p.stage === Stage.Grown) cube(ox, h, oz, 0.08, 0.06, 0.08, 0xe8e0f0);
      }
      return;
    }
    case PropKind.WildFlax:
    case PropKind.FlaxTall:
      flaxCubes((p.variant >>> 0) % 3, p.kind === PropKind.FlaxTall, p.size / 1000, p.stage === Stage.Grown, r, cube);
      return;
    case PropKind.BlackBerryBush:
    case PropKind.RaspberryBush:
    case PropKind.BlueberryBush:
      berryBushCubes(BERRY[p.kind]!, p.stage === Stage.Grown, r, cube);
      return;
    case PropKind.Mushroom: {
      // GP-30: a little clutch of edible mushrooms at a tree's foot, tan caps on pale stems.
      for (let t = r.int(2, 4); t > 0; t--) {
        const ox = r.range(-0.15, 0.15);
        const oz = r.range(-0.15, 0.15);
        const h = r.range(0.1, 0.22);
        const w = r.range(0.14, 0.24);
        const cap = shade(0xb07040, r.range(0.85, 1.15));
        cube(ox, 0, oz, 0.05, h, 0.05, 0xe8e0cc);
        cube(ox, h, oz, w, 0.05, w, cap);
        cube(ox, h + 0.05, oz, w * 0.6, 0.03, w * 0.6, shade(cap, 1.1));
      }
      return;
    }
    case PropKind.Boulder:
      boulderCubes(r, cube);
      return;
    case PropKind.CoalRock:
    case PropKind.SilverNode:
    case PropKind.GoldNode:
      depositCubes(DEPOSIT[p.kind]!, r, cube);
      return;
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
    case PropKind.IronRock:
    case PropKind.MarbleRock:
    case PropKind.LeadOre:
    case PropKind.SurfaceGold: {
      const big = p.kind === PropKind.StoneOutcrop ? 1.5 : p.kind === PropKind.SurfaceGold ? 0.5 : 1.1;
      const stone = p.kind === PropKind.MarbleRock ? 0xe4e1da : 0x86888a;
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
    case PropKind.FishCatfish:
      // A fishing stretch: no cubes since Patch 5 (FR-1); its live fish swim in the water (world/fish-view.ts).
      return;
    case PropKind.SilverNugget: {
      // Jade's Patch 5 (MB-11): a few small silver nuggets on a guarded bog's ground.
      for (let t = r.int(1, 3); t > 0; t--) {
        const w = r.range(0.06, 0.11);
        cube(r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15), w, w * r.range(0.5, 0.8), w * r.range(0.8, 1.2), shade(0xd6dae2, r.range(0.9, 1.12)));
      }
      return;
    }
    case PropKind.LargeManaCrystal: {
      // Jade's Patch 5 (MF-2, MF-4): a Fae Guardian's large mana crystal node, a tall cluster on a rock (s).
      cube(0, 0, 0, 1.4, 0.35, 1.2, shade(0x86888a, r.range(0.9, 1.05)));
      cube(0, 0.35, 0, 0.42, 2.6, 0.42, shade(0x5ad8e8, 1.1));
      for (let t = r.int(5, 8); t > 0; t--) {
        const w = r.range(0.2, 0.36);
        cube(r.range(-0.55, 0.55), 0.3, r.range(-0.45, 0.45), w, r.range(0.8, 2), w, shade(0x5ad8e8, r.range(0.8, 1.15)));
      }
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
