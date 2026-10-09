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
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: 'Citadel', upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
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
    // Milestone 11: riding is no skill any more; cavalry is a troop type, trained (Patch 2) at the Barracks on a horse from a Barn.
    if (kind === UnitKind.Warrior) {
      data[o + S.troop] = id === 3 ? Troop.Cavalry : Troop.Close;
      data[o + S.wTier] = 1;
    }
  });
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: rows.length, data, shots: new Int32Array(0), hits: [] });
  const p = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of pool) p[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool: p, supplyUsed: 4, supplyCap: 8, buildings: [building(20, BuildingKind.MainBase, 4), ...more], queues: [], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
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
const citadel: Selectable = { key: 'b:20', kind: 'building', owner: ME, typeKey: 'building:0:4', centre: new THREE.Vector3(0, 0, 0), halfSize: new THREE.Vector3(5, 5, 5), label: 'Citadel' };

describe('cavalry (C at the Barracks; Patch 2: the Stables are cut)', () => {
  const barracks = (horses: number): BuildingInfo => building(21, BuildingKind.Barracks, 1, { name: 'Barracks', troops: [{ troop: Troop.Cavalry, w: 1, a: 0, lock: 0 }], horses });
  // The test town's main base is a Citadel, past the cavalry's main base tier 2 (m11-troops checks that reason).
  const at = (b: BuildingInfo, pool: Array<[number, number]>) =>
    harness([{ ...sel('b:21', `building:${BuildingKind.Barracks}:1`), kind: 'building' }], `building:${BuildingKind.Barracks}:1`, game([b], pool));

  it('trains cavalry on C, only with a tamed, grown horse in a Barn', () => {
    const pool: Array<[number, number]> = [[Res.FarmFare, 100], [Res.Sticks, 10]];
    const none = at(barracks(0), pool);
    const greyed = none.c.card().find((e) => e.action === 'trainCavalry')!;
    expect(greyed).toMatchObject({ action: 'trainCavalry', face: 'Cavalry', key: 'KeyC', enabled: false });
    expect(greyed.reason).toBe('No grown tamed horse ready in a Barn.');
    expect(greyed.description).toContain('a tamed horse');
    const one = at(barracks(1), pool);
    const train = one.c.card().find((e) => e.action === 'trainCavalry')!;
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
  it("has Attack, Move and Hitch (Jade's Patch 2 cuts Stop and Hold; Patch 5 the cannon ports' Port)", () => {
    const { c } = harness([cannon], cannon.typeKey);
    expect(c.card().map((e) => e.face)).toEqual(['Attack', 'Move', 'Hitch']);
  });

  it('hitches a horse with a right click, and never goes into the Citadel (Patch 5)', () => {
    const { c, sent } = harness([cannon], cannon.typeKey);
    c.smart(horse, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'hitch', units: [7], target: 8 });
    c.smart(citadel, null);
    expect(sent.at(-1)?.kind).not.toBe('enter');
  });

  it('artillery crewmen right clicking it crew it (Patch 2: warriors only follow it); workers repair it', () => {
    const a = harness([sel('e:3', 'warrior:crew')], 'warrior:crew');
    a.c.smart(cannon, null);
    expect(a.sent.at(-1)).toMatchObject({ kind: 'crew', units: [3], target: 7 });
    const w = harness([sel('e:4', 'warrior')], 'warrior');
    w.c.smart(cannon, null);
    expect(w.sent.at(-1)).toMatchObject({ kind: 'follow', units: [4], target: 7 });
    const b = harness([sel('e:1', 'worker')], 'worker');
    b.c.smart(cannon, null);
    expect(b.sent.at(-1)).toMatchObject({ kind: 'mend', units: [1], target: 7 });
  });

  it('gives the artillery crewman a Crew button (C) that picks one of your engines; warriors have none', () => {
    const { c, sent } = harness([sel('e:3', 'warrior:crew')], 'warrior:crew');
    const card = c.card();
    const crew = card.find((e) => e?.action === 'crew')!;
    expect(crew).toMatchObject({ face: 'Crew', key: 'KeyC', enabled: true });
    crew.run(PRESS);
    expect(c.targeting?.command).toBe('crew');
    c.confirmTarget(citadel, null);
    expect(sent.length).toBe(0);
    c.confirmTarget(cannon, null);
    expect(sent.at(-1)).toMatchObject({ kind: 'crew', units: [3], target: 7 });
    const w = harness([sel('e:4', 'warrior')], 'warrior');
    expect(w.c.card().some((e) => e?.action === 'crew')).toBe(false);
  });

  it('gives the artillery crewman a Retrain button (W, Patch 3) that sends him to the main base to become a worker', () => {
    const { c, sent } = harness([sel('e:3', 'warrior:crew'), sel('e:4', 'warrior')], 'warrior:crew');
    const retrain = c.card().find((e) => e?.action === 'retrain')!;
    expect(retrain).toMatchObject({ face: 'Retrain', name: 'Retrain as a worker', key: 'KeyW', enabled: true });
    expect(retrain.description).toContain('No cost.');
    retrain.run(PRESS);
    expect(sent.at(-1)).toEqual({ kind: 'retrain', player: ME, units: [3], queued: false });
    // Without a finished main base it is greyed, saying why.
    const g = game();
    g.buildings.get(20)!.complete = false;
    const off = harness([sel('e:3', 'warrior:crew')], 'warrior:crew', g).c.card().find((e) => e?.action === 'retrain')!;
    expect([off.enabled, off.reason]).toEqual([false, 'Needs a main base.']);
    // Troops have none.
    expect(harness([sel('e:4', 'warrior')], 'warrior').c.card().some((e) => e?.action === 'retrain')).toBe(false);
  });
});
