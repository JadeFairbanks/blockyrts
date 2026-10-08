import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Res, RESOURCE_COUNT, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { ACTIONS, clashes, keyFor, sanitizeBindings } from '../src/input/bindings.ts';
import { Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { menuSlots, submenuChoices } from '../src/hud/menu-keys.ts';
import { groupOfKey, GroupStore } from '../src/hud/groups.ts';
import { subgroups } from '../src/hud/selection-panel.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

const ME = 0;

function sel(key: string, kind: Selectable['kind'], typeKey: string, owner = ME, extra: Partial<Selectable> = {}): Selectable {
  return { key, kind, owner, typeKey, centre: new THREE.Vector3(1, 0, 1), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey, ...extra };
}

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: 'Big House', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false, troops: [], horses: 0, farm: null, ...o,
  };
}

/** A GameInfo with workers 1 and 2 (worker 2 carrying softwood) and the given buildings and pool. */
function game(buildings: BuildingInfo[], pool: Array<[number, number]> = []): GameInfo {
  const g = new GameInfo(ME);
  const data = new Int32Array(2 * STATE_STRIDE);
  for (let i = 0; i < 2; i++) {
    const o = i * STATE_STRIDE;
    data[o + S.id] = i + 1;
    data[o + S.owner] = ME;
    data[o + S.rank] = 1;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = i === 1 ? Res.SoftwoodLumber : 255;
    data[o + S.carryAmt] = i === 1 ? 5 : 0;
  }
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: 2, data, shots: new Int32Array(0), hits: [] });
  const p = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of pool) p[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool: p, supplyUsed: 2, supplyCap: 8, buildings, queues: [[1, []], [2, []]], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

function harness(g: GameInfo, selection: Selectable[], active: string | null) {
  const sent: Order[] = [];
  const messages: string[] = [];
  const asks: Array<[number, Array<[number, number]>]> = [];
  const deps: CommandDeps = {
    player: ME,
    game: g,
    settings: { ...DEFAULT_SETTINGS, keys: {} },
    selection: () => selection,
    activeType: () => active,
    send: (o) => sent.push(o),
    queued: () => false,
    held: () => false,
    message: (t) => messages.push(t),
    marker: () => undefined,
    askPlacement: (kind, _variant, spots) => asks.push([kind, spots]),
    node: () => undefined,
    heightAt: () => 0,
    changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent, messages, asks };
}

const workers = [sel('e:1', 'unit', 'worker'), sel('e:2', 'unit', 'worker')];

/** A card's button by what it does. */
function button(card: Card, action: string): CardEntry {
  const e = card.find((x) => x.action === action);
  if (!e) throw new Error(`no ${action} on the card: ${card.map((x) => x.action).join(', ')}`);
  return e;
}

describe('the build menu (Patch 2: one, in place of Basic and Advanced)', () => {
  it('puts each building in its place, Defences and Lights as submenus', () => {
    const slots = menuSlots();
    expect(slots.slice(0, 12).map((specs) => specs.map((b) => b.kind))).toEqual([
      [BuildingKind.MainBase], [BuildingKind.Farm], [BuildingKind.Barn], [BuildingKind.Storehouse], [BuildingKind.FishingDock], [BuildingKind.Workshop],
      [BuildingKind.Forge], [BuildingKind.ArtilleryWorkshop], [BuildingKind.Barracks], [BuildingKind.MagiSanctum], [BuildingKind.ScholarsLodge], [BuildingKind.Mineshaft],
    ]);
    expect(slots[12]!.every((b) => b.group === 'Defences')).toBe(true);
    expect(slots[13]!.map((b) => b.kind)).toEqual([BuildingKind.TorchPost, BuildingKind.Bonfire]);
    // Patch 4: no fifteenth place kept for Back on the grid's B.
    expect(slots).toHaveLength(14);
    expect(submenuChoices(slots[12]!).map((c) => c.name)).toEqual([
      'Softwood wall', 'Hardwood wall', 'Stone wall',
      'Softwood gate (east to west)', 'Softwood gate (north to south)', 'Hardwood gate (east to west)', 'Hardwood gate (north to south)',
      'Stone gate (east to west)', 'Stone gate (north to south)',
      'Softwood tower', 'Hardwood tower', 'Stone tower',
      'Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp',
    ]);
  });
});

describe('the worker card', () => {
  it('has only the buttons Jade\'s Patch 2 list names, in book order with no gaps', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    const card = c.card();
    // Move, Jade's gather, unload, repair, dig and prospect, one Build, then Eat, Upgrade equipment and the cart
    // (Jade's Patch 3 cut rank training: a worker ranks up by working).
    expect(card.map((e) => e.action)).toEqual(['move', 'gather', 'returnCargo', 'repair', 'dig', 'prospect', 'build', 'eat', 'equip', 'cart']);
    expect(card.map((e) => e.face)).toEqual(['Move', 'Gather', 'Unload', 'Repair', 'Dig', 'Prospect', 'Build', 'Eat', 'Equip', 'Cart']);
    expect(button(card, 'prospect').enabled).toBe(true); // Prospect (milestone 4)
    expect(button(card, 'returnCargo').enabled).toBe(true); // worker 2 carries something
    expect(button(card, 'returnCargo').name).toBe('Unload');
    expect(button(card, 'equip').reason).toBe('Not enough resources (3 hardwood sticks).');
    expect(button(card, 'cart').reason).toBe('There are no carts in the stock (make one at a Workshop).');
    expect(card.map((e) => e.key)).toContain('KeyG');
    // Before Patch 2: Attack, Stop, Hold and Enter, and Basic and Advanced build menus.
    for (const gone of ['attack', 'stop', 'hold', 'enter', 'patrol', 'buildBasic', 'buildAdvanced']) expect(card.some((e) => e.action === gone)).toBe(false);
  });

  it('opens the one build menu on B: the fourteen buildings on their letters, Defences and Lights as submenus', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    // A desktop card shows 40 buttons at the smallest size before it pages.
    (c as unknown as { d: CommandDeps }).d.slots = () => ({ most: 40 });
    expect(button(c.card(), 'build').key).toBe('KeyB');
    button(c.card(), 'build').run({ shift: false, ctrl: false });
    let card = c.card();
    expect(card[0]!.face).toBe('Big House');
    expect(card[0]!.key).toBe('KeyH');
    expect(card[1]!.face).toBe('Farm');
    expect(card[1]!.key).toBe('KeyF');
    expect(card[12]!.face).toBe('Defences');
    expect(card[13]!.face).toBe('Lights');
    // The fourteen and Back fit one page; Back is Esc (Patch 4; before, B on the grid).
    expect(card).toHaveLength(15);
    expect(card.slice(0, 14).every((e) => e.menu && /^Key[A-Z]$/.test(e.key))).toBe(true);
    expect(card[14]!.face).toBe('Back');
    expect(card[14]!.key).toBe('Escape');
    card[12]!.run({ shift: false, ctrl: false });
    card = c.card();
    // Defences' 17 choices fit a desktop card, every one on a letter of its own (Patch 4; before, the last three were clicks).
    expect(card.map((e) => e.face)).toEqual([
      'Softwood wall', 'Hardwood wall', 'Stone wall',
      'Softwood gate (east to west)', 'Softwood gate (north to south)', 'Hardwood gate (east to west)', 'Hardwood gate (north to south)',
      'Stone gate (east to west)', 'Stone gate (north to south)',
      'Softwood tower', 'Hardwood tower', 'Stone tower',
      'Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp', 'Back',
    ]);
    expect(card.slice(0, -1).every((e) => /^Key[A-Z]$/.test(e.key))).toBe(true);
    expect(new Set(card.map((e) => e.key)).size).toBe(card.length);
    expect(card.at(-1)!.key).toBe('Escape');
    expect(c.back()).toBe(true);
    expect(c.card()[12]!.face).toBe('Defences');
    c.card()[13]!.run({ shift: false, ctrl: false });
    expect(c.card().map((e) => e.face)).toEqual(['Torch post', 'Bonfire', 'Back']);
    expect(c.back()).toBe(true);
    expect(c.back()).toBe(true);
    expect(button(c.card(), 'build').face).toBe('Build');
  });

  it('pages a menu longer than the card can show', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    (c as unknown as { d: CommandDeps }).d.slots = () => ({ most: 10 });
    button(c.card(), 'build').run({ shift: false, ctrl: false });
    const card = c.card();
    expect(card).toHaveLength(10);
    expect(card.at(-2)!.action).toBe('more');
    expect(card.at(-2)!.key).toBe('Equal');
    expect(card.at(-1)!.action).toBe('back');
    card.at(-2)!.run({ shift: false, ctrl: false });
    expect(c.card()[0]!.face).not.toBe('Big House');
  });

  it('honours rebound keys', () => {
    const { c } = harness(game([]), workers, 'worker');
    (c as unknown as { d: CommandDeps }).d.settings.keys.gather = 'KeyK';
    expect(button(c.card(), 'gather').key).toBe('KeyK');
  });
});

describe('placement', () => {
  it('asks the sim for tiles, places on green with the builders, and refuses red or unaffordable spots', () => {
    const g = game([], [[Res.SoftwoodLumber, 100], [Res.Sticks, 20]]);
    const { c, sent, messages, asks } = harness(g, workers, 'worker');
    c.startPlacing(BuildingKind.Farm, 0);
    expect(c.card().at(-1)!.action).toBe('cancel');
    c.updatePlacing(new THREE.Vector3(10, 0, 10), 0);
    expect(asks.length).toBe(1);
    const [, spots] = asks[0]!;
    const [x, z] = spots[0]!;
    // Red tile: refused with the reason.
    const red = new Uint8Array(144);
    red[5] = 4;
    c.onPlaced(BuildingKind.Farm, [{ x, z, tiles: red }]);
    c.placeDown();
    c.placeUp();
    expect(sent).toEqual([]);
    expect(messages.at(-1)).toContain('in the way');
    // Green: one build order for both workers, and placement ends without Shift.
    c.onPlaced(BuildingKind.Farm, [{ x, z, tiles: new Uint8Array(144) }]);
    c.placeDown();
    c.placeUp();
    expect(sent).toEqual([{ kind: 'build', player: ME, units: [1, 2], building: BuildingKind.Farm, variant: 0, x, z, queued: false }]);
    expect(c.placing).toBeNull();
    // Not enough for a Big House: a message, nothing ordered.
    c.startPlacing(BuildingKind.MainBase, 0);
    c.updatePlacing(new THREE.Vector3(30, 0, 30), 1);
    const [, s2] = asks.at(-1)!;
    c.onPlaced(BuildingKind.MainBase, [{ x: s2[0]![0], z: s2[0]![1], tiles: new Uint8Array(196) }]);
    c.placeDown();
    c.placeUp();
    expect(sent.length).toBe(1);
    expect(messages.at(-1)).toContain('Not enough');
  });

  it('drags a line of torch posts 8 m apart', () => {
    const g = game([], [[Res.SoftwoodLumber, 100], [Res.Resin, 10]]);
    const { c, sent, asks } = harness(g, workers, 'worker');
    c.startPlacing(BuildingKind.TorchPost, 0);
    c.updatePlacing(new THREE.Vector3(0, 0, 0), 0);
    c.placeDown();
    c.updatePlacing(new THREE.Vector3(20, 0, 0), 1);
    const [, spots] = asks.at(-1)!;
    expect(spots.length).toBe(3);
    c.onPlaced(BuildingKind.TorchPost, spots.map(([x, z]) => ({ x, z, tiles: new Uint8Array(1) })));
    c.placeUp();
    expect(sent.map((o) => (o as { queued?: boolean }).queued)).toEqual([false, true, true]);
  });
});

describe('smart right click', () => {
  it('gathers from nodes, builds unfinished buildings, drops loads, assigns farmers and moves on ground', () => {
    const field = building(20, BuildingKind.Farm);
    const unfinished = building(21, BuildingKind.TorchPost, { complete: false, built: 300 });
    const mill = building(22, BuildingKind.Storehouse);
    const g = game([field, unfinished, mill]);
    const { c, sent } = harness(g, workers, 'worker');
    c.smart(sel('p:1,2:3', 'node', 'node:pine', 255, { resource: 'softwood lumber' }), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'gather', units: [1, 2], cx: 1, cz: 2, index: 3 });
    c.smart(sel('b:21', 'building', `building:${BuildingKind.TorchPost}:1`), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'work', building: 21 });
    c.smart(sel('b:22', 'building', `building:${BuildingKind.Storehouse}:1`), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'dropoff', units: [2], building: 22 });
    c.smart(sel('b:20', 'building', `building:${BuildingKind.Farm}:1`), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'assign', units: [1, 2], building: 20 });
    c.smart(null, new THREE.Vector3(2, 0, 3));
    expect(sent.at(-1)).toMatchObject({ kind: 'move', x: 16000, z: 24000 });
  });

  it('sets the rally point when only buildings are selected', () => {
    const base = building(9, BuildingKind.MainBase);
    const { c, sent } = harness(game([base]), [sel('b:9', 'building', 'building:0:1')], 'building:0:1');
    c.smart(sel('p:0,0:7', 'node', 'node:pine', 255, { resource: 'softwood lumber' }), null);
    expect(sent.at(-1)).toEqual({ kind: 'rally', player: ME, building: 9, add: false, point: 'node', x: 0, z: 0, id: 7 });
    const card = c.card();
    expect(card[0]!.face).toBe('Worker');
    expect(button(card, 'rally').face).toBe('Rally');
    card[0]!.run({ shift: true, ctrl: false });
    expect(sent.filter((o) => o.kind === 'produce').length).toBe(5);
  });
});

describe('control groups and subgroups', () => {
  it('saves, adds, steals and drops dead things', () => {
    const s = new GroupStore();
    s.save(0, ['e:1', 'e:2']);
    s.add(0, ['e:2', 'e:3']);
    expect(s.groups[0]).toEqual(['e:1', 'e:2', 'e:3']);
    s.save(1, ['e:3']);
    s.steal(2, ['e:3']);
    expect(s.groups[0]).toEqual(['e:1', 'e:2']);
    expect(s.groups[1]).toEqual([]);
    s.prune((k) => k !== 'e:1');
    expect(s.groups[0]).toEqual(['e:2']);
    expect([groupOfKey('Digit1'), groupOfKey('Digit0'), groupOfKey('KeyA')]).toEqual([0, 9, -1]);
  });

  it('orders subgroups workers, warriors, buildings', () => {
    const list = [sel('b:9', 'building', 'building:0:1'), sel('e:5', 'unit', 'warrior'), sel('e:1', 'unit', 'worker'), sel('e:2', 'unit', 'worker')];
    expect(subgroups(list).map((g) => [g.typeKey, g.items.length])).toEqual([
      ['worker', 2],
      ['warrior', 1],
      ['building:0:1', 1],
    ]);
  });
});

describe('hotkey bindings', () => {
  it('fall back to the defaults, keep only known actions and warn of clashes', () => {
    expect(keyFor({}, 'gather')).toBe('KeyG');
    expect(keyFor({ gather: 'KeyK' }, 'gather')).toBe('KeyK');
    expect(sanitizeBindings({ gather: 'KeyK', nonsense: 'KeyX', move: 5 })).toEqual({ gather: 'KeyK' });
    expect(clashes({}, 'gather', 'KeyC')).toEqual(['Unload (take what they carry to a drop-off)']);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    // Jade's Patch 2 cut these buttons, so their keys go too, and an old saved binding for one is dropped.
    for (const gone of ['stop', 'hold', 'enter', 'upgradeWeapon', 'upgradeArmour', 'upgradeWeaponMax', 'upgradeArmourMax', 'lock', 'train', 'buildBasic', 'buildAdvanced']) expect(ACTIONS.some((a) => a.id === gone)).toBe(false);
    expect(sanitizeBindings({ stop: 'KeyK', equip: 'KeyK' })).toEqual({ equip: 'KeyK' });
    expect(keyFor({}, 'equip')).toBe('KeyQ');
    expect(keyFor({}, 'build')).toBe('KeyB');
  });
});
