import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, NO_CARRY, Product, Res, RESOURCE_COUNT, UnitKind, type UnitOrder } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { ATTACK_PING_QUIET_MS, ATTACK_PING_RADIUS_M, AttackPings } from '../src/hud/attack-pings.ts';
import { Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Mini patch 7.3 (Jade): one ping at the start of each fight your units did
// not start; every unit button greys out when it cannot be made (a worker's
// kit too); auto hunt and auto gather wear the yellow autocast ring.

const ME = 0;

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: BUILDINGS[kind]!.name, upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, room: 0, fixedEngine: 0, ...o,
  };
}

/** Two units (ids 1 and 2) of a kind, these orders each, this stock and these buildings. */
function game(kind: number, buildings: BuildingInfo[], queue: UnitOrder[] = [], pool = new Int32Array(RESOURCE_COUNT)): GameInfo {
  const g = new GameInfo(ME);
  const data = new Int32Array(2 * STATE_STRIDE);
  for (let i = 0; i < 2; i++) {
    const o = i * STATE_STRIDE;
    data[o + S.id] = i + 1;
    data[o + S.owner] = ME;
    data[o + S.kind] = kind;
    data[o + S.wTier] = 1;
    data[o + S.rank] = 1;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = NO_CARRY;
  }
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: 2, data, shots: new Int32Array(0), hits: [] });
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 2, supplyCap: 8, buildings, queues: [[1, queue], [2, queue]], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [], carry: [], effects: [],
  };
  g.onInfo(info);
  return g;
}

function commands(g: GameInfo, selection: Selectable[], active: string): Commands {
  const deps: CommandDeps = {
    player: ME, game: g, settings: { ...DEFAULT_SETTINGS, keys: {} }, selection: () => selection, activeType: () => active,
    send: () => undefined, queued: () => false, held: () => false, message: () => undefined, marker: () => undefined,
    askPlacement: () => undefined, node: () => undefined, heightAt: () => 0, changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
    slots: () => ({ most: 40 }),
  };
  return new Commands(deps);
}

const units = (typeKey: string): Selectable[] => [1, 2].map((id) => ({ key: `e:${id}`, kind: 'unit', owner: ME, typeKey, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey }));

function button(card: Card, face: string): CardEntry {
  const e = card.find((x) => x.face === face);
  if (!e) throw new Error(`no ${face} on the card: ${card.map((x) => x.face).join(', ')}`);
  return e;
}

describe('attack pings (mini patch 7.3)', () => {
  it('pings once at the start of a fight, not at its later blows, and again once it has gone quiet', () => {
    const p = new AttackPings();
    expect(p.struck(0, 0, 0)).toBe(true);
    expect(p.struck(3, 2, 500)).toBe(false);
    // The fight follows its blows: a chase across the field is still the same fight.
    expect(p.struck(3 + ATTACK_PING_RADIUS_M - 1, 2, 5000)).toBe(false);
    expect(p.struck(3 + ATTACK_PING_RADIUS_M - 1, 2, 5000 + ATTACK_PING_QUIET_MS)).toBe(true);
  });

  it('a second fight elsewhere pings by itself while the first goes on', () => {
    const p = new AttackPings();
    expect(p.struck(0, 0, 0)).toBe(true);
    expect(p.struck(80, 40, 1000)).toBe(true);
    expect(p.struck(1, 1, 2000)).toBe(false);
    expect(p.struck(81, 41, 2000)).toBe(false);
  });
});

describe('greyed unit buttons (mini patch 7.3)', () => {
  const base = (): BuildingInfo => building(9, BuildingKind.MainBase);
  const pick = (b: BuildingInfo): Selectable => ({ key: `b:${b.id}`, kind: 'building', owner: ME, typeKey: `building:${b.kind}:${b.level}`, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(3, 3, 3), label: b.name });

  it('Train worker greys out when the stock cannot pay for its tools, though there is food', () => {
    const b = base();
    const pool = new Int32Array(RESOURCE_COUNT);
    pool[Res.Venison] = 500;
    const worker = button(commands(game(UnitKind.Worker, [b], [], pool), [pick(b)], pick(b).typeKey).card(), 'Worker');
    expect(worker.product).toBe(Product.Worker);
    expect(worker.enabled).toBe(false);
    expect(worker.reason).toMatch(/^(Short|Not enough resources)/);
  });

  it('and is lit with the food and the tools in stock', () => {
    const b = base();
    const pool = new Int32Array(RESOURCE_COUNT).fill(500);
    const worker = button(commands(game(UnitKind.Worker, [b], [], pool), [pick(b)], pick(b).typeKey).card(), 'Worker');
    expect(worker.reason).toBe('');
    expect(worker.enabled).toBe(true);
  });
});

describe('yellow auto rings (mini patch 7.3)', () => {
  it('Hunt wears it while every troop is out on auto hunt, and Gather while every worker gathers by itself', () => {
    const hunt: UnitOrder = { t: 'hunt', id: 0, auto: 1, x: 0, z: 0, k: 0, kx: 0, kz: 0 };
    const troops = units('warrior');
    expect(button(commands(game(UnitKind.Warrior, [building(9, BuildingKind.MainBase)], [hunt]), troops, 'warrior').card(), 'Hunt').autoLoop).toBe(true);
    expect(button(commands(game(UnitKind.Warrior, [building(9, BuildingKind.MainBase)], [{ ...hunt, auto: 0, id: 7 }]), troops, 'warrior').card(), 'Hunt').autoLoop).toBe(false);
    const forage: UnitOrder = { t: 'forage', res: -1, x: 0, z: 0, k: 0, ang: 0 };
    const gather: UnitOrder = { t: 'gather', cx: 0, cz: 0, i: 1 };
    const workers = units('worker');
    // The gathering itself runs in front of the Gather order; the ring stays on.
    expect(button(commands(game(UnitKind.Worker, [building(9, BuildingKind.MainBase)], [gather, forage]), workers, 'worker').card(), 'Gather').autoLoop).toBe(true);
    expect(button(commands(game(UnitKind.Worker, [building(9, BuildingKind.MainBase)], [gather]), workers, 'worker').card(), 'Gather').autoLoop).toBe(false);
  });
});
