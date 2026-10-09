import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildModels, ASSETS_DIR } from '../src/models/build-models.ts';
import { convertModel, type ConvertedModel } from '../src/models/convert.ts';
import { readGlb } from '../src/models/glb.ts';
import { deviationsFor, parseManifestDeviations } from '../src/models/manifest.ts';
import { encodePng } from '../src/models/png.ts';
import { textureLooks } from '../src/models/texture-looks.ts';

const BASE = ['worker', 'warrior', 'mage'];

function convertBase(id: string): ConvertedModel {
  const source = `base/models/peoples/${id}/${id}.bbmodel`;
  const raw: unknown = JSON.parse(readFileSync(join(ASSETS_DIR, source), 'utf8'));
  return convertModel(raw, { id, category: 'peoples', source });
}

type Json = Record<string, unknown> & {
  accessors: { bufferView: number; componentType: number; count: number; type: string; byteOffset?: number }[];
  bufferViews: { byteOffset: number; byteLength: number; byteStride?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  nodes: { name: string; children?: number[] }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number }[] }[];
};

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Reads an accessor as plain numbers (float or unsigned short / int). */
function accessor(json: Json, bin: Uint8Array, index: number): number[] {
  const a = json.accessors[index];
  if (!a) throw new Error(`no accessor ${index}`);
  const view = json.bufferViews[a.bufferView];
  if (!view) throw new Error('no buffer view');
  const n = COMPONENTS[a.type] ?? 1;
  const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
  const stride = view.byteStride ?? n * size;
  const dv = new DataView(bin.buffer, bin.byteOffset + view.byteOffset + (a.byteOffset ?? 0));
  const out: number[] = [];
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) {
      const at = i * stride + c * size;
      out.push(a.componentType === 5126 ? dv.getFloat32(at, true) : a.componentType === 5125 ? dv.getUint32(at, true) : dv.getUint16(at, true));
    }
  }
  return out;
}

function rotate(q: number[], v: [number, number, number]): [number, number, number] {
  const [x = 0, y = 0, z = 0, w = 1] = q;
  const [vx, vy, vz] = v;
  // v + 2w (q x v) + 2 q x (q x v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

describe('the model converter on the base bodies', () => {
  const results = new Map(BASE.map((id) => [id, convertBase(id)]));

  it.each(BASE)('%s converts without violations', (id) => {
    const r = results.get(id);
    expect(r?.violations).toEqual([]);
    expect(r?.glb).not.toBeNull();
    expect(r?.sidecar?.bones[0]?.name).toBe('root');
  });

  it.each(BASE)('%s writes a well-formed glb', (id) => {
    const r = results.get(id) as ConvertedModel;
    const { json: raw, bin } = readGlb(r.glb as Uint8Array);
    const json = raw as Json;
    expect((json.asset as { version: string }).version).toBe('2.0');
    expect(json.meshes).toHaveLength(1);
    const prim = json.meshes[0]?.primitives[0];
    expect(prim).toBeDefined();
    const attrs = prim?.attributes ?? {};
    expect(Object.keys(attrs).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0', '_BONE', '_PART']);
    const count = json.accessors[attrs.POSITION ?? -1]?.count ?? 0;
    expect(count).toBe(r.sidecar?.vertices);
    expect(count % 4).toBe(0);
    for (const name of ['NORMAL', 'TEXCOORD_0', '_BONE', '_PART']) expect(json.accessors[attrs[name] ?? -1]?.count).toBe(count);
    const bones = accessor(json, bin, attrs._BONE ?? -1);
    const nBones = r.sidecar?.bones.length ?? 0;
    expect(bones.every((b) => Number.isInteger(b) && b >= 0 && b < nBones)).toBe(true);
    const parts = accessor(json, bin, attrs._PART ?? -1);
    expect(parts.every((p) => p >= 0 && p <= (r.sidecar?.parts.length ?? 0))).toBe(true);
    const indices = accessor(json, bin, prim?.indices ?? -1);
    expect(indices.length % 3).toBe(0);
    expect(indices.every((i) => i < count)).toBe(true);
    // One node per bone, named in the same order, plus the mesh node.
    expect(json.nodes.slice(0, nBones).map((n) => n.name)).toEqual(r.sidecar?.bones.map((b) => b.name));
    expect(json.images).toHaveLength(1);
    expect((json.samplers as { magFilter: number; minFilter: number }[])[0]).toMatchObject({ magFilter: 9728, minFilter: 9728 });
    // Every animation channel's times and values line up.
    for (const anim of json.animations) {
      for (const ch of anim.channels) {
        const s = anim.samplers[ch.sampler];
        expect(json.accessors[s?.input ?? -1]?.count).toBe(json.accessors[s?.output ?? -1]?.count);
      }
    }
    expect(json.animations.map((a) => a.name)).toEqual(r.sidecar?.clips.map((c) => c.name));
  });

  it.each(['worker', 'warrior'])('%s has idle and walk clips', (id) => {
    const { json } = readGlb(results.get(id)?.glb as Uint8Array);
    const names = (json as Json).animations.map((a) => a.name);
    expect(names).toContain('idle');
    expect(names).toContain('walk');
  });

  it('places the worker in metres, standing on y = 0, 1.69 m tall', () => {
    const s = results.get('worker')?.sidecar;
    expect(s?.bounds.min[1]).toBeCloseTo(0, 6);
    expect(s?.bounds.max[1]).toBeCloseTo(60 * 0.028125, 6);
    expect(s?.parts).toEqual(['hardwood_axe', 'hoe', 'fishing_rod', 'iron_pick', 'spade', 'hammer']);
    expect(s?.clips.find((c) => c.name === 'walk')).toMatchObject({ length: 1, loop: true, keys: [] });
    expect(s?.clips.find((c) => c.name === 'death')).toMatchObject({ loop: false, mode: 'hold' });
  });

  it('faces -Z when unrotated: the nose sticks out of the head on the -Z side', () => {
    const r = results.get('worker') as ConvertedModel;
    const { json: raw, bin } = readGlb(r.glb as Uint8Array);
    const json = raw as Json;
    const attrs = json.meshes[0]?.primitives[0]?.attributes ?? {};
    const pos = accessor(json, bin, attrs.POSITION ?? -1);
    const bones = accessor(json, bin, attrs._BONE ?? -1);
    const head = r.sidecar?.bones.findIndex((b) => b.name === 'head') ?? -1;
    let minZ = Infinity;
    let maxZ = -Infinity;
    bones.forEach((b, i) => {
      if (b !== head) return;
      minZ = Math.min(minZ, pos[i * 3 + 2] ?? 0);
      maxZ = Math.max(maxZ, pos[i * 3 + 2] ?? 0);
    });
    expect(minZ).toBeCloseTo(-5 * 0.028125, 6); // the nose, 1 unit in front of the 8-unit head
    expect(maxZ).toBeCloseTo(4 * 0.028125, 6);
    // The right arm (the creature's own right) is on +X.
    const arm = r.sidecar?.bones.find((b) => b.name === 'arm_upper_r');
    expect(arm?.pivot[0]).toBeGreaterThan(0);
  });

  it("swings the right leg forward (-Z) at the start of the worker's walk", () => {
    const r = results.get('worker') as ConvertedModel;
    const { json: raw, bin } = readGlb(r.glb as Uint8Array);
    const json = raw as Json;
    const walk = json.animations.find((a) => a.name === 'walk');
    const leg = json.nodes.findIndex((n) => n.name === 'leg_upper_r');
    const ch = walk?.channels.find((c) => c.target.node === leg && c.target.path === 'rotation');
    const q = accessor(json, bin, walk?.samplers[ch?.sampler ?? -1]?.output ?? -1).slice(0, 4);
    // Jade's improved walk (Patch 5) starts at x = -47.5 degrees, with a little y and z: the foot well forward, toward -Z.
    const foot = rotate(q, [0, -1, 0]);
    expect(foot[2]).toBeLessThan(-Math.sin((40 * Math.PI) / 180));
  });

  it('builds index.json and a sidecar per model', () => {
    const out = mkdtempSync(join(tmpdir(), 'models-'));
    try {
      const result = buildModels({ outDir: out });
      expect(result.ok).toBe(true);
      const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')) as { models: { id: string; lazy?: true }[] };
      // The base bodies are always there; the modelling bot's catalogue (packages/assets/src) adds more once merged.
      expect(index.models.map((m) => m.id)).toEqual(expect.arrayContaining(BASE));
      expect(new Set(index.models.map((m) => m.id)).size).toBe(index.models.length);
      // Patch 5: the robe looks, a kit tier's metal look and a building's stages, ruins and damaged look, the last three loaded only when drawn.
      const lazy = new Map(index.models.map((m) => [m.id, m.lazy === true]));
      expect(lazy.get('mage_battle_6')).toBe(false);
      for (const id of ['sword@iron_wrought', 'main_base_l2@construction_33', 'main_base_l2@ruined', 'main_base_l2@damaged']) expect(lazy.get(id), id).toBe(true);
      expect(lazy.get('bush_hazel@cut')).toBe(false);
      const sidecar = JSON.parse(readFileSync(join(out, 'mage.json'), 'utf8')) as { id: string };
      expect(sidecar.id).toBe('mage');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('the model converter on state sets hidden by default', () => {
  const source = 'src/models/buildings/main_base_l2/main_base_l2.bbmodel';
  const raw = JSON.parse(readFileSync(join(ASSETS_DIR, source), 'utf8')) as {
    elements: { uuid: string; faces: Record<string, { texture: unknown } | undefined> }[];
    outliner: Array<{ name: string; visibility?: boolean; children: unknown[] }>;
  };
  const r = convertModel(raw, { id: 'main_base_l2', category: 'buildings', source });

  /** Cubes under a group, however deep. */
  const cubesIn = (node: { children: unknown[] }): string[] =>
    node.children.flatMap((c) => (typeof c === 'string' ? [c] : cubesIn(c as { children: unknown[] })));

  // main_base_l2 (unused since Patch 5) still carries its state sets; the remade tiers have none.
  it('draws only the finished main base, not its scaffolds and ruin', () => {
    const root = raw.outliner[0]!;
    const groups = root.children.filter((c): c is { name: string; visibility?: boolean; children: unknown[] } => typeof c !== 'string');
    const finished = groups.find((g) => g.name === 'finished')!;
    expect(groups.filter((g) => g.visibility === false).map((g) => g.name)).toEqual(['construction_0', 'construction_33', 'construction_66', 'ruined']);
    const drawn = new Set(cubesIn(finished));
    // Four vertices per drawn face, faces of the finished set only.
    const faces = raw.elements.filter((e) => drawn.has(e.uuid)).reduce((n, e) => n + Object.values(e.faces).filter((f) => f && f.texture !== null && f.texture !== undefined).length, 0);
    expect(r.errors).toEqual([]);
    expect(r.sidecar?.cubes).toBe(drawn.size);
    expect(r.sidecar?.vertices).toBe(faces * 4);
    // The bones of the hidden sets stay, so clip and bone indices do not move.
    expect(r.sidecar?.bones.map((b) => b.name)).toEqual(expect.arrayContaining(['construction_0', 'ruined']));
  });

  it('keeps stowed equipment under a slot as a part the game shows on demand', () => {
    const w = convertBase('warrior');
    expect(w.sidecar?.parts).toEqual(expect.arrayContaining(['quiver', 'bow']));
  });
});

function syntheticBadModel(): unknown {
  const png = encodePng({ width: 300, height: 300, data: new Uint8Array(300 * 300 * 4).fill(200) });
  const face = { uv: [0, 0, 4, 4], texture: 0 };
  const faces = { north: face, east: face, south: face, west: face, up: face, down: face };
  const elements = Array.from({ length: 41 }, (_, i) => ({
    uuid: `c${i}`, name: `cube_${i}`, type: 'cube', from: [-2, 0, -2], to: [2, 4 + i, 2], origin: [0, 0, 0], faces,
  }));
  return {
    meta: { format_version: '4.5', model_format: 'free', box_uv: false },
    resolution: { width: 300, height: 300 },
    elements,
    outliner: [{ uuid: 'g0', name: 'root', origin: [0, 0, 0], children: [{ uuid: 'g1', name: 'Arm_Upper', origin: [0, 0, 0], children: elements.map((e) => e.uuid) }] }],
    textures: [{ name: 'bad.png', uuid: 't0', uv_width: 300, uv_height: 300, source: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }],
    animations: [],
  };
}

describe('the model converter on a bad model', () => {
  const info = { id: 'bad_model', category: 'peoples', source: 'src/models/peoples/bad_model/bad_model.bbmodel' };

  it('reports each violation', () => {
    const r = convertModel(syntheticBadModel(), info);
    const rules = r.errors.map((v) => v.rule).sort();
    expect(rules).toEqual(['bone-name', 'cube-budget', 'texture-size']);
    expect(r.errors.find((v) => v.rule === 'bone-name')?.message).toContain('Arm_Upper');
    expect(r.errors.find((v) => v.rule === 'texture-size')?.message).toContain('300 x 300');
    expect(r.errors.find((v) => v.rule === 'cube-budget')?.message).toContain('41 cubes');
  });

  it('lets a MANIFEST.md deviation waive a rule', () => {
    const manifest = [
      '# Asset manifest',
      '',
      '## peoples',
      '',
      '| id | path | cube count | texture size | deviation and reason |',
      '|---|---|---|---|---|',
      '| bad_model | models/peoples/bad_model/bad_model.bbmodel | 41 | 300x300 | cube budget: 41 cubes for the test |',
      '| other | models/peoples/other/other.bbmodel | 20 | 64x64 | |',
    ].join('\n');
    const rows = parseManifestDeviations(manifest);
    expect(rows.map((r) => r.id)).toEqual(['bad_model', 'other']);
    expect(rows[0]?.path).toBe('models/peoples/bad_model/bad_model.bbmodel');
    const r = convertModel(syntheticBadModel(), info, deviationsFor(rows, 'bad_model'));
    expect(r.violations.find((v) => v.rule === 'cube-budget')?.waived).toBe(true);
    expect(r.errors.map((v) => v.rule).sort()).toEqual(['bone-name', 'texture-size']);
    expect(deviationsFor(rows, 'other')).toEqual([]);
  });
});

describe('texture looks (Patch 5 stone circles)', () => {
  it('draws each extra texture of a file as a look of its own, `<id>~<look>`', () => {
    const raw = {
      textures: [{ name: 'rock.png', width: 16, height: 16 }, { name: 'rock_mossy.png', width: 16, height: 16 }, { name: 'other.png', width: 16, height: 16 }],
      elements: [{ faces: { north: { texture: 0 }, south: { texture: null } } }],
    };
    const looks = textureLooks(raw, 'rock');
    expect(looks.map((l) => l.look)).toEqual(['mossy']);
    expect((looks[0]!.raw as typeof raw).elements[0]!.faces.north.texture).toBe(1);
    expect(raw.elements[0]!.faces.north.texture).toBe(0);
  });
});
