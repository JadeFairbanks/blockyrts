// Walkable footprints from building models: which 45 cm columns of a
// building's footprint its finished models fill where a walker's body goes,
// and how high the tops are that men stand on.
//
// A column is solid when a drawn cube (state sets hidden by default and
// slot_* parts left out, as the converter does) holds a point of the column
// in the band a walker's body fills, BODY_LOW to BODY_HIGH units above the
// floor, sampled every MIN_OVERLAP units: walls, posts, stalls, low roofs and
// towers block; low fences, woodpiles, troughs and high eaves over open
// ground do not. A pocket of open columns that walls close off from the
// footprint's edge is solid too (a courtyard behind a shut gate).
//
// Positions here are Blockbench units (16 to a column) from the footprint's
// north-west corner, as the sim's footprint table gives them.
import { FOOTPRINTS } from '@blockyrts/sim';
import { parseBbmodel, type BbCube, type BbGroup } from './bbmodel.ts';
import { compose, identity, multiply, quatFromEulerDegZYX, transformPoint, type Mat4, type Vec3 } from './math.ts';

/** Blockbench units per 45 cm column. */
export const UNITS_PER_COLUMN = 16;
/** The band a walker's body fills (units): from 1 m, above fences, woodpiles and troughs, to 1.7 m, below eaves and lintels. */
export const BODY_LOW = 36;
export const BODY_HIGH = 60;
/** Units a cube must overlap a column by on each axis to count. */
export const MIN_OVERLAP = 2;

/** A drawn cube: its corners in its own frame and the matrix from model space to that frame (units, rest pose). */
export interface Box {
  from: Vec3;
  to: Vec3;
  inverse: Mat4;
  /** Where the model's origin sits, units from the footprint corner. */
  at: [number, number];
  /** Bounds from the footprint corner. */
  min: Vec3;
  max: Vec3;
  name: string;
}

/** Every drawn cube of a model whose origin sits at (x, z) units from the footprint corner. */
export function placedBoxes(raw: unknown, x = 0, z = 0): Box[] {
  const model = parseBbmodel(raw, []);
  const cubes = new Map(model.cubes.map((c) => [c.uuid, c]));
  const out: Box[] = [];
  const visit = (node: BbGroup | string, parent: Mat4, skip: boolean): void => {
    if (typeof node === 'string') {
      const c = cubes.get(node);
      if (!c || skip || !c.exported || c.type !== 'cube') return;
      out.push(cubeBox(c, parent, x, z));
      return;
    }
    const m = multiply(parent, pivoted(node.origin, node.rotation));
    const hide = skip || !node.visible || node.name.startsWith('slot');
    for (const child of node.children) visit(child, m, hide);
  };
  for (const node of model.outliner) visit(node, identity(), false);
  return out;
}

/** A rotation about a pivot point. */
function pivoted(origin: Vec3, rotation: Vec3): Mat4 {
  return multiply(compose(origin, quatFromEulerDegZYX(rotation)), compose([-origin[0], -origin[1], -origin[2]], [0, 0, 0, 1]));
}

function cubeBox(c: BbCube, m: Mat4, x: number, z: number): Box {
  const t = multiply(m, pivoted(c.origin, c.rotation));
  const from: Vec3 = [c.from[0] - c.inflate, c.from[1] - c.inflate, c.from[2] - c.inflate];
  const to: Vec3 = [c.to[0] + c.inflate, c.to[1] + c.inflate, c.to[2] + c.inflate];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const p = transformPoint(t, [k & 1 ? to[0] : from[0], k & 2 ? to[1] : from[1], k & 4 ? to[2] : from[2]]);
    p[0] += x;
    p[2] += z;
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a]!, p[a]!);
      max[a] = Math.max(max[a]!, p[a]!);
    }
  }
  return { from, to, inverse: invertRigid(t), at: [x, z], min, max, name: c.name };
}

/** The inverse of a rotation and translation. */
function invertRigid(m: Mat4): Mat4 {
  const out = identity();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = m[r * 4 + c]!;
  for (let r = 0; r < 3; r++) out[12 + r] = -(out[r]! * m[12]! + out[4 + r]! * m[13]! + out[8 + r]! * m[14]!);
  return out;
}

/** Whether a point (units from the footprint corner) lies inside a cube. */
export function inside(b: Box, p: Vec3): boolean {
  if (p[0] < b.min[0] || p[0] > b.max[0] || p[1] < b.min[1] || p[1] > b.max[1] || p[2] < b.min[2] || p[2] > b.max[2]) return false;
  const q = transformPoint(b.inverse, [p[0] - b.at[0], p[1], p[2] - b.at[1]]);
  return q[0] >= b.from[0] && q[0] <= b.to[0] && q[1] >= b.from[1] && q[1] <= b.to[1] && q[2] >= b.from[2] && q[2] <= b.to[2];
}

/**
 * The solid columns of a w x d footprint, as rows of '#' (solid) and '.'
 * (walkable), north (-Z) row first.
 */
export function columnMask(boxes: readonly Box[], w: number, d: number): string[] {
  const solid: boolean[][] = Array.from({ length: d }, () => new Array<boolean>(w).fill(false));
  const u = UNITS_PER_COLUMN;
  const tall = boxes.filter((b) => b.min[1] <= BODY_HIGH && b.max[1] >= BODY_LOW);
  for (let j = 0; j < d; j++) {
    const z0 = j * u;
    for (let i = 0; i < w; i++) {
      const x0 = i * u;
      // Points every MIN_OVERLAP units across the column through the body's band: a cube holding one overlaps the column that much.
      const near = tall.filter((b) => b.max[0] > x0 && b.min[0] < x0 + u && b.max[2] > z0 && b.min[2] < z0 + u);
      solid[j]![i] = near.length > 0 && holds(near, x0, z0);
    }
  }
  fillClosedPockets(solid, w, d);
  return solid.map((row) => row.map((s) => (s ? '#' : '.')).join(''));
}

function holds(near: readonly Box[], x0: number, z0: number): boolean {
  for (let y = BODY_LOW; y <= BODY_HIGH; y += MIN_OVERLAP * 2) {
    for (let a = MIN_OVERLAP / 2; a < UNITS_PER_COLUMN; a += MIN_OVERLAP) {
      for (let c = MIN_OVERLAP / 2; c < UNITS_PER_COLUMN; c += MIN_OVERLAP) {
        for (const b of near) if (inside(b, [x0 + a, y, z0 + c])) return true;
      }
    }
  }
  return false;
}

/** Open columns that cannot be walked to from outside the footprint become solid. */
function fillClosedPockets(solid: boolean[][], w: number, d: number): void {
  const seen: boolean[][] = Array.from({ length: d }, () => new Array<boolean>(w).fill(false));
  const stack: Array<[number, number]> = [];
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      if ((i === 0 || j === 0 || i === w - 1 || j === d - 1) && !solid[j]![i]) {
        seen[j]![i] = true;
        stack.push([i, j]);
      }
    }
  }
  while (stack.length > 0) {
    const [i, j] = stack.pop()!;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) {
      if (a < 0 || b < 0 || a >= w || b >= d || seen[b]![a] || solid[b]![a]) continue;
      seen[b]![a] = true;
      stack.push([a, b]);
    }
  }
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (!seen[j]![i]) solid[j]![i] = true;
}

/** The height (units) of the highest surface under a point, or 0 for bare ground. */
export function topAt(boxes: readonly Box[], x: number, z: number): number {
  const near = boxes.filter((b) => b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z);
  let top = 0;
  for (const b of near) {
    if (b.max[1] <= top) continue;
    // Down from the cube's top in quarter units to where the point first enters it.
    for (let y = Math.ceil(b.max[1] * 4) / 4; y > top; y -= 0.25) {
      if (inside(b, [x, y, z])) {
        top = y;
        break;
      }
    }
  }
  return top;
}

/** Whether nothing fills the space a man takes standing at a point (units). */
export function roomToStand(boxes: readonly Box[], x: number, y: number, z: number): boolean {
  for (let h = y + 2; h <= y + BODY_HIGH; h += 2) {
    for (const [dx, dz] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]] as const) {
      if (boxes.some((b) => inside(b, [x + dx, h, z + dz]))) return false;
    }
  }
  return true;
}

/** How far a post may sit above or below the model's top under it (units): a man's feet on a sloped or stepped deck. */
export const POST_SLACK = 6;

/** One level of the sim's footprint table against its models. */
export interface LevelCheck {
  kind: number;
  level: number;
  /** The rows measured from the models now (the table's own rows for a level set by hand). */
  measured: string[];
  table: readonly string[];
  fitted: boolean;
  /** Posts not standing on a top with room for a man, in words. */
  posts: string[];
}

/** Every modelled level of the footprint table, measured from its models (read by id). */
export function checkFootprints(read: (id: string) => unknown): LevelCheck[] {
  const out: LevelCheck[] = [];
  for (const [k, levels] of Object.entries(FOOTPRINTS)) {
    levels.forEach((f, n) => {
      if (!f.models || f.models.length === 0) return;
      const boxes = f.models.flatMap((m) => placedBoxes(read(m.id), m.x, m.z));
      const w = f.rows[0]!.length;
      const d = f.rows.length;
      const posts: string[] = [];
      for (const [x, z, y] of f.posts ?? []) {
        const top = topAt(boxes, x, z);
        if (Math.abs(top - y) > POST_SLACK) posts.push(`post (${x}, ${z}) at ${y} units, but the top under it is at ${top}`);
        else if (!roomToStand(boxes, x, top, z)) posts.push(`post (${x}, ${z}) has no room for a man standing at ${top} units`);
      }
      out.push({ kind: Number(k), level: n + 1, measured: f.fitted ? [...f.rows] : columnMask(boxes, w, d), table: f.rows, fitted: f.fitted !== undefined, posts });
    });
  }
  return out;
}
