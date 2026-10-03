// Freezes catalogue models in one frame of one clip as plain meshes, for the
// art stager. The game draws models instanced, with bone matrices in a
// texture; a still picture wants ordinary meshes instead, so ambient
// occlusion and shadows see the posed shape. The pose maths is the same as
// InstancedModel.commit and boneWorld (models/instanced-model.ts), and items
// hang from slot bones the way the game's AttachPool hangs them.
import * as THREE from 'three';
import { BAKED_STRIDE, type ModelData, type ModelLibrary } from '../models/library.ts';
import { TEAM_KEY_CHROMA_TOLERANCE, TEAM_KEY_MIN_BLUE, TEAM_KEY_RGB } from '../models/instanced-model.ts';
import { glowRects } from './glow.ts';

/** The skin matrices of one frame: bone world times inverse rest world, blended between baked frames. */
export function frameMatrices(model: ModelData, clipName: string | null, time: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const clip = clipName ? model.clips.get(clipName) : undefined;
  if (!clip) {
    for (let b = 0; b < model.boneCount; b++) out.push(new THREE.Matrix4());
    return out;
  }
  let t = time;
  if (clip.loop && clip.length > 0) t = ((t % clip.length) + clip.length) % clip.length;
  else t = Math.min(Math.max(t, 0), clip.length);
  const f = clip.length > 0 ? (t / clip.length) * (clip.frames - 1) : 0;
  const f0 = Math.min(Math.floor(f), clip.frames - 1);
  const f1 = Math.min(f0 + 1, clip.frames - 1);
  const alpha = f - f0;
  const a = clip.data;
  for (let b = 0; b < model.boneCount; b++) {
    const pa = f0 * model.boneCount * BAKED_STRIDE + b * BAKED_STRIDE;
    const pb = f1 * model.boneCount * BAKED_STRIDE + b * BAKED_STRIDE;
    const m = (k: number): number => (a[pa + k] ?? 0) + ((a[pb + k] ?? 0) - (a[pa + k] ?? 0)) * alpha;
    out.push(new THREE.Matrix4().set(m(0), m(3), m(6), m(9), m(1), m(4), m(7), m(10), m(2), m(5), m(8), m(11), 0, 0, 0, 1));
  }
  return out;
}

/** Bone indices named here and every bone below them. */
function boneSet(model: ModelData, names: readonly string[]): Set<number> {
  const out = new Set<number>();
  const parents = model.sidecar.bones.map((b) => b.parent);
  model.boneNames.forEach((name, i) => {
    let b = i;
    while (b >= 0) {
      if (names.includes(model.boneNames[b] ?? '')) {
        out.add(i);
        break;
      }
      b = parents[b] ?? -1;
    }
  });
  return out;
}

export interface GeometryOptions {
  /** Equipment parts to show (the body always shows). */
  parts?: readonly string[];
  /** Bones (and what hangs below them) to leave out: a torch's "snuffed" flame, a campfire's "cold" logs. */
  hideBones?: readonly string[];
}

/**
 * The model's geometry posed by `mats` (one skin matrix per bone of `rig`).
 * A worn shell (armour) shares the wearer's bone names, so `rig` is the
 * wearer and each of the shell's bones takes the wearer's bone of that name.
 */
function skinned(model: ModelData, mats: readonly THREE.Matrix4[], rig: ModelData, opts: GeometryOptions): THREE.BufferGeometry {
  const src = model.geometry;
  const pos = src.getAttribute('position');
  const nor = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const bone = src.getAttribute('bone');
  const part = src.getAttribute('part');
  const toRig = model.boneNames.map((name, i) => (rig === model ? i : rig.boneNames.indexOf(name)));
  const normalMats = mats.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  const shown = new Set<number>([0]);
  model.partNames.forEach((name, k) => {
    if (opts.parts?.includes(name)) shown.add(k + 1);
  });
  const hidden = boneSet(model, opts.hideBones ?? []);
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const q = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const identity = new THREE.Matrix4();
  const identity3 = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    const b = toRig[Math.round(bone ? bone.getX(i) : 0)] ?? -1;
    v.fromBufferAttribute(pos, i).applyMatrix4(mats[b] ?? identity);
    p.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(nor, i).applyMatrix3(normalMats[b] ?? identity3).normalize();
    q.set([v.x, v.y, v.z], i * 3);
  }
  const index = src.index;
  const keep: number[] = [];
  const visible = (i: number): boolean => shown.has(Math.round(part ? part.getX(i) : 0)) && !hidden.has(Math.round(bone ? bone.getX(i) : 0));
  const count = index ? index.count : n;
  const at = (t: number): number => (index ? index.getX(t) : t);
  for (let t = 0; t < count; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    if (visible(a) && visible(b) && visible(c)) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(q, 3));
  if (uv) g.setAttribute('uv', uv);
  g.setIndex(keep);
  return g;
}

function imageCanvas(texture: THREE.Texture): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData } {
  const img = texture.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

function canvasTexture(canvas: HTMLCanvasElement, like: THREE.Texture): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = like.flipY;
  t.wrapS = like.wrapS;
  t.wrapT = like.wrapT;
  return t;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** The texture with its placeholder team blue recoloured the way the game's shader does it. */
function teamTexture(model: ModelData, team: THREE.Color): THREE.Texture {
  const { canvas, ctx, data } = imageCanvas(model.texture);
  const [kr, kg, kb] = TEAM_KEY_RGB;
  const keyLuma = 0.2126 * toLinear(kr / 255) + 0.7152 * toLinear(kg / 255) + 0.0722 * toLinear(kb / 255);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    if (b < r || b < g || b < TEAM_KEY_MIN_BLUE) continue;
    if (Math.abs(r / b - kr / kb) > TEAM_KEY_CHROMA_TOLERANCE || Math.abs(g / b - kg / kb) > TEAM_KEY_CHROMA_TOLERANCE) continue;
    const bright = (0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255)) / keyLuma;
    d[i] = Math.round(toSrgb(Math.min(1, team.r * bright)) * 255);
    d[i + 1] = Math.round(toSrgb(Math.min(1, team.g * bright)) * 255);
    d[i + 2] = Math.round(toSrgb(Math.min(1, team.b * bright)) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return canvasTexture(canvas, model.texture);
}

/** An emissive map holding only the texels of the model's glow_* and eye_* cubes (eyes, flames, embers, crystals). */
async function glowTexture(model: ModelData): Promise<THREE.Texture | null> {
  const found = await glowRects(model.id);
  if (!found || found.rects.length === 0) return null;
  const { canvas, ctx, data } = imageCanvas(model.texture);
  const sx = canvas.width / found.width;
  const sy = canvas.height / found.height;
  const keep = new Uint8Array(canvas.width * canvas.height);
  for (const [u0, v0, u1, v1] of found.rects) {
    const x0 = Math.floor(Math.min(u0, u1) * sx);
    const x1 = Math.ceil(Math.max(u0, u1) * sx);
    const y0 = Math.floor(Math.min(v0, v1) * sy);
    const y1 = Math.ceil(Math.max(v0, v1) * sy);
    for (let y = Math.max(0, y0); y < Math.min(canvas.height, Math.max(y1, y0 + 1)); y++)
      for (let x = Math.max(0, x0); x < Math.min(canvas.width, Math.max(x1, x0 + 1)); x++) keep[y * canvas.width + x] = 1;
  }
  const d = data.data;
  for (let i = 0; i < keep.length; i++) {
    if (keep[i]) continue;
    d[i * 4] = 0;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvasTexture(canvas, model.texture);
}

const teamCache = new Map<string, THREE.Texture>();
const glowCache = new Map<string, Promise<THREE.Texture | null>>();

export interface Look {
  team?: THREE.Color | null;
  /** Light the model's glow_* and eye_* cubes, this bright (0 = no glow). */
  glow?: number;
  /** Multiplies the texture (darker for figures in shadow, warmer for firelit ones). */
  tint?: THREE.Color | undefined;
}

async function material(model: ModelData, look: Look): Promise<THREE.MeshStandardMaterial> {
  let map = model.texture;
  if (look.team) {
    const key = `${model.id}|${look.team.getHexString()}`;
    if (!teamCache.has(key)) teamCache.set(key, teamTexture(model, look.team));
    map = teamCache.get(key) ?? map;
  }
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, alphaTest: 0.5 });
  if (look.tint) mat.color.copy(look.tint);
  if (look.glow && look.glow > 0) {
    if (!glowCache.has(model.id)) glowCache.set(model.id, glowTexture(model));
    const emissive = await glowCache.get(model.id)!;
    if (emissive) {
      mat.emissiveMap = emissive;
      mat.emissive = new THREE.Color(1, 1, 1);
      mat.emissiveIntensity = look.glow;
    }
  }
  return mat;
}

/** What a figure holds and wears. */
export interface FigureSpec extends Look, GeometryOptions {
  body: string;
  clip?: string | null;
  time?: number;
  /** Catalogue items hung at slot bones: [item id, slot bone, bones of the item to hide]. */
  hold?: ReadonlyArray<readonly [string, string, ...string[]]>;
  /** Rig shells (armour_*) that follow the body's bones. */
  wear?: readonly string[];
  scale?: number;
}

/** Glow for items that burn or shine when a figure holds them. */
const ITEM_GLOW: Record<string, number> = { torch_hand: 4, wand_master_mage: 3, wand_grand_magician: 3 };

/**
 * A posed figure: the body in its clip frame, its parts, its worn shells and
 * held items, placed at x, y, z (metres) facing `heading` (radians, 0 faces -Z,
 * as in the game). Missing models are skipped with a console warning.
 */
export async function figure(lib: ModelLibrary, spec: FigureSpec, x: number, y: number, z: number, heading: number): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = heading;
  if (spec.scale) group.scale.setScalar(spec.scale);
  const body = lib.models.get(spec.body);
  if (!body) {
    console.warn(`art: no model ${spec.body}`);
    return group;
  }
  const mats = frameMatrices(body, spec.clip ?? null, spec.time ?? 0);
  const mesh = new THREE.Mesh(skinned(body, mats, body, spec), await material(body, spec));
  mesh.name = spec.body;
  group.add(mesh);
  for (const id of spec.wear ?? []) {
    const shell = lib.models.get(id);
    if (!shell) {
      console.warn(`art: no model ${id}`);
      continue;
    }
    const m = new THREE.Mesh(skinned(shell, mats, body, {}), await material(shell, { tint: spec.tint }));
    m.name = id;
    group.add(m);
  }
  for (const [id, slot, ...hide] of spec.hold ?? []) {
    const item = lib.models.get(id);
    const b = body.boneNames.indexOf(slot);
    if (!item || b < 0) {
      console.warn(`art: cannot hang ${id} at ${spec.body}.${slot}`);
      continue;
    }
    const itemMats = frameMatrices(item, item.clips.has('flicker') ? 'flicker' : item.clips.has('loop') ? 'loop' : null, spec.time ?? 0);
    const m = new THREE.Mesh(skinned(item, itemMats, item, { hideBones: hide }), await material(item, { glow: ITEM_GLOW[id] ?? 0, tint: spec.tint }));
    // The slot bone's world matrix in the model's own space (InstancedModel.boneWorld without the placement).
    const at = (mats[b] ?? new THREE.Matrix4()).clone().multiply(body.restWorld[b] ?? new THREE.Matrix4());
    at.decompose(m.position, m.quaternion, m.scale);
    m.name = id;
    group.add(m);
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/** Where a bone of a posed body is, in the body's own space (for a torch's flame tip or a spell's start). */
export function bonePoint(model: ModelData, clip: string | null, time: number, boneName: string): THREE.Vector3 {
  const b = model.boneNames.indexOf(boneName);
  if (b < 0) return new THREE.Vector3();
  const mats = frameMatrices(model, clip, time);
  return new THREE.Vector3().setFromMatrixPosition((mats[b] ?? new THREE.Matrix4()).clone().multiply(model.restWorld[b] ?? new THREE.Matrix4()));
}
