// Converts one Blockbench model into a .glb plus a JSON sidecar
// (docs/blueprint.md, technical decision 8).
//
// Conventions, matching Blockbench's own three.js scene and its glTF export:
// - Blockbench coordinates are three.js coordinates (x right, y up, north is
//   -Z), so there is no mirroring: a model that faces north in Blockbench
//   faces -Z in the game. Units become metres by multiplying by 0.028125.
// - Cube and group rotations are Euler degrees applied in 'ZYX' order (the
//   matrix is Rz * Ry * Rx) about the cube's or group's origin.
// - Animation keyframes use the classic .bbmodel convention: a rotation key
//   (x, y, z) adds (-x, -y, +z) degrees to the bone's rest Euler angles, a
//   position key (x, y, z) adds (-x, +y, +z) units to its rest position, and a
//   scale key multiplies. Catmull-Rom and step keys are resampled to linear
//   keys at the clip's snapping rate (24 per second) so the game only ever
//   interpolates linearly.
// - Per-face UVs are in the texture's UV pixel space (uv_width, uv_height);
//   faces whose texture is null are not drawn.
import { FACE_NAMES, parseBbmodel, type BbAnimation, type BbCube, type BbGroup, type BbKeyframe, type FaceName } from './bbmodel.ts';
import { ARRAY_BUFFER, GlbWriter, NEAREST } from './glb.ts';
import {
  compose,
  identity,
  multiply,
  quatFromEulerDegZYX,
  transformDirection,
  transformPoint,
  type Mat4,
  type Quat,
  type Vec3,
} from './math.ts';
import { decodePng, encodePng, pngSize, type RgbaImage } from './png.ts';
import { checkRules, type ModelFacts, type Violation } from './rules.ts';

/** Metres per Blockbench unit. */
export const UNIT_METRES = 0.028125;
export const SIM_STEPS_PER_SECOND = 20;
const CLAMP_TO_EDGE = 33071;

export interface SidecarBone {
  name: string;
  /** Index of the parent bone, or -1. Parents always come before children. */
  parent: number;
  /** Rest-pose pivot in model space, metres. */
  pivot: Vec3;
  /** Rest local rotation as a quaternion [x, y, z, w]. */
  rotation: Quat;
  /** Index into `parts` for bones of an equipment part, else -1. */
  part: number;
}

export interface SidecarClip {
  name: string;
  /** Seconds. */
  length: number;
  /** True for looping clips; the others hold their last frame. */
  loop: boolean;
  /** Blockbench's loop mode: 'loop', 'once' or 'hold'. */
  mode: string;
  /** Key moments (keyframes or markers named "key") in sim steps from the clip start, 20 per second. */
  keys: number[];
}

export interface ModelSidecar {
  version: 1;
  id: string;
  category: string;
  /** The .bbmodel this was built from, relative to packages/assets. */
  source: string;
  unitMetres: number;
  bones: SidecarBone[];
  /**
   * Equipment parts: groups hanging under a slot_* group. The vertex attribute
   * _PART is 0 for the body and 1 + the index in this list for a part's cubes.
   */
  parts: string[];
  clips: SidecarClip[];
  /** Rest-pose bounds of the body without equipment parts, metres (for click hit areas). */
  bounds: { min: Vec3; max: Vec3 };
  /** Rest-pose bounds including every equipment part, metres. */
  boundsWithParts: { min: Vec3; max: Vec3 };
  texture: { width: number; height: number };
  cubes: number;
  vertices: number;
}

export interface ModelInfo {
  id: string;
  category: string;
  /** Path relative to packages/assets, for messages and the sidecar. */
  source: string;
  /** Problems with where the file lives (wrong folder name, unknown category). */
  layoutProblems?: string[];
  /** Category whose cube budget and placement rules apply, when it differs (pieces of an equipment set are items). */
  budgetCategory?: string;
}

export interface ConvertedModel {
  id: string;
  violations: Violation[];
  /** Violations not waived by the manifest; the build fails if any exist. */
  errors: Violation[];
  glb: Uint8Array | null;
  sidecar: ModelSidecar | null;
}

interface Bone {
  name: string;
  parent: number;
  origin: Vec3;
  rotation: Vec3;
  uuid: string;
  part: number;
  isSlot: boolean;
  cubes: BbCube[];
  synthetic: boolean;
}

/** Face corners in Blockbench's order (top-left, top-right, bottom-left, bottom-right seen from outside). */
function faceCorners(face: FaceName, f: Vec3, t: Vec3): Vec3[] {
  switch (face) {
    case 'east': return [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]], [t[0], f[1], f[2]]];
    case 'west': return [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]], [f[0], f[1], t[2]]];
    case 'up': return [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]], [t[0], t[1], t[2]]];
    case 'down': return [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]], [t[0], f[1], f[2]]];
    case 'south': return [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]], [t[0], f[1], t[2]]];
    case 'north': return [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]], [f[0], f[1], f[2]]];
  }
}

const FACE_NORMALS: Record<FaceName, Vec3> = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

class Bounds {
  min: Vec3 = [Infinity, Infinity, Infinity];
  max: Vec3 = [-Infinity, -Infinity, -Infinity];
  add(p: Vec3): void {
    for (let i = 0; i < 3; i++) {
      this.min[i] = Math.min(this.min[i] ?? 0, p[i] ?? 0);
      this.max[i] = Math.max(this.max[i] ?? 0, p[i] ?? 0);
    }
  }
  get empty(): boolean {
    return this.min[0] > this.max[0];
  }
  rounded(): { min: Vec3; max: Vec3 } {
    const r = (v: Vec3): Vec3 => (this.empty ? [0, 0, 0] : [round6(v[0]), round6(v[1]), round6(v[2])]);
    return { min: r(this.min), max: r(this.max) };
  }
}

/** x / z bounds of the body's bottom quarter (feet, legs, foundations), in units. */
function footprintOf(points: Vec3[], all: Bounds): { min: [number, number]; max: [number, number] } {
  const cut = all.min[1] + 0.25 * (all.max[1] - all.min[1]) + 1e-6;
  const b = new Bounds();
  for (const p of points) if (p[1] <= cut) b.add(p);
  const r = b.rounded();
  return { min: [r.min[0], r.min[2]], max: [r.max[0], r.max[2]] };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Keyframe interpolation, following Blockbench's BoneAnimator.interpolate.

const AXES = ['x', 'y', 'z'] as const;

function pointValue(kf: BbKeyframe, axis: string, pointIndex: number, fallback: number, problems: Set<string>): number {
  const point = kf.points[Math.min(pointIndex, kf.points.length - 1)];
  const raw = point?.[axis];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    problems.add(`keyframe value "${String(raw)}" is a Molang expression; only numbers are supported`);
    return fallback;
  }
  return n;
}

/** Uniform Catmull-Rom on the values, as three.js SplineCurve.getPoint does. */
function catmullRom(points: number[], t: number): number {
  const n = points.length;
  const p = (n - 1) * t;
  const i = Math.floor(p);
  const w = p - i;
  const p0 = points[i === 0 ? i : i - 1] ?? 0;
  const p1 = points[i] ?? points[n - 1] ?? 0;
  const p2 = points[i > n - 2 ? n - 1 : i + 1] ?? 0;
  const p3 = points[i > n - 3 ? n - 1 : i + 2] ?? 0;
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = w * w;
  const t3 = w * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * w + p1;
}

function interpolate(sorted: BbKeyframe[], time: number, fallback: number, problems: Set<string>): Vec3 {
  const eps = 1e-6;
  let bi = -1;
  for (let i = 0; i < sorted.length; i++) if ((sorted[i]?.time ?? 0) <= time + eps) bi = i;
  const before = sorted[bi];
  const after = sorted[bi + 1];
  const out: Vec3 = [fallback, fallback, fallback];
  AXES.forEach((axis, a) => {
    if (!before && after) out[a] = pointValue(after, axis, 0, fallback, problems);
    else if (before && (!after || Math.abs(before.time - time) < eps)) out[a] = pointValue(before, axis, 1, fallback, problems);
    else if (before && after) {
      const alpha = (time - before.time) / (after.time - before.time);
      const v0 = pointValue(before, axis, 1, fallback, problems);
      const v1 = pointValue(after, axis, 0, fallback, problems);
      if (before.interpolation === 'step') out[a] = v0;
      else if (before.interpolation === 'catmullrom' || after.interpolation === 'catmullrom') {
        const prev = sorted[bi - 1];
        const next = sorted[bi + 2];
        const pts: number[] = [];
        if (prev && before.points.length === 1) pts.push(pointValue(prev, axis, 1, fallback, problems));
        pts.push(v0, v1);
        if (next && after.points.length === 1) pts.push(pointValue(next, axis, 0, fallback, problems));
        out[a] = catmullRom(pts, (alpha + (prev && before.points.length === 1 ? 1 : 0)) / (pts.length - 1));
      } else out[a] = v0 + (v1 - v0) * alpha; // linear; bezier handles are approximated as linear
    }
  });
  return out;
}

function isKeyText(v: unknown): boolean {
  return typeof v === 'string' && /^key;?$/i.test(v.trim());
}

/** Key moments: keyframes or timeline markers named "key", or effect keyframes whose script or effect is "key". */
function keyTimes(anim: BbAnimation): number[] {
  const times: number[] = [];
  for (const m of anim.markers) if (isKeyText(m.name)) times.push(m.time);
  for (const an of anim.animators) {
    for (const kf of an.keyframes) {
      if (isKeyText(kf.name) || (an.type !== 'bone' && kf.points.some((p) => Object.values(p).some(isKeyText)))) times.push(kf.time);
    }
  }
  return [...new Set(times.map((t) => Math.round(t * SIM_STEPS_PER_SECOND)))].sort((a, b) => a - b);
}

interface Channel {
  node: number;
  path: 'rotation' | 'translation' | 'scale';
  times: number[];
  values: number[];
}

/** Drops samples that linear interpolation between the kept neighbours already reproduces. */
function simplify(ch: Channel, tolerance = 1e-4): Channel {
  const n = ch.path === 'rotation' ? 4 : 3;
  const count = ch.times.length;
  if (count <= 2) return ch;
  const keep = [0];
  for (let i = 1; i < count - 1; i++) {
    const a = keep[keep.length - 1] ?? 0;
    const ta = ch.times[a] ?? 0;
    const tb = ch.times[i + 1] ?? 0;
    let needed = false;
    // Every sample between the last kept one and i + 1 must stay on the line.
    for (let j = a + 1; j <= i && !needed; j++) {
      const alpha = ((ch.times[j] ?? 0) - ta) / (tb - ta);
      for (let c = 0; c < n; c++) {
        const va = ch.values[a * n + c] ?? 0;
        const vb = ch.values[(i + 1) * n + c] ?? 0;
        if (Math.abs(va + (vb - va) * alpha - (ch.values[j * n + c] ?? 0)) > tolerance) needed = true;
      }
    }
    if (needed) keep.push(i);
  }
  keep.push(count - 1);
  return {
    ...ch,
    times: keep.map((i) => ch.times[i] ?? 0),
    values: keep.flatMap((i) => ch.values.slice(i * n, i * n + n)),
  };
}

// ---------------------------------------------------------------------------

export function convertModel(raw: unknown, info: ModelInfo, deviations: readonly string[] = []): ConvertedModel {
  const formatProblems: string[] = [];
  const animationProblems = new Set<string>();
  const model = parseBbmodel(raw, formatProblems);
  if (model.modelFormat !== 'free') {
    formatProblems.push(`model format is "${model.modelFormat || 'unknown'}"; it must be a Blockbench Generic Model ("free")`);
  }

  // Bones: every group, depth first so parents come before children.
  const cubeByUuid = new Map(model.cubes.map((c) => [c.uuid, c]));
  const placed = new Set<string>();
  const bones: Bone[] = [];
  const parts: string[] = [];
  const looseCubes: BbCube[] = [];
  const visit = (node: BbGroup | string, parent: number, part: number, inSlot: boolean): void => {
    if (typeof node === 'string') {
      const cube = cubeByUuid.get(node);
      if (!cube) return;
      placed.add(node);
      const owner = bones[parent];
      if (owner) owner.cubes.push(cube);
      else looseCubes.push(cube);
      return;
    }
    const isSlot = node.name.startsWith('slot');
    let myPart = part;
    if (part < 0 && inSlot && !isSlot) {
      parts.push(node.name);
      myPart = parts.length - 1;
    }
    const index = bones.length;
    bones.push({ name: node.name, parent, origin: node.origin, rotation: node.rotation, uuid: node.uuid, part: myPart, isSlot, cubes: [], synthetic: false });
    for (const child of node.children) visit(child, index, myPart, inSlot || isSlot);
  };
  for (const node of model.outliner) visit(node, -1, -1, false);
  for (const c of model.cubes) if (!placed.has(c.uuid)) looseCubes.push(c);
  if (looseCubes.length > 0) {
    formatProblems.push(`${looseCubes.length} cube(s) are not inside any group (bone): ${looseCubes.slice(0, 5).map((c) => c.name).join(', ')}`);
    bones.push({ name: 'loose_cubes', parent: -1, origin: [0, 0, 0], rotation: [0, 0, 0], uuid: '', part: -1, isSlot: false, cubes: looseCubes, synthetic: true });
  }

  // Rest transforms, in metres.
  const restLocalT: Vec3[] = [];
  const restLocalQ: Quat[] = [];
  const restWorld: Mat4[] = [];
  bones.forEach((b, i) => {
    const parent = bones[b.parent];
    const t = scale(sub(b.origin, parent ? parent.origin : [0, 0, 0]), UNIT_METRES);
    const q = quatFromEulerDegZYX(b.rotation);
    restLocalT[i] = t;
    restLocalQ[i] = q;
    const local = compose(t, q);
    restWorld[i] = parent ? multiply(restWorld[b.parent] ?? identity(), local) : local;
  });

  // Textures: every texture a drawn face uses goes into one atlas, side by side.
  const usedTextures = new Set<number>();
  let cubeCount = 0;
  for (const b of bones) {
    for (const c of b.cubes) {
      if (!c.exported) continue;
      if (c.type !== 'cube') {
        if (c.type !== 'locator' && c.type !== 'null_object') formatProblems.push(`element "${c.name}" is a ${c.type}; only cubes are supported`);
        continue;
      }
      cubeCount++;
      for (const name of FACE_NAMES) {
        const face = c.faces[name];
        if (face && face.texture !== null) usedTextures.add(face.texture);
      }
    }
  }
  const textureFacts: ModelFacts['textures'] = [];
  model.textures.forEach((t) => {
    const size = t.png ? pngSize(t.png) : null;
    if (!t.png || !size) formatProblems.push(`texture "${t.name}" is not embedded as a PNG`);
    else textureFacts.push({ name: t.name, width: size.width, height: size.height });
  });
  const atlasSlots = new Map<number, { x: number; y: number; w: number; h: number; uvW: number; uvH: number }>();
  let atlasW = 0;
  let atlasH = 0;
  const atlasSources: { index: number; png: Uint8Array; w: number; h: number }[] = [];
  for (const index of [...usedTextures].sort((a, b) => a - b)) {
    const t = model.textures[index];
    const size = t?.png ? pngSize(t.png) : null;
    if (!t?.png || !size) {
      if (!t) formatProblems.push(`a face uses texture ${index}, which does not exist`);
      continue;
    }
    atlasSlots.set(index, { x: atlasW, y: 0, w: size.width, h: size.height, uvW: t.uvWidth || size.width, uvH: t.uvHeight || size.height });
    atlasSources.push({ index, png: t.png, w: size.width, h: size.height });
    atlasW += size.width;
    atlasH = Math.max(atlasH, size.height);
  }
  let atlasPng: Uint8Array | null = null;
  if (atlasSources.length === 1) {
    atlasPng = atlasSources[0]?.png ?? null;
  } else if (atlasSources.length > 1) {
    atlasW = nextPow2(atlasW);
    atlasH = nextPow2(atlasH);
    const atlas: RgbaImage = { width: atlasW, height: atlasH, data: new Uint8Array(atlasW * atlasH * 4) };
    for (const src of atlasSources) {
      const slot = atlasSlots.get(src.index);
      if (!slot) continue;
      try {
        const img = decodePng(src.png);
        for (let y = 0; y < img.height; y++) {
          atlas.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((slot.y + y) * atlasW + slot.x) * 4);
        }
      } catch (e) {
        formatProblems.push(`texture ${src.index} could not be decoded: ${(e as Error).message}`);
      }
    }
    atlasPng = encodePng(atlas);
  }

  // Geometry: 4 vertices and 2 triangles per drawn face, in rest-pose model space.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const boneIds: number[] = [];
  const partIds: number[] = [];
  const indices: number[] = [];
  const bodyBoundsUnits = new Bounds();
  const bodyPointsUnits: Vec3[] = [];
  const bodyBounds = new Bounds();
  const allBounds = new Bounds();
  bones.forEach((b, bi) => {
    const world = restWorld[bi] ?? identity();
    for (const c of b.cubes) {
      if (!c.exported || c.type !== 'cube') continue;
      const from: Vec3 = [c.from[0] - c.inflate, c.from[1] - c.inflate, c.from[2] - c.inflate];
      const to: Vec3 = [c.to[0] + c.inflate, c.to[1] + c.inflate, c.to[2] + c.inflate];
      const cubeRot = compose([0, 0, 0], quatFromEulerDegZYX(c.rotation));
      for (const name of FACE_NAMES) {
        const face = c.faces[name];
        if (!face || face.texture === null) continue;
        const slot = atlasSlots.get(face.texture);
        if (!slot) continue;
        const [u1, v1, u2, v2] = face.uv;
        const faceUv: [number, number][] = [[u1, v1], [u2, v1], [u1, v2], [u2, v2]];
        for (let r = ((Math.round(face.rotation / 90) % 4) + 4) % 4; r > 0; r--) {
          const a = faceUv[0] as [number, number];
          faceUv[0] = faceUv[2] as [number, number];
          faceUv[2] = faceUv[3] as [number, number];
          faceUv[3] = faceUv[1] as [number, number];
          faceUv[1] = a;
        }
        const normal = transformDirection(world, transformDirection(cubeRot, FACE_NORMALS[name]));
        const base = positions.length / 3;
        faceCorners(name, from, to).forEach((corner, k) => {
          const rotated = transformPoint(cubeRot, sub(corner, c.origin));
          const modelUnits: Vec3 = [rotated[0] + c.origin[0], rotated[1] + c.origin[1], rotated[2] + c.origin[2]];
          const p = transformPoint(world, scale(sub(modelUnits, b.origin), UNIT_METRES));
          positions.push(p[0], p[1], p[2]);
          normals.push(normal[0], normal[1], normal[2]);
          const [u, v] = faceUv[k] ?? [0, 0];
          uvs.push((slot.x + (u * slot.w) / slot.uvW) / atlasW, (slot.y + (v * slot.h) / slot.uvH) / atlasH);
          boneIds.push(bi);
          partIds.push(b.part + 1);
          allBounds.add(p);
          if (b.part < 0) {
            bodyBounds.add(p);
            const units = scale(p, 1 / UNIT_METRES);
            bodyBoundsUnits.add(units);
            bodyPointsUnits.push(units);
          }
        });
        indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      }
    }
  });
  if (indices.length === 0) formatProblems.push('the model has no drawn faces');

  // Clips, resampled to linear keys.
  const clips: { name: string; channels: Channel[] }[] = [];
  const sidecarClips: SidecarClip[] = [];
  const boneByUuid = new Map(bones.map((b, i) => [b.uuid, i]));
  const boneByName = new Map(bones.map((b, i) => [b.name, i]));
  for (const anim of model.animations) {
    const channels: Channel[] = [];
    let length = anim.length;
    if (!(length > 0)) {
      length = Math.max(0, ...anim.animators.flatMap((a) => a.keyframes.map((k) => k.time)));
    }
    for (const an of anim.animators) {
      if (an.type !== 'bone') continue;
      const bi = boneByUuid.get(an.uuid) ?? boneByName.get(an.name);
      if (bi === undefined) {
        if (an.keyframes.length > 0) animationProblems.add(`clip "${anim.name}" animates "${an.name}", which is not a bone`);
        continue;
      }
      for (const channel of ['rotation', 'position', 'scale'] as const) {
        const kfs = an.keyframes.filter((k) => k.channel === channel).sort((a, b) => a.time - b.time);
        if (kfs.length === 0) continue;
        const timeSet = new Set<number>();
        const steps = Math.round(length * anim.snapping);
        for (let i = 0; i <= steps; i++) timeSet.add(round6(Math.min(length, i / anim.snapping)));
        for (const k of kfs) {
          if (k.time >= 0 && k.time <= length) timeSet.add(round6(k.time));
        }
        kfs.forEach((k, i) => {
          const next = kfs[i + 1];
          if (k.interpolation === 'step' && next && next.time - 1e-3 > k.time) timeSet.add(round6(next.time - 1e-3));
        });
        const times = [...timeSet].sort((a, b) => a - b);
        const values: number[] = [];
        const rest = bones[bi] as Bone;
        let prevQ: Quat | null = null;
        for (const t of times) {
          const v = interpolate(kfs, t, channel === 'scale' ? 1 : 0, animationProblems);
          if (channel === 'rotation') {
            let q = quatFromEulerDegZYX([rest.rotation[0] - v[0], rest.rotation[1] - v[1], rest.rotation[2] + v[2]]);
            if (prevQ && prevQ[0] * q[0] + prevQ[1] * q[1] + prevQ[2] * q[2] + prevQ[3] * q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
            prevQ = q;
            values.push(...q);
          } else if (channel === 'position') {
            const t0 = restLocalT[bi] ?? [0, 0, 0];
            values.push(t0[0] - v[0] * UNIT_METRES, t0[1] + v[1] * UNIT_METRES, t0[2] + v[2] * UNIT_METRES);
          } else values.push(v[0], v[1], v[2]);
        }
        channels.push(simplify({ node: bi, path: channel === 'position' ? 'translation' : channel, times, values }));
      }
    }
    clips.push({ name: anim.name, channels });
    sidecarClips.push({ name: anim.name, length: round6(length), loop: anim.loop === 'loop', mode: anim.loop, keys: keyTimes(anim) });
  }

  // Rules.
  const facts: ModelFacts = {
    id: info.id,
    category: info.category,
    layoutProblems: info.layoutProblems ?? [],
    formatProblems,
    animationProblems: [...animationProblems],
    bones: bones.map((b) => ({
      name: b.name,
      parent: bones[b.parent]?.name ?? null,
      isSlot: b.isSlot,
      directCubes: b.cubes.length,
      synthetic: b.synthetic,
    })),
    bodyCubes: bones.reduce((n, b) => n + (b.part < 0 ? b.cubes.filter((c) => c.exported && c.type === 'cube').length : 0), 0),
    parts: parts.map((name, i) => ({
      name,
      cubes: bones.reduce((n, b) => n + (b.part === i ? b.cubes.filter((c) => c.exported && c.type === 'cube').length : 0), 0),
    })),
    textures: textureFacts,
    budgetCategory: info.budgetCategory ?? info.category,
    bodyMin: bodyBoundsUnits.rounded().min,
    bodyMax: bodyBoundsUnits.rounded().max,
    footprint: footprintOf(bodyPointsUnits, bodyBoundsUnits),
  };
  const violations = checkRules(facts, deviations);
  const errors = violations.filter((v) => !v.waived);
  if (indices.length === 0 || !atlasPng) return { id: info.id, violations, errors, glb: null, sidecar: null };

  // The glTF document.
  const w = new GlbWriter();
  const vertexCount = positions.length / 3;
  const attributes = {
    POSITION: w.addFloat(Float32Array.from(positions), 'VEC3', ARRAY_BUFFER),
    NORMAL: w.addFloat(Float32Array.from(normals), 'VEC3', ARRAY_BUFFER, false),
    TEXCOORD_0: w.addFloat(Float32Array.from(uvs), 'VEC2', ARRAY_BUFFER, false),
    _BONE: w.addUshortAttribute(boneIds),
    _PART: w.addUshortAttribute(partIds),
  };
  const indexAccessor = w.addIndices(Uint32Array.from(indices), vertexCount);
  const imageView = w.addBufferView(atlasPng);
  const nodes: Record<string, unknown>[] = bones.map((b, i) => {
    const node: Record<string, unknown> = { name: b.name, translation: (restLocalT[i] ?? [0, 0, 0]).map(round6) };
    const q = restLocalQ[i] ?? [0, 0, 0, 1];
    if (q[3] < 1 - 1e-9) node.rotation = q;
    const children = bones.flatMap((c, ci) => (c.parent === i ? [ci] : []));
    if (children.length > 0) node.children = children;
    return node;
  });
  nodes.push({ name: `${info.id}_mesh`, mesh: 0 });
  const animations = clips.map((clip) => {
    const samplers: Record<string, unknown>[] = [];
    const channels: Record<string, unknown>[] = [];
    for (const ch of clip.channels) {
      const input = w.addFloat(Float32Array.from(ch.times), 'SCALAR');
      const output = w.addFloat(Float32Array.from(ch.values), ch.path === 'rotation' ? 'VEC4' : 'VEC3', undefined, false);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } });
    }
    return { name: clip.name, samplers, channels };
  });
  Object.assign(w.json, {
    scene: 0,
    scenes: [{ name: info.id, nodes: [...bones.flatMap((b, i) => (b.parent < 0 ? [i] : [])), bones.length] }],
    nodes,
    meshes: [{
      name: info.id,
      primitives: [{ attributes, indices: indexAccessor, material: 0, mode: 4 }],
      extras: { parts },
    }],
    materials: [{
      name: info.id,
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
    }],
    samplers: [{ magFilter: NEAREST, minFilter: NEAREST, wrapS: CLAMP_TO_EDGE, wrapT: CLAMP_TO_EDGE }],
    images: [{ name: `${info.id}.png`, bufferView: imageView, mimeType: 'image/png' }],
    textures: [{ sampler: 0, source: 0 }],
  });
  if (animations.length > 0) w.json.animations = animations;

  const sidecar: ModelSidecar = {
    version: 1,
    id: info.id,
    category: info.category,
    source: info.source,
    unitMetres: UNIT_METRES,
    bones: bones.map((b, i) => {
      const m = restWorld[i] ?? identity();
      return {
        name: b.name,
        parent: b.parent,
        pivot: [round6(m[12] ?? 0), round6(m[13] ?? 0), round6(m[14] ?? 0)],
        rotation: (restLocalQ[i] ?? [0, 0, 0, 1]).map(round6) as Quat,
        part: b.part,
      };
    }),
    parts,
    clips: sidecarClips,
    bounds: bodyBounds.rounded(),
    boundsWithParts: allBounds.rounded(),
    texture: { width: atlasW, height: atlasH },
    cubes: cubeCount,
    vertices: vertexCount,
  };
  return { id: info.id, violations, errors, glb: w.toGlb(), sidecar };
}

