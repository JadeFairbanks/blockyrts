// Which catalogue model draws each world prop: trees, saplings and seeds at
// each growth stage, bushes, herbs and flax, rocks and ore, carcasses, fish,
// and the stone circles' pieces (Patch 5: every prop shows its own model).
// The mesh workers leave out a prop's procedural cubes once its model has
// loaded (props-gen.ts draws it until then, and draws the props with no
// model yet), and prop-models-view.ts draws the models.
//
// A model's state sets (groups Blockbench hides by default, such as
// bush_hazel's `regrown` or a crop's `sprout`) are drawn ids of their own,
// `<id>@<set>`, and its texture looks `<id>~<look>`, written by the model
// converter (packages/tools/src/models).
import {
  CircleType,
  propInfo,
  PropKind,
  PROPS,
  Species,
  Stage,
  stageInfo,
  trilithonRow,
  variantHeading,
  variantLook,
  variantType,
} from '@blockyrts/sim';

export interface PropModel {
  /** A model id in public/models/index.json, `<id>@<set>` for a state set. */
  id: string;
  /** Drawn at this share of the model's own size. */
  scale: number;
  /** Its turn, radians (three.js rotation.y, 0 facing -Z). */
  yaw: number;
  /** A looping clip it plays (fish swimming), or none for the model at rest. */
  clip?: string;
  /** More than one of it on the spot (a fish stretch's fish): offsets in metres and an extra turn, each. */
  copies?: ReadonlyArray<readonly [number, number, number]>;
}

/** Each tree kind's species part of the catalogue ids (tree_<species>, sapling_<species>). */
const TREE_SPECIES: Readonly<Record<number, { species: string; seed: 'seed_softwood' | 'seed_hardwood'; tree?: string }>> = {
  [PropKind.Pine]: { species: 'pine', seed: 'seed_softwood' },
  [PropKind.Spruce]: { species: 'spruce', seed: 'seed_softwood' },
  [PropKind.SmallSoftwood]: { species: 'softwood_small', seed: 'seed_softwood' },
  [PropKind.Birch]: { species: 'birch', seed: 'seed_hardwood' },
  [PropKind.Hornbeam]: { species: 'hornbeam', seed: 'seed_hardwood' },
  [PropKind.Oak]: { species: 'oak_great', seed: 'seed_hardwood' },
  [PropKind.Beech]: { species: 'beech_great', seed: 'seed_hardwood' },
  // The softwood that grows round a Boneyard Circle (SCB-1), Jade's own pine.
  [PropKind.CirclePine]: { species: 'pine', seed: 'seed_softwood', tree: 'softwood_pine' },
};

/**
 * Models a prop is drawn with that the catalogue does not have yet: they
 * come from the Blockbench session on Jade's PC, and props-gen.ts draws
 * these props until they do. An id leaves this list when its model lands;
 * none is waiting now (Patch 5's world props came in asset PR #162).
 */
export const PENDING_PROP_MODELS: ReadonlySet<string> = new Set<string>([]);

/** Rocks and patches whose model has a `depleted` set: drawn with it once half or more of what they can hold is gone (s). */
const DEPLETED: ReadonlySet<string> = new Set([
  'stone_scatter', 'flint_scatter', 'rock_stone', 'rock_copper', 'rock_tin', 'rock_coal', 'bog_iron_patch', 'rock_iron', 'clay_bank',
  'rock_marble', 'rock_saltpetre', 'rock_lead', 'rock_sulphur', 'gold_glint', 'gem_glint', 'mana_crystal_node', 'boulder_large',
]);

/** Wild flax's three looks (WL-10: "three flax models"), one per clump by its variant. */
const WILD_FLAX = ['flax_wild', 'flax_wild_2', 'flax_wild_3'] as const;

/** A berry bush's model: picked, its `picked` set (the bush with no berries). */
const BERRY_BUSH: Readonly<Record<number, string>> = {
  [PropKind.BlackBerryBush]: 'bush_blackberry',
  [PropKind.RaspberryBush]: 'bush_raspberry',
  [PropKind.BlueberryBush]: 'bush_blueberry',
  [PropKind.BogPearBush]: 'bush_bog_pear',
};

/** Rocks, ore and the rest of the ground's things that do not grow, one model each. */
const STILL: Readonly<Record<number, string>> = {
  [PropKind.LooseStone]: 'stone_scatter',
  [PropKind.FlintScatter]: 'flint_scatter',
  [PropKind.StoneOutcrop]: 'rock_stone',
  [PropKind.CopperOutcrop]: 'rock_copper',
  [PropKind.TinOutcrop]: 'rock_tin',
  [PropKind.CoalRock]: 'rock_coal',
  [PropKind.BogIron]: 'bog_iron_patch',
  [PropKind.IronRock]: 'rock_iron',
  [PropKind.ClayBank]: 'clay_bank',
  [PropKind.MarbleRock]: 'rock_marble',
  [PropKind.Saltpetre]: 'rock_saltpetre',
  [PropKind.LeadOre]: 'rock_lead',
  [PropKind.Sulphur]: 'rock_sulphur',
  [PropKind.SurfaceGold]: 'gold_glint',
  [PropKind.SurfaceGem]: 'gem_glint',
  [PropKind.ManaCrystal]: 'mana_crystal_node',
  [PropKind.Mushroom]: 'mushroom_edible',
  [PropKind.Boulder]: 'boulder_large',
  [PropKind.SilverNode]: 'ore_node_silver',
  [PropKind.GoldNode]: 'ore_node_gold',
  [PropKind.HotSpringSulphur]: 'hot_spring',
  // The stone circles' dressing (SC-2, SCB-1).
  [PropKind.BluestoneChest]: 'bluestone_chest',
  [PropKind.RuinBush]: 'ruin_bush',
  [PropKind.RuinFern]: 'ruin_fern',
  [PropKind.BoneyardDeadTree]: 'boneyard_dead_tree',
  [PropKind.BoneyardThorn]: 'boneyard_thorn_bush',
};

/** A carcass's model by the species that fell (its variant). */
function carcassModel(species: number): string {
  switch (species) {
    case Species.Bear:
      return 'carcass_bear';
    case Species.Deer:
      return 'carcass_deer';
    case Species.Hare:
    case Species.Chicken:
      return 'carcass_hare';
    case Species.Wolf:
    case Species.Lynx:
      return 'carcass_wolf';
    default:
      return 'carcass';
  }
}

const FISH: Readonly<Record<number, string>> = {
  [PropKind.FishTrout]: 'fish_trout',
  [PropKind.FishSalmon]: 'fish_salmon',
  [PropKind.FishCatfish]: 'fish_giant_catfish',
};

/** A circle type's texture look on its trilithons and altar (Jade's stone_circle models). */
function circleLook(type: number): string {
  if (type === CircleType.Lunar) return '~lunar';
  if (type === CircleType.Boneyard) return '~boneyard';
  return '';
}

const FLOWERS = ['flower_bluebell', 'flower_moon_daisy', 'flower_moonflower'] as const;

/** Whether a prop kind is one of the stone circles' pieces, whose variant holds its heading, look, circle type and circle (circles/place.ts). */
export function isCirclePiece(kind: number): boolean {
  return kind >= PropKind.Trilithon && kind <= PropKind.CirclePine;
}

/** A quarter turn from a prop's variant, so the same rock or tree does not always face the same way. */
const quarterTurn = (variant: number): number => (((variant >>> 9) & 3) * Math.PI) / 2;
const TURN = (2 * Math.PI) / 65536;

/**
 * The model, scale and turn for a prop at a growth stage, or null for props
 * with no model (sand and the like, drawn as cubes).
 * Trees: the seed, then the species' sapling, then the grown tree at each
 * stage's size. Hazel: the bush's `regrown` shoots, small as a sapling and
 * full-size as a young bush, then the whole bush (its `cut` stub is what
 * Jade asked not to see). Herbs and flax: the `picked` look while sprouting.
 * Berry bushes: their `picked` look until the berries grow back. The stone
 * circles' pieces face the way they were laid out: a trilithon takes its
 * state and its circle's look, a Moon Rose bush blooms while it holds roses
 * and a Sweet Hawthorne shows its fruit while it has some.
 */
export function propModel(kind: number, stage: number, variant = 0, amount = 1): PropModel | null {
  const row = stageInfo(kind, stage);
  const size = (row?.sizePm ?? 1000) / 1000;
  const yaw = isCirclePiece(kind) ? variantHeading(variant) * TURN : quarterTurn(variant);
  const at = (id: string, scale = 1): PropModel => ({ id, scale, yaw });
  const tree = TREE_SPECIES[kind];
  if (tree) {
    if (stage === Stage.Seed) return at(tree.seed);
    if (stage === Stage.Sapling) return at(`sapling_${tree.species}`);
    return at(tree.tree ?? `tree_${tree.species}`, size);
  }
  const still = STILL[kind];
  if (still) {
    const most = propInfo(kind).yieldMax;
    return at(DEPLETED.has(still) && most > 0 && amount * 2 <= most ? `${still}@depleted` : still);
  }
  switch (kind) {
    case PropKind.DeadTree:
      return at('tree_dead');
    case PropKind.Thornwood:
      if (stage === Stage.Seed) return at('seed_hardwood');
      if (stage === Stage.Sapling) return at('sapling_twisted');
      return at('tree_twisted', size);
    case PropKind.Hazel:
      if (stage === Stage.Sapling) return at('bush_hazel@regrown', 0.45);
      if (stage === Stage.Young) return at('bush_hazel@regrown');
      return at('bush_hazel', size);
    case PropKind.Herbs:
      return stage === Stage.Sapling ? at('herb_patch@picked') : at('herb_patch', size);
    case PropKind.WildFlax: {
      const id = WILD_FLAX[(variant >>> 0) % WILD_FLAX.length]!;
      return stage === Stage.Sapling ? at(`${id}@picked`) : at(id, size);
    }
    case PropKind.FlaxTall:
      return stage === Stage.Sapling ? at('flax_tall@picked') : at('flax_tall', size);
    case PropKind.BlackBerryBush:
    case PropKind.RaspberryBush:
    case PropKind.BlueberryBush:
    case PropKind.BogPearBush: {
      const id = BERRY_BUSH[kind]!;
      return stage === Stage.Young ? at(`${id}@picked`) : at(id);
    }
    case PropKind.Carcass:
      return { id: carcassModel(variant), scale: 1, yaw: quarterTurn(variant * 0x9e3779b1) };
    case PropKind.FishTrout:
    case PropKind.FishSalmon:
    case PropKind.FishCatfish: {
      // A few fish nosing about the stretch, swimming.
      const turn = quarterTurn(variant);
      return { id: FISH[kind]!, scale: 1, yaw: turn, clip: 'swim', copies: [[-0.4, -0.2, 0], [0.35, 0.1, 2.4], [0, 0.45, 4.1]] };
    }
    // The stone circles (SC-2 to SC-9, SCA-1, SCA-8, SCB-1).
    case PropKind.Trilithon:
      return at(`${trilithonRow(variantLook(variant)).model}${circleLook(variantType(variant))}`);
    case PropKind.BluestoneRubble:
      return at(variantLook(variant) ? 'bluestone_rubble_large' : 'bluestone_rubble_small');
    case PropKind.CircleAltar: {
      const type = variantType(variant);
      // The Silenus Circle's altar is the plain one (SCS-1: no idol on it).
      return at(type === CircleType.Boneyard ? 'altar_boneyard~boneyard' : `altar_lunar${circleLook(type)}`);
    }
    case PropKind.SweetHawthorne:
      return at(amount > 0 && stage !== Stage.Young ? 'sweet_hawthorne_tree_fruit' : 'sweet_hawthorne_tree');
    case PropKind.HawthorneSapling:
      // An Ancient Seed in the ground, its sapling, then the young tree growing to its full height (SC-8).
      if (stage === Stage.Seed) return at('ancient_seed', 8);
      if (stage === Stage.Sapling) return at('sweet_hawthorne_sapling');
      return at('sweet_hawthorne_tree', size);
    case PropKind.MoonRoseBush:
      return at(amount > 0 ? 'moon_rose_bush_bloomed' : 'moon_rose_bush_closed');
    case PropKind.BonePile:
      return at(variantLook(variant) ? 'bone_pile_large' : 'bone_pile_small');
    case PropKind.RuinMoss:
      return at(variantLook(variant) ? 'moss_clump_b' : 'moss_clump_a');
    case PropKind.RuinFlower:
      return at(FLOWERS[variantLook(variant) % FLOWERS.length]!);
    default:
      return null;
  }
}

/** Every catalogue id propModel can name (the pending ones too): what the view asks the library to load. */
export const PROP_MODEL_IDS: readonly string[] = (() => {
  const ids = new Set<string>();
  for (let kind = 0; kind < PROPS.length; kind++) {
    for (let stage = Stage.Seed; stage <= Stage.Grown; stage++) {
      for (let look = 0; look < 6; look++) {
        for (const type of [CircleType.Generic, CircleType.Lunar, CircleType.Silenus, CircleType.Boneyard]) {
          const variant = (look << 16) | (type << 20);
          for (const amount of [0, 1]) {
            const m = propModel(kind, stage, variant, amount);
            if (m) ids.add(m.id);
          }
        }
      }
    }
    if (kind === PropKind.Carcass) for (let s = 0; s < 32; s++) ids.add(carcassModel(s));
  }
  return [...ids].filter((id) => !PENDING_PROP_MODELS.has(id.split(/[@~]/)[0]!));
})();
