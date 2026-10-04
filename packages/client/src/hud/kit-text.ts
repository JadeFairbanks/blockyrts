// The kit's numbers in words, for the middle panel's tooltips (Patch 2): a
// weapon's damage, swing or shot and reach, armour's protection and a
// shield's block, a wand's spell power and mana, a robe's protection and mana
// regain, a tool kit's tier. A tier strip's tile shows the change from the
// kit the card trains now ("Damage 21 (+5)").
import type { Piece } from '@blockyrts/sim';

/** One number of a piece: its words before and after the number, and where it goes (the weapon's sentence or the armour's). */
interface Fact {
  key: string;
  before: string;
  value: number;
  after: string;
  defence: boolean;
}

const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));

function factsOf(p: Piece): Fact[] {
  const f = (key: string, before: string, value: number, after: string, defence = false): Fact => ({ key, before, value, after, defence });
  const x = p as Piece & Record<string, unknown>;
  if (typeof x.swingDs === 'number') return [f('damage', 'damage ', x.damage as number, ''), f('swing', 'a swing every ', x.swingDs / 10, ' s'), f('reach', 'reach ', (x.reachCm as number) / 100, ' m')];
  if (typeof x.attackDs === 'number') return [f('damage', 'damage ', x.damage as number, ''), f('shot', 'a shot every ', x.attackDs / 10, ' s'), f('range', 'range ', x.rangeM as number, ' m')];
  if (typeof x.blockPct === 'number') return [f('block', 'block ', x.blockPct, '%', true)];
  if (typeof x.regainPct === 'number') return [f('protection', 'protection ', x.protectionPct as number, '%', true), f('regain', 'mana regain +', x.regainPct, '%', true)];
  if (typeof x.powerPct === 'number') return [f('power', 'spell power ', x.powerPct, '%'), f('mana', 'mana bar +', x.mana as number, '')];
  if (typeof x.protectionPct === 'number') return [f('protection', 'protection ', x.protectionPct, '%', true)];
  if (Array.isArray(x.tools)) return [f('tool', 'tool tier ', p.tier, ''), f('damage', 'damage ', x.damage as number, '')];
  return [];
}

const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * "Damage 16, a swing every 1.2 s, reach 1.2 m. Protection 20%, block 15%."
 * for a troop's kit; a mage's wand and robe in one sentence (`one`). With `against`
 * (the kit chosen now), each number that differs carries the change.
 */
export function piecesStats(pieces: readonly Piece[], against?: readonly Piece[], one = false): string {
  const facts = pieces.flatMap(factsOf);
  const was = new Map<string, number>();
  for (const f of (against ?? []).flatMap(factsOf)) if (!was.has(f.key)) was.set(f.key, f.value);
  const words = (f: Fact): string => {
    // Against a kit without armour, protection and block come from nothing.
    const old = was.get(f.key) ?? (against && f.defence ? 0 : undefined);
    const d = old === undefined ? 0 : Math.round((f.value - old) * 10) / 10;
    return `${f.before}${num(f.value)}${f.after}${d !== 0 && against ? ` (${d > 0 ? '+' : '−'}${num(Math.abs(d))}${f.after.trim() === 's' ? ' s' : f.after.trim() === 'm' ? ' m' : f.after})` : ''}`;
  };
  const sentence = (list: Fact[]): string => (list.length > 0 ? `${capital(list.map(words).join(', '))}.` : '');
  if (one) return sentence(facts);
  return [sentence(facts.filter((f) => !f.defence)), sentence(facts.filter((f) => f.defence))].filter((s) => s).join(' ');
}

/** One piece's numbers: "Damage 21, a swing every 1.2 s, reach 1.2 m." (with the change from `against`). */
export function pieceStats(p: Piece, against?: Piece): string {
  const facts = factsOf(p);
  if (facts.length === 0) return '';
  return piecesStats([p], against ? [against] : undefined);
}
