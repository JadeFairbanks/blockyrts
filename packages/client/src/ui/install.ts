// The main menu's Install app button: the site installs as an app (pwa.ts and
// public/manifest.webmanifest), with its own icon, opening full screen on
// phones and tablets and in its own window on computers. Chrome and Edge
// offer an install box of their own, which the button opens; Safari (every
// browser on an iPhone or iPad, and Safari on a Mac) and Firefox on Android
// have none, so there the button shows the steps instead. It is hidden once
// the game is installed, and in browsers that cannot install it.

import { button } from './dom.ts';

/** Chrome's and Edge's install offer, the beforeinstallprompt event (not in TypeScript's DOM types). */
interface InstallOffer extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How this browser installs the game: its own install box, steps to follow, or not at all. */
export type InstallWay = 'offer' | 'iphone' | 'mac-safari' | 'android-menu' | 'none';

/** What the button's choice depends on. */
export interface InstallFacts {
  /** The browser has offered to install the game (beforeinstallprompt came). */
  offer: boolean;
  /** The game is open as an installed app, or was just installed. */
  installed: boolean;
  userAgent: string;
  /** navigator.maxTouchPoints: an iPad says it is a Mac, but has a touchscreen. */
  touchPoints: number;
}

export function installWay(f: InstallFacts): InstallWay {
  // The offer comes only while the game is not installed in this browser.
  if (f.offer) return 'offer';
  if (f.installed) return 'none';
  const ua = f.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && f.touchPoints > 1)) return 'iphone';
  // Safari 17 on a Mac added File > Add to Dock; other Mac browsers say their own names.
  const safari = /Version\/(\d+)[.\d]* Safari\//.exec(ua);
  if (/Macintosh/.test(ua) && safari && Number(safari[1]) >= 17 && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) return 'mac-safari';
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return 'android-menu';
  return 'none';
}

/** The steps the button shows where the browser has no install box of its own. */
export const INSTALL_STEPS: Record<Exclude<InstallWay, 'offer' | 'none'>, readonly string[]> = {
  iphone: [
    'Tap the Share button: a square with an arrow pointing up. In newer Safari it is in the ••• menu.',
    'Tap Add to Home Screen (scroll down the list if it is not showing), then Add.',
    'Open the game from its new icon on your home screen. Sign in again if it asks.',
  ],
  'mac-safari': ['In the menu bar at the top of the screen, choose File, then Add to Dock.', 'Click Add.', 'Open the game from its new icon in the Dock.'],
  'android-menu': [
    "Open Firefox's menu: the ⋮ button.",
    'Tap Add app to Home screen (in some versions it says Install), then Add.',
    'Open the game from its new icon on your home screen.',
  ],
};

let offer: InstallOffer | null = null;
let installed = false;
const watchers = new Set<() => void>();

function changed(): void {
  for (const w of watchers) w();
}

/** Whether the page is open as an installed app. */
function openAsApp(): boolean {
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
}

/** This browser's way, now. */
export function currentInstallWay(): InstallWay {
  return installWay({ offer: offer !== null, installed: installed || openAsApp(), userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints });
}

/**
 * Listens for the browser's install offer and for the game being installed,
 * and registers the service worker (production builds only). main.ts calls it
 * first thing, since the offer can come before the menu is up.
 */
export function startInstall(): void {
  addEventListener('beforeinstallprompt', (e) => {
    // The button asks instead of the browser's own bar.
    e.preventDefault();
    offer = e as InstallOffer;
    changed();
  });
  addEventListener('appinstalled', () => {
    offer = null;
    installed = true;
    changed();
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // After the page's own files are in, so it never holds up the start.
  const register = (): void => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((err: unknown) => console.warn('service worker not registered', err));
  };
  if (document.readyState === 'complete') register();
  else addEventListener('load', register, { once: true });
}

/**
 * The menu's Install app button, beside Full screen. It shows and hides
 * itself as the browser's offer comes and goes; `steps` opens the steps page
 * where the browser has no install box.
 */
export function installButton(parent: HTMLElement, steps: (way: keyof typeof INSTALL_STEPS) => void): HTMLButtonElement {
  const press = (): void => {
    const way = currentInstallWay();
    if (way === 'offer' && offer) {
      const asked = offer;
      // An offer opens once: whatever the answer, the button waits for the next.
      offer = null;
      void asked.prompt().catch(() => undefined);
      void asked.userChoice.then(changed, changed);
    } else if (way !== 'offer' && way !== 'none') steps(way);
  };
  const b = button(parent, 'Install app', press);
  b.classList.add('install');
  b.title = 'Keep the game on your desktop or home screen, and play it in its own window.';
  const show = (): void => {
    if (!b.isConnected) watchers.delete(show);
    else b.hidden = currentInstallWay() === 'none';
  };
  watchers.add(show);
  b.hidden = currentInstallWay() === 'none';
  return b;
}
