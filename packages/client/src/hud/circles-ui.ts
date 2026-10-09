// The stone circles' panels (Patch 5): a bluestone chest's five spaces to
// take from (SC-6), and an altar (SCA-2): leave the Moon Goddess her gifts,
// or take the idol, asked Yes or No first. The same pattern as the trade
// menus (decisions 2.16 lists the stone circle menu with them): the title and
// its × stay put while the body scrolls, and every good keeps its picture,
// name and count at full size.
import {
  BLESSED_EVERY_NIGHTS,
  CHEST_SLOTS,
  CIRCLE_TYPE_NAMES,
  CircleAct,
  CircleType,
  GIFT_GOLD,
  GIFT_ROSES,
  GIFT_SILVER,
  goodName,
  IDOL_USE_EVERY_NIGHTS,
  Res,
  type Order,
} from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { ButtonRegistry } from './buttons.ts';
import { goodRow } from './goods-ui.ts';
import type { HudPanels } from './panels.ts';
import { Buttons, el, frame } from './peoples-ui.ts';

export interface CirclesActions {
  send(o: Order): void;
  /** The player's own units selected now: the ones sent to the chest or the altar. */
  units(): number[];
}

/** What taking an altar's idol does, said before the Yes. */
export function idolWarning(type: number): string {
  if (type === CircleType.Lunar) {
    return `Once the Moon Goddess Idol leaves her altar, the Bright Nights round this circle end. Used from your inventory, the idol makes a night bright for you, once every ${IDOL_USE_EVERY_NIGHTS} nights.`;
  }
  return 'The Headless God Idol leaves its altar for good.';
}

export class CirclesUi {
  private readonly chest: HTMLElement;
  private readonly altar: HTMLElement;
  private readonly chestButtons: Buttons;
  private readonly altarButtons: Buttons;
  /** The chest open (circle * 8 + chest), or -1. */
  private chestKey = -1;
  /** The altar open: its circle and the circle's type, or circle -1. */
  private altarAt = { circle: -1, type: 0 };
  /** The altar panel asks Yes or No before the idol is taken. */
  private askIdol = false;
  private chestSig = '';
  private altarSig = '';

  constructor(
    root: HTMLElement,
    panels: HudPanels,
    buttons: ButtonRegistry,
    private readonly game: GameInfo,
    private readonly player: number,
    private readonly a: CirclesActions,
  ) {
    this.chest = el('div', 'panel circle-dialog chest-dialog', root);
    this.altar = el('div', 'panel circle-dialog altar-dialog', root);
    for (const p of [this.chest, this.altar]) {
      p.hidden = true;
      p.dataset.scroll = '';
    }
    panels.register('chest', this.chest);
    panels.register('altar', this.altar);
    this.chestButtons = new Buttons(buttons, 'chest');
    this.altarButtons = new Buttons(buttons, 'altar');
  }

  /** One of the player's units opened a bluestone chest: its spaces show. */
  openChest(key: number): void {
    this.closeAltar();
    this.chestKey = key;
    this.chest.hidden = false;
    this.chestSig = '';
    this.refresh();
  }

  /** Right click on an altar. */
  openAltar(circle: number, type: number): void {
    this.closeChest();
    this.altarAt = { circle, type };
    this.askIdol = false;
    this.altar.hidden = false;
    this.altarSig = '';
    this.refresh();
  }

  /** Esc: the open chest or altar. False when neither was open. */
  closeTop(): boolean {
    if (this.chestKey >= 0) {
      this.closeChest();
      return true;
    }
    if (this.altarAt.circle >= 0) {
      if (this.askIdol) {
        this.askIdol = false;
        this.altarSig = '';
        this.refresh();
      } else this.closeAltar();
      return true;
    }
    return false;
  }

  /** Each info update: whatever is open shows the latest. */
  refresh(): void {
    if (this.chestKey >= 0) this.drawChest();
    if (this.altarAt.circle >= 0) this.drawAltar();
  }

  private closeChest(): void {
    this.chestKey = -1;
    this.chest.hidden = true;
    this.chestButtons.clear();
  }

  private closeAltar(): void {
    this.altarAt = { circle: -1, type: 0 };
    this.askIdol = false;
    this.altar.hidden = true;
    this.altarButtons.clear();
  }

  private order(circle: number, act: number, arg: number, queued = false): Order {
    return { kind: 'circle', player: this.player, units: this.a.units(), circle, act, arg, queued };
  }

  private drawChest(): void {
    const key = this.chestKey;
    const slots = this.game.info?.circles?.chests.find((c) => c[0] === key)?.[1] ?? null;
    const sig = JSON.stringify(slots);
    if (sig === this.chestSig) return;
    this.chestSig = sig;
    this.chestButtons.clear();
    const { head, body } = frame(this.chest, 'Bluestone chest');
    this.chestButtons.add(head, { face: '×', name: 'Close', description: 'Close the chest (Esc).', className: 'dlg-close', onPress: () => this.closeChest() });
    if (!slots) {
      el('p', 'dlg-note', body, 'Send a unit to open the chest.');
      return;
    }
    const circle = key >> 3;
    const n = key & 7;
    const full = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    el('p', 'dlg-note', body, full.length > 0 ? `${CHEST_SLOTS} spaces under the stone slab. What a unit cannot carry is laid on the ground by the chest.` : 'The chest is empty.');
    const list = el('div', 'dlg-row', body);
    slots.forEach((s, slot) => {
      if (!s) {
        el('div', 'good-row muted', list, 'Empty');
        return;
      }
      const [res, count] = s;
      this.chestButtons.good(list, res, count, {
        name: `Take ${goodName(res)}`,
        description: `A unit takes the ${goodName(res).toLowerCase()} from the chest.`,
        className: 'dlg-btn bundle',
        onPress: () => this.a.send(this.order(circle, CircleAct.TakeChest, n * 8 + slot)),
      });
    });
    if (full.length > 1) {
      const row = el('div', 'dlg-row', body);
      this.chestButtons.add(row, {
        face: 'Take everything',
        name: 'Take everything',
        description: 'A unit takes all that is in the chest, one space after another.',
        className: 'dlg-btn primary',
        onPress: () => full.forEach((slot, k) => this.a.send(this.order(circle, CircleAct.TakeChest, n * 8 + slot, k > 0))),
      });
    }
  }

  private drawAltar(): void {
    const { circle, type } = this.altarAt;
    const v = this.game.info?.circles;
    const why = v?.acts.find((a) => a[0] === circle);
    const taken = v?.taken.includes(circle) ?? false;
    const gold = this.game.have(Res.Gold);
    const silver = this.game.have(Res.Silver);
    const roses = this.game.have(Res.MoonRose);
    const sig = JSON.stringify([why, taken, gold, silver, roses, this.askIdol, v?.blessed]);
    if (sig === this.altarSig) return;
    this.altarSig = sig;
    this.altarButtons.clear();
    const title = `${CIRCLE_TYPE_NAMES[type] ?? 'Stone circle'}: altar`;
    const { head, body } = frame(this.altar, title);
    this.altarButtons.add(head, { face: '×', name: 'Close', description: 'Close (Esc).', className: 'dlg-close', onPress: () => this.closeAltar() });
    const idol = type === CircleType.Lunar ? Res.MoonIdol : type === CircleType.Boneyard ? Res.HeadlessIdol : -1;
    if (this.askIdol && idol >= 0) {
      el('p', 'dlg-note', body, `Take the ${goodName(idol)}?`);
      el('p', 'dlg-why', body, idolWarning(type));
      const row = el('div', 'dlg-row', body);
      this.altarButtons.add(row, {
        face: 'Yes',
        name: 'Take the idol',
        description: `A unit takes the ${goodName(idol)} from the altar.`,
        className: 'dlg-btn danger',
        onPress: () => {
          this.a.send(this.order(circle, CircleAct.TakeIdol, 0));
          this.closeAltar();
        },
      });
      this.altarButtons.add(row, { face: 'No', name: 'Leave it', description: 'The idol stays on its altar.', className: 'dlg-btn', onPress: () => { this.askIdol = false; this.altarSig = ''; this.refresh(); } });
      return;
    }
    if (type === CircleType.Lunar) {
      el('p', 'dlg-note', body, `The Moon Goddess's altar. Leave her ${GIFT_GOLD} gold (or ${GIFT_SILVER} silver) and ${GIFT_ROSES} Moon Roses, and she blesses you: one night in every ${BLESSED_EVERY_NIGHTS} is a Bright Night for you.`);
      const purse = el('div', 'hire-purse', body);
      goodRow(purse, Res.Gold, 'Gold', gold);
      goodRow(purse, Res.Silver, 'Silver', silver);
      goodRow(purse, Res.MoonRose, 'Moon Roses', roses);
    } else if (type === CircleType.Boneyard) el('p', 'dlg-note', body, 'An altar of bone. The Headless God Idol stands on it.');
    else el('p', 'dlg-note', body, 'An empty dais.');
    if (taken) el('p', 'dlg-note', body, 'The idol is gone from this altar.');
    const row = el('div', 'dlg-row', body);
    if (type === CircleType.Lunar) {
      this.altarButtons.add(
        row,
        {
          face: 'Leave gifts',
          name: 'Leave gifts',
          description: `A unit leaves the Goddess ${GIFT_GOLD} gold (or ${GIFT_SILVER} silver) and ${GIFT_ROSES} Moon Roses.`,
          className: 'dlg-btn primary',
          onPress: () => this.a.send(this.order(circle, CircleAct.Gift, 0)),
        },
        why?.[1] ?? '',
      );
    }
    if (idol >= 0) {
      this.altarButtons.add(
        row,
        {
          face: 'Take the idol',
          name: 'Take the idol',
          description: `A unit takes the ${goodName(idol)} (asked Yes or No first).`,
          className: 'dlg-btn danger',
          onPress: () => {
            this.askIdol = true;
            this.altarSig = '';
            this.refresh();
          },
        },
        why?.[2] ?? '',
      );
    }
  }
}
