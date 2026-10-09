// The land's pixel textures (Patch 5, VX-1 and decisions 3.7): the terrain
// tiles of the art set (packages/assets/src/textures, 16 x 16, one texel per
// model unit) on every top and side of the land, in place of flat colour and
// noise. A top takes one of its material's four tiles by its column, turned
// a quarter at a time ("top tiles may be rotated and mixed freely"); a side
// repeats its tile every four terrain units, so the tile's bands meet the
// steps; grass hangs its lip of blades over the top step of a side. Which
// tiles a material takes can depend on its band: Heartland grass is lusher
// than the Fringe's, the Deepwoods' floor is leaf litter, the Barrens' stone
// is red. The Deadlands' volcanic rock glows along its cracks, and the water
// takes the art set's animated tiles: shallow, deep (where units cannot wade)
// and bog, with foam along the shore. The buildings wear the ground round
// them (ground-marks.ts): trodden paths, a Farm's tilled field, and the
// ground the Big House and each building with walk space stands on.
import * as THREE from 'three';
import { Mat } from '@blockyrts/sim';
import type { ShaderPatch } from './fog-material.ts';
import { Mark, MARK_COLUMNS, markUniforms, type MarkUniforms } from './ground-marks.ts';
import { COLUMN_M } from './mesher.ts';

const URLS = import.meta.glob<string>('../../../assets/src/textures/*.png', { eager: true, query: '?no-inline', import: 'default' });
const url = (file: string): string => URLS[`../../../assets/src/textures/${file}.png`] ?? '';

/** The tile sets drawn, each four tops, a side and (grass) a lip; a set's layers start at its index times LAYERS_PER_SET. */
export const TILE_SETS = [
  'grass_heartland',
  'grass_fringe',
  'forest_floor',
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
  // The ground marks' tiles, drawn by the column (ground-marks.ts), not by material.
  'path',
  'soil_tilled',
  'soil_tilled_wet',
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
  [Mat.Grass]: ['grass_heartland', 'grass_fringe', 'forest_floor', 'grass_fringe', 'grass_fringe'],
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

/** Grass and the forest floor hang a lip over the top step of a side. */
function hasLip(set: TileSet): boolean {
  return set.startsWith('grass_') || set === 'forest_floor';
}

/** The files of a tile set, in layer order: four tops, the side, the lip ('' for none). */
export function setFiles(set: TileSet): string[] {
  const t = `terrain_${set}`;
  const lip = hasLip(set) ? `${t}_side_top` : '';
  return [`${t}_top_1`, `${t}_top_2`, `${t}_top_3`, `${t}_top_4`, `${t}_side`, lip];
}

/** Every file the land draws. */
export function terrainFiles(): string[] {
  return TILE_SETS.flatMap((s) => setFiles(s)).filter((f) => f !== '');
}

export interface TerrainUniforms extends MarkUniforms {
  terrainTex: { value: THREE.DataArrayTexture | null };
  terrainTable: { value: THREE.DataTexture };
  /** The main bases' anchors the bands are measured from, metres (x, z), and how many. */
  terrainAnchors: { value: THREE.Vector2[] };
  terrainAnchorCount: { value: number };
  /** Where each band after the Heartland starts, metres from the nearest anchor. */
  terrainBands: { value: THREE.Vector4 };
  /** 1 once the tiles have loaded. */
  terrainOn: { value: number };
  /** The volcanic rock's crack masks (the four tops and the side), and the time for their glow, seconds. */
  terrainGlow: { value: THREE.DataArrayTexture | null };
  terrainTime: { value: number };
  /** 0 by day to 1 at night: the cracks glow faintly by day and read at night. */
  terrainNight: { value: number };
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
      data[o + 2] = hasLip(set) ? base + 5 : NONE;
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
    terrainGlow: { value: null },
    terrainTime: { value: 0 },
    terrainNight: { value: 0 },
    ...markUniforms(),
  };
}

/** The first layer of a ground mark's tile set. */
const markBase = (set: TileSet): number => TILE_SETS.indexOf(set) * LAYERS_PER_SET;
/** Loose ground a path can wear: grass, dry grass, soil, mud, sand, clay, ash and dead earth (not rock, ore or marble). */
const LOOSE = [Mat.Grass, Mat.DryGrass, Mat.Soil, Mat.Mud, Mat.Sand, Mat.Clay, Mat.Ash, Mat.DeadEarth];

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
  const tex = arrayTexture(data, layers);
  u.terrainGlow.value = await stripTexture('deadlands_volcanic_glow', 5).catch(() => null);
  u.terrainTex.value = tex;
  u.terrainOn.value = 1;
}

/** Copies a strip of frames side by side (16 px wide each) into a texture array's layers from `first`, each frame in the top rows of its layer. */
async function fillStrip(file: string, frames: number, frameH: number, data: Uint8Array, first: number): Promise<void> {
  const im = await pixels(file);
  if (!im) throw new Error(`no ${file}`);
  for (let f = 0; f < frames; f++) {
    const o = (first + f) * TILE * TILE * 4;
    for (let y = 0; y < Math.min(frameH, im.height); y++) {
      for (let x = 0; x < TILE; x++) {
        const from = (y * im.width + f * TILE + x) * 4;
        data.set(im.data.subarray(from, from + 4), o + (y * TILE + x) * 4);
      }
    }
  }
}

async function stripTexture(file: string, frames: number): Promise<THREE.DataArrayTexture> {
  const data = new Uint8Array(TILE * TILE * 4 * frames);
  await fillStrip(file, frames, TILE, data, 0);
  return arrayTexture(data, frames);
}

function arrayTexture(data: Uint8Array, layers: number): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, TILE, TILE, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
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
uniform highp sampler2DArray terrainGlow;
uniform float terrainTime;
uniform float terrainNight;
uniform sampler2D terrainMarks;
uniform vec2 terrainMarkOrigin;
flat varying float vMat;
float terrainCrack = 0.0;
float groundMark(vec2 cell) {
  ivec2 m = ivec2(cell - terrainMarkOrigin);
  if (m.x < 0 || m.y < 0 || m.x >= ${MARK_COLUMNS} || m.y >= ${MARK_COLUMNS}) return 0.0;
  return floor(texelFetch(terrainMarks, m, 0).r * 255.0 + 0.5);
}
// Ground a path's grassy edge faces: no path or field on it.
bool pathOpen(vec2 cell) {
  float m = groundMark(cell);
  return m < ${Mark.Path - 0.5} || m > ${Mark.TilledWet + 0.5};
}`,
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
    // The material a top is drawn as and its set's first layer: a building's ground (ground-marks.ts) may differ from the column's own.
    float drawMat = vMat;
    float base = row.r;
    if (terrainOn > 0.5 && layer < 254.5) {
      vec2 uv;
      if (top) {
        vec2 c = vFowWorld.xz / ${COLUMN_M};
        vec2 cell = floor(c + 0.0005);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 f = fract(c + 0.0005);
        float turn = floor(fract(h * 7.31) * 4.0);
        int m = int(vMat + 0.5);
        bool loose = ${LOOSE.map((m) => `m == ${m}`).join(' || ')};
        float mark = groundMark(cell);
        if (mark > ${Mark.Ground - 0.5}) {
          // A building's ground: its material's tiles in this band, on whatever the column is.
          vec4 g = texelFetch(terrainTable, ivec2(int(mark - ${Mark.Ground}.0 + 0.5), band), 0) * 255.0;
          if (g.r < 254.5) {
            drawMat = mark - ${Mark.Ground}.0;
            base = g.r;
          }
          layer = base + floor(h * 4.0);
        } else if (loose && mark > ${Mark.Path - 0.5} && mark < ${Mark.Path + 0.5}) {
          // A path: plain inside; at its edge one of the tiles with a grassy edge along row 0, turned to face the unmarked ground (0 -z, 1 +x, 2 +z, 3 -x).
          layer = ${markBase('path')}.0;
          float edge = pathOpen(cell + vec2(0.0, -1.0)) ? 0.0 : pathOpen(cell + vec2(1.0, 0.0)) ? 1.0 : pathOpen(cell + vec2(0.0, 1.0)) ? 2.0 : pathOpen(cell + vec2(-1.0, 0.0)) ? 3.0 : -1.0;
          if (edge >= 0.0) {
            layer += 1.0 + floor(h * 3.0);
            turn = edge;
          }
        } else if (mark > ${Mark.Path + 0.5} && mark < ${Mark.TilledWet + 0.5}) {
          // A field, on whatever ground (a Farm is always dirt): its furrows run along x, so it turns only half way round.
          layer = (mark > ${Mark.TilledWet - 0.5} ? ${markBase('soil_tilled_wet')}.0 : ${markBase('soil_tilled')}.0) + floor(h * 4.0);
          turn = turn >= 2.0 ? 2.0 : 0.0;
        } else layer += floor(h * 4.0);
        if (turn == 1.0) f = vec2(f.y, 1.0 - f.x);
        else if (turn == 2.0) f = 1.0 - f;
        else if (turn == 3.0) f = vec2(1.0 - f.y, f.x);
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
      // The volcanic rock's cracks glow (the mask's crack pixels).
      if (abs(drawMat - ${Mat.Basalt}.0) < 0.5) terrainCrack = texture(terrainGlow, vec3(uv, top ? layer - base : 4.0)).a;
    } else {
      vec3 cell = floor((vFowWorld - vFowN * 0.02) / 0.1125);
      float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      diffuseColor.rgb *= 0.9 + 0.18 * n;
    }
  }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += terrainCrack * vec3(1.0, 0.38, 0.09) * (0.1 + 0.4 * terrainNight) * (0.8 + 0.2 * sin(terrainTime * 1.7 + vFowWorld.x * 0.9 + vFowWorld.z * 0.6));`,
      );
  };
}

/** The water tiles (8 frames each, in WaterKind order) and the shore foam's 8 frames after them. */
const WATER_FILES = ['water_shallow_anim', 'water_deep_anim', 'water_stream_anim', 'water_bog_anim'] as const;
const WATER_FRAMES = 8;
const FOAM_FIRST = WATER_FILES.length * WATER_FRAMES;

export interface WaterUniforms {
  waterTex: { value: THREE.DataArrayTexture | null };
  waterOn: { value: number };
  /** Seconds, for the frames (the art set: about 6 a second). */
  waterTime: { value: number };
}

export function waterUniforms(): WaterUniforms {
  return { waterTex: { value: null }, waterOn: { value: 0 }, waterTime: { value: 0 } };
}

/** Loads the water's frames into one texture array; the water switches to them when it is ready. */
export async function loadWaterTextures(u: WaterUniforms): Promise<void> {
  const layers = FOAM_FIRST + WATER_FRAMES;
  const data = new Uint8Array(TILE * TILE * 4 * layers);
  await Promise.all([...WATER_FILES.map((file, k) => fillStrip(file, WATER_FRAMES, TILE, data, k * WATER_FRAMES)), fillStrip('water_edge_foam', WATER_FRAMES, 4, data, FOAM_FIRST)]);
  u.waterTex.value = arrayTexture(data, layers);
  u.waterOn.value = 1;
}

/**
 * The water's shader, on top of the fog of war's patch: each surface its
 * kind's tile, a column a tile, playing its frames; shallow water about 60%
 * see-through and deep water nearly solid (the art set: "Deep and shallow
 * water must look different at a glance, because the difference decides
 * where units can walk"); the shore foam in its strips. The flat blue as
 * before until the tiles load.
 */
export function waterPatch(u: WaterUniforms): ShaderPatch {
  return (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mat;\nflat varying float vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMat = mat;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2DArray waterTex;
uniform float waterOn;
uniform float waterTime;
flat varying float vMat;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if (waterOn > 0.5) {
    float kind = vMat > 254.5 ? 0.0 : vMat;
    float frame = mod(floor(waterTime * 6.0), ${WATER_FRAMES}.0);
    if (kind > 4.5) {
      float across = kind < 5.5 ? fract(vFowWorld.x / ${COLUMN_M / 4}) : fract(vFowWorld.z / ${COLUMN_M / 4});
      float along = kind < 5.5 ? vFowWorld.z : vFowWorld.x;
      vec4 t = texture(waterTex, vec3(fract(along / ${COLUMN_M}), across * 0.25, ${FOAM_FIRST}.0 + frame));
      diffuseColor = vec4(t.rgb, t.a * 0.9);
    } else if (kind > 3.5) {
      float along = abs(vFowN.x) > 0.5 ? vFowWorld.z : vFowWorld.x;
      vec4 t = texture(waterTex, vec3(fract(along / ${COLUMN_M}), fract(vFowWorld.y / ${COLUMN_M}), frame));
      diffuseColor = vec4(t.rgb, 0.8);
    } else {
      vec4 t = texture(waterTex, vec3(fract(vFowWorld.xz / ${COLUMN_M}), kind * ${WATER_FRAMES}.0 + frame));
      float a = kind == 1.0 ? 0.93 : kind == 3.0 ? 0.88 : 0.62;
      diffuseColor = vec4(t.rgb, t.a * a);
    }
  }`,
      );
  };
}
