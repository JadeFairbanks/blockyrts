// Patch 7 (Jade: "make the smoke from gunpowder weapons start at the muzzle and
// move in the direction the gun was pointed when fired, like a real musket. Also
// the light flash from both muskets and cannons should be a bit more"): a shot's
// smoke follows its own flight, and a musket volley's flashes do not put out a
// cannonball's blast.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Shot, WU_PER_METRE, type HitEvent } from '@blockyrts/sim';
import { SHOT_STRIDE } from '../src/messages.ts';
import { FLASH, FLASH_LIGHTS, Flashes, shotDir } from '../src/world/units-view.ts';

/** A projectile row: where it is and where it will be next step (wu), its Shot. */
function row(x: number, y: number, z: number, nx: number, ny: number, nz: number, shot: number): number[] {
  const r = [x, y, z, nx, ny, nz, shot, 0];
  expect(r).toHaveLength(SHOT_STRIDE);
  return r;
}

describe('gun smoke along the shot', () => {
  const m = WU_PER_METRE;
  const left: HitEvent = { look: 'shot', x: 10 * m, y: 2 * m, z: 10 * m, id: 7, shot: Shot.MusketBall };

  it('takes the way the musket ball that just left flies', () => {
    const shots = new Int32Array([
      // An arrow by the shooter, and a musket ball far off: not this shot.
      ...row(10 * m, 2 * m, 10 * m, 9 * m, 2 * m, 10 * m, Shot.Arrow),
      ...row(40 * m, 2 * m, 40 * m, 41 * m, 2 * m, 40 * m, Shot.MusketBall),
      // This one, a step out along +z.
      ...row(10 * m, 2 * m, 11 * m, 10 * m, 2 * m, 12 * m, Shot.MusketBall),
    ]);
    const d = shotDir(shots, left, new THREE.Vector3())!;
    expect(d.z).toBeCloseTo(1, 5);
    expect(Math.abs(d.x)).toBeLessThan(1e-6);
  });

  it('gives none when no shot of its kind is near', () => {
    const shots = new Int32Array(row(40 * m, 2 * m, 40 * m, 41 * m, 2 * m, 40 * m, Shot.MusketBall));
    expect(shotDir(shots, left, new THREE.Vector3())).toBeNull();
  });
});

describe('muzzle flashes', () => {
  function lights(scene: THREE.Scene): THREE.PointLight[] {
    return scene.children.filter((c): c is THREE.PointLight => c instanceof THREE.PointLight);
  }

  it('a musket volley takes the faintest light, leaving a cannonball blast lit', () => {
    const scene = new THREE.Scene();
    const f = new Flashes(scene, FLASH_LIGHTS);
    f.add(50, 0, 0, FLASH.bomb);
    for (let k = 0; k < 6; k++) f.add(k, 1, 0, FLASH.musket);
    f.update(0.01, 1);
    expect(lights(scene).some((l) => l.position.x === 50 && l.intensity > FLASH.bomb.peak * 0.8)).toBe(true);
  });

  it('shows more by day than an explosion does', () => {
    const scene = new THREE.Scene();
    const f = new Flashes(scene, 1);
    f.add(0, 0, 0, FLASH.musket);
    f.update(0.01, 0);
    expect(lights(scene)[0]!.intensity / FLASH.musket.peak).toBeGreaterThan(0.2);
  });
});
