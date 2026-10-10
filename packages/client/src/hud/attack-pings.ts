// Mini patch 7.3 (Jade): "a short 2 second double ping on the minimap anytime
// your units get attacked, the ping also should appear just once in your
// camera view if it is happening in front of you", one small ping at the start
// of a fight, never one for a fight the player started with an attack order.
// The sim worker picks out the blows an enemy landed on the player's own units
// while they were not on an Attack, attack-move or Patrol order (struckOwn);
// the page groups them into fights and pings once for each (AttackPings).
// No DOM here: the worker imports this file too.
import { hostile, UnitKind, type SimState } from '@blockyrts/sim';

/** A blow this close to a fight that is still going on belongs to it and pings nothing, metres. */
export const ATTACK_PING_RADIUS_M = 15;
/** A fight is over once no new blow has landed on the player's units within its radius for this long, ms. */
export const ATTACK_PING_QUIET_MS = 20_000;
/** Fights remembered at once; the oldest is forgotten first. */
const FIGHTS_KEPT = 32;

/** Kinds of the player's that count as their units: workers, troops, mages and engines (not tamed animals). */
const UNIT_KINDS: ReadonlySet<number> = new Set([UnitKind.Worker, UnitKind.Warrior, UnitKind.Mage, UnitKind.Engine]);

/**
 * Where an enemy hurt one of `player`'s units this step (x, z wu pairs pushed
 * onto `out`), leaving out those the player sent to fight: on an Attack,
 * attack-move or Patrol order, or hunting the very animal that hit back.
 */
export function struckOwn(s: SimState, player: number, out: number[]): void {
  const e = s.entities;
  let last = 0;
  for (const h of s.hits) {
    if (h.dmg === undefined || h.id === 0 || h.id === last) continue;
    const i = e.indexOf(h.id);
    if (i < 0 || e.owner[i] !== player || !UNIT_KINDS.has(e.kind[i]!) || e.hurtAt[i] !== s.step) continue;
    const from = e.attacker[i]!;
    const a = from === 0 ? -1 : e.indexOf(from);
    if (a < 0 || !hostile(s, i, a)) continue;
    const o = e.queue[i]![0];
    if (o && (o.t === 'attack' || o.t === 'attackMove' || o.t === 'patrol' || (o.t === 'hunt' && o.id === from))) continue;
    last = h.id;
    out.push(e.x[i]!, e.z[i]!);
  }
}

/** The page's side: blows on the player's units grouped into fights, one ping at the start of each. */
export class AttackPings {
  private fights: Array<{ x: number; z: number; last: number }> = [];

  /** A blow landed at (x, z) metres at `now` ms: true when it starts a new fight, so it pings. */
  struck(x: number, z: number, now: number): boolean {
    this.fights = this.fights.filter((f) => now - f.last < ATTACK_PING_QUIET_MS);
    const r2 = ATTACK_PING_RADIUS_M * ATTACK_PING_RADIUS_M;
    const near = this.fights.find((f) => (f.x - x) ** 2 + (f.z - z) ** 2 <= r2);
    if (near) {
      // The fight follows its latest blow, so a running fight still counts as one.
      near.x = x;
      near.z = z;
      near.last = now;
      return false;
    }
    this.fights.push({ x, z, last: now });
    if (this.fights.length > FIGHTS_KEPT) this.fights.shift();
    return true;
  }

  /** A new match, or a load: no fight is going on. */
  clear(): void {
    this.fights = [];
  }
}
