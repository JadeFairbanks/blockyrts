// The audition page: play every sound, voice cue and music state.
import { AudioEngine, type VolumeSlider } from '../engine/engine.ts';
import { DEFAULT_SPATIAL, falloff } from '../engine/spatial.ts';
import { SFX, SOUNDS, voiceId, type SoundGroup } from '../manifest.ts';
import { MUSIC, MUSIC_STATES, loopSeconds, type MusicStateId } from '../music/score.ts';
import { FAMILY_EVENTS, VOICE_EVENTS, VOICE_FAMILIES, type VoiceEventId, type VoiceFamilyId } from '../voice/voices.ts';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};

let engine: AudioEngine | null = null;
/** Where positional sounds play, metres from the camera. */
const spot = { x: 0, z: 0 };
const soundButtons: { id: string; button: HTMLButtonElement }[] = [];

// ---------------------------------------------------------------- start

el<HTMLButtonElement>('start').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  if (!engine) {
    engine = new AudioEngine();
    engine.setListener(0, 0);
    applyVolumes();
  }
  await engine.unlock();
  btn.disabled = true;
  btn.textContent = 'Audio on';
  watchReady();
});

function watchReady(): void {
  const tick = (): void => {
    if (!engine) return;
    const ready = SOUNDS.filter((s) => engine!.isReady(s.id)).length;
    for (const { id, button } of soundButtons) button.disabled = !engine.isReady(id);
    el('status').textContent = ready === SOUNDS.length ? `All ${SOUNDS.length} sounds ready.` : `Generating sounds: ${ready} of ${SOUNDS.length} ready.`;
    if (ready < SOUNDS.length) setTimeout(tick, 200);
  };
  tick();
}

// ---------------------------------------------------------------- volume

const SLIDERS: [VolumeSlider, string, number][] = [['master', 'Master', 1], ['music', 'Music', 0.6], ['effects', 'Effects', 1], ['voice', 'Voice', 1]];
const volumeInputs = new Map<VolumeSlider, HTMLInputElement>();
for (const [key, label, value] of SLIDERS) {
  const input = make('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(value) });
  const out = make('output', {}, value.toFixed(2));
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    engine?.setVolume(key, Number(input.value));
  });
  volumeInputs.set(key, input);
  el('volumes').append(make('label', {}, label, input, out));
}
function applyVolumes(): void {
  for (const [key, input] of volumeInputs) engine?.setVolume(key, Number(input.value));
}

// ---------------------------------------------------------------- music

const musicButtons = new Map<MusicStateId | null, HTMLButtonElement>();
const fadeInput = el<HTMLInputElement>('fade');
fadeInput.addEventListener('input', () => (el('fade-out').textContent = `${fadeInput.value} s`));
const intensity = el<HTMLInputElement>('intensity');
intensity.addEventListener('input', () => {
  el('intensity-out').textContent = Number(intensity.value).toFixed(2);
  engine?.setMusicIntensity(Number(intensity.value), 1);
});

for (const state of [...MUSIC_STATES, null]) {
  const def = state ? MUSIC[state] : null;
  const b = make('button', { textContent: def ? def.title : 'Stop' });
  b.addEventListener('click', async () => {
    if (!engine) el<HTMLButtonElement>('start').click();
    await new Promise((r) => setTimeout(r, 0));
    if (!engine) return;
    engine.setMusicState(state, Number(fadeInput.value));
    for (const [s, btn] of musicButtons) btn.classList.toggle('on', s === state && s !== null);
    if (!def) {
      el('music-status').textContent = 'No music playing.';
      return;
    }
    el('music-status').textContent = `Preparing ${def.title.toLowerCase()} music...`;
    await engine.prepareMusic(state!);
    if (engine.musicState() === state) {
      el('music-status').textContent = `${def.title}: ${def.bpm} beats a minute, a ${loopSeconds(def).toFixed(1)} s loop of ${def.bars} bars. Layers: ${def.layers
        .map((l) => `${l.name}${l.stem === 'tension' ? ' (tension)' : ''}`)
        .join(', ')}.`;
    }
  });
  musicButtons.set(state, b);
  el('music').append(b);
}

// ---------------------------------------------------------------- position pad

const pad = el<HTMLCanvasElement>('pad');
const padCtx = pad.getContext('2d')!;
const PAD_RANGE = DEFAULT_SPATIAL.far;
function drawPad(): void {
  const w = pad.width;
  const c = w / 2;
  const k = c / PAD_RANGE;
  padCtx.clearRect(0, 0, w, w);
  padCtx.strokeStyle = '#323a43';
  padCtx.beginPath();
  padCtx.arc(c, c, DEFAULT_SPATIAL.far * k, 0, Math.PI * 2);
  padCtx.stroke();
  padCtx.strokeStyle = '#4f8f5a';
  padCtx.beginPath();
  padCtx.arc(c, c, DEFAULT_SPATIAL.near * k, 0, Math.PI * 2);
  padCtx.stroke();
  padCtx.fillStyle = '#e7e9ec';
  padCtx.fillRect(c - 3, c - 3, 6, 6);
  padCtx.fillStyle = '#d9a441';
  padCtx.beginPath();
  padCtx.arc(c + spot.x * k, c + spot.z * k, 6, 0, Math.PI * 2);
  padCtx.fill();
  const g = falloff({ x: 0, z: 0, rightX: 1, rightZ: 0 }, spot.x, spot.z);
  el('pad-info').textContent = `Sound ${Math.hypot(spot.x, spot.z).toFixed(0)} m from the camera, level ${(g * 100).toFixed(0)}%.`;
}
pad.addEventListener('click', (e) => {
  const r = pad.getBoundingClientRect();
  const k = PAD_RANGE / (r.width / 2);
  spot.x = (e.clientX - r.left - r.width / 2) * k;
  spot.z = (e.clientY - r.top - r.height / 2) * k;
  drawPad();
});
drawPad();

// ---------------------------------------------------------------- sounds

function play(id: string, variant?: number): void {
  if (!engine) return;
  engine.play(id, variant === undefined ? { x: spot.x, z: spot.z } : { x: spot.x, z: spot.z, variant });
}

function soundButton(id: string, label: string, variant?: number, small = false): HTMLButtonElement {
  const b = make('button', { textContent: label, disabled: true, className: small ? 'small' : '' });
  b.addEventListener('click', () => play(id, variant));
  soundButtons.push({ id, button: b });
  return b;
}

const GROUPS: [SoundGroup, string][] = [['work', 'Work'], ['combat', 'Combat'], ['fire', 'Fire and light'], ['alerts', 'Alerts (heard everywhere)'], ['interface', 'Interface']];
for (const [group, title] of GROUPS) {
  const grid = make('div', { className: 'grid' });
  for (const def of SFX.filter((s) => s.group === group)) {
    const variants = make('span', { className: 'buttons' });
    if (def.variants > 1) for (let v = 0; v < def.variants; v++) variants.append(soundButton(def.id, String(v + 1), v, true));
    grid.append(make('div', { className: 'card' },
      make('div', { className: 'name' }, def.label),
      make('div', { className: 'id' }, def.id),
      make('div', { className: 'src' }, def.source.startsWith('pick') ? `Not in the doc's list: ${def.source.slice(5).replace(/[()]/g, '')}` : `Doc: ${def.source}`),
      make('div', { className: 'buttons' }, soundButton(def.id, 'Play'), variants),
    ));
  }
  el('sounds').append(make('h3', {}, title), grid);
}

// ---------------------------------------------------------------- voices

const events = Object.keys(VOICE_EVENTS) as VoiceEventId[];
const table = el<HTMLTableElement>('voices');
table.append(make('tr', {}, make('th', {}, 'Family'), ...events.map((e) => make('th', {}, e.replace('_', ' ')))));
for (const fam of Object.keys(VOICE_FAMILIES) as VoiceFamilyId[]) {
  const row = make('tr', {}, make('th', {}, fam));
  for (const ev of events) {
    row.append(make('td', {}, FAMILY_EVENTS[fam].includes(ev) ? soundButton(voiceId(fam, ev), 'Play', undefined, true) : ''));
  }
  table.append(row);
}
