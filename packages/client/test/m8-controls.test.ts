import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, BuildingKind, Engine, Res, RESOURCE_COUNT, Troop, troopProduct, UnitKind, type Order } from '@blockyrts/sim';
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

function building(id: number, kind: number, level = 1, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], status: '', name: 'Citadel', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, ...o,
  };
}

/** Worker 1; warriors 3 (cavalry with a fire-hardened spear) and 4 (close melee with a cudgel); a bronze cannon 7 at half health; a horse 8. Buildings: the Citadel 20 and what is given. */
function game(more: BuildingInfo[] = [], pool: Array<[number, number]> = []): GameInfo {
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
    // Milestone 11: riding is no skill any more; cavalry is a troop type, trained at the Stables on a horse from its stalls.
    if (kind === UnitKind.Warrior) {
      data[o + S.troop] = id === 3 ? Troop.Cavalry : Troop.Close;
      data[o + S.wTier] = 1;
    }
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const p = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of pool) p[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool: p, supplyUsed: 4, supplyCap: 8, buildings: [building(20, BuildingKind.MainBase, 10), ...more], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

function harness(selection: Selectable[], active: string, g: GameInfo = game()) {
  const sent: Order[] = [];
  const deps: CommandDeps = {
    player: ME,
    game: g,
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

describe('cavalry (C at the Stables)', () => {
  const stables = (horses: number): BuildingInfo => building(21, BuildingKind.Stables, 1, { name: 'Stables', troops: [{ troop: Troop.Cavalry, w: 1, a: 0, lock: 0 }], horses });

  it('trains cavalry on C, only with a tamed, grown horse in the stalls', () => {
    const pool: Array<[number, number]> = [[Res.Wheat, 100], [Res.Sticks, 10]];
    const none = harness([{ ...sel('b:21', `building:${BuildingKind.Stables}:1`), kind: 'building' }], `building:${BuildingKind.Stables}:1`, game([stables(0)], pool));
    const greyed = none.c.card()[0]!;
    expect(greyed).toMatchObject({ action: 'trainCavalry', face: 'Cavalry', key: 'KeyC', enabled: false });
    expect(greyed.reason).toBe('Cavalry needs a tamed, grown horse in the stalls.');
    expect(greyed.description).toContain('a tamed horse');
    const one = harness([{ ...sel('b:21', `building:${BuildingKind.Stables}:1`), kind: 'building' }], `building:${BuildingKind.Stables}:1`, game([stables(1)], pool));
    const train = one.c.card()[0]!;
    expect(train.enabled).toBe(true);
    train.run(PRESS);
    expect(one.sent.at(-1)).toEqual({ kind: 'produce', player: ME, building: 21, product: troopProduct(Troop.Cavalry, 1, 0), count: 1 });
  });

  it('has no Ride: a warrior right clicking one of your horses follows it', () => {
    const { c, sent } = harness([sel('e:3', 'warrior')], 'warrior');
    expect(c.card().some((e) => e?.face === 'Ride' || e?.face === 'Dismount')).toBe(false);
    c.smart(horse, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'follow', units: [3], target: 8 });
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
