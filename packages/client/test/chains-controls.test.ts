// Wall and tunnel chains on the command card (Controls: Building placement,
// "Wall chains"; Digging and prospecting, "Tunnel chains"): one click places a
// wall and anchors the chain, each later click sends the whole stretch from
// the anchor as one order, snapped to eight directions, skipping red columns
// and stopping where the stock runs out; Dig clicked on a face, or Tunnel,
// digs a level tunnel the same way; right click, Esc or Done ends a chain.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKind, BUILDINGS, Res, RESOURCE_COUNT, SiteKind, TUNNEL_HEIGHT_UNITS, type Order, type UnitOrder } from '@blockyrts/sim';
import { GameInfo } from '../src/game/game-info.ts';
import { Commands, stretchBoxes, type CommandDeps } from '../src/hud/commands.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage } from '../src/messages.ts';
import type { Selectable } from '../src/selection/types.ts';
import { DEFAULT_SETTINGS } from '../src/settings/settings.ts';
import { COLUMN_M } from '../src/world/mesher.ts';

const ME = 0;
const UNIT_M = 0.1125;

interface World {
  pool?: Array<[number, number]>;
  queues?: Array<[number, UnitOrder[]]>;
  sites?: InfoMessage['sites'];
  /** Walls standing, at these columns. */
  walls?: Array<[number, number]>;
}

/** Workers 1 and 2. */
function game(w: World = {}): GameInfo {
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
  const pool = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of w.pool ?? []) pool[r] = n;
  const info: InfoMessage = {
    type: 'info', step: 10, pool, supplyUsed: 2, supplyCap: 8, buildings: (w.walls ?? []).map(([x, z], k) => ({ id: 100 + k, owner: ME, kind: BuildingKind.Wall, variant: 0, level: 1, x, z, y: 0, complete: true }) as BuildingInfo), queues: w.queues ?? [[1, []], [2, []]], events: [],
    claims: { circles: [], rects: [] }, outlying: { halves: 0, limit: 4 }, buildWhy: BUILDINGS.map((b) => (b.live ? '' : b.comesWith)),
    research: 0, forge: 0, sites: w.sites ?? [], over: 0, nights: 0, out: false,
    rations: 0, kept: [], open: new Int32Array(0), starveWorkers: false, starveTroops: false, blood: [], fog: false, ruins: [], marks: [], spells: [], mageRanks: [], peoples: [], players: [{ share: 0, out: false }],
    loot: [], bags: [],
  };
  g.onInfo(info);
  return g;
}

const workers: Selectable[] = [1, 2].map((id) => ({ key: `e:${id}`, kind: 'unit', owner: ME, typeKey: 'worker', centre: new THREE.Vector3(4, 0, 4), halfSize: new THREE.Vector3(0.3, 0.8, 0.3), label: 'Worker' }));

function harness(g: GameInfo, heightAt: (x: number, z: number) => number = () => 0) {
  const sent: Order[] = [];
  const messages: string[] = [];
  const asks: Array<Array<[number, number]>> = [];
  const shift = { held: false };
  const deps: CommandDeps = {
    player: ME,
    game: g,
    settings: { ...DEFAULT_SETTINGS, keys: {} },
    selection: () => workers,
    activeType: () => 'worker',
    send: (o) => sent.push(o),
    queued: () => shift.held,
    held: () => false,
    message: (t) => messages.push(t),
    marker: () => undefined,
    askPlacement: (_k, _v, spots) => asks.push(spots),
    node: () => undefined,
    heightAt,
    changed: () => undefined,
    confirmWar: () => undefined,
    openPeople: () => undefined,
  };
  return { c: new Commands(deps), sent, messages, asks, shift };
}

/** The ground point at the middle of a column. */
const at = (x: number, z: number, y = 0): THREE.Vector3 => new THREE.Vector3((x + 0.5) * COLUMN_M, y, (z + 0.5) * COLUMN_M);

/** The sim's answer to the last ask: every spot green, or red where `red` says. */
function answer(c: Commands, asks: Array<Array<[number, number]>>, red: (x: number, z: number) => number = () => 0): void {
  c.onPlaced(BuildingKind.Wall, asks.at(-1)!.map(([x, z]) => ({ x, z, tiles: Uint8Array.of(red(x, z)) })));
}

describe('wall chains', () => {
  it('places one wall, then a stretch per click in any of eight directions, one order each, until right click', () => {
    const { c, sent, asks } = harness(game({ pool: [[Res.SoftwoodLumber, 100]] }));
    c.startPlacing(BuildingKind.Wall, 0);
    expect(c.card().at(-1)!.face).toBe('Cancel');
    c.updatePlacing(at(10, 10), 0);
    expect(asks.at(-1)).toEqual([[10, 10]]);
    answer(c, asks);
    expect(c.chainLabel()).toEqual({ text: '1 wooden wall: 1 softwood lumber', hint: 'Click to place it, then click further on for a stretch', short: false });
    c.placeDown();
    c.placeUp();
    expect(sent).toEqual([{ kind: 'wallStretch', player: ME, units: [1, 2], building: BuildingKind.Wall, x: 10, z: 10, dir: 0, length: 0, skip: 0, queued: false }]);
    // The ghost stays, anchored: the card's corner button now ends the chain.
    expect(c.placing!.chain).toEqual({ x: 10, z: 10 });
    expect(c.card().at(-1)!.face).toBe('Done');
    // On the wall just placed, the label says how to stop at one.
    expect(c.chainLabel()).toEqual({ text: 'Click again for just this one', hint: 'Or click further on to build a stretch', short: false });
    // East, a little off the line: it snaps east, and leaves out the anchor.
    c.updatePlacing(at(16, 11), 1);
    expect(asks.at(-1)).toEqual([[11, 10], [12, 10], [13, 10], [14, 10], [15, 10], [16, 10]]);
    answer(c, asks, (x) => (x === 13 ? 4 : 0));
    expect(c.chainLabel()).toEqual({ text: '5 walls: 5 softwood lumber, 1 skipped', hint: 'Click to build to here, right click to finish', short: false });
    c.placeUp();
    expect(sent.at(-1)).toEqual({ kind: 'wallStretch', player: ME, units: [1, 2], building: BuildingKind.Wall, x: 10, z: 10, dir: 0, length: 6, skip: 1, queued: true });
    expect(c.placing!.chain).toEqual({ x: 16, z: 10 });
    // Then diagonally south-west.
    c.updatePlacing(at(12, 14), 2);
    answer(c, asks);
    c.placeUp();
    expect(sent.at(-1)).toMatchObject({ kind: 'wallStretch', x: 16, z: 10, dir: 3, length: 4, skip: 1, queued: true });
    expect(c.placing!.chain).toEqual({ x: 12, z: 14 });
    // Right click (back) ends the chain and the placement.
    expect(c.back()).toBe(true);
    expect(c.placing).toBeNull();
    expect(sent.length).toBe(3);
  });

  it('finishes a chain with a click on its last point, so a double click places just one wall', () => {
    const { c, sent, asks } = harness(game({ pool: [[Res.SoftwoodLumber, 100]] }));
    // Double click: one wall, and the placement is over.
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(3, 3), 0);
    answer(c, asks);
    c.placeUp();
    c.updatePlacing(at(3, 3), 1);
    c.placeUp();
    expect(sent).toEqual([{ kind: 'wallStretch', player: ME, units: [1, 2], building: BuildingKind.Wall, x: 3, z: 3, dir: 0, length: 0, skip: 0, queued: false }]);
    expect(c.placing).toBeNull();
    // After a stretch, a click on its end finishes the chain.
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(10, 10), 0);
    answer(c, asks);
    c.placeUp();
    c.updatePlacing(at(10, 15), 1);
    answer(c, asks);
    c.placeUp();
    c.updatePlacing(at(10, 15), 2);
    expect(c.chainLabel()).toEqual({ text: 'Click here again to finish the wall', hint: 'Or click further on to build on', short: false });
    c.placeUp();
    expect(sent.length).toBe(3);
    expect(c.placing).toBeNull();
  });

  it('places just one wall with a click and a right click, and with Shift held keeps the wall on the cursor for a new chain', () => {
    const { c, sent, asks, shift } = harness(game({ pool: [[Res.SoftwoodLumber, 100]] }));
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(3, 3), 0);
    answer(c, asks);
    c.placeUp();
    c.back();
    expect(sent.length).toBe(1);
    expect(c.placing).toBeNull();
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(5, 5), 0);
    answer(c, asks);
    shift.held = true;
    c.placeUp();
    expect(sent.at(-1)).toMatchObject({ x: 5, z: 5, length: 0, queued: true });
    c.back();
    expect(c.placing).not.toBeNull();
    expect(c.placing!.chain).toBeNull();
  });

  it('refuses a first wall on a red column, and shows how far the stock reaches, counting what is planned', () => {
    // 6 lumber, 2 walls already planned by worker 1: room for 4.
    const queues: Array<[number, UnitOrder[]]> = [[1, [{ t: 'build', kind: BuildingKind.Wall, variant: 0, x: 0, z: 0 }, { t: 'build', kind: BuildingKind.Wall, variant: 0, x: 1, z: 0 }]], [2, []]];
    const { c, sent, messages, asks, shift } = harness(game({ pool: [[Res.SoftwoodLumber, 6]], queues }));
    shift.held = true;
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(10, 10), 0);
    answer(c, asks, () => 3);
    c.placeUp();
    expect(sent).toEqual([]);
    expect(messages.at(-1)).toBe('Cannot build there: another building is in the way.');
    answer(c, asks);
    c.placeUp();
    expect(c.placing!.chain).toEqual({ x: 10, z: 10 });
    // Six south: room for 4 (the first wall counts once the sim reports it in the workers' lists).
    c.updatePlacing(at(10, 16), 1);
    answer(c, asks);
    expect(c.chainLabel()).toMatchObject({ text: '6 walls: 6 softwood lumber, enough for 4', short: true });
    const ghost = c.updatePlacing(at(10, 16), 2)!;
    expect(ghost.spots.map((s) => s.short)).toEqual([false, false, false, false, true, true]);
    c.placeUp();
    expect(sent.at(-1)).toMatchObject({ dir: 2, length: 6, skip: 1 });
    // The chain goes on from the last wall the stock paid for, so clicking the same end later fills the rest.
    expect(c.placing!.chain).toEqual({ x: 10, z: 14 });
  });

  it('starts a chain from a wall built before, and passes over walls in its way without counting them', () => {
    const { c, sent, asks } = harness(game({ pool: [[Res.SoftwoodLumber, 100]], walls: [[20, 20], [23, 20]] }));
    c.startPlacing(BuildingKind.Wall, 0);
    // On the old wall: nothing to place, and a click makes it the anchor without an order.
    c.updatePlacing(at(20, 20), 0);
    expect(c.chainLabel()!.text).toBe('Click to go on from this wall');
    c.placeUp();
    expect(sent).toEqual([]);
    expect(c.placing!.chain).toEqual({ x: 20, z: 20 });
    // East past the other old wall: it is left out of the ghost and the count.
    c.updatePlacing(at(25, 20), 1);
    expect(asks.at(-1)).toEqual([[21, 20], [22, 20], [24, 20], [25, 20]]);
    answer(c, asks);
    expect(c.chainLabel()!.text).toBe('4 walls: 4 softwood lumber');
    c.placeUp();
    expect(sent).toEqual([{ kind: 'wallStretch', player: ME, units: [1, 2], building: BuildingKind.Wall, x: 20, z: 20, dir: 0, length: 5, skip: 1, queued: true }]);
  });

  it('takes a click where it was made, even before a frame has moved the ghost there', () => {
    const { c, sent, asks } = harness(game({ pool: [[Res.SoftwoodLumber, 100]] }));
    c.startPlacing(BuildingKind.Wall, 0);
    c.updatePlacing(at(4, 4), 0);
    answer(c, asks);
    c.placeUp();
    // The mouse moved east and clicked between frames: the press aims the chain there, it does not finish it on the anchor.
    c.aimPlacing(at(9, 4));
    c.placeUp();
    expect(sent.at(-1)).toMatchObject({ kind: 'wallStretch', x: 4, z: 4, dir: 0, length: 5, skip: 1 });
    expect(c.placing!.chain).toEqual({ x: 9, z: 4 });
  });

  it('draws a straight stretch as one box and a diagonal as a box a step', () => {
    expect(stretchBoxes(0, 0, 0, 5, 2)).toEqual([[0, 0, 5, 1]]);
    expect(stretchBoxes(0, 0, 1, 2, 2)).toEqual([[0, 0, 0, 0], [0, 0, 1, 1], [1, 1, 2, 2]]);
  });
});

describe('tunnel chains', () => {
  // A 1.1 m (10 unit) cliff from x = 2.25 m (column 5).
  const cliff = (x: number): number => (x >= 2.25 ? 10 * UNIT_M : 0);

  it('starts on a cliff face, floored at the ground in front, and digs a stretch per click, level, as one order each', () => {
    const { c, sent } = harness(game(), cliff);
    c.startArea();
    // A press on the face's west side, 0.5 m up.
    c.areaDown(new THREE.Vector3(2.25, 0.5, 0.2));
    expect(c.area!.chain).toEqual({ x: 5, z: 0, floor: 0 });
    expect(sent).toEqual([]);
    expect(c.chainLabel()).toEqual({ text: 'Click where the tunnel goes', hint: 'Right click to stop', short: false });
    expect(c.card()[2]!.lit).toBe(true);
    expect(c.card().at(-1)!.face).toBe('Done');
    c.updateArea(at(13, 1));
    expect(c.tunnelPlan()).toMatchObject({ x: 5, z: 0, dir: 0, length: 8 });
    expect(c.chainLabel()!.text).toBe('3.6 m of tunnel, 2.25 m tall');
    c.areaDown(at(13, 1));
    expect(sent.at(-1)).toEqual({ kind: 'tunnelStretch', player: ME, units: [1, 2], x: 5, z: 0, dir: 0, length: 8, level: 0, level2: TUNNEL_HEIGHT_UNITS, queued: false });
    // Higher, then a turn south: queued after the first, the same floor.
    c.adjustArea(1);
    c.updateArea(at(13, 6));
    c.areaDown(at(13, 6));
    expect(sent.at(-1)).toEqual({ kind: 'tunnelStretch', player: ME, units: [1, 2], x: 13, z: 0, dir: 2, length: 6, level: 0, level2: TUNNEL_HEIGHT_UNITS + 3, queued: true });
    expect(c.area!.chain).toEqual({ x: 13, z: 6, floor: 0 });
    // A click on the last point finishes the tunnel.
    expect(c.chainLabel()).toEqual({ text: 'Click here again to finish the tunnel', hint: 'Or click further on to dig on', short: false });
    c.areaDown(at(13, 6));
    expect(c.area).toBeNull();
    expect(sent.length).toBe(2);
  });

  it('digs level from the ground clicked with Tunnel (D again) on, and digs down otherwise', () => {
    const ground = (x: number): number => (x >= 4.5 ? 20 * UNIT_M : 4 * UNIT_M);
    const { c, sent, shift } = harness(game(), ground);
    c.startArea();
    const tunnel = c.card()[2]!;
    expect(tunnel.face).toBe('Tunnel');
    expect(tunnel.key).toBe('KeyD');
    tunnel.run({ shift: false, ctrl: false });
    expect(c.area!.tunnel).toBe(true);
    expect(c.chainLabel()!.text).toBe('Click where the tunnel starts');
    c.areaDown(at(2, 2, 4 * UNIT_M));
    expect(c.area!.chain).toEqual({ x: 2, z: 2, floor: 4 });
    c.updateArea(at(9, 9));
    c.areaDown(at(9, 9));
    expect(sent.at(-1)).toMatchObject({ kind: 'tunnelStretch', x: 2, z: 2, dir: 1, length: 7, level: 4, level2: 4 + TUNNEL_HEIGHT_UNITS });
    // With Shift held, ending the chain keeps Dig on; pressing Tunnel again goes back to digging down.
    shift.held = true;
    c.back();
    expect(c.area).not.toBeNull();
    expect(c.area!.chain).toBeNull();
    shift.held = false;
    c.card()[2]!.run({ shift: false, ctrl: false });
    expect(c.area!.tunnel).toBe(false);
    c.areaDown(at(2, 2, 4 * UNIT_M));
    expect(c.area!.dragging).toBe(true);
    expect(c.area!.chain).toBeNull();
  });

  it('sends right-clicked workers to a tunnel stretch already marked', () => {
    const site = { id: 50, owner: ME, kind: SiteKind.TunnelLine, x0: 5, z0: 0, x1: 13, z1: 8, level: 0, level2: 20, axis: 2 };
    const { c, sent } = harness(game({ sites: [site] }));
    c.smart(null, at(9, 5));
    expect(sent.at(-1)).toEqual({ kind: 'tunnelStretch', player: ME, units: [1, 2], x: 5, z: 0, dir: 1, length: 8, level: 0, level2: 20, queued: false });
  });
});
