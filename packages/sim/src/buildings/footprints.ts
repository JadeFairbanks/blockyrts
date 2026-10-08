// Building footprints (Table 4; Jade's patch notes 1: walkable areas match
// what is drawn): for each kind of building and each level, the columns its
// footprint covers and which of them units cannot walk through, the
// catalogue models drawn there, and where men stand on its top.
//
// The rows of a modelled level are measured from its models (pnpm --filter
// @blockyrts/tools footprints prints them, and the tools tests check them): a
// column is solid where a model fills the space a walker's body takes, from
// 1 m to 1.7 m up, or where walls close it off from outside. Walls, posts,
// stalls and low roofs block; fences, woodpiles, troughs and high eaves over
// open ground do not. A level marked `fitted` was set by hand against its
// models, for the reason given. Buildings without models yet are drawn as a
// block filling their footprint, and are solid in full.
//
// A building's anchor (Building x and z) is its level 1 corner, and stays
// put as it levels up: a footprint that grows grows round it, `ox` and `oz`
// columns from the anchor to the level's own corner. Since Patch 2 only the
// Big House has levels.

import { BuildingKind, buildingSpec } from './data.ts';

/** A catalogue model drawn for a level: its origin, Blockbench units (16 to a column) from the level's corner. */
export interface ModelAt {
  id: string;
  x: number;
  z: number;
  /** A colour (0xrrggbb) the model's texture is multiplied by: a stand-in model dressed as the building it stands in for. */
  tint?: number;
  /** Drawn this many times its size: a stand-in until the building's own model comes (1 when left out). */
  scale?: number;
}

/** Where a man stands on a building's top: Blockbench units from the level's corner, and up from its floor. */
export type Post = readonly [x: number, z: number, y: number];

export interface LevelFootprint {
  /** Columns from the anchor to this level's corner (0 unless the footprint grows round the anchor). */
  ox?: number;
  oz?: number;
  models?: readonly ModelAt[];
  /** One string per row, north (-Z) first, one character per column: '#' solid, '.' walkable. */
  rows: readonly string[];
  /** Set by hand, not measured from the models: why. */
  fitted?: string;
  /** Where the men who man its top stand, one per place (towers 4, a main base from tier 2 8). */
  posts?: readonly Post[];
}

/** A footprint w x d, solid in full. */
function block(w: number, d: number): LevelFootprint {
  return { rows: Array.from({ length: d }, () => '#'.repeat(w)) };
}

/** A tower's deck, 4.1 m up (the 5 m tower less its parapet): a man at each corner. */
const TOWER: readonly LevelFootprint[] = [{ ...block(3, 3), posts: [[12, 12, 146], [36, 12, 146], [12, 36, 146], [36, 36, 146]] }];

/** The Farm (Patch 2): the tier 1 crop field and its farmhouse in the north-west corner. */
const FARM: readonly LevelFootprint[] = [
  {
    models: [{ id: 'farm_field_t1', x: 96, z: 96 }, { id: 'farmhouse_t1', x: 56, z: 44 }],
    rows: [
      '.#####......',
      '.#####......',
      '.#####......',
      '.#####......',
      '.#####......',
      '.##.##......',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
];

/**
 * The footprint table: every kind, one entry per level (a kind with fewer
 * entries than levels keeps its last one for the rest). The main base's four
 * tiers (Patch 5) stand on the old levels 1, 3, 6 and 10; the models of the
 * old levels between them stay in the catalogue, unused.
 */
export const FOOTPRINTS: Readonly<Record<number, readonly LevelFootprint[]>> = {
  [BuildingKind.MainBase]: [
    {
      models: [{ id: 'main_base_l1', x: 112, z: 112 }],
      rows: [
        '..............',
        '###...........',
        '###...........',
        '#########.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..#######.....',
        '..............',
        '..............',
      ],
    },
    {
      models: [{ id: 'main_base_l3', x: 112, z: 112 }],
      rows: [
        '..............',
        '..............',
        '..............',
        '..##########..',
        '...########...',
        '..##########..',
        '..##########..',
        '..##########..',
        '..##########..',
        '..##########..',
        '..##########..',
        '..##########..',
        '..............',
        '..............',
      ],
      posts: [[60, 60, 154], [112, 60, 154], [164, 60, 154], [60, 112, 154], [112, 112, 154], [164, 112, 154], [60, 164, 154], [112, 164, 154]],
    },
    {
      models: [{ id: 'main_base_l6', x: 112, z: 112 }],
      rows: [
        '..............',
        '..............',
        '..............',
        '..............',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '#####....#####',
        '..............',
        '..............',
        '..............',
      ],
      posts: [[88, 88, 223], [112, 88, 223], [136, 88, 223], [88, 112, 223], [136, 112, 223], [88, 136, 223], [112, 136, 223], [136, 136, 223]],
    },
    {
      models: [{ id: 'main_base_l10', x: 112, z: 112 }],
      rows: [
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
        '##############',
      ],
      posts: [[56, 6, 112], [168, 6, 112], [6, 100, 112], [218, 100, 112], [6, 148, 112], [218, 148, 112], [80, 217, 112], [144, 217, 112]],
    },
  ],
  [BuildingKind.Farm]: FARM,
  // A stand-in until the outside modeller's red barn comes (Patch 2): the old pen and barn, painted red, in a 12 x 12 yard.
  [BuildingKind.Barn]: [
    {
      models: [{ id: 'pen_barn', x: 96, z: 96, tint: 0xd8584a }],
      rows: [
        '............',
        '............',
        '............',
        '............',
        '............',
        '..########..',
        '..########..',
        '...######...',
        '...######...',
        '...######...',
        '..########..',
        '............',
      ],
    },
  ],
  // A stand-in until the outside modeller's comes (Patch 2): the gunnery yard.
  [BuildingKind.ArtilleryWorkshop]: [
    {
      models: [{ id: 'gunnery_yard', x: 96, z: 96 }],
      rows: [
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '..##.##.##..',
        '############',
        '############',
      ],
    },
  ],
  [BuildingKind.Storehouse]: [
    {
      models: [{ id: 'storehouse', x: 64, z: 64 }],
      rows: [
        '........',
        '#.####.#',
        '########',
        '########',
        '########',
        '########',
        '########',
        '#......#',
      ],
    },
  ],
  [BuildingKind.TorchPost]: [
    {
      models: [{ id: 'torch_post', x: 8, z: 8 }],
      rows: [
        '#',
      ],
    },
  ],
  [BuildingKind.Bonfire]: [
    {
      models: [{ id: 'cooking_campfire', x: 24, z: 24, scale: 2 }],
      // Patch 2: until the bonfire's own model comes, the campfire's at twice its size stands in. No one walks through the fire.
      fitted: 'the fire (the campfire model stands in)',
      rows: [
        '###',
        '###',
        '###',
      ],
    },
  ],
  [BuildingKind.FishingDock]: [block(6, 4)],
  [BuildingKind.Wall]: [block(1, 1)],
  [BuildingKind.WallHardwood]: [block(1, 1)],
  [BuildingKind.WallStone]: [block(1, 1)],
  [BuildingKind.Gate]: [block(3, 1)],
  [BuildingKind.GateHardwood]: [block(3, 1)],
  [BuildingKind.GateStone]: [block(3, 1)],
  [BuildingKind.Tower]: TOWER,
  [BuildingKind.TowerHardwood]: TOWER,
  [BuildingKind.TowerStone]: TOWER,
  [BuildingKind.Workshop]: [block(8, 8)],
  [BuildingKind.ScholarsLodge]: [block(8, 8)],
  [BuildingKind.MagiSanctum]: [block(8, 8)],
  [BuildingKind.Barracks]: [block(10, 10)],
  [BuildingKind.Mineshaft]: [block(6, 6)],
  [BuildingKind.Forge]: [block(8, 8)],
};

/** A kind's footprint at a level. */
export function levelFootprint(kind: number, level: number): LevelFootprint {
  const list = FOOTPRINTS[kind];
  if (!list || list.length === 0) throw new Error(`building kind ${kind} has no footprint`);
  return list[Math.min(Math.max(level, 1), list.length) - 1]!;
}

/** A footprint as the sim uses it, turned for its variant. */
export interface Dims {
  /** Columns from the anchor to this level's corner. */
  ox: number;
  oz: number;
  w: number;
  d: number;
  /** The rectangle round the solid columns, from this level's corner: [x, z, w, d] (0 x 0 when none is solid). */
  solid: readonly [number, number, number, number];
  /** The solid columns, from this level's corner, row by row. */
  cells: ReadonlyArray<readonly [number, number]>;
  /** Where men stand on its top (Post), from this level's corner. */
  posts: readonly Post[];
}

/** Not state: dims by kind, variant and level, worked out once. */
const dimsCache = new Map<number, Dims>();

/** A building's footprint for a variant and level: a turned gate swaps its width and depth. */
export function footprintDims(kind: number, variant: number, level = 1): Dims {
  const turn = buildingSpec(kind).turns === true && variant === 1;
  const key = (kind * 2 + (turn ? 1 : 0)) * 64 + level;
  let dims = dimsCache.get(key);
  if (dims) return dims;
  const f = levelFootprint(kind, level);
  const cells: Array<readonly [number, number]> = [];
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -1;
  let z1 = -1;
  const d = f.rows.length;
  const w = f.rows[0]!.length;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (f.rows[z]![x] !== '#') continue;
      const c: readonly [number, number] = turn ? [z, x] : [x, z];
      cells.push(c);
      x0 = Math.min(x0, c[0]);
      z0 = Math.min(z0, c[1]);
      x1 = Math.max(x1, c[0]);
      z1 = Math.max(z1, c[1]);
    }
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const solid: readonly [number, number, number, number] = cells.length === 0 ? [0, 0, 0, 0] : [x0, z0, x1 - x0 + 1, z1 - z0 + 1];
  const posts = (f.posts ?? []).map((p): Post => (turn ? [p[1], p[0], p[2]] : p));
  dims = turn
    ? { ox: f.oz ?? 0, oz: f.ox ?? 0, w: d, d: w, solid, cells, posts }
    : { ox: f.ox ?? 0, oz: f.oz ?? 0, w, d, solid, cells, posts };
  dimsCache.set(key, dims);
  return dims;
}
