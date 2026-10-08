// The game's own cursor: a small DOM element at the virtual cursor position.
// With the pointer locked the system cursor is gone, so the game draws one;
// it is drawn unlocked too, so pan arrows and targeting reticles look the same.

export type CursorShape =
  | { kind: 'arrow' }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'target'; colour: string };

const ARROW_SVG =
  '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2 L2 19 L6.4 15 L9.6 21.6 L12.4 20.4 L9.3 14 L15 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const PAN_SVG =
  '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 9 L16 9 L16 3 L26 14 L16 25 L16 19 L4 19 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const targetSvg = (c: string): string =>
  `<svg width="30" height="30" viewBox="0 0 30 30"><g fill="none" stroke="#111" stroke-width="3.5"><circle cx="15" cy="15" r="9"/><path d="M15 1v8M15 21v8M1 15h8M21 15h8"/></g><g fill="none" stroke="${c}" stroke-width="1.8"><circle cx="15" cy="15" r="9"/><path d="M15 1v8M15 21v8M1 15h8M21 15h8"/></g></svg>`;

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
    const key = s.kind === 'pan' ? `pan:${s.dx},${s.dy}` : s.kind === 'target' ? `target:${s.colour}` : 'arrow';
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
