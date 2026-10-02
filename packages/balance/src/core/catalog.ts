// Turns the sim's data modules into the editor's tree: groups, entries
// (a building, a mob, a recipe, or a bundle of loose rules), and inside
// each entry nested sections down to single editable values. Nothing here
// knows the numbers: it walks whatever the modules export, so a new table
// shows up on the next build.

import { pathKey, type DataPath, type RawValue } from './schema.ts';
import type { SimDocs } from './docs.ts';
import {
  ENTRY_ARRAYS, EXPORT_GROUPS, GROUPS, HIDDEN_KEYS, KEY_LABELS, KEY_ORDER, KEY_UNITS, MODULE_GROUPS, MODULE_TITLES, NAME_UNITS, READ_ONLY_KEYS, REF_KEYS,
  SKIP_EXPORTS, SKIP_MODULES, TEXT_KEYS, humanise, type RefKind,
} from './rules.ts';
import type { UnitId } from './units.ts';

export type SimModules = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface FieldNode {
  type: 'field';
  /** pathKey(module, path): stable across builds while the data keeps its shape. */
  id: string;
  module: string;
  path: DataPath;
  label: string;
  /** The value in the tables the editor was built from. */
  value: RawValue;
  unit: UnitId;
  /** Set when the number names a thing (a resource, a mob, a research...): edited from a list. */
  ref?: RefKind;
  readOnly: boolean;
  doc: string;
  /** The entry it belongs to, and the trail of section labels inside it. */
  entryId: string;
  trail: string[];
}

/** A resource and an amount (costs, outputs), a building and a level (made at), or a mob and a count. */
export interface PairNode {
  type: 'pair';
  label: string;
  ref: FieldNode;
  amount: FieldNode;
}

export interface TextNode {
  type: 'text';
  label: string;
  text: string;
}

export interface SectionNode {
  type: 'section';
  label: string;
  doc: string;
  children: CatNode[];
  /** Sections open by default (a building's levels) or folded (long lists). */
  open: boolean;
}

export type CatNode = FieldNode | PairNode | TextNode | SectionNode;

export interface Relation {
  /** The entry that names the target, e.g. a building level needing a research. */
  from: string;
  /** Where in it: "Level 2: Scriptorium". */
  where: string;
  /** How: "needs", "made at"... */
  how: string;
  /** Part of the target, when it matters: "level 4". */
  detail: string;
}

export interface Entry {
  id: string;
  group: string;
  /** Sub-menu labels between the group and the entry, e.g. ["Advanced build menu"]. */
  menu: string[];
  label: string;
  module: string;
  path: DataPath;
  doc: string;
  children: CatNode[];
  /** Entries that need this one, are made here, spawn here... filled after every entry exists. */
  usedBy: Relation[];
}

export interface Catalog {
  groups: Array<{ id: string; label: string; blurb: string; entries: Entry[] }>;
  entries: Map<string, Entry>;
  fields: Map<string, FieldNode>;
  /** Names for every reference kind, by id. */
  refNames: Record<RefKind, Map<number, string>>;
  /** The entry a reference opens, by kind and id. */
  refEntry: (kind: RefKind, id: number) => string | undefined;
}

const RES_PAIR_KEYS = new Set(['cost', 'inputs', 'outputs', 'extra', 'recipes', 'STARTING_STOCK', 'crops']);
const PAIR_REFS: Readonly<Record<string, RefKind>> = {
  cost: 'res', inputs: 'res', outputs: 'res', extra: 'res', recipes: 'res', STARTING_STOCK: 'res', itemInputs: 'item',
  at: 'building', madeAt: 'building', FIRST_NIGHT: 'mob',
};

function isNumberPair(v: unknown): v is readonly [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function isEnumObject(name: string, v: unknown): boolean {
  return /^[A-Z][a-z]/.test(name) && !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'number');
}

function findExport(mods: SimModules, name: string): unknown {
  for (const m of Object.values(mods)) if (name in m) return m[name];
  return undefined;
}

function namesFromEnum(e: unknown): Map<number, string> {
  const out = new Map<number, string>();
  if (e && typeof e === 'object') for (const [k, v] of Object.entries(e)) if (typeof v === 'number' && !out.has(v)) out.set(v, humanise(k));
  return out;
}

function namesFromList(list: unknown, idKey: string | null): Map<number, string> {
  const out = new Map<number, string>();
  if (!Array.isArray(list)) return out;
  list.forEach((x, i) => {
    if (typeof x === 'string') out.set(i, x);
    else if (x && typeof x === 'object') {
      const r = x as Record<string, unknown>;
      const id = idKey && typeof r[idKey] === 'number' ? (r[idKey] as number) : i;
      if (typeof r.name === 'string') out.set(id, r.name === '' ? 'none' : r.name.charAt(0).toUpperCase() + r.name.slice(1));
    }
  });
  return out;
}

function buildRefNames(mods: SimModules): Record<RefKind, Map<number, string>> {
  const e = (n: string): Map<number, string> => namesFromEnum(findExport(mods, n));
  const l = (n: string, id: string | null): Map<number, string> => namesFromList(findExport(mods, n), id);
  const made = e('Made');
  made.set(0, 'nothing');
  const research = l('RESEARCH', 'id');
  research.set(0, 'none');
  return {
    res: l('RESOURCES', 'id'), mob: l('MOBS', 'id'), research, building: l('BUILDINGS', 'kind'), item: l('ITEMS', 'id'),
    shot: l('SHOTS', null), tool: e('Tool'), slot: l('SLOT_NAMES', null), nature: e('Nature'), moves: e('Moves'), sun: e('Sun'),
    comes: e('Comes'), role: e('Role'), lairSite: e('LairSite'), band: l('BAND_NAMES', null), hit: e('Hit'), made,
    species: l('SPECIES', 'id'), material: l('MATERIALS', null), digClass: e('DigClass'), rations: e('Rations'),
    resGroup: e('ResGroup'), unitKind: e('UnitKind'),
  };
}

/** Which array export each reference kind's entries come from, and the key holding the id. */
const REF_SOURCES: Partial<Record<RefKind, readonly [string, string | null]>> = {
  res: ['RESOURCES', 'id'], mob: ['MOBS', 'id'], research: ['RESEARCH', 'id'], building: ['BUILDINGS', 'kind'], item: ['ITEMS', 'id'],
  shot: ['SHOTS', null], species: ['SPECIES', 'id'], material: ['MATERIALS', null],
};

const SLOT_MENUS = ['Tools', 'Weapons', 'Backup weapons', 'Ranged weapons', 'Shields', 'Boots', 'Ammunition', 'Torches', 'Armour', 'Helmets', 'Cases', 'Kits'];

interface Ctx {
  mods: SimModules;
  docs: SimDocs;
  refs: Record<RefKind, Map<number, string>>;
  module: string;
  exportName: string;
  entryId: string;
  fields: Map<string, FieldNode>;
}

function refFor(ctx: Ctx, key: string): RefKind | undefined {
  return REF_KEYS[`${ctx.exportName}:${key}`] ?? REF_KEYS[key];
}

function unitFor(key: string, parentKey: string, exportName: string): UnitId {
  const byParent = KEY_UNITS[`${parentKey}:${key}`];
  if (byParent) return byParent;
  if (key in KEY_UNITS) return KEY_UNITS[key]!;
  for (const name of [key, exportName]) for (const [re, u] of NAME_UNITS) if (re.test(name)) return u;
  return 'number';
}

function docFor(ctx: Ctx, key: string): string {
  return ctx.docs[ctx.module]?.props[key] ?? '';
}

function labelFor(key: string, parentKey = ''): string {
  return KEY_LABELS[`${parentKey}:${key}`] ?? KEY_LABELS[key] ?? humanise(key);
}

function field(ctx: Ctx, path: DataPath, label: string, value: RawValue, key: string, parentKey: string, trail: string[], forceRef?: RefKind): FieldNode {
  if (label === labelFor(key)) label = labelFor(key, parentKey);
  const ref = forceRef ?? (typeof value === 'number' ? refFor(ctx, key) : undefined);
  const f: FieldNode = {
    type: 'field', id: pathKey(ctx.module, path), module: ctx.module, path, label, value,
    unit: ref ? 'number' : unitFor(key, parentKey, ctx.exportName),
    readOnly: READ_ONLY_KEYS.has(key) || READ_ONLY_KEYS.has(`${ctx.exportName}:${key}`),
    doc: docFor(ctx, key), entryId: ctx.entryId, trail,
    ...(ref ? { ref } : {}),
  };
  ctx.fields.set(f.id, f);
  return f;
}

function refName(ctx: Ctx, kind: RefKind, id: number): string {
  return ctx.refs[kind].get(id) ?? `#${id}`;
}

/** Labels for the items of an unnamed list, where the list is indexed by something. */
function indexLabel(ctx: Ctx, key: string, i: number): string {
  const r = ctx.refs;
  const rank = (side: 'warrior' | 'worker'): string => {
    const names = (findExport(ctx.mods, 'RANK_NAMES') as Record<string, string[]> | undefined)?.[side];
    return names?.[i] ? `Rank ${i}: ${names[i]}` : `Rank ${i}`;
  };
  switch (key) {
    case 'WARRIOR_HEALTH_BY_RANK': case 'WARRIOR_XP_TENTHS': return rank('warrior');
    case 'WORKER_HEALTH_BY_RANK': case 'WORKER_HEALTH_BY_RANK_COMBAT': case 'WORKER_COMBAT_XP_TENTHS': return rank('worker');
    case 'TOOL_SPEED_PER_MILLE': return r.tool.get(i) ?? `Tier ${i}`;
    case 'DEPTH_PM': case 'DEPTH_AHEAD': return r.band.get(i) ?? `Band ${i}`;
    case 'SIGHT_WU': return r.unitKind.get(i) ?? `Kind ${i}`;
    case 'FARM_TIER_PER_MILLE': case 'COOK_STEPS_PER_ITEM': return `Tier ${i + 1}`;
    case 'TRINKET_STEPS': case 'TRINKET_INGOTS': case 'TRINKET_MULTIPLIER_TENTHS': {
      const tiers = findExport(ctx.mods, 'TRINKET_TIERS') as readonly string[] | undefined;
      return tiers?.[i] ?? `Tier ${i + 1}`;
    }
    case 'RATING_PER_MILLE': return (findExport(ctx.mods, 'RATING_NAMES') as readonly string[] | undefined)?.[i] ?? `Rating ${i}`;
    case 'HUT_SALVAGE': return ['Sticks', 'Hides'][i] ?? `${i + 1}`;
    case 'levels': return `Level ${i + 1}`;
    default: return `${i + 1}`;
  }
}

/** Label for one item of a list of records. */
function recordLabel(ctx: Ctx, key: string, rec: Record<string, unknown>, i: number): string {
  if (key === 'levels' && typeof rec.name === 'string') return `Level ${i + 1}: ${rec.name}`;
  if (typeof rec.name === 'string' && rec.name !== '') return rec.name;
  if (typeof rec.res === 'number') return refName(ctx, 'res', rec.res);
  if (typeof rec.mob === 'number') return refName(ctx, 'mob', rec.mob);
  return indexLabel(ctx, key, i);
}

function walk(ctx: Ctx, value: unknown, path: DataPath, key: string, parentKey: string, trail: string[], labelOverride?: string): CatNode | null {
  const label = labelOverride ?? (typeof path[path.length - 1] === 'number' ? indexLabel(ctx, key, path[path.length - 1] as number) : labelFor(key));
  if (typeof value === 'number' || typeof value === 'boolean') return field(ctx, path, label, value, key, parentKey, trail);
  if (typeof value === 'string') {
    if (HIDDEN_KEYS.has(key) || value === '') return null;
    return { type: 'text', label: TEXT_KEYS[key] ?? labelFor(key), text: value };
  }
  if (typeof value === 'function') {
    const doc = docFor(ctx, key);
    return { type: 'text', label: labelFor(key), text: `Worked out in code${doc ? `: ${doc}` : '.'} Ask for a change in a note.` };
  }
  if (Array.isArray(value)) return walkArray(ctx, value, path, key, parentKey, trail, label);
  if (value && typeof value === 'object') {
    const children: CatNode[] = [];
    const sub = [...trail, label];
    for (const [k, v] of orderedEntries(value as Record<string, unknown>)) {
      const named = v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? (v as { name: string }).name : '';
      const n = walk(ctx, v, [...path, k], k, key, sub, named ? named.charAt(0).toUpperCase() + named.slice(1) : undefined);
      if (n) children.push(n);
    }
    return children.length ? { type: 'section', label, doc: docFor(ctx, key), children, open: true } : null;
  }
  return null;
}

function walkArray(ctx: Ctx, value: readonly unknown[], path: DataPath, key: string, parentKey: string, trail: string[], label: string): CatNode | null {
  if (value.length === 0) return null;
  const sub = [...trail, label];
  const pairRef = PAIR_REFS[key] ?? PAIR_REFS[ctx.exportName === key ? key : ''];
  // A cost: [[resource, amount], ...].
  if (value.every(isNumberPair)) {
    const kind: RefKind | undefined = pairRef ?? (RES_PAIR_KEYS.has(key) ? 'res' : undefined);
    if (kind) {
      const children: CatNode[] = value.map((p, i) => {
        const pair = p as readonly [number, number];
        const amountLabel = kind === 'building' ? 'Level' : 'Amount';
        const refF = field(ctx, [...path, i, 0], kind === 'building' ? 'Building' : humanise(kind), pair[0], '', key, sub, kind);
        const amt = field(ctx, [...path, i, 1], amountLabel, pair[1], kind === 'building' ? 'needsBase' : 'makes', key, sub);
        return { type: 'pair', label: refName(ctx, kind, pair[0]), ref: refF, amount: amt } satisfies PairNode;
      });
      return { type: 'section', label, doc: docFor(ctx, key), children, open: true };
    }
  }
  // Ways of paying: [[[res, n], ...], ...].
  if (value.every((alt) => Array.isArray(alt) && alt.every(isNumberPair))) {
    const children = value
      .map((alt, i) => walkArray(ctx, alt as unknown[], [...path, i], key, parentKey, sub, value.length > 1 ? `Way ${i + 1}` : 'Inputs'))
      .filter((n): n is CatNode => n !== null);
    if (value.length === 1 && children[0]?.type === 'section') return { ...children[0], label };
    return { type: 'section', label, doc: docFor(ctx, key), children, open: true };
  }
  // A list of numbers: references (spawns, bands) or values by index.
  if (value.every((x) => typeof x === 'number' || typeof x === 'boolean')) {
    const ref = refFor(ctx, key) ?? REF_KEYS[`${key}:*`];
    const children = value.map((x, i) => field(ctx, [...path, i], ref ? `${i + 1}` : indexLabel(ctx, key, i), x as RawValue, ref ? '' : key, key, sub, ref));
    return { type: 'section', label, doc: docFor(ctx, key), children, open: value.length <= 12 };
  }
  // A list of records or lists.
  const children: CatNode[] = [];
  value.forEach((x, i) => {
    const itemLabel = x && typeof x === 'object' && !Array.isArray(x) ? recordLabel(ctx, key, x as Record<string, unknown>, i) : indexLabel(ctx, key, i);
    const n = walk(ctx, x, [...path, i], key, parentKey, sub, itemLabel);
    if (n?.type === 'section') children.push({ ...n, open: key === 'levels' || value.length <= 4 });
    else if (n) children.push(n);
  });
  return children.length ? { type: 'section', label, doc: docFor(ctx, key), children, open: true } : null;
}

/** A record's keys with the ones people tune most first, the rest in source order. */
function orderedEntries(r: Record<string, unknown>): Array<[string, unknown]> {
  const rank = (k: string): number => {
    const i = KEY_ORDER.indexOf(k);
    return i < 0 ? KEY_ORDER.length : i;
  };
  return Object.entries(r).map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i).map((x) => x.e);
}

function allReadOnly(n: CatNode): boolean {
  if (n.type === 'field') return n.readOnly;
  if (n.type === 'pair') return n.amount.readOnly && n.ref.readOnly;
  if (n.type === 'text') return true;
  return n.children.every(allReadOnly);
}

function groupOf(module: string, name: string): string {
  return EXPORT_GROUPS[`${module}:${name}`] ?? MODULE_GROUPS[module] ?? 'other';
}

function entryMenu(ctx: Ctx, rec: Record<string, unknown>): string[] {
  const r = ctx.refs;
  switch (ctx.exportName) {
    case 'BUILDINGS': return [rec.menu === 'advanced' ? 'Advanced build menu' : 'Basic build menu'];
    case 'ITEMS': return [SLOT_MENUS[rec.slot as number] ?? 'Other'];
    case 'RECIPES': {
      const at = (rec.at as ReadonlyArray<readonly [number, number]>)[0];
      return [at ? `At the ${r.building.get(at[0]) ?? 'building'}` : 'Anywhere'];
    }
    case 'MOBS': return [`${r.role.get(rec.role as number) ?? 'Other'} mobs`];
    case 'SPECIES': return [`${r.nature.get(rec.nature as number) ?? 'Other'} animals`];
    case 'RESOURCES': return [`${r.resGroup.get(rec.group as number) ?? 'Other'} resources`];
    case 'PRODUCTS': return ['Training and products'];
    default: return [];
  }
}

function entryLabel(ctx: Ctx, rec: Record<string, unknown>, i: number): string {
  if (typeof rec.name === 'string' && rec.name !== '') return rec.name.charAt(0).toUpperCase() + rec.name.slice(1);
  if (typeof rec.mob === 'number') return refName(ctx, 'mob', rec.mob);
  return `${humanise(ctx.exportName)} ${i + 1}`;
}

/** Builds the whole tree. `mods` are the sim's modules by path under packages/sim/src; `docs` their comments. */
export function buildCatalog(mods: SimModules, docs: SimDocs): Catalog {
  const refs = buildRefNames(mods);
  const fields = new Map<string, FieldNode>();
  const entries = new Map<string, Entry>();
  const byGroup = new Map<string, Entry[]>(GROUPS.map((g) => [g.id, []]));
  const rules = new Map<string, Entry>();

  const moduleNames = Object.keys(mods).filter((m) => !SKIP_MODULES.has(m) && !m.endsWith('.test.ts')).sort();
  for (const module of moduleNames) {
    const declared = docs[module]?.exports ?? {};
    for (const [name, value] of Object.entries(mods[module]!)) {
      // Only what the module itself declares (not re-exports), and no plumbing.
      if (!(name in declared) || SKIP_EXPORTS.has(`${module}:${name}`)) continue;
      if (typeof value === 'function' || isEnumObject(name, value) || /^[a-z]/.test(name)) continue;
      const group = groupOf(module, name);
      const doc = declared[name]?.doc ?? '';
      const base: Omit<Ctx, 'entryId'> = { mods, docs, refs, module, exportName: name, fields };

      if (name === 'NUMBER_TABLES' && Array.isArray(value)) {
        for (const t of value as Array<{ id: string; title: string; caption: string; columns: string[]; rows: Array<Array<{ text: string; suggested: boolean }>>; notes: string[] }>) {
          const id = `${module}:${name}:${t.id}`;
          const children: CatNode[] = [];
          if (t.caption) children.push({ type: 'text', label: 'Caption', text: t.caption });
          t.rows.forEach((row) => {
            const head = row[0]?.text ?? '';
            children.push({
              type: 'section', label: head.length > 80 ? `${head.slice(0, 77)}...` : head, doc: '', open: true,
              children: row.slice(1).map((c, ci) => ({ type: 'text', label: `${t.columns[ci + 1] ?? ''}${c.suggested ? ' (suggested)' : ''}`, text: c.text })),
            });
          });
          t.notes.forEach((n) => children.push({ type: 'text', label: 'Note', text: n }));
          const e: Entry = { id, group, menu: [], label: `Table ${t.id}: ${t.title}`, module, path: [name], doc: '', children, usedBy: [] };
          entries.set(id, e);
          byGroup.get(group)!.push(e);
        }
        continue;
      }

      if (ENTRY_ARRAYS.has(`${module}:${name}`) && Array.isArray(value)) {
        value.forEach((rec, i) => {
          if (!rec || typeof rec !== 'object') return;
          const r = rec as Record<string, unknown>;
          if (r.name === '' || (name === 'ITEMS' && r.id === 0)) return; // "none" placeholders
          const id = `${module}:${name}:${i}`;
          const ctx: Ctx = { ...base, entryId: id };
          const label = entryLabel(ctx, r, i);
          const texts: CatNode[] = [];
          const live: CatNode[] = [];
          const fixed: CatNode[] = [];
          for (const [k, v] of orderedEntries(r)) {
            const n = walk(ctx, v, [name, i, k], k, name, []);
            if (!n) continue;
            if (n.type === 'text' && !(k in TEXT_KEYS)) fixed.push(n);
            else if (n.type === 'text') texts.push(n);
            else if (allReadOnly(n)) fixed.push(n);
            else live.push(n);
          }
          const children = [...texts, ...live];
          if (fixed.length) children.push({ type: 'section', label: 'Fixed details', doc: 'Identity and layout: shown for reference, not balance.', children: fixed, open: false });
          const e: Entry = { id, group, menu: entryMenu(ctx, r), label, module, path: [name, i], doc, children, usedBy: [] };
          entries.set(id, e);
          byGroup.get(group)!.push(e);
        });
        continue;
      }

      // Loose numbers and small tables: one entry per group and module.
      const rulesId = `rules:${group}:${module}`;
      let rulesEntry = rules.get(rulesId);
      if (!rulesEntry) {
        rulesEntry = { id: rulesId, group, menu: [], label: moduleTitle(module, docs, group), module: '', path: [rulesId], doc: docs[module]?.header ?? '', children: [], usedBy: [] };
        rules.set(rulesId, rulesEntry);
      }
      const ctx: Ctx = { ...base, entryId: rulesEntry.id };
      const n = walk(ctx, value, [name], name, '', []);
      if (n?.type === 'field') {
        rulesEntry.children.push({ ...n, doc });
        fields.set(n.id, { ...n, doc });
      } else if (n?.type === 'section') rulesEntry.children.push({ ...n, doc: doc || n.doc, open: n.children.length <= 8 });
    }
  }
  for (const e of [...rules.values()].reverse()) {
    entries.set(e.id, e);
    const list = byGroup.get(e.group)!;
    if (list.some((x) => !x.id.startsWith('rules:'))) e.menu = ['Rules and settings'];
    list.unshift(e);
  }

  const refEntryIndex = new Map<string, string>();
  for (const [kind, src] of Object.entries(REF_SOURCES) as Array<[RefKind, readonly [string, string | null]]>) {
    for (const e of entries.values()) {
      if (e.path.length !== 2 || e.path[0] !== src[0]) continue;
      const rec = (mods[e.module]?.[src[0]] as unknown[])[e.path[1] as number] as Record<string, unknown>;
      const id = src[1] ? (rec[src[1]] as number) : (e.path[1] as number);
      refEntryIndex.set(`${kind}:${id}`, e.id);
    }
  }
  const refEntry = (kind: RefKind, id: number): string | undefined => refEntryIndex.get(`${kind}:${id}`);
  linkRelations(mods, entries, fields, refEntry);

  return {
    groups: GROUPS.map((g) => ({ ...g, entries: byGroup.get(g.id)! })).filter((g) => g.entries.length > 0),
    entries, fields, refNames: refs, refEntry,
  };
}

/** A module's title for its section in a rules entry: the first sentence of its header comment. */
function moduleTitle(module: string, docs: SimDocs, group: string): string {
  const t = MODULE_TITLES[`${group}:${module}`] ?? MODULE_TITLES[module];
  if (t) return t;
  const h = docs[module]?.header ?? '';
  const first = h.split(/(?<=[.:])\s|\s\(/)[0]?.replace(/[.:]$/, '') ?? '';
  return first && first.length <= 70 ? first : module.replace(/\.ts$/, '');
}

const HOW: Readonly<Record<string, string>> = {
  research: 'needs this research', research2: 'needs this research', after: 'needs this research first', at: 'is made here', madeAt: 'is made here',
  guardians: 'has this as a guardian', spawns: 'sends this out at night', mob: 'is the data for this lair or band', tameAt: 'is kept here once tamed',
};

/** The Forge's building kind (shown as the Casting Hearth and its later levels). */
export function forgeKind(mods: SimModules): number | undefined {
  const kinds = findExport(mods, 'BuildingKind') as Record<string, number> | undefined;
  return kinds?.Forge;
}

function linkRelations(mods: SimModules, entries: Map<string, Entry>, fields: Map<string, FieldNode>, refEntry: Catalog['refEntry']): void {
  const bigHouse = refEntry('building', 0);
  const forge = forgeKind(mods);
  for (const f of fields.values()) {
    const from = entries.get(f.entryId);
    if (!from || typeof f.value !== 'number') continue;
    const key = String(f.path[f.path.length - 1]);
    const parent = f.path.find((p, i) => typeof p === 'string' && i > 0 && (p === 'at' || p === 'madeAt' || p === 'guardians' || p === 'spawns'));
    const where = f.trail.filter((t) => !/^(Way \d+|Inputs|\d+)$/.test(t)).join(' > ');
    let target: string | undefined;
    let detail = '';
    let how = '';
    const via = typeof parent === 'string' ? parent : key;
    if (f.ref === 'research' && f.value !== 0) {
      target = refEntry('research', f.value);
      how = HOW[key] ?? 'needs this research';
    } else if (f.ref === 'building' && (via === 'at' || via === 'madeAt' || via === 'tameAt')) {
      target = refEntry('building', f.value);
      how = HOW[via]!;
      const lv = via === 'tameAt' ? undefined : fields.get(f.id.replace(/\.0$/, '.1'));
      if (lv && typeof lv.value === 'number') detail = `level ${lv.value}`;
    } else if (f.ref === 'mob' && (via === 'guardians' || via === 'spawns' || via === 'mob')) {
      target = refEntry('mob', f.value);
      how = HOW[via]!;
    }
    if (key === 'needsBase' && f.value > 0 && bigHouse) {
      target = bigHouse;
      how = 'needs this main base level';
      detail = `level ${f.value}`;
    }
    if (key === 'forge' && f.value > 0 && forge !== undefined) {
      target = refEntry('building', forge);
      how = 'needs a forge of this level first';
      detail = `level ${f.value}`;
    }
    if (!target || !how || target === from.id) continue;
    entries.get(target)?.usedBy.push({ from: from.id, where, how, detail });
  }
}
