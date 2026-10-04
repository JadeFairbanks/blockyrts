// Patch 3, lair alerts (Jade): when a lair appears, every player gets an
// alert naming it and where it lies, with a ping on the minimap at its spot.
import { describe, expect, it } from 'vitest';
import {
  BuildingKind,
  buildingCentre,
  createWorld,
  DAY_STEPS,
  CYCLE_STEPS,
  DebugThreat,
  isLair,
  LAIR_PING_STEPS,
  lairAlertText,
  Mob,
  mobSpec,
  step,
  STEPS_PER_SECOND,
  UnitKind,
  WU_PER_METRE,
  type SimEvent,
  type SimState,
} from '../src/index.ts';

const M = WU_PER_METRE;

function baseOf(s: SimState, p: number): [number, number] {
  return buildingCentre(s.buildings.list.find((b) => b.owner === p && b.kind === BuildingKind.MainBase)!);
}

function lairs(s: SimState): number[] {
  const e = s.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.kind[i] === UnitKind.Mob && e.hp[i]! > 0 && isLair(e.mob[i]!)) out.push(i);
  return out;
}

const lairAlerts = (events: readonly SimEvent[]): SimEvent[] => events.filter((ev) => ev.lair !== undefined);

describe('lair alerts', () => {
  it('alerts the player at dusk of night 3 with the lair, its kind and where it lies, and a spot to ping', () => {
    const s = createWorld(1);
    s.step = 3 * CYCLE_STEPS + DAY_STEPS;
    step(s);
    const [l] = lairs(s);
    expect(l).toBeDefined();
    const e = s.entities;
    const alerts = lairAlerts(s.events);
    expect(alerts).toHaveLength(1);
    const a = alerts[0]!;
    expect(a).toMatchObject({ player: 0, kind: 'alert', lair: e.mob[l!], x: e.x[l!], z: e.z[l!] });
    expect(a.text).toMatch(/^A lair has appeared: an? [a-z ]+ to the (north|south|east|west|north-east|north-west|south-east|south-west), about \d+0 m from your main base\.$/);
    expect(a.text).toContain(` ${mobSpec(e.mob[l!]!).name.toLowerCase()} to the `);
  });

  it('names the kind and the way from the main base, rounded to tens of metres', () => {
    const s = createWorld(1);
    const [hx, hz] = baseOf(s, 0);
    step(s, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Lair + 2, x: hx + 90 * M, z: hz - 90 * M }]);
    const alerts = lairAlerts(s.events);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.lair).toBe(Mob.LairNest);
    expect(alerts[0]!.text).toBe('A lair has appeared: a spider nest to the north-east, about 130 m from your main base.');
  });

  it('tells every player, saying whose land it stands by', () => {
    const s = createWorld(3, { players: 2 });
    const [hx, hz] = baseOf(s, 1);
    step(s, [{ kind: 'debugThreat', player: 1, what: DebugThreat.Lair, x: hx - 120 * M, z: hz }]);
    const alerts = lairAlerts(s.events);
    expect(alerts.map((a) => a.player)).toEqual([0, 1]);
    for (const a of alerts) expect(a.lair).toBe(Mob.LairBarrow);
    expect(alerts[1]!.text).toBe('A lair has appeared: a barrow to the west, about 120 m from your main base.');
    expect(alerts[0]!.text).toMatch(/^A lair has appeared by Player 2's land: a barrow to the [a-z-]+, about \d+0 m from your main base\.$/);
  });

  it('names only the kind when the player has no main base standing', () => {
    const s = createWorld(1);
    for (const b of s.buildings.list) if (b.kind === BuildingKind.MainBase) b.hp = 0;
    expect(lairAlertText(s, 0, Mob.LairGoblinCamp, 0, 0, 0)).toBe('A lair has appeared: a goblin camp.');
  });

  it('pings for 6 s, an editor value in the Lairs group', () => {
    expect(LAIR_PING_STEPS).toBe(6 * STEPS_PER_SECOND);
  });
});
