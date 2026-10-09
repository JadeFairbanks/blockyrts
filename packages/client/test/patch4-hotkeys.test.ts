import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, productsOf, productSpec, RESEARCH_PRODUCT, RESOURCE_COUNT, TROOP_PRODUCT, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { HUD_LETTERS, makeAction, makeList, makesOne, menuLetters, MORE_ACTION, placeAction } from '../src/hud/menu-keys.ts';
import { ACTIONS, keyFor, sanitizeBindings } from '../src/input/bindings.ts';
import { keyLabel } from '../src/input/keys.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Jade's Patch 4: the build menu's hotkeys no longer follow the grid (the key
// in the button's place on the keyboard, Q to V, with B Back). Every button
// in the build menu and the K menus is on a letter named after it, shown on
// the button and rebound in the settings like every other command; Esc is
// Back and + turns a long menu's page.

const ME = 0;
const PRESS = { shift: false, ctrl: false };

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: BUILDINGS[kind]!.name, upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, room: 0, fixedEngine: 0, ...o,
  };
}

function game(buildings: BuildingInfo[]): GameInfo {
  const g = new GameInfo(ME);
  const data = new Int32Array(2 * STATE_STRIDE);
  for (let i = 0; i < 2; i++) {
    const o = i * STATE_STRIDE;
    data[o + S.id] = i + 1;
    data[o + S.owner] = ME;
    data[o + S.rank] = 1;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = 255;
  }
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: 2, data, shots: new Int32Array(0), hits: [] });
  const info: InfoMessage = {
    type: 'info', step: 10, pool: new Int32Array(RESOURCE_COUNT), supplyUsed: 2, supplyCap: 8, buildings, queues: [[1, []], [2, []]], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

function harness(g: GameInfo, selection: Selectable[], active: string, most = 40) {
  const sent: Order[] = [];
  const keys: Record<string, string> = {};
  const deps: CommandDeps = {
    player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys }, selection: () => selection, activeType: () => active,
    send: (o) => sent.push(o), queued: () => false, held: () => false, message: () => undefined, marker: () => undefined,
    askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
    slots: () => ({ most }),
  };
  return { c: new Commands(deps), sent, keys };
}

/** Shrinks the card to 8 buttons, so Defences' 12 choices page. */
function small(c: Commands): void {
  (c as unknown as { d: CommandDeps }).d.slots = () => ({ most: 8 });
}

const workers: Selectable[] = [1, 2].map((id) => ({ key: `e:${id}`, kind: 'unit', owner: ME, typeKey: 'worker', centre: new THREE.Vector3(), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: 'Worker' }));

function picked(b: BuildingInfo): Selectable {
  return { key: `b:${b.id}`, kind: 'building', owner: ME, typeKey: `building:${b.kind}:${b.level}`, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(3, 3, 3), label: b.name };
}

function button(card: Card, face: string): CardEntry {
  const e = card.find((x) => x.face === face);
  if (!e) throw new Error(`no ${face} on the card: ${card.map((x) => x.face).join(', ')}`);
  return e;
}

/** A card as "Name=K" pairs, as the tooltips read. */
const read = (card: Card): string[] => card.map((e) => `${e.name}=${keyLabel(e.key)}`);

/** A building's products as the sim worker sends them, none greyed. */
const products = (kind: number): Array<[number, string]> => productsOf({ kind, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, '']);

describe('the build menu on letters (Patch 4)', () => {
  it('puts every building on a letter of its name, Back on Esc', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    button(c.card(), 'Build').run(PRESS);
    expect(read(c.card())).toEqual([
      'Big House=H', 'Farm=F', 'Barn=R', 'Storehouse=S', 'Fishing dock=I', 'Workshop=W', 'Forge=G',
      'Artillery workshop=A', 'Barracks=B', 'Magi Sanctum=M', "Scholar's Lodge=C", 'Mineshaft=N', 'Defences=D', 'Lights=T', 'Back=Esc',
    ]);
    button(c.card(), 'Defences').run(PRESS);
    expect(read(c.card())).toEqual([
      'Wooden wall=W', 'Hardwood wall=H', 'Stone wall=S', 'Earth rampart=M',
      'Wooden gate (east to west)=G', 'Wooden gate (north to south)=F', 'Hardwood gate (east to west)=A', 'Hardwood gate (north to south)=D',
      'Stone gate (east to west)=E', 'Stone gate (north to south)=U',
      'Wooden tower=T', 'Hardwood tower=R', 'Stone tower=N', 'Back=Esc',
    ]);
    c.back();
    button(c.card(), 'Lights').run(PRESS);
    // B, T, T: a torch post.
    expect(read(c.card())).toEqual(['Torch post=T', 'Bonfire=B', 'Back=Esc']);
  });

  it('keeps the letters on a page of a menu too long for the card, with More on +', () => {
    // A phone's card shows 15, which holds Defences' 13 choices (Patch 5 cut the earthworks and added the earth rampart); on a card of 8 they take three pages.
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker', 15);
    button(c.card(), 'Build').run(PRESS);
    button(c.card(), 'Defences').run(PRESS);
    small(c);
    const first = c.card();
    expect(read(first).slice(-2)).toEqual(['Next page=+', 'Back=Esc']);
    expect(read(first)[0]).toBe('Wooden wall=W');
    // Six a page, then More and Back.
    first.at(-2)!.run(PRESS);
    expect(read(c.card())).toEqual([
      'Hardwood gate (east to west)=A', 'Hardwood gate (north to south)=D', 'Stone gate (east to west)=E', 'Stone gate (north to south)=U',
      'Wooden tower=T', 'Hardwood tower=R', 'Next page=+', 'Back=Esc',
    ]);
  });

  it('shows a rebound key on the button, and a button rebound onto + is a click while More is on its page', () => {
    const { c, keys } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker', 15);
    keys[placeAction(BuildingKind.Farm, 0)] = 'KeyY';
    button(c.card(), 'Build').run(PRESS);
    expect(button(c.card(), 'Farm').key).toBe('KeyY');
    keys[placeAction(BuildingKind.Wall, 0)] = 'Equal';
    button(c.card(), 'Defences').run(PRESS);
    small(c);
    expect(button(c.card(), 'Wooden wall').key).toBe('');
    expect(button(c.card(), 'More 1/3').key).toBe('Equal');
  });

  it('never teaches the grid in a tooltip', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    const build = button(c.card(), 'Build');
    expect(build.description).not.toMatch(/grid|B is Back/i);
    expect(build.description).toContain('Esc goes back');
  });
});

describe('the K menus on letters (Patch 4)', () => {
  it('puts each product on a letter of its name', () => {
    const forge = building(30, BuildingKind.Forge, { products: products(BuildingKind.Forge) });
    const { c } = harness(game([building(9, BuildingKind.MainBase), forge]), [picked(forge)], `building:${BuildingKind.Forge}:1`);
    // The Forge opens on its menu (Patch 3), with no Back.
    expect(read(c.card())).toEqual([
      'Copper ingot=C', 'Tin ingot=T', 'Bronze ingots (10)=B', 'Wrought iron=W', 'Pig iron=P', 'Iron ingot=I',
      'Steel ingot=S', 'Carbon steel ingot=A', 'Charcoal (3)=H', 'Bricks (4)=R', 'Glass=G', 'Gunpowder=U',
    ]);
    expect(c.card().every((e) => e.menu)).toBe(true);
  });

  it('skips the word every product shares: the Barn slaughters a cow on C, a chicken on H and an ox on X', () => {
    const barn = building(31, BuildingKind.Barn, { products: products(BuildingKind.Barn) });
    const { c } = harness(game([barn]), [picked(barn)], `building:${BuildingKind.Barn}:1`);
    expect(c.card().map((e) => [productSpec(e.product!).name, keyLabel(e.key)])).toEqual([
      ['Slaughter a cow', 'C'],
      ['Slaughter a chicken', 'H'],
      ['Slaughter a ox', 'X'],
    ]);
  });

  it('gives the Workshop\'s products their letters while letters from their names last, and pages with More on +', () => {
    const shop = building(32, BuildingKind.Workshop, { products: products(BuildingKind.Workshop) });
    const { c, sent } = harness(game([shop]), [picked(shop)], `building:${BuildingKind.Workshop}:1`, 15);
    // It opens on its menu with no Back (Patch 3): thirteen a page and More.
    const card = c.card();
    expect(card).toHaveLength(14);
    // Patch 5: one Planks from either lumber, so Hardened leather takes the H.
    expect(read(card).slice(0, 5)).toEqual(['Planks=P', 'Leather=E', 'Hardened leather=H', 'Rope=R', 'Bandage=B']);
    expect(read(card).at(-1)).toBe('Next page=+');
    expect(card.at(-1)!.face).toBe('More 1/3');
    card[0]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'produce', building: 32 });
    // Its twenty-eight trinkets cannot all have a letter from their names: twenty of the 39 get one (Patch 5 cut 4 recipes); the rest are clicks until given a key in the settings.
    const all = makeList(BuildingKind.Workshop).map((p) => keyFor({}, makeAction(BuildingKind.Workshop, p)));
    expect(all.filter((k) => k !== '').length).toBe(20);
    expect(all.filter((k) => k === '').length).toBe(19);
  });

  it('makes rope on the Big House\'s K, with no menu behind it (Patch 5)', () => {
    const house = building(20, BuildingKind.MainBase, { products: products(BuildingKind.MainBase) });
    const { c } = harness(game([house]), [picked(house)], 'building:0:1');
    const rope = button(c.card(), 'Make rope');
    expect(rope.key).toBe('KeyK');
    expect(rope.menu).toBeUndefined();
  });
});

describe('the menus\' hotkeys in the settings (Patch 4)', () => {
  const menus = [...new Set(ACTIONS.map((a) => a.group))].filter((g) => g.startsWith('Build menu') || g.endsWith(' menu') || g.endsWith(' card'));

  it('list every button of the build menu and every K menu product, so each can be rebound', () => {
    expect(menus).toEqual([
      'Build menu', 'Build menu: Defences', 'Build menu: Lights',
      // Patch 5 (Jade's decisions 2.17): a short list is on the building's card, a button each.
      'Barn card', 'Workshop menu', 'Forge menu', 'Artillery workshop card', 'Magi Sanctum card', "Scholar's Lodge menu",
    ]);
    for (const b of BUILDINGS) {
      if (b.slot === 0) continue;
      if (b.variants) b.variants.forEach((_, v) => expect(keyFor({}, placeAction(b.kind, v))).toMatch(/^Key[A-Z]$/));
      else expect(keyFor({}, placeAction(b.kind, 0))).toMatch(/^Key[A-Z]$/);
      const made = productsOf({ kind: b.kind, complete: true } as Parameters<typeof productsOf>[0]).filter((p) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT);
      // Patch 5: the Big House's Make rope and the Storehouse's Make sticks are on the card's K, not in a menu.
      for (const p of made) expect(ACTIONS.some((a) => a.id === makeAction(b.kind, p))).toBe(!makesOne(b.kind));
    }
    expect(sanitizeBindings({ [placeAction(BuildingKind.Farm, 0)]: 'KeyY', [MORE_ACTION]: 'KeyV' })).toEqual({ [placeAction(BuildingKind.Farm, 0)]: 'KeyY', [MORE_ACTION]: 'KeyV' });
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });

  it('keeps a rebound building key on its building when building numbers shift (Patch 5)', () => {
    // Bindings go by the building's name, so cutting a kind moves none of them.
    expect(placeAction(BuildingKind.WallHardwood, 0)).toBe('build-WallHardwood-0');
    expect(makeAction(BuildingKind.Forge, makeList(BuildingKind.Forge)[2]!)).toBe('make-Forge-bronze-ingots-10');
    // Indev 0.9 saved the hardwood wall as kind 19 and the torch post as 17; the earthworks (15) are gone.
    expect(sanitizeBindings({ 'build-19-0': 'KeyY', 'build-17-0': 'KeyV', 'build-15-0': 'KeyZ', 'make-6-514': 'KeyQ' })).toEqual({
      [placeAction(BuildingKind.WallHardwood, 0)]: 'KeyY',
      [placeAction(BuildingKind.TorchPost, 0)]: 'KeyV',
    });
  });

  it('never put two buttons of one menu on one key, nor on Follow, Everyone Home, the Peoples panel, More or Esc', () => {
    const hud = ['follow', 'home', 'peoples'].map((a) => keyFor({}, a));
    expect(new Set(hud.map((k) => k.slice(3)))).toEqual(HUD_LETTERS);
    for (const g of menus) {
      const keys = ACTIONS.filter((a) => a.group === g && a.id !== MORE_ACTION).map((a) => a.key).filter((k) => k !== '');
      expect(new Set(keys).size, g).toBe(keys.length);
      for (const k of keys) expect(k, g).toMatch(/^Key[A-Z]$/);
      for (const k of [...hud, keyFor({}, MORE_ACTION), 'Escape']) expect(keys, g).not.toContain(k);
    }
  });
});

describe('the letter rule for a K menu (Patch 4)', () => {
  it('takes initials first, then letters of the name, never J, L or O, and leaves a click when none is free', () => {
    expect(menuLetters(['Copper ingot', 'Carbon steel ingot', 'Iron ingot'])).toEqual(['C', 'S', 'I']);
    expect(menuLetters(['Lead', 'Jade', 'Oak'])).toEqual(['E', 'A', 'K']);
    expect(menuLetters(['Planks from softwood', 'Planks from hardwood'])).toEqual(['S', 'H']);
    expect(menuLetters(['Bricks (4)', 'Bronze ingots (10)'])).toEqual(['B', 'I']);
    expect(menuLetters(['Ab', 'Ab', 'Ab'])).toEqual(['A', 'B', '']);
  });
});
