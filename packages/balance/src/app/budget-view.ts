// The night budget's preview: the formula with the current terms, a line of
// nights 1 to 100 against the tables' own, and every night's threat.

import type { BudgetView } from '../core/budget.ts';
import { budgetFormulaText } from '../core/budget.ts';
import { h } from './dom.ts';

const NS = 'http://www.w3.org/2000/svg';
const W = 600;
const H = 160;
const PAD = 4;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const threat = (tenths: number): string => String(tenths / 10);

/** A line chart of the current threat (solid) over the tables' (dashed, shown only when they differ). */
function chart(v: BudgetView): SVGSVGElement {
  const top = Math.max(1, ...v.nights.map((n) => Math.max(n.tenths, n.tableTenths)));
  const x = (night: number): number => PAD + ((night - 1) / (v.nights.length - 1)) * (W - 2 * PAD);
  const y = (tenths: number): number => H - PAD - (tenths / top) * (H - 2 * PAD);
  const line = (key: 'tenths' | 'tableTenths'): string => v.nights.map((n, i) => `${i ? 'L' : 'M'}${x(n.night).toFixed(1)} ${y(n[key]).toFixed(1)}`).join('');
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'budget-chart', role: 'img', 'aria-label': `Threat by night, 1 to ${v.nights.length}` });
  for (const n of [25, 50, 75]) s.append(svg('line', { x1: x(n), x2: x(n), y1: PAD, y2: H - PAD, class: 'grid' }));
  if (v.nights.some((n) => n.tenths !== n.tableTenths)) s.append(svg('path', { d: line('tableTenths'), class: 'was' }));
  s.append(svg('path', { d: line('tenths'), class: 'now' }));
  return s;
}

/** The panel; `refresh` redraws it from new terms. */
export function budgetPanel(read: () => BudgetView | null): { el: HTMLElement; refresh: () => void } {
  const el = h('section', { class: 'budget' });
  const refresh = (): void => {
    const v = read();
    if (!v) {
      el.replaceChildren();
      return;
    }
    const changed = v.nights.some((n) => n.tenths !== n.tableTenths);
    const last = v.nights[v.nights.length - 1]!;
    const rows: HTMLElement[] = [];
    for (let r = 0; r < v.nights.length; r += 10) {
      const cells = v.nights.slice(r, r + 10).map((n) => {
        const moved = n.tenths !== n.tableTenths;
        return h('td', { class: moved ? (n.tenths > n.tableTenths ? 'up' : 'down') : '', title: moved ? `Night ${n.night}: was ${threat(n.tableTenths)}` : `Night ${n.night}` }, threat(n.tenths));
      });
      rows.push(h('tr', {}, h('th', { scope: 'row' }, `${r + 1}–${r + 10}`), ...cells));
    }
    el.replaceChildren(
      h('h3', {}, 'Threat by night, 1 to 100'),
      h('p', { class: 'formula' }, 'Night n: ', h('b', {}, budgetFormulaText(v.terms)),
        changed ? h('span', { class: 'was' }, ` (night 100: ${threat(last.tenths)}, was ${threat(last.tableTenths)})`) : ` (night 100: ${threat(last.tenths)})`),
      h('p', { class: 'doc' }, 'One player\'s budget for the night, before their town and provocations: the dark edge spends 80% of it, and each live lair adds its own on top (Lairs, tribes and villages). Night 0 has its fixed list instead. Each counted building past 10 adds 2%, and a blood night spends the edge\'s share twice.'),
      chart(v),
      h('div', { class: 'budget-table' }, h('table', {}, h('tbody', {}, ...rows))),
    );
  };
  refresh();
  return { el, refresh };
}
