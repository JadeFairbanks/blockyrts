// The stone circles' panels (Patch 5): a bluestone chest's five spaces to
// take from (SC-6), an altar (SCA-2): leave the Moon Goddess her gifts, or
// take the idol, asked Yes or No first; the Great White Ape's goods (SCA-2)
// and the factions the Headless God Idol can turn the player's waves on
// (SCB-4). The same pattern as the trade
// menus (decisions 2.16 lists the stone circle menu with them): the title and
// its × stay put while the body scrolls, and every good keeps its picture,
// name and count at full size.
import {
  APE_LINES,
  BLESSED_EVERY_NIGHTS,
  CHEST_SLOTS,
  CIRCLE_TYPE_NAMES,
  CircleAct,
  CircleType,
  ENCOUNTERS,
  GIFT_GOLD,
  GIFT_ROSES,
  GIFT_SILVER,
  goodName,
  HEADLESS,
  IDOL_USE_EVERY_NIGHTS,
  Res,
  UnitKind,
  type Order,
} from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { ButtonRegistry } from './buttons.ts';
import { goodRow } from './goods-ui.ts';
import { registerItemUse } from './item-menu.ts';
import type { HudPanels } from './panels.ts';
import { Buttons, el, frame } from './peoples-ui.ts';
import { gameScroll } from './game-scroll.ts';

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

/** What the Great White Ape trades (SCA-2), in the order of the sim's goods (0, 1, 2), and how many of each a bundle holds. */
const APE_GOODS: ReadonlyArray<readonly [Res, number]> = [
  [Res.HawthorneFruit, ENCOUNTERS.ape.goods.fruit],
  [Res.Honey, ENCOUNTERS.ape.goods.honey],
  [Res.EnchantedWine, ENCOUNTERS.ape.goods.wine],
];

/**
 * The Stone Circle items' own entries in the item menu (decisions 3.6: "Use,
 * Equip, Plant seed, ..."): Plant seed for an Ancient Seed (SC-8), Play for
 * the Pan Flute (SC-11), Use for the Moon Goddess idol (answer 2.8) and the
 * Headless God Idol (SCB-4, which asks for the faction first) and Drink for
 * enchanted wine in a mage's own inventory (answer 2.5). Each is greyed out
 * with the sim's reason when it cannot be used now (circles/items.ts).
 */
export function registerCircleItemUses(game: GameInfo, player: number, send: (o: Order) => void, startPlant: () => void, openHeadless: () => void): void {
  const inStock = (at: { unit: number | null }, what: string): string =>
    at.unit !== null ? `Unload it to the stock first: ${what} is used from there.` : '';
  const simWhy = (res: number): string => game.info?.circles?.uses.find((u) => u[0] === res)?.[2] ?? 'There is none in the stock.';
  registerItemUse(Res.AncientSeed, {
    name: 'Plant seed',
    description: 'Then left click grass or dirt: your selected workers, or the nearest worker, go and plant it there. It grows into a Sweet Hawthorne over 5 nights.',
    why: (at) => inStock(at, 'an Ancient Seed') || (game.have(Res.AncientSeed) > 0 ? '' : 'There is none in the stock.'),
    run: () => startPlant(),
  });
  registerItemUse(Res.PanFlute, {
    name: 'Play',
    description: 'Play a peaceful tune: every neutral animal within 300 m makes its way to your main base. It can be played 10 times.',
    why: (at) => inStock(at, 'the Pan Flute') || simWhy(Res.PanFlute),
    run: () => send({ kind: 'useItem', player, res: Res.PanFlute, unit: -1 }),
  });
  registerItemUse(Res.MoonIdol, {
    description: `Make the coming night a Bright Night for you, once every ${IDOL_USE_EVERY_NIGHTS} nights.`,
    why: (at) => inStock(at, 'the idol') || simWhy(Res.MoonIdol),
    run: () => send({ kind: 'useItem', player, res: Res.MoonIdol, unit: -1 }),
  });
  registerItemUse(Res.HeadlessIdol, {
    description: `Turn the coming night's waves of monsters away from you and onto a faction you are at war with, or declare war on one with it. Once every ${HEADLESS.everyNights} nights.`,
    why: (at) => inStock(at, 'the idol') || simWhy(Res.HeadlessIdol),
    run: () => openHeadless(),
  });
  registerItemUse(Res.EnchantedWine, {
    name: 'Drink',
    description: 'A mage drinks it and gets back 50 mana. In the stock it is food like any other.',
    why: (at) => {
      if (at.unit === null) return 'A mage drinks it from their own inventory: right click it there.';
      return game.unit(at.unit)?.kind === UnitKind.Mage ? '' : 'Only a mage can drink enchanted wine for mana.';
    },
    run: (at) => send({ kind: 'useItem', player, res: Res.EnchantedWine, unit: at.unit ?? -1 }),
  });
}

export class CirclesUi {
  private readonly chest: HTMLElement;
  private readonly altar: HTMLElement;
  private readonly apePanel: HTMLElement;
  private readonly headless: HTMLElement;
  private readonly chestButtons: Buttons;
  private readonly altarButtons: Buttons;
  private readonly apeButtons: Buttons;
  private readonly headlessButtons: Buttons;
  /** The Great White Ape's goods open: his circle, or -1. */
  private apeCircle = -1;
  /** The Headless God Idol's factions are open. */
  private headlessOpen = false;
  private apeSig = '';
  private headlessSig = '';
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
    this.apePanel = el('div', 'panel circle-dialog ape-dialog', root);
    this.headless = el('div', 'panel circle-dialog headless-dialog', root);
    for (const p of [this.chest, this.altar, this.apePanel, this.headless]) {
      p.hidden = true;
      gameScroll(p);
    }
    panels.register('chest', this.chest);
    panels.register('altar', this.altar);
    panels.register('ape', this.apePanel);
    panels.register('headless', this.headless);
    this.chestButtons = new Buttons(buttons, 'chest');
    this.altarButtons = new Buttons(buttons, 'altar');
    this.apeButtons = new Buttons(buttons, 'ape');
    this.headlessButtons = new Buttons(buttons, 'headless');
  }

  /** Right click on the Great White Ape at peace with the player: his goods. */
  openApe(circle: number): void {
    this.closeAll();
    this.apeCircle = circle;
    this.apePanel.hidden = false;
    this.apeSig = '';
    this.refresh();
  }

  /** The Headless God Idol's Use: the factions it can turn the player's waves on. */
  openHeadless(): void {
    this.closeAll();
    this.headlessOpen = true;
    this.headless.hidden = false;
    this.headlessSig = '';
    this.refresh();
  }

  private closeAll(): void {
    this.closeChest();
    this.closeAltar();
    this.closeApe();
    this.closeHeadless();
  }

  /** One of the player's units opened a bluestone chest: its spaces show. */
  openChest(key: number): void {
    this.closeAll();
    this.chestKey = key;
    this.chest.hidden = false;
    this.chestSig = '';
    this.refresh();
  }

  /** Right click on an altar. */
  openAltar(circle: number, type: number): void {
    this.closeAll();
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
    if (this.apeCircle >= 0) {
      this.closeApe();
      return true;
    }
    if (this.headlessOpen) {
      this.closeHeadless();
      return true;
    }
    return false;
  }

  /** Each info update: whatever is open shows the latest. */
  refresh(): void {
    if (this.chestKey >= 0) this.drawChest();
    if (this.altarAt.circle >= 0) this.drawAltar();
    if (this.apeCircle >= 0) this.drawApe();
    if (this.headlessOpen) this.drawHeadless();
  }

  private closeApe(): void {
    this.apeCircle = -1;
    this.apePanel.hidden = true;
    this.apeButtons.clear();
  }

  private closeHeadless(): void {
    this.headlessOpen = false;
    this.headless.hidden = true;
    this.headlessButtons.clear();
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
    // SCA-4: the Great White Ape, while he lives, warns whoever would take the idol.
    const ape = type === CircleType.Lunar && (v?.apes.some((a) => a.circle === circle) ?? false);
    const sig = JSON.stringify([why, taken, gold, silver, roses, this.askIdol, v?.blessed, ape]);
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
      if (ape) el('p', 'dlg-why', body, `The Great White Ape is watching: "${APE_LINES.idolWarn}"`);
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

  /** The Great White Ape's goods (SCA-2), in the trade menus' pattern: a bundle of each for silver, so many a day; a unit walks to him to buy. */
  private drawApe(): void {
    const circle = this.apeCircle;
    const v = this.game.info?.circles?.apes.find((a) => a.circle === circle) ?? null;
    const silver = this.game.have(Res.Silver);
    const sig = JSON.stringify([v, silver]);
    if (sig === this.apeSig) return;
    this.apeSig = sig;
    this.apeButtons.clear();
    const { head, body } = frame(this.apePanel, 'Great White Ape');
    this.apeButtons.add(head, { face: '×', name: 'Close', description: 'Close (Esc).', className: 'dlg-close', onPress: () => this.closeApe() });
    if (!v) {
      el('p', 'dlg-note', body, 'The Great White Ape is not here.');
      return;
    }
    const g = ENCOUNTERS.ape.goods;
    el('p', 'dlg-note', body, `He tends the Moon Goddess's garden and trades its gifts: a bundle for ${g.silver} silver, ${g.perDay} bundles of each a day. Your selected unit walks over to buy.`);
    const purse = el('div', 'hire-purse', body);
    goodRow(purse, Res.Silver, 'Silver', silver);
    const list = el('div', 'dlg-row', body);
    APE_GOODS.forEach(([res, n], good) => {
      const left = v.left[good] ?? 0;
      const name = goodName(res);
      this.apeButtons.good(
        list,
        res,
        `×${n}`,
        {
          name: `Buy ${n} ${name}`,
          description: `A unit buys ${n} ${name.toLowerCase()} from him for ${g.silver} silver. ${left} ${left === 1 ? 'bundle' : 'bundles'} left today.`,
          className: 'dlg-btn bundle',
          onPress: () => this.a.send(this.order(circle, CircleAct.Buy, good)),
        },
        v.why || (left <= 0 ? 'He has no more of that today.' : silver < g.silver ? `It costs ${g.silver} silver.` : ''),
      );
    });
    el('p', 'dlg-note', body, `Left today: ${APE_GOODS.map(([res], k) => `${v.left[k] ?? 0} of ${goodName(res).toLowerCase()}`).join(', ')}.`);
  }

  /** The Headless God Idol (SCB-4): the factions it can turn the coming night's waves on; one at peace is declared war on. */
  private drawHeadless(): void {
    const v = this.game.info?.circles;
    const why = v?.uses.find((u) => u[0] === Res.HeadlessIdol)?.[2] ?? 'You have no Headless God Idol.';
    const targets = v?.headless ?? [];
    const names = targets.map(([id]) => this.game.faction(id)?.title ?? 'A settlement you have seen');
    const sig = JSON.stringify([why, targets, names]);
    if (sig === this.headlessSig) return;
    this.headlessSig = sig;
    this.headlessButtons.clear();
    const { head, body } = frame(this.headless, 'Headless God Idol');
    this.headlessButtons.add(head, { face: '×', name: 'Close', description: 'Close (Esc).', className: 'dlg-close', onPress: () => this.closeHeadless() });
    el('p', 'dlg-note', body, `The coming night's waves of monsters fall on the faction you choose instead of on you. Once every ${HEADLESS.everyNights} nights.`);
    if (why) el('p', 'dlg-why', body, why);
    const list = el('div', 'dlg-row', body);
    targets.forEach(([id, war], k) => {
      this.headlessButtons.add(
        list,
        {
          face: war ? names[k]! : `${names[k]!} (declares war)`,
          name: `Unleash your waves on ${names[k]!}`,
          description: war ? 'You are at war with them: the coming night, your waves fall on them.' : 'Using the idol on them declares war on them, and the coming night your waves fall on them.',
          className: 'dlg-btn danger',
          onPress: () => {
            this.a.send({ kind: 'useItem', player: this.player, res: Res.HeadlessIdol, unit: -1, arg: id });
            this.closeHeadless();
          },
        },
        why,
      );
    });
  }
}
