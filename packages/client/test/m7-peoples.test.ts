import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  BuildingKind,
  CAT_COUNT,
  catOf,
  DAILY_BUY_TENTHS,
  FactionKind,
  Mob,
  People,
  PEOPLES,
  PeopleUnit,
  Res,
  RESOURCE_COUNT,
  Status,
  UnitKind,
  valueTenths,
  type Order,
} from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type CommandDeps } from '../src/hud/commands.ts';
import { FILTERS, MESSAGES_KEPT, overflow, shownUnder, type MessageKind } from '../src/hud/message-panel.ts';
import { goodsText, offerWorth, statusText, worthWords } from '../src/hud/peoples-ui.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage, type PeopleInfo } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

const ME = 0;
const VILLAGE = 5;

function faction(o: Partial<PeopleInfo> = {}): PeopleInfo {
  return {
    id: VILLAGE, kind: FactionKind.HalflingVillage, people: People.Halfling, status: Status.Settled, title: 'Appledell (Halfling village)', lean: '',
    x: 0, z: 0, war: false, met: true, traded: false, leader: 30, fighters: 4, standing: 9, founded: 9, surrender: false, owed: 0, tradeWhy: '',
    stock: [], wants: [], room: new Array<number>(CAT_COUNT).fill(DAILY_BUY_TENTHS), pays: [], offer: null, hire: null, visiting: false, ...o,
  };
}

function building(id: number, kind: number): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], up: [], status: '', name: 'Big House', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0,
  };
}

/** Warriors 3 and 4; the village's leader 30 and a villager 31; its inn 40 and a ruin 41 (left by them, owner neutral). */
function game(f: PeopleInfo): GameInfo {
  const g = new GameInfo(ME);
  const rows: Array<[number, number, number, number]> = [
    [3, ME, UnitKind.Warrior, 0],
    [4, ME, UnitKind.Warrior, 0],
    [30, PEOPLES, UnitKind.Warrior, PeopleUnit.HalflingSpearman],
    [31, PEOPLES, UnitKind.Worker, PeopleUnit.HalflingMale],
    [40, PEOPLES, UnitKind.Mob, Mob.HalflingInn],
  ];
  const data = new Int32Array(rows.length * STATE_STRIDE);
  rows.forEach(([id, owner, kind, mob], i) => {
    const o = i * STATE_STRIDE;
    data[o + S.id] = id;
    data[o + S.owner] = owner;
    data[o + S.kind] = kind;
    data[o + S.mob] = mob;
    data[o + S.rank] = 1;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = 255;
    if (owner === PEOPLES) data[o + S.group] = VILLAGE;
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const info: InfoMessage = {
    type: 'info', step: 10, pool: new Int32Array(RESOURCE_COUNT), supplyUsed: 2, supplyCap: 8, buildings: [building(20, BuildingKind.MainBase)], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, dontEat: 0, starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [f], players: [{ share: 0, out: false }],
  };
  g.onInfo(info);
  return g;
}

function sel(key: string, typeKey: string, owner: number): Selectable {
  return { key, kind: 'unit', owner, typeKey, centre: new THREE.Vector3(4, 0, 4), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey };
}

function harness(f: PeopleInfo) {
  const sent: Order[] = [];
  const wars: Array<[number, () => void]> = [];
  const opened: number[] = [];
  const deps: CommandDeps = {
    player: ME,
    game: game(f),
    settings: { ...DEFAULT_SETTINGS, keys: {} },
    selection: () => [sel('e:3', 'warrior', ME), sel('e:4', 'warrior', ME)],
    activeType: () => 'warrior',
    send: (o) => sent.push(o),
    queued: () => false,
    held: () => false,
    message: () => undefined,
    marker: () => undefined,
    askPlacement: () => undefined,
    node: () => undefined,
    heightAt: () => 0,
    changed: () => undefined,
    confirmWar: (id, then) => wars.push([id, then]),
    openPeople: (id) => opened.push(id),
  };
  return { c: new Commands(deps), sent, wars, opened };
}

const PRESS = { shift: false, ctrl: false };
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);
const leader = sel('e:30', `people:${PeopleUnit.HalflingSpearman}`, PEOPLES);
const villager = sel('e:31', `people:${PeopleUnit.HalflingMale}`, PEOPLES);
const inn = sel('e:40', `peoples:${Mob.HalflingInn}`, PEOPLES);

describe('the message panel', () => {
  it('filters three ways: everything, alerts and players, players only', () => {
    expect(FILTERS).toHaveLength(3);
    const speech = { kind: 'speech' as const };
    const urgentSpeech = { kind: 'speech' as const, urgent: true };
    const alert = { kind: 'alert' as const };
    const player = { kind: 'player' as const };
    expect([speech, urgentSpeech, alert, player].map((m) => shownUnder(0, m))).toEqual([true, true, true, true]);
    expect([speech, urgentSpeech, alert, player].map((m) => shownUnder(1, m))).toEqual([false, true, true, true]);
    expect([speech, urgentSpeech, alert, player].map((m) => shownUnder(2, m))).toEqual([false, false, false, true]);
  });

  it('keeps the latest 60 messages and every player message', () => {
    expect(MESSAGES_KEPT).toBe(60);
    const kinds: MessageKind[] = ['player', ...new Array<MessageKind>(60).fill('speech'), 'player', 'alert'];
    // 61 that are not player messages: the oldest of them goes, never a player's.
    expect(overflow(kinds)).toEqual([1]);
    expect(overflow(['speech', 'player', 'alert'], 1)).toEqual([0]);
    expect(overflow(['player', 'player'], 0)).toEqual([]);
  });
});

describe('the trade menu', () => {
  it('reckons an offer as the sim does: what they pay, no more than they still buy of a kind, refused goods nothing', () => {
    const wood = Res.SoftwoodLumber;
    const v = valueTenths(wood);
    const f = faction({ pays: [wood, 50, Res.Gold, -1] });
    expect(offerWorth(f, new Map([[wood, 10]]))).toBe(Math.floor((v * 10 * 50) / 100));
    expect(offerWorth(f, new Map([[Res.Gold, 10]]))).toBe(0);
    const room = new Array<number>(CAT_COUNT).fill(DAILY_BUY_TENTHS);
    room[catOf(wood)] = 7;
    expect(offerWorth({ ...f, room }, new Map([[wood, 1000]]))).toBe(7);
    // A good they were never asked about counts nothing.
    expect(offerWorth(f, new Map([[Res.Stone, 5]]))).toBe(0);
  });

  it('words the worth bar and lists goods', () => {
    expect(worthWords(0)).toMatch(/Put goods/);
    expect(worthWords(DAILY_BUY_TENTHS)).toBe('A rich offer.');
    expect(worthWords(Math.floor(DAILY_BUY_TENTHS / 20))).toBe('A small offer.');
    expect(goodsText([Res.SoftwoodLumber, 5])).toMatch(/×5$/);
    expect(goodsText([Res.SoftwoodLumber, 1])).not.toMatch(/×/);
  });

  it('says how a faction stands', () => {
    expect(statusText(faction())).toBe('At peace.');
    expect(statusText(faction({ traded: true }))).toMatch(/traded/);
    expect(statusText(faction({ war: true }))).toBe('At war with you.');
    expect(statusText(faction({ war: true, surrender: true }))).toMatch(/surrender/);
    expect(statusText(faction({ status: Status.Migrated, war: true }))).toMatch(/reparations/);
    expect(statusText(faction({ kind: FactionKind.MercCamp, hire: { left: 3, size: 6, why: '' } }))).toMatch(/^3 of 6 for hire/);
  });
});

describe('war and talk with the peoples', () => {
  it('asks before attacking a people at peace, and attacks once confirmed', () => {
    const { c, sent, wars } = harness(faction());
    c.card()[0]!.run(PRESS);
    c.confirmTarget(villager, at(4, 4));
    expect(sent).toHaveLength(0);
    expect(wars).toHaveLength(1);
    expect(wars[0]![0]).toBe(VILLAGE);
    wars[0]![1]();
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', units: [3, 4], target: 31 });
  });

  it('attacks a people at war with a right click, with no question', () => {
    const { c, sent, wars } = harness(faction({ war: true }));
    c.smart(villager, at(4, 4));
    expect(wars).toHaveLength(0);
    expect(sent.at(-1)).toMatchObject({ kind: 'attack', target: 31 });
  });

  it('opens trade with a right click on the leader or a trade building, not on any villager', () => {
    const { c, opened, sent } = harness(faction());
    c.smart(leader, at(4, 4));
    c.smart(inn, at(4, 4));
    expect(opened).toEqual([VILLAGE, VILLAGE]);
    c.smart(villager, at(4, 4));
    expect(opened).toHaveLength(2);
    expect(sent.some((o) => o.kind === 'attack')).toBe(false);
  });
});
