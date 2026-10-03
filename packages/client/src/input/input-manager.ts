// The one place that turns real mouse and keyboard events into game input
// (Controls > Browser requirements; Screen layout and mouse zones).
//
// While playing, the cursor is a virtual position: with the pointer locked it
// moves by movementX/Y and is clamped to the window; unlocked it follows the
// real cursor. Either way the HUD is hit-tested at that position with the
// panel registry and document.elementFromPoint and driven from here (hover,
// tooltips, press, release, double click, right click), so the HUD behaves
// the same locked or not and never depends on DOM click events.
//
// With touch controls on (patch notes 1), fingers drive the same paths: a tap
// is a click (the right click when it gives an order), a hold is a click that
// looks (on a button: its tooltip, and its right click on release), one
// finger dragging pans the camera (or draws the box, or aims), two pinch to
// zoom and pan. The cursor is hidden and never locked.
import { cue } from '../audio/cues.ts';
import type { ButtonPress, ButtonRegistry, HudButton, Tooltip } from '../hud/buttons.ts';
import type { HudPanels, PanelRect } from '../hud/panels.ts';
import type { Pt } from '../hud/rects.ts';
import { isDoubleClick, type ClickRecord } from '../selection/rules.ts';
import type { Settings } from '../settings/settings.ts';
import { VirtualCursor } from './cursor.ts';
import { keyId, MENU_KEYS, shouldBlockKey } from './keys.ts';
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

/** What a touch means here, from the game's side (touch controls, patch notes 1). */
export interface TouchHooks {
  /** Touch controls are on. */
  on(): boolean;
  /** A command waits for its target, or a building, wall chain or dug area is being placed: a tap or drag is the left button's. */
  aiming(): boolean;
  /** A tap here gives an order (the right click) rather than selecting: something of the player's is selected and this is not theirs. */
  orders(p: Pt): boolean;
  /** The Box button is lit: the next one-finger drag draws the selection box, then it goes out (boxed). */
  boxing(): boolean;
  boxed(): void;
  /** A pinch: zoom by this factor (below 1 is closer) round a point. */
  zoom(factor: number, p: Pt): void;
}

/** A finger moving less than this (CSS px) is still a tap or a hold. */
export const TAP_SLOP = 12;
/** A finger held this long without moving is a hold, ms. */
export const HOLD_MS = 480;
/** Mouse events this soon after a touch are the browser's copies of it, ms. */
const TOUCH_ECHO_MS = 800;

interface Finger {
  x: number;
  y: number;
  x0: number;
  y0: number;
}

/** What the fingers on the screen are doing. */
type Gesture =
  | { kind: 'pending'; timer: number }
  | { kind: 'drag'; button: number; box: boolean }
  | { kind: 'pinch'; dist: number }
  | { kind: 'hud'; timer: number; btn: HudButton | null; area: boolean; scroll: HTMLElement | null; wheel: string | null; held: boolean; moved: boolean }
  | { kind: 'done' };

export interface InputHooks {
  /** The game view (everything not under a HUD panel). */
  game: MouseTarget;
  /** Touch controls (patch notes 1); without them a touch is the browser's mouse emulation. */
  touch?: TouchHooks;
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
  private readonly wheels = new Map<string, (dy: number) => void>();
  private hoverBtn: HudButton | null = null;
  private hoverPanel: HTMLElement | null = null;
  private lastButtonClick: (ClickRecord & { id: string }) | null = null;
  private lastMods: Mods = { shift: false, ctrl: false, alt: false };
  private readonly fingers = new Map<number, Finger>();
  private gesture: Gesture | null = null;
  private lastTouchAt = -Infinity;

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
    window.addEventListener('pointerdown', (e) => this.onTouchDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onTouchUp(e, false), { passive: false });
    window.addEventListener('pointercancel', (e) => this.onTouchUp(e, true), { passive: false });
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

  /** Sends the wheel over an element inside a panel to a handler of its own (the inventory scrolls by rows); the element gets data-wheel. */
  addWheel(id: string, el: HTMLElement, onWheel: (dy: number) => void): void {
    el.dataset.wheel = id;
    this.wheels.set(id, onWheel);
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const playing = mode === 'game';
    document.body.classList.toggle('playing', playing);
    this.syncTouch();
    this.cursor.show(playing && this.inWindow && !this.touchOn());
    if (!playing) {
      this.releaseAll();
      this.setHover(null, null);
      if (this.locked) document.exitPointerLock();
    }
  }

  /** Whether touch controls are on now. */
  touchOn(): boolean {
    return this.hooks.touch?.on() === true;
  }

  /** Brings the page in line with the touch setting: no browser gestures over the game, no drawn cursor. */
  syncTouch(): void {
    const on = this.touchOn();
    document.body.classList.toggle('touch', on);
    if (on && this.mode === 'game') {
      this.cursor.show(false);
      this.releaseLock();
    }
  }

  /** Asks for the pointer lock if the setting is on; needs a user gesture, and the browser may refuse. */
  requestLock(): void {
    if (!this.settings.cursorLock || this.locked || this.mode !== 'game' || this.touchOn()) return;
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
      this.cursor.show(this.mode === 'game' && !this.touchOn());
    }
  }

  /** The browser's mouse copy of a touch just handled as one. */
  private touchEcho(): boolean {
    return performance.now() - this.lastTouchAt < TOUCH_ECHO_MS;
  }

  private onMove(e: MouseEvent): void {
    if (this.touchEcho()) return;
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
    if (!this.moveCaptures(mods)) this.hover(mods);
  }

  /** Moves whatever holds a press to the current position; false when nothing does. */
  private moveCaptures(mods: Mods): boolean {
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
      return true;
    }
    return false;
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
    if (this.mode !== 'game' || this.touchEcho()) return;
    e.preventDefault(); // no text selection, focus change or middle-button autoscroll
    if (!this.locked) this.track(e);
    if (!this.locked && this.settings.cursorLock) this.requestLock();
    const mods = this.modsOf(e);
    let button = e.button;
    // On a Mac, Ctrl + click is the system's right click.
    if (IS_MAC && button === Btn.Left && e.ctrlKey) button = Btn.Right;
    this.pressAt(button, mods);
  }

  /** A press of a button at the current position: the game view, an area, a HUD button or the panel under it. */
  private pressAt(button: number, mods: Mods): void {
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
    if (this.mode !== 'game' || this.touchEcho()) return;
    if (!this.locked) this.track(e);
    const mods = this.modsOf(e);
    let button = e.button;
    if (IS_MAC && button === Btn.Left && !this.captures.has(Btn.Left) && this.captures.has(Btn.Right)) button = Btn.Right;
    if (this.releaseAt(button, mods)) this.hover(mods);
  }

  /** Lets go of a button at the current position; true when nothing is held after it. */
  private releaseAt(button: number, mods: Mods): boolean {
    const c = this.captures.get(button);
    if (!c) return false;
    this.captures.delete(button);
    if (c.kind === 'game') this.hooks.game.up(button, this.pos, mods);
    else if (c.kind === 'area') c.target.up(button, this.pos, mods);
    else if (c.kind === 'button') {
      c.btn.el.classList.remove('pressed');
      if (this.buttonAt(this.pos) === c.btn && c.btn.enabled) this.activate(c.btn, { shift: mods.shift, ctrl: mods.ctrl });
    }
    return this.captures.size === 0;
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
    if (this.mode !== 'game' || this.touchEcho()) return;
    e.preventDefault(); // no page scroll or browser zoom over the game
    const mods = this.modsOf(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (this.panels.at(this.pos)) {
      // Scrollable HUD lists scroll by hand, since the event target is meaningless under pointer lock.
      const under = document.elementFromPoint(this.pos.x, this.pos.y);
      const own = under?.closest<HTMLElement>('[data-wheel]');
      if (own) {
        this.wheels.get(own.dataset.wheel!)?.(dy);
        this.refreshHover();
        return;
      }
      const el = under?.closest<HTMLElement>('[data-scroll]');
      if (el) el.scrollTop += dy;
      return;
    }
    this.hooks.game.wheel?.(this.pos, dy, mods);
  }

  // ---- Touch (touch controls on) ----

  /** A touch this manager takes: a finger, while playing with touch controls on, not on a text field (which keeps its own keyboard). */
  private ownTouch(e: PointerEvent): boolean {
    if (e.pointerType !== 'touch' || this.mode !== 'game' || !this.touchOn()) return false;
    if (isTextField(e.target as Element)) return false;
    e.preventDefault();
    this.lastTouchAt = performance.now();
    return true;
  }

  private setPos(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.clampPos();
    this.inWindow = true;
  }

  private readonly noMods: Mods = { shift: false, ctrl: false, alt: false };

  private onTouchDown(e: PointerEvent): void {
    if (!this.ownTouch(e)) return;
    const f: Finger = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    this.fingers.set(e.pointerId, f);
    if (this.fingers.size === 1) {
      this.tooltip.show(null);
      this.startTouch(f);
    } else if (this.fingers.size === 2) this.startPinch();
  }

  /** One finger down: on the HUD a press that waits to be a tap, a hold or a scroll; on the game view one that waits to be a tap, a hold or a drag. */
  private startTouch(f: Finger): void {
    this.setPos(f.x, f.y);
    this.lastMods = this.noMods;
    const panel = this.panels.at(this.pos);
    if (!panel) {
      this.hooks.game.move(this.pos, this.noMods);
      this.gesture = { kind: 'pending', timer: window.setTimeout(() => this.holdGame(), HOLD_MS) };
      return;
    }
    const el = document.elementFromPoint(this.pos.x, this.pos.y);
    const area = el?.closest<HTMLElement>('[data-area]') ?? null;
    const btn = area ? null : this.buttons.fromElement(el);
    btn?.el.classList.add('pressed');
    // An area (the minimap) takes the press at once: the camera jumps where the finger lands.
    if (area) this.pressAt(Btn.Left, this.noMods);
    this.gesture = {
      kind: 'hud',
      timer: window.setTimeout(() => this.holdHud(), HOLD_MS),
      btn,
      area: area !== null,
      scroll: el?.closest<HTMLElement>('[data-scroll]') ?? null,
      wheel: el?.closest<HTMLElement>('[data-wheel]')?.dataset.wheel ?? null,
      held: false,
      moved: false,
    };
  }

  /** A hold on the game view: a left click, which selects or looks at whatever is there (an enemy's too). */
  private holdGame(): void {
    if (this.gesture?.kind !== 'pending') return;
    this.gesture = { kind: 'done' };
    navigator.vibrate?.(12);
    this.click(Btn.Left);
  }

  /** A hold on the HUD: the button's tooltip (its right click comes on release); on the minimap, the right click there. */
  private holdHud(): void {
    const g = this.gesture;
    if (g?.kind !== 'hud' || g.moved) return;
    g.held = true;
    navigator.vibrate?.(12);
    if (g.area) {
      this.click(Btn.Right);
      return;
    }
    this.setHover(g.btn, null);
  }

  /** Two fingers: a pinch, which also pans with their middle. A one-finger pan becomes one; a box or an aim keeps going. */
  private startPinch(): void {
    const g = this.gesture;
    if (g?.kind === 'pending') window.clearTimeout(g.timer);
    else if (g?.kind === 'drag' && g.button === Btn.Middle) this.releaseAt(Btn.Middle, this.noMods);
    else if (g !== null) return;
    const [a, b] = [...this.fingers.values()];
    this.setPos((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    this.pressAt(Btn.Middle, this.noMods);
    this.gesture = { kind: 'pinch', dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)) };
  }

  private onTouchMove(e: PointerEvent): void {
    const f = this.fingers.get(e.pointerId);
    if (!f || !this.ownTouch(e)) return;
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    const g = this.gesture;
    if (!g) return;
    const far = Math.hypot(f.x - f.x0, f.y - f.y0) > TAP_SLOP;
    if (g.kind === 'pending') {
      if (!far) return;
      window.clearTimeout(g.timer);
      // A drag: it aims while a command or a placement waits, draws the box when Box is lit, else pans.
      const t = this.hooks.touch!;
      const aim = t.aiming();
      const box = !aim && t.boxing();
      const button = aim || box ? Btn.Left : Btn.Middle;
      this.setPos(f.x0, f.y0);
      this.pressAt(button, this.noMods);
      this.gesture = { kind: 'drag', button, box };
      this.setPos(f.x, f.y);
      this.moveCaptures(this.noMods);
      return;
    }
    if (g.kind === 'drag') {
      this.setPos(f.x, f.y);
      this.moveCaptures(this.noMods);
      return;
    }
    if (g.kind === 'pinch') {
      const [a, b] = [...this.fingers.values()];
      if (!a || !b) return;
      this.setPos((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.moveCaptures(this.noMods);
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const factor = g.dist / dist;
      if (Math.abs(1 - factor) > 0.002) {
        this.hooks.touch!.zoom(factor, this.pos);
        g.dist = dist;
      }
      return;
    }
    if (g.kind === 'hud') {
      if (g.area) {
        this.setPos(f.x, f.y);
        this.moveCaptures(this.noMods);
        return;
      }
      if (!g.moved && far) {
        g.moved = true;
        window.clearTimeout(g.timer);
        g.btn?.el.classList.remove('pressed');
      }
      if (!g.moved) return;
      // A drag on a list scrolls it, the way the wheel would.
      if (g.wheel) this.wheels.get(g.wheel)?.(-dy * 2);
      else if (g.scroll) g.scroll.scrollTop -= dy;
      void dx;
    }
  }

  private onTouchUp(e: PointerEvent, cancelled: boolean): void {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    this.fingers.delete(e.pointerId);
    if (e.pointerType === 'touch' && this.mode === 'game') {
      e.preventDefault();
      this.lastTouchAt = performance.now();
    }
    const g = this.gesture;
    if (g?.kind === 'pending') {
      window.clearTimeout(g.timer);
      this.gesture = { kind: 'done' };
      if (!cancelled) {
        // A tap: it aims, gives an order, or selects.
        const t = this.hooks.touch;
        this.setPos(f.x, f.y);
        const order = t !== undefined && !t.aiming() && t.orders(this.pos);
        this.click(order ? Btn.Right : Btn.Left);
      }
    } else if (g?.kind === 'drag') {
      this.setPos(f.x, f.y);
      this.releaseAt(g.button, this.noMods);
      if (g.box) this.hooks.touch?.boxed();
      this.gesture = { kind: 'done' };
    } else if (g?.kind === 'pinch') {
      this.releaseAt(Btn.Middle, this.noMods);
      this.gesture = { kind: 'done' };
    } else if (g?.kind === 'hud') {
      window.clearTimeout(g.timer);
      g.btn?.el.classList.remove('pressed');
      this.gesture = { kind: 'done' };
      if (g.area) {
        this.setPos(f.x, f.y);
        this.releaseAt(Btn.Left, this.noMods);
      } else if (!cancelled && !g.moved) {
        this.setPos(f.x, f.y);
        if (g.held) {
          // Hold and let go: the button's right click, where it has one (save a group, cross out a food).
          if (g.btn?.enabled && this.buttonAt(this.pos) === g.btn) g.btn.def.onRightClick?.({ shift: false, ctrl: false });
        } else this.click(Btn.Left);
      }
      // The tooltip of a hold stays up until the next touch; a tap leaves none.
      if (!g.held) this.setHover(null, null);
    }
    if (this.fingers.size === 0) {
      this.gesture = null;
      if (this.captures.size === 0) this.hooks.game.move(this.pos, this.noMods);
    }
  }

  /** A press and release of a button where the finger is. */
  private click(button: number): void {
    this.pressAt(button, this.noMods);
    this.releaseAt(button, this.noMods);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const field = isTextField(document.activeElement);
    if (this.mode !== 'off' && shouldBlockKey(e, field) && !(this.mode === 'menu' && MENU_KEYS.has(e.code))) e.preventDefault();
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
    const g = this.gesture;
    if (g?.kind === 'pending' || g?.kind === 'hud') window.clearTimeout(g.timer);
    this.gesture = null;
    this.fingers.clear();
    this.lastMods = { shift: false, ctrl: false, alt: false };
    for (const [button, c] of [...this.captures]) {
      this.captures.delete(button);
      if (c.kind === 'game') this.hooks.game.up(button, this.pos, this.lastMods);
      else if (c.kind === 'area') c.target.up(button, this.pos, this.lastMods);
      else if (c.kind === 'button') c.btn.el.classList.remove('pressed');
    }
  }
}
