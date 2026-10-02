import { describe, expect, it } from 'vitest';
import {
  cloneState,
  compareRecordings,
  createWorld,
  deserializeState,
  diffStates,
  hashState,
  InputLog,
  makeRecording,
  NEUTRAL,
  OrderKind,
  run,
  serializeState,
  step,
  WU_PER_METRE,
  type InputFrame,
  type Recording,
} from '../src/index.ts';

const SCRIPT: InputFrame[] = [
  { step: 10, orders: [{ kind: 'move', player: 0, units: [1, 2, 3], x: 30 * WU_PER_METRE, z: -12 * WU_PER_METRE }] },
  { step: 200, orders: [{ kind: 'move', player: 0, units: [4, 5], x: -25 * WU_PER_METRE, z: 25 * WU_PER_METRE }] },
  { step: 900, orders: [{ kind: 'move', player: 0, units: [1, 2, 3, 4, 5], x: 0, z: 0 }] },
];

describe('the step function', () => {
  it('gives the same hashes for the same seed and orders', () => {
    const a = run(createWorld(1), 2000, SCRIPT);
    const b = run(createWorld(1), 2000, SCRIPT);
    expect(a.hashes.length).toBe(100);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.finalHash).toBe(b.finalHash);
  });

  it('gives different hashes for different seeds or orders', () => {
    const base = run(createWorld(1), 500, SCRIPT).finalHash;
    expect(run(createWorld(2), 500, SCRIPT).finalHash).not.toBe(base);
    expect(run(createWorld(1), 500, []).finalHash).not.toBe(base);
  });

  it('reports the hash every 20 steps and only then', () => {
    const s = createWorld(3);
    for (let n = 1; n <= 60; n++) {
      const r = step(s);
      expect(r.step).toBe(n);
      expect(r.hash !== undefined).toBe(n % 20 === 0);
      if (r.hash !== undefined) expect(r.hash).toBe(hashState(s));
    }
  });

  it('moves an ordered unit to its destination at walking speed and then idles', () => {
    const s = createWorld(5, { playerUnits: 1, wanderers: 0 });
    const e = s.entities;
    const goal = { x: e.x[0]! + 12 * WU_PER_METRE, z: e.z[0]! };
    step(s, [{ kind: 'move', player: 0, units: [1], x: goal.x, z: goal.z }]);
    expect(e.order[0]).toBe(OrderKind.Move);
    // Facing roughly +X (49152); the path may bend round a rise.
    expect(Math.abs(e.heading[0]! - 49152)).toBeLessThan(2048);
    // 12 m at 3 m/s is 4 s, 80 steps, plus a little for the path's bends.
    for (let n = 1; n < 90; n++) step(s);
    expect(e.x[0]).toBe(goal.x);
    expect(e.z[0]).toBe(goal.z);
    expect(e.order[0]).toBe(OrderKind.Idle);
  });

  it("ignores orders for units the player does not own", () => {
    const s = createWorld(5, { playerUnits: 1, wanderers: 1, warriors: 0 });
    expect(s.entities.owner[1]).toBe(NEUTRAL);
    const before = s.entities.x[0]!;
    step(s, [{ kind: 'move', player: 1, units: [1, 999], x: 0, z: 0 }]);
    expect(s.entities.order[0]).toBe(OrderKind.Idle);
    expect(s.entities.x[0]).toBe(before);
  });

  it('applies orders by player index, whatever order they arrive in', () => {
    const a = createWorld(9, { playerUnits: 2 });
    const b = createWorld(9, { playerUnits: 2 });
    const p0 = { kind: 'move' as const, player: 0, units: [1], x: 1000, z: 1000 };
    const p1 = { kind: 'move' as const, player: 1, units: [2], x: -1000, z: 1000 };
    step(a, [p0, p1]);
    step(b, [p1, p0]);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('keeps every state value an integer', () => {
    const s = createWorld(11);
    run(s, 3000, SCRIPT);
    const e = s.entities;
    for (const arr of [e.x, e.y, e.z, e.heading, e.speed, e.targetX, e.targetZ]) {
      for (let i = 0; i < e.count; i++) expect(Number.isInteger(arr[i])).toBe(true);
    }
  });
});

describe('snapshots', () => {
  it('round-trip exactly', () => {
    const s = createWorld(1);
    run(s, 333, SCRIPT);
    const bytes = serializeState(s);
    const t = deserializeState(bytes);
    expect(serializeState(t)).toEqual(bytes);
    expect(diffStates(s, t)).toBeNull();
  });

  it('resume to the same hashes as an unbroken run', () => {
    const whole = run(createWorld(1), 2000, SCRIPT);
    const first = createWorld(1);
    run(first, 777, SCRIPT);
    const resumed = deserializeState(serializeState(first));
    const rest = run(resumed, 2000 - 777, SCRIPT);
    expect(rest.finalHash).toBe(whole.finalHash);
    expect(rest.hashes).toEqual(whole.hashes.filter(([st]) => st > 777));
  });

  it('reject foreign bytes', () => {
    expect(() => deserializeState(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrow();
  });
});

describe('the input log', () => {
  it('keeps the last frames and drops older ones', () => {
    const log = new InputLog(100);
    for (let s = 0; s < 250; s++) log.record(s, s % 10 === 0 ? [{ kind: 'move', player: 0, units: [1], x: s, z: 0 }] : []);
    const frames = log.range(0, 249);
    expect(frames.map((f) => f.step)).toEqual([150, 160, 170, 180, 190, 200, 210, 220, 230, 240]);
  });
});

describe('the desync tool', () => {
  function play(seed: number, steps: number, corruptAt = -1): Recording {
    const s = createWorld(seed);
    run(s, 100, SCRIPT);
    const rec = makeRecording(s);
    rec.frames = SCRIPT.filter((f) => f.step >= s.step);
    for (let n = 0; n < steps; n++) {
      if (s.step === corruptAt) s.entities.x[2]! += 1; // a "non-deterministic" bug on one machine
      const r = step(s, rec.frames.find((f) => f.step === s.step)?.orders ?? []);
      if (r.hash !== undefined) rec.hashes.push([r.step, r.hash]);
    }
    return rec;
  }

  it('finds nothing when both machines agree', () => {
    expect(compareRecordings(play(1, 400), play(1, 400))).toBeNull();
  });

  it('names the first diverging checkpoint, step and field', () => {
    const report = compareRecordings(play(1, 400), play(1, 400, 250));
    expect(report).not.toBeNull();
    expect(report!.firstBadStep).toBe(260);
    // Locally both replays agree, so the bad machine is the one whose own hashes this machine cannot reproduce.
    expect(report!.notReproduced).toEqual(['b']);
    expect(report!.diff).toBeNull();
  });

  it('diffs two snapshots that already differ', () => {
    const a = play(1, 100);
    const b = play(1, 100);
    const bad = deserializeState(b.snapshot);
    bad.entities.z[3]! -= 8;
    b.snapshot = serializeState(bad);
    b.hashes = run(cloneState(bad), 100, b.frames).hashes;
    const report = compareRecordings(a, b);
    expect(report!.diff).toMatch(/entities\[3\]\.z/);
  });
});
