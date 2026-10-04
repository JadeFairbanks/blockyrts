import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Res, RESOURCE_COUNT, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { ACTIONS, clashes, GRID_CODES, keyFor, sanitizeBindings } from '../src/input/bindings.ts';
import { buildGroups, Commands, menuSlots, submenuChoices, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
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
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
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

describe('build menus', () => {
  it('put each building in its Table 4 slot, shared slots as submenus, B always Back', () => {
    const basic = menuSlots('basic');
    expect(basic[0]!.map((b) => b.kind)).toEqual([BuildingKind.MainBase]);
    expect(basic[1]!.map((b) => b.kind)).toEqual([BuildingKind.CropField, BuildingKind.VegetableFarm, BuildingKind.HerbBed, BuildingKind.LivestockFarm]);
    expect(basic[12]!.map((b) => b.kind)).toEqual([BuildingKind.TorchPost, BuildingKind.WallTorch, BuildingKind.Bonfire, BuildingKind.Lantern]);
    expect(basic[14]).toEqual([]);
    expect(menuSlots('advanced')[14]).toEqual([]);
    expect(submenuChoices(basic[1]!).map((c) => c.name)).toEqual(['Wheat field', 'Corn field', 'Flax field', 'Potato farm', 'Carrot farm', 'Herb bed', 'Livestock farm']);
    expect(GRID_CODES[14]).toBe('KeyB');
  });

  it('merge into one build menu, the basic buildings first (Jade\'s Patch 2)', () => {
    const groups = buildGroups();
    const basic = menuSlots('basic').filter((g) => g.length > 0);
    const advanced = menuSlots('advanced').filter((g) => g.length > 0);
    expect(groups).toEqual([...basic, ...advanced]);
    expect(groups[0]!.map((b) => b.kind)).toEqual([BuildingKind.MainBase]);
  });
});

describe('the worker card', () => {
  it('has only the buttons Jade\'s Patch 2 list names, in book order with no gaps', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    const card = c.card();
    // Move, Jade's gather, unload, repair, dig and prospect, one Build, then Eat, Upgrade equipment, rank training and the cart.
    expect(card.map((e) => e.action)).toEqual(['move', 'gather', 'returnCargo', 'repair', 'dig', 'prospect', 'build', 'eat', 'equip', 'rankUp', 'cart']);
    expect(card.map((e) => e.face)).toEqual(['Move', 'Gather', 'Unload', 'Repair', 'Dig', 'Prospect', 'Build', 'Eat', 'Equip', 'Rank', 'Cart']);
    expect(button(card, 'prospect').enabled).toBe(true); // Prospect (milestone 4)
    expect(button(card, 'returnCargo').enabled).toBe(true); // worker 2 carries something
    expect(button(card, 'returnCargo').name).toBe('Unload');
    expect(button(card, 'equip').reason).toBe('Not enough resources (3 hardwood sticks).');
    expect(button(card, 'cart').reason).toBe('There are no carts in the stock (make one at a Workshop).');
    expect(card.map((e) => e.key)).toContain('KeyG');
    // Before Patch 2: Attack, Stop, Hold and Enter, and Basic and Advanced build menus.
    for (const gone of ['attack', 'stop', 'hold', 'enter', 'patrol', 'buildBasic', 'buildAdvanced']) expect(card.some((e) => e.action === gone)).toBe(false);
  });

  it('opens the one build menu on B, basic and advanced buildings together, with grid keys and a submenu for farms', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    // A desktop card shows 40 buttons at the smallest size before it pages.
    (c as unknown as { d: CommandDeps }).d.slots = () => ({ most: 40 });
    expect(button(c.card(), 'build').key).toBe('KeyB');
    button(c.card(), 'build').run({ shift: false, ctrl: false });
    let card = c.card();
    expect(card[0]!.face).toBe('Big House');
    expect(card[0]!.key).toBe('KeyQ');
    expect(card[1]!.face).toBe('Farms');
    // The advanced buildings follow the basic ones, and Back closes the menu on B.
    expect(card.some((e) => e.face === 'Barracks')).toBe(true);
    expect(card.at(-1)!.face).toBe('Back');
    expect(card.at(-1)!.key).toBe('KeyB');
    expect(card.length).toBe(buildGroups().length + 1);
    // Past the 14 grid keys the buttons are clicks.
    expect(card.slice(0, 14).every((e) => e.grid && e.key !== '')).toBe(true);
    expect(card.slice(14, -1).every((e) => e.key === '')).toBe(true);
    card[1]!.run({ shift: false, ctrl: false });
    card = c.card();
    expect(card[0]!.face).toBe('Wheat field');
    expect(c.back()).toBe(true);
    expect(c.card()[1]!.face).toBe('Farms');
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
    expect(card.at(-2)!.key).toBe('KeyV');
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
    c.startPlacing(BuildingKind.CropField, 1);
    expect(c.card().at(-1)!.action).toBe('cancel');
    c.updatePlacing(new THREE.Vector3(10, 0, 10), 0);
    expect(asks.length).toBe(1);
    const [, spots] = asks[0]!;
    const [x, z] = spots[0]!;
    // Red tile: refused with the reason.
    const red = new Uint8Array(144);
    red[5] = 4;
    c.onPlaced(BuildingKind.CropField, [{ x, z, tiles: red }]);
    c.placeDown();
    c.placeUp();
    expect(sent).toEqual([]);
    expect(messages.at(-1)).toContain('in the way');
    // Green: one build order for both workers, and placement ends without Shift.
    c.onPlaced(BuildingKind.CropField, [{ x, z, tiles: new Uint8Array(144) }]);
    c.placeDown();
    c.placeUp();
    expect(sent).toEqual([{ kind: 'build', player: ME, units: [1, 2], building: BuildingKind.CropField, variant: 1, x, z, queued: false }]);
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
    const field = building(20, BuildingKind.CropField);
    const unfinished = building(21, BuildingKind.TorchPost, { complete: false, built: 300 });
    const mill = building(22, BuildingKind.LumberMill);
    const g = game([field, unfinished, mill]);
    const { c, sent } = harness(g, workers, 'worker');
    c.smart(sel('p:1,2:3', 'node', 'node:pine', 255, { resource: 'softwood lumber' }), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'gather', units: [1, 2], cx: 1, cz: 2, index: 3 });
    c.smart(sel('b:21', 'building', 'building:18:1'), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'work', building: 21 });
    c.smart(sel('b:22', 'building', 'building:6:1'), null);
    expect(sent.at(-1)).toMatchObject({ kind: 'dropoff', units: [2], building: 22 });
    c.smart(sel('b:20', 'building', 'building:1:1'), null);
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
