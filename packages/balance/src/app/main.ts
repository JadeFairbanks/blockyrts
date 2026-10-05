// The balance editor's page: a menu of groups and entries on the left, the
// chosen entry's values in the middle, pending changes and export on the
// right. Mouse-only works throughout; "/" jumps to search.

import { buildCatalog, forgeKind, type CatNode, type Entry, type FieldNode, type PairNode, type SectionNode } from '../core/catalog.ts';
import { exportFileName, parseBalanceFile, pathKey, type RawValue } from '../core/schema.ts';
import { Session, type LoadReport } from '../core/session.ts';
import { displayStep, fromDisplay, toDisplay, UNITS } from '../core/units.ts';
import { builtAt, commit, simDocs, simModules } from './sim-data.ts';
import { h, put } from './dom.ts';
import { groupIcon, spreadBar, treeIcon } from './visuals.ts';
import { pickInTree, renderTree, type TreeDeps } from './tree-view.ts';
import { buildTree } from '../core/tree.ts';
import { budgetFieldIds, budgetView } from '../core/budget.ts';
import { budgetPanel } from './budget-view.ts';

const cat = buildCatalog(simModules, simDocs);
const session = new Session(cat);
const STORE_KEY = 'blockyrts-balance-session';

let selected = '';
let query = '';
let lastReport: { title: string; report: LoadReport } | null = null;
/** Redraws a live preview on the open page (the night budget's) after a value is set. */
let afterSet: (() => void) | null = null;

// ---------- saving the session in this browser

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(session.toFile({ commit, builtAt, now: new Date() })));
  } catch {
    // Private windows and blocked storage: the session simply lives in the page.
  }
}

function restore(): void {
  try {
    const text = localStorage.getItem(STORE_KEY);
    if (!text) return;
    const report = session.load(parseBalanceFile(JSON.parse(text)));
    if (report.moved.length || report.missing.length) lastReport = { title: 'Your last session was restored', report };
  } catch {
    // Nothing usable stored.
  }
}

// ---------- layout

const app = document.getElementById('app')!;
const searchInput = h('input', {
  type: 'search', placeholder: 'Search every value: "zombie health", "forge", "research time"...', 'aria-label': 'Search',
  oninput: () => { query = searchInput.value.trim(); renderMain(); renderMenu(); },
  onkeydown: (e: KeyboardEvent) => { if (e.key === 'Escape') clearSearch(); },
});
const menuEl = h('nav', { class: 'menu', 'aria-label': 'Groups' });
const mainEl = h('main', { class: 'view' });
const sideEl = h('aside', { class: 'side', 'aria-label': 'Pending changes' });
const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: () => void importFile() });
const exportBtn = h('button', { class: 'btn primary', onclick: () => void exportFile() }, 'Export changes');

app.append(
  h('header', { class: 'top' },
    h('button', { class: 'btn menu-toggle', onclick: () => menuEl.classList.toggle('shown') }, 'Menu'),
    h('h1', {}, 'Balance editor'),
    h('div', { class: 'search' }, searchInput, h('button', { title: 'Clear search', 'aria-label': 'Clear search', onclick: () => clearSearch() }, '✕')),
    h('span', { class: 'built', title: `Built ${builtAt}` }, `Tables from commit ${commit.slice(0, 7)}${commit.includes('+') ? ' (with local changes)' : ''}`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import'),
      exportBtn,
      fileInput,
    ),
  ),
  h('div', { class: 'layout' }, menuEl, mainEl, sideEl),
);

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault();
    searchInput.focus();
  }
});

function clearSearch(): void {
  searchInput.value = '';
  query = '';
  renderMain();
  renderMenu();
}

// ---------- counts of pending changes

function changedIn(entryId: string): number {
  let n = 0;
  for (const id of session.changes.keys()) if (cat.fields.get(id)?.entryId === entryId) n++;
  return n;
}

function changedUnder(node: CatNode): number {
  if (node.type === 'field') return session.changes.has(node.id) ? 1 : 0;
  if (node.type === 'pair') return changedUnder(node.ref) + changedUnder(node.amount);
  if (node.type === 'text') return 0;
  return node.children.reduce((s, c) => s + changedUnder(c), 0);
}

function badge(n: number): HTMLElement | null {
  return n ? h('span', { class: 'badge', title: `${n} changed` }, String(n)) : null;
}

// ---------- menu

const openGroups = new Set<string>();
const openSubs = new Set<string>();

function matches(e: Entry, q: string): boolean {
  return e.label.toLowerCase().includes(q);
}

function renderMenu(): void {
  const q = query.toLowerCase();
  const scroll = menuEl.scrollTop;
  menuEl.replaceChildren();
  if (!q) menuEl.append(h('button', { class: `entry special${selected === TREE ? ' selected' : ''}`, onclick: () => openEntry(TREE) }, treeIcon(), 'Building tree'));
  for (const g of cat.groups) {
    const entries = q ? g.entries.filter((e) => matches(e, q) || fieldHits(q, e.id) > 0) : g.entries;
    if (q && entries.length === 0) continue;
    const changed = g.entries.reduce((s, e) => s + changedIn(e.id), 0);
    const det = h('details', { class: 'group', open: !!q || openGroups.has(g.id) || entries.some((e) => e.id === selected) },
      h('summary', { title: g.blurb }, groupIcon(g.id), g.label, badge(changed) ?? h('span', { class: 'count' }, String(g.entries.length))));
    det.addEventListener('toggle', () => (det.open ? openGroups.add(g.id) : openGroups.delete(g.id)));
    const subs = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e.menu[0] ?? '';
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key)!.push(e);
    }
    for (const [sub, list] of subs) {
      const buttons = list.map((e) =>
        h('button', { class: `entry${e.id === selected ? ' selected' : ''}`, onclick: () => openEntry(e.id) }, e.label, badge(changedIn(e.id))));
      if (!sub) {
        det.append(...buttons);
        continue;
      }
      const subKey = `${g.id}/${sub}`;
      const sd = h('details', { class: 'sub', open: !!q || openSubs.has(subKey) || list.some((e) => e.id === selected) },
        h('summary', {}, sub, badge(list.reduce((s, e) => s + changedIn(e.id), 0)) ?? h('span', { class: 'count' }, String(list.length))), ...buttons);
      sd.addEventListener('toggle', () => (sd.open ? openSubs.add(subKey) : openSubs.delete(subKey)));
      det.append(sd);
    }
    menuEl.append(det);
  }
  menuEl.scrollTop = scroll;
}

// ---------- search

function fieldHaystack(f: FieldNode): string {
  const e = cat.entries.get(f.entryId);
  return `${e?.label ?? ''} ${f.trail.join(' ')} ${f.label}`.toLowerCase();
}

function fieldHits(q: string, entryId: string): number {
  let n = 0;
  for (const f of cat.fields.values()) if (f.entryId === entryId && !f.readOnly && wordsMatch(q, fieldHaystack(f))) n++;
  return n;
}

function wordsMatch(q: string, hay: string): boolean {
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderSearch(): void {
  const q = query.toLowerCase();
  const entryHits = [...cat.entries.values()].filter((e) => matches(e, q)).slice(0, 30);
  const hits = [...cat.fields.values()].filter((f) => !f.readOnly && wordsMatch(q, fieldHaystack(f)));
  const shown = hits.slice(0, 200);
  put(mainEl,
    h('h2', { class: 'title' }, `Search: ${query}`),
    entryHits.length ? h('div', { class: 'links' }, h('h3', {}, 'Entries'),
      ...entryHits.map((e) => h('button', { class: 'chip', onclick: () => openEntry(e.id) }, e.label, ' ', h('small', {}, cat.groups.find((g) => g.id === e.group)?.label ?? '')))) : null,
    h('div', { class: 'results-head' }, hits.length === 0 ? 'No values match.' : `${hits.length} values match${hits.length > shown.length ? `; the first ${shown.length} are shown, so add a word to narrow it` : ''}. Edit them right here.`),
  );
  let lastEntry = '';
  const box = h('div', { class: 'section-list' });
  for (const f of shown) {
    if (f.entryId !== lastEntry) {
      lastEntry = f.entryId;
      const e = cat.entries.get(f.entryId)!;
      box.append(h('div', { class: 'result-entry' }, h('button', { onclick: () => openEntry(e.id) }, `${e.label} ›`)));
    }
    box.append(fieldRow(f, true));
  }
  mainEl.append(box);
}

// ---------- entry view

const TREE = 'view:tree';

const treeDeps: TreeDeps = {
  mods: simModules,
  current: (key) => {
    const f = cat.fields.get(key);
    return f ? session.current(f) : undefined;
  },
  changed: (key) => session.changes.has(key),
  field: (key) => cat.fields.get(key),
  fieldRow: (f) => fieldRow(f, false),
  entryOf: (kind, id) => cat.refEntry(kind, id),
  openEntry: (id, fieldId) => openEntry(id, fieldId),
};

/** The tree node an entry stands for: a building's first tier or a research step. */
function treeNodeOf(e: Entry): string | undefined {
  const rec = (simModules[e.module]?.[e.path[0] as string] as Array<Record<string, unknown>> | undefined)?.[e.path[1] as number];
  if (!rec || e.path.length !== 2) return undefined;
  if (e.path[0] === 'BUILDINGS') return `b:${rec.kind as number}:1`;
  if (e.path[0] === 'RESEARCH') return `r:${rec.id as number}`;
  return undefined;
}

/** A building's tiers as steps, each with the main base level it can first be had at. */
function tierLadder(e: Entry): HTMLElement | null {
  const node = treeNodeOf(e);
  if (!node) return null;
  const tree = buildTree(simModules, treeDeps.current);
  const showTree = h('button', { class: 'btn small', onclick: () => { pickInTree(node); openEntry(TREE); } }, treeIcon(), ' See it in the building tree');
  if (node.startsWith('r:')) {
    const r = tree.research.find((x) => x.id === node);
    if (!r) return null;
    return h('div', { class: 'ladder' }, h('div', { class: 'step research' }, h('span', { class: 'mb', title: 'Earliest main base level' }, `MB ${r.column}`), r.name, h('small', {}, r.waits.length ? `needs ${r.waits.join(', ')}` : 'needs nothing first')), showTree);
  }
  const row = tree.rows.find((x) => `b:${x.kind}:1` === node);
  if (!row) return null;
  const steps: HTMLElement[] = [];
  row.tiers.forEach((t, i) => {
    if (i) steps.push(h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
    const changed = ['needsBase', 'research', 'ws'].some((k) => session.changes.has(pathKey(e.module, [...t.path, k])));
    const ws = cat.fields.get(pathKey(e.module, [...t.path, 'ws']));
    steps.push(h('button', { class: `step${changed ? ' changed' : ''}`, title: 'Earliest main base level, then the tier', onclick: () => ws && openEntry(e.id, ws.id) },
      h('span', { class: 'mb' }, `MB ${t.column}`), t.name));
  });
  return h('div', { class: 'ladder' }, ...steps, showTree);
}

function openEntry(id: string, fieldId?: string): void {
  selected = id;
  if (query) {
    searchInput.value = '';
    query = '';
  }
  menuEl.classList.remove('shown');
  renderMenu();
  renderMain();
  if (fieldId) {
    const row = mainEl.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldId)}"]`);
    if (row) {
      for (let p = row.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
      row.scrollIntoView({ block: 'center' });
      row.classList.add('flash');
    }
  } else mainEl.scrollTop = 0;
}

function renderMain(): void {
  mainEl.replaceChildren();
  afterSet = null;
  if (query) return renderSearch();
  if (selected === TREE) return renderTree(mainEl, treeDeps);
  const e = cat.entries.get(selected);
  if (!e) return renderWelcome();
  const group = cat.groups.find((g) => g.id === e.group);
  put(mainEl,
    h('div', { class: 'crumbs' }, group?.label ?? '', e.menu.length ? ` › ${e.menu.join(' › ')}` : ''),
    h('h2', { class: 'title' }, e.label),
    e.doc ? h('p', { class: 'doc' }, e.doc) : null,
  );
  const texts = e.children.filter((c) => c.type === 'text');
  if (texts.length) mainEl.append(h('div', { class: 'texts' }, ...texts.map((t) => textNode(t))));
  const ladder = tierLadder(e);
  if (ladder) mainEl.append(ladder);
  const links = linksPanel(e);
  if (links) mainEl.append(links);
  for (const c of e.children) if (c.type !== 'text') mainEl.append(node(c));
  const budget = budgetPreview(e);
  if (budget) mainEl.append(budget);
  mainEl.append(entryNoteBox(e));
}

/** Nights 1 to 100 of the night budget, on the page that holds its terms, redrawn as they change. */
function budgetPreview(e: Entry): HTMLElement | null {
  const ids = budgetFieldIds(simModules);
  if (!ids || !Object.values(ids).some((id) => cat.fields.get(id)?.entryId === e.id)) return null;
  const read = (id: string): RawValue | undefined => {
    const f = cat.fields.get(id);
    return f ? session.current(f) : undefined;
  };
  const panel = budgetPanel(() => budgetView(simModules, read));
  afterSet = panel.refresh;
  return panel.el;
}

function textNode(t: CatNode): HTMLElement {
  if (t.type !== 'text') return h('div');
  return h('div', { class: 'textnode' }, h('b', {}, `${t.label}: `), t.text);
}

function node(n: CatNode): HTMLElement {
  if (n.type === 'field') return fieldRow(n, false);
  if (n.type === 'pair') return pairRow(n);
  if (n.type === 'text') return textNode(n);
  return section(n);
}

function section(s: SectionNode): HTMLElement {
  const changed = changedUnder(s);
  const body = h('div', { class: 'body' });
  const det = h('details', { class: 'section', open: s.open || changed > 0 }, h('summary', { title: s.doc }, s.label, badge(changed)), body);
  // Long sections are filled when first opened.
  const fill = (): void => {
    if (body.childElementCount) return;
    if (s.doc) body.append(h('p', { class: 'doc' }, s.doc));
    for (const c of s.children) body.append(node(c));
  };
  if (det.open) fill();
  det.addEventListener('toggle', fill);
  return det;
}

/** What this entry needs, and what needs it or is made, kept or spawned here. */
function linksPanel(e: Entry): HTMLElement | null {
  const needs: HTMLElement[] = [];
  const seen = new Set<string>();
  for (const f of cat.fields.values()) {
    if (f.entryId !== e.id || typeof f.value !== 'number') continue;
    const key = String(f.path[f.path.length - 1]);
    let target: string | undefined;
    let text = '';
    const v = session.current(f) as number;
    if (f.ref === 'research' && v !== 0) {
      target = cat.refEntry('research', v);
      text = `Research: ${cat.refNames.research.get(v) ?? v}`;
    } else if (key === 'needsBase' && v > 0) {
      target = cat.refEntry('building', 0);
      text = `Main base level ${v}`;
    } else if (key === 'forge' && v > 0) {
      const forge = forgeKind(simModules);
      target = forge === undefined ? undefined : cat.refEntry('building', forge);
      text = `${forge === undefined ? 'Forge' : cat.refNames.building.get(forge) ?? 'Forge'} level ${v}`;
    } else if (f.ref === 'tierNeed') {
      target = cat.refEntry('tierNeed', v);
      text = `Material tier ${cat.refNames.tierNeed.get(v) ?? v}`;
    } else if (f.ref === 'building' && f.path.includes('madeAt') || f.ref === 'building' && f.path.includes('at')) {
      target = cat.refEntry('building', v);
      text = `Made at: ${cat.refNames.building.get(v) ?? v}`;
    }
    if (!target || !text) continue;
    const where = f.trail.filter((t) => !/^(Levels|Way \d+|Made at|\d+)$/.test(t)).join(' › ');
    const k = `${text}|${where}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const t = target;
    needs.push(h('button', { class: 'chip', onclick: () => openEntry(t, f.id) }, text, where ? h('small', {}, ` (${where})`) : null));
  }
  const byHow = new Map<string, HTMLElement[]>();
  for (const r of e.usedBy) {
    const from = cat.entries.get(r.from);
    if (!from) continue;
    const label = `${r.detail ? `${r.detail[0]!.toUpperCase()}${r.detail.slice(1)}: ` : ''}${capital(r.how)}`;
    if (!byHow.has(label)) byHow.set(label, []);
    const where = r.where.replace(/^Levels › |^Levels > /, '').replace(/ > /g, ' › ');
    byHow.get(label)!.push(h('button', { class: 'chip', onclick: () => openEntry(r.from) }, from.label, where ? h('small', {}, ` (${where})`) : null));
  }
  if (!needs.length && !byHow.size) return null;
  const labels = [...byHow.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return h('div', { class: 'links' },
    needs.length ? h('div', {}, h('h3', {}, 'Needs'), h('div', { class: 'row' }, ...needs)) : null,
    byHow.size ? h('div', {}, h('h3', {}, 'Unlocks and uses'),
      ...labels.map((l) => h('div', { class: 'row' }, h('span', { class: 'how' }, `${l.replace(/^(Level \d+): (.*)$/, '$2 at $1')}: `), ...byHow.get(l)!))) : null,
  );
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function entryNoteBox(e: Entry): HTMLElement {
  const ta = h('textarea', {
    rows: 2, placeholder: 'Anything the values above cannot say, e.g. "add 10 stone to the level 3 cost". It goes in the export.',
    value: session.entryNotes.get(e.id) ?? '',
    oninput: () => {
      if (ta.value.trim()) session.entryNotes.set(e.id, ta.value);
      else session.entryNotes.delete(e.id);
      save();
      renderSide();
    },
  });
  return h('details', { class: 'section', open: session.entryNotes.has(e.id) }, h('summary', {}, `Note about ${e.label}`), h('div', { class: 'body' }, ta));
}

// ---------- one value

function refSelect(f: FieldNode, onPick: (v: number) => void): HTMLSelectElement {
  const names = cat.refNames[f.ref!];
  const cur = session.current(f) as number;
  const sel = h('select', { disabled: f.readOnly, 'aria-label': f.label, onchange: () => onPick(Number(sel.value)) });
  const ids = [...names.keys()].sort((a, b) => a - b);
  if (!names.has(cur)) ids.unshift(cur);
  for (const id of ids) sel.append(h('option', { value: String(id), selected: id === cur }, names.get(id) ?? `#${id}`));
  return sel;
}

function valueInput(f: FieldNode, onSet: (v: RawValue) => void): HTMLElement {
  const cur = session.current(f);
  if (typeof cur === 'boolean') {
    const cb = h('input', { type: 'checkbox', checked: cur, disabled: f.readOnly, 'aria-label': f.label, onchange: () => onSet(cb.checked) });
    return cb;
  }
  if (f.ref) return refSelect(f, onSet);
  const inp = h('input', {
    type: 'number', value: toDisplay(cur, f.unit), step: String(displayStep(f.unit)), disabled: f.readOnly, 'aria-label': f.label,
    onchange: () => {
      const raw = fromDisplay(inp.value, f.unit);
      if (raw === null) inp.value = toDisplay(session.current(f) as number, f.unit);
      else onSet(raw);
    },
  });
  return inp;
}

function fieldRow(f: FieldNode, withTrail: boolean): HTMLElement {
  const row = h('div', { class: 'field', 'data-field': f.id });
  const draw = (): void => {
    const changed = session.changes.has(f.id);
    row.className = `field${changed ? ' changed' : ''}${f.readOnly ? ' readonly' : ''}`;
    const unit = UNITS[f.unit];
    const set = (v: RawValue): void => {
      session.set(f.id, v);
      save();
      draw();
      afterSet?.();
      renderSide();
      renderMenu();
    };
    const go = f.ref && typeof f.value === 'number' ? cat.refEntry(f.ref, session.current(f) as number) : undefined;
    row.replaceChildren(
      h('div', { class: 'label', title: [f.doc, unit.hint].filter(Boolean).join('\n') },
        withTrail && f.trail.length ? h('span', { class: 'trail' }, f.trail.join(' › ')) : null,
        f.label,
        f.doc && !withTrail ? h('span', { class: 'info' }, f.doc) : null),
      h('div', { class: 'ctl' }, valueInput(f, set), !f.ref && unit.suffix ? h('span', { class: 'unit' }, unit.suffix) : null, spreadFor(f),
        go && go !== f.entryId ? h('button', { class: 'go', title: 'Open it', onclick: () => openEntry(go) }, 'Open ›') : null),
      h('div', { class: 'ctl' },
        changed ? h('span', { class: 'was' }, `was ${session.show(f, f.value)}`) : null,
        changed ? h('button', { class: 'reset', title: 'Put back the value from the tables', onclick: () => set(f.value) }, '↺ Reset') : null,
        f.readOnly ? h('span', { class: 'was' }, 'fixed') : null),
    );
  };
  draw();
  return row;
}

// ---------- how a value compares with the same value on its neighbours (every mob's health, say)

const spreadCache = new Map<string, FieldNode[]>();

function spreadKey(f: FieldNode): string | null {
  const e = cat.entries.get(f.entryId);
  if (!e || e.path.length !== 2 || f.ref || typeof f.value !== 'number' || f.readOnly) return null;
  return `${f.module}#${String(f.path[0])}.*.${f.path.slice(2).join('.')}`;
}

function spreadFor(f: FieldNode): HTMLElement | null {
  const key = spreadKey(f);
  if (!key) return null;
  if (!spreadCache.size) {
    for (const g of cat.fields.values()) {
      const k = spreadKey(g);
      if (!k) continue;
      if (!spreadCache.has(k)) spreadCache.set(k, []);
      spreadCache.get(k)!.push(g);
    }
  }
  const peers = spreadCache.get(key) ?? [];
  if (peers.length < 3) return null;
  const vals = peers.map((p) => session.current(p) as number);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (lo === hi) return null;
  const v = session.current(f) as number;
  const rank = vals.filter((x) => x > v).length + 1;
  const kind = cat.entries.get(f.entryId)?.menu[0] ?? cat.groups.find((g) => g.id === cat.entries.get(f.entryId)?.group)?.label ?? '';
  const title = `${f.label}: ${session.show(f, v)}, ${ordinal(rank)} highest of ${peers.length}${kind ? ` (${kind.toLowerCase()} and their neighbours)` : ''}. Lowest ${session.show(f, lo)}, highest ${session.show(f, hi)}.`;
  return spreadBar((v - lo) / (hi - lo), title);
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

function pairRow(p: PairNode): HTMLElement {
  const row = h('div', { class: 'field', 'data-field': p.amount.id });
  const draw = (): void => {
    const changed = session.changes.has(p.amount.id) || session.changes.has(p.ref.id);
    row.className = `field${changed ? ' changed' : ''}`;
    const set = (f: FieldNode) => (v: RawValue): void => {
      session.set(f.id, v);
      save();
      draw();
      renderSide();
      renderMenu();
    };
    const unit = UNITS[p.amount.unit];
    const refNow = session.current(p.ref) as number;
    const go = cat.refEntry(p.ref.ref!, refNow);
    const was: string[] = [];
    if (session.changes.has(p.ref.id)) was.push(session.show(p.ref, p.ref.value));
    if (session.changes.has(p.amount.id)) was.push(session.show(p.amount, p.amount.value));
    row.replaceChildren(
      h('div', { class: 'label' }, refSelect(p.ref, set(p.ref))),
      h('div', { class: 'ctl' }, p.amount.label === 'Level' ? h('span', { class: 'unit' }, 'level') : null, valueInput(p.amount, set(p.amount)),
        unit.suffix ? h('span', { class: 'unit' }, unit.suffix) : null,
        go && go !== p.ref.entryId ? h('button', { class: 'go', onclick: () => openEntry(go) }, 'Open ›') : null),
      h('div', { class: 'ctl' },
        changed ? h('span', { class: 'was' }, `was ${was.join(', ')}`) : null,
        changed ? h('button', { class: 'reset', onclick: () => { session.reset(p.ref.id); session.reset(p.amount.id); save(); draw(); renderSide(); renderMenu(); } }, '↺ Reset') : null),
    );
  };
  draw();
  return row;
}

// ---------- welcome

function renderWelcome(): void {
  const editable = [...cat.fields.values()].filter((f) => !f.readOnly).length;
  mainEl.append(h('div', { class: 'welcome' },
    h('h2', { class: 'title' }, 'Survive and Conquer balance editor'),
    h('p', { class: 'doc' }, `Every balance value the game runs on, ${editable.toLocaleString()} of them, read straight from the game's tables. Pick a group on the left or search above. Change a value and it turns yellow and appears on the right; the right-hand list is what gets exported.`),
    h('p', { class: 'doc' }, 'When you are done, press Export changes. It downloads a small JSON file listing only what you changed, with the old and new value of each, which you hand back in the project. Import loads such a file again so you can carry on. Your edits are also kept in this browser between visits.'),
    h('button', { class: 'card wide', onclick: () => openEntry(TREE) }, h('b', {}, treeIcon(), ' Building tree'), h('span', {}, 'Every building and its tiers by the main base level they open at, with the research between them. Hover to see what unlocks what; click to edit.')),
    h('div', { class: 'groups' }, ...cat.groups.map((g) => h('button', {
      class: 'card', onclick: () => { openGroups.add(g.id); const first = g.entries[0]; if (first) openEntry(first.id); },
    }, h('b', {}, groupIcon(g.id), ` ${g.label} (${g.entries.length})`), h('span', {}, g.blurb)))),
  ));
}

// ---------- pending changes, export and import

function renderSide(): void {
  const n = session.changes.size;
  exportBtn.textContent = n ? `Export ${n} change${n === 1 ? '' : 's'}` : 'Export changes';
  sideEl.replaceChildren(h('h2', {}, `Pending changes (${n})`),
    h('p', { class: 'hint' }, 'Only these go in the export. Add a note to any of them to say why.'));
  if (lastReport) sideEl.append(reportBox(lastReport.title, lastReport.report));
  if (!n) sideEl.append(h('p', { class: 'empty' }, 'Nothing changed yet.'));
  const list = [...session.changes].map(([id, p]) => ({ f: cat.fields.get(id)!, p })).filter((x) => x.f);
  list.sort((a, b) => session.labelOf(a.f).localeCompare(session.labelOf(b.f)));
  for (const { f, p } of list) {
    const ta = h('textarea', { rows: 1, placeholder: 'Note (optional)', value: p.note, oninput: () => { session.setNote(f.id, ta.value); save(); } });
    sideEl.append(h('div', { class: 'change' },
      h('button', { class: 'what', onclick: () => openEntry(f.entryId, f.id) }, session.labelOf(f).split(' > ').slice(1).join(' › ')),
      h('div', { class: 'bar' },
        h('div', { class: 'vals' }, h('span', { class: 'old' }, session.show(f, f.value)), ' → ', session.show(f, p.value), delta(f, p.value)),
        h('button', { class: 'btn small', title: 'Undo this change', onclick: () => { session.reset(f.id); save(); renderAll(); } }, 'Reset')),
      ta));
  }
  const notesFor = [...session.entryNotes.keys()].map((id) => cat.entries.get(id)).filter((e): e is Entry => !!e);
  if (notesFor.length) {
    sideEl.append(h('h2', {}, 'Notes on entries'));
    for (const e of notesFor) sideEl.append(h('div', { class: 'change' }, h('button', { class: 'what', onclick: () => openEntry(e.id) }, e.label), h('div', {}, session.entryNotes.get(e.id) ?? '')));
  }
  const general = h('textarea', { rows: 3, placeholder: 'General notes for this round of balancing', value: session.notes, oninput: () => { session.notes = general.value; save(); } });
  sideEl.append(h('h2', { style: 'margin-top:14px' }, 'General notes'), general,
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary', onclick: () => void exportFile() }, 'Export changes'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import a file'),
      h('button', { class: 'btn', disabled: n === 0 && session.entryNotes.size === 0 && !session.notes, onclick: (e: MouseEvent) => clearAll(e.currentTarget as HTMLButtonElement) }, 'Clear all')));
}

/** "+20%" or "−15%" for a number, coloured by direction. */
function delta(f: FieldNode, v: RawValue): HTMLElement | null {
  if (f.ref || typeof v !== 'number' || typeof f.value !== 'number' || f.value === 0) return null;
  const pct = Math.round(((v - f.value) / Math.abs(f.value)) * 100);
  if (pct === 0) return null;
  return h('span', { class: `delta ${pct > 0 ? 'up' : 'down'}` }, `${pct > 0 ? '▲ +' : '▼ −'}${Math.abs(pct)}%`);
}

function reportBox(title: string, r: LoadReport): HTMLElement {
  const warn = r.moved.length > 0 || r.missing.length > 0;
  return h('div', { class: `report${warn ? ' warn' : ''}` },
    h('b', {}, title), h('div', {}, `${r.applied} change${r.applied === 1 ? '' : 's'} loaded.${r.same.length ? ` ${r.same.length} already match these tables.` : ''}`),
    r.moved.length ? h('div', {}, 'These values changed in the game since the file was made (your new value is kept):', h('ul', {}, ...r.moved.map((m) => h('li', {}, m)))) : null,
    r.missing.length ? h('div', {}, 'These no longer exist in the tables and were skipped:', h('ul', {}, ...r.missing.map((m) => h('li', {}, m)))) : null,
    h('button', { class: 'btn small', onclick: () => { lastReport = null; renderSide(); } }, 'Dismiss'));
}

let clearArmed = false;

/** Clear all asks twice in the page itself (embedded viewers do not show confirm dialogs). */
function clearAll(btn: HTMLButtonElement): void {
  if (!clearArmed) {
    clearArmed = true;
    btn.textContent = 'Press again to clear everything';
    setTimeout(() => {
      clearArmed = false;
      btn.textContent = 'Clear all';
    }, 4000);
    return;
  }
  clearArmed = false;
  session.clear();
  lastReport = null;
  save();
  renderAll();
}

interface Downloads {
  save(req: { filename: string; data: string }): Promise<unknown>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

/** Inside a claude.ai Artifact a page cannot start downloads itself; the viewer's downloads capability offers the file instead. */
async function hostDownloads(): Promise<Downloads | null> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return null;
  try {
    return (await host.use('downloads')) as Downloads | null;
  } catch {
    return null;
  }
}

async function exportFile(): Promise<void> {
  const file = session.toFile({ commit, builtAt, now: new Date() });
  const text = `${JSON.stringify(file, null, 2)}\n`;
  const name = exportFileName(new Date());
  const downloads = await hostDownloads();
  if (downloads) {
    try {
      await downloads.save({ filename: name, data: text });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'declined') lastReport = { title: 'The file could not be saved here', report: { applied: 0, moved: [], same: [], missing: [String((err as { message?: string }).message ?? code)] } };
      renderSide();
    }
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importFile(): Promise<void> {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const parsed = parseBalanceFile(JSON.parse(await file.text()));
    lastReport = { title: `Imported ${file.name}`, report: session.load(parsed) };
  } catch (err) {
    lastReport = { title: `Could not import ${file.name}`, report: { applied: 0, moved: [], same: [], missing: [err instanceof Error ? err.message : String(err)] } };
  }
  save();
  renderAll();
}

function renderAll(): void {
  renderMenu();
  renderMain();
  renderSide();
}

restore();
renderAll();
