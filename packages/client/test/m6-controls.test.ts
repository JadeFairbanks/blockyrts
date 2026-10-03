import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, FOODS, Line, MONSTERS, Product, Res, RESOURCE_COUNT, Spell, UnitKind, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type CommandDeps } from '../src/hud/commands.ts';
import { ACTIONS, clashes, keyFor } from '../src/input/bindings.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

const ME = 0;
const PRESS = { shift: false, ctrl: false };

function sel(key: string, typeKey: string, owner = ME): Selectable {
  return { key, kind: 'unit', owner, typeKey, centre: new THREE.Vector3(4, 0, 4), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey };
}

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], up: [], status: '', name: '', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false, troops: [], horses: 0, farm: null, ...o,
  };
}

/** Support mages 5 (rank 2) and 6 (rank 1), battle mage 7 (rank 3), each with a hazel wand and a homespun robe (tier 1), warrior 3, a zombie 9. */
function game(o: { buildings?: BuildingInfo[]; spells?: InfoMessage['spells']; mageRanks?: InfoMessage['mageRanks']; food?: number; pool?: Array<[number, number]>; forge?: number } = {}): GameInfo {
  const g = new GameInfo(ME);
  const rows: Array<[number, number, number, number, number]> = [
    [3, ME, UnitKind.Warrior, 1, 0],
    [5, ME, UnitKind.Mage, 2, 1],
    [6, ME, UnitKind.Mage, 1, 1],
    [7, ME, UnitKind.Mage, 3, 2],
    [9, MONSTERS, UnitKind.Mob, 1, 0],
  ];
  const data = new Int32Array(rows.length * STATE_STRIDE);
  rows.forEach(([id, owner, kind, rank, school], i) => {
    const b = i * STATE_STRIDE;
    data[b + S.id] = id;
    data[b + S.owner] = owner;
    data[b + S.kind] = kind;
    data[b + S.rank] = rank;
    data[b + S.school] = school;
    data[b + S.hp] = 60;
    data[b + S.maxHp] = 60;
    data[b + S.carryRes] = 255;
    if (kind === UnitKind.Mage) {
      data[b + S.wTier] = 1;
      data[b + S.aTier] = 1;
    }
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const pool = new Int32Array(RESOURCE_COUNT);
  pool[FOODS[0]!] = o.food ?? 100;
  for (const [r, n] of o.pool ?? []) pool[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 4, supplyCap: 8, buildings: o.buildings ?? [building(20, BuildingKind.MainBase)], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: o.forge ?? 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, dontEat: 0, starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [],
    spells: o.spells ?? [
      [5, [[Spell.Heal, '', 0], [Spell.Quicken, 'Not ready yet.', 60], [Spell.Fortify, 'Learned at rank 3.', 0], [Spell.Rally, 'Learned at rank 4.', 0], [Spell.Warding, 'Needs Hexcraft researched at a Magi Sanctum.', 0]]],
      [6, [[Spell.Heal, 'Not enough mana (15).', 0], [Spell.Quicken, 'Learned at rank 2.', 0], [Spell.Fortify, 'Learned at rank 3.', 0], [Spell.Rally, 'Learned at rank 4.', 0], [Spell.Warding, 'Learned at rank 2.', 0]]],
      [7, [[Spell.ArcaneBolt, '', 0], [Spell.Beam, '', 0], [Spell.Fireball, '', 0], [Spell.AreaBlast, 'Learned at rank 4.', 0], [Spell.Counterspell, 'Needs Hexcraft researched at a Magi Sanctum.', 0]]],
    ],
    mageRanks: o.mageRanks ?? [[5, ''], [6, ''], [7, 'Training to Mage needs 300 experience from combat.']],
    peoples: [],
    players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

function harness(g: GameInfo, selection: Selectable[], active: string | null) {
  const sent: Order[] = [];
  const messages: string[] = [];
  const deps: CommandDeps = {
    player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys: {} }, selection: () => selection, activeType: () => active,
    send: (o) => sent.push(o), queued: () => false, held: () => false, message: (t) => messages.push(t), marker: () => undefined,
    askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent, messages };
}

const support = [sel('e:5', 'mage:support'), sel('e:6', 'mage:support')];
const battle = [sel('e:7', 'mage:battle')];
const warrior = sel('e:3', 'warrior');
const zombie = sel('e:9', 'mob:0', MONSTERS);

describe('the mage card', () => {
  it('has the movement row, her five spells, then Eat, Rank, Enter and her wand and robe upgrades, each with a button', () => {
    const { c } = harness(game(), support, 'mage:support');
    const card = c.card();
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', 'Patrol', 'Move', 'Heal', 'Quicken 3', 'Fortify', 'Rally', 'Warding', 'Eat', 'Rank', 'Enter', 'Wand +', 'Robe +']);
    expect(card.slice(5, 10).map((e) => e!.key)).toEqual(['KeyR', 'KeyK', 'KeyF', 'KeyY', 'KeyW']);
    // A cooldown only delays a spell; rank and research grey it out with the reason.
    expect(card[6]!.enabled).toBe(true);
    expect(card[7]!.reason).toBe('Learned at rank 3.');
    expect(card[9]!.reason).toBe('Needs Hexcraft researched at a Magi Sanctum.');
    // F is Fortify here, so Eat is a click only.
    expect(card[10]!.key).toBe('');
    // No room for Max twins: the upgrades are Q and X, and pressing one twice goes to the best.
    expect([card[13]!.key, card[14]!.key]).toEqual(['KeyQ', 'KeyX']);
    // A copper-tipped wand and a leather-trimmed robe (tier 2) are copper-age work.
    expect(card[13]!.reason).toBe('Needs a Casting Hearth.');
    expect(card[14]!.reason).toBe('Needs a Casting Hearth.');
    const keys = card.filter((e) => e && e.key).map((e) => e!.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('upgrades a wand or a robe a tier at a time, or to the best when pressed twice', () => {
    const g = game({ pool: [[Res.Sticks, 10], [Res.CopperIngot, 2], [Res.Flax, 6], [Res.Leather, 2]], forge: 1 });
    const { c, sent } = harness(g, support, 'mage:support');
    const card = c.card();
    expect(card[13]).toMatchObject({ action: 'upgradeWeapon', name: 'Upgrade wand', enabled: true });
    expect(card[13]!.description).toContain('the first to Copper-tipped wand (tier 2)');
    expect(card[14]).toMatchObject({ action: 'upgradeArmour', name: 'Upgrade robe', enabled: true });
    card[13]!.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [5, 6], line: Line.Weapon, max: 0 });
    card[14]!.double!(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'upgradeKit', player: ME, units: [5, 6], line: Line.Armour, max: 1 });
  });

  it('casts on the unit clicked, and on the best targets when pressed twice', () => {
    const { c, sent, messages } = harness(game(), support, 'mage:support');
    c.card()[5]!.run(PRESS);
    expect(c.targeting).toMatchObject({ command: 'cast', spell: Spell.Heal });
    c.confirmTarget(zombie, new THREE.Vector3(4, 0, 4));
    expect(sent.length).toBe(0);
    expect(messages.at(-1)).toBe('Pick one of your units for Heal.');
    c.confirmTarget(warrior, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'cast', units: [5, 6], spell: Spell.Heal, target: 3, auto: 0 });
    expect(c.targeting).toBeNull();
    c.card()[5]!.double!(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'cast', units: [5, 6], spell: Spell.Heal, target: 0, auto: 1 });
  });

  it('aims an area spell at the ground and an attack at an enemy', () => {
    const { c, sent } = harness(game(), battle, 'mage:battle');
    const card = c.card();
    expect(card.slice(5, 10).map((e) => e!.face)).toEqual(['Bolt', 'Beam', 'Fireball', 'Blast', 'Counter']);
    card[6]!.run(PRESS);
    c.confirmTarget(zombie, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'cast', units: [7], spell: Spell.Beam, target: 9 });
    card[7]!.run(PRESS);
    c.confirmTarget(null, new THREE.Vector3(2, 0, -1));
    expect(sent.length).toBe(1);
    expect(card[8]!.enabled).toBe(false);
  });

  it('sends mages to rank training at a Magi Sanctum, with what each rank takes', () => {
    const noSanctum = harness(game(), support, 'mage:support').c.card()[11]!;
    expect(noSanctum.reason).toBe('Needs a Magi Sanctum.');
    const g = game({ buildings: [building(20, BuildingKind.MainBase), building(21, BuildingKind.MagiSanctum)] });
    const { c, sent } = harness(g, support, 'mage:support');
    const rank = c.card()[11]!;
    expect(rank.enabled).toBe(true);
    rank.run(PRESS);
    // Adept Acolyte takes 2 mana crystals, which the pool lacks: only the Novice goes.
    expect(sent.at(-1)).toMatchObject({ kind: 'trainRank', units: [6], building: 21 });
    // The battle mage waits on experience for a rank wand.
    expect(harness(g, battle, 'mage:battle').c.card()[11]!.reason).toBe('Training to Mage needs 300 experience from combat.');
  });

  it('trains support and battle mages at the Sanctum on S and M', () => {
    const products: Array<[number, string]> = [[Product.SupportMage, ''], [Product.BattleMage, '']];
    const g = game({ buildings: [building(21, BuildingKind.MagiSanctum, { products })] });
    const { c, sent } = harness(g, [{ ...sel('b:21', 'building'), kind: 'building' }], `building:${BuildingKind.MagiSanctum}:0`);
    const card = c.card();
    expect(card[0]!.name).toBe('Support mage');
    expect(card[0]!.key).toBe('KeyS');
    expect(card[1]!.key).toBe('KeyM');
    expect(card[0]!.enabled).toBe(true);
    card[1]!.run(PRESS);
    expect(sent.at(-1)).toMatchObject({ kind: 'produce', building: 21, product: Product.BattleMage });
  });

  it('gives every spell its letter from Table 13 with no clash among the mage keys', () => {
    const spells = ACTIONS.filter((a) => a.group === 'Mages');
    expect(spells.length).toBe(11);
    for (const a of spells) expect(clashes({}, a.id, keyFor({}, a.id)).filter((n) => !/(support|battle) mages/.test(n))).toEqual([]);
  });
});
