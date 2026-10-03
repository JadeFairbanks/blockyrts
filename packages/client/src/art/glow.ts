// Where a catalogue model glows: the texture rectangles of its cubes named
// glow_* (or eye_* on Jade's creatures), read from the model's .bbmodel
// source. The converter drops cube names, so the game has no glow yet; the
// art stager reads the source to light eyes, flames and crystals.
const SOURCES = {
  ...import.meta.glob<string>('../../../assets/src/models/**/*.bbmodel', { query: '?url', import: 'default' }),
  ...import.meta.glob<string>('../../../assets/base/models/**/*.bbmodel', { query: '?url', import: 'default' }),
};

interface BbFace {
  uv?: number[];
}
interface BbElement {
  name?: string;
  faces?: Record<string, BbFace>;
}
interface BbModel {
  resolution?: { width: number; height: number };
  elements?: BbElement[];
}

export interface GlowRects {
  /** The texture size the rectangles are measured in. */
  width: number;
  height: number;
  /** u0, v0, u1, v1 per face. */
  rects: Array<[number, number, number, number]>;
}

const cache = new Map<string, Promise<GlowRects | null>>();

export function glowRects(id: string): Promise<GlowRects | null> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const key = Object.keys(SOURCES).find((k) => k.endsWith(`/${id}.bbmodel`));
      const load = key ? SOURCES[key] : undefined;
      if (!load) return null;
      const url = await load();
      const bb = (await (await fetch(url)).json()) as BbModel;
      const rects: GlowRects['rects'] = [];
      for (const e of bb.elements ?? []) {
        if (!/^(glow|eye)/i.test(e.name ?? '')) continue;
        for (const f of Object.values(e.faces ?? {})) {
          const uv = f.uv;
          if (uv && uv.length === 4) rects.push([uv[0]!, uv[1]!, uv[2]!, uv[3]!]);
        }
      }
      return { width: bb.resolution?.width ?? 16, height: bb.resolution?.height ?? 16, rects };
    })();
    cache.set(id, p);
  }
  return p;
}
