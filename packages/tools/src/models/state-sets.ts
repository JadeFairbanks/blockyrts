// State sets as drawn models of their own. A world prop's model keeps its
// other looks as groups Blockbench hides by default: bush_hazel's `cut` and
// `regrown`, a crop's `sprout`, `growing`, `ripe` and `harvested`, a rock's
// `depleted`, a light's `unlit`, a building's `construction_0` to
// `construction_66` and `ruined` (Patch 5). The converter leaves hidden groups out, so
// each set becomes a model of its own, `<id>@<set>`: the same file with that
// set shown and the look it replaces (its visible sibling groups with cubes,
// such as `full`, `seeded` or `lit`) hidden. The game picks the drawn id from
// the prop's state (client world/prop-models.ts for growth stages).

/** Categories whose state sets are written out as drawn models: world props, and buildings' construction stages and ruins (Patch 5). */
export const STATE_SET_CATEGORIES: readonly string[] = ['world-props', 'buildings'];

/** Separates a model id from its state set in a drawn id. */
export const STATE_SEP = '@';

interface Group {
  name: string;
  visibility?: boolean;
  children: unknown[];
}

const isGroup = (n: unknown): n is Group => typeof n === 'object' && n !== null && Array.isArray((n as Group).children) && typeof (n as Group).name === 'string';

/** Whether a group holds a cube, however deep. */
function hasCubes(g: Group): boolean {
  return g.children.some((c) => typeof c === 'string' || (isGroup(c) && hasCubes(c)));
}

/** Groups that are never a look of their own: equipment slots and effect anchors. */
const isFixture = (g: Group): boolean => g.name.startsWith('slot_') || g.name.startsWith('fx_');

/** The hidden state sets of a model's outliner, as paths of group indices from the outliner down. */
function hiddenSets(nodes: readonly unknown[], path: number[] = [], out: Array<{ name: string; path: number[] }> = []): Array<{ name: string; path: number[] }> {
  nodes.forEach((n, k) => {
    if (!isGroup(n) || n.name.startsWith('slot_')) return;
    if (n.visibility === false) out.push({ name: n.name, path: [...path, k] });
    else hiddenSets(n.children, [...path, k], out);
  });
  return out;
}

/**
 * Every state set of a .bbmodel's JSON as a copy of the file with that set
 * shown and its visible sibling looks hidden. Sets whose names clash (the same
 * name at two places) are written once, the first.
 */
export function stateSetVariants(raw: unknown): Array<{ set: string; raw: unknown }> {
  const outliner = (raw as { outliner?: unknown[] }).outliner;
  if (!Array.isArray(outliner)) return [];
  const out: Array<{ set: string; raw: unknown }> = [];
  const seen = new Set<string>();
  for (const s of hiddenSets(outliner)) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    const copy = structuredClone(raw) as { outliner: unknown[] };
    // Walk down to the set's parent list.
    let siblings: unknown[] = copy.outliner;
    for (const k of s.path.slice(0, -1)) siblings = (siblings[k] as Group).children;
    const own = siblings[s.path[s.path.length - 1]!] as Group;
    own.visibility = true;
    for (const g of siblings) if (isGroup(g) && g !== own && g.visibility !== false && !isFixture(g) && hasCubes(g)) g.visibility = false;
    out.push({ set: s.name, raw: copy });
  }
  return out;
}
