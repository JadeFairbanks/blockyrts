// Reads a Blockbench .bbmodel (Generic Model, format 4.x) into plain typed
// data. Unknown or malformed parts are reported as problems, not thrown, so
// the converter can list every issue in one run.
import type { Vec3 } from './math.ts';

export const FACE_NAMES = ['east', 'west', 'up', 'down', 'south', 'north'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export interface BbFace {
  /** [u1, v1, u2, v2] in the texture's UV pixel space. */
  uv: [number, number, number, number];
  /** Index into BbModel.textures; null means the face is not drawn. */
  texture: number | null;
  /** 0, 90, 180 or 270. */
  rotation: number;
}

export interface BbCube {
  uuid: string;
  name: string;
  type: string;
  from: Vec3;
  to: Vec3;
  origin: Vec3;
  rotation: Vec3;
  inflate: number;
  exported: boolean;
  faces: Partial<Record<FaceName, BbFace>>;
}

export interface BbGroup {
  uuid: string;
  name: string;
  origin: Vec3;
  rotation: Vec3;
  /** False for a group hidden by default in Blockbench (a state set such as `construction_33` or `ruined`, or a stowed item). */
  visible: boolean;
  /** Child groups and cube uuids, in outliner order. */
  children: (BbGroup | string)[];
}

export interface BbTexture {
  name: string;
  uuid: string;
  uvWidth: number;
  uvHeight: number;
  /** The embedded PNG, or null if the texture is not embedded. */
  png: Uint8Array | null;
}

export interface BbKeyframe {
  channel: string;
  time: number;
  interpolation: string;
  /** Each data point as raw values (numbers, or strings holding Molang). */
  points: Record<string, unknown>[];
  name: string;
}

export interface BbAnimator {
  uuid: string;
  name: string;
  type: string;
  keyframes: BbKeyframe[];
}

export interface BbAnimation {
  name: string;
  loop: string;
  length: number;
  snapping: number;
  animators: BbAnimator[];
  markers: { time: number; name: string }[];
}

export interface BbModel {
  formatVersion: string;
  modelFormat: string;
  resolution: { width: number; height: number };
  cubes: BbCube[];
  outliner: (BbGroup | string)[];
  textures: BbTexture[];
  animations: BbAnimation[];
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback;
}

function vec3(v: unknown): Vec3 {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0]), num(a[1]), num(a[2])];
}

function decodeDataUrl(source: unknown): Uint8Array | null {
  if (typeof source !== 'string') return null;
  const m = /^data:image\/png;base64,(.*)$/s.exec(source);
  return m?.[1] ? new Uint8Array(Buffer.from(m[1], 'base64')) : null;
}

export function parseBbmodel(raw: unknown, problems: string[]): BbModel {
  const d = isObj(raw) ? raw : {};
  const meta = isObj(d.meta) ? d.meta : {};
  const res = isObj(d.resolution) ? d.resolution : {};
  const resolution = { width: num(res.width, 16), height: num(res.height, 16) };

  const textures: BbTexture[] = (Array.isArray(d.textures) ? d.textures : []).filter(isObj).map((t, i) => ({
    name: str(t.name, `texture ${i}`),
    uuid: str(t.uuid),
    uvWidth: num(t.uv_width, resolution.width),
    uvHeight: num(t.uv_height, resolution.height),
    png: decodeDataUrl(t.source),
  }));

  const textureIndex = (v: unknown): number | null => {
    if (v === null || v === undefined || v === false) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const i = textures.findIndex((t) => t.uuid === v);
      if (i >= 0) return i;
      if (/^\d+$/.test(v)) return Number(v);
    }
    return null;
  };

  const cubes: BbCube[] = (Array.isArray(d.elements) ? d.elements : []).filter(isObj).map((e) => {
    const faces: Partial<Record<FaceName, BbFace>> = {};
    const rawFaces = isObj(e.faces) ? e.faces : {};
    for (const name of FACE_NAMES) {
      const f = rawFaces[name];
      if (!isObj(f)) continue;
      const uv = Array.isArray(f.uv) ? f.uv : [];
      faces[name] = {
        uv: [num(uv[0]), num(uv[1]), num(uv[2]), num(uv[3])],
        texture: textureIndex(f.texture),
        rotation: num(f.rotation),
      };
    }
    return {
      uuid: str(e.uuid),
      name: str(e.name),
      type: str(e.type, 'cube'),
      from: vec3(e.from),
      to: vec3(e.to),
      origin: vec3(e.origin),
      rotation: vec3(e.rotation),
      inflate: num(e.inflate),
      exported: e.export !== false,
      faces,
    };
  });

  // Blockbench 4.10 and later keep group data in a top-level `groups` list and
  // only uuids and children in the outliner; older files inline it.
  const groupData = new Map<string, Obj>();
  for (const g of Array.isArray(d.groups) ? d.groups : []) if (isObj(g)) groupData.set(str(g.uuid), g);
  const readNode = (n: unknown): BbGroup | string | null => {
    if (typeof n === 'string') return n;
    if (!isObj(n)) return null;
    const g = { ...(groupData.get(str(n.uuid)) ?? {}), ...n };
    if (typeof g.name !== 'string') problems.push(`outliner group ${str(g.uuid)} has no name`);
    return {
      uuid: str(g.uuid),
      name: str(g.name),
      origin: vec3(g.origin),
      rotation: vec3(g.rotation),
      visible: g.visibility !== false,
      children: (Array.isArray(g.children) ? g.children : []).map(readNode).filter((c) => c !== null),
    };
  };
  const outliner = (Array.isArray(d.outliner) ? d.outliner : []).map(readNode).filter((c) => c !== null);

  const animations: BbAnimation[] = (Array.isArray(d.animations) ? d.animations : []).filter(isObj).map((a) => {
    const animatorsRaw = isObj(a.animators) ? a.animators : {};
    const animators: BbAnimator[] = Object.entries(animatorsRaw).filter(([, v]) => isObj(v)).map(([uuid, v]) => {
      const an = v as Obj;
      return {
        uuid,
        name: str(an.name),
        type: str(an.type, 'bone'),
        keyframes: (Array.isArray(an.keyframes) ? an.keyframes : []).filter(isObj).map((k) => ({
          channel: str(k.channel),
          time: num(k.time),
          interpolation: str(k.interpolation, 'linear'),
          points: (Array.isArray(k.data_points) ? k.data_points : []).filter(isObj),
          name: str(k.name ?? k.label),
        })),
      };
    });
    const markers = (Array.isArray(a.markers) ? a.markers : []).filter(isObj).map((m) => ({
      time: num(m.time),
      name: str(m.name ?? m.label ?? m.text),
    }));
    return {
      name: str(a.name),
      loop: str(a.loop, 'once'),
      length: num(a.length),
      snapping: num(a.snapping, 24) || 24,
      animators,
      markers,
    };
  });

  return {
    formatVersion: str(meta.format_version),
    modelFormat: str(meta.model_format),
    resolution,
    cubes,
    outliner,
    textures,
    animations,
  };
}
