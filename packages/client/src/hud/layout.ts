// Builds the HUD's DOM: every panel at its place from Controls > Screen layout
// and mouse zones, each registered as a solid rectangle. The shell fills in
// the buttons and the live text.
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
  selectionPanel: HTMLElement;
  selectionTitle: HTMLElement;
  selectionCorner: HTMLElement;
  selectionBody: HTMLElement;
  groupTabs: HTMLElement;
  commandCard: HTMLElement;
  commandSlots: HTMLElement[];
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

  // Selection panel (bottom centre).
  const selectionPanel = div('panel selection-panel', root);
  const groupTabs = div('group-tabs', selectionPanel);
  const selHead = div('sel-head', selectionPanel);
  const selectionTitle = div('sel-title', selHead, 'Nothing selected');
  const selectionCorner = div('sel-corner', selHead);
  const selectionBody = div('sel-body', selectionPanel);
  selectionBody.dataset.scroll = '';

  // Command card (bottom right): 3 rows of 5.
  const commandCard = div('panel command-card', root);
  const commandSlots: HTMLElement[] = [];
  for (let i = 0; i < 15; i++) commandSlots.push(div('slot', commandCard));

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
  panels.register('selection', selectionPanel);
  panels.register('commands', commandCard);
  panels.register('top-right', topRight);
  panels.register('clock', clock);
  panels.register('debug', debug);

  return {
    root,
    dragBox,
    minimapPanel,
    utilityBar,
    minimapEl,
    messagePanel,
    messageList,
    chat,
    selectionPanel,
    selectionTitle,
    selectionCorner,
    selectionBody,
    groupTabs,
    commandCard,
    commandSlots,
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
