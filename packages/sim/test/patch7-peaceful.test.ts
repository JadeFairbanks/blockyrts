// Patch 7 (Jade, 03:18 UTC 2026-10-10): "my units auto attack things that
// wouldn't attack them first, like the bog guardian, great ape, etc. That
// should change." A monster that leaves the players alone until wronged (a
// Bog or Fae Guardian after no one, a stone circle's keeper at peace) is never
// taken on by the players' units by themselves and their stray shots fly
// past it; an attack order still goes for it, and once roused it is every
// player's foe. Picks in blueprint/peaceful-targets-picks.md.

import { describe, expect, it } from 'vitest';
import {
  addMob,
  addWarrior,
  atPeace,
  circleSites,
  CircleType,
  createWorld,
  EncounterMode,
  fireAt,
  hostile,
  KeeperMode,
  landAt,
  Mob,
  pickTarget,
  Shot,
  shotMayHit,
  Side,
  step,
  Troop,
  WU_PER_METRE,
  type CircleSite,
  type Encounter,
  type SimState,
} from '../src/index.ts';
import { giveOrder } from '../src/units/behaviour.ts';

const M = WU_PER_METRE;
const SEC = 20;

function run(s: SimState, n: number, until?: () => boolean): void {
  for (let k = 0; k < n; k++) {
    step(s);
    if (until?.()) return;
  }
}

describe('the Bog guardian is left alone until he turns on the players', () => {
  it('is not taken on by idle troops nor hit by stray shots while calm, is fought on an order and by everyone once angry, and is let be again when he pleads', () => {
    const s = createWorld(5, { players: 2 });
    const e = s.entities;
    run(s, 10);
    const k = s.threats.keepers.find((x) => x.kind === 0)!;
    const g = (): number => e.indexOf(k.id);
    expect(k.mode).toBe(KeeperMode.Calm);
    // Two idle spearmen, one each, beside him on his bog.
    const a = addWarrior(s, 0, e.x[g()]! + 5 * M, e.z[g()]!, Troop.Long, 3);
    const aid = e.id[a]!;
    const b = addWarrior(s, 1, e.x[g()]! - 5 * M, e.z[g()]!, Troop.Long, 3);
    const bid = e.id[b]!;
    expect(atPeace(s, g(), 0)).toBe(true);
    expect(hostile(s, a, g())).toBe(false);
    expect(hostile(s, g(), b)).toBe(false);
    expect(pickTarget(s, a, 12 * M)).toBe(-1);
    expect(shotMayHit(s, Side.Players, 0, 0, g())).toBe(false);
    const full = e.hp[g()]!;
    run(s, 5 * SEC);
    expect(e.target[e.indexOf(aid)]).toBe(0);
    expect(e.target[e.indexOf(bid)]).toBe(0);
    expect(e.hp[g()]).toBe(full);
    expect(k.mode).toBe(KeeperMode.Calm);
    // Told to attack him, the spearman does: he is angry with it, and now every player's troops fight him.
    giveOrder(s, e.indexOf(aid), { t: 'attack', id: k.id }, false);
    run(s, 20 * SEC, () => k.mode === KeeperMode.Angry);
    expect(k.mode).toBe(KeeperMode.Angry);
    expect(k.unit).toBe(aid);
    expect(atPeace(s, g(), 1)).toBe(false);
    expect(hostile(s, e.indexOf(bid), g())).toBe(true);
    expect(shotMayHit(s, Side.Players, 0, 1, g())).toBe(true);
    landAt(s, e.indexOf(bid), e.x[g()]! - 5 * M, e.z[g()]!);
    run(s, 2);
    expect(e.target[e.indexOf(bid)]).toBe(k.id);
    // The one who wronged him falls: he pleads for the promise, and the others leave him be again.
    e.hp[e.indexOf(aid)] = 0;
    run(s, 5, () => k.mode === KeeperMode.Pleading);
    expect(k.mode).toBe(KeeperMode.Pleading);
    expect(hostile(s, e.indexOf(bid), g())).toBe(false);
    run(s, 2);
    expect(e.target[e.indexOf(bid)]).toBe(0);
  });
});

/** A seed's world with a Great White Ape Lunar Circle, and that circle. */
function withLunar(): { s: SimState; c: CircleSite } {
  for (let seed = 1; seed < 60; seed++) {
    const s = createWorld(seed, { players: 2, peaceful: false });
    const c = circleSites(s.world.layout).find((x) => x.type === CircleType.Lunar);
    if (c) return { s, c };
  }
  throw new Error('no seed with a Lunar circle');
}

describe('the Great White Ape at peace', () => {
  it('lets a stray arrow fly past him to the monster it was shot at; one shot at him strikes and wrongs him', () => {
    const { s, c } = withLunar();
    const e = s.entities;
    // A worker of player 0 near the circle brings its keepers.
    const w = e.indexOf(1);
    landAt(s, w, c.x + 8 * M, c.z);
    run(s, 4 * SEC, () => s.threats.encounters.length > 0);
    const r = s.threats.encounters.find((x) => x.circle === c.id) as Encounter;
    const ape = (): number => e.indexOf(r.leader);
    expect(atPeace(s, ape(), 0)).toBe(true);
    // A zombie right where he stands, and a ranger 5 m off shooting at it: the arrow passes him by.
    const z = addMob(s, Mob.Zombie, 0, e.x[ape()]!, e.z[ape()]!, 0);
    const zid = e.id[z]!;
    const f = addWarrior(s, 0, e.x[ape()]! - 5 * M, e.z[ape()]!, Troop.Ranger, 3);
    const full = e.hp[ape()]!;
    fireAt(s, f, e.x[f]!, e.y[f]! + M, e.z[f]!, z, Shot.Arrow, 20, 0, 0, 0);
    run(s, 2 * SEC, () => s.projectiles.length === 0);
    expect(s.projectiles.length).toBe(0);
    expect(e.hp[ape()]).toBe(full);
    expect(r.foes).toBe(0);
    expect(r.mode).not.toBe(EncounterMode.Fighting);
    expect(e.attacker[e.indexOf(zid)]).toBe(e.id[f]);
    // Shot at him on purpose, the arrow strikes: he rages at that player, and their troops may fight him.
    fireAt(s, f, e.x[f]!, e.y[f]! + M, e.z[f]!, ape(), Shot.Arrow, 20, 0, 0, 0);
    run(s, 2 * SEC, () => s.projectiles.length === 0);
    expect(e.hp[ape()]).toBeLessThan(full);
    expect(r.foes & 1).toBe(1);
    expect(hostile(s, f, ape())).toBe(true);
    // Still at peace with the other player.
    expect(atPeace(s, ape(), 1)).toBe(true);
  });
});
