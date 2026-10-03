// Small DOM helpers for the screens outside the match (main menu, lobby,
// load, account, settings). These use the real cursor and the browser's own
// controls, so they are plain buttons, inputs and forms.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

export function button(parent: HTMLElement, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text, parent);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** A labelled field: the label, the input and a line for its error or help. */
export function field(parent: HTMLElement, label: string, input: HTMLInputElement | HTMLSelectElement, help = ''): { input: typeof input; error: HTMLElement } {
  const f = el('label', 'field', undefined, parent);
  el('span', '', label, f);
  f.append(input);
  if (help) el('small', '', help, f);
  const error = el('small', 'error', '', f);
  error.hidden = true;
  return { input, error };
}

export function input(name: string, type = 'text', autocomplete = 'off'): HTMLInputElement {
  const i = document.createElement('input');
  i.name = name;
  i.type = type;
  i.autocomplete = autocomplete as AutoFill;
  i.spellcheck = false;
  return i;
}

/**
 * A full-window screen with one dialog box; `page` swaps what is in the box.
 * The overlay's data-page names the page's kind (main-menu, lobby, ...), which
 * picks the picture behind it (screens.css).
 */
export class Screen {
  readonly overlay: HTMLElement;
  readonly box: HTMLElement;

  constructor(parent: HTMLElement, cls = '') {
    this.overlay = el('div', 'overlay start-overlay', undefined, parent);
    this.overlay.dataset.page = cls;
    this.box = el('div', `dialog ${cls}`.trim(), undefined, this.overlay);
  }

  /** Empties the box and gives it a heading. */
  page(title: string, cls = ''): HTMLElement {
    this.box.replaceChildren();
    this.box.className = `dialog ${cls}`.trim();
    this.overlay.dataset.page = cls;
    el('h2', '', title, this.box);
    return this.box;
  }

  remove(): void {
    this.overlay.remove();
  }
}

/** A line saying something went wrong (or "Working..."), shown under a form. */
export function status(parent: HTMLElement): { set(text: string, error?: boolean): void } {
  const p = el('p', 'note status', '', parent);
  p.hidden = true;
  return {
    set(text: string, error = false) {
      p.textContent = text;
      p.hidden = text === '';
      p.classList.toggle('error', error);
    },
  };
}

/** "3 minutes ago", "yesterday", or the date. */
export function whenText(iso: string | number, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
