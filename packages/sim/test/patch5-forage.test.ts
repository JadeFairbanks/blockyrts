// Patch 5 (Jade's GP-30 to GP-32 and QoL 2): wild food. The woodsman's
// Forage picks every prop marked forage (berry bushes high, mushrooms low);
// a mushroom picked comes up again within 3 m, 1 to 3.5 minutes later, so
// mushrooms wander; hunting warriors pick the berries on bushes close by,
// the bush left standing, and go home only when their bags are full.
import { describe, expect, it } from 'vitest';
import {
  addWarrior,
  BuildingKind,
  buildingCentre,
  CHUNK_SHIFT,
  createWorld,
  HUNT_HOME_PCT,
  isForage,
  MUSHROOM_SPREAD,
  OrderKind,
  PLANT_FOODS,
  PropKind,
  Res,
  step,
  STEPS_PER_SECOND,
  Troop,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Order,
  type SimState,
} from '../src/index.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;

function run(s: SimState, n: number, orders: Order[] = []): void {
  for (let k = 0; k < n; k++) step(s, k === 0 ? orders : []);
}

/** A peaceful world after a moment, and the column a few metres east of its Big House where nothing stands. */
function camp(): { s: SimState; hx: number; hz: number; gx: number; gz: number } {
  const s = createWorld(2, { peaceful: true });
  run(s, 2 * SEC);
  const home = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  const [hx, hz] = buildingCentre(home);
  for (let d = 10; d < 40; d++) {
    const gx = Math.floor((hx + d * M) / WU_PER_COLUMN);
    const gz = Math.floor(hz / WU_PER_COLUMN);
    if (propsAt(s, gx, gz, s.step).length === 0 && !s.world.builtOn?.(gx, gz)) {
      s.world.reveal(hx, hz, 40 * M);
      return { s, hx, hz, gx, gz };
    }
  }
  throw new Error('no free column');
}

function propsAt(s: SimState, gx: number, gz: number, at: number) {
  const cx = gx >> CHUNK_SHIFT;
  const cz = gz >> CHUNK_SHIFT;
  return s.world.props(cx, cz, at).filter((p) => p.lx === gx - (cx << CHUNK_SHIFT) && p.lz === gz - (cz << CHUNK_SHIFT));
}

/** Mushrooms standing within r columns of a column at a step. */
function mushroomsNear(s: SimState, gx: number, gz: number, r: number, at: number): number {
  let n = 0;
  for (let cz = (gz - r) >> CHUNK_SHIFT; cz <= (gz + r) >> CHUNK_SHIFT; cz++) {
    for (let cx = (gx - r) >> CHUNK_SHIFT; cx <= (gx + r) >> CHUNK_SHIFT; cx++) {
      for (const p of s.world.props(cx, cz, at)) {
        const dx = (cx << CHUNK_SHIFT) + p.lx - gx;
        const dz = (cz << CHUNK_SHIFT) + p.lz - gz;
        if (p.kind === PropKind.Mushroom && dx * dx + dz * dz <= r * r) n++;
      }
    }
  }
  return n;
}

function addedRecords(s: SimState): number {
  let n = 0;
  for (const list of s.world.addedProps.values()) n += list.filter((p) => p.kind === PropKind.Mushroom).length;
  return n;
}

describe('wild food (Patch 5)', () => {
  it('Forage takes every prop marked forage, and the wild foods are plant food for taming and the Barn', () => {
    for (const k of [PropKind.Mushroom, PropKind.BlackBerryBush, PropKind.RaspberryBush, PropKind.BlueberryBush]) expect(isForage(k)).toBe(true);
    for (const k of [PropKind.Hazel, PropKind.Herbs, PropKind.Pine, PropKind.FishTrout]) expect(isForage(k)).toBe(false);
    expect(PLANT_FOODS).toEqual([Res.FarmFare, Res.BlackBerries, Res.Raspberries, Res.Blueberries, Res.Mushrooms]);
  });

  it('a picked mushroom comes up again within 3 m, 1 to 3.5 minutes later, and its record moves with it', () => {
    const { s, gx, gz } = camp();
    const at = s.world.addProp(gx, gz, PropKind.Mushroom, 7, 1, s.step);
    const reach = Math.floor((MUSHROOM_SPREAD.radiusM * 20) / 9);
    const before = mushroomsNear(s, gx, gz, reach, s.step);
    expect(s.world.harvest(at.cx, at.cz, at.i, 1, s.step)).toBe(1);
    // Gone at once, and not back within the minute.
    expect(mushroomsNear(s, gx, gz, reach, s.step)).toBe(before - 1);
    expect(mushroomsNear(s, gx, gz, reach, s.step + MUSHROOM_SPREAD.minS * SEC - 1)).toBe(before - 1);
    // Back within 3.5 minutes, within 3 m.
    const later = s.step + MUSHROOM_SPREAD.maxS * SEC;
    expect(mushroomsNear(s, gx, gz, reach, later)).toBe(before);
    // Picked again and again, it wanders without piling up records.
    const records = addedRecords(s);
    let now = later;
    for (let k = 0; k < 6; k++) {
      let picked = false;
      for (let cz = (gz - 40) >> CHUNK_SHIFT; cz <= (gz + 40) >> CHUNK_SHIFT && !picked; cz++) {
        for (let cx = (gx - 40) >> CHUNK_SHIFT; cx <= (gx + 40) >> CHUNK_SHIFT && !picked; cx++) {
          const ours = s.world.props(cx, cz, now).find((p) => p.kind === PropKind.Mushroom && s.world.propRecords(cx, cz)[p.index]!.age < 0);
          if (ours) picked = s.world.harvest(cx, cz, ours.index, 1, now) === 1;
        }
      }
      expect(picked).toBe(true);
      now += MUSHROOM_SPREAD.maxS * SEC;
    }
    expect(addedRecords(s)).toBeLessThanOrEqual(records + 1);
  });

  it('a woodsman sent to a berry bush picks it with his hands up, the bush stays, and its berries grow back', () => {
    const { s, hx, hz, gx, gz } = camp();
    const at = s.world.addProp(gx, gz, PropKind.BlackBerryBush, 3, 2, s.step);
    const w = addWarrior(s, 0, hx + 6 * M, hz, Troop.Woodsman, 1, 0);
    const e = s.entities;
    run(s, 1, [{ kind: 'woods', player: 0, units: [e.id[w]!], what: 2, on: 1, cx: at.cx, cz: at.cz, index: at.i }]);
    let high = false;
    for (let k = 0; k < 40 * SEC && e.bag[w]!.length === 0; k++) {
      step(s);
      if (e.order[w] === OrderKind.ForageHigh) high = true;
    }
    expect(high).toBe(true);
    expect(e.bag[w]).toEqual([Res.BlackBerries, 2]);
    const bush = s.world.prop(at.cx, at.cz, at.i, s.step);
    expect(bush).toMatchObject({ kind: PropKind.BlackBerryBush, amount: 0 });
    expect(s.world.prop(at.cx, at.cz, at.i, s.step + 2 * 60 * SEC)!.amount).toBe(2);
  });

  it('a hunting warrior picks a berry bush close by, leaves the bush, and goes home only once its bag is full', () => {
    expect(HUNT_HOME_PCT).toBe(100);
    const { s, hx, hz, gx, gz } = camp();
    const at = s.world.addProp(gx, gz, PropKind.RaspberryBush, 5, 2, s.step);
    const w = addWarrior(s, 0, hx + 6 * M, hz + 2 * M, Troop.Close, 1, 0);
    const e = s.entities;
    run(s, 1, [{ kind: 'hunt', player: 0, units: [e.id[w]!], target: 0, auto: 1 }]);
    for (let k = 0; k < 40 * SEC && e.bag[w]!.length === 0; k++) step(s);
    expect(e.bag[w]).toEqual([Res.Raspberries, 2]);
    expect(s.world.prop(at.cx, at.cz, at.i, s.step)).toMatchObject({ kind: PropKind.RaspberryBush, amount: 0 });
    // Two bunches are far from a full bag: it hunts on rather than going home.
    run(s, 5 * SEC);
    expect(e.queue[w]![0]).toMatchObject({ t: 'hunt', auto: 1 });
    expect(e.bag[w]).toEqual([Res.Raspberries, 2]);
  });
});
