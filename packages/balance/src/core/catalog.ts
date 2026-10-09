// Turns the sim's data modules into the editor's tree: groups, entries
// (a building, a mob, a recipe, or a bundle of loose rules), and inside
// each entry nested sections down to single editable values. Nothing here
// knows the numbers: it walks whatever the modules export, so a new table
// shows up on the next build.

import { pathKey, type DataPath, type RawValue } from './schema.ts';
import type { SimDocs } from './docs.ts';
import {
  ENTRY_ARRAYS, ENTRY_RECORDS, EXPORT_GROUPS, EXPORT_UNITS, GROUPS, HIDDEN_KEYS, INDEX_REFS, KEY_LABELS, KEY_ORDER, KEY_UNITS, KIT_MENUS, MODULE_GROUPS,
  MODULE_TITLES, NAME_UNITS, PAIR_KEY_REFS, PLACEHOLDER_ROWS, READ_ONLY_KEYS, REF_KEYS, SECTION_PAGES, SECTION_TITLES, SKIP_EXPORTS, SKIP_MODULES, TEXT_KEYS,
  UNTIERED_KITS, humanise, type RefKind,
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
  cost: 'res', inputs: 'res', outputs: 'res', extra: 'res', recipes: 'res', STARTING_STOCK: 'res', FIRST_NIGHT: 'mob', splitsInto: 'mob',
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
    res: l('RESOURCES', 'id'), mob: l('MOBS', 'id'), research, building: l('BUILDINGS', 'kind'), gear: l('GEAR', 'id'),
    shot: l('SHOTS', null), tool: e('Tool'), toolJob: e('ToolJob'), tierNeed: tierNames(findExport(mods, 'TIER_NEEDS')),
    nature: e('Nature'), moves: e('Moves'), sun: e('Sun'),
    comes: e('Comes'), role: e('Role'), lairSite: e('LairSite'), band: l('BAND_NAMES', null), hit: e('Hit'), made,
    species: l('SPECIES', 'id'), material: l('MATERIALS', null), digClass: e('DigClass'), rations: e('Rations'),
    resGroup: e('ResGroup'), unitKind: e('UnitKind'),
    people: l('PEOPLE_NAMES', null), faction: l('FACTION_KIND_NAMES', null), cat: capitalised(l('CAT_NAMES', null)),
    peopleUnit: peopleUnitNames(findExport(mods, 'PEOPLE_UNITS')), trinketMetal: l('TRINKET_METALS', null),
    good: goodNames(mods), trait: e('Trait'),
  };
}

/** Every trade good by id: the resources, then live animals (LIVE_GOODS + species) and engines (ENGINE_GOODS + kind). */
function goodNames(mods: SimModules): Map<number, string> {
  const out = namesFromList(findExport(mods, 'RESOURCES'), 'id');
  const live = findExport(mods, 'LIVE_GOODS');
  const engines = findExport(mods, 'ENGINE_GOODS');
  if (typeof live === 'number') for (const [id, name] of namesFromList(findExport(mods, 'SPECIES'), 'id')) out.set(live + id, `Live ${name.toLowerCase()}`);
  if (typeof engines === 'number') for (const [id, name] of namesFromList(findExport(mods, 'ENGINES'), 'id')) out.set(engines + id, name);
  return out;
}

/** The material tiers (Troops and gear) as "3: copper". */
function tierNames(list: unknown): Map<number, string> {
  const out = new Map<number, string>();
  if (Array.isArray(list)) for (const r of list as ReadonlyArray<{ tier: number; name: string }>) out.set(r.tier, `${r.tier}: ${r.name}`);
  return out;
}

function capitalised(m: Map<number, string>): Map<number, string> {
  return new Map([...m].map(([k, v]) => [k, v.charAt(0).toUpperCase() + v.slice(1)]));
}

/** The peoples' units by id; two that share a name (the Halfling man and woman) are told apart by their model. */
function peopleUnitNames(list: unknown): Map<number, string> {
  const out = new Map<number, string>();
  if (!Array.isArray(list)) return out;
  const recs = list as ReadonlyArray<{ id: number; name: string; model?: string }>;
  for (const r of recs) {
    const twin = recs.some((o) => o !== r && o.name === r.name);
    const m = /_(male|female)$/.exec(r.model ?? '');
    out.set(r.id, twin && m ? `${r.name} (${m[1] === 'male' ? 'man' : 'woman'})` : r.name);
  }
  return out;
}

/** A trade good: a resource, a live animal (LIVE_GOODS + species) or an engine (ENGINE_GOODS + kind). */
function goodName(ctx: Ctx, good: number): string {
  const live = findExport(ctx.mods, 'LIVE_GOODS') as number | undefined;
  const engines = findExport(ctx.mods, 'ENGINE_GOODS') as number | undefined;
  if (engines !== undefined && good >= engines) {
    const list = findExport(ctx.mods, 'ENGINES') as ReadonlyArray<{ id: number; name: string }> | undefined;
    return list?.find((r) => r.id === good - engines)?.name ?? `Engine ${good - engines}`;
  }
  if (live !== undefined && good >= live) return `Live ${refName(ctx, 'species', good - live).toLowerCase()}`;
  return refName(ctx, 'res', good);
}

/** The label for a key or index of a table whose keys name something (INDEX_REFS), from its path. */
function tableLabel(ctx: Ctx, path: DataPath): string | undefined {
  const kinds = INDEX_REFS[ctx.exportName];
  const k = path[path.length - 1];
  if (!kinds || path.length < 2 || path[0] !== ctx.exportName) return undefined;
  const kind = kinds[path.length - 2];
  if (!kind || k === undefined || !/^\d+$/.test(String(k))) return undefined;
  return refName(ctx, kind, Number(k));
}

/** Which array export each reference kind's entries come from, and the key holding the id. */
const REF_SOURCES: Partial<Record<RefKind, readonly [string, string | null]>> = {
  res: ['RESOURCES', 'id'], mob: ['MOBS', 'id'], research: ['RESEARCH', 'id'], building: ['BUILDINGS', 'kind'], tierNeed: ['TIER_NEEDS', 'tier'],
  shot: ['SHOTS', null], species: ['SPECIES', 'id'], material: ['MATERIALS', null], peopleUnit: ['PEOPLE_UNITS', 'id'],
};

/** Names for the reference picker's label, where the kind's own name reads badly. */
const REF_LABELS: Partial<Record<RefKind, string>> = { mob: 'Building or creature', peopleUnit: 'Unit', species: 'Animal' };

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
  if (exportName in EXPORT_UNITS) return EXPORT_UNITS[exportName]!;
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
    case 'WORKER_HEALTH_BY_RANK': case 'WORKER_XP_TENTHS': return rank('worker');
    case 'TOOL_SPEED_PER_MILLE': return r.tool.get(i) ?? `Tier ${i}`;
    case 'tools': return r.toolJob.get(i) ?? `${i + 1}`;
    case 'DEPTH_PM': case 'DEPTH_AHEAD': return r.band.get(i) ?? `Band ${i}`;
    case 'SIGHT_WU': return r.unitKind.get(i) ?? `Kind ${i}`;
    case 'FORGE_STEP_BASE': return ['No Forge', 'Copper, tin and bronze', 'Wrought iron', 'Iron', 'Steel'][i] ?? `Step ${i}`;
    case 'WORKED_OUT': return `Depth ${i + 1}`;
    case 'TRINKET_STEPS': case 'TRINKET_INGOTS': case 'TRINKET_MULTIPLIER_TENTHS': case 'TRINKET_TIER_BASE': {
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
  if (typeof rec.good === 'number') return goodName(ctx, rec.good);
  return indexLabel(ctx, key, i);
}

function walk(ctx: Ctx, value: unknown, path: DataPath, key: string, parentKey: string, trail: string[], labelOverride?: string): CatNode | null {
  const label = labelOverride ?? tableLabel(ctx, path) ?? (typeof path[path.length - 1] === 'number' ? indexLabel(ctx, key, path[path.length - 1] as number) : labelFor(key, parentKey));
  if (HIDDEN_KEYS.has(`${ctx.exportName}:${key}`)) return null;
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
  const pairRef = PAIR_KEY_REFS[`${ctx.exportName}:${key}`] ?? PAIR_KEY_REFS[`${ctx.exportName}:*`] ?? PAIR_REFS[key] ?? PAIR_REFS[ctx.exportName === key ? key : ''];
  // A cost: [[resource, amount], ...].
  if (value.every(isNumberPair)) {
    const kind: RefKind | undefined = pairRef ?? (RES_PAIR_KEYS.has(key) ? 'res' : undefined);
    if (kind) {
      const children: CatNode[] = value.map((p, i) => {
        const pair = p as readonly [number, number];
        const amountLabel = kind === 'building' ? 'Level' : 'Amount';
        const refF = field(ctx, [...path, i, 0], kind === 'building' ? 'Building' : REF_LABELS[kind] ?? humanise(kind), pair[0], '', key, sub, kind);
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
    // Nothing to pay (fists, no armour): nothing to show.
    if (children.length === 0) return null;
    if (value.length === 1 && children[0]?.type === 'section') return { ...children[0], label };
    return { type: 'section', label, doc: docFor(ctx, key), children, open: true };
  }
  // One [building, level] pair where lists of them are usual (an engine's madeAt).
  if (pairRef === 'building' && isNumberPair(value)) {
    const refF = field(ctx, [...path, 0], 'Building', value[0], '', key, sub, 'building');
    const amt = field(ctx, [...path, 1], 'Level', value[1], 'needsBase', key, sub);
    return { type: 'section', label, doc: docFor(ctx, key), children: [{ type: 'pair', label: refName(ctx, 'building', value[0]), ref: refF, amount: amt }], open: true };
  }
  // A list of numbers: references (spawns, bands) or values by index.
  if (value.every((x) => typeof x === 'number' || typeof x === 'boolean')) {
    const ref = refFor(ctx, key) ?? REF_KEYS[`${key}:*`] ?? REF_KEYS[`${ctx.exportName}:*`];
    const byIndex = (i: number): string => (ref && !INDEXED_REFS.has(key) ? `${i + 1}` : indexLabel(ctx, key, i));
    const children = value.map((x, i) => field(ctx, [...path, i], tableLabel(ctx, [...path, i]) ?? byIndex(i), x as RawValue, ref ? '' : key, key, sub, ref));
    return { type: 'section', label, doc: docFor(ctx, key), children, open: value.length <= 12 };
  }
  // A list of records or lists.
  const children: CatNode[] = [];
  value.forEach((x, i) => {
    const itemLabel = tableLabel(ctx, [...path, i]) ?? (x && typeof x === 'object' && !Array.isArray(x) ? recordLabel(ctx, key, x as Record<string, unknown>, i) : indexLabel(ctx, key, i));
    const n = walk(ctx, x, [...path, i], key, parentKey, sub, itemLabel);
    if (n?.type === 'section') children.push({ ...n, open: key === 'levels' || value.length <= 4 });
    else if (n) children.push(n);
  });
  return children.length ? { type: 'section', label, doc: docFor(ctx, key), children, open: true } : null;
}

/** Lists of references whose positions mean something (a tool kit's tool for each job), labelled by indexLabel. */
const INDEXED_REFS: ReadonlySet<string> = new Set(['tools']);

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
    // Patch 2: one build menu, with Defences and Lights as its submenus.
    case 'BUILDINGS': return [typeof rec.group === 'string' ? `Build menu: ${rec.group}` : 'Build menu'];
    case 'RECIPES': {
      const at = (rec.at as readonly number[])[0];
      return [at !== undefined ? `At the ${r.building.get(at) ?? 'building'}` : 'Anywhere'];
    }
    case 'MOBS': return [`${r.role.get(rec.role as number) ?? 'Other'} mobs`];
    case 'SPECIES': return [`${r.nature.get(rec.nature as number) ?? 'Other'} animals`];
    case 'RESOURCES': return [`${r.resGroup.get(rec.group as number) ?? 'Other'} resources`];
    case 'PRODUCTS': return ['Training and products'];
    case 'SPELLS': {
      const names = ctx.mods['magic/spells.ts']?.SCHOOL_NAMES as readonly string[] | undefined;
      return [`${names?.[rec.school as number] ?? 'Other'} spells`];
    }
    case 'MAGE_RANKS': return ['Mage ranks'];
    case 'PEOPLE_UNITS': return [refName(ctx, 'people', rec.people as number)];
    case 'MOUNTS': return ['Mounts'];
    case 'GAITS': return ['Running, jumping and climbing'];
    case 'ENGINES': return ['Siege engines and cannons'];
    case 'SHOTS': return ['Shots and projectiles'];
    default: return KIT_MENUS[ctx.exportName] ? [KIT_MENUS[ctx.exportName]!] : [];
  }
}

function entryLabel(ctx: Ctx, rec: Record<string, unknown>, i: number): string {
  if (ctx.exportName === 'PEOPLE_UNITS' && typeof rec.id === 'number') return refName(ctx, 'peopleUnit', rec.id);
  // A kit row (Troops and gear): "Tier 4: Bronze shortsword".
  if (KIT_MENUS[ctx.exportName] && !UNTIERED_KITS.has(ctx.exportName) && typeof rec.tier === 'number' && typeof rec.name === 'string') {
    return `Tier ${rec.tier}: ${rec.name.charAt(0).toUpperCase()}${rec.name.slice(1)}`;
  }
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
  // Where each section page starts in its module, so the pages keep the module's order.
  const sectionLines = new Map<string, number>();

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

      // One entry per record: a row of an entry array, or a single record (the brawler's kit).
      const addRecord = (r: Record<string, unknown>, path: DataPath, id: string, i: number): void => {
        const ctx: Ctx = { ...base, entryId: id };
        const label = entryLabel(ctx, r, i);
        const texts: CatNode[] = [];
        const live: CatNode[] = [];
        const fixed: CatNode[] = [];
        for (const [k, v] of orderedEntries(r)) {
          const n = walk(ctx, v, [...path, k], k, name, []);
          if (!n) continue;
          if (n.type === 'text' && !(k in TEXT_KEYS)) fixed.push(n);
          else if (n.type === 'text') texts.push(n);
          else if (allReadOnly(n)) fixed.push(n);
          else live.push(n);
        }
        const children = [...texts, ...live];
        if (fixed.length) children.push({ type: 'section', label: 'Fixed details', doc: 'Identity and layout: shown for reference, not balance.', children: fixed, open: false });
        const e: Entry = { id, group, menu: entryMenu(ctx, r), label, module, path, doc, children, usedBy: [] };
        entries.set(id, e);
        byGroup.get(group)!.push(e);
      };

      if (ENTRY_ARRAYS.has(`${module}:${name}`) && Array.isArray(value)) {
        value.forEach((rec, i) => {
          if (!rec || typeof rec !== 'object') return;
          const r = rec as Record<string, unknown>;
          // "none" placeholders, empty kit tiers and retired research.
          if (r.name === '' || r.retired === true || PLACEHOLDER_ROWS.has(`${module}:${name}:${i}`)) return;
          addRecord(r, [name, i], `${module}:${name}:${i}`, i);
        });
        continue;
      }
      if (ENTRY_RECORDS.has(`${module}:${name}`) && value && typeof value === 'object' && !Array.isArray(value)) {
        addRecord(value as Record<string, unknown>, [name], `${module}:${name}`, 0);
        continue;
      }

      // Loose numbers and small tables: one entry per group and module.
      const section = SECTION_PAGES.has(module) ? declared[name]?.section : undefined;
      const rulesId = section ? `rules:${group}:${module}:${section}` : `rules:${group}:${module}`;
      let rulesEntry = rules.get(rulesId);
      const line = declared[name]?.line ?? 0;
      if (section && line < (sectionLines.get(rulesId) ?? Infinity)) sectionLines.set(rulesId, line);
      if (!rulesEntry) {
        const label = section ? SECTION_TITLES[section] ?? sectionTitle(section) : moduleTitle(module, docs, group);
        rulesEntry = { id: rulesId, group, menu: [], label, module: '', path: [rulesId], doc: docs[module]?.header ?? '', children: [], usedBy: [] };
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
  // Section pages of one module sit together, in the module's order; everything else keeps its place.
  const all = [...rules.values()];
  const home = (e: Entry): number => all.findIndex((x) => x.id.split(':').slice(0, 3).join(':') === e.id.split(':').slice(0, 3).join(':'));
  const ordered = all
    .map((e, i) => ({ e, i, h: home(e), line: sectionLines.get(e.id) ?? 0 }))
    .sort((a, b) => a.h - b.h || a.line - b.line || a.i - b.i)
    .map((x) => x.e);
  for (const e of ordered.reverse()) {
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
/** A section comment as a page title: "trade (Table 11, Table 19)" reads "Trade (Table 11, Table 19)"; "(s)" marks drop. */
function sectionTitle(section: string): string {
  const t = section.replace(/\s*\(s\)\s*/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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

/** The Forge's building kind (Patch 2: one Forge, whose metal steps come with main base levels). */
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
    } else if (f.ref === 'mob' && (via === 'guardians' || via === 'spawns' || via === 'mob')) {
      target = refEntry('mob', f.value);
      how = HOW[via]!;
    } else if (f.ref === 'tierNeed') {
      target = refEntry('tierNeed', f.value);
      how = 'is of this material tier';
    }
    if (key === 'needsBase' && f.value > 0 && bigHouse) {
      target = bigHouse;
      how = 'needs this main base level';
      detail = `level ${f.value}`;
    }
    if (key === 'forge' && f.value > 0 && forge !== undefined) {
      target = refEntry('building', forge);
      how = 'needs the Forge at this metal step first';
      detail = `step ${f.value}`;
    }
    if (!target || !how || target === from.id) continue;
    entries.get(target)?.usedBy.push({ from: from.id, where, how, detail });
  }
}
