// Builds the HUD's DOM: every panel at its place from Controls > Screen layout
// and mouse zones, each registered as a solid rectangle. The shell fills in
// the buttons and the live text; applyGeometry puts the panels where
// hud-layout.ts says for the screen size.
import { cardCells, cardHeight, type HudGeometry } from './hud-layout.ts';
import type { HudPanels } from './panels.ts';

export interface HudLayout {
  root: HTMLElement;
  dragBox: HTMLElement;
  minimapPanel: HTMLElement;
  utilityBar: HTMLElement;
  /** The minimap's drawing area (the Minimap class puts its canvases in it). */
  minimapEl: HTMLElement;
  messagePanel: HTMLElement;
  messageList: HTMLElement;
  /** The chat box at the bottom of the message panel. */
  chat: HTMLInputElement;
  /** The portrait (bottom strip, beside the middle): the 3D render shows through its window. */
  portraitPanel: HTMLElement;
  portraitWindow: HTMLElement;
  /** A picture for what has no model to render (a tree, a rock). */
  portraitIcon: HTMLImageElement;
  selectionPanel: HTMLElement;
  selectionTitle: HTMLElement;
  /** The title row's pictures and bars after the name (Patch 2): rank badge, health, the queue. */
  selectionExtra: HTMLElement;
  selectionCorner: HTMLElement;
  /** The tier strip a training card's slot opens just above the middle (Patch 2). */
  tierStrip: HTMLElement;
  selectionBody: HTMLElement;
  groupTabs: HTMLElement;
  commandCard: HTMLElement;
  /** The card's slots: the first 15 are the fixed block with the grid keys, then the extra slots (hud-layout.ts cardCells). */
  commandSlots: HTMLElement[];
  /** The phone's fold buttons (bottom left). */
  folds: HTMLElement;
  topRight: HTMLElement;
  topRightButtons: HTMLElement;
  /** The stockpile: Food, Supply and the inventory grid (inventory-ui.ts fills it). */
  stockpile: HTMLElement;
  clock: HTMLElement;
  clockDay: HTMLElement;
  clockTime: HTMLElement;
  clockNote: HTMLElement;
  debug: HTMLElement;
  debugFields: Record<'seed' | 'players' | 'step' | 'rate' | 'hash' | 'hashStep' | 'fps' | 'draws' | 'units' | 'memory', HTMLElement>;
}

function div(className: string, parent?: HTMLElement, text?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  parent?.append(el);
  return el;
}

export function buildLayout(parent: HTMLElement, panels: HudPanels): HudLayout {
  const root = div('hud');
  root.id = 'hud';
  parent.append(root);

  // The drag box sits under the panels, so where it would reach them it is hidden behind them.
  const dragBox = div('drag-box', root);
  dragBox.hidden = true;

  // Minimap (bottom left) with the utility bar along its top edge.
  const minimapPanel = div('panel minimap-panel', root);
  const utilityBar = div('utility-bar', minimapPanel);
  const minimapEl = div('minimap', minimapPanel);

  // Message panel (left, above the minimap).
  const messagePanel = div('panel message-panel', root);
  const messageList = div('message-list', messagePanel);
  messageList.dataset.scroll = '';
  const chat = document.createElement('input');
  chat.className = 'chat';
  chat.disabled = true;
  chat.tabIndex = -1;
  chat.spellcheck = false;
  chat.autocomplete = 'off';
  messagePanel.append(chat);

  // Portrait (bottom strip, left of the middle): a frame with an open window the 3D portrait is drawn into.
  const portraitPanel = div('panel portrait-panel', root);
  const portraitWindow = div('portrait-window', portraitPanel);
  const portraitIcon = document.createElement('img');
  portraitIcon.className = 'portrait-icon';
  portraitIcon.alt = '';
  portraitIcon.hidden = true;
  portraitWindow.append(portraitIcon);

  // Selection panel (the middle of the bottom strip).
  const selectionPanel = div('panel selection-panel', root);
  const groupTabs = div('group-tabs', selectionPanel);
  const selHead = div('sel-head', selectionPanel);
  const selectionTitle = div('sel-title', selHead, 'Nothing selected');
  const selectionExtra = div('sel-extra', selHead);
  const selectionCorner = div('sel-corner', selHead);
  const selectionBody = div('sel-body', selectionPanel);
  selectionBody.dataset.scroll = '';

  // Command card (bottom right): the fixed 3 rows of 5 and the extra slots round them (applyGeometry adds slots as the card grows).
  const commandCard = div('panel command-card', root);
  const commandSlots: HTMLElement[] = [];
  for (let i = 0; i < 15; i++) commandSlots.push(div('slot', commandCard));

  // The phone's fold buttons: the menu, and the panels that fold away.
  const folds = div('panel folds', root);
  folds.hidden = true;

  // Top right: the stockpile, with Peoples, Allies, Send, Ping and Pause under it.
  const topRight = div('panel top-right', root);
  const topRightButtons = div('top-right-buttons', topRight);
  const stockpile = div('stockpile', topRight);

  // Clock (top centre).
  const clock = div('panel clock', root);
  const clockDay = div('clock-day', clock, 'Day 1');
  const clockTime = div('clock-time', clock, '0:00');
  const clockNote = div('clock-note', clock, '');

  // Debug readout (top left, small): the hash is what testers compare.
  const debug = div('panel debug', root);
  const field = (label: string): HTMLElement => {
    const row = div('dbg-row', debug);
    div('dbg-label', row, label);
    return div('dbg-value', row, '-');
  };
  const debugFields = {
    seed: field('seed'),
    players: field('players'),
    step: field('step'),
    rate: field('steps/s'),
    hash: field('hash'),
    hashStep: field('at step'),
    // How the page runs (Technical decisions 10): frames a second and the frame's own time, draw calls, units, memory.
    fps: field('fps'),
    draws: field('draws'),
    units: field('units'),
    memory: field('memory'),
  };

  panels.register('minimap', minimapPanel);
  panels.register('messages', messagePanel);
  panels.register('portrait', portraitPanel);
  panels.register('selection', selectionPanel);
  panels.register('commands', commandCard);
  panels.register('folds', folds);
  panels.register('top-right', topRight);
  panels.register('clock', clock);
  panels.register('debug', debug);
  // Last, so it is on top of the strip it opens over.
  const tierStrip = div('panel tier-strip', root);
  tierStrip.hidden = true;
  panels.register('tier-strip', tierStrip);

  return {
    root,
    dragBox,
    minimapPanel,
    utilityBar,
    minimapEl,
    messagePanel,
    messageList,
    chat,
    portraitPanel,
    portraitWindow,
    portraitIcon,
    selectionPanel,
    selectionTitle,
    selectionExtra,
    selectionCorner,
    tierStrip,
    selectionBody,
    groupTabs,
    commandCard,
    commandSlots,
    folds,
    topRight,
    topRightButtons,
    stockpile,
    clock,
    clockDay,
    clockTime,
    clockNote,
    debug,
    debugFields,
  };
}

/** Which panels the phone has unfolded. */
export interface Folds {
  map: boolean;
  info: boolean;
  stock: boolean;
  /** The tester's debug readout and tools. */
  debug: boolean;
}

/**
 * Puts the panels where the geometry says: the bottom strip's panels at their
 * left edges (the card from the right) with their own size scaled, the top
 * right block and the clock scaled from their corners, and the card with the
 * rows it needs now. On a phone, folded panels are hidden. Sets the CSS
 * variables the dialogs use to keep clear of the strip and the card.
 */
export function applyGeometry(L: HudLayout, g: HudGeometry, cardRows: number, folds: Folds): void {
  const s = g.scale;
  const place = (el: HTMLElement, left: number | null, right: number | null, bottom: number, w: number, h: number, origin: string): void => {
    const st = el.style;
    st.left = left === null ? '' : `${left}px`;
    st.right = right === null ? '' : `${right}px`;
    st.bottom = `${bottom}px`;
    st.width = `${w / s}px`;
    st.height = `${h / s}px`;
    st.transformOrigin = origin;
    st.transform = s === 1 ? '' : `scale(${s})`;
  };
  const phone = g.phone;
  const lift = phone && g.stacked ? g.card.h : 0;
  L.minimapPanel.hidden = phone && !folds.map;
  L.portraitPanel.hidden = phone && !folds.info;
  L.selectionPanel.hidden = phone && !folds.info;
  L.stockpile.hidden = phone && !folds.stock;
  L.folds.hidden = !phone;
  L.debug.hidden = phone && !folds.debug;
  place(L.minimapPanel, g.minimap.x, null, lift, g.minimap.w, g.minimap.h, '0 100%');
  place(L.portraitPanel, g.portrait.x, null, lift, g.portrait.w, g.portrait.h, '0 100%');
  place(L.selectionPanel, g.middle.x, null, lift, g.middle.w, g.middle.h, '0 100%');
  const rows = Math.max(g.rows, cardRows);
  place(L.commandCard, null, 0, 0, g.card.w, Math.round(cardHeight(rows) * s), '100% 100%');
  setCardGrid(L, g.cols, rows);
  const top = L.topRight.style;
  top.transformOrigin = '100% 0';
  top.transform = s === 1 ? '' : `scale(${s})`;
  // The debug readout is exempt from the layout rules; it only shrinks with everything else.
  const dbg = L.debug.style;
  dbg.transformOrigin = '0 0';
  dbg.transform = s === 1 ? '' : `scale(${phone ? s * 0.8 : s})`;
  // On a phone it sits right of the fold buttons, which keep the left edge.
  dbg.left = phone ? `${g.folds!.w + 4}px` : '';
  const clock = L.clock.style;
  clock.transform = s === 1 ? '' : `translateX(-50%) scale(${s})`;
  clock.transformOrigin = '50% 0';
  if (phone) {
    L.folds.style.width = `${g.folds!.w}px`;
  }
  // For the dialogs and the message panel: where the strip and the card end, screen px.
  const root = L.root.style;
  const stripH = phone ? (folds.map ? g.minimap.h + lift : folds.info ? g.middle.h + lift : 0) : g.minimap.h;
  root.setProperty('--hud-s', String(s));
  root.setProperty('--strip-h', `${stripH}px`);
  root.setProperty('--card-top', `${Math.round(cardHeight(rows) * s)}px`);
  root.setProperty('--strip-left', `${phone ? g.folds!.w : 0}px`);
  root.setProperty('--top-right-h', `${Math.round(L.topRight.offsetHeight * s)}px`);
}

/**
 * The debug readout is exempt from the layout rules, but on a short screen its
 * tools wrapped in a narrow column ran down over the message panel and the
 * buttons beside the minimap. They widen (up to the clock at the top middle)
 * to the first width that ends the readout above the message panel, else as
 * wide as they may go. Measures the page: call on resize and when the tools
 * change.
 */
export function fitDebug(L: HudLayout, g: HudGeometry): void {
  const tools = L.debug.querySelector<HTMLElement>('.dbg-tools');
  if (!tools || g.phone || L.debug.hidden) return;
  const msg = L.messagePanel.getBoundingClientRect();
  const clock = L.clock.getBoundingClientRect();
  const right = clock.width > 0 ? clock.left : window.innerWidth / 2;
  const left = L.debug.getBoundingClientRect().left;
  // The panel's own padding and the readout's sides take about 24 px round the tools.
  const widest = Math.max(200, Math.floor((right - 8 - left) / g.scale) - 24);
  const bottoms: Array<[number, number]> = [];
  for (let w = 200; ; w = Math.min(widest, w + 40)) {
    tools.style.maxWidth = `${w}px`;
    bottoms.push([w, L.debug.getBoundingClientRect().bottom]);
    if (w >= widest) break;
  }
  const w = (msg.height > 0 ? bottoms.find(([, b]) => b <= msg.top - 4)?.[0] : undefined) ?? widest;
  tools.style.maxWidth = `${w}px`;
}

/** Lays the card's slots out on a grid of these columns and rows, adding slots as needed. */
function setCardGrid(L: HudLayout, cols: number, rows: number): void {
  const card = L.commandCard;
  const key = `${cols}x${rows}`;
  if (card.dataset.grid === key) return;
  card.dataset.grid = key;
  card.style.gridTemplateColumns = `repeat(${cols}, var(--card-slot))`;
  card.style.gridTemplateRows = `repeat(${rows}, var(--card-slot))`;
  const cells = cardCells(cols, rows);
  while (L.commandSlots.length < cells.length) {
    const d = document.createElement('div');
    d.className = 'slot extra';
    card.append(d);
    L.commandSlots.push(d);
  }
  L.commandSlots.forEach((el, i) => {
    const c = cells[i];
    el.hidden = c === undefined;
    if (c) {
      el.style.gridRow = String(c[0] + 1);
      el.style.gridColumn = String(c[1] + 1);
    }
  });
}
