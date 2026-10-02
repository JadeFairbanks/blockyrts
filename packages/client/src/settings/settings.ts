// Player settings (Controls > Camera > Settings; Browser requirements: cursor
// lock). Kept in localStorage; every access is wrapped so a blocked or full
// storage never breaks the game.
import { sanitizeBindings } from '../input/bindings.ts';

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
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  edgePanSpeed: 1,
  arrowPanSpeed: 1,
  zoomSpeed: 1,
  edgePan: true,
  cursorLock: true,
  keys: {},
};

/** Slider range for the three speed multipliers. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 3;

const STORAGE_KEY = 'survive-and-conquer.settings.v1';

function speed(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) : fallback;
}

/** A complete, in-range settings object from whatever was stored. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    edgePanSpeed: speed(r.edgePanSpeed, d.edgePanSpeed),
    arrowPanSpeed: speed(r.arrowPanSpeed, d.arrowPanSpeed),
    zoomSpeed: speed(r.zoomSpeed, d.zoomSpeed),
    edgePan: typeof r.edgePan === 'boolean' ? r.edgePan : d.edgePan,
    cursorLock: typeof r.cursorLock === 'boolean' ? r.cursorLock : d.cursorLock,
    keys: sanitizeBindings(r.keys),
  };
}

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: the settings last until the page closes.
  }
}
