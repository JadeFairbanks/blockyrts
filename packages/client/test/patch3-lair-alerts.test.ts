// Patch 3, lair alerts (Jade): every lair's red dot on every player's
// minimap from the moment it appears, explored land or not, and a red ping
// with the map ping's sound when one appears.
import { describe, expect, it } from 'vitest';
import { SFX } from '@blockyrts/audio';
import { BuildingKind, buildingCentre, createWorld, DebugThreat, Mob, step, WU_PER_METRE } from '@blockyrts/sim';
import { eventCue } from '../src/audio/sound-map.ts';
import { threatMarks } from '../src/minimap/marks.ts';
import { PINGS } from '../src/minimap/minimap.ts';
import { boundsHolding } from '../src/minimap/transform.ts';

const M = WU_PER_METRE;

describe('lairs on the minimap', () => {
  it('marks a lair from the moment it appears, though nobody has seen it, for every player', () => {
    const s = createWorld(3, { players: 2 });
    const [hx, hz] = buildingCentre(s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!);
    // Far out in land nobody has explored.
    step(s, [{ kind: 'debugThreat', player: 0, what: DebugThreat.Lair + 1, x: hx + 400 * M, z: hz }]);
    const e = s.entities;
    let lair = -1;
    for (let i = 0; i < e.count; i++) if (e.mob[i] === Mob.LairCaveMouth && e.hp[i]! > 0) lair = i;
    expect(lair).toBeGreaterThanOrEqual(0);
    expect(e.picked[lair]).toBe(0);
    for (const p of [0, 1]) expect(threatMarks(s, p)).toContainEqual({ mob: Mob.LairCaveMouth, x: e.x[lair], z: e.z[lair], war: false });
    // Once broken, its dot goes.
    e.hp[lair] = 0;
    expect(threatMarks(s, 0).some((m) => m.mob === Mob.LairCaveMouth)).toBe(false);
  });

  it('grows the map to hold a mark out past the explored land, with room round it', () => {
    const land = { minX: -100, minZ: -80, maxX: 100, maxZ: 80 };
    expect(boundsHolding(land, [], 10)).toEqual(land);
    expect(boundsHolding(land, [{ x: 0, z: 0 }], 10)).toEqual(land);
    expect(boundsHolding(land, [{ x: 300, z: -200 }, { x: -50, z: 120 }], 10)).toEqual({ minX: -100, minZ: -210, maxX: 310, maxZ: 130 });
  });

  it('pings a new lair in red for 6 s, longer than an urgent message, with the map ping', () => {
    expect(PINGS.lair.ms).toBe(6000);
    expect(PINGS.urgent.ms).toBe(4000);
    expect(PINGS.lair.rgb).toBe('224, 48, 42');
    const cue = eventCue({ kind: 'alert', text: 'A lair has appeared: a cave mouth to the east, about 400 m from your main base.', lair: Mob.LairCaveMouth });
    expect(cue).toEqual({ sound: 'ping', voice: null });
    expect(SFX.some((d) => d.id === 'ping')).toBe(true);
    // Other alerts keep the urgent chime.
    expect(eventCue({ kind: 'alert', text: 'The barrow is stirring: its sleepers are awake.' }).sound).toBe('alert_urgent');
  });
});
