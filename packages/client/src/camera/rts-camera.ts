// The RTS camera (Controls > Camera): a fixed downward angle that never tilts,
// zoom between two limits towards the point under the cursor, panning clamped
// to the world limits, and a focus height that follows the ground so hills
// never swallow the camera. Jade's Patch 5: it turns round the middle of the
// view on two keys, "the angle the camera is looking down at something is
// still fixed", so the far side of a building can be seen; a double tap of
// either key turns it back to north.
import * as THREE from 'three';
import type { Pt } from '../hud/rects.ts';
import type { CameraLimits, GroundPicker } from '../selection/types.ts';

/** Downward angle from the horizontal (kept from M0). */
export const CAMERA_PITCH_DEG = 55;
/** Vertical field of view. */
export const CAMERA_FOV_DEG = 40;
/**
 * Closest and farthest distance from the focus point, and where a game and
 * Reset zoom start, metres. Patch 2 (Jade): start 10% more zoomed in (40 to
 * 36 m) and zoom out 20% less far (80 to 64 m).
 */
export const MIN_DISTANCE = 12;
export const MAX_DISTANCE = 64;
export const DEFAULT_DISTANCE = 36;
/** Pan speed at multiplier 1: this many camera distances per second (about 0.8 screen heights a second). */
export const PAN_RATE = 0.9;
/** Each wheel notch (deltaY 100) at zoom speed 1 changes the distance by this factor. */
export const ZOOM_STEP = 1.18;
/** Patch 5: how fast the camera turns while a turn key is held, degrees a second (s: the far side of a building in 1.5 s). */
export const TURN_RATE_DEG = 120;
/** How quickly a turn gets up to speed and stops once the key is let go, per second (s: about a twentieth of a second). */
const TURN_EASE = 20;
/** How quickly a double tap turns the camera back to north, per second (s: most of the way in a quarter of a second). */
const RESET_EASE = 12;

const PITCH = THREE.MathUtils.degToRad(CAMERA_PITCH_DEG);
const DOWN = new THREE.Vector3(0, -1, 0);
const TURN_RATE = THREE.MathUtils.degToRad(TURN_RATE_DEG);

/** An angle brought into -π to π, so a reset takes the short way round. */
function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

export interface CameraView {
  x: number;
  z: number;
  distance: number;
}

export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly focus = new THREE.Vector3();
  distance = DEFAULT_DISTANCE;
  /**
   * How far the camera has turned round the focus, radians, -π to π: 0 looks
   * north (towards -z) from the south, as the camera always did before Patch
   * 5; more turns it to its right round the focus.
   */
  yaw = 0;
  private turnDir = 0;
  private turnVel = 0;
  private resetting = false;
  private targetDistance = DEFAULT_DISTANCE;
  private zoomAnchor: Pt | null = null;
  private width = 1;
  private height = 1;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmp = new THREE.Vector3();
  private grab: THREE.Vector3 | null = null;
  private heightKnown = false;

  constructor(
    private readonly limits: () => CameraLimits,
    private ground: GroundPicker | null,
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.5, 2000);
    this.place();
  }

  setGround(ground: GroundPicker | null): void {
    this.ground = ground;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.place();
  }

  private place(): void {
    const f = this.focus;
    const flat = Math.cos(PITCH) * this.distance;
    this.camera.position.set(f.x + Math.sin(this.yaw) * flat, f.y + Math.sin(PITCH) * this.distance, f.z + Math.cos(this.yaw) * flat);
    this.camera.lookAt(f);
    this.camera.updateMatrixWorld();
  }

  /** A raycaster through a screen point. */
  rayAt(p: Pt): THREE.Raycaster {
    this.ndc.set((p.x / this.width) * 2 - 1, -(p.y / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray;
  }

  /** Where a screen point's ray meets the flat plane at the focus height (or y). */
  onPlane(p: Pt, y = this.focus.y, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.plane.constant = -y;
    return this.rayAt(p).ray.intersectPlane(this.plane, out);
  }

  /** The ground under a screen point: the world's ground picker, else the plane at the focus height. */
  pick(p: Pt): THREE.Vector3 | null {
    const ray = this.rayAt(p);
    const hit = this.ground?.(ray) ?? null;
    return hit ?? this.onPlane(p);
  }

  /** Projects a world point to the screen; false when it is behind the camera. */
  project(v: THREE.Vector3, out: Pt): boolean {
    this.tmp.copy(v).project(this.camera);
    out.x = ((this.tmp.x + 1) / 2) * this.width;
    out.y = ((1 - this.tmp.y) / 2) * this.height;
    return this.tmp.z < 1;
  }

  private clampFocus(): void {
    const l = this.limits();
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, l.minX, l.maxX);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, l.minZ, l.maxZ);
  }

  /** Metres per second of panning at multiplier 1; scales with zoom. */
  panSpeed(): number {
    return this.distance * PAN_RATE;
  }

  /** Moves the focus by a world offset, metres. */
  panBy(dx: number, dz: number): void {
    this.focus.x += dx;
    this.focus.z += dz;
    this.clampFocus();
    this.place();
  }

  /** Moves the focus by an offset along the view, metres: dx to the right of the screen, dy down it. */
  panView(dx: number, dy: number): void {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    this.panBy(dx * c + dy * s, dy * c - dx * s);
  }

  /** The direction that is right on the screen, along the ground (a unit vector). */
  right(): { x: number; z: number } {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  /** Patch 5: which way a held turn key turns the camera this frame: -1 left, 1 right, 0 neither. */
  setTurn(dir: number): void {
    this.turnDir = Math.sign(dir);
    if (this.turnDir !== 0) this.resetting = false;
  }

  /** Patch 5: a double tap of a turn key: back to north, the short way round, smoothly. */
  resetTurn(): void {
    this.resetting = true;
    this.turnDir = 0;
    this.turnVel = 0;
  }

  jumpTo(x: number, z: number): void {
    this.focus.x = x;
    this.focus.z = z;
    this.clampFocus();
    this.place();
  }

  /** Zooms by a distance factor (>1 out, <1 in) towards a screen point, or the screen centre for null. */
  zoomBy(factor: number, anchor: Pt | null): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
    this.zoomAnchor = anchor ? { x: anchor.x, y: anchor.y } : null;
  }

  resetZoom(): void {
    this.targetDistance = DEFAULT_DISTANCE;
    this.zoomAnchor = null;
  }

  view(): CameraView {
    return { x: this.focus.x, z: this.focus.z, distance: this.targetDistance };
  }

  setView(v: CameraView): void {
    this.distance = this.targetDistance = THREE.MathUtils.clamp(v.distance, MIN_DISTANCE, MAX_DISTANCE);
    this.zoomAnchor = null;
    this.jumpTo(v.x, v.z);
  }

  /** Middle drag: remembers the ground point under the cursor. */
  grabStart(p: Pt): void {
    this.grab = this.onPlane(p);
  }

  /** Middle drag: moves the camera so the grabbed ground point stays under the cursor. */
  grabMove(p: Pt): void {
    if (!this.grab) return;
    const cur = this.onPlane(p, this.grab.y);
    if (!cur) return;
    this.panBy(this.grab.x - cur.x, this.grab.z - cur.z);
  }

  grabEnd(): void {
    this.grab = null;
  }

  update(dt: number): void {
    // Patch 5: turn round the focus while a turn key is held, easing in and out; or back to north after a double tap.
    this.turnVel += (this.turnDir * TURN_RATE - this.turnVel) * (1 - Math.exp(-TURN_EASE * dt));
    if (this.turnDir === 0 && Math.abs(this.turnVel) < 1e-3) this.turnVel = 0;
    if (this.turnVel !== 0) this.yaw = wrapAngle(this.yaw + this.turnVel * dt);
    if (this.resetting) {
      this.yaw *= Math.exp(-RESET_EASE * dt);
      if (Math.abs(this.yaw) < 1e-3) {
        this.yaw = 0;
        this.resetting = false;
      }
    }
    this.place();
    // Follow the ground height under the focus, smoothed.
    if (this.ground) {
      this.ray.set(this.tmp.set(this.focus.x, 1e5, this.focus.z), DOWN);
      const hit = this.ground(this.ray);
      if (hit) {
        const k = this.heightKnown ? 1 - Math.exp(-6 * dt) : 1;
        this.focus.y += (hit.y - this.focus.y) * k;
        this.heightKnown = true;
      }
    }
    // Smooth zoom in log space, keeping the ground point under the anchor where it is.
    if (Math.abs(this.distance - this.targetDistance) > 1e-3) {
      const a = Math.log(this.distance);
      const b = Math.log(this.targetDistance);
      let next = Math.exp(a + (b - a) * (1 - Math.exp(-14 * dt)));
      if (Math.abs(next - this.targetDistance) < 0.01) next = this.targetDistance;
      const before = this.zoomAnchor ? this.onPlane(this.zoomAnchor) : null;
      this.distance = next;
      this.place();
      const after = this.zoomAnchor && before ? this.onPlane(this.zoomAnchor) : null;
      if (before && after) {
        this.focus.x += before.x - after.x;
        this.focus.z += before.z - after.z;
        this.clampFocus();
      }
    }
    this.place();
  }

  /** The four screen corners on the ground plane at the focus height (top left, top right, bottom right, bottom left). */
  footprint(): THREE.Vector3[] | null {
    const out: THREE.Vector3[] = [];
    for (const p of [
      { x: 0, y: 0 },
      { x: this.width, y: 0 },
      { x: this.width, y: this.height },
      { x: 0, y: this.height },
    ]) {
      const v = this.onPlane(p);
      if (!v) return null;
      out.push(v);
    }
    return out;
  }
}
