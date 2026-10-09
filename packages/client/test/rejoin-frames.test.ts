// A snapshot from the relay mid-match (a rejoin, or everyone's reload after a
// desync): frames and the pause lifting that arrive while the save opens must
// reach the worker after the load. Before it, the worker's old scheduler takes
// them, the load replaces that scheduler, and the frames are never sent again:
// the step waits on them for good and every player stalls.
import { describe, expect, it } from 'vitest';
import { LockstepScheduler, NO_ORDERS, PauseReason, type ServerMessage, type WireFrame } from '@blockyrts/protocol';
import { loadSnapshot } from '../src/game/match.ts';
import type { ToWorker } from '../src/messages.ts';
import { RelayClient } from '../src/net/relay.ts';
import { makeSave } from '../src/net/saves.ts';

/** What the socket hands the relay client. */
const deliver = (relay: RelayClient, m: ServerMessage): void => (relay as unknown as { dispatch(m: ServerMessage): void }).dispatch(m);

const frame = (slot: number, step: number): WireFrame => ({ slot, step, flags: 0, orders: NO_ORDERS });

/**
 * The page's relay listener (match.ts) and the worker's net side (sim.worker.ts): a load builds a new scheduler
 * from the snapshot's step and the relay's log, frames go into whichever scheduler the worker has.
 */
function matchPage(relay: RelayClient) {
  const posted: string[] = [];
  let sched: LockstepScheduler | null = null;
  let paused = true;
  let loading: Promise<void> = Promise.resolve();
  const send = (msg: ToWorker): void => {
    posted.push(msg.type);
    if (msg.type === 'frames') for (const f of msg.frames) sched?.receive(f);
    if (msg.type === 'pause') paused = msg.paused;
  };
  relay.on((m) => {
    if (m.type === 'frame') send({ type: 'frames', frames: [m.frame] });
    if (m.type === 'pauseState') send({ type: 'pause', paused: m.paused });
    if (m.type === 'loadSnapshot') {
      loading = loadSnapshot(relay, m, () => {
        posted.push('load');
        sched = new LockstepScheduler({ slot: 0, startStep: m.step, activeSlots: m.activeSlots, inputDelay: m.inputDelay, nextFrameStep: m.nextFrameStep });
        for (const f of m.frames) sched.receive(f);
        paused = false;
      });
    }
  });
  return { posted, sched: () => sched!, paused: () => paused, loaded: () => loading };
}

async function snapshotAt(step: number): Promise<Extract<ServerMessage, { type: 'loadSnapshot' }>> {
  const seats = [
    { slot: 0, name: 'A', colour: 0, accountId: '' },
    { slot: 1, name: 'B', colour: 1, accountId: '' },
  ];
  const data = await makeSave({ matchId: 'm', seed: 5, seats }, { step, night: 0, data: new Uint8Array([1, 2, 3]) }, 'snapshot');
  // The relay's log from the snapshot's step: both players' frames for 40 to 42.
  const frames = [40, 41, 42].flatMap((s) => [frame(0, s), frame(1, s)]);
  return { type: 'loadSnapshot', epoch: 2, step, data, frames, nextFrameStep: 43, activeSlots: 0b11, inputDelay: 3 };
}

const unpause: ServerMessage = { type: 'pauseState', paused: false, reason: PauseReason.None, held: false, bySlot: 0, waitingFor: 0 };

describe('a snapshot loaded mid-match', () => {
  it('keeps the frames that arrive while the save opens', async () => {
    const relay = new RelayClient('', 'ws://test');
    const page = matchPage(relay);
    deliver(relay, await snapshotAt(40));
    // While the save opens, the relay lifts the pause and the next step's frames come in.
    deliver(relay, unpause);
    deliver(relay, { type: 'frame', frame: frame(0, 43) });
    deliver(relay, { type: 'frame', frame: frame(1, 43) });
    await page.loaded();
    expect(page.posted).toEqual(['load', 'pause', 'frames', 'frames']);
    expect(page.paused()).toBe(false);
    for (let s = 40; s <= 43; s++) expect(page.sched().waitingOn(s)).toEqual([]);
  });

  it('keeps them when the snapshot comes while the match start still holds the relay', async () => {
    const relay = new RelayClient('', 'ws://test');
    const page = matchPage(relay);
    // The page holds the relay from the lobby until the worker has started (the models load meanwhile).
    relay.hold();
    deliver(relay, await snapshotAt(40));
    deliver(relay, unpause);
    deliver(relay, { type: 'frame', frame: frame(0, 43) });
    deliver(relay, { type: 'frame', frame: frame(1, 43) });
    relay.release();
    await page.loaded();
    expect(page.posted).toEqual(['load', 'pause', 'frames', 'frames']);
    for (let s = 40; s <= 43; s++) expect(page.sched().waitingOn(s)).toEqual([]);
  });
});
