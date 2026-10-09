// Hearts over two animals that breed together (Jade's BL-10: "draw hearts
// above them both when they reproduce together"): a little pixel heart pops
// up over each, rises and fades. The sim sends a 'heart' hit for each of the
// pair (animals/animals.ts haveYoung).

import * as THREE from 'three';

/** Hearts on screen at once at most. */
const MAX_HEARTS = 32;
/** How long a heart shows (s), how far it rises (m) and how big it grows (m). */
const LIFE_S = 1.8;
const RISE_M = 0.8;
const SIZE_M = 0.45;

/** The heart, a pixel at a time: 7 by 6, a highlight on its left lobe. */
const PATTERN = ['.##.##.', '#o#####', '#######', '.#####.', '..###..', '...#...'];

function heartTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 7;
  c.height = 6;
  const g = c.getContext('2d');
  if (g) {
    PATTERN.forEach((row, y) =>
      [...row].forEach((p, x) => {
        if (p === '.') return;
        g.fillStyle = p === 'o' ? '#ffd0d8' : '#e2304a';
        g.fillRect(x, y, 1, 1);
      }),
    );
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Hearts {
  private readonly pool: Array<{ sprite: THREE.Sprite; t0: number; x: number; y: number; z: number }> = [];

  constructor(scene: THREE.Scene) {
    const map = heartTexture();
    for (let k = 0; k < MAX_HEARTS; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.pool.push({ sprite, t0: -1, x: 0, y: 0, z: 0 });
    }
  }

  /** A heart over a point (m), from now (ms). */
  spawn(x: number, y: number, z: number, now: number): void {
    const h = this.pool.find((p) => p.t0 < 0) ?? this.pool.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
    h.t0 = now;
    h.x = x;
    h.y = y;
    h.z = z;
    h.sprite.visible = true;
  }

  update(now: number): void {
    for (const h of this.pool) {
      if (h.t0 < 0) continue;
      const t = (now - h.t0) / 1000 / LIFE_S;
      if (t >= 1) {
        h.t0 = -1;
        h.sprite.visible = false;
        continue;
      }
      // A quick pop to full size, a steady rise, and a fade over the last third.
      const size = SIZE_M * Math.min(1, 0.4 + t * 4);
      h.sprite.scale.set(size, (size * 6) / 7, 1);
      h.sprite.position.set(h.x, h.y + RISE_M * t, h.z);
      (h.sprite.material as THREE.SpriteMaterial).opacity = t < 0.66 ? 1 : (1 - t) / 0.34;
    }
  }
}
