// Client entry: the main menu (or a page an emailed or invite link opens),
// then the match (game/match.ts). Testers skip the menu with ?seed=N (and
// &players=N for extra start pockets), which starts a game alone at once.
import './hud/hud.css';
import './ui/screens.css';
import { startMenuMusic } from './audio/menu-music.ts';
import { runMatch, START_MODELS } from './game/match.ts';
import { openModelLibrary, type ModelLibrary } from './models/index.ts';
import { Api, joinCodeOf } from './net/api.ts';
import { loadSettings } from './settings/settings.ts';
import { startFromUrl } from './start/seed.ts';
import { resetPasswordPage } from './ui/account.ts';
import { Screen } from './ui/dom.ts';
import { mainMenu, menuStartFromHash, newSoloPlan, type MenuStart } from './ui/main-menu.ts';
import { askTouch, hasTouchScreen, touchQuestionDue } from './ui/touch-ask.ts';

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  const settings = loadSettings();
  const api = new Api();
  // Models start loading while the player is in the menu.
  const library: Promise<ModelLibrary | null> = openModelLibrary(`${import.meta.env.BASE_URL}models/`, START_MODELS).catch((err: unknown) => {
    console.warn('model library not loaded; drawing blocks', err);
    return null;
  });
  const toMenu = (): void => {
    location.href = '/';
  };

  // The link in a password reset email.
  if (location.pathname === '/reset-password') {
    const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
    history.replaceState(null, '', '/');
    const screen = new Screen(app);
    await resetPasswordPage(screen, api, token);
    screen.remove();
  }

  // A touchscreen, first time here: ask whether to play by touch (patch notes 1).
  if (touchQuestionDue(settings, hasTouchScreen())) await askTouch(app, settings);

  const quick = startFromUrl(location.search);
  let plan;
  if (quick) {
    // A signed-in page knows its account (the debugger opens only for the admin accounts); no guest is made for it.
    if (api.token) await api.ensureSession().catch(() => undefined);
    plan = newSoloPlan(quick.seed, 'Player 1', '', quick.players);
  } else {
    // The menu theme plays from the first click until the game starts.
    const music = startMenuMusic(settings);
    // Who this page is: the stored session, or a new guest (the menu works without the server).
    await api.ensureSession().catch(() => undefined);
    const code = joinCodeOf(location.pathname, location.search);
    const start: MenuStart = code ? { page: 'join', code } : menuStartFromHash(location.hash);
    if (code) history.replaceState(null, '', '/');
    plan = await mainMenu(app, { api, settings, library }, start);
    music?.stop();
  }
  await runMatch(app, plan, { api, settings, library, toMenu });
}

void main();
