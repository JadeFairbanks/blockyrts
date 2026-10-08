// Milestone 9's client pieces that need no browser: invite codes, the Send
// window's amounts, the lobby's start rule, account checks, browser support,
// the graphics settings, seats, and a save file's round trip with its seats
// (and, since Milestone 11, the refusal of a save from before the troop rework).
import { describe, expect, it } from 'vitest';
import { Presence, readSaveHeader, RoomPhase, SaveSection, writeSaveFile, type RoomStateMessage } from '@blockyrts/protocol';
import { createWorld, deserializeState, hashState, serializeState, step } from '@blockyrts/sim';
import { addAmount, parseAmount } from '../src/hud/allies.ts';
import { joinCodeOf, normaliseCode } from '../src/net/api.ts';
import { makeSave, OLD_SAVE_TEXT, openSave, SAVE_FORMAT_VERSION, seatSlots, type Seat } from '../src/net/saves.ts';
import { applyQuality, DEFAULT_SETTINGS, sanitizeSettings, VIEW_RINGS } from '../src/settings/settings.ts';
import { accountProblem } from '../src/ui/account.ts';
import { startProblem } from '../src/ui/lobby.ts';
import { newSoloPlan, soloPlan } from '../src/ui/main-menu.ts';
import { supportProblems } from '../src/ui/support.ts';
import { seatsOf } from '../src/game/match.ts';

function room(players: Array<Partial<RoomStateMessage['players'][number]> & { slot: number }>, over: Partial<RoomStateMessage> = {}): RoomStateMessage {
  return {
    type: 'roomState',
    code: 'ABC234',
    matchId: 'm',
    phase: RoomPhase.Lobby,
    seed: 7,
    fromSave: false,
    hostSlot: 0,
    yourSlot: 0,
    rejoinToken: 't',
    players: players.map((p) => ({ name: `P${p.slot}`, colour: p.slot, ready: false, presence: Presence.Connected, guest: false, accountId: '', ...p })),
    ...over,
  };
}

describe('Milestone 9: invite codes and links', () => {
  it('reads a typed code or a pasted link', () => {
    expect(normaliseCode(' abc-234 ')).toBe('ABC234');
    expect(normaliseCode('https://play.surviveandconquer.cc/join/xyz789')).toBe('XYZ789');
    expect(joinCodeOf('/join/ABC234', '')).toBe('ABC234');
    expect(joinCodeOf('/', '?join=QQQ222')).toBe('QQQ222');
    expect(joinCodeOf('/', '?seed=1')).toBeNull();
  });
});

describe('Milestone 9: Send resources amounts', () => {
  it('adds +10 and +100 up to what the pool holds, and reads typed amounts', () => {
    expect(addAmount(0, 10, 50)).toBe(10);
    expect(addAmount(45, 10, 50)).toBe(50);
    expect(addAmount(0, 100, 30)).toBe(30);
    expect(parseAmount('25', 50)).toBe(25);
    expect(parseAmount('1,000', 50)).toBe(50);
    expect(parseAmount('', 50)).toBe(0);
    expect(parseAmount('ten', 50)).toBe(-1);
  });
});

describe('Milestone 9: the lobby', () => {
  it('lets the host start only when everyone is back and ready', () => {
    expect(startProblem(room([{ slot: 0 }]))).toBe('');
    expect(startProblem(room([{ slot: 0 }, { slot: 1, name: 'Sam' }]))).toContain('Sam to be ready');
    expect(startProblem(room([{ slot: 0 }, { slot: 1, ready: true }]))).toBe('');
    expect(startProblem(room([{ slot: 0 }, { slot: 3, name: 'Kit', presence: Presence.Reserved }], { fromSave: true }))).toContain('Kit to rejoin');
  });

  it('seats the playing slots in order, with their names and colours', () => {
    const r = room([{ slot: 0, colour: 2 }, { slot: 5, name: 'Sam', colour: 4, accountId: 'a5' }]);
    const seats = seatsOf(r, (1 << 0) | (1 << 5));
    expect(seats.map((s) => [s.slot, s.name, s.colour, s.accountId])).toEqual([
      [0, 'P0', 2, ''],
      [5, 'Sam', 4, 'a5'],
    ]);
    expect(seatSlots(seats)).toEqual([0, 5]);
  });
});

describe('Milestone 9: accounts and browsers', () => {
  it('checks a new account before asking the server', () => {
    expect(accountProblem('jade@example.com', 'Jade_1', 'longenough')).toBe('');
    expect(accountProblem('jade', 'Jade', 'longenough')).toContain('email');
    expect(accountProblem('jade@example.com', 'J', 'longenough')).toContain('3 to 20');
    expect(accountProblem('jade@example.com', 'Guest77', 'longenough')).toContain('Guest');
    expect(accountProblem('jade@example.com', 'Jade', 'short')).toContain('at least');
  });

  it('names what a browser is missing', () => {
    const ok = { webgl2: true, compression: true, pointerLock: true, fullscreen: true, touchOnly: false };
    expect(supportProblems(ok)).toEqual([]);
    expect(supportProblems({ ...ok, touchOnly: true })[0]).toContain('Touch controls');
    expect(supportProblems({ ...ok, touchOnly: true }, true)).toEqual([]);
    expect(supportProblems({ ...ok, webgl2: false })[0]).toContain('WebGL2');
  });
});

describe('Milestone 9: settings', () => {
  it('keeps the graphics, sound and hint settings in range', () => {
    const s = sanitizeSettings({ quality: 'ultra', resolutionScale: 3, shadows: 'yes', viewDistance: 'far', musicVolume: -2, hints: false });
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.resolutionScale).toBe(1);
    expect(s.shadows).toBe(DEFAULT_SETTINGS.shadows);
    expect(s.viewDistance).toBe('far');
    expect(s.musicVolume).toBe(0);
    expect(s.hints).toBe(false);
  });

  it('sets scale, shadows and view distance from a quality preset', () => {
    const s = sanitizeSettings(null);
    applyQuality(s, 'low');
    expect([s.resolutionScale, s.shadows, s.viewDistance]).toEqual([0.75, false, 'near']);
    applyQuality(s, 'high');
    expect([s.resolutionScale, s.shadows, s.viewDistance]).toEqual([1, true, 'far']);
    expect(VIEW_RINGS.near).toBeLessThan(VIEW_RINGS.far);
  });
});

describe('Milestone 9: save files', () => {
  it('round-trips the state and the seats, and lists only players still in', async () => {
    const s = createWorld(11, { players: 3, peaceful: true });
    for (let k = 0; k < 30; k++) step(s);
    const seats: Seat[] = [
      { slot: 2, name: 'Jade', colour: 0, accountId: 'acc-jade' },
      { slot: 0, name: 'Sam', colour: 3, accountId: '' },
      { slot: 5, name: 'Kit', colour: 6, accountId: 'acc-kit' },
    ];
    const data = await makeSave({ matchId: 'match-1', seed: 11, seats }, { step: s.step, night: 0, data: serializeState(s) }, 'Night 0', [false, true, false]);
    const header = readSaveHeader(data);
    expect(header.players.map((p) => p.slot)).toEqual([2, 5]);
    expect(header.matchId).toBe('match-1');
    const opened = await openSave(data);
    expect(opened.seats.map((x) => [x.slot, x.name, x.colour, x.accountId])).toEqual([
      [2, 'Jade', 0, 'acc-jade'],
      [0, 'Sam', 3, ''],
      [5, 'Kit', 6, 'acc-kit'],
    ]);
    expect(hashState(deserializeState(opened.sim))).toBe(hashState(s));
    // Played on alone by Kit's account: Kit's seat.
    expect(soloPlan(opened, 'acc-kit', 'match-1').player).toBe(2);
    expect(soloPlan(opened, 'someone-else', '').player).toBe(0);
  });

  it('refuses what is not a save file', async () => {
    await expect(openSave(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).rejects.toThrow('not a Survive and Conquer save');
  });

  it('refuses a save from any older version (before Patch 2 and every patch after), saying why', async () => {
    // Patch 2 made the format 3, the mini patch 4, Patch 3 5, Patch 3b 6, indev 0.8 7, Patch 4 8 and Patch 5 9, and every patch raises it (Jade's standing rule): older saves are refused, never carried over.
    expect(SAVE_FORMAT_VERSION).toBe(9);
    expect(OLD_SAVE_TEXT).toBe('That save is from an older version of the game. Start a new game.');
    const s = createWorld(11, { players: 1, peaceful: true });
    for (const formatVersion of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const header = { formatVersion, gameVersion: '0.10.0', matchId: 'old', seed: 11, step: s.step, night: 0, label: 'Night 0', players: [{ slot: 0, name: 'Jade', colour: 0, accountId: '' }] };
      const old = await writeSaveFile(header, [{ tag: SaveSection.SimState, version: 1, data: serializeState(s) }]);
      await expect(openSave(old)).rejects.toThrow(OLD_SAVE_TEXT);
    }
    // The same game written now opens.
    const now = await makeSave({ matchId: 'new', seed: 11, seats: [{ slot: 0, name: 'Jade', colour: 0, accountId: '' }] }, { step: s.step, night: 0, data: serializeState(s) }, 'Night 0');
    expect(readSaveHeader(now).formatVersion).toBe(9);
    expect((await openSave(now)).header.matchId).toBe('new');
  });

  it('starts a game alone with one seat, or empty pockets for testing', () => {
    expect(newSoloPlan(5, 'Jade', 'a').seats).toEqual([{ slot: 0, name: 'Jade', colour: 0, accountId: 'a' }]);
    const p = newSoloPlan(5, 'Jade', '', 3);
    expect(p.seats.map((x) => x.slot)).toEqual([0, -1, -1]);
    expect(p.player).toBe(0);
  });
});
