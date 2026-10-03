// Small pictures for the menus and fields: one line icon per group, and a
// bar showing where a value sits among its neighbours.

import { h } from './dom.ts';

const NS = 'http://www.w3.org/2000/svg';

// 16 by 16 line drawings, stroked in the text colour.
const ICONS: Record<string, string> = {
  buildings: 'M2 7.5 8 2.5l6 5M3.5 6.5v7h9v-7M6.5 13.5v-4h3v4',
  research: 'M6 1.5h4M6.5 1.5v4.2L2.6 12.4a1.4 1.4 0 0 0 1.2 2.1h8.4a1.4 1.4 0 0 0 1.2-2.1L9.5 5.7V1.5M4.5 10h7',
  units: 'M8 2.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6ZM3 14.5c0-3 2.2-5.2 5-5.2s5 2.2 5 5.2',
  magic: 'M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8 6.7 6.7Z',
  siege: 'M8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm0 3.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM8 3v3.2M8 9.8V13M3 8h3.2M9.8 8H13',
  tools: 'M2.5 13.5 9.5 6.5M4.5 3c3.5-1 7 0 8.5 1.5S15 8.5 14 12',
  melee: 'M12.5 1.5h2v2L6.5 11.5l-2-2ZM3 9l4 4M4.5 12.5 2 15M2.5 11l2.5 2.5',
  ranged: 'M3.5 1.5c6 1 10 5 11 11M3.5 1.5l11 11M1.5 14.5 10 6M8 5.5h2.5V8',
  armour: 'M8 1.5 13.5 3.5v4c0 3.5-2.4 5.8-5.5 7-3.1-1.2-5.5-3.5-5.5-7v-4Z',
  training: 'M6 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 14c0-2.8 1.8-4.8 4-4.8s4 2 4 4.8M12.5 13V5M10 7.5l2.5-2.5L15 7.5',
  wands: 'M3 14.5 10.5 7M11.5 1.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z',
  recipes: 'M2.5 7h11v2.5a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4ZM1.5 7h13M6 2.5c-.6.9.6 1.6 0 2.5M9.5 2.5c-.6.9.6 1.6 0 2.5',
  food: 'M8 4.5c-1.5-1.6-5-1.3-5 2.4 0 3.4 2.4 7 5 7s5-3.6 5-7c0-3.7-3.5-4-5-2.4ZM8 4.5c0-1.4.6-2.4 2-3',
  animals: 'M8 8.5c2.2 0 4 2.2 4 3.7 0 1.4-1.3 1.8-4 1.8s-4-.4-4-1.8c0-1.5 1.8-3.7 4-3.7ZM3.2 5.5a1.2 1.5 0 1 1 0 3 1.2 1.5 0 0 1 0-3Zm9.6 0a1.2 1.5 0 1 1 0 3 1.2 1.5 0 0 1 0-3ZM6 2a1.2 1.5 0 1 1 0 3 1.2 1.5 0 0 1 0-3Zm4 0a1.2 1.5 0 1 1 0 3 1.2 1.5 0 0 1 0-3Z',
  mobs: 'M8 1.8c3.3 0 5.5 2.3 5.5 5.2 0 1.8-1 3-2.3 3.6v2.9H4.8v-2.9C3.5 10 2.5 8.8 2.5 7c0-2.9 2.2-5.2 5.5-5.2ZM5.8 6.5h.1M10.1 6.5h.1M7 13.5v-2M9 13.5v-2',
  lairs: 'M1.5 13.5 5.5 4l2.5 3 2-2.5 4.5 9ZM6 13.5c0-2.2.9-3.5 2-3.5s2 1.3 2 3.5',
  peoples: 'M5.5 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM1.5 13.5c0-2.6 1.8-4.5 4-4.5s4 1.9 4 4.5M11 4a1.7 1.7 0 1 1 0 3.4A1.7 1.7 0 0 1 11 4ZM10.4 9.2c2.3-.4 4.1 1.4 4.1 4.3',
  land: 'M3.5 14.5V1.5M3.5 2.5h9l-2 3 2 3h-9',
  resources: 'M8 1.5 14 4.8v6.4L8 14.5 2 11.2V4.8ZM2 4.8 8 8l6-3.2M8 8v6.5',
  world: 'M1.5 13.5 6 5l3 5 1.5-2.5 4 6ZM4.6 7.7 6 9l1.3-1.4',
  pacing: 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 2.5V8l2.5 1.8',
  tables: 'M2 2.5h12v11H2ZM2 6h12M2 9.5h12M6 2.5v11',
  other: 'M3.5 8h.1M8 8h.1M12.5 8h.1',
  tree: 'M2 3.5h4v3H2ZM10 2h4v3h-4ZM10 7h4v3h-4ZM10 12h4v3h-4ZM6 5h2v8.5h2M8 8.5h2M8 3.5h2',
};

function icon(d: string, cls: string): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('width', '16');
  s.setAttribute('height', '16');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', `icon ${cls}`);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.4');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}

/** The icon for a menu group (a plain dot pattern for any group without one). */
export function groupIcon(id: string): SVGSVGElement {
  return icon(ICONS[id] ?? ICONS.other!, `g-${id}`);
}

/** The building tree's icon. */
export function treeIcon(): SVGSVGElement {
  return icon(ICONS.tree!, 'g-tree');
}

/**
 * A short bar with a mark where this value sits between the lowest (left)
 * and highest (right) of the same number on its neighbours.
 */
export function spreadBar(frac: number, title: string): HTMLElement {
  const f = Math.min(1, Math.max(0, frac));
  return h('span', { class: 'spread', title, role: 'img', 'aria-label': title },
    h('span', { class: 'fill', style: `width:${(f * 100).toFixed(1)}%` }),
    h('span', { class: 'mark', style: `left:${(f * 100).toFixed(1)}%` }));
}
