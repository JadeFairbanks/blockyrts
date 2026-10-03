// What the HUD's words say and where they go (patch notes 1). Counted words
// agree with one: "1 more minute", "1 egg", "0 of 1 worker", whoever wrote
// the line (the sim's status lines and messages, the client's own). And
// speech reaches the message panel only when it needs the player; the rest
// stays a bubble over the speaker, as random remarks always did.
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
/** A word between the count and the noun may be any but these: "1 more minute", "1 hardwood stick", but not "1 of the walls". */
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
 * Whether a line of speech goes to the message panel as well as its bubble.
 * Lines the sim marks quiet only tell what a unit is doing (eating, hunting,
 * gathering, loot picked up, an upgrade done) and stay bubbles, as random
 * remarks do. An own unit's other lines go (attacked, cannot reach, nowhere
 * to upgrade); a foreign line goes when said to this player (the trade
 * menu's answers), or when important and heard: one of the player's units
 * near, or the speaker on screen.
 */
export function speechToPanel(ev: Pick<SimEvent, 'foreign' | 'urgent' | 'quiet' | 'player' | 'important' | 'near'>, player: number, onScreen: boolean): boolean {
  if (ev.quiet) return false;
  if (!ev.foreign) return true;
  if (ev.player === player) return true;
  return ev.important === true && (((ev.near ?? 0) & (1 << player)) !== 0 || onScreen);
}
