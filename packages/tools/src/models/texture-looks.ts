// Texture looks as drawn models of their own. A world prop can carry other
// looks as extra embedded textures on the same UV layout: Jade's Stone
// Circle trilithons hold `<id>_lunar.png` and `<id>_boneyard.png` beside
// `<id>.png`, for the circle they stand in. The converter draws only the
// textures its faces use, so each extra one becomes a model of its own,
// `<id>~<look>`: the same file with every face moved onto that texture.

/** Separates a model id from its texture look in a drawn id. */
export const LOOK_SEP = '~';

interface Texture {
  name?: string;
  width?: number;
  height?: number;
}

interface Face {
  texture?: number | null;
}

/**
 * Every texture look of a .bbmodel's JSON: an embedded texture after the
 * first, named `<id>_<look>`, the first's size, in a file whose faces all use
 * the first. Anything else is left alone.
 */
export function textureLooks(raw: unknown, id: string): Array<{ look: string; raw: unknown }> {
  const file = raw as { textures?: Texture[]; elements?: Array<{ faces?: Record<string, Face | null> }> };
  const textures = file.textures;
  if (!Array.isArray(textures) || textures.length < 2 || !Array.isArray(file.elements)) return [];
  for (const el of file.elements) {
    for (const f of Object.values(el.faces ?? {})) if (f && f.texture !== null && f.texture !== undefined && f.texture !== 0) return [];
  }
  const first = textures[0]!;
  const out: Array<{ look: string; raw: unknown }> = [];
  textures.forEach((t, k) => {
    if (k === 0) return;
    const name = (t.name ?? '').replace(/\.png$/, '');
    if (!name.startsWith(`${id}_`) || t.width !== first.width || t.height !== first.height) return;
    const look = name.slice(id.length + 1);
    if (!/^[a-z0-9_]+$/.test(look)) return;
    const copy = structuredClone(raw) as typeof file;
    for (const el of copy.elements!) for (const f of Object.values(el.faces ?? {})) if (f && f.texture === 0) f.texture = k;
    out.push({ look, raw: copy });
  });
  return out;
}
