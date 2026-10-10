// Mini patch 7.3's performance pieces: the match starts only once every
// player has loaded (start-gate.ts), and the land is redrawn from what shows
// as the ground changes: a dig opens the pit's floor and walls in its own
// chunk and in the next one, and nothing under the land is ever drawn.
import { describe, expect, it } from 'vitest';
import { LockstepScheduler, type WireFrame } from '@blockyrts/protocol';
import { COLUMNS_PER_CHUNK as N, Mat, NO_WATER, World } from '@blockyrts/sim';
import { LAND_WAIT_MS, StartGate } from '../src/game/start-gate.ts';
import { meshChunk, UNIT_M, type MeshArrays } from '../src/world/mesher.ts';

/** One page online: its lockstep and its gate, stepping the way the sim worker's tick does. */
class Page {
  readonly sched: LockstepScheduler;
  readonly gate = new StartGate(true);
  step = 0;
  started = false;

  constructor(readonly slot: number) {
    this.sched = new LockstepScheduler({ slot, startStep: 0, activeSlots: 0b11 });
  }

  /** Loading done: the sim starts and posts its first state. */
  start(): void {
    this.started = true;
    this.gate.loaded(0);
    this.gate.state(this.step);
  }

  tick(relay: (f: WireFrame) => void): void {
    if (!this.started) return;
    for (const f of this.sched.outgoing(this.step)) relay({ slot: this.slot, step: f.step, flags: 0, orders: f.orders });
    const missing = this.sched.waitingOn(this.step);
    this.gate.waiting(missing);
    if (missing.length > 0) return;
    this.sched.take(this.step);
    this.step++;
    this.gate.state(this.step);
  }
}

describe('mini patch 7.3: everyone starts together', () => {
  it('keeps the loading screen up until every player has loaded, naming who it waits for', () => {
    const pages = [new Page(0), new Page(1)];
    // The relay passes every frame to every page (a page still loading keeps them for its start).
    const relay = (f: WireFrame): void => pages.forEach((p) => p.sched.receive(f));
    const names = ['Ash', 'Bea'];
    const view = (p: Page): string | null => p.gate.view(1000, true, (s) => names[s]!);

    // Ash finishes loading first: his sim starts, sends its first frames and waits on Bea's.
    pages[0]!.start();
    for (let k = 0; k < 20; k++) pages[0]!.tick(relay);
    expect(pages[0]!.step).toBe(0);
    expect(view(pages[0]!)).toBe('Waiting for Bea to finish loading…');

    // Bea finishes: both run the first step, and both screens go.
    pages[1]!.start();
    pages[1]!.tick(relay);
    pages[0]!.tick(relay);
    expect(pages.map((p) => p.step)).toEqual([1, 1]);
    expect(pages.map(view)).toEqual([null, null]);

    // Alone: once loaded and the land is drawn, or after a short wait for it.
    const gate = new StartGate(false);
    expect(gate.view(0, true, String)).toBe('Loading the models and pictures…');
    gate.loaded(100);
    expect(gate.view(200, false, String)).toBe('Drawing the land…');
    expect(gate.view(200, true, String)).toBeNull();
    expect(gate.view(100 + LAND_WAIT_MS, false, String)).toBeNull();
  });
});

describe('mini patch 7.3: the land redrawn as it is dug', () => {
  const quads = (m: MeshArrays): number => m.indices.length / 6;
  /** The lowest y (metres) of the quads facing along x (+1 or -1) or up (0). */
  const lowest = (m: MeshArrays, facing: number): number => {
    let y = Infinity;
    for (let q = 0; q < quads(m); q++) {
      const nx = Math.sign(m.normals[q * 12]!);
      const ny = Math.sign(m.normals[q * 12 + 1]!);
      if (facing === 0 ? ny !== 1 : nx !== facing) continue;
      for (let v = 0; v < 4; v++) y = Math.min(y, m.positions[q * 12 + v * 3 + 1]!);
    }
    return y;
  };

  it('shows a pit dug at a chunk’s edge in that chunk and the next, and only its floor and walls', () => {
    const w = new World(5, 1);
    const cx = 3;
    const cz = 3;
    const mesh = (x: number, z: number): MeshArrays => meshChunk({ centre: w.columns(x, z), west: w.columns(x - 1, z), east: w.columns(x + 1, z), north: w.columns(x, z - 1), south: w.columns(x, z + 1) });
    // A pit 3 columns square along the chunk's west edge, 8 terrain units under the lowest of its tops.
    const x0 = cx * N;
    const z0 = cz * N + 30;
    let low = Infinity;
    for (let x = x0; x < x0 + 3; x++) {
      for (let z = z0; z < z0 + 3; z++) {
        low = Math.min(low, w.topAt(x, z));
        expect(w.waterAt(x, z)).toBe(NO_WATER);
      }
    }
    const floor = low - 8;
    const before = mesh(cx, cz);
    const westBefore = mesh(cx - 1, cz);
    expect(lowest(before, 0)).toBeGreaterThan(floor * UNIT_M);

    expect(w.editBox(x0, z0, x0 + 2, z0 + 2, floor, low + 2000, Mat.Air)).toBe(9);
    const after = mesh(cx, cz);
    const westAfter = mesh(cx - 1, cz);
    // The pit's floor shows in its own chunk, and its west wall belongs to the chunk next door, which is why that one is redrawn too.
    expect(lowest(after, 0)).toBeCloseTo(floor * UNIT_M);
    expect(lowest(after, -1)).toBeCloseTo(floor * UNIT_M);
    expect(lowest(westAfter, 1)).toBeCloseTo(floor * UNIT_M);
    expect(lowest(westBefore, 1)).toBeGreaterThan(floor * UNIT_M);
    // Only the opened faces are new: a handful of quads, not the thousands of blocks around the pit.
    expect(quads(after) + quads(westAfter) - quads(before) - quads(westBefore)).toBeLessThan(40);
  });
});
