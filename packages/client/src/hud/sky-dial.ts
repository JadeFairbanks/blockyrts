// The little sky by the day clock (Patch 5): the camera looks down at the land
// and never sees the sky, so the art set's sky shows here. Day, dusk, night
// and dawn skies blend into one another, the sun crosses from dawn to the end
// of dusk and the moon through the night (the full moon on a Bright Night),
// the stars come out in the dark, clouds drift by day and a fog night's fog
// drifts across the bottom.
import { clockAt, Period } from '@blockyrts/sim';

const URLS = import.meta.glob<string>('../../../assets/src/sky/*.png', { eager: true, query: '?no-inline', import: 'default' });
const url = (file: string): string => URLS[`../../../assets/src/sky/${file}.png`] ?? '';
/** Every sky picture's URL (the fog banks' too), for the loading screen (mini patch 7.3). */
export const SKY_URLS: readonly string[] = Object.values(URLS);

/** The canvas's own pixels (shown at half size, so the 32 px sun and moon are 16 px on screen). */
const W = 112;
const H = 56;
/** Sprite and frame sizes in the art set. */
const BODY = 32;
const CLOUD_W = 64;
const CLOUD_H = 32;
const CLOUDS = 5;
const FOG_W = 64;
const FOG_FRAMES = 4;
/** Redrawn this often, ms: the clouds and the fog drift slowly. */
const REDRAW_MS = 100;

type Picture = 'sky_day' | 'sky_dusk' | 'sky_night' | 'sky_dawn' | 'sun' | 'moon' | 'moon_full' | 'stars' | 'clouds' | 'fog_drift';
const PICTURES: Picture[] = ['sky_day', 'sky_dusk', 'sky_night', 'sky_dawn', 'sun', 'moon', 'moon_full', 'stars', 'clouds', 'fog_drift'];

export class SkyDial {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly pics = new Map<Picture, HTMLImageElement>();
  private step = 0;
  private brightSky = false;
  private fog = 0;
  private fogWanted = 0;
  private lastDraw = 0;

  constructor(clock: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'clock-sky';
    this.canvas.width = W;
    this.canvas.height = H;
    clock.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    for (const p of PICTURES) {
      const src = url(p);
      if (!src) continue;
      const img = new Image();
      img.onload = () => {
        this.pics.set(p, img);
        this.lastDraw = 0;
      };
      img.src = src;
    }
  }

  /** The clock's step, whether the night is a Bright Night and whether a fog night's fog is in. */
  set(step: number, brightSky: boolean, fog: boolean): void {
    this.step = step;
    this.brightSky = brightSky;
    this.fogWanted = fog ? 1 : 0;
  }

  /** Once a frame: redrawn a few times a second. */
  draw(now: number): void {
    const g = this.g;
    if (!g || now - this.lastDraw < REDRAW_MS) return;
    const dt = this.lastDraw ? Math.min(1, (now - this.lastDraw) / 1000) : 1;
    this.lastDraw = now;
    this.fog += Math.sign(this.fogWanted - this.fog) * Math.min(Math.abs(this.fogWanted - this.fog), dt / 4);
    const c = clockAt(this.step);
    const f = c.into / Math.max(1, c.into + c.left);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    // The sky: the period's own, blending into the next through dusk and dawn.
    const [a, b, k] = skyBlend(c.period, f);
    this.paint(a, 1);
    if (b && k > 0) this.paint(b, k);
    // The stars in the dark.
    const dark = c.period === Period.Night ? 1 : c.period === Period.Dusk ? f : c.period === Period.Dawn ? 1 - f : 0;
    const stars = this.pics.get('stars');
    if (stars && dark > 0) {
      g.globalAlpha = dark;
      g.drawImage(stars, 0, 0, W, H, 0, 0, W, H);
    }
    // The sun from the start of dawn to the end of dusk, the moon through the night.
    const sunUp = c.period === Period.Day ? 0.15 + 0.7 * f : c.period === Period.Dusk ? 0.85 + 0.15 * f : c.period === Period.Dawn ? 0.15 * f : -1;
    if (sunUp >= 0) this.body('sun', sunUp);
    if (c.period === Period.Night) this.body(this.brightSky ? 'moon_full' : 'moon', f);
    // A couple of clouds drift across by day.
    const clouds = this.pics.get('clouds');
    if (clouds && dark < 1) {
      g.globalAlpha = 0.9 * (1 - dark);
      const t = now / 1000;
      for (let i = 0; i < 2; i++) {
        const span = W + CLOUD_W;
        const x = W - ((t * 2.2 + i * span * 0.55) % span);
        const frame = (Math.floor((t * 2.2 + i * span * 0.55) / span) + i * 2) % CLOUDS;
        g.drawImage(clouds, frame * CLOUD_W, 0, CLOUD_W, CLOUD_H, x, 2 + i * 12, CLOUD_W, CLOUD_H);
      }
    }
    // A fog night's fog drifts along the bottom (the sheet: four frames at 4 fps, about half see-through).
    const fog = this.pics.get('fog_drift');
    if (fog && this.fog > 0) {
      g.globalAlpha = 0.6 * this.fog;
      const t = now / 1000;
      const frame = Math.floor(t * 4) % FOG_FRAMES;
      const off = (t * 4) % FOG_W;
      for (let x = -FOG_W + off; x < W; x += FOG_W) g.drawImage(fog, frame * FOG_W, 0, FOG_W, 32, x, H - 30, FOG_W, 32);
    }
    g.globalAlpha = 1;
  }

  private paint(p: Picture, alpha: number): void {
    const img = this.pics.get(p);
    if (!img || !this.g) return;
    this.g.globalAlpha = alpha;
    this.g.drawImage(img, 0, 0, img.width, img.height, 0, 0, W, H);
  }

  /** The sun or moon along its arc: 0 rising at the left, 1 setting at the right. */
  private body(p: Picture, u: number): void {
    const img = this.pics.get(p);
    if (!img || !this.g) return;
    this.g.globalAlpha = 1;
    const x = u * W - BODY / 2;
    const y = H - BODY * 0.4 - Math.sin(Math.PI * u) * (H - BODY * 0.55);
    this.g.drawImage(img, Math.round(x), Math.round(y), BODY, BODY);
  }
}

/** The sky for a period and how far into it: the picture under, the one over and how much of it. */
export function skyBlend(period: number, f: number): [Picture, Picture | null, number] {
  switch (period) {
    case Period.Day:
      return ['sky_day', null, 0];
    case Period.Dusk:
      return f < 0.5 ? ['sky_day', 'sky_dusk', f * 2] : ['sky_dusk', 'sky_night', f * 2 - 1];
    case Period.Night:
      return ['sky_night', null, 0];
    default:
      return f < 0.5 ? ['sky_night', 'sky_dawn', f * 2] : ['sky_dawn', 'sky_day', f * 2 - 1];
  }
}
