// Builds the HUD's DOM: every panel at its place from Controls > Screen layout
// and mouse zones, each registered as a solid rectangle. The shell fills in
// the buttons and the live text.
import type { HudPanels } from './panels.ts';
import { ADDITIONAL_RESOURCES, BAR_RESOURCES, MAIN_RESOURCES } from './resources.ts';

export interface HudLayout {
  root: HTMLElement;
  dragBox: HTMLElement;
  minimapPanel: HTMLElement;
  utilityBar: HTMLElement;
  /** The minimap's drawing area (the Minimap class puts its canvases in it). */
  minimapEl: HTMLElement;
  messagePanel: HTMLElement;
  messageList: HTMLElement;
  selectionPanel: HTMLElement;
  selectionTitle: HTMLElement;
  selectionCorner: HTMLElement;
  selectionBody: HTMLElement;
  commandCard: HTMLElement;
  commandSlots: HTMLElement[];
  topRight: HTMLElement;
  topRightButtons: HTMLElement;
  resourceBar: HTMLElement;
  resourceAll: HTMLElement;
  resourceValues: Map<string, HTMLElement[]>;
  clock: HTMLElement;
  clockDay: HTMLElement;
  clockTime: HTMLElement;
  debug: HTMLElement;
  debugFields: Record<'seed' | 'players' | 'step' | 'rate' | 'hash' | 'hashStep', HTMLElement>;
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
  chat.placeholder = 'Chat with other players comes with multiplayer';
  chat.tabIndex = -1;
  messagePanel.append(chat);

  // Selection panel (bottom centre).
  const selectionPanel = div('panel selection-panel', root);
  const selHead = div('sel-head', selectionPanel);
  const selectionTitle = div('sel-title', selHead, 'Nothing selected');
  const selectionCorner = div('sel-corner', selHead);
  const selectionBody = div('sel-body', selectionPanel);
  selectionBody.dataset.scroll = '';

  // Command card (bottom right): 3 rows of 5.
  const commandCard = div('panel command-card', root);
  const commandSlots: HTMLElement[] = [];
  for (let i = 0; i < 15; i++) commandSlots.push(div('slot', commandCard));

  // Top right: Allies and Send resources, then the resource bar.
  const topRight = div('panel top-right', root);
  const topRightButtons = div('top-right-buttons', topRight);
  const resourceBar = div('resource-bar', topRight);
  const resourceValues = new Map<string, HTMLElement[]>();
  const valueEl = (name: string, parentEl: HTMLElement): HTMLElement => {
    const v = div('res-value', parentEl, '0');
    const list = resourceValues.get(name) ?? [];
    list.push(v);
    resourceValues.set(name, list);
    return v;
  };
  for (const r of BAR_RESOURCES) {
    const cell = div('res', resourceBar);
    cell.title = r.name;
    div('res-name', cell, r.short);
    valueEl(r.name, cell);
  }

  // The expanded resource list: its own panel, under the bar.
  const resourceAll = div('panel resource-all', root);
  resourceAll.hidden = true;
  resourceAll.dataset.scroll = '';
  const section = (title: string, names: readonly string[]): void => {
    div('res-section', resourceAll, title);
    const grid = div('res-grid', resourceAll);
    for (const n of names) {
      const row = div('res-row', grid);
      div('res-name', row, n);
      valueEl(n, row);
    }
  };
  section('Resources', MAIN_RESOURCES);
  section('Additional resources', ADDITIONAL_RESOURCES);

  // Clock (top centre).
  const clock = div('panel clock', root);
  const clockDay = div('clock-day', clock, 'Day 1');
  const clockTime = div('clock-time', clock, '0:00');

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
  };

  panels.register('minimap', minimapPanel);
  panels.register('messages', messagePanel);
  panels.register('selection', selectionPanel);
  panels.register('commands', commandCard);
  panels.register('top-right', topRight);
  panels.register('clock', clock);
  panels.register('debug', debug);
  panels.register('resources-all', resourceAll);

  return {
    root,
    dragBox,
    minimapPanel,
    utilityBar,
    minimapEl,
    messagePanel,
    messageList,
    selectionPanel,
    selectionTitle,
    selectionCorner,
    selectionBody,
    commandCard,
    commandSlots,
    topRight,
    topRightButtons,
    resourceBar,
    resourceAll,
    resourceValues,
    clock,
    clockDay,
    clockTime,
    debug,
    debugFields,
  };
}
