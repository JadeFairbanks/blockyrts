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
 * The model and scale for a plant at a growth stage, or null for props this
 * table does not cover (rocks and the rest wait for the wiring pass too).
 * Trees: the seed, then the species' sapling, then the grown tree at each
 * stage's size. Hazel: the bush's `regrown` shoots, small as a sapling and
 * full-size as a young bush, then the whole bush (its `cut` stub is what
 * Jade asked not to see). Herbs and flax: the `picked` look while sprouting.
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
    default:
      return null;
  }
}
