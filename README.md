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
   prints `final step 10000 hash 6c5e1226`. Run it again: the same hash.
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `ba4d64fa`
   at step 40 (`pnpm sim:run --seed 1 --steps 40`). Right-click the ground to
   move your units, which changes the hash from then on.

## How a tester checks milestone 1

The build order's check for M1 is: *type a seed, start a game and pan and zoom
across a generated world with cells, barrier edges, gaps, rivers with fords, a
start basin and a pocket per player; the minimap fills in behind a debug
reveal; two machines with the same seed show the same land and the same hash.*

1. `pnpm dev` and open http://localhost:5173. Type a seed (or press Random),
   pick the number of players and press Start. The camera starts over your
   Big House and four workers in your pocket: flat grass with a pond or a
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
   `ba4d64fa` at step 40, with two players `99eb58e1`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash eaefa3d4`: two players dig trenches from a
   pond and a stream, raise a wall, fell trees and walk out of the basin.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.
6. `pnpm --filter @blockyrts/tools map-viewer --seed 1 --size 3000 --edges --out map.png`
   draws the land from above, with the cell edges in white and your pocket
   in red.

## How a tester checks milestone 2

The build order's check for M2 is: *start in a camp of a Big House and 4
workers; chop, quarry and build; a crop field with farmers puts wheat in the
pool; the Big House upgrades to a Longhall; the clock runs day, dusk, night
and dawn; torches claim land; Idle Gatherer finds the worker whose trees ran
out.* (The warrior joins in milestone 3.)

1. `pnpm dev`, open http://localhost:5173/?seed=1 and start. Your Big House
   stands in the pocket with four workers in front of it. The clock (top
   centre) counts down the day: 3 min of day, 40 s of dusk, 3 min of night,
   40 s of dawn, and says *Day 1*, *Dusk*, *Night 0*, *Dawn*. The light warms
   at dusk, goes dim and blue at night and comes back at dawn. The resource
   bar (top right) shows the shared pool, food and supply; ▾ opens the full
   list.
2. **Gather.** Select workers (drag a box) and right-click a tree, a rock, a
   flint scatter or a hazel bush. They work it, carry 25 lb loads to the Big
   House and come back; the load shows on their back and the pool goes up
   when it is dropped off. Felling a softwood tree also gives 2 resin. A
   node with no room left sends extra workers to the next one. When the
   trees run out, the worker goes idle, a message says so, and the Idle
   Gatherer button (F1, bottom left, with the number of idle workers)
   selects it and centres on it. C returns cargo; G then a click gathers.
3. **Build.** With workers selected press B (Basic Structures). Buildings
   sit on the grid keys Q W E R T / A S D F G / Z X C V, with B for Back:
   B then W opens Farms, B then C opens Lights. Pick one and a ghost follows
   the cursor with a green or red tile per column, the 10 m of land it will
   claim, and for lights their light and claim rings. Left click places it
   (Shift + click places several and keeps the ghost); drag with a torch post
   to place a line of them 8 m apart. Greyed buttons say why in their tooltip
   (a later milestone, a missing research, the main base level); buttons in
   red cannot be paid for yet. The cost is taken when a worker arrives and
   starts; scaffolding goes up and the building rises as it is built. Select
   an unfinished building and press X to take it down for 75% back.
4. **Farm.** Build a wheat field (B, W, Q), then right-click it with two
   workers: they become its farmers. A new field lies fallow for 2 days (the
   panel counts it down), then wheat comes into the pool while they work.
   Press **Speed** in the debug panel for 4 or 16 times speed. Farmers go into
   their farmhouse at dusk by themselves.
5. **Train and rally.** Select the Big House: W trains a worker (20 food;
   Shift + W queues 5), the queue shows in the panel and a click on an item
   cancels it for a full refund. R then a click (or right-click with the Big
   House selected) sets the rally point: on a tree, new workers start
   chopping it. Supply starts at 4 of 8; when it is full, training waits
   until you build or upgrade farms.
6. **Upgrade.** With 100 softwood and 40 stone, select the Big House and
   press G: the Longhall is paid for, then right-click the Big House with
   workers to build it. Each level up to the Citadel has its own look.
7. **Lights and night.** A torch post (2 softwood, 1 resin) claims 5 m round
   it while lit and burns a softwood every 3 days; near the Big House it
   refuels itself from the pool. At dusk the Everyone Home button (J) lights
   up: it sends everyone to shelter in the Big House or a farm, and at day
   they come out and carry on. Lights more than 40 m from the main base are
   counted under the clock against the night's limit.
8. **Orders and groups.** Shift queues orders (hold Shift to see the queue
   lines). M moves, S stops, E enters a building, R repairs (press R twice to
   repair everything nearby), U sends workers to train a rank. The group key
   (\`, left of 1) + a number saves a control group, the number selects it,
   twice centres on it, and the tabs above the selection panel do the same
   with the mouse. Tab cycles subgroups in a mixed selection; Backspace
   centres on the Big House; Space jumps to the latest alert. Every hotkey
   can be rebound in the menu (F10, Hotkeys).
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m2-camp.json --quiet`
   prints `final step 10000 hash b49ca0fd`: workers chop and quarry, the Big
   House trains a worker rallied onto the trees, a wheat field and a torch
   post go up, farmers farm, everyone goes home at dusk and comes out at day,
   a group walks out and chops further off, and the Longhall upgrade starts.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

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

