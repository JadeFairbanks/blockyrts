// The day's light from the art set's lighting sheet (Patch 5): the game's
// clock lands on the sheet's key moments, and a fog night takes the sheet's
// fog night values.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Period } from '@blockyrts/sim';
import sheet from '../../assets/src/sky/lighting.json';
import { cycleSeconds, newSkyMoment, skyAt } from '../src/world/sky-light.ts';

const hex = (c: THREE.Color): string => `#${c.getHexString()}`;

describe('the lighting sheet', () => {
  it('puts the clock on the sheet\'s day: mid-day, the end of dusk, mid-night and the end of dawn', () => {
    expect(cycleSeconds(Period.Day, 0.5)).toBe(90);
    expect(cycleSeconds(Period.Dusk, 1)).toBe(220);
    expect(cycleSeconds(Period.Night, 0.5)).toBe(310);
    expect(cycleSeconds(Period.Dawn, 1)).toBe(440);
  });

  it('gives each key moment its own values and blends between them', () => {
    const m = newSkyMoment();
    const mid = sheet.key_moments.mid_day;
    skyAt(90, 0, m);
    expect(hex(m.light)).toBe(mid.light_colour);
    expect(m.lightI).toBeCloseTo(mid.light_intensity);
    expect(hex(m.edge)).toBe(mid.sky_edge_colour);
    skyAt(310, 0, m);
    expect(hex(m.ambient)).toBe(sheet.key_moments.mid_night.ambient_colour);
    // Half way from the middle of dusk to its end.
    skyAt(210, 0, m);
    const { dusk_mid: a, dusk_end: b } = sheet.key_moments;
    expect(m.lightI).toBeCloseTo((a.light_intensity + b.light_intensity) / 2);
  });

  it('takes the fog night\'s values at mid-night when the fog is in', () => {
    const m = skyAt(310, 1, newSkyMoment());
    const fog = sheet.key_moments.fog_night;
    expect(hex(m.fog)).toBe(fog.fog_colour);
    expect(m.fogD).toBeCloseTo(fog.fog_distance);
  });
});
