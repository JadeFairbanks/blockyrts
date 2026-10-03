// The lobby (Outside the match: Hosting and joining): the invite link and
// code, the players with their colours and whether they are ready, and the
// host's Start button. A continued game waits here until everyone who was in
// it is back. It ends when the relay starts the match, and hands the match
// what it needs.
import { PLAYER_COLOURS, Presence, RoomPhase, type RoomStateMessage, type ServerMessage } from '@blockyrts/protocol';
import { colourHex, seatsOf, type MatchPlan } from '../game/match.ts';
import { inviteLink } from '../net/api.ts';
import type { RelayClient } from '../net/relay.ts';
import { openSave } from '../net/saves.ts';
import { button, el, status, type Screen } from './dom.ts';

/** Whether the host may start now, and if not, why (the relay checks the same). */
export function startProblem(room: RoomStateMessage): string {
  const others = room.players.filter((p) => p.slot !== room.hostSlot);
  const away = room.players.filter((p) => p.presence === Presence.Reserved);
  if (away.length > 0) return `Waiting for ${away.map((p) => p.name).join(' and ')} to rejoin: everyone who was in this game has to be back.`;
  if (room.players.some((p) => p.presence === Presence.Disconnected)) return 'A player has lost their connection.';
  const notReady = others.filter((p) => !p.ready && p.presence === Presence.Connected);
  if (notReady.length > 0) return `Waiting for ${notReady.map((p) => p.name).join(' and ')} to be ready.`;
  return '';
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the lobby until the match starts (resolves with its plan) or the
 * player leaves (resolves with null).
 */
export function lobby(screen: Screen, relay: RelayClient, first: RoomStateMessage): Promise<MatchPlan | null> {
  return new Promise((resolve, reject) => {
    let room = first;
    let st = { set: (_t: string, _e?: boolean): void => undefined };
    const finish = (plan: MatchPlan | null): void => {
      off();
      offStatus();
      resolve(plan);
    };
    const begin = async (m: Extract<ServerMessage, { type: 'gameStart' } | { type: 'loadSnapshot' }>): Promise<void> => {
      const box = screen.page('Starting…');
      el('p', 'note', 'Building the world and loading the models.', box);
      let plan: MatchPlan;
      if (m.type === 'gameStart' && m.snapshot.length === 0) {
        const seats = seatsOf(room, m.activeSlots);
        plan = {
          seed: room.seed,
          seats,
          player: seats.findIndex((s) => s.slot === room.yourSlot),
          matchId: room.matchId,
          sim: null,
          online: { relay, room, epoch: m.epoch, activeSlots: m.activeSlots, inputDelay: m.inputDelay },
        };
      } else {
        const data = m.type === 'gameStart' ? m.snapshot : m.data;
        const opened = await openSave(data);
        // The names and colours as they are now; the seats as they were saved.
        for (const s of opened.seats) {
          const p = room.players.find((x) => x.slot === s.slot);
          if (p) Object.assign(s, { name: p.name, colour: p.colour, accountId: p.accountId });
        }
        plan = {
          seed: opened.header.seed,
          seats: opened.seats,
          player: opened.seats.findIndex((s) => s.slot === room.yourSlot),
          matchId: room.matchId,
          sim: opened.sim,
          online:
            m.type === 'gameStart'
              ? { relay, room, epoch: m.epoch, activeSlots: m.activeSlots, inputDelay: m.inputDelay }
              : { relay, room, epoch: m.epoch, activeSlots: m.activeSlots, inputDelay: m.inputDelay, nextFrameStep: m.nextFrameStep, frames: m.frames },
        };
      }
      if (plan.player < 0) throw new Error('This game has no place for you.');
      finish(plan);
    };
    const off = relay.on((m) => {
      if (m.type === 'roomState') {
        room = m;
        draw();
      } else if (m.type === 'error') st.set(m.message, true);
      else if (m.type === 'gameStart' || (m.type === 'loadSnapshot' && room.phase === RoomPhase.Running)) {
        // Frames follow at once: keep them for the match.
        relay.hold();
        begin(m).catch((e: unknown) => {
          relay.close();
          off();
          offStatus();
          reject(e instanceof Error ? e : new Error(String(e)));
        });
      } else if (m.type === 'roomClosed') {
        relay.close();
        finish(null);
      }
    });
    const offStatus = relay.onStatus((s) => {
      if (s === 'reconnecting') st.set('Lost the connection to the game server. Reconnecting…', true);
      else if (s === 'open') st.set('');
      else if (s === 'closed') {
        off();
        offStatus();
        reject(new Error('The connection to the game server was lost.'));
      }
    });

    const draw = (): void => {
      const running = room.phase === RoomPhase.Running;
      const box = screen.page(running ? 'Rejoining the game' : room.fromSave ? 'Continuing a saved game' : 'Game lobby', 'lobby');
      if (running) {
        el('p', 'note', 'The game is under way: catching up with the other players…', box);
        st = status(box);
        return;
      }
      const host = room.hostSlot === room.yourSlot;
      const code = el('div', 'invite', undefined, box);
      el('span', 'invite-label', 'Invite code', code);
      el('span', 'invite-code', room.code, code);
      const link = inviteLink(room.code);
      const copyRow = el('div', 'row', undefined, box);
      const copied = el('span', 'note', '', box);
      button(copyRow, 'Copy the invite link', () => void copy(link).then((ok) => (copied.textContent = ok ? 'Link copied: send it to your friends.' : `Copy this link: ${link}`)));
      button(copyRow, 'Copy the code', () => void copy(room.code).then((ok) => (copied.textContent = ok ? 'Code copied: friends type it in Join game.' : `The code is ${room.code}.`)));
      el('p', 'note', `Friends open ${link}, or choose Join game and type the code. Up to 8 players. World seed ${room.seed}.`, box);

      el('h3', '', 'Players', box);
      const list = el('div', 'lobby-players', undefined, box);
      for (const p of room.players) {
        const row = el('div', 'lobby-player', undefined, list);
        const sw = el('span', 'ally-swatch', undefined, row);
        sw.style.background = colourHex(p.colour);
        el('span', 'lobby-name', `${p.name}${p.slot === room.yourSlot ? ' (you)' : ''}${p.slot === room.hostSlot ? ' — host' : ''}`, row);
        const state =
          p.presence === Presence.Reserved
            ? 'not back yet'
            : p.presence === Presence.Disconnected
              ? 'connection lost'
              : p.presence === Presence.Gone
                ? 'left'
                : p.slot === room.hostSlot
                  ? ''
                  : p.ready
                    ? 'ready'
                    : 'not ready';
        el('span', `lobby-state${p.ready ? ' ready' : ''}`, state, row);
      }
      if (room.players.some((p) => p.guest && p.slot === room.yourSlot)) {
        el('p', 'note', 'You are a guest: a guest’s progress is not saved. The host needs an account to save the game.', box);
      }

      const me = room.players.find((p) => p.slot === room.yourSlot);
      if (!room.fromSave) {
        el('h3', '', 'Your colour', box);
        const colours = el('div', 'colour-picker', undefined, box);
        PLAYER_COLOURS.forEach((c, k) => {
          const taken = room.players.some((p) => p.slot !== room.yourSlot && p.colour === k && p.presence !== Presence.Gone);
          const b = button(colours, '', () => relay.send({ type: 'setColour', colour: k }), `colour${me?.colour === k ? ' picked' : ''}`);
          b.style.background = c.hex;
          b.title = taken ? `${c.name} (taken)` : c.name;
          b.setAttribute('aria-label', b.title);
          b.disabled = taken;
        });
      }

      el('hr', '', undefined, box);
      const actions = el('div', 'row', undefined, box);
      if (host) {
        const why = startProblem(room);
        const start = button(actions, 'Start the game', () => relay.send({ type: 'startGame' }), 'primary');
        start.disabled = why !== '';
        if (why) el('p', 'note', why, box);
      } else {
        button(actions, me?.ready ? 'Not ready' : 'Ready', () => relay.send({ type: 'setReady', ready: !me?.ready }), me?.ready ? '' : 'primary');
        el('p', 'note', 'The host starts the game when everyone is ready.', box);
      }
      button(actions, 'Leave', () => {
        relay.leave();
        finish(null);
      });
      st = status(box);
    };
    draw();
  });
}
