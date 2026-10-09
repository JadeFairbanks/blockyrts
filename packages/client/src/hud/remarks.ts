// What units remark on (Jade's Patch 5, GP-28): "Worker random remarks now
// are always based on their immediate surroundings or things happening
// around them, and should be funny to read. Sometimes they might even
// complain but that is not the most frequent type of remark. All other
// animated units give random remarks in similar fashion, once every 1-4.5
// minutes individually." A remark is the screen's alone (hud/bubbles.ts):
// what a unit sees round it is read off the latest state (a monster or an
// animal near, a building beside it, what it carries or is doing, a crowd or
// nobody, the time of day), and one of the lines for what applies is said,
// the complaints (hurt, hungry) weighed less. The players' workers, troops,
// cavalry, crewmen and mages speak so; the peoples' units keep their own
// lines (sim peoples/data.ts REMARKS) and remark on monsters and the night
// too. Monsters, animals and engines say nothing (s).

import { buildingSpec, clockAt, mobSpec, MONSTERS, Mount, Period, REMARKS, RESOURCES, speciesSpec, Troop, UnitKind, WU_PER_METRE, NO_CARRY, type UnitOrder } from '@blockyrts/sim';
import { GameInfo } from '../game/game-info.ts';
import { COLUMN_M } from '../world/mesher.ts';
import { orderAction } from './doing.ts';

/** How near things are remarked on, metres (s). */
export const REMARK_NEAR = { monsterM: 20, animalM: 12, buildingM: 10, crowdM: 8, crowd: 5, aloneM: 20 };

/** What a unit sees round it, as its remark reads it. Names are lower case, '' for none. */
export interface RemarkScene {
  /** Whose lines: 'worker', 'troop', 'cavalry', 'crew', 'mage', or a people's REMARKS key ('halfling'...). */
  voice: string;
  period: 'day' | 'dusk' | 'night' | 'dawn';
  monster: string;
  animal: string;
  building: string;
  inside: string;
  carrying: string;
  /** Its order's card action (hud/doing.ts orderAction), or '' when idle. */
  doing: string;
  crowd: boolean;
  alone: boolean;
  hurt: boolean;
  hungry: boolean;
  lowMana: boolean;
}

type Lines = Partial<Record<string, readonly string[]>>;

/** The workers' lines, by what is round them ({m} a monster, {a} an animal, {b} a building, {r} what they carry). */
const WORKER: Lines = {
  monster: [
    'Is that {a m}? I\'m suddenly very busy over here.',
    'Nobody make eye contact with the {m}.',
    'If the {m} asks, I\'m a tree.',
    'I did not sign up to work next to {a m}.',
    'That {m} has been eyeing my hat all day.',
  ],
  animal: [
    'That {a} keeps staring at my lunch.',
    'Shoo, {a}. This is a work site.',
    'I think the {a} is judging my technique.',
    'The {a} has the right idea. Nap first, work later.',
  ],
  building: [
    'Who built this {b}? Oh. Me.',
    'This {b} needs a window box. Maybe geraniums.',
    'I give this {b} a sturdy seven out of ten.',
    'Leaning on the {b} counts as inspecting it.',
  ],
  inside: [
    'Cosy in this {b}. Someone open a window.',
    'Whose boots are these? They\'re in my bunk.',
    'Nice and dry in here. I\'m never leaving.',
  ],
  carrying: [
    'This {r} isn\'t going to carry itself. Sadly.',
    'Fun fact: {r} gets heavier with every step.',
    'If I drop this {r}, nobody saw anything.',
    'Careful with the {r}. It\'s worth more than me.',
  ],
  gather: ['One more swing, then a nap.', 'The trick is to hit the same spot twice.', 'Chop, chop. Or is it chip, chip?'],
  build: ['Measure twice, hammer once. Or the other way round?', 'If it wobbles, it\'s a feature.', 'Hand me the... no, the other thing.'],
  repair: ['Who keeps breaking these?', 'Good as new. Ish.', 'A nail here, a nail there, and a prayer.'],
  dig: ['Dig a hole, they said. It\'ll be fun, they said.', 'Found a rock. Under another rock.', 'I think I hit the bottom of the world.'],
  prospect: ['I can smell ore. Or that\'s my boots.', 'This rock looks rich. Or shiny. Or both.'],
  hunt: ['Here, deer deer deer.', 'Quiet. I\'m being very sneaky.', 'If it runs, I didn\'t want it anyway.'],
  eat: ['Best part of the day. Second best is the nap after.', 'Who cooked this? I have questions.'],
  idle: ['Standing very still is also a skill.', 'Is it a break if nobody told me to stop?', 'Waiting for orders. Any minute now.'],
  crowd: ['Bit crowded. Somebody\'s elbow is in my ear.', 'Form an orderly queue, please.', 'Too many cooks round here.'],
  alone: ['Just me and the birds, then.', 'Quiet out here. Too quiet. Nice, though.', 'If I sing, nobody can complain.'],
  night: ['The dark is making noises again. Rude.', 'Who\'s on torch duty? Not me, I hope.', 'Night work. The stars aren\'t paying me either.'],
  dusk: ['Sun\'s going down. Time to walk faster.', 'Dusk already? I\'d barely got started.'],
  dawn: ['Made it through another night. Breakfast?', 'Morning! Everyone still got all their fingers?'],
  day: ['Lovely day for carrying heavy things.', 'Not a cloud in the sky. Suspicious.', 'Sun on my back, work in my hands. Could be worse.'],
  hurt: ['Just a scratch. A big, deep scratch.', 'I\'d like to complain about my arm.', 'Ow. Write that down: ow.'],
  hungry: ['My stomach is louder than the monsters.', 'Is it lunch yet? It feels like lunch.', 'I could eat a whole boar. Raw.'],
};

const TROOP: Lines = {
  monster: ['I\'ve got dibs on the {m}.', 'Hold the line. The {m} looks bigger up close.', 'Steady. The {m} is more scared of us. Probably.'],
  animal: ['That {a} would make a fine supper.', 'At ease, {a}. You\'re not on the list.'],
  building: ['Guarding the {b}. It\'s not going anywhere.', 'Nobody touches the {b} on my watch. Except the builders. And the rats.'],
  inside: ['Snug in here. Wake me if anything explodes.', 'Who left a sword on my pillow? Again?'],
  carrying: ['Plunder! Well, {r}. Still counts.', 'I\'m a soldier, not a cart. Fine. Carrying the {r}.'],
  attack: ['For the town! And second breakfast!', 'Finally, some exercise.'],
  move: ['Left, right, left... which one was I on?', 'Marching again. My boots have opinions.'],
  idle: ['Polished my armour. Twice.', 'Ready when you are. Quite ready. Very ready.', 'Is standing guard a promotion?'],
  crowd: ['Nice formation. Mostly.', 'Whoever has the onions, step back.'],
  alone: ['A lone guard is a bored guard.', 'Just me and my spear. Good listener, my spear.'],
  night: ['Eyes on the dark. No, the other dark.', 'Something moved. Or I need sleep.'],
  dusk: ['Light the torches. Monsters hate a well-lit town.', 'Sun\'s going. Somebody hold my lunch.'],
  dawn: ['Still breathing. I\'ll take it.', 'Dawn. Look at them run. Cowards.'],
  day: ['Quiet day. I don\'t trust it.', 'Fine weather for drills. Shame about the drills.'],
  hurt: ['Still standing. Barely, but standing.', 'Someone fetch a mage. A gentle one.'],
  hungry: ['An army marches on its stomach, and mine is empty.', 'Rations, please. Before I eat my belt.'],
};

const CAVALRY: Lines = {
  ...TROOP,
  idle: ['My horse thinks it\'s in charge.', 'The horse wants a snack. So do I.', 'Sitting down on the job. Literally.'],
  move: ['Hold on, horse knows a shortcut.', 'Faster than walking, harder on the backside.'],
};

const CREW: Lines = {
  monster: ['Load, aim, pray. Mostly pray.', 'Point it at the {m}. No, the other way.', 'Hold still, {m}. This only hurts a lot.'],
  idle: ['Ears still ringing. What? What?', 'Gun\'s clean. Mostly.', 'I named the gun. The gun doesn\'t know.'],
  alone: ['Just me and the gun. It does all the talking.'],
  dusk: ['Light the fuses. Not yet! Not yet.'],
  dawn: ['We made it. My eyebrows did not.'],
  night: ['Can\'t aim in the dark. Can still shoot, though.'],
  day: ['Nice day to make loud noises.'],
  crowd: ['Mind the barrel, it bites.'],
  hurt: ['Took one for the gun. The gun owes me.'],
  hungry: ['Is gunpowder edible? Asking for me.'],
};

const MAGE: Lines = {
  monster: ['Stay behind me. I once read a pamphlet about this.', 'The {m} reeks of bad magic. And worse breath.'],
  animal: ['The {a} has a lovely aura. Mostly fleas.'],
  building: ['The {b} hums. Or someone left a kettle on.', 'This {b} has good bones. Magically speaking.'],
  inside: ['Books, a candle and a roof. Bliss.', 'Don\'t touch that jar. Or that one. Touch nothing.'],
  idle: ['Mana is gathering. Like moss. Slowly.', 'Do not touch the robe.', 'I could turn you into a newt. I won\'t. Today.'],
  crowd: ['Personal space, please. Spells need elbow room.'],
  alone: ['Peace and quiet at last. Perfect for brooding.'],
  night: ['The stars are out. Show-offs.', 'Night magic. Same spells, more dramatic lighting.'],
  dusk: ['Dusk. The best light for looking mysterious.'],
  dawn: ['The dawn tingles. Or that\'s the cold.'],
  day: ['Sunlight is bad for the complexion. Good for the mana.'],
  lowMana: ['Running low on mana. Don\'t tell anyone.', 'Out of sparkles. Give me a minute.'],
  hurt: ['A healer would be nice. Oh. That\'s me.'],
  hungry: ['Can\'t focus on an empty stomach. I nearly turned a rock into a sandwich.'],
};

/** The peoples remark on these besides their own lines. */
const PEOPLE: Lines = {
  monster: ['Look out! {A m}!', 'That {m} is close enough to smell. I wish it wasn\'t.'],
  night: ['Dark already. Last one to the fire is monster food.'],
};

/** How much each kind of remark weighs: what is round them most, the complaints least (Jade). */
const WEIGHTS: Record<string, number> = {
  monster: 5, animal: 3, building: 3, inside: 4, carrying: 3, doing: 4, crowd: 2, alone: 2, period: 2, lowMana: 3, hurt: 1, hungry: 1, own: 3,
};

function linesFor(voice: string): Lines {
  if (voice === 'worker') return WORKER;
  if (voice === 'troop') return TROOP;
  if (voice === 'cavalry') return CAVALRY;
  if (voice === 'crew') return CREW;
  if (voice === 'mage') return MAGE;
  return PEOPLE;
}

/** "a zombie", "an ash golem"; a name ("Morvath") stands alone. */
function article(word: string): string {
  if (/^[A-Z]/.test(word)) return word;
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

function fill(line: string, s: RemarkScene): string {
  return (/^[A-Z]/.test(s.monster) ? line.replace(/\b[Tt]he \{m\}/, '{m}') : line)
    .replace('{A m}', capital(article(s.monster)))
    .replace('{a m}', article(s.monster))
    .replace('{m}', s.monster)
    .replace('{a}', s.animal)
    .replace('{b}', s.inside || s.building)
    .replace('{r}', s.carrying);
}

function capital(t: string): string {
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/** A remark for a scene, `rand` in [0, 1); null when there is nothing to say. */
export function remarkLine(s: RemarkScene, rand: () => number = Math.random): string | null {
  const lines = linesFor(s.voice);
  const options: Array<[readonly string[], number]> = [];
  const add = (list: readonly string[] | undefined, weight: string): void => {
    if (list && list.length > 0) options.push([list, WEIGHTS[weight] ?? 1]);
  };
  if (s.monster) add(lines.monster, 'monster');
  if (s.animal) add(lines.animal, 'animal');
  if (s.inside) add(lines.inside, 'inside');
  else if (s.building) add(lines.building, 'building');
  if (s.carrying) add(lines.carrying, 'carrying');
  add(lines[s.doing || 'idle'], 'doing');
  if (s.crowd) add(lines.crowd, 'crowd');
  if (s.alone) add(lines.alone, 'alone');
  add(lines[s.period], 'period');
  if (s.lowMana) add(lines.lowMana, 'lowMana');
  if (s.hurt) add(lines.hurt, 'hurt');
  if (s.hungry) add(lines.hungry, 'hungry');
  // The peoples' own lines too; the players' units speak only of what is round them (Jade).
  if (lines === PEOPLE) add(REMARKS[s.voice], 'own');
  let total = 0;
  for (const [, w] of options) total += w;
  if (total === 0) return null;
  let r = rand() * total;
  for (const [list, w] of options) {
    if (r < w) return fill(list[Math.floor(rand() * list.length)]!, s);
    r -= w;
  }
  const [list] = options[options.length - 1]!;
  return fill(list[0]!, s);
}

/** A monster's or animal's name for a remark: lower case, without a title ("Morvath, the Hollow Crown" is "Morvath"). */
function shortName(name: string): string {
  const head = name.split(',')[0]!;
  return /^[A-Z][a-z]+$/.test(head) && name.includes(',') ? head : head.toLowerCase();
}

/** The voice a unit remarks in: its kind (and troop type), or its people's REMARKS key; '' for one that says nothing. */
export function remarkVoice(kind: number, troop: number, mount: number, peopleKey = ''): string {
  if (peopleKey) return peopleKey;
  if (kind === UnitKind.Worker) return 'worker';
  if (kind === UnitKind.Mage) return 'mage';
  if (kind === UnitKind.Warrior) return troop === Troop.Crew ? 'crew' : troop === Troop.Cavalry || mount !== Mount.None ? 'cavalry' : 'troop';
  return '';
}

/** What a unit sees round it now, read off the screen's copy of the game; null when it is gone. */
export function sceneOf(game: GameInfo, id: number, voice: string): RemarkScene | null {
  const u = game.unit(id);
  if (!u) return null;
  const n = REMARK_NEAR;
  const M = WU_PER_METRE;
  const c = clockAt(game.step);
  const period = c.period === Period.Night ? 'night' : c.period === Period.Dusk ? 'dusk' : c.period === Period.Dawn ? 'dawn' : 'day';
  let monster = '';
  let monsterD = Infinity;
  let animal = '';
  let animalD = Infinity;
  let friends = 0;
  let nearestFriend = Infinity;
  for (const j of game.unitIds()) {
    if (j === id) continue;
    const o = game.unit(j);
    if (!o || o.hp <= 0) continue;
    const d = Math.hypot(o.x - u.x, o.z - u.z) / M;
    if (o.kind === UnitKind.Mob && o.owner === MONSTERS) {
      if (d <= n.monsterM && d < monsterD) {
        monsterD = d;
        monster = shortName(mobSpec(o.mob).name);
      }
    } else if (o.kind === UnitKind.Animal) {
      if (d <= n.animalM && d < animalD) {
        animalD = d;
        animal = speciesSpec(o.mob).name.toLowerCase();
      }
    } else if (o.owner === u.owner && o.inside === 0) {
      if (d <= n.crowdM) friends++;
      nearestFriend = Math.min(nearestFriend, d);
    }
  }
  let building = '';
  let inside = '';
  let buildingD = Infinity;
  for (const b of game.buildings.values()) {
    const name = buildingSpec(b.kind).name.toLowerCase();
    if (u.inside === b.id) inside = name;
    if (b.owner !== u.owner) continue;
    const ctr = GameInfo.centre(b, COLUMN_M);
    const d = Math.hypot(ctr.x - u.x / M, ctr.z - u.z / M);
    if (d <= n.buildingM && d < buildingD) {
      buildingD = d;
      building = name;
    }
  }
  const q: readonly UnitOrder[] = game.queues.get(id) ?? [];
  const typeKey = u.kind === UnitKind.Mage ? 'mage:' : u.kind === UnitKind.Worker ? 'worker' : 'warrior';
  return {
    voice,
    period,
    monster,
    animal,
    building,
    inside,
    carrying: u.carryRes !== NO_CARRY && u.carryAmt > 0 ? (RESOURCES[u.carryRes]?.name.toLowerCase() ?? '') : '',
    doing: orderAction(q[0], typeKey) ?? '',
    crowd: friends >= n.crowd,
    alone: nearestFriend > n.aloneM,
    hurt: u.maxHp > 0 && u.hp * 2 < u.maxHp,
    hungry: u.hungry > 0,
    lowMana: u.kind === UnitKind.Mage && u.maxMana > 0 && u.mana * 4 < u.maxMana,
  };
}
