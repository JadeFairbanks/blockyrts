// A fog night's drifting fog (Patch 5, the lighting sheet's fog night): the
// art set's fog_drift sprites lie low over the ground round the camera and
// drift slowly across it, four frames at 4 frames a second, about half
// see-through, fading in and out with the fog.
import * as THREE from 'three';

const URLS = import.meta.glob<string>('../../../assets/src/sky/fog_drift.png', { eager: true, query: '?no-inline', import: 'default' });

/** How many banks of fog, and the square round the camera they drift in, metres. */
const BANKS = 64;
const AREA_M = 120;
/** One frame (64 by 32 px) at 9 cm a pixel, and how far above the ground. */
const BANK_W_M = 5.8;
const BANK_D_M = 2.9;
const ABOVE_M = 0.9;
/** The sheet: drift 0.5 tile a second (a 0.45 m column), four frames at 4 fps, alpha about 0.5. */
const DRIFT_M_S = 0.225;
const FRAMES = 4;
const FPS = 4;
const ALPHA = 0.5;

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const S = new THREE.Vector3(1, 1, 1);
const P = new THREE.Vector3();

export class FogDrift {
  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.Texture;
  /** Each bank's place in the square (0 to 1) and its own drift speed. */
  private readonly banks: Array<{ u: number; v: number; speed: number }> = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly heightAt: (x: number, z: number) => number | null,
  ) {
    this.texture = new THREE.TextureLoader().load(Object.values(URLS)[0] ?? '');
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.repeat.set(1 / FRAMES, 1);
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(BANK_W_M, BANK_D_M), this.material, BANKS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    // A fixed scatter, so the fog looks the same each time it rolls in.
    let seed = 0x5eed;
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < BANKS; i++) this.banks.push({ u: next(), v: next(), speed: 0.7 + 0.6 * next() });
    scene.add(this.mesh);
  }

  /** Once a frame: how deep the fog is (0 to 1), where the camera looks and the time, ms. */
  update(fog: number, focus: THREE.Vector3, now: number): void {
    this.mesh.visible = fog > 0.01;
    if (!this.mesh.visible) return;
    this.material.opacity = ALPHA * fog;
    const t = now / 1000;
    this.texture.offset.x = (Math.floor(t * FPS) % FRAMES) / FRAMES;
    const x0 = focus.x - AREA_M / 2;
    const z0 = focus.z - AREA_M / 2;
    for (let i = 0; i < BANKS; i++) {
      const b = this.banks[i]!;
      // Fixed to the world, wrapped into the square round the camera.
      const wx = b.u * AREA_M + t * DRIFT_M_S * b.speed;
      const wz = b.v * AREA_M;
      const x = x0 + wrap(wx - x0, AREA_M);
      const z = z0 + wrap(wz - z0, AREA_M);
      const ground = this.heightAt(x, z);
      P.set(x, (ground ?? focus.y) + ABOVE_M, z);
      M.compose(P, Q, S);
      this.mesh.setMatrixAt(i, M);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

function wrap(v: number, span: number): number {
  return ((v % span) + span) % span;
}
