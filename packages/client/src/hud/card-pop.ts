// The command card's right-click dropdown (Patch 5, Jade's GP-3: "dropdown on
// right click to open dropdown with options scrap 1, scrap 10, scrap all"): a
// column of menu buttons just above the card button right clicked, framed like
// the training cards' tier strip. A pick, Esc, a press anywhere else or the
// card losing that button closes it. The items' menu (item-menu.ts: a slot of
// the stockpile or of one unit's inventory) is the same dropdown, below the
// slot where there is no room above it, with choices greyed out and why.
//
// Patch 7 (plan section 7, Jade's drafts): a gear menu has a header (the
// piece's name in its rarity's colour and a line under it), rows with the
// piece's picture, a line under the name, the reason a greyed row cannot be
// picked, and its number with an arrow against what the unit has now; rows
// may stand under group headings, and a row can open a page of its own
// (Swap for…, with a way back). A menu taller than the largest of the drafts
// (MENU_MOST, J-16 and J-17) stops there and its rows scroll with the game's
// own bar, the header and the foot line staying put.
import type { ButtonIcon, ButtonRegistry, CompareTip } from './buttons.ts';
import type { CardChoice } from './commands.ts';
import { gameScroll } from './game-scroll.ts';

/** The action an item's menu goes by, so the command card's redraw leaves it open. */
export const ITEM_MENU = 'item-menu';
/** The tallest a menu gets before its rows scroll, CSS px at the HUD's own size (Jade's J-16: "roughly figure 2 or 4" of the drafts, about 425 px). */
export const MENU_MOST = 440;

/** A number at a row's right, and how it compares with what the unit has now. */
export interface RowValue {
  text: string;
  /** Better (up), worse (down) or the same as what it has; none when there is nothing to compare. */
  dir?: 'up' | 'down' | 'same';
  /** How much better or worse ("12"). */
  by?: string;
}

/** One choice of a gear menu: a card choice with a picture, lines and a value. */
export interface MenuChoice extends CardChoice {
  icon?: ButtonIcon;
  /** A short line under the name ("Heft 18", "Take it to a store point"). */
  note?: string;
  value?: RowValue;
  /** The name's colour class (its rarity: rarity-epic). */
  nameClass?: string;
  /** Its picture glints (epic) or sparkles (legendary). */
  shine?: 'glint' | 'sparkle';
  /** A heading over it, shown where it differs from the row before's. */
  group?: string;
  /** It opens a page of its own (Swap for…): ▸ at its end, and a press shows the page instead of running. */
  page?: () => PopMenu;
  /** Its tooltip compares the piece with what the unit has now (Patch 7, the hover). */
  compare?: CompareTip;
  /** A click while it is greyed out still does something (the Dreadnought's "I need something for smashing."). */
  greyRun?: () => void;
  /** A quieter last tooltip line. */
  foot?: string;
  /** Lit: the best pick, as the drafts mark it. */
  lit?: boolean;
}

/** A gear menu: its header, its rows and a foot line. */
export interface PopMenu {
  title: string;
  titleClass?: string;
  sub?: string;
  choices: readonly MenuChoice[];
  foot?: string;
}

function span(cls: string, text: string, parent: HTMLElement): HTMLElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  parent.append(s);
  return s;
}

/** The arrows the drafts mark a better or worse number with. */
export function valueMark(v: RowValue): string {
  if (v.dir === 'up') return `▲${v.by ?? ''}`;
  if (v.dir === 'down') return `▼${v.by ?? ''}`;
  if (v.dir === 'same') return 'same';
  return '';
}

export class CardPop {
  private ids: string[] = [];
  /** The action of the card button it belongs to, or ITEM_MENU for an item's menu. */
  action = '';
  /** The button it opened over, and the pages it went through (Swap for… goes back to its menu). */
  private at: HTMLElement | null = null;
  private trail: PopMenu[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly buttons: ButtonRegistry,
  ) {}

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Opens the choices over a card button (a plain list), or a gear menu (Patch 7). */
  show(at: HTMLElement, action: string, choices: readonly CardChoice[] | PopMenu): void {
    this.clear();
    const menu = 'choices' in choices ? choices : null;
    if ((menu ? menu.choices : (choices as readonly CardChoice[])).length === 0) return;
    this.action = action;
    this.at = at;
    if (menu) {
      this.trail = [menu];
      this.drawMenu(menu);
    } else {
      this.el.classList.remove('rich');
      (choices as readonly CardChoice[]).forEach((c, k) => this.el.append(this.plainRow(c, k)));
    }
    this.el.hidden = false;
    this.place();
  }

  /** A command card choice: its name on a menu button, its sentences in the tooltip. */
  private plainRow(c: CardChoice, k: number): HTMLElement {
    const id = `card-pop-${k}`;
    const b = this.buttons.add({
      id,
      face: c.name,
      name: c.name,
      keys: [],
      description: c.description,
      className: 'cmd menu-item pop-item',
      onPress: () => {
        this.close();
        c.run();
      },
    });
    if (c.why) b.setEnabled(false, c.why);
    this.ids.push(id);
    return b.el;
  }

  /** A gear menu: the header, the rows (scrolling past MENU_MOST) and the foot. */
  private drawMenu(menu: PopMenu): void {
    for (const id of this.ids) this.buttons.remove(id);
    this.ids = [];
    this.el.replaceChildren();
    this.el.classList.add('rich');
    this.el.style.setProperty('--menu-most', `${MENU_MOST}px`);
    const head = document.createElement('div');
    head.className = 'pop-head';
    if (this.trail.length > 1) {
      const back = this.buttons.add({
        id: 'card-pop-back',
        face: '‹',
        name: 'Back',
        keys: [],
        description: `Back to the ${this.trail[this.trail.length - 2]!.title} menu.`,
        className: 'pop-back',
        onPress: () => {
          this.trail.pop();
          this.drawMenu(this.trail[this.trail.length - 1]!);
          this.place();
        },
      });
      this.ids.push('card-pop-back');
      head.append(back.el);
    }
    const words = document.createElement('div');
    words.className = 'pop-words';
    span(`pop-title ${menu.titleClass ?? ''}`.trim(), menu.title, words);
    if (menu.sub) span('pop-sub', menu.sub, words);
    head.append(words);
    const list = document.createElement('div');
    list.className = 'pop-list';
    gameScroll(list);
    let group = '';
    menu.choices.forEach((c, k) => {
      if (c.group && c.group !== group) span('pop-group', c.group, list);
      group = c.group ?? group;
      list.append(this.richRow(c, k));
    });
    this.el.append(head, list);
    if (menu.foot) span('pop-foot', menu.foot, this.el);
  }

  /** A gear menu's row: picture, name, a line under it or why it is greyed, its value with an arrow, ▸ for a page. */
  private richRow(c: MenuChoice, k: number): HTMLElement {
    const id = `card-pop-${k}`;
    const b = this.buttons.add({
      id,
      face: '',
      ...(c.icon ? { icon: c.icon } : {}),
      name: c.name,
      keys: [],
      description: c.description,
      ...(c.foot ? { foot: c.foot } : {}),
      ...(c.compare ? { compare: c.compare } : {}),
      ...(c.nameClass ? { nameClass: c.nameClass } : {}),
      ...(c.shine ? { shine: c.shine } : {}),
      className: `pop-row${c.lit ? ' best' : ''}${c.page ? ' has-page' : ''}`,
      onPress: () => {
        if (c.page) {
          this.trail.push(c.page());
          this.drawMenu(this.trail[this.trail.length - 1]!);
          this.place();
          return;
        }
        this.close();
        c.run();
      },
      ...(c.greyRun
        ? {
            onGreyPress: () => {
              this.close();
              c.greyRun!();
            },
          }
        : {}),
    });
    if (c.why) b.setEnabled(false, c.why);
    this.ids.push(id);
    const text = document.createElement('span');
    text.className = 'pr-text';
    span(`pr-name ${c.nameClass ?? ''}`.trim(), c.name, text);
    if (c.why) span('pr-why', c.why, text);
    else if (c.note) span('pr-note', c.note, text);
    b.el.append(text);
    if (c.value) {
      const v = span('pr-value', c.value.text, b.el);
      const mark = valueMark(c.value);
      if (mark) span(`pr-mark ${c.value.dir}`, mark, v);
    }
    if (c.page) span('pr-more', '▸', b.el);
    return b.el;
  }

  /** Just above the button it opened over, scaled with the rest of the HUD; below it where there is no room above. */
  private place(): void {
    const at = this.at;
    if (!at) return;
    const s = Number(getComputedStyle(this.el.parentElement ?? this.el).getPropertyValue('--hud-s')) || 1;
    const st = this.el.style;
    st.transform = '';
    const r = at.getBoundingClientRect();
    const w = this.el.offsetWidth * s;
    const h = this.el.offsetHeight * s;
    st.transformOrigin = '0 0';
    st.transform = s === 1 ? '' : `scale(${s})`;
    st.left = `${Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)))}px`;
    // Below the button when there is no room above it (the stockpile's top row).
    st.top = `${Math.round(r.top - h - 4 >= 4 ? r.top - h - 4 : Math.max(4, Math.min(window.innerHeight - h - 4, r.bottom + 4)))}px`;
  }

  /** Closes it; true when it was open. */
  close(): boolean {
    if (!this.open) return false;
    this.clear();
    return true;
  }

  /** Any press while it is open: one on it is its own; anything else closes it, and a press in the game view does nothing more. True to swallow the press. */
  pressed(inHud: boolean, el: Element | null): boolean {
    if (!this.open) return false;
    if (el && this.el.contains(el)) return false;
    this.close();
    return !inHud;
  }

  private clear(): void {
    for (const id of this.ids) this.buttons.remove(id);
    this.ids = [];
    this.action = '';
    this.at = null;
    this.trail = [];
    this.el.replaceChildren();
    this.el.classList.remove('rich');
    this.el.hidden = true;
  }
}
