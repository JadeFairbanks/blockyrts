// How to Play's book as plain data: what its worker (book.worker.ts) sends
// the page once it has read the sim's tables, and the search over it. No
// sim code here, so the page and the menu stay light.
import type { Block, Pic } from './article.ts';
import type { Guide } from './guides.ts';

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
