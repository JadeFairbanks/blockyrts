// The main menu (Outside the match): New game, Load game, Join game, How to
// play, Patch notes (with the newest update's name), Settings, Account and
// Quit, with the F11 reminder and a Full screen button. Each choice is a
// page in the same box, except How to Play and the patch notes, which open
// full-window over it; the menu ends with a match to play.
import { ApiErrorCode, readSaveHeader, SAVE_FORMAT_VERSION, type OpenRoom, type RoomStateMessage, type SaveSummary } from '@blockyrts/protocol';
import type { MatchPlan } from '../game/match.ts';
import { IS_MAC } from '../input/platform.ts';
import { ApiFailure, normaliseCode, type Api } from '../net/api.ts';
import { RelayClient } from '../net/relay.ts';
import { forgetLocal, localSaves, openSave, type OpenedSave } from '../net/saves.ts';
import { SettingsPanel } from '../settings/settings-panel.ts';
import type { Settings } from '../settings/settings.ts';
import { MAX_SEED, parseSeed, randomSeed } from '../start/seed.ts';
import { GAME_VERSION } from '../version.ts';
import { accountPage } from './account.ts';
import lobbyMap from './art/lobby-map.webp';
import { bookFromHash } from './book-links.ts';
import { button, el, field, input, Screen, status, whenText } from './dom.ts';
import { lobby } from './lobby.ts';
import { LATEST_PATCH, latestSeen } from './patch-notes/notes.ts';
import { supportFacts, supportProblems } from './support.ts';

export interface MenuContext {
  api: Api;
  settings: Settings;
}

/** Where the menu opens: the front page, straight into joining a code (an invite link), or How to Play or the patch notes (their links). */
export type MenuStart = { page: 'main' } | { page: 'join'; code: string } | { page: 'how-to-play'; slug: string } | { page: 'patch-notes' };

/** The menu page a link's address (#how-to-play/..., #patch-notes) opens, else the front page. */
export function menuStartFromHash(hash: string): MenuStart {
  const at = bookFromHash(hash);
  if (!at) return { page: 'main' };
  return at.book === 'patch-notes' ? { page: 'patch-notes' } : { page: 'how-to-play', slug: at.slug };
}

function failureText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** What a save that is out of date with the live game says on the Load screen (Patch 5). */
export const OUTDATED_SAVE_TEXT = 'This save is no longer valid: it is out of date with the live game.';

/** Whether a save kept in this browser was written by an older version of the game. */
function localOutdated(data: Uint8Array): boolean {
  try {
    return readSaveHeader(data).formatVersion !== SAVE_FORMAT_VERSION;
  } catch {
    return true;
  }
}

/** A "Private game" tick box: hosting a game no one can join without its code (Patch 5). */
function privateBox(parent: HTMLElement): HTMLInputElement {
  const row = el('label', 'setting toggle private-toggle', undefined, parent);
  const box = input('private', 'checkbox');
  row.append(box);
  el('span', '', 'Private game', row);
  el('small', '', 'It still shows in the open games list, below the public ones, but friends need its code to join.', row);
  return box;
}

/** A saved game played on alone: the seat this account had, else the first. */
export function soloPlan(opened: OpenedSave, accountId: string, matchId: string): MatchPlan {
  const mine = opened.seats.findIndex((s) => accountId !== '' && s.accountId === accountId);
  const player = mine >= 0 ? mine : Math.max(0, opened.seats.findIndex((s) => s.slot >= 0));
  return { seed: opened.header.seed, seats: opened.seats, player, matchId, sim: opened.sim, online: null };
}

/** A new game alone: one seat (the URL's ?players=N adds empty start pockets for testing). */
export function newSoloPlan(seed: number, name: string, accountId: string, players = 1): MatchPlan {
  const seats = Array.from({ length: players }, (_, p) => ({ slot: p === 0 ? 0 : -1, name: p === 0 ? name : `Player ${p + 1}`, colour: p, accountId: p === 0 ? accountId : '' }));
  return { seed, seats, player: 0, matchId: '', sim: null, online: null };
}

export function mainMenu(app: HTMLElement, ctx: MenuContext, start: MenuStart = { page: 'main' }): Promise<MatchPlan> {
  const { api, settings } = ctx;
  const screen = new Screen(app, 'main-menu');
  // The lobby's picture, fetched now so it is there when a lobby opens.
  new Image().src = lobbyMap;
  return new Promise((resolve) => {
    const play = (plan: MatchPlan): void => {
      screen.remove();
      resolve(plan);
    };
    const backRow = (box: HTMLElement, to: () => void = main): void => {
      el('hr', '', undefined, box);
      button(box, 'Back', to);
    };

    // ---- The front page ----
    const main = (): void => {
      const box = screen.page('', 'main-menu');
      box.replaceChildren();
      el('h1', 'game-logo', 'Survive and Conquer', box);
      el('p', 'tagline', 'Build by day, hold the walls by night.', box);
      for (const p of supportProblems(supportFacts(), settings.touch)) el('p', 'note warn', p, box);
      const who = el('p', 'note who', '', box);
      const showWho = (): void => {
        who.textContent = api.me ? `Playing as ${api.me.name}${api.me.account ? '' : ' (guest)'}.` : 'Not connected to the game server: playing alone still works.';
      };
      showWho();
      api.onChange(showWho);
      button(box, 'New game', newGame, 'primary big');
      button(box, 'Load game', load, 'big');
      button(box, 'Join game', () => join(''), 'big');
      button(box, 'How to play', () => howToPlay(''), 'big');
      const news = el('div', 'update-row', undefined, box);
      button(news, 'Patch notes', patchNotes);
      el('span', `update-mark${latestSeen() ? '' : ' unread'}`, `New update: ${LATEST_PATCH.name}`, news);
      button(box, 'Settings', settingsPage, 'big');
      button(box, 'Account', account, 'big');
      button(box, 'Quit', quit, 'big');
      el('hr', '', undefined, box);
      const fs = el('div', 'row fullscreen-row', undefined, box);
      el('span', `note f11${IS_MAC ? ' mac' : ''}`, `Press ${IS_MAC ? 'Ctrl + Cmd + F' : 'F11'} for full screen: some controls, such as Ctrl + number groups, only work in full screen.`, fs);
      button(fs, 'Full screen', () => void document.documentElement.requestFullscreen?.().catch(() => undefined));
      el('p', 'note version', GAME_VERSION, box);
    };

    // ---- New game ----
    const newGame = (): void => {
      const box = screen.page('New game');
      const form = el('form', '', undefined, box);
      form.noValidate = true;
      const seedInput = input('seed');
      seedInput.inputMode = 'numeric';
      seedInput.value = String(randomSeed());
      const seed = field(form, 'World seed', seedInput, `Any whole number from 0 to ${MAX_SEED.toLocaleString('en')}. The same seed makes the same world: share it to play it again.`);
      const rnd = button(form, 'Random seed', () => {
        seedInput.value = String(randomSeed());
        seed.error.hidden = true;
      });
      rnd.classList.add('small');
      const read = (): number | null => {
        const v = parseSeed(seedInput.value);
        seed.error.textContent = `The seed must be a whole number from 0 to ${MAX_SEED.toLocaleString('en')}.`;
        seed.error.hidden = v !== null;
        return v;
      };
      if (!api.me?.account) el('p', 'note warn', "You are playing as a guest: a guest's progress is not saved. Make an account in Account first to keep your games.", box);
      const privately = privateBox(box);
      const st = status(box);
      button(
        box,
        'Play alone',
        () => {
          const s = read();
          if (s !== null) play(newSoloPlan(s, api.me?.name ?? 'You', api.me?.account?.id ?? ''));
        },
        'primary',
      );
      button(box, 'Host a game for friends', () => {
        const s = read();
        if (s === null) return;
        st.set('Opening a game on the server…');
        void online(st, (relay) => relay.host(s, '', privately.checked));
      });
      el('p', 'note', 'Hosting gives you an invite link and a code for up to 7 friends. Public games show in everyone\'s list of open games.', box);
      backRow(box);
      seedInput.focus();
      seedInput.select();
    };

    /** Connects to the relay, opens or joins a room, and runs the lobby. */
    const online = async (st: ReturnType<typeof status>, open: (relay: RelayClient) => Promise<RoomStateMessage>): Promise<void> => {
      let relay: RelayClient | null = null;
      let inLobby = false;
      try {
        if (!api.me) await api.ensureSession();
        relay = new RelayClient(api.token);
        await relay.connect();
        const room = await open(relay);
        inLobby = true;
        const plan = await lobby(screen, relay, room);
        if (plan) play(plan);
        else main();
      } catch (e) {
        relay?.close();
        if (!inLobby) st.set(failureText(e), true);
        else {
          main();
          el('p', 'note error', failureText(e), screen.box);
        }
      }
    };

    // ---- Join game ----
    const join = (code: string, note = ''): void => {
      const box = screen.page('Join game');
      el('p', 'note', note || 'Type the code a friend gave you, or paste their invite link, or pick a game from the open games.', box);
      const form = el('form', '', undefined, box);
      form.noValidate = true;
      const codeInput = input('code');
      codeInput.value = code;
      codeInput.classList.add('code-input');
      field(form, 'Invite code', codeInput);
      const submit = el('button', 'primary', 'Join', form);
      submit.type = 'submit';
      const st = status(box);
      const go = (): void => {
        const c = normaliseCode(codeInput.value);
        if (c.length < 4) return st.set('Type the 6-character code.', true);
        st.set('Joining…');
        void online(st, (relay) => relay.join(c));
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        go();
      });
      button(box, 'Open games', openGames, 'big');
      backRow(box);
      codeInput.focus();
      if (code) go();
    };

    // ---- Open games (Jade, Patch 5): the lobbies waiting for players, public first ----
    const openGames = (): void => {
      const box = screen.page('Open games', 'load-page');
      const st = status(box);
      const list = el('div', 'save-list', undefined, box);
      const fill = async (): Promise<void> => {
        st.set('Looking for open games…');
        let rooms: OpenRoom[];
        try {
          if (!api.me) await api.ensureSession();
          rooms = await api.openRooms();
        } catch (e) {
          st.set(failureText(e), true);
          return;
        }
        list.replaceChildren();
        st.set(rooms.length === 0 ? 'No games are waiting for players right now. Host one from New game, or ask a friend for their code.' : '');
        for (const r of rooms) {
          const row = el('div', `save-row${r.private ? ' private' : ''}`, undefined, list);
          const text = el('div', 'save-text', undefined, row);
          el('div', 'save-title', `${r.hostName}'s game${r.private ? ' (private)' : ''}`, text);
          const places = `${r.openSlots} place${r.openSlots === 1 ? '' : 's'} free`;
          el('div', 'note', `${r.players} in the lobby · ${places}${r.fromSave ? ' · a saved game: only its own players can come back' : ''}`, text);
          if (r.private) {
            button(row, 'Join with code', () => join('', `${r.hostName}'s game is private: type the code they gave you.`));
          } else {
            button(
              row,
              'Join',
              () => {
                st.set('Joining…');
                void online(st, (relay) => relay.join(r.code));
              },
              'primary',
            );
          }
        }
      };
      const row = el('div', 'row', undefined, box);
      button(row, 'Refresh', () => void fill());
      el('hr', '', undefined, box);
      button(box, 'Back', () => join(''));
      void fill();
    };

    // ---- Load game ----
    const load = (): void => {
      const box = screen.page('Load game', 'load-page');
      const st = status(box);
      const list = el('div', 'save-list', undefined, box);
      const local = el('div', 'save-list', undefined, box);
      const fileRow = el('div', 'row', undefined, box);
      const file = input('file', 'file');
      file.accept = '.sac,application/octet-stream';
      file.hidden = true;
      fileRow.append(file);
      button(fileRow, 'Open a save file (.sac)', () => file.click());
      file.addEventListener('change', () => {
        const f = file.files?.[0];
        if (!f) return;
        void f
          .arrayBuffer()
          .then((b) => openSave(new Uint8Array(b)))
          .then(
            (opened) => play(soloPlan(opened, api.me?.account?.id ?? '', '')),
            (e: unknown) => st.set(failureText(e), true),
          );
      });
      el('p', 'note', 'A save file plays on alone on this computer. To carry on a game with friends, the host continues it from their account below.', box);
      const privately = privateBox(box);
      backRow(box);

      // The account's saves, newest first.
      const accountSaves = async (): Promise<void> => {
        if (!api.me) await api.ensureSession().catch(() => undefined);
        if (!api.me?.account) {
          el('p', 'note', 'Sign in (Account) to see the games saved to your account.', list);
          return;
        }
        st.set('Loading your saved games…');
        let saves: SaveSummary[];
        try {
          saves = await api.listSaves();
        } catch (e) {
          st.set(failureText(e), true);
          return;
        }
        st.set('');
        el('h3', '', 'Saved games', list);
        if (saves.length === 0) el('p', 'note', 'No saved games yet. The game saves itself at every dawn; the menu saves at any time.', list);
        for (const s of saves) {
          const row = el('div', `save-row${s.outdated ? ' outdated' : ''}`, undefined, list);
          const text = el('div', 'save-text', undefined, row);
          el('div', 'save-title', `Night ${s.night}${s.kind === 'autosave' ? ' (autosave at dawn)' : ''}`, text);
          el('div', 'note', `${s.players.map((p) => p.name).join(', ') || 'You'} · seed ${s.seed} · ${whenText(s.createdAt)}`, text);
          // Out of date with the live game (Jade, Patch 5): its file is gone; acknowledging it takes it off the list for good.
          if (s.outdated) {
            el('div', 'note warn', OUTDATED_SAVE_TEXT, text);
            button(row, 'OK, remove it', () => api.deleteSave(s.id).then(load, (e: unknown) => st.set(failureText(e), true)), 'primary');
            continue;
          }
          const many = s.players.length > 1;
          button(
            row,
            many ? 'Host to continue' : 'Continue',
            () => {
              if (many) {
                st.set('Opening the game for its players…');
                void online(st, (relay) => relay.host(null, s.id, privately.checked));
                return;
              }
              st.set('Loading…');
              api
                .loadSave(s.id)
                .then(openSave)
                .then(
                  (opened) => play(soloPlan(opened, api.me?.account?.id ?? '', s.matchId)),
                  (e: unknown) => st.set(failureText(e), true),
                );
            },
            'primary',
          );
          button(row, 'Delete', () => {
            if (!window.confirm(`Delete the save from night ${s.night}? This cannot be undone.`)) return;
            api.deleteSave(s.id).then(load, (e: unknown) => st.set(failureText(e), true));
          });
        }
      };
      void accountSaves().catch((e: unknown) => {
        if (e instanceof ApiFailure && e.code === ApiErrorCode.GuestMustRegister) return;
        st.set(failureText(e), true);
      });

      // The dawn autosaves kept in this browser.
      void localSaves().then((saves) => {
        if (saves.length === 0) return;
        el('h3', '', 'Kept in this browser', local);
        for (const s of saves) {
          const old = localOutdated(s.data);
          const row = el('div', `save-row${old ? ' outdated' : ''}`, undefined, local);
          const text = el('div', 'save-text', undefined, row);
          el('div', 'save-title', `Night ${s.night} (autosave at dawn)`, text);
          el('div', 'note', `${s.players.join(', ') || 'You'} · seed ${s.seed} · ${whenText(s.savedAt)}`, text);
          if (old) {
            el('div', 'note warn', OUTDATED_SAVE_TEXT, text);
            button(row, 'OK, remove it', () => void forgetLocal(s.matchId).then(load), 'primary');
            continue;
          }
          button(
            row,
            'Play on alone',
            () => {
              openSave(s.data).then(
                (opened) => play(soloPlan(opened, api.me?.account?.id ?? '', s.matchId.startsWith('local') ? '' : s.matchId)),
                (e: unknown) => st.set(failureText(e), true),
              );
            },
            'primary',
          );
          button(row, 'Forget', () => void forgetLocal(s.matchId).then(load));
        }
      });
    };

    // ---- Settings ----
    const settingsPage = (): void => {
      const box = screen.page('Settings', 'settings-page');
      let open = true;
      const panel = new SettingsPanel(settings, { visible: () => open });
      box.append(panel.el);
      backRow(box, () => {
        open = false;
        panel.stopCapture();
        main();
      });
    };

    // ---- Account ----
    const account = (): void => {
      void (async () => {
        if (!api.me) {
          screen.page('Account');
          await api.ensureSession().catch(() => undefined);
        }
        if (!api.me) {
          const box = screen.page('Account');
          el('p', 'note error', 'The game server cannot be reached, so accounts are not available right now. Playing alone still works.', box);
          backRow(box);
          return;
        }
        await accountPage(screen, api);
        main();
      })();
    };

    // ---- How to Play and the patch notes: full-window screens over the menu, loaded when first opened ----
    const howToPlay = (slug: string): void => {
      void import('./how-to-play/page.ts').then(({ howToPlay: open }) => open(app, slug)).then(main, (e: unknown) => console.warn('How to Play did not open', e));
    };
    const patchNotes = (): void => {
      void import('./patch-notes/page.ts').then(({ patchNotes: open }) => open(app)).then(main, (e: unknown) => console.warn('the patch notes did not open', e));
    };

    // ---- Quit ----
    const quit = (): void => {
      window.close();
      const box = screen.page('Goodbye');
      el('p', '', 'You can close this tab now.', box);
      button(box, 'Back to the main menu', main);
    };

    if (start.page === 'join') join(start.code);
    else main();
    if (start.page === 'how-to-play') howToPlay(start.slug);
    else if (start.page === 'patch-notes') patchNotes();
  });
}
