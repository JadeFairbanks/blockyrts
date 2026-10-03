// Player settings (Outside the match: Settings; Controls > Camera > Settings;
// Browser requirements: cursor lock). Kept in localStorage; every access is
// wrapped so a blocked or full storage never breaks the game.
import { sanitizeBindings } from '../input/bindings.ts';

/** Graphics quality presets (technical decision 7: shadows off on low). */
export type Quality = 'low' | 'medium' | 'high';
/** How far chunks are drawn round the camera. */
export type ViewDistance = 'near' | 'medium' | 'far';

export interface Settings {
  /** Edge pan speed multiplier. */
  edgePanSpeed: number;
  /** Arrow key pan speed multiplier. */
  arrowPanSpeed: number;
  /** Zoom speed multiplier. */
  zoomSpeed: number;
  /** Edge panning on or off. */
  edgePan: boolean;
  /** Lock the cursor inside the window while playing. */
  cursorLock: boolean;
  /** Rebound hotkeys by action id (input/bindings.ts); missing ones use the defaults. */
  keys: Record<string, string>;
  /** The preset last picked; picking one sets the three below and smoothing. */
  quality: Quality;
  /** Share of the screen's pixels drawn, 0.5 to 1. */
  resolutionScale: number;
  shadows: boolean;
  viewDistance: ViewDistance;
  /** Volumes 0 to 1 (Audio: music, effects, voices). */
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
  /** The first day's hints (Onboarding). */
  hints: boolean;
  /** Tap controls for a touchscreen (patch notes 1): everything by tapping, no right click, no cursor lock or edge panning. */
  touch: boolean;
  /** Whether the first-load question about a touchscreen has been answered. */
  touchAsked: boolean;
}

/** What each quality preset sets (s): low draws less of everything, high the most. */
export const QUALITY_PRESETS: Record<Quality, { resolutionScale: number; shadows: boolean; viewDistance: ViewDistance }> = {
  low: { resolutionScale: 0.75, shadows: false, viewDistance: 'near' },
  medium: { resolutionScale: 1, shadows: true, viewDistance: 'medium' },
  high: { resolutionScale: 1, shadows: true, viewDistance: 'far' },
};

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  edgePanSpeed: 1,
  arrowPanSpeed: 1,
  zoomSpeed: 1,
  edgePan: true,
  cursorLock: true,
  keys: {},
  quality: 'medium',
  ...QUALITY_PRESETS.medium,
  musicVolume: 0.7,
  effectsVolume: 0.8,
  voiceVolume: 0.8,
  hints: true,
  touch: false,
  touchAsked: false,
};

/** Slider range for the three speed multipliers. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 3;
/** Slider range for the resolution scale. */
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1;

/** Chunk rings drawn round the camera for each view distance (the farthest ring at quarter detail). */
export const VIEW_RINGS: Record<ViewDistance, number> = { near: 5, medium: 7, far: 9 };

const STORAGE_KEY = 'survive-and-conquer.settings.v1';

function speed(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) : fallback;
}

function unit(v: unknown, fallback: number, min = 0, max = 1): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A complete, in-range settings object from whatever was stored. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  return {
    edgePanSpeed: speed(r.edgePanSpeed, d.edgePanSpeed),
    arrowPanSpeed: speed(r.arrowPanSpeed, d.arrowPanSpeed),
    zoomSpeed: speed(r.zoomSpeed, d.zoomSpeed),
    edgePan: bool(r.edgePan, d.edgePan),
    cursorLock: bool(r.cursorLock, d.cursorLock),
    keys: sanitizeBindings(r.keys),
    quality: oneOf(r.quality, ['low', 'medium', 'high'], d.quality),
    resolutionScale: unit(r.resolutionScale, d.resolutionScale, SCALE_MIN, SCALE_MAX),
    shadows: bool(r.shadows, d.shadows),
    viewDistance: oneOf(r.viewDistance, ['near', 'medium', 'far'], d.viewDistance),
    musicVolume: unit(r.musicVolume, d.musicVolume),
    effectsVolume: unit(r.effectsVolume, d.effectsVolume),
    voiceVolume: unit(r.voiceVolume, d.voiceVolume),
    hints: bool(r.hints, d.hints),
    touch: bool(r.touch, d.touch),
    touchAsked: bool(r.touchAsked, d.touchAsked),
  };
}

/** Applies a quality preset: it sets the resolution scale, shadows and view distance, which can then be changed one by one. */
export function applyQuality(s: Settings, q: Quality): void {
  s.quality = q;
  Object.assign(s, QUALITY_PRESETS[q]);
}

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

/** Listeners told when settings change (the renderer applies graphics at once). */
const listeners = new Set<(s: Settings) => void>();

export function onSettingsChange(f: (s: Settings) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: the settings last until the page closes.
  }
  for (const f of listeners) f(s);
}
