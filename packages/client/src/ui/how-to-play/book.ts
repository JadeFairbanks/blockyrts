// How to Play's book as plain data: what its worker (book.worker.ts) sends
// the page once it has read the sim's tables, and the search over it. No
// sim code here, so the page and the menu stay light.
import type { Block, Pic } from './article.ts';
import type { Guide } from './guides.ts';

/**
 * How a guide's picture names a model of the game's catalogue instead of a
 * file: "model:trilithon_intact" shows that model live on the page
 * (model-view.ts), as a page about a thing shows its own.
 *
 * Pictures in How to Play (Jade's Patch 7): a thing the game draws shows
 * its model, live: its idle animation, the whole body, turned round by
 * dragging. A thing that is 2D in the game too (an icon, a map mark) keeps
 * that picture. A portrait is a still of a model, so its model shows in its
 * place. Nothing gets a picture made for it, and How to Play shows no
 * screenshots of the game: they are kept only for the patch notes
 * (picture-url.ts). When an update adds a thing, its page shows its model
 * with no work for the page.
 */
export const MODEL_PICTURE = 'model:';

/** A portrait's model where it is not named for it (the kit's portraits are stills of the models: hud/unit-icons.ts). */
const PORTRAIT_MODELS: Readonly<Record<string, string>> = {
  worker_labourer: 'worker',
  warrior_sword: 'warrior',
  warrior_mounted: 'horse',
  mage_battle: 'mage_battle_1',
  mage_support: 'mage_support_1',
};

/** The model a picture stands for: a guide's MODEL_PICTURE, or a portrait's model; '' for an icon or a map mark. */
export function modelOfPic(p: Pic | null): string {
  const f = p?.file ?? '';
  if (f.startsWith(MODEL_PICTURE)) return f.slice(MODEL_PICTURE.length);
  if (!f.startsWith('portrait_')) return '';
  const bare = f.slice('portrait_'.length);
  return PORTRAIT_MODELS[bare] ?? bare;
}

export interface RelatedItem {
  title: string;
  slug: string;
  detail: string;
}

export interface Related {
  how: string;
  items: RelatedItem[];
}

export interface BookArticle {
  /** Its address: "guides/premise", "monsters/zombie". */
  slug: string;
  title: string;
  /** Its section's id ('guides' for a guide). */
  category: string;
  /** Its sub-heading in the sidebar ('' for none). */
  heading: string;
  pic: Pic | null;
  /** The catalogue model the page shows live ('' for none: its picture, or a portrait's model). */
  model: string;
  /** Lower-case words a search matches first: the title, sub-heading, section and the page's own words. */
  words: string;
  /** Lower-case names the page refers to (a mob's drops, a recipe's goods), matched last. */
  more: string;
  guide: Guide | null;
  blocks: Block[];
  related: Related[];
}

export interface BookSection {
  id: string;
  label: string;
  blurb: string;
  pic: Pic | null;
  count: number;
  shelves: Array<{ heading: string; slugs: string[] }>;
}

export interface Book {
  sections: BookSection[];
  articles: BookArticle[];
}

export const GUIDES_SECTION = 'guides';
export const SEARCH_LIMIT = 60;

/** What a search reads of a page. */
export interface Searchable {
  title: string;
  category: string;
  words: string;
  more: string;
}

/** Pages matching every word typed: titles first, then the pages' own words, then the names they refer to. */
export function searchPages<T extends Searchable>(pages: readonly T[], query: string, limit = SEARCH_LIMIT): T[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const tokens = q.split(' ');
  const scored: Array<{ p: T; score: number; i: number }> = [];
  pages.forEach((p, i) => {
    const title = p.title.toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (tokens.every((t) => title.includes(t))) score = 50;
    else if (tokens.every((t) => p.words.includes(t))) score = 20;
    else if (tokens.every((t) => p.words.includes(t) || p.more.includes(t))) score = 5;
    if (score > 0) scored.push({ p, score: score + (p.category === GUIDES_SECTION ? 1 : 0), i });
  });
  return scored
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, limit)
    .map((s) => s.p);
}

/** The page with this title (any capitals), for a guide's [[links]]. */
export function pageByTitle<T extends { title: string }>(pages: readonly T[], title: string): T | undefined {
  const t = title.trim().toLowerCase();
  return pages.find((p) => p.title.toLowerCase() === t);
}
