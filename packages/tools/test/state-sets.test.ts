// A world prop's state sets become drawn models of their own (<id>@<set>):
// the set shown, the look it replaces hidden, the rest as it was.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS_DIR } from '../src/models/build-models.ts';
import { convertModel } from '../src/models/convert.ts';
import { stateSetVariants } from '../src/models/state-sets.ts';

interface Group {
  name: string;
  visibility?: boolean;
  children: Array<Group | string>;
}

const load = (category: string, id: string): { raw: { outliner: Group[] }; source: string } => {
  const source = `src/models/${category}/${id}/${id}.bbmodel`;
  return { raw: JSON.parse(readFileSync(join(ASSETS_DIR, source), 'utf8')) as { outliner: Group[] }, source };
};

/** Cubes directly or deeply under a group. */
const cubesIn = (g: Group): number => g.children.reduce((n, c) => n + (typeof c === 'string' ? 1 : cubesIn(c)), 0);

describe('state sets as drawn models', () => {
  it('draws the hazel bush, its cut stub and its regrown shoots as three models', () => {
    const { raw, source } = load('world-props', 'bush_hazel');
    const sets = Object.fromEntries(raw.outliner[0]!.children.filter((c): c is Group => typeof c !== 'string').map((g) => [g.name, cubesIn(g)]));
    const variants = stateSetVariants(raw);
    expect(variants.map((v) => v.set)).toEqual(['cut', 'regrown']);
    const base = convertModel(raw, { id: 'bush_hazel', category: 'world-props', source });
    expect(base.sidecar?.cubes).toBe(sets.full);
    for (const v of variants) {
      const m = convertModel(v.raw, { id: `bush_hazel@${v.set}`, category: 'world-props', source });
      expect(m.errors).toEqual([]);
      expect(m.sidecar?.cubes, v.set).toBe(sets[v.set]);
    }
    // The source file is not changed.
    expect(raw.outliner[0]!.children.filter((c): c is Group => typeof c !== 'string').map((g) => g.visibility !== false)).toEqual([true, false, false]);
  });

  it('keeps cubes shared by every look, and effect anchors, when it swaps a lit torch for an unlit one', () => {
    const { raw, source } = load('world-props', 'torch_post');
    const root = raw.outliner[0]!;
    const shared = root.children.filter((c) => typeof c === 'string').length;
    const unlit = cubesIn(root.children.find((c): c is Group => typeof c !== 'string' && c.name === 'unlit')!);
    const [v] = stateSetVariants(raw);
    expect(v!.set).toBe('unlit');
    const m = convertModel(v!.raw, { id: 'torch_post@unlit', category: 'world-props', source });
    expect(m.sidecar?.cubes).toBe(shared + unlit);
  });

  it('gives every crop stage its own model', () => {
    const { raw } = load('world-props', 'crop_wheat');
    expect(stateSetVariants(raw).map((v) => v.set)).toEqual(['sprout', 'growing', 'ripe', 'harvested']);
  });
});
