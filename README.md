# Survive and Conquer

A co-op browser RTS survival game: build by day, hold the walls by night, and
see how many nights you last. The design spec is [docs/blueprint.md](docs/blueprint.md),
a copy of the canonical blueprint document.

This is milestone 0 of the build order: the project skeleton, the deterministic
simulation, the desync hash and the headless runner. There is no game to play
yet.

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
| `packages/tools` | Headless runner, desync tool, cross-browser test; balance harness and map viewer placeholders |
| `packages/protocol` | Network message codecs (stub until M9) |
| `packages/server` | API, lockstep relay and save store (stub until M9) |
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
   step as the headless runner with no script: for seed 1 that is `2c8fc58e`
   at step 40 (`pnpm sim:run --seed 1 --steps 40`). The blue blocks are your
   units: right-click the ground to move them, which changes the hash from
   then on. The grey ones wander on their own using the seeded random stream.
