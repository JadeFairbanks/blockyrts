import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, BuildingKind, Engine, ITEM_COUNT, Mount, RESOURCE_COUNT, Skill, UnitKind, type Order } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type CommandDeps } from '../src/hud/commands.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

const ME = 0;
const PRESS = { shift: false, ctrl: false };

function sel(key: string, typeKey: string, owner = ME): Selectable {
  return { key, kind: 'unit', owner, typeKey, centre: new THREE.Vector3(4, 0, 4), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: typeKey };
}

function building(id: number, kind: number, level = 1): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], status: '', name: 'Citadel', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0,
  };
}

/** Worker 1; warriors 3 (trained to ride) and 4 (riding a horse); a bronze cannon 7 at half health; a horse 8. */
function game(): GameInfo {
  const g = new GameInfo(ME);
  const rows: Array<[number, number, number]> = [
    [1, UnitKind.Worker, 0],
    [3, UnitKind.Warrior, 0],
    [4, UnitKind.Warrior, 0],
    [7, UnitKind.Engine, Engine.BronzeCannon],
    [8, UnitKind.Animal, 2],
  ];
  const data = new Int32Array(rows.length * STATE_STRIDE);
  rows.forEach(([id, kind, mob], i) => {
    const o = i * STATE_STRIDE;
    data[o + S.id] = id;
    data[o + S.owner] = ME;
    data[o + S.kind] = kind;
    data[o + S.mob] = mob;
    data[o + S.rank] = 1;
    data[o + S.hp] = id === 7 ? 200 : 60;
    data[o + S.maxHp] = id === 7 ? 400 : 60;
    data[o + S.carryRes] = 255;
    if (id === 3) data[o + S.skills] = Skill.Riding;
    if (id === 4) {
      data[o + S.skills] = Skill.Riding;
      data[o + S.mount] = Mount.Horse;
    }
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const info: InfoMessage = {
    type: 'info', step: 10, pool: new Int32Array(RESOURCE_COUNT), supplyUsed: 4, supplyCap: 8, buildings: [building(20, BuildingKind.MainBase, 10)], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    items: new Int32Array(ITEM_COUNT), research: 0, autoEquip: false, sites: [], over: 0, nights: 0, out: false,
    rations: 0, dontEat: 0, starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [],
  };
  g.onInfo(info);
  return g;
}

function harness(selection: Selectable[], active: string) {
  const sent: Order[] = [];
  const deps: CommandDeps = {
    player: ME,
    game: game(),
    settings: { ...DEFAULT_SETTINGS, keys: {} },
    selection: () => selection,
    activeType: () => active,
    send: (o) => sent.push(o),
    queued: () => false,
    held: () => false,
    message: () => undefined,
    marker: () => undefined,
    askPlacement: () => undefined,
    node: () => undefined,
    heightAt: () => 0,
    changed: () => undefined, confirmWar: () => undefined, openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent };
}

const cannon = sel('e:7', `engine:${Engine.BronzeCannon}`);
const horse = sel('e:8', 'animal:own:2');
const citadel: Selectable = { key: 'b:20', kind: 'building', owner: ME, typeKey: 'building:0:10', centre: new THREE.Vector3(0, 0, 0), halfSize: new THREE.Vector3(5, 5, 5), label: 'Citadel' };

describe('riders (R)', () => {
  it('mounts a trained warrior, and dismounts when all are mounted', () => {
    const a = harness([sel('e:3', 'warrior')], 'warrior');
    const ride = a.c.card()[11]!;
    expect(ride.face).toBe('Ride');
    expect(ride.key).toBe('KeyR');
    ride.run(PRESS);
    expect(a.sent.at(-1)).toMatchObject({ kind: 'mount', units: [3], target: 0 });
    const b = harness([sel('e:4', 'warrior')], 'warrior');
    expect(b.c.card()[11]!.face).toBe('Dismount');
    b.c.card()[11]!.run(PRESS);
    expect(b.sent.at(-1)).toMatchObject({ kind: 'dismount', units: [4] });
  });

  it('a right click on one of your horses mounts it', () => {
    const { c, sent } = harness([sel('e:3', 'warrior')], 'warrior');
    c.smart(horse, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'mount', units: [3], target: 8 });
  });
});

describe('engines and cannons', () => {
  it('has Attack, Stop, Hold, Move, Hitch and Port', () => {
    const { c } = harness([cannon], cannon.typeKey);
    const card = c.card();
    expect(card.map((e) => e?.face ?? '')).toEqual(['Attack', 'Stop', 'Hold', '', 'Move', 'Hitch', '', '', '', '', '', '', 'Port', '', '']);
    expect(card[12]!.enabled).toBe(true);
  });

  it('hitches a horse, and goes up into a Citadel port, with right clicks', () => {
    const { c, sent } = harness([cannon], cannon.typeKey);
    c.smart(horse, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'hitch', units: [7], target: 8 });
    c.smart(citadel, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'enter', units: [7], building: 20 });
  });

  it('warriors right clicking it crew it; workers repair it', () => {
    const a = harness([sel('e:3', 'warrior')], 'warrior');
    a.c.smart(cannon, null);
    expect(a.sent.at(-1)).toMatchObject({ kind: 'crew', units: [3], target: 7 });
    const b = harness([sel('e:1', 'worker')], 'worker');
    b.c.smart(cannon, null);
    expect(b.sent.at(-1)).toMatchObject({ kind: 'mend', units: [1], target: 7 });
  });
});
