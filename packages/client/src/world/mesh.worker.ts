// A mesh worker: keeps a mirror of the world with the sim's chunk deltas
// applied and turns chunks into drawable arrays (full detail near the camera,
// less detail farther out), plus minimap tiles. Generation is a pure function
// of the seed, so the mirror's land is the sim's land.
import {
  applyChunkDelta,
  chunkKey,
  COLUMNS_PER_CHUNK as N,
  MATERIALS,
  NO_WATER,
  propInfo,
  PropShape,
  WATER_PER_UNIT,
  World,
  type LowResChunk,
} from '@blockyrts/sim';
import { CUBE_STRIDE, propCubes, sceneryCubes } from './props-gen.ts';
import { COLUMN_M, meshChunk, meshLowRes, meshWater, UNIT_M } from './mesher.ts';
import type { FromMesh, PropSummary, ToMesh } from './mesh-messages.ts';
import { PENDING_PROP_MODELS, propModel } from './prop-models.ts';

let world: World | null = null;
/** The prop models the page has loaded, by id: their rest bounds. */
const modelBounds = new Map<string, readonly number[]>();

/** Samples of an edited chunk taken from its columns; untouched chunks come straight from the generator. */
function lowRes(w: World, cx: number, cz: number, step: number): LowResChunk {
  const c = w.edited.get(chunkKey(cx, cz));
  if (!c) return w.gen.lowRes(cx, cz, step);
  const size = N / step;
  const top = new Int16Array(size * size);
  const material = new Uint8Array(size * size);
  const water = new Int16Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const col = (j * step + (step >> 1)) * N + i * step + (step >> 1);
      const k = j * size + i;
      top[k] = c.top(col);
      material[k] = c.topMaterial(col);
      water[k] = c.water[col]!;
    }
  }
  return { step, size, top, material, water };
}

function post(msg: FromMesh, transfer: Transferable[]): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function mesh(id: number, cx: number, cz: number, lod: number, simStep: number, scenery: boolean): void {
  const w = world!;
  const started = performance.now();
  if (lod > 1) {
    const lr = lowRes(w, cx, cz, lod);
    const { land, water } = meshLowRes(lr);
    const heights = lr.top;
    const transfer: Transferable[] = [land.positions.buffer, land.normals.buffer, land.colors.buffer, land.indices.buffer, land.mats.buffer, heights.buffer];
    if (water) transfer.push(water.positions.buffer, water.normals.buffer, water.colors.buffer, water.indices.buffer, water.mats.buffer);
    post({ type: 'mesh', id, cx, cz, lod, land, water, cubes: null, props: [], wants: [], heights, size: lr.size, ms: performance.now() - started }, transfer);
    return;
  }
  const centre = w.columns(cx, cz);
  const h = {
    centre,
    west: w.columns(cx - 1, cz),
    east: w.columns(cx + 1, cz),
    north: w.columns(cx, cz - 1),
    south: w.columns(cx, cz + 1),
  };
  const land = meshChunk(h);
  const water = meshWater(h);
  const cubes: number[] = [];
  const props: PropSummary[] = [];
  const taken = new Set<number>();
  const wants = new Set<string>();
  for (const p of w.props(cx, cz, simStep)) {
    const before = cubes.length;
    const nextAt = p.next < 0 ? -1 : simStep + p.next;
    taken.add(p.lz * N + p.lx);
    // Drawn with its own model once that has loaded; its cubes until then.
    const pm = propModel(p.kind, p.stage, p.variant, p.amount);
    const b = pm ? modelBounds.get(pm.id) : undefined;
    if (pm && b) {
      const x = (p.lx + 0.5) * COLUMN_M;
      const z = (p.lz + 0.5) * COLUMN_M;
      const y = p.y * UNIT_M;
      // The model's footprint turned by its yaw, for selection; trees by their trunk and lower crown.
      const c = Math.abs(Math.cos(pm.yaw));
      const s = Math.abs(Math.sin(pm.yaw));
      const wx = ((b[3]! - b[0]!) * pm.scale) / 2;
      const wz = ((b[5]! - b[2]!) * pm.scale) / 2;
      const hy = ((b[4]! - b[1]!) * pm.scale) / 2;
      const tree = propInfo(p.kind).shape === PropShape.Tree;
      const hx = tree ? Math.min(c * wx + s * wz, 1.2) : Math.max(0.3, c * wx + s * wz);
      const hz = tree ? Math.min(s * wx + c * wz, 1.2) : Math.max(0.3, s * wx + c * wz);
      props.push({ index: p.index, kind: p.kind, lx: p.lx, lz: p.lz, x, y: y + hy, z, hx, hy: Math.max(0.2, hy), hz, amount: p.amount, most: p.most, stage: p.stage, nextAt, first: before / CUBE_STRIDE, cubes: 0, variant: p.variant, model: { ...pm, x, y, z } });
      continue;
    }
    if (pm && !PENDING_PROP_MODELS.has(pm.id.split(/[@~]/)[0]!)) wants.add(pm.id);
    propCubes(p, cubes);
    // The bounding box of its cubes, for selection.
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = before; k < cubes.length; k += CUBE_STRIDE) {
      const cx0 = cubes[k]!, by = cubes[k + 1]!, cz0 = cubes[k + 2]!;
      const hx = cubes[k + 3]! / 2, hz = cubes[k + 5]! / 2;
      x0 = Math.min(x0, cx0 - hx); x1 = Math.max(x1, cx0 + hx);
      z0 = Math.min(z0, cz0 - hz); z1 = Math.max(z1, cz0 + hz);
      y0 = Math.min(y0, by); y1 = Math.max(y1, by + cubes[k + 4]!);
    }
    if (x0 === Infinity) continue;
    // Trees are picked by their trunk and lower canopy, not the whole crown.
    const tree = propInfo(p.kind).shape === PropShape.Tree;
    const hx = tree ? Math.min((x1 - x0) / 2, 1.2) : Math.max(0.3, (x1 - x0) / 2);
    const hz = tree ? Math.min((z1 - z0) / 2, 1.2) : Math.max(0.3, (z1 - z0) / 2);
    props.push({ index: p.index, kind: p.kind, lx: p.lx, lz: p.lz, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx, hy: Math.max(0.2, (y1 - y0) / 2), hz, amount: p.amount, most: p.most, stage: p.stage, nextAt, first: before / CUBE_STRIDE, cubes: (cubes.length - before) / CUBE_STRIDE, variant: p.variant, model: null });
  }
  if (scenery) {
    const edited = w.editedColumns.get(chunkKey(cx, cz));
    for (let i = 0; i < N * N; i++) {
      if (taken.has(i) || edited?.has(i) || centre.water[i] !== NO_WATER) continue;
      const lx = i % N;
      const lz = (i - lx) / N;
      sceneryCubes(w.seed, cx * N + lx, cz * N + lz, lx, lz, centre.top(i), centre.topMaterial(i), cubes);
    }
  }
  const heights = new Int16Array(N * N);
  for (let i = 0; i < N * N; i++) heights[i] = centre.top(i);
  const cubeArray = new Float32Array(cubes);
  const transfer: Transferable[] = [land.positions.buffer, land.normals.buffer, land.colors.buffer, land.indices.buffer, land.mats.buffer, heights.buffer, cubeArray.buffer];
  if (water) transfer.push(water.positions.buffer, water.normals.buffer, water.colors.buffer, water.indices.buffer, water.mats.buffer);
  post({ type: 'mesh', id, cx, cz, lod, land, water, cubes: cubeArray, props, wants: [...wants], heights, size: N, ms: performance.now() - started }, transfer);
}

/** A 16 x 16 minimap tile: ground colour shaded by height, water in blue. */
function minimap(id: number, cx: number, cz: number): void {
  const lr = lowRes(world!, cx, cz, 4);
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  for (let k = 0; k < 256; k++) {
    const top = lr.top[k]!;
    const w = lr.water[k]!;
    let r: number, g: number, b: number;
    if (w !== NO_WATER && w > top * WATER_PER_UNIT) {
      [r, g, b] = [52, 96, 160];
    } else {
      const c = MATERIALS[lr.material[k]!]?.colour ?? 0;
      const west = k % 16 > 0 ? lr.top[k - 1]! : top;
      const shade = Math.max(0.6, Math.min(1.35, 1 + (top - west) * 0.04 + top * 0.002));
      r = ((c >> 16) & 255) * shade;
      g = ((c >> 8) & 255) * shade;
      b = (c & 255) * shade;
    }
    rgba.set([r, g, b, 255], k * 4);
  }
  post({ type: 'minimap', id, cx, cz, rgba }, [rgba.buffer]);
}

self.onmessage = (ev: MessageEvent<ToMesh>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      world = new World(msg.seed, msg.players);
      // Where the bands lie, for the land's textures: measured from the start pockets once they are placed.
      void world.gen.start;
      const layout = world.layout;
      post({ type: 'bands', anchors: layout.bandAnchors.map((a): [number, number] => [a.x, a.z]), starts: [...layout.bandStarts] }, []);
      break;
    }
    case 'deltas':
      for (const d of msg.deltas) applyChunkDelta(world!, d);
      break;
    case 'mesh':
      mesh(msg.id, msg.cx, msg.cz, msg.lod, msg.simStep, msg.scenery);
      break;
    case 'minimap':
      minimap(msg.id, msg.cx, msg.cz);
      break;
    case 'propModels':
      for (const [id, ...b] of msg.bounds) modelBounds.set(id, b);
      break;
  }
};

