// Patch 2's tips, the tester tools' key code and the minimap's colours.
import { PLAYER_COLOURS } from '@blockyrts/protocol';
import { MONSTERS, PEOPLES, VISION_STRIDE, WILD } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { KeyCode, type CodeKey } from '../src/input/tester-code.ts';
import { UnitFlag } from '../src/messages.ts';
import { ENEMY, HIDDEN, inSight, unitSide, type MapUnit } from '../src/minimap/things.ts';
import { TIP_STEPS, TipSeries } from '../src/ui/hints.ts';

const press = (key: string, o: Partial<CodeKey> = {}): CodeKey => ({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...o });
const typeAll = (code: KeyCode, keys: string): boolean[] => [...keys].map((k) => code.key(press(k)));

describe('the tester tools key code', () => {
  it('opens on M N B V C X Z typed in order, and again on the next run', () => {
    const code = new KeyCode();
    expect(typeAll(code, 'mnbvcx')).toEqual([false, false, false, false, false, false]);
    expect(code.key(press('z'))).toBe(true);
    expect(typeAll(code, 'mnbvcxz').at(-1)).toBe(true);
  });

  it('takes capitals and ignores Shift on its own and held keys repeating', () => {
    const code = new KeyCode();
    code.key(press('Shift'));
    expect(typeAll(code, 'MNB')).toEqual([false, false, false]);
    code.key(press('b', { repeat: true }));
    expect(typeAll(code, 'VCXZ').at(-1)).toBe(true);
  });

  it('starts the count again on any other key, a key with Ctrl, or a click', () => {
    const code = new KeyCode();
    expect(typeAll(code, 'mnbqvcxz').some(Boolean)).toBe(false);
    expect(typeAll(code, 'mnb').some(Boolean)).toBe(false);
    code.key(press('v', { ctrlKey: true }));
    expect(typeAll(code, 'cxz').some(Boolean)).toBe(false);
    typeAll(code, 'mnbv');
    code.reset();
    expect(typeAll(code, 'cxz').some(Boolean)).toBe(false);
  });

  it('lets a stray M begin a fresh run', () => {
    const code = new KeyCode();
    expect(typeAll(code, 'mnmnbvcxz').at(-1)).toBe(true);
  });
});

describe('tips', () => {
  const done = (n: number) => (k: number): boolean => k < n;

  it('go by themselves after 12 s of game time, and the next waits until the last is done', () => {
    const t = new TipSeries(3);
    t.start();
    expect(t.view(100, true)).toBe('tip');
    expect(t.view(100 + TIP_STEPS - 1, true)).toBe('tip');
    expect(t.view(100 + TIP_STEPS, true)).toBe('none');
    expect(t.advance(done(0))).toBe(false);
    expect(t.view(1000, true)).toBe('none');
    t.advance(done(1));
    expect(t.at).toBe(1);
    expect(t.view(1000, true)).toBe('tip');
  });

  it('wait for their moment (the dusk tip) before the 12 s start', () => {
    const t = new TipSeries(1);
    t.start();
    expect(t.view(0, false)).toBe('none');
    expect(t.view(5000, true)).toBe('tip');
    expect(t.view(5000 + TIP_STEPS - 1, true)).toBe('tip');
  });

  it('ask "Turn tips off?" at the first X only; Yes ends them for the game', () => {
    const t = new TipSeries(3);
    t.start();
    t.view(0, true);
    t.close(10);
    expect(t.view(11, true)).toBe('ask');
    t.answer(true);
    expect(t.ended).toBe(true);
    t.advance(done(1));
    expect(t.view(20, true)).toBe('none');
  });

  it('take No, or no answer in 12 s, as keep them, and every later X just closes', () => {
    const t = new TipSeries(3);
    t.start();
    t.view(0, true);
    t.close(10);
    expect(t.view(10 + TIP_STEPS - 1, true)).toBe('ask');
    expect(t.view(10 + TIP_STEPS, true)).toBe('none');
    t.advance(done(1));
    expect(t.view(400, true)).toBe('tip');
    t.close(410);
    expect(t.view(411, true)).toBe('none');
    t.advance(done(2));
    t.view(500, true);
    t.close(510);
    t.answer(false);
    expect(t.view(511, true)).toBe('none');
  });

  it('end the series when the last is done', () => {
    const t = new TipSeries(2);
    t.start();
    expect(t.advance(done(2))).toBe(true);
    expect(t.at).toBe(-1);
    expect(t.view(0, true)).toBe('none');
  });
});

describe('the minimap', () => {
  const unit = (o: Partial<MapUnit>): MapUnit => ({ owner: 0, flags: 0, group: 0, hp: 10, inside: 0, ...o });
  const atWar = (g: number): boolean => g === 7;

  it('shows each player in their colour, your mercenaries as yours, and enemies in red', () => {
    expect(unitSide(unit({ owner: 1 }), 2, atWar)).toBe(1);
    expect(unitSide(unit({ owner: 0, group: 3 }), 2, atWar)).toBe(0);
    expect(unitSide(unit({ owner: MONSTERS }), 2, atWar)).toBe(ENEMY);
    expect(unitSide(unit({ owner: PEOPLES, group: 7 }), 2, atWar)).toBe(ENEMY);
  });

  it('leaves off wild animals, peoples at peace, the cloaked, the dead and those inside', () => {
    expect(unitSide(unit({ owner: WILD }), 2, atWar)).toBe(HIDDEN);
    expect(unitSide(unit({ owner: PEOPLES, group: 2 }), 2, atWar)).toBe(HIDDEN);
    expect(unitSide(unit({ owner: MONSTERS, flags: UnitFlag.Cloaked }), 2, atWar)).toBe(HIDDEN);
    expect(unitSide(unit({ hp: 0 }), 2, atWar)).toBe(HIDDEN);
    expect(unitSide(unit({ inside: 5 }), 2, atWar)).toBe(HIDDEN);
  });

  it('shows enemies only within the reach of what the players see', () => {
    // A unit at (0, 0) seeing 100 wu, and a building 1000 to 1200 wu east seeing 50 wu from its edge.
    const v = new Int32Array([0, 0, 0, 0, 0, 100, 0, 1000, 0, 1200, 40, 50]);
    expect(VISION_STRIDE).toBe(6);
    expect(inSight(v, VISION_STRIDE, 60, 80)).toBe(true);
    expect(inSight(v, VISION_STRIDE, 80, 80)).toBe(false);
    expect(inSight(v, VISION_STRIDE, 1250, 40)).toBe(true);
    expect(inSight(v, VISION_STRIDE, 1100, 91)).toBe(false);
    expect(inSight(new Int32Array(0), VISION_STRIDE, 0, 0)).toBe(false);
  });

  it('offers no red to the players: White took its place', () => {
    expect(PLAYER_COLOURS.map((c) => c.name)).toEqual(['Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Teal', 'Pink', 'White']);
    for (const c of PLAYER_COLOURS) {
      const r = parseInt(c.hex.slice(1, 3), 16);
      const g = parseInt(c.hex.slice(3, 5), 16);
      expect(r > 150 && g < 80).toBe(false);
    }
  });
});
