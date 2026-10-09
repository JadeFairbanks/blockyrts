// The day's light from the art set's lighting sheet (Patch 5):
// `assets/src/sky/lighting.json` gives the sun or moon's colour and strength,
// the ambient light, the shadow strength, the distance fog and the sky's edge
// for eight key moments of the day, and the game blends between them. A fog
// night swaps the night's values for the sheet's fog night. The light
// sources' colours (torch post, bonfire) come from the same sheet.
import * as THREE from 'three';
import sheet from '../../../assets/src/sky/lighting.json';
import { Period } from '@blockyrts/sim';

export interface SkyMoment {
  light: THREE.Color;
  lightI: number;
  ambient: THREE.Color;
  ambientI: number;
  shadow: number;
  fog: THREE.Color;
  /** Fraction of the normal view distance where the fog closes in. */
  fogD: number;
  /** The colour past the land's edge. */
  edge: THREE.Color;
}

interface SheetMoment {
  light_colour: string;
  light_intensity: number;
  ambient_colour: string;
  ambient_intensity: number;
  shadow_strength: number;
  fog_colour: string;
  fog_distance: number;
  sky_edge_colour: string;
}

interface SheetSource {
  colour: string;
  intensity: number;
  radius: number;
  flicker: number;
}

const moments = sheet.key_moments as Record<string, SheetMoment>;
const times = sheet.cycle.key_times_s as Record<string, number>;
const sources = sheet.light_sources as Record<string, SheetSource>;

function moment(name: string): SkyMoment {
  const m = moments[name]!;
  return {
    light: new THREE.Color(m.light_colour),
    lightI: m.light_intensity,
    ambient: new THREE.Color(m.ambient_colour),
    ambientI: m.ambient_intensity,
    shadow: m.shadow_strength,
    fog: new THREE.Color(m.fog_colour),
    fogD: m.fog_distance,
    edge: new THREE.Color(m.sky_edge_colour),
  };
}

/** Seconds into the sheet's day: day, dusk, night and dawn in turn. */
const DAY_S = sheet.cycle.day_s;
const DUSK_S = sheet.cycle.dusk_s;
const NIGHT_S = sheet.cycle.night_s;
const CYCLE_S = DAY_S + DUSK_S + NIGHT_S + sheet.cycle.dawn_s;

/** The key moments in the day's order; the day starts on the end of dawn. */
const ORDER = ['mid_day', 'dusk_start', 'dusk_mid', 'dusk_end', 'mid_night', 'dawn_start', 'dawn_mid', 'dawn_end'];
const KEYS = ORDER.map((name) => ({ t: times[name]!, m: moment(name) }));
/** The same day on a fog night: the fog night's values stand for the whole night. */
const FOG_KEYS = KEYS.map((k, i) => (ORDER[i] === 'mid_night' ? { t: k.t, m: moment('fog_night') } : k));

/** The sheet's mid-day, which the game's own light levels are matched to. */
export const SKY_MID_DAY: Readonly<SkyMoment> = moment('mid_day');

/** Where a moment of the game's clock falls in the sheet's day, seconds. */
export function cycleSeconds(period: number, into: number): number {
  const f = Math.min(1, Math.max(0, into));
  switch (period) {
    case Period.Day:
      return f * DAY_S;
    case Period.Dusk:
      return DAY_S + f * DUSK_S;
    case Period.Night:
      return DAY_S + DUSK_S + f * NIGHT_S;
    default:
      return DAY_S + DUSK_S + NIGHT_S + f * (CYCLE_S - DAY_S - DUSK_S - NIGHT_S);
  }
}

function blendInto(out: SkyMoment, a: SkyMoment, b: SkyMoment, f: number): SkyMoment {
  out.light.copy(a.light).lerp(b.light, f);
  out.lightI = a.lightI + (b.lightI - a.lightI) * f;
  out.ambient.copy(a.ambient).lerp(b.ambient, f);
  out.ambientI = a.ambientI + (b.ambientI - a.ambientI) * f;
  out.shadow = a.shadow + (b.shadow - a.shadow) * f;
  out.fog.copy(a.fog).lerp(b.fog, f);
  out.fogD = a.fogD + (b.fogD - a.fogD) * f;
  out.edge.copy(a.edge).lerp(b.edge, f);
  return out;
}

function at(keys: ReadonlyArray<{ t: number; m: SkyMoment }>, t: number, out: SkyMoment): SkyMoment {
  const s = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  // From the end of dawn (the day's start, and the cycle's end) to mid-day, and so on round.
  for (let i = 0; i < keys.length; i++) {
    const b = keys[i]!;
    const a = keys[(i + keys.length - 1) % keys.length]!;
    const t0 = i === 0 ? a.t - CYCLE_S : a.t;
    if (s <= b.t) return blendInto(out, a.m, b.m, b.t > t0 ? (s - t0) / (b.t - t0) : 1);
  }
  const last = keys[keys.length - 1]!;
  return blendInto(out, last.m, last.m, 0);
}

export function newSkyMoment(): SkyMoment {
  return moment('mid_day');
}

const FOGGED = newSkyMoment();

/** The sheet's light at a moment of its day, blended towards the fog night's by fog (0 to 1). */
export function skyAt(t: number, fog: number, out: SkyMoment): SkyMoment {
  at(KEYS, t, out);
  if (fog > 0.001) blendInto(out, out, at(FOG_KEYS, t, FOGGED), fog);
  return out;
}

/** A light source's colour, how far it reaches and how much it flickers, from the sheet. */
export function lightSource(name: 'torch_post' | 'campfire' | 'brazier' | 'lantern'): { colour: THREE.Color; radius: number; intensity: number; flicker: number } {
  const s = sources[name]!;
  return { colour: new THREE.Color(s.colour), radius: s.radius, intensity: s.intensity, flicker: s.flicker };
}

/** On a fog night the lights make small, soft orange halos (the sheet's fog night). */
export const FOG_HALO = new THREE.Color('#ffb070');
