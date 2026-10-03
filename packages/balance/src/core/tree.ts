// The building tree: every building's tiers placed at the earliest main
// base level they can be had, with the research steps between them. Built
// from the sim's own tables and the editor's current values, so a changed
// "main base level needed" or research moves the tier in the picture.

import { pathKey, type RawValue } from './schema.ts';
import type { SimModules } from './catalog.ts';

export interface TreeTier {
  /** Node id: `b:<kind>:<level>`, level counted from 1. */
  id: string;
  kind: number;
  level: number;
  name: string;
  /** Main base level (1 to the last) at which it can first be had. */
  column: number;
  /** Its own "main base level needed" (0 for none). */
  needsBase: number;
  research: number;
  /** Ids of the tiers and research steps it waits on. */
  needs: string[];
  /** Where its values live, for editing in place. */
  path: Array<string | number>;
}

export interface TreeRow {
  kind: number;
  name: string;
  menu: 'main' | 'basic' | 'advanced';
  /** False while the game greys it out (comes in a later milestone). */
  live: boolean;
  tiers: TreeTier[];
}

export interface TreeResearch {
  /** Node id: `r:<id>`. */
  id: string;
  research: number;
  name: string;
  column: number;
  /** Seconds to research. */
  seconds: number;
  /** Plain words for what it waits on ("Casting Hearth level 2", "after Bronze"). */
  waits: string[];
  needs: string[];
  /** Where it is researched. */
  at: number;
  path: Array<string | number>;
}

export interface BuildingTree {
  /** One name per main base level, 1 first. */
  baseNames: string[];
  rows: TreeRow[];
  research: TreeResearch[];
  /** Every node's dependents, for highlighting. */
  dependents: Map<string, string[]>;
}

const MODULE = 'buildings/data.ts';
/** Where the research steps live. */
const RESEARCH_MODULE = 'combat/items.ts';

interface LevelRec { name: string; needsBase: number; research: number }
interface BuildingRec { kind: number; name: string; menu: 'basic' | 'advanced'; live: boolean; levels: readonly LevelRec[] }
interface ResearchRec { id: number; name: string; steps: number; forge?: number; after?: number; building?: readonly [number, number]; at?: number; retired?: boolean }

/**
 * Lays out the tree. `value` returns the editor's current value for a
 * `module#path` key (or undefined to use the table's own).
 */
export function buildTree(mods: SimModules, value: (key: string) => RawValue | undefined = () => undefined): BuildingTree {
  const buildings = (mods[MODULE]?.BUILDINGS ?? []) as readonly BuildingRec[];
  const research = ((mods[RESEARCH_MODULE]?.RESEARCH ?? []) as readonly ResearchRec[]).filter((r) => r.id !== 0 && !r.retired && r.name);
  const kinds = (mods[MODULE]?.BuildingKind ?? {}) as Record<string, number>;
  const stepsPerSecond = (mods['fixed.ts']?.STEPS_PER_SECOND ?? mods['rules.ts']?.STEPS_PER_SECOND ?? 20) as number;
  const mainKind = kinds.MainBase ?? 0;
  const forgeKind = kinds.Forge;
  const lodgeKind = Object.entries(kinds).find(([k]) => /scholar/i.test(k))?.[1];

  const num = (module: string, path: Array<string | number>, fallback: unknown): number => {
    const v = value(pathKey(module, path));
    return typeof v === 'number' ? v : typeof fallback === 'number' ? fallback : 0;
  };
  const bIndex = new Map(buildings.map((b, i) => [b.kind, i]));
  const rIndex = new Map(((mods[RESEARCH_MODULE]?.RESEARCH ?? []) as readonly ResearchRec[]).map((r, i) => [r.id, i]));
  const main = buildings[bIndex.get(mainKind) ?? 0];
  const baseCount = Math.max(1, main?.levels.length ?? 1);

  const memo = new Map<string, number>();
  const busy = new Set<string>();
  const needsOf = new Map<string, string[]>();

  // Column of a tier: the main base level itself for the main base, else the latest of what it waits on.
  const tierColumn = (kind: number, level: number): number => {
    const id = `b:${kind}:${level}`;
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (busy.has(id)) return 1;
    busy.add(id);
    const bi = bIndex.get(kind);
    const b = bi === undefined ? undefined : buildings[bi];
    const lv = b?.levels[level - 1];
    let col = 1;
    const needs: string[] = [];
    if (b && lv) {
      const path = ['BUILDINGS', bi!, 'levels', level - 1];
      if (kind === mainKind) col = level;
      const base = num(MODULE, [...path, 'needsBase'], lv.needsBase);
      if (base > 0) {
        col = Math.max(col, base);
        needs.push(`b:${mainKind}:${Math.min(base, baseCount)}`);
      }
      if (level > 1) {
        col = Math.max(col, tierColumn(kind, level - 1));
        needs.push(`b:${kind}:${level - 1}`);
      }
      const r = num(MODULE, [...path, 'research'], lv.research);
      if (r > 0 && rIndex.has(r)) {
        col = Math.max(col, researchColumn(r));
        needs.push(`r:${r}`);
      }
      if (kind === mainKind && level > 1) col = Math.max(col, level);
    }
    busy.delete(id);
    col = Math.min(Math.max(col, 1), baseCount);
    memo.set(id, col);
    needsOf.set(id, needs);
    return col;
  };

  const researchColumn = (rid: number): number => {
    const id = `r:${rid}`;
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (busy.has(id)) return 1;
    busy.add(id);
    const ri = rIndex.get(rid);
    const all = (mods[RESEARCH_MODULE]?.RESEARCH ?? []) as readonly ResearchRec[];
    const r = ri === undefined ? undefined : all[ri];
    let col = 1;
    const needs: string[] = [];
    if (r) {
      const path = ['RESEARCH', ri!];
      const forge = num(RESEARCH_MODULE, [...path, 'forge'], r.forge);
      if (forge > 0 && forgeKind !== undefined) {
        col = Math.max(col, tierColumn(forgeKind, forge));
        needs.push(`b:${forgeKind}:${forge}`);
      }
      const after = num(RESEARCH_MODULE, [...path, 'after'], r.after);
      if (after > 0 && rIndex.has(after)) {
        col = Math.max(col, researchColumn(after));
        needs.push(`r:${after}`);
      }
      if (r.building) {
        const bk = num(RESEARCH_MODULE, [...path, 'building', 0], r.building[0]);
        const bl = num(RESEARCH_MODULE, [...path, 'building', 1], r.building[1]);
        col = Math.max(col, tierColumn(bk, Math.max(1, bl)));
        needs.push(`b:${bk}:${Math.max(1, bl)}`);
      }
      const at = num(RESEARCH_MODULE, [...path, 'at'], r.at ?? lodgeKind);
      if (at !== undefined && bIndex.has(at)) {
        col = Math.max(col, tierColumn(at, 1));
        needs.push(`b:${at}:1`);
      }
    }
    busy.delete(id);
    col = Math.min(Math.max(col, 1), baseCount);
    memo.set(id, col);
    needsOf.set(id, needs);
    return col;
  };

  const names = new Map(buildings.map((b) => [b.kind, b.name]));
  const rNames = new Map(research.map((r) => [r.id, r.name]));
  const rows: TreeRow[] = buildings.map((b, bi) => ({
    kind: b.kind,
    name: b.name,
    menu: b.kind === mainKind ? 'main' : b.menu,
    live: b.live,
    tiers: b.levels.map((lv, li) => {
      const path = ['BUILDINGS', bi, 'levels', li];
      const column = tierColumn(b.kind, li + 1);
      return {
        id: `b:${b.kind}:${li + 1}`, kind: b.kind, level: li + 1, name: lv.name, column,
        needsBase: num(MODULE, [...path, 'needsBase'], lv.needsBase), research: num(MODULE, [...path, 'research'], lv.research),
        needs: needsOf.get(`b:${b.kind}:${li + 1}`) ?? [], path,
      };
    }),
  }));
  const all = (mods[RESEARCH_MODULE]?.RESEARCH ?? []) as readonly ResearchRec[];
  const tree: TreeResearch[] = research.map((r) => {
    const ri = rIndex.get(r.id)!;
    const path = ['RESEARCH', ri];
    const column = researchColumn(r.id);
    const waits: string[] = [];
    const forge = num(RESEARCH_MODULE, [...path, 'forge'], r.forge);
    if (forge > 0 && forgeKind !== undefined) waits.push(`${names.get(forgeKind) ?? 'Forge'} level ${forge}`);
    const after = num(RESEARCH_MODULE, [...path, 'after'], r.after);
    if (after > 0) waits.push(`after ${rNames.get(after) ?? all[rIndex.get(after) ?? -1]?.name ?? after}`);
    if (r.building) {
      const bk = num(RESEARCH_MODULE, [...path, 'building', 0], r.building[0]);
      const bl = num(RESEARCH_MODULE, [...path, 'building', 1], r.building[1]);
      const lvName = buildings[bIndex.get(bk) ?? -1]?.levels[bl - 1]?.name;
      waits.push(lvName ?? `${names.get(bk) ?? bk} level ${bl}`);
    }
    const at = num(RESEARCH_MODULE, [...path, 'at'], r.at ?? lodgeKind);
    return {
      id: `r:${r.id}`, research: r.id, name: r.name, column, seconds: Math.round(num(RESEARCH_MODULE, [...path, 'steps'], r.steps) / stepsPerSecond),
      waits, needs: needsOf.get(`r:${r.id}`) ?? [], at, path,
    };
  }).sort((a, b) => a.column - b.column || a.research - b.research);

  const dependents = new Map<string, string[]>();
  for (const [id, needs] of needsOf) {
    for (const n of needs) {
      if (!dependents.has(n)) dependents.set(n, []);
      dependents.get(n)!.push(id);
    }
  }
  return { baseNames: (main?.levels ?? []).map((l) => l.name), rows, research: tree, dependents };
}
