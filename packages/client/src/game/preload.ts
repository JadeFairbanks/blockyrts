// Everything a match draws, loaded behind the loading screen before it starts
// (mini patch 7.3, Jade: "loading all images for the client with a loading
// screen before the game starts"): every model the library lists, the lazy
// looks too (buildings going up, damaged and abandoned, the metal tiers of
// gear), the land's and the water's tiles, and every picture the HUD, the
// sky dial, the spell effects and the stylesheets use. Nothing is left to
// load while the game plays.
import { KIT_URLS } from '../hud/kit-icons.ts';
import { SKY_URLS } from '../hud/sky-dial.ts';
import type { ModelLibrary } from '../models/index.ts';
import { SPELL_SPRITE_URLS } from '../world/spell-fx.ts';

/** Pictures fetched at once. */
const PARALLEL_PICTURES = 16;
/**
 * With nothing settling for this long the screen stops waiting, so a stuck
 * download never holds a match (and everyone in it) for good; whatever is
 * left goes on loading behind the game, as it all did before.
 */
export const STALL_MS = 30_000;
/** How often the bar moves, milliseconds. */
const REPORT_MS = 100;

export interface LoadProgress {
  done: number;
  total: number;
}

const PICTURE = /\.(png|webp|jpe?g|gif|svg)(\?|#|$)/i;

/** The pictures the page's stylesheets use (frames, buttons, bars, the screens' art), as the build named them. */
export function styleUrls(sheets: ArrayLike<CSSStyleSheet> = document.styleSheets): string[] {
  const out = new Set<string>();
  for (const sheet of Array.from(sheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another site's sheet (the fonts) cannot be read, and holds no pictures of ours
    }
    // A rule's text holds the rules nested in it too.
    for (const rule of Array.from(rules)) {
      for (const m of rule.cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        const url = m[2]!;
        if (!url.startsWith('data:') && PICTURE.test(url)) out.add(url);
      }
    }
  }
  return [...out];
}

/** Every picture a match shows, each once. */
export function pictureUrls(): string[] {
  return [...new Set([...KIT_URLS, ...SKY_URLS, ...SPELL_SPRITE_URLS, ...styleUrls()])].filter((u) => u !== '');
}

/** Fetches and decodes a picture, so the HUD's later use of it comes from the browser's own store; a picture that fails is passed over. */
function loadPicture(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => undefined);
}

/** Runs `run` over the items, `n` at a time, counting each as it settles. */
async function pool(items: readonly string[], n: number, run: (item: string) => Promise<void>, settled: () => void): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]!;
      await run(item);
      settled();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}

/**
 * Loads every model and picture, and waits for `also` (the land's tiles),
 * calling `onProgress` as the count moves. Resolves once all have settled
 * (loaded or failed), or once nothing has settled for STALL_MS.
 */
export function loadEverything(lib: ModelLibrary | null, also: Promise<unknown>, onProgress: (p: LoadProgress) => void, pictures: readonly string[] = pictureUrls()): Promise<void> {
  let picturesDone = 0;
  let alsoDone = 0;
  const total = (lib?.progress().listed ?? 0) + pictures.length + 1;
  const done = (): number => (lib?.progress().settled ?? 0) + picturesDone + alsoDone;
  const work = Promise.all([
    lib?.all(),
    pool(pictures, PARALLEL_PICTURES, loadPicture, () => picturesDone++),
    also.catch(() => undefined).then(() => (alsoDone = 1)),
  ]);
  return new Promise<void>((resolve) => {
    let last = -1;
    let lastAt = performance.now();
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      onProgress({ done: done(), total });
      resolve();
    };
    const timer = setInterval(() => {
      const d = done();
      const now = performance.now();
      if (d !== last) {
        last = d;
        lastAt = now;
        onProgress({ done: d, total });
      } else if (now - lastAt >= STALL_MS) {
        console.warn(`loading stalled at ${d} of ${total}; starting with what is in`);
        finish();
      }
    }, REPORT_MS);
    void work.then(finish);
  });
}
