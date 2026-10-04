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
  Skill,
  Troop,
  troopProduct,
  UnitKind,
  type Order,
} from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { AREA_DEFAULT_UNITS, Commands, menuSlots, submenuChoices, type CommandDeps } from '../src/hud/commands.ts';
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
    troops: [], horses: 0, farm: null, ...o,
  };
}

interface World {
  buildings?: BuildingInfo[];
  pool?: Array<[number, number]>;
  research?: number;
  /** The Forge's metal step (Patch 2: 0 no Forge, 1 any Forge, 2 to 4 by main base level 3, 5 and 7). */
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
    // Milestone 11: a troop is a type and two tiers; the warriors start as close melee with a hardwood cudgel (weapon tier 1) and no armour.
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
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
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

describe('the warrior card', () => {
  it('has the movement row, then the two upgrades, the lock, Cannon, Hunt, Eat and Enter, and no Max twin when it would go no further', () => {
    const { c } = harness(game(), warriors, 'warrior');
    const card = c.card();
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', 'Patrol', 'Move', 'Weapon +', 'Armour +', 'Auto', 'Cannon', 'Hunt', 'Eat', '', 'Enter', '', '']);
    expect(card.slice(0, 5).every((e) => e!.enabled)).toBe(true);
    expect(card.map((e) => e?.key ?? '')).toEqual(['KeyA', 'KeyS', 'KeyH', 'KeyP', 'KeyM', 'KeyQ', 'KeyX', 'KeyY', 'KeyU', 'KeyN', 'KeyF', '', 'KeyE', '', '']);
    // The next tier of each line, and what it costs; a close melee fighter's first armour brings the wooden shield.
    expect(card[5]!.name).toBe('Upgrade weapon');
    expect(card[5]!.reason).toBe('Not enough resources (2 hardwood sticks, 1 flint).');
    expect(card[6]!.reason).toBe('Not enough resources (4 leather, 3 planks).');
    // Cannon crew is the one skill left, after Cannons at the Artillery workshop.
    expect(card[8]!.name).toBe('Train in cannon crew');
    expect(card[8]!.reason).toBe('Needs Cannons researched.');
    expect(card[10]!.reason).toBe('There is no food.');
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

  it('attacks with a right click on a monster', () => {
    const { c, sent } = harness(game(), warriors, 'warrior');
    c.smart(zombie, at(4, 4));
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', target: 9 });
  });

  it('holds, patrols, cycles the lock and upgrades, the best when pressed twice', () => {
    const { c, sent } = harness(game({ pool: [[Res.Sticks, 10], [Res.Flint, 4]] }), warriors, 'warrior');
    c.card()[2]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'hold', units: [3, 4] });
    c.card()[3]!.run(PRESS);
    c.confirmTarget(null, at(1, 1));
    expect(sent.at(-1)).toMatchObject({ kind: 'patrol', x: 8000, z: 8000 });
    c.card()[7]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'lock', units: [3, 4], lock: 1 });
    const weapon = c.card()[5]!;
    expect(weapon.enabled).toBe(true);
    // Both can go, the hero (rank 5) first.
    expect(weapon.description).toContain('All of them can go: the first to Flint hand-axe (tier 2) for 2 hardwood sticks, 1 flint.');
    weapon.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [3, 4], line: Line.Weapon, max: 0 });
    weapon.double!(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [3, 4], line: Line.Weapon, max: 1 });
  });

  it('shows the Max twins on Z and V only when they would go further than the plain buttons', () => {
    // Flint hand-axes are the best there is without a forge: Max would go no further.
    expect(harness(game({ pool: [[Res.Sticks, 10], [Res.Flint, 4]] }), warriors, 'warrior').c.card()[11]).toBeNull();
    // With a Forge and copper for both, Max goes to the copper short sword.
    const g = game({ pool: [[Res.Sticks, 10], [Res.Flint, 4], [Res.CopperIngot, 2], [Res.HardwoodLumber, 2]], forge: 1 });
    const { c, sent } = harness(g, warriors, 'warrior');
    const card = c.card();
    expect(card[11]).toMatchObject({ action: 'upgradeWeaponMax', face: 'Weapon max', name: 'Upgrade weapon to the best', key: 'KeyZ', enabled: true });
    expect(card[11]!.description).toContain('Copper short sword (tier 3)');
    expect(card[13]).toBeNull();
    card[11]!.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [3, 4], line: Line.Weapon, max: 1 });
    // Armour: leather for two jerkins and shields, and hardened leather for two cuirasses: Max skips the jerkin.
    const a = harness(game({ pool: [[Res.Leather, 10], [Res.Planks, 6], [Res.HardenedLeather, 6]] }), warriors, 'warrior');
    const armour = a.c.card();
    expect(armour[6]!.enabled).toBe(true);
    expect(armour[11]).toBeNull();
    expect(armour[13]).toMatchObject({ action: 'upgradeArmourMax', face: 'Armour max', key: 'KeyV', enabled: true });
    expect(armour[13]!.description).toContain('Boiled-leather cuirass (tier 2)');
    armour[13]!.run(PRESS);
    expect(a.sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [3, 4], line: Line.Armour, max: 1 });
  });

  it('greys an upgrade for units already on their way to one', () => {
    const g = game({ pool: [[Res.Sticks, 10], [Res.Flint, 4]], units: { 3: { upLine: 1, upTo: 2 }, 4: { upLine: 1, upTo: 2 } } });
    const card = harness(g, warriors, 'warrior').c.card();
    expect(card[5]!.enabled).toBe(false);
    expect(card[5]!.reason).toBe('Already on the way to an upgrade.');
  });

  it('sends untrained warriors to an Artillery workshop for cannon crew once Cannons is researched', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(21, BuildingKind.ArtilleryWorkshop)], pool: [[Res.FarmFare, 100]], research: bit(Research.Cannons) });
    const { c, sent } = harness(g, warriors, 'warrior');
    const card = c.card();
    expect(card[8]!.enabled).toBe(true);
    card[8]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'trainSkill', building: 21, skill: Skill.Cannon, units: [3, 4] });
  });
});

describe('workers: rank, tools and carts (Milestone 11)', () => {
  it('upgrades tools on Q a tier at a time, for those the stock pays for, with no Max twin', () => {
    // Worker 1 (stone and flint) needs a Forge for copper; worker 2 (hardwood) can go to stone and flint.
    const { c, sent } = harness(game({ pool: [[Res.Sticks, 6], [Res.Flint, 1], [Res.Stone, 5]] }), workers, 'worker');
    const card = c.card();
    expect(card[13]).toMatchObject({ action: 'upgradeWeapon', face: 'Tools +', name: 'Upgrade tools', key: 'KeyQ', enabled: true });
    expect(card[13]!.description).toContain('1 of 2 can go: the first to Stone and flint tools (tier 2) for 6 hardwood sticks, 1 flint, 5 stone.');
    expect(card[13]!.double).toBeUndefined();
    expect(card[10]!.face).toBe('Build');
    card[13]!.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [1, 2], line: Line.Weapon, max: 0 });
    // Worker 1 alone: copper tools need a Forge (Patch 2: any Forge, in place of a Casting Hearth).
    expect(harness(game(), [workers[0]!], 'worker').c.card()[13]!.reason).toBe('Needs a Forge.');
  });

  it('trains rank on U in place of patrol, at a Longhall', () => {
    expect(harness(game({ pool: [[Res.FarmFare, 100]] }), workers, 'worker').c.card()[3]!.reason).toBe('Needs a level 2 main base (Longhall).');
    const g = game({ buildings: [building(20, BuildingKind.MainBase, { level: 2 })], pool: [[Res.FarmFare, 100]] });
    const { c, sent } = harness(g, workers, 'worker');
    const rank = c.card()[3]!;
    expect(rank).toMatchObject({ action: 'rankUp', face: 'Rank', name: 'Upgrade rank (to Hand)', key: 'KeyU', enabled: true });
    rank.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'trainRank', units: [1, 2], building: 20 });
  });

  it('fetches a cart from the stock on X, and hands it back', () => {
    const { c, sent } = harness(game({ pool: [[Res.HandCart, 1]] }), workers, 'worker');
    const cart = c.card()[14]!;
    expect(cart).toMatchObject({ action: 'cart', face: 'Cart', name: 'Fetch a cart', key: 'KeyX', enabled: true });
    cart.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'cart', player: ME, units: [1, 2], back: 0 });
    const g = game({ units: { 1: { kit: Res.HandCart }, 2: { kit: Res.HandCart } } });
    const h = harness(g, workers, 'worker');
    const back = h.c.card()[14]!;
    expect(back).toMatchObject({ face: 'Cart back', name: 'Hand the cart back', enabled: true });
    back.run(PRESS);
    expect(h.sent.at(-1)).toEqual({ kind: 'cart', player: ME, units: [1, 2], back: 1 });
  });
});

describe('the Big House', () => {
  /** What the sim worker sends for a Big House: its three troop types at tier 1, and what it makes. */
  const troops = [Troop.Close, Troop.Long, Troop.Ranger].map((troop) => ({ troop, w: 1, a: 0, lock: 0 }));

  it('trains close melee, long melee and rangers on A, Q and N, and makes rope with grid keys', () => {
    const g = game({ pool: [[Res.FarmFare, 100], [Res.Sticks, 10], [Res.Flax, 5]] });
    const house = g.buildings.get(20)!;
    house.troops = troops;
    house.products = productsOf({ kind: BuildingKind.MainBase, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, productSpec(p).name === 'Rope' ? 'Not enough flax (needs 3).' : '']);
    const { c, sent } = harness(g, [{ ...sel('b:20', 'building:0:1'), kind: 'building' }], 'building:0:1');
    const card = c.card();
    // Worker first, so the troop types move one along.
    expect(card.slice(0, 4).map((e) => e!.face)).toEqual(['Worker', 'Close', 'Long', 'Ranger']);
    expect(card.slice(1, 4).map((e) => e!.key)).toEqual(['KeyA', 'KeyQ', 'KeyN']);
    expect(card.slice(1, 4).every((e) => e!.enabled)).toBe(true);
    expect(card[1]!.name).toBe('Train close melee');
    expect(card[1]!.description).toContain('Hardwood cudgel, no armour (weapon tier 1, armour tier 0)');
    card[1]!.run({ shift: true, ctrl: false });
    expect(sent.filter((o) => o.kind === 'produce')).toEqual(Array.from({ length: 5 }, () => ({ kind: 'produce', player: ME, building: 20, product: troopProduct(Troop.Close, 1, 0), count: 1 })));
    expect(card[7]!.key).toBe('KeyK');
    card[7]!.run(PRESS);
    const make = c.card();
    const rope = make.find((e) => e?.name === 'Rope')!;
    expect(rope.grid).toBe(true);
    expect(rope.enabled).toBe(false);
    expect(rope.reason).toContain('Not enough flax');
    // The Big House makes rope at one worker's pace, as before Patch 2.
    expect(rope.description).toContain('Time: 10 s.');
    expect(make[14]!.face).toBe('Back');
  });

  it('says a Workshop recipe\'s real time: it works on its own at the crafting pace (Patch 2)', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(30, BuildingKind.Workshop, { name: 'Workshop' })] });
    const shop = g.buildings.get(30)!;
    shop.products = productsOf({ kind: BuildingKind.Workshop, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, '']);
    const { c } = harness(g, [{ ...sel('b:30', `building:${BuildingKind.Workshop}:1`), kind: 'building' }], `building:${BuildingKind.Workshop}:1`);
    const all = [c.card()];
    const make = all[0]!.find((e) => e?.key === 'KeyK');
    if (make) {
      make.run(PRESS);
      all.push(c.card());
    }
    const planks = all.flat().find((e) => e?.name === 'Planks from softwood')!;
    expect(planks.description).toContain(`Time: ${5 / CRAFT_PACE} s.`);
  });

  it('lets warriors into a tower', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(22, BuildingKind.Tower, { name: 'Softwood tower' })] });
    const { c, sent } = harness(g, warriors, 'warrior');
    c.card()[12]!.run(PRESS);
    c.confirmTarget({ ...sel('b:22', 'building:14:1'), kind: 'building' }, at(0, 0));
    expect(sent.at(-1)).toMatchObject({ kind: 'enter', building: 22 });
  });

  it('sends warriors and workers up a tower with a right click, but only walks them to a main base (patch notes 1)', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase, { level: 3, name: 'Hall' }), building(22, BuildingKind.Tower, { name: 'Softwood tower' })] });
    const tower = { ...sel('b:22', 'building:14:1'), kind: 'building' as const };
    const house = { ...sel('b:20', 'building:0:3'), kind: 'building' as const };
    const men = harness(g, warriors, 'warrior');
    men.c.smart(tower, at(0, 0));
    expect(men.sent.at(-1)).toMatchObject({ kind: 'enter', units: [3, 4], building: 22 });
    men.c.smart(house, at(0, 0));
    expect(men.sent.at(-1)).toMatchObject({ kind: 'move', units: [3, 4] });
    const hands = harness(g, workers, 'worker');
    hands.c.smart(tower, at(0, 0));
    expect(hands.sent.at(-1)).toMatchObject({ kind: 'enter', units: [1, 2], building: 22 });
    // A tower still going up is built, not climbed.
    g.buildings.get(22)!.complete = false;
    hands.c.smart(tower, at(0, 0));
    expect(hands.sent.at(-1)).toMatchObject({ kind: 'work', building: 22 });
  });
});

describe('digging and earthworks', () => {
  it('marks a dig by dragging, sets its depth, and confirms with a click', () => {
    const { c, sent } = harness(game(), workers, 'worker');
    c.card()[8]!.run(PRESS);
    expect(c.area?.mode).toBe('dig');
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
    c.startArea('dig', 0);
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
    c.startArea('dig', 0);
    c.areaDown(new THREE.Vector3(2.25, 0.5, 0.2));
    // Face column 5 (2.25 m / 0.45 m); nothing is dug until the next click.
    expect(c.area!.chain).toEqual({ x: 5, z: 0, floor: 0 });
    expect(c.areaPlan()).toBeNull();
    expect(sent).toEqual([]);
  });

  it('digs down, not sideways, when the press is on top of the ground or on a low step', () => {
    const step = (x: number): number => (x >= 2.25 ? 3 * 0.1125 : 0);
    const { c } = harness(game(), workers, 'worker', step);
    c.startArea('dig', 0);
    c.areaDown(new THREE.Vector3(2.25, 0.1, 0.2));
    c.areaUp();
    expect(c.areaPlan()!.tunnel).toBe(false);
  });

  it('offers banks, ramps and fill in the Defences submenu (Patch 2: Earthworks moved there), and orders a ramp up a step', () => {
    const slot = menuSlots().findIndex((specs) => specs.some((s) => s.kind === BuildingKind.Earthworks));
    expect(submenuChoices(menuSlots()[slot]!).map((c) => c.name).slice(-5)).toEqual(['Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp']);
    const step = (x: number): number => (x > 2 ? 0.9 : 0);
    const { c, sent } = harness(game({ pool: [[Res.Earth, 50]] }), workers, 'worker', step);
    c.startArea('earthwork', 1);
    c.areaDown(at(4, 0.2));
    c.updateArea(at(0.2, 0.2));
    c.areaUp();
    c.confirmArea();
    // Dragged from high (x 4 m) to low: the low-x end is the bottom.
    expect(sent.at(-1)).toMatchObject({ kind: 'earthwork', variant: 1, axis: 0, x0: 0, x1: 8, level: 0, level2: 8 });
  });
});

describe("Hunt, Gather and loot (Jade's play-test notes)", () => {
  it('sends the warriors out hunting with one press of Hunt, and the workers gathering with one press of Gather', () => {
    const g = game();
    const h = harness(g, warriors, 'warrior');
    h.c.card()[9]!.run(PRESS);
    expect(h.sent.at(-1)).toMatchObject({ kind: 'hunt', units: [3, 4], target: 0, auto: 1 });
    const w = harness(g, workers, 'worker');
    expect(w.c.card()[5]!.face).toBe('Gather');
    w.c.card()[5]!.run(PRESS);
    expect(w.sent.at(-1)).toMatchObject({ kind: 'forage', units: [1, 2] });
  });

  it('right-clicking loot on the ground sends the selected units to pick it up', () => {
    const { c, sent } = harness(game(), [...warriors, ...workers], 'warrior');
    const loot: Selectable = { key: 'l:77', kind: 'node', owner: 255, typeKey: 'loot', centre: at(5, 5), halfSize: new THREE.Vector3(0.3, 0.3, 0.3), label: 'Meat (4)', resource: '' };
    c.smart(loot, at(5, 5));
    expect(sent.at(-1)).toMatchObject({ kind: 'pickUp', target: 77 });
  });

  it('lets workers carrying loot hand it in with Return', () => {
    const g = game();
    const { c } = harness(g, workers, 'worker');
    expect(c.card()[6]!.enabled).toBe(false);
    g.info!.bags = [[1, [[Res.Venison, 4]]]];
    expect(c.card()[6]!.enabled).toBe(true);
  });
});
