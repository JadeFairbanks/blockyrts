// Bolts playing their own loops in flight (Patch 5, PRE-3: "Make sure to use
// all of what I give you"): the animated drawer tilts a model along its arc
// as well as turning it, units still stand level, and the bolt models carry
// the loops they fly with.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstancedModel, type ModelData } from '../src/models/index.ts';
import { aimAlong } from '../src/world/spell-fx.ts';

const MODELS = fileURLToPath(new URL('../../assets/src/models/', import.meta.url));

/** A one-bone, one-triangle model, enough to build an InstancedModel without a GPU. */
function tinyModel(): ModelData {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  g.setAttribute('bone', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 1));
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 1));
  g.setIndex([0, 1, 2]);
  return {
    id: 'tiny',
    category: 'test',
    sidecar: {} as ModelData['sidecar'],
    geometry: g,
    texture: new THREE.Texture(),
    boneCount: 1,
    boneNames: ['root'],
    partNames: [],
    clips: new Map(),
    boundingBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0)),
    restWorld: [new THREE.Matrix4()],
  };
}

/** Instance 0's first bone matrix as the vertex shader reads it from the bone texture. */
function uploaded(m: InstancedModel): THREE.Matrix4 {
  const data = (m as unknown as { boneData: Float32Array }).boneData;
  return new THREE.Matrix4().fromArray(Array.from(data.subarray(0, 16)));
}

describe('the animated drawer tilts along an arc', () => {
  it('keeps units level: no pitch places an instance as before', () => {
    const m = new InstancedModel(tinyModel(), 2);
    m.setInstance(0, 3, 4, 5, 0.7, '', 0, null, 2);
    m.setCount(1);
    m.commit();
    const before = new THREE.Matrix4().makeRotationY(0.7).scale(new THREE.Vector3(2, 2, 2)).setPosition(3, 4, 5).toArray();
    uploaded(m).toArray().forEach((v, k) => expect(v).toBeCloseTo(before[k]!, 5));
    m.boneWorld(0, 0, new THREE.Matrix4()).toArray().forEach((v, k) => expect(v).toBeCloseTo(before[k]!, 5));
  });

  it('raises the -Z end by the pitch, then turns by the heading, in the bone texture and boneWorld alike', () => {
    const m = new InstancedModel(tinyModel(), 2);
    m.setInstance(0, 1, 2, 3, 0.9, '', 0, null, 1, 0.4);
    m.setCount(1);
    m.commit();
    const nose = new THREE.Vector3(0, 0, -1).applyMatrix4(uploaded(m)).sub(new THREE.Vector3(1, 2, 3));
    expect(nose.y).toBeCloseTo(Math.sin(0.4));
    expect(nose.x).toBeCloseTo(-Math.sin(0.9) * Math.cos(0.4));
    expect(nose.z).toBeCloseTo(-Math.cos(0.9) * Math.cos(0.4));
    const world = m.boneWorld(0, 0, new THREE.Matrix4()).toArray();
    uploaded(m).toArray().forEach((v, k) => expect(world[k]).toBeCloseTo(v));
  });

  it('points a bolt\'s nose, -Z or +Z, along where it flies', () => {
    for (const d of [new THREE.Vector3(1, 0.3, -2), new THREE.Vector3(-0.2, -0.9, 0.1), new THREE.Vector3(0, 0, 1)]) {
      const dir = d.clone().normalize();
      for (const minusZ of [true, false]) {
        const { heading, pitch } = aimAlong(dir, minusZ);
        const m = new InstancedModel(tinyModel(), 1);
        m.setInstance(0, 0, 0, 0, heading, '', 0, null, 1, pitch);
        const nose = new THREE.Vector3(0, 0, minusZ ? -1 : 1).applyMatrix4(m.boneWorld(0, 0, new THREE.Matrix4()));
        expect(nose.x).toBeCloseTo(dir.x);
        expect(nose.y).toBeCloseTo(dir.y);
        expect(nose.z).toBeCloseTo(dir.z);
      }
    }
  });
});

describe('the bolts\' own loops', () => {
  it('are in the models flown in the game', () => {
    const files = new Map<string, string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.bbmodel')) files.set(name.slice(0, -'.bbmodel'.length), full);
      }
    };
    walk(MODELS);
    const loops = (id: string): string[] => {
      const raw = JSON.parse(readFileSync(files.get(id)!, 'utf8')) as { animations?: Array<{ name: string; loop: string }> };
      return (raw.animations ?? []).filter((a) => a.loop === 'loop').map((a) => a.name);
    };
    for (const id of ['arcane_bolt', 'energy_dart', 'spark', 'mana_bolt', 'hellfire', 'necromancer_bolt', 'fairy_bolt']) expect(loops(id)[0], id).toBe('ripple');
    expect(loops('reveler_bolt')[0]).toBe('fly');
  });
});
