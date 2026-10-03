import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Res, RESOURCE_COUNT, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { ACTIONS, clashes, GRID_CODES, keyFor, sanitizeBindings } from '../src/input/bindings.ts';
import { Commands, menuSlots, submenuChoices, type CommandDeps } from '../src/hud/commands.ts';
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
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], up: [], status: '', name: 'Big House', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false, troops: [], horses: 0, ...o,
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
    rations: 0, dontEat: 0, starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
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

describe('build menus', () => {
  it('put each building in its Table 4 slot, shared slots as submenus, B always Back', () => {
    const basic = menuSlots('basic');
    expect(basic[0]!.map((b) => b.kind)).toEqual([BuildingKind.MainBase]);
    expect(basic[1]!.map((b) => b.kind)).toEqual([BuildingKind.CropField, BuildingKind.VegetableFarm, BuildingKind.HerbBed, BuildingKind.LivestockFarm]);
    expect(basic[12]!.map((b) => b.kind)).toEqual([BuildingKind.TorchPost, BuildingKind.WallTorch, BuildingKind.Brazier, BuildingKind.Lantern]);
    expect(basic[14]).toEqual([]);
    expect(menuSlots('advanced')[14]).toEqual([]);
    expect(submenuChoices(basic[1]!).map((c) => c.name)).toEqual(['Wheat field', 'Corn field', 'Flax field', 'Potato farm', 'Carrot farm', 'Herb bed', 'Livestock farm']);
    expect(GRID_CODES[14]).toBe('KeyB');
  });
});

describe('the worker card', () => {
  it('has the movement row, the gatherer row and the build row, greyed where a later milestone brings it', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    const card = c.card();
    // Milestone 11: workers never patrol, so rank training takes slot 3; the tools upgrade and the cart close the card.
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', 'Rank', 'Move', 'Gather', 'Return', 'Repair', 'Dig', 'Prospect', 'Build', 'Adv.', 'Enter', 'Tools +', 'Cart']);
    expect(card[9]!.enabled).toBe(true); // Prospect (milestone 4)
    expect(card[6]!.enabled).toBe(true); // worker 2 carries something
    expect(card[3]!.action).toBe('rankUp');
    expect(card[13]!.reason).toBe('Not enough resources (3 hardwood sticks).');
    expect(card[14]!.reason).toBe('There are no carts in the stock (make one at a Workshop).');
    expect(card.map((e) => e?.key ?? '')).toContain('KeyG');
  });

  it('opens Basic Structures on B with grid keys, and a submenu for farms', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), workers, 'worker');
    c.card()[10]!.run({ shift: false, ctrl: false });
    let card = c.card();
    expect(card[0]!.face).toBe('Big House');
    expect(card[0]!.key).toBe('KeyQ');
    expect(card[1]!.face).toBe('Farms');
    expect(card[14]!.face).toBe('Back');
    card[1]!.run({ shift: false, ctrl: false });
    card = c.card();
    expect(card[0]!.face).toBe('Wheat field');
    expect(c.back()).toBe(true);
    expect(c.card()[1]!.face).toBe('Farms');
    expect(c.back()).toBe(true);
    expect(c.card()[10]!.face).toBe('Build');
  });

  it('honours rebound keys', () => {
    const { c } = harness(game([]), workers, 'worker');
    (c as unknown as { d: CommandDeps }).d.settings.keys.gather = 'KeyK';
    expect(c.card()[5]!.key).toBe('KeyK');
  });
});

describe('placement', () => {
  it('asks the sim for tiles, places on green with the builders, and refuses red or unaffordable spots', () => {
    const g = game([], [[Res.SoftwoodLumber, 100], [Res.Sticks, 20]]);
    const { c, sent, messages, asks } = harness(g, workers, 'worker');
    c.startPlacing(BuildingKind.CropField, 1);
    expect(c.card()[14]!.action).toBe('cancel');
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
    expect(card[9]!.face).toBe('Rally');
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
    expect(clashes({}, 'gather', 'KeyC')).toEqual(['Return Cargo']);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });
});
