// Patch 2 bug fixes: while the Magi Sanctum trained a mage, the queue's
// "Complete in N seconds" jumped up and down by about ten seconds while it
// fell (Jade). The countdown now reads the sim's own steps left, so the
// seconds only fall, one a second, the same way at every building.
import { describe, expect, it } from 'vitest';
import { Blocked, BuildingKind, createWorld, placeBuilding, placementBlocked, Product, queueHead, Res, step, STEPS_PER_SECOND, type Building, type SimState } from '@blockyrts/sim';
import { queueSeconds, queueText } from '../src/hud/queue-clock.ts';

function sanctum(s: SimState): Building {
  const h = s.buildings.list.find((b) => b.owner === 0 && b.kind === BuildingKind.MainBase)!;
  for (let dx = 0; dx < 60; dx++) {
    if (placementBlocked(s, 0, BuildingKind.MagiSanctum, h.x + 16 + dx, h.z) === Blocked.None) return placeBuilding(s, 0, BuildingKind.MagiSanctum, 0, h.x + 16 + dx, h.z, true);
  }
  throw new Error('no free spot');
}

/** The hover text's seconds, as the panel shows them after each step. */
function shownSeconds(s: SimState, b: Building): number {
  const h = queueHead(s, b)!;
  const m = /^Complete in (\d+) seconds?\./.exec(queueText(true, queueSeconds(h.stepsLeft, 0)));
  expect(m).not.toBeNull();
  return Number(m![1]);
}

describe('the Magi Sanctum\'s training countdown', () => {
  it('only falls, one second every second, until the mage walks out', () => {
    const s = createWorld(1, { peaceful: true });
    const b = sanctum(s);
    const pool = s.players[0]!.pool;
    pool[Res.Sticks] = 20;
    pool[Res.Flax] = 6;
    pool[Res.Venison] = 200;
    step(s, [{ kind: 'produce', player: 0, building: b.id, product: Product.BattleMage, count: 1 }]);
    const seen: number[] = [];
    while (b.queue.length > 0) {
      seen.push(shownSeconds(s, b));
      step(s);
    }
    // 80 s of training: it starts at 80 and ends at 1, never rising.
    expect(seen[0]).toBe(80);
    expect(seen[seen.length - 1]).toBe(1);
    for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeLessThanOrEqual(seen[k - 1]!);
    // Each second stays up for a second's worth of steps (the first one less, the step it was queued on already ran).
    const runs = new Map<number, number>();
    for (const v of seen) runs.set(v, (runs.get(v) ?? 0) + 1);
    for (const [v, n] of runs) if (v !== 80) expect(n).toBe(STEPS_PER_SECOND);
  });
});
