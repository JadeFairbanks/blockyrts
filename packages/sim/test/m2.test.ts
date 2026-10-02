import { describe, expect, it } from 'vitest';
import {
  Act,
  atGoal,
  BuildingKind,
  buildingSpec,
  claimShapes,
  clockAt,
  CYCLE_STEPS,
  createWorld,
  DAY_STEPS,
  deserializeState,
  destroyBuilding,
  DUSK_STEPS,
  FARM_FALLOW_STEPS,
  findNode,
  fleeFrom,
  footprintRect,
  hashState,
  isClaimed,
  isLit,
  Mat,
  NIGHT_STEPS,
  outlyingLights,
  Period,
  PERSON,
  placeBuilding,
  placementBlocked,
  placementTiles,
  Blocked,
  pointGoal,
  Product,
  Res,
  serializeState,
  solidRect,
  step,
  supplyCap,
  supplyUsed,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const col = (wu: number): number => Math.floor(wu / WU_PER_COLUMN);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

/** Player 0's units in order (wild animals share the list since M4). */
function ownUnits(s: SimState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.entities.count; i++) if (s.entities.owner[i] === 0) out.push(i);
  return out;
}

function runUntil(s: SimState, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState, player = 0): Building {
  return s.buildings.list.find((b) => b.owner === player && b.kind === BuildingKind.MainBase)!;
}

/** The nearest node of a resource to the first worker, as the gather order addresses it. */
function nearestNode(s: SimState, res: number): { cx: number; cz: number; index: number } {
  const n = findNode(s, 0, res, col(s.entities.x[0]!), col(s.entities.z[0]!), 120);
  if (!n) throw new Error('no node of that resource near the start');
  return { cx: n.cx, cz: n.cz, index: n.i };
}

/** A clear, explored, level spot for a building near the Big House, searching outwards. */
function freeSpot(s: SimState, kind: number): [number, number] {
  const b = bigHouse(s);
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const x = b.x + 16 + dx;
        const z = b.z + dz;
        if (placementBlocked(s, 0, kind, x, z) === Blocked.None) return [x, z];
      }
    }
  }
  throw new Error('no free spot');
}

describe('the starting camp', () => {
  it('is a finished level 1 Big House, four workers with hardwood tools and the starting stock', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    expect(e.count).toBe(5);
    for (let i = 0; i < 4; i++) {
      expect(e.kind[i]).toBe(UnitKind.Worker);
      expect(e.tool[i]).toBe(1);
      expect(e.hp[i]).toBe(60);
      expect(e.id[i]).toBe(i + 1);
    }
    expect(e.kind[4]).toBe(UnitKind.Warrior);
    expect(e.hp[4]).toBe(100);
    const b = bigHouse(s);
    expect(b.complete).toBe(true);
    expect(b.level).toBe(1);
    expect(b.hp).toBe(1200);
    const pool = s.players[0]!.pool;
    expect([pool[Res.Meat], pool[Res.Fish], pool[Res.Eggs], pool[Res.SoftwoodLumber], pool[Res.Stone], pool[Res.Flint], pool[Res.Sticks]]).toEqual([15, 10, 10, 40, 20, 10, 20]);
    expect(supplyCap(s, 0)).toBe(8);
    expect(supplyUsed(s, 0)).toBe(5);
  });

  it('gives every player their own camp', () => {
    const s = createWorld(2, { players: 3, peaceful: true });
    expect(s.buildings.list.map((b) => b.owner)).toEqual([0, 1, 2]);
    expect(s.players.length).toBe(3);
    for (let p = 0; p < 3; p++) expect([...s.entities.owner.slice(0, 12)].filter((o) => o === p).length).toBe(4);
  });
});

describe('the clock', () => {
  it('runs day 3 min, dusk 40 s, night 3 min, dawn 40 s', () => {
    expect(clockAt(0).period).toBe(Period.Day);
    expect(clockAt(DAY_STEPS).period).toBe(Period.Dusk);
    expect(clockAt(DAY_STEPS + DUSK_STEPS).period).toBe(Period.Night);
    expect(clockAt(DAY_STEPS + DUSK_STEPS + NIGHT_STEPS).period).toBe(Period.Dawn);
    expect(clockAt(CYCLE_STEPS)).toEqual({ period: Period.Day, cycle: 1, into: 0, left: DAY_STEPS });
    expect(clockAt(DAY_STEPS - 1).left).toBe(1);
  });

  it('says so as each period begins', () => {
    const s = createWorld(1, { peaceful: true });
    const texts: string[] = [];
    for (let k = 0; k <= DAY_STEPS; k++) {
      step(s);
      texts.push(...s.events.filter((ev) => ev.kind === 'period').map((ev) => ev.text));
    }
    expect(texts).toEqual(['Day 1. Gather, build and explore while the sun is up.', 'Night is falling. Get everyone home.']);
  });
});

describe('gathering', () => {
  it('chops a tree, carries 5 lumber to the Big House and goes back for more', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const node = nearestNode(s, Res.SoftwoodLumber);
    const e = s.entities;
    run(s, 1, [{ kind: 'gather', player: 0, units: [1], ...node }]);
    // Walk, 15 s of chopping, walk back.
    const steps = runUntil(s, () => pool[Res.SoftwoodLumber] === 45, 4000);
    expect(steps).toBeGreaterThan(300);
    expect(e.carryAmt[0]).toBe(0);
    expect(e.queue[0]![0]!.t).toBe('gather');
    // It heads back to the same tree.
    runUntil(s, () => e.act[0] === Act.Work, 2000);
    expect(e.queue[0]![0]).toMatchObject({ t: 'gather', cx: node.cx, cz: node.cz, i: node.index });
  });

  it('fells the tree after 20 lumber, which also gives its resin, and moves on to the next tree', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const node = nearestNode(s, Res.SoftwoodLumber);
    run(s, 1, [{ kind: 'gather', player: 0, units: [1], ...node }]);
    runUntil(s, () => pool[Res.SoftwoodLumber] === 60, 12000);
    expect(pool[Res.Resin]).toBe(2);
    expect(s.world.prop(node.cx, node.cz, node.index, s.step)).toBeUndefined();
    const o = s.entities.queue[0]![0]!;
    expect(o.t).toBe('gather');
    expect(o.t === 'gather' && (o.cx !== node.cx || o.cz !== node.cz || o.i !== node.index)).toBe(true);
  });

  it('crowds: a second worker on a one-gatherer tree works the closest free tree instead', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const node = nearestNode(s, Res.SoftwoodLumber);
    run(s, 1, [{ kind: 'gather', player: 0, units: [1, 2], ...node }]);
    runUntil(s, () => e.act[0] === Act.Work && e.act[1] === Act.Work, 3000);
    const a = e.queue[0]![0]!;
    const b = e.queue[1]![0]!;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('goes idle with an alert when its trees run out and none are near', () => {
    const s = createWorld(1, { peaceful: true });
    const node = nearestNode(s, Res.SoftwoodLumber);
    // Clear every other softwood tree within 20 m of it.
    const view = s.world.prop(node.cx, node.cz, node.index, 0)!;
    const gx = node.cx * 64 + view.lx;
    const gz = node.cz * 64 + view.lz;
    for (let k = 0; k < 50; k++) {
      const other = findNode(s, 0, Res.SoftwoodLumber, gx, gz, 50, { cx: node.cx, cz: node.cz, i: node.index });
      if (!other) break;
      s.world.harvest(other.cx, other.cz, other.i, 1000, 0);
    }
    run(s, 1, [{ kind: 'gather', player: 0, units: [1], ...node }]);
    let idle = false;
    runUntil(
      s,
      () => {
        idle ||= s.events.some((ev) => ev.kind === 'idle' && ev.player === 0);
        return idle;
      },
      14000,
    );
    runUntil(s, () => s.entities.queue[0]!.length === 0, 2000);
    expect(s.entities.carryAmt[0]).toBe(0);
  });

  it('refuses a node its tools are too poor for', () => {
    const s = createWorld(1, { peaceful: true });
    s.entities.tool[0] = 2; // with flint tools it finds a hardwood tree
    const node = findNode(s, 0, Res.HardwoodLumber, col(s.entities.x[0]!), col(s.entities.z[0]!), 400);
    expect(node).not.toBeNull();
    if (!node) return;
    s.entities.tool[0] = 1;
    run(s, 2, [{ kind: 'gather', player: 0, units: [1], cx: node.cx, cz: node.cz, index: node.i }]);
    expect(s.entities.queue[0]!.length).toBe(0);
  });

  it('Return Cargo takes the load home and then goes back to the node', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const node = nearestNode(s, Res.SoftwoodLumber);
    run(s, 1, [{ kind: 'gather', player: 0, units: [1], ...node }]);
    runUntil(s, () => e.carryAmt[0]! > 0, 3000);
    run(s, 1, [{ kind: 'returnCargo', player: 0, units: [1] }]);
    expect(e.queue[0]![0]!.t).toBe('return');
    runUntil(s, () => e.carryAmt[0] === 0, 3000);
    run(s, 2);
    expect(e.queue[0]![0]!.t).toBe('gather');
  });
});

describe('building', () => {
  it('takes the cost on arrival, builds, lights the torch and claims 5 m round it', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const [x, z] = freeSpot(s, BuildingKind.TorchPost);
    run(s, 1, [{ kind: 'build', player: 0, units: [1], building: BuildingKind.TorchPost, variant: 0, x, z }]);
    expect(pool[Res.SoftwoodLumber]).toBe(40);
    // No resin yet: the order is cancelled on arrival with an alert, nothing spent.
    const alerts: string[] = [];
    runUntil(
      s,
      () => {
        alerts.push(...s.events.filter((ev) => ev.kind === 'alert').map((ev) => ev.text));
        return s.entities.queue[0]!.length === 0;
      },
      3000,
    );
    expect(alerts.join(' ')).toMatch(/Not enough resin/);
    expect(s.buildings.list.length).toBe(1);
    pool[Res.Resin] = 1;
    run(s, 1, [{ kind: 'build', player: 0, units: [1], building: BuildingKind.TorchPost, variant: 0, x, z }]);
    runUntil(s, () => s.buildings.list.length === 2, 3000);
    expect(pool[Res.SoftwoodLumber]).toBe(38);
    expect(pool[Res.Resin]).toBe(0);
    const torch = s.buildings.list[1]!;
    expect(torch.complete).toBe(false);
    expect(torch.hp).toBe(4); // 10% of 40
    runUntil(s, () => torch.complete, 400);
    expect(torch.hp).toBe(40);
    expect(isLit(torch, s.step)).toBe(true);
    const cx = (torch.x + 0.5) * WU_PER_COLUMN;
    const cz = (torch.z + 0.5) * WU_PER_COLUMN;
    expect(isClaimed(s, 0, cx + 4 * WU_PER_METRE, cz)).toBe(true);
    expect(claimShapes(s, 0).circles.length).toBe(1);
    expect(s.entities.queue[0]!.length).toBe(0);
  });

  it('shares one building between workers sent together, and refunds 75% when cancelled', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const [x, z] = freeSpot(s, BuildingKind.Storehouse);
    run(s, 1, [{ kind: 'build', player: 0, units: [1, 2, 3], building: BuildingKind.Storehouse, variant: 0, x, z }]);
    runUntil(s, () => s.buildings.list.length === 2, 3000);
    expect(s.buildings.list.length).toBe(2);
    expect(pool[Res.SoftwoodLumber]).toBe(0);
    expect(pool[Res.Stone]).toBe(0);
    const store = s.buildings.list[1]!;
    run(s, 200);
    expect(store.progress).toBeGreaterThan(200);
    run(s, 1, [{ kind: 'cancelBuild', player: 0, building: store.id }]);
    expect(s.buildings.list.length).toBe(1);
    expect(pool[Res.SoftwoodLumber]).toBe(30);
    expect(pool[Res.Stone]).toBe(15);
    run(s, 2);
    for (let i = 0; i < 3; i++) expect(s.entities.queue[i]!.length).toBe(0);
  });

  it('marks ghost tiles red on another building, on unexplored land and on nodes', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    expect(placementBlocked(s, 0, BuildingKind.Storehouse, b.x + 2, b.z + 2)).toBe(Blocked.Building);
    expect(placementBlocked(s, 0, BuildingKind.Storehouse, b.x + 3000, b.z)).toBe(Blocked.Unexplored);
    const node = nearestNode(s, Res.SoftwoodLumber);
    const v = s.world.prop(node.cx, node.cz, node.index, 0)!;
    const tiles = placementTiles(s, 0, BuildingKind.TorchPost, node.cx * 64 + v.lx, node.cz * 64 + v.lz);
    expect(tiles[0]).not.toBe(Blocked.None);
  });

  it('upgrades the Big House to a Longhall: paid from the panel, built by workers', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    pool[Res.SoftwoodLumber] = 100;
    pool[Res.Stone] = 40;
    const b = bigHouse(s);
    run(s, 1, [{ kind: 'upgrade', player: 0, building: b.id }]);
    expect(b.upgrading).toBe(2);
    expect(pool[Res.SoftwoodLumber]).toBe(0);
    run(s, 1, [{ kind: 'work', player: 0, units: [1, 2, 3, 4], building: b.id }]);
    // 400 ws with 4 workers is 100 s, plus the walk.
    runUntil(s, () => b.level === 2, 2600);
    expect(b.hp).toBe(1600);
    expect(supplyCap(s, 0)).toBe(12);
  });

  it('repairs a damaged building with a double-tapped Repair', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    b.hp = 1000;
    run(s, 1, [{ kind: 'repairAll', player: 0, units: [1] }]);
    runUntil(s, () => b.hp === 1200, 30000);
    run(s, 2);
    expect(s.entities.queue[0]!.length).toBe(0);
  });
});

describe('training and production queues', () => {
  it('trains a worker for 20 food in 30 s, sends it along the rally route, and refunds a cancelled one in full', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const b = bigHouse(s);
    const node = nearestNode(s, Res.SoftwoodLumber);
    const food = (): number => pool[Res.Meat]! * 2 + pool[Res.Fish]! * 3 + pool[Res.Eggs]! * 2;
    const before = [...pool];
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: Product.Worker, count: 2 }]);
    expect(b.queue.length).toBe(2);
    run(s, 1, [{ kind: 'cancelProduce', player: 0, building: b.id, index: 1 }]);
    expect(b.queue.length).toBe(1);
    run(s, 1, [{ kind: 'rally', player: 0, building: b.id, add: false, point: 'node', x: node.cx, z: node.cz, id: node.index }]);
    expect(food()).toBeLessThan(before[Res.Meat]! * 2 + before[Res.Fish]! * 3 + before[Res.Eggs]! * 2);
    runUntil(s, () => ownUnits(s).length === 6, 700);
    const w = ownUnits(s)[5]!;
    expect(s.entities.kind[w]).toBe(UnitKind.Worker);
    expect(s.entities.tool[w]).toBe(1);
    run(s, 1);
    expect(s.entities.queue[w]![0]!.t).toBe('gather');
  });

  it('will not start a worker without free supply', () => {
    const s = createWorld(1, { playerUnits: 8, warriors: 0, peaceful: true });
    const b = bigHouse(s);
    run(s, 1, [{ kind: 'produce', player: 0, building: b.id, product: Product.Worker, count: 1 }]);
    run(s, 700);
    expect(ownUnits(s).length).toBe(8);
    expect(b.queue[0]!.progress).toBe(0);
  });

  it('a lumber mill makes planks only with hands inside', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const [x, z] = freeSpot(s, BuildingKind.LumberMill);
    const mill = placeBuilding(s, 0, BuildingKind.LumberMill, 0, x, z, true);
    run(s, 1, [{ kind: 'produce', player: 0, building: mill.id, product: Product.PlanksSoftwood, count: 2 }]);
    expect(pool[Res.SoftwoodLumber]).toBe(38);
    run(s, 200);
    expect(pool[Res.Planks]).toBe(0);
    run(s, 1, [{ kind: 'assign', player: 0, units: [1, 2], building: mill.id }]);
    runUntil(s, () => pool[Res.Planks] === 2, 3000);
    expect(s.entities.inside[0]).toBe(mill.id);
  });
});

describe('farms', () => {
  it('a wheat field with two farmers puts wheat in the pool once its fallow days are over', () => {
    const s = createWorld(1, { peaceful: true });
    const pool = s.players[0]!.pool;
    const [x, z] = freeSpot(s, BuildingKind.CropField);
    const farm = placeBuilding(s, 0, BuildingKind.CropField, 0, x, z, true);
    run(s, 1, [{ kind: 'assign', player: 0, units: [1, 2, 3], building: farm.id }]);
    run(s, 300);
    // Two farmers at most at tier 1; the third was turned away.
    expect(s.entities.queue[2]!.length).toBe(0);
    expect(pool[Res.Wheat]).toBe(0);
    // Skip the fallow days.
    farm.doneAt = s.step - FARM_FALLOW_STEPS;
    // 2 farmers x 6 a day: one wheat every 1/12 day, about 733 steps (in the Heartland).
    run(s, 1500);
    expect(pool[Res.Wheat]).toBe(2);
  });

  it('farmers go into their farmhouse at dusk and back to the field at day', () => {
    const s = createWorld(1, { peaceful: true });
    const [x, z] = freeSpot(s, BuildingKind.CropField);
    const farm = placeBuilding(s, 0, BuildingKind.CropField, 0, x, z, true);
    run(s, 1, [{ kind: 'assign', player: 0, units: [1], building: farm.id }]);
    run(s, DAY_STEPS + 300);
    expect(s.entities.inside[0]).toBe(farm.id);
    run(s, CYCLE_STEPS - DAY_STEPS);
    expect(s.entities.inside[0]).toBe(0);
  });
});

describe('sheltering', () => {
  it('Everyone Home sends workers in; at daybreak they come out and carry on gathering', () => {
    const s = createWorld(1, { peaceful: true });
    const node = nearestNode(s, Res.SoftwoodLumber);
    run(s, 1, [{ kind: 'gather', player: 0, units: [1, 2], ...node }]);
    run(s, 100);
    run(s, 1, [{ kind: 'everyoneHome', player: 0 }]);
    runUntil(s, () => s.entities.inside[0] !== 0 && s.entities.inside[1] !== 0, 2000);
    expect(s.entities.queue[0]![1]!.t).toBe('gather');
    runUntil(s, () => clockAt(s.step).cycle === 1, CYCLE_STEPS);
    run(s, 2);
    expect(s.entities.inside[0]).toBe(0);
    expect(s.entities.queue[0]![0]!.t).toBe('gather');
  });

  it('a destroyed shelter costs each worker inside 10% of its health', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    run(s, 1, [{ kind: 'enter', player: 0, units: [1, 2], building: b.id }]);
    runUntil(s, () => s.entities.inside[0] === b.id && s.entities.inside[1] === b.id, 1000);
    destroyBuilding(s, b.id);
    expect(s.entities.hp[0]).toBe(54);
    expect(s.entities.hp[1]).toBe(54);
    expect(s.entities.inside[0]).toBe(0);
    expect(s.buildings.list.length).toBe(0);
  });

  it('a worker flees 10 m from an attacker', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const x0 = e.x[0]!;
    fleeFrom(s, 0, x0 - WU_PER_METRE, e.z[0]!);
    run(s, 100);
    expect(e.x[0]! - x0).toBeGreaterThan(9 * WU_PER_METRE);
  });
});

describe('lights and claimed land', () => {
  it('counts lights far from the base at dusk and burns fuel down', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const far: Building[] = [];
    for (let k = 0; k < 6; k++) far.push(placeBuilding(s, 0, BuildingKind.TorchPost, 0, b.x + 120 + k * 3, b.z, false));
    for (const t of far) {
      t.complete = true;
      t.fuelUntil = s.step + 3 * CYCLE_STEPS;
    }
    expect(outlyingLights(s, 0, 0)).toEqual({ halves: 12, limit: 4 });
    expect(outlyingLights(s, 0, 10).limit).toBe(6);
    const near = placeBuilding(s, 0, BuildingKind.TorchPost, 0, b.x - 3, b.z, false);
    near.complete = true;
    near.fuelUntil = s.step + 10;
    // Within 40 m of the Big House the pool refuels it.
    run(s, 20);
    expect(near.fuelUntil).toBeGreaterThan(s.step + 1000);
    expect(s.players[0]!.pool[Res.SoftwoodLumber]).toBe(39);
  });

  it('claims 10 m round a building', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const [x0, z0, x1] = footprintRect(b);
    const z = (z0 + 3) * WU_PER_COLUMN;
    expect(isClaimed(s, 0, (x1 + 1) * WU_PER_COLUMN + 9 * WU_PER_METRE, z)).toBe(true);
    expect(isClaimed(s, 0, x0 * WU_PER_COLUMN - 11 * WU_PER_METRE, z)).toBe(false);
    expect(isClaimed(s, 1, (x1 + 1) * WU_PER_COLUMN, z)).toBe(false);
  });

  it('claims a region closed off by cliffs that holds a building', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    // A ring of stone 3 m high, 30 columns out, all round the Big House.
    const [x0, z0, x1, z1] = footprintRect(b);
    const r = 30;
    const top = s.world.topAt(x0, z0) + 30;
    const lo = top - 80;
    for (let x = x0 - r; x <= x1 + r; x += 16) {
      s.world.editBox(x, z0 - r, Math.min(x + 15, x1 + r), z0 - r, lo, top, Mat.Stone);
      s.world.editBox(x, z1 + r, Math.min(x + 15, x1 + r), z1 + r, lo, top, Mat.Stone);
    }
    for (let z = z0 - r; z <= z1 + r; z += 16) {
      s.world.editBox(x0 - r, z, x0 - r, Math.min(z + 15, z1 + r), lo, top, Mat.Stone);
      s.world.editBox(x1 + r, z, x1 + r, Math.min(z + 15, z1 + r), lo, top, Mat.Stone);
    }
    // Claimed at dusk.
    run(s, DAY_STEPS + 1);
    const inside = (x0 - r + 3) * WU_PER_COLUMN;
    expect(isClaimed(s, 0, inside, (z0 - r + 3) * WU_PER_COLUMN)).toBe(true);
    expect(s.enclosed.length).toBeGreaterThan(100);
  });
});

describe('moving over the land', () => {
  it('walks round a building in the way', () => {
    const s = createWorld(1, { noBase: true, peaceful: true });
    const e = s.entities;
    const sx = col(e.x[0]!);
    const sz = col(e.z[0]!);
    // A storehouse right between the worker and its goal.
    placeBuilding(s, 0, BuildingKind.Storehouse, 0, sx + 3, sz - 4, true);
    const goal = { x: (sx + 16) * WU_PER_COLUMN + 1800, z: (sz) * WU_PER_COLUMN + 1800 };
    run(s, 1, [{ kind: 'move', player: 0, units: [1], x: goal.x, z: goal.z }]);
    const [bx0, bz0, bx1, bz1] = solidRect(s.buildings.list[0]!);
    runUntil(
      s,
      () => {
        const cx = col(e.x[0]!);
        const cz = col(e.z[0]!);
        expect(cx >= bx0 && cx <= bx1 && cz >= bz0 && cz <= bz1).toBe(false);
        return e.queue[0]!.length === 0;
      },
      400,
    );
    expect(e.x[0]).toBe(goal.x);
  });

  it('finds the walk map changed where the land was dug', () => {
    const s = createWorld(1, { noBase: true, peaceful: true });
    const e = s.entities;
    const sx = col(e.x[0]!);
    const sz = col(e.z[0]!);
    const before = s.nav.level(sx + 5, sz);
    s.world.editBox(sx + 5, sz, sx + 5, sz, before - 3, before + 40, Mat.Air);
    expect(s.nav.level(sx + 5, sz)).toBe(before - 3);
    const r = s.paths.find(PERSON, sx, sz, pointGoal(sx + 10, sz));
    expect(r.reached).toBe(true);
    expect(atGoal(pointGoal(sx + 10, sz), r.points[r.points.length - 2]!, r.points[r.points.length - 1]!)).toBe(true);
  });

  it('moves a group of 8 or more with one flow field and keeps them apart at the goal', () => {
    const s = createWorld(1, { playerUnits: 10, peaceful: true });
    const e = s.entities;
    const units = Array.from({ length: 10 }, (_, k) => k + 1);
    run(s, 1, [{ kind: 'move', player: 0, units, x: e.x[0]! + 30 * WU_PER_METRE, z: e.z[0]! + 30 * WU_PER_METRE }]);
    runUntil(s, () => units.every((_, k) => e.queue[k]!.length === 0), 1500);
    const spots = new Set(units.map((_, k) => `${e.x[k]},${e.z[k]}`));
    expect(spots.size).toBe(10);
  });

  it('queues orders with Shift', () => {
    const s = createWorld(1, { peaceful: true });
    const e = s.entities;
    const x = e.x[0]!;
    const z = e.z[0]!;
    run(s, 1, [
      { kind: 'move', player: 0, units: [1], x: x + 5 * WU_PER_METRE, z },
      { kind: 'move', player: 0, units: [1], x: x + 5 * WU_PER_METRE, z: z + 5 * WU_PER_METRE, queued: true },
    ]);
    expect(e.queue[0]!.length).toBe(2);
    runUntil(s, () => e.queue[0]!.length === 0, 400);
    expect(e.z[0]).toBe(z + 5 * WU_PER_METRE);
    run(s, 1, [
      { kind: 'move', player: 0, units: [1], x, z },
      { kind: 'stop', player: 0, units: [1] },
    ]);
    expect(e.queue[0]!.length).toBe(0);
  });
});

describe('snapshots in the middle of the work', () => {
  it('resume to the same hashes as an unbroken run', () => {
    const play = (s: SimState, from: number, to: number): number[] => {
      const out: number[] = [];
      for (let n = from; n < to; n++) {
        const orders: Order[] = [];
        if (n === 5) {
          const node = nearestNode(s, Res.SoftwoodLumber);
          orders.push({ kind: 'gather', player: 0, units: [1, 2], ...node });
          const [x, z] = freeSpot(s, BuildingKind.Storehouse);
          orders.push({ kind: 'build', player: 0, units: [3, 4], building: BuildingKind.Storehouse, variant: 0, x, z });
          orders.push({ kind: 'produce', player: 0, building: bigHouse(s).id, product: Product.Worker, count: 1 });
        }
        const r = step(s, orders);
        if (r.hash !== undefined) out.push(r.hash);
      }
      return out;
    };
    const whole = createWorld(7, { peaceful: true });
    const a = play(whole, 0, 1600);
    const first = createWorld(7, { peaceful: true });
    play(first, 0, 900);
    const resumed = deserializeState(serializeState(first));
    expect(hashState(resumed)).toBe(hashState(first));
    const b = play(resumed, 900, 1600);
    expect(b).toEqual(a.slice(45));
    expect(buildingSpec(BuildingKind.Storehouse).name).toBe('Storehouse');
  });
});
