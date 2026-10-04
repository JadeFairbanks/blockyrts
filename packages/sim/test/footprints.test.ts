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
  meleeOf,
  Mob,
  onTop,
  PERSON,
  PickOwn,
  placeBuilding,
  placementBlocked,
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
    b.level = 10;
    refitBuilding(s, b);
    // The Citadel: ring walls, corner towers and a shut gate close the whole footprint.
    expect(walkable()).toBe(0);
    expect(footprintDims(BuildingKind.MainBase, 0, 10).cells.length).toBe(14 * 14);
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

  it('grows a kitchen round where it was placed once its upgrade is paid for, and gives the room back on a cancel', () => {
    const s = createWorld(1, { peaceful: true });
    const h = bigHouse(s);
    const [x, z] = spotNear(s, BuildingKind.Cooking, h.x + 24, h.z + 24);
    const b = placeBuilding(s, 0, BuildingKind.Cooking, 0, x, z, true);
    expect(footprintRect(b)).toEqual([x, z, x + 1, z + 1]);
    expect(growthBlocked(s, b, 2)).toBe(Blocked.None);
    b.upgrading = 2;
    refitBuilding(s, b);
    // Table 4: the cook hut is 6 columns square, centred on the campfire's spot.
    expect(footprintRect(b)).toEqual([x - 2, z - 2, x + 3, z + 3]);
    expect(s.buildings.footprintAt(x - 2, z - 2)).toBe(b.id);
    b.upgrading = 0;
    refitBuilding(s, b);
    expect(s.buildings.footprintAt(x - 2, z - 2)).toBe(0);
    // A torch post where the hut would grow is in the way.
    placeBuilding(s, 0, BuildingKind.TorchPost, 0, x + 3, z, true);
    expect(growthBlocked(s, b, 2)).not.toBe(Blocked.None);
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
    // The deck is 146 units (4.1 m) up; each stands on a corner of his own.
    for (const i of up) expect(e.y[i]).toBe(t.y * WU_PER_TERRAIN_UNIT + 146 * WU_PER_MODEL_UNIT);
    expect(new Set(up.map((i) => `${e.x[i]},${e.z[i]}`)).size).toBe(4);
    run(s, 600);
    // The fifth found it full: a tower has no shelter below.
    expect(unitsOnTop(s, t.id).length).toBe(4);
    expect(s.entities.inside.filter((v) => v === t.id).length).toBe(4);
  });

  it('takes workers up a level 3 main base first, and shelters them inside once its top is full or when sent home', () => {
    const s = createWorld(1, { peaceful: true, playerUnits: 4 });
    const b = bigHouse(s);
    b.level = 3;
    refitBuilding(s, b);
    const workers = ids(s, UnitKind.Worker);
    run(s, 1, [{ kind: 'enter', player: 0, units: workers, building: b.id }]);
    runUntil(s, () => workers.every((id) => s.entities.inside[s.entities.indexOf(id)] === b.id), 3000);
    const e = s.entities;
    for (const id of workers) {
      const i = e.indexOf(id);
      expect(onTop(s, i)).toBe(true);
      expect(e.queue[i]![0]).toEqual({ t: 'enter', b: b.id, auto: ENTER_TOP });
    }
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
