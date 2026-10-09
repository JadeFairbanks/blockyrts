// Jade's Patch 5: two keys turn the camera round the middle of the view, "the
// angle the camera is looking down at something is still fixed", so the far
// side of a building can be seen; a double tap of either turns it back.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_PITCH_DEG, RtsCamera, TURN_RATE_DEG } from '../src/camera/rts-camera.ts';

function camera(): RtsCamera {
  const cam = new RtsCamera(() => ({ minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 }), null);
  cam.resize(1600, 900);
  cam.setView({ x: 10, z: 20, distance: 36 });
  return cam;
}

/** Runs the camera for a while at 60 frames a second. */
function run(cam: RtsCamera, seconds: number): void {
  for (let t = 0; t < seconds * 60; t++) cam.update(1 / 60);
}

/** The camera's downward angle, degrees. */
function pitch(cam: RtsCamera): number {
  const d = new THREE.Vector3().subVectors(cam.camera.position, cam.focus);
  return THREE.MathUtils.radToDeg(Math.atan2(d.y, Math.hypot(d.x, d.z)));
}

describe('turning the camera (Patch 5)', () => {
  it('turns round the middle of the view while a key is held, the downward angle and the middle staying put', () => {
    const cam = camera();
    const mid = { x: 800, y: 450 };
    cam.setTurn(1);
    run(cam, 180 / TURN_RATE_DEG + 0.05);
    cam.setTurn(0);
    run(cam, 0.5);
    // Half way round: looking south from the north side.
    expect(Math.abs(cam.yaw)).toBeGreaterThan(Math.PI * 0.95);
    expect(cam.camera.position.z).toBeLessThan(cam.focus.z);
    expect(pitch(cam)).toBeCloseTo(CAMERA_PITCH_DEG, 6);
    const under = cam.onPlane(mid)!;
    expect(under.x).toBeCloseTo(10, 6);
    expect(under.z).toBeCloseTo(20, 6);
  });

  it('pans along the screen whichever way it faces, and a double tap turns it back to north the short way', () => {
    const cam = camera();
    cam.setTurn(-1);
    run(cam, 90 / TURN_RATE_DEG);
    cam.setTurn(0);
    run(cam, 0.5);
    const yaw = cam.yaw;
    expect(yaw).toBeLessThan(-1);
    // Screen right is where a point to the right of the middle lies on the ground.
    const before = cam.onPlane({ x: 800, y: 450 })!;
    const toRight = cam.onPlane({ x: 1200, y: 450 })!.sub(before).normalize();
    const r = cam.right();
    expect(toRight.x).toBeCloseTo(r.x, 6);
    expect(toRight.z).toBeCloseTo(r.z, 6);
    cam.panView(5, 0);
    expect(cam.focus.x - 10).toBeCloseTo(5 * r.x, 6);
    expect(cam.focus.z - 20).toBeCloseTo(5 * r.z, 6);

    cam.resetTurn();
    let last = cam.yaw;
    for (let t = 0; t < 60; t++) {
      cam.update(1 / 60);
      // Never past north, and never the long way round.
      expect(cam.yaw).toBeLessThanOrEqual(0);
      expect(cam.yaw).toBeGreaterThanOrEqual(last);
      last = cam.yaw;
    }
    expect(cam.yaw).toBe(0);
    expect(cam.camera.position.x).toBeCloseTo(cam.focus.x, 6);
  });
});
