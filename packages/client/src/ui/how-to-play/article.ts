// One How to Play page's contents, worked out from a balance catalog entry:
// its words first, its headline numbers as tiles, then every other number
// in readable rows, costs as picture chips, rows of like things as tables,
// and the numbers at zero gathered on one line so they don't crowd the
// rest. Pure (no page, no pictures' files), so tests can check that every
// number the sim exports lands on a page.
import { toDisplay, UNITS, type Catalog, type CatNode, type Entry, type FieldNode, type UnitId } from '@blockyrts/balance';

type PairNode = Extract<CatNode, { type: 'pair' }>;
type SectionNode = Extract<CatNode, { type: 'section' }>;

/** A picture: an interface-kit file and the tint it takes. */
export interface Pic {
  file: string;
  filter?: string;
}

/** One number or name on a page. */
export interface Fact {
  /** The catalog field's id ('' for a made-up line). */
  id: string;
  label: string;
  value: string;
  /** What the unit means, for a tooltip ('' for none). */
  hint: string;
  /** The page a name opens ('' for none). */
  link: string;
  pic: Pic | null;
}

export interface TableRow {
  label: string;
  cells: Array<Fact | null>;
}

export type Block =
  | { kind: 'text'; label: string; text: string }
  | { kind: 'tiles'; facts: Fact[] }
  | { kind: 'facts'; facts: Fact[] }
  /** Things with amounts (a cost, a recipe's results) or a plain list of names (traits, bands): `value` is the amount or ''. */
  | { kind: 'chips'; label: string; items: Fact[] }
  | { kind: 'table'; label: string; columns: string[]; rows: TableRow[] }
  | { kind: 'group'; label: string; pic: Pic | null; blocks: Block[]; folded: boolean }
  /** Numbers at zero (or none) and switches that are off, by label. */
  | { kind: 'zero'; zero: string[]; no: string[] };

/** What a page needs from outside: where references lead and their pictures. */
export interface Links {
  /** The page a catalog entry is on ('' for none). */
  page(entryId: string): string;
  /** The picture for a reference (a good, a mob...), or null. */
  refPic(kind: string, id: number): Pic | null;
  /** The picture for one level of a building page (1 = its first), or null. */
  levelPic(entry: Entry, level: number): Pic | null;
}

/** Headline numbers shown as tiles at the top of a page, in this order (at most six). */
export const TILE_LABELS: readonly string[] = [
  'Health', 'Damage', 'Healing or damage', 'Armour', 'Running speed', 'Speed', 'Walking speed', 'Walk speed', 'Range', 'Reach',
  'Time between attacks', 'Swing time', 'Attack time', 'Reload', 'Mana', 'Cooldown', 'Time', 'Time to make', 'Build work',
  'Crew needed', 'Supply given', 'Weight', 'Nutrition',
];
const MAX_TILES = 6;

/** Read-only details that only identify a row to the code, left off the pages. */
const HIDDEN_DETAILS: ReadonlySet<string> = new Set(['Id', 'Kind', 'Clip', 'Icon', 'Model', 'Slot', 'Live', 'School']);

/** Units shown in words where the catalog's short mark would puzzle a player. */
const SUFFIXES: Partial<Record<UnitId, string>> = { workerSeconds: 'worker-seconds', damage: '', vpTenths: '' };

const NONE_NAMES: ReadonlySet<string> = new Set(['', 'none', 'nothing']);

/** A number as a page shows it: "1,200 worker-seconds", "1.6 s", "25%". */
export function showNumber(raw: number, unit: UnitId): string {
  const n = Number(toDisplay(raw, unit));
  const text = n.toLocaleString('en', { maximumFractionDigits: 3 });
  const suffix = SUFFIXES[unit] ?? UNITS[unit].suffix;
  if (!suffix) return text;
  return suffix === '%' || suffix === '‰' ? `${text}${suffix}` : `${text} ${suffix}`;
}

/** What a unit means, without how the code stores it. */
export function unitHint(unit: UnitId): string {
  return UNITS[unit].hint.replace(/\s*\((held|the sim|whole seconds)[^)]*\)/g, '').trim();
}

function refName(cat: Catalog, f: FieldNode): string {
  return cat.refNames[f.ref!]?.get(f.value as number) ?? String(f.value);
}

function isZero(cat: Catalog, f: FieldNode): boolean {
  if (f.ref) return NONE_NAMES.has(refName(cat, f).toLowerCase());
  return f.value === 0 || f.value === false;
}

function refLink(cat: Catalog, links: Links, f: FieldNode): string {
  if (!f.ref || typeof f.value !== 'number') return '';
  const target = cat.refEntry(f.ref, f.value);
  return target ? links.page(target) : '';
}

interface Ctx {
  cat: Catalog;
  links: Links;
  entry: Entry;
  /** Every field id that reached the page. */
  seen: Set<string>;
}

function fact(ctx: Ctx, f: FieldNode, label = f.label): Fact {
  ctx.seen.add(f.id);
  const value = f.ref ? refName(ctx.cat, f) : typeof f.value === 'boolean' ? (f.value ? 'Yes' : 'No') : showNumber(f.value, f.unit);
  return {
    id: f.id,
    label,
    value,
    hint: f.ref ? '' : unitHint(f.unit),
    link: refLink(ctx.cat, ctx.links, f),
    pic: f.ref && typeof f.value === 'number' ? ctx.links.refPic(f.ref, f.value) : null,
  };
}

function pairFact(ctx: Ctx, p: PairNode): Fact {
  ctx.seen.add(p.amount.id);
  const ref = fact(ctx, p.ref);
  const amount = typeof p.amount.value === 'number' ? showNumber(p.amount.value, p.amount.unit) : String(p.amount.value);
  return { ...ref, id: p.amount.id, label: ref.value, value: amount };
}

/** A list of references by position ("1: Heartland"): shown as named chips. */
function isRefList(s: SectionNode): boolean {
  return s.children.length > 0 && s.children.every((c) => c.type === 'field' && !!c.ref && /^\d+$/.test(c.label));
}

/** Rows of like things (a mob's drops): sections holding only plain numbers, few enough for a table. */
function tableOf(ctx: Ctx, s: SectionNode): Block | null {
  const rows = s.children;
  if (rows.length < 2 || !rows.every((r) => r.type === 'section' && r.children.length > 0 && r.children.every((c) => c.type === 'field'))) return null;
  const columns: string[] = [];
  for (const r of rows as SectionNode[]) for (const c of r.children as FieldNode[]) if (!columns.includes(c.label)) columns.push(c.label);
  if (columns.length > 6) return null;
  const body: TableRow[] = (rows as SectionNode[]).map((r) => ({
    label: r.label,
    cells: columns.map((col) => {
      const f = (r.children as FieldNode[]).find((c) => c.label === col);
      return f ? fact(ctx, f) : null;
    }),
  }));
  // A column that only repeats each row's own name (a drop's "Resource") says nothing new.
  const keep = columns.map((_, i) => !body.every((row) => row.cells[i] === null || row.cells[i]!.value === row.label));
  return {
    kind: 'table',
    label: s.label,
    columns: columns.filter((_, i) => keep[i]),
    rows: body.map((row) => ({ label: row.label, cells: row.cells.filter((_, i) => keep[i]) })),
  };
}

function sectionBlock(ctx: Ctx, s: SectionNode, levelIndex = -1): Block {
  if (s.label === 'Fixed details') {
    const kept = s.children.filter((c) => !(c.label && HIDDEN_DETAILS.has(c.label)));
    return { kind: 'group', label: 'More details', pic: null, blocks: blocksOf(ctx, kept, true), folded: true };
  }
  if (s.children.length > 0 && s.children.every((c) => c.type === 'pair')) {
    return { kind: 'chips', label: s.label, items: (s.children as PairNode[]).map((p) => pairFact(ctx, p)) };
  }
  if (isRefList(s)) {
    return { kind: 'chips', label: s.label, items: (s.children as FieldNode[]).map((f) => ({ ...fact(ctx, f), label: refName(ctx.cat, f), value: '' })) };
  }
  const table = tableOf(ctx, s);
  if (table) return table;
  const levels = s.label === 'Levels';
  const blocks: Block[] = [];
  const loose: CatNode[] = [];
  s.children.forEach((c, i) => {
    if (levels && c.type === 'section') {
      if (loose.length) blocks.push(...blocksOf(ctx, loose.splice(0), false));
      blocks.push(sectionBlock(ctx, c, i + 1));
    } else loose.push(c);
  });
  if (loose.length) blocks.push(...blocksOf(ctx, loose, false));
  const pic = levelIndex > 0 ? ctx.links.levelPic(ctx.entry, levelIndex) : null;
  return { kind: 'group', label: s.label, pic, blocks, folded: !s.open };
}

/** A run of nodes as blocks: plain numbers gathered into rows, the zeros onto one line at the end. */
function blocksOf(ctx: Ctx, nodes: readonly CatNode[], details: boolean, skip: ReadonlySet<string> = new Set()): Block[] {
  const out: Block[] = [];
  const facts: Fact[] = [];
  const zero: string[] = [];
  const no: string[] = [];
  const flush = (): void => {
    if (facts.length) out.push({ kind: 'facts', facts: facts.splice(0) });
  };
  for (const n of nodes) {
    if (n.type === 'text') {
      flush();
      out.push({ kind: 'text', label: n.label, text: n.text });
    } else if (n.type === 'field') {
      if (skip.has(n.id)) continue;
      if (!details && isZero(ctx.cat, n)) {
        ctx.seen.add(n.id);
        (n.value === false ? no : zero).push(n.label);
      } else facts.push(fact(ctx, n));
    } else if (n.type === 'pair') facts.push(pairFact(ctx, n));
    else {
      flush();
      out.push(sectionBlock(ctx, n));
    }
  }
  flush();
  if (zero.length || no.length) out.push({ kind: 'zero', zero, no });
  return out;
}

/** A page's blocks for a catalog entry. `seen` collects the ids of every field shown. */
export function articleBlocks(entry: Entry, cat: Catalog, links: Links, seen: Set<string> = new Set()): Block[] {
  const ctx: Ctx = { cat, links, entry, seen };
  const texts = entry.children.filter((c) => c.type === 'text');
  const tiles: Fact[] = [];
  const skip = new Set<string>();
  for (const label of TILE_LABELS) {
    if (tiles.length >= MAX_TILES) break;
    const f = entry.children.find((c): c is FieldNode => c.type === 'field' && c.label === label && !isZero(cat, c) && !skip.has(c.id));
    if (!f) continue;
    tiles.push(fact(ctx, f));
    skip.add(f.id);
  }
  const blocks: Block[] = blocksOf(ctx, texts, false);
  if (tiles.length) blocks.push({ kind: 'tiles', facts: tiles });
  blocks.push(...blocksOf(ctx, entry.children.filter((c) => c.type !== 'text'), false, skip));
  return blocks;
}
