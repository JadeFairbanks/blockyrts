// The match's sound (Audio): music that follows the day (day, dusk, night,
// dawn and the blood night), horns at dusk and dawn, unit voice cues when
// units are selected, ordered, hungry, under attack or out of a resource,
// and the sound list: work, hits, blocks, deaths, explosions, torches, the
// idle-worker alert, pings and the error sound. It only listens to what the
// sim worker reports, so it never touches the game's state or its hash.
// The Settings menu's three volumes apply at once.
import { AudioEngine, type VoiceEventId, type VoiceFamilyId } from '@blockyrts/audio';
import { buildingSpec, clockAt, MONSTERS, type Order, Period, UnitKind, WU_PER_METRE } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import { S, SHOT_STRIDE, STATE_STRIDE, type InfoMessage, type StateMessage } from '../messages.ts';
import type { Selectable } from '../selection/types.ts';
import { entityIdOf } from '../selection/types.ts';
import { onSettingsChange, type Settings } from '../settings/settings.ts';
import { COLUMN_M } from '../world/mesher.ts';
import { setCueSink, type UiCue } from './cues.ts';
import { deathSounds, eventCue, hitSound, hornFor, musicFor, orderVoice, voiceFamily, workSound, type Who } from './sound-map.ts';

/** Sounds farther than this from the camera's ground point are not even looked at (the engine's falloff ends at 70 m). */
const HEAR_M = 70;
/** Hit and death sounds started per state message at most; the engine's caps do the rest. */
const HITS_PER_MESSAGE = 24;
/** A projectile within this distance of a hit means an arrow or bolt landed. */
const ARROW_NEAR_M = 1.5;
/** Hostile units within this distance of the camera raise the music's fight layers; this many is the full fight. */
const FIGHT_NEAR_M = 45;
const FIGHT_FULL = 12;
/** Least time between two voice cues of the same kind (seconds), so a crowd does not chant. */
const VOICE_GAP: Partial<Record<VoiceEventId, number>> = { select: 0.25, acknowledge: 0.25, attack: 0.4, under_attack: 3, hungry: 20, resource_out: 2, cannot: 1, death: 0.3, greet: 2, trade: 2, warn: 2 };
/** Least time between two of the same alert sound. */
const ALERT_GAP_S = 1.5;

export class GameAudio {
  readonly engine: AudioEngine;
  private last: StateMessage | null = null;
  private prevShots: Int32Array = new Int32Array(0);
  private period = -1;
  private cycle = -1;
  private readonly voiceAt = new Map<string, number>();
  private readonly alertAt = new Map<string, number>();
  private readonly nextStrike = new Map<number, number>();
  private readonly torches = new Map<number, boolean>();
  private readonly lit = new Map<number, boolean>();
  private readonly built = new Map<number, { complete: boolean; hp: number; maxHp: number; x: number; z: number; owner: number }>();
  private starving = false;
  private focusX = 0;
  private focusZ = 0;
  private lastSelection = new Set<string>();
  private readonly off: () => void;

  constructor(
    settings: Settings,
    private readonly game: GameInfo,
    private readonly player: number,
    engine?: AudioEngine,
  ) {
    this.engine = engine ?? new AudioEngine();
    this.engine.attachUnlock();
    this.applyVolumes(settings);
    this.off = onSettingsChange((s) => this.applyVolumes(s));
    setCueSink((c) => this.ui(c));
  }

  dispose(): void {
    this.off();
    setCueSink(null);
    this.engine.dispose();
  }

  private applyVolumes(s: Settings): void {
    this.engine.setVolume('music', s.musicVolume);
    this.engine.setVolume('effects', s.effectsVolume);
    this.engine.setVolume('voice', s.voiceVolume);
  }

  // ---- Each frame ----

  /** The camera's ground point (metres): the listener, the music for the time of day and how fierce the fighting on screen is. */
  frame(focusX: number, focusZ: number, now: number): void {
    this.focusX = focusX;
    this.focusZ = focusZ;
    this.engine.setListener(focusX, focusZ, 1, 0);
    this.work(now / 1000);
  }

  // ---- The sim's state messages ----

  onState(msg: StateMessage): void {
    const blood = this.game.info?.blood ?? [];
    const c = clockAt(msg.step, blood);
    const bloodTonight = blood.includes(c.cycle);
    if (c.period !== this.period || c.cycle !== this.cycle) {
      // Horns only as a period begins in play, not when a game loads part-way through one.
      if (this.period >= 0) {
        const horn = hornFor(c.period, bloodTonight);
        if (horn) this.alert(horn, 0);
      }
      this.period = c.period;
      this.cycle = c.cycle;
      this.engine.setMusicState(musicFor(c.period, bloodTonight));
      // Render the next track while this one plays: the blood night's at a blood dusk.
      if (c.period === Period.Dusk && bloodTonight) void this.engine.prepareMusic('blood_night');
    }
    this.hits(msg);
    this.last = msg;
    this.unitTorches(msg);
    this.engine.setMusicIntensity(this.fightNear(msg));
    this.prevShots = msg.shots;
  }

  private near(xWu: number, zWu: number): boolean {
    const dx = xWu / WU_PER_METRE - this.focusX;
    const dz = zWu / WU_PER_METRE - this.focusZ;
    return dx * dx + dz * dz <= HEAR_M * HEAR_M;
  }

  /** What the client knows of an entity or building id. */
  private who(id: number): Who | null {
    if (id === 0) return null;
    if (this.game.buildings.has(id)) return { kind: 'building', owner: this.game.buildings.get(id)!.owner, mob: 0, ranged: 0, shield: 0, order: 0 };
    const u = this.game.unit(id);
    if (!u) return null;
    return { kind: u.kind, owner: u.owner, mob: u.mob, ranged: u.ranged, shield: u.shield, order: u.order };
  }

  /** An entity as the previous state message had it (one that died since is gone from the latest). */
  private whoBefore(id: number): Who | null {
    const m = this.last;
    if (!m || id === 0) return null;
    const d = m.data;
    for (let i = 0; i < m.count; i++) {
      const o = i * STATE_STRIDE;
      if (d[o + S.id] !== id) continue;
      return { kind: d[o + S.kind]!, owner: d[o + S.owner]!, mob: d[o + S.mob]!, ranged: d[o + S.ranged]!, shield: d[o + S.shield]!, order: d[o + S.order]! };
    }
    return null;
  }

  private arrowNear(x: number, y: number, z: number): boolean {
    const s = this.prevShots;
    const r = ARROW_NEAR_M * WU_PER_METRE;
    for (let o = 0; o + 2 < s.length; o += SHOT_STRIDE) {
      const dx = s[o]! - x;
      const dy = s[o + 1]! - y;
      const dz = s[o + 2]! - z;
      if (dx * dx + dy * dy + dz * dz <= r * r * 4) return true;
    }
    return false;
  }

  private hits(msg: StateMessage): void {
    let n = 0;
    for (const h of msg.hits) {
      if (n >= HITS_PER_MESSAGE) break;
      if (!this.near(h.x, h.z)) continue;
      const at = { x: h.x / WU_PER_METRE, z: h.z / WU_PER_METRE };
      if (h.look === 'death') {
        const who = this.who(h.id) ?? this.whoBefore(h.id);
        const d = deathSounds(h.kind ?? UnitKind.Mob, who?.owner ?? (h.kind === UnitKind.Mob ? MONSTERS : 0), h.mob ?? 0);
        if (this.engine.play(d.sound, at)) n++;
        if (d.voice) this.voice(d.voice, 'death', at);
        continue;
      }
      const id = hitSound(h.look, this.who(h.id), h.look !== 'shot' && this.arrowNear(h.x, h.y, h.z));
      if (id && this.engine.play(id, at)) n++;
    }
  }

  /** A hand torch lit or put out (Audio: a torch being lit and snuffed out). */
  private unitTorches(msg: StateMessage): void {
    const d = msg.data;
    const seen = new Set<number>();
    for (let i = 0; i < msg.count; i++) {
      const o = i * STATE_STRIDE;
      const id = d[o + S.id]!;
      const on = d[o + S.torch] === 1;
      const was = this.torches.get(id);
      if (on || was !== undefined) seen.add(id);
      if (was === undefined) {
        if (on) this.torches.set(id, true);
        continue;
      }
      if (was !== on && this.near(d[o + S.x]!, d[o + S.z]!)) this.engine.play(on ? 'torch_light' : 'torch_snuff', { x: d[o + S.x]! / WU_PER_METRE, z: d[o + S.z]! / WU_PER_METRE });
      if (on) this.torches.set(id, true);
      else this.torches.delete(id);
    }
    for (const id of this.torches.keys()) if (!seen.has(id)) this.torches.delete(id);
  }

  /** 0 to 1: how many hostile units stand near the camera. */
  private fightNear(msg: StateMessage): number {
    const d = msg.data;
    const r = FIGHT_NEAR_M * WU_PER_METRE;
    const fx = this.focusX * WU_PER_METRE;
    const fz = this.focusZ * WU_PER_METRE;
    let n = 0;
    for (let i = 0; i < msg.count && n < FIGHT_FULL; i++) {
      const o = i * STATE_STRIDE;
      if (d[o + S.owner] !== MONSTERS || d[o + S.hp]! <= 0) continue;
      const dx = d[o + S.x]! - fx;
      const dz = d[o + S.z]! - fz;
      if (dx * dx + dz * dz <= r * r) n++;
    }
    return n / FIGHT_FULL;
  }

  /** Work strikes of every worker near the camera that is chopping, mining, digging or building. */
  private work(t: number): void {
    const msg = this.last;
    if (!msg) return;
    const d = msg.data;
    const live = new Set<number>();
    for (let i = 0; i < msg.count; i++) {
      const o = i * STATE_STRIDE;
      if (d[o + S.kind] !== UnitKind.Worker || d[o + S.inside] !== 0) continue;
      const id = d[o + S.id]!;
      const ws = workSound(d[o + S.order]!, this.game.queues.get(id)?.[0]);
      if (!ws || !this.near(d[o + S.x]!, d[o + S.z]!)) continue;
      live.add(id);
      const next = this.nextStrike.get(id);
      if (next === undefined) {
        // Out of step with each other from the start, by id.
        this.nextStrike.set(id, t + ((id * 0.37) % 1) * ws.every);
        continue;
      }
      if (t < next) continue;
      this.engine.play(ws.id, { x: d[o + S.x]! / WU_PER_METRE, z: d[o + S.z]! / WU_PER_METRE });
      this.nextStrike.set(id, Math.max(next + ws.every, t));
    }
    for (const id of this.nextStrike.keys()) if (!live.has(id)) this.nextStrike.delete(id);
  }

  // ---- The info messages: events and buildings ----

  onInfo(info: InfoMessage): void {
    for (const ev of info.events) {
      const cue = eventCue(ev);
      const at = ev.x !== undefined && ev.z !== undefined ? { x: ev.x / WU_PER_METRE, z: ev.z / WU_PER_METRE } : undefined;
      // The blood night's double horn plays at dusk with the clock; its warning event only stands in if that was missed.
      if (cue.sound === 'horn_blood_night') {
        if (this.recently('horn_blood_night', 10)) continue;
      }
      if (cue.sound) this.alert(cue.sound, cue.sound === 'ui_message' ? 0.5 : ALERT_GAP_S);
      if (cue.voice && ev.speaker) {
        const who = this.who(ev.speaker);
        const family = who && typeof who.kind === 'number' ? voiceFamily(who.kind, who.owner, who.mob) : null;
        if (family) this.voice(family, cue.voice, at);
      } else if (cue.voice === 'hungry') {
        this.voice('worker', 'hungry');
      }
    }
    // Hunger as it starts.
    const starving = info.starveWorkers || info.starveTroops;
    if (starving && !this.starving && !info.events.some((e) => /starving/i.test(e.text))) this.voice(info.starveTroops ? 'warrior' : 'worker', 'hungry');
    this.starving = starving;
    this.buildings(info);
  }

  private buildings(info: InfoMessage): void {
    const seen = new Set<number>();
    for (const b of info.buildings) {
      seen.add(b.id);
      const spec = buildingSpec(b.kind);
      const c = { x: (b.x + spec.w / 2) * COLUMN_M, z: (b.z + spec.d / 2) * COLUMN_M };
      const hear = this.near(c.x * WU_PER_METRE, c.z * WU_PER_METRE);
      const before = this.built.get(b.id);
      // Finished: the player's own buildings chime.
      if (before && !before.complete && b.complete && b.owner === this.player) this.alert('build_complete', 0.5);
      this.built.set(b.id, { complete: b.complete, hp: b.hp, maxHp: b.maxHp, x: c.x, z: c.z, owner: b.owner });
      // Lights lit and put out.
      if (spec.light) {
        const was = this.lit.get(b.id);
        if (was !== undefined && was !== b.lit && hear) this.engine.play(b.lit ? 'torch_light' : 'torch_snuff', c);
        this.lit.set(b.id, b.lit);
      }
    }
    // Gone: a finished building that had been hurt fell (a cancelled plan just vanishes).
    for (const [id, b] of this.built) {
      if (seen.has(id)) continue;
      this.built.delete(id);
      this.lit.delete(id);
      if (b.complete && b.hp < b.maxHp && this.near(b.x * WU_PER_METRE, b.z * WU_PER_METRE)) this.engine.play('death_building', { x: b.x, z: b.z });
    }
  }

  // ---- What the player does ----

  /** An order the player gave: the first ordered unit answers (Order feedback). */
  onOrder(order: Order): void {
    const units = 'units' in order ? (order.units as number[]) : [];
    for (const id of units) {
      const u = this.game.unit(id);
      if (!u) continue;
      const family = voiceFamily(u.kind, u.owner, u.mob);
      if (!family) continue;
      this.voice(family, orderVoice(order.kind), { x: u.x / WU_PER_METRE, z: u.z / WU_PER_METRE }, true);
      return;
    }
  }

  /** The selection changed: a newly selected own unit answers; units falling out of it say nothing. */
  onSelection(list: readonly Selectable[]): void {
    const keys = new Set(list.map((t) => t.key));
    const fresh = list.filter((t) => !this.lastSelection.has(t.key));
    this.lastSelection = keys;
    const first = fresh.find((t) => t.kind === 'unit' && t.owner === this.player);
    if (!first) return;
    const id = entityIdOf(first.key);
    const u = id === null ? null : this.game.unit(id);
    if (!u) return;
    const family = voiceFamily(u.kind, u.owner, u.mob);
    if (family) this.voice(family, 'select', { x: u.x / WU_PER_METRE, z: u.z / WU_PER_METRE }, true);
  }

  private ui(c: UiCue): void {
    this.engine.play(c);
  }

  // ---- Helpers ----

  private recently(id: string, gap: number): boolean {
    const t = performance.now() / 1000;
    return t - (this.alertAt.get(id) ?? -Infinity) < gap;
  }

  private alert(id: string, gap: number): void {
    if (gap > 0 && this.recently(id, gap)) return;
    this.alertAt.set(id, performance.now() / 1000);
    this.engine.play(id);
  }

  /** A voice cue; `flat` plays it at full level wherever the unit is (the player's own selection and orders). */
  private voice(family: VoiceFamilyId, event: VoiceEventId, at?: { x: number; z: number }, flat = false): void {
    const t = performance.now() / 1000;
    const key = event === 'select' || event === 'acknowledge' || event === 'attack' ? event : `${family}.${event}`;
    if (t - (this.voiceAt.get(key) ?? -Infinity) < (VOICE_GAP[event] ?? 1)) return;
    this.voiceAt.set(key, t);
    this.engine.voice(family, event, flat || !at ? {} : at);
  }
}
