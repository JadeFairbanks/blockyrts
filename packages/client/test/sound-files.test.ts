import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AMBIENCES, EXTRA_SOUNDS, MOB_SOUND_NAMES, MUSIC_STATES, SOUNDS, type AudioEngine } from '@blockyrts/audio';
import { MOBS, MONSTERS, Mob, Period, UnitKind, WU_PER_METRE, type HitEvent } from '@blockyrts/sim';
import { soundFiles } from '../src/audio/files.ts';
import { GameAudio } from '../src/audio/game-audio.ts';
import { ambienceFor, deathSounds, mobSoundName } from '../src/audio/sound-map.ts';
import { GameInfo } from '../src/game/game-info.ts';
import { S, STATE_STRIDE, type StateMessage } from '../src/messages.ts';
import { sanitizeSettings } from '../src/settings/settings.ts';

const { index } = soundFiles();
const publicAudio = fileURLToPath(new URL('../public/audio/', import.meta.url));

describe('the sound redo files', () => {
  it('have every sound, take and music stem the game plays', () => {
    for (const def of SOUNDS) for (let v = 0; v < def.variants; v++) expect(index.entries[`${def.id}.${v}`], `${def.id}.${v}`).toBeDefined();
    for (const state of MUSIC_STATES) for (const stem of ['base', 'tension']) expect(index.entries[`music.${state}.${stem}`], `${state} ${stem}`).toBeDefined();
  });

  it('have the extras: each monster call and death, the ambience and the menu theme', () => {
    for (const def of EXTRA_SOUNDS) for (let v = 0; v < def.variants; v++) expect(index.entries[`${def.id}.${v}`], `${def.id}.${v}`).toBeDefined();
    for (const a of AMBIENCES) expect(index.entries[`ambience.${a}.0`], a).toBeDefined();
    expect(index.entries['music.menu.base']).toBeDefined();
  });

  it('are all on disk, and nothing on disk is missing from the index', () => {
    for (const name of Object.keys(index.entries)) {
      const path = `${publicAudio}${name}.${index.format}`;
      expect(existsSync(path), name).toBe(true);
      expect(statSync(path).size, name).toBeGreaterThan(200);
    }
  });

  it('keep to the brief: short sounds within their longest, loops whole, stems the same length', () => {
    const byId = new Map([...SOUNDS, ...EXTRA_SOUNDS].map((d) => [d.id, d]));
    for (const [name, e] of Object.entries(index.entries)) {
      const loop = name.startsWith('music.') || name.startsWith('ambience.');
      expect(e.total, name).toBe(e.frames + 2 * e.pre);
      expect(e.delay, name).toBeGreaterThan(0);
      if (loop) {
        expect(e.channels, name).toBe(2);
        expect(e.pre, name).toBe(e.rate);
        continue;
      }
      expect(e.channels, name).toBe(1);
      expect(e.pre, name).toBe(0);
      const def = byId.get(name.replace(/\.\d+$/, ''))!;
      expect(def, name).toBeDefined();
      expect(e.frames / e.rate, name).toBeLessThanOrEqual(def.gen === 'voice' ? 1.2 : def.gen === 'file' ? 2.5 : def.maxSeconds);
    }
    for (const state of MUSIC_STATES) expect(index.entries[`music.${state}.tension`]!.frames, state).toBe(index.entries[`music.${state}.base`]!.frames);
  });
});

describe('the night monsters own sounds', () => {
  it('cover every monster the redo voiced, from the sim names', () => {
    const named = new Set(MOBS.map((_, id) => mobSoundName(id)).filter((n) => n !== null));
    expect([...named].sort()).toEqual([...MOB_SOUND_NAMES].sort());
    expect(mobSoundName(Mob.SkeletonArcher)).toBe('skeleton');
    expect(mobSoundName(Mob.SkeletonBomber)).toBe('skeleton');
    expect(mobSoundName(Mob.SmallSlime)).toBe('slime');
    // Tribesmen have voices instead; lair guardians the redo left out keep the shared sounds.
    expect(mobSoundName(Mob.Gnoll)).toBeNull();
    expect(mobSoundName(Mob.GiantCentipede)).toBeNull();
    expect(deathSounds(UnitKind.Mob, 0, Mob.Zombie)).toEqual({ sound: 'mob.zombie.death', voice: null, fallback: 'death_monster' });
    expect(deathSounds(UnitKind.Mob, 0, Mob.GiantCentipede).sound).toBe('death_monster');
  });

  it('call as they strike, at most one of a kind at a time, and fall back where a file is missing', () => {
    for (const files of [true, false]) {
      const played: string[] = [];
      const preloaded: string[] = [];
      const engine = {
        attachUnlock: () => undefined, setVolume: () => undefined, setListener: () => undefined, setMusicState: () => undefined,
        prepareMusic: () => Promise.resolve(), setMusicIntensity: () => undefined, setAmbience: () => undefined, dispose: () => undefined,
        hasSound: (id: string) => files || !id.startsWith('mob.'),
        preload: (id: string) => preloaded.push(id),
        play: (id: string) => played.push(id) > 0,
        voice: () => true,
      } as unknown as AudioEngine;
      const game = new GameInfo(0);
      const audio = new GameAudio(sanitizeSettings(null), game, 0, engine);
      const M = WU_PER_METRE;
      const zombies = [10, 11, 12].map((id) => ({ id, x: id * M }));
      const hits: HitEvent[] = [
        ...zombies.map((z) => ({ look: 'swing' as const, x: z.x, y: 0, z: 0, id: z.id })),
        { look: 'death', x: 10 * M, y: 0, z: 0, id: 10, kind: UnitKind.Mob, mob: Mob.Zombie },
      ];
      const data = new Int32Array(zombies.length * STATE_STRIDE);
      zombies.forEach((z, i) => {
        const o = i * STATE_STRIDE;
        data[o + S.id] = z.id;
        data[o + S.kind] = UnitKind.Mob;
        data[o + S.owner] = MONSTERS;
        data[o + S.x] = z.x;
        data[o + S.mob] = Mob.Zombie;
        data[o + S.hp] = 10;
      });
      const msg: StateMessage = { type: 'state', step: 1, hash: 0, hashStep: 0, count: zombies.length, data, shots: new Int32Array(0), hits: [] };
      game.onState(msg);
      audio.onState(msg);
      const fight = { ...msg, step: 2, hits };
      game.onState(fight);
      audio.onState(fight);
      expect(preloaded).toEqual(['mob.zombie.call', 'mob.zombie.death']);
      if (files) {
        expect(played.filter((p) => p === 'mob.zombie.call')).toHaveLength(1);
        expect(played).toContain('mob.zombie.death');
        expect(played).not.toContain('death_monster');
      } else {
        expect(played.some((p) => p.startsWith('mob.'))).toBe(false);
        expect(played).toContain('death_monster');
      }
      audio.dispose();
    }
  });
});

describe('the ambience', () => {
  it('follows the day: countryside by day and dawn, night from dusk, the blood night its own', () => {
    expect(ambienceFor(Period.Day, false)).toBe('day');
    expect(ambienceFor(Period.Dusk, true)).toBe('night');
    expect(ambienceFor(Period.Night, false)).toBe('night');
    expect(ambienceFor(Period.Night, true)).toBe('blood_night');
    expect(ambienceFor(Period.Dawn, true)).toBe('day');
  });
});
