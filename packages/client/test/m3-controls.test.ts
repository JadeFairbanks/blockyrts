import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  BUILDINGS,
  CRAFT_PACE,
  Line,
  MONSTERS,
  productsOf,
  productSpec,
  Res,
  Research,
  RESOURCE_COUNT,
  Troop,
  troopProduct,
  UnitKind,
  type Order,
} from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { AREA_DEFAULT_UNITS, Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

const ME = 0;

function sel(key: string, typeKey: string, owner = ME): Selectable {
  return { key, kind: 'unit', owner, typeKey, centre: new THREE.Vector3(4, 0, 4), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey };
}

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: 'Big House', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, room: 0, fixedEngine: 0, ...o,
  };
}

interface World {
  buildings?: BuildingInfo[];
  pool?: Array<[number, number]>;
  research?: number;
  /** The Forge's metal step (Patch 2: 0 no Forge, 1 any Forge, 2 to 4 by main base tier 2, 3 and 3). */
  forge?: number;
  /** Per unit id: state fields to set on top of the defaults. */
  units?: Record<number, Partial<Record<keyof typeof S, number>>>;
}

/** Workers 1 and 2, warriors 3 and 4 (4 a hero; both close melee with a cudgel), and a zombie, 9, for the monsters. */
function game(w: World = {}): GameInfo {
  const g = new GameInfo(ME);
  const rows: Array<[number, number, number, number]> = [
    [1, ME, UnitKind.Worker, 1],
    [2, ME, UnitKind.Worker, 1],
    [3, ME, UnitKind.Warrior, 1],
    [4, ME, UnitKind.Warrior, 5],
    [9, MONSTERS, UnitKind.Mob, 1],
  ];
  const data = new Int32Array(rows.length * STATE_STRIDE);
  rows.forEach(([id, owner, kind, rank], i) => {
    const o = i * STATE_STRIDE;
    data[o + S.id] = id;
    data[o + S.owner] = owner;
    data[o + S.kind] = kind;
    data[o + S.rank] = rank;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = 255;
    // Milestone 11: a troop is a type and two tiers; the warriors start as close melee with a wooden cudgel (weapon tier 1) and no armour.
    if (kind === UnitKind.Warrior) {
      data[o + S.troop] = Troop.Close;
      data[o + S.wTier] = 1;
    }
    // Worker 1 has the stone and flint tools (tier 2), worker 2 the hardwood set (tier 1).
    if (kind === UnitKind.Worker) data[o + S.wTier] = id === 1 ? 2 : 1;
    for (const [field, v] of Object.entries(w.units?.[id] ?? {})) data[o + S[field as keyof typeof S]] = v;
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const pool = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of w.pool ?? []) pool[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 4, supplyCap: 8, buildings: w.buildings ?? [building(20, BuildingKind.MainBase)], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: w.research ?? 0, forge: w.forge ?? 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [], carry: [], effects: [],
  };
  g.onInfo(info);
  return g;
}

function harness(g: GameInfo, selection: Selectable[], active: string | null, heightAt: (x: number, z: number) => number = () => 0) {
  const sent: Order[] = [];
  const messages: string[] = [];
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
    askPlacement: () => undefined,
    node: () => undefined,
    heightAt,
    changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent, messages };
}

const PRESS = { shift: false, ctrl: false };
const warriors = [sel('e:3', 'warrior'), sel('e:4', 'warrior')];
const workers = [sel('e:1', 'worker'), sel('e:2', 'worker')];
const zombie = sel('e:9', 'mob:0', MONSTERS);
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);
const bit = (r: number): number => 1 << r;
const button = (card: Card, action: string): CardEntry | undefined => card.find((e) => e.action === action);

describe('the warrior card', () => {
  it("has only Jade's Patch 2 buttons: Attack, Patrol, Move, Hunt, Eat and Upgrade equipment", () => {
    const { c } = harness(game(), warriors, 'warrior');
    const card = c.card();
    // Patch 5's Run/Walk last.
    expect(card.map((e) => e.action)).toEqual(['attack', 'patrol', 'move', 'hunt', 'eat', 'equip', 'pace']);
    expect(card.map((e) => e.face)).toEqual(['Attack', 'Patrol', 'Move', 'Hunt', 'Eat', 'Equip', 'Walk']);
    expect(card.slice(0, 4).every((e) => e.enabled)).toBe(true);
    expect(card.map((e) => e.key)).toEqual(['KeyA', 'KeyP', 'KeyM', 'KeyN', 'KeyF', 'KeyQ', 'KeyH']);
    // Stop, Hold, Enter, the lock, Cannon crew and the two upgrades and their Max twins are gone [before Patch 2 they were all here].
    for (const gone of ['stop', 'hold', 'enter', 'lock', 'train', 'upgradeWeapon', 'upgradeArmour', 'upgradeWeaponMax', 'upgradeArmourMax']) expect(button(card, gone)).toBeUndefined();
    // The next weapon, and what it costs: weapons come first.
    const equip = button(card, 'equip')!;
    expect(equip.name).toBe('Upgrade equipment');
    expect(equip.reason).toBe('Not enough resources (2 sticks, 1 flint).');
    // At full health they do not eat (Jade's Patch 5, GP-27); hurt, they would, but there is no food.
    expect(button(card, 'eat')!.reason).toBe('They are all at full health.');
    const hurt = harness(game({ units: { 3: { hp: 20 } } }), warriors, 'warrior');
    expect(button(hurt.c.card(), 'eat')!.reason).toBe('There is no food.');
  });

  it('attacks a monster clicked with A, and attack-moves to ground', () => {
    const { c, sent } = harness(game(), warriors, 'warrior');
    c.card()[0]!.run(PRESS);
    expect(c.targeting?.command).toBe('attack');
    c.confirmTarget(zombie, at(4, 4));
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', units: [3, 4], target: 9 });
    c.card()[0]!.run(PRESS);
    c.confirmTarget(null, at(10, -2));
    expect(sent.at(-1)).toMatchObject({ kind: 'attackMove', units: [3, 4], x: 80000, z: -16000 });
  });

  it("attacks one of your own units clicked with A (Jade's Patch 2: Attack on a unit always attacks)", () => {
    const { c, sent } = harness(game(), warriors, 'warrior');
    c.card()[0]!.run(PRESS);
    c.confirmTarget(sel('e:1', 'worker'), at(4, 4));
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', units: [3, 4], target: 1 });
  });

  it('attacks with a right click on a monster', () => {
    const { c, sent } = harness(game(), warriors, 'warrior');
    c.smart(zombie, at(4, 4));
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', target: 9 });
  });

  it('patrols, and upgrades equipment in one press', () => {
    const { c, sent } = harness(game({ pool: [[Res.Sticks, 10], [Res.Flint, 4]] }), warriors, 'warrior');
    button(c.card(), 'patrol')!.run(PRESS);
    c.confirmTarget(null, at(1, 1));
    expect(sent.at(-1)).toMatchObject({ kind: 'patrol', x: 8000, z: 8000 });
    const equip = button(c.card(), 'equip')!;
    expect(equip.enabled).toBe(true);
    // Both can go, the hero (rank 5) first.
    expect(equip.description).toContain('All of them can go: the first to Flint hand-axe (tier 2) for 2 sticks, 1 flint.');
    expect(equip.double).toBeUndefined();
    equip.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeEquipment', player: ME, units: [3, 4] });
  });

  it('goes straight to the best weapon, and the best armour, the stock pays for', () => {
    // With a Forge and copper for both, the copper short sword, past the flint hand-axe.
    const g = game({ pool: [[Res.Sticks, 10], [Res.Flint, 4], [Res.CopperIngot, 2], [Res.HardwoodLumber, 2]], forge: 1 });
    const equip = button(harness(g, warriors, 'warrior').c.card(), 'equip')!;
    expect(equip.enabled).toBe(true);
    expect(equip.description).toContain('Copper short sword (tier 3)');
    // Armour: leather for two jerkins and shields, and hardened leather for two cuirasses: the jerkin is skipped.
    const a = button(harness(game({ pool: [[Res.Leather, 10], [Res.Planks, 6], [Res.HardenedLeather, 6]] }), warriors, 'warrior').c.card(), 'equip')!;
    expect(a.enabled).toBe(true);
    expect(a.description).toContain('Boiled-leather cuirass (tier 2)');
  });

  it('greys Upgrade equipment for units already on their way to an upgrade', () => {
    const g = game({ pool: [[Res.Sticks, 10], [Res.Flint, 4]] });
    for (const id of [3, 4]) g.queues.set(id, [{ t: 'kitUp', line: Line.Weapon, to: 2, ways: 1, paid: 1, b: 20 }]);
    const equip = button(harness(g, warriors, 'warrior').c.card(), 'equip')!;
    expect(equip.enabled).toBe(false);
    expect(equip.reason).toBe('Already on the way to an upgrade.');
  });

  it("has no Cannon crew button (Jade's Patch 2 cuts it)", () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(21, BuildingKind.ArtilleryWorkshop)], pool: [[Res.FarmFare, 100]], research: bit(Research.Cannons) });
    expect(button(harness(g, warriors, 'warrior').c.card(), 'train')).toBeUndefined();
  });
});

describe("tinkering (Jade's Patch 2)", () => {
  it('lists each unit sitting at a timed action, with how far it is, for the bar over its head', () => {
    const g = game({ units: { 3: { tinkerDone: 40, tinkerOf: 200 }, 1: { tinkerDone: 0, tinkerOf: 100 } } });
    expect(g.tinkering().sort((a, b) => a[0] - b[0])).toEqual([[1, 0, 100], [3, 40, 200]]);
    expect(game().tinkering()).toEqual([]);
  });
});

describe('experience (Patch 3)', () => {
  it("carries each unit's experience and what its next rank needs, for the middle HUD's bar", () => {
    const g = game({ units: { 1: { xp: 52, xpNext: 150 } } });
    expect([g.unit(1)!.xp, g.unit(1)!.xpNext]).toEqual([52, 150]);
    expect([g.unit(2)!.xp, g.unit(2)!.xpNext]).toEqual([0, 0]);
  });
});

describe('workers: tools and carts (Milestone 11)', () => {
  it('upgrades tools on Q to the best the stock pays for, for those it pays for', () => {
    // Worker 1 (stone and flint) needs a Forge for copper; worker 2 (hardwood) can go to stone and flint.
    const { c, sent } = harness(game({ pool: [[Res.Sticks, 6], [Res.Flint, 1], [Res.Stone, 5]] }), workers, 'worker');
    const equip = button(c.card(), 'equip')!;
    expect(equip).toMatchObject({ face: 'Equip', name: 'Upgrade equipment', key: 'KeyQ', enabled: true });
    expect(equip.description).toContain('1 of 2 can go: the first to Stone and flint tools (tier 2) for 6 sticks, 1 flint, 5 stone.');
    expect(equip.double).toBeUndefined();
    equip.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeEquipment', player: ME, units: [1, 2] });
    // Worker 1 alone: copper tools need a Forge.
    expect(button(harness(game(), [workers[0]!], 'worker').c.card(), 'equip')!.reason).toBe('Needs a Forge.');
  });

  it('has no rank training (Patch 3: a worker ranks up by building and gathering), and U is free', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase, { level: 2 })], pool: [[Res.FarmFare, 100]] });
    const card = harness(g, workers, 'worker').c.card();
    expect(button(card, 'rankUp')).toBeUndefined();
    expect(card.map((e) => e.key)).not.toContain('KeyU');
  });

  it('fetches a cart from the stock on X, and hands it back', () => {
    const { c, sent } = harness(game({ pool: [[Res.HandCart, 1]] }), workers, 'worker');
    const cart = button(c.card(), 'cart')!;
    expect(cart).toMatchObject({ face: 'Cart', name: 'Fetch a cart', key: 'KeyX', enabled: true });
    cart.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'cart', player: ME, units: [1, 2], back: 0 });
    const g = game({ units: { 1: { kit: Res.HandCart }, 2: { kit: Res.HandCart } } });
    const h = harness(g, workers, 'worker');
    const back = button(h.c.card(), 'cart')!;
    expect(back).toMatchObject({ face: 'Cart back', name: 'Hand the cart back', enabled: true });
    back.run(PRESS);
    expect(h.sent.at(-1)).toEqual({ kind: 'cart', player: ME, units: [1, 2], back: 1 });
  });
});

describe('the Big House', () => {
  /** What the sim worker sends for a Big House: its three troop types at tier 1, and what it makes. */
  const troops = [Troop.Close, Troop.Long, Troop.Ranger].map((troop) => ({ troop, w: 1, a: 0, s: 0, lock: 0 }));

  it('trains close melee, long melee and rangers on A, Q and N, and makes rope on K (Patch 5: Make rope on the card)', () => {
    const g = game({ pool: [[Res.FarmFare, 100], [Res.Sticks, 10], [Res.Flax, 5]] });
    const house = g.buildings.get(20)!;
    house.troops = troops;
    house.products = productsOf({ kind: BuildingKind.MainBase, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, productSpec(p).name === 'Rope' ? 'Not enough flax (needs 3).' : '']);
    const { c, sent } = harness(g, [{ ...sel('b:20', 'building:0:1'), kind: 'building' }], 'building:0:1');
    const card = c.card();
    // Worker first, so the troop types move one along.
    expect(card.slice(0, 4).map((e) => e!.face)).toEqual(['Worker', 'Sword', 'Spear', 'Ranger']);
    expect(card.slice(1, 4).map((e) => e!.key)).toEqual(['KeyA', 'KeyQ', 'KeyN']);
    expect(card.slice(1, 4).every((e) => e!.enabled)).toBe(true);
    expect(card[1]!.name).toBe('Train club fighter');
    expect(card[1]!.description).toContain('Wooden cudgel, no armour (weapon tier 1, armour tier 0, shield tier 0)');
    card[1]!.run({ shift: true, ctrl: false });
    expect(sent.filter((o) => o.kind === 'produce')).toEqual(Array.from({ length: 5 }, () => ({ kind: 'produce', player: ME, building: 20, product: troopProduct(Troop.Close, 1, 0), count: 1 })));
    // Patch 5: the Make button is Make rope itself, on K, with no menu behind it.
    const rope = button(card, 'craft')!;
    expect(rope.key).toBe('KeyK');
    expect([rope.face, rope.name]).toEqual(['Make rope', 'Make rope']);
    expect(rope.menu).toBeUndefined();
    expect(rope.enabled).toBe(false);
    expect(rope.reason).toContain('Not enough flax');
    // The Big House makes rope at one worker's pace, as before Patch 2.
    expect(rope.description).toContain('Time: 10 s.');
  });

  it('says a Workshop recipe\'s real time: it works on its own at the crafting pace (Patch 2)', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(30, BuildingKind.Workshop, { name: 'Workshop' })] });
    const shop = g.buildings.get(30)!;
    shop.products = productsOf({ kind: BuildingKind.Workshop, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, '']);
    const { c } = harness(g, [{ ...sel('b:30', `building:${BuildingKind.Workshop}:1`), kind: 'building' }], `building:${BuildingKind.Workshop}:1`);
    const all = [c.card()];
    const make = all[0]!.find((e) => e.key === 'KeyK');
    if (make) {
      make.run(PRESS);
      all.push(c.card());
    }
    const planks = all.flat().find((e) => e.name === 'Planks')!;
    expect(planks.description).toContain(`Time: ${5 / CRAFT_PACE} s.`);
  });

  it("sends warriors and workers up a tower with a right click, and warriors up a main base with room on top (Jade's Patch 2 cuts the Enter button)", () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase, { level: 3, name: 'Hall' }), building(22, BuildingKind.Tower, { name: 'Wooden tower' })] });
    const tower = { ...sel('b:22', 'building:14:1'), kind: 'building' as const };
    const house = { ...sel('b:20', 'building:0:3'), kind: 'building' as const };
    const men = harness(g, warriors, 'warrior');
    men.c.smart(tower, at(0, 0));
    expect(men.sent.at(-1)).toMatchObject({ kind: 'enter', units: [3, 4], building: 22 });
    // A Hall has room up top [before Patch 2 a right click only walked them there; the Enter button took them up].
    men.c.smart(house, at(0, 0));
    expect(men.sent.at(-1)).toMatchObject({ kind: 'enter', units: [3, 4], building: 20 });
    const hands = harness(g, workers, 'worker');
    hands.c.smart(tower, at(0, 0));
    expect(hands.sent.at(-1)).toMatchObject({ kind: 'enter', units: [1, 2], building: 22 });
    // Workers carrying nothing go inside a main base (Jade's Patch 5, GP-5) [before, they only walked to it].
    hands.c.smart(house, at(0, 0));
    expect(hands.sent.at(-1)).toMatchObject({ kind: 'enter', units: [1, 2], building: 20 });
    // A tower still going up is built, not climbed.
    g.buildings.get(22)!.complete = false;
    hands.c.smart(tower, at(0, 0));
    expect(hands.sent.at(-1)).toMatchObject({ kind: 'work', building: 22 });
  });
});

describe('digging', () => {
  it('marks a dig by dragging, sets its depth, and confirms with a click', () => {
    const { c, sent } = harness(game(), workers, 'worker');
    button(c.card(), 'dig')!.run(PRESS);
    expect(c.area).not.toBeNull();
    c.areaDown(at(0.1, 0.1));
    c.updateArea(at(2, 0.5));
    c.areaUp();
    c.adjustArea(1);
    const plan = c.areaPlan()!;
    expect(plan).toMatchObject({ x0: 0, z0: 0, x1: 4, z1: 1, tunnel: false, level: -(AREA_DEFAULT_UNITS + 3) });
    c.areaDown(at(9, 9));
    expect(sent.at(-1)).toMatchObject({ kind: 'dig', units: [1, 2], x0: 0, z0: 0, x1: 4, z1: 1, level: -12, tunnel: 0 });
    expect(c.area).toBeNull();
  });

  it('tunnels when the marked box climbs a face', () => {
    const cliff = (x: number): number => (x > 1 ? 3 : 0);
    const { c, sent } = harness(game(), workers, 'worker', cliff);
    c.startArea();
    c.areaDown(at(0.2, 0.2));
    c.updateArea(at(4, 1));
    c.areaUp();
    expect(c.areaPlan()!.tunnel).toBe(true);
    c.confirmArea();
    expect(sent.at(-1)).toMatchObject({ kind: 'dig', tunnel: 1, level: 0, level2: 20 });
  });

  it('starts a tunnel chain from a cliff face pressed on its side, floored at the ground in front (chains-controls.test.ts has the rest)', () => {
    // A 1.1 m (10 unit) cliff from x = 2 m: the press lands on its west side, 0.5 m up.
    const units = 0.1125;
    const cliff = (x: number): number => (x >= 2.25 ? 10 * units : 0);
    const { c, sent } = harness(game(), workers, 'worker', cliff);
    c.startArea();
    c.areaDown(new THREE.Vector3(2.25, 0.5, 0.2));
    // Face column 5 (2.25 m / 0.45 m); nothing is dug until the next click.
    expect(c.area!.chain).toEqual({ x: 5, z: 0, floor: 0 });
    expect(c.areaPlan()).toBeNull();
    expect(sent).toEqual([]);
  });

  it('digs down, not sideways, when the press is on top of the ground or on a low step', () => {
    const step = (x: number): number => (x >= 2.25 ? 3 * 0.1125 : 0);
    const { c } = harness(game(), workers, 'worker', step);
    c.startArea();
    c.areaDown(new THREE.Vector3(2.25, 0.1, 0.2));
    c.areaUp();
    expect(c.areaPlan()!.tunnel).toBe(false);
  });
});

describe("Hunt, Gather and loot (Jade's play-test notes)", () => {
  it('Hunt and Gather: a left click picks a target and the round goes on after it, a right click (or two presses) is the auto function (Patch 5, CT-1)', () => {
    const g = game();
    const h = harness(g, warriors, 'warrior');
    button(h.c.card(), 'hunt')!.run(PRESS);
    expect(h.c.targeting?.command).toBe('hunt');
    expect(button(h.c.card(), 'hunt')!.lit).toBe(true);
    const deer: Selectable = { key: 'e:50', kind: 'unit', owner: 255, typeKey: 'animal:wild:1', centre: at(4, 4), halfSize: new THREE.Vector3(0.4, 0.5, 0.4), label: 'Deer' };
    h.c.confirmTarget(deer, at(4, 4));
    expect(h.sent.at(-1)).toMatchObject({ kind: 'hunt', units: [3, 4], target: 50, auto: 1 });
    button(h.c.card(), 'hunt')!.right!(PRESS);
    expect(h.sent.at(-1)).toMatchObject({ kind: 'hunt', units: [3, 4], target: 0, auto: 1 });
    const w = harness(g, workers, 'worker');
    expect(button(w.c.card(), 'gather')!.face).toBe('Gather');
    button(w.c.card(), 'gather')!.run(PRESS);
    expect(w.c.targeting?.command).toBe('gather');
    const pine: Selectable = { key: 'p:1,2:3', kind: 'node', owner: 255, typeKey: 'node:pine', centre: at(2, 2), halfSize: new THREE.Vector3(0.4, 2, 0.4), label: 'Pine', resource: 'softwood' };
    w.c.confirmTarget(pine, at(2, 2));
    expect(w.sent.at(-1)).toMatchObject({ kind: 'gather', units: [1, 2], cx: 1, cz: 2, index: 3 });
    button(w.c.card(), 'gather')!.right!(PRESS);
    expect(w.sent.at(-1)).toMatchObject({ kind: 'forage', units: [1, 2] });
    // Repair's right click turns autorepair on for the selected workers.
    button(w.c.card(), 'repair')!.right!(PRESS);
    expect(w.sent.at(-1)).toMatchObject({ kind: 'autoRepair', units: [1, 2], on: 1 });
  });

  it('right-clicking loot on the ground sends the selected units to pick it up', () => {
    const { c, sent } = harness(game(), [...warriors, ...workers], 'warrior');
    const loot: Selectable = { key: 'l:77', kind: 'node', owner: 255, typeKey: 'loot', centre: at(5, 5), halfSize: new THREE.Vector3(0.3, 0.3, 0.3), label: 'Meat (4)', resource: '' };
    c.smart(loot, at(5, 5));
    expect(sent.at(-1)).toMatchObject({ kind: 'pickUp', target: 77 });
  });

  it('has no Unload on the worker card: one unit\'s inventory in the panel unloads (Jade\'s Patch 5, GP-8)', () => {
    const g = game();
    const { c } = harness(g, workers, 'worker');
    g.info!.bags = [[1, [[Res.Venison, 4]]]];
    expect(button(c.card(), 'returnCargo')).toBeUndefined();
  });
});
