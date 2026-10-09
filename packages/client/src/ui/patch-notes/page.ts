// The patch notes screen, opened from the main menu's Patch notes button:
// every update, newest first, each in its four categories, with a list of
// updates (and each update's categories) down the side to jump between them.
// Opening it marks the newest update as read in this browser (the menu's
// "New update" mark dims). The newest update without a date of its own shows
// the day the site was built (BUILD_DAY, set by the deploy's build).
import '../book.css';
import { BUILD_DAY, GAME_VERSION } from '../../version.ts';
import { PATCH_NOTES_HASH } from '../book-links.ts';
import { button, el } from '../dom.ts';
import { pictureUrl } from '../how-to-play/picture-url.ts';
import { markLatestSeen, NOTE_CATEGORIES, PATCH_NOTES, type PatchNote } from './notes.ts';

const anchorOf = (n: PatchNote): string => n.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** An update's date: its own, or for the newest the day the site was built. */
const dateOf = (n: PatchNote, i: number): string => n.date ?? (i === 0 ? BUILD_DAY : '');

function dateText(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : iso;
}

function picture(file: string | undefined, cls: string, parent: HTMLElement): void {
  const url = file ? pictureUrl(file) : '';
  if (!url) return;
  const img = el('img', `pic ${cls}`, undefined, parent);
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
}

/** Opens the patch notes over the main menu; resolves when the player goes back to the menu. */
export function patchNotes(app: HTMLElement): Promise<void> {
  markLatestSeen();
  const root = el('div', 'book', undefined, app);
  root.dataset.book = 'patch-notes';
  const top = el('header', 'book-top', undefined, root);
  el('span', 'book-title', 'Patch notes', top);
  el('span', 'book-gap', undefined, top);
  const body = el('div', 'book-body', undefined, root);
  const side = el('nav', 'book-side', undefined, body);
  const main = el('main', 'book-main', undefined, body);

  el('div', 'side-head', 'Updates', side);
  const jump = (id: string, row: HTMLElement): void => {
    main.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    side.querySelectorAll('.side-link').forEach((x) => x.classList.toggle('on', x === row));
  };
  PATCH_NOTES.forEach((n, i) => {
    const row = el('a', `side-link${i === 0 ? ' on' : ''}`, undefined, side);
    row.href = `#${anchorOf(n)}`;
    row.addEventListener('click', (e) => {
      e.preventDefault();
      jump(anchorOf(n), row);
    });
    el('span', '', n.name, row);
    const date = dateOf(n, i);
    el('small', '', i === 0 ? 'Latest' : date ? dateText(date) : '', row);
    // The newest update's categories, one link each, so a long update reads by part.
    if (i !== 0) return;
    for (const c of NOTE_CATEGORIES) {
      const items = n.changes[c.id];
      if (!items?.length) continue;
      const sub = el('a', 'side-link side-sub', undefined, side);
      sub.href = `#${anchorOf(n)}-${c.id}`;
      sub.addEventListener('click', (e) => {
        e.preventDefault();
        jump(`${anchorOf(n)}-${c.id}`, sub);
      });
      el('span', '', c.title, sub);
      el('small', '', String(items.length), sub);
    }
  });

  PATCH_NOTES.forEach((n, i) => {
    const page = el('article', 'book-page patch', undefined, main);
    page.id = anchorOf(n);
    const head = el('header', 'patch-head', undefined, page);
    if (i === 0) el('span', 'new-flag', 'Latest update', head);
    el('h1', '', n.name, head);
    const date = dateOf(n, i);
    const meta = [n.version ?? (i === 0 ? GAME_VERSION : ''), date ? dateText(date) : ''].filter(Boolean).join(' · ');
    if (meta) el('p', 'patch-meta', meta, head);
    el('p', 'lead', n.headline, page);
    for (const p of n.intro ?? []) el('p', '', p, page);
    for (const c of NOTE_CATEGORIES) {
      const items = n.changes[c.id];
      if (!items?.length) continue;
      const sec = el('section', `patch-cat cat-${c.id}`, undefined, page);
      sec.id = `${anchorOf(n)}-${c.id}`;
      const h = el('h2', '', undefined, sec);
      picture(c.picture, 'icon', h);
      el('span', '', c.title, h);
      el('small', '', String(items.length), h);
      const list = el('ul', 'patch-items', undefined, sec);
      for (const item of items) {
        const li = el('li', item.picture ? 'with-pic' : '', undefined, list);
        picture(item.picture, 'icon item-pic', li);
        const text = el('div', '', undefined, li);
        const p = el('p', '', undefined, text);
        if (item.title) el('strong', '', `${item.title}. `, p);
        p.append(item.text);
        if (item.details?.length) {
          const ul = el('ul', 'details', undefined, text);
          for (const d of item.details) el('li', '', d, ul);
        }
        // A screenshot of the game, shown wide under the item's text.
        const shot = item.shot ? pictureUrl(item.shot) : '';
        if (shot) {
          const fig = el('figure', 'patch-shot', undefined, text);
          const img = el('img', 'pic shot', undefined, fig);
          img.src = shot;
          img.alt = item.title ?? '';
          img.loading = 'lazy';
        }
      }
    }
  });

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('hashchange', onHash);
      root.remove();
      if (location.hash === PATCH_NOTES_HASH) history.replaceState(null, '', `${location.pathname}${location.search}`);
      resolve();
    };
    const onHash = (): void => {
      if (location.hash !== PATCH_NOTES_HASH) close();
    };
    button(top, 'Return to main menu', close, 'book-back');
    if (location.hash !== PATCH_NOTES_HASH) location.hash = PATCH_NOTES_HASH;
    window.addEventListener('hashchange', onHash);
  });
}
