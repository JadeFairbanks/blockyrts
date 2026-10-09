// The marks over the world (Jade's Patch 5): one canvas over the game view
// for each unit's and building's bar stack (UI-9 health and mana, UI-18
// progress), the stars over other players' things (UI-12 with decisions 2.1)
// and the damage numbers (UI-10). Each thing has one stack, so no two of its
// bars ever overlap: health on top, mana right below it, then each progress
// bar, and the star above them all. Speech bubbles sit over the stack.
//
// Other parts of the HUD add their own progress bars to a stack through
// `extra` (the farm's boost, the Tavern, and so on); this draws them in turn.
import { buildingSpec, type HitEvent } from '@blockyrts/sim';
import { S, type BuildingInfo } from '../messages.ts';
import type { Selectable } from '../selection/types.ts';

/** A bar at or above this share of full is not drawn (Jade, UI-9: over 95%). */
export const BAR_HIDE_ABOVE = 0.95;
/** A unit's bar, metres wide; a building's is part of its width, between these (s). */
export const UNIT_BAR_M = 0.8;
export const BUILDING_BAR_SHARE = 0.55;
export const BUILDING_BAR_MIN_M = 1.4;
export const BUILDING_BAR_MAX_M = 3.6;
/** A bar's thickness, metres, and the screen sizes bars keep to however far the camera is zoomed (s). */
export const BAR_H_M = 0.1;
export const BAR_MIN_W_PX = 16;
export const BAR_MAX_W_PX = 90;
export const BAR_MIN_H_PX = 3;
export const BAR_MAX_H_PX = 6;
/** Between bars and round the stack, px (s). */
export const BAR_GAP_PX = 1;
/** The stack's foot above the top of a thing's box, metres (s). */
export const STACK_LIFT_M = 0.08;
/** The star (decisions 2.1): about half a player unit's head across, metres, never fewer pixels than this, and a little see-through (s). */
export const STAR_M = 0.2;
export const STAR_MIN_PX = 5;
export const STAR_ALPHA = 0.78;
/** Damage numbers (UI-10): they rise this far, metres, over this long, ms; a hit this big is a heavy one (Jade). */
export const DAMAGE_RISE_M = 1.5;
export const DAMAGE_MS = 1000;
export const HEAVY_HIT = 100;
/** A blow that lands every step (a beam) is added up and shown this often, ms (s). */
export const TICK_MS = 500;
/** At most this many numbers at once; the oldest go (s). */
const MAX_NUMBERS = 80;
/** A number's height, metres, and its screen sizes (s). */
const NUMBER_M = 0.34;
const NUMBER_MIN_PX = 11;
const NUMBER_MAX_PX = 22;
/** The crisp font (UI-1), not the blocky one. */
const CRISP = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** One bar of a stack: how full, 0 to 1, and its colour. */
export interface StackBar {
  frac: number;
  colour: string;
}

/** What one thing shows over it this frame: where the top of its box is (metres), how wide its bars are, its bars top down, and its star's colour or null. */
export interface MarkEntry {
  key: string;
  x: number;
  y: number;
  z: number;
  widthM: number;
  bars: StackBar[];
  star: string | null;
}

/** What the marks read about the game. */
export interface MarkSource {
  /** The local player, and how many seats the game has (owners below that are players). */
  player: number;
  players: number;
  /** A player's lobby colour (CSS). */
  colour(owner: number): string;
  /** A unit's row of the latest state, or null. */
  row(id: number): Int32Array | null;
  building(id: number): BuildingInfo | undefined;
  /** Other parts' progress bars for a thing ('e:<id>' or 'b:<id>'), in the order they stack. */
  extra(key: string): readonly StackBar[];
}

export const MANA_COLOUR = '#3d8bff';
export const PROGRESS_COLOUR = '#e0b040';

/** Health's colour by how much is left: green when whole, through yellow, to red near nothing (UI-9). */
export function hpColour(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  return `hsl(${Math.round(f * 120)}, 82%, ${Math.round(44 + 6 * (1 - Math.abs(f - 0.5) * 2))}%)`;
}

/** Whether a bar of `v` out of `most` is drawn: never over 95% (UI-9), never for something that has none. */
export function barShown(v: number, most: number): boolean {
  return most > 0 && v / most <= BAR_HIDE_ABOVE;
}

/** Walls and ramparts carry neither bars nor stars (UI-9, UI-12); gates and towers do. */
export function bareKind(kind: number): boolean {
  return buildingSpec(kind).defence === 'wall';
}

/** What a unit or building shows over it this frame, or null for nothing. */
export function markEntry(t: Selectable, src: MarkSource): MarkEntry | null {
  const unit = t.key.startsWith('e:');
  if (!unit && !t.key.startsWith('b:')) return null;
  const id = Number(t.key.slice(2));
  const bars: StackBar[] = [];
  let width = UNIT_BAR_M;
  if (unit) {
    const d = src.row(id);
    if (!d) return null;
    const hp = d[S.hp]!;
    if (hp <= 0) return null;
    const maxHp = d[S.maxHp]!;
    if (barShown(hp, maxHp)) bars.push({ frac: hp / maxHp, colour: hpColour(hp / maxHp) });
    const most = d[S.maxMana]!;
    if (barShown(d[S.mana]!, most)) bars.push({ frac: d[S.mana]! / most, colour: MANA_COLOUR });
    // A unit sitting at a timed action (eating, an upgrade): its bar, which the tinkering bar used to draw alone.
    const of = d[S.tinkerOf]!;
    if (of > 0) bars.push({ frac: Math.min(d[S.tinkerDone]!, of) / of, colour: PROGRESS_COLOUR });
  } else {
    const b = src.building(id);
    if (!b || b.hp <= 0 || bareKind(b.kind)) return null;
    width = Math.max(BUILDING_BAR_MIN_M, Math.min(BUILDING_BAR_MAX_M, t.halfSize.x * 2 * BUILDING_BAR_SHARE));
    if (barShown(b.hp, b.maxHp)) bars.push({ frac: b.hp / b.maxHp, colour: hpColour(b.hp / b.maxHp) });
    // UI-18: what it makes now (an item, a unit, a research) and its own upgrade.
    const head = b.complete ? b.queue[0] : undefined;
    if (head) bars.push({ frac: head.done / 1000, colour: PROGRESS_COLOUR });
    if (b.upgrading > 0) bars.push({ frac: b.upgraded / 1000, colour: PROGRESS_COLOUR });
  }
  for (const e of src.extra(t.key)) bars.push(e);
  const star = t.owner < src.players && t.owner !== src.player ? src.colour(t.owner) : null;
  if (bars.length === 0 && star === null) return null;
  return { key: t.key, x: t.centre.x, y: t.centre.y + t.halfSize.y + STACK_LIFT_M, z: t.centre.z, widthM: width, bars, star };
}

/** Projects a point (metres) to the screen, px, into `out`; false when it is behind the camera. */
export type Project = (x: number, y: number, z: number, out: { x: number; y: number }) => boolean;

interface DamageNumber {
  x: number;
  y: number;
  z: number;
  text: string;
  heavy: boolean;
  born: number;
}

interface Ticking {
  sum: number;
  x: number;
  y: number;
  z: number;
  since: number;
}

/** Where a hit's number starts (metres): the middle of what it hit when that is known, else where the blow landed. */
export type HitAnchor = (h: HitEvent, x: number, y: number, z: number) => { x: number; y: number; z: number };

export class WorldMarks {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly tops = new Map<string, number>();
  private readonly numbers: DamageNumber[] = [];
  private readonly ticking = new Map<number, Ticking>();
  private spread = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private readonly p = { x: 0, y: 0 };
  private readonly q = { x: 0, y: 0 };

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world-marks';
    this.ctx = this.canvas.getContext('2d');
    parent.append(this.canvas);
  }

  /** Where the top of a thing's stack was drawn this frame (screen y, px), or null when it has none. */
  top(key: string): number | null {
    return this.tops.get(key) ?? null;
  }

  /** One state message's hits: a number for each blow with damage in sight; a beam's are added up first. */
  hits(hits: readonly HitEvent[], seen: (x: number, z: number) => boolean, anchor: HitAnchor, wuPerM: number, now: number): void {
    for (const h of hits) {
      if (!h.dmg || h.dmg <= 0) continue;
      const x = h.x / wuPerM;
      const z = h.z / wuPerM;
      if (!seen(x, z)) continue;
      const at = anchor(h, x, h.y / wuPerM, z);
      if (h.look === 'tick') {
        const t = this.ticking.get(h.id);
        if (t) {
          t.sum += h.dmg;
          t.x = at.x;
          t.y = at.y;
          t.z = at.z;
        } else this.ticking.set(h.id, { sum: h.dmg, ...at, since: now });
        continue;
      }
      this.number(at.x, at.y, at.z, h.dmg, now);
    }
  }

  private number(x: number, y: number, z: number, dmg: number, now: number): void {
    // Blows at once spread a little to the sides, so their numbers do not sit on each other.
    const dx = ((this.spread++ % 3) - 1) * 0.18;
    this.numbers.push({ x: x + dx, y, z, text: `-${Math.round(dmg)}`, heavy: dmg >= HEAVY_HIT, born: now });
    if (this.numbers.length > MAX_NUMBERS) this.numbers.shift();
  }

  /** Draws this frame's stacks, stars and numbers. */
  draw(entries: readonly MarkEntry[], project: Project, width: number, height: number, dpr: number, now: number): void {
    this.tops.clear();
    const ctx = this.ctx;
    if (!ctx) return;
    if (width !== this.w || height !== this.h || dpr !== this.dpr) {
      this.w = width;
      this.h = height;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of entries) this.stack(ctx, e, project);
    for (const [id, t] of this.ticking) {
      if (now - t.since < TICK_MS) continue;
      this.number(t.x, t.y, t.z, t.sum, now);
      this.ticking.delete(id);
    }
    this.drawNumbers(ctx, project, now);
  }

  /** Metres to screen px at a point: how far one metre to the side lands (the camera never turns). */
  private pxPerM(x: number, y: number, z: number, project: Project, at: { x: number; y: number }): number {
    return project(x + 1, y, z, this.q) ? Math.abs(this.q.x - at.x) : 0;
  }

  /** Whether a point on the screen is on it, or near enough that what is drawn there shows. */
  private onScreen(p: { x: number; y: number }): boolean {
    return p.x > -60 && p.y > -60 && p.x < this.w + 60 && p.y < this.h + 60;
  }

  private stack(ctx: CanvasRenderingContext2D, e: MarkEntry, project: Project): void {
    const p = this.p;
    if (!project(e.x, e.y, e.z, p) || !this.onScreen(p)) return;
    const k = this.pxPerM(e.x, e.y, e.z, project, p);
    if (k <= 0) return;
    const bw = Math.round(Math.max(BAR_MIN_W_PX, Math.min(BAR_MAX_W_PX, e.widthM * k)));
    const bh = Math.round(Math.max(BAR_MIN_H_PX, Math.min(BAR_MAX_H_PX, BAR_H_M * k)));
    const left = Math.round(p.x - bw / 2);
    // Bottom up from the top of its box: the last bar lowest, then the rest, then the star.
    let y = Math.round(p.y) - BAR_GAP_PX;
    for (let i = e.bars.length - 1; i >= 0; i--) {
      const b = e.bars[i]!;
      y -= bh;
      ctx.fillStyle = 'rgba(8, 8, 10, 0.62)';
      ctx.fillRect(left - 1, y - 1, bw + 2, bh + 2);
      const fill = Math.round(bw * Math.max(0, Math.min(1, b.frac)));
      if (fill > 0) {
        ctx.fillStyle = b.colour;
        ctx.fillRect(left, y, fill, bh);
        if (bh >= 4) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.fillRect(left, y, fill, 1);
        }
      }
      y -= BAR_GAP_PX + 1;
    }
    if (e.star) {
      const r = Math.max(STAR_MIN_PX, STAR_M * k) / 2;
      y -= Math.ceil(r) + 1;
      star(ctx, p.x, y, r, e.star);
      y -= Math.ceil(r);
    }
    this.tops.set(e.key, y);
  }

  private drawNumbers(ctx: CanvasRenderingContext2D, project: Project, now: number): void {
    const p = this.p;
    let drop = 0;
    for (const n of this.numbers) {
      const t = (now - n.born) / DAMAGE_MS;
      if (t >= 1) {
        drop++;
        continue;
      }
      const rise = DAMAGE_RISE_M * (1 - (1 - t) * (1 - t));
      if (!project(n.x, n.y + rise, n.z, p) || !this.onScreen(p)) continue;
      const k = this.pxPerM(n.x, n.y + rise, n.z, project, p);
      let size = Math.max(NUMBER_MIN_PX, Math.min(NUMBER_MAX_PX, NUMBER_M * k));
      ctx.globalAlpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      let x = p.x;
      let y = p.y;
      if (n.heavy) {
        // Heavy hits (UI-10): bigger, a punch in that settles, a short shake and a hot glow.
        const pop = t < 0.15 ? 1.75 - (t / 0.15) * 0.4 : 1.35;
        size *= pop;
        if (t < 0.25) {
          const s = (1 - t / 0.25) * 2.2;
          x += Math.sin(now * 0.09) * s;
          y += Math.cos(now * 0.11) * s;
        }
        ctx.font = `italic 900 ${Math.round(size)}px ${CRISP}`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30, 0, 0, 0.95)';
        ctx.strokeText(n.text, x, y);
        ctx.shadowColor = 'rgba(255, 150, 20, 0.9)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ff1f12';
        ctx.fillText(n.text, x, y);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        ctx.font = `700 ${Math.round(size)}px ${CRISP}`;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(35, 0, 0, 0.85)';
        ctx.strokeText(n.text, x, y);
        ctx.fillStyle = '#ff4136';
        ctx.fillText(n.text, x, y);
      }
    }
    ctx.globalAlpha = 1;
    if (drop > 0) {
      for (let i = this.numbers.length - 1; i >= 0; i--) if (now - this.numbers[i]!.born >= DAMAGE_MS) this.numbers.splice(i, 1);
    }
  }
}

/** A five-pointed star of radius r, px, in a player's colour with a thin black edge (decisions 2.1), a little see-through. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = STAR_ALPHA;
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.globalAlpha = 1;
}
