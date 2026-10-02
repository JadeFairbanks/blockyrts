# @blockyrts/protocol

Everything the browser and the server must agree on. Pure TypeScript with no
DOM or Node dependency, so it runs in the page, in the sim worker and on the
server.

- `messages.ts`: every relay WebSocket message, as a hand-written binary codec
  (technical decisions 1 and 3). Client to server tags 1 to 99, server to
  client 100 and up.
- `orders.ts`: the order payload inside a frame. Schema-free: any plain object
  of integers, strings, booleans, arrays and nested objects, so the sim's later
  order kinds travel without a protocol change. Fractions are refused. The
  relay never decodes it.
- `lockstep.ts`: `LockstepScheduler`, the client half of lockstep: which frames
  to send (one per step, for step N + input delay), when step N may run (every
  playing slot's frame is in), the decoded inputs for a step in slot order,
  and starting over after a snapshot or a rejoin. A frame with the Leave flag
  marks a slot that leaves at that step (the host chose to carry on without
  them); the step's input lists it in `left` so the sim can share out their
  assets.
- `save-file.ts`: the save container: magic `SACF`, an uncompressed header
  (format and game version, match, seed, step, night, label, players with their
  account ids) and gzip sections (`SIMS` for the sim's whole-state
  serialisation, `CHNK` for edited chunks, more tags later). The same bytes are
  a save slot, a rejoin snapshot and a desync reload.
- `api.ts`: HTTP routes, request and response shapes, error codes.
- `constants.ts`: protocol version, limits, timings, the join-code alphabet and
  the eight player colours.

## How a client uses it

1. `POST /api/guests` or sign in, then open `ws(s)://<server>/relay` and send
   `hello`; the server answers `welcome`.
2. `createRoom` (a seed, or a save id to continue) or `joinRoom` with the code;
   `roomState` arrives on every change and carries your slot and a rejoin token.
3. On `gameStart`, build the world from the seed (or load the snapshot) and
   make a `LockstepScheduler`. Every step: queue orders, send
   `scheduler.outgoing(step)` as `frame` messages, run the step only when
   `canRun(step)`, with `take(step)`, stamping each order's player with its
   slot. Every 20 steps send `hash` with the current epoch.
4. Stop stepping while `pauseState.paused`. Answer `snapshotRequest` with a
   save file of the current state; on `loadSnapshot` replace the state and
   `reset()` the scheduler; on `resume` (a rejoin with your own state) just
   `reset()`. Answer every `ping` with `pong`.

`packages/tools/src/net/test-player.ts` is a complete headless client that
does all of this.
