// What the land is made of (Terrain: soil, sand, clay, stone, marble,
// ore-bearing rock and so on; Patch 5 took gravel out). A material is one
// byte in a column layer.

export const Mat = {
  Air: 0,
  /** Soil with grass on top: the top terrain unit of grassy ground. */
  Grass: 1,
  /** Thin, dry grass of the Deepwoods edge and the Barrens (grassland thinning). */
  DryGrass: 2,
  Soil: 3,
  /** Bog and marsh ground. */
  Mud: 4,
  Sand: 5,
  Clay: 6,
  Stone: 7,
  Marble: 8,
  CopperOre: 9,
  TinOre: 10,
  IronRock: 11,
  VeinIron: 12,
  Coal: 13,
  /** Volcanic ash ground of the Deadlands. */
  Ash: 14,
  /** Dark volcanic rock. */
  Basalt: 15,
  /** Dead, grey earth of the Barrens and Deadlands. */
  DeadEarth: 16,
} as const;
export type Mat = (typeof Mat)[keyof typeof Mat];

/** How a material digs (Table 10 columns): soil, the loose clay and sand column, or rock. */
export const DigClass = { None: 0, Soil: 1, Loose: 2, Rock: 3 } as const;
export type DigClass = (typeof DigClass)[keyof typeof DigClass];

export interface MaterialInfo {
  name: string;
  dig: DigClass;
  /** The resource carving it gives (Digging: Earth from soil, stone from rock and so on). */
  yields: string;
  /** Drawing colour, 0xRRGGBB. */
  colour: number;
}

export const MATERIALS: readonly MaterialInfo[] = [
  { name: 'air', dig: DigClass.None, yields: '', colour: 0x000000 },
  { name: 'grass', dig: DigClass.Soil, yields: 'earth', colour: 0x5f8f3a },
  { name: 'dry grass', dig: DigClass.Soil, yields: 'earth', colour: 0x9a9150 },
  { name: 'soil', dig: DigClass.Soil, yields: 'earth', colour: 0x7a5a3a },
  { name: 'mud', dig: DigClass.Soil, yields: 'earth', colour: 0x4f4632 },
  { name: 'sand', dig: DigClass.Loose, yields: 'sand', colour: 0xd8c690 },
  { name: 'clay', dig: DigClass.Loose, yields: 'clay', colour: 0xa86f4c },
  { name: 'stone', dig: DigClass.Rock, yields: 'stone', colour: 0x8a8c8e },
  { name: 'marble', dig: DigClass.Rock, yields: 'marble', colour: 0xe4e1da },
  { name: 'copper ore', dig: DigClass.Rock, yields: 'copper ore', colour: 0x8f7a62 },
  { name: 'tin ore', dig: DigClass.Rock, yields: 'tin ore', colour: 0x9a9aa4 },
  { name: 'iron rock', dig: DigClass.Rock, yields: 'iron rock', colour: 0x8a6a5a },
  { name: 'vein iron', dig: DigClass.Rock, yields: 'vein iron ore', colour: 0x7a4e40 },
  { name: 'coal', dig: DigClass.Rock, yields: 'coal', colour: 0x2f2f33 },
  { name: 'ash', dig: DigClass.Soil, yields: 'earth', colour: 0x55504c },
  { name: 'basalt', dig: DigClass.Rock, yields: 'stone', colour: 0x3c3a3a },
  { name: 'dead earth', dig: DigClass.Soil, yields: 'earth', colour: 0x6d6457 },
];

export const MATERIAL_COUNT = MATERIALS.length;
