// The building tree is laid out from the sim's tables and follows edits.

import { describe, expect, it } from 'vitest';
import { buildTree, pathKey } from '../src/core/index.ts';
import { importSimModules } from '../scripts/sim-node.ts';

const mods = await importSimModules();

describe('building tree', () => {
  const tree = buildTree(mods);
  const row = (re: RegExp) => tree.rows.find((r) => re.test(r.name))!;

  it('puts each main base level in its own column', () => {
    const main = tree.rows.find((r) => r.menu === 'main')!;
    expect(main.tiers.map((t) => t.column)).toEqual(main.tiers.map((_, i) => i + 1));
    expect(tree.baseNames.length).toBe(main.tiers.length);
  });

  it('never places a tier before the one below it or what it waits on', () => {
    const col = new Map<string, number>([...tree.rows.flatMap((r) => r.tiers.map((t) => [t.id, t.column] as const)), ...tree.research.map((r) => [r.id, r.column] as const)]);
    for (const r of tree.rows) for (const t of r.tiers) for (const n of t.needs) expect(col.get(n) ?? 0).toBeLessThanOrEqual(t.column);
    for (const r of tree.research) for (const n of r.needs) expect(col.get(n) ?? 0).toBeLessThanOrEqual(r.column);
  });

  it('orders the metal research', () => {
    const at = (name: string) => tree.research.find((r) => r.name === name)!.column;
    expect(at('Bronze')).toBeLessThanOrEqual(at('Steel'));
    expect(tree.dependents.size).toBeGreaterThan(0);
  });

  it('moves a tier when its main base level needed is changed', () => {
    const mine = row(/mineshaft/i);
    const first = mine.tiers[0]!;
    const last = tree.baseNames.length;
    const key = pathKey('buildings/data.ts', [...first.path, 'needsBase']);
    const moved = buildTree(mods, (k) => (k === key ? last : undefined));
    const again = moved.rows.find((r) => r.kind === mine.kind)!;
    expect(again.tiers[0]!.column).toBe(last);
    expect(again.tiers.every((t) => t.column === last)).toBe(true);
  });
});
