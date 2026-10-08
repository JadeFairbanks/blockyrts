// What the HUD's words say and where they go (patch notes 1). Counted words
// agree with one: "1 more minute", "1 egg", "0 of 1 worker", whoever wrote
// the line (the sim's status lines and messages, the client's own). And
// speech reaches the message panel only when the speaker is the player's own
// and it needs them now (Patch 2); the rest stays a bubble over the speaker,
// as random remarks always did.
import type { SimEvent } from '@blockyrts/sim';

/** Counted nouns the game's lines use, in the singular. */
const NOUNS = [
  // Time.
  'minute', 'second', 'hour', 'day', 'night', 'cycle', 'meal', 'step', 'turn', 'time', 'wave',
  // People and animals.
  'worker', 'farmer', 'miner', 'hand', 'labourer', 'warrior', 'troop', 'mage', 'unit', 'fighter', 'villager', 'player', 'enemy', 'monster',
  'animal', 'horse', 'hen', 'chicken', 'deer', 'boar', 'cow', 'bull', 'calf', 'foal', 'chick', 'hunter', 'gatherer', 'kill',
  // Places and pieces.
  'wall', 'tower', 'gate', 'torch', 'light', 'lantern', 'brazier', 'building', 'house', 'field', 'farm', 'stall', 'slot', 'pen', 'lair', 'village',
  'column', 'metre', 'point', 'crystal', 'ingot', 'plank', 'stick', 'log', 'item', 'good', 'kind', 'batch', 'stretch', 'piece', 'arrow', 'bolt',
  'shield', 'tool', 'cart', 'wagon', 'engine', 'cannon', 'charge', 'herb', 'hide', 'egg', 'feather', 'berry', 'carrot', 'potato', 'emerald',
  'ruby', 'diamond', 'brick', 'token', 'charm', 'brooch', 'heirloom', 'ration', 'portion', 'loaf', 'pie', 'stew', 'bandage', 'remedy',
];

const IRREGULAR: Record<string, string> = { oxen: 'ox', geese: 'goose', wolves: 'wolf', lives: 'life', men: 'man', people: 'person', knives: 'knife', loaves: 'loaf', calves: 'calf' };

function pluralOf(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|potato|tomato)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

const SINGULAR = new Map<string, string>();
for (const n of NOUNS) if (!(pluralOf(n) in IRREGULAR)) SINGULAR.set(pluralOf(n), n);
for (const [p, s] of Object.entries(IRREGULAR)) SINGULAR.set(p, s);

/** Words before the "1" that make it a label, not a count: "tier 1 tools", "Player 1 workers". */
const LABELS = ['tier', 'level', 'rank', 'night', 'day', 'player', 'base', 'wave', 'group', 'slot', 'table', 'step', 'no\\.', 'number', 'version'];
/** A word between the count and the noun may be any but these: "1 more minute", "1 stick", but not "1 of the walls". */
const NOT_BETWEEN = new Set(['of', 'the', 'and', 'or', 'in', 'to', 'at', 'for', 'with', 'from', 'by', 'on', 'per', 'a', 'an', 'each', 'every', 'all', 'your', 'their', 'its', 'our', 'my', 'these', 'those', 'than']);

const ONE = new RegExp(
  `(?<!\\b(?:${LABELS.join('|')}) )(?<=^|[\\s(\\[:;"'“])1 ((?:[a-z][a-z-]* )?)(${[...SINGULAR.keys()].sort((a, b) => b.length - a.length).join('|')})\\b(?!['-])`,
  'gi',
);

function matchCase(from: string, to: string): string {
  return from[0] === from[0]!.toUpperCase() ? to[0]!.toUpperCase() + to.slice(1) : to;
}

/** A line with every count of one in the singular: "1 more minutes" reads "1 more minute". */
export function oneIsSingular(text: string): string {
  if (!text.includes('1 ')) return text;
  return text.replace(ONE, (all, between: string, noun: string) => {
    if (between && NOT_BETWEEN.has(between.trim().toLowerCase())) return all;
    const single = SINGULAR.get(noun.toLowerCase());
    return single ? `1 ${between}${matchCase(noun, single)}` : all;
  });
}

/** "1 worker", "2 workers": a count and its noun, for the client's own lines. */
export function count(n: number, singular: string, plural = pluralOf(singular)): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Whether a line of speech goes to the message panel as well as its bubble
 * (Patch 2, What reaches chat; Jade: "only ones that urgently need your
 * attention from units that belong directly to you"). Both must hold:
 *
 * 1. The speaker belongs to this player: not a unit they only control
 *    (shared control, or one a leaver left behind), not another people's.
 * 2. It needs the player now: an order they gave has failed, the unit is in
 *    danger or being harmed, or it has stopped and will not carry on without
 *    them. The sim marks those lines urgent; for new lines, decide by this
 *    test and mark them so (peoples/speech.ts say).
 *
 * Everything else stays a bubble, as random remarks always did; questions
 * never reach chat. A people's line with nobody on the map to say it (a
 * faction gone from the map) cannot be a bubble, so it still reaches the
 * panel of the player it is said to.
 */
export function speechToPanel(ev: Partial<Pick<SimEvent, 'foreign' | 'urgent' | 'quiet' | 'player' | 'speaker' | 'kind'>>, player: number): boolean {
  if (ev.kind === 'question' || ev.quiet || ev.player !== player) return false;
  if (ev.foreign) return !ev.speaker;
  return ev.urgent === true;
}
