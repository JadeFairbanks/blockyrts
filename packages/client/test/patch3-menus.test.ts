import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Engine, ENGINE_PRODUCT, Greyed, levelSpec, Product, RECIPE_PRODUCT, RECIPES, Res, RESEARCH_PRODUCT, RESOURCE_COUNT, SLAUGHTER_PRODUCT, Species, Troop, troopProduct, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Jade's Patch 3 (action and build menus): buildings the stock cannot pay
// for are greyed out, a card whose one button only opens a bigger menu
// opens on that menu, and a click on a greyed-out button asks the sim who
// can sort it out (the questions themselves: sim test patch3-greyed).

const ME = 0;
const PRESS = { shift: false, ctrl: false };

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: BUILDINGS[kind]!.name, upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, ...o,
  };
}

/** Workers 1 and 2, and the given buildings and pool. */
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
    data[o + S.carryRes] = 255;
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

function harness(g: GameInfo, selection: Selectable[], active: string) {
  const sent: Order[] = [];
  const deps: CommandDeps = {
    player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys: {} }, selection: () => selection, activeType: () => active,
    send: (o) => sent.push(o), queued: () => false, held: () => false, message: () => undefined, marker: () => undefined,
    askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  const c = new Commands(deps);
  // A desktop card: no paging in these tests.
  (c as unknown as { d: CommandDeps }).d.slots = () => ({ most: 40 });
  return { c, sent };
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

/** The recipes a building kind makes, as its products. */
const recipesAt = (kind: number): Array<[number, string]> => RECIPES.filter((r) => r.at.includes(kind)).map((r) => [RECIPE_PRODUCT + r.id, ''] as [number, string]);

describe('the build menu greys out what the stock cannot pay for (Patch 3)', () => {
  const main = building(9, BuildingKind.MainBase, { level: 3 });
  const open = (pool: Array<[number, number]>, more: BuildingInfo[] = []) => {
    const h = harness(game([main, ...more], pool), workers, 'worker');
    h.c.card().find((e) => e.action === 'build')!.run(PRESS);
    return h;
  };

  it('greys a building out with what is short, so it cannot be picked up to place', () => {
    const { c } = open([]);
    const farm = button(c.card(), 'Farm');
    expect(farm.enabled).toBe(false);
    expect(farm.reason).toMatch(/^Not enough .+ \(needs \d+, you have 0\)\.$/);
    expect(farm.description).toContain('Cost: ');
  });

  it('keeps one the stock can pay for lit, and the prerequisite reason first when both', () => {
    // The Farm's "any lumber" (Jade's mini balance) paid in hardwood.
    const pool = levelSpec(BuildingKind.Farm, 1).cost.map(([r, n]) => [r === Res.AnyLumber ? Res.HardwoodLumber : r, n] as [number, number]);
    const { c } = open(pool);
    const farm = button(c.card(), 'Farm');
    expect(farm).toMatchObject({ enabled: true, reason: '' });
    // The Defences and Lights submenus stay open-able: only a prerequisite greys them.
    expect(button(c.card(), 'Defences').enabled).toBe(true);
  });

  it("prices a second Scholar's Lodge twice, as the sim does", () => {
    const cost = levelSpec(BuildingKind.ScholarsLodge, 1).cost.map(([r, n]) => [r, n] as [number, number]);
    expect(button(open(cost).c.card(), "Scholar's Lodge").enabled).toBe(true);
    const second = button(open(cost, [building(30, BuildingKind.ScholarsLodge)]).c.card(), "Scholar's Lodge");
    expect(second.enabled).toBe(false);
    expect(second.description).toContain(`${cost[0]![1] * 2} `);
  });

  it('greys out each earthwork by what one column of it takes: earth, or the ramp steps', () => {
    const { c } = open([[Res.LumberRamp, 4]]);
    button(c.card(), 'Defences').run(PRESS);
    const card = c.card();
    expect(button(card, 'Earth bank')).toMatchObject({ enabled: false, reason: 'Not enough earth (needs 1, you have 0).' });
    expect(button(card, 'Lumber ramp').enabled).toBe(true);
    expect(button(card, 'Stone ramp').reason).toMatch(/^Not enough stone ramp step/);
  });

  it('asks the sim on a click while greyed out, with the selected workers', () => {
    const { c, sent } = open([]);
    const farm = button(c.card(), 'Farm');
    farm.grey!();
    expect(sent.at(-1)).toEqual({ kind: 'greyed', player: ME, what: Greyed.Building, id: BuildingKind.Farm, building: 0, units: [1, 2] });
  });
});

describe('a card with one button that only opens a menu opens on that menu (Patch 3)', () => {
  const lone: Array<[number, Array<[number, string]>]> = [
    [BuildingKind.Forge, recipesAt(BuildingKind.Forge)],
    [BuildingKind.Workshop, recipesAt(BuildingKind.Workshop)],
    [BuildingKind.ScholarsLodge, [[RESEARCH_PRODUCT + 1, ''], [RESEARCH_PRODUCT + 2, '']]],
    [BuildingKind.Barn, [[SLAUGHTER_PRODUCT + Species.Cattle, '']]],
  ];

  it.each(lone)('kind %i: its products straight away, with no Smelt, Make or Research and no Back', (kind, products) => {
    const b = building(40, kind, { products });
    const { c } = harness(game([b]), [picked(b)], picked(b).typeKey);
    const card = c.card();
    expect(card.some((e) => e.action === 'craft')).toBe(false);
    expect(card.some((e) => e.action === 'back')).toBe(false);
    // The Workshop's long list pages on More (V), as its Make menu did.
    const shown = card.filter((e) => e.action !== 'more');
    expect(shown.map((e) => e.product)).toEqual(products.slice(0, shown.length).map(([p]) => p));
    expect(Commands.lone(card)).toBe(false);
  });

  it('keeps the menu button where the card has more on it: the Artillery workshop trains its crewman too', () => {
    const b = building(41, BuildingKind.ArtilleryWorkshop, { products: [[Product.Crewman, ''], [ENGINE_PRODUCT + Engine.BronzeCannon, '']] });
    const card = harness(game([b]), [picked(b)], picked(b).typeKey).c.card();
    expect(card.map((e) => e.action)).toEqual(expect.arrayContaining(['trainCrewman', 'craft']));
  });

  it('keeps Cancel on a Forge still going up, not the menu', () => {
    const b = building(42, BuildingKind.Forge, { complete: false, built: 10, products: recipesAt(BuildingKind.Forge) });
    const card = harness(game([b]), [picked(b)], picked(b).typeKey).c.card();
    expect(card.map((e) => e.action)).toEqual(['cancelBuild']);
  });
});

describe('a click on a greyed-out action asks the sim (Patch 3)', () => {
  it('sends the product and the building for a smelting button', () => {
    const products = recipesAt(BuildingKind.Forge);
    products[0]![1] = 'Short: 0 of 2 copper ore.';
    const b = building(50, BuildingKind.Forge, { products });
    const { c, sent } = harness(game([b]), [picked(b)], picked(b).typeKey);
    const first = c.card()[0]!;
    expect(first.enabled).toBe(false);
    first.grey!();
    expect(sent.at(-1)).toEqual({ kind: 'greyed', player: ME, what: Greyed.Product, id: products[0]![0], building: 50, units: [] });
  });

  it('sends the troop with the kit on its card for a Barracks button', () => {
    const b = building(51, BuildingKind.Barracks, { troops: [{ troop: Troop.Close, w: 2, a: 1, lock: 0 }] });
    const { c, sent } = harness(game([b]), [picked(b)], picked(b).typeKey);
    const close = c.card().find((e) => e.action === 'trainClose')!;
    expect(close.enabled).toBe(false);
    close.grey!();
    expect(sent.at(-1)).toMatchObject({ kind: 'greyed', what: Greyed.Product, id: troopProduct(Troop.Close, 2, 1), building: 51 });
  });

  it('sends Upgrade for the main base', () => {
    const b = building(52, BuildingKind.MainBase, { upgradeWhy: 'Not enough stone.' });
    const { c, sent } = harness(game([b]), [picked(b)], picked(b).typeKey);
    const up = c.card().find((e) => e.action === 'upgrade')!;
    expect(up.enabled).toBe(false);
    up.grey!();
    expect(sent.at(-1)).toEqual({ kind: 'greyed', player: ME, what: Greyed.Upgrade, id: 0, building: 52, units: [] });
  });
});
