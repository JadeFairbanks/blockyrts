import { describe, expect, it } from 'vitest';
import { SFX, soundDef } from '@blockyrts/audio';
import { BuildingKind, DAY_STEPS, DUSK_STEPS, Engine, Mob, MONSTERS, NIGHT_STEPS, OrderKind, PEOPLES, PeopleUnit, Period, PISTOL_GEAR, RANGER_GEAR, SHIELD_GEAR, UnitKind, WU_PER_METRE, type HitEvent, type SimEvent } from '@blockyrts/sim';
import type { AudioEngine } from '@blockyrts/audio';
import { cue } from '../src/audio/cues.ts';
import { GameAudio } from '../src/audio/game-audio.ts';
import { deathSounds, eventCue, hitSound, hornFor, musicFor, orderVoice, shotSound, voiceFamily, workSound, type Who } from '../src/audio/sound-map.ts';
import { GameInfo } from '../src/game/game-info.ts';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage, type StateMessage } from '../src/messages.ts';
import { DEFAULT_SETTINGS, saveSettings, sanitizeSettings } from '../src/settings/settings.ts';

const unitWho = (kind: number, extra: Partial<Who> = {}): Who => ({ kind, owner: 0, mob: 0, ranged: 0, shield: 0, order: 0, ...extra });

describe('the sound map (Audio)', () => {
  it('plays a track for each time of day, the blood night its own', () => {
    expect(musicFor(Period.Day, false)).toBe('day');
    expect(musicFor(Period.Dusk, true)).toBe('dusk');
    expect(musicFor(Period.Night, false)).toBe('night');
    expect(musicFor(Period.Night, true)).toBe('blood_night');
    expect(musicFor(Period.Dawn, true)).toBe('dawn');
    expect(hornFor(Period.Dusk, false)).toBe('horn_dusk');
    expect(hornFor(Period.Dusk, true)).toBe('horn_blood_night');
    expect(hornFor(Period.Dawn, false)).toBe('horn_dawn');
    expect(hornFor(Period.Night, false)).toBeNull();
  });

  it('gives each unit its voice', () => {
    expect(voiceFamily(UnitKind.Worker, 0, 0)).toBe('worker');
    expect(voiceFamily(UnitKind.Warrior, 0, 0)).toBe('warrior');
    expect(voiceFamily(UnitKind.Mage, 0, 0)).toBe('mage');
    expect(voiceFamily(UnitKind.Mob, MONSTERS, Mob.Zombie)).toBeNull();
    expect(voiceFamily(UnitKind.Mob, MONSTERS, Mob.GoblinCutter)).toBe('goblin');
    expect(voiceFamily(UnitKind.Mob, MONSTERS, Mob.Hobgoblin)).toBe('hobgoblin');
    expect(voiceFamily(UnitKind.Mob, MONSTERS, Mob.Kobold)).toBe('kobold');
    expect(voiceFamily(UnitKind.Mob, MONSTERS, Mob.Gnoll)).toBe('gnoll');
    expect(voiceFamily(UnitKind.Warrior, PEOPLES, PeopleUnit.HalflingMale)).toBe('halfling');
    expect(voiceFamily(UnitKind.Animal, 253, 0)).toBeNull();
    expect(voiceFamily(UnitKind.Engine, 0, Engine.Catapult)).toBeNull();
  });

  it('tells blades from arrows, blocks from blows on walls, and big blasts from small', () => {
    expect(hitSound('blood', unitWho(UnitKind.Mob), false)).toBe('hit_blade');
    expect(hitSound('blood', unitWho(UnitKind.Mob), true)).toBe('hit_arrow');
    expect(hitSound('bone', unitWho(UnitKind.Mob), false)).toBe('hit_blunt');
    expect(hitSound('wood', { kind: 'building', owner: 0, mob: 0, ranged: 0, shield: 0, order: 0 }, false)).toBe('hit_building');
    // Milestone 11: shields are gear ids from the kit tables; the boiled-leather targe thuds, the iron-rimmed heater rings.
    expect(hitSound('wood', unitWho(UnitKind.Warrior, { shield: SHIELD_GEAR[2]! }), false)).toBe('block_wood');
    expect(hitSound('wood', unitWho(UnitKind.Warrior, { shield: SHIELD_GEAR[3]! }), false)).toBe('block_metal');
    expect(hitSound('wood', null, false)).toBeNull();
    expect(hitSound('shake', unitWho(UnitKind.Worker, { order: OrderKind.Dig }), false)).toBeNull();
    expect(hitSound('blast', unitWho(UnitKind.Engine, { mob: Engine.BronzeCannon }), false)).toBe('explosion_large');
    expect(hitSound('blast', unitWho(UnitKind.Mob, { owner: MONSTERS, mob: Mob.SkeletonBomber }), false)).toBe('explosion_small');
    expect(hitSound('burst', { kind: 'building', owner: 0, mob: 0, ranged: 0, shield: 0, order: 0 }, false)).toBe('torch_snuff');
    expect(hitSound('spell', null, false)).toBe('spell_cast');
    // A ranger's weapon by tier: 8 the musket, 1 the sling, 7 the crossbow; the brawler's pistol bangs like a musket.
    expect(shotSound(unitWho(UnitKind.Warrior, { ranged: RANGER_GEAR[8]! }))).toBe('shot_musket');
    expect(shotSound(unitWho(UnitKind.Warrior, { ranged: PISTOL_GEAR }))).toBe('shot_musket');
    expect(shotSound(unitWho(UnitKind.Warrior, { ranged: RANGER_GEAR[1]! }))).toBe('shot_sling');
    expect(shotSound(unitWho(UnitKind.Warrior, { ranged: RANGER_GEAR[7]! }))).toBe('shot_bow');
    expect(shotSound(unitWho(UnitKind.Engine, { mob: Engine.IronCannon }))).toBe('shot_cannon');
    expect(deathSounds(UnitKind.Mob, MONSTERS, Mob.Zombie)).toEqual({ sound: 'death_monster', voice: null });
    expect(deathSounds(UnitKind.Worker, 0, 0)).toEqual({ sound: 'death_body', voice: 'worker' });
  });

  it('hears what a worker is doing, and what units say', () => {
    expect(workSound(OrderKind.Chop, { t: 'gather', cx: 0, cz: 0, i: 0 })?.id).toBe('chop');
    expect(workSound(OrderKind.Chop, { t: 'work', b: 3 })?.id).toBe('build');
    expect(workSound(OrderKind.Mine, undefined)?.id).toBe('mine');
    expect(workSound(OrderKind.Dig, undefined)?.id).toBe('dig');
    expect(workSound(OrderKind.Move, undefined)).toBeNull();
    expect(orderVoice('attack')).toBe('attack');
    expect(orderVoice('move')).toBe('acknowledge');
    expect(eventCue({ kind: 'idle', text: 'I have run out of softwood lumber nearby.' })).toEqual({ sound: 'alert_idle_worker', voice: 'resource_out' });
    expect(eventCue({ kind: 'speech', text: 'Help! I am being attacked!', urgent: true }).voice).toBe('under_attack');
    expect(eventCue({ kind: 'alert', text: 'Your workers are starving and slowed.' }).voice).toBe('hungry');
    expect(eventCue({ kind: 'alert', text: 'I cannot reach that.', urgent: true }).voice).toBe('cannot');
    expect(eventCue({ kind: 'alert', text: 'A goblin village has declared war on you.' }).sound).toBe('alert_war');
    expect(eventCue({ kind: 'alert', text: 'A blood night is coming.', sound: 'double-horn' }).sound).toBe('horn_blood_night');
  });

  it('names only sounds the audio package has', () => {
    const ids = ['chop', 'mine', 'dig', 'build', 'build_complete', 'hit_blade', 'hit_blunt', 'hit_arrow', 'hit_building', 'block_wood', 'block_metal', 'death_body', 'death_monster', 'death_building', 'explosion_small', 'explosion_large', 'shot_bow', 'shot_sling', 'shot_musket', 'shot_cannon', 'spell_cast', 'torch_light', 'torch_snuff', 'horn_dusk', 'horn_dawn', 'horn_blood_night', 'alert_idle_worker', 'ping', 'error', 'alert_urgent', 'alert_war', 'ui_click', 'ui_place', 'ui_message'];
    for (const id of ids) expect(soundDef(id), id).toBeDefined();
    // Every effect the package makes is played by something in the game.
    expect(SFX.map((s) => s.id).sort()).toEqual([...ids].sort());
  });
});

/** A stand-in engine that records what the game asked it to play. */
function fakeEngine(): { engine: AudioEngine; played: string[]; music: string[]; volumes: Record<string, number> } {
  const played: string[] = [];
  const music: string[] = [];
  const volumes: Record<string, number> = {};
  const engine = {
    attachUnlock: () => undefined,
    setVolume: (k: string, v: number) => (volumes[k] = v),
    setListener: () => undefined,
    setMusicState: (m: string | null) => m && music.push(m),
    prepareMusic: () => Promise.resolve(),
    setMusicIntensity: () => undefined,
    play: (id: string) => {
      played.push(id);
      return true;
    },
    voice: (family: string, event: string) => {
      played.push(`voice.${family}.${event}`);
      return true;
    },
    dispose: () => undefined,
  } as unknown as AudioEngine;
  return { engine, played, music, volumes };
}

interface U {
  id: number;
  kind: number;
  owner?: number;
  x?: number;
  z?: number;
  order?: number;
  mob?: number;
  shield?: number;
}

function state(step: number, units: U[], hits: HitEvent[] = []): StateMessage {
  const data = new Int32Array(units.length * STATE_STRIDE);
  units.forEach((u, i) => {
    const o = i * STATE_STRIDE;
    data[o + S.id] = u.id;
    data[o + S.kind] = u.kind;
    data[o + S.owner] = u.owner ?? 0;
    data[o + S.x] = u.x ?? 0;
    data[o + S.z] = u.z ?? 0;
    data[o + S.order] = u.order ?? OrderKind.Idle;
    data[o + S.mob] = u.mob ?? 0;
    data[o + S.shield] = u.shield ?? 0;
    data[o + S.hp] = 10;
  });
  return { type: 'state', step, hash: 0, hashStep: 0, count: units.length, data, shots: new Int32Array(0), hits };
}

function building(id: number, extra: Partial<BuildingInfo>): BuildingInfo {
  return { id, owner: 0, kind: BuildingKind.TorchPost, variant: 0, level: 1, x: 0, z: 0, y: 0, hp: 40, maxHp: 40, complete: true, built: 1000, upgrading: 0, upgraded: 0, queue: [], rally: [], lit: false, fuelLeft: 0, assigned: 0, working: 0, inside: [], status: '', name: '', upgradeWhy: '', products: [], shared: false, stock: [], rating: 0, herd: 0, troops: [], horses: 0, farm: null, ...extra };
}

function info(step: number, buildings: BuildingInfo[], events: SimEvent[] = [], extra: Partial<InfoMessage> = {}): InfoMessage {
  return { type: 'info', step, buildings, events, queues: [], blood: [], starveWorkers: false, starveTroops: false, ...extra } as unknown as InfoMessage;
}

describe('the match plays every sound in the Audio list', () => {
  it('from what the sim reports, and keeps to the Settings volumes', () => {
    const f = fakeEngine();
    const game = new GameInfo(0);
    const audio = new GameAudio(sanitizeSettings(null), game, 0, f.engine);
    expect(f.volumes).toEqual({ music: DEFAULT_SETTINGS.musicVolume, effects: DEFAULT_SETTINGS.effectsVolume, voice: DEFAULT_SETTINGS.voiceVolume });
    saveSettings({ ...sanitizeSettings(null), musicVolume: 0.2, effectsVolume: 0.5, voiceVolume: 0 });
    expect(f.volumes).toEqual({ music: 0.2, effects: 0.5, voice: 0 });

    const M = WU_PER_METRE;
    // Day: four workers chop, mine, dig and build near the camera; a torch post stands unlit.
    const workers: U[] = [
      { id: 1, kind: UnitKind.Worker, order: OrderKind.Chop, x: 2 * M },
      { id: 2, kind: UnitKind.Worker, order: OrderKind.Mine, x: 3 * M },
      { id: 3, kind: UnitKind.Worker, order: OrderKind.Dig, x: 4 * M },
      { id: 4, kind: UnitKind.Worker, order: OrderKind.Chop, x: 5 * M },
      { id: 5, kind: UnitKind.Warrior, x: 6 * M, shield: SHIELD_GEAR[1]! },
      { id: 6, kind: UnitKind.Warrior, x: 7 * M, shield: SHIELD_GEAR[4]! },
    ];
    let msg = state(10, workers);
    game.onState(msg);
    const first = info(10, [building(100, {}), building(101, { kind: BuildingKind.Storehouse, complete: false })], [], { queues: [[4, [{ t: 'work', b: 101 }]]] } as Partial<InfoMessage>);
    game.onInfo(first);
    audio.onInfo(first);
    audio.onState(msg);
    expect(f.music).toEqual(['day']);
    for (let t = 0; t <= 3000; t += 100) audio.frame(0, 0, t);
    for (const id of ['chop', 'mine', 'dig', 'build']) expect(f.played, id).toContain(id);

    // The torch post is lit, the storehouse finishes, then the torch is snuffed out.
    const lit = info(11, [building(100, { lit: true }), building(101, { kind: BuildingKind.Storehouse, complete: true })]);
    game.onInfo(lit);
    audio.onInfo(lit);
    const out = info(12, [building(100, { lit: false }), building(101, { kind: BuildingKind.Storehouse, complete: true, hp: 10 })]);
    game.onInfo(out);
    audio.onInfo(out);
    expect(f.played).toContain('torch_light');
    expect(f.played).toContain('torch_snuff');
    expect(f.played).toContain('build_complete');
    // The storehouse falls.
    const fell = info(13, [building(100, {})]);
    game.onInfo(fell);
    audio.onInfo(fell);
    expect(f.played).toContain('death_building');

    // Fighting: blows, blocks on wood and metal, deaths, an explosion.
    const hits: HitEvent[] = [
      { look: 'blood', x: 2 * M, y: 0, z: 0, id: 1 },
      { look: 'wood', x: 6 * M, y: 0, z: 0, id: 5 },
      { look: 'wood', x: 7 * M, y: 0, z: 0, id: 6 },
      { look: 'death', x: 2 * M, y: 0, z: 0, id: 99, kind: UnitKind.Mob, mob: Mob.Zombie },
      { look: 'death', x: 2 * M, y: 0, z: 0, id: 2, kind: UnitKind.Worker, mob: 0 },
      { look: 'blast', x: 2 * M, y: 0, z: 0, id: 0 },
    ];
    msg = state(DAY_STEPS + 1, workers, hits);
    game.onState(msg);
    audio.onState(msg);
    for (const id of ['hit_blade', 'block_wood', 'block_metal', 'death_monster', 'death_body', 'voice.worker.death', 'explosion_small', 'horn_dusk']) expect(f.played, id).toContain(id);
    expect(f.music).toContain('dusk');

    // Night, then dawn's horn.
    msg = state(DAY_STEPS + DUSK_STEPS + 1, workers);
    game.onState(msg);
    audio.onState(msg);
    msg = state(DAY_STEPS + DUSK_STEPS + NIGHT_STEPS + 1, workers);
    game.onState(msg);
    audio.onState(msg);
    expect(f.music).toEqual(['day', 'dusk', 'night', 'dawn']);
    expect(f.played).toContain('horn_dawn');

    // Voices: the idle worker, hunger, an attack; selection and orders; the interface.
    const said = info(20, [], [
      { player: 0, kind: 'idle', text: 'I have run out of loose stone nearby.', speaker: 1, x: 0, z: 0, urgent: true },
      { player: 0, kind: 'speech', text: 'Help! I am being attacked!', speaker: 1, urgent: true, x: 0, z: 0 },
      { player: 0, kind: 'alert', text: 'Your workers are starving and slowed.' },
    ]);
    game.onInfo(said);
    audio.onInfo(said);
    audio.onSelection([{ key: 'e:5', kind: 'unit', owner: 0, typeKey: 'warrior', label: 'Warrior' } as never]);
    audio.onOrder({ kind: 'move', player: 0, units: [1], x: 0, z: 0 });
    cue('ping');
    cue('error');
    cue('ui_click');
    for (const id of ['alert_idle_worker', 'voice.worker.resource_out', 'voice.worker.under_attack', 'voice.worker.hungry', 'voice.warrior.select', 'voice.worker.acknowledge', 'ping', 'error', 'ui_click']) expect(f.played, id).toContain(id);
    audio.dispose();
    // Once the match's audio is gone, interface cues go nowhere.
    const n = f.played.length;
    cue('error');
    expect(f.played.length).toBe(n);
    saveSettings(sanitizeSettings(null));
  });
});
