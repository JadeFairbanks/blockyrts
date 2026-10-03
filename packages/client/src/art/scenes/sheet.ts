// A contact sheet for picking poses: one model in one clip at n evenly spaced
// times, side by side (scene=sheet&model=minotaur&clip=attack_cleave&n=8,
// optional parts=a,b and hold=item@slot,item@slot). A tool for staging, not
// a picture for the game.
import * as THREE from 'three';
import { NEUTRAL_GRADE } from '../post.ts';
import { figure } from '../pose.ts';
import type { Stager } from './types.ts';

export const sheetScene: Stager = {
  get models(): string[] {
    const p = new URLSearchParams(location.search);
    const hold = (p.get('hold') ?? '').split(',').filter(Boolean).map((h) => h.split('@')[0]!);
    return [p.get('model') ?? 'warrior', ...hold];
  },
  async build({ library, params }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a3040);
    const id = params.get('model') ?? 'warrior';
    const clip = params.get('clip') ?? 'idle';
    const n = Number(params.get('n') ?? 8);
    const model = library.models.get(id);
    const length = model?.clips.get(clip)?.length ?? 1;
    const size = model ? model.boundingBox.max.y - model.boundingBox.min.y : 2;
    const step = size * 0.9;
    const heading = Number(params.get('heading') ?? Math.PI * 0.75);
    const parts = (params.get('parts') ?? '').split(',').filter(Boolean);
    const hold = (params.get('hold') ?? '').split(',').filter(Boolean).map((h) => h.split('@') as [string, string]);
    for (let i = 0; i < n; i++) {
      const t = (length * i) / Math.max(1, n - 1);
      scene.add(await figure(library, { body: id, clip, time: t, parts, hold, glow: 3 }, (i - (n - 1) / 2) * step, 0, 0, heading));
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-3, 6, 8);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 500);
    const w = n * step;
    camera.position.set(0, size * 0.7, w * 1.25);
    camera.lookAt(0, size * 0.45, 0);
    return {
      scene,
      camera,
      finish: { grade: { ...NEUTRAL_GRADE }, bloom: null, ao: 0 },
      note: `${id} ${clip} (${length}s) at ${Array.from({ length: n }, (_, i) => ((length * i) / Math.max(1, n - 1)).toFixed(2)).join(', ')}`,
    };
  },
};
