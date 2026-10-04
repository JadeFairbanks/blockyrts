// Who shows on the minimap, and in what colour (Patch 2, Jade): every
// player's units and buildings in that player's colour (your hired
// mercenaries in yours), and enemies in red: the night's monsters, lair
// guardians, goblins and any people at war with you, only while the
// players' side sees them. Wild animals, peoples at peace and anything
// inside a building are left off. Pure.
import { MONSTERS, PEOPLES } from '@blockyrts/sim';
import { UnitFlag } from '../messages.ts';

/** Enemies on the minimap: the same red as an urgent foe (Jade: no player may pick red). */
export const ENEMY_RED = '#e0302a';
/** A unit's side on the minimap: a player's number, ENEMY, or HIDDEN. */
export const ENEMY = -1;
export const HIDDEN = -2;

export interface MapUnit {
  owner: number;
  flags: number;
  /** The faction of one of the peoples' units (and of a hired mercenary). */
  group: number;
  hp: number;
  /** The building it is in, or 0. */
  inside: number;
}

/** Which side a unit shows as: its player, an enemy, or not at all. `atWar` says whether a people's faction is at war with this player. */
export function unitSide(u: MapUnit, players: number, atWar: (group: number) => boolean): number {
  if (u.hp <= 0 || u.inside !== 0) return HIDDEN;
  if (u.owner < players) return u.owner;
  // A cloaked void stalker is only a shimmer in the dark: the map does not give it away.
  if (u.owner === MONSTERS) return (u.flags & UnitFlag.Cloaked) !== 0 ? HIDDEN : ENEMY;
  if (u.owner === PEOPLES) return atWar(u.group) ? ENEMY : HIDDEN;
  return HIDDEN;
}

/**
 * Whether a point (wu) is in sight of the players' side: within a vision
 * source's reach of its rectangle (VISION_STRIDE values each: owner, x0, z0,
 * x1, z1, reach, as the sim's visionSources), the same test the fog of war uses.
 */
export function inSight(vision: Int32Array, stride: number, x: number, z: number): boolean {
  for (let o = 0; o + stride <= vision.length; o += stride) {
    const x0 = vision[o + 1]!;
    const z0 = vision[o + 2]!;
    const x1 = vision[o + 3]!;
    const z1 = vision[o + 4]!;
    const r = vision[o + 5]!;
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    if (dx > r) continue;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    if (dz <= r && dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}
