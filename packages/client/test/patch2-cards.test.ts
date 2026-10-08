import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Res, RESOURCE_COUNT, School, Troop, mageLock, mageProduct, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type CommandDeps } from '../src/hud/commands.ts';
import { piecesStats } from '../src/hud/kit-text.ts';
import { armyMix, bareName } from '../src/hud/selection-panel.ts';
import { cardChoice, cardCostText, cardOptions, cardPieces, cardsOf, cardTooltip, cardTrainsText, cardWhy, goodText, keepPicks, pickTier } from '../src/hud/troops.ts';
import { type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Patch 2 (middle HUD and training cards): the cards of the Barracks
// and Magi Sanctum, their tooltips' words, and the Several panel's army line.

const ME = 0;

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: '', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, ...o,
  };
}

const barracks = (id: number): BuildingInfo =>
  building(id, BuildingKind.Barracks, { name: 'Barracks', troops: [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler].map((troop) => ({ troop, w: troop === Troop.Brawler ? 8 : 1, a: 0, lock: 0 })) });

const sanctum = (id: number, w = 1, a = 1): BuildingInfo =>
  building(id, BuildingKind.MagiSanctum, { name: 'Magi Sanctum', mages: [School.Support, School.Battle].map((school) => ({ school, w, a, lock: 0 })) });

function game(buildings: BuildingInfo[], stock: Array<[number, number]> = []): GameInfo {
  const g = new GameInfo(ME);
  const pool = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of stock) pool[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 4, supplyCap: 8, buildings, queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

describe('cardsOf', () => {
  it('gives the Barracks four troop cards and the Magi Sanctum a support and a battle mage card', () => {
    expect(cardsOf(barracks(201)).map((r) => r.card)).toEqual([Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler]);
    expect(cardsOf(sanctum(202)).map((r) => r.card)).toEqual([mageLock(School.Support), mageLock(School.Battle)]);
  });

  it('gives the Big House no cards (A, Q and N train tier 1 there, as before Patch 2), nor a building still going up', () => {
    expect(cardsOf(building(203, BuildingKind.MainBase, { troops: [{ troop: Troop.Close, w: 1, a: 0, lock: 0 }] }))).toEqual([]);
    expect(cardsOf({ ...barracks(204), complete: false })).toEqual([]);
  });
});

describe('the Sanctum cards', () => {
  it('pick wand and robe tiers 1 to 6, as the Barracks cards pick weapon and armour', () => {
    const s = sanctum(210, 2, 1);
    const card = mageLock(School.Battle);
    expect(cardChoice(s, card)).toEqual({ w: 2, a: 1, picked: false, locked: false });
    expect(cardOptions(game([s]), s, card, 'w').map((o) => o.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    pickTier([s], card, 'a', 4);
    expect(cardChoice(s, card)).toEqual({ w: 2, a: 4, picked: true, locked: false });
    // The support card keeps its own.
    expect(cardChoice(s, mageLock(School.Support)).picked).toBe(false);
    keepPicks(new Set());
    expect(cardChoice(s, card).picked).toBe(false);
  });

  it('say why a mage cannot be trained, short stock first', () => {
    const s = sanctum(211);
    const card = mageLock(School.Support);
    expect(cardWhy(game([s]), s, card, 1, 1)).toBe('Short: 0 of 5 hardwood sticks.');
    expect(cardWhy(game([s], [[Res.Sticks, 5], [Res.Flax, 3]]), s, card, 1, 1)).toBe('Not enough food (50).');
    expect(cardWhy(game([s], [[Res.Sticks, 5], [Res.Flax, 3], [Res.FarmFare, 30]]), s, card, 1, 1)).toBe('');
  });

  it('train the mage with the wand and robe on the card', () => {
    const s = sanctum(212, 1, 1);
    const g = game([s], [[Res.Sticks, 20], [Res.Flax, 9], [Res.FarmFare, 100], [Res.CopperIngot, 2]]);
    const sent: Order[] = [];
    const active = `building:${s.kind}:1`;
    const selection: Selectable[] = [{ key: `b:${s.id}`, kind: 'building', owner: ME, typeKey: active, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(3, 3, 3), label: s.name }];
    const deps: CommandDeps = {
      player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys: {} }, selection: () => selection, activeType: () => active,
      send: (o) => sent.push(o), queued: () => false, held: () => false, message: () => undefined, marker: () => undefined,
      askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
    };
    const c = new Commands(deps);
    pickTier([s], mageLock(School.Battle), 'w', 2);
    c.trainCard([s.id], mageLock(School.Battle), 1);
    expect(sent.at(-1)).toEqual({ kind: 'produce', player: ME, building: 212, product: mageProduct(School.Battle, 2, 1), count: 1 });
    keepPicks(new Set());
  });
});

describe('the card tooltips', () => {
  it('name the kit, its numbers, its cost with counted ingots, and the card state', () => {
    expect(cardTrainsText(Troop.Close, 4, 3)).toBe('Trains a Bronze swordsman: bronze shortsword, copper scale jack, boiled-leather targe.');
    expect(cardCostText(Troop.Close, 4, 3)).toBe('30 food, 2 bronze ingots, 1 hardwood lumber, 2 leather, 5 copper ingots, 3 hardened leather, 3 planks. 3 minutes, 1 supply.');
    expect(cardTooltip(Troop.Long, { w: 2, a: 1, picked: true, locked: false }, 'Barracks').split('\n')).toEqual([
      'Trains a Flint spearman: flint-headed spear, leather jerkin.',
      'Damage 12, a swing every 1.4 s, reach 2.5 m. Protection 10%.',
      'Costs 30 food, 3 hardwood sticks, 1 flint, 3 leather. 1 minute 25 seconds, 1 supply.',
      'Picked: until this Barracks is deselected.',
    ]);
    expect(cardTooltip(mageLock(School.Battle), { w: 1, a: 1, picked: false, locked: true }, 'Magi Sanctum')).toContain('Locked: always this kit here; allies see it.');
    expect(cardTrainsText(mageLock(School.Support), 2, 1)).toBe('Trains a Support mage (Novice Acolyte) with a copper-tipped wand and a homespun robe.');
  });

  it('show a tier against the kit trained now, protection from nothing included', () => {
    expect(piecesStats(cardPieces(Troop.Close, 4, 3), cardPieces(Troop.Close, 1, 0))).toBe('Damage 16 (+8), a swing every 1.2 s (−0.1 s), reach 1.2 m. Protection 25% (+25%), block 20% (+20%).');
    expect(piecesStats(cardPieces(mageLock(School.Support), 3, 2), cardPieces(mageLock(School.Support), 1, 1), true)).toBe(
      'Spell power 110% (+10%), mana bar +20 (+20), protection 5% (+5%), mana regain +5% (+5%).',
    );
  });

  it('count ingots and measure the rest', () => {
    expect([goodText(Res.BronzeIngot, 2), goodText(Res.CopperIngot, 1), goodText(Res.Leather, 4)]).toEqual(['2 bronze ingots', '1 copper ingot', '4 leather']);
  });
});

describe('the Several panel', () => {
  const unit = (label: string): Selectable => ({ key: label, kind: 'unit', owner: ME, typeKey: 'warrior', centre: new THREE.Vector3(), halfSize: new THREE.Vector3(), label });

  it("keeps the rank out of the title (the XP bar's tooltip names it, Patch 3)", () => {
    expect(bareName('Close melee (Veteran)')).toBe('Close melee');
    expect(bareName('Barracks')).toBe('Barracks');
  });

  it("sums the troops' tab in the crossed swords' tooltip, most first", () => {
    const items = [...Array.from({ length: 5 }, () => unit('Close melee (Recruit)')), unit('Ranger (Soldier)'), unit('Ranger (Recruit)'), unit('Cavalry (Hero)')];
    expect(armyMix(items)).toBe('5 Close melee, 2 Rangers, 1 Cavalry');
  });
});
