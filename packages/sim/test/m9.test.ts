// Milestone 9's sim side of multiplayer: shared control, sending resources,
// a player leaving, and the buildings and units everyone inherits.
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  createWorld,
  deserializeState,
  FOODS,
  hashState,
  placeBuilding,
  Product,
  productProblem,
  Res,
  Research,
  RESEARCH_PRODUCT,
  serializeState,
  step,
  UnitKind,
  validateOrder,
  type Order,
  type SimState,
} from '../src/index.ts';

function unitsOf(s: SimState, player: number, kind: number = UnitKind.Worker): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.kind[i] === kind) out.push(e.id[i]!);
  return out;
}

function at(s: SimState, id: number): [number, number] {
  const i = s.entities.indexOf(id);
  return [s.entities.x[i]!, s.entities.z[i]!];
}

function mainBase(s: SimState, player: number): number {
  return s.buildings.list.find((b) => b.owner === player && b.kind === BuildingKind.MainBase)!.id;
}

describe('Milestone 9: shared control', () => {
  it('lets an ally move, stop and gather with shared units, but not build with them or upgrade their kit', () => {
    const s = createWorld(3, { players: 2, peaceful: true });
    const [w] = unitsOf(s, 0);
    const [x0, z0] = at(s, w!);
    const move = (player: number): Order => ({ kind: 'move', player, units: [w!], x: x0 + 8000 * 6, z: z0 });
    // Without sharing, player 2's order is ignored.
    step(s, [move(1)]);
    for (let k = 0; k < 40; k++) step(s);
    expect(at(s, w!)[0]).toBe(x0);
    // Player 1 ticks Share control for player 2.
    step(s, [{ kind: 'shareControl', player: 0, with: 1, on: 1 }]);
    expect(s.players[0]!.share).toBe(2);
    step(s, [move(1)]);
    for (let k = 0; k < 40; k++) step(s);
    expect(at(s, w!)[0]).toBeGreaterThan(x0);
    // Upgrading their kit (Troops and gear) and building are not shared.
    const queueBefore = s.entities.queue[s.entities.indexOf(w!)]!.length;
    step(s, [{ kind: 'build', player: 1, units: [w!], building: BuildingKind.TorchPost, variant: 0, x: 0, z: 0 }]);
    expect(s.entities.queue[s.entities.indexOf(w!)]!.length).toBeLessThanOrEqual(queueBefore);
    const pool = [...s.players[1]!.pool];
    step(s, [{ kind: 'upgradeKit', player: 1, units: [w!], line: 0, max: 1 }]);
    expect(s.entities.queue[s.entities.indexOf(w!)]!.some((o) => o.t === 'kitUp')).toBe(false);
    expect([...s.players[1]!.pool]).toEqual(pool);
    // Unticking stops it again.
    step(s, [{ kind: 'shareControl', player: 0, with: 1, on: 0 }]);
    expect(s.players[0]!.share).toBe(0);
    step(s, [{ kind: 'stop', player: 0, units: [w!] }]);
    const [x1] = at(s, w!);
    step(s, [move(1)]);
    for (let k = 0; k < 40; k++) step(s);
    expect(at(s, w!)[0]).toBe(x1);
  });

  it('ignores sharing with yourself or a player who is not in the game', () => {
    const s = createWorld(3, { players: 2, peaceful: true });
    step(s, [
      { kind: 'shareControl', player: 0, with: 0, on: 1 },
      { kind: 'shareControl', player: 0, with: 5, on: 1 },
    ]);
    expect(s.players[0]!.share).toBe(0);
    expect(() => validateOrder({ kind: 'shareControl', player: 0, with: 9, on: 1 })).toThrow();
  });
});

describe('Milestone 9: send resources', () => {
  it('moves the amount at once, and no more than the pool holds', () => {
    const s = createWorld(3, { players: 2, peaceful: true });
    const a = s.players[0]!.pool;
    const b = s.players[1]!.pool;
    const wood = a[Res.SoftwoodLumber]!;
    const theirs = b[Res.SoftwoodLumber]!;
    step(s, [{ kind: 'sendResources', player: 0, to: 1, res: Res.SoftwoodLumber, amount: 10 }]);
    expect(a[Res.SoftwoodLumber]).toBe(wood - 10);
    expect(b[Res.SoftwoodLumber]).toBe(theirs + 10);
    expect(s.events.some((ev) => ev.player === 1 && ev.text === 'Player 1 sent you 10 softwood lumber.')).toBe(true);
    step(s, [{ kind: 'sendResources', player: 0, to: 1, res: Res.SoftwoodLumber, amount: 1_000_000 }]);
    expect(a[Res.SoftwoodLumber]).toBe(0);
    expect(b[Res.SoftwoodLumber]).toBe(theirs + wood);
    // Nothing to self, or past the last resource.
    step(s, [{ kind: 'sendResources', player: 1, to: 1, res: Res.SoftwoodLumber, amount: 5 }, { kind: 'sendResources', player: 1, to: 0, res: 250, amount: 5 }]);
    expect(b[Res.SoftwoodLumber]).toBe(theirs + wood);
  });
});

describe('Milestone 9: a player leaves', () => {
  it('shares their resources out, and every player still in may command their units and use their buildings', () => {
    const s = createWorld(5, { players: 3, peaceful: true });
    const gone = 1;
    const pool = s.players[gone]!.pool;
    const stone = pool[Res.Stone]!;
    const before = [s.players[0]!.pool[Res.Stone]!, s.players[2]!.pool[Res.Stone]!];
    const workers = unitsOf(s, gone);
    const base = mainBase(s, gone);
    step(s, [{ kind: 'leave', player: gone }]);
    expect(s.players[gone]!.out).toBeGreaterThan(0);
    expect(pool[Res.Stone]).toBe(0);
    const each = Math.floor(stone / 2);
    expect(s.players[0]!.pool[Res.Stone]).toBe(before[0]! + each + (stone % 2));
    expect(s.players[2]!.pool[Res.Stone]).toBe(before[1]! + each);
    // The heir (the first player still in) owns them; they are shared.
    const e = s.entities;
    for (const id of workers) {
      const i = e.indexOf(id);
      expect(e.owner[i]).toBe(0);
      expect(e.shared[i]).toBe(1);
    }
    const b = s.buildings.get(base)!;
    expect(b.owner).toBe(0);
    expect(b.shared).toBe(1);
    // Player 3 moves one of the inherited workers.
    const w = workers[0]!;
    const [x0, z0] = at(s, w);
    step(s, [{ kind: 'move', player: 2, units: [w], x: x0 - 8000 * 6, z: z0 }]);
    for (let k = 0; k < 40; k++) step(s);
    expect(at(s, w)[0]).toBeLessThan(x0);
    // Player 3 trains a worker at the inherited Big House, paying with their own food; it is theirs.
    const food = (p: number): number => FOODS.reduce<number>((n, f) => n + s.players[p]!.pool[f]!, 0);
    s.players[2]!.pool[Res.Bread] = s.players[2]!.pool[Res.Bread]! + 100;
    const heirFood = food(0);
    const mine = unitsOf(s, 2).length;
    step(s, [{ kind: 'produce', player: 2, building: base, product: Product.Worker, count: 1 }]);
    expect(b.queue[0]?.by).toBe(2);
    expect(food(0)).toBe(heirFood);
    for (let k = 0; k < 20 * 60 && unitsOf(s, 2).length === mine; k++) step(s);
    expect(unitsOf(s, 2).length).toBe(mine + 1);
    // A player who left gives no more orders.
    step(s, [{ kind: 'sendResources', player: gone, to: 0, res: Res.Stone, amount: 1 }]);
    expect(pool[Res.Stone]).toBe(0);
  });

  it('lets anyone build on the research the leaver had, at the buildings they left', () => {
    const s = createWorld(5, { players: 3, peaceful: true });
    const base = s.buildings.list.find((x) => x.owner === 1 && x.kind === BuildingKind.MainBase)!;
    // A finished Scholar's Lodge for player 2, who has Bronze.
    const b = placeBuilding(s, 1, BuildingKind.ScholarsLodge, 0, base.x + 16, base.z, true);
    s.players[1]!.research |= 1 << Research.Bronze;
    step(s, [{ kind: 'leave', player: 1 }]);
    expect(b.tech & (1 << Research.Bronze)).not.toBe(0);
    // Player 3 has no Bronze, but at the inherited building it counts for what must come first.
    const deep = RESEARCH_PRODUCT + Research.DeepMining1;
    expect(productProblem(s, b, deep, 2)).not.toContain('Bronze researched first');
    // Player 3's own Bronze is still theirs to research.
    expect(productProblem(s, b, RESEARCH_PRODUCT + Research.Bronze, 2)).not.toBe('Already researched.');
    expect(productProblem(s, b, deep, 0)).not.toContain('Bronze researched first');
  });

  it('keeps everything through a snapshot', () => {
    const s = createWorld(5, { players: 3, peaceful: true });
    step(s, [
      { kind: 'shareControl', player: 2, with: 0, on: 1 },
      { kind: 'leave', player: 1 },
    ]);
    step(s, [{ kind: 'produce', player: 2, building: mainBase(s, 0), product: Product.Worker, count: 1 }]);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    for (let k = 0; k < 100; k++) {
      step(s);
      step(copy);
    }
    expect(hashState(copy)).toBe(hashState(s));
  });
});
