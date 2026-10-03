// What the game sounds like (Audio): which sound, voice cue or music state
// goes with each thing the sim reports. Pure functions over the client's
// copies of the state, so they can be checked without a browser. The
// engine that plays them is @blockyrts/audio.
import type { MusicStateId, VoiceEventId, VoiceFamilyId } from '@blockyrts/audio';
import { Engine, itemSpec, mobSpec, MONSTERS, OrderKind, Period, PEOPLES, peopleUnitSpec, People, UnitKind, type HitLook, type UnitOrder } from '@blockyrts/sim';

/** What the client knows about the thing a hit, death or shot names. */
export interface Who {
  /** 'building' for a building id, else the unit's UnitKind. */
  kind: number | 'building';
  owner: number;
  /** The mob, species, people unit or engine kind (S.mob). */
  mob: number;
  /** Its ranged weapon and shield (Item), or 0. */
  ranged: number;
  shield: number;
  order: number;
}

/** The music for a moment of the day (Audio: day, dusk, night, dawn and a blood-night track). */
export function musicFor(period: number, bloodTonight: boolean): MusicStateId {
  switch (period) {
    case Period.Dusk:
      return 'dusk';
    case Period.Night:
      return bloodTonight ? 'blood_night' : 'night';
    case Period.Dawn:
      return 'dawn';
    default:
      return 'day';
  }
}

/** The horn as a period begins: at dusk (the blood night's double horn when tonight is one) and at dawn; none otherwise. */
export function hornFor(period: number, bloodTonight: boolean): string | null {
  if (period === Period.Dusk) return bloodTonight ? 'horn_blood_night' : 'horn_dusk';
  if (period === Period.Dawn) return 'horn_dawn';
  return null;
}

/** The voice a unit speaks with, or null for those that make none (beasts, the dead, engines). */
export function voiceFamily(kind: number, owner: number, mob: number): VoiceFamilyId | null {
  if (kind === UnitKind.Mob) {
    let name: string;
    try {
      name = mobSpec(mob).name.toLowerCase();
    } catch {
      return null;
    }
    if (name.includes('hobgoblin')) return 'hobgoblin';
    if (name.includes('goblin')) return 'goblin';
    if (name.includes('kobold')) return 'kobold';
    if (name.includes('gnoll')) return 'gnoll';
    return null;
  }
  if (kind === UnitKind.Animal || kind === UnitKind.Engine || kind === UnitKind.Wanderer) return null;
  if (owner === PEOPLES) {
    let people: number;
    try {
      people = peopleUnitSpec(mob).people;
    } catch {
      return null;
    }
    return people === People.Halfling ? 'halfling' : people === People.Runkin ? 'runkin' : people === People.Elf ? 'elf' : 'dwarf';
  }
  if (kind === UnitKind.Warrior) return 'warrior';
  if (kind === UnitKind.Mage) return 'mage';
  return 'worker';
}

/** The sound of a shot leaving (bows, slings, muskets, cannons and engines). */
export function shotSound(who: Who | null): string {
  if (who?.kind === UnitKind.Engine) return who.mob === Engine.Catapult ? 'shot_sling' : who.mob === Engine.Ballista ? 'shot_bow' : 'shot_cannon';
  if (who && who.ranged > 0) {
    const name = itemSpec(who.ranged).name.toLowerCase();
    if (name.includes('musket')) return 'shot_musket';
    if (name.includes('sling') || name.includes('javelin')) return 'shot_sling';
    return 'shot_bow';
  }
  // Monsters' shots: skeleton archers loose arrows; slingers, spitters and boulder throwers sling.
  if (who && who.kind === UnitKind.Mob) {
    let name = '';
    try {
      name = mobSpec(who.mob).name.toLowerCase();
    } catch {
      // unknown: a bow
    }
    if (name.includes('archer')) return 'shot_bow';
    return 'shot_sling';
  }
  return 'shot_bow';
}

/**
 * The sound of a hit, swing or death event (Audio: hits, blocks, deaths,
 * explosions), or null for none. `arrow` is whether a projectile was in
 * flight where it landed (an arrow or bolt rather than a blade).
 */
export function hitSound(look: HitLook, who: Who | null, arrow: boolean): string | null {
  switch (look) {
    case 'blood':
      if (who?.kind === UnitKind.Engine) return 'hit_building';
      return arrow ? 'hit_arrow' : 'hit_blade';
    case 'bone':
    case 'slime':
      return arrow ? 'hit_arrow' : 'hit_blunt';
    case 'wood':
    case 'stone':
      // A blow on a building or engine; a shield block on a unit; a stray shot in a tree or the ground.
      if (!who) return null;
      if (who.kind === 'building' || who.kind === UnitKind.Engine) return 'hit_building';
      // A worker's own bites into the land are its dig sound (workSound), and a charge's knock-back is a thump.
      if (who.kind === UnitKind.Worker && who.order === OrderKind.Dig) return null;
      if (look === 'stone') return 'hit_blunt';
      return who.shield > 0 && itemSpec(who.shield).tier >= 4 ? 'block_metal' : 'block_wood';
    case 'spark':
      return 'block_metal';
    case 'blast':
      // Cannonballs, gunpowder and the late monsters' fire are big; bombers and kegs small.
      return who && (who.kind === UnitKind.Engine || (who.kind === UnitKind.Mob && who.owner === MONSTERS && bigBlast(who.mob))) ? 'explosion_large' : 'explosion_small';
    case 'burst':
      // A goblin mage snuffing a light, else a bloated corpse bursting.
      return who?.kind === 'building' ? 'torch_snuff' : 'explosion_small';
    case 'spell':
      return 'spell_cast';
    case 'shot':
      return shotSound(who);
    default:
      // swing, shake and death are handled elsewhere (deathSounds) or silent.
      return null;
  }
}

function bigBlast(mob: number): boolean {
  try {
    return mobSpec(mob).firstNight >= 25;
  } catch {
    return false;
  }
}

/** The sounds of a death: the body or the monster, and a death cry from those with a voice. */
export function deathSounds(kind: number, owner: number, mob: number): { sound: string; voice: VoiceFamilyId | null } {
  const voice = voiceFamily(kind, owner, mob);
  if (kind === UnitKind.Mob && !voice) return { sound: 'death_monster', voice: null };
  if (kind === UnitKind.Engine) return { sound: 'death_building', voice: null };
  return { sound: 'death_body', voice };
}

/** A worker's work sound by what it is doing now (Audio: chopping, mining, digging, building), with the strike interval in seconds; null when it is not working. */
export function workSound(order: number, head: UnitOrder | undefined): { id: string; every: number } | null {
  if (order === OrderKind.Dig) return { id: 'dig', every: 0.9 };
  if (order === OrderKind.Mine) return { id: 'mine', every: 1.1 };
  if (order === OrderKind.Chop) {
    // Building and repairing use the chop clip too; the unit's order list says which it is.
    if (head && (head.t === 'work' || head.t === 'build' || head.t === 'repairAll')) return { id: 'build', every: 0.6 };
    return { id: 'chop', every: 1.0 };
  }
  return null;
}

/** The voice cue a unit gives when the player orders it (Order feedback: selected units also play a short voice cue). */
export function orderVoice(orderKind: string): VoiceEventId {
  return orderKind === 'attack' || orderKind === 'attackMove' || orderKind === 'hunt' || orderKind === 'cast' ? 'attack' : 'acknowledge';
}

/** What a sim event says out loud: a sound, and a voice cue from its speaker. */
export function eventCue(ev: { kind: string; text: string; urgent?: boolean | undefined; foreign?: boolean | undefined; sound?: string | undefined }): { sound: string | null; voice: VoiceEventId | null } {
  if (ev.kind === 'idle') return { sound: 'alert_idle_worker', voice: 'resource_out' };
  if (ev.sound === 'double-horn') return { sound: 'horn_blood_night', voice: null };
  const t = ev.text.toLowerCase();
  if (ev.kind === 'speech') {
    if (ev.foreign) return { sound: null, voice: /war|leave|go away|warn|last|enough/.test(t) ? 'warn' : /trade|deal|offer|buy|sell|bargain/.test(t) ? 'trade' : 'greet' };
    if (/attack/.test(t)) return { sound: null, voice: 'under_attack' };
    return { sound: null, voice: ev.urgent ? 'cannot' : null };
  }
  if (ev.kind === 'alert') {
    if (/declared war|at war with/.test(t)) return { sound: 'alert_war', voice: null };
    if (/starving/.test(t)) return { sound: 'alert_urgent', voice: 'hungry' };
    // A unit saying it cannot carry out an order.
    if (/^i cannot|^i have|needs a|not enough/.test(t)) return { sound: null, voice: 'cannot' };
    return { sound: 'alert_urgent', voice: null };
  }
  if (ev.kind === 'info' || ev.kind === 'prospect') return { sound: 'ui_message', voice: null };
  return { sound: null, voice: null };
}
