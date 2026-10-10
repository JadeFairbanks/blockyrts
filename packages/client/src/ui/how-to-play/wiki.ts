// How to Play's whole book: the guides, then a page for every entry of the
// balance catalog (every building, unit, piece of gear, spell, recipe,
// good, creature and rule table the sim exports), filed into the player's
// sections (categories.ts), with links both ways and a search. Built from
// the sim's live modules, so it changes as the game does. One sheet per
// thing (Patch 7, sheets.ts): rows of the same name are one page, and a
// rules page about particular things goes onto their own pages.
import { buildCatalog, type Catalog, type CatNode, type Entry, type SimDocs, type SimModules } from '@blockyrts/balance';
import { articleBlocks, type Block, type Links, type Pic } from './article.ts';
import { GUIDES_SECTION, pageByTitle, searchPages, type Book, type Related, type RelatedItem } from './book.ts';
import { CATEGORIES, categoryOf, FALLBACK_CATEGORY, GROUP_HEADINGS, LEFT_OUT_GROUPS, MENU_NAMES, type Category } from './categories.ts';
import { GUIDES, type Guide } from './guides.ts';
import { plainWords } from './plain-words.ts';
import { FOLDS, KEPT_TITLES, pieceOf, splitRules, targetEntry } from './sheets.ts';

export interface Article {
  /** Its address: "guides/premise", "monsters/zombie". */
  slug: string;
  title: string;
  /** Its section's id ('guides' for a guide). */
  category: string;
  /** Its sub-heading in the sidebar ('' for none). */
  heading: string;
  entry: Entry | null;
  /** The rest of its sheet, after its own entry: its other forms and the rules about it (sheets.ts). */
  parts: Part[];
  guide: Guide | null;
  pic: Pic | null;
  /** The catalogue model the page shows ('' for none). */
  model: string;
  /** Lower-case words a search matches first: the title, sub-heading, section and the page's own words. */
  words: string;
  /** Lower-case names the page refers to (a mob's drops, a recipe's goods), matched last. */
  more: string;
}

/** A part of a sheet: another form of the thing, or the rules about it, as an entry (a rules page's share is that page with only its share). */
export interface Part {
  label: string;
  entry: Entry;
}

export interface Shelf {
  heading: string;
  articles: Article[];
}

export interface Section {
  id: string;
  label: string;
  blurb: string;
  pic: Pic | null;
  shelves: Shelf[];
  count: number;
}

/** Where pictures come from: the page passes the interface kit's; tests may pass none. */
export interface Pictures {
  entry(entry: Entry): Pic | null;
  ref(kind: string, id: number): Pic | null;
  level(entry: Entry, level: number): Pic | null;
  /** The model a page shows ('' for none); tests may leave it out. */
  model?(entry: Entry): string;
  /** A merged row's heading on its sheet (sheets.ts formName); tests may leave it out. */
  form?(entry: Entry): string;
}

export interface Wiki {
  catalog: Catalog;
  sections: Section[];
  articles: Article[];
  bySlug: ReadonlyMap<string, Article>;
  /** The page a catalog entry is on ('' for a left-out entry). */
  slugOf(entryId: string): string;
  /** A page's blocks; `seen` collects every field id it shows. */
  blocks(a: Article, seen?: Set<string>): Block[];
  /** Pages that link to this one, by how. */
  related(a: Article): Related[];
  search(query: string, limit?: number): Article[];
  /** The page with this title (any capitals), for a guide's [[links]]. */
  byTitle(title: string): Article | undefined;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function textOf(nodes: readonly CatNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) if (n.type === 'text') out.push(n.text);
  return out;
}

/** The goods a field names, with how: what a page about a good lists under "Where it comes from and goes". */
function goodHow(path: ReadonlyArray<string | number>): string {
  const keys = path.filter((p): p is string => typeof p === 'string');
  if (keys.includes('drops') || keys.includes('gear')) return 'Dropped by';
  if (keys.includes('outputs')) return 'Made by';
  if (keys.includes('inputs')) return 'Used to make';
  if (keys.includes('cost') || keys.includes('extra')) return 'Needed for';
  return 'Also on';
}
const GOOD_HOW_ORDER = ['Dropped by', 'Made by', 'Used to make', 'Needed for', 'Also on'];

const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function buildWiki(mods: SimModules, docs: SimDocs, pictures: Pictures): Wiki {
  const catalog = buildCatalog(mods, docs);
  plainWords(catalog);
  const articles: Article[] = [];
  const bySlug = new Map<string, Article>();
  const slugByEntry = new Map<string, string>();
  const add = (a: Article): void => {
    let slug = a.slug;
    for (let n = 2; bySlug.has(slug); n++) slug = `${a.slug}-${n}`;
    a.slug = slug;
    articles.push(a);
    bySlug.set(slug, a);
    if (a.entry) slugByEntry.set(a.entry.id, slug);
  };

  // ---- Guides ----
  const guideShelf: Article[] = [];
  for (const g of GUIDES) {
    const a: Article = {
      slug: `${GUIDES_SECTION}/${g.id}`,
      title: g.title,
      category: GUIDES_SECTION,
      heading: '',
      entry: null,
      parts: [],
      guide: g,
      pic: { file: g.picture },
      model: '',
      words: [g.title, g.summary, ...g.parts.flatMap((p) => [p.heading ?? '', ...p.paragraphs, ...(p.bullets ?? [])])].join(' ').toLowerCase(),
      more: '',
    };
    add(a);
    guideShelf.push(a);
  }
  const sections: Section[] = [
    { id: GUIDES_SECTION, label: 'Guides', blurb: 'The premise and how to play.', pic: { file: 'portrait_worker_labourer' }, shelves: [{ heading: '', articles: guideShelf }], count: guideShelf.length },
  ];

  // ---- A page for every catalog entry, filed by section ----
  const groupLabel = new Map(catalog.groups.map((g) => [g.id, g.label]));
  const byCategory = new Map<string, Array<{ group: string; entry: Entry }>>();
  for (const g of catalog.groups) {
    if (LEFT_OUT_GROUPS.has(g.id)) continue;
    const cat = categoryOf(g.id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    for (const e of g.entries) byCategory.get(cat)!.push({ group: g.id, entry: e });
  }
  // ---- Rules pages split up: their things' rules go to those things' sheets (sheets.ts) ----
  const kept = new Map<string, Entry | null>();
  const moving: Array<{ label: string; to: string[]; entry: Entry }> = [];
  for (const g of catalog.groups) {
    if (LEFT_OUT_GROUPS.has(g.id)) continue;
    for (const e of g.entries) {
      if (!e.id.startsWith('rules:')) continue;
      const split = splitRules(e);
      if (split.moved.size === 0) continue;
      const stay = [...split.kept];
      for (const [i, nodes] of split.moved) {
        const fold = FOLDS[i]!;
        const to = fold.to.map((t) => targetEntry(catalog, t)).filter((id): id is string => !!id);
        // A rule whose sheet is not in the game (yet) stays on its rules page.
        if (to.length === 0) stay.push(...nodes);
        else moving.push({ label: fold.label, to, entry: { ...e, children: nodes } });
      }
      kept.set(e.id, stay.length ? { ...e, label: KEPT_TITLES[e.id] ?? e.label, children: stay } : null);
    }
  }
  const gone = new Map<string, string>();
  const pieces: Array<{ label: string; host: string; entry: Entry }> = [];

  const categories: Category[] = [...CATEGORIES];
  for (const c of categories) {
    const list = byCategory.get(c.id) ?? [];
    if (list.length === 0) continue;
    // A section's groups in its own order; groups only "More numbers" knows come after its own.
    const rank = (g: string): number => (c.groups.includes(g) ? c.groups.indexOf(g) : c.groups.length);
    list.sort((a, b) => rank(a.group) - rank(b.group));
    const shelves = new Map<string, Article[]>();
    const byTitle = new Map<string, Article>();
    let count = 0;
    for (const { group, entry: own } of list) {
      // A rules page with nothing left on it is no page (its rules are on their things' sheets).
      const entry = kept.has(own.id) ? kept.get(own.id) : own;
      if (!entry) {
        gone.set(own.id, moving.find((m) => m.entry.id === own.id)?.to[0] ?? '');
        continue;
      }
      // A row that is another side of a thing with its own page goes on that page (Patch 7).
      const piece = pieceOf(entry, mods);
      const host = piece && targetEntry(catalog, piece.to);
      if (piece && host) {
        pieces.push({ label: piece.label, host, entry });
        continue;
      }
      // A second row of the same name is another form of the first: one sheet (Patch 7).
      const same = byTitle.get(entry.label.toLowerCase());
      if (same && !entry.id.startsWith('rules:')) {
        same.parts.push({ label: pictures.form?.(entry) ?? 'Another kind', entry });
        same.words += ` ${textOf(entry.children).join(' ').toLowerCase()}`;
        slugByEntry.set(entry.id, same.slug);
        continue;
      }
      const menu = entry.menu.join(': ');
      const heading =
        c.id === FALLBACK_CATEGORY && !c.groups.includes(group)
          ? groupLabel.get(group) ?? ''
          : menu
            ? MENU_NAMES[menu] ?? menu
            : c.groups.length > 1
              ? GROUP_HEADINGS[group] ?? groupLabel.get(group) ?? ''
              : '';
      const texts = textOf(entry.children);
      const pic = pictures.entry(entry);
      const a: Article = {
        slug: `${c.id}/${slugify(entry.label)}`,
        title: entry.label,
        category: c.id,
        heading,
        entry,
        parts: [],
        guide: null,
        pic,
        model: pictures.model?.(entry) ?? '',
        words: [entry.label, heading, c.label, ...texts].join(' ').toLowerCase(),
        more: '',
      };
      add(a);
      count++;
      if (!entry.id.startsWith('rules:')) byTitle.set(entry.label.toLowerCase(), a);
      if (!shelves.has(heading)) shelves.set(heading, []);
      shelves.get(heading)!.push(a);
    }
    if (count === 0) continue;
    // Rules pages after the things themselves.
    const ordered = [...shelves].sort(([a], [b]) => Number(a === 'Rules') - Number(b === 'Rules'));
    sections.push({
      id: c.id,
      label: c.label,
      blurb: c.blurb,
      pic: { file: c.picture },
      shelves: ordered.map(([heading, list]) => ({ heading, articles: list })),
      count,
    });
  }

  // ---- The rules about a thing, on its sheet: parts of one heading are one part ----
  for (const m of moving) {
    for (const target of m.to) {
      const host = bySlug.get(slugByEntry.get(target) ?? '');
      if (!host) continue;
      const part = host.parts.find((p) => p.label === m.label && p.entry.id.startsWith('rules:'));
      if (part) part.entry = { ...part.entry, children: [...part.entry.children, ...m.entry.children] };
      else host.parts.push({ label: m.label, entry: m.entry });
      host.words += ` ${m.label.toLowerCase()}`;
    }
  }
  for (const p of pieces) {
    const host = bySlug.get(slugByEntry.get(p.host) ?? '');
    if (!host) continue;
    host.parts.push({ label: p.label, entry: p.entry });
    host.words += ` ${textOf(p.entry.children).join(' ').toLowerCase()}`;
    slugByEntry.set(p.entry.id, host.slug);
  }
  for (const [id, target] of gone) slugByEntry.set(id, slugByEntry.get(target) ?? '');
  for (const a of articles) for (const p of a.parts) if (p.entry.id.startsWith('rules:')) p.entry = { ...p.entry, children: opened(p.entry.children) };

  const slugOf = (entryId: string): string => slugByEntry.get(entryId) ?? '';
  const links: Links = { page: slugOf, refPic: (k, id) => pictures.ref(k, id), levelPic: (e, l) => pictures.level(e, l) };

  // ---- Links both ways: the catalog's own (needs, made at, spawns) and every good's uses ----
  const related = new Map<string, Map<string, RelatedItem[]>>();
  const relate = (target: string, how: string, item: RelatedItem): void => {
    if (!target || target === item.slug) return;
    if (!related.has(target)) related.set(target, new Map());
    const byHow = related.get(target)!;
    if (!byHow.has(how)) byHow.set(how, []);
    const list = byHow.get(how)!;
    if (!list.some((x) => x.slug === item.slug && x.detail === item.detail)) list.push(item);
  };
  for (const a of articles) {
    for (const e of a.entry ? [a.entry, ...a.parts.map((p) => p.entry)] : []) for (const u of e.usedBy) {
      const from = slugOf(u.from);
      const fromArticle = bySlug.get(from);
      if (!fromArticle) continue;
      relate(a.slug, sentence(u.how), { title: fromArticle.title, slug: from, detail: [u.where, u.detail].filter(Boolean).join(', ') });
    }
  }
  const names: string[][] = articles.map(() => []);
  for (const f of catalog.fields.values()) {
    if (f.ref !== 'res' || typeof f.value !== 'number') continue;
    const from = slugOf(f.entryId);
    const fromArticle = bySlug.get(from);
    if (!fromArticle || fromArticle.entry?.path[0] === 'RESOURCES') continue;
    const target = catalog.refEntry('res', f.value);
    const good = target ? bySlug.get(slugOf(target)) : undefined;
    if (!good) continue;
    relate(good.slug, goodHow(f.path), { title: fromArticle.title, slug: from, detail: '' });
    names[articles.indexOf(fromArticle)]!.push(good.title.toLowerCase());
  }
  articles.forEach((a, i) => (a.more = names[i]!.join(' ')));

  const relatedOf = (a: Article): Related[] => {
    const byHow = related.get(a.slug);
    if (!byHow) return [];
    const order = (h: string): number => {
      const i = GOOD_HOW_ORDER.indexOf(h);
      return i < 0 ? -1 : i;
    };
    return [...byHow].sort(([x], [y]) => order(x) - order(y)).map(([how, items]) => ({ how, items }));
  };

  const search = (query: string, limit?: number): Article[] => searchPages(articles, query, limit);
  const byTitle = (title: string): Article | undefined => pageByTitle(articles, title);

  return {
    catalog,
    sections,
    articles,
    bySlug,
    slugOf,
    blocks: (a, seen) => sheetBlocks(a, catalog, links, seen),
    related: relatedOf,
    search,
    byTitle,
  };
}

/**
 * A sheet's share of a rules page, laid open: one section alone is its
 * part (the Necromancer's numbers under "Summoning and drops", not under
 * "Necromancer" again); several keep their names, open (the Void witch's
 * Hex and Blink).
 */
function opened(nodes: readonly CatNode[]): CatNode[] {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  if (only?.type === 'section') return only.children;
  return nodes.map((n) => (n.type === 'section' ? { ...n, open: true } : n));
}

/** A sheet's blocks: its own entry's, then each part under its heading. */
function sheetBlocks(a: Article, catalog: Catalog, links: Links, seen?: Set<string>): Block[] {
  if (!a.entry) return [];
  const blocks = articleBlocks(a.entry, catalog, links, seen);
  for (const p of a.parts) blocks.push({ kind: 'group', label: p.label, pic: null, folded: false, blocks: articleBlocks(p.entry, catalog, links, seen) });
  return blocks;
}

/** The book as plain data for the page: every page's blocks and links worked out. */
export function bookOf(w: Wiki): Book {
  return {
    sections: w.sections.map((s) => ({ id: s.id, label: s.label, blurb: s.blurb, pic: s.pic, count: s.count, shelves: s.shelves.map((sh) => ({ heading: sh.heading, slugs: sh.articles.map((a) => a.slug) })) })),
    articles: w.articles.map((a) => ({
      slug: a.slug, title: a.title, category: a.category, heading: a.heading, pic: a.pic, model: a.model, words: a.words, more: a.more,
      guide: a.guide, blocks: w.blocks(a), related: w.related(a),
    })),
  };
}
