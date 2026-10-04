// Worker ranks (Table 1's worker rows; Jade's Patch 3): Labourer, Hand,
// Master worker, Foreman and Elder. A worker rises by itself as it works:
// building (and repairing, upgrading, digging) and gathering (and farming,
// fishing, mining) give it experience, and so does fighting, which a worker
// seldom does. There is no rank training for workers any more. A rank gives
// health and, through the rules' +5% a rank, damage; never work speed.
// Warriors keep their own path (combat/combat.ts, Barracks training).

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { UnitKind, type SimState } from '../state.ts';

/** Each worker rank's name, by rank. */
export const WORKER_RANK_NAMES: readonly string[] = ['', 'Labourer', 'Hand', 'Master worker', 'Foreman', 'Elder'];

/** Worker health by rank (Table 1: Labourer 60 to Elder 100). */
export const WORKER_HEALTH_BY_RANK: readonly number[] = [60, 60, 70, 80, 90, 100];

/**
 * Experience a worker needs for each rank, tenths (Patch 3, s): the warriors'
 * ladder, Hand 50, Master worker 150, Foreman 400, Elder 1000 (Foreman and
 * Elder kept from before Patch 3, when they were reached only by fighting).
 */
export const WORKER_XP_TENTHS: readonly number[] = [0, 0, 500, 1500, 4000, 10000];

/**
 * Experience a worker earns for a minute of building with a starting
 * (hardwood) tool kit, tenths (Patch 3, s: 10 XP, so a worker busy most of
 * the day is a Hand by the second or third day). Better tools build faster
 * and learn as much faster. Repairing, upgrading and digging count as building.
 */
export const BUILD_XP_TENTHS_PER_MINUTE = 100;

/**
 * Experience a worker earns for a minute of gathering with a starting tool
 * kit, tenths (Patch 3, s: 10 XP, as for building). Better tools gather
 * faster and learn as much faster. Farming, fishing at a dock and mining
 * down a shaft count as gathering, by day only, as a gatherer works.
 */
export const GATHER_XP_TENTHS_PER_MINUTE = 100;

/** A per-mille pace times experience a minute, over a minute of steps: what one tenth of experience costs in the workXp column. */
const PER_TENTH = 1000 * 60 * STEPS_PER_SECOND;

/** What a worker is doing that teaches it: building or gathering. */
export const Work = { Build: 0, Gather: 1 } as const;
export type Work = (typeof Work)[keyof typeof Work];

/**
 * One step of a worker's work at a pace (per mille: 1000 is a starting tool
 * kit's, the same pace the job itself moves at): its share of a tenth of
 * experience is kept in the workXp column, and each whole tenth is added to
 * its experience, raising its rank when that is enough. Only workers learn
 * this way.
 */
export function workXp(state: SimState, i: number, work: Work, pace = 1000): void {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker || e.rank[i]! >= 5 || pace <= 0) return;
  const rate = work === Work.Build ? BUILD_XP_TENTHS_PER_MINUTE : GATHER_XP_TENTHS_PER_MINUTE;
  if (rate <= 0) return;
  const acc = e.workXp[i]! + rate * pace;
  const tenths = floorDiv(acc, PER_TENTH);
  e.workXp[i] = acc - tenths * PER_TENTH;
  if (tenths > 0) workerGainXp(state, i, tenths);
}

/** Adds experience to a worker (combat/combat.ts gainXp hands fighting's here too) and raises its rank as far as it reaches. */
export function workerGainXp(state: SimState, i: number, tenths: number): void {
  const e = state.entities;
  e.xp[i] = e.xp[i]! + tenths;
  for (;;) {
    const r = e.rank[i]!;
    if (r >= 5) return;
    const need = WORKER_XP_TENTHS[r + 1]!;
    if (e.xp[i]! < need) return;
    setWorkerRank(state, i, r + 1);
    state.events.push({ player: e.owner[i]!, kind: 'info', text: `A worker has risen to ${WORKER_RANK_NAMES[r + 1]}.`, x: e.x[i]!, z: e.z[i]! });
  }
}

/** Sets a worker's rank, its health rising (or falling) by the difference in the most it can have. */
export function setWorkerRank(state: SimState, i: number, rank: number): void {
  const e = state.entities;
  const hp = WORKER_HEALTH_BY_RANK[rank] ?? WORKER_HEALTH_BY_RANK[1]!;
  e.rank[i] = rank;
  e.hp[i] = Math.max(1, e.hp[i]! + hp - e.maxHp[i]!);
  e.maxHp[i] = hp;
}
