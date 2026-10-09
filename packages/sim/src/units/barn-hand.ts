// The barn hand (Patch 5, Jade's GP-37): the one worker assigned to a Barn.
// By day he is out round the Barn tending the animals, walking from one to
// the next; at dusk and at night he is in its loft with them. His order is
// the job there, like a farmer's, and his Barn works only while he is at it
// (animals/barn.ts barnTended).
//
// Ordering him off the job asks first (Jade: "Are you sure you want me to
// leave the animal unattended?", and the player must click Yes): whatever a
// player's order would have him do instead is kept in his queue behind the
// job while he asks. Yes drops the job and he goes; No, or no answer within
// the question's wait, drops the new orders and he stays. What decides it is
// state (his queue, and the step the question gives up in the Barn's acc[0]),
// so a loaded game and every machine agree; the question itself is not state,
// as every question is.

import { buildingCentre } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { floorDiv, headingTowards, STEPS_PER_SECOND, WU_PER_COLUMN } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import type { AnswerOrder, Order } from '../orders.ts';
import { say } from '../peoples/speech.ts';
import { OrderKind, type SimState } from '../state.ts';
import { animalsAt } from '../animals/animals.ts';
import { barnOf } from '../animals/barn.ts';
import { Act, besideBuilding, FAILED, goInside, jobHooks, leaveBuilding, MOVING, resetWalk, walkTo } from './behaviour.ts';
import { answerKinds, askNow, isAsking, QUESTION_WAIT_STEPS } from './questions.ts';
import { Work, workXp } from './ranks.ts';
import { sameUnitOrder, type UnitOrder } from './unit-orders.ts';

/** The question's kind in AnswerOrder (questions.ts Ask 1 to 6, greyed-out clicks 10 to 15, night work 16, work asks 17 to 19). */
export const BARN_LEAVE_ASK = 24;
/** The hand moves on to the next animal every 10 s (s). */
const TEND_STEPS = 10 * STEPS_PER_SECOND;
/** What the panel says he is doing (Jade: "he is operating the barn/tending to livestock"). */
export const BARN_HAND_TEXT = 'Tending the livestock';

const CONTINUE = false;
const DONE = true;

/** A player's orders that never take a hand off his job: answering a question, a greyed-out click, the lock toggle. */
const KEEPS_JOB = new Set<string>(['answer', 'greyed', 'lock']);

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

/**
 * A day and a night at the Barn. The hand's job order runs this (behaviour.ts
 * runJob): indoors in the dark, and by day out in the yard, by one of the
 * animals out grazing, or by the door when none is out.
 */
export function runBarnHand(state: SimState, i: number, b: Building): boolean {
  const e = state.entities;
  // The question gave up unanswered: he stays, and what he was told to do instead is dropped.
  const until = b.acc[0] ?? 0;
  if (until > 0 && state.step > until) {
    b.acc[0] = 0;
    e.queue[i]!.splice(1);
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (isDark(state.step)) {
    if (e.inside[i] === b.id) {
      e.act[i] = Act.Work;
      return CONTINUE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    // No way to the Barn: the job ends, as any job's does.
    if (r === FAILED) return DONE;
    goInside(state, i, b);
    e.act[i] = Act.Work;
    return CONTINUE;
  }
  if (e.inside[i] === b.id) {
    leaveBuilding(state, i);
    resetWalk(state, i);
    e.act[i] = Act.Walk;
  }
  // Every TEND_STEPS he goes on to the next animal out in the yard (each hand on his own beat).
  const beat = floorDiv(state.step + e.id[i]!, TEND_STEPS);
  if (e.timer[i] !== beat) {
    e.timer[i] = beat;
    e.act[i] = Act.Walk;
    resetWalk(state, i);
  }
  const herd = animalsAt(state, b.id).filter((j) => e.inside[j] === 0 && !e.partner[j]);
  const a = herd.length > 0 ? herd[beat % herd.length]! : -1;
  const [bx, bz] = buildingCentre(b);
  if (e.act[i] !== Act.Work) {
    const r = a >= 0 ? walkTo(state, i, { ...pointGoal(col(e.x[a]!), col(e.z[a]!)), max: 2 }) : walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    e.act[i] = Act.Work;
  }
  // Seeing to it, standing by it with empty hands (no tool to draw: he carries none).
  const [tx, tz] = a >= 0 ? [e.x[a]!, e.z[a]!] : [bx, bz];
  if (tx !== e.x[i] || tz !== e.z[i]) e.heading[i] = headingTowards(tx - e.x[i]!, tz - e.z[i]!);
  e.order[i] = OrderKind.Idle;
  workXp(state, i, Work.Gather);
  return CONTINUE;
}

/** Whether a unit is a barn hand asking to leave now (his Barn's question is still waiting). */
function asksToLeave(state: SimState, i: number, b: Building): boolean {
  return (b.acc[0] ?? 0) >= state.step && barnOf(state, i) === b;
}

/** The barn hands a player's order is for, each with his job order now, before the order is carried out (an order queued behind others never takes him off). */
export function barnHandsIn(state: SimState, o: Order): Array<[number, UnitOrder]> {
  if (KEEPS_JOB.has(o.kind) || !('units' in o) || (o as { queued?: boolean }).queued === true) return [];
  const e = state.entities;
  const out: Array<[number, UnitOrder]> = [];
  for (const id of o.units) {
    const i = e.indexOf(id);
    if (i < 0 || !barnOf(state, i)) continue;
    out.push([i, e.queue[i]![0]!]);
  }
  return out;
}

/**
 * After a player's order: each barn hand it took off his job is put back on
 * it, with what the order gave him kept behind the job, and asks (Jade). An
 * order that left him on the job, or sent him to the same Barn, changes
 * nothing.
 */
export function keepBarnHands(state: SimState, hands: ReadonlyArray<[number, UnitOrder]>): void {
  const e = state.entities;
  for (const [i, job] of hands) {
    const q = e.queue[i]!;
    if (q[0] === job || (q[0] && sameUnitOrder(q[0], job))) continue;
    if (job.t !== 'job') continue;
    const b = state.buildings.get(job.b);
    if (!b || e.hp[i]! <= 0) continue;
    e.queue[i] = [job, ...q];
    e.act[i] = Act.Start;
    e.timer[i] = 0;
    resetWalk(state, i);
    const asking = asksToLeave(state, i, b);
    b.acc[0] = state.step + QUESTION_WAIT_STEPS;
    // Asked again while he asks: the newest orders wait behind the job, and the bubble already up stands for them.
    if (asking || isAsking(state, e.id[i]!, false)) continue;
    const id = e.id[i]!;
    askNow(
      state,
      e.owner[i]!,
      id,
      false,
      {
        q: BARN_LEAVE_ASK,
        units: [id],
        res: -1,
        yes: 'He leaves the Barn to do as he was told. Until a worker is assigned again, the animals stay in their stalls: nothing grazes, breeds or lays, and nothing is slaughtered.',
        no: 'He stays with the animals, and the new orders are dropped. Not answering counts as No.',
      },
      'Are you sure you want me to leave the animals unattended?',
      () => {
        const k = e.indexOf(id);
        return k >= 0 && asksToLeave(state, k, b);
      },
    );
  }
}

/** The answer (the question has closed). Yes: the job ends and the orders behind it run. No: they are dropped and he stays. */
function answerLeave(state: SimState, o: AnswerOrder): void {
  const e = state.entities;
  const i = e.indexOf(o.who);
  if (i < 0 || e.owner[i] !== o.player || e.hp[i]! <= 0) return;
  const b = barnOf(state, i);
  if (!b || !asksToLeave(state, i, b)) return;
  b.acc[0] = 0;
  if (o.yes !== 1) {
    e.queue[i]!.splice(1);
    say(state, i, 'I\'ll stay with them.', false, true);
    return;
  }
  e.queue[i]!.shift();
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  if (e.inside[i] !== 0 && e.queue[i]!.length === 0) leaveBuilding(state, i);
}

answerKinds.set(BARN_LEAVE_ASK, answerLeave);
jobHooks.barn = runBarnHand;
