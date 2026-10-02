import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  BUILDINGS,
  CRAFT_PRODUCT,
  Item,
  ITEM_COUNT,
  MONSTERS,
  Res,
  RESOURCE_COUNT,
  Research,
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
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], status: '', name: 'Big House', upgradeWhy: '', ...o,
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
    changed: () => undefined,
  };
  return { c: new Commands(deps), sent, messages };
}

const PRESS = { shift: false, ctrl: false };
const warriors = [sel('e:3', 'warrior'), sel('e:4', 'warrior')];
const workers = [sel('e:1', 'worker'), sel('e:2', 'worker')];
const zombie = sel('e:9', 'mob:0', MONSTERS);
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);

describe('the warrior card', () => {
  it('has the movement row, then Equip Best, Equipment, the lock and archery, and Enter', () => {
    const { c } = harness(game(), warriors, 'warrior');
    const card = c.card();
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', 'Patrol', 'Move', 'Equip', 'Gear', 'Auto', 'Archery', '', '', '', 'Enter', '', '']);
    expect(card.slice(0, 5).every((e) => e!.enabled)).toBe(true);
    expect(card[0]!.key).toBe('KeyA');
    expect(card[5]!.key).toBe('KeyQ');
    expect(card[6]!.key).toBe('KeyI');
    expect(card[6]!.enabled).toBe(false); // two selected
    expect(card[8]!.reason).toContain('Flint tools');
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

  it('sends untrained warriors to a Barracks for archery once flint tools are researched', () => {
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(21, BuildingKind.Barracks)], pool: [[Res.Wheat, 100]], research: 1 << Research.FlintTools });
    const { c, sent } = harness(g, warriors, 'warrior');
    const card = c.card();
    expect(card[8]!.enabled).toBe(true);
    card[8]!.run(PRESS);
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
    const { c } = harness(game(), [workers[0]!], 'worker');
    c.card()[14]!.run(PRESS);
    const card = c.card();
    expect(card.slice(0, 3).map((e) => e!.name)).toEqual(['Tools', 'Boots', 'Torch']);
    expect(card[13]!.action).toBe('rankUp');
  });
});

describe('the Big House', () => {
  it('trains warriors for a club from the stock, and crafts and refurbishes with grid keys', () => {
    const g = game({ pool: [[Res.Wheat, 100], [Res.Sticks, 10], [Res.Flint, 5]], items: [[Item.Club, 1]] });
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
    expect(spear.reason).toContain('Flint tools');
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

  it('offers banks, ramps and fill in the Earthworks submenu, and orders a ramp up a step', () => {
    const slot = menuSlots('basic').findIndex((specs) => specs.some((s) => s.kind === BuildingKind.Earthworks));
    expect(submenuChoices(menuSlots('basic')[slot]!).map((c) => c.name)).toEqual(['Earth bank', 'Earth ramp', 'Fill', 'Lumber or stone ramp']);
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
