// The multiplayer tools next to the resource bar (Allies panel): the Allies
// list with a Share control box for each other player, and the Send
// resources window. Both are HUD panels with HUD buttons, so they work with
// the mouse alone and with the cursor locked. Patch 5 (UI-15: "Make it
// visually clear how much of what resource is being put up/queued to be sent
// to another player"): the window keeps a To send list, each resource with
// its picture and an amount typed or made with +10, +100 and All, and Send on
// a player's row sends the whole list.
import { RESOURCES, type Order } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { MouseTarget } from '../input/input-manager.ts';
import type { ButtonRegistry, HudButtonDef } from './buttons.ts';
import { addAmount, amountBox, FOCUS_BOX, goodCount, goodPic } from './goods-ui.ts';
import type { HudPanels } from './panels.ts';
import { gameScroll } from './game-scroll.ts';

export { addAmount, parseAmount } from './goods-ui.ts';

export interface AlliesActions {
  send(o: Order): void;
  message(text: string): void;
  /** Player names and CSS colours, by sim player. */
  name(p: number): string;
  colour(p: number): string;
  /** Lets a click on a text field focus it (the cursor may be locked). */
  addArea(id: string, el: HTMLElement, target: MouseTarget): void;
}

/** "50 stone, 20 copper ore": what a To send list holds. */
export function sendText(lines: ReadonlyMap<number, number>): string {
  const out: string[] = [];
  for (const [res, n] of lines) if (n > 0) out.push(`${n} ${RESOURCES[res]!.name.toLowerCase()}`);
  return out.join(', ');
}

class Buttons {
  private ids: string[] = [];
  private n = 0;

  constructor(
    private readonly reg: ButtonRegistry,
    private readonly prefix: string,
  ) {}

  add(parent: HTMLElement, def: Omit<HudButtonDef, 'id' | 'keys'>, disabled = '', lit = false): HTMLElement {
    const id = `${this.prefix}-${this.n++}`;
    const b = this.reg.add({ keys: [], ...def, id });
    if (disabled) b.setEnabled(false, disabled);
    if (lit) b.setLit(true);
    this.ids.push(id);
    parent.append(b.el);
    return b.el;
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
  private alliesSig = '';
  private sendSig = '';
  /** The To send list: each resource put up and how many, in the order they were picked. */
  private readonly lines = new Map<number, number>();

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
      gameScroll(p);
    }
    panels.register('allies', this.allies);
    panels.register('send', this.sendBox);
    this.alliesButtons = new Buttons(buttons, 'ally');
    this.sendButtons = new Buttons(buttons, 'snd');
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
    const typed = document.activeElement;
    if (typed instanceof HTMLInputElement && this.sendBox.contains(typed)) typed.blur();
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
    const body = el('div', 'dlg-body', this.allies);
    gameScroll(body);
    const others = this.others();
    if (others.length === 0) {
      el('p', 'dlg-note', body, 'You are playing alone. Host a game from the main menu to play with others.');
      return;
    }
    el('p', 'dlg-note', body, 'Share control lets that player order your units: move, attack, patrol, hold, gather, shelter and garrison. They can never use your buildings or spend your resources.');
    for (const p of others) {
      const row = el('div', 'ally-row', body);
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

  private have(res: number): number {
    return this.game.have(res);
  }

  /** A press that changes the To send list: a box being typed in lets go first, then the window is drawn again. */
  private change(fn: () => void): void {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && this.sendBox.contains(a)) a.blur();
    fn();
    this.sendSig = '';
    this.refresh();
  }

  /** Leaving an amount box draws the window again, unless the press went to another box in it. */
  private boxLeft(): void {
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && this.sendBox.contains(a)) return;
      this.sendSig = '';
      this.refresh();
    }, 0);
  }

  private drawSend(): void {
    const info = this.game.info;
    const pool = info?.pool ?? [];
    const others = this.others().filter((p) => !info?.players[p]?.out);
    // Not while an amount is typed: leaving the box draws it again.
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && this.sendBox.contains(a)) return;
    // What the player no longer has leaves the list, and no line asks for more than there is.
    for (const [res, n] of [...this.lines]) {
      const h = pool[res] ?? 0;
      if (h <= 0) this.lines.delete(res);
      else if (n > h) this.lines.set(res, h);
    }
    const sig = `${[...this.lines].join(';')}|${pool.join(',')}|${others.join(',')}`;
    if (sig === this.sendSig) return;
    this.sendSig = sig;
    this.sendButtons.clear();
    this.sendBox.replaceChildren();
    const head = el('div', 'dlg-head', this.sendBox);
    el('h3', 'dlg-title', head, 'Send resources');
    this.sendButtons.add(head, { face: '×', name: 'Close', description: 'Close the Send resources window (] or Esc).', className: 'dlg-close', onPress: () => this.toggleSend() });
    const body = el('div', 'dlg-body', this.sendBox);
    gameScroll(body);
    if (others.length === 0) {
      el('p', 'dlg-note', body, 'There is nobody to send to.');
      return;
    }
    el('p', 'dlg-note', body, 'Put resources on the To send list and set how many, then Send on a player\'s row. Everything on the list arrives at once.');
    const grid = el('div', 'send-res', body);
    gameScroll(grid);
    RESOURCES.forEach((r, k) => {
      const n = pool[k] ?? 0;
      if (n <= 0) return;
      const on = this.lines.has(k);
      const b = this.sendButtons.add(
        grid,
        {
          face: r.short,
          name: r.name,
          description: on ? `${r.name} is on the To send list. Click for ten more; right click takes it off.` : `Put ${r.name.toLowerCase()} on the To send list (you have ${n}).`,
          className: 'dlg-btn send-pick',
          onPress: () => this.change(() => this.lines.set(k, on ? addAmount(this.lines.get(k)!, 10, n) : Math.min(10, n))),
          onRightClick: () => this.change(() => this.lines.delete(k)),
        },
        '',
        on,
      );
      b.prepend(goodPic(k));
      b.append(goodCount(n));
    });
    if (grid.childElementCount === 0) el('p', 'dlg-note', body, 'You have nothing to send.');

    el('div', 'trade-head', body, 'To send');
    const list = el('div', 'send-list', body);
    if (this.lines.size === 0) el('div', 'trade-good muted', list, 'Nothing yet: pick a resource above.');
    for (const [res, n] of this.lines) {
      const have = this.have(res);
      const r = RESOURCES[res]!;
      const line = el('div', 'good-row offer-line', list);
      line.append(goodPic(res));
      el('span', 'good-name', line, r.name);
      const box = amountBox(n, have, `How many ${r.name.toLowerCase()} to send`, (v) => this.lines.set(res, v), () => this.boxLeft());
      this.a.addArea('send-amount', box, FOCUS_BOX);
      line.append(box);
      const by = (face: string, to: () => number, description: string): void => {
        this.sendButtons.add(line, { face, name: face, description, className: 'dlg-btn mini', onPress: () => this.change(() => this.lines.set(res, to())) });
      };
      by('+10', () => addAmount(this.lines.get(res) ?? 0, 10, have), 'Ten more.');
      by('+100', () => addAmount(this.lines.get(res) ?? 0, 100, have), 'A hundred more.');
      by('All', () => have, `All ${have} you have.`);
      this.sendButtons.add(line, { face: '×', name: 'Take off', description: 'Take it off the To send list.', className: 'dlg-btn mini', onPress: () => this.change(() => this.lines.delete(res)) });
    }
    if (this.lines.size > 0) this.sendButtons.add(list, { face: 'Clear all', name: 'Clear all', description: 'Empty the To send list.', className: 'dlg-btn', onPress: () => this.change(() => this.lines.clear()) });

    for (const p of others) {
      const row = el('div', 'ally-row', body);
      const swatch = el('span', 'ally-swatch', row);
      swatch.style.background = this.a.colour(p);
      el('span', 'ally-name', row, this.a.name(p));
      const what = sendText(this.lines);
      this.sendButtons.add(
        row,
        {
          face: 'Send',
          name: `Send to ${this.a.name(p)}`,
          description: what ? `Send ${what} to ${this.a.name(p)}.` : `Send to ${this.a.name(p)}.`,
          className: 'dlg-btn primary',
          onPress: () => {
            const a = document.activeElement;
            if (a instanceof HTMLInputElement && this.sendBox.contains(a)) a.blur();
            for (const [res, n] of this.lines) if (n > 0) this.a.send({ kind: 'sendResources', player: this.player, to: p, res, amount: n });
            this.change(() => this.lines.clear());
          },
        },
        what ? '' : 'Put something on the To send list first.',
      );
    }
  }
}
