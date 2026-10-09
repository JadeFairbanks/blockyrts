// Which catalogue model draws a plant at each growth stage: the hook for the
// wiring pass that puts the catalogue's tree, sapling, seed and hazel models
// over the procedural ones (build-order.md, open items). Nothing draws these
// yet; props-gen.ts draws every stage procedurally until then.
//
// A model's state sets (groups Blockbench hides by default, such as
// bush_hazel's `regrown` or a crop's `sprout`) are drawn ids of their own,
// `<id>@<set>`, written by the model converter (packages/tools/src/models).
import { PropKind, Stage, stageInfo } from '@blockyrts/sim';

export interface PropModel {
  /** A model id in public/models/index.json, `<id>@<set>` for a state set. */
  id: string;
  /** Drawn at this share of the model's own size. */
  scale: number;
}

/** Each tree kind's species part of the catalogue ids (tree_<species>, sapling_<species>). */
const TREE_SPECIES: Readonly<Record<number, { species: string; seed: 'seed_softwood' | 'seed_hardwood' }>> = {
  [PropKind.Pine]: { species: 'pine', seed: 'seed_softwood' },
  [PropKind.Spruce]: { species: 'spruce', seed: 'seed_softwood' },
  [PropKind.SmallSoftwood]: { species: 'softwood_small', seed: 'seed_softwood' },
  [PropKind.Birch]: { species: 'birch', seed: 'seed_hardwood' },
  [PropKind.Hornbeam]: { species: 'hornbeam', seed: 'seed_hardwood' },
  [PropKind.Oak]: { species: 'oak_great', seed: 'seed_hardwood' },
  [PropKind.Beech]: { species: 'beech_great', seed: 'seed_hardwood' },
};

/**
 * Models Jade's Patch 5 asks for that the catalogue does not have yet (WL-4,
 * WL-5, WL-7, WL-10, WL-11, GP-30, GP-31): they come from the Blockbench
 * session on her PC, and props-gen.ts draws these props until they do. An
 * id leaves this list when its model lands.
 */
export const PENDING_PROP_MODELS: ReadonlySet<string> = new Set([
  'bush_blackberry',
  'bush_raspberry',
  'bush_blueberry',
  'mushroom_edible',
  'flax_wild_2',
  'flax_wild_3',
  'flax_tall',
  'coal_rock',
  'ore_node_silver',
  'ore_node_gold',
  'boulder_large',
  'hot_spring',
]);

/**
 * Props drawn as their catalogue model in place of props-gen.ts's cubes
 * (world/prop-models-view.ts), by kind: Jade's Patch 5 (MB-11, MF-2), a bog's
 * silver nuggets and a Fae Guardian's large mana crystal node. The cubes
 * stand in only until the model has loaded.
 */
export const CATALOGUE_PROPS: Readonly<Record<number, string>> = {
  [PropKind.SilverNugget]: 'silver_nugget',
  [PropKind.LargeManaCrystal]: 'mana_crystal_large',
};

/** A berry bush's model: picked, its `picked` set (the bush with no berries). */
const BERRY_BUSH: Readonly<Record<number, string>> = {
  [PropKind.BlackBerryBush]: 'bush_blackberry',
  [PropKind.RaspberryBush]: 'bush_raspberry',
  [PropKind.BlueberryBush]: 'bush_blueberry',
};

/**
 * The model and scale for a plant at a growth stage, or null for props this
 * table does not cover (rocks and the rest wait for the wiring pass too).
 * Trees: the seed, then the species' sapling, then the grown tree at each
 * stage's size. Hazel: the bush's `regrown` shoots, small as a sapling and
 * full-size as a young bush, then the whole bush (its `cut` stub is what
 * Jade asked not to see). Herbs and flax: the `picked` look while sprouting.
 * Berry bushes: their `picked` look until the berries grow back.
 */
export function propModel(kind: number, stage: number): PropModel | null {
  const row = stageInfo(kind, stage);
  const size = (row?.sizePm ?? 1000) / 1000;
  const tree = TREE_SPECIES[kind];
  if (tree) {
    if (stage === Stage.Seed) return { id: tree.seed, scale: 1 };
    if (stage === Stage.Sapling) return { id: `sapling_${tree.species}`, scale: 1 };
    return { id: `tree_${tree.species}`, scale: size };
  }
  switch (kind) {
    case PropKind.DeadTree:
      return { id: 'tree_dead', scale: 1 };
    case PropKind.Thornwood:
      return { id: 'tree_twisted', scale: 1 };
    case PropKind.Hazel:
      if (stage === Stage.Sapling) return { id: 'bush_hazel@regrown', scale: 0.45 };
      if (stage === Stage.Young) return { id: 'bush_hazel@regrown', scale: 1 };
      return { id: 'bush_hazel', scale: size };
    case PropKind.Herbs:
      return stage === Stage.Sapling ? { id: 'herb_patch@picked', scale: 1 } : { id: 'herb_patch', scale: size };
    case PropKind.WildFlax:
      return stage === Stage.Sapling ? { id: 'flax_wild@picked', scale: 1 } : { id: 'flax_wild', scale: size };
    case PropKind.FlaxTall:
      return stage === Stage.Sapling ? { id: 'flax_tall@picked', scale: 1 } : { id: 'flax_tall', scale: size };
    case PropKind.BlackBerryBush:
    case PropKind.RaspberryBush:
    case PropKind.BlueberryBush: {
      const id = BERRY_BUSH[kind]!;
      return stage === Stage.Young ? { id: `${id}@picked`, scale: 1 } : { id, scale: 1 };
    }
    default:
      return null;
  }
}
