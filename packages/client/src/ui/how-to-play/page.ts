// The How to Play screen, opened from the main menu: a searchable sidebar
// of every page, a front page of guides and sections, section pages of
// pictures, and the pages themselves. Every number comes from the game's
// own data: How to Play's worker reads the sim's tables and sends the
// whole book (book.worker.ts), so the pages change when the balance does.
// Its address follows the page (#how-to-play/monsters/zombie), so the
// browser's Back button and shared links work; Return goes back to the menu.
import '../book.css';
import { bookFromHash, HOW_TO_PLAY_HASH } from '../book-links.ts';
import { button, el } from '../dom.ts';
import type { Block, Fact, Pic } from './article.ts';
import { GUIDES_SECTION, MODEL_PICTURE, pageByTitle, searchPages, SEARCH_LIMIT, type Book, type BookArticle, type BookSection } from './book.ts';
import type { ModelLibrary } from '../../models/index.ts';
import { pictureUrl } from './picture-url.ts';

/** The book, with its pages by address and title. */
interface Reader {
  sections: BookSection[];
  articles: BookArticle[];
  bySlug: ReadonlyMap<string, BookArticle>;
  byTitle(title: string): BookArticle | undefined;
  search(query: string): BookArticle[];
  shelf(slugs: readonly string[]): BookArticle[];
}

let loading: Promise<Reader> | null = null;

/** The book from How to Play's worker, read once per visit to the site. */
function loadBook(): Promise<Reader> {
  loading ??= new Promise<Book>((resolve, reject) => {
    const worker = new Worker(new URL('./book.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Book>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'How to Play could not read the game data.'));
    };
  }).then((book) => {
    const bySlug = new Map(book.articles.map((a) => [a.slug, a]));
    return {
      sections: book.sections,
      articles: book.articles,
      bySlug,
      byTitle: (t) => pageByTitle(book.articles, t),
      search: (q) => searchPages(book.articles, q),
      shelf: (slugs) => slugs.map((s) => bySlug.get(s)).filter((a): a is BookArticle => !!a),
    };
  });
  loading.catch(() => (loading = null));
  return loading;
}

function picture(p: Pic | null, cls: string, parent: HTMLElement): HTMLImageElement | null {
  const url = p ? pictureUrl(p.file) : '';
  if (!url) return null;
  // A screenshot is drawn smooth; the kit's pixel art stays sharp.
  const img = el('img', `pic ${cls}${p?.file.startsWith('shot_') ? ' photo' : ''}`, undefined, parent);
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
  if (p?.filter) img.style.filter = p.filter;
  return img;
}

/** The library of the game's models the menu is loading, for the pages that draw a model; null when there is none. */
let models: Promise<ModelLibrary | null> | null = null;
let drewModels = false;

/** A page's model drawn once (model-view.ts), for a page with no kit picture. */
function modelPicture(id: string, parent: HTMLElement, cls = 'big'): void {
  const library = models;
  if (!library) return;
  const img = el('img', `pic ${cls} model`, undefined, parent);
  img.alt = '';
  img.hidden = true;
  drewModels = true;
  void Promise.all([library, import('./model-view.ts')]).then(async ([lib, view]) => {
    const url = lib ? await view.modelPicture(lib, id) : '';
    if (url) {
      img.src = url;
      img.hidden = false;
    } else img.remove();
  });
}

/** A guide's picture: a screenshot or kit picture by file name, or a model by MODEL_PICTURE and its id. */
function guidePicture(file: string, cls: string, parent: HTMLElement): void {
  if (file.startsWith(MODEL_PICTURE)) modelPicture(file.slice(MODEL_PICTURE.length), parent, cls);
  else picture({ file }, cls, parent);
}

const href = (slug: string): string => `${HOW_TO_PLAY_HASH}${slug ? `/${slug}` : ''}`;

function link(text: string, slug: string, parent: HTMLElement, cls = ''): HTMLElement {
  if (!slug) return el('span', cls, text, parent);
  const a = el('a', cls, text, parent);
  a.href = href(slug);
  return a;
}

/** A guide's paragraph with its [[links]] made into links. */
function richText(w: Reader, text: string, parent: HTMLElement): void {
  const parts = text.split(/(\[\[[^\]]+\]\])/);
  for (const part of parts) {
    const m = /^\[\[([^\]]+)\]\]$/.exec(part);
    if (!m) {
      parent.append(part);
      continue;
    }
    const target = w.byTitle(m[1]!);
    link(m[1]!, target?.slug ?? '', parent, 'inline');
  }
}

/** Opens How to Play over the main menu; resolves when the player goes back to the menu. `library` is the game's models, for the pages that draw one. */
export async function howToPlay(app: HTMLElement, start = '', library: Promise<ModelLibrary | null> | null = null): Promise<void> {
  models = library;
  const wait = el('div', 'book book-wait', undefined, app);
  el('p', '', 'Opening How to Play…', wait);
  let w: Reader;
  try {
    w = await loadBook();
  } finally {
    wait.remove();
  }
  const root = el('div', 'book', undefined, app);
  root.dataset.book = 'how-to-play';
  const top = el('header', 'book-top', undefined, root);
  const home = el('a', 'book-title', 'How to Play', top);
  home.href = href('');
  const searchBox = el('label', 'book-search', undefined, top);
  const search = el('input', '', undefined, searchBox);
  search.type = 'search';
  search.placeholder = `Search ${w.articles.length} pages`;
  search.setAttribute('aria-label', 'Search How to Play');
  search.spellcheck = false;
  const body = el('div', 'book-body', undefined, root);
  const side = el('nav', 'book-side', undefined, body);
  const main = el('main', 'book-main', undefined, body);

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('hashchange', onHash);
      root.remove();
      if (drewModels) void import('./model-view.ts').then((m) => m.closeModelViews());
      if (location.hash.startsWith(HOW_TO_PLAY_HASH)) history.replaceState(null, '', `${location.pathname}${location.search}`);
      resolve();
    };
    const back = button(top, 'Return to main menu', close, 'book-back');
    back.title = 'Back to the main menu';

    // ---- The sidebar: every section, or the search's results ----
    const sideLinks = new Map<string, HTMLElement>();
    const drawSide = (): void => {
      side.replaceChildren();
      sideLinks.clear();
      const q = search.value;
      if (q.trim()) {
        const found = w.search(q);
        el('div', 'side-head', found.length ? `${found.length === SEARCH_LIMIT ? `First ${SEARCH_LIMIT}` : found.length} found` : 'Nothing found', side);
        const list = el('div', 'side-list', undefined, side);
        for (const a of found) {
          const row = el('a', 'side-link', undefined, list);
          row.href = href(a.slug);
          picture(a.pic, 'tiny', row);
          el('span', '', a.title, row);
          el('small', '', sectionLabel(a), row);
          sideLinks.set(a.slug, row);
        }
        return;
      }
      for (const s of w.sections) {
        const d = el('details', 'side-section', undefined, side);
        d.dataset.section = s.id;
        const sum = el('summary', '', undefined, d);
        picture(s.pic, 'tiny', sum);
        el('span', '', s.label, sum);
        el('small', '', String(s.count), sum);
        for (const shelf of s.shelves) {
          if (shelf.heading) el('div', 'side-shelf', shelf.heading, d);
          for (const a of w.shelf(shelf.slugs)) {
            const row = el('a', 'side-link', undefined, d);
            row.href = href(a.slug);
            picture(a.pic, 'tiny', row);
            el('span', '', a.title, row);
            sideLinks.set(a.slug, row);
          }
        }
      }
    };
    const sectionLabel = (a: BookArticle): string => w.sections.find((s) => s.id === a.category)?.label ?? '';
    const markSide = (slug: string): void => {
      for (const [s, row] of sideLinks) row.classList.toggle('on', s === slug);
      const row = sideLinks.get(slug);
      if (!row) return;
      const d = row.closest('details');
      if (d) d.open = true;
      row.scrollIntoView({ block: 'nearest' });
    };
    search.addEventListener('input', () => {
      drawSide();
      markSide(current);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = w.search(search.value)[0];
        if (first) location.hash = href(first.slug);
      } else if (e.key === 'Escape') {
        search.value = '';
        drawSide();
        markSide(current);
      }
    });

    // ---- The main column ----
    let current = '';
    const show = (slug: string): void => {
      current = slug;
      main.replaceChildren();
      main.scrollTop = 0;
      const page = el('article', 'book-page', undefined, main);
      if (slug === '') frontPage(w, page);
      else if (slug.startsWith('section/')) {
        const s = w.sections.find((x) => x.id === slug.slice('section/'.length));
        if (s) sectionPage(w, s, page);
        else notFound(page);
      } else {
        const a = w.bySlug.get(slug);
        if (!a) notFound(page);
        else if (a.guide) guidePage(w, a, page);
        else articlePage(w, a, page);
      }
      markSide(slug);
    };
    const onHash = (): void => {
      const at = bookFromHash(location.hash);
      if (at?.book !== 'how-to-play') return close();
      show(at.slug);
    };
    window.addEventListener('hashchange', onHash);

    drawSide();
    if (location.hash !== href(start)) location.hash = href(start);
    else onHash();
    search.focus({ preventScroll: true });
  });
}

function notFound(page: HTMLElement): void {
  el('h1', '', 'Page not found', page);
  const p = el('p', 'lead', 'This page has moved or no longer exists. ', page);
  frontLink('Back to the front page', p);
}

/** A link to How to Play's front page. */
function frontLink(text: string, parent: HTMLElement): void {
  const a = el('a', 'inline', text, parent);
  a.href = href('');
}

/** Whether a picture is a screenshot of the game (shown wide) rather than a kit picture. */
const isShot = (file: string | undefined): boolean => !!file?.startsWith('shot_');

function frontPage(w: Reader, page: HTMLElement): void {
  const hero = el('div', 'hero', undefined, page);
  const url = pictureUrl('shot_citadel');
  if (url) hero.style.backgroundImage = `url("${url}")`;
  el('h1', '', 'How to Play', hero);
  const premise = w.articles.find((a) => a.guide)?.guide;
  if (premise) el('p', 'lead', premise.parts[0]?.paragraphs[0]?.replace(/\[\[([^\]]+)\]\]/g, '$1') ?? '', hero);

  el('h2', '', 'Guides', page);
  const guides = el('div', 'cards wide', undefined, page);
  const guideSection = w.sections.find((s) => s.id === GUIDES_SECTION);
  for (const a of w.shelf(guideSection?.shelves[0]?.slugs ?? [])) {
    const card = el('a', 'card guide-card', undefined, guides);
    card.href = href(a.slug);
    guidePicture(a.pic?.file ?? '', isShot(a.pic?.file) ? 'scene' : 'icon', card);
    el('strong', '', a.title, card);
    el('span', '', a.guide?.summary ?? '', card);
  }

  el('h2', '', 'Everything in the game', page);
  el('p', 'note-line', 'Every page below is made from the game itself, so its numbers are always the ones you play with.', page);
  const cards = el('div', 'cards', undefined, page);
  for (const s of w.sections) {
    if (s.id === GUIDES_SECTION) continue;
    const card = el('a', 'card', undefined, cards);
    card.href = href(`section/${s.id}`);
    picture(s.pic, 'icon', card);
    el('strong', '', s.label, card);
    el('span', '', s.blurb, card);
    el('small', '', `${s.count} page${s.count === 1 ? '' : 's'}`, card);
  }
}

function sectionPage(w: Reader, s: BookSection, page: HTMLElement): void {
  const head = el('div', 'page-head', undefined, page);
  picture(s.pic, 'big', head);
  const t = el('div', '', undefined, head);
  el('h1', '', s.label, t);
  el('p', 'lead', s.blurb, t);
  for (const shelf of s.shelves) {
    if (shelf.heading) el('h2', '', shelf.heading, page);
    const grid = el('div', 'cards small', undefined, page);
    for (const a of w.shelf(shelf.slugs)) {
      const card = el('a', 'card', undefined, grid);
      card.href = href(a.slug);
      picture(a.pic, 'icon', card);
      el('strong', '', a.title, card);
    }
  }
}

function guidePage(w: Reader, a: BookArticle, page: HTMLElement): void {
  const g = a.guide!;
  crumbs(w, a, page);
  el('h1', '', g.title, page);
  if (a.pic && isShot(a.pic.file)) picture(a.pic, 'banner', page);
  for (const part of g.parts) {
    const sec = el('section', 'guide-part', undefined, page);
    if (part.picture) guidePicture(part.picture, isShot(part.picture) ? 'scene side-pic' : 'icon side-pic', sec);
    if (part.heading) el('h2', '', part.heading, sec);
    for (const p of part.paragraphs) richText(w, p, el('p', '', undefined, sec));
    if (part.bullets?.length) {
      const ul = el('ul', '', undefined, sec);
      for (const b of part.bullets) richText(w, b, el('li', '', undefined, ul));
    }
  }
}

function crumbs(w: Reader, a: BookArticle, page: HTMLElement): void {
  const c = el('div', 'crumbs', undefined, page);
  const s = w.sections.find((x) => x.id === a.category);
  if (s?.id === GUIDES_SECTION) frontLink(s.label, c);
  else if (s) link(s.label, `section/${s.id}`, c);
  if (a.heading) {
    c.append(' › ');
    el('span', '', a.heading, c);
  }
}

function articlePage(w: Reader, a: BookArticle, page: HTMLElement): void {
  crumbs(w, a, page);
  const head = el('div', 'page-head', undefined, page);
  if (!picture(a.pic, 'big', head) && a.model) modelPicture(a.model, head);
  el('h1', '', a.title, head);
  drawBlocks(a.blocks, page);
  const related = a.related;
  if (related.length) {
    const box = el('section', 'related', undefined, page);
    el('h2', '', 'Linked pages', box);
    for (const r of related) {
      const row = el('div', 'related-row', undefined, box);
      el('span', 'k', r.how, row);
      const list = el('span', 'v', undefined, row);
      r.items.forEach((item, i) => {
        if (i) list.append(', ');
        link(item.title, item.slug, list, 'inline');
        if (item.detail) el('small', '', ` (${item.detail})`, list);
      });
    }
  }
}

function factValue(f: Fact, parent: HTMLElement): void {
  const v = el('span', 'v', undefined, parent);
  if (f.pic) picture(f.pic, 'tiny', v);
  link(f.value, f.link, v, f.link ? 'inline' : '');
  if (f.hint) v.title = f.hint;
}

function drawBlocks(blocks: readonly Block[], parent: HTMLElement, depth = 0): void {
  for (const b of blocks) {
    switch (b.kind) {
      case 'text': {
        const p = el('p', depth === 0 ? 'lead' : 'text', undefined, parent);
        el('span', 'k', `${b.label}: `, p);
        p.append(b.text);
        break;
      }
      case 'tiles': {
        const row = el('div', 'tiles', undefined, parent);
        for (const f of b.facts) {
          const t = el('div', 'tile', undefined, row);
          el('strong', '', f.value, t);
          el('span', '', f.label, t);
          if (f.hint) t.title = f.hint;
        }
        break;
      }
      case 'facts': {
        const list = el('div', 'facts', undefined, parent);
        for (const f of b.facts) {
          const row = el('div', 'fact', undefined, list);
          el('span', 'label', f.label, row);
          factValue(f, row);
        }
        break;
      }
      case 'chips': {
        const row = el('div', 'chips-row', undefined, parent);
        el('span', 'k', b.label, row);
        const chips = el('span', 'chips', undefined, row);
        for (const f of b.items) {
          const c = el(f.link ? 'a' : 'span', 'chip', undefined, chips);
          if (f.link && c instanceof HTMLAnchorElement) c.href = href(f.link);
          picture(f.pic, 'tiny', c);
          if (f.value) el('b', '', f.value, c);
          el('span', '', f.label, c);
        }
        break;
      }
      case 'table': {
        if (b.label) el(depth === 0 ? 'h2' : 'h3', '', b.label, parent);
        const wrap = el('div', 'table-wrap', undefined, parent);
        const table = el('table', '', undefined, wrap);
        const hr = el('tr', '', undefined, el('thead', '', undefined, table));
        el('th', '', '', hr);
        for (const c of b.columns) el('th', '', c, hr);
        const tb = el('tbody', '', undefined, table);
        for (const r of b.rows) {
          const tr = el('tr', '', undefined, tb);
          el('th', '', r.label, tr);
          for (const c of r.cells) {
            const td = el('td', '', undefined, tr);
            if (c) factValue(c, td);
          }
        }
        break;
      }
      case 'group': {
        if (b.folded) {
          const d = el('details', 'group', undefined, parent);
          const s = el('summary', '', undefined, d);
          picture(b.pic, 'tiny', s);
          el('span', '', b.label, s);
          drawBlocks(b.blocks, d, depth + 1);
        } else {
          const sec = el('section', `group depth-${Math.min(depth, 2)}`, undefined, parent);
          const h = el(depth === 0 ? 'h2' : 'h3', '', undefined, sec);
          picture(b.pic, 'icon', h);
          el('span', '', b.label, h);
          drawBlocks(b.blocks, sec, depth + 1);
        }
        break;
      }
      case 'zero': {
        if (b.zero.length) el('p', 'zero', `Zero or none: ${b.zero.join(', ')}.`, parent);
        if (b.no.length) el('p', 'zero', `No: ${b.no.join(', ')}.`, parent);
        break;
      }
    }
  }
}
