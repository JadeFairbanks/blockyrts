// Projects selectable things to the screen each frame: their screen box,
// centre and depth. Things whose centre is off screen or under a HUD panel are
// not in the game view and are left out (the box ignores what the HUD hides).
import * as THREE from 'three';
import type { RtsCamera } from '../camera/rts-camera.ts';
import { pointInRect, type Pt, type Rect } from '../hud/rects.ts';
import type { ScreenItem } from './rules.ts';
import type { Selectable } from './types.ts';

const corner = new THREE.Vector3();
const p: Pt = { x: 0, y: 0 };

export function projectCandidates(
  candidates: Iterable<Selectable>,
  cam: RtsCamera,
  width: number,
  height: number,
  panels: readonly Rect[],
  out: ScreenItem<Selectable>[],
): ScreenItem<Selectable>[] {
  out.length = 0;
  const eye = cam.camera.position;
  for (const s of candidates) {
    if (!cam.project(s.centre, p)) continue;
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
    if (panels.some((r) => pointInRect(p, r))) continue;
    const cx = p.x;
    const cy = p.y;
    let x0 = cx;
    let y0 = cy;
    let x1 = cx;
    let y1 = cy;
    for (let i = 0; i < 8; i++) {
      corner.set(
        s.centre.x + (i & 1 ? s.halfSize.x : -s.halfSize.x),
        s.centre.y + (i & 2 ? s.halfSize.y : -s.halfSize.y),
        s.centre.z + (i & 4 ? s.halfSize.z : -s.halfSize.z),
      );
      if (!cam.project(corner, p)) continue;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    out.push({ item: s, rect: { x0, y0, x1, y1 }, x: cx, y: cy, depth: eye.distanceTo(s.centre) });
  }
  return out;
}
