// The land's pixel textures (Patch 5, VX-1 and decisions 3.7): the terrain
// tiles of the art set (packages/assets/src/textures, 16 x 16, one texel per
// model unit) on every top and side of the land, in place of flat colour and
// noise. A top takes one of its material's four tiles by its column, turned
// a quarter at a time ("top tiles may be rotated and mixed freely"); a side
// repeats its tile every four terrain units, so the tile's bands meet the
// steps; grass hangs its lip of blades over the top step of a side. Which
// tiles a material takes can depend on its band: Heartland grass is lusher
// than the Fringe's, the Barrens' stone is red.
import * as THREE from 'three';
import { Mat } from '@blockyrts/sim';
import type { ShaderPatch } from './fog-material.ts';

const URLS = import.meta.glob<string>('../../../assets/src/textures/terrain_*.png', { eager: true, query: '?no-inline', import: 'default' });
const url = (file: string): string => URLS[`../../../assets/src/textures/${file}.png`] ?? '';

/** The tile sets drawn, each four tops, a side and (grass) a lip; a set's layers start at its index times LAYERS_PER_SET. */
export const TILE_SETS = [
  'grass_heartland',
  'grass_fringe',
  'soil',
  'mud_bog',
  'sand',
  'clay',
  'stone',
  'marble',
  'rock_copper_seam',
  'rock_tin_seam',
  'rock_iron_seam',
  'rock_vein_iron',
  'rock_coal_seam',
  'deadlands_ash',
  'deadlands_volcanic',
  'barrens_ground',
  'barrens_rock',
  'gravel',
] as const;
export type TileSet = (typeof TILE_SETS)[number];
const LAYERS_PER_SET = 6;
const TILE = 16;
/** No tile: the land keeps its flat colour there. */
const NONE = 255;

/** The bands in order (sim Band): Heartland, Fringe, Deepwoods, Barrens, Deadlands. */
const BANDS = 5;

/** Each material's tile set in each band (Heartland, Fringe, Deepwoods, Barrens, Deadlands). */
export const MATERIAL_TILES: Readonly<Record<number, readonly [TileSet, TileSet, TileSet, TileSet, TileSet]>> = {
  [Mat.Grass]: ['grass_heartland', 'grass_fringe', 'grass_fringe', 'grass_fringe', 'grass_fringe'],
  [Mat.DryGrass]: ['grass_fringe', 'grass_fringe', 'grass_fringe', 'barrens_ground', 'barrens_ground'],
  [Mat.Soil]: ['soil', 'soil', 'soil', 'soil', 'soil'],
  [Mat.Mud]: ['mud_bog', 'mud_bog', 'mud_bog', 'mud_bog', 'mud_bog'],
  [Mat.Sand]: ['sand', 'sand', 'sand', 'sand', 'sand'],
  [Mat.Clay]: ['clay', 'clay', 'clay', 'clay', 'clay'],
  [Mat.Stone]: ['stone', 'stone', 'stone', 'barrens_rock', 'barrens_rock'],
  [Mat.Marble]: ['marble', 'marble', 'marble', 'marble', 'marble'],
  [Mat.CopperOre]: ['rock_copper_seam', 'rock_copper_seam', 'rock_copper_seam', 'rock_copper_seam', 'rock_copper_seam'],
  [Mat.TinOre]: ['rock_tin_seam', 'rock_tin_seam', 'rock_tin_seam', 'rock_tin_seam', 'rock_tin_seam'],
  [Mat.IronRock]: ['rock_iron_seam', 'rock_iron_seam', 'rock_iron_seam', 'rock_iron_seam', 'rock_iron_seam'],
  [Mat.VeinIron]: ['rock_vein_iron', 'rock_vein_iron', 'rock_vein_iron', 'rock_vein_iron', 'rock_vein_iron'],
  [Mat.Coal]: ['rock_coal_seam', 'rock_coal_seam', 'rock_coal_seam', 'rock_coal_seam', 'rock_coal_seam'],
  [Mat.Ash]: ['deadlands_ash', 'deadlands_ash', 'deadlands_ash', 'deadlands_ash', 'deadlands_ash'],
  [Mat.Basalt]: ['deadlands_volcanic', 'deadlands_volcanic', 'deadlands_volcanic', 'deadlands_volcanic', 'deadlands_volcanic'],
  [Mat.DeadEarth]: ['barrens_ground', 'barrens_ground', 'barrens_ground', 'barrens_ground', 'gravel'],
};

/** The files of a tile set, in layer order: four tops, the side, the lip ('' for none). */
export function setFiles(set: TileSet): string[] {
  const t = `terrain_${set}`;
  const lip = set.startsWith('grass_') ? `${t}_side_top` : '';
  return [`${t}_top_1`, `${t}_top_2`, `${t}_top_3`, `${t}_top_4`, `${t}_side`, lip];
}

/** Every file the land draws. */
export function terrainFiles(): string[] {
  return TILE_SETS.flatMap((s) => setFiles(s)).filter((f) => f !== '');
}

export interface TerrainUniforms {
  terrainTex: { value: THREE.DataArrayTexture | null };
  terrainTable: { value: THREE.DataTexture };
  /** The main bases' anchors the bands are measured from, metres (x, z), and how many. */
  terrainAnchors: { value: THREE.Vector2[] };
  terrainAnchorCount: { value: number };
  /** Where each band after the Heartland starts, metres from the nearest anchor. */
  terrainBands: { value: THREE.Vector4 };
  /** 1 once the tiles have loaded. */
  terrainOn: { value: number };
}

/** The table the shader reads a face's tiles from: material across, band down; red the first top layer, green the side, blue the lip. */
function tableTexture(): THREE.DataTexture {
  const w = 32;
  const data = new Uint8Array(w * BANDS * 4).fill(NONE);
  for (const [mat, sets] of Object.entries(MATERIAL_TILES)) {
    for (let b = 0; b < BANDS; b++) {
      const set = sets[b]!;
      const base = TILE_SETS.indexOf(set) * LAYERS_PER_SET;
      const o = (b * w + Number(mat)) * 4;
      data[o] = base;
      data[o + 1] = base + 4;
      data[o + 2] = set.startsWith('grass_') ? base + 5 : NONE;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, w, BANDS, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function terrainUniforms(): TerrainUniforms {
  return {
    terrainTex: { value: null },
    terrainTable: { value: tableTexture() },
    terrainAnchors: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) },
    terrainAnchorCount: { value: 0 },
    terrainBands: { value: new THREE.Vector4(1e9, 1e9, 1e9, 1e9) },
    terrainOn: { value: 0 },
  };
}

/** Where the bands lie: the anchors (metres) and each band's start after the Heartland (metres). */
export function setTerrainBands(u: TerrainUniforms, anchors: ReadonlyArray<{ x: number; z: number }>, bandStarts: readonly number[]): void {
  anchors.slice(0, 8).forEach((a, k) => u.terrainAnchors.value[k]!.set(a.x, a.z));
  u.terrainAnchorCount.value = Math.min(8, anchors.length);
  u.terrainBands.value.set(bandStarts[0] ?? 1e9, bandStarts[1] ?? 1e9, bandStarts[2] ?? 1e9, bandStarts[3] ?? 1e9);
}

async function pixels(file: string): Promise<ImageData | null> {
  const src = url(file);
  if (!src) return null;
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/** Loads the tiles into one texture array; the land switches to them when it is ready. */
export async function loadTerrainTextures(u: TerrainUniforms): Promise<void> {
  const layers = TILE_SETS.length * LAYERS_PER_SET;
  const data = new Uint8Array(TILE * TILE * 4 * layers);
  await Promise.all(
    TILE_SETS.flatMap((set, s) =>
      setFiles(set).map(async (file, k) => {
        if (!file) return;
        const im = await pixels(file);
        if (!im) return;
        // A lip (16 x 4) sits in the top rows of its layer; the rest stays clear.
        const o = (s * LAYERS_PER_SET + k) * TILE * TILE * 4;
        for (let y = 0; y < Math.min(TILE, im.height); y++) {
          for (let x = 0; x < TILE; x++) {
            const from = (y * im.width + (x % im.width)) * 4;
            data.set(im.data.subarray(from, from + 4), o + (y * TILE + x) * 4);
          }
        }
      }),
    ),
  );
  const tex = new THREE.DataArrayTexture(data, TILE, TILE, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  u.terrainTex.value = tex;
  u.terrainOn.value = 1;
}

/**
 * The land's shader: the tiles on top of the fog of war's patch (fogPatch
 * must run first: it declares the world position and normal read here).
 * Until the tiles load, the flat colour with its pixel noise as before.
 */
export function terrainPatch(u: TerrainUniforms): ShaderPatch {
  return (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mat;\nflat varying float vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMat = mat;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2DArray terrainTex;
uniform sampler2D terrainTable;
uniform vec2 terrainAnchors[8];
uniform float terrainAnchorCount;
uniform vec4 terrainBands;
uniform float terrainOn;
flat varying float vMat;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float d2 = 1e18;
    for (int k = 0; k < 8; k++) {
      if (float(k) >= terrainAnchorCount) break;
      vec2 v = vFowWorld.xz - terrainAnchors[k];
      d2 = min(d2, dot(v, v));
    }
    float d = sqrt(d2);
    int band = int(step(terrainBands.x, d) + step(terrainBands.y, d) + step(terrainBands.z, d) + step(terrainBands.w, d));
    vec4 row = texelFetch(terrainTable, ivec2(int(vMat + 0.5), band), 0) * 255.0;
    bool top = abs(vFowN.y) > 0.5;
    float layer = top ? row.r : row.g;
    if (terrainOn > 0.5 && layer < 254.5) {
      vec2 uv;
      if (top) {
        vec2 c = vFowWorld.xz / 0.45;
        vec2 cell = floor(c + 0.0005);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 f = fract(c + 0.0005);
        float turn = floor(fract(h * 7.31) * 4.0);
        if (turn == 1.0) f = vec2(f.y, 1.0 - f.x);
        else if (turn == 2.0) f = 1.0 - f;
        else if (turn == 3.0) f = vec2(1.0 - f.y, f.x);
        layer += floor(h * 4.0);
        uv = f;
      } else {
        float along = abs(vFowN.x) > 0.5 ? vFowWorld.z : vFowWorld.x;
        uv = vec2(fract(along / 0.45), 1.0 - fract((vFowWorld.y - 0.0005) / 0.45));
      }
      vec4 t = texture(terrainTex, vec3(uv, layer));
      if (!top && row.b < 254.5) {
        vec4 lip = texture(terrainTex, vec3(uv.x, (1.0 - fract((vFowWorld.y - 0.0005) / 0.1125)) * 0.25, row.b));
        t.rgb = mix(t.rgb, lip.rgb, lip.a);
      }
      diffuseColor.rgb = t.rgb;
    } else {
      vec3 cell = floor((vFowWorld - vFowN * 0.02) / 0.1125);
      float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      diffuseColor.rgb *= 0.9 + 0.18 * n;
    }
  }`,
      );
  };
}
