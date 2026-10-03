import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  buildingCentre,
  createWorld,
  DAY_STEPS,
  DUSK_STEPS,
  Mob,
  PickOwn,
  step,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type SimState,
} from '../src/index.ts';

/** The player's units of a kind, by entity id. */
function ids(s: SimState, kind: number): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind && e.hp[i]! > 0) out.push(e.id[i]!);
  return out;
}

function head(s: SimState, id: number) {
  const e = s.entities;
  return e.queue[e.indexOf(id)]![0];
}

describe('a targeted command pressed twice (Controls: double-tap for auto-target)', () => {
  it('A twice: the warrior goes for the nearest enemy it can see', () => {
    const s = createWorld(1, { peaceful: true });
    s.step = DAY_STEPS + DUSK_STEPS;
    const [warrior] = ids(s, UnitKind.Warrior);
    const e = s.entities;
    const w = e.indexOf(warrior!);
    step(s, [{ kind: 'debugSpawn', player: 0, mob: Mob.Zombie, x: e.x[w]! + 10 * WU_PER_METRE, z: e.z[w]! }]);
    let zombie = 0;
    for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.Zombie) zombie = e.id[i]!;
    expect(zombie).toBeGreaterThan(0);
    step(s, [{ kind: 'pickOwn', player: 0, units: [warrior!], command: PickOwn.Attack }]);
    expect(head(s, warrior!)).toEqual({ t: 'attack', id: zombie });
  });

  it('G twice: each worker takes the nearest node it can gather', () => {
    const s = createWorld(1, { peaceful: true });
    const workers = ids(s, UnitKind.Worker);
    step(s, [{ kind: 'pickOwn', player: 0, units: workers, command: PickOwn.Gather }]);
    for (const id of workers) expect(head(s, id)?.t).toBe('gather');
  });

  it('E twice: workers shelter in the nearest building with room; a melee warrior has none to garrison', () => {
    const s = createWorld(1, { peaceful: true });
    const workers = ids(s, UnitKind.Worker);
    const [warrior] = ids(s, UnitKind.Warrior);
    const house = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
    step(s, [{ kind: 'pickOwn', player: 0, units: [...workers, warrior!], command: PickOwn.Enter }]);
    for (const id of workers) expect(head(s, id)).toEqual({ t: 'enter', b: house.id, auto: 0 });
    expect(head(s, warrior!)?.t).not.toBe('enter');
    expect(s.events.some((ev) => ev.text.startsWith('No building with room for them.'))).toBe(true);
  });

  it('T twice: each worker prospects the column it stands on', () => {
    const s = createWorld(1, { peaceful: true });
    const [worker] = ids(s, UnitKind.Worker);
    const e = s.entities;
    const i = e.indexOf(worker!);
    const x = Math.floor(e.x[i]! / WU_PER_COLUMN);
    const z = Math.floor(e.z[i]! / WU_PER_COLUMN);
    step(s, [{ kind: 'pickOwn', player: 0, units: [worker!], command: PickOwn.Prospect }]);
    expect(head(s, worker!)).toEqual({ t: 'prospect', x, z });
  });
});

describe('Shift + H', () => {
  it('holds once the earlier orders are done; plain H holds at once', () => {
    const s = createWorld(1, { peaceful: true });
    const [a, b] = ids(s, UnitKind.Worker);
    const house = s.buildings.list.find((h) => h.owner === 0 && h.kind === BuildingKind.MainBase)!;
    const [cx, cz] = buildingCentre(house);
    const far = { x: cx + 30 * WU_PER_METRE, z: cz };
    step(s, [{ kind: 'move', player: 0, units: [a!, b!], ...far }]);
    step(s, [
      { kind: 'hold', player: 0, units: [a!], queued: true },
      { kind: 'hold', player: 0, units: [b!] },
    ]);
    const e = s.entities;
    expect(e.queue[e.indexOf(a!)]!.map((o) => o.t)).toEqual(['move', 'hold']);
    expect(e.queue[e.indexOf(b!)]!.map((o) => o.t)).toEqual(['hold']);
  });
});
