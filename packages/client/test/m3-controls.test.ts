import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  BUILDINGS,
  CRAFT_PRODUCT,
  Item,
  ITEM_COUNT,
  MONSTERS,
  productsOf,
  Res,
  RESOURCE_COUNT,
  Slot,
  UnitKind,
  type Order,
} from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { AREA_DEFAULT_UNITS, Commands, menuSlots, submenuChoices, wallLine, type CommandDeps } from '../src/hud/commands.ts';
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
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], status: '', name: 'Big House', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false, ...o,
  };
}

interface World {
  buildings?: BuildingInfo[];
  pool?: Array<[number, number]>;
  items?: Array<[number, number]>;
  research?: number;
}

/** Workers 1 and 2, warriors 3 and 4 (4 a hero), and a zombie, 9, for the monsters. */
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
    if (kind === UnitKind.Warrior) data[o + S.weapon] = Item.Club;
    // Worker 1 has a flint axe and knife, a stone maul and the hardwood mallet; worker 2 the hardwood set.
    if (kind === UnitKind.Worker) {
      data[o + S.toolChop] = id === 1 ? Item.ToolsFlint : Item.ToolsHardwood;
      data[o + S.toolBreak] = id === 1 ? Item.MaulStone : Item.ToolsHardwood;
      data[o + S.toolBuild] = Item.ToolsHardwood;
      data[o + S.toolCut] = id === 1 ? Item.ToolsFlint : Item.ToolsHardwood;
    }
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const pool = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of w.pool ?? []) pool[r] = n;
  const items = new Int32Array(ITEM_COUNT);
  for (const [it, n] of w.items ?? []) items[it] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 4, supplyCap: 8, buildings: w.buildings ?? [building(20, BuildingKind.MainBase)], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    items, research: w.research ?? 0, autoEquip: false, sites: [], over: 0, nights: 0, out: false,
    rations: 0, dontEat: 0, starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
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

describe('the warrior card', () => {
  it('has the movement row, then Equip Best, Equipment, the lock, Train, Hunt, Eat, Ride and Enter', () => {
    const { c } = harness(game(), warriors, 'warrior');
    const card = c.card();
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', 'Patrol', 'Move', 'Equip', 'Gear', 'Auto', 'Train', 'Hunt', 'Eat', 'Ride', 'Enter', '', '']);
    expect(card.slice(0, 5).every((e) => e!.enabled)).toBe(true);
    expect(card[0]!.key).toBe('KeyA');
    expect(card[5]!.key).toBe('KeyQ');
    expect(card[6]!.key).toBe('KeyI');
    expect(card[6]!.enabled).toBe(false); // two selected
    // Train opens the skills page; archery needs no research now, only a Barracks.
    expect(card[11]!.reason).toContain('riding training');
    card[8]!.run(PRESS);
    const skills = c.card();
    expect(skills.slice(0, 5).map((e) => e!.face)).toEqual(['Archery', 'Crossbow', 'Riding', 'Musket', 'Cannon']);
    expect(skills[0]!.reason).toBe('Needs a Barracks.');
    expect(skills[2]!.reason).toBe('Needs a Stables.');
    expect(skills[3]!.reason).toBe('Needs Muskets researched.');
    expect(skills[14]!.face).toBe('Back');
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

  it('holds, patrols, cycles the lock and equips the best', () => {
    const { c, sent } = harness(game(), warriors, 'warrior');
    c.card()[2]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'hold', units: [3, 4] });
    c.card()[3]!.run(PRESS);
    c.confirmTarget(null, at(1, 1));
    expect(sent.at(-1)).toMatchObject({ kind: 'patrol', x: 8000, z: 8000 });
    c.card()[7]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'lock', units: [3, 4], lock: 1 });
    c.card()[5]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'equipBest', units: [3, 4] });
  });

  it('sends untrained warriors to a Barracks for archery, with no research', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(21, BuildingKind.Barracks)], pool: [[Res.Wheat, 100]] });
    const { c, sent } = harness(g, warriors, 'warrior');
    c.card()[8]!.run(PRESS);
    const card = c.card();
    expect(card[0]!.enabled).toBe(true);
    card[0]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'trainSkill', building: 21, skill: 1, units: [3, 4] });
  });
});

describe('the equipment panel (I)', () => {
  it('shows the slots of one warrior and hands a picked item over', () => {
    const g = game({ items: [[Item.SpearFlint, 2], [Item.ShieldWood, 1], [Item.AxeFlint, 1]] });
    const { c, sent } = harness(g, [warriors[0]!], 'warrior');
    c.card()[6]!.run(PRESS);
    const slots = c.card();
    expect(slots.slice(0, 7).map((e) => e!.name)).toEqual(['Weapon', 'Backup weapon', 'Ranged weapon', 'Shield', 'Boots', 'Arrows', 'Torch']);
    expect(slots[0]!.face).toBe('Club');
    expect(slots[0]!.description).toContain('Carrying 2 lb');
    expect(slots[14]!.face).toBe('Back');
    slots[0]!.run(PRESS);
    const weapons = c.card();
    expect(weapons.filter((e) => e?.action.startsWith('pick-')).map((e) => e!.face)).toEqual(['Axe F', 'Spear F']);
    weapons.find((e) => e?.face === 'Spear F')!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'equipItem', unit: 3, slot: Slot.Weapon, item: Item.SpearFlint });
    // The backup slot only offers one-handed weapons.
    c.card()[1]!.run(PRESS);
    expect(c.card().filter((e) => e?.action.startsWith('pick-')).map((e) => e!.face)).toEqual(['Axe F']);
  });

  it('gives a worker its tools, boots and torch slots, and the rank button', () => {
    const { c } = harness(game({ items: [[Item.HammerStone, 1]] }), [workers[0]!], 'worker');
    c.card()[14]!.run(PRESS);
    const card = c.card();
    expect(card.slice(0, 3).map((e) => e!.name)).toEqual(['Tools', 'Boots', 'Torch']);
    expect(card[13]!.action).toBe('rankUp');
    // The tools slot lists the tool for every job, and the stock's tools say what they are for.
    expect(card[0]!.description).toContain('flint axe and knife, stone maul, hardwood tools');
    expect(card[0]!.description).toContain('Carrying 10 lb');
    card[0]!.run(PRESS);
    const tools = c.card();
    expect(tools[0]!.name).toBe('Take off the tools');
    const hammer = tools.find((e) => e?.face === 'Hammer S')!;
    expect(hammer.description).toContain('For building and repair.');
  });
});

describe('the Big House', () => {
  it('trains warriors for a club from the stock, and crafts and refurbishes with grid keys', () => {
    const g = game({ pool: [[Res.Wheat, 100], [Res.Sticks, 10], [Res.Flint, 5]], items: [[Item.Club, 1]] });
    // The sim worker sends what the Big House makes and why each one cannot be queued yet.
    const house = g.buildings.get(20)!;
    house.products = productsOf({ kind: BuildingKind.MainBase, complete: true } as Parameters<typeof productsOf>[0]).map((p) => [p, p === CRAFT_PRODUCT + Item.SpearFlint ? 'Not enough flint (needs 1).' : '']);
    const { c, sent } = harness(g, [{ ...sel('b:20', 'building:0:1'), kind: 'building' }], 'building:0:1');
    const card = c.card();
    expect(card[1]!.face).toBe('Warrior');
    expect(card[1]!.enabled).toBe(true);
    expect(card[5]!.key).toBe('KeyK');
    expect(card[6]!.key).toBe('KeyF');
    card[5]!.run(PRESS);
    const craft = c.card();
    const spear = craft.find((e) => e?.face === 'Spear F')!;
    expect(spear.enabled).toBe(false);
    expect(spear.reason).toContain('Not enough flint');
    const club = craft.find((e) => e?.face === 'Club')!;
    expect(club.grid).toBe(true);
    club.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'produce', building: 20, product: CRAFT_PRODUCT + Item.Club });
    expect(craft[14]!.face).toBe('Back');
  });

  it('lets warriors into a tower', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(22, BuildingKind.Tower, { name: 'Softwood tower' })] });
    const { c, sent } = harness(g, warriors, 'warrior');
    c.card()[12]!.run(PRESS);
    c.confirmTarget({ ...sel('b:22', 'building:14:1'), kind: 'building' }, at(0, 0));
    expect(sent.at(-1)).toMatchObject({ kind: 'enter', building: 22 });
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

  it('tunnels into a cliff face pressed on its side, from the ground in front, as far in as + and - set', () => {
    // A 1.1 m (10 unit) cliff from x = 2 m: the press lands on its west side, 0.5 m up.
    const units = 0.1125;
    const cliff = (x: number): number => (x >= 2.25 ? 10 * units : 0);
    const { c, sent } = harness(game(), workers, 'worker', cliff);
    c.startArea('dig', 0);
    c.areaDown(new THREE.Vector3(2.25, 0.5, 0.2));
    c.updateArea(new THREE.Vector3(2.25, 0.5, 1.2));
    c.areaUp();
    c.adjustArea(1);
    const plan = c.areaPlan()!;
    // Face column 5 (2.25 m / 0.45 m), into +x for 8 columns, 3 columns wide along the face.
    expect(plan).toMatchObject({ tunnel: true, x0: 5, x1: 12, z0: 0, z1: 2, level: 0, level2: 20 });
    expect(c.card()[0]!.description).toContain('3.6 m into the face');
    c.confirmArea();
    expect(sent.at(-1)).toMatchObject({ kind: 'dig', tunnel: 1, x0: 5, x1: 12, level: 0, level2: 20 });
  });

  it('digs down, not sideways, when the press is on top of the ground or on a low step', () => {
    const step = (x: number): number => (x >= 2.25 ? 3 * 0.1125 : 0);
    const { c } = harness(game(), workers, 'worker', step);
    c.startArea('dig', 0);
    c.areaDown(new THREE.Vector3(2.25, 0.1, 0.2));
    c.areaUp();
    expect(c.areaPlan()!.tunnel).toBe(false);
  });

  it('offers banks, ramps and fill in the Earthworks submenu, and orders a ramp up a step', () => {
    const slot = menuSlots('basic').findIndex((specs) => specs.some((s) => s.kind === BuildingKind.Earthworks));
    expect(submenuChoices(menuSlots('basic')[slot]!).map((c) => c.name)).toEqual(['Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp', 'Lumber or stone ramp']);
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

  it('places walls a column at a time with no diagonal gaps', () => {
    const line = wallLine(0, 0, 5, 3, 80);
    expect(line[0]).toEqual([0, 0]);
    expect(line.at(-1)).toEqual([5, 3]);
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!;
      const [bx, bz] = line[i]!;
      expect(Math.abs(ax - bx) + Math.abs(az - bz)).toBe(1);
    }
    expect(line.length).toBe(9);
  });
});
