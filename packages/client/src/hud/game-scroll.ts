// The game's own scroll bar (Patch 7, Jade's J-16: "we need to make the
// scroll fit the general UI of the game. Right now I know for example the elf
// caravan scroll looks like a default scroll which is ugly"). Every list in
// the match that scrolls (the pop-out menus, the peoples' trade lists, the
// messages, the dialogs, Send resources, the unit list, the war confirmation,
// the host choice, the game menu) hides the browser's bar and shows this one
// instead: a dark well for the track (the frame art's menu_list) and the
// gold-edged pop-up button for the handle (popup_button_normal, its hover and
// pressed looks), drawn by the game so it looks the same in every browser.
//
// The wheel scrolls it as before (input-manager.ts: [data-scroll]); the handle
// drags; a click on the track pages toward the click. In play the input
// manager drives it as an area (the cursor may be locked); in the game menu
// the page's own pointer events do. The bar sits in a sticky pin, the host's
// first child, so it stays in view while the list moves and never makes the
// list longer than its content.
import type { MouseTarget } from '../input/input-manager.ts';
import type { Pt } from './rects.ts';

/** The input area every bar answers to (input-manager.ts addTarget). */
export const SCROLL_AREA = 'game-scroll';
/** The bar's width, and the shortest the handle gets, CSS px at the HUD's own size. */
export const BAR_W = 10;
export const MIN_THUMB = 18;
/** A click on the track scrolls this share of the list's height. */
export const PAGE_SHARE = 0.9;

/** Where the handle sits: its length and its offset down the track, px. */
export function thumbOf(track: number, client: number, scroll: number, top: number): { size: number; at: number } {
  if (scroll <= client || track <= 0) return { size: track, at: 0 };
  const size = Math.min(track, Math.max(MIN_THUMB, Math.round((track * client) / scroll)));
  const most = scroll - client;
  const at = Math.round(((track - size) * Math.max(0, Math.min(most, top))) / most);
  return { size, at };
}

/** The list's scroll position for a handle dragged by `moved` px from where it started at `from`, the travel and the list's room as they are on screen. */
export function dragTo(from: number, moved: number, travel: number, most: number): number {
  if (travel <= 0 || most <= 0) return 0;
  return Math.max(0, Math.min(most, from + (moved * most) / travel));
}

/** The scroll position after a click on the track above (-1) or below (1) the handle. */
export function pageTo(top: number, way: -1 | 1, client: number, most: number): number {
  return Math.max(0, Math.min(most, top + way * Math.max(1, Math.round(client * PAGE_SHARE))));
}

interface Host {
  el: HTMLElement;
  pin: HTMLElement;
  bar: HTMLElement;
  thumb: HTMLElement;
  /** Whether its overflow lets it scroll at all (read once it is laid out), and its padding and row gap, px. */
  can: boolean | null;
  padTop: number;
  padRight: number;
  gap: number;
  /** What it last drew, to skip unchanged work. */
  sig: string;
}

const hosts = new Map<HTMLElement, Host>();
const byBar = new WeakMap<HTMLElement, Host>();
/** The handle being dragged: its host, where the press started (screen px) and the list's scroll then. */
let drag: { host: Host; y0: number; top0: number } | null = null;
let lit: HTMLElement | null = null;

/** Makes an element a list that scrolls with the game's bar and the wheel (it gets data-scroll); returns it. */
export function gameScroll(el: HTMLElement): HTMLElement {
  el.dataset.scroll = '';
  if (hosts.has(el)) return el;
  el.classList.add('gs-host');
  const pin = document.createElement('div');
  pin.className = 'gs-pin';
  const bar = document.createElement('div');
  bar.className = 'gs-bar';
  bar.dataset.area = SCROLL_AREA;
  bar.hidden = true;
  const thumb = document.createElement('div');
  thumb.className = 'gs-thumb';
  bar.append(thumb);
  pin.append(bar);
  const h: Host = { el, pin, bar, thumb, can: null, padTop: 0, padRight: 0, gap: 0, sig: '' };
  hosts.set(el, h);
  byBar.set(bar, h);
  el.addEventListener('scroll', () => sync(h), { passive: true });
  // Outside play (the game menu) the page's own pointer events drive it.
  bar.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('playing')) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    press(h, e.target as Element, e.clientY);
    const move = (m: PointerEvent): void => moveTo(m.clientY);
    const up = (): void => {
      release();
      bar.removeEventListener('pointermove', move);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
    bar.addEventListener('pointercancel', up, { once: true });
  });
  return el;
}

/** Reads how the host lays out once, while it is in the page. */
function measure(h: Host): void {
  const cs = getComputedStyle(h.el);
  h.can = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
  h.padTop = parseFloat(cs.paddingTop) || 0;
  h.padRight = parseFloat(cs.paddingRight) || 0;
  const gap = parseFloat(cs.rowGap);
  h.gap = cs.display.includes('flex') || cs.display.includes('grid') ? gap || 0 : 0;
  h.pin.style.marginBottom = h.gap ? `${-h.gap}px` : '';
  h.bar.style.top = h.padTop ? `${-h.padTop}px` : '';
}

/** Draws one host's bar from its list as it is now. */
function sync(h: Host): void {
  const el = h.el;
  if (h.can === null) {
    if (el.clientHeight === 0) return;
    measure(h);
  }
  const most = el.scrollHeight - el.clientHeight;
  const on = h.can === true && most > 1 && el.clientHeight > 0;
  if (!on) {
    if (h.sig !== 'off') {
      h.sig = 'off';
      h.bar.hidden = true;
      el.classList.remove('gs-on');
      el.style.paddingRight = '';
    }
    return;
  }
  // The pin stays the list's first child (lists that redraw put it back here).
  if (el.firstChild !== h.pin) el.prepend(h.pin);
  const track = el.clientHeight;
  const t = thumbOf(track, el.clientHeight, el.scrollHeight, el.scrollTop);
  const sig = `${track}|${t.size}|${t.at}`;
  if (sig === h.sig) return;
  h.sig = sig;
  h.bar.hidden = false;
  if (!el.classList.contains('gs-on')) {
    el.classList.add('gs-on');
    // Room for the bar beside the list, as the browser's own bar takes.
    if (h.padRight < BAR_W + 2) el.style.paddingRight = `${BAR_W + 2}px`;
  }
  h.bar.style.right = `${-Math.max(h.padRight, BAR_W + 2)}px`;
  h.bar.style.height = `${track}px`;
  h.thumb.style.height = `${t.size}px`;
  h.thumb.style.transform = `translateY(${t.at}px)`;
}

/** Once a frame, after the panels are measured (the layout is fresh then): every bar follows its list; lists gone from the page are forgotten. */
export function syncScrollBars(cursor?: Pt): void {
  for (const h of hosts.values()) {
    if (!h.el.isConnected) {
      hosts.delete(h.el);
      continue;
    }
    sync(h);
  }
  // The lit handle goes out once the cursor has left it (it lights in scrollTarget.move).
  if (lit && !drag) {
    const r = lit.getBoundingClientRect();
    if (!cursor || !lit.isConnected || cursor.x < r.left || cursor.x >= r.right || cursor.y < r.top || cursor.y >= r.bottom) light(null);
  }
}

/** The handle under the cursor lights up, as a pop-up button does. */
function light(thumb: HTMLElement | null): void {
  if (thumb === lit) return;
  lit?.classList.remove('hover');
  thumb?.classList.add('hover');
  lit = thumb;
}

function thumbAt(p: Pt): HTMLElement | null {
  const el = document.elementFromPoint(p.x, p.y);
  return el instanceof HTMLElement && el.classList.contains('gs-thumb') ? el : null;
}

/** A press on a bar: on the handle it starts a drag, on the track it pages toward the press. */
function press(h: Host, target: Element | null, y: number): void {
  const el = h.el;
  const most = el.scrollHeight - el.clientHeight;
  if (target === h.thumb) {
    drag = { host: h, y0: y, top0: el.scrollTop };
    h.thumb.classList.add('pressed');
    return;
  }
  const r = h.thumb.getBoundingClientRect();
  el.scrollTop = pageTo(el.scrollTop, y < r.top ? -1 : 1, el.clientHeight, most);
  sync(h);
}

function moveTo(y: number): void {
  if (!drag) return;
  const { host: h, y0, top0 } = drag;
  const bar = h.bar.getBoundingClientRect();
  const thumb = h.thumb.getBoundingClientRect();
  h.el.scrollTop = dragTo(top0, y - y0, bar.height - thumb.height, h.el.scrollHeight - h.el.clientHeight);
  sync(h);
}

function release(): void {
  drag?.host.thumb.classList.remove('pressed');
  drag = null;
}

/** The bars in play, driven by the input manager with the game's cursor. */
export const scrollTarget: MouseTarget = {
  down(button, p) {
    if (button !== 0) return;
    const el = document.elementFromPoint(p.x, p.y);
    const bar = el?.closest<HTMLElement>('.gs-bar');
    const h = bar ? byBar.get(bar) : undefined;
    if (h) press(h, el, p.y);
  },
  move(p) {
    if (drag) moveTo(p.y);
    else light(thumbAt(p));
  },
  up() {
    release();
  },
};
