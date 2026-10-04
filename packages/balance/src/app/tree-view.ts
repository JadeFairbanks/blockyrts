// The building tree page: every building's tiers laid out by the main base
// level they can first be had at, the research steps below them, lines to
// what each waits on when hovered, and the tier's key numbers editable in
// place (the picture moves as they change).

import { buildTree, type BuildingTree, type TreeResearch, type TreeTier } from '../core/tree.ts';
import type { FieldNode, SimModules } from '../core/catalog.ts';
import { pathKey, type RawValue } from '../core/schema.ts';
import { h } from './dom.ts';

export interface TreeDeps {
  mods: SimModules;
  /** The editor's current value for a `module#path` key. */
  current: (key: string) => RawValue | undefined;
  changed: (key: string) => boolean;
  field: (key: string) => FieldNode | undefined;
  fieldRow: (f: FieldNode) => HTMLElement;
  /** The entry for a building kind or research id. */
  entryOf: (kind: 'building' | 'research', id: number) => string | undefined;
  openEntry: (id: string, fieldId?: string) => void;
}

const BUILDINGS = 'buildings/data.ts';
/** Where the research steps live. */
const RESEARCH_MODULE = 'combat/items.ts';
const TIER_KEYS = ['needsBase', 'research', 'ws', 'health', 'supply', 'shelters', 'workers'];
const RESEARCH_KEYS = ['steps', 'forge', 'after', 'at'];

let picked = '';
// Esc closes the picked tier's panel while the tree is on screen.
let closeTree: (() => void) | null = null;
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !picked || !closeTree || !document.querySelector('.tree-details')) return;
  if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) e.target.blur();
  closeTree();
});
let showSimple = false;
let scrollLeft = 0;

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A flask, drawn inline: marks a tier that waits on research. */
function flask(): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true', class: 'flask' });
  s.append(svg('path', { d: 'M6 1.5h4M6.5 1.5v4.2L2.6 12.4a1.4 1.4 0 0 0 1.2 2.1h8.4a1.4 1.4 0 0 0 1.2-2.1L9.5 5.7V1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  return s;
}

/** Opens the tree with this node picked (`b:<kind>:<level>` or `r:<id>`). */
export function pickInTree(id: string): void {
  picked = id;
}

export function renderTree(root: HTMLElement, deps: TreeDeps): void {
  const tree = buildTree(deps.mods, deps.current);
  const n = tree.baseNames.length;
  const anyChanged = (path: Array<string | number>, module: string, keys: string[]): boolean =>
    keys.some((k) => deps.changed(pathKey(module, [...path, k])));

  const wrap = h('div', { class: 'tree-wrap', onscroll: () => { scrollLeft = wrap.scrollLeft; } });
  const grid = h('div', { class: 'tree', style: `--cols:${n}` });
  const lines = svg('svg', { class: 'tree-lines', 'aria-hidden': 'true' });
  const nodes = new Map<string, HTMLElement>();
  const needsOf = new Map<string, string[]>();

  // Column heads: the main base levels.
  grid.append(h('div', { class: 'corner' }, 'Main base level'));
  tree.baseNames.forEach((name, i) =>
    grid.append(h('div', { class: 'colhead' }, h('span', { class: 'lvl' }, String(i + 1)), h('span', { class: 'nm' }, name))));

  const tierChip = (t: TreeTier, menu: string, live: boolean): HTMLElement => {
    const researchName = t.research ? deps.mods[RESEARCH_MODULE] && ((deps.mods[RESEARCH_MODULE].RESEARCH as Array<{ id: number; name: string }>).find((r) => r.id === t.research)?.name ?? '') : '';
    const chip = h('button', {
      class: `tier ${menu}${anyChanged(t.path, BUILDINGS, TIER_KEYS) ? ' changed' : ''}${live ? '' : ' later'}${picked === t.id ? ' picked' : ''}`,
      'data-node': t.id,
      title: [`${t.name}: tier ${t.level}`, t.needsBase ? `Main base level ${t.needsBase} needed` : 'No main base level needed', researchName ? `Research: ${researchName}` : '', live ? '' : 'Comes in a later milestone', 'Click to change its numbers'].filter(Boolean).join('\n'),
      onclick: () => { picked = picked === t.id ? '' : t.id; renderTree(root, deps); },
    }, h('span', { class: 'tn' }, t.level > 1 || menu === 'main' ? h('b', {}, String(t.level)) : null, t.name), researchName ? h('span', { class: 'rs' }, flask(), researchName) : null);
    nodes.set(t.id, chip);
    needsOf.set(t.id, t.needs);
    return chip;
  };

  const row = (label: HTMLElement, cells: Map<number, HTMLElement[]>, span: [number, number] | null, cls: string): void => {
    grid.append(label);
    const track = h('div', { class: `track ${cls}` });
    if (span && span[1] > span[0]) track.append(h('div', { class: 'rail', style: `grid-column:${span[0]} / ${span[1] + 1}` }));
    for (let c = 1; c <= n; c++) {
      const list = cells.get(c);
      track.append(h('div', { class: 'cell', style: `grid-column:${c}` }, ...(list ?? [])));
    }
    grid.append(track);
  };

  const simple = tree.rows.filter((r) => r.menu !== 'main' && r.tiers.length === 1 && r.tiers[0]!.column === 1 && !r.tiers[0]!.research);
  const sections: Array<[string, string, typeof tree.rows]> = [
    ['main', 'Main base', tree.rows.filter((r) => r.menu === 'main')],
    ['basic', 'Build menu', tree.rows.filter((r) => r.menu === 'build' && (showSimple || !simple.includes(r)))],
    ['advanced', 'Defences and Lights', tree.rows.filter((r) => r.menu === 'submenu' && (showSimple || !simple.includes(r)))],
  ];
  for (const [cls, title, rows] of sections) {
    grid.append(h('div', { class: `band ${cls}` }, h('span', {}, title)));
    for (const r of rows.sort((a, b) => (a.tiers[0]?.column ?? 0) - (b.tiers[0]?.column ?? 0))) {
      const cells = new Map<number, HTMLElement[]>();
      for (const t of r.tiers) {
        if (!cells.has(t.column)) cells.set(t.column, []);
        cells.get(t.column)!.push(tierChip(t, cls, r.live));
      }
      const cols = r.tiers.map((t) => t.column);
      const entry = deps.entryOf('building', r.kind);
      row(h('button', { class: 'rowhead', title: `Open ${r.name}`, onclick: () => entry && deps.openEntry(entry) }, r.name, h('small', {}, `${r.tiers.length} tier${r.tiers.length === 1 ? '' : 's'}`)),
        cells, [Math.min(...cols), Math.max(...cols)], cls);
    }
  }

  grid.append(h('div', { class: 'band research' }, h('span', {}, 'Research')));
  const atName = (kind: number): string => tree.rows.find((r) => r.kind === kind)?.name ?? '';
  for (const r of tree.research) {
    const chip = researchChip(r, atName(r.at), deps, () => renderTree(root, deps));
    nodes.set(r.id, chip);
    needsOf.set(r.id, r.needs);
    const entry = deps.entryOf('research', r.research);
    row(h('button', { class: 'rowhead', title: `Open ${r.name}`, onclick: () => entry && deps.openEntry(entry) }, r.name, h('small', {}, `${r.seconds} s`)),
      new Map([[r.column, [chip]]]), null, 'research');
  }

  wrap.append(grid, lines);

  // Hover: lines from what it waits on (left) and to what it opens (right), the rest dimmed.
  const focus = (id: string | null): void => {
    lines.replaceChildren();
    wrap.classList.toggle('focusing', !!id);
    for (const el of nodes.values()) el.classList.remove('pre', 'post', 'self');
    if (!id) return;
    const self = nodes.get(id);
    if (!self) return;
    self.classList.add('self');
    const box = wrap.getBoundingClientRect();
    lines.setAttribute('width', String(wrap.scrollWidth));
    lines.setAttribute('height', String(wrap.scrollHeight));
    const at = (el: HTMLElement, side: 'l' | 'r'): [number, number] => {
      const r = el.getBoundingClientRect();
      return [(side === 'l' ? r.left : r.right) - box.left + wrap.scrollLeft, r.top + r.height / 2 - box.top + wrap.scrollTop];
    };
    const link = (from: HTMLElement, to: HTMLElement, cls: string): void => {
      const [x1, y1] = at(from, 'r');
      let [x2, y2] = at(to, 'l');
      if (x2 < x1) [x2, y2] = at(to, 'r');
      const dx = Math.max(30, Math.abs(x2 - x1) / 2);
      lines.append(svg('path', { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, class: cls }));
    };
    for (const p of needsOf.get(id) ?? []) {
      const el = nodes.get(p);
      if (!el) continue;
      el.classList.add('pre');
      link(el, self, 'pre');
    }
    for (const d of tree.dependents.get(id) ?? []) {
      const el = nodes.get(d);
      if (!el) continue;
      el.classList.add('post');
      link(self, el, 'post');
    }
  };
  for (const [id, el] of nodes) {
    el.addEventListener('mouseenter', () => focus(id));
    el.addEventListener('mouseleave', () => focus(picked && nodes.has(picked) ? picked : null));
    el.addEventListener('focus', () => focus(id));
  }

  const intro = h('p', { class: 'doc' },
    'Each building\'s tiers sit under the earliest main base level they can be had at: after their own main base level, the tier before them and any research. ',
    'Hover a tier to draw what it waits on (red lines, from the left) and what it opens (blue dashed lines, to the right). Click a tier to change its numbers below the tree; the tree moves as you edit.');
  const legend = h('div', { class: 'legend' },
    h('span', { class: 'tier main' }, 'Main base'), h('span', { class: 'tier basic' }, 'Build menu'), h('span', { class: 'tier advanced' }, 'Defences and Lights'),
    h('span', { class: 'tier research' }, 'Research'), h('span', { class: 'tier basic' }, h('span', { class: 'rs' }, flask(), 'needs research')),
    h('span', { class: 'tier basic changed' }, 'you changed it'), h('span', { class: 'tier basic later' }, 'later milestone'));
  const toggle = h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: showSimple, onchange: () => { showSimple = !showSimple; renderTree(root, deps); } }),
    ` Show the ${simple.length} one-tier buildings ready from the start`);
  const strip = showSimple ? null : h('div', { class: 'simple' }, h('b', {}, 'Ready from the start, one tier: '),
    ...simple.map((r) => {
      const entry = deps.entryOf('building', r.kind);
      return h('button', { class: 'chip', onclick: () => entry && deps.openEntry(entry) }, r.name);
    }));

  closeTree = () => { picked = ''; renderTree(root, deps); };
  const top = root.scrollTop;
  root.replaceChildren(
    h('div', { class: 'crumbs' }, 'Buildings and levels'),
    h('h2', { class: 'title' }, 'Building tree'),
    intro, legend, toggle, strip ?? '', wrap, details(tree, deps, () => renderTree(root, deps)),
  );
  root.scrollTop = top;
  wrap.scrollLeft = scrollLeft;
  if (picked && nodes.has(picked)) requestAnimationFrame(() => focus(picked));
}

function researchChip(r: TreeResearch, at: string, deps: TreeDeps, redraw: () => void): HTMLElement {
  const changed = RESEARCH_KEYS.some((k) => deps.changed(pathKey(RESEARCH_MODULE, [...r.path, k])));
  return h('button', {
    class: `tier research${changed ? ' changed' : ''}${picked === r.id ? ' picked' : ''}`,
    'data-node': r.id,
    title: [`${r.name}: ${r.seconds} s at the ${at || 'Scholar\'s Lodge'}`, r.waits.length ? `Needs ${r.waits.join(', ')}` : 'Needs nothing first', 'Click to change its numbers'].join('\n'),
    onclick: () => { picked = picked === r.id ? '' : r.id; redraw(); },
  }, h('span', { class: 'tn' }, flask(), r.name), h('span', { class: 'rs' }, [`${r.seconds} s`, at && !/scholar/i.test(at) ? `at ${at}` : '', ...r.waits].filter(Boolean).join(' · ')));
}

/** The picked tier's or research step's key numbers, editable here. */
function details(tree: BuildingTree, deps: TreeDeps, redraw: () => void): HTMLElement {
  if (!picked) return h('p', { class: 'hint tree-hint' }, 'Click any tier or research step to change its numbers here.');
  const tier = tree.rows.flatMap((r) => r.tiers.map((t) => ({ r, t }))).find((x) => x.t.id === picked);
  const research = tree.research.find((r) => r.id === picked);
  const box = h('div', { class: 'tree-details' });
  const close = h('button', { class: 'close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => { picked = ''; redraw(); } }, '✕');
  // Values change on "change"; redraw the tree once the row has saved it.
  box.addEventListener('change', () => setTimeout(redraw, 0));
  if (tier) {
    const entry = deps.entryOf('building', tier.r.kind);
    box.append(h('div', { class: 'head' }, h('h3', {}, `${tier.t.name}`, h('small', {}, ` ${tier.r.name}, tier ${tier.t.level}`)),
      entry ? h('button', { class: 'btn small', onclick: () => deps.openEntry(entry, deps.field(pathKey(BUILDINGS, [...tier.t.path, 'ws']))?.id) }, 'Costs and everything else ›') : null, close));
    for (const k of TIER_KEYS) {
      const f = deps.field(pathKey(BUILDINGS, [...tier.t.path, k]));
      if (f && !f.readOnly) box.append(deps.fieldRow(f));
    }
  } else if (research) {
    const entry = deps.entryOf('research', research.research);
    box.append(h('div', { class: 'head' }, h('h3', {}, research.name, h('small', {}, ' research')),
      entry ? h('button', { class: 'btn small', onclick: () => deps.openEntry(entry) }, 'Cost and everything else ›') : null, close));
    for (const k of [...RESEARCH_KEYS, 'building']) {
      const key = pathKey(RESEARCH_MODULE, [...research.path, k]);
      const fs = k === 'building' ? [deps.field(pathKey(RESEARCH_MODULE, [...research.path, k, 0])), deps.field(pathKey(RESEARCH_MODULE, [...research.path, k, 1]))] : [deps.field(key)];
      for (const f of fs) if (f && !f.readOnly) box.append(deps.fieldRow(f));
    }
  } else return h('p', { class: 'hint tree-hint' }, 'Click any tier or research step to change its numbers here.');
  return box;
}
