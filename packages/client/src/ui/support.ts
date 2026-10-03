// Browsers (Outside the match): the latest two versions of Chrome, Edge,
// Firefox and Safari on desktop computers; phones and tablets are not
// supported. The game checks the features it needs (technical decision:
// WebGL2, module workers, CompressionStream, pointer lock, full screen)
// rather than browser names, and says plainly what is missing.

export interface SupportFacts {
  webgl2: boolean;
  compression: boolean;
  pointerLock: boolean;
  fullscreen: boolean;
  /** A touch screen with no fine pointer: a phone or a tablet. */
  touchOnly: boolean;
}

/** What this browser has. */
export function supportFacts(): SupportFacts {
  let webgl2 = false;
  try {
    webgl2 = document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    webgl2 = false;
  }
  const g = globalThis as Record<string, unknown>;
  return {
    webgl2,
    compression: typeof g.CompressionStream === 'function' && typeof g.DecompressionStream === 'function',
    pointerLock: 'requestPointerLock' in document.body,
    fullscreen: typeof document.documentElement.requestFullscreen === 'function',
    touchOnly: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches,
  };
}

/** The problems to show on the main menu, most serious first; empty when all is well. */
export function supportProblems(f: SupportFacts): string[] {
  const out: string[] = [];
  if (f.touchOnly) out.push('Phones and tablets are not supported: the game needs a mouse and a keyboard.');
  if (!f.webgl2) out.push('This browser cannot draw the game (it has no WebGL2). Use the latest Chrome, Edge, Firefox or Safari on a desktop computer.');
  if (!f.compression) out.push('This browser cannot read or write saved games. Update it to the latest version.');
  if (!f.pointerLock) out.push('This browser cannot keep the cursor in the window, so edge panning may not reach a second screen.');
  if (!f.fullscreen) out.push('This browser has no full screen mode.');
  return out;
}
