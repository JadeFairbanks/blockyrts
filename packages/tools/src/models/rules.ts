// The asset rules from packages/assets/README.md ("Rules the converter will
// check"), and how a MANIFEST.md deviation waives one.
//
// Facing -Z cannot be proven from the file, so it is not checked. Clip names
// depend on whether the model is a fighter, which the file does not say, so
// they are not checked either.

export type RuleId =
  | 'format'
  | 'layout'
  | 'bone-name'
  | 'skeleton'
  | 'slot'
  | 'cube-budget'
  | 'texture-size'
  | 'placement'
  | 'animation';

/**
 * A deviation text in a model's MANIFEST.md row waives a rule when it contains
 * the rule id or one of these words (case-insensitive). For example "cube
 * budget: 52 cubes for the wings" waives cube-budget, and "texture 512 x 256
 * for the banner" waives texture-size.
 */
export const RULE_KEYWORDS: Record<RuleId, string[]> = {
  format: ['format', 'mesh element', 'not embedded'],
  layout: ['layout', 'folder', 'category'],
  'bone-name': ['bone name', 'naming', 'uppercase', 'capital'],
  skeleton: ['skeleton', 'baseline'],
  slot: ['slot'],
  'cube-budget': ['cube budget', 'cubes', 'cube count', 'budget'],
  'texture-size': ['texture'],
  placement: ['placement', 'centred', 'centered', 'off-centre', 'off-center', 'standing', 'stands', 'pivot at'],
  animation: ['animation', 'molang', 'clip'],
};

export interface Violation {
  rule: RuleId;
  message: string;
  /** True when the model's manifest row names this deviation. */
  waived: boolean;
}

export function isWaived(rule: RuleId, deviations: readonly string[]): boolean {
  const words = [rule, ...RULE_KEYWORDS[rule]];
  return deviations.some((d) => {
    const text = d.toLowerCase();
    return words.some((w) => text.includes(w));
  });
}

export const CATEGORIES = [
  'peoples',
  'animals',
  'monsters',
  'items',
  'mechanical',
  'buildings',
  'world-props',
  'projectiles-and-spells',
] as const;

/** Cube budget per category: [min, max] inclusive, from the wishlist. */
export const CUBE_BUDGET: Record<string, [number, number]> = {
  items: [1, 11], // small items: under 12 cubes
  'projectiles-and-spells': [1, Infinity], // the wishlist sets no budget
  peoples: [15, 40],
  animals: [15, 40],
  monsters: [1, 60], // big monsters up to 60
  buildings: [1, Infinity], // as needed
  mechanical: [1, Infinity],
  'world-props': [1, Infinity],
};

/** Categories whose models with a hips bone must have the full humanoid skeleton. */
export const CREATURE_CATEGORIES: readonly string[] = ['peoples', 'animals', 'monsters'];

/**
 * Categories that stand on the ground, and how many units below y = 0 they may
 * reach (foundations may sink up to one terrain unit). Items and projectiles
 * are not placed this way: held items have their grip at the origin.
 */
export const SINK_ALLOWANCE: Record<string, number> = {
  peoples: 0,
  animals: 0,
  monsters: 0,
  buildings: 4,
  mechanical: 4,
  'world-props': 4,
};

/** Equipment parts (groups hanging under a slot_*) are small items. */
export const PART_CUBE_BUDGET: [number, number] = [1, 11];

export const BONE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const SLOT_NAME = /^slot_[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** The humanoid baseline skeleton: bone name and its required parent. */
export const HUMANOID_PARENTS: Record<string, string | null> = {
  root: null,
  hips: 'root',
  torso: 'hips',
  head: 'torso',
  arm_upper_r: 'torso',
  arm_lower_r: 'arm_upper_r',
  hand_r: 'arm_lower_r',
  arm_upper_l: 'torso',
  arm_lower_l: 'arm_upper_l',
  hand_l: 'arm_lower_l',
  leg_upper_r: 'hips',
  leg_lower_r: 'leg_upper_r',
  foot_r: 'leg_lower_r',
  leg_upper_l: 'hips',
  leg_lower_l: 'leg_upper_l',
  foot_l: 'leg_lower_l',
};

/**
 * Model textures (the PNGs embedded in a .bbmodel) are powers of two from 16
 * to 1024 on a side (coordinator's correction of the README's 32 to 256). The
 * non-model folders under packages/assets/src (textures, effects, ui, sky) are
 * not read by this converter, so the rule never applies to them.
 */
export const TEXTURE_MIN = 16;
export const TEXTURE_MAX = 1024;

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/** Facts about a model that the rules look at (units are Blockbench units). */
export interface ModelFacts {
  id: string;
  category: string;
  layoutProblems: string[];
  formatProblems: string[];
  animationProblems: string[];
  bones: { name: string; parent: string | null; isSlot: boolean; directCubes: number; synthetic: boolean }[];
  bodyCubes: number;
  parts: { name: string; cubes: number }[];
  textures: { name: string; width: number; height: number }[];
  /** Rest-pose bounds of the body (equipment parts excluded), in model units. */
  bodyMin: [number, number, number];
  bodyMax: [number, number, number];
  /** x / z bounds of the body's bottom quarter, in model units. */
  footprint: { min: [number, number]; max: [number, number] };
  /** Category whose cube budget and placement rules apply (pieces of an equipment set count as items). */
  budgetCategory: string;
}

export function checkRules(f: ModelFacts, deviations: readonly string[]): Violation[] {
  const out: Violation[] = [];
  const add = (rule: RuleId, message: string): void => {
    out.push({ rule, message, waived: isWaived(rule, deviations) });
  };

  for (const p of f.formatProblems) add('format', p);
  for (const p of f.layoutProblems) add('layout', p);
  for (const p of f.animationProblems) add('animation', p);

  const seen = new Set<string>();
  for (const b of f.bones) {
    if (b.synthetic) continue;
    if (!BONE_NAME.test(b.name)) {
      add('bone-name', `bone "${b.name}" must be lowercase letters and digits joined by single underscores`);
    }
    if (seen.has(b.name)) add('bone-name', `bone name "${b.name}" is used more than once`);
    seen.add(b.name);
    if (b.isSlot) {
      if (!SLOT_NAME.test(b.name)) add('slot', `attachment point "${b.name}" must be named slot_<name> in lowercase`);
      if (b.directCubes > 0) add('slot', `attachment point "${b.name}" must be an empty group but holds ${b.directCubes} cube(s)`);
    }
  }

  const byName = new Map(f.bones.map((b) => [b.name, b]));
  // Armour and other worn items carry partial skeletons; only creatures must be complete.
  if (byName.has('hips') && CREATURE_CATEGORIES.includes(f.category)) {
    for (const [name, parent] of Object.entries(HUMANOID_PARENTS)) {
      const b = byName.get(name);
      if (!b) add('skeleton', `humanoid (it has a hips bone) is missing the baseline bone "${name}"`);
      else if (b.parent !== parent) {
        add('skeleton', `baseline bone "${name}" must be a child of ${parent ? `"${parent}"` : 'nothing (top level)'}, not of ${b.parent ? `"${b.parent}"` : 'nothing'}`);
      }
    }
  }

  const budget = CUBE_BUDGET[f.budgetCategory];
  if (budget) {
    const [min, max] = budget;
    if (f.bodyCubes < min || f.bodyCubes > max) {
      const range = max === Infinity ? `at least ${min}` : `${min} to ${max}`;
      add('cube-budget', `${f.bodyCubes} cubes (equipment parts excluded); ${f.budgetCategory} allow ${range}`);
    }
  }
  for (const p of f.parts) {
    const [min, max] = PART_CUBE_BUDGET;
    if (p.cubes < min || p.cubes > max) add('cube-budget', `equipment part "${p.name}" has ${p.cubes} cubes; small items allow ${min} to ${max}`);
  }

  for (const t of f.textures) {
    const ok = (n: number): boolean => isPowerOfTwo(n) && n >= TEXTURE_MIN && n <= TEXTURE_MAX;
    if (!ok(t.width) || !ok(t.height)) {
      add('texture-size', `texture "${t.name}" is ${t.width} x ${t.height}; each side must be a power of two from ${TEXTURE_MIN} to ${TEXTURE_MAX}`);
    }
  }

  const sink = SINK_ALLOWANCE[f.budgetCategory];
  if (f.bodyCubes > 0 && sink !== undefined) {
    const minY = f.bodyMin[1];
    if (minY > 0.5 || minY < -0.5 - sink) {
      add('placement', `the model's lowest point is at y = ${minY} units; it must stand on y = 0${sink > 0 ? ` (sinking up to ${sink} units is allowed)` : ''}`);
    }
    const [minX, minZ] = f.footprint.min;
    const [maxX, maxZ] = f.footprint.max;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const tolX = Math.max(2, 0.15 * (f.bodyMax[0] - f.bodyMin[0]));
    const tolZ = Math.max(2, 0.15 * (f.bodyMax[2] - f.bodyMin[2]));
    if (Math.abs(cx) > tolX || Math.abs(cz) > tolZ) {
      add('placement', `the model's footprint (its bottom quarter) is centred on x = ${cx.toFixed(2)}, z = ${cz.toFixed(2)} units; it must be centred on x = 0, z = 0`);
    }
  }
  return out;
}
