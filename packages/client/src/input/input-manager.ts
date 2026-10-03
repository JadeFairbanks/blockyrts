// The one place that turns real mouse and keyboard events into game input
// (Controls > Browser requirements; Screen layout and mouse zones).
//
// While playing, the cursor is a virtual position: with the pointer locked it
// moves by movementX/Y and is clamped to the window; unlocked it follows the
// real cursor. Either way the HUD is hit-tested at that position with the
// panel registry and document.elementFromPoint and driven from here (hover,
// tooltips, press, release, double click, right click), so the HUD behaves
// the same locked or not and never depends on DOM click events.
import { cue } from '../audio/cues.ts';
import type { ButtonPress, ButtonRegistry, HudButton, Tooltip } from '../hud/buttons.ts';
import type { HudPanels, PanelRect } from '../hud/panels.ts';
import type { Pt } from '../hud/rects.ts';
import { isDoubleClick, type ClickRecord } from '../selection/rules.ts';
import type { Settings } from '../settings/settings.ts';
import { VirtualCursor } from './cursor.ts';
import { keyId, shouldBlockKey } from './keys.ts';
import { IS_MAC } from './platform.ts';

export interface Mods {
  shift: boolean;
  /** Ctrl, or Cmd on a Mac (the doc's "Ctrl + click"). */
  ctrl: boolean;
  alt: boolean;
}

/** Mouse button numbers as in MouseEvent.button. */
export const Btn = { Left: 0, Middle: 1, Right: 2 } as const;

/** Mouse input for one area: the game view, or an interactive part of a panel such as the minimap. */
export interface MouseTarget {
  down(button: number, p: Pt, mods: Mods): void;
  move(p: Pt, mods: Mods): void;
  up(button: number, p: Pt, mods: Mods): void;
  wheel?(p: Pt, deltaY: number, mods: Mods): void;
}

export interface InputHooks {
  /** The game view (everything not under a HUD panel). */
  game: MouseTarget;
  /** A press landed on a HUD panel, before any button or area there handles it. */
  hudPress(panel: PanelRect, button: number, area: string | null): void;
  keyDown(id: string, ev: KeyboardEvent): void;
  keyUp(id: string, ev: KeyboardEvent): void;
}

/** 'off' before a game (start screen), 'menu' while a menu or dialogue is open: the real cursor and native DOM events rule. */
export type InputMode = 'off' | 'game' | 'menu';

type Capture = { kind: 'game' } | { kind: 'area'; target: MouseTarget } | { kind: 'button'; btn: HudButton } | { kind: 'hud' };

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

export class InputManager {
  readonly cursor: VirtualCursor;
  /** The virtual cursor position, CSS pixels. */
  readonly pos: Pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  mode: InputMode = 'off';
  locked = false;
  /** False while an unlocked cursor is outside the window. */
  inWindow = true;
  private readonly heldCodes = new Map<string, string>(); // code -> binding name
  private readonly captures = new Map<number, Capture>();
  private readonly areas = new Map<string, MouseTarget>();
  private hoverBtn: HudButton | null = null;
  private hoverPanel: HTMLElement | null = null;
  private lastButtonClick: (ClickRecord & { id: string }) | null = null;
  private lastMods: Mods = { shift: false, ctrl: false, alt: false };

  constructor(
    private readonly hooks: InputHooks,
    private readonly panels: HudPanels,
    private readonly buttons: ButtonRegistry,
    private readonly tooltip: Tooltip,
    private readonly settings: Settings,
    root: HTMLElement,
  ) {
    this.cursor = new VirtualCursor(root);
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('auxclick', (e) => {
      if (this.mode === 'game') e.preventDefault();
    });
    window.addEventListener('contextmenu', (e) => {
      // No context menu anywhere over the game; text fields keep theirs for paste.
      if (!isTextField(e.target as Element)) e.preventDefault();
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('mouseout', (e) => {
      if (!this.locked && e.relatedTarget === null) {
        this.inWindow = false;
        this.cursor.show(false);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === document.body;
      if (this.locked) this.inWindow = true;
    });
    window.addEventListener('resize', () => this.clampPos());
  }

  /** Registers an interactive area inside a panel (the minimap canvas); the element gets data-area. */
  addArea(id: string, el: HTMLElement, target: MouseTarget): void {
    el.dataset.area = id;
    this.areas.set(id, target);
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const playing = mode === 'game';
    document.body.classList.toggle('playing', playing);
    this.cursor.show(playing && this.inWindow);
    if (!playing) {
      this.releaseAll();
      this.setHover(null, null);
      if (this.locked) document.exitPointerLock();
    }
  }

  /** Asks for the pointer lock if the setting is on; needs a user gesture, and the browser may refuse. */
  requestLock(): void {
    if (!this.settings.cursorLock || this.locked || this.mode !== 'game') return;
    try {
      const r = document.body.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      // Not supported or refused (Chrome refuses for about a second after Esc): the next click tries again.
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Whether a key is held, by binding name (see keyId) or physical code. */
  held(id: string): boolean {
    if (this.heldCodes.has(id)) return true;
    for (const v of this.heldCodes.values()) if (v === id) return true;
    return false;
  }

  mods(): Mods {
    return this.lastMods;
  }

  /** Whether a mouse button's press is being tracked by the game view (a box drag or middle drag). */
  gameCaptured(button: number): boolean {
    return this.captures.get(button)?.kind === 'game';
  }

  private modsOf(e: MouseEvent | KeyboardEvent): Mods {
    this.lastMods = { shift: e.shiftKey, ctrl: IS_MAC ? e.metaKey : e.ctrlKey, alt: e.altKey };
    return this.lastMods;
  }

  private clampPos(): void {
    this.pos.x = Math.min(Math.max(this.pos.x, 0), window.innerWidth - 1);
    this.pos.y = Math.min(Math.max(this.pos.y, 0), window.innerHeight - 1);
    this.cursor.moveTo(this.pos.x, this.pos.y);
  }

  private track(e: MouseEvent): void {
    if (this.locked) {
      // Some browsers report one huge jump right after the lock is taken; no real mouse moves that far in one event.
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.pos.x += e.movementX;
      this.pos.y += e.movementY;
    } else {
      this.pos.x = e.clientX;
      this.pos.y = e.clientY;
    }
    this.clampPos();
    if (!this.inWindow) {
      this.inWindow = true;
      this.cursor.show(this.mode === 'game');
    }
  }

  private onMove(e: MouseEvent): void {
    if (this.mode !== 'game') {
      // Outside play, remember where the real cursor is, so the game's cursor starts there.
      if (!this.locked) {
        this.pos.x = e.clientX;
        this.pos.y = e.clientY;
      }
      return;
    }
    this.track(e);
    const mods = this.modsOf(e);
    if (this.captures.size > 0) {
      const sent = new Set<unknown>();
      for (const c of this.captures.values()) {
        if (c.kind === 'game' && !sent.has('game')) {
          sent.add('game');
          this.hooks.game.move(this.pos, mods);
        } else if (c.kind === 'area' && !sent.has(c.target)) {
          sent.add(c.target);
          c.target.move(this.pos, mods);
        } else if (c.kind === 'button') {
          c.btn.el.classList.toggle('pressed', this.buttonAt(this.pos) === c.btn);
        }
      }
      return;
    }
    this.hover(mods);
  }

  /** Hover: the game view gets moves for its highlight; HUD buttons light up and show their tooltip. */
  private hover(mods: Mods): void {
    const panel = this.panels.at(this.pos);
    if (!panel) {
      this.setHover(null, null);
      this.hooks.game.move(this.pos, mods);
      return;
    }
    const el = document.elementFromPoint(this.pos.x, this.pos.y);
    const btn = this.buttons.fromElement(el);
    this.setHover(btn, panel.el);
    const area = el?.closest<HTMLElement>('[data-area]');
    if (area) this.areas.get(area.dataset.area!)?.move(this.pos, mods);
  }

  private setHover(btn: HudButton | null, panel: HTMLElement | null): void {
    if (btn !== this.hoverBtn) {
      this.hoverBtn?.el.classList.remove('hover');
      btn?.el.classList.add('hover');
      this.hoverBtn = btn;
    }
    this.tooltip.show(btn);
    if (panel !== this.hoverPanel) {
      this.hoverPanel?.classList.remove('hover');
      panel?.classList.add('hover');
      this.hoverPanel = panel;
    }
  }

  /** Re-runs hover at the current position, e.g. after the HUD changed under a still cursor. */
  refreshHover(): void {
    if (this.mode === 'game' && this.captures.size === 0 && this.inWindow) this.hover(this.lastMods);
  }

  private buttonAt(p: Pt): HudButton | null {
    if (!this.panels.at(p)) return null;
    return this.buttons.fromElement(document.elementFromPoint(p.x, p.y));
  }

  private onDown(e: MouseEvent): void {
    if (this.mode !== 'game') return;
    e.preventDefault(); // no text selection, focus change or middle-button autoscroll
    if (!this.locked) this.track(e);
    if (!this.locked && this.settings.cursorLock) this.requestLock();
    const mods = this.modsOf(e);
    let button = e.button;
    // On a Mac, Ctrl + click is the system's right click.
    if (IS_MAC && button === Btn.Left && e.ctrlKey) button = Btn.Right;
    if (this.captures.has(button)) return;

    const panel = this.panels.at(this.pos);
    if (!panel) {
      this.captures.set(button, { kind: 'game' });
      this.hooks.game.down(button, this.pos, mods);
      return;
    }
    const el = document.elementFromPoint(this.pos.x, this.pos.y);
    const areaEl = el?.closest<HTMLElement>('[data-area]') ?? null;
    const areaId = areaEl?.dataset.area ?? null;
    this.hooks.hudPress(panel, button, areaId);
    const area = areaId ? this.areas.get(areaId) : undefined;
    if (area) {
      this.captures.set(button, { kind: 'area', target: area });
      area.down(button, this.pos, mods);
      return;
    }
    const btn = this.buttons.fromElement(el);
    const press: ButtonPress = { shift: mods.shift, ctrl: mods.ctrl };
    if (btn && button === Btn.Left) {
      btn.el.classList.add('pressed');
      this.captures.set(button, { kind: 'button', btn });
      return;
    }
    if (btn && button === Btn.Right && btn.enabled) btn.def.onRightClick?.(press);
    this.captures.set(button, { kind: 'hud' }); // swallowed by the panel
  }

  private onUp(e: MouseEvent): void {
    if (this.mode !== 'game') return;
    if (!this.locked) this.track(e);
    const mods = this.modsOf(e);
    let button = e.button;
    if (IS_MAC && button === Btn.Left && !this.captures.has(Btn.Left) && this.captures.has(Btn.Right)) button = Btn.Right;
    const c = this.captures.get(button);
    if (!c) return;
    this.captures.delete(button);
    if (c.kind === 'game') this.hooks.game.up(button, this.pos, mods);
    else if (c.kind === 'area') c.target.up(button, this.pos, mods);
    else if (c.kind === 'button') {
      c.btn.el.classList.remove('pressed');
      if (this.buttonAt(this.pos) === c.btn && c.btn.enabled) this.activate(c.btn, { shift: mods.shift, ctrl: mods.ctrl });
    }
    if (this.captures.size === 0) this.hover(mods);
  }

  private activate(btn: HudButton, press: ButtonPress): void {
    const now: ClickRecord & { id: string } = { t: performance.now(), x: this.pos.x, y: this.pos.y, id: btn.def.id };
    const prev = this.lastButtonClick?.id === btn.def.id ? this.lastButtonClick : null;
    const dbl = isDoubleClick(prev, now);
    this.lastButtonClick = dbl ? null : now;
    cue('ui_click');
    if (dbl && btn.def.onDoubleClick) btn.def.onDoubleClick(press);
    else btn.def.onPress?.(press);
  }

  /** A button pressed by its hotkey: the same as clicking it. */
  pressButton(btn: HudButton, press: ButtonPress): void {
    if (!btn.enabled) return;
    cue('ui_click');
    btn.def.onPress?.(press);
  }

  private onWheel(e: WheelEvent): void {
    if (this.mode !== 'game') return;
    e.preventDefault(); // no page scroll or browser zoom over the game
    const mods = this.modsOf(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (this.panels.at(this.pos)) {
      // Scrollable HUD lists scroll by hand, since the event target is meaningless under pointer lock.
      const el = document.elementFromPoint(this.pos.x, this.pos.y)?.closest<HTMLElement>('[data-scroll]');
      if (el) el.scrollTop += dy;
      return;
    }
    this.hooks.game.wheel?.(this.pos, dy, mods);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const field = isTextField(document.activeElement);
    if (this.mode !== 'off' && shouldBlockKey(e, field)) e.preventDefault();
    this.modsOf(e);
    if (field || this.mode === 'off') return;
    const id = keyId(e);
    this.heldCodes.set(e.code, id);
    this.hooks.keyDown(id, e);
  }

  private onKeyUp(e: KeyboardEvent): void {
    const field = isTextField(document.activeElement);
    if (this.mode !== 'off' && shouldBlockKey(e, field)) e.preventDefault();
    this.modsOf(e);
    const id = this.heldCodes.get(e.code) ?? keyId(e);
    this.heldCodes.delete(e.code);
    if (this.mode !== 'off') this.hooks.keyUp(id, e);
  }

  /** Lets go of everything: held keys, and any press in progress ends where the cursor is. */
  private releaseAll(): void {
    this.heldCodes.clear();
    this.lastMods = { shift: false, ctrl: false, alt: false };
    for (const [button, c] of [...this.captures]) {
      this.captures.delete(button);
      if (c.kind === 'game') this.hooks.game.up(button, this.pos, this.lastMods);
      else if (c.kind === 'area') c.target.up(button, this.pos, this.lastMods);
      else if (c.kind === 'button') c.btn.el.classList.remove('pressed');
    }
  }
}
