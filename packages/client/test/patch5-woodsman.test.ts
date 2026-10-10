import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Product, NO_CARRY, RESOURCE_COUNT, Troop, UnitKind, type Order, type UnitOrder } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, type Card, type CardEntry, type CommandDeps } from '../src/hud/commands.ts';
import { woodsLineText } from '../src/hud/woods.ts';
import { keyLabel } from '../src/input/keys.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';

// Patch 5 (Jade's WD-1, WD-5 and CT-1): the woodsman's card. Move and attack,
// Fish and Forage, Eat and Upgrade equipment; Fish and Forage are targeted
// with a left click and turned on or off by themselves with a right click,
// both at once if wanted. A right click on a fish stretch sends woodsmen
// fishing there. The Scholar's Lodge trains him.

const ME = 0;
const PRESS = { shift: false, ctrl: false };

function building(id: number, kind: number, o: Partial<BuildingInfo> = {}): BuildingInfo {
  return {
    id, owner: ME, kind, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 100, maxHp: 100, complete: true, built: 1000, upgrading: 0, upgraded: 0,
    queue: [], rally: [], lit: false, assigned: 0, working: 0, inside: [], up: [], status: '', name: BUILDINGS[kind]!.name, upgradeWhy: '', products: [], stock: [], rating: 0, herd: 0, shared: false,
    troops: [], horses: 0, farm: null, room: 0, fixedEngine: 0, ...o,
  };
}

/** Two woodsmen (ids 1 and 2) beside a Big House, with these orders. */
function game(buildings: BuildingInfo[], queue: UnitOrder[] = []): GameInfo {
  const g = new GameInfo(ME);
  const data = new Int32Array(2 * STATE_STRIDE);
  for (let i = 0; i < 2; i++) {
    const o = i * STATE_STRIDE;
    data[o + S.id] = i + 1;
    data[o + S.owner] = ME;
    data[o + S.kind] = UnitKind.Warrior;
    data[o + S.troop] = Troop.Woodsman;
    data[o + S.wTier] = 1;
    data[o + S.rank] = 1;
    data[o + S.hp] = 60;
    data[o + S.maxHp] = 60;
    data[o + S.carryRes] = NO_CARRY;
  }
  g.onState({ type: 'state', step: 10, hash: 0, hashStep: 0, count: 2, data, shots: new Int32Array(0), hits: [] });
  const info: InfoMessage = {
    type: 'info', step: 10, pool: new Int32Array(RESOURCE_COUNT), supplyUsed: 2, supplyCap: 8, buildings, queues: [[1, queue], [2, queue]], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [], carry: [], effects: [],
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
    slots: () => ({ most: 40 }),
  };
  return { c: new Commands(deps), sent };
}

const woodsmen: Selectable[] = [1, 2].map((id) => ({ key: `e:${id}`, kind: 'unit', owner: ME, typeKey: 'warrior:woods', centre: new THREE.Vector3(), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: 'Woodsman' }));

/** A node as world-view.ts makes it: a trout stretch, or a pine. */
const node = (name: string, index: number): Selectable => ({ key: `p:3,-2:${index}`, kind: 'node', owner: 255, typeKey: `node:${name}`, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(0.5, 0.3, 0.5), label: name, resource: 'fish' });

function button(card: Card, face: string): CardEntry {
  const e = card.find((x) => x.face === face);
  if (!e) throw new Error(`no ${face} on the card: ${card.map((x) => x.face).join(', ')}`);
  return e;
}

const woods = (what: number, on: number, cx = 0, cz = 0, index = -1): Order => ({ kind: 'woods', player: ME, units: [1, 2], what, on, cx, cz, index, queued: false });

describe('the woodsman card (Patch 5)', () => {
  it('has Attack, Move, Fish and Forage, Eat, Upgrade equipment and Run or Walk, each on its own key', () => {
    const { c } = harness(game([building(9, BuildingKind.MainBase)]), woodsmen, 'warrior:woods');
    const card = c.card();
    expect(card.map((e) => e.face)).toEqual(['Attack', 'Move', 'Fish', 'Forage', 'Eat', 'Equip', 'Walk']);
    expect(card.map((e) => keyLabel(e.key))).toEqual(['A', 'M', 'I', 'G', 'F', 'Q', 'H']);
  });

  it('a right click turns fishing or foraging by himself on, or off when it is on; both can be on at once', () => {
    const { c, sent } = harness(game([building(9, BuildingKind.MainBase)]), woodsmen, 'warrior:woods');
    button(c.card(), 'Fish').right!(PRESS);
    button(c.card(), 'Forage').right!(PRESS);
    expect(sent).toEqual([woods(1, 1), woods(2, 1)]);
    const on: UnitOrder = { t: 'woods', fish: 1, forage: 1, cx: 0, cz: 0, i: -1, k: 0, x: 0, z: 0, ex: 0, ez: 0 };
    const h = harness(game([building(9, BuildingKind.MainBase)], [on]), woodsmen, 'warrior:woods');
    const fish = button(h.c.card(), 'Fish');
    // Mini patch 7.3: the yellow autocast ring, not the green AUTO tag.
    expect(fish.autoLoop).toBe(true);
    expect(fish.auto).toBeUndefined();
    fish.right!(PRESS);
    expect(h.sent).toEqual([woods(1, 0)]);
  });

  it('a left click, then a fish stretch, sends them fishing there; a right click on one does the same', () => {
    const { c, sent } = harness(game([building(9, BuildingKind.MainBase)]), woodsmen, 'warrior:woods');
    button(c.card(), 'Fish').run(PRESS);
    expect(c.targeting?.command).toBe('fish');
    c.confirmTarget(node('pine', 4), null);
    expect(sent).toEqual([]);
    c.confirmTarget(node('trout stretch', 5), null);
    expect(sent).toEqual([woods(1, 1, 3, -2, 5)]);
    c.smart(node('trout stretch', 6), new THREE.Vector3());
    expect(sent.at(-1)).toEqual(woods(1, 1, 3, -2, 6));
  });

  it("the Scholar's Lodge trains him on W", () => {
    const lodge = building(9, BuildingKind.ScholarsLodge, { products: [[Product.Woodsman, '']] });
    const pick: Selectable = { key: 'b:9', kind: 'building', owner: ME, typeKey: `building:${BuildingKind.ScholarsLodge}:1`, centre: new THREE.Vector3(), halfSize: new THREE.Vector3(3, 3, 3), label: lodge.name };
    const { c, sent } = harness(game([lodge]), [pick], pick.typeKey);
    const train = button(c.card(), 'Woodsman');
    expect(keyLabel(train.key)).toBe('W');
    train.run(PRESS);
    expect(sent[0]).toMatchObject({ kind: 'produce', building: 9, product: Product.Woodsman });
  });

  it('his food line reads what he brought in and ate over the last 10 minutes, or his life if shorter', () => {
    expect(woodsLineText({ brought: 96, ate: 10, steps: 12000 })).toBe('Food in 24, eaten 2.5 (last 10 min)');
    expect(woodsLineText({ brought: 1, ate: 0, steps: 800 })).toBe('Food in 0.25, eaten 0 (last 40 s)');
  });
});
