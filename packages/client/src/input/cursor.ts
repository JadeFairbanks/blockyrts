// The game's own cursor: a small DOM element at the virtual cursor position.
// With the pointer locked the system cursor is gone, so the game draws one;
// it is drawn unlocked too, so pan arrows and targeting reticles look the same.

/** The tools a targeted command's cursor can be (Jade's Patch 5, CT-1): Gather's axe, Hunt's spear, Repair's hammer, the woodsman's rod (Fish) and berries (Forage). */
export type ToolCursor = 'axe' | 'spear' | 'hammer' | 'rod' | 'berries';

export type CursorShape =
  | { kind: 'arrow' }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'target'; colour: string }
  | { kind: 'tool'; tool: ToolCursor };

const ARROW_SVG =
  '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2 L2 19 L6.4 15 L9.6 21.6 L12.4 20.4 L9.3 14 L15 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const PAN_SVG =
  '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 9 L16 9 L16 3 L26 14 L16 25 L16 19 L4 19 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const targetSvg = (c: string): string =>
  `<svg width="30" height="30" viewBox="0 0 30 30"><g fill="none" stroke="#111" stroke-width="3.5"><circle cx="15" cy="15" r="9"/><path d="M15 1v8M15 21v8M1 15h8M21 15h8"/></g><g fill="none" stroke="${c}" stroke-width="1.8"><circle cx="15" cy="15" r="9"/><path d="M15 1v8M15 21v8M1 15h8M21 15h8"/></g></svg>`;

// The tools: a wooden handle running down to the bottom right, the iron at the top left, where the click lands (s).
const HANDLE = (x0: number, y0: number): string =>
  `<path d="M${x0} ${y0}L24 24" stroke="#111" stroke-width="5" stroke-linecap="round"/><path d="M${x0} ${y0}L24 24" stroke="#c8a36a" stroke-width="2.4" stroke-linecap="round"/>`;
const TOOLS: Record<ToolCursor, { svg: string; hx: number; hy: number }> = {
  axe: { svg: `${HANDLE(8, 8)}<path d="M2 6 L6 2 L10 3 L13 8 L8 13 L3 10 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`, hx: 3, hy: 3 },
  spear: { svg: `${HANDLE(8, 8)}<path d="M1.5 1.5 L12 5 L9 9 L5 12 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`, hx: 2, hy: 2 },
  hammer: { svg: `${HANDLE(10, 10)}<path d="M2 8 L8 2 L15 9 L9 15 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`, hx: 5, hy: 5 },
  // A rod, its line hanging from the tip to a hook where the click lands.
  rod: {
    svg: `${HANDLE(9, 4)}<path d="M9 4 L4 4 L4 13" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 4 L4 4 L4 13" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13 Q4 16 6.5 15.5 L7 13.5" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M4 13 Q4 16 6.5 15.5 L7 13.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
    hx: 5,
    hy: 15,
  },
  // A sprig of berries on a green stalk: three dark berries at the top left.
  berries: {
    svg: `<path d="M8 8 L22 22" stroke="#111" stroke-width="4.5" stroke-linecap="round"/><path d="M8 8 L22 22" stroke="#5a8a3a" stroke-width="2" stroke-linecap="round"/><path d="M14 14 Q20 9 22 12 Q18 17 14 14 Z" fill="#6aa04a" stroke="#111" stroke-width="1.2"/><circle cx="5" cy="5" r="3.2" fill="#3a2a5a" stroke="#111" stroke-width="1.3"/><circle cx="10.5" cy="4" r="2.8" fill="#4a3070" stroke="#111" stroke-width="1.3"/><circle cx="4.5" cy="10.5" r="2.8" fill="#4a3070" stroke="#111" stroke-width="1.3"/><circle cx="4" cy="4" r="0.9" fill="#fff"/>`,
    hx: 5,
    hy: 5,
  },
};

export class VirtualCursor {
  readonly el: HTMLElement;
  private shapeKey = '';
  /** Hotspot offset inside the drawing. */
  private hx = 2;
  private hy = 2;
  private extra = '';
  private x = 0;
  private y = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'cursor';
    this.el.hidden = true;
    parent.append(this.el);
    this.setShape({ kind: 'arrow' });
  }

  setShape(s: CursorShape): void {
    const key = s.kind === 'pan' ? `pan:${s.dx},${s.dy}` : s.kind === 'target' ? `target:${s.colour}` : s.kind === 'tool' ? `tool:${s.tool}` : 'arrow';
    if (key === this.shapeKey) return;
    this.shapeKey = key;
    this.el.dataset.shape = s.kind;
    if (s.kind === 'arrow') {
      this.el.innerHTML = ARROW_SVG;
      this.hx = 2;
      this.hy = 2;
      this.extra = '';
    } else if (s.kind === 'pan') {
      this.el.innerHTML = PAN_SVG;
      // Keep the arrow inside the window: draw it a little in from the edge it points at.
      const len = Math.hypot(s.dx, s.dy) || 1;
      this.hx = 14 + (s.dx / len) * 12;
      this.hy = 14 + (s.dy / len) * 12;
      this.extra = ` rotate(${Math.atan2(s.dy, s.dx)}rad)`;
    } else if (s.kind === 'tool') {
      const t = TOOLS[s.tool];
      this.el.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none">${t.svg}</svg>`;
      this.hx = t.hx;
      this.hy = t.hy;
      this.extra = '';
    } else {
      this.el.innerHTML = targetSvg(s.colour);
      this.hx = 15;
      this.hy = 15;
      this.extra = '';
    }
    this.place();
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.place();
  }

  show(on: boolean): void {
    if (this.el.hidden !== !on) this.el.hidden = !on;
  }

  private place(): void {
    // Rotation about the drawing's centre, then the hotspot onto the point.
    this.el.style.transform = `translate(${this.x - this.hx}px, ${this.y - this.hy}px)${this.extra}`;
  }
}
