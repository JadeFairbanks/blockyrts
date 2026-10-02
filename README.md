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
   prints `final step 10000 hash f1ae866b`. Run it again: the same hash. (The
   M0, M1, M2 and M4 scripts run with `"peaceful": true`, no night mobs, so they
   keep checking the world and the economy; M3's script has the monsters.)
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `44cda7eb`
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
   `44cda7eb` at step 40, with two players `141caae4`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash 202b08c6`: two players dig trenches from a
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
   prints `final step 10000 hash 355d619d`: workers chop and quarry, the Big
   House trains a worker rallied onto the trees, a wheat field and a torch
   post go up, farmers farm, everyone goes home at dusk and comes out at day,
   a group walks out and chops further off, and the Longhall upgrade starts.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 3

The build order's check for M3 is: *survive night 0 with the starting
warrior, four workers and a softwood fence; skeleton archers shoot over it on
night 5 and a bomber breaks a softwood column on night 10; a dug trench turns
zombies aside; Equip Best hands out flint spears; losing every worker with no
main base or farm left ends the game with the night count as the score.*

1. `pnpm test` runs those six checks as scenario tests in
   `packages/sim/test/m3.test.ts` (night 0 behind a fence on several seeds,
   an archer on night 5 hurting a worker over an unbroken wall, a bomber on
   night 10 breaking a column, a zombie walking round a trench where it walks
   straight in without one, Equip Best giving two new warriors flint spears,
   and the game ending with *Nights survived: 3*), plus a save taken in the
   middle of a fight carrying on to the same hash.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. A warrior with a
   flint-tipped spear (and a club as backup) stands by the Big House with the
   four workers. The first night comes after 3 min of day and 40 s of dusk.
   Without walls, night 0 is hard: the zombies, bats, rats and spiders that
   come out of the dark edge will kill the warrior and chew down the Big
   House. With **Speed** in the debug panel you can get there quickly.
3. **Walls.** Workers, B then G (Walls): softwood, hardwood and stone walls,
   gates (east to west or north to south) and towers. Drag with a wall to
   place a line a column at a time; gates are 3 columns wide and let your
   units through but not monsters. A ring of softwood wall round the Big
   House (about 64 to 80 softwood) holds night 0. Climbers go over walls,
   bats fly over, archers shoot over, and bombers blow columns apart; a
   message says when a wall is broken, and workers repair it with R.
4. **Fighting.** Select the warrior: A then a click on a monster attacks it, A
   then ground attack-moves (the cursor turns red); a right click on a
   monster attacks too. H holds position, P then ground patrols, S stops. Y
   cycles the lock: Auto (bow while the enemy is far, spear when it is close),
   Melee only, Ranged only. Spears stab over a wall; clubs and axes cannot
   reach across it. Hits throw sparks, splinters or blood, units limp when
   hurt, and the dead lie for a few seconds then sink.
5. **Equipment.** Select the Big House: K opens the crafting menu on the grid
   keys (K then A makes a hardwood club); F refurbishes items back into
   resources; A trains a warrior for 30 food and a club from the stock. Select
   units and press Q (Equip Best): they walk to the Big House and take the
   best they can use, highest rank first. With one unit selected, I opens its
   equipment: a slot, then an item, to hand-pick it, and the weight it
   carries (over 50 lb slows it). Auto-Equip (F4, on the utility bar) hands
   new gear out by day. Flint gear needs Flint tools researched at a
   Scholar's Lodge (K, the research menu); bows need archery, trained at a Barracks (U with
   warriors selected).
6. **Towers.** Build a tower, select ranged warriors (sling, javelins or a
   bow) and press E then click the tower: up to 4 garrison it and shoot from
   the top with 10 m more sight. U lets them out.
7. **Digging.** Workers, D, then drag over the ground: a see-through box shows
   the cut; + and - (or the wheel while marking) set the depth, about 34 cm a
   step down to 3 m. Left click confirms. Marking a slope that rises more than
   about 2 m starts a tunnel instead (+ and - then set its height). Digging
   puts Earth (or stone, flint, sand...) in the pool. B, Z (Earthworks) heaps
   an earth bank, a ramp (drag from the bottom to the top) or fill from that
   Earth. Marked areas stay outlined until done; right-click one with workers
   to help. Zombies walk round a trench they cannot climb out of.
8. **Losing.** When every worker is dead and no main base or farm stands, the
   game is over and the screen shows the nights survived.
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m3-nights.json --quiet`
   prints `final step 10000 hash b97189c3`: the Big House crafts a club and a
   spear, two workers raise a gate and a softwood wall ring while two chop
   and then join them, Equip Best and Auto-Equip, the warrior holds inside
   the gate through night 0 while a debug skeleton archer and bomber come at
   the camp (the warrior falls and some columns are broken, but the Big House
   and all four workers come through), then at
   dawn the workers dig a trench and heap an earth bank from its Earth.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 4

The build order's check for M4 is: *research Flint tools at a Scholar's
Lodge, smelt bronze at a Casting Hearth, climb through Bloomery and Ironworks
to a Steelworks fed with vein iron hauled by ox cart from a tier 2 mineshaft;
stew from a Great Kitchen feeds the town; a wild horse is tamed at the
Stables; warriors hunt deer with N and bring the meat home; Rations starves
workers but not troops.*

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m4.test.ts`: Flint tools researched at a Lodge; copper
   and tin smelted at a Casting Hearth with a worker inside, then bronze; a
   fishing rod crafted; stew cooked at a Great Kitchen; Rations on troops only
   starving the workers but not the warrior; Don't eat keeping eggs back;
   wild animals stocked round the camp; a wild horse tamed with 5 carrots and
   stabled; a warrior hunting a deer and carrying the meat home; a carcass
   left by a killed boar; a livestock farm breeding a calf and slaughtering
   for meat; a prospect report, a tier 2 mineshaft bringing up vein iron and a
   worker with an ox cart and a tamed ox hauling it to the Big House; and a
   save taken with animals about carrying on to the same hash. The climb from
   Bloomery to Steelworks is the same forge with its upgrades and recipes
   (Table 2b), tested through the forge's smelting rows.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. Herds of hares,
   deer, chickens and cattle graze round the camp from the start; wolves,
   boar, lynx and the rest live further out (the Deepwoods hold the bears).
   Use **Speed** in the debug panel to move through the days.
3. **Research.** Build a Scholar's Lodge (B, Advanced). Select it and press K:
   the research menu lists every step, greyed out with what it still needs.
   Flint tools costs 10 flint and 20 softwood lumber; flint lies in small
   scatters near the camp. Research shows on the Lodge's queue and stops
   while the troops starve.
4. **The forge and making things.** A Forge starts as a Casting Hearth.
   Put workers in it (E, then click it), select it and press K (Smelt):
   copper and tin ingots from ore and charcoal, bronze from both, and the
   tools and weapons that level makes. Its upgrades are the Bloomery,
   Ironworks and Steelworks (Table 2b). The Kiln (charcoal, bricks, glass),
   Tannery, Herbalist, Cooking huts up to the Great Kitchen (stew), Workshop
   (carts, trinkets) and Barracks (training, Table 7) all open the same way
   with K; the Big House's K menu crafts tools, weapons, fishing rods and nets.
5. **Food.** The resource bar shows food and supply; click it for every
   resource. In that list each food has a button to keep it back from meals
   (Don't eat). F9 (or the Rations button on the utility bar) cycles Rations:
   everyone eats, troops only, or workers only; whoever goes without starves,
   slows and stops healing, and the food count turns red. A unit selected with
   F walks to the nearest main base, storehouse or cooking building to eat
   and heal (2 food for half its health over 10 s, plus medicine if badly
   hurt).
6. **Hunting.** Select a warrior and press N, then click a deer: it chases
   and wears the deer down (a wounded animal tires), then butchers the
   carcass and carries the meat home. Press N twice to keep hunting: it takes
   the nearest game within 40 m of where it started, finishes wounded animals
   first and walks home at dusk. Workers selected with it follow and haul the
   carcasses. Boar fight back; wolves hunt in packs; bears are never game
   unless clicked.
7. **Animals.** Right click a wild animal with workers to tame it (a horse
   wants 5 carrots and a Stables with room; Table 3 lists the rest). Tamed
   cattle and chickens live at a Livestock farm, breed when a pair is home,
   and K there slaughters one for meat, keeping the breeding pairs longest.
   Badgers knock over torches far from the main base.
8. **Mining and fishing.** Select workers and press T, then click the
   ground: they prospect it (Poor, Fair, Good or Rich), which sets what a
   mineshaft there brings up (Table 5). A Mineshaft goes on bare stone; four
   miners inside bring up stone, ore, coal and at tier 2 vein iron, gold or
   silver and gems, kept at the shaft. Right click the shaft with workers to
   haul it home; a worker with an ox cart (crafted, then right click a tamed
   ox to hitch it) carries far more. A Fishing dock's hands fish the nearest
   stretch within 30 m that still has more than half its fish, moving on as
   stretches run low; workers with a rod or net fish from the shore.
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m4-economy.json --quiet`
   prints `final step 10000 hash f65ef4d1`: two workers pick flint while two
   chop; the warrior hunts with N twice, wears down two deer north of the
   camp, brings their meat home and walks home at dusk; a worker prospects
   (Fair); Rations goes to troops only and the workers starve until it goes
   back; eggs are kept back with Don't eat; a Scholar's Lodge goes up and
   researches Flint tools at night; the Big House makes a sling and a fishing
   rod from wild flax, and Equip Best hands the warrior the sling.
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

