// Smoke from the chimneys of buildings at work, the Tavern's from dusk to
// dawn while it is open, and the Sanctum crystal's glow (Patch 5): when a
// building counts as at work, and that the models they come from carry the
// anchors and clips they are drawn at. The props' steam and glints come from
// their models' anchors, placed as the model is drawn.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildingKind, levelFootprint } from '@blockyrts/sim';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelData } from '../src/models/index.ts';
import { atWork } from '../src/world/building-glow.ts';
import { anchorsAt } from '../src/world/prop-models-view.ts';

const MODELS = fileURLToPath(new URL('../../assets/src/models/', import.meta.url));

/** Every .bbmodel in the catalogue by id. */
function catalogue(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) catalogue(full, out);
    else if (name.endsWith('.bbmodel')) out.set(name.slice(0, -'.bbmodel'.length), full);
  }
  return out;
}

interface Group {
  name: string;
  children: Array<Group | string>;
}

/** A model's group names and clip names. */
function read(file: string): { groups: string[]; clips: string[] } {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { outliner: Array<Group | string>; animations?: Array<{ name: string }> };
  const groups: string[] = [];
  const walk = (nodes: ReadonlyArray<Group | string>): void => {
    for (const n of nodes) {
      if (typeof n === 'string') continue;
      groups.push(n.name);
      walk(n.children);
    }
  };
  walk(raw.outliner);
  return { groups, clips: (raw.animations ?? []).map((a) => a.name) };
}

const base = { complete: true, queue: [] as Array<{ product: number; done: number; stepsLeft: number }>, working: 0, inside: [] as number[] };

describe('buildings at work', () => {
  it('works while its queue runs or its workers work, and the Sanctum while a mage trains inside', () => {
    expect(atWork({ ...base, kind: BuildingKind.Forge })).toBe(false);
    expect(atWork({ ...base, kind: BuildingKind.Forge, queue: [{ product: 1, done: 200, stepsLeft: 40 }] })).toBe(true);
    // A queue on hold (nothing to pay with) stands still.
    expect(atWork({ ...base, kind: BuildingKind.Forge, queue: [{ product: 1, done: 200, stepsLeft: 0 }] })).toBe(false);
    expect(atWork({ ...base, kind: BuildingKind.Mineshaft, working: 2 })).toBe(true);
    expect(atWork({ ...base, kind: BuildingKind.MagiSanctum, inside: [7] })).toBe(true);
    // Workers sheltering in a main base are not at work.
    expect(atWork({ ...base, kind: BuildingKind.MainBase, inside: [7] })).toBe(false);
    expect(atWork({ ...base, kind: BuildingKind.Forge, complete: false, queue: [{ product: 1, done: 200, stepsLeft: 40 }] })).toBe(false);
  });

  it('smokes and glows from the anchors of the models drawn in the game', () => {
    const models = catalogue(MODELS);
    const of = (kind: number): { groups: string[]; clips: string[] } => {
      const id = levelFootprint(kind, 1).models![0]!.id;
      const file = models.get(id);
      expect(file, id).toBeDefined();
      return read(file!);
    };
    for (const kind of [BuildingKind.Forge, BuildingKind.ArtilleryWorkshop, BuildingKind.Tavern]) expect(of(kind).groups).toContain('fx_smoke');
    const sanctum = of(BuildingKind.MagiSanctum);
    expect(sanctum.groups).toContain('fx_magic');
    expect(sanctum.clips).toContain('working');
    expect(of(BuildingKind.Forge).clips).toContain('working');
  });
});

describe('the props\' steam and glints', () => {
  it('come from the models\' own anchors', () => {
    const models = catalogue(MODELS);
    const groups = (id: string): string[] => read(models.get(id)!).groups;
    expect(groups('hot_spring')).toEqual(expect.arrayContaining(['fx_steam_1', 'fx_steam_2', 'fx_steam_3', 'fx_bubble']));
    expect(groups('rock_sulphur')).toEqual(expect.arrayContaining(['fx_steam', 'fx_steam_depleted']));
    for (const id of ['ore_node_gold', 'ore_node_silver']) expect(groups(id)).toEqual(expect.arrayContaining(['fx_glint_1', 'fx_glint_2', 'fx_glint_3']));
  });

  it('stand where the drawn model puts them: turned, sized and moved', () => {
    const model = { boneNames: ['root', 'fx_steam_1', 'fx_bubble'], restWorld: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(1, 2, 0), new THREE.Matrix4().makeTranslation(0, 1, 0)] } as unknown as ModelData;
    // A quarter turn: +x goes to -z, as the instanced draw turns the model.
    const [v] = anchorsAt(model, { id: 'hot_spring', x: 3, y: 10, z: 4, yaw: Math.PI / 2, scale: 2 }, 100, 200, /^fx_steam_\d+$/);
    expect(v!.x).toBeCloseTo(103);
    expect(v!.y).toBeCloseTo(14);
    expect(v!.z).toBeCloseTo(202);
  });
});
