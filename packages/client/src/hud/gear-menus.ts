// The gear menus (Patch 7, plan section 7, the drafts in blueprint/patch7/
// ui-drafts): the weapon, armour and shield slots a unit's panel shows open a
// menu on a right click (Swap for…, Take off, Drop, Scrap), Swap for… lists
// every piece that goes on that line, its bag's first, then the stock's, best
// first, and those that will not fit greyed with the reason; a piece in its
// bag opens Use, Equip, Keep in bag, Give…, Unload, Drop and Scrap. Every row
// of a piece shows its picture, its name in its rarity's colour and its number
// with an arrow against what the unit has now, and its tooltip compares the
// two (gear-compare.ts).
//
// A greyed row still sends its order when clicked (the orders thread's
// contract): the unit says why in its bubble, the Dreadnought "I need
// something for smashing."
import {
  bestFirst,
  fitProblem,
  GearKind,
  gearItem,
  holderKind,
  isGearItem,
  itemGear,
  itemKind,
  itemLine,
  type KitHolder,
  Line,
  LOOT_BAG_TENTHS_LB,
  type Order,
  ownGearItem,
  replacedItem,
  RESOURCES,
  scrapSeconds,
  Troop,
  UnitKind,
} from '@blockyrts/sim';
import type { UnitInfo } from '../game/game-info.ts';
import type { ButtonIcon } from './buttons.ts';
import type { MenuChoice, PopMenu } from './card-pop.ts';
import { compareTip, headNum, rangeText, rarityClass, rarityName, rowValue, shineOf, sizeText } from './gear-compare.ts';
import { goodIcon } from './inventory-icons.ts';

/** What the menus read and do, given by the HUD. */
export interface GearMenuDeps {
  player: number;
  /** What one of the player's units carries in its bag, (good, count) pairs. */
  bag(unit: number): ReadonlyArray<readonly [number, number]>;
  /** How many of a good the stock holds. */
  have(res: number): number;
  /** Whether a good is kept in a unit's bag (Keep in bag). */
  kept(unit: number, res: number): boolean;
  /** Whether the next order joins the queue (Shift held). */
  queued(): boolean;
  send(o: Order): void;
  /** Give…: the next left click on one of the player's units sends this one to hand it over. */
  startGive(unit: number, res: number): void;
  /** Scrap: null when the good is not scrapped at all, '' when there is a Workshop to scrap it at, else why not. */
  scrapWhy(res: number): string | null;
  /** The item's own Use (item-menu.ts), greyed with the reason when it has none. */
  use(unit: number, res: number): MenuChoice;
}

/** The kit rules' view of one unit, or null for one that wears no kit (an animal, an engine): as the sim's holderOf, its looted pieces' goods too. */
export function holderOf(u: UnitInfo): KitHolder | null {
  const kind = holderKind(u.kind);
  if (!kind) return null;
  const h: KitHolder = { kind, troop: u.troop, w: u.wTier, a: u.aTier, s: u.sTier, t: u.tips };
  const wItem = ownGearItem(kind === 'warrior' && u.troop === Troop.Ranger ? u.ranged : u.weapon);
  const aItem = ownGearItem(u.armour);
  const sItem = ownGearItem(u.shield);
  if (wItem !== undefined) h.wItem = wItem;
  if (aItem !== undefined) h.aItem = aItem;
  if (sItem !== undefined) h.sItem = sItem;
  return h;
}

/** The gear row a unit has on a line (0 weapon: a ranger's bow, a worker's tools, a mage's wand; 1 armour or robe; 2 shield), 0 for none. */
export function wornGear(u: UnitInfo, line: number): number {
  if (line === Line.Armour) return u.armour;
  if (line === Line.Shield) return u.shield;
  if (u.kind === UnitKind.Worker) return u.tools[0];
  return u.troop === Troop.Ranger ? u.ranged : u.weapon;
}

/** The good a unit's piece on a line comes off as, or undefined (fists, no armour). */
export function wornItem(u: UnitInfo, line: number): number | undefined {
  const g = wornGear(u, line);
  const own = g ? gearItem(g) : undefined;
  if (own !== undefined) return own;
  const h = holderOf(u);
  return h ? replacedItem(h, line) : undefined;
}

/** Whether a piece belongs on this unit's line at all, fitting or not (a swordsman's weapon slot lists every weapon, not tools or wands). */
function sameFamily(u: UnitInfo, line: number, res: number): boolean {
  const kind = itemKind(res);
  if (itemLine(res) !== line) return false;
  if (line !== Line.Weapon) return true;
  if (u.kind === UnitKind.Worker) return kind === GearKind.Tools;
  if (u.kind === UnitKind.Mage) return kind === GearKind.Wand;
  return kind !== GearKind.Tools && kind !== GearKind.Wand;
}

const nameOf = (res: number): string => RESOURCES[res]?.name ?? 'Item';
const lower = (res: number): string => nameOf(res).toLowerCase();
const weight = (res: number): number => Math.max(1, RESOURCES[res]?.weightTenthsLb ?? 1);

/** A good's picture for a menu row, tinted where it borrows another's. */
export function goodPic(res: number): ButtonIcon | undefined {
  const g = goodIcon(res);
  return g ? { layers: [g.tint ? { file: g.file, filter: g.tint } : { file: g.file }] } : undefined;
}

/** What a unit's bag still takes, tenths of a pound (units/loot.ts bagFreeTenthsLb: 25 lb, a gathered load counting too). */
export function bagFree(u: UnitInfo, bag: ReadonlyArray<readonly [number, number]>): number {
  let w = 0;
  for (const [r, n] of bag) w += weight(r) * n;
  const load = u.carryAmt > 0 ? weight(u.carryRes) * u.carryAmt : 0;
  return Math.max(0, LOOT_BAG_TENTHS_LB - w - Math.min(LOOT_BAG_TENTHS_LB, load));
}

/** "Bag full" when the piece it has on would not fit in its bag (less what leaves it, `out`), '' when it would or there is none. */
function bagFull(u: UnitInfo, line: number, bag: ReadonlyArray<readonly [number, number]>, out = -1): string {
  const old = wornItem(u, line);
  if (old === undefined) return '';
  return bagFree(u, bag) + (out >= 0 ? weight(out) : 0) >= weight(old) ? '' : 'Bag full';
}

/** Why a piece in a unit's bag cannot go on now (Equip, a drag onto it): it does not fit, or the piece it has would not fit in its bag; '' when it can. */
export function equipBagWhy(u: UnitInfo, res: number, d: GearMenuDeps): string {
  const h = holderOf(u);
  if (!h) return 'It wears no gear.';
  const line = itemLine(res);
  return fitProblem(h, res) || (line >= 0 ? bagFull(u, line, d.bag(u.id), res) : '');
}

/** What a line is called with nothing on it. */
function emptyName(u: UnitInfo, line: number): string {
  if (line === Line.Armour) return u.kind === UnitKind.Mage ? 'No robe' : 'No armour';
  if (line === Line.Shield) return 'No shield';
  if (u.kind === UnitKind.Worker) return 'No tools';
  return u.kind === UnitKind.Mage ? 'No wand' : 'Fists';
}

/** What taking a line's piece off leaves it with. */
function withoutText(u: UnitInfo, line: number): string {
  if (line === Line.Armour) return u.kind === UnitKind.Mage ? 'It goes without a robe until it wears another.' : 'It goes without armour until it wears another.';
  if (line === Line.Shield) return 'It fights without a shield until it holds another.';
  if (u.kind === UnitKind.Worker) return 'It works with its bare hands until it holds others.';
  return u.kind === UnitKind.Mage ? 'It casts without a wand until it holds another.' : 'It fights with its fists until it holds another.';
}

/** The pieces that go on a unit's line, from its bag and the stock: those that fit (best first) and those that will not (with why). */
export function swapList(u: UnitInfo, line: number, d: GearMenuDeps): { bag: number[]; stock: number[]; not: Array<{ res: number; from: 'bag' | 'stock'; why: string }> } {
  const h = holderOf(u);
  const out = { bag: [] as number[], stock: [] as number[], not: [] as Array<{ res: number; from: 'bag' | 'stock'; why: string }> };
  if (!h) return out;
  const sort = (rs: number[]): number[] => bestFirst(h, rs);
  for (const [from, list] of [
    ['bag', d.bag(u.id).filter(([, n]) => n > 0).map(([r]) => r)],
    ['stock', RESOURCES.map((_, r) => r).filter((r) => d.have(r) > 0)],
  ] as const) {
    const ok: number[] = [];
    for (const r of list) {
      if (!isGearItem(r) || !sameFamily(u, line, r)) continue;
      const why = fitProblem(h, r);
      if (why) out.not.push({ res: r, from, why });
      else ok.push(r);
    }
    out[from] = sort(ok);
  }
  return out;
}

/** A piece's row: its picture, name in its rarity's colour (with how many where there are more), its size, its number against what the unit has. */
function pieceRow(u: UnitInfo, line: number, res: number, count: number, where: string): MenuChoice {
  const h = holderOf(u);
  const now = wornGear(u, line);
  const gear = h ? itemGear(res, h) : 0;
  const shine = shineOf(res);
  const icon = goodPic(res);
  const value = gear ? rowValue(gear, h, now) : undefined;
  return {
    name: count > 1 ? `${nameOf(res)} ×${count}` : nameOf(res),
    description: '',
    run: () => undefined,
    note: sizeText(res, h),
    nameClass: rarityClass(res),
    compare: compareTip(res, h, now, where),
    ...(icon ? { icon } : {}),
    ...(shine ? { shine } : {}),
    ...(value ? { value } : {}),
  };
}

/** Swap for… (the drafts' scenes 2, 4, 5 and 7): its bag's pieces, the stock's, then those that will not fit. */
export function swapPage(u: UnitInfo, line: number, d: GearMenuDeps): PopMenu {
  const list = swapList(u, line, d);
  const now = wornItem(u, line);
  const bag = d.bag(u.id);
  const units = [u.id];
  const rows: MenuChoice[] = [];
  const nowNum = nowWords(u, line);
  let best: MenuChoice | null = null;
  for (const r of list.bag) {
    const full = bagFull(u, line, bag, r);
    const equipBag = (): void => d.send({ kind: 'equipBag', player: d.player, units, res: r });
    const c: MenuChoice = {
      ...pieceRow(u, line, r, bag.find(([x]) => x === r)?.[1] ?? 1, 'in its bag'),
      group: 'In its bag · puts it on now',
      description: now !== undefined ? `Puts it on now. Its ${lower(now)} goes into its bag.` : 'Puts it on now.',
      run: equipBag,
      ...(full ? { why: full, greyRun: equipBag } : {}),
    };
    rows.push(c);
    if (!full && !best && c.value?.dir !== 'down' && c.value?.dir !== 'same') best = c;
  }
  for (const r of list.stock) {
    const equip = (): void => d.send({ kind: 'equip', player: d.player, units, res: r, queued: d.queued() });
    const c: MenuChoice = {
      ...pieceRow(u, line, r, d.have(r), `in the stock ×${d.have(r)}`),
      group: 'In the stock · walks to the nearest store point',
      description: `It walks to the nearest store point or upgrade place and puts it on there.${now !== undefined ? ` Its ${lower(now)} goes to the stock.` : ''}`,
      run: equip,
    };
    rows.push(c);
    if (!best && c.value?.dir !== 'down' && c.value?.dir !== 'same') best = c;
  }
  for (const n of list.not) {
    // Still sent when clicked: the unit says why (the Dreadnought: "I need something for smashing.").
    const send = (): void =>
      n.from === 'bag' ? d.send({ kind: 'equipBag', player: d.player, units, res: n.res }) : d.send({ kind: 'equip', player: d.player, units, res: n.res, queued: d.queued() });
    rows.push({ ...pieceRow(u, line, n.res, n.from === 'bag' ? 1 : d.have(n.res), n.from === 'bag' ? 'in its bag' : `in the stock ×${d.have(n.res)}`), group: 'Will not fit', description: '', why: n.why, run: send, greyRun: send });
  }
  // The best pick is lit, as the drafts mark it: the first that beats what it has.
  if (best) best.lit = true;
  return {
    title: 'Swap for…',
    sub: now !== undefined ? `its ${lower(now)}${nowNum ? `, ${nowNum}` : ''}` : emptyName(u, line).toLowerCase(),
    choices: rows,
    foot: line === Line.Armour ? 'Best first. Pieces that fit nobody can still be scrapped at the Workshop.' : 'Best first. Its old piece goes where the new one came from.',
  };
}

/** What the unit has on a line now in a few words ("17 damage a second"), '' with nothing that has a number. */
function nowWords(u: UnitInfo, line: number): string {
  const h = holderOf(u);
  const g = wornGear(u, line);
  return h && g ? (headNum(g, h)?.words ?? '') : '';
}

/** Whether a slot on this line opens a menu: a line the unit can change (not the brawler's pistol and cutlass, a crewman's fists or a woodsman's missing armour). */
export function slotHasMenu(u: UnitInfo, line: number): boolean {
  if (u.troop === Troop.Dreadnought) return line === Line.Weapon || line === Line.Armour;
  if (u.troop === Troop.Crew) return false;
  if (u.troop === Troop.Brawler) return line === Line.Armour;
  if (u.troop === Troop.Woodsman) return line === Line.Weapon;
  if (line === Line.Shield) return u.troop === Troop.Close;
  if (u.kind === UnitKind.Worker) return line === Line.Weapon;
  return line === Line.Weapon || line === Line.Armour;
}

/** A gear slot's menu (the drafts' scene 1): Swap for…, Take off, Drop, Scrap. */
export function slotMenu(u: UnitInfo, line: number, d: GearMenuDeps): PopMenu {
  const res = wornItem(u, line);
  const h = holderOf(u);
  const units = [u.id];
  const list = swapList(u, line, d);
  const fit = list.bag.length + list.stock.length;
  const page = swapPage(u, line, d);
  const better = page.choices.some((c) => c.lit);
  const choices: MenuChoice[] = [
    {
      name: 'Swap for…',
      description: 'Every piece that goes on here, from its bag and the stock, best first.',
      note: fit > 0 ? `${fit} ${fit === 1 ? 'piece fits' : 'pieces fit'}: ${list.bag.length} in its bag, ${list.stock.length} in the stock.` : 'Nothing in its bag or the stock fits.',
      run: () => undefined,
      ...(page.choices.length > 0 ? { page: () => swapPage(u, line, d) } : { why: 'Nothing in its bag or the stock goes on here.' }),
      ...(better ? { lit: true } : {}),
    },
  ];
  const none = res === undefined ? 'It has nothing on here.' : '';
  const full = none || bagFull(u, line, d.bag(u.id));
  const takeOff = (): void => d.send({ kind: 'takeOff', player: d.player, units, line, drop: 0 });
  choices.push({ name: 'Take off', description: 'Into its bag.', note: `Into its bag. ${withoutText(u, line)}`, run: takeOff, ...(full ? { why: full, ...(none ? {} : { greyRun: takeOff }) } : {}) });
  const drop = (): void => d.send({ kind: 'takeOff', player: d.player, units, line, drop: 1 });
  choices.push({ name: 'Drop', description: 'Put it on the ground here.', note: 'Put it on the ground here.', run: drop, ...(none ? { why: none } : {}) });
  const scrap = res === undefined ? null : d.scrapWhy(res);
  if (res !== undefined && scrap !== null) {
    const send = (): void => d.send({ kind: 'scrapItem', player: d.player, units, res, worn: 1, building: 0 });
    const s = scrapSeconds(res);
    choices.push({ name: 'Scrap', description: `It carries it to the Workshop and breaks it down, ${s} s.`, note: `It carries it to the Workshop and breaks it down, ${s} s.`, run: send, ...(scrap ? { why: scrap } : {}) });
  }
  return {
    title: res !== undefined ? nameOf(res) : emptyName(u, line),
    titleClass: res !== undefined ? rarityClass(res) : '',
    sub: res !== undefined ? [rarityName(res), sizeText(res, h)].filter((s) => s).join(' · ') : h ? rangeText(h) : '',
    choices,
  };
}

/** A piece in one unit's bag (the drafts' scene 6): Use, Equip, Keep in bag, Give…, Unload, Drop, Scrap. */
export function bagMenu(u: UnitInfo, res: number, d: GearMenuDeps): PopMenu {
  const h = holderOf(u);
  const units = [u.id];
  const n = d.bag(u.id).find(([r]) => r === res)?.[1] ?? (u.carryRes === res ? u.carryAmt : 0);
  const name = lower(res);
  const choices: MenuChoice[] = [d.use(u.id, res)];
  const gear = isGearItem(res);
  if (gear && h) {
    const line = itemLine(res);
    const old = line >= 0 ? wornItem(u, line) : undefined;
    const why = equipBagWhy(u, res, d);
    const equip = (): void => d.send({ kind: 'equipBag', player: d.player, units, res });
    const g = itemGear(res, h);
    const value = g && line >= 0 ? rowValue(g, h, wornGear(u, line)) : undefined;
    choices.push({
      name: 'Equip',
      description: old !== undefined ? `Puts it on now, in place of its ${lower(old)}, which goes into its bag.` : 'Puts it on now.',
      note: old !== undefined ? `In place of its ${lower(old)}, which goes into its bag.` : 'Puts it on now.',
      run: equip,
      compare: compareTip(res, h, line >= 0 ? wornGear(u, line) : 0, 'in its bag'),
      ...(value ? { value } : {}),
      ...(why ? { why, greyRun: equip } : value?.dir === 'up' || (old === undefined && !why) ? { lit: true } : {}),
    });
  }
  const kept = d.kept(u.id, res);
  choices.push(
    kept
      ? { name: 'Stop keeping', icon: { layers: [{ file: 'icon_padlock_closed' }] }, description: `It hands the ${name} in again with the rest of its bag.`, note: 'It hands it in with the rest again.', run: () => d.send({ kind: 'keepItem', player: d.player, units, res, on: 0 }) }
      : { name: 'Keep in bag', icon: { layers: [{ file: 'icon_padlock_closed' }] }, description: `It keeps the ${name} when it hands its bag in at dawn or near a store point.`, note: 'It keeps it when it hands its bag in.', run: () => d.send({ kind: 'keepItem', player: d.player, units, res, on: 1 }) },
    { name: 'Give…', description: 'Then click one of your units nearby. It walks over and hands it across.', note: 'Then click one of your units.', run: () => d.startGive(u.id, res) },
    { name: 'Unload', description: `Take all the ${name} it carries to the nearest drop-off that takes it, then carry on.`, note: 'Takes all of it to the nearest store point.', run: () => d.send({ kind: 'unloadItem', player: d.player, units, res }) },
    { name: 'Drop', description: `Put all the ${name} it carries down on the ground here. Nobody picks it up unless sent to it.`, note: 'Put it on the ground here.', run: () => d.send({ kind: 'dropItem', player: d.player, units, res }) },
  );
  const scrap = gear ? d.scrapWhy(res) : null;
  if (scrap !== null) {
    const s = scrapSeconds(res);
    choices.push({ name: 'Scrap', description: `It carries it to the Workshop and breaks it down, ${s} s.`, note: `It carries it to the Workshop, ${s} s.`, run: () => d.send({ kind: 'scrapItem', player: d.player, units, res, worn: 0, building: 0 }), ...(scrap ? { why: scrap } : {}) });
  }
  return {
    title: nameOf(res),
    titleClass: rarityClass(res),
    sub: [gear ? 'in its bag' : `in its bag ×${n}`, gear ? sizeText(res, h) : '', gear ? rarityName(res) : ''].filter((s) => s).join(' · '),
    choices,
  };
}
