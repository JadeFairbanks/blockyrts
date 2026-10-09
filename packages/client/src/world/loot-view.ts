// Loot lying on the ground (Jade's play-test notes, 2026-10-03): each piece
// is drawn as its good's inventory icon, standing a little above the ground
// and always facing the camera, bobbing so it catches the eye. It can be
// clicked to see what it is, and right-clicked to send units to pick it up.
import * as THREE from 'three';
import { RESOURCES, WU_PER_METRE } from '@blockyrts/sim';
import { goodIcon, iconUrl } from '../hud/inventory-icons.ts';
import type { LootInfo } from '../messages.ts';
import { NOBODY, type Selectable } from '../selection/types.ts';
import { glitterOfGood, type GlitterSpot } from './sparkle.ts';

/** How big an icon stands, and how high above the ground its middle floats, metres. */
const SIZE_M = 0.55;
const LIFT_M = 0.4;
const BOB_M = 0.06;

interface Piece {
  sprite: THREE.Sprite;
  sel: Selectable;
  /** Its resting height, metres. */
  y: number;
  /** Its glitter (Patch 5, VX-6: gold and silver), or null. */
  glitter: GlitterSpot | null;
}

export class LootView {
  private readonly group = new THREE.Group();
  private readonly pieces = new Map<number, Piece>();
  private readonly materials = new Map<number, THREE.SpriteMaterial>();
  private readonly loader = new THREE.TextureLoader();

  constructor(scene: THREE.Scene) {
    this.group.renderOrder = 2;
    scene.add(this.group);
  }

  /** The loot the sim reports now: new pieces appear, picked-up and rotted ones go. */
  sync(list: readonly LootInfo[]): void {
    const seen = new Set<number>();
    for (const l of list) {
      seen.add(l.id);
      let p = this.pieces.get(l.id);
      if (!p) {
        const sprite = new THREE.Sprite(this.material(l.res));
        sprite.scale.set(SIZE_M, SIZE_M, 1);
        const y = l.y / WU_PER_METRE + LIFT_M;
        sprite.position.set(l.x / WU_PER_METRE, y, l.z / WU_PER_METRE);
        this.group.add(sprite);
        const colour = glitterOfGood(l.res);
        p = {
          sprite,
          y,
          glitter: colour ? { x: sprite.position.x, y: y - SIZE_M / 2, z: sprite.position.z, r: SIZE_M / 2, colour } : null,
          sel: {
            key: `l:${l.id}`,
            kind: 'node',
            owner: NOBODY,
            typeKey: 'loot',
            centre: sprite.position.clone(),
            halfSize: new THREE.Vector3(SIZE_M / 2, SIZE_M / 2, SIZE_M / 2),
            label: '',
            resource: '',
          },
        };
        this.pieces.set(l.id, p);
      }
      const name = RESOURCES[l.res]?.name ?? 'Loot';
      p.sel.label = `${name} (${l.amt})`;
      p.sel.details = [
        'Loot. Right-click it with any of your living units to pick it up.',
        l.own ? 'Your units also pick it up by themselves when they are idle and it is safe, and hand it in at dawn and in the day.' : "Another player's: your units pick it up only when told to.",
      ];
    }
    for (const [id, p] of this.pieces) {
      if (seen.has(id)) continue;
      this.group.remove(p.sprite);
      this.pieces.delete(id);
    }
  }

  /** Each frame: the icons bob gently. */
  update(now: number): void {
    for (const [id, p] of this.pieces) p.sprite.position.y = p.y + BOB_M * Math.sin(now / 450 + id);
  }

  /** The gold and silver lying on the ground, to glitter. */
  glitter(): GlitterSpot[] {
    const out: GlitterSpot[] = [];
    for (const p of this.pieces.values()) if (p.glitter) out.push(p.glitter);
    return out;
  }

  /** The icons of the loot the cursor is over (keys 'l:<id>'), for the hover outline (Patch 5, UI-5). */
  hoverSprites(keys: ReadonlySet<string>): THREE.Sprite[] {
    const out: THREE.Sprite[] = [];
    for (const [id, p] of this.pieces) if (keys.has(`l:${id}`)) out.push(p.sprite);
    return out;
  }

  selectables(): Iterable<Selectable> {
    return [...this.pieces.values()].map((p) => p.sel);
  }

  /** One material per good: its inventory icon, kept crisp; a plain marker for a good with no icon. */
  private material(res: number): THREE.SpriteMaterial {
    let m = this.materials.get(res);
    if (m) return m;
    const icon = goodIcon(res);
    const url = icon ? iconUrl(icon.file) : '';
    if (url) {
      const tex = this.loader.load(url);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.2 });
    } else m = new THREE.SpriteMaterial({ color: 0xd9b45a });
    this.materials.set(res, m);
    return m;
  }
}
