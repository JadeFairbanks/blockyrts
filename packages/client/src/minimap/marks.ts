// The minimap's marks, worked out in the sim worker from the sim's state
// (Table 15: minimap marks). Pure.
import { isLair, UnitKind, type SimState } from '@blockyrts/sim';
import type { ThreatMark } from '../messages.ts';

/**
 * Every lair standing (Patch 3, Jade: every player sees each lair's red dot
 * from the moment it appears, explored land or not), and the goblin villages
 * any player has seen (the players share what they see); war is `player`'s.
 */
export function threatMarks(s: SimState, player: number): ThreatMark[] {
  const e = s.entities;
  const bit = 1 << player;
  const side = (1 << s.players.length) - 1;
  const out: ThreatMark[] = [];
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] === UnitKind.Mob && e.hp[i]! > 0 && isLair(e.mob[i]!)) out.push({ mob: e.mob[i]!, x: e.x[i]!, z: e.z[i]!, war: false });
  }
  for (const v of s.threats.villages) if (v.seen & side) out.push({ mob: -1, x: v.x, z: v.z, war: (v.war & bit) !== 0 });
  return out;
}
