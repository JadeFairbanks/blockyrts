import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  Blocked,
  BuildingKind,
  canReach,
  createWorld,
  DAY_STEPS,
  deserializeState,
  DUSK_STEPS,
  ENTER_TOP,
  footprintDims,
  footprintRect,
  growthBlocked,
  hashState,
  Mat,
  meleeOf,
  Mob,
  onTop,
  PERSON,
  PickOwn,
  placeBuilding,
  placementBlocked,
  placementTiles,
  refitBuilding,
  sayUpTop,
  serializeState,
  step,
  UnitKind,
  unitsOnTop,
  WU_PER_COLUMN,
  WU_PER_METRE,
  WU_PER_MODEL_UNIT,
  WU_PER_TERRAIN_UNIT,
  type Building,
  type Order,
  type SimState,
} from '../src/index.ts';

const centre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

function run(s: SimState, n: number, orders: Order[] = []): void {
  step(s, orders);
  for (let k = 1; k < n; k++) step(s);
}

function runUntil(s: SimState, done: () => boolean, max: number): void {
  for (let k = 0; k < max; k++) {
    if (done()) return;
    step(s);
  }
  throw new Error(`condition not met in ${max} steps`);
}

function bigHouse(s: SimState): Building {
  return s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
}

function ids(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind) out.push(e.id[i]!);
  return out;
}

/** A clear spot for a building, searching outwards from a column. */
function spotNear(s: SimState, kind: number, x0: number, z0: number): [number, number] {
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        if (placementBlocked(s, 0, kind, x0 + dx, z0 + dz) === Blocked.None) return [x0 + dx, z0 + dz];
      }
    }
  }
  throw new Error('no free spot');
}

/** A finished tower east of the Big House. */
function tower(s: SimState): Building {
  const h = bigHouse(s);
  const [x, z] = spotNear(s, BuildingKind.Tower, h.x + 20, h.z + 4);
  return placeBuilding(s, 0, BuildingKind.Tower, 0, x, z, true);
}

/** The clock at the start of night 0 (a peaceful world plans nothing). */
function toNight(s: SimState): void {
  s.step = DAY_STEPS + DUSK_STEPS;
}

/** The column a unit stands in. */
function columnOf(s: SimState, id: number): [number, number] {
  const e = s.entities;
  const i = e.indexOf(id);
  return [Math.floor(e.x[i]! / WU_PER_COLUMN), Math.floor(e.z[i]! / WU_PER_COLUMN)];
}

describe('walkable footprints (patch notes 1)', () => {
  it('shuts the Citadel and leaves the Big House its open yard', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const walkable = (): number => {
      let n = 0;
      for (let z = b.z; z < b.z + 14; z++) for (let x = b.x; x < b.x + 14; x++) if (s.buildings.solidAt(x, z) === 0 && s.nav.standable(x, z, PERSON)) n++;
      return n;
    };
    // Level 1: the house and its sheds stand in the north-west; the yard east and south of it is walked through.
    expect(walkable()).toBeGreaterThan(100);
    expect(s.buildings.solidAt(b.x + 4, b.z + 6)).toBe(b.id);
    expect(s.buildings.solidAt(b.x + 12, b.z + 6)).toBe(0);
    b.level = 4;
    refitBuilding(s, b);
    // The Citadel: ring walls, corner towers and a shut gate close the whole footprint.
    expect(walkable()).toBe(0);
    expect(footprintDims(BuildingKind.MainBase, 0, 4).cells.length).toBe(14 * 14);
  });

  it('moves a unit off columns a building fills when it goes up or grows', () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const [w] = ids(s, UnitKind.Worker);
    const e = s.entities;
    const i = e.indexOf(w!);
    // Standing in the yard, where level 4's walls will be.
    const level4 = footprintDims(BuildingKind.MainBase, 0, 4);
    const [cx, cz] = level4.cells.map(([x, z]) => [b.x + x, b.z + z] as const).find(([x, z]) => s.buildings.solidAt(x, z) === 0 && s.nav.standable(x, z, PERSON))!;
    e.x[i] = centre(cx);
    e.z[i] = centre(cz);
    b.level = 4;
    refitBuilding(s, b);
    const [x, z] = columnOf(s, w!);
    expect(s.buildings.solidAt(x, z)).toBe(0);
    expect(s.nav.standable(x, z, PERSON)).toBe(true);
    expect(Math.max(Math.abs(x - cx), Math.abs(z - cz))).toBeLessThanOrEqual(3);
  });

  it("walks a unit found inside a building's walls (a game saved before they were walls) out on its next step", () => {
    const s = createWorld(1, { peaceful: true });
    const b = bigHouse(s);
    const [w] = ids(s, UnitKind.Worker);
    const e = s.entities;
    const i = e.indexOf(w!);
    e.x[i] = centre(b.x + 4);
    e.z[i] = centre(b.z + 6);
    expect(s.buildings.solidAt(b.x + 4, b.z + 6)).toBe(b.id);
    step(s);
    const [x, z] = columnOf(s, w!);
    expect(s.buildings.solidAt(x, z)).toBe(0);
    expect(s.nav.standable(x, z, PERSON)).toBe(true);
  });

  it('keeps the main base on its own ground as it levels up (Patch 2: the one building with levels; its footprint never grows)', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const rect = footprintRect(h);
    for (let level = 2; level <= 10; level++) {
      expect(growthBlocked(s, h, level)).toBe(Blocked.None);
      h.upgrading = level;
      refitBuilding(s, h);
      expect(footprintRect(h)).toEqual(rect);
    }
    h.upgrading = 0;
    refitBuilding(s, h);
    expect(footprintRect(h)).toEqual(rect);
  });
});

describe('manning towers and main base tops (patch notes 1)', () => {
  it('sends close warriors and workers up a tower with E, onto its corners, and no further than its 4 places', () => {
    const s = createWorld(1, { peaceful: true });
    const t = tower(s);
    const warriors = ids(s, UnitKind.Warrior);
    const workers = ids(s, UnitKind.Worker);
    run(s, 1, [{ kind: 'enter', player: 0, units: [...warriors, ...workers.slice(0, 2)], building: t.id }]);
    const e = s.entities;
    runUntil(s, () => unitsOnTop(s, t.id).length === 4, 3000);
    const up = unitsOnTop(s, t.id);
    // The deck is 124 units (3.5 m) up (Patch 5: the tower models' deck); each stands on a corner of his own.
    for (const i of up) expect(e.y[i]).toBe(t.y * WU_PER_TERRAIN_UNIT + 124 * WU_PER_MODEL_UNIT);
    expect(new Set(up.map((i) => `${e.x[i]},${e.z[i]}`)).size).toBe(4);
    run(s, 600);
    // The fifth found it full: a tower has no shelter below.
    expect(unitsOnTop(s, t.id).length).toBe(4);
    expect(s.entities.inside.filter((v) => v === t.id).length).toBe(4);
  });

  it('shelters workers inside a tier 2 main base, sends one up on its ramparts from the panel, and back in with E twice', () => {
    const s = createWorld(1, { peaceful: true, playerUnits: 4 });
    const b = bigHouse(s);
    b.level = 2;
    refitBuilding(s, b);
    const workers = ids(s, UnitKind.Worker);
    run(s, 1, [{ kind: 'enter', player: 0, units: workers, building: b.id }]);
    runUntil(s, () => workers.every((id) => s.entities.inside[s.entities.indexOf(id)] === b.id), 3000);
    const e = s.entities;
    // Workers go deeper inside a main base (Jade's Patch 5, decisions 3.8) [before, up top first while there was room]; by day until let out.
    for (const id of workers) {
      const i = e.indexOf(id);
      expect(onTop(s, i)).toBe(false);
      expect(e.queue[i]![0]).toEqual({ t: 'enter', b: b.id, auto: 0 });
    }
    // The main base's panel sends one up on the ramparts (GP-10).
    run(s, 1, [{ kind: 'shelter', player: 0, building: b.id, unit: workers[0]! }]);
    expect(onTop(s, e.indexOf(workers[0]!))).toBe(true);
    expect(e.queue[e.indexOf(workers[0]!)]![0]).toEqual({ t: 'enter', b: b.id, auto: ENTER_TOP });
    // E twice shelters workers inside, out of reach of the swooping bats.
    run(s, 1, [{ kind: 'pickOwn', player: 0, units: workers, command: PickOwn.Enter }]);
    run(s, 2);
    for (const id of workers) expect(onTop(s, e.indexOf(id))).toBe(false);
  });

  it('keeps a man up top out of reach of what walks: a zombie at the foot of the tower neither reaches him nor goes for him', () => {
    const s = createWorld(1, { peaceful: true });
    const t = tower(s);
    const [w] = ids(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'enter', player: 0, units: [w!], building: t.id }]);
    const e = s.entities;
    const i = e.indexOf(w!);
    runUntil(s, () => onTop(s, i), 3000);
    toNight(s);
    const [x0, , , z1] = footprintRect(t);
    const z = addMob(s, Mob.Zombie, 0, centre(x0 + 1), centre(z1 + 1), 0);
    expect(canReach(s, i, z, meleeOf(s, i))).toBe(false);
    const hp = e.hp[i];
    run(s, 200);
    expect(e.hp[i]).toBe(hp);
    expect(e.target[z]).not.toBe(w);
    expect(onTop(s, i)).toBe(true);
  });

  it('lets a man up top fight a cave bat that swoops at him, and nothing else', () => {
    const s = createWorld(1, { peaceful: true });
    const t = tower(s);
    const [w] = ids(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'enter', player: 0, units: [w!], building: t.id }]);
    const e = s.entities;
    const i = e.indexOf(w!);
    runUntil(s, () => onTop(s, i), 3000);
    // Everyone else indoors, so the bat has only him.
    run(s, 1, [{ kind: 'enter', player: 0, units: ids(s, UnitKind.Worker), building: bigHouse(s).id }, { kind: 'move', player: 0, units: ids(s, UnitKind.Warrior).filter((id) => id !== w), x: centre(bigHouse(s).x - 30), z: centre(bigHouse(s).z) }]);
    toNight(s);
    const b = addMob(s, Mob.CaveBat, 0, e.x[i]! + 6 * WU_PER_METRE, e.z[i]!, 0);
    const bat = e.id[b]!;
    const hp = e.hp[i]!;
    // It swoops down to him (not to the ground below): he can strike it once it comes down within his reach.
    runUntil(s, () => e.target[i] === bat, 20 * 20);
    expect(e.target[b]).toBe(w);
    expect(e.y[b]).toBeGreaterThan(e.y[i]!);
    // They trade blows, and he brings it down.
    runUntil(s, () => e.indexOf(bat) < 0, 60 * 20);
    expect(e.hp[i]).toBeLessThan(hp);
    expect(onTop(s, i)).toBe(true);
  });

  it('has a man up top with nothing to shoot say he is not much help while monsters are at the base', () => {
    const s = createWorld(1, { peaceful: true });
    const t = tower(s);
    const [w] = ids(s, UnitKind.Warrior);
    run(s, 1, [{ kind: 'enter', player: 0, units: [w!], building: t.id }]);
    const e = s.entities;
    const i = e.indexOf(w!);
    runUntil(s, () => onTop(s, i), 3000);
    toNight(s);
    const [x0, , , z1] = footprintRect(t);
    addMob(s, Mob.Zombie, 0, centre(x0 + 1), centre(z1 + 3), 0);
    const said: string[] = [];
    for (let k = 0; k < 60; k++) {
      step(s);
      for (const ev of s.events) if ((ev.kind === 'speech' || ev.kind === 'question') && ev.speaker === w) said.push(ev.text);
    }
    expect(said.length).toBe(1);
    expect(["I'm not much help up here!", 'Let me down to fight those zombies?']).toContain(said[0]);
  });

  it('has a warrior want to get down only to monsters on the ground, not to flyers', () => {
    const said = (foe: (s: SimState) => number): string => {
      const s = createWorld(1, { peaceful: true });
      // The warrior whose turn it is to be eager (one time in three, by id and time).
      const w = ids(s, UnitKind.Warrior).find((id) => (id + Math.floor(s.step / (90 * 20))) % 3 === 0)!;
      const i = s.entities.indexOf(w);
      sayUpTop(s, i, foe(s));
      // Patch 2: the eager one asks (a question with Yes and No); the others say so in a bubble.
      return s.events.filter((ev) => (ev.kind === 'speech' || ev.kind === 'question') && ev.speaker === w).map((ev) => ev.text)[0] ?? '';
    };
    expect(said((s) => addMob(s, Mob.Zombie, 0, s.entities.x[0]! + 8 * WU_PER_METRE, s.entities.z[0]!, 0))).toBe('Let me down to fight those zombies?');
    expect(said((s) => addMob(s, Mob.GiantRat, 0, s.entities.x[0]! + 8 * WU_PER_METRE, s.entities.z[0]!, 0))).toBe('Let me down to fight those giant rats?');
    expect(said(() => -1)).toBe("I'm not much help up here!");
  });

  it('keeps the men up top up there through a save and load', () => {
    const s = createWorld(1, { peaceful: true });
    const t = tower(s);
    const archer = addWarrior(s, 0, s.entities.x[0]!, s.entities.z[0]!);
    const [w] = ids(s, UnitKind.Worker);
    run(s, 1, [{ kind: 'enter', player: 0, units: [s.entities.id[archer]!, w!], building: t.id }]);
    runUntil(s, () => unitsOnTop(s, t.id).length === 2, 3000);
    const copy = deserializeState(serializeState(s));
    expect(hashState(copy)).toBe(hashState(s));
    expect(unitsOnTop(copy, t.id).length).toBe(2);
    run(s, 40);
    run(copy, 40);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('farms and stone (after Patch 5)', () => {
  it('never puts a farm on stone: a stone column under its footprint is a red tile, while a Barn may stand there', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Farm, h.x + 24, h.z);
    const top = s.world.topAt(x + 3, z + 3);
    s.world.editBox(x + 3, z + 3, x + 3, z + 3, top - 1, top, Mat.Stone);
    const w = footprintDims(BuildingKind.Farm, 0).w;
    expect(placementTiles(s, 0, BuildingKind.Farm, x, z)[3 * w + 3]).toBe(Blocked.Stone);
    expect(placementBlocked(s, 0, BuildingKind.Farm, x, z)).toBe(Blocked.Stone);
    expect(placementBlocked(s, 0, BuildingKind.Barn, x, z)).toBe(Blocked.None);
  });

  it('keeps a farm that already stands on stone (a game saved before the rule) through a save and load', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Farm, h.x + 24, h.z);
    const top = s.world.topAt(x + 3, z + 3);
    s.world.editBox(x + 3, z + 3, x + 3, z + 3, top - 1, top, Mat.Stone);
    const farm = placeBuilding(s, 0, BuildingKind.Farm, 0, x, z, true);
    const loaded = deserializeState(serializeState(s));
    run(loaded, 40);
    const again = loaded.buildings.get(farm.id)!;
    expect(again.kind).toBe(BuildingKind.Farm);
    expect(again.complete).toBe(true);
  });
});

describe('mineshafts on any ground (after Patch 5)', () => {
  it('lets a mineshaft stand on flat grass or dirt, not only stone, and still refuses a steep tile', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Mineshaft, h.x + 24, h.z);
    const { w, d } = footprintDims(BuildingKind.Mineshaft, 0);
    const top = s.world.topAt(x, z);
    for (const mat of [Mat.Grass, Mat.Soil]) {
      s.world.editBox(x, z, x + w - 1, z + d - 1, top - 1, top, mat);
      expect(placementBlocked(s, 0, BuildingKind.Mineshaft, x, z)).toBe(Blocked.None);
    }
    s.world.editBox(x + 1, z + 1, x + 1, z + 1, top, top + 6, Mat.Soil);
    expect(placementBlocked(s, 0, BuildingKind.Mineshaft, x, z)).toBe(Blocked.Steep);
  });
});
