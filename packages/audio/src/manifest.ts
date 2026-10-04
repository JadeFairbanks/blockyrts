// The sound list: every sound id the game plays, mapped to its generator and
// parameters. The doc's Audio section names the sounds ("chopping, mining,
// digging, building, hits, blocks, deaths, explosions, a torch being lit and
// snuffed out, horns at dusk and dawn, the idle-worker alert, map pings and
// an error sound"); the `source` of each entry says where its name comes
// from. Entries marked "pick" are sounds the doc implies but does not list
// (the blood night's double horn, shots, spells, urgent alerts, interface
// ticks); they are cheap and the client may ignore them.
import { type GeneratorName, type ParamsOf } from './sfx/generators.ts';
import { FAMILY_EVENTS, VOICE_FAMILIES, type VoiceEventId, type VoiceFamilyId } from './voice/voices.ts';

/** The doc's volume sliders (Settings: music, effects and voice volume). */
export type VolumeCategory = 'music' | 'effects' | 'voice';

export type SoundGroup = 'work' | 'combat' | 'fire' | 'alerts' | 'interface' | 'voice';

interface BaseDef {
  readonly id: string;
  readonly label: string;
  readonly group: SoundGroup;
  readonly volume: Exclude<VolumeCategory, 'music'>;
  /** Played at a world position with distance falloff, or flat (alerts, interface). */
  readonly positional: boolean;
  /** How many differently seeded takes to render; playback rotates through them. */
  readonly variants: number;
  /** Peak level the render is scaled to, 0 to 1. */
  readonly level: number;
  /** Most copies that may sound at once; more are dropped. */
  readonly maxInstances: number;
  /** Longest the rendered sound may be, in seconds (checked by the tests). */
  readonly maxSeconds: number;
  /** Reverb mix and room size added after generation. */
  readonly reverb?: { readonly mix: number; readonly room: number };
  readonly source: string;
}

export type SfxDef = { [G in GeneratorName]: BaseDef & { readonly gen: G; readonly params: ParamsOf<G> } }[GeneratorName];
export type VoiceDef = BaseDef & { readonly gen: 'voice'; readonly params: { family: VoiceFamilyId; event: VoiceEventId } };
/** A sound that exists only as a finished file (no code-made version); silent without one. */
export type FileSoundDef = BaseDef & { readonly gen: 'file' };
export type AnySoundDef = SfxDef | VoiceDef | FileSoundDef;

const DOC = 'Audio: Sounds';

function sfx<G extends GeneratorName>(
  id: string,
  label: string,
  group: SoundGroup,
  gen: G,
  params: ParamsOf<G>,
  opts: Partial<Omit<BaseDef, 'id' | 'label' | 'group'>> = {},
): SfxDef {
  return {
    id, label, group, gen, params,
    volume: 'effects', positional: group !== 'alerts' && group !== 'interface',
    variants: 4, level: 0.8, maxInstances: 6, maxSeconds: 2.5, source: DOC,
    ...opts,
  } as SfxDef;
}

// Mode sets reused below.
const STONE_RING = { freqs: [1850, 4290, 7860], decays: [0.18, 0.1, 0.05], amps: [1, 0.5, 0.25] };
const METAL = { freqs: [520, 1310, 2380, 3640, 5120], decays: [0.6, 0.4, 0.25, 0.15, 0.1], amps: [1, 0.7, 0.5, 0.35, 0.2] };
const MARIMBA = { partials: [1, 3.93, 9.24], decays: [1, 0.25, 0.1] };
const BELL = { partials: [1, 2.01, 2.76, 4.07, 5.4], decays: [1, 0.7, 0.5, 0.3, 0.2] };
const GLASS = { partials: [1, 2.32, 4.25], decays: [1, 0.5, 0.25] };

export const SFX: readonly SfxDef[] = [
  // ---- work
  sfx('chop', 'Chopping wood', 'work', 'chop', { dur: 0.35, body: 420, splinter: 1 }, { level: 0.75 }),
  sfx('mine', 'Mining stone and ore', 'work', 'impact', {
    dur: 0.8, thud: { f0: 100, f1: 60, decay: 0.04, gain: 0.6 }, noise: { bp: 1400, q: 0.8, decay: 0.03, gain: 1 },
    modes: { ...STONE_RING, gain: 0.7 }, grains: { count: 9, from: 0.05, to: 0.45, lo: 2000, hi: 5000, decay: 0.008, gain: 0.4 },
  }, { level: 0.75 }),
  sfx('dig', 'Digging earth', 'work', 'dig', { dur: 0.7, tone: 1100, dirt: 1 }, { level: 0.7 }),
  sfx('build', 'Building (hammer)', 'work', 'impact', {
    dur: 0.3, thud: { f0: 140, f1: 90, decay: 0.012, gain: 0.5 }, noise: { hp: 2000, decay: 0.005, gain: 1 },
    bands: [{ f: 600, q: 1, decay: 0.025, gain: 1.4 }, { f: 1500, q: 1.2, decay: 0.015, gain: 0.7 }],
    modes: { freqs: [3100], decays: [0.012], amps: [1], gain: 0.12 },
  }, { level: 0.75 }),
  sfx('build_complete', 'Building finished', 'work', 'chime', {
    notes: [67, 71, 74, 79], spacing: 0.09, ...MARIMBA, decay: 0.45, dur: 1.2,
  }, { positional: false, variants: 1, level: 0.6, maxInstances: 2, source: 'pick (Building placement)' }),

  // ---- combat
  sfx('hit_blade', 'Hit: blade', 'combat', 'impact', {
    dur: 0.45, at: 0.06, swoosh: { from: 1400, to: 4200, dur: 0.07, gain: 0.5 }, thud: { f0: 150, f1: 80, decay: 0.04, gain: 0.7 },
    noise: { hp: 1500, decay: 0.02, gain: 0.8 }, modes: { freqs: [3100, 4700], decays: [0.04, 0.025], amps: [1, 0.5], gain: 0.25 },
  }, { level: 0.75, maxInstances: 8 }),
  sfx('hit_blunt', 'Hit: blunt', 'combat', 'impact', {
    dur: 0.3, thud: { f0: 120, f1: 60, decay: 0.022, gain: 0.8 }, noise: { lp: 900, attack: 0.002, decay: 0.035, gain: 1.4 },
    bands: [{ f: 250, q: 0.8, decay: 0.03, gain: 1.2 }, { f: 1200, q: 1, decay: 0.008, gain: 0.5 }],
  }, { level: 0.8, maxInstances: 8 }),
  sfx('hit_arrow', 'Hit: arrow or bolt', 'combat', 'impact', {
    dur: 0.25, noise: { hp: 2500, decay: 0.003, gain: 1 }, thud: { f0: 150, f1: 90, decay: 0.012, gain: 0.4 },
    bands: [{ f: 450, q: 0.9, decay: 0.018, gain: 1.2 }, { f: 1800, q: 1.2, decay: 0.008, gain: 0.6 }],
  }, { level: 0.7, maxInstances: 8 }),
  sfx('hit_building', 'Hit: on a building or wall', 'combat', 'impact', {
    dur: 0.5, thud: { f0: 100, f1: 55, decay: 0.025, gain: 0.7 }, noise: { lp: 2500, decay: 0.04, gain: 0.8 },
    bands: [{ f: 220, q: 0.7, decay: 0.045, gain: 1.4 }, { f: 700, q: 0.9, decay: 0.025, gain: 0.9 }],
    grains: { count: 7, from: 0.03, to: 0.3, lo: 900, hi: 3000, decay: 0.01, gain: 0.35 },
  }, { level: 0.8 }),
  sfx('block_wood', 'Block: wood or wicker shield', 'combat', 'impact', {
    dur: 0.3, thud: { f0: 130, f1: 80, decay: 0.015, gain: 0.5 }, noise: { hp: 1500, decay: 0.004, gain: 0.8 },
    bands: [{ f: 380, q: 1, decay: 0.03, gain: 1.5 }, { f: 1100, q: 1, decay: 0.015, gain: 0.7 }],
    grains: { count: 3, from: 0.01, to: 0.06, lo: 1500, hi: 4000, decay: 0.004, gain: 0.3 },
  }, { level: 0.75, maxInstances: 8 }),
  sfx('block_metal', 'Block: metal', 'combat', 'impact', {
    dur: 1.6, noise: { hp: 2000, decay: 0.01, gain: 0.6 }, modes: { ...METAL, gain: 0.8 }, thud: { f0: 200, f1: 150, decay: 0.03, gain: 0.4 },
  }, { level: 0.7, maxInstances: 8, reverb: { mix: 0.15, room: 0.5 } }),
  sfx('death_body', 'Death: a body falls', 'combat', 'impact', {
    dur: 0.6, thud: { f0: 90, f1: 50, decay: 0.03, gain: 0.7 }, noise: { lp: 700, attack: 0.004, decay: 0.07, gain: 1.4 },
    grains: { count: 5, from: 0.1, to: 0.35, lo: 400, hi: 2000, decay: 0.012, gain: 0.4 },
  }, { level: 0.75 }),
  sfx('death_monster', 'Death: a monster', 'combat', 'squelch', { from: 900, to: 180, length: 0.45, dur: 0.75 }, { level: 0.75 }),
  sfx('death_building', 'Death: a building collapses', 'combat', 'collapse', { dur: 2.4, pieces: 22 }, { level: 0.85, maxSeconds: 3, maxInstances: 3, variants: 3 }),
  sfx('explosion_small', 'Explosion: small (bombers, bloated corpses)', 'combat', 'explosion', { dur: 1.2, size: 0.3, crackle: 1 }, { level: 0.85, maxInstances: 4 }),
  sfx('explosion_large', 'Explosion: large (gunpowder, cannonballs)', 'combat', 'explosion', { dur: 3.2, size: 1, crackle: 1 }, { level: 0.9, maxInstances: 3, maxSeconds: 3.6, variants: 3, reverb: { mix: 0.15, room: 0.8 } }),
  sfx('shot_bow', 'Shot: bow or crossbow', 'combat', 'twang', { freq: 105, decay: 0.25, whoosh: 0.5, dur: 0.4 }, { level: 0.65, maxInstances: 8, source: 'pick (Bows and crossbows)' }),
  sfx('shot_sling', 'Shot: sling or javelin', 'combat', 'twang', { freq: 70, decay: 0.08, whoosh: 0.9, dur: 0.35 }, { level: 0.6, maxInstances: 8, source: 'pick (Weapons)' }),
  sfx('shot_musket', 'Shot: musket', 'combat', 'explosion', { dur: 1.2, size: 0.2, crackle: 0, crack: 1.5 }, { level: 0.85, maxInstances: 6, reverb: { mix: 0.25, room: 0.8 }, maxSeconds: 3, source: 'pick (Gunpowder)' }),
  sfx('shot_cannon', 'Shot: cannon', 'combat', 'explosion', { dur: 2.5, size: 0.7, crackle: 0.3, crack: 1 }, { level: 0.9, maxInstances: 3, maxSeconds: 3.6, variants: 3, reverb: { mix: 0.2, room: 0.85 }, source: 'pick (Gunpowder)' }),
  sfx('spell_cast', 'Spell cast', 'combat', 'sparkle', { base: 400, rise: 3, grains: 14, dur: 0.9 }, { level: 0.6, reverb: { mix: 0.25, room: 0.7 }, source: 'pick (Mages)' }),

  // ---- fire
  sfx('torch_light', 'Torch lit', 'fire', 'whoosh', { from: 250, to: 2600, length: 0.35, crackle: 14, crackleLength: 0.5, dur: 1 }, { level: 0.7 }),
  sfx('torch_snuff', 'Torch snuffed out', 'fire', 'snuff', { hiss: 1, dur: 0.9 }, { level: 0.65 }),

  // ---- alerts (flat, heard wherever the camera is)
  sfx('horn_dusk', 'Horn at dusk (night is falling)', 'alerts', 'horn', { notes: [[50, 1.3], [0, 0.15], [45, 1.8]], bright: 0.55, dur: 4.2 },
    { variants: 1, level: 0.8, maxInstances: 1, maxSeconds: 5.5, reverb: { mix: 0.35, room: 0.9 } }),
  sfx('horn_dawn', 'Horn at dawn', 'alerts', 'horn', { notes: [[45, 0.5], [0, 0.08], [50, 0.5], [0, 0.08], [57, 1.4]], bright: 0.8, dur: 3.6 },
    { variants: 1, level: 0.8, maxInstances: 1, maxSeconds: 5.5, reverb: { mix: 0.35, room: 0.9 } }),
  sfx('horn_blood_night', 'Double horn: blood night', 'alerts', 'horn', { notes: [[44, 1], [0, 0.25], [44, 1], [0, 0.15], [50, 1.6]], bright: 0.9, dur: 5 },
    { variants: 1, level: 0.85, maxInstances: 1, maxSeconds: 6.5, reverb: { mix: 0.35, room: 0.9 }, source: 'Table 8 (blood night: a double horn)' }),
  sfx('alert_idle_worker', 'Idle worker alert', 'alerts', 'chime', { notes: [76, 72], spacing: 0.16, ...MARIMBA, decay: 0.5, dur: 1 },
    { variants: 1, level: 0.6, maxInstances: 1 }),
  sfx('ping', 'Map ping', 'alerts', 'chime', { notes: [84], spacing: 0, ...GLASS, decay: 0.35, dur: 1.4, echo: { delay: 0.16, count: 3, feedback: 0.45 } },
    { variants: 1, level: 0.65, maxInstances: 2 }),
  sfx('error', 'Error', 'alerts', 'buzz', { pulses: [155, 120], length: 0.09, gap: 0.04, tone: 900 }, { variants: 1, level: 0.55, maxInstances: 1 }),
  sfx('alert_urgent', 'Urgent message', 'alerts', 'chime', { notes: [79, 83, 86], spacing: 0.08, ...BELL, decay: 0.3, dur: 1.1 },
    { variants: 1, level: 0.6, maxInstances: 1, source: 'pick (Urgent messages)' }),
  sfx('alert_war', 'War declared', 'alerts', 'horn', { notes: [[41, 0.35], [0, 0.1], [41, 0.35], [0, 0.1], [48, 1.2]], bright: 0.7, dur: 2.8 },
    { variants: 1, level: 0.75, maxInstances: 1, maxSeconds: 4, reverb: { mix: 0.3, room: 0.85 }, source: 'pick (goblin and neutral war declarations)' }),

  // ---- interface
  sfx('ui_click', 'Interface click', 'interface', 'click', { freq: 1700, decay: 0.012, dur: 0.08 }, { variants: 2, level: 0.4, maxInstances: 2, source: 'pick (HUD buttons)' }),
  sfx('ui_place', 'Building placed', 'interface', 'impact', {
    dur: 0.2, thud: { f0: 150, f1: 100, decay: 0.012, gain: 0.5 }, bands: [{ f: 500, q: 1, decay: 0.02, gain: 1.2 }],
  }, { variants: 2, level: 0.55, maxInstances: 2, source: 'pick (Building placement)' }),
  sfx('ui_message', 'New message in the panel', 'interface', 'chime', { notes: [88], spacing: 0, ...GLASS, decay: 0.15, dur: 0.5 },
    { variants: 1, level: 0.35, maxInstances: 1, source: 'pick (message panel, chat)' }),
];

/** Voice cue ids are "voice.<family>.<event>". */
export function voiceId(family: VoiceFamilyId, event: VoiceEventId): string {
  return `voice.${family}.${event}`;
}

export const VOICES: readonly VoiceDef[] = (Object.keys(VOICE_FAMILIES) as VoiceFamilyId[]).flatMap((family) =>
  FAMILY_EVENTS[family].map((event): VoiceDef => ({
    id: voiceId(family, event),
    label: `${family} ${event.replace('_', ' ')}`,
    group: 'voice',
    volume: 'voice',
    positional: true,
    variants: 3,
    level: event === 'death' || event === 'attack' || event === 'under_attack' ? 0.75 : 0.6,
    maxInstances: 2,
    maxSeconds: 1.2,
    source: 'Audio: Unit voices; Order feedback; Unit speech',
    gen: 'voice',
    params: { family, event },
  })),
);

export const SOUNDS: readonly AnySoundDef[] = [...SFX, ...VOICES];

/**
 * The night monsters with their own call (as they strike) and death sound,
 * from the sound redo's extras. Ids are "mob.<name>.call" and
 * "mob.<name>.death"; the client maps a mob to its name (skeleton archers
 * and bombers share "skeleton", both slimes "slime"). Others keep the
 * shared monster death and make no call.
 */
export const MOB_SOUND_NAMES = [
  'zombie', 'cave_bat', 'giant_rat', 'giant_spider', 'slime', 'skeleton', 'bloated_corpse', 'grave_hound', 'barrow_knight',
  'plague_bearer', 'gravewing', 'bone_colossus', 'hollow_priest', 'cinderling', 'hellhound', 'fiend', 'chain_fiend',
  'scorchwing', 'demon_brute', 'flamecaller', 'infernal_juggernaut', 'rift_scorpion', 'rift_centipede', 'rift_hornet',
  'rift_beetle', 'rift_griffin', 'rift_minotaur', 'void_stalker', 'void_witch', 'abyssal_drake', 'archfiend', 'rift_colossus',
  'morvath',
] as const;
export type MobSoundName = (typeof MOB_SOUND_NAMES)[number];

/** The day's background loops (files only), heard under the music. */
export const AMBIENCES = ['day', 'night', 'blood_night'] as const;
export type AmbienceId = (typeof AMBIENCES)[number];

function fileSound(id: string, label: string, opts: Partial<BaseDef>): FileSoundDef {
  return {
    id, label, group: 'combat', volume: 'effects', positional: true, variants: 2, level: 0.7, maxInstances: 3, maxSeconds: 2.5,
    source: 'sound redo, extras', gen: 'file', ...opts,
  };
}

export const EXTRA_SOUNDS: readonly FileSoundDef[] = MOB_SOUND_NAMES.flatMap((m) => [
  fileSound(`mob.${m}.call`, `${m.replace(/_/g, ' ')} call`, { maxInstances: 3 }),
  fileSound(`mob.${m}.death`, `${m.replace(/_/g, ' ')} death`, { level: 0.75, maxInstances: 4 }),
]);

const BY_ID = new Map<string, AnySoundDef>([...SOUNDS, ...EXTRA_SOUNDS].map((s) => [s.id, s]));

export function soundDef(id: string): AnySoundDef | undefined {
  return BY_ID.get(id);
}
