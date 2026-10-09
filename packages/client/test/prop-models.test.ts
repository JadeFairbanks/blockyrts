// The world props' model hook names only models, state sets and texture
// looks the catalogue has (or ones Patch 5 waits on), so the view can draw
// them as they are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CircleType, growthStages, isFish, PropKind, PROPS, Stage } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { PENDING_PROP_MODELS, PROP_MODEL_IDS, propModel } from '../src/world/prop-models.ts';

const MODELS = fileURLToPath(new URL('../../assets/src/models/', import.meta.url));

/** Every .bbmodel in the catalogue by id. */
function catalogue(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) catalogue(full, out);
    else if (name.endsWith('.bbmodel')) out.set(name.slice(0, -'.bbmodel'.length), full);
  }
  return out;
}

/** Top-level groups under the model's root that Blockbench hides by default (its state sets). */
function hiddenSets(file: string): string[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { outliner: Array<{ name: string; visibility?: boolean; children: unknown[] } | string> };
  const out: string[] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const n of nodes) {
      if (typeof n === 'string') continue;
      const g = n as { name: string; visibility?: boolean; children: unknown[] };
      if (g.visibility === false && !g.name.startsWith('slot_')) out.push(g.name);
      walk(g.children);
    }
  };
  walk(raw.outliner);
  return out;
}

/** A texture look's name in the model's embedded textures (`<id>_<look>`, texture-looks.ts in the tools). */
function hasLook(file: string, id: string, look: string): boolean {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { textures?: Array<{ name?: string }> };
  return (raw.textures ?? []).some((t) => (t.name ?? '').replace(/\.png$/, '') === `${id}_${look}`);
}

describe('the growth stages\' model hook', () => {
  const models = catalogue(MODELS);

  it('names a catalogue model, or one of its state sets, for every stage of every plant', () => {
    let checked = 0;
    for (const p of PROPS) {
      const stages = growthStages(p.kind);
      if (!stages) continue;
      for (const g of stages) {
        const m = propModel(p.kind, g.stage);
        expect(m, `${p.name} ${g.name}`).not.toBeNull();
        const [id, set] = m!.id.split('@') as [string, string | undefined];
        // A model Patch 5 asks for that has not landed yet: props-gen.ts draws it until then.
        if (PENDING_PROP_MODELS.has(id)) {
          checked++;
          continue;
        }
        expect(models.has(id), m!.id).toBe(true);
        if (set) expect(hiddenSets(models.get(id)!), m!.id).toContain(set);
        expect(m!.scale).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('never draws a hazel picked bare as the cut stub', () => {
    expect(propModel(PropKind.Hazel, Stage.Sapling)!.id).not.toContain('@cut');
  });
});

describe('every world prop drawn with its own model (Patch 5)', () => {
  const models = catalogue(MODELS);
  /** Whether a drawn id is a catalogue model, one of its state sets or one of its texture looks. */
  const drawable = (drawn: string): boolean => {
    const [base, look] = drawn.split('~') as [string, string | undefined];
    const [id, set] = base.split('@') as [string, string | undefined];
    const file = models.get(id);
    if (!file) return false;
    if (set && !hiddenSets(file).includes(set)) return false;
    return !look || hasLook(file, id, look);
  };

  it('names a model the catalogue has, a state set or a texture look of one, for every id the view loads', () => {
    expect(PROP_MODEL_IDS.length).toBeGreaterThan(60);
    for (const id of PROP_MODEL_IDS) expect(drawable(id), id).toBe(true);
  });

  it('has a model for every prop but sand and the fish stretches, whose live fish are fish-view.ts\'s', () => {
    for (const p of PROPS) {
      const m = propModel(p.kind, Stage.Grown, 0, 1);
      if (p.kind === PropKind.Sand || isFish(p.kind)) {
        expect(m).toBeNull();
        continue;
      }
      expect(m, p.name).not.toBeNull();
    }
  });

  it('draws each trilithon in its state and its circle\'s look, and each altar for its circle', () => {
    const variant = (look: number, type: number): number => (look << 16) | (type << 20);
    expect(propModel(PropKind.Trilithon, Stage.Grown, variant(4, CircleType.Generic))!.id).toBe('trilithon_intact');
    expect(propModel(PropKind.Trilithon, Stage.Grown, variant(1, CircleType.Lunar))!.id).toBe('trilithon_destroyed~lunar');
    expect(propModel(PropKind.Trilithon, Stage.Grown, variant(5, CircleType.Boneyard))!.id).toBe('trilithon_worn~boneyard');
    expect(propModel(PropKind.CircleAltar, Stage.Grown, variant(0, CircleType.Lunar))!.id).toBe('altar_lunar~lunar');
    expect(propModel(PropKind.CircleAltar, Stage.Grown, variant(0, CircleType.Boneyard))!.id).toBe('altar_boneyard~boneyard');
    expect(propModel(PropKind.CircleAltar, Stage.Grown, variant(0, CircleType.Silenus))!.id).toBe('altar_lunar');
    // A piece faces the way it was laid out: a quarter turn is 16384.
    expect(propModel(PropKind.Trilithon, Stage.Grown, 16384 | variant(4, 0))!.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('opens the Moon Roses while they hold roses and shows the hawthorn\'s fruit while it has some', () => {
    expect(propModel(PropKind.MoonRoseBush, Stage.Grown, 0, 0)!.id).toBe('moon_rose_bush_closed');
    expect(propModel(PropKind.MoonRoseBush, Stage.Grown, 0, 3)!.id).toBe('moon_rose_bush_bloomed');
    expect(propModel(PropKind.SweetHawthorne, Stage.Grown, 0, 10)!.id).toBe('sweet_hawthorne_tree_fruit');
    expect(propModel(PropKind.SweetHawthorne, Stage.Young, 0, 0)!.id).toBe('sweet_hawthorne_tree');
    expect(propModel(PropKind.HawthorneSapling, Stage.Sapling, 0, 0)!.id).toBe('sweet_hawthorne_sapling');
  });

  it('wears a rock down to its depleted look, varies wild flax and picks the bog pear bare (asset PR #162)', () => {
    expect(propModel(PropKind.Boulder, Stage.Grown, 0, 400)!.id).toBe('boulder_large');
    expect(propModel(PropKind.Boulder, Stage.Grown, 0, 150)!.id).toBe('boulder_large@depleted');
    expect(propModel(PropKind.CoalRock, Stage.Grown, 0, 30)!.id).toBe('rock_coal');
    expect(new Set([0, 1, 2].map((v) => propModel(PropKind.WildFlax, Stage.Grown, v)!.id))).toEqual(new Set(['flax_wild', 'flax_wild_2', 'flax_wild_3']));
    expect(propModel(PropKind.BogPearBush, Stage.Grown, 0, 1)!.id).toBe('bush_bog_pear');
    expect(propModel(PropKind.BogPearBush, Stage.Young, 0, 0)!.id).toBe('bush_bog_pear@picked');
  });
});
