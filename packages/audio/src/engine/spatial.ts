// Distance falloff and stereo placement for sounds in the world. The camera
// looks down at the battlefield, so "near" is the patch of ground on screen:
// a sound inside `near` metres of the camera's ground point plays at full
// level, fades out by `far`, and pans by how far left or right it is.

export interface Listener {
  /** Camera ground point, metres. */
  x: number;
  z: number;
  /** Unit vector pointing to the right of the screen, on the ground. */
  rightX: number;
  rightZ: number;
}

export interface SpatialSettings {
  /** Full level inside this many metres. */
  near: number;
  /** Silent beyond this many metres. */
  far: number;
  /** Metres to the side at which a sound is panned fully (kept below hard left or right). */
  panWidth: number;
}

export const DEFAULT_SPATIAL: SpatialSettings = { near: 12, far: 70, panWidth: 30 };

/** Gain from 0 to 1 for a sound at (x, z). */
export function falloff(l: Listener, x: number, z: number, s: SpatialSettings = DEFAULT_SPATIAL): number {
  const d = Math.hypot(x - l.x, z - l.z);
  if (d <= s.near) return 1;
  if (d >= s.far) return 0;
  const k = 1 - (d - s.near) / (s.far - s.near);
  return k * k;
}

/** Stereo pan from -0.8 (left) to 0.8 (right). */
export function panFor(l: Listener, x: number, z: number, s: SpatialSettings = DEFAULT_SPATIAL): number {
  const side = (x - l.x) * l.rightX + (z - l.z) * l.rightZ;
  return Math.max(-0.8, Math.min(0.8, (side / s.panWidth) * 0.8));
}

/** Slider position (0 to 1) to gain, on a squared curve that sounds even. */
export function sliderToGain(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
}
