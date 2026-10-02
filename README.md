# Survive and Conquer

A co-op browser RTS survival game: build by day, hold the walls by night, and
see how many nights you last. The design spec is [docs/blueprint.md](docs/blueprint.md),
a copy of the canonical blueprint document.

This is milestone 1 of the build order: a generated world from the seed (cells,
barriers, depth bands, rivers, ponds, start pockets, trees and rocks, fog of
war, water that flows into dug land) drawn in the browser, with the camera,
the mouse-only controls shell, the HUD panels and the minimap. Workers,
gathering and building come in milestone 2.

## Setup

You need Node.js 22 or later and pnpm 10 (`corepack enable` gives you pnpm).

```sh
pnpm install
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm check` | Lint, typecheck and test everything (run before every push) |
| `pnpm test` | All Vitest tests, including the cross-browser hash check |
| `pnpm lint` | ESLint, including the determinism bans on `packages/sim` |
| `pnpm typecheck` | `tsc` for every package |
| `pnpm sim:run` | The headless runner (options below) |
| `pnpm dev` | The client at http://localhost:5173 |
| `pnpm audio:dev` | The audio audition page at http://localhost:5174 |
| `pnpm --filter @blockyrts/tools map-viewer --seed 1 --size 3000 --out map.png` | Draws a seed's land from above as a PNG (`--players`, `--metres-per-pixel`, `--centre-x`, `--centre-z`, `--edges`) |
| `pnpm --filter @blockyrts/tools models:build` | Converts the Blockbench models to glb for the client (`pnpm dev` and the client build run it first) |
| `pnpm assets:manifest` | Lists packages/assets/src/MANIFEST.md and checks it against the model files |

The cross-browser test uses Playwright's Chromium, Firefox and WebKit. A
browser that is not installed is skipped locally with a warning; install them
with `pnpm --filter @blockyrts/tools exec playwright install chromium firefox webkit`.
CI installs all three and fails if any is missing.

## Packages

| Package | Role |
|---|---|
| `packages/sim` | The game rules. Integer maths only, seeded random streams, zero dependencies, no DOM; never imports the client, the server or three.js |
| `packages/client` | The browser game: runs the sim in a Web Worker, draws with three.js |
| `packages/tools` | Headless runner, desync tool, cross-browser test, the headless two-player network test, map viewer, model converter; balance harness placeholder |
| `packages/protocol` | Relay message codecs, the lockstep scheduler, the save file container and the HTTP API shapes; see its README |
| `packages/server` | Accounts and save API, lobby and lockstep relay in one Node process; see its README for settings |
| `packages/audio` | Every sound and the music, synthesised in code; the Web Audio engine and an audition page (`pnpm audio:dev`) |
| `packages/assets` | Source models and images; see its README for the layout and rules asset pull requests follow |

## The number tables

`packages/sim/src/data/number-tables.ts` holds the blueprint's tables 1 to 19
(Table 2 as 2a to 2f) as data: every cell's text and whether it is a
suggested value, marked (s), that the balance pass may retune. It is generated
from `docs/blueprint.md`, which is itself generated from the canonical .docx:

```sh
python3 packages/tools/scripts/extract-blueprint.py <path to adventure-blueprint-controls.docx> docs/blueprint.md
pnpm --filter @blockyrts/tools gen:tables
```

A test fails if the committed tables are out of date with `docs/blueprint.md`.
The rules every table uses (armour cap, shields, fire, experience, ranks,
nutrition and trade value) are integer functions in `packages/sim/src/rules.ts`.

## The headless runner

```sh
pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m0-demo.json
```

It builds the world from the seed, applies the order script's frames at the
steps they name, and prints `step N hash xxxxxxxx` every 20 steps and a final
line. `--quiet` prints only the final line. `--record out.json` also writes a
recording that the desync tool can compare: `pnpm desync a.json b.json`
reports the first step and field where two recordings differ.

Order scripts are JSON: `{ "frames": [{ "step": 10, "orders": [{ "kind": "move", "player": 0, "units": [1, 2], "x": 240000, "z": -96000 }] }] }`.
Coordinates are world units: 8,000 to the metre.

## How a tester checks milestone 0

The build order's check for M0 is: *run the headless simulation for 10,000
steps from seed 1 in Node, Chrome and Firefox and get three identical state
hashes; a scripted order list replays to the same hash.*

1. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m0-demo.json --quiet`
   prints `final step 10000 hash dababc31`. Run it again: the same hash.
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `e7b36fd4`
   at step 40 (`pnpm sim:run --seed 1 --steps 40`). Right-click the ground to
   move your units, which changes the hash from then on.

## How a tester checks milestone 1

The build order's check for M1 is: *type a seed, start a game and pan and zoom
across a generated world with cells, barrier edges, gaps, rivers with fords, a
start basin and a pocket per player; the minimap fills in behind a debug
reveal; two machines with the same seed show the same land and the same hash.*

1. `pnpm dev` and open http://localhost:5173. Type a seed (or press Random),
   pick the number of players and press Start. The camera starts over your
   four workers and your warrior in your pocket: flat grass with a pond or a
   stream, hazel, trees, loose stone and flint nearby, and the rest of the
   land black until explored.
2. Pan with the screen edges, the arrow keys or a middle-button drag; zoom
   with the wheel or Page Up and Page Down; Home resets the zoom. Right-click
   to walk your units out: the land they see turns from black to colour,
   and stays grey once they have left.
3. The debug panel (top left) has the tools for looking around. **Reveal**
   explores 150 m round the middle of the view, and the minimap fills in
   behind it. **Show all** draws the land without fog on your screen only,
   so you can pan across cells, barrier edges (low hills, ridges, cliffs,
   ravines, rivers, marshes), their gaps, fords and the next pockets.
   **Dig** and **Raise** change the land in the middle of the view, and water
   next to a dug pit flows into it. **Fell** takes everything from the
   selected trees, bushes and rocks: trees fall and drop seeds.
4. Two machines: open the same seed and player count on both and compare the
   hash in the debug panel at the same step: for seed 1 with one player it is
   `e7b36fd4` at step 40, with two players `cd82d62c`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash 8eced6e9`: two players dig trenches from a
   pond and a stream, raise a wall, fell trees and walk out of the basin.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.
6. `pnpm --filter @blockyrts/tools map-viewer --seed 1 --size 3000 --edges --out map.png`
   draws the land from above, with the cell edges in white and your pocket
   in red.

## How a tester checks the multiplayer server (milestone 9, server side)

The game screens for hosting, joining and saving come with a later client
milestone; the server and its protocol are tested headless.

1. `pnpm --filter @blockyrts/tools net:test` starts a server in memory and
   drives two simulated players through it with the real sim: the host makes
   an account and a guest joins by code; colours, ready and start; a few
   hundred steps of relayed orders; one machine's state is corrupted and the
   relay names it and reloads everyone from the host; the guest drops (the
   match pauses and the host is asked what to do) and rejoins, then comes back
   as a fresh page from a snapshot; the guest is told to make an account
   before saving; the host saves, four dawn autosaves keep three, both quit,
   the host loads the save and the guest rejoins by code. It ends with a
   one-machine replay of the same inputs landing on the same hash. It prints
   each check; all 27 pass.
2. To run a server: `pnpm --filter @blockyrts/server dev` (port 8080, in
   memory), then `SERVER_URL=http://localhost:8080 pnpm --filter
   @blockyrts/tools net:test` against it. The host-choice step waits the real
   30 s and plays at the real 20 steps a second against an outside server, so
   that run takes about two minutes.
3. With PostgreSQL and object storage: set `DATABASE_URL`, `SAVE_STORE=s3` and
   the `S3_*` variables (or `SAVE_STORE=disk`) before either command. CI runs
   the test against PostgreSQL 16 and S3Mock (an S3-compatible test server), and builds the server's Docker
   image and checks `/healthz`.

