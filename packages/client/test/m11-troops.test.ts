import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Research, Res, RESOURCE_COUNT, Troop, troopProduct, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type CommandDeps } from '../src/hud/commands.ts';
import { armourOptions, keepPicks, lockedCount, lockTiers, padlock, pickTier, troopChoice, troopWhy, weaponOptions } from '../src/hud/troops.ts';
import { type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Milestone 11 (Troops and gear: Training troops): the troop panel's choices
// and reasons, and the training buttons on the Barracks and main base.

const ME = 0;
const PRESS = { shift: false, ctrl: false };
const bit = (r: number): number => 1 << r;

/** Each test uses its own building ids: the panel's picks last for the session, by building. */
function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: '', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, ...o,
  };
}

/** The Barracks' four troop types, at the given default tiers. */
function barracks(id: number, w = 1, a = 0, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return building(id, BuildingKind.Barracks, { name: 'Barracks', troops: [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler].map((troop) => ({ troop, w: troop === Troop.Brawler ? 8 : w, a, lock: 0 })), ...o });
}

interface World {
  buildings: BuildingInfo[];
  pool?: Array<[number, number]>;
  research?: number;
  forge?: number;
  supply?: [number, number];
}

/** No units: what the panel needs is the pool, the research, the best forge and supply. */
function game(w: World): GameInfo {
  const g = new GameInfo(ME);
  const pool = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of w.pool ?? []) pool[r] = n;
  const [used, cap] = w.supply ?? [4, 8];
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: used, supplyCap: cap, buildings: w.buildings, queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: w.research ?? 0, forge: w.forge ?? 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

function harness(g: GameInfo, b: BuildingInfo) {
  const sent: Order[] = [];
  const active = `building:${b.kind}:${b.level}`;
  const selection: Selectable[] = [{ key: `b:${b.id}`, kind: 'building', owner: ME, typeKey: active, centre: new THREE.Vector3(0, 0, 0), halfSize: new THREE.Vector3(3, 3, 3), label: b.name }];
  const deps: CommandDeps = {
    player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys: {} }, selection: () => selection, activeType: () => active,
    send: (o) => sent.push(o), queued: () => false, held: () => false, message: () => undefined, marker: () => undefined,
    askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent };
}

/** Food for a troop (30), sticks and flint for the stone-age kits, leather and planks for a jerkin and a wooden shield. */
const STOCK: Array<[number, number]> = [[Res.FarmFare, 100], [Res.Sticks, 20], [Res.Flint, 4], [Res.Leather, 8], [Res.Planks, 6]];

describe('troopChoice', () => {
  it("is the sim's default for the building until a pick is made", () => {
    const b = barracks(101, 2, 1);
    expect(troopChoice(b, Troop.Long)).toEqual({ w: 2, a: 1, picked: false, locked: false });
    // The brawler is tier 8 only.
    expect(troopChoice(b, Troop.Brawler)).toMatchObject({ w: 8, a: 1 });
  });

  it('keeps a pick made on the card, a line at a time, only while its building stays selected (Jade)', () => {
    const b = barracks(102, 1, 0);
    // An unlocked card sends nothing: the pick is the panel's.
    expect(pickTier([b], Troop.Close, 'w', 4)).toEqual([]);
    expect(troopChoice(b, Troop.Close)).toEqual({ w: 4, a: 0, picked: true, locked: false });
    pickTier([b], Troop.Close, 'a', 3);
    expect(troopChoice(b, Troop.Close)).toEqual({ w: 4, a: 3, picked: true, locked: false });
    // Another troop type and another building keep their own.
    expect(troopChoice(b, Troop.Long).picked).toBe(false);
    expect(troopChoice(barracks(103), Troop.Close).picked).toBe(false);
    // Still selected: the pick holds. Deselected: back to the stock's best.
    keepPicks(new Set([102]));
    expect(troopChoice(b, Troop.Close).picked).toBe(true);
    keepPicks(new Set([103]));
    expect(troopChoice(b, Troop.Close)).toEqual({ w: 1, a: 0, picked: false, locked: false });
  });

  it('follows the padlock over any pick; a pick on a locked card moves the lock; a pick not offered is dropped', () => {
    // Lock: 1 + weapon x 10 + armour.
    expect(lockTiers(0)).toBeNull();
    expect(lockTiers(1 + 5 * 10 + 3)).toEqual({ w: 5, a: 3 });
    const b = barracks(104);
    pickTier([b], Troop.Ranger, 'w', 2);
    b.troops.find((t) => t.troop === Troop.Ranger)!.lock = 1 + 7 * 10 + 4;
    expect(troopChoice(b, Troop.Ranger)).toEqual({ w: 7, a: 4, picked: false, locked: true });
    expect(pickTier([b], Troop.Ranger, 'a', 2)).toEqual([{ building: 104, lock: 1 + 7 * 10 + 2 }]);
    // A main base trains tier 1 at most: a pick above that is not kept.
    const house = building(105, BuildingKind.MainBase, { troops: [{ troop: Troop.Close, w: 1, a: 0, lock: 0 }] });
    pickTier([house], Troop.Close, 'w', 4);
    expect(troopChoice(house, Troop.Close)).toEqual({ w: 1, a: 0, picked: false, locked: false });
  });
});

describe('padlock', () => {
  it('locks every selected building on the kit the card shows, and only those', () => {
    const one = barracks(106, 3, 2);
    const two = barracks(107, 1, 0);
    expect(padlock([one, two], Troop.Long)).toEqual([
      { building: 106, lock: 1 + 3 * 10 + 2 },
      { building: 107, lock: 1 + 3 * 10 + 2 },
    ]);
    expect(lockedCount([one, two], Troop.Long)).toBe(0);
  });

  it('opens every locked one when the card shown is locked; only the padlock unlocks', () => {
    const one = barracks(108, 3, 2);
    const two = barracks(109, 1, 0);
    one.troops.find((t) => t.troop === Troop.Close)!.lock = 1 + 5 * 10 + 1;
    expect(lockedCount([one, two], Troop.Close)).toBe(1);
    expect(padlock([one, two], Troop.Close)).toEqual([{ building: 108, lock: 0 }]);
    // The first selected one decides: unlocked, the press locks all of them on its kit.
    expect(padlock([two, one], Troop.Close)).toEqual([
      { building: 109, lock: 1 + 1 * 10 + 0 },
      { building: 108, lock: 1 + 1 * 10 + 0 },
    ]);
  });
});

describe('weaponOptions and armourOptions', () => {
  it('list the tiers a building offers, each with why it cannot be had', () => {
    const b = barracks(110);
    const g = game({ buildings: [b], pool: [[Res.Sticks, 4]], forge: 1 });
    const long = weaponOptions(g, b, Troop.Long);
    expect(long.map((o) => o.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(long[0]).toMatchObject({ tier: 1, name: 'Fire-hardened spear', why: '', short: false });
    // Short of flint: a red tier, not a locked one, and the tile names what is short.
    expect(long[1]).toMatchObject({ tier: 2, name: 'Flint-headed spear', why: 'Short: 0 of 1 flint in stock.', short: true });
    expect(long[3]!.why).toBe('Needs Bronze researched first.');
    expect(long[4]!.why).toBe('Needs a level 3 main base.');
    expect(long[6]!.why).toBe('Needs a level 7 main base.');
    // Close melee starts at fists; the brawler has one kit; rangers name their bows.
    expect(weaponOptions(g, b, Troop.Close)[0]).toMatchObject({ tier: 0, name: 'Fists', why: '' });
    expect(weaponOptions(g, b, Troop.Brawler).map((o) => [o.tier, o.name])).toEqual([[8, 'Flintlock pistol and cutlass']]);
    expect(weaponOptions(g, b, Troop.Ranger)[2]!.name).toBe('Recurve bow, copper arrowheads');
  });

  it('offer a main base tier 1 at most, and put close melee shields in the armour names', () => {
    const house = building(111, BuildingKind.MainBase, { troops: [{ troop: Troop.Close, w: 1, a: 0, lock: 0 }] });
    const g = game({ buildings: [house] });
    expect(weaponOptions(g, house, Troop.Close).map((o) => o.name)).toEqual(['Fists', 'Hardwood cudgel']);
    expect(armourOptions(g, house, Troop.Close).map((o) => o.name)).toEqual(['No armour', 'Leather jerkin, wooden shield']);
    expect(armourOptions(g, house, Troop.Long).map((o) => o.name)).toEqual(['No armour', 'Leather jerkin']);
    expect(armourOptions(g, barracks(112), Troop.Close)[3]!.name).toBe('Copper scale jack, boiled-leather targe');
  });
});

describe('troopWhy', () => {
  it('is empty when the building can train the kit now', () => {
    const b = barracks(120);
    expect(troopWhy(game({ buildings: [b], pool: STOCK }), b, Troop.Close, 2, 1)).toBe('');
  });

  it('gives the first reason it cannot, in order', () => {
    const b = barracks(121);
    const g = game({ buildings: [b], pool: STOCK });
    expect(troopWhy(g, building(122, BuildingKind.MainBase), Troop.Close, 4, 0)).toBe('This building does not train that.');
    expect(troopWhy(g, b, Troop.Brawler, 1, 0)).toBe('This building does not train that.');
    expect(troopWhy(g, b, Troop.Close, 3, 0)).toBe('Needs a Forge.');
    expect(troopWhy(game({ buildings: [b], pool: STOCK, forge: 4, research: bit(Research.Steel) }), b, Troop.Ranger, 7, 0)).toBe('Needs Crossbows researched first.');
    expect(troopWhy(game({ buildings: [b], pool: [[Res.FarmFare, 100]] }), b, Troop.Close, 1, 1)).toBe('Short: 0 of 3 hardwood sticks.');
    // Farm fare feeds 2 a portion: 14 is 28 food, short of a troop's 30.
    expect(troopWhy(game({ buildings: [b], pool: [[Res.FarmFare, 14], [Res.Sticks, 20]] }), b, Troop.Close, 1, 0)).toBe('Not enough food (30).');
    expect(troopWhy(game({ buildings: [b], pool: STOCK, supply: [8, 8] }), b, Troop.Close, 1, 0)).toBe('Not enough supply (8 of 8).');
    const full = barracks(123, 1, 0, { queue: Array.from({ length: 5 }, () => ({ product: troopProduct(Troop.Close, 1, 0), done: 0, stepsLeft: 0 })) });
    expect(troopWhy(g, full, Troop.Close, 1, 0)).toBe('The queue is full (5).');
  });

  it('wants main base 3 and a tamed, grown horse in a Barn for cavalry (Patch 2: trained at the Barracks)', () => {
    const b = barracks(124, 1, 0, { troops: [{ troop: Troop.Cavalry, w: 1, a: 0, lock: 0 }] });
    expect(troopWhy(game({ buildings: [b], pool: STOCK }), b, Troop.Cavalry, 1, 0)).toBe('Needs a level 3 main base.');
    const g = game({ buildings: [b, building(125, BuildingKind.MainBase, { level: 3 })], pool: STOCK });
    expect(troopWhy(g, b, Troop.Cavalry, 1, 0)).toBe('No grown tamed horse ready in a Barn.');
    expect(troopWhy(g, { ...b, horses: 2 }, Troop.Cavalry, 1, 0)).toBe('');
  });
});

describe('the Barracks card', () => {
  it('has close melee, long melee, rangers and brawlers on A, Q, N and B, each training its pick', () => {
    const b = barracks(130);
    const g = game({ buildings: [b], pool: STOCK });
    const { c, sent } = harness(g, b);
    const card = c.card();
    expect(card.slice(0, 4).map((e) => [e!.action, e!.face, e!.key])).toEqual([
      ['trainClose', 'Close', 'KeyA'],
      ['trainLong', 'Long', 'KeyQ'],
      ['trainRanger', 'Ranger', 'KeyN'],
      ['trainBrawler', 'Brawler', 'KeyB'],
    ]);
    expect(card[3]!.reason).toBe('Needs a Forge.');
    expect(card[9]!.face).toBe('Rally');
    // A pick in the panel changes what the button trains.
    pickTier([b], Troop.Long, 'w', 2);
    pickTier([b], Troop.Long, 'a', 1);
    const long = c.card()[1]!;
    expect(long.description).toContain('Flint-headed spear, leather jerkin (weapon tier 2, armour tier 1)');
    long.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'produce', player: ME, building: 130, product: troopProduct(Troop.Long, 2, 1), count: 1 });
    // The panel's picture button does the same for one building.
    c.trainTroop(130, Troop.Close, 1);
    expect(sent.at(-1)).toEqual({ kind: 'produce', player: ME, building: 130, product: troopProduct(Troop.Close, 1, 0), count: 1 });
  });

  it('greys a troop button with the reason when its pick cannot be trained', () => {
    const b = barracks(131);
    const { c } = harness(game({ buildings: [b], pool: [[Res.FarmFare, 100]] }), b);
    const close = c.card()[0]!;
    expect(close.enabled).toBe(false);
    expect(close.reason).toBe('Short: 0 of 3 hardwood sticks.');
  });
});
