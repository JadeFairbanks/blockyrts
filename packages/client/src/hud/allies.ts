// The multiplayer tools next to the resource bar (Allies panel): the Allies
// list with a Share control box for each other player, and the Send
// resources window (a resource, an amount typed or made with +10, +100 and
// All, and a Send button on each ally's row). Both are HUD panels with HUD
// buttons, so they work with the mouse alone and with the cursor locked.
import { RESOURCES, type Order } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { MouseTarget } from '../input/input-manager.ts';
import type { ButtonRegistry, HudButtonDef } from './buttons.ts';
import type { HudPanels } from './panels.ts';

export interface AlliesActions {
  send(o: Order): void;
  message(text: string): void;
  /** Player names and CSS colours, by sim player. */
  name(p: number): string;
  colour(p: number): string;
  /** Lets a click on a text field focus it (the cursor may be locked). */
  addArea(id: string, el: HTMLElement, target: MouseTarget): void;
}

/** The amount after a +N press, never past what the pool holds (the sim clamps too). */
export function addAmount(amount: number, by: number, have: number): number {
  return Math.max(0, Math.min(have, amount + by));
}

/** A typed amount: digits only, at most the pool; empty is 0. */
export function parseAmount(text: string, have: number): number {
  const t = text.replace(/[\s,_]/g, '');
  if (!/^\d{0,9}$/.test(t)) return -1;
  return Math.min(have, Number(t || '0'));
}

class Buttons {
  private ids: string[] = [];
  private n = 0;

  constructor(
    private readonly reg: ButtonRegistry,
    private readonly prefix: string,
  ) {}

  add(parent: HTMLElement, def: Omit<HudButtonDef, 'id' | 'keys'>, disabled = '', lit = false): void {
    const id = `${this.prefix}-${this.n++}`;
    const b = this.reg.add({ keys: [], ...def, id });
    if (disabled) b.setEnabled(false, disabled);
    if (lit) b.setLit(true);
    this.ids.push(id);
    parent.append(b.el);
  }

  clear(): void {
    for (const id of this.ids) this.reg.remove(id);
    this.ids = [];
  }
}

function el(tag: string, cls: string, parent?: HTMLElement, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

export class AlliesUi {
  private readonly allies: HTMLElement;
  private readonly sendBox: HTMLElement;
  private readonly alliesButtons: Buttons;
  private readonly sendButtons: Buttons;
  private readonly amountInput: HTMLInputElement;
  private alliesSig = '';
  private sendSig = '';
  /** The resource picked in the Send window, and the amount. */
  private res = -1;
  private amount = 0;

  constructor(
    root: HTMLElement,
    panels: HudPanels,
    buttons: ButtonRegistry,
    private readonly game: GameInfo,
    private readonly player: number,
    private readonly a: AlliesActions,
  ) {
    this.allies = el('div', 'panel allies-panel', root);
    this.sendBox = el('div', 'panel send-dialog', root);
    for (const p of [this.allies, this.sendBox]) {
      p.hidden = true;
      p.dataset.scroll = '';
    }
    panels.register('allies', this.allies);
    panels.register('send', this.sendBox);
    this.alliesButtons = new Buttons(buttons, 'ally');
    this.sendButtons = new Buttons(buttons, 'snd');
    this.amountInput = document.createElement('input');
    this.amountInput.className = 'send-amount';
    this.amountInput.inputMode = 'numeric';
    this.amountInput.autocomplete = 'off';
    this.amountInput.setAttribute('aria-label', 'Amount to send');
    this.amountInput.addEventListener('input', () => {
      const v = parseAmount(this.amountInput.value, this.have());
      if (v >= 0) this.amount = v;
    });
    this.amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.amountInput.value = String(this.amount);
        this.amountInput.blur();
      }
    });
    this.amountInput.addEventListener('blur', () => {
      this.amountInput.value = String(this.amount);
      this.sendSig = '';
      this.refresh();
    });
    a.addArea('send-amount', this.amountInput, {
      down: () => {
        this.amountInput.focus();
        this.amountInput.select();
      },
      move: () => undefined,
      up: () => undefined,
    });
  }

  /** The other players, in player order. */
  private others(): number[] {
    const n = this.game.info?.players.length ?? 0;
    const out: number[] = [];
    for (let p = 0; p < n; p++) if (p !== this.player) out.push(p);
    return out;
  }

  get open(): boolean {
    return !this.allies.hidden || !this.sendBox.hidden;
  }

  toggleAllies(): void {
    this.allies.hidden = !this.allies.hidden;
    this.alliesSig = '';
    this.refresh();
  }

  toggleSend(): void {
    this.sendBox.hidden = !this.sendBox.hidden;
    this.sendSig = '';
    this.refresh();
  }

  /** Esc: the Send window, then the Allies panel. */
  closeTop(): boolean {
    if (!this.sendBox.hidden) {
      this.toggleSend();
      return true;
    }
    if (!this.allies.hidden) {
      this.toggleAllies();
      return true;
    }
    return false;
  }

  /** Each info update: what is open shows the latest. */
  refresh(): void {
    if (!this.allies.hidden) this.drawAllies();
    if (!this.sendBox.hidden) this.drawSend();
  }

  private drawAllies(): void {
    const info = this.game.info;
    const players = info?.players ?? [];
    const mine = players[this.player]?.share ?? 0;
    const sig = `${mine}|${players.map((p) => `${p.share}:${p.out}`).join(',')}|${this.others().map((p) => this.a.name(p)).join(',')}`;
    if (sig === this.alliesSig) return;
    this.alliesSig = sig;
    this.alliesButtons.clear();
    this.allies.replaceChildren();
    const head = el('div', 'dlg-head', this.allies);
    el('h3', 'dlg-title', head, 'Allies');
    this.alliesButtons.add(head, { face: '×', name: 'Close', description: 'Close the Allies panel ([ or Esc).', className: 'dlg-close', onPress: () => this.toggleAllies() });
    const others = this.others();
    if (others.length === 0) {
      el('p', 'dlg-note', this.allies, 'You are playing alone. Host a game from the main menu to play with others.');
      return;
    }
    el('p', 'dlg-note', this.allies, 'Share control lets that player order your units: move, attack, patrol, hold, gather, shelter and garrison. They can never use your buildings or spend your resources.');
    for (const p of others) {
      const row = el('div', 'ally-row', this.allies);
      const swatch = el('span', 'ally-swatch', row);
      swatch.style.background = this.a.colour(p);
      el('span', 'ally-name', row, this.a.name(p));
      const st = players[p];
      if (st?.out) {
        el('span', 'ally-status', row, 'Out of the game: their buildings and units are shared by everyone.');
        continue;
      }
      const on = (mine & (1 << p)) !== 0;
      const theirs = ((st?.share ?? 0) & (1 << this.player)) !== 0;
      this.alliesButtons.add(
        row,
        {
          face: on ? '☑ Share control' : '☐ Share control',
          name: 'Share control',
          description: on ? `${this.a.name(p)} may order your units. Click to stop sharing.` : `Let ${this.a.name(p)} order your units.`,
          className: 'dlg-btn ally-share',
          onPress: () => {
            this.a.send({ kind: 'shareControl', player: this.player, with: p, on: on ? 0 : 1 });
            this.a.message(on ? `You stopped sharing control with ${this.a.name(p)}.` : `${this.a.name(p)} may now order your units.`);
          },
        },
        '',
        on,
      );
      el('span', 'ally-status', row, theirs ? 'Shares control with you.' : '');
    }
  }

  private have(): number {
    return this.res < 0 ? 0 : this.game.have(this.res);
  }

  private drawSend(): void {
    const info = this.game.info;
    const pool = info?.pool ?? [];
    const others = this.others().filter((p) => !info?.players[p]?.out);
    if (this.res >= 0 && (pool[this.res] ?? 0) === 0) this.res = -1;
    this.amount = Math.min(this.amount, this.have());
    const sig = `${this.res}|${this.amount}|${pool.join(',')}|${others.join(',')}`;
    if (sig === this.sendSig) return;
    this.sendSig = sig;
    if (document.activeElement === this.amountInput) return; // not while typing
    this.sendButtons.clear();
    this.sendBox.replaceChildren();
    const head = el('div', 'dlg-head', this.sendBox);
    el('h3', 'dlg-title', head, 'Send resources');
    this.sendButtons.add(head, { face: '×', name: 'Close', description: 'Close the Send resources window (] or Esc).', className: 'dlg-close', onPress: () => this.toggleSend() });
    if (others.length === 0) {
      el('p', 'dlg-note', this.sendBox, 'There is nobody to send to.');
      return;
    }
    el('p', 'dlg-note', this.sendBox, 'Pick a resource and an amount, then Send on a player\'s row. It arrives at once, all of it.');
    const grid = el('div', 'send-res', this.sendBox);
    RESOURCES.forEach((r, k) => {
      const n = pool[k] ?? 0;
      if (n <= 0) return;
      this.sendButtons.add(
        grid,
        {
          face: `${r.short} ${n}`,
          name: r.name,
          description: `Send ${r.name.toLowerCase()} (you have ${n}).`,
          className: 'dlg-btn send-pick',
          onPress: () => {
            this.res = k;
            this.amount = Math.min(Math.max(this.amount, 10), n);
            this.refresh();
          },
        },
        '',
        k === this.res,
      );
    });
    if (grid.childElementCount === 0) el('p', 'dlg-note', this.sendBox, 'You have nothing to send.');
    const amountRow = el('div', 'dlg-row send-amount-row', this.sendBox);
    el('span', 'send-label', amountRow, this.res < 0 ? 'Amount' : `${RESOURCES[this.res]!.name}:`);
    this.amountInput.value = String(this.amount);
    amountRow.append(this.amountInput);
    const none = this.res < 0 ? 'Pick a resource first.' : '';
    const add = (face: string, by: number, description: string): void =>
      this.sendButtons.add(
        amountRow,
        {
          face,
          name: face,
          description,
          className: 'dlg-btn',
          onPress: () => {
            this.amount = by === Infinity ? this.have() : by === 0 ? 0 : addAmount(this.amount, by, this.have());
            this.refresh();
          },
        },
        none,
      );
    add('+10', 10, 'Ten more.');
    add('+100', 100, 'A hundred more.');
    add('All', Infinity, 'Everything you have of it.');
    add('Clear', 0, 'Back to nothing.');
    for (const p of others) {
      const row = el('div', 'ally-row', this.sendBox);
      const swatch = el('span', 'ally-swatch', row);
      swatch.style.background = this.a.colour(p);
      el('span', 'ally-name', row, this.a.name(p));
      const why = this.res < 0 ? 'Pick a resource first.' : this.amount <= 0 ? 'Choose an amount first.' : '';
      this.sendButtons.add(
        row,
        {
          face: 'Send',
          name: `Send to ${this.a.name(p)}`,
          description: this.res < 0 ? `Send to ${this.a.name(p)}.` : `Send ${this.amount} ${RESOURCES[this.res]!.name.toLowerCase()} to ${this.a.name(p)}.`,
          className: 'dlg-btn primary',
          onPress: () => {
            if (this.res < 0 || this.amount <= 0) return;
            this.a.send({ kind: 'sendResources', player: this.player, to: p, res: this.res, amount: this.amount });
          },
        },
        why,
      );
    }
  }
}
