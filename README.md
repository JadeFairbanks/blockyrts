# Survive and Conquer

A co-op browser RTS survival game: build by day, hold the walls by night, and
see how many nights you last. The design lives in the code and its data tables;
each patch's notes are under `blueprint/` in the project files.

The build order's milestones 0 to 11 are in: the deterministic sim and its
tools, the generated world with the camera, HUD and minimap, workers and
building, warriors, combat and the nights, the economy (research, smelting,
food, animals, mining), the threats beyond the nights (lairs, fog nights,
tribes, goblin villages, creatures), the mages with their ten
spells, the neutral peoples, the Stables and siege, the menus and online
play, audio and the balance pass, and the troop rework (five troop types
trained at their tier, weapon and armour upgrades, no items). Each
milestone's checks are below.

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
| `pnpm balance:dev` | The balance editor at http://localhost:5175 |
| `pnpm --filter @blockyrts/tools balance` | The balance harness: pacing, supply at night 110 and the wave checks (`--pacing`, `--nights`, `--seeds`, `--csv`; docs/balance-pass.md) |
| `pnpm --filter @blockyrts/tools perf:sim` | Sim step time with thousands of monsters (`--units`, `--steps`, `--seed`; docs/performance.md) |
| `pnpm --filter @blockyrts/tools balance:apply <file>` | Applies a balance editor export to the sim's data files (`--dry-run`, `--force`) |
| `pnpm --filter @blockyrts/tools map-viewer --seed 1 --size 3000 --out map.png` | Draws a seed's land from above as a PNG (`--players`, `--metres-per-pixel`, `--centre-x`, `--centre-z`, `--edges`) |
| `pnpm --filter @blockyrts/tools models:build` | Converts the Blockbench models to glb for the client (`pnpm dev` and the client build run it first) |
| `pnpm --filter @blockyrts/tools footprints` | Measures each building level's walkable columns and the posts men stand on from its models, against the sim's footprint table |
| `pnpm --filter @blockyrts/client art` | Renders the main menu's battle and the lobby's map from the game's models and world into `packages/client/src/ui/art/` (`battle` or `map` for one; needs `models:build` first) |
| `pnpm assets:manifest` | Lists packages/assets/src/MANIFEST.md and checks it against the model files |

The cross-browser test uses Playwright's Chromium, Firefox and WebKit. A
browser that is not installed is skipped locally with a warning; install them
with `pnpm --filter @blockyrts/tools exec playwright install chromium firefox webkit`.
CI installs all three and fails if any is missing.

CI (`.github/workflows/ci.yml`) runs all of the above, the builds, the
two-player network test and the server image on every push to a pull request
and to `main`, with the cross-browser test alongside the rest in one job per browser engine. A new push cancels the run its branch's previous push started,
and pnpm's package store is cached between runs. It can also be run by hand
on any branch from the Actions tab.

## Packages

| Package | Role |
|---|---|
| `packages/sim` | The game rules. Integer maths only, seeded random streams, zero dependencies, no DOM; never imports the client, the server or three.js |
| `packages/client` | The browser game: runs the sim in a Web Worker, draws with three.js |
| `packages/tools` | Headless runner, desync tool, cross-browser test, the headless two-player network test, map viewer, model converter, balance harness, sim speed check |
| `packages/protocol` | Relay message codecs, the lockstep scheduler, the save file container and the HTTP API shapes; see its README |
| `packages/server` | Accounts and save API, lobby and lockstep relay in one Node process; see its README for settings |
| `packages/audio` | Every sound and the music: the sound redo's files (served from `packages/client/public/audio/`) with the code-made versions behind them; the Web Audio engine and an audition page (`pnpm audio:dev`) |
| `packages/balance` | The balance editor: every balance value in the sim, browsable and editable, exported as a JSON list of changes; see its README |
| `packages/assets` | Source models and images; see its README for the layout and rules asset pull requests follow |

## The data tables

Every number the game runs on is a data row next to the system that uses it
(buildings, recipes, kits, research, mobs and the rest under `packages/sim/src`).
The old blueprint document and the number tables generated from it are retired
(Patch 5). The rules every table uses (armour cap, shields, fire, experience, ranks,
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
   prints `final step 10000 hash 7a6598ed`. Run it again: the same hash. (The
   M0, M1, M2 and M4 scripts run with `"peaceful": true`, no night mobs, so they
   keep checking the world and the economy; M3's script has the monsters.)
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `fc7a33f8`
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
   land black until explored. With two or more players the others' Big
   Houses stand 10 to 15 m away (see "How a tester checks Jade's mini
   patch").
2. Pan with the screen edges, the arrow keys or a middle-button drag; zoom
   with the wheel or Page Up and Page Down; Home resets the zoom; hold `,`
   or `.` to turn the camera (Patch 5), a double tap turning it back to
   north. Right-click
   to walk your units out: the land they see turns from black to colour,
   and stays darker, still in colour, once they have left (grey before
   Patch 3; see "How a tester checks the fog look and hidden-unit
   outlines"). The land round your buildings stays fully lit (see "How a
   tester checks shared vision" below).
3. The debug panel (top left) has the tools for looking around. In Patch 2
   it is hidden until you type M N B V C X Z in order in the game (see "How
   a tester checks Patch 2's lights, tips, tester tools and minimap"); every
   check in this file that names the debug panel or the debug bar opens it
   that way first. **Reveal**
   explores 150 m round the middle of the view, and the minimap fills in
   behind it. **Show all** draws the land without fog on your screen only,
   so you can pan across cells, barrier edges (low hills, ridges, cliffs,
   ravines, rivers, marshes), their gaps and fords.
   **Dig** and **Raise** change the land in the middle of the view, and water
   next to a dug pit flows into it. **Fell** takes everything from the
   selected trees, bushes and rocks: trees fall and drop seeds.
4. Two machines: open the same seed and player count on both and compare the
   hash in the debug panel at the same step: for seed 1 with one player it is
   `fc7a33f8` at step 40, with two players `3a816b4a`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash 7b2e4549`: two players dig trenches from a
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
   at dusk, goes dim and blue at night and comes back at dawn. The
   stockpile (top right) shows food, supply and the shared pool as an
   inventory of square slots (see "How a tester checks the inventory grid").
2. **Gather.** Select workers (drag a box) and right-click a tree, a rock, a
   flint scatter or a hazel bush. They work it, carry 25 lb loads to the Big
   House and come back; the load shows on their back and the pool goes up
   when it is dropped off. Felling a softwood tree also gives 2 resin. A
   node with no room left sends extra workers to the next one. When the
   trees run out, the worker goes idle, a message says so, and the Idle
   Gatherer button (F1, bottom left, with the number of idle workers)
   selects it and centres on it. C returns cargo; G then a click gathers.
3. **Build.** With workers selected press B (Build; Basic Structures before
   Patch 2). Each building is on the letter in its button's corner, and Esc
   goes back: B then F is a Farm, B then T opens Lights (Patch 4; before,
   the buildings sat on the grid layout Q W E R T / A S D F G / Z X C V with
   B for Back, so B then W opened Farms). Pick one and a ghost follows
   the cursor with a green or red tile per column, the 10 m of land it will
   claim, and for lights their light and claim rings. Left click places it
   (Shift + click places several and keeps the ghost); drag with a torch post
   to place a line of them 8 m apart. Greyed buttons say why in their tooltip
   (a later milestone, a missing research, the main base level); buttons in
   red cannot be paid for yet. The cost is taken when a worker arrives and
   starts; scaffolding goes up and the building rises as it is built. Select
   an unfinished building and press X to take it down for 80% back.
4. **Farm.** Build a wheat field (B, W, Q; since Patch 2 the Farm, B then F
   from Patch 4), then right-click it with two
   workers: they become its farmers. The field grows at once: its panel shows
   a harvest bar filling and when the next 6 wheat come in (see "How a tester
   checks farm harvests"). Press **Speed** in the debug panel for 4 or 16
   times speed. Farmers go into their farmhouse at dusk by themselves.
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
   it while lit. In Patch 2 lights need no fuel, and the bonfire (15
   softwood) lights 20 m and claims 10 m. At dusk the Everyone Home button (J) lights
   up: it sends everyone to shelter in the Big House or a farm, and at dawn,
   once no monster within 25 m of their shelter is alive (in the day whatever
   the monsters do), they come out and carry on (Patch 4; at daybreak
   before). Lights more than 40 m from the main base are
   counted under the clock against the night's limit.
8. **Orders and groups.** Shift queues orders (hold Shift to see the queue
   lines). M moves, S stops, E enters a building, R repairs (press R twice to
   repair everything nearby), U sends workers to train a rank. The group key
   (\`, left of 1) + a number saves a control group, the number selects it,
   twice centres on it, and the tabs above the selection panel do the same
   with the mouse. Tab cycles subgroups in a mixed selection; Backspace
   centres on the Big House; F4 jumps to the latest alert (Space until patch
   notes 1, when Space became Centre on the selection). Every hotkey
   can be rebound in the menu (F10, Hotkeys).
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m2-camp.json --quiet`
   prints `final step 10000 hash ec2fbd37`: workers chop and quarry, the Big
   House trains a worker rallied onto the trees, a wheat field and a torch
   post go up, farmers farm, the choppers move on to more pines when their
   first trees fall, everyone goes home at dusk and comes out at day, a group
   walks out and chops further off, and the Longhall upgrade starts. The
   three starting warriors stay home.
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
3. **Walls.** Workers, B then D (Defences; before Patch 4, B then G opened
   Walls): softwood, hardwood and stone walls,
   gates (east to west or north to south) and towers. Click with a wall to
   place one, then click further points: each click builds the whole stretch
   from the last point (see wall and tunnel chains below); gates are 3 columns wide and let your
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
5. **Equipment.** Select the Big House: K opens the crafting menu, each
   product on the letter shown on its button (Patch 4; before, on the grid
   keys: K then A made a hardwood club); F refurbishes items back into
   resources; A trains a warrior for 30 food and a club from the stock. Select
   units and press Q (Equip Best): they walk to the Big House and take the
   best they can use, highest rank first. With one unit selected, I opens its
   equipment: a slot, then an item, to hand-pick it, and the weight it
   carries (over 50 lb slows it). Auto-Equip (F4, on the utility bar) hands
   new gear out by day. Flint gear needs no research (since the gap fixes
   after milestone 5); bows need archery, trained at a Barracks (U with
   warriors selected).
6. **Towers.** Build a tower, select ranged warriors (sling, javelins or a
   bow) and press E then click the tower: up to 4 garrison it and shoot from
   the top with 10 m more sight. U lets them out.
7. **Digging.** Workers, D, then drag over the ground: a see-through box shows
   the cut; + and - (or the wheel while marking) set the depth, about 34 cm a
   step down to 3 m. Left click confirms. A box over a hill digs it away
   (Patch 5: below 0 depth the box goes up; before, a slope rising more than
   about 2 m started a tunnel); D again,
   or a click on a cliff face, digs a level tunnel in a chain of stretches
   (see wall and tunnel chains below). Digging
   gives Earth (or stone, flint, sand...), which the workers carry to the
   nearest main base or Storehouse 25 lb at a time and then come back to the
   dig (Patch 4; before it, what was dug went straight to the pool). B, D and
   then K, P or I (Earthworks, under Defences since Patch 2; before Patch 4,
   B, Z) heaps an earth bank, a ramp (drag from the bottom to the top) or
   fill from that Earth. A marked area shows its box while a selected worker
   is on it and a dotted line otherwise, until done; right-click one with
   workers to help. Zombies walk round a trench they cannot climb out of.
8. **Losing.** When every worker is dead and no main base or farm stands, the
   game is over and the screen shows the nights survived.
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m3-nights.json --quiet`
   prints `final step 10000 hash e78c2c0e`: two workers raise a gate and a
   softwood wall ring while two chop and then join them; the Big House
   trains a long-melee spearman and the three starting warriors walk to it
   to upgrade their cudgels to flint hand-axes (Upgrade Weapon, milestone
   11); they hold inside the gate through night 0 while a debug skeleton
   archer and bomber come at the camp (the spearman and the axemen fall and
   some columns are broken, but the Big House and all four workers come
   through), then at dawn the workers dig a trench, carry its Earth to the
   Big House 5 at a time (Patch 4) and heap an earth bank from it.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 4

The build order's check for M4 is: *research Bronze at a Scholar's
Lodge (Flint tools research was removed after milestone 5), smelt bronze at a Casting Hearth, climb through Bloomery and Ironworks
to a Steelworks fed with vein iron hauled by ox cart from a tier 2 mineshaft;
stew from a Great Kitchen feeds the town; a wild horse is tamed at the
Stables; warriors hunt deer with N and bring the meat home; Rations starves
workers but not troops.*

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m4.test.ts`: Bronze researched at a Lodge; copper
   and tin smelted at a Casting Hearth with a worker inside, then bronze; a
   fishing rod crafted; stew cooked at a Great Kitchen; Rations on troops only
   starving the workers but not the warrior; Don't eat keeping eggs back;
   wild animals stocked round the camp; a wild horse tamed with 5 carrots and
   stabled; a warrior hunting a deer and carrying the meat home; a killed
   boar's meat and hide lying as loot (no carcass since Jade's play-test
   notes); a livestock farm breeding a calf and slaughtering
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
   Bronze, the first step, needs a Casting Hearth and a tin ingot smelted
   first; 10 copper ingots and 2 tin ingots. Research shows on the Lodge's queue and stops
   while the troops starve.
4. **The forge and making things.** A Forge starts as a Casting Hearth.
   Put workers in it (E, then click it), select it and press K (Smelt):
   copper and tin ingots from ore and charcoal, bronze from both, and the
   tools and weapons that level makes. Its upgrades are the Bloomery,
   Ironworks and Steelworks (Table 2b). The Kiln (charcoal, bricks, glass),
   Tannery, Herbalist, Cooking huts up to the Great Kitchen (stew), Workshop
   (carts, trinkets) and Barracks (training, Table 7) all open the same way
   with K; the Big House's K menu crafts tools, weapons, fishing rods and nets.
5. **Food.** The stockpile shows food and supply beside the inventory grid.
   Right click a food's slot to keep it back from meals (Don't eat): it is
   crossed out until you right click it again. F9 (or the Rations button on the utility bar) cycles Rations:
   everyone eats, troops only, or workers only; whoever goes without starves,
   slows and stops healing, and the food count turns red. A unit selected with
   F walks to the nearest main base, storehouse or cooking building to eat
   and heal (2 food for half its health over 10 s, plus medicine if badly
   hurt).
6. **Hunting.** Right-click a deer with a warrior: it chases and wears the
   deer down (a wounded animal tires), takes the meat into its bag and hands
   it in at the main base. Press N (Hunt) and it keeps hunting by itself and
   comes home by nightfall (Jade's play-test notes changed both; see "How a
   tester checks loot, Hunt and Gather" below). Workers selected with it
   follow and carry the meat. Boar fight back; wolves hunt in packs; bears
   are never game unless clicked.
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
   prints `final step 10000 hash 360f14c0`: two workers pick flint while two
   chop; a starting warrior hunts with N double-tapped, wears down the deer
   north of the camp with its cudgel, brings the meat home and walks home at
   dusk; a worker prospects (Fair); Rations goes to troops only and the
   workers starve until it goes back; eggs are kept back with Don't eat; a
   Scholar's Lodge goes up; at night the Big House trains a ranger with a
   leather sling paid in flax, and at dawn the choppers upgrade their
   hardwood tools to stone and flint (Upgrade Tools, milestone 11).
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 5

The build order's check for M5 is: *by night 15 a barrow and a cave mouth sit
at the frontier and send a fifth of the wave; clearing the barrow by day
yields its hoard and 20 XP; 60% of the Fringe triggers a blood night with the
warning; outlying torches over the limit bring the goblin horde at dusk; a
Deepwoods village declares war on the fifth kill and marches 30 s after
dawn.*

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m5.test.ts`: the first lair placed at dusk on night 3,
   40 m or more beyond claimed land, with its guardian, and Table 8's cadence
   and cap after it; a lair's own share of the night (half its sleepers'
   threat since Patch 3) coming out of its mouth 20 s after nightfall; a barrow attacked by day waking its sleepers, and when
   broken leaving a ruin, a hoard as loot and 20 XP for the warriors near
   it; a blood night on night 13 once the Heartland is held, and one more
   when 60% of the Fringe is held, each with the warning and the double horn,
   twice as long and with the extra budget on the rarer kinds; fog halving
   sight until the day; the dusk horde, 3 cutters and a slinger for each
   outlying light over the limit; a village's huts, fire pit, totem, goblins,
   archers and mage; its warning one kill before war, war on the fifth kill
   and its warband marching 30 s after dawn; the mage's Stumble hex slowing a
   unit for its mana, and its Snuff putting out a torch that a worker relights
   for nothing; a tribe's band chasing what it sees and camping at dusk, and
   the first band turning up on day 3; a griffin hunting down what disturbed
   it; and a replay and a snapshot round trip landing on the same hash.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The debug panel
   has new buttons that act at the middle of the view (they are sim orders,
   so they are in the hash): **Lair** puts down the lair it names and moves
   on to the next of the eight kinds of Table 15; **Village** puts down a
   goblin village of 5 huts with a mage; **Tribe** a band of gnolls, kobolds
   or hobgoblins; **Creature** a giant beetle, giant hornets, a viper, a giant
   scorpion, a griffin or a minotaur; **Blood night** makes the coming night a
   blood night; **Fog** brings fog until the day. Lairs, huts and ruins stay
   drawn on explored land, with their catalogue models.
3. **Lairs.** In a normal game the first lair turns up at dusk on night 3 on
   the frontier: a cell next to your land that nobody holds, 40 m or more
   from claimed land and 30 m from your units, at a barrier's foot for a cave
   mouth (finished unlit tunnels count as caves). Then one every 3 nights to
   night 14, every 2 to night 44 and one a night after that, at most 2 + 1
   per 15 nights alive per player. A lair shows on every player's minimap
   as a red square from the moment it appears, explored land or not, with
   an alert and a red ping (Patch 3; see "How a tester checks lair alerts";
   before Patch 3 it showed once one of your units had seen it).
   Its guardians stand round it and its sleepers wait inside; each night a
   fifth of your wave comes out of it 20 s after nightfall. Attack it by day:
   "The barrow is stirring" means the sleepers are out. When it falls you
   read "The barrow is cleared. Its hoard: …", the hoard is loot your
   warriors carry home (or pick up where it lies),
   warriors within 20 m earn 20 XP, and its ruin stays; no lair comes within
   30 m of a ruin for 10 days.
4. **Blood and fog nights.** From night 13, when your side holds 60% of a
   band's cells (the Heartland first, then the Fringe and the Deepwoods, each
   once, never the Deadlands), the coming night is a blood night: the warning
   "A blood night is coming" at dusk (with the double horn once the sounds are
   wired in), the clock reads "Blood night", the night light turns red, and it
   lasts twice as long with more of the rarer monsters. From night 5 one
   night in ten is a fog night: "Fog is rolling in", the clock adds "fog", a
   grey fog closes in, and everyone's sight and every light's reach are
   halved until the day.
5. **Outlying lights and the dusk horde.** The clock's "Lights outside: n of
   m" counts torches more than 40 m from a main base against the coming
   night's limit. At dusk, for each light over the limit, 3 goblin cutters
   and a slinger (and a goblin chief for every 5 over) come out of the dark
   for those lights.
6. **Rising difficulty.** At dusk each player's night is read again: more
   than 10 buildings (not counting walls, defences and lights) add 2% each;
   each village at war adds 10% and each hunting creature you stirred up 5%;
   units and buildings out in deeper bands draw extra monsters from later
   nights, sent for the deepest of them.
7. **Hostile tribes.** From day 3, every other day, a band of 3 to 5 gnolls,
   4 to 6 kobolds or 3 or 4 hobgoblins turns up in the Fringe or the
   Deepwoods within 700 m of your town, while the world holds fewer than 20
   tribesmen per player. Bands roam cell to cell by day, chase what they see until nobody
   has seen it for 20 s (kobolds go for your torches) and camp round a fire
   at dusk, fighting only what attacks them. They do not burn in the sun.
8. **Goblin villages.** One Fringe cell in 12 and one Deepwoods cell in 4
   hold a village (never the start basin), found the first time your units
   come near: huts in a ring round a fire pit and a totem, 2 goblins a hut, 2
   archers and a goblin mage (in every Deepwoods village and half the Fringe
   ones). It shows on the minimap as an
   ochre ring. Kill 4 of its goblins (or break a building) and you are warned;
   the fifth kill, or a kill and a broken building, means war: the ring turns
   red, and every day 30 s after dawn 60% of its fighters (at least 4) march
   on your nearest building and go home at dusk. The mage snuffs lights on
   the way (right click one with a worker to relight it, 2 s), hexes a
   unit to stumble (slowed) and tosses sparks that leave wood smouldering.
   At peace a village rebuilds a hut every 5 days. Workers who break down a
   hut take 5 hardwood sticks and 2 hides from it.
9. **Territorial creatures.** Giant beetles (Fringe) and giant hornet nests
   (Deepwoods) see off what comes within 8 m; vipers and giant scorpions
   (Barrens) strike what steps close and poison it; a griffin (Barrens and
   Deadlands) or a minotaur (Deadlands), once disturbed, hunts its quarry
   down.
10. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m5-threats.json --quiet`
   prints `final step 10000 hash 2bc73b11`: the debug tools put a Barracks
   and a level 4 forge 44 m north with the stock for every tier (Troop kit),
   a barrow 60 m east of the Big House and a cave mouth 60 m west; the
   Barracks trains a crossbow ranger while the three starting warriors
   press Upgrade Weapon Max and Upgrade Armour Max and come back in carbon
   steel and steel; the four wake the barrow's dwellers, break it, take its
   hoard and earn XP; fog rolls in for night 0 and they guard the Big House;
   at dawn a goblin village goes up 56 m north (80 m before Jade's mini
   patch brought the Fringe nearer), a gnoll band to the south-east and a
   giant beetle to the north-west; they attack the village,
   which declares war on the fifth kill, and walk home; then a blood night is
   called for night 1. `pnpm test` runs it in Node, Chromium, Firefox and
   WebKit too. `node packages/client/test-e2e/m5-look.mjs` (with the dev
   server on port 5198) takes screenshots of the debug threats in a browser.

## How a tester checks the client gap fixes

Client only: the sim and every hash above are unchanged. Run `pnpm dev` and open http://localhost:5173/?seed=1.

1. **Edge panning beside the HUD.** Over the open game view the cursor pans in the outermost 4 px of the window, as before. Over a panel that touches the edge (the minimap and its button row at the bottom left, the command card at the bottom right, the selection panel at the bottom, the resource bar at the top right), slide the cursor along the panel: nothing pans. Push it into the outermost 2 px of the window and the camera pans that way; within 20 px of a corner it pans diagonally. Moving the cursor out of the window stops panning. Works the same in a window and in full screen (F11). Unit tests: `packages/client/test/edge-pan.test.ts`.
2. **Trees and hazel bushes.** Tree crowns are about 20% smaller (they shrink from the top, so no trunk tip shows) and trunks about 20% thicker. Hazel sticks are about 10% shorter, and cut a little more where needed so every tip ends inside the leaves. Hit boxes and selection are unchanged. Unit tests: `packages/client/test/props-shape.test.ts` checks every stick tip and trunk tip lies inside a leaf cube.
3. **Models load before the match starts.** Open the page with the browser cache cleared (DevTools, Network, Disable cache, and a throttled connection if you like). A short "Loading models..." card shows, then the match starts with workers and the warrior already drawn as models, never as blue blocks. Every other catalogue model loads in the background a few at a time; anything that comes into view before its model is in (a creature from the debug Creature button, a new building) jumps the queue and switches over as soon as it arrives. One broken model only leaves that one as a block. The full catalogue (PR #42) is on main, so plain `pnpm dev` builds all of it.

## How a tester checks the gap fixes

The sim fixes between milestones 5 and 6. The hashes above are updated:
workers hold a tool for each job, the M4 script makes flint tools instead of
researching them, units have a hop, and the walk map has a floor under
overhangs. Run `pnpm dev` and open http://localhost:5173/?seed=1.

1. **Early tools by job, no research (Table 2c).** Select the Big House and
   press K: Hardwood tools (the starting set: axe, digging stick, mallet and
   hoe), Stone maul (2 sticks, 3 stone), Stone hammer (2 sticks, 2 stone) and
   Flint axe and knife (2 sticks, 1 flint), all 10 s and all on day 0. The
   Scholar's Lodge has no Flint tools research any more, and bows, flint
   weapons and archery training need none. Stone is the blunt tier: the maul
   quarries and digs 15% faster than the digging stick, breaks rock slowly
   when tunnelling, and mines copper and tin ore (at the normal pace), but
   not iron; the hammer builds and repairs 15% faster than the mallet. Flint
   is the edge tier: the axe chops 25% faster and fells birch and hornbeam,
   the knife cuts herbs and flax and butchers 25% faster. There is no stone
   axe and no flint pick. From copper up each set is an axe, a pickaxe, a
   hammer and a sickle and does every job at its own pace, building
   included.
2. **Equip Best picks by job.** Make one of each, select a worker and press
   Q: it takes the flint axe and knife, the maul and the hammer, and hands
   its hardwood set back (it no longer uses it for anything). The I panel's
   Tools slot lists what it holds; picking a tool from the stock shows what
   it is for. A copper set later replaces all three. The tool in a worker's
   hand follows the job: maul for quarrying and digging, hammer for building.
   A rock or tree a worker's tools cannot work names the tool it needs ("needs
   a stone maul or better"), and so does the tooltip of the rock or tree.
   The maul and hammer show as their models once the model thread's review
   batch is merged (the ids are maul_stone and hammer_stone).
3. **Digging into a cliff face.** Pan a little way from the camp and press the
   debug **Hill** button (a 3.4 m soil hill with a 45 cm ledge on its south
   side and a 56 cm ledge on its north side). Select the workers, press D,
   then click the side of the hill (not its top): that starts a tunnel chain
   there, floored at the ground in front of the face. Move the mouse into the
   hill and click: a purple see-through box shows the stretch, 90 cm wide and
   2.25 m tall (+ and - or the wheel set the height), and the click marks
   it. Keep clicking to turn corners; a click on the last point or a right
   click ends it (since the wall and tunnel chains, below). The workers carve it from the face inwards and
   walk into the passage as it opens; Speed x16 helps. A press on top of the
   ground, or on the side of a step lower than 56 cm, still digs straight
   down. Dragging from the foot of a face up onto it still makes a tunnel
   too, as in milestone 3.
4. **Walking under an overhang.** Once the tunnel is finished, right-click
   inside it: the worker walks in and stands on its floor under the hill, and
   out of the far end if it goes all the way through. Natural caves and
   arches with 1.8 m of headroom are walkable the same way.
5. **Jumping.** Send a worker onto the Hill's south ledge (45 cm, 4 terrain
   units): it hops up with a short arc, slowing for a moment. The north ledge
   (56 cm, 5 units) blocks it, so it walks round. Rises of 2 units or less
   are walked as before, and a drop of up to 1 m is hopped down. Warriors and
   monsters follow the same rule; monsters 2.5 m tall and up (minotaurs) jump
   rises up to 67 cm (6 units).
6. `pnpm test` runs `packages/sim/test/gap.test.ts` (the early tools, which
   tool works which rock and tree, the hammer's pace, Equip Best by job, the
   rise rules, the hop, and a tunnel dug through a hill and
   walked) and the face-dig tests in `packages/client/test/m3-controls.test.ts`.
   `node packages/client/test-e2e/gap-look.mjs` (with the dev server on port
   5198) builds the Hill, clicks a tunnel into its face with the mouse and
   takes screenshots once it is dug.

## How a tester checks milestone 6

The build order's check for M6 is: *train a Novice Acolyte at a Magi
Sanctum; Heal and Arcane bolt resolve inside the lockstep step with identical
hashes on two machines; Hexcraft research adds Warding, and a Counterspell
cancels a goblin mage's Snuff; a Grand Magician keeps up a bolt every 4 s.*
Every hash above changed with this milestone (each unit now carries its mana
and spells), and each script still plays out as its description says.

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m6.test.ts`: the Sanctum training a battle Novice in
   60 s from 50 food and a wand it made; Hexcraft researched there in 90 s,
   teaching Warding and Counterspell from rank 2; rank training to Acolyte,
   and a rank wand making a Mage (the old wand goes back to the stock); a
   support mage healing a hurt warrior and a battle mage bolting a zombie by
   themselves; two runs, and a save and load taken mid-cast, landing on the
   same hash; a Counterspell keeping a torch lit against a goblin mage's
   Snuff (its mana still spent); a Grand Magician from an empty bar firing 40
   bolts in 160 s; the cast order sending the one mage with the mana and
   walking her into range; and the spell table matching Table 13.
   `packages/client/test/m6-controls.test.ts` checks the mage command card.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The debug panel
   has three new buttons: **Sanctum** puts a finished Magi Sanctum in the
   middle of the view; **Mage kit** adds 2 wands and 2 of each rank wand to
   the stock and 10 mana crystals, 200 bread, 6 hexstone and 20 herbs to the
   pool; **Mage XP** gives every mage the experience for her next rank.
   Without them a Sanctum needs a level 4 main base (Stockade Hall).
3. **Training.** Select the Sanctum: **Support** (S) and **Battle** (M) each
   train a Novice Acolyte for 50 food and a wand from the stock in 60 s.
   **Make** (K) opens wands (20 s), the three rank wands and Hexcraft (6
   hexstone, 20 herbs, 90 s). A main base of level 6 (Keep) trains mages too.
4. **The mage card.** Select a mage: the movement row, then her school's five
   spells, then Eat, **Rank**, Enter, Equip Best and Gear. Click a spell (or
   its key), then click its target: one of your units for Heal and Quicken,
   an enemy for Arcane bolt, Beam and Fireball, an enemy that is casting for
   Counterspell, the ground for Fortify, Rally, Area blast and Warding. Of
   the selected mages, the one with the mana and the spell ready goes,
   walking into range and sight first. Pressed twice (or double clicked),
   every selected mage casts it on the best target she can find. A greyed
   button says why (rank, Hexcraft, mana); a spell cooling down shows its
   seconds and can still be ordered. Keys: support R Heal, K Quicken, F
   Fortify, Y Rally, W Warding; battle R Arcane bolt, B Beam, F Fireball, T
   Area blast, C Counterspell; U Rank. Eat has no key on this card.
5. **By themselves.** A support mage heals a hurt unit near her (Heal, at
   least half a heal missing) and never chases; a battle mage bolts enemies
   within 15 m of where she was told to stand, and taps with her wand up
   close; one who knows Counterspell stops an enemy spell as it starts. The
   portrait shows a purple mana bar under the health bar; the panel shows
   "Mana x / y" and the spells on a unit. Mana refills at her rank's rate
   unless she was hurt in the last 10 s, so a mage behind the line keeps
   casting. Mana and the cooldown are paid when the spell lands, so a new
   order breaks a cast for free.
6. **Ranks.** Experience from fighting and healing raises a mage to Acolyte
   and Adept Acolyte by herself; **Rank** at the Sanctum trains her there
   sooner (40 food, 60 s; then 60 food and 2 mana crystals, 120 s). Mage,
   Master Mage and Grand Magician each need her experience, then her rank
   wand from the stock and 30 s at the Sanctum; the message "has the
   experience for Mage" says when. Each rank adds health, mana, refill and
   10% spell power. Mages wear leather at most, and Enter puts them on
   towers and parapets, casting from the top.
7. **The look.** Mages draw on the mage body with its wand, playing the
   spell's clip while casting (cast_heal, cast_bolt, cast_beam, cast_area;
   a wand tap plays cast_bolt). Once the model thread's PR #50 is merged
   they wear their school and rank's look (mage_support_1 to 6,
   mage_battle_1 to 6); the rank wands, the bolt and the fireball use their
   own models, and a beam is a violet bar to the target. Landing spells
   throw out motes in the spell's colour, and units with a spell on them
   give off a few.
8. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m6-mages.json --quiet`
   prints `final step 10000 hash 7d4bfb82`. The script plays by Patch 2's
   and Patch 3's rules (before Patch 2 the Sanctum took a plain "support
   mage" or "battle mage" order, and night 0's monsters came to the Big
   House; now it trains the mage on her card with her wand and robe, and the
   monsters come in from the west-north-west and go for the troop kit first):
   the debug tools put a Magi Sanctum by the Big House, the mage kit in the
   pool and a troop kit 20 m west, and two starting warriors upgrade to
   carbon steel and steel (Max); the four workers gather until dusk, when
   Everyone Home shelters them in the Big House; the Sanctum trains a support
   and a battle mage, each with a hazel wand and a homespun robe, and
   researches Hexcraft, and both train to Acolyte; at dusk the support mage
   and a carbon steel warrior stand guard by the troop kit with the third
   starting warrior out in front, and the battle mage joins them; in night 0
   the support mage quickens the warrior, wards the crowd once Hexcraft is
   done and heals the warrior in front while the battle mage beams a zombie
   and bolts the rest, and before dawn they walk back to the Big House; at
   dawn Mage XP takes both to Adept Acolyte and then to Mage, paying 2 mana
   crystals each (milestone 11: no rank wands); at a goblin village 80 m
   north the warriors attack, the battle mage fights from 22 m short of the
   huts and the support mage follows, Rally, Fireball, Fortify and Area blast
   are cast, the battle mage counters the goblin mage, and all four walk
   home. All ten spells land, and nobody is killed.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 7

The build order's check for M7 is: *find a Halfling village and trade a
Copper Token for grain through the barter menu; an Elf caravan stops outside
the base five days after first contact; chopping Deepwoods trees in sight of
an Elf gives three warnings and then war; a Dwarf colony names the direction
of the nearest city after the first trade; the message panel records a
declaration of war and clicking it jumps the camera.* Every hash above changed
with this milestone (the peoples are placed as the land is explored, so the
units trained later in the M5 and M6 scripts have new ids; those scripts were
updated and still play out as they say).

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m7.test.ts`: each of the seven kinds (Halfling village,
   Runkin camp, the Elf kingdom, an Elf caravan, Dwarf colony and city, a
   mercenary camp) placed with its buildings, people, beasts and stock; the
   peoples found as the players explore, by the seed alone; an offer answered
   with three bundles worth about what it is worth to them, and one taken;
   the 15 m rule and the Halflings refusing gold; the 300 value point daily
   limit for one kind of good; the same offer turned down three times
   closing trade until dawn; lumber insulting the Elves; a declaration of
   war, the Halflings' surrender at half strength, plunder and breaking down
   what they left; war that comes by itself when a player kills one of theirs
   at peace; the Runkin defeated and camping again in a cell nobody has seen;
   the Dwarves migrating, raiding and stopping once paid reparations; the
   Elves' three tree warnings and then war; the caravan coming five days
   after meeting the Elves, trading near the main base and leaving at dusk; a
   Dwarf colony's first trade naming the way to the nearest city; mercenaries
   hired for silver until dusk; Grovesingers casting at monsters; and a save
   taken mid-war replaying to the same hash.
   `packages/client/test/m7-peoples.test.ts` checks the message filters and
   the 60 message limit, the worth bar's sums (the same as the sim's), the
   war question before an attack and right click to trade.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The debug panel
   has three new buttons: **People: Halfling village** puts that people in
   the middle of the view, as if just found there; each press moves on to the
   next (Runkin camp, the Elf kingdom, an Elf caravan, a Dwarf colony, a Dwarf
   city, a mercenary camp). **Caravan** sends an Elf caravan to your main base
   now (by day). **Trade kit** adds 20 silver, 6 Copper Tokens, 2 Bronze
   Charms and 5 gold to the pool. Without them the peoples turn up as you
   explore: Halfling villages at the sites Table 9 keeps for them, Runkin
   camps from the Heartland to the Deepwoods, mercenary camps and wandering
   Elf caravans in the Fringe and Deepwoods, the one Elf kingdom in the
   Deepwoods, Dwarf colonies in the Barrens and Dwarf cities in the
   Deadlands.
3. **Meeting them.** The first time one of your units sees one of their
   people, their leader greets you in a speech bubble and the message panel,
   and they appear on the minimap as a diamond in their people's colour
   (ringed red at war). Hover over any of their units or buildings for its
   name and its people. **O** (or the **Peoples** button at the top right)
   opens the Peoples panel: every people you know, how it stands, its
   specialisation, and **Go there**, **Trade**, **Hire** and **War**.
4. **Trading.** Right-click their leader, an inn, barn, drying rack, hall,
   forge or a caravan's wagon with a unit selected (or press **Trade** in
   the panel). A unit of yours must be within 15 m. The trade menu shows what
   they sell today, what they want (by kind of good), your goods with what
   they would pay for each, the offer box and the worth bar. Click goods into
   the box (Shift + click or right click puts ten; click one in the box to
   take it back out), then **Make offer**: they answer with
   three bundles and you take one, or **Withdraw**. Values are hidden; the
   worth bar only says small, fair, good or rich. Each people buys at most
   300 value points of one kind of good a day and restocks at dawn; the same
   offer turned down three times closes trade until dawn; Halflings refuse
   gold, and lumber offered to Elves insults them for a day.
5. **Caravans.** After you meet the Elves, a caravan comes every five days
   by day, stops about 14 m from your main base and leaves at dusk. Trade
   with it as with a village.
6. **War.** **A** on one of their units, or **War** in the panel, asks first
   ("Declare war on …?"); your allies are drawn in. Killing one of theirs at
   peace starts a war by itself. Halflings offer to surrender at half
   strength (**Accept surrender** or **Refuse** in the panel); a surrender or
   a defeat brings plunder into the pool (livestock, their fighters' weapons
   and shields, some of their stock) and they walk off, leaving their
   buildings: select workers and right-click one (or A on it) to break it
   down for its materials. Runkin camp again somewhere unexplored; Dwarves
   migrate and raid you until you pay reparations (**Pay reparations** in the
   panel);
   Elves never surrender, and chopping Deepwoods trees in sight of an Elf
   earns three warnings and then war.
7. **Mercenaries.** Right-click a mercenary camp (or **Hire** in the panel)
   with a unit within 15 m: up to 6 at 2 silver each for the day, by day
   only. They take your orders like warriors and walk home at dusk.
8. **Speech and the message panel.** Your units say short lines in bubbles
   (under attack, out of resources, idle) and now and then a random remark;
   the peoples answer in their own words. The message panel keeps the latest
   60 messages with the time and who said them. Its filter button switches
   between everything, alerts and player messages, and player messages only;
   **–** collapses it to a small button that flashes when something urgent
   comes in. Urgent messages (attacks, war, deaths, idle workers, nightfall)
   are highlighted and
   ping the minimap; clicking any message with a place jumps the camera to
   it, or to the unit that said it; **F4** (Space until patch notes 1) jumps
   to the latest urgent message and again steps back through the last 8. Another people's line
   reaches the panel when it is said to you, or when it matters and you can
   see the speaker. Chat with other players came with milestone 9; playing
   alone the chat line says there is nobody to chat with.
9. **The look.** The peoples use their own models (people, buildings,
   wagons, beasts).
10. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m7-peoples.json --quiet`
    prints `final step 10000 hash aaae0843`: the debug tools put a Halfling
    village 40 m north, a mercenary camp 15 m east, the trade kit in the
    pool and a troop kit 20 m west, and send an Elf caravan; the Barracks
    trains a ranger with wrought-iron arrowheads and two starting warriors
    upgrade to the best; two mercenaries are hired; the third warrior trades
    3 Copper Tokens to the village for 5 smoked fish, then a Bronze Charm to
    the caravan; the workers shelter in the Big House, war is declared on
    the village and the troops and mercenaries take it (two of its spearmen
    ride out on war oxen with an archer behind each; since Patch 3's making
    room none of ours falls), the workers come out, and its plunder comes in
    (livestock, weapon metal, farm fare and wrought iron); the mercenaries and the caravan
    leave at dusk; on day 2 three workers break down the village's abandoned
    barn for 20 softwood lumber. `pnpm test` runs it in Node,
    Chromium, Firefox and WebKit too.

## How a tester checks milestone 8

The build order's check for M8 is: *a warrior trained to ride charges a wave
and knocks zombies back; an ox hauls a catapult that breaks a goblin hut; a
Gunnery yard trains musketeers and cannon crew, and a bronze cannon fires
from the Citadel's ports; by night 85 the budget buys juggernauts; Morvath
arrives on night 110, withdraws at dawn if alive and returns ten nights after
a defeat.* Every hash above changed with this milestone (riders, engines and
the late mobs add fields to the hash; goblin villages now keep wolf riders
and a pen, and Halfling villages ride out war oxen at war, so the M5, M6 and
M7 scripts were updated and still play out as they say).

1. `pnpm test` runs those checks as scenario tests in
   `packages/sim/test/m8.test.ts`: a charge after a straight gallop doing
   double damage and knocking a zombie back a metre, and the next blow
   standing doing single; a blow on a rider landing on the horse while the
   horse has more health; riding trained at a Stables with a horse in it,
   then mounting the nearest free horse and getting down again; an ox
   hauling a catapult that two warriors crew and that breaks a goblin hut;
   workers repairing an engine that never heals by itself; a musketeer
   trained once Muskets is researched; a bronze cannon hauled up into a
   Citadel port and fired by its crew from the roof (one charge and one ball
   a shot); a Dwarf city's gunners, cannon crew and two cannons, and one
   cannon for sale a day, bronze or iron; a Halfling village riding its war oxen out when a war
   starts; infernal juggernauts in the night 85 budget; Morvath coming on
   night 110, withdrawing at dawn with his health and returning ten nights
   after a defeat, and taking flight below half health; and riders, engines
   and Morvath kept through a snapshot and replayed to the same hash.
   `packages/client/test/m8-controls.test.ts` checks Ride and Dismount,
   mounting by right click on a horse, the engine card, hitching and porting
   by right click, and crewing and repairing by right click.
2. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The debug panel
   has seven new buttons, each acting at the middle of the view:
   **Stables** puts a finished Stables with 2 grown horses and an ox in its
   stalls and 100 bread; **Siege kit** a catapult, a ballista and a bronze
   cannon, 20 of each munition, and the Siege engines, Gunpowder, Muskets
   and Cannons research; **Gun kit** 4 steel-barrel muskets with horns and
   pouches, 20 gunpowder, 40 lead shot, the gun research, and musket and
   cannon crew training for every warrior; **Citadel** makes your main base
   a finished Citadel (level 10) with its four cannon ports; **Night mob:
   Barrow knight** puts down the named night mob and moves on through every
   mob from night 25 to Morvath's Rift-touched beasts; **Wave: night 30**
   spawns what the dark edge's budget buys on that night and lists it in the
   messages (then nights 50, 85 and 105; night 85 buys juggernauts);
   **Morvath** brings the Hollow Crown now.
3. **Riding.** Select warriors and press **Train (U)**: the skills page has
   Archery, Crossbow, Riding, Musket and Cannon (Back returns). Riding is
   trained at a Stables that has a tamed horse (60 s, 30 food). Then
   **Ride (R)** mounts each on the nearest free horse, or right-click one
   of your horses; with all of them mounted the button reads **Dismount**,
   and the horses walk back to their Stables. A rider moves at a trot, and
   at a gallop when closing on a foe; after a straight run of 6 m at gallop
   (8 m for an ox) its next blow is a charge: double damage, and a foe
   shorter than the mount is thrown back 1 m (2 m when it is no taller than
   60% of the mount's shoulder). Blows on a rider land on the horse while it
   has more health; the panel shows the horse's health.
4. **Siege engines.** The catapult and ballista come from the Great Workshop
   and the Manufactory, the cannons from the Foundry (Siege engines and
   Cannons research). An engine's card has Attack, Stop, Hold, Move,
   **Hitch (R)** and **Port (E)**: select the engine and right-click one of
   your horses or oxen to hitch it (Hitch again lets it go); without an
   animal its crew push it slowly. Right-click your engine with warriors to
   crew it (cannons need cannon crew training at a Gunnery yard); it fires
   only while its crew stand by it and it stands still, and the crew fight
   whatever comes within 6 m and go back to it. Engines never heal by
   themselves: right-click a damaged one with workers to repair it.
5. **Guns and the Citadel.** The Powder mill makes gunpowder, the Gunnery
   yard trains muskets (after Muskets) and cannon crew (after Cannons).
   Select a cannon and right-click the Citadel (or **Port**): it is hauled
   to the door and goes up into one of the four ports on the roof, and its
   crew follow it in. It fires at what comes within 60 m, with smoke and a
   flash.
6. **The peoples' riders.** Goblin villages of four huts or more keep a
   wolf pen and one wolf rider for every two huts; a Halfling village rides
   its war oxen out when a war starts (a spearman in front, an archer
   behind, who gets down if the ox falls); the Elf kingdom has bear riders;
   Dwarf cities add gunners, cannon crew and two cannons of their own to
   their garrison, and sell one cannon a day (bronze or iron, whichever you
   buy first), muskets, horns, pouches, gunpowder, lead shot and
   cannonballs.
7. **The late nights.** A new night mob every five nights from night 25 to
   110, each with its own trick (the Night mob button shows them one by one):
   plague bearers' miasma, gravewings snatching lone workers, bone colossi
   throwing boulders, hollow priests raising the dead, hellhounds' breath,
   chain fiends' hooks, void stalkers seen only up close unless lit,
   juggernauts that scorch what stands beside them and take double from
   behind, void witches' hexes and
   blinks, drakes' fire lines, archfiends that call cinderlings, the rift
   colossus' beam, and the Rift-touched beasts. On night 110 Morvath comes
   for the first player still in the game: his crown snuffs every light
   within 30 m, he casts Ruin (3 s of warning, then 300 damage within 20 m)
   and opens the Rift (a demon every 3 s for 30 s), and below half health
   he takes to the air. Alive at dawn he withdraws and comes back the next
   night with the health he had; killed, he returns ten nights later.
8. **The look.** Riders sit on the horse, war ox, war bear and goblin wolf
   models at their saddle points, with the riding clips from PR #50 once it
   is merged; engines use their models (aim, fire, towed, damaged); void
   stalkers shimmer while cloaked, and the Rift-touched beasts shed violet
   motes until their own textures arrive.
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m8-siege.json --quiet`
   prints `final step 10000 hash 7937dc6c`. The script plays by Patch 2's
   rules (before Patch 2 the gun kit trained warriors as cannon crew and
   warriors crewed the engines): the debug tools make the Big House a
   Citadel, put a Barn with two horses and an ox 20 m east, a siege kit 20 m
   west (a catapult, a ballista and a bronze cannon, each with its artillery
   crewmen, and an Artillery workshop), a goblin village 80 m north and a
   troop kit to the south-east; the Big House trains a long-melee spearman
   and the Barracks a bronze cavalry rider, who uses up a horse from the Barn
   and comes out mounted; the Artillery workshop casts an iron cannon, which
   rolls out with its two crewmen ("An iron cannon is ready, with its 2
   crewmen."); an ox hauls the catapult 40 m north, where its crew open fire
   on the goblin village by themselves, with no ammunition: the first hut
   falls, the next kills take the village to war, and by the next morning
   only three damaged huts, the wolf pen and three goblins are left; a horse hauls the bronze
   cannon up into a Citadel port and the iron cannon's crew push it up into a
   second, each crew following its cannon in; through night 0 the port
   cannons, the ballista and the catapult fire at the night mobs, and the
   rider gallops at them to the north-west, where his first blow on a zombie
   is a charge that throws it back; at dawn he rides home.
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.

## How a tester checks milestone 9

The build order's check for M9 is: *two players on two machines host and join
by link, pick colours, ready and start, chat, share control and send
resources, ping the map, pause, save, quit, and load the game back to the same
hash; a guest who saves is asked to make an account first.* Every hash above
changed with this milestone (each player's share mask and each unit's shared
flag are in the hash, and production queues record who paid).

1. `pnpm test` runs `packages/sim/test/m9.test.ts`: Share control letting an
   ally move, stop and gather with your units but not build with them or
   equip them; Send resources arriving at once; a player leaving, their resources
   split between the rest and their units and buildings shared by everyone,
   building on the research they had; and all of it kept through a snapshot
   to the same hash. `packages/client/test/m9-online.test.ts` checks invite
   codes and pasted links, the Send amounts (+10, +100, All), when the host
   may start, the seats of a new and a loaded game, the account form, the
   browser check, the quality presets, and a save file with its seats read
   back.
2. **The menu.** `pnpm dev` and open http://localhost:5173. The main menu has
   New game, Load game, Join game, Settings, Account and Quit, with the F11
   reminder (Ctrl + Cmd + F on a Mac) and a Full screen button. New game >
   Play alone starts a game with first-day tips (Settings > Help > Tips turns
   them off). `?seed=N` (and `&players=K`) still skips the menu for testers.
3. **Two players on one machine.** Run the game server too
   (`pnpm --filter @blockyrts/server dev`, port 8080, in memory; `pnpm dev`
   passes `/api` and `/relay` to it). In one window: New game > Host a game
   for friends. Copy the invite link and open it in a private window (or a
   second browser). Pick a colour, click Ready; the host clicks Start the
   game. Both debug panels show the same hash at the same step.
4. **Allies, chat and pings.** Enter opens the chat line, Enter sends and Esc
   cancels; the line shows for both, with the sender's name, and game keys do
   nothing while typing. **[** (or Allies, top right under the resources)
   opens the Allies panel: tick Share control and the other player can
   select your units (ringed in your colour) and move, attack and gather with
   them. **]** (or Send) opens Send resources: pick a player and a resource,
   +10, +100 or All, Send; it arrives at once with a message for both.
   **\** (or Ping) then a left click on the view or the minimap flashes the
   spot for both players.
5. **Pause and a missing player.** The Pause key (or ❚❚) pauses both, with a
   banner naming who paused; again carries on (patch notes 1 changed this:
   see "How a tester checks pause, the menu and Space"). Close the guest's window: the
   host sees "Waiting for" the guest, and after 30 s chooses Wait, Carry on
   without them, or Save and quit. Reopening the invite link (or refreshing
   the page during the match) rejoins the same seat.
6. **Saving.** F10 > Save game. As a guest the account page opens first; make
   an account and the save goes through ("Game saved"). Online only the host
   may save. Each dawn autosaves (kept in this browser, and on the account
   when signed in). F10 > Download a save file writes a `.sac` file. Quit,
   then Load game lists the save: Continue (alone) or Host to continue (it
   opens a lobby for the same players), and the game comes back at the same
   step and hash it was saved with.
7. **Settings.** F10 > Settings: Quality Low, Medium or High, resolution
   scale, shadows and view distance change the look at once and never the
   hash; three volume sliders; camera speeds; hotkeys, where the new keys
   ([, ], \, Pause) can be rebound.
8. `node packages/client/test-e2e/m9-online.mjs http://localhost:5173 <folder>`
   (with both servers running) plays steps 2 to 6 in two headless browsers
   and saves screenshots; it is not part of `pnpm test`.

## How a tester checks milestone 10

The build order's check for M10 is: *the performance targets are measured and
written down, the balance harness runs the pacing, wave and supply checks,
the sounds play, and the Quick reference and "Playing with the mouse only"
work as written.* No hash changed with this milestone: every check script
above prints the same trace as on milestone 9 (the speed-ups were checked
against it step by step).

1. `pnpm test` runs `packages/client/test/m10-audio.test.ts` (a track for
   each time of day and the blood night, each unit's voice, blades against
   arrows and blocks, work sounds, only sounds the audio package has, and a
   match playing every sound in the Audio list from what the sim reports at
   the Settings volumes) and `packages/tools/test/balance-harness.test.ts`
   (every pacing tier timed from the sim tables, the night 110 supply, and
   night 0 held with the warrior alive).
2. **Sound.** `pnpm dev`, open http://localhost:5173/?seed=1 and click once
   (browsers start sound only after a click). Day music plays; at dusk a horn
   and the dusk track, at night the night track, and the fight layers come in
   when monsters are near the camera. Select workers and order them about:
   they answer. Chopping, mining, hits, blocks, deaths and torches sound where
   they happen and fade with distance. F10 > Settings: the music, effects and
   voice sliders change the sound at once.
3. **Performance readout.** The debug readout (top left) now shows fps, frame
   time, draw calls and triangles, units and memory. At night press Citadel,
   then **Crowd +200** a few times on the debug bar: draw calls stay at about
   80 whatever the crowd. `node packages/client/test-e2e/perf-look.mjs
   http://localhost:5173 <folder> [--gpu]` does this by script.
4. **Sim speed.** `pnpm --filter @blockyrts/tools perf:sim` prints the step
   time with 3,000 and 6,000 monsters on the night 80 town (about 19 and 30 ms
   a step on a 4-core cloud machine; the target is 25 ms) and the end hash.
   See [docs/performance.md](docs/performance.md).
5. **Balance harness.** `pnpm --filter @blockyrts/tools balance --pacing`
   prints the pacing check and supply at night 110 in a second;
   `pnpm --filter @blockyrts/tools balance` adds the wave checks at nights 0,
   10, 20, 40, 60, 80 and 110 on seeds 1 to 3 (about 10 minutes; `--nights`,
   `--seeds`, `--csv`; `--blood` until Patch 5 removed blood nights). Nights 0 to 80 hold, night 110 falls. See
   [docs/balance-pass.md](docs/balance-pass.md) for what each column means
   and what looked off. No (s) value was retuned (Jade's rebalance comes
   next).
6. **Controls.** `packages/sim/test/m10.test.ts` checks the new double taps
   and Shift + H. In play: select warriors near a monster at night and press
   A twice: each one goes for the nearest enemy it sees. Workers: G twice
   gathers the nearest node, E twice shelters in the nearest building with
   room, T twice prospects where they stand. Shift + H after a move holds once
   they arrive. A Barracks or Magi Sanctum now has Set Rally Point (R). In the
   F10 menu, Tab and Enter work. `node packages/client/test-e2e/hud-check.mjs
   http://localhost:5173 <folder>` runs the milestone 1 controls check again
   (brought up to date).

## How a tester checks milestone 11

The check for M11 is the docx section *Troops and gear (agreed 2026-10-03)*:
*there are no items; a Barracks trains close melee, long melee, rangers and
brawlers at the weapon and armour tiers picked in its panel, the Stables
trains cavalry on a tamed horse, units upgrade their weapon and armour at a
Forge, Barracks or main base, long melee hits 30% harder at the edge of its
reach, and the Forge only smelts.* Every hash above changed with this
milestone (troop types and tiers replace the item slots, the start has three
warriors, and the item stock is gone), and each script still plays out as its
description says. The equipment steps in the milestone 3, 4, 6 and 8 sections
(Equip Best, the I panel, Auto-Equip, crafting and refurbishing, riding
training) are history: what replaced them is below. Saves from before this
milestone are refused with a message saying why.

1. `pnpm test` runs the troop checks in `packages/sim/test/m3.test.ts` and
   `m4.test.ts` (training each type and tier and what it pays, the main base
   limited to tier 1, Upgrade and Upgrade Max walking to a Forge, no minimum
   range and the +30% at the outer third of a spear's reach, the worker's
   cart, the smelting-only Forge), `m8.test.ts` (cavalry at the Stables using
   up a horse, musket rangers after Gunpowder and Muskets), `m6.test.ts`
   (wand and robe tiers, rank-ups paying mana crystals), `tables.test.ts`
   (every kit table) and `packages/client/test` (the panel's picks and
   reasons, the Max twins, an old save refused).
2. **The start.** `pnpm dev`, open http://localhost:5173/?seed=1. Four
   workers and three warriors with hardwood cudgels stand by the Big House.
   Select a warrior: the panel reads "Club fighter (Recruit)" (in Patch 2; "Close melee (Recruit)" before), its cudgel, no
   armour, weapon tier 1 and armour tier 0.
3. **The troop panel** (live before Patch 2; Patch 2's cards replace it, see the middle HUD section below). On the debug bar press **Troop kit**: a Barracks and
   a Steelworks appear in the middle of the view with the stock for every tier
   (press **Citadel** too for the supply). Select the Barracks: one row per type (Close, Long,
   Ranger, Brawler) with a picture button, a weapon dropdown and an armour
   dropdown with drawn icons tinted by material, a Lock, and the cost line
   under it. Open a dropdown: each tier with its icon, red where the stock is
   short, greyed with what it needs (a forge level or research). Pick one,
   click the picture: it queues; Shift + click queues five. Tick Lock and the
   building keeps that kit as the stock changes. The card's A, Q, N and B do
   the same as the pictures. The Big House shows the same panel at tier 1 and
   below; the Stables shows cavalry with the tamed horses in its stalls.
4. **Upgrades.** Select warriors: Q Upgrade weapon and X Upgrade armour on the
   card; Z and V (Max) show only when they would go further. Press Q: each
   walks to the nearest Forge, Barracks or main base saying where it is going,
   stands beside it while a bar fills, and says what it got. The new kit is
   paid when you press the button and the old kit's cost comes back to the
   stock in full when the new one goes on. Workers have Q
   (tools), X (fetch a cart or hand it back) and U (rank); mages Q (wand) and
   X (robe), pressed twice for the best.
5. **Long melee.** Train a long-melee troop and let a monster close in: it
   keeps fighting point-blank (no backing off, no backup weapon), and hits at
   the edge of its reach land 30% harder.
6. **Smelting and birds.** A Forge's K menu lists only smelting at its level:
   copper, tin and bronze at a Casting Hearth, wrought iron at a Bloomery,
   pig iron and iron at an Ironworks, steel and carbon steel at a Steelworks.
   Hunt (N) wild geese by Heartland water or pheasants in the Fringe woods for
   meat and feathers, which bow and crossbow rangers need.
7. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m8-siege.json --quiet`
   prints `final step 10000 hash 7937dc6c`, as in milestone 8 above.

## How a tester checks the model catalogue on mobs

Client and assets only: the sim and every hash are unchanged.

1. `pnpm dev`, open http://localhost:5173/?seed=1 and start. Wild animals,
   night mobs, creatures, lairs, goblin villages, tribes and the peoples all
   draw with their catalogue models and clips, not as coloured blocks. A
   creature seen for the first time can show as a block for a moment while
   its model streams in.
2. Young animals are the adult model at half size; the small slime is the
   slime model at its own size. Wild geese and pheasants use the hen's
   model, sized to each bird, until the model thread makes theirs.
3. `node packages/client/test-e2e/models-look.mjs http://localhost:5198 <folder>`
   (with `pnpm --filter @blockyrts/client exec vite --port 5198` running)
   puts down night mobs, creatures, a lair, a village, a tribe and a people
   with the debug buttons, visits the nearest animals of several kinds and
   brings a crowd of night mobs at night, saving `models-*.png`. It prints
   anything still drawn as a block; it should print none.

## How a tester checks shared vision

Jade's ask (2026-10-03): *your buildings also grant map vision, not just your
units; in multiplayer all players share vision from all their units and
buildings.* The step-40 hashes and the
M1, M6 and M8 scripts' hashes changed with this patch: the Big House and every
other building now explore the land round them, and the players keep one
explored picture. The M0, M2, M3, M4, M5 and M7 scripts keep their hashes,
because their units had already walked over all their buildings see. Each
script still plays out as its description says. Saves from before this patch
still load, with every player's explored land joined into one.

1. `pnpm test` runs `packages/sim/test/vision.test.ts`: a lone building far
   from any unit explores and sees out to its sight from its walls; the sight
   table (main base, towers and the bonfire 20 m, every other building
   10 m, `BUILDING_SIGHT_M`); fog halving it; a tower marking a lair found; a
   ranger on a tower seeing 10 m further and a worker sheltering inside not
   seeing; two players' units and buildings all in the side's vision and
   exploring one picture; an attack kept on a target only a tower sees and
   dropped when no one does; night spawns keeping off both players' land; an
   old save's two pictures joined; and a game resumed from a save between
   vision updates ending on the same hash.
2. **Buildings.** `pnpm dev`, open http://localhost:5173/?seed=1. The land
   round the Big House is in colour out to 20 m from its walls with no unit
   near. Build a storehouse or a torch post at the edge of what you have
   explored and walk the workers home: the land 10 m round it stays in
   colour, in sight, not grey. Towers and bonfires see 20 m; on a fog
   night every building sees half as far. The Big House and towers also mark
   lairs and goblin villages they see on the minimap.
3. **Two players.** Open `?seed=1&players=2`: both pockets are in colour
   from the start, and the second Big House, 10 to 15 m away, shows its
   units' and buildings' sight as in sight. On two machines in a lobby, what one player's
   units or buildings explore turns to colour for the other at the same step,
   and lairs, villages and peoples one finds show on the other's minimap.
4. **Attacks.** Order a warrior to attack a monster far off that only a
   tower (or an ally's unit) can see: the warrior keeps chasing it. Once
   nothing on your side sees it, the order drops as before.

## How a tester checks the menu and lobby look

Client only: the sim, the server and every hash are unchanged, and every
control, label and flow of milestone 9 stays as it was.

1. `pnpm dev` and open http://localhost:5173. The main menu stands in a
   column on the left over a dusk battle at the camp: the game's logo, the
   six choices on wooden buttons, the F11 keycap. The picture drifts slowly
   (not when the system asks for reduced motion).
2. New game, Load game, Join game, Settings and Account open in a wooden
   panel in the same column. Inputs, checkboxes, sliders and the save slots
   use the catalogue's interface art; headings and buttons use the Jersey 10
   pixel font (`packages/client/src/ui/fonts/`, SIL Open Font License).
3. Host a game for friends: the lobby shows a four-player world seen from
   high above, the camps lit in the basin, with the invite code large in its
   own inset and a team banner by each player. The loading screen keeps the
   map behind it.
4. In a game, F10 opens the menu in the same wooden pop-up; a guest's Save
   game opens the account form in it too.
5. The pictures are `packages/client/src/ui/art/menu-battle.webp` and
   `lobby-map.webp`, 2560 x 1440. To render them again after models or world
   generation change: `pnpm --filter @blockyrts/tools models:build`, then
   `pnpm --filter @blockyrts/client art` (about 3 minutes; `battle` or `map`
   for one). The scenes are `packages/client/src/art/scenes/battle.ts` and
   `map.ts`; `pnpm --filter @blockyrts/client exec vite` then
   `/art.html?scene=battle` (or `map`, with `&w=1600&h=900`) shows one in the
   browser while staging; the battle takes `cam`, `look` and `fov` in the URL
   to try a camera, the map `pitch`, `yaw`, `dist`, `lx` and `lz`.

## How a tester checks wall and tunnel chains

Walls and level tunnels are clicked out from point to point, a stretch at a
time, and each stretch reaches the sim as one order (its start, one of eight
directions and a length). Placement rules, costs and dig rates are as they
were. Run `pnpm dev` and open http://localhost:5173/?seed=1.

1. **A wall chain.** Select workers, B, D and a wall (W is the softwood
   wall; before Patch 4, B, G and a wall). Click: one wall is
   placed there and the ghost stays. Move the mouse: the stretch from that
   wall to the cursor shows as a ghost, snapped to the nearest of the eight
   directions, with what it builds and costs beside the cursor ("9 walls:
   9 softwood lumber"). Click: the whole stretch is ordered and its far end
   is the next point. Keep clicking to turn corners, in any direction; a
   diagonal is built as a staircase so nothing meets only at a corner (about
   2 walls a step).
2. **One wall, and stopping.** A click on the chain's last point finishes
   it, so a **double click places just one wall**, and after a stretch a
   click on its end stops there. Right click, Esc or **Done** (the card's
   corner) also end the chain at any moment. A hint under the label beside
   the cursor always says how ("Click again for just this one", "Click to
   build to here, right click to finish"). Shift while ending keeps the wall
   on the cursor for a new chain.
3. **What is in the way.** Red columns (a tree, rock, water, steep ground, a
   building) are skipped and the message says how many. Walls standing or
   planned already are passed over without a word, so a chain closes on its
   first wall, and a first click on an old wall starts the chain from it.
4. **Short stock.** The label counts the stock less the walls already planned
   ("enough for 4"), the walls past that point show greyed, and a click
   orders those it pays for, from the chain's last point outward; the
   message says how many, and the chain goes on from the last one paid for.
   The workers build each stretch from its start outward and pay for each
   wall when they get to it, as before.
5. **A tunnel chain.** Select workers and press D, then D again (the card's
   **Tunnel** button lights): click where the tunnel starts, then where it
   goes. It digs level from the ground clicked, 90 cm wide (wider on a
   diagonal, so walkers never squeeze past a corner) and 2.25 m tall (+ and
   - or the wheel, 2 m to 4 m); the label gives its length and height. Keep
   clicking to turn corners; a click on its last point, right click, Esc or
   **Done** ends it, and D again goes back to digging down. A click on a cliff face starts a chain
   without the button (milestone 5's gap fixes, step 3). Columns already open
   at the tunnel's height cost nothing; a stretch with nothing to dig is
   refused with a message. Units walk through the finished tunnel; right-click
   a marked stretch with more workers to help.
6. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/chain-walls.json --quiet`
   prints `final step 10000 hash 130f68b4`: the four workers are given a
   chain of softwood walls a stretch at a time from (0, 20), east 9, south 5,
   south-west 3, west 6 and north 8 back to the first wall (34 walls, a
   closed ring, from the 40 softwood lumber the camp starts with); a second
   chain south of it, started with Shift, runs over a plant (skipped) and has
   lumber for 6 of its 9 walls, so 6 are planned from its start. All 40
   stand by step 1500.
7. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/chain-tunnel.json --quiet`
   prints `final step 10000 hash f50b27b3`: the debug tools heap a soil hill
   south-east of the camp, the four workers put up a Storehouse north of it
   at (17, 21) and dig a tunnel chain from its west face: east 3 columns,
   south 3, south-east 2 and east 4, out of its east side, 480 bites of soil
   carried 5 at a time to the Storehouse (Patch 4) and finished by step 8200;
   then worker 1 walks to a point
   deep under the hill where only the tunnel leads, and on round the
   tunnel's corners and out of the far side, on its floor all the way.
   `pnpm test` runs both in Node, Chromium, Firefox and WebKit too.
8. `pnpm test` also runs `packages/sim/test/chains.test.ts` (the stretch
   geometry, a wall chain in four directions built from its anchor outward,
   skips, the stock cut, a tunnel chain of four stretches under a hill saved
   and loaded halfway, walked into and through) and
   `packages/client/test/chains-controls.test.ts` (the clicks, the labels
   and hints, the double click, right click, Shift, Done and the Tunnel
   button). `node packages/client/test-e2e/chains-look.mjs` (with the dev
   server on port 5198) clicks a wall ring, a lone wall and a tunnel chain
   with the mouse and saves screenshots.

## How a tester checks the inventory grid

Client only: the sim, the server and every hash are unchanged.

1. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The top right
   shows Food and Supply, then 16 square slots, 8 across and 2 down, with
   Peoples, Allies, Send, Ping and Pause under them. The starting goods
   (softwood, sticks, stone, flint, venison, trout and the rest) each sit in a slot with
   their pixel icon and the count in the corner; the other slots are empty.
2. Hover a slot: the tooltip names the good, gives the exact count, where it
   comes from and its change over the last minute of game time.
3. Gather or build: counts change, but no slot moves. Slots keep a fixed order
   by category (woods, stone and flint, ores, metals, foods, crafting goods,
   trinkets, crystals), and a new kind of good takes its place in that order.
   Spend a good to zero and its slot stays, greyed.
4. Hold more than 16 kinds of goods (in a dev build, from the browser
   console: `[3,5,9,10,11,12,13,20,21,22,23,49,50,51,58].forEach((res) =>
   shell.opts.issueOrder({ kind: 'debugGive', player: 0, res, count: 50 }))`).
   The ▼ arrow lights; the wheel over the slots or the arrows scroll a row of
   8 at a time, and the thumb between the arrows shows where you are. Counts
   past 9999 read 12k, 1.2M.
5. Right click the venison slot: it is crossed out in red and a message says
   nobody eats it; right click again to eat it. With the cursor locked
   (Settings) the tooltips, arrows, wheel and right click work the same.
6. Unit tests: `packages/client/test/inventory.test.ts` (slot order, an icon
   in the catalogue for every good, scrolling, counts, the wheel, the change
   over a minute). `node packages/client/test-e2e/hud-check.mjs` checks the
   grid in a browser.

## How a tester checks footprints and manning

Jade's patch notes 1, buildings and defences: a finished building shows no
scaffold, a unit in front of or behind a building is clicked before it,
placing shows only the tiles a building takes, everything is walked round as
it is drawn, and anyone on foot can man a tower or a main base's top. Run
`pnpm dev` and open http://localhost:5173/?seed=1.

1. **No scaffold when finished.** The Big House at the start, and anything you
   build once it is done, shows no poles or planks; a building going up or
   being upgraded still does.
2. **Units before buildings.** Walk a worker behind the Big House (north of
   it, where the roof hides its feet) and click it: the worker is selected,
   not the house.
3. **Placing.** Select workers, B, and pick a single wall: only its one tile
   shows, green or red, the size of the white box a finished wall shows on
   hover. No yellow outline of the land it would claim.
4. **Walking as drawn.** Workers walk through the Big House's open yard (east
   and south of the house and its sheds) and over low fences, troughs and
   woodpiles; they go round walls, stalls, posts and towers. In the debug
   panel press **Citadel**: its ring walls and shut gate now block, and anyone
   standing where a wall went up steps to the nearest free column. Every
   building and level is in `packages/sim/src/buildings/footprints.ts`, and
   `pnpm --filter @blockyrts/tools footprints` measures them again from the
   models and says if any differs.
5. **Manning.** Build a tower. Select the three starting warriors (close
   melee, cudgels) and a worker, press E and click the tower, or right click
   it: all four climb up and stand on its corners, drawn there. The tower's
   panel says "Up top: 4 of 4" with a portrait per man that brings him down;
   a fifth is told the tower is full. On a main base from level 3 (8 places),
   E takes workers up while there is room and shelters the rest inside; E
   twice and Everyone Home shelter workers inside.
6. **Up top at night.** Zombies, rats and spiders at the foot of the tower
   leave the men up top alone, and those men cannot reach them; a cave bat
   (or a gravewing, rift hornet or rift griffin) swoops down at them and they
   strike back. While monsters are near, a man up top with no bow or gun says
   "I'm not much help up here!", and a warrior now and then "Let me get down
   there to fight those zombies!", as a bubble.
7. `pnpm test` runs `packages/sim/test/footprints.test.ts` (the Citadel shut
   and the Big House yard open, stepping aside, a kitchen growing round its
   spot and the room given back on a cancel, a tower manned by close
   warriors and workers, workers on a level 3 main base, a zombie that cannot
   get at them, a bat that can, the remark, a save and load with men up top)
   and `packages/tools/test/footprints.test.ts` (every modelled level against
   its models, every post on its model's top).

## How a tester checks food (patch 1)

Sim and client: every replay hash above moved (each unit now eats on its
own, and saves carry the food accounts). Saves from before still load.

1. `pnpm dev`, open http://localhost:5173/?seed=1 and start. The Food cell
   reads **140**: the food value of the 25 venison (4 each), 10 trout (3)
   and 10 eggs (1), in whole food. It is the food value, not the number of
   items, and it never shows food that is not there.
2. **Meals.** Every unit eats four times a day, each at its own moment of
   the 110 s round, so mealtimes are spread out. Watch the units on screen:
   now and then one says what it ate in a bubble ("Ate ½ food of venison.",
   "Mealtime: ½ food of trout."). A cavalry rider eats 1 food and says half
   of it went to its horse. These lines are bubbles only, never in the
   message panel; only units on screen speak, at most one meal line a second.
3. **Every kind in turn.** Meals go round the foods one kind after another,
   so after a few rounds venison, trout and eggs have each gone down, not
   the meat first. A started item leaves the count at once; its tooltip says
   what is left of it ("One more is started: ¾ food of it is left"), and that
   rest still counts on the Food cell. No food value is lost or gained in
   splitting items: a day of the seven starting units takes exactly 14 food.
4. **The hunger line.** Select one worker, warrior or mage: the selection
   panel shows "Next meal in 1 minute 12 seconds (½ food)." with a bar filling towards it, counting down live.
   Select two units, a building, a cow or a catapult and it is not there.
5. **Starving.** Right click every food slot to keep it back (Don't eat).
   At its next meal each unit says there was not enough food for it and
   complains, in a bubble and (this one line, an alert) in the message panel,
   where F4 jumps to it; the panel also has the group's alert ("Your
   workers are starving and slowed..."), and the Food cell goes red. At every meal it misses after
   that it says how it is ("Still no food. Starving for 1 minute: I'm 20%
   slower and can't heal. I start losing health in 20 minutes."). The hunger
   line adds the same in red. After three days of it, a unit loses 2% of its
   maximum health every 15 s (rounded, at least 1); fed units heal 1% (at
   least 1). Right click a food again and the next meals end it ("Food at
   last!").
6. **Who eats.** Workers, warriors, mages, a cavalry rider with its horse,
   working horses and oxen, and mercenaries while hired: they starve. Cows,
   hens, a horse in the stalls, catapults and cannons never eat, so they
   never slow down or lose health when the town starves. A mercenary let go
   at dusk stops eating. Research stops only while the Scholar's Lodge goes
   without its meal (2 food a day each), as Rations: Workers only does.
7. **Food kinds.** The meat a kill drops, in the hunter's bag or on the
   ground, is that animal's own: a boar gives boar meat, a deer venison, a
   goose goose meat; slaughtering a cow gives beef; giant rats drop rat meat;
   fishing gives trout in the Heartland, salmon in the Fringe and giant
   catfish in the Deepwoods. Each kind has its own slot and icon. Cooking
   takes any meat or fish ("1 meat"), from the kind most in stock. Halflings
   sell beef and chicken, Runkin trout, salmon and venison.
8. Unit tests: `packages/sim/test/food.test.ts` (even eating, the exact
   accounts over two days, who eats, who starves, 2% and 1% rounding, the
   meal and hunger lines, the hunger countdown, plurals, paying "meat" in a
   recipe, a save round trip, and saves made before patch 1, from before and
   after loot came in, loading with their Don't eat, meal credit, starving,
   bags and loot), and `packages/client/test/hunger.test.ts`.

## How a tester checks plant growth and saplings

Trees, hazel bushes, herbs and wild flax grow in steps, like crops in
Minecraft: each stage is a jump in size, and a plant holds only its stage's
share of what it gives when grown. Growing times, yields and the save format
are as they were, so old saves load. The stages are three tables in the
balance editor's World group (Tree growth, Hazel growth, Plant growth). Run
`pnpm dev`, open http://localhost:5173/?seed=1 and start.

1. **The hazel sapling.** Select the workers and right-click a hazel bush.
   One load of 10 sticks takes the whole bush, and where it stood is now a
   **Hazel sapling**: a low clump of 3 to 5 thin shoots with a green tuft on
   each, not a bare stub. Click it: the panel says "Holds nothing to gather
   yet: it grows hardwood sticks once it is bigger.", how long until it is a
   young hazel bush, and "Buildings can go over it: the builder pulls it up
   first." Workers find nothing to gather on it.
2. **Stepped growth.** Press **Speed** in the debug panel for 16 times speed
   and watch the sapling. It becomes a **Young hazel bush** (3 sticks) at 30%
   of its 2 days (about 4 minutes 24 seconds of game time), a **Half-grown
   hazel bush** (6) at 65% (about 9.5 minutes) and a **Hazel bush** (10) at
   2 days (14 minutes 40 seconds), each time in one jump. The panel's name,
   count and "Grows into ..." line follow it. A young bush can be gathered
   for what it holds; picked bare, it starts again as a sapling. Herbs and
   wild flax do the same over their 5 days: **Sprouting herbs** (nothing to
   gather, no flowers), **Half-grown herbs** (5) at half, then **Herbs** (10).
3. **Trees.** Select a pine and press **Fell**: it falls and drops 2 seeds
   beside it, small specks that hold nothing. At 6 minutes of game time each
   is a **Pine sapling** (a thin stem with three small green tiers, holding
   nothing), at 21 minutes a **Young pine** (a small tree, 7 softwood lumber),
   at 39 minutes a **Half-grown pine** (13) and at 60 minutes a **Pine** (20).
   Hardwoods do the same over 3 and 6 hours. The world also starts with a few
   seeds, saplings and young trees among the grown ones. Seeds and saplings
   cannot be chopped; a young or half-grown tree can be felled for what it
   holds and drops its seeds like a grown one.
4. **Building over small things.** Pick a building with workers (B) and hold
   its ghost over seeds, saplings, a hazel sapling or sprouting herbs: their
   tiles stay green, where a grown tree, a young tree, a bush with sticks on
   it, herbs, stone or flint still turn them red. Place it: the worker walks
   over, faces each sapling in the footprint and pulls it up (2 seconds a
   sapling, 1 second for sprouting herbs or flax; seeds are trampled), then
   pays and starts the building as before. Which things count, and how long
   each takes, are the stage tables' "Buildings can go over it" and "Time a
   builder takes to pull it up".
5. **Models.** `pnpm --filter @blockyrts/tools models:build` now also writes
   every world prop's state sets as models of their own, named
   `<id>@<set>`: `bush_hazel@regrown`, `crop_wheat@sprout`, `torch_post@unlit`
   and the rest, 572 models from the 519 files. Nothing draws them in play
   yet; `packages/client/src/world/prop-models.ts` names the model and scale
   for each growth stage, ready for the wiring pass.
6. `pnpm test` runs `packages/sim/test/plants.test.ts` (the stage tables, a
   hazel growing back from bare in steps, a young pine from seed to grown, a
   part-chopped young tree, placement over saplings and a builder pulling
   them up), `packages/client/test/plant-text.test.ts` (the panel's names and
   lines), `packages/client/test/props-shape.test.ts` (each stage drawn
   bigger than the last, the hazel sapling's shoots),
   `packages/client/test/prop-models.test.ts` (every stage names a catalogue
   model or state set) and `packages/tools/test/state-sets.test.ts` (the
   hazel's three looks, the unlit torch, a crop's stages).

## How a tester checks pause, the menu and Space

Jade's patch notes 1. The sim and every hash are unchanged: pausing only
stops the steps, and the lockstep frames decide the game. The relay protocol
is now version 4 (a pause carries who pressed it), so a page from before
this change is asked to reload when it joins.

1. **Alone.** `pnpm dev`, open http://localhost:5173/?seed=1. Press F10: the
   menu says the game is paused while it is open, the step count in the
   debug readout stops, and there is no Pause or Resume button, only the ✕ in
   the corner. F10, Esc or the ✕ closes it and the game carries on. The
   Pause key and the ❚❚ button top right open the same menu.
2. **Online.** Two players as in milestone 9 step 3. Opening F10 stops
   nothing; the menu has one Pause button. Either player presses it (or the
   Pause key, or ❚❚): the game stops for both, both menus open with the
   button reading Resume, and both see "NAME paused the game." in the
   message panel, in the menu and on the banner. The other player presses
   Resume: both menus close and both see "NAME resumed the game." A player
   who closed their menu while paused still has Resume on the banner. Close
   the window of the player who paused: their pause stays (the other may
   lift it with Resume), and the game waits for them as before.
3. **No remarks while paused.** Watch your units with the menu open alone,
   or paused online: nobody makes a random remark, and the next one comes
   at its usual gap after you carry on.
4. **Space.** Select some units or a building, pan away, press Space: the
   camera centres on the selection. With nothing selected the message panel
   says so. The latest urgent message moved from Space to F4; both can be
   rebound in F10 > Settings > Hotkeys.
5. `pnpm test` runs `packages/server/test/room.test.ts` (any player pauses,
   any player resumes, each press told to everyone with who pressed it, a
   second Pause ignored, a pause kept while its player is away),
   `packages/protocol/test/protocol.test.ts` and
   `packages/client/test/pause-controls.test.ts` (the keys, and no remark
   while paused). `pnpm --filter @blockyrts/tools net:test` has the host
   pause and the guest resume. In a browser:
   `node packages/client/test-e2e/hud-check.mjs` (the menu alone, ❚❚, Space)
   and `node packages/client/test-e2e/m9-online.mjs` (both players' menus).

## How a tester checks farm harvests

Jade's patch notes 1: no fallow days, each farmer speeds the harvest up, and a
selected farm shows its harvest bar. Patch 2 made one Farm of farm fare in
place of the crop fields, vegetable farms and herb bed, growing in full in
every band, and moved the hens to the Barn.

1. `pnpm dev`, open http://localhost:5173/?seed=1 and start. Build a Farm
   (B, F; before Patch 4, B, W) and right-click it with one worker. Select it: under its health and
   "1 of 2 farmers at work" a bar fills with the line "In 7 minutes 20
   seconds, 8 farm fare will be produced, giving a food value of 16." The bar
   starts with the farmer's first step of work.
2. Right-click it with a second worker. The time left halves (the bar fills
   twice as fast); the harvest stays 8 farm fare. Press **Speed** in the
   debug panel (x16) and watch the bar fill: 8 farm fare land in the
   inventory and the bar starts again. A third worker is turned away: the
   Farm takes two.
3. Take the farmers off (select them and give another order): the bar stands
   still and turns grey, and the line says no farmer is at work and what the
   next harvest will be.
4. The line under the bar says "Full yield in the Heartland: the Farm grows
   in full in every band." A Farm in the Fringe, Barrens or Deadlands says
   the same with its band and harvests 8 (before Patch 2 crop fields made
   half in the Fringe and Deepwoods and nothing in the Barrens).
5. A Barn with grown hens shows a bar running to the day's turn, when they
   lay: "In 2 minutes, 2 eggs will be laid, giving a food value of 2." Times
   read 1 second, 1 minute, 2 minutes 5 seconds.
6. Unit tests: `packages/sim/test/farms.test.ts` (no fallow days, the pace
   per farmer, the same harvest, every band in full, an old save's Farm, the
   hens' bar) and `packages/client/test/farm-panel.test.ts` (the line's
   wording and plurals). The balance editor's Food group has **Farm harvest**
   (440 s): the bar's length in one farmer's work; a shorter bar brings in
   less each time at the same yield a day.

## How a tester checks loot, Hunt and Gather

Jade's patch notes 1: hunting, loot and gathering. A kill drops loot instead
of a carcass, units carry it in a bag and hand it in, and Hunt and Gather
each start with one press and bring everyone home by nightfall. The sim
changed: every unit's bag and the loot on the ground are in the hash, so every
hash above moved (they are updated). Saves from before load with empty bags
and nothing on the ground; a carcass in an old save is still gathered as
before. Run `pnpm dev` and open http://localhost:5173/?seed=1.

1. **Loot from prey.** Select a warrior and right-click a deer. It chases the
   deer down and kills it: no carcass is left, the meat and hides go into its
   bag ("Got a deer: 4 venison and 2 hides." in its bubble), and its panel shows
   a "Loot:" line. When it is idle again, in the day, it walks the bag to the
   main base, hands it in (the meat lands in the inventory grid) and walks
   back to where it stood.
2. **Loot on the ground.** Kill something with a ranger from afar, or with a
   unit whose bag is full (25 lb, a worker's load counting against it): the
   loot falls where the animal fell, as the good's icon bobbing on the ground
   (hover it for what and how much). Right-click it with units: the nearest
   with room walk over and pick it up, as many as it takes to carry it all.
   Right-click it with only a cannon selected: the message says an engine
   needs its crew to pick loot up.
3. **Picking up by themselves.** Idle units pick up their own side's loot
   within 15 m (40 m for the unit that made the kill, so a ranger goes back
   for what it shot), but only when the fighting is done and no enemy is
   within 15 m of them or of the loot. Units with orders finish them first.
   At dusk and at night they only pick up what lies within 5 m, and they hand
   bags in only at dawn and in the day. Fight a night: the monsters' drops lie
   where they fell, and at dawn the units nearby fetch them and carry them
   home. Loot left lying rots after 3 days and nights.
4. **Talk.** Now and then a unit says what it picked up ("Picked up 2 bones."),
   in a bubble only; it never says "1 bones". A rare or valuable find is
   always remarked on with an exclamation ("A ruby and 4 gold from Morvath!"),
   also as a bubble: the message panel only gets lines that need you, such as
   "I cannot reach that."
5. **Hunt.** Select warriors (and workers to carry the meat) and press **Hunt**
   (N) once. They say what they are doing ("Spotted a deer.", "Taking the meat
   home.", "No game in sight. Looking farther out.") and what they got, hunt
   hares, deer and wild birds their side can see, and take the meat home when
   their bags are full (half full before Patch 5). They never go farther than they could walk back
   from in dusk's 40 s (about 100 m from the Big House at a warrior's 3 m/s):
   at dusk they say "Getting dark. Heading home." and are within 4 m of the
   main base by nightfall, and at daybreak they go out again. Wild boar, giant
   crabs, bears and creatures that guard their ground are left alone: a
   right-click on one hunts it, and only it.
6. **Gather.** Select workers and press **Gather** (G) once: no click on a
   node is needed (a right-click on a node still gathers that one). They fetch
   the basic materials the camp can use, most of what the stock is shortest
   of, the nearest first, choosing again after each load: softwood, hardwood,
   sticks, stone and flint at first; clay, sand and coal from main base level
   3; copper and tin ore once a forge stands; marble from level 4. They only
   go for what their side has seen; with nothing of use in sight they walk to
   the edge of the explored land, nearest the base first and sweeping round,
   no more than 25 m into the dark. At dusk they drop off their loads, say
   so ("Getting dark. Back to the base."), and go into the main base for the
   night; at daybreak they go out again. (Patch 4: workers near a building
   and a troop ask to work on through the night instead, and those that go
   in come out at dawn once no monster is near; see "How a tester checks
   working through the night".)
7. **Running out.** Right-click a small flint rock with a worker and let it
   run out with no flint near: the worker says what it gathers instead, and
   why (for example "No more flint here, and we're out of stone. I'll fetch
   stone, though there's softwood closer."), and goes for it, but only to a
   node its side has seen.
8. **Guarding workers.** Let a wolf or a night monster go for a worker with an
   idle warrior within 20 m: the warrior calls out ("Leave our worker
   alone!") and goes for it, then walks back.
9. Unit tests: `packages/sim/test/loot.test.ts` (who takes a kill's loot, the
   ground, idle pick-up and hand-in, the 5 m rule at dusk, the cannon, three
   pickers for 30 meat, what units say, Hunt's reach and its dusk return and
   morning start, a right-clicked hare, Gather's dusk shelter and morning
   start, the 25 m into the dark, the guards, a save round trip) and the
   loot steps in `m2.test.ts`, `m4.test.ts` and `m5.test.ts`;
   `packages/client/test/m3-controls.test.ts` ("Hunt, Gather and loot": one
   press each, the right-click on loot, Return with loot in the bag). The
   balance editor's new **Loot, hunting and gathering** group holds the bag,
   the distances, the talk rules, Gather's goods by stage and the guards'
   reach.

## How a tester checks the HUD revamp and touch controls

Jade's patch notes 1, the HUD items. Client only: the sim, the server, saves
and every hash are unchanged. Picks in blueprint/hud-picks.md.

1. **The strip.** `pnpm dev`, open http://localhost:5173/?seed=1 at 1920 x
   1080. Along the bottom edge, touching: the minimap with the utility bar
   on top, the portrait, the selection panel, the command card. The card is
   4 rows tall and 10 columns wide here; the usual 5 x 3 block (with the
   grid keys until Patch 4) is its bottom right corner. At 1280 x 720 the
   card has 5 columns; at 1024 x 768 the whole HUD is drawn smaller and
   nothing is cut off.
2. **Portrait.** Click a warrior: its head and shoulders, in its kit,
   breathing in its idle clip. Click the Big House: the house from about 45
   degrees. A deer or a beetle (debug "Creature") shows whole; a tree shows
   its good. Click the portrait: the camera centres on it.
3. **Mixed selection.** Drag a box round the workers and the warriors (a
   box takes units before buildings), then hold Shift and click the Big
   House: the middle has a tab per type, the Big House first (it cost
   most), with its card and portrait. Tab steps to the
   warriors, then the workers. Right click the ground: the units walk, the
   house stays. The group key (`) + 1 keeps the mix as control group 1.
4. **Card pictures.** Every card button is a picture; hover one for its
   name, key and what it does. The Big House's queue shows troop pictures,
   no letters. Hover the first item of a queue: "Complete in 36 seconds.
   Click to cancel; full refund.", counting down.
5. **Doing now.** Select workers and send them to gather: a gold arrow bobs
   over Gather, with a gold ring round it. Attack-move warriors: the arrow
   sits on Attack while they walk and fight.
6. **Messages.** Hunting, gathering, loot and upgrade lines show only as
   bubbles; "I cannot reach that." and other alerts also reach the message
   panel. No line says "1 more minutes", "1 eggs" or "0 of 1 workers".
7. **The skin.** Panels in dark wood with iron edges and rivets, buttons in
   iron frames (gold when lit), titles, hotkeys and counts in the menus'
   pixel font. The debug readout keeps its plain look.
8. **Touch.** Open the page on a phone or tablet, or in Chrome's device
   toolbar with a touch device: a box asks "Playing on a touchscreen?". Yes:
   tap a worker to select it, tap the ground to send it there, drag one
   finger to pan, pinch to zoom, hold a finger on a button for its tooltip,
   tap Box (in the utility bar, or the fold column on a phone) and drag for
   a selection box. On a phone (under 700 px wide or 480 px tall) the panels
   fold under buttons in the bottom left; the card stays. The answer is kept;
   Settings > Camera > Touch controls changes it. A desktop without a
   touchscreen is never asked.
9. Unit tests: `hud-layout.test.ts` (the strip at every size, card columns
   and rows, the phone folds), `hud-mixed.test.ts`, `selection-rules.test.ts`,
   `hud-icons.test.ts`, `hud-wording.test.ts`, `portrait.test.ts`,
   `hud-rects.test.ts` and `settings-start.test.ts` in packages/client/test.
   In a browser (with the dev server on port 5198):
   `node packages/client/test-e2e/hud-check.mjs` (desktop, 68 checks) and
   `node packages/client/test-e2e/touch-check.mjs` (phone and tablet with a
   touchscreen, 23 checks).

## How a tester checks wandering night monsters and the bats' swoop

Jade's patch notes 1: monsters roam the explored wild at night, and flyers
swoop down and away instead of dropping at once. Every hash above moved: the
wild's patches are part of the save (snapshot version 16), and flyers fly,
and are shot at, differently. Saves from before (versions 13 to 15) still
load, and their wild fills afresh round the units.

1. **The wild at night.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   start. Pan about 100 m out from the camp, press **Reveal** in the debug
   panel, and walk a warrior or two out there, 60 m or more from your
   buildings and torches. Press **Speed** until night falls. Monsters come
   out in the explored land round them, never in sight of a unit, never
   within 40 m of claimed land and never within three times a lit light's
   reach, so not on the town: three groups on each 25 m patch since Patch 3
   (one before), each 1 or 2 of a kind on a spot of its own, of the
   kinds the waves have brought so far (giant rats most, then zombies and
   cave bats, slimes, now and then a giant spider). From night 5 a patch may
   hold a group of one weak kind instead, larger as the nights go on.
2. **Who they go for.** They stroll on 7 to 20 m every few seconds, so a unit
   standing still in the forest is found sooner or later. A wanderer comes
   for a unit only once it could reach it in 2 s (a giant rat at 9 m, a cave
   bat at 12 m, a zombie at 3 m), or one within 3 m across a wall; it gives up
   8 m past that or 30 m from where it was strolling. A unit that shoots one
   draws it in. Buildings, torches and traders nobody has met are left
   alone. At the camp nothing changes: the waves come as before, as many.
3. **Dawn.** They burn or flee at dawn like the waves; the land is empty 30 s
   into the dawn.
4. **The swoop.** Watch a cave bat (night 0 on) go for a unit: it glides down
   to 0.6 m and bites from there holding still, then rises and pulls off to a
   new spot round where the unit stood, 1.4 m to 2.2 m up, and dives in again
   from there; no two swoops take the same line. Melee units hit it as
   before, and archers, slingers and musket rangers aim where its swoop will
   take it. **Night mob** in the debug panel brings a gravewing (night 30) to
   see the high flyer's swoop from 12 m.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/wanderers.json --quiet`
   prints `final step 10000 hash e49bae41`: the debug tools explore 200 m round the
   camp, and the three warriors walk 90 m east at dusk, into the Fringe
   since Jade's mini patch, and stand there through night 0. About 86
   monsters are out at nightfall (27 before Patch 3 tripled them), round
   them and round the workers at the camp, up to 225 at once later and 296
   by the end of the script, and all four workers at the camp fall; five of
   them go for a unit, and night 0's monsters marching on the camp fall on
   the warriors and kill one; the other two end the night at full health
   and about three fifths. They walk home at step 8200; a giant spider
   goes for the wounded one on the way and falls to it before its bite
   lands, so both come home (before Patch 4 the bite landed and its poison
   killed the wounded one).
   `pnpm test` runs it in Node, Chromium, Firefox and WebKit too.
6. `pnpm test` also runs `packages/sim/test/wanderers.test.ts`: where they
   come out (claimed land, lights, units, unexplored land, a peaceful game, a
   goblin village), the pool and groups by night, the 2 s reach and the 3 m
   rule across a wall, unmet traders, giving up, the night's waves planned
   the same with them out or not, dawn, a patch emptied and filled again the
   same, a version 13 save, a replay and a snapshot round trip, and the swoop
   of a cave bat and a gravewing (never down faster than its dive, a bite
   every attack time from a new spot, always in reach, and a shooter's lead
   exactly where the bat turns out to be).
7. The balance editor has **Wandering night monsters** under Mobs and nights
   (every number above) and SWOOP under Mob abilities (dive and climb speed,
   the pull-off's distance and height).

## How a tester checks the sound redo

Every sound in the game was remade by an outside sound service from the
brief in the project's `audio/sound-redo-brief.txt`. The game now plays those
files (`packages/client/public/audio/`, MP3, about 22 MB in all) and still
makes any sound whose file is missing or will not load in code, as before.
The original WAVs stay in the project's `audio/originals/`, never in the
repo. No hash changed: sound only listens to the game.

1. `pnpm test` runs `packages/client/test/sound-files.test.ts` (every sound,
   take and music stem the game plays has a file on disk, within the brief's
   lengths, music stems the same length; the extras are all there; each night
   monster the redo voiced maps to its sounds by its sim name; monsters call
   as they strike, one of a kind at a time, and fall back to the shared death
   where a file is missing; the ambience follows the day) and the
   `finished sound files` tests in `packages/audio/test/audio.test.ts` (the
   cut back to the exact sound whether or not the browser drops the MP3
   encoder's silence).
2. **Menu.** `pnpm dev`, open http://localhost:5173/ and click anywhere: the
   menu theme plays, and fades out as a game starts. The Settings music
   slider in the menu changes it at once.
3. **In the match.** Start a game and click once. Day music plays over
   birdsong and breeze; work, hits and clicks are the new sounds. At dusk the
   new horn, the dusk track and the night's crickets and wind; on a blood
   night its own music and hot wind. Zombies, skeletons, rats, bats, spiders
   and slimes call out as they strike and each dies with its own sound
   (`?seed=1`, wait for night 0); the later night monsters and Morvath have
   their own too.
4. **Fallback.** Block `/audio/` in the browser's network tools (or delete a
   file in `public/audio/`) and reload: the game plays the old code-made
   sound for anything it cannot load, and the console says which.
5. **New WAVs.** `pnpm --filter @blockyrts/audio sounds:build <folder>`
   (needs ffmpeg) checks a delivery against the sound list, encodes it and
   rewrites `packages/client/src/audio/sound-files.json`. Music and ambience
   are encoded with a second of wrap-around each side and cut back after
   decoding, so their loops have no seam.

## How a tester checks Patch 2's lights, tips, tester tools and minimap

Round 4 of the Patch 2 design (`blueprint/patch-2.md`). Saves from before
Patch 2 do not load (the standing rule for every patch).

1. `pnpm test` runs `packages/client/test/patch2-tips-tools-map.test.ts` (the
   key code, the tips' timing and their one question, which units the
   minimap shows and in what colour, enemies only in sight, no red among the
   player colours) and the sim's light checks in `m2.test.ts`, `m5.test.ts`
   and `vision.test.ts` (lights burn with no fuel, a snuffed light relit by
   a worker in 2 s, the bonfire's 20 m sight).
2. **Tester tools.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   start: there is no debug readout and no debug bar, and on a phone no ⚙
   button among the folds. Type M N B V C X Z in order in the game: the
   readout and the tools show, with the message "Tester tools shown. Type
   the code again to hide them." Type it again and they hide. Any other key
   or any click in between starts the count again (M N B Q V C X Z opens
   nothing; nor does M N B V, a click, C X Z), and the keys keep their usual
   jobs while you type them. A new game or a reload starts with them hidden.
3. **Lights.** Select a worker: Lights (B then T; before Patch 4, B then V) has the torch
   post (2 softwood, 1 resin, lights 10 m, claims 5 m) and the bonfire (15
   softwood, 3 by 3, lights 20 m, claims 10 m, buildable from the start);
   the wall torch and the lantern are cut in Patch 2. Build both; select
   one: "Lit. It needs no fuel." Let a few days pass with **Speed**: they
   stay lit and no worker goes to feed them. The bonfire stands in as the
   campfire model at twice its size until its own model arrives. A light a
   goblin mage snuffs, or an outlying torch post a badger knocks over, reads
   "Out: right click it with a worker to relight it."; right click it with a
   worker, who walks over,
   works at it for 2 s and lights it again for nothing. Lights more than 40 m
   from the main base still count against the night's limit, a bonfire as
   one.
4. **Tips.** New game > Play alone (or `?seed=1` with Settings > Help > Tips
   on). The first tip shows at the top of the view as outlined text with no
   frame: "Tip: ..." with an ✕. It goes by itself after 12 s of game time
   (paused time does not count); the next tip waits until you have done what
   the last one said. Press ✕ on a tip: the text turns to "Turn tips off?"
   with the question bubbles' Yes (a green tick) and No (a red cross), each
   saying what it does in its tooltip. Yes: no more tips this game. No, or no answer in 12 s:
   the tips go on, and every later ✕ just closes its tip without asking.
   A new game asks again once. Settings > Help > Tips off: no tips at all.
5. **Minimap.** Your units are 2 px dots and your buildings their footprint
   (at least 2 px) in your colour, drawn over the land and under the lair,
   village and people marks; your mercenaries are in your colour too. With
   `?seed=1&players=2` (or two players in a lobby) the other player's are in
   theirs. Night monsters, lair guardians, goblins, attacking wanderers and
   peoples at war are red dots, and only while one of your side's units or
   buildings sees them (**Show all** shows them all). Wild animals and
   peoples at peace are not shown.
6. **No red for players.** The lobby's colour picks are Blue, Green, Yellow,
   Purple, Orange, Teal, Pink and White, each with its banner; red is kept
   for enemies.

## How a tester checks the tips and the paused sound (Patch 3)

1. `pnpm test` runs `packages/client/test/patch3-tips-pause.test.ts`: the
   tips name Build, Lights and Torch post as the build menu shows them, the
   torch's cost and the player's own keys, and stay short; while paused the
   audio engine fades out and refuses every world sound and keeps the
   interface's; the match stops its work sounds while paused.
2. **Tips.** Start a new game with Settings > Help > Tips on. Each tip shows
   a flashing yellow arrow pointing right before "Tip:", and its words are a
   little larger and bolder than before Patch 3. Read them in order (select
   a worker, gather wood, build, light a torch, then at dusk Everyone Home):
   each says what to click, and the torch tip reads "select a worker, click
   Build, then Lights, then Torch post, and left click where you want it. It
   costs 2 softwood lumber, 1 resin (cut down a pine or spruce for resin)."
   Rebind Build or Everyone Home in Settings and start again: the tips name
   the new key. The ✕, "Turn tips off?" and its Yes and No look and work as
   before. With nothing selected, the middle panel's three help lines name
   your own keys too.
3. **Paused sound.** Put workers to chopping and digging near the camera and
   wait for a fight or the dusk horn, then press F10 (alone, the open menu
   is the pause): the chopping, fighting and voices stop at once, and the
   music and the birds (the ambience) play on; the menu's clicks still
   sound. Close the menu: the world is heard again. Online, either player's
   Pause does the same on both machines.

## How a tester checks the middle's bars and layout (Patch 3)

*Jade's Patch 3, the middle HUD items: the title row runs the full width
with "HP:" and "XP:" bars to the clear button, the queue moves under it, and
everything under the control groups grows to fill the section. Picks in
blueprint/patch3-middle-hud-picks.md. The panel is
`packages/client/src/hud/selection-panel.ts`, the fill
`packages/client/src/hud/middle-fit.ts`, the XP bar's words
`packages/client/src/hud/xp-bar.ts`; the sim sends each unit's experience
and what its next rank needs (`rankXp`, unit fields 26 and 27).*

1. **The tests.** `pnpm test` runs
   `packages/client/test/patch3-middle-hud.test.ts`: the XP bar shows for
   workers, troops and mages only, fills toward the next rank and words its
   tooltip ("Soldier: 120 of 150 XP to Veteran."), is full at the top rank;
   a long name breaks into two even lines; the fill takes the largest
   twentieth that fits, up to 3 times, and shrinks to no less than three
   quarters before it scrolls.
2. **One worker.** `pnpm dev`, open http://localhost:5173/?seed=1 and click a
   worker. The row under the control groups reads "Worker" in large letters
   as tall as the two bars beside it, a thin vertical line, then "HP:" and
   the health bar with 60/60 on it running to the ✕ button, and under it
   "XP:" and a bar as long and as tall. No rank badge. The ✕ (F3 in its
   corner) is as tall as the row. Hover the XP bar: "Labourer: 0 of 50 XP
   to Hand." Set it building or gathering and the bar fills as it works
   (the worker ranks of Patch 3, the section below). The tool, the bowl and
   "Idle" under it are larger than live now: the whole block has grown to
   fill the section, its pictures square, nothing stretched.
3. **A troop.** Click a warrior: "Club fighter" (on two lines when the name
   is too long for half the row), HP and XP. Hover XP: "Recruit: 20 of 50
   XP to Soldier." Let it fight: the light blue bar fills; at 50 it becomes
   a Soldier and the bar empties, then fills from 50 toward Veteran's 150
   (the tooltip keeps the running count: "Soldier: 50 of 150 XP to
   Veteran.").
4. **A mage and a rider.** Type M N B V C X Z, press **Sanctum**, **Mage
   kit** and **Barn**, train a Support mage at the Sanctum and a cavalryman
   at the Barracks. The mage's row has HP, XP and "MP:" (her mana) under it;
   the rider's HP, XP and "Horse:"; every bar the same height, the ✕ as tall
   as the three rows.
5. **The Big House.** Select it and press A a few times: the workers queue
   under the title row as large pictures read from the left, the first with
   its bar, then a dark well for each place still free (5 in all). Click one
   to cancel it. "Level 7" (with **Citadel**, else its level) is the first
   picture under the queue.
6. **The Barracks.** Press **Troop kit** and select the Barracks: the title
   row with its health bar, the five wells of its queue, then the five cards
   from the left. The section is taller than before (it grows upward just
   enough, as the action menu's card does, never past the portrait beside
   it). Click a card: its unit fills the first well. Open a weapon slot: the
   tier strip still opens just above the middle, pointing at the slot.
7. **Several.** Drag a box round everything: "7 selected" large, the ✕ at
   the row's right end, the tabs and portraits under it filling the
   section.
8. **Sizes.** Resize the window to 1024 by 768 and to a phone (844 by 390):
   the same layout at every size; on a phone the section does not grow, and
   a Barracks' cards shrink a little to fit rather than hide their slots.
   `node packages/client/test-e2e/middle-look.mjs http://localhost:5198
   /tmp/shots` (with `pnpm --filter @blockyrts/client exec vite --port 5198`
   running) saves each of these at four screen sizes and checks the bars
   run to the ✕, the XP bar matches the HP bar, the tier strip sits above
   the middle and nothing spills past the frame.

## How a tester checks worker ranks and crew retraining (Patch 3)

Jade's Patch 3 file, items 1 and 2. The picks are in
blueprint/patch3-worker-ranks-crew-picks.md. Older sections above that send
workers to train a rank with U describe the game before Patch 3.

1. **The tests.** `pnpm test` runs packages/sim/test/patch3-ranks-crew.test.ts
   (a load of pine teaches a worker 2.5 experience and the walk none; building
   teaches; 12 steps of work make a tenth with starting tools and better tools
   learn faster; a worker rises Labourer to Elder with its health, and
   fighting adds to the same ladder; workers can no longer train a rank and a
   worker's train order from an old save is dropped at no cost; the unit view
   carries experience and the next rank's need; a horse hauls a catapult with
   no crew, and an ox hitched to a ballista with no crew lets it fire and
   break a goblin hut, then let go it needs its crewman again; a crewman
   retrains at the main base in 30 s saying so and gets up a Labourer, at no
   cost; a new order cancels it; only crewmen take it, and with no main base
   he says so; a save made while he retrains plays on the same), and the
   client's m2-controls, m3-controls, m8-controls and hud-icons tests (no
   Rank button on the worker card, Retrain on W on the crewman's card, the
   experience in the unit view).
2. **No rank button.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   select a worker: Move, Gather, Unload, Repair, Dig, Prospect, Build, Eat,
   Equip and Cart, with no Rank button, and U does nothing.
3. **Workers rank up by working.** Put the four workers to chopping or
   building and let them work: each minute of work is worth 10 experience
   with their hardwood tools (walking teaches nothing), so a worker kept busy
   rises to Hand after about five minutes of work, its name in the selection
   panel changing from Labourer to Hand and its most health from 60 to 70.
   Master worker takes 150, Foreman 400 and Elder 1000. Workers that only
   fight learn very little. The tester tools' **Speed** button (type M N B V
   C X Z first; a game alone) runs the game at 4 or 16 times speed to get
   there sooner.
   The XP bar under the name arrives with the middle HUD's Patch 3 work.
4. **Towing needs no crew.** Type M N B V C X Z to show the tester tools and
   press **Siege kit**. Select the catapult's two crewmen and move them far
   off, so the catapult has no crew by it. Press **Barn** for a
   Barn with 2 horses and an ox, select the catapult, right click a horse to
   hitch it and move the catapult: it rolls with no crewman near. Scroll
   the view about 30 m from it and press **Night mob**: it fires with no
   crew while the horse is hitched. Select the catapult and press R (Let
   go): it stops firing until its 2 crewmen stand by it again.
5. **Retraining a crewman.** Select a crewman: his card has **Retrain** (W),
   whose tooltip says it takes 30 s and costs nothing. Press W: he walks to
   the Big House, sits down tinkering with a bar over his head and a bubble
   saying "Retraining to be a worker.", and after 30 s gets up a worker, a
   Labourer with hardwood tools, still selected. Give another crewman W and
   then a Move before the bar fills: he gets up and stays a crewman. Nothing
   in the stock changes either way.

## How a tester checks troop names (Patch 2)

*A troop goes by its weapon tier's name, everywhere a unit is named; the type
name stays on the training buttons; workers at rank 4 and 5 are Foreman and
Elder. The names come from one sim function, `unitTitle()` in
`packages/sim/src/units/names.ts`.*

1. **The tests.** `pnpm test packages/sim/test/troop-names.test.ts`: every
   weapon tier of every type has its name and the Brawler keeps its own, a
   troop's name changes with its weapon tier and reads the same in its lines,
   and Foreman, Elder and the mages' titles.
2. **The start.** `pnpm dev`, open http://localhost:5173/?seed=1. Select one of
   the three starting warriors: the panel reads "Club fighter (Recruit)" (live
   now: "Close melee (Recruit)"). Hover its portrait: the same name.
3. **An upgrade.** Press **Troop kit** on the debug bar, select a starting
   warrior and upgrade its weapon: while the bar fills it is still a Club
   fighter; the moment the bar is full the title reads the new tier's name
   ("Flint axeman (Recruit)" one tier up, "Champion (Recruit)" at tier 8).
4. **The Barracks.** Select the Barracks: the training buttons still say
   Train close melee, Train long melee, Train ranger, Train brawler. Train a
   long melee troop with an iron pike: the message reads "A new pikeman is
   ready." and the troop's title "Pikeman (Recruit)". A ranger with a sling is
   a Slinger, a bronze-tipped one a Bronze archer, a musket ranger a Musketeer;
   a brawler stays "Brawler (Recruit)"; cavalry is a Lancer up to a
   Greatsword rider.
5. **Lines and bubbles.** A troop under attack speaks under its tier name in
   the message panel ("Copper swordsman (Recruit)" rather than "Warrior
   (Recruit)" before Patch 2); a mage speaks under its school and rank
   ("Battle mage (Acolyte)"). Rank-ups read "A club fighter has risen to
   Soldier."
6. **Foreman and Elder.** A worker that reaches rank 4 or 5 in combat reads
   "Worker (Foreman)" or "Worker (Elder)" (live now: "Worker (Rank 4)" and
   "Worker (Rank 5)").

## How a tester checks the question bubbles and the chat rule (Patch 2)

Jade's Patch 2, round 3 and "What reaches chat" (blueprint/patch-2.md). The
picks are in blueprint/patch2-questions-picks.md. Questions are not state:
hashes and saves never see them, and a loaded game starts with none.

1. **Better kit.** `pnpm dev`, open http://localhost:5173/?seed=1. Within a
   second the three starting warriors' bubble asks "Three of us could use
   better kit. Upgrade?" with a green tick and a red cross under it. Hover
   each: the tooltip says what it does, Yes's with what it takes from the
   stock. Click the tick: they walk off to upgrade, the weapon first. In a
   new game click the cross instead: nothing happens, and they do not ask
   again until the stock pays for something better.
2. **The wait.** Leave a question alone: it goes after 10 s (30 s before
   Patch 3). Open F10 while one is up: it stays as long as the game is
   paused, then waits out the rest of its 10 s. Click beside the buttons: the click reaches the world
   (the bubble itself takes none). With tap controls on, a tap on Yes or No
   answers.
3. **Hurt.** Let a worker or warrior fall to 70% health or less (a wolf will
   do) and get away: out of the fight it asks "I'm hurt. Can I eat to heal?"
   (with others hurt near it, "Three of us are hurt. Can we eat to heal?").
   Yes: each walks to the nearest main base or storehouse, eats, and goes
   back to what it was doing.
4. **Up top.** Man a tower with close warriors and wait for night: now and
   then one asks "Let me down to fight those zombies?" (naming what walks
   below). Yes: he comes down and attacks the nearest one on the ground.
   "I'm not much help up here!" stays a bubble and is no longer in chat.
5. **Dawn.** Let something damage a building in the night, and keep a worker
   idle: at dawn the main base asks over its roof "One building is damaged.
   Repair it?". Yes: the nearest idle worker goes to repair it, one worker to
   a building. It asks once a dawn.
6. **Ran out.** Send a worker to the last tree of a far grove with nothing
   else near: when it is gone it asks "No more softwood nearby. Look farther
   off?" with the idle gatherer's sound (before Patch 2 it said "I have run
   out of softwood lumber nearby." in chat). Yes: it walks to the nearest
   softwood it can reach before nightfall and says so in a bubble.
7. **At most three.** With several questions due at once, no more than
   three are up for a player; the next comes up as one is answered or ends.
8. **Online.** Two players as in milestone 9 step 3: each sees the other's
   questions as plain bubbles without buttons, and neither sees them in
   chat. The crewman question ("A crewman fell. Train another?") waits for
   the Artillery workshop's crewman (Patch 2, wave 2).
9. **The chat rule.** Only urgent lines from your own units reach the message
   panel, each pinging the minimap and joining F4's list: "Help! I am being
   attacked by a zombie!" (naming the attacker since Patch 3), a failed order ("I cannot reach that.", "Not enough ...") and
   now "That cart is gone!". Another people's greetings, trade answers and
   war cries are bubbles only; open their trade or hire menu and the last
   thing they said to you shows under its title. Their news (war declared,
   a surrender offer) is still in chat as the game's own line.
10. `pnpm test` runs `packages/sim/test/questions.test.ts` (each question,
    Yes and No, the 10 s wait, three at a time, rests, a leaver's units, not
    saved, every machine in step), `packages/client/test/question-bubbles.test.ts`
    (the bubble waits in game time, over a roof for a building, buttons only
    for the owner), `packages/client/test/hud-wording.test.ts` (the chat
    rule) and `packages/client/test/m10-audio.test.ts` (the run-out cue).

## How a tester checks Patch 3's speech: who attacks, questions and held bubbles

*Jade's Patch 3 (2026-10-04), the speech items. Picks in
blueprint/patch3-bubbles-chat-picks.md. The lines are in
`packages/sim/src/peoples/speech.ts` (sayAttacked, aFoe, sayTinkering), the
questions in `packages/sim/src/units/questions.ts`, the held bubbles in
`packages/client/src/hud/bubbles.ts`.*

1. **Both start questions.** `pnpm dev`, open http://localhost:5173/?seed=1.
   Within a second the three warriors ask "Three of us could use better kit.
   Upgrade?" and the four workers "Four of us could use better tools.
   Upgrade?" (before Patch 3 only the warriors asked). Hover the workers'
   tick: the start's stock pays for three workers' tools, and the tooltip
   says "The stock pays for 3 of the 4, the highest rank first: ...; the rest
   keep their tools." At the same moment the Big House says over its roof
   "If you upgrade all their tools you may not be able to make any structures
   right away, choose wisely." in a plain bubble, for twice as long as a
   usual bubble (about 15 s), and never again that game. It is not in chat.
2. **First come, first served.** In a new game click the workers' tick first:
   three walk off to upgrade their tools and the stock drops by exactly what
   they take. Then click the warriors' tick: they get only what is left (one
   flint hand-axe at the start). The other way round, the warriors take
   their kit first. Nothing in the stock ever goes below zero. After either
   tick, hover the other question's tick: its tooltip counts only what is
   left (after the workers' Yes the warriors' says "The stock pays for 1 of
   the 3, ... From the stock: 2 hardwood sticks, 1 flint."; after the
   warriors' Yes the workers' says "The stock pays for 2 of the 4, ... From
   the stock: 12 hardwood sticks, 2 flint, 10 stone."). It recounts whenever
   the stock changes, and a question the stock no longer pays for any of
   goes, to be asked again once it does.
3. **The 10 s wait.** Leave the questions alone: they go after 10 s of game
   time (the balance editor's Questions group, QUESTION_WAIT_STEPS). Paused
   with F10, they stay.
4. **Who attacks.** Let a zombie or a wolf reach a worker: the chat line is
   "Help! I am being attacked by a zombie!" (or "... by a wolf!"); a warrior
   says "We are under attack from a giant spider!", a mage "I am under attack
   from an ash golem!". It names the enemy whose blow made it speak.
5. **Eat to heal only when idle.** Let a worker fall to 70% health or less
   and keep it busy (gathering, walking, fighting): it does not ask. Leave it
   idle, out of the fight: 5 s after its last hurt it asks "I'm hurt. Can I
   eat to heal?". Give it an order while the question is up: the question
   goes at once, and it may ask again once it is idle.
6. **Bubbles held for the bar.** Say Yes to a hurt unit's question: as it sits
   at the main base its bubble reads "I'm eating my fill of venison." (before
   Patch 3 "I ate my fill of venison.") and stays up the whole 10 s the bar
   runs, going when the bar does. A warrior given Upgrade equipment with a
   weapon and armour to take says "Upgrading to flint hand-axe." for the
   first bar, then "Upgrading to leather jerkin." for the second, and
   "Upgraded to leather jerkin." only when it gets up.
7. `pnpm test` runs `packages/sim/test/patch3-speech.test.ts` (the attacker's
   name, the 10 s wait, eat to heal only when idle and its withdrawal, the
   upgrade lines and their holds, both start questions, the advice once and
   only on the first day, first come first served three ways, the other
   tooltip recounted and a question withdrawn when the stock pays for none)
   and the held bubbles and the recounted tooltip in
   `packages/client/test/question-bubbles.test.ts`.

## How a tester checks the fourteen buildings (Patch 2)

Jade's Patch 2, round 1 (blueprint/patch-2.md). The picks are in
blueprint/patch2-buildings-picks.md. The build menu went from 31 entries in
two menus to 14 in one; only the Big House keeps levels, and what a tier
unlocked before now comes at the main base level that tier needed. Saves
from before Patch 2 are refused with a plain message (the standing rule).
Older sections above name buildings Patch 2 cut: read a crop field, vegetable
farm or herb bed as the Farm; a pen and barn, livestock farm or Stables as
the Barn (cavalry trains at the Barracks); a lumber mill, Tannery or
Herbalist hut as the Workshop; a Kiln, Powder mill, Foundry, Casting Hearth,
Bloomery, Ironworks or Steelworks as the Forge at a main base level; a
Gunnery yard as the Artillery workshop. Cooking, the kitchens, the lantern,
wall torch and brazier are gone.

1. **One Build menu.** `pnpm dev`, open http://localhost:5173/?seed=1, select
   the workers and press B: Big House, Farm, Barn, Storehouse, Fishing
   dock, Workshop, Forge, Artillery workshop, Barracks, Magi Sanctum,
   Scholar's Lodge, Mineshaft, Defences and Lights, and Back. From Patch 4
   each is on a letter of its name (H F R S I W G A B M C N D T) and Back on
   Esc; before, they sat on the grid layout Q to V with B for Back. The
   worker card has one Build button where Basic and Advanced were.
2. **Defences and Lights.** D opens Defences: the softwood, hardwood and
   stone walls, the gates each way, the towers, then the earthworks. It is
   17 choices, so on a card too small for them the last slot reads "More
   1/2" (+; V before Patch 4) and shows the rest, as the K menu pages. T in
   the build menu opens Lights: the torch post and the bonfire.
3. **The Farm and the Barn.** Build a Farm: two farmers grow farm fare ("A
   hearty medley of vegetables"), 8 a farmer-day, and it gives 10 supply. The
   **Barn** button on the debug bar puts down a red barn with 2 horses and an
   ox in its stalls and 100 farm fare; select it: "3 animals; 3 of 10 stalls
   taken; they eat 3 farm fare a day". Workers tame cattle, chickens, horses
   and oxen into a Barn with farm fare (a chicken is a sixth of a stall).
   What the animals eat is in the next section.
4. **Cavalry at the Barracks.** Select a Barracks: Cavalry (C) sits after
   the brawler, greyed "Needs a level 3 main base." until the main base is
   level 3, then "Cavalry needs a tamed horse in a Barn." until one stands
   in a Barn; trained, the horse leaves the nearest Barn.
5. **No workers in crafting buildings.** Build a Workshop, a Forge or an
   Artillery workshop: right-clicking it with workers does not assign them,
   and their queues run on their own at the pace two workers had inside
   before Patch 2 (the crafting pace), so a recipe that took one worker 10 s
   takes 5 s; the K menu tooltip shows that time. The Workshop makes planks, leather, rope, bandages and
   remedies, gravel, sticks, ramp steps, carts and trinkets; the Forge
   smelts every metal and makes charcoal, bricks, glass and gunpowder; the
   Artillery workshop makes catapults, ballistas and cannons. The Farm,
   Mineshaft and Fishing dock keep their workers.
6. **Main base levels.** Press K on a Forge: copper, tin and bronze ingots
   from the start; wrought iron, charcoal, bricks and glass read "Needs a
   level 3 main base."; pig iron and iron need 5; steel, carbon steel and
   gunpowder 7. Kit tiers follow the same steps: a bronze kit needs a Forge,
   a wrought iron one main base 3, steel 7. The Workshop's hand cart needs 3
   and its ox cart 5; the Artillery workshop's catapult needs 5, its
   ballista 7, its cannons 8. Research waits on main base levels too (Siege
   engines 5, Deep Mining II 6, Steel and Gunpowder 7, Deep Mining III,
   Muskets and Cannons 8). **Citadel** on the debug bar raises the main base
   to 10.
7. **Mines.** A Mineshaft has no tiers: every shaft digs to the depth its
   owner's research reaches (Deep Mining II and III), so researching one
   deepens the shafts already standing. A worked-out shaft says which
   research digs deeper.
8. **No cooking.** The K menus offer no food recipe; meat shows raw in the
   inventory and is eaten as it is.
9. **Saves.** Loading a save made before Patch 2 says it is from an older
   version and loads nothing.
10. `pnpm test` covers it in `packages/sim/test/farms.test.ts`, `m2`, `m3`,
    `m4`, `m8` and `queue-countdown.test.ts` (the Farm, the Barn, workerless
    crafting, Forge steps by main base level, cavalry at the Barracks, mine
    depth by research), and `packages/client/test/m2-controls.test.ts` (the
    one menu, Defences paging, Lights). `pnpm --filter @blockyrts/tools
    balance --pacing` runs the pacing check on the new ladder, with no labour
    counted for workerless crafting and 14 Farms in the night 110 town.

## How a tester checks the Barn's farm fare and the meal lines (Patch 2)

Jade's Patch 2, round 1, second wave (blueprint/patch-2.md). The picks are in
blueprint/patch2-farm-barn-picks.md. Barn animals cannot graze, so they eat
farm fare; a cow gives twenty times a chicken's food; meals say what was
eaten with no amount. Older sections above that say animals graze: read it
as walking round their Barn by day.

1. **The Barn's feed.** `pnpm dev`, open http://localhost:5173/?seed=1, type
   M N B V C X Z to show the tester tools and press **Barn** on the debug
   bar: a Barn with 2 horses and an ox and 100
   farm fare. Select it: "3 animals; 3 of 10 stalls taken; they eat 3 farm
   fare a day" (cattle, horses and oxen 2 food a day, a chicken 1; farm fare
   is 2 food). Right click farm fare in the inventory to keep it back from
   meals, press **Speed** (x16) and watch the day turn: farm fare drops by 3
   at sunrise, kept back or not, however much grass is round the Barn.
2. **Hungry animals.** Let the farm fare run out (sell it to a people, or
   let the town eat it at x16, about ten days): at sunrise each animal that finds
   none loses a tenth of its health, never the last of it, and chat says
   once "Your Barn animals went hungry: there was not enough farm fare for
   them. Hungry animals lose health."
3. **A cow is twenty chickens.** Tame or buy a cow and press K on its Barn:
   "Slaughter a cow" gives 20 beef and 2 leather (a chicken 1 chicken meat
   and 2 feathers; 4 food each). A hunted wild cow drops the same: the
   hunter's 25 lb bag takes 10 beef and the rest lies on the ground for it
   to fetch.
4. **Meal lines.** Watch a unit's bubble at its meal: "I ate some trout.",
   "I ate some venison. Back to it.", "Had some eggs. That hits the spot.",
   and with farm fare "I ate a meal from the farm."; two kinds in one meal,
   "I ate some venison and some trout."; a cavalry rider adds "My horse ate
   too."; after going hungry, "Food at last! I ate some venison." No line
   gives an amount or calls meat raw; the amount stays in the selection
   panel's hunger line.
5. **Eating at a building.** Select a hurt unit and press Eat (or answer Yes
   to "I'm hurt. Can I eat to heal?"): it walks to the nearest main base or
   Storehouse, sits 10 s and says "I ate my fill of venison."
6. **Trade.** Halfling villages sell farm fare in place of crops and bread;
   the Elves sell farm fare, venison and trout (from the fourteen buildings
   PR).
7. `pnpm test` covers it in `packages/sim/test/farms.test.ts` (the feed, the
   status line, hunger, the cow), `food.test.ts` (the meal lines) and
   `m4.test.ts` (slaughter, a hunted cow).

## How a tester checks the training countdown (Patch 2)

Jade's bug: while the Magi Sanctum trained a mage, the queue's seconds jumped
up and down while they fell. The countdown is now the sim's own time.

1. Build a Magi Sanctum (or use the tester tools' Sanctum button), select it
   and train a support or battle mage. Hover the mage's picture at the head
   of the queue: "Complete in 80 seconds." falls by one each second, never
   jumps back up, and the mage walks out as it passes 1 second.
2. The same at the Barracks with any troop and at the Big House with a
   worker.
3. Use up the supply, then queue one more worker at the Big House: it reads
   "On hold: nothing is working on it right now." until a farm frees supply,
   then counts down.
4. Queue a few planks at the Workshop: in Patch 2 it needs nobody inside
   and counts down at once, at twice the pace of the planks' own time (the
   crafting pace). Before Patch 2 a lumber mill with nobody inside was on
   hold until a worker stepped in.
5. Pause: the seconds stand still.
6. `pnpm test` runs packages/sim/test/queue-countdown.test.ts (every kind of
   queue counts down one step a step and is done on the step it says) and
   packages/client/test/queue-countdown.test.ts (a mage's hover text from 80
   down to 1, never rising).

## How a tester checks the action menu and Upgrade equipment (Patch 2)

*Jade's rules: a button survives only if Jade's list names it; Attack on a
unit always attacks; a spell on a unit always casts, never a heal on an enemy;
one Upgrade equipment button; square buttons at least twice the old size; the
portrait next to the card. The tinkering hook is `tinker(state, i, steps)` in
`packages/sim/src/units/tinker.ts`; the command is `upgradeEquipment`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch2-actions.test.ts
   (Attack on your own worker hurts it; an aimed arrow hits the friend it was
   aimed at and flies past the rest; a Bolt on your own warrior lands and a
   Heal on a zombie never does; Upgrade equipment gives weapons first, then
   armour to the highest rank, and pays exactly that; a meal seats the unit
   for 10 s with its bar and is paid once, even when an enemy gets it up; a
   save mid-meal with a shot in the air loads and goes on the same) and the
   client's hud-layout, m2, m3, m6 and m8 controls tests.
2. **The warriors' card.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   select the three starting warriors. The card shows six big square
   buttons (two rows of three on a wide screen; on a narrower one the card
   grows upward to three rows of two): Attack, Patrol, Move, Hunt, Eat, Upgrade
   equipment (live now: fifteen small buttons with Stop, Hold, Enter, the
   lock, Cannon, Weapon +, Armour + and the Max twins). The portrait sits
   between the selection panel and the card. The selection panel no longer
   reads "Locked to melee.".
3. **The workers' card.** Select the four workers: Move, Gather, Unload,
   Repair, Dig, Prospect, Build, Eat, Upgrade equipment, Rank, Cart. Eleven
   buttons do not fit at the minimum size, so the card grows upward to hold
   them, still squares (from indev 0.8 the card holds twelve before it
   grows, so they fit; see the action card's twelve below). Press B: one build menu, the fourteen buildings on
   letters of their names (on the grid keys before Patch 4), with walls, gates, towers and earthworks under Defences and
   the torch post and bonfire under Lights; Esc is Back.
4. **Attack on a friend.** Select a warrior, press A and click one of your
   own workers: the warrior walks over and hits it. Press A and click the
   ground: it attack-moves and leaves your own units alone.
5. **Upgrade equipment.** Type M N B V C X Z to show the tester tools, press
   **Troop kit**, select a few starting warriors and press Q. Each one walks
   to the nearest Barracks,
   Forge or main base, sits down with its hands at its chest and a gold bar
   over its head, and stands up with the best weapon the stock paid for,
   then sits again for its armour. Hover the button first: it names the
   first unit's pieces and their cost. With no stock, it is greyed with the
   reason.
6. **Spells.** Train a battle mage at a Magi Sanctum: Arcane Bolt on one of
   your warriors hits it. A support mage's Heal on a zombie says "Heal cannot
   be cast on an enemy."; on your own unit or an animal it heals.
7. **Eating.** Hurt a warrior (or wait for a fight) and press F: it walks to
   the main base, sits for 10 s with the bar and heals; hit by an enemy while
   seated, it gets up at once and its health still comes back.
8. **Going up.** Select warriors and right click a tower or a main base from
   the Hall up: they go up top (live now: Enter did this; a right click only
   walked them to a main base). Workers alone still walk to a main base.
9. **Engines.** Select a cannon: Attack, Move, Hitch, Port.
10. **Relighting.** When a goblin mage puts out a torch post, right click it
    with a worker: the worker sits beside it for 2 s with the bar over its
    head, and the torch is lit again.

## How a tester checks the artillery crewman, the ammunition cut and mining trips (Patch 2)

Jade's Patch 2, round 1, second wave (blueprint/patch-2.md). The picks are in
blueprint/patch2-artillery-mining-picks.md. Older sections above that train
cannon crew, crew engines with warriors, stock catapult stones, ballista bolts
or cannonballs, or haul from a mineshaft describe the game before Patch 2.

1. **The tests.** `pnpm test` runs packages/sim/test/crewman.test.ts (a
   crewman trained at the Artillery workshop for 30 food goes to the nearest
   engine short of crew; an engine rolls out with its full crew, their food
   paid with it; a fallen crewman's question queues one who joins the engine
   that asked, and the queue survives a save; crewmen stay with their engine
   when moved with it and Hunt leaves them out), m8.test.ts (warriors are
   refused as crew, engines fire with no stock spent, the Citadel's cannon),
   m4.test.ts (bag trips from a shaft, a nearer Storehouse, miners down at
   night, the Mine kit) and the client's m8-controls test (Crew and right
   clicks).
2. **Engines roll out crewed.** `pnpm dev`, open
   http://localhost:5173/?seed=1, type M N B V C X Z to show the tester
   tools and press **Siege kit**: a catapult, a ballista and a bronze cannon,
   each with its crew (2, 1 and 2 artillery crewmen in sooty tunics, a
   stand-in until the crewman has a model), and an Artillery workshop south
   of them. Select the cannon: "Crew 2 of 2 artillery crewmen." The pool and
   the inventory hold no catapult stones, bolts or cannonballs.
3. **No ammunition.** Scroll the view about 30 m away and press **Night
   mob**: the engines fire at it with nothing in the stock, and no message
   asks for shot.
4. **Only crewmen crew.** Select a crewman: Attack, Patrol, Move, Crew and
   Eat. Press C and click the ballista, and he walks over to crew it.
   Select a warrior and right click an engine: he follows it, and the
   engine's crew line does not change. Select an engine with its crew and
   move them: the crew walk with it.
5. **Training a crewman.** Select the Artillery workshop: the Crewman button
   (E) costs 30 food, 30 s and 1 supply. Train one: he walks out and goes to
   the nearest engine short of crew, or to the rally point when none is.
6. **A crewman falls.** Press A with a warrior and click a crewman (Attack
   on your own unit hits it in Patch 2) until he falls: his engine asks "A
   crewman fell. Train another?" Yes queues one at the nearest Artillery
   workshop, and he walks to that engine even when another is nearer.
7. **New engines.** Press **Citadel** (main base 10) and gather or trade
   for a catapult's cost (its button's tooltip lists it): the workshop's
   catapult button also counts its crew's food (60) and supply (2), and the
   catapult rolls out with "A catapult is ready, with its 2 crewmen.
   Its crew push it, or hitch a horse or an ox to haul it faster."
8. **Mining trips.** Press **Mine kit**: a Mineshaft and a Storehouse beside
   it, Deep Mining I and a main base of level 4 at least. Right click the
   shaft with up to four workers: each goes down and out of sight, comes up
   with a full 25 lb bag (5 stone or ore, 10 coal), carries it to the
   Storehouse (the nearer drop-off) and goes back down. The shaft's panel
   reads "N of 4 miners, M down the shaft" and what waits for the next bag.
   At dusk they stay down and dig on; at dawn they carry out.

## How a tester checks the middle HUD and training cards (Patch 2)

*Jade's rounds 2 and 2b (blueprint/patch-2.md, the mock-up
blueprint/patch-2-middle-mockup.png): the middle shows pictures and bars, and
every sentence is in a tooltip; the Barracks and Magi Sanctum train from
cards with a tier strip and a padlock; the camera starts at 36 m and zooms out
to 64 m. Picks in blueprint/patch2-middle-hud-picks.md. The cards are
`packages/client/src/hud/training-cards.ts`, their rules
`packages/client/src/hud/troops.ts`; the Sanctum's kit and padlocks are sim
orders (`mageProduct`, `setKitLock`).*

1. **The tests.** `pnpm test` runs packages/sim/test/patch2-cards.test.ts (a
   Sanctum mage trains with the wand and robe on her card and pays for them,
   the default is the best the stock pays for with the wand first, padlocks
   are saved and the Big House takes none) and
   packages/client/test/patch2-cards.test.ts and m11-troops.test.ts (a pick
   holds only while its building stays selected, the padlock locks every
   selected building or opens every locked one, a pick on a locked card
   moves the lock, the reasons in order, the tooltips' words and numbers).
2. **Nothing selected.** `pnpm dev`, open http://localhost:5173/?seed=1: the
   middle reads "Nothing selected" and the three help lines, as live now.
   The camera is a little closer than live now; zoom all the way out: it
   stops at 64 m (live now: 80 m). Home comes back to 36 m.
3. **One unit.** Click a warrior: "Club fighter", a gold chevron after it
   (Patch 3 replaces the chevron with a divider and an XP bar, see below),
   the health bar with 100/100 on it, then the cudgel and armour slots with
   their tier numbers, the bowl with the next meal's bar, and "Idle". Hover
   each picture: the sentences live now in the panel are in its tooltip
   (the cudgel's damage, swing and reach; the next meal). Click a worker:
   hammers after "Worker", the tool slot. A mage reads "Support mage
   (Novice Acolyte)" in words, with her mana under her health.
4. **Several.** Drag a box round the workers and the warriors: a tab of
   crossed swords with 3 and one of a worker with 4, the portraits under
   them. Hover the crossed swords: "3 Club fighters".
5. **The Barracks.** Type M N B V C X Z, press **Troop kit** and **Citadel**,
   and select the Barracks: five cards (Close melee, Long melee, Ranger,
   Brawler, Cavalry), each with its bust, its key, a weapon and an armour
   slot showing the tier it would train now, and an open grey padlock.
   Hover a picture: the troop it trains by name ("Trains a Champion: ..."),
   its numbers, its cost, "Follows the stock: the best kit it pays for,
   weapon first." Click it: one queues, shown in the title row (under it
   since Patch 3); Shift + click: five.
6. **The tier strip.** Click Close melee's weapon slot: a strip of tiers 0
   to 8 opens above the middle, pointing at the slot, the current tier in
   gold. Hover tier 3: "Trains a Copper swordsman.", the damage with the
   change from now, what it costs and adds to training. Spend the stock
   (queue a few) and open it again: tiers the stock is short of are red and
   still pickable; their tooltip says "Short: 0 of 3 carbon steel ingots in
   stock.". Without Troop kit, the tiers not unlocked yet are dark. Esc, a
   right click or a click anywhere else closes it.
7. **Picks and the padlock.** Pick tier 5: the card shows it and its
   tooltip says "Picked: until this Barracks is deselected." Click the
   ground and select the Barracks again: back to the stock's best. Pick
   tier 5 again and click the padlock: it shuts and lights; deselect and
   select again, save and load: still tier 5 (the padlock is a game order,
   saved with the game). Pick another tier on the locked card: the lock
   moves to it. Only the padlock opens it again.
8. **Several Barracks.** Build a second Barracks and select both: the cards
   show the first one's kits and a tile per Barracks in the title row (under
   it since Patch 3) with its queue count. The padlock locks both; with one locked, it opens it.
9. **Cavalry.** Before main base 3 the Cavalry card is grey with "Needs a
   level 3 main base."; with no horse in a Barn, "No grown tamed horse ready
   in a Barn.". Press **Barn** for a Barn with horses: the card counts the
   free horses on its picture.
10. **The Magi Sanctum.** Press **Sanctum** and **Mage kit**, select the
    Sanctum: a Support mage and a Battle mage card, each with a wand and a
    robe slot, tiers 1 to 6, the same strip, picks and padlock. Train one:
    she walks out with that wand and robe (hover her slots).
11. **The Big House.** Select it: no cards. Its A, Q and N still train tier 1
    as live now (a Fist fighter when sticks are short).
12. **Buildings.** Select a Barn: a picture and the number of animals;
    hover it for the stalls and the farm fare they eat. A farm shows its
    crop and a bar with "6 in 3:40" on it; a tower or the Citadel "Up top
    0/8" and the men's portraits. Every sentence is in a tooltip.

## How a tester checks Jade's mini patch: where the bases stand and the world's scale

*Jade's ask (2026-10-04): in multiplayer the main bases spawn 10 to 15 m
apart, measured from the outer edge of each building; with more than four
players they stand roughly in a line, so no base can be surrounded by the
others; and the world is smaller only in the distance between rings, and so
between bands, by about 30%. Picks in blueprint/mini-patch-spawns-picks.md.
Where the bases stand, their yards, water and iron are
`packages/sim/src/world/start.ts`; the yards' props and the fit-land checks
`packages/sim/src/world/generate.ts`; the ring scale `RING_SCALE_PER_MILLE`
in `packages/sim/src/world/layout.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/world.test.ts: every
   ring and band 30% nearer the start, the cells per ring unchanged; for 2
   to 8 players over 60 seeds, every pair of bases 10 to 15 m apart edge to
   edge in a group of 2 to 4, and from 5 players a straight line with each
   base's neighbours 10 to 15 m away and every other base farther; a game
   for one still on the basin's middle, with every Halfling village placed;
   each player's units and Table 9 set beside their own Big House, never
   nearer another's.
2. **Two players.** `pnpm dev` and open
   http://localhost:5173/?seed=1&players=2. The second Big House stands
   14 m from yours, measured between the edges of the two 6.3 m plots the
   Big House stands on (the level 1 building does not fill its plot, so
   the gap looks up to 2 m wider on one side). Your workers and warriors
   stand on your side, away from the other base; your softwood stand,
   hazel, copper, tin, stone, flint, water and bog or iron rock lie in your
   yard on that side, where a worker can walk straight out to each.
3. **Three and four.** `?seed=1&players=3`: a triangle, 11 to 14 m between
   each pair. `?seed=1&players=4`: a square, 10.3 m across each side and
   14.6 m across each diagonal, each yard facing out from its corner.
4. **Five to eight.** `?seed=1&players=8`, type M N B V C X Z and press
   **Show all**: eight Big Houses in a straight line about 140 m long, 14 m
   between neighbours, the yards taking turns either side of the line so a
   base's yard never borders its neighbour's. The bases at each end have one
   neighbour and the rest two.
5. **The bands nearer.** With one player (`?seed=1`), press **Reveal** and
   **Show all**: the basin's edge, where the Fringe begins, is 63 m from
   the Big House (90 m before the mini patch), its mixed woods start about
   50 m out, and the barrier edges are 30% closer together. `pnpm --filter @blockyrts/tools map-viewer
   --seed 1 --size 3000 --edges --out map.png` draws the cells 30% smaller
   across. The Big House, the pocket's flat ground, ponds, streams, hills
   and every building are the size they were.
6. **Saves.** A save from before the mini patch is refused: "That save is
   from an older version of the game. Start a new game." (save format 4).
7. **The balance editor** (once republished from main) has
   RING_SCALE_PER_MILLE (700) under World and terrain, World layout, and
   BASE_GAP_MIN_M (10) and BASE_GAP_MAX_M (15) under Start basins.

## How a tester checks Patch 3's balance changes

*Jade's editor export of 2026-10-04 (42 numbers) is in, and older saves are refused.*

1. **The numbers.** Open the balance editor (once republished from main) and
   read Animals, Mobs and nights, and Neutral peoples and trade: the bear has
   200 health and 16 damage, the minotaur 250 and 30, the griffin 300 and 20,
   the hobgoblin 60 and 10, the gnoll 80 and 10, the Halfling spearman 45
   health and the Elf caravan wagon 200. Loot, hunting and gathering shows
   "Rare and powerful from this much health" at 500.
2. **Check scripts.** Every check script's final hash above is the Patch 3
   one: the snapshot's version is in the hashed bytes, and the new numbers
   change any fight with an animal or tribesman.
3. **Saves.** A save from indev 0.5 is refused: "That save is from an older
   version of the game. Start a new game." (save format 5, snapshot 19).

## How a tester checks Patch 3's threat, lairs and wanderers

*Jade's Patch 3 notes: work each monster's threat out from its numbers and
traits with one algorithm, so a new monster gets its threat by itself; give
each lair a budget by its threat; triple the wandering night monsters; and
confirm the waves scale with the players. Picks and before and after tables
in blueprint/patch3-threat-waves-picks.md. The algorithm and its weights are
`packages/sim/src/combat/threat.ts`; each monster's listed traits and what it
splits into are on its row in `combat/mobs.ts`; the lairs' budgets are
`threats/lairs.ts` with `LAIR_BUDGET_PCT` in `threats/data.ts`; the wild's
rolls are `threats/wanderers.ts`.*

1. **The tests.** `pnpm test` runs `packages/sim/test/threat.test.ts`: every
   night monster has a threat and nothing else does; the threat is what the
   algorithm makes of the row, and twice the health or damage raises it; a
   zombie is 1.5; the giant spider is under two zombies, and level with one
   given a zombie's bite; threat never falls as health or damage rise;
   armour, a weakness to arrows and a sweeping blow count; a melee flyer adds
   nothing, a ranged flyer 20% and a climber 5%; flying and climbing are read
   from the row; the reach that strikes over walls is the fight's own; a
   slime counts what it splits into and still splits into two small slimes
   half a metre either side; every lair has a budget from its first night, a
   mass grave's above a cave mouth's, and sends it out of its own kinds on
   top of the dark edge's 80%; each of two players' nights spends the edge's
   budget on its own; each wild patch rolls three times.
2. **The numbers.** In the balance editor (once republished from main), Mobs
   and nights shows each night monster's **Threat (worked out)** read-only
   beside its health and damage, with its **Traits** and **Splits into when
   it dies**; **Threat: how each monster's threat is worked out** holds the
   weights (one threat point is 40 effective health dealing 3.3 damage a
   second, health 3 parts to damage 2, the speed, range and trait percents);
   **What each trait adds** lists the traits (melee flyer 0, ranged flyer 20,
   climber 5, most others 5, summons 20, weak back -5); **Each lair sends a
   night** is 50%; Wandering night monsters has **How many wanderers** at
   300%. A changed health or damage that `balance:apply` writes moves that
   monster's threat with it, and the apply lists the threat as also changed.
3. **XP.** A kill is still worth twice the monster's threat, so a zombie now
   gives 3 XP (2 before) and a giant spider 4.2 (6 before); a night's XP in
   all is about the same.
4. **Lairs.** `pnpm dev`, open http://localhost:5173/?seed=1, type M N B V C
   X Z and put down a lair with **Lair** in the debug panel. At nightfall it
   sends half its own company's threat 20 s after night falls, on top of the
   dark edge's wave: a barrow or a cave mouth about 3 threat (two zombies or
   a slime; three bats and rats), a spider nest two spiders, a mass grave
   from night 10 about 9 (two bloated corpses), a great barrow from
   night 25 about 9 and from night 40 about 23 (with its bone colossus). A
   lair no longer sends less when there are more of them.
5. **Wanderers.** As in "How a tester checks wandering night monsters"
   above: about three times as many come out in the wild round a party at
   night (the check script there has 86 out at nightfall, 27 before).
6. **Two players.** `?seed=1&players=2`: each player's night is planned on
   its own budget, town, depth and lairs, so two players face twice the
   monsters, each base its own share (as before Patch 3; now a test).

## How a tester checks making room (Patch 3)

*Jade's ask (2026-10-04): units and monsters are discouraged from standing
on top of one another, but nothing is ever a hard block; a clump of idle
units spreads out by itself, no farther than it needs, onto ground they can
stand on; workers never block or delay one another at their jobs. The pass
is `packages/sim/src/units/spacing.ts`, run once a step from `step.ts`;
picks in blueprint/patch3-anti-clumping-picks.md.*

1. **The tests.** `pnpm test` runs packages/sim/test/spacing.test.ts: ten
   warriors stacked on one spot spread to no overlap within 3 s, all within
   1.5 m of where they stood, then stand still with no orders; four in a
   one-column pit and four on a one-column pillar stay where they are; five
   in a one-column corridor spread along it only; a walker's every step is
   the same with six stacked warriors in its way; six zombies round a
   warrior on hold, and four warriors round one zombie, fan out and stay in
   reach between blows; ten workers sent to one tree bring in as much
   lumber as with making room switched off, and none is moved off its
   column while it chops. m3.test.ts's night 0 behind the fence still ends
   with the Big House untouched and every worker alive.
2. **An idle clump.** `pnpm dev` and open http://localhost:5173/?seed=1.
   Select one worker and right click a patch of open ground; then select
   each of the other workers and warriors in turn and right click the same
   spot (the middle of the green ring). Each one that arrives on top of
   another turns and steps aside, and they end in a small knot about half
   a metre apart and about a metre across, then stand still. Before Patch 3
   they stood inside one another.
3. **The land presses them together.** Type M N B V C X Z, press **Dig**
   and send the units into the 3 m pit: they spread over its floor and none
   is pushed up its 1 m sides. Units squeezed between buildings or walls
   stay overlapped where there is no room.
4. **Workers at work.** Select all four workers and right click one tree:
   they walk out through one another, each takes a place round the tree and
   chops at its usual pace without being shoved off it, and on the way to
   and from the Big House they pass through anyone standing in the way.
5. **Fighting.** At night, near your warriors, press **Crowd +200**:
   zombies that reach a warrior stand round it rather than in one heap, and
   warriors fighting one monster fan out round it. Zombies chewing at a wall
   stand still and keep at the same piece, as before Patch 3.
6. **The balance editor** (once republished from main): Units, Making
   room: Bodies stand apart by 90%, Near enough to leave be 0.02 m, Steps
   aside at up to 1 m/s, Makes up each step 50%, Most bodies one looks at a
   step 32, Most bodies one makes room from at once 8. Setting the first to
   0 turns making room off. Followers keep within (2.5 m) now shows under
   Work and ranks.
7. **Check scripts.** Every hash above is the one with making room. All
   of them moved, since two of the start workers stand 46 cm apart and
   step out to 52 cm in the first second. The stories that changed: in M3
   one more fence piece is broken; in M5 a second warrior falls at the
   goblin village and its wolf pen stands; in M7 no warrior falls taking
   the Halfling village; in M8 three goblins and the wolf pen are left the
   next morning; in the wanderers script the wounded warrior ends the
   night at about three fifths of its health and a giant spider kills it
   on the walk home, so one warrior comes back instead of two.

## How a tester checks the action and build menus (Patch 3)

*Jade's Patch 3, four items: buildings the stock cannot pay for are greyed
out like those short of a prerequisite; a building whose card was one
button opening a bigger menu opens on that menu; the active action marker
is about twice as visible; and a click on a greyed-out button has whoever
can sort out why ask, in a question bubble. Picks in
blueprint/patch3-menus-picks.md. The greying and the lone-menu rule are
`packages/client/src/hud/commands.ts`; the questions
`packages/sim/src/units/greyed.ts`; the marker `.hud-btn.doing` in
`packages/client/src/hud/hud.css`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch3-greyed.test.ts
   (both reasons asked at once, a cause further down asked for, one
   resource wanted twice asked for once with both amounts, the cap, the same
   click twice, no change to the state hash, the Workshop offering planks,
   the Scholar's Lodge offering research, a worker offering better tools,
   idle warriors offering to hunt) and
   packages/client/test/patch3-menus.test.ts.
2. **Greyed by the stock.** `pnpm dev`, open http://localhost:5173/?seed=1,
   select the four workers and press B. The Forge, the Scholar's Lodge, the
   Fishing dock and a second Big House are greyed out (before Patch 3 they
   showed in red and could still be placed as a plan); hover the Forge:
   "Not enough softwood lumber (needs 60, you have 40)." Clicking it or
   pressing its key does not pick it up. The Barracks says its main base
   level first, then the stock. The Farm, Barn, Storehouse and Workshop are
   lit. Defences and Lights open as before and grey their own buildings.
3. **Who sorts it out.** Still in the build menu, click the greyed Forge:
   two workers ask "We need 20 more softwood lumber for the Forge. Shall I
   go and gather some?" and "We need 20 more stone for the Forge. Shall I
   go and gather some?". Tick one: it walks off to gather. Click the
   Barracks: the softwood and stone questions count the Longhall too ("We
   need 140 more softwood lumber for the Barracks and the Longhall."), as
   the Barracks waits on a level 2 main base. Click the same button again
   while its questions are up: nothing new; click another: the first
   questions go and the new ones come.
4. **One click less.** Type M N B V C X Z and press **Troop kit**, then
   select the Forge: its smelting buttons show straight away, with no Smelt
   and no Back (before Patch 3: one Smelt button). The Workshop, the
   Scholar's Lodge and the Barn (its Slaughter) do the same; the Big House keeps its K menu
   and the Artillery workshop its Engines, as they have more on their cards.
5. **Greyed actions.** On that Forge click the greyed Copper ingot: a worker
   asks "We need 2 more copper ore for the copper ingot, and my tools can't
   break it. Shall I make stone and flint tools and go and gather some?";
   Yes sends it to tinker its tools and then mine. Click Wrought iron:
   the Forge asks "We need 2 more charcoal for the wrought iron. Shall I
   make 3?" and Yes queues the charcoal. A greyed Barracks troop short of
   food asks idle warriors to go hunting; the Big House's greyed Upgrade
   asks workers for what the next level is short of.
6. **The marker.** Select workers and press G (or right click a tree): the Gather button's gold
   arrow is half as big again and its ring twice as thick and never dimmer
   than 60% (before Patch 3 a 14 by 10 px arrow and a 2 px ring pulsing
   from 30%).

## How a tester checks the build menu's letters (Patch 4)

*Jade's Patch 4: the build menu's hotkeys followed the grid layout (each
building on the key in its place on the keyboard, Q to V, with B for Back)
while no other button did; the grid goes and the buildings' keys work like
every other button's. Picks in blueprint/patch4-hotkeys-picks.md. The
menus and their letters are `packages/client/src/hud/menu-keys.ts`; every
menu button is an action in `packages/client/src/input/bindings.ts`, so it
shows in the settings. Client only: no sim change, no save format change.*

1. **The tests.** `pnpm test` runs packages/client/test/patch4-hotkeys.test.ts
   (every building's letter, Defences and Lights, Esc for Back and + for
   More, a rebound key on its button, the K menus' letters, no two buttons
   of one menu on one key and none on L, J or O) and the m2 and m3 controls
   tests.
2. **The build menu.** `pnpm dev`, open http://localhost:5173/?seed=1, select
   the four workers and press B. Each button shows its letter in its
   corner: Big House H, Farm F, Barn R, Storehouse S, Fishing dock I,
   Workshop W, Forge G, Artillery workshop A, Barracks B, Magi Sanctum M,
   Scholar's Lodge C, Mineshaft N, Defences D, Lights T, and Back Esc.
   Press F: the Farm's ghost is on the cursor (before Patch 4, F picked the
   Barracks and W the Farm). Hovering a button shows the same letter beside
   its name.
3. **Defences and Lights.** B, D: the softwood, hardwood and stone walls on
   W, H and S; the softwood gates on G (east to west) and F (north to
   south), the hardwood ones on A and D, the stone ones on E and U; the
   towers on T, R and N; earth bank K, earth ramp P, fill I, lumber ramp B
   and stone ramp M. B, T, B picks up a bonfire, and B, T, T a torch post
   once there is resin (at the start it is greyed out, and T asks who can
   sort that out, as a click does). Esc goes back a step at a time. A menu
   the card cannot hold even at its smallest buttons (on a short screen)
   pages, and + turns the page (V before Patch 4).
4. **Any keyboard layout.** Menu keys now go by the letter a key types, as
   every other command's do, so on a French keyboard the key marked F still
   picks the Farm (before Patch 4 the build menu went by where a key sits).
5. **The K menus.** Type M N B V C X Z, press **Troop kit** and select the
   Forge: copper ingot C, tin ingot T, bronze ingots B, wrought iron W, pig
   iron P, iron ingot I, steel ingot S, carbon steel ingot A, charcoal H,
   bricks R, glass G, gunpowder U (before Patch 4: Q W E R T, A S D F G, Z
   X); H queues charcoal. Each product takes the first free initial of its name, else the
   first free letter of its name. The Workshop has more products than
   letters: 20 of its 43 get one and the rest are clicks until given a key.
6. **Rebinding.** Open the menu (F10), Hotkeys: the build menu, Defences,
   Lights and each building's K menu have a group of their own (the note
   that build menu keys "follow the grid Q to B and stay as they are" is
   gone). Click Farm's key, press Y, close the menu: B, Y picks up the Farm
   and its button shows Y. "Reset all hotkeys" puts F back.
7. **In the browser, by script.** With `pnpm --filter @blockyrts/client exec vite --port 5198`
   running, `node packages/client/test-e2e/hotkeys-look.mjs http://localhost:5198 /tmp/shots`
   drives the build menu, Defences and Lights from the keyboard, places a
   bonfire and a Farm, reads the Forge's and the main base's K menus and
   queues charcoal on H, printing ok or FAIL for each.

## How a tester checks the fog look and hidden-unit outlines (Patch 3)

*Jade's ask (2026-10-04): land that has been explored but is not seen right
now by your or your allies' units and buildings looks darkened, not greyscale;
and when one of your units is 80% or more hidden from the camera (by trees,
buildings, very large units) an outline is drawn round its silhouette,
cheaply enough not to cause lag. Picks in
blueprint/patch3-fog-outlines-picks.md. The remembered-land shading is
`packages/client/src/world/fog-material.ts`; the measuring and the outline
`packages/client/src/world/hidden-outlines.ts`; which units take part
`packages/client/src/world/units-view.ts`; the flat colours they are
measured with `packages/client/src/models/instanced-model.ts`.*

1. **The tests.** `pnpm test` runs packages/client/test/patch3-fog-outlines.test.ts:
   the fog shader keeps 70% of the colour at 60% brightness and reaches the
   unit, creature and building models too; units are marked by id, negative
   when outlined; the measuring picture is counted per unit; the outline
   comes on at 80% hidden, stays down to 70% and for 0.4 s after, and goes
   when the unit is no longer drawn; the screen box of your units ignores
   units off the screen or behind the camera.
2. **Remembered land.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   walk a warrior 45 m out of the camp and back. The land it saw out there
   stays darker than the land in sight but keeps its greens and browns (it
   was grey before); trees, rocks, lairs and huts standing on it are
   darkened the same way. Unexplored land is still black, and on a fog
   night the fog lies over both as before.
3. **An outline behind a building.** Type M N B V C X Z, press **Citadel**,
   and walk a worker round behind the Citadel (north of it, the side away
   from the camera). Once 80% of it is hidden a line in your colour, a
   little lighter, with a thin dark edge, is drawn round its shape on top
   of the Citadel. Walk it back out in front and the line goes after a
   moment. A level 1 Big House is too low to hide a worker, so nothing is
   drawn behind it.
4. **Under a tree.** Walk a worker under a tall pine just north of its
   trunk: the crown hides it and it is outlined; a step out from under the
   crown and the outline goes. Your own units count as cover too, so a
   worker behind your own cannon or horse is outlined. Other players' units,
   monsters and animals are never outlined, and water hides no one.
5. **In the browser, by script.** With `pnpm --filter @blockyrts/client exec vite --port 5198`
   running, `node packages/client/test-e2e/outline-look.mjs http://localhost:5198 /tmp/shots`
   plays steps 2 to 4 at 1920 by 1080 and prints ok or FAIL for each, the
   share of the unit hidden and what the measurements cost.
   `node packages/client/test-e2e/outline-perf.mjs http://localhost:5198 /tmp/shots after`
   (and the same on a checkout from before Patch 3 with `before`) prints the
   main thread's milliseconds a frame in a busy camp and at night with 400
   monsters. Add `--gpu` on a machine with a graphics card; without it
   Chromium draws in software and only the main-thread times compare.
6. **No lag.** With none of your units on the screen nothing extra is
   done. With some in view, a small picture of the part of the screen round
   them is drawn eight times a second at a quarter of the screen's size and
   read back without waiting for the card. The outline itself is drawn only
   while a unit is hidden, and only over the outlined units' corner of the
   screen. The numbers measured are in the picks file.

## How a tester checks lair alerts (Patch 3)

*Jade's ask (Patch 3): when a lair spawns, all players get an alert and a
ping on their minimap, and players always see the red dot of every lair on
their minimap, even in unexplored land. Picks in
blueprint/patch3-lair-alerts-picks.md. The alert is
`packages/sim/src/threats/lair-alert.ts`; the dots
`packages/client/src/minimap/marks.ts`; the red ping
`packages/client/src/minimap/minimap.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch3-lair-alerts.test.ts
   (the alert at dusk of night 3 with the lair's kind, way and distance
   from the main base and its spot; every player told, another player's lair
   naming whose land it is by; only the kind with no main base) and
   packages/client/test/patch3-lair-alerts.test.ts (a lair far out in land
   nobody has seen is on every player's minimap until it is broken, the map
   widens to hold it, the red ping lasts 6 s and plays the map ping sound).
2. **The alert.** `pnpm dev`, open http://localhost:5173/?seed=1, start and
   type M N B V C X Z. Pan the view out past the explored land with the
   arrow keys and press **Lair: Barrow**. Every player gets one red line in
   the message panel, such as "A lair has appeared: a barrow to the east,
   about 120 m from your main base." (the way and the distance from your
   Big House, in tens of metres), with the map ping's
   glassy chime and red rings pulsing on the minimap at the lair for 6 s
   (an urgent message's rings are gold for 4 s). Click the line or press F4
   to jump there. In a normal game the first comes at dusk of night 3, with
   the dusk horn.
3. **The dot.** The lair's dark red square shows on the minimap at once,
   on the dark unexplored part of the map; if it lies past the explored
   land the minimap widens to hold it. It stays until the lair is broken,
   and loads with a save (it is worked out from the lairs standing).
4. **Two players.** `?seed=1&players=2`: a lair placed for the other player
   reads "A lair has appeared by Player 2's land: a barrow to the ...", with
   their name in place of Player 2, and both players see its dot and ping.
5. **The balance editor** (once republished from main) has
   LAIR_PING_STEPS (6 s), "Minimap ping at a new lair lasts", under Lairs,
   tribes and villages, Lair alerts.

## How a tester checks the action card's twelve (indev 0.8)

*Jade, 2026-10-04: the action card should hold more buttons before it grows
upward, 9 to 15 (10 to 12 by preference), by lowering the buttons' minimum
size, with a card of six looking as it did. The card now holds twelve: its
buttons shrink until twelve fill it at its standard size, and only past that
does it grow upward, at that size. Picks in
blueprint/action-menu-size-picks.md. The rule is `CARD_HOLDS` and
`buttonMin` in `packages/client/src/hud/hud-layout.ts`.*

1. **The tests.** `pnpm test` runs packages/client/test/hud-layout.test.ts:
   twelve fill a clean grid at the card's standard size on every desktop
   card width (5 to 10 columns), the buttons only shrink up to twelve and
   then keep their size as the card grows, every card that fitted at 104 px
   before is exactly as it was, the card is never smaller than with nothing
   selected, and a phone keeps the 104 px minimum.
2. **Six stay as they were.** `pnpm dev` on a screen about 1440 px wide,
   open http://localhost:5173/?seed=1 and select the three warriors: six
   buttons, two rows of three at 108 px, the card at its size with nothing
   selected (356 by 244 px), as before.
3. **The workers fit.** Select the four workers: their ten buttons sit in
   three rows of four at 70 px and the card does not grow (before: four
   rows of three at 104 px, the card grown two rows upward). Select a building with
   seven buttons, such as the Big House: two rows of four at 80 px.
4. **Past twelve.** Press B with the workers selected: the build menu's
   fifteen buttons keep 70 px and the card grows upward to four rows of four.
   On a 1920 px screen the minimum is 89 px (twelve as two rows of six), so
   the workers' ten are two rows of five at 108 px and the build menu three
   rows of five at 89 px.
5. **Saves.** A save from indev 0.7 is refused: "That save is from an older
   version of the game. Start a new game." (save format 7).

## How a tester checks the steady shadows

*Jade's bug (2026-10-04): the shadows of buildings, land and maybe units
sometimes vanish and come back, rarely at the start and more as units work
and more land is explored, with the camera still or moving. The cause: a
mesh got its shadow flags from a sweep once a second, so land redrawn after
a tree fell or a block was dug (that chunk and its four neighbours), land
redrawn every 20 s as plants grow, a chunk changing detail as the camera
moved and a building rebuilt at its next stage all drew without shadows for
up to a second. Picks in blueprint/shadow-flicker-picks.md. The fix is
`packages/client/src/world/sun-shadows.ts`, used by
`packages/client/src/world/world-view.ts` and `packages/client/src/game/match.ts`.*

1. **The tests.** `pnpm test` runs packages/client/test/shadow-flicker.test.ts:
   a mesh has its shadow flags the moment it is added, whole chunks and
   meshes added later to groups already in the world alike (water and
   other see-through things take shadows but cast none); the shadow box
   holds the ground on screen at every zoom on five screen shapes, grows in
   4 m steps as the camera zooms out, and moves by whole shadow-map texels
   as the camera pans, so a building's corner stays on the same texel; the
   sun shines from the same place throughout.
2. **In the game.** `pnpm dev`, open http://localhost:5173/?seed=1 with
   Shadows on (Medium or High) and send every worker to fell trees by the
   Big House. Watch the shadows of the house, the trees and the land beside
   the felled trees for a minute with the camera still: none blink out,
   when a tree falls or every 20 s when the plants regrow. Then pan slowly:
   shadow edges hold still on the ground instead of crawling, and zoomed
   all the way out the far corners of the screen have shadows too (they
   stopped at a line before). Zoomed in, shadows are a little crisper than
   before, as the box shrinks to the ground on screen.
3. **In the browser, by script.** With `pnpm --filter @blockyrts/client exec vite --port 5198`
   running, `node packages/client/test-e2e/shadow-look.mjs http://localhost:5198 /tmp/shots`
   watches every frame for a mesh drawn without its shadows with the camera
   still, while workers fell trees and while the camera pans, then checks
   the box's texels and its cover at five zooms, printing ok or FAIL for
   each. Before the fix it found such frames in all three (with 28 to 67
   land redraws in each part), the box off the texel grid by up to half a texel,
   and screen corners up to 17 m outside the box zoomed out.

## How a tester checks marked digs (Patch 4)

*Jade, 2026-10-05: after starting to dig, the outline stayed visible until
the job was done. Now the full outline shows only while a selected worker is
working on that dig; otherwise a single thin dotted line, as thick as each
line of the outline, shows where the dig goes. Workers still join a dig as
before. Picks in blueprint/patch4-dig-outline-picks.md. Which sites show in
full and each site's dotted trace are `sitesInOrders` and `siteTraces` in
`packages/client/src/hud/site-marks.ts`, drawn by `Overlay.dotted` and
`drawSites` in `packages/client/src/hud/shell.ts`.*

1. **The tests.** `pnpm test` runs packages/client/test/patch4-dig-outline.test.ts:
   a site shows in full when a selected worker has it in its orders, now or
   lined up after its current job, and not for unselected workers' digs;
   a dig, bank, fill or ramp is traced round its edge on the land, a marked
   tunnel round its edge at its floor, and a tunnel chain's stretch along its
   middle at its floor, each stretch meeting the next at their corner (also
   round a closed loop, in any order, and not across different floors); the
   dots are 15 cm long, one to a column, with one centred on every corner.
2. **In the game.** `pnpm dev`, open http://localhost:5173/?seed=1, select a
   worker, press D and drag a dig south of the Big House, left click: the
   see-through box shows while the worker stays selected, also before it
   gets there. Click the ground to select nothing: the box gives way to a
   dotted orange line round the dig, on the land at its rim. Select another
   worker: still the dotted line. Right-click the dotted area with it: that
   worker joins, and now its box shows. With Shift held, a worker given a
   second dig shows both boxes.
3. **Tunnels.** Build the tester Hill (M N B V C X Z, then Hill), select a
   worker, Dig, click the hill's south face and click into it and out of its
   east side, then right click: with the worker selected each stretch has its
   box; with nothing selected a dotted violet line runs along the middle of
   the tunnel at its floor, seen through the hill, turning the corner as one
   path.
4. **In the browser, by script.** With `pnpm --filter @blockyrts/client exec vite --port 5198`
   running, `node packages/client/test-e2e/dig-outline-look.mjs http://localhost:5198 /tmp/shots`
   gives three workers a dig, an underground tunnel chain and an earth bank,
   and looks with nothing selected, each worker selected in turn and all of
   them selected, printing ok or FAIL for each.

## How a tester checks monsters turning on the troops (Patch 4)

*Jade's Patch 4: an enemy monster that is chasing a worker or attacking a
building and gets attacked by a troop switches to attacking the nearest
troop, not necessarily the one that hit it. A troop is any combat unit:
warriors of every kind (rangers, brawlers, cavalry, crewmen, mercenaries),
mages and siege engines; workers are not. Picks in
blueprint/patch4-mob-aggro-picks.md. The rule is `TROOP_AGGRO`,
`troopAggro` and `combatTroop` in `packages/sim/src/combat/mob-ai.ts`, used
there by the night monsters and the skeleton bombers and by wanderers
(`threats/wanderers.ts`), lair dwellers, tribes, raiders and villages
(`threats/foes.ts`) and the high flyers (`threats/late-mobs.ts`).*

1. **The tests.** `pnpm test` runs packages/sim/test/patch4-mob-aggro.test.ts:
   a zombie chasing a worker that an archer shoots from 18 m goes for the
   swordsman 7 m off instead, and keeps him while the archer shoots again;
   it goes back to the worker once no troop has hurt it for 5 s and its
   troop is out of its chase; a zombie breaking the Big House turns on an
   archer 22 m off that shot it; when the troop that hurt it cannot be
   reached it looks 12 m round itself for another, 6 m on a fog night; a
   worker's blow neither turns it nor hides a troop's blow just before; 0
   in the editor turns the rule off; a skeleton bomber runs at the nearest
   troop and goes off beside it; a wanderer, a lair's guardian (within its
   leash), a tribesman and his band, and a gravewing (which no longer
   snatches a lone worker) turn on the troops too; two idle warriors peel a zombie off a worker in a full game;
   and a save taken while a monster is turned carries on to the same hash.
2. **A worker chased.** `pnpm dev`, open http://localhost:5173/?seed=1, type
   M N B V C X Z and press **Speed** until dusk on day 1. Send one worker to
   fell trees about 25 m out from the Big House and stand the three warriors
   together about 10 m from it. When a monster chases the worker, select one
   warrior and right-click the monster: after the first blow it leaves the
   worker and goes for the nearest warrior, which may not be the one that
   hit it. It keeps that warrior until one of them falls, or until the
   warrior is more than 20 m off and no troop has hurt it for 5 s; then it
   goes back to what it was doing.
3. **A building under attack.** Press **Troop kit** and train a crossbow
   ranger at the Barracks. At dusk press Everyone Home so the monsters break
   at the Big House, and have the ranger shoot one from about 20 m: that
   monster leaves the house for the nearest troop (the ranger, if no other
   is nearer), while the ones nobody hit keep breaking. A monster hit by a
   man up a tower, whom it cannot reach, comes off the wall only for a troop
   on the ground within 12 m of it (or as far as the tower, if that is
   farther). Wild animals and territorial creatures (**Creature** on the
   debug bar) are not monsters and still go for whoever hurt them.
4. **Fog.** Press **Fog** before dusk: the 12 m look round itself is 6 m on
   a fog night. A troop that hit it still draws it from any distance.
5. **The balance editor** (once republished from main): Mobs and nights,
   Mob behaviour: "A troop's blow turns a monster on the troops for" 5 s and
   "It looks for the nearest troop at least this far" 12 m. Setting the
   first to 0 turns the rule off.
6. **Check scripts.** Monsters turning on the troops changed the M5, M6, M7
   and wanderers hashes (M0 to M4, M8 and the wall and tunnel chains did not
   move for it); every hash in this file changed again with the stone
   outcrops (see below). The stories that changed: in M5 one warrior falls
   at the goblin village instead of two; in the wanderers script the most
   monsters out at once is 225 instead of 223, and on the walk home the
   giant spider falls to the wounded warrior before its bite lands, so both
   come home. M6 and M7 end as before.

## How a tester checks the stone outcrops (Patch 4)

*Jade's Patch 4 file (2026-10-05): "double the amount of stone outcroppings
spawning randomly in heartlands, and make sure at least one is by each
starting base location." The Heartland's scatter (the start basin's cells)
puts down 4 stone outcrops in 10,000 candidate spots, twice the 2 before, and
each base's own outcrop of 200 (Table 9's, which every base already had)
stands 11 to 16 m from the middle of its Big House, where the start sees it:
before, it lay 18 to 38 m out, in the dark on most games for two or more.
Picks in blueprint/patch4-stone-outcroppings-picks.md. The scatter is
`HEARTLAND_STONE_OUTCROPS_PER_10000` in `packages/sim/src/world/generate.ts`;
the distance is `START_OUTCROP_NEAR_M` and `START_OUTCROP_FAR_M` in
`packages/sim/src/world/start.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/world.test.ts: for 1 to
   8 players over 10 seeds, every base has its one outcrop of 200 within 11
   to 16 m of its Big House's middle (to within a column), 7 m off every
   plot in a game for two or more; in play it stands whole on land the
   start has already seen; and over 12 seeds of a three-player basin the
   scatter holds about 4 outcrops to every 10 loose stone (before Patch 4,
   2 to 10).
2. **One player.** `pnpm dev`, open http://localhost:5173/?seed=1: the
   stone outcrop, the biggest grey rock cluster, stands 15 m west of the
   Big House in the lit land from the first moment (before Patch 4: 23 m
   west, at the edge of the dark). The two loose stone piles are where
   they were, 19 and 29 m out beyond it.
3. **Two and four.** `?seed=1&players=2`: your outcrop stands 15 m out on
   your yard's side, the other base's 12 m out on its own, both lit at the
   start (before: 29 and 35 m, both in the dark). `?seed=1&players=4`: each
   base's 12 to 15 m out (before: 26 to 36 m). Flint, herbs and flax on
   that side of the yard (now and then a loose stone pile too) shift to make
   room for it.
4. **The Heartland.** Type M N B V C X Z, press **Reveal** and **Show all**:
   the basin round the pocket, out to where the Fringe's birches and
   hornbeams begin, holds twice as many outcrops as before, counted over a
   few seeds: `?seed=4&players=4` has 4 away from the pockets (before: 1),
   `?seed=6&players=4` 4 (before: 1), seed 1 with one player 3 (before: 2).
   A game for one or two players has a single Heartland cell, so most seeds
   there show none or one besides the base's own. Nothing else in the scatter
   moves: every tree and node stands where it did, and the new outcrops take
   spots where nothing stood.
5. **Saves.** A save from indev 0.8 is refused: "That save is from an older
   version of the game. Start a new game." (save format 8, Patch 4's one bump;
   snapshot 21).
6. **The balance editor** (once republished from main): World and terrain,
   World generation: "Stone outcrops in the Heartland, per 10,000 spots"
   (4); Start basins: "Each base's stone outcrop, nearest its Big House's
   middle" (11 m) and "farthest from its middle" (16 m).
7. **Check scripts.** Every hash in this file is new with Patch 4: the state
   hash counts the snapshot version, which is 21 now, and the land a seed
   makes is different. The stories are as they were, with the same units and
   buildings at the end; with the outcrop nearer, M2 ends with 5 more stone,
   M4, M5 and M6 with 15 more (M5 with 5 less softwood) and M7 with 10 less.
   The step-40 hashes at the top of this file are `fc7a33f8`, with two
   players `3a816b4a`. Working through the night (Patch 4) had already moved
   the M3, M5, M6 and M7 hashes on main (M3's workers finish more of the
   wall ring); the ones here count both.

## How a tester checks work that waits (Patch 4)

*Jade's Patch 4, three questions that ask by themselves: a farm that has sat
empty for more than a minute asks to send a nearby worker; a building going
up that no one has worked on for more than a minute asks for a builder (never
at dusk or night); and a worker idle for more than a minute offers to farm,
gather or help build. Picks in blueprint/patch4-worker-questions-picks.md.
The questions are `packages/sim/src/units/work-asks.ts`; their numbers are on
the balance editor's Questions page "Work that waits".*

1. **The tests.** `pnpm test` runs packages/sim/test/patch4-work-asks.test.ts:
   each question comes after a minute and not before, never at dusk or night,
   and a minute after dawn begins; one idle worker speaks for those near it;
   Yes gathers, farms or builds as the question said; No rests until the next
   day; the question goes when a worker is given an order or a farmer is
   assigned; a farm with a farmer, or with no worker within 30 m, never asks;
   the idle workers farm first and offer to help build a site; and Yes does
   the same on a machine that loaded the game and never saw the question.
2. **Idle workers.** `pnpm dev`, open http://localhost:5173/?seed=1 and leave
   the four workers alone. About a minute in, one of them asks for all four:
   "Four of us have nothing to do. Shall we gather?" Hover the tick: "All 4
   gather what the side needs most, as the Gather button sends them." Click
   it: they go gathering. Click the cross instead (or let it run out): they
   stay idle and ask again only the next day, or a minute after their next
   work ends.
3. **An empty farm.** Build a Farm near the Big House and give the workers
   nothing more to do. A minute after it is finished, the farm asks over its
   roof: "No one is farming here. Send a worker?" Yes sends the nearest idle
   worker (one gathering if none is idle) to farm it, handing in any load on
   the way. Assign a farmer yourself while it asks: the bubble goes.
4. **A building no one works on.** Start a Storehouse with one worker, then
   send that worker off to gather. A minute later the site asks: "No one is
   building this storehouse. Send a builder?" Yes sends a worker to finish
   it. With idle workers near, they offer "Shall we help build the
   storehouse?" instead of gathering. Start a site just before dusk and leave
   it: nothing asks through dusk and the night, and it asks a minute after
   dawn begins.
5. **What reaches chat.** None of these goes to chat. Only "No worker is free
   nearby to farm here." (or "... to build here."), when Yes finds no one
   left to send, is urgent and does.

## How a tester checks working through the night (Patch 4)

*Jade's Patch 4 file (2026-10-05): workers gathering within 25 m of a
building and within 50 m of a troop (any combat unit) no longer stop and go
home by themselves at dusk, but ask "Should I keep working through the
night?"; Yes lets them work on, No sends them to an empty farm, or the main
base when there is none, and no answer counts as Yes for this one. Workers
who went into the main base for the night come out in the day whatever the
monsters do, or at dawn once no monster within 25 m is alive, and carry on
with their task or gather if they had none. Picks in
blueprint/patch4-night-work-picks.md. The rules are
`packages/sim/src/units/night-work.ts`, with the dusk turn in
`packages/sim/src/units/forage.ts`. Not live until Jade says so.*

1. **The tests.** `pnpm test` runs `packages/sim/test/patch4-night-work.test.ts`:
   the 25 m measured from a building's walls (a torch post or bonfire is not
   a building here) and the 50 m to any warrior (an artillery crewman too),
   mage or engine; one worker asking for the four round the Big House at
   dusk; no answer, then working all night only within 25 m of a building
   while the stock grows; Yes; No with no farm (into the main base, out at
   dawn, gathering on); No with an empty farm (two become its farmers, the
   rest go to the main base); no troop near, or farther than 25 m from every
   building, and they go home without asking as before; the question gone
   once they are all given other orders; a save in the night keeping who
   works on; staying in at dawn while a monster lives within 25 m and out
   once it dies; out in the day whatever the monsters do; Everyone Home by
   day unchanged; a worker its player sends in by night out at dawn too.
2. **The question.** `pnpm dev`, open http://localhost:5173/?seed=1 and,
   with 40 s of the first day left, select the four workers and press
   **Gather** (G): they go for what lies round the Big House, where the
   three warriors stand. (A worker given a move order stops gathering by
   itself, so move the warriors, not the workers.) At dusk one of
   them asks "Should the four of us keep working through the night?" in a
   bubble with a green tick and a red cross; its question goes past the 3 a
   player may have open. Hover the tick and the cross for what each does in
   full. Leave it: after 10 s the bubble goes and they keep gathering in the
   dark (their panel says "Gathering through the night"), only what lies
   within 25 m of a building, and come in once nothing is left there
   ("Nothing left to gather near the buildings. Heading in.").
3. **Yes and No.** Tick it another dusk: the same, at once. Cross it with no
   farm standing: "Heading in for the night.", they drop off their loads and
   go into the Big House. Build a Farm (B, then the Farm) with no farmers
   and cross it the next dusk: "Off to work the farm.", two of them drop off
   their loads and become its farmers (into the farmhouse tonight, on the
   field from daybreak) and the other two go into the Big House.
4. **Who does not ask.** Walk the warriors 60 m away first: at dusk the
   workers go home without asking, as before Patch 4. Workers gathering by a
   lone torch post far out go home too. A worker sent to one node with a
   right click is never stopped at dusk, as before.
5. **Out at dawn.** Let a night's monsters come to the Big House with the
   workers inside: at dawn they stay in while a monster within 25 m of it is
   alive and come out once the last one burns or falls, carrying on with what
   they had queued, or gathering (G) when they had nothing. By day they come
   out whatever the monsters do. Everyone Home (J) pressed at dusk, or E on
   the Big House with workers in the dark, works the same way.
6. **The editor.** The balance editor's new **Working through the night**
   group holds the 25 m to a building, the 50 m to a troop, the 25 m a
   worker gathers within at night, the 30 m one worker asks for the others
   within, the 25 m clear of monsters at dawn and how often they look out.
7. **Saves.** Who works on is kept in each worker's orders, which saves
   already hold, so this needs no save format change of its own.

## How a tester checks diggers turning in (Patch 4)

*Jade, Patch 4: workers digging should turn in what they carry as gatherers
do and go back to their task, and miners too if they did not already. Before
Patch 4 every bite dug went straight to the stock, with nothing carried;
miners have carried 25 lb bags out of the shaft to the nearest drop-off since
Patch 2 (step 8 of the mining trips section above), so they are unchanged.
Picks in blueprint/patch4-dig-turn-in-picks.md. The code is
`packages/sim/src/units/dig.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch4-dig-turn-in.test.ts:
   one worker digging a pit 4 columns square and 1 m deep carries 5 Earth
   (25 lb) a trip to the Big House, 29 trips with the last 4 taken home
   after "The dig is finished.", and the stock does not move while it digs;
   a Storehouse nearer than the Big House takes every load; a hand cart
   fills to 30 Earth (150 lb) before the trip; through soil over stone each
   load is one kind and the worker goes back to the column it left, so only
   the last load of each kind is short; a worker that comes carrying
   softwood takes it home before it digs; Unload sends a digger home and
   back to its dig; an earth bank still takes its Earth from the stock and
   nobody carries; four workers in a pit 12 columns square and 1 m deep
   get out of it with their loads, cutting no stairs (Patch 5), finish
   the pit with every unit of earth accounted for, and a save taken half
   way carries on to the same hash; four workers digging a pit 6 columns square and 3 m deep from its rim
   all get home with their loads. m4.test.ts still runs the miners' bag
   trips, a nearer Storehouse and the trip out at dawn.
2. **A small dig.** `pnpm dev`, open http://localhost:5173/?seed=1, select
   one worker, press D and drag a small square near the Big House, a few
   steps deep, then click. The stock's Earth stays where it is while the
   worker digs; after five bites its panel shows it carrying 5 Earth, it
   walks to the Big House, the Earth goes up by 5, and it walks back to the
   column it left and digs on. When the dig is finished it takes what it
   still carries home.
3. **A Storehouse.** Build a Storehouse beside a dig away from the Big
   House: the diggers take their loads to it, the nearer drop-off. With no
   drop-off at all the order ends with "There is nowhere to drop off earth.
   Build a storehouse.", as it does for a gatherer.
4. **A hand cart.** A worker that has taken a hand cart (X, made at the
   Workshop from main base 3) digs 30 Earth before each trip.
5. **Two kinds.** Dig deep where stone lies under the soil, with a stone
   maul or a pickaxe: a worker fills its load with Earth while any soil is
   left near it, then goes home and starts on the stone, never mixing the
   two; a worker that is given the dig while carrying something else hands
   that in first.
6. **Unload.** Select a digger carrying a load and press C (Unload): it
   takes the load home and goes back to the dig, where before it would
   have stopped.
7. **Crude stairs (gone in Patch 5).** Patch 5 removed them: workers now
   climb out of a pit with their loads (see "How a tester checks running,
   climbing and jumping (Patch 5)"). [Before Patch 5: dig a square about
   5 m across and three steps deep (about 1 m) with all four workers. They step down into it to reach
   its middle; once its sides are taller than a worker can step up (45 cm),
   a worker with a full load digs stairs out into the nearest side ("Digging
   stairs out" in its panel): a step 56 cm down beside the floor, then one
   11 cm down behind it. Its hands are full, so the earth from the stairs is
   left in a pile at their foot (an Earth icon on the ground); it walks up
   the stairs with its load, hands it in, and when it comes back it picks
   the pile up first ("Picking up loot") and then digs on. Later trips walk
   up the same stairs, which stay when the pit is finished.]
8. **A deep pit.** Dig a square about 3 m across and 3 m deep: the workers
   dig it from its rim (they cannot drop that far) and all get home with
   their loads; before, one walking off from near the rim's corner could
   give up with "I cannot reach a drop-off."
9. **Earthworks.** B, D and then K, P or I (an earth bank, a ramp, fill)
   takes its Earth from the stock as before; the workers carry nothing.
10. **Saves.** This part of Patch 4 changes no save format; a save taken
   while a digger carries a load or cuts its stairs carries on as it was.

## How a tester checks Patch 5's foundations

*Jade's Patch 5, the pieces every other Patch 5 change builds on: the main
base's ten levels become four tiers (GP-11); earthworks, ramps, ramp steps
and gravel are removed (GP-44, GP-45); either kind of lumber pays wherever
lumber or sticks are needed, and hardwood items are wooden (GP-41); one
kind of stick, 4 from a lumber in 20 s at a Storehouse (GP-39, GP-40); the
main base's Make button makes rope (GP-14); worker tools hit 2 less (BL-1);
and blood nights are gone (BG-1, BG-2). Picks in
blueprint/patch5-foundations-picks.md. The tiers are the main base rows in
`packages/sim/src/buildings/data.ts` (`MAIN_BASE_TIER_LEVELS` says which old
level's model each tier wears); the lumber rule is `Res.AnyLumber` with
`payAny` in `packages/sim/src/economy/food-kinds.ts`. The milestone sections
above that mention levels 2 to 10, earthworks, ramps, gravel or blood nights
describe the game before Patch 5.*

1. **The tests.** `pnpm test`: the sim's m2, m3, m4 and m8 tests upgrade to
   the Hall and train, smelt and research at the tiers; patch3-greyed asks
   for the Hall and offers to fell softwood for lumber; tables.test keeps
   the tool damage; m3-controls and patch4-hotkeys find Make rope on K; and
   m9-online refuses a save of format 8.
2. **The tiers.** `pnpm dev`, open http://localhost:5173/?seed=1 and select
   the Big House: its chip reads "Tier 1 of 4" and Upgrade offers the Hall
   for 118 lumber and 45 stone. Type M N B V C X Z and press
   **Citadel**: the main base is the Citadel (tier 4), drawn as before with
   its cannon ports. **Troop kit** raises it to the Keep (tier 3).
3. **What each tier opens.** With a Big House, the build menu greys out the
   Barracks ("Needs a tier 2 main base") and the Magi Sanctum, Mineshaft and
   Artillery workshop (tier 3). At the Scholar's Lodge, Muskets and Cannons
   want tier 4; Deep Mining III, Steel and Gunpowder want tier 3.
4. **Either lumber.** Start a game and gather only hardwood (the Fringe's
   oaks): a Farm, the Hall and a Workshop's planks all take it. Hover a
   cost: it reads "lumber", not "softwood lumber". Only Build, Defences,
   Hardwood wall, gate and tower still name hardwood.
5. **Defences.** Build, Defences shows 12 choices: wooden, hardwood and stone
   walls, the six gates and the three towers. No earth bank, ramp, fill,
   lumber ramp or stone ramp; no gravel in the stock bar.
6. **Rope and sticks.** Select the Big House: K is **Make rope** (2 flax),
   with no menu. Put up a Storehouse: its K is **Make sticks**, 1 lumber for
   4 sticks in 20 s. The Workshop's menu has Sticks (4) too, at its own
   pace (10 s).
7. **Worker damage.** A worker with the starting wooden tools hits for 2,
   with stone and flint tools 3, up to 9 with carbon steel (before: 4, 5
   and 11).
8. **No blood nights.** Play into night 13 and beyond with the Heartland
   held: no "A blood night is coming", no red night, no double horn; the
   clock reads "Night 13" as on any night. Fog nights still come.
9. **Saves and version.** A save from indev 0.9 is refused: "That save is
   from an older version of the game. Start a new game." (save format 9,
   snapshot 22). The main menu reads "indev 1.0 (dev build)" locally, and
   the next deploy takes indev 1.0.
10. **Check scripts.** Every hash moves with the snapshot version; m3-nights
    no longer heaps an earthwork, m5-threats no longer starts a blood night,
    and m2-camp and m4-economy use the closed-up building ids.

## How a tester checks the balance editor

The editor reads the sim's own data modules when it is built, so what it shows
is what the game runs on. Its build is one self-contained HTML file.

1. `pnpm balance:dev` and open http://localhost:5175 (or
   `pnpm --filter @blockyrts/balance build` and open
   `packages/balance/dist/index.html` straight from disk). The left menu lists
   14 groups, from Buildings and levels to Pacing (Mages and spells among them);
   the header names the commit the tables came from.
2. Buildings and levels > Build menu > Big House. Its "Unlocks and uses"
   box lists what each main base level unlocks (Barracks at level 2, and so
   on) and what is made there; click a chip and that entry opens. Research >
   Bronze lists everything that needs it. Research > Steel shows "Main base
   level needed" 7 (Patch 2: the Forge has no levels; its metal steps come
   with the main base). Walls, gates, towers and earthworks are under Build
   menu: Defences, the torch post under Build menu: Lights.
3. Change Level 2: Longhall > Build work from 400 to 450. The row turns
   yellow with "was 400 ws" and a Reset, the menu shows a count, and the
   change appears on the right with a note box. Search "zombie health",
   change it in the results, and add a note.
4. Export: a file named balance-changes-YYYY-MM-DD.json downloads with only
   those two changes, each with its module, path, label, old and new value,
   plus the commit. Clear all, then Import that file: both changes come back.
   Reloading the page keeps the session too.
5. `pnpm --filter @blockyrts/tools balance:apply <that file> --dry-run` lists
   both as "would apply" with the file and line it would edit. Without
   `--dry-run` it edits `packages/sim/src`, re-reads the sim in a fresh
   process to check every value landed, and lists anything it left for a
   person (a value worked out by a formula, or written in a helper several
   rows share) with the file and line. `git diff` shows the two literals
   changed; `git checkout packages/sim` undoes it.
6. `pnpm test` runs `packages/balance/test` (the tree, units, export and
   import) and `packages/tools/test/balance-apply.test.ts`, which changes
   every editable value at once on a copy of the sim, checks each one it
   reports applied in a fresh process, and typechecks the result.

## How a tester checks the multiplayer server (milestone 9, server side)

The screens that use the server are checked in milestone 9 above; the server
and its protocol are tested headless.

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

## How a tester checks How to Play and the patch notes (Patch 5)

How to Play shows every number the game runs on, read from the sim's own
tables, so it changes whenever the balance does; the patch notes are written
for players.

1. The main menu has **How to play**, and under it **Patch notes** with a
   "New update: Patch 5" mark, bright gold until the notes are opened in this
   browser, then dim.
2. How to play opens full-window: guides and a card for every section on the
   front page, every section and page in the sidebar, and a search box (Enter
   opens the first result, Esc clears it). Search "bone": the Bone page comes
   first, then the monsters that drop it. **Return to main menu** at the top
   right goes back.
3. Every building, unit table, weapon, armour and tool tier, spell, recipe,
   good, animal, monster, lair, people and rule table has a page: its
   picture, its headline numbers as tiles, every other number in rows,
   costs as picture chips, drops as a table, numbers at zero on one line at
   the end, and "Linked pages" (what needs it, makes it, drops it or uses
   it). The Big House shows each level with its own picture. A table only the
   catalog knows lands under "More numbers" until it is given a section in
   `packages/client/src/ui/how-to-play/categories.ts`.
4. The address follows the page (`#how-to-play/monsters/zombie`): the
   browser's Back button goes back a page, and opening such a link from
   outside starts on that page. `#patch-notes` opens the patch notes.
5. Patch notes: every update newest first, each split into Bug fixes,
   Balance, Gameplay and content, and Quality of life, with no names of
   people and nothing about tools only the developers use (a test checks
   the words).
6. `node packages/client/test-e2e/how-to-play-look.mjs <dev server URL>
   <folder>` drives all of this in a browser and saves pictures of it.

## How a tester checks Patch 5's world

The land is measured from the main bases now, cliffs before the Barrens have
become mountains, and there are new things to find and gather. Start a game
(`?seed=1` gives the same world each time).

1. Bands: the Heartland reaches 155 to 175 m from the nearest main base in
   every direction, then the Fringe, the Deepwoods and the Barrens are each
   155 to 175 m wide, and the Deadlands go on from there. Each border
   wanders about 5 m. Farms, mines and the threat count the band where they
   stand.
2. Before the Barrens there are no small cliffs or ledges: the old cliff
   lines are broad mountains, rock on top and grass lower down, with open
   passes. Parts of the Heartland, Barrens and Deadlands roll in gentle
   hills, never within 50 m of a start. Villages stand on flat ground, and
   bogs lie in hollows.
3. One peak of 11 to 14 m stands 100 to 125 m from the first player's main
   base.
4. Nothing natural lies deeper than 6 m below sea level, ravines are 3 to
   5 m deep, and digging stops at the same 6 m.
5. Woods are thinner and walkable, the Heartland's most of all, and a felled
   tree's seeds only take root 4 m or more from any other tree.
6. Boulders, 3 m tall, about one every 4 or 5 chunks and none within 40 m
   of a main base: 400 stone, 3 workers at once, a digging stick or better.
7. Coal rocks, grey rocks with black chunks set in them: copper picks or
   better, 20 to 30 coal, then 40 to 60 stone left behind as an outcrop.
8. Mountains before the Barrens very rarely hold a silver node (1 to 4
   silver, then 10 to 20 loose stone) and more rarely a gold node (1 to 2
   gold, then 6 to 12 loose stone), both with copper picks.
9. Flax grows in fields of 8 to 16 plants in about a third of the
   Heartland's, Fringe's and Deepwoods' chunks, the ones with few trees,
   never in bogs: three looks that gather alike, and a tall one twice the
   height that gives 20 flax. Picked bare, it grows back in 3 minutes.
10. Edible mushrooms at the feet of trees (one for every 3 trees in a chunk,
    10 at most) and black berry, raspberry and blueberry bushes: 1 food a
    mushroom or a bunch of berries, each in its own inventory slot. A berry
    bush picked bare keeps its leaves and its berries come back in 2
    minutes.
11. Iron rock: the Fringe's half the size and half as many as before, the
    Deepwoods' a fifth smaller again and 80% as many as the Fringe's, the
    Barrens' and Deadlands' as the Fringe's were. Marble rock turns up in
    the Fringe and the Deepwoods.
12. Hot springs, a pool with a stone rim and sulphur on it, in about 1 in 5
    Barrens and Deadlands chunks. The first time your units come near one,
    an ash golem stands on its rim: it grumbles at units within 25 m, wakes
    with a roar when they come within 12 m, and growls as it fights. Killed,
    it never comes back. None in a peaceful game.
13. Dead trees give 10 softwood lumber and thorn bushes 10 sticks; neither
    grows back.

## How a tester checks the open site, open games and the debugger (Patch 5)

The site is public, games can be found in a list, and the debugger is new and
for the admin accounts only. `pnpm --filter @blockyrts/server dev` and
`pnpm dev` give a local server and page; `pnpm --filter @blockyrts/server
test` and `npx vitest run packages/sim/test/patch5-godmode.test.ts
packages/client/test/patch5-debugger.test.ts` cover the same ground headless.

1. **The site.** No password prompt and no "indev" login page: the main menu
   loads straight away. The page source has the title, a description, link
   preview tags and a short summary for readers without JavaScript.
   `/balance/` is gone (the editor stays a private tool, `pnpm balance:dev`).
   A production build given `VITE_SITE_URL` writes `robots.txt` (open, with
   the sitemap) and `sitemap.xml` (deploy/README.md, "Public site and
   search").
2. **Open games.** Join game has an **Open games** button under the code
   box. It lists each lobby waiting for players with its host, how many are
   in it, the places free and whether it continues a save. Public games come
   first with a **Join** button; private games are listed below them, marked
   private, and their **Join with code** goes back to the code box. Joining
   by code or invite link works as before.
3. **Private games.** New game and Load game's host page have a **Private
   game** switch. A private game still shows in the list, below the public
   ones, but only someone with the code can join it.
4. **Kicking.** In the lobby the host has a **Remove** button by each other
   player. After confirming, that player goes back to the menu with "The host
   removed you from that game." and cannot join that game again, by code, by
   link or from the list (the server remembers their account, their session
   and, for a guest, their address).
5. **Outdated saves.** When the server starts it deletes the files of every
   save older than the live save format. In Load game, such a save stays in
   its owner's list, greyed, with "This save is no longer valid: it is out of
   date with the live game." and an **OK, remove it** button that removes it
   for good. Saves kept in the browser that are out of date show the same
   way.
6. **Who can open the debugger.** Only the accounts `jade` and `Proteus`
   (any capitals; the server decides, `DEBUG_ACCOUNTS` changes the list).
   Signed in as one of them, in a match, type M N B V C X Z: the debug panel
   opens at the top left as before, and the same keys close it. Signed out or
   on any other account the keys do nothing, and the relay drops debug orders
   from other players. A dev build (`pnpm dev`) lets anyone open it and keeps
   the old tester buttons (Troop kit, Creature, Hill, Crowd +200 and the
   rest named in the checks above) after the new ones; the site's build does
   not include them.
7. **Godmode.** Press **Godmode** (it lights). Every building builds at once
   where you place it, with no costs, no workers walking there and no main
   base tier or research needed; upgrades, research and training finish at
   once (cavalry needs no horse). The inventory turns into a grid of every
   unit in the game: workers, each troop type at its top kit, both mages, a
   crewman, the five engines, every animal, every monster, Morvath and every
   lair. Click one: its model follows the cursor. Click the ground to place
   it (it stays on the cursor to place more); right click or Esc lets go. A
   unit of yours is yours, a farm animal is yours, a wild animal is wild, a
   monster attacks. While a unit is on the cursor the action card is one
   large **Cancel placement** button, the card's usual size; moving the
   cursor over it (or clicking it) lets go of the unit. Close the debugger
   with godmode on: godmode ends and your own stock comes back.
8. **The other buttons.** **Village** builds the named village in the middle
   of the view and moves on to the next (Halfling village, Runkin camp, Elf
   caravan, Dwarf colony, Dwarf city, mercenary camp, goblin village). **Elf
   kingdom** takes the camera there and reveals the land round it. **Max
   rank** raises every unit of yours to its top rank; **Heal all** heals your
   units and mends your buildings; **Kill selected** kills the selection;
   **Clear monsters** removes every monster within 60 m of the middle of the
   view. **Reveal**, **Show all**, **Fog**, **Wave** and (offline)
   **Speed** work as before (blood nights leave the game in Patch 5, and
   their button with them).

## How a tester checks the late-night lag, the cursor, the void and the minimap (Patch 5)

*Patch 5 bugs BG-2 to BG-5: the lag and slowed clock around night 15, the
cursor vanishing after switching tabs, black void showing in ravines and pits,
and the minimap failing far from the base. Causes and picks in
blueprint/patch5-bugs-picks.md.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-night-lag.test.ts:
   through six rounds of digging, heaping and water running into the holes,
   the town fields and coarse crossings kept up to date in place match ones
   built afresh from a copy of the game (as after loading a save), and they
   were repaired rather than rebuilt; water reads only as wading, swimming
   and a swimmer's level. packages/client/test/mesher.test.ts checks a ravine
   wall drawn down to a floor below its own lowest layer, a chunk's edge drawn
   down to the lowest its neighbour can show at less detail, and far chunks'
   skirts hanging below all land. packages/client/test/minimap-transform.test.ts
   checks the minimap shows small land whole and, past 600 m, a window round
   the camera that keeps its scale and stays put under a click or drag.
2. **Night 15.** Play into a siege (or press Wave in the tester tools near
   the town at night) with breakers smashing ground near the town and water
   flowing into the holes. The game keeps time: the day clock runs at its
   normal pace and two players stay in step.
3. **The cursor.** In a game, switch to another tab and back (or alt-tab
   away and back) without moving the mouse: the cursor shows at once. With
   cursor lock on, it shows again when the lock returns.
4. **No void.** Find a ravine and look along it and down into it from every
   side, close up and zoomed out, and dig a pit next to higher ground (Dig in
   the tester tools, or workers' Dig): walls go all the way down to the floor
   and no black shows anywhere below the land.
5. **The minimap far out.** Send units a long way from the base (or use
   Reveal at spots far apart). Once the explored land is more than about
   600 m across, the minimap stops shrinking: it shows a window round the
   camera at a readable scale, moves with the camera when the camera leaves
   it, and stays still while you click or drag on it. Lairs off the window
   show pinned to its edge, fainter, on the side they lie; pings off it ring
   at the edge.

## How a tester checks the mobs and waves (Patch 5)

*Jade's Patch 5, section 14: the mob damage cuts, the waves going for every
base and party, towers and walls broken to reach units, waves sized with the
player count, the waves' side of Bright Nights, Morvath's new model and his
staff and wings, the necromancer, the Deadlands' mana crystal guardians, and
remarks about what is round each unit. Picks in
blueprint/patch5-mobs-picks.md.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-mobs.test.ts:
   the cut blows held in tenths (a 7.6 blow is 7 or 8, 8 six times in ten),
   the waves for two and three players within a tenth of twice and three
   times one player's, a Bright Night leaving out that player's share (and in
   single player the whole wave), the night's groups aimed at the base and at
   a party out in the open, the necromancer's nights, his coming one for each
   player on top of the threat, his summons of 9 or 10 once seen and again 60
   s later with his 20 s bubbles, his drops, and a crystal's 2 or 3 guardians
   coming once, keeping within 5 m, going for a worker 6 m off and never
   coming back once killed (the guarded crystals go in the save).
   packages/client/test/pause-controls.test.ts checks a unit's remark waits
   its 1 to 4.5 minutes and stands still while paused.
2. **Damage.** Monsters hit 5% softer (daytime hunters 15%), except the ones
   Jade set herself. A zombie's blow lands as 7 or 8 against unarmoured
   units, never 7.6.
3. **Where the waves go.** Send two or more workers 150 m out from the town
   and play into a night: some groups come out of the dark near them and go
   for them while the rest go for the town; in a game with two towns far
   apart each is attacked. A tower whose archers shoot at monsters with no
   loose units near gets broken; walls get broken when monsters must go
   through to reach units, and go round when a short way round exists.
4. **Bigger with more players.** In a two or three player game the night's
   monsters come in about two or three times the number of a single player
   game.
5. **Morvath.** Place him with the debugger's godmode grid. He is the new
   4.5 m model with his staff. His blow does 200 and bursts violet over 1 m
   round where it lands; monsters caught in it heal him, white motes flying
   from them to him. At half health he changes (his transform clip), spreads
   his wings and drains up to 500 health from everyone near him over 5 s,
   once, in white motes; then he flies with his second form's clips and
   falls with his second form's death.
6. **The necromancer.** On nights 10, 20, 30 and 40, then every 5th night to
   60, every 2nd to 90 and every night after, one comes for each player with
   the waves, on top of them (or place him with godmode). Once any of your
   units or buildings sees him he raises 9 or 10 skeleton archers and zombies
   in crimson round him, then again every 60 s, saying so in a bubble that
   stays 20 s. Every 10 s he casts his crimson bolt: 35 to whoever it hits
   and 35 to anyone within 0.5 m of it. He burns at dawn with his wave.
   Killed, he drops metal and leather from 2 to 4 weapons or armours (tier 3
   to 5, higher once you can make higher), 1 to 5 ingots of one kind, 2 to 8
   bones and now and then a mana crystal.
7. **Crystal guardians.** Go out to the Deadlands (Reveal shows the far
   bands). Each mana crystal there gets 2 or 3 ash golems and mana wraiths
   when one of your units first comes within 60 m. They glow with thin
   pulsing blue light, read **Mana crystal guardian** when selected, never
   burn in the sun, stay within 5 m of the crystal, chase no farther than
   8 m from it, and go first for a worker sent to gather the crystal. Kill
   them and that crystal is never guarded again.
8. **Remarks.** Watch a town for a few minutes: each worker, troop, mage and
   people's unit on screen says something about what is round it (a monster
   or animal near, the building beside it, what it carries or does, a crowd,
   being alone, the time of day) once every 1 to 4.5 minutes, now and then a
   complaint when hurt or hungry. Nobody remarks while the game is paused.

## How a tester checks the defences and siege (Patch 5)

*Patch 5's defences: wider gates, the earth rampart, walls that crack and
break, the Citadel's engine platform and its fixed engines, lead ore in
gunpowder kit, and guns and blasts that look and sound the part. Picks in
blueprint/patch5-defences-picks.md.* `npx vitest run
packages/sim/test/m8.test.ts packages/client/test/m8-controls.test.ts
packages/client/test/patch4-hotkeys.test.ts` covers the platform, the cards
and the keys headless. The debugger's **Godmode** makes the checks quick:
buildings stand at once, upgrades and training finish at once, and its grid
places monsters (a skeleton bomber is the wall breaker) and your own units.

1. **Gates and towers.** Build, Defences: a gate is 6 columns wide, twice
   what it was, drawn as its gate model (turned for north to south). Towers
   are 4 by 4 columns. Every tower is drawn as its model, with its men on its
   top; the wooden and hardwood towers' roofs stand clear of a man's head.
2. **Walls.** Build a wall chain that turns a corner and runs on diagonally.
   Each column is drawn as its wall model, turned along the run; where the
   wall turns, and on a diagonal's steps, a corner post. Let monsters hit a
   stretch (or hit it with an engine's Attack): below 70% health it shows
   cracks, below 40% it is snapped with the top half hanging to the ground,
   and it still blocks the same. Repair it and the looks go back. A wall has
   no health bar; clicking it shows its health in the middle as before.
3. **The earth rampart.** Defences, **Earth rampart** (M): placed in a chain
   from point to point like a wall, in chunks 2 by 2 columns (about 1 m
   across), each 2 m tall and costing 10 earth (a worker's full load). It has
   the health of one wooden wall column, shows torn earth below 70% and 40%,
   and is not dug like the land. It is a wall in every other way: your units
   cannot climb it, and climbing monsters go over it as they go over any wall.
4. **The Artillery workshop.** Its card shows Train artillery crewman (E) and
   the four engines as buttons of their own: Catapult (C), Ballista (B),
   Bronze cannon (N) and Iron cannon (I). There is no Engines button. The
   Magi Sanctum's Hexcraft is on its card the same way (H).
5. **The Citadel.** With an Artillery workshop standing, raise the main base
   to tier 4 (the Citadel, drawn as its own model with a flat platform on
   top and 8 men's places on the keep's wall walk). Its card has **Build
   defense** (D), which opens:
   Springald, Mangonel, Bronze culverin, Iron bombard (each on the letter of
   its name) and Garrison (G). Each fixed engine costs what its mobile engine
   does (lead ore and its crew's food too) and needs what that one needs
   (research and tier). Build one: it stands on the flat platform at the top
   with its garrison artillery crewmen, drawn as its own fixed model on
   timber braces with no wheels, and fires at monsters in reach. Stop, Unload and
   right clicks never bring it or its crew down; its card has Attack only,
   and an attack order out of its reach is dropped with "That is beyond the
   ...'s reach." While one stands there the other buttons read **Upgrade to
   ...** for the higher ones (the cost and time difference; it cannot fire
   while the upgrade builds, and a springald becoming a mangonel brings a
   second crewman free). **Garrison** stays greyed until the engine is short
   of crew: kill one of its crew (Kill selected) and it lights up. Only
   flyers and ranged monsters can hit the engine and the men up there. Kill
   the engine itself and its crew stay up on the platform for good; build
   another and they man it, with new crewmen only for the places still empty.
6. **Men up top.** With no fixed engine on the platform, select more men
   than fit (archers, melee, mages, workers) and right click the Citadel:
   the best ranged troops go up first, then mages, then melee; the panel's
   count is out of 12 (8 on the parapets, 4 on the platform). Once an engine
   is built up there, the platform's men come down to make room.
7. **No cannon ports.** A cannon's card has Attack, Move and Hitch; right
   clicking the Citadel with a cannon does nothing.
8. **Lead ore.** A musketeer's kit takes 2 lead ore, a brawler's pistol 1, a
   bronze cannon 4 (and 40 bronze ingots) and an iron cannon 6; the fixed
   ones the same. Without it the buttons grey with the lead ore named.
9. **Guns.** A musketeer firing shows a flash and a spray of sparks at the
   musket's muzzle (the tip of its barrel) and smoke rising for 4 s; a
   brawler's pistol 3 s; a cannon, mobile or fixed, 5 s and bigger, from the
   mouth of its barrel. The bronze cannon is short and fat, the iron one long
   and dark. The ball flies as its model (the bronze cannon's smaller) with a
   faint grey dash behind it by day and a bright orange streak at night.
   Each has its gun's sound.
10. **Blasts.** A cannonball landing explodes in fire, dirt and smoke; on
    grass or soil it leaves a heap of earth to pick up. One that hits a tree
    fells it, leaving half its lumber. A catapult stone throws up dirt, no
    fire, leaves less earth, and fells only small trees. A bronze cannon's
    shot is smaller, with a smaller blast.
11. **The wall breaker.** A skeleton bomber, hooded with red eyes and a black
    skull-marked bomb, has its fuse fizzing with tiny sparks at the fuse's tip.
    When it goes off: an explosion, smoke rising for 3 s and a shallow
    crater; it hurts units half as much as before. Kill one before it reaches
    a wall and nothing goes off, and no bomb falls.
12. **Engines on your own.** Select an engine, Attack, and click one of your
    own units: it fires at it.

## How a tester checks Patch 5's trade, mercenaries and carts

*Jade's Patch 5, section 21: trade within 10 m of any of a people's
buildings, a day of trade per settlement shared by every player, typed
amounts, no earth, cheap stone (GP-46, BL-3); gold and silver welcome
everywhere and mercenaries hired for good, with gold too (BL-4); diamonds,
bluestone and Moon Roses (decisions 2.5); the To send list (UI-15); carts
worth using (BL-12); and trade menus that keep their × and never squeeze
their lists (decisions 2.16). Picks in blueprint/patch5-peoples-picks.md.
The numbers are rows in `packages/sim/src/peoples/data.ts`
(`DAILY_TRADE_TENTHS`, `GOOD_PAY_PCT`, `HIRE_SILVER`, `TRADE_RANGE_WU`).*

1. **The tests.** `pnpm test`: the sim's m7 tests trade from 10 m of a
   building, fill and trim a day of trade, price stone, diamonds and
   silver, and hire mercenaries for silver or gold who stay after dusk;
   patch4-dig-turn-in fills a 250 lb hand cart.
2. **Reach.** `pnpm dev`, open http://localhost:5173/?seed=1, type M N B V
   C X Z and press **People** until a Halfling village stands in view, then
   **Trade kit**. Right click any of their buildings with nothing selected:
   the trade menu opens and says "Bring one of your units within 10 m of
   one of their buildings." Select a warrior and right click the building
   again: the warrior walks over, and the warning goes once it is within
   10 m.
3. **The menu.** The title and its × stay at the top however long the
   lists are; the body scrolls under them. Every good in They sell today,
   Your goods and the offer box shows its picture, name and count at full
   size, and a long list scrolls. On a narrow window the columns stack.
4. **Typed amounts.** Click a good: it goes into the offer box with a
   number box. Click the box, type 37 and press Enter: the offer holds 37
   (no more than you have). **All** puts in all of it, **×** takes it out,
   **Clear** empties the box.
5. **A day of trade.** The Their trade left today bar starts full. Offer a
   lot of gold: the worth bar fills and "More than they will trade today"
   shows. Make the offer: they trim it to what fits and say so; take a
   bundle and the bar runs low. A second player trading with them draws
   on the same bar. At dawn it is full again. A Dwarf city's bar holds
   the most and a Runkin camp's the least.
6. **Earth and stone.** Earth in Your goods is greyed ("Nobody takes
   earth"); offering it anyway gets a line about dirt. Stone is taken at
   a fifth of its worth.
7. **Gold, silver and diamonds.** Halflings now take gold and silver (and
   still refuse gems); Dwarves and Elves pay one and a half times a
   diamond's worth.
8. **Mercenaries.** Press **People** until a mercenary camp shows and
   right click it: the hire box lists 7 silver or 1 gold a head (14 or 2 in
   the Deepwoods), your silver, gold and supply room, and **Pay in silver**
   and **Pay in gold**. Hire two: supply goes up by 2, and at dusk they stay
   with you (no walking home). With no supply room left, the box says so.
9. **Send resources** (two players). Press ]: pick stone and copper ore,
   each goes on the To send list with its picture and an amount. Type,
   +10, +100, All and × change a line. The Send button's tooltip names
   exactly what goes; pressing it sends the whole list and empties it.
10. **Carts.** A worker with a hand cart cuts a tree, then walks on to the
    next tree before going home, until 250 lb are on the cart. Copper,
    tin, lead and the iron ores weigh 8 lb each, so a miner on foot brings
    3 at a time and a hand cart 30.
11. **Saves and checks.** Snapshot version 24 (the faction record keeps one
    number for the day's trade); check scripts' hashes move with it.

## How a tester checks the controls, HUD and markers (Patch 5)

*Jade's Patch 5, sections 11, 26 and 27: left click to target and right click
for the auto function, autorepair and repair costs, Repair All, units leaving
the selection as they go into buildings, double-click types, F2, training at
several buildings, shared control of combat units only; the HUD look; and the
bars, damage numbers, stars, hover outline and order lines over the world.
Picks in blueprint/patch5-client-ui-picks.md.*

1. **The tests.** `pnpm test`: packages/sim/test/patch5-controls.test.ts
   (repair costs, autorepair, Repair All, room-limited entering with the best
   ranged first, farms sharing workers out, shared control, a refused
   training said once), packages/client/test/patch5-selection.test.ts
   (double-click types), patch5-world-marks.test.ts (bars, stars, order
   lines) and m3-controls (left and right click on Gather, Hunt and Repair).
2. **Bars and numbers.** `pnpm dev`, open http://localhost:5173/?seed=1 and
   type M N B V C X Z, then press Wave near the base at night. Over anything
   below 95% health a bar shrinks from green to red; mages have a blue mana
   bar under it. Red "-N" numbers rise off each hit and fade; a hit of 100 or
   more is bigger and shakes. Walls carry no bar. A building training a unit
   has a gold bar under its health bar.
3. **Stars.** In a game with a second player, the other player's units and
   buildings carry a small star in their colour with a thin black border;
   yours never do, nor do monsters.
4. **Hover and order lines.** Point at a unit, a building, loot or a tree: a
   white line runs round its outline. Select a group and right click far off:
   a dotted line runs from the group to a green flag. Attack-move (A, then
   ground) gives a red flag and red rings; Patrol a blue flag at each end; a
   direct attack a tiny red dot on the target; a rally point a yellow flag.
5. **Gather and Hunt.** Select workers and press Gather: the cursor is an
   axe; click a tree and they fell it, take each load home and go back.
   Right click Gather instead: they gather by themselves. Select warriors and
   press Hunt: the cursor is a spear; click a deer and they chase it, then go
   on hunting. Right click Hunt: they hunt by themselves.
6. **Repairs.** Damage a building (tester tools), select workers and right
   click Repair: the button shows AUTO, and workers within 8 m of the damage
   walk over and fix it, then go back to gathering. The stock drops by the
   building's own materials as it heals. Press F8 (Repair All, where camera
   spot 4 was): the workers within 20 m of each damaged building go, idle
   ones first; farm workers stay at their farm, and the idle ones gather
   afterwards. With no materials, a worker says "Not enough ... to repair".
7. **Into buildings.** Select 4 workers and right click a new farm: 2 go,
   and leave the selection once they start working; 2 stay selected. Select
   6 workers, hold Shift and right click three farms: 2 go to each. Select a
   mixed army and right click a tower: the best rangers go up first, then
   mages, up to its 4 places, and those leave the selection.
8. **Selection.** In a mixed selection, double click a spearman: only the
   spearmen of that selection stay. Press F2 with men on a tower: those on
   the tower are not selected. Select two main bases and press Train worker:
   each starts one; with food for one only, one starts and the message says
   why once.
9. **The HUD.** Hotkeys and tiny numbers are crisp; pictures fill the
   buttons; buttons never grow past 128 px. The message panel starts folded
   to a small button at the left edge over the minimap's buttons, counting
   other players' messages until opened. Bubbles stay a second longer.
10. **Turning the camera.** Hold `,` (comma): the camera turns left round
    the middle of the view; hold `.` (full stop) and it turns right, a half
    turn in about 1.5 s, looking down at the same angle, so the far side of
    a building comes into view. The arrow keys and the screen edges still pan
    along the screen, and sounds on the left of the screen still come from
    the left. Tap either key twice quickly: the camera turns back to north.
    Both keys can be rebound in Settings, under Camera and selection.
    packages/client/test/patch5-camera-turn.test.ts checks the angle, the
    middle of the view, panning and the turn back.

## How a tester checks unit and building looks (Patch 5)

*Jade's Patch 5 file: every piece of gear a unit carries is drawn on it, at
its tier (hard rule: no invisible equippable gear); shields are drawn; every
task has its own worker clip; mages wear their robes, battle robes going blue
to red with tier and support robes green to white, with a flaming halo on the
top battle mage and a sparkling one on the top support mage; and every
building looks like itself. Picks in blueprint/patch5-looks-picks.md. The
units are drawn in `packages/client/src/world/units-view.ts`, the buildings
in `packages/client/src/world/buildings-view.ts`, and their models placed by
`packages/sim/src/buildings/footprints.ts`.*

1. **The tests.** `pnpm test` measures every newly modelled footprint
   against its model (`packages/tools/test/footprints.test.ts`) and builds
   every model, each metal tier's look and each building's stages, ruins and
   damaged look (`packages/tools/test/models.test.ts`).
2. **Jade's bodies.** `pnpm dev`, open http://localhost:5173/?seed=1: the
   workers, warriors and mages are Jade's improved models with her clips.
   Each worker carries every tool of their kit: the one in use in the hand,
   the rest on the hips and back.
3. **Troops at every tier.** Type M N B V C X Z, press **Troop kit**, select
   the Barracks and train each troop type at a few tiers (or press
   **Godmode** and place each troop from the inventory grid: they come at
   the top of their kit). Each weapon is its own model at its tier (a flint
   spear, a bronze short sword, wrought then refined iron swords, steel and
   high quality steel), held in the hand; a ranger's bow or crossbow is in
   the left hand, the quiver or bolt case on the back or hip. Armour,
   helmets and boots are worn on the body and move with it; close melee
   troops carry their shield on the left arm, painted in the team colour.
   Each attack, reload and block has its own clip.
4. **Mages.** Press **Sanctum** and **Mage kit**, train a support and a
   battle mage and upgrade their robes: each robe tier is its own look, the
   battle robe from blue through purple to red, the support robe from green
   to white. Every wand tier is its own model in the hand. Press **Max
   rank**: the top battle mage wears a ring of flickering flames over the
   head, the top support mage a ring of sparkling white and gold.
5. **Work clips.** Send workers to chop, mine, gather, fish, butcher a
   carcass, hoe a farm, build, relight an out torch (they carry a torch to
   it), dig and tame: each has its own clip and the tool for it in hand
   (a spade to dig, a rod to fish, casting then waiting). Prospecting (T)
   shows the prospect clip with a hammer at a metal tier, and a progress bar
   over the worker like tinkering.
6. **Carried goods.** A worker carrying a load shows what it is, each good
   its own model (long loads on the shoulder, the rest in the arms or one
   hand), instead of a plain box (farm fare, with no model yet, keeps it); a worker with a hand cart pushes it ahead, and an ox or horse
   hitched to a worker pulls an ox cart. A horse wears its tack under a rider
   and its harness when hitched. Artillery crewmen work the rammer, ladle and
   linstock as they load, aim and fire.
7. **Monsters and peoples.** Monsters and peoples' units hold the weapons
   their models come with.
8. **Buildings.** With **Godmode**, place a Workshop, Forge, Barracks, Magi
   Sanctum, Scholar's Lodge, Mineshaft (on flat bare stone), Barn and
   Bonfire: each is its own model (before: the same plank house in different
   sizes, the Barn a painted pen and the Bonfire a doubled campfire). Units
   walk round what is drawn. Without godmode, a building being built shows its model's stage for the
   work done (foundations, walls, roof, each with its own scaffolding);
   at or below half health it shows its damaged look (walls and ramparts
   crack and break instead, as the defences section says), an out torch post is drawn
   unlit, and a building that falls leaves its ruins for 30 seconds before
   they sink away.
9. **Ghosts and plans.** Pick a building to place: the ghost over the green
   and red tiles is the building's own model, see-through (a wall chain's
   columns join and turn their corners as built walls do). Shift-queue a few
   builds for a worker: each planned building shows faintly as its first
   building stage. Before: both were the block look.
10. **Ranks and portraits.** A worker or warrior from rank 2 wears bands on
    the left upper arm: one bronze band at rank 2, two bronze at 3, two steel
    at 4, three gold at 5 (rank 1 has none). Select a mage with a robe: her
    picture in the selection grid and in a building's panel is her robe
    look's portrait, coloured as she is drawn.

## How a tester checks gear as items, shields and scrapping (Patch 5)

*Patch 5's GP-1, GP-3, GP-26, BL-11, UI-8 and the troop side of the unused
goods: weapons, armour and shields as goods in the stock, close melee's
shield slot, scrapping at the Workshop, gear in the night waves, poison
tips. Picks in blueprint/patch5-gear-picks.md.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-gear.test.ts: a
   ready item goes on first, free, in a fifth of the time and whatever is
   researched, unless a higher tier can be made; a troop trains with an item
   from the stock; training low and upgrading is never quicker than training
   high on any ladder; a scrap stack takes one place in the queue, gives each
   one's materials as it finishes, takes more of the same into its stack and
   gives back the rest when cancelled; spider silk pays for rope and obsidian
   for flint; the waves carry about 0.04 pieces a night per player.
2. **A shield of their own.** `pnpm dev`, open http://localhost:5173/?seed=1,
   type M N B V C X Z, press **Troop kit** and **Citadel**, and build a
   Barracks. The close melee card has three slots: weapon, armour and
   shield, each opening its tier strip. With stock for everything it trains
   the best weapon, then armour, then shield; with too little left, no
   shield. The Big House's close melee come with a wooden shield when the
   stock pays for one. Select a swordsman: the panel shows the shield in its
   own slot with its tier, and **Upgrade equipment** raises it like the
   weapon and armour.
3. **The old piece goes to the stock.** Upgrade a unit's weapon. When it is
   done the old weapon is in the stock's new **Gear** row (last), with its
   picture. Train a unit of that kit, or upgrade another unit to it: the
   item goes on first, costs nothing and takes a fifth of the time; the
   tooltip says so.
4. **Scrapping.** Build a Workshop and open its menu: **Trinkets** holds the
   trinkets, **Scrap equipment** every piece of equipment in the stock
   (greyed out with none). A click scraps one, Shift + click ten; a right
   click opens **Scrap 1**, **Scrap 10** and **Scrap all**. A stack takes one
   place in the queue with the count on its picture; each 10 s the count
   drops by one and that piece's materials land in the stock. Cancel it: the
   pieces not yet scrapped come back.
5. **The Workshop asks.** Leave a Workshop with materials in the stock for a
   few minutes: every 200 to 300 s it asks in its bubble whether to make
   something it can make now. Yes queues one batch; No queues nothing.
6. **Poison tips and the other goods.** With venom in the stock, the
   Workshop makes poison tips (1 venom). **Upgrade equipment** on a bow or
   crossbow ranger puts them on; its panel shows them, and its hits poison
   (the poisoned mark on the target). Spider silk pays where a bow wants
   rope, obsidian where a kit wants flint; the pistol and musket ask for lead
   ore (1 and 2).
7. **Gear in the waves.** Late enough (or with many nights of **Wave**), a
   killed monster now and then drops a weapon, armour or shield of the
   night's tier, which units carry home like other loot.

## How a tester checks the unit inventory, the item menu and the main base shelter (Patch 5)

*Patch 5's GP-2, GP-5 to GP-10, GP-13, GP-27, GP-33 and GP-34, with
decisions 3.6 and 3.8: one unit's inventory in the middle of the HUD, one
right-click menu for every item, Equip from the stock, drop-offs by
themselves, troops sheltering in the main base, and eating to heal. Picks in
blueprint/patch5-gear-picks.md (section 12).*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-inventory.test.ts
   (units near a drop-off hand in by themselves; Drop puts a good on the
   ground that nobody picks up by themselves; Unload takes one good; Equip
   pays the item and sends the unit to put it on, or says why it cannot;
   who goes inside a main base and who goes up; the panel's switch; one "I
   feel safe in here." for a run of workers; the food a wound needs) and
   packages/client/test/patch5-inventory.test.ts (the item menu's choices in
   order, greyed with their reasons; an item's own use; the inventory's
   slots and weight; the bars on spells).
2. **One unit's inventory.** `pnpm dev`, open http://localhost:5173/?seed=1,
   type M N B V C X Z and select one worker. The divider after the name runs
   down the panel: on the left the kit slots with the meal right after them
   (no gap), on the right, under the HP, MP and XP bars, an inventory box of
   8 slots holding what it carries, its load and its loot together. Under
   them **x/y lb** (what it carries of what it can, each number explained in
   its tooltip) and **Unload all** (C), greyed when it carries nothing.
   Tooltips there open above the box. Select two units, or someone else's:
   no box. The worker card has no Unload any more.
3. **The item menu.** Right click a slot of the unit's inventory: **Use**
   (greyed: "It has no use of its own."), **Unload** (that good to the
   nearest drop-off that takes it, then back to work) and **Drop** (on the
   ground there; nobody picks it up by themselves). Right click a slot of
   the stockpile: a weapon, armour, shield, tool, wand or robe offers Use,
   **Equip** and **Scrap** (greyed with why: no Workshop, none in the
   stock); a food offers Use and **Don't eat** (then **Eat again**).
4. **Equip.** Press **Troop kit** on the debug bar, train a swordsman at
   the Big House and another at the Barracks with a better sword, and raise
   the second one's weapon with **Upgrade equipment**: its old sword goes to
   the stock. Right click that sword in the stockpile, pick **Equip** and
   left click the first swordsman: it says it is off to the nearest main
   base, Storehouse, Barracks or Forge for it (build a Storehouse near it
   and it goes there), walks there and puts it on in a fifth of the time,
   and its old sword goes to the stock in turn. Left
   click a spearman instead: "I cannot use a …"; the second swordsman: "I
   already have better." Right click or Esc cancels the pick.
5. **Drop-offs by themselves.** Send a worker gathering beside the main
   base or a stockpile, or walk a troop with loot within 5 m of the main
   base: what it carries goes into the stock by itself about once a
   second, with no walk and no stop to what it does.
6. **The main base.** Select some workers carrying nothing and right click
   the main base: they go inside, and the main base says "I feel safe in
   here." once for the lot. Workers carrying goods turn them in first (loot
   too); the rest of a mixed selection goes in. Select swordsmen, archers
   and a mage and right click a tier 2 or higher main base: the swordsmen
   go deeper inside, the archers and the mage up on the ramparts (the Big
   House takes everyone inside). Riders and engines do not go in. In the
   main base's panel, the inside row starts with **Eject n** (everyone
   sheltering inside comes out, the ramparts stay), and each portrait has a
   small arrow: ▼ moves one from the ramparts deeper inside, ▲ back up.
7. **Eating.** Let a unit get hurt in a night's fight, select it and
   press **Eat**: it walks to the main base or a storehouse and says "I need
   n food to heal. I'm eating …": 1 food for each quarter of its health it
   lacks, 4 for one near death, and it heals all of it over 10 s. With too
   little food it eats what there is and heals a quarter for each, and a
   remedy or bandage in the stock heals more. At full health Eat is greyed
   ("It is at full health."), and a unit healed on its way does not sit
   down to eat.
8. **The bars.** Select a mage: the bars read HP, MP, then XP.
   Cast Quicken, Fortify or Heal on a unit and select it: each spell's
   picture has a bar that runs down over the spell's time, its tooltip
   saying how many seconds are left.
9. **The obsidian hand-axe.** With one in the stock (the satyrs drop it),
   Equip it on a swordsman of tier 3 or lower: it says "Upgrading to
   obsidian hand-axe.", its weapon slot shows the axe, and it holds the
   obsidian hand-axe's own model with a bronze shortsword's numbers. New armour leaves the axe in hand; a better sword
   sends it back to the stock as an obsidian hand-axe. A swordsman trained
   at tier 4 while one is in the stock comes out holding it. The test is in
   packages/sim/test/patch5-gear.test.ts.

## How a tester checks running, climbing and jumping (Patch 5)

*Patch 5's GP-16 (Run/Walk), GP-17 (no crude stairs), GP-18 (climbing and
higher jumps) and MB-3 (monsters jump 1 m). Picks in
blueprint/patch5-movement-picks.md. The code is
`packages/sim/src/units/moves.ts` (the GAITS table: one row per kind of
unit, in the balance editor under Units, "Running, jumping and climbing"),
`packages/sim/src/nav/grid.ts` (what each mover can jump and climb) and
`packages/sim/src/units/behaviour.ts` (moveSpeed, walkTo, runUnit).*

1. **The tests.** `pnpm test` runs the "moving over the land" tests in
   packages/sim/test/gap.test.ts: a 2 unit rise is a step, 5 units (56 cm)
   a jump, 6 units a climb at 5 times a walk's cost a unit up; a worker
   climbs a 4 m face that a fighter cannot; the peoples' units keep their
   45 cm jump; monsters jump 1 m and a horse 2.5 m; a worker hops onto a
   5 unit platform and climbs a 3 m block at a fifth of its walk, a save
   taken while it climbs back down carries on to the same hash, and a
   warrior never gets onto a 4.5 m one. patch4-dig-turn-in.test.ts runs
   four workers out of a 1 m pit with their loads, cutting no stairs.
2. **Slower walk.** `pnpm dev`, open http://localhost:5173/?seed=1. Units
   on foot walk at 2.55 m/s, 15% slower than before; siege engines go 15%
   slower too. Cavalry is unchanged and stays faster than a runner.
3. **Run/Walk.** Select workers, warriors, mages or crewmen: the card has
   a boot button marked Walk (H). Press it: it shows two boots
   marked Run and they move 40% faster (3.57 m/s), with the run clip.
   Every 50 m each one runs takes 1 food from the stock; a unit set back to
   Walk keeps what it has run towards its next 50 m, so 40 m, Walk, then
   10 m more of Run pays the 1 food. With no food in the stock runners walk
   until there is some. A worker pulling a cart walks. With only cavalry
   selected the button is greyed: horses do not run. The button is the
   last on each card, so every other button keeps its place.
4. **Climbing.** Raise a block with the tester tools, or find a cliff, and
   Move a worker to its top: it walks to the foot of the face, turns to it
   and climbs straight up at a fifth of its walk, then steps onto the top.
   Workers climb faces up to 7 m, troops, mages and crewmen up to 4 m;
   higher faces are walked round. Faces are climbed down the same way.
   Units out by themselves on Hunt or Gather climb where they must too.
   Their reach from home (what they walk in dusk's 40 s)
   counts each metre of height above or below the base as 5 m more, so a
   deep ravine or a tall hill nearby is out of their reach. Units never climb walls or buildings; monsters that climbed walls
   before still do. A climber plays its body's climb clip (Jade's improved
   worker, warrior and mage bodies carry one).
5. **Jumps.** Units on foot jump rises up to 56 cm (5 terrain units; 45 cm
   before) and step up 22 cm. A horse jumps 2.5 m. Every monster jumps at
   least 1 m; the ones that already climbed keep doing so.
6. **Digging out.** Dig a pit about 5 m across and 1 m deep with four
   workers: once its sides are taller than they can jump, workers with
   full loads climb out up the side, take the load home and climb back
   down. No stairs are cut.
7. **Saves.** No save format change; the snapshot version goes to 27 (a
   unit's Run/Walk, the run it owes food for, and the face it climbs).

## How a tester checks digging and tunnels (Patch 5)

*Patch 5's GP-4 (digging a hill away, digging in layers, reach), BL-2
(digging 10 times faster, earth half the weight) and BG-6 (tunnelling into
a cliff). Picks in blueprint/patch5-movement-picks.md. The code is
`packages/sim/src/units/dig.ts` (its numbers are in the balance editor under
World, "Digging") and `packages/client/src/hud/commands.ts` (the dig card,
the box and the press on a face).*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-digging.test.ts:
   a lone worker digs a 4.5 m mound away inside a box drawn 5 m up, never
   letting one column get more than 34 cm below another and never reaching
   more than 2 m over its head (climbing the mound for its top), and leaves
   the ground level with the click;
   a pit goes down the same way, a layer at a time; a wild animal stuck in
   a pit does not hold it up (the ground under it is dug and it drops with
   the floor); four workers tunnel
   8 columns into a 9 m cliff (too tall to climb) from its face, coming
   back round the cliff from their main base behind it, and a worker walks
   to the far end. packages/client/test/m3-controls.test.ts checks the
   box going up past 0 depth and the press on a cliff face that looks
   east or north.
2. **Digging a hill away.** `pnpm dev`, open http://localhost:5173/?seed=1.
   Find a hill (or raise one with the tester tools). Workers, D, and press
   on the ground at the foot of the hill, at the height to dig down to,
   then drag over the hill. The box covers the hill: Deeper and Shallower
   (or the wheel) step the depth 34 cm; at 0 the dig takes everything above
   the ground where the drag started; below 0 the box is drawn upwards from
   there and takes only what is inside it. Steps are 34 cm up to 3 m, then
   1 m up to 12 m, then 2 m, as far as 40.5 m. Left click marks it. The
   workers start on the top of the hill (climbing up to it where they must)
   and take it down a layer at a time across the whole hill.
3. **Digging in layers.** Any dig, a pit too: the workers spread over the
   box and take it down about 34 cm at a time everywhere, instead of
   finishing one column before the next.
4. **Reach.** A worker digs what is up to 2 m over its head (3.8 m above
   its feet), from at most 1.8 m to the side, as before; higher up it
   climbs to get at it.
5. **Faster digging, lighter earth.** A bite of soil takes a tenth of the
   time it did; a worker's 25 lb load holds 10 earth (5 before), a hand
   cart 100.
6. **Tunnelling into a cliff.** Workers, D, then press on the side of a
   cliff, whichever way it faces: the tunnel's start is marked in the cliff
   (it was marked on the ground in front of faces looking east or south).
   Click on the top of the cliff further in: the tunnel runs into the
   cliff, level with the ground in front. Two workers dig the face (it is
   two columns wide) while the rest wait by it; they dig from the face
   inwards, even when the base is behind the cliff. A unit standing on the
   cliff above no longer holds the diggers up. On a cliff too tall to
   climb, Move a unit to a spot over the tunnel's far end: it walks in
   along the tunnel's floor.
7. **Saves.** No save format change; the snapshot version goes to 30 (a
   dig order's layer and missed columns, and digs drawn upwards).

## How a tester checks pathing and stuck units (Patch 5)

*Patch 5's GP-22 (pathing), with the 3 m boulders World generation added.
Picks in blueprint/patch5-movement-picks.md. The code is
`packages/sim/src/nav/regions.ts` (each 4 by 4 column tile split into the
parts a unit can walk between), `packages/sim/src/nav/path.ts` (the search
over those parts, then over the columns along them), `packages/sim/src/units/stuck.ts`
(the stuck line), `packages/sim/src/nav/grid.ts` (the boulders) and
`packages/client/src/hud/shell.ts` (the stuck unit's pings).*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-pathing.test.ts:
   seven units leave a walled village through its gate, or through a gap in
   its wall, and cross a village crowded with storehouses; they walk round
   a 72 m stone ridge too high to climb and back out of a U-shaped trap; go
   150 m in legs; and take a tunnel through a 180 m ridge rather than the
   long way round. A boulder raises the walk map 3 m on its footprint:
   walkers go round, a worker or a fighter can climb it, a horse cannot
   jump onto it, and mined away it is ground again. A unit walled in says
   where it is stuck and why, once a minute at most; one shut in by 9 m of
   stone, or sent into a walled yard, says so too.
2. **Leaving a village.** `pnpm dev`, open http://localhost:5173/?seed=1.
   Wall the main base in with a gate (or leave a gap), select units inside
   and Move them to a spot outside: they head for the gate or the gap and
   out, without catching on the wall. Crowd buildings close together:
   units thread between them.
3. **Long trips round obstacles.** Move a unit 200 m or more over rough
   land, past ridges, lakes and cliffs: it walks round them. It plans about
   50 m at a time and the next stretch as it gets there, so it never stands
   still to think. A worker or a fighter climbs a face in its way when that
   is shorter than going round. A large group sent far no longer holds the
   game up (20 units sent 300 m had stalled it most of a second).
4. **Tunnels.** With a tunnel through a cliff (digging and tunnels, above),
   units sent to the far side take it when it is the shorter way.
5. **Boulders.** The 3 m boulders now stand in the way: units walk round
   them; a worker or a fighter may climb onto one; horses, the Dreadnought,
   engines and carts never do. Miners stand round its foot. Mined away,
   the ground there is walkable again.
6. **Stuck units.** Wall a unit in on every side (or leave it in a pit too
   deep to climb out of) and Move it out: it says, in a bubble and as an
   urgent line in the message panel, "I'm stuck to the north-east, about
   40 m from our main base: there are walls and buildings all round me, and
   I can't figure out how to get out." The reason is the commonest thing
   round it: walls and buildings, faces of land and rock too high for it to
   climb, drops too deep for it to climb down, deep water, or slopes too
   steep for wheels. Sent into a walled yard it cannot get into, a unit
   that stops more than 5 m short says "... there are walls and buildings
   all round where you sent me, and I can't figure out a way there." The
   minimap pings the unit every 5 s until the camera shows it (or it gets
   5 m clear, goes inside, or dies); other players see nothing. A unit says
   it at most once a minute, and the order's own "I cannot reach that."
   stays unsaid then.
7. **Saves.** No save format change; the snapshot version goes to 31 (when
   a stuck unit may next say so).

## How a tester checks the Tavern and the Dreadnought (Patch 5)

*Jade's Patch 5, GP-19 to GP-21: the Tavern, which turns food into silver
while it is open for business, and the Dreadnought it hires. Picks in
blueprint/patch5-tavern-picks.md. The numbers are rows: `TAVERN` in
`packages/sim/src/buildings/tavern.ts`, `DREADNOUGHT` in
`packages/sim/src/units/dreadnought.ts`, his mace and plate in
`DREADNOUGHT_KIT` (`packages/sim/src/units/kits.ts`), his walk, jump, climb
and run food in his row of `GAITS` (`packages/sim/src/units/moves.ts`) and
the Tavern's cost in `packages/sim/src/buildings/data.ts`; the balance
editor shows them under Buildings, Training and Units.*

1. **The tests.** `npx vitest run packages/sim/test/patch5-tavern.test.ts`:
   the till fills to 1.055 silver after 19 foods, Withdraw funds takes the
   whole ingot and leaves the fraction, a closed Tavern serves nothing; the
   price takes 15 gold, 105 silver or a mix (a gold is worth 7 silver, a
   little over is fine, under never); the main base tier caps him; he
   smashes, then sweeps, by turns; he walks a fifth slower than a warrior,
   never climbs, jumps 1.5 m and pays double for running.
2. **Building it.** `pnpm dev`, open http://localhost:5173/?seed=1. The
   build menu has **Tavern** after the Mineshaft (key V; with the Fishing
   dock gone it still fits a phone-size card). Without a tier 3 main base it
   is greyed and says so. It costs 80 lumber, 60 stone, 5 leather and a
   gold ingot, or 7 silver ingots when there is no gold. For a quick look,
   type M N B V C X Z and press **Godmode**: it builds at once.
3. **Open for business.** Select the finished Tavern: the card has **Open
   for business** (F), **Withdraw funds** (I) and **Hire Dreadnought** (H).
   Press F: the button lights, a food goes every 3 s, and the panel shows
   the till to 3 decimals (0.055 silver a food), a bar to the next ingot,
   and the silver made and food served in all. A silver bar in the stack
   over the Tavern fills the same way (a Dreadnought being hired shows as
   the gold training bar). Press F again: it closes, and its silver bar goes.
4. **Withdraw funds.** Greyed until the till holds a whole ingot. Press it
   at 1.055: one silver goes into the stock and 0.055 stays. With no food
   to spare the Tavern says so once and waits.
5. **The look.** At dusk or night with the Tavern open, its windows glow
   and flicker, a figure crosses a window now and then, the lantern by the
   door lights the ground, and the chimney smokes well. Closed, the windows
   and lantern go dark and the chimney gives a thin wisp.
6. **Hiring.** At a tier 3 main base, press **Hire Dreadnought**: its
   tooltip is his description and price, and the button wears his own
   picture. The window shows his portrait by the price and lists 100 food (not
   negotiable) and gold and silver boxes with your stock; type or use − and
   + in either, and the other fills to the price. **All gold** and **All
   silver** pay all one way. The worth line warns when the mix is under the
   price or more than 6 silver over, and **Hire** waits until it is right.
   He takes 60 s at the Tavern, 8 supply, and walks out with a line.
7. **The cap.** A tier 3 main base allows 1 alive (the one being hired
   counts), a tier 4 main base 3; the button says which.
8. **The Dreadnought.** He is a giant in plate with a spiked mace, 200
   health, no shield and no ranks. His card has Attack, Patrol, Move and
   Eat (no Hunt, no Equip); his panel shows the mace and plate and says he
   keeps them. He walks a fifth slower than the others and eats 3 food a
   meal. In a fight he smashes one foe for 140, then sweeps every foe in
   front of him for 70, every 3 s by turns; a pale crescent flashes where
   the sweep lands. Now and then he roars his war cry with a remark.
   Godmode's grid has him too.
9. **Getting about.** His card's last button is **Walk** (H): pressed, he
   runs, 40% faster than his walk, paying 2 food for every 50 m (others pay
   1). Send him at a rise of about 1.4 m: he jumps it, with his jump clip.
   Send him at a cliff a warrior would climb: he walks round, or stops
   where there is no way round. He never climbs.
10. **Saves and checks.** No snapshot change: the Tavern's state is kept in
    the building record as it was. The Tavern's kind id is 24 (the earth
    rampart took 23).
## How a tester checks the woodsman, fishing, farms and the Barn (Patch 5)

*Patch 5's WD-1 to WD-7 (the woodsman), FR-1 and FR-2 (fishing), CT-1's
Fish button, GP-24 (the night retreat), GP-30 to GP-32 and QoL 2 (wild
food), GP-35 to GP-38 (taming, the Barn, bonemeal and Fertilize), UI-17
(Boost remaining), BL-8, BL-10, VX-2, VX-3 and QoL 3. Picks in
blueprint/patch5-food-picks.md. The code is
`packages/sim/src/units/woodsman.ts` and `woods.ts` (the woodsman and his
woods order), `world/world.ts` `spread` (mushrooms coming back),
`buildings/farm-boost.ts` (Fertilize), `animals/barn.ts` and
`units/barn-hand.ts` (the Barn), `units/field.ts` (taming, and hunters
picking berries),
`animals/animals.ts` (following, grazing, breeding),
`units/night-work.ts` and `forage.ts` (the night retreat); on the screen
`hud/woods.ts`, `world/fish-view.ts` and `world/building-glow.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-woodsman.test.ts
   (training, damage, no dock, fishing by himself and a picked stretch, the
   save round trip, the food line's colours), packages/sim/test/patch5-forage.test.ts
   (Forage, mushrooms coming back, hunters picking berries),
   packages/client/test/patch5-woodsman.test.ts (his card, keys and orders)
   and the farm and Barn tests in farms.test.ts.
2. **Training.** `pnpm dev`, open http://localhost:5173/?seed=2. Build a
   Scholar's Lodge: its card has Woodsman (W) for 32 food, 4 sticks, 1
   leather (or 1 hides) and 4 flax, in 50 s. He comes out with a wooden
   spear in his hand and no armour. The Woodsman button, his place in the
   queue and his picture in the selection grid are his own portrait, a
   woodsman's head and shoulders, not the spearman's.
3. **His card.** Attack (A), Move (M), Fish (I), Forage (G), Eat (F),
   Upgrade equipment (Q) and Run or Walk (H). F2 does not select him.
   Upgrade equipment offers only long weapons, and only at a main base; he
   hits 2 less than a warrior with the same weapon and fights back when
   struck. He climbs faces up to 7 m, as workers do.
4. **Fishing.** There is no Fishing dock in the build menu, and workers sent
   to fish are told "Only woodsmen fish. Train them at the Scholar's Lodge."
   Near water, fish swim in the stretches (trout, salmon, giant catfish),
   up to 8 drawn per stretch, fewer as it is fished down. Right click Fish:
   the woodsman walks to the nearest stretch with fish to spare, puts his
   spear on his back, takes out his rod, casts and waits; every 12 s a fish
   comes up on the line in an arc to him and goes in his bag. He leaves each
   stretch half its fish so it breeds back, takes his bag home when it
   cannot take another fish, and goes back out. Left click Fish, then a
   stretch (or right click a stretch with him selected): he fishes that one
   down to its last pair, then goes on by himself. Fish and Forage can both
   be on; each button shows its auto mark while on. At dusk he hands in his
   catch and waits by the main base until day.
5. **Foraging.** Right click Forage (its picture is black berries): the
   woodsman goes to the nearest wild food ready to pick, a berry bush
   (black berries, raspberries, blueberries) or edible mushrooms, picks it
   (reaching up at a bush, stooping for mushrooms) and takes his bag home
   when it is full. A bush stays where it is, its berries back in 2
   minutes. A picked mushroom is gone, and another comes up within 3 m of
   it 1 to 3.5 minutes later, so mushrooms wander over time; select one and
   the panel says so. Left click Forage, then a bush: he picks that one
   first. Bog pears, hawthorne fruit and Moon Roses come with the stone
   circles.
6. **Hunters and berries.** Select a warrior near a berry bush and press
   Hunt (N) twice: it picks the bush first (any within 20 m), the bush left
   standing, then goes after game. Hunters take their bags home only when
   they are full, or when the next animal's meat would not fit.
7. **His food line.** Select one woodsman: under his name, "Food in 24,
   eaten 2.5 (last 10 min)" (or his life, if shorter), red while he eats
   more than he brings in, green once he brings in more than 3 food over
   every 3 meals, yellow between.
8. **Fertilize.** At the Workshop, Bonemeal (N) grinds bone into bonemeal:
   click makes one, Shift + click ten, and a right click offers Make 1,
   Make 10 or Make all, each order one stack in the queue counting down.
   Bonemeal's icon is a tied sack with a small bone leaning on it, and a
   worker carrying bonemeal holds that sack. On a farm's
   card, Fertilize (F) costs 2 bonemeal and makes the farm grow 30% more for
   2 minutes; pressed again, more boosts wait behind it (up to 10). Right
   click turns Auto fertilize on or off. Beside the farm's workers,
   "Boost remaining:" has a bar that empties as the boost runs (seconds in
   its tooltip, boosts waiting, and a Sweet Hawthorne's +35% when there is
   one), mirrored over the farm. A farmer-day brings in 10 farm fare (was 8).
9. **The Barn.** A Barn works only with its one barn hand, in a farmer's
   straw hat. By day he walks among the animals outside; at night he is in
   the loft. Ordering him away asks "Are you sure you want me to leave the
   animals unattended?" first.
   Its animals graze by day, which saves a quarter of their feed, and eat
   plant food (farm fare, berries or mushrooms) at nightfall.
10. **Taming.** With a worker selected, hover a wild chicken or cow: the
    tooltip says to right click to tame it and what it costs (3 food for a
    chicken up to 20 for cattle and oxen, in plant food from the stock). The
    worker feeds it at 2 food a second, a bar over the animal filling, then
    it follows him to within 5 m of a Barn with room.
11. **Breeding.** Prey animals breed half as often again as before, seek a
    mate, and when they do, each shows a heart and plays its mating clip.
12. **The night retreat.** At dusk, workers out gathering by themselves go
    in to a farm or a Barn with animals that has room first, then the main
    base, an empty Barn last. Only a worker within 5 m of a main base, its
    node too, with a troop within 10 m, asks to work on through the night,
    and it gathers only by the base. A worker you set gathering in the dark
    works on all that night.
13. **Lights.** Farms and Barns with people in them have lit windows at
    night, main bases are lit every night, an occupied farm's chimney
    smokes at night, and the Big House campfire burns with flames and smoke.
14. **Saves.** No save format change; the snapshot version goes to 31.

## How a tester checks the stone circles and the world look (Patch 5)

Stone circles stand in the Fringe, the Deepwoods and the Barrens (0 to 4 in
each), the land and water are drawn with the art set's pixel tiles, every
world prop with its own model, and the day's light follows the art set's
lighting sheet. Start a game with `?seed=3` (the same world each time).

1. **Find a circle.** Open the debugger and press **Stone circle**: the
   camera goes to the nearest circle and its land is revealed; press it
   again there for the next. Seed 3 has nine: Lunar, Silenus, Boneyard and
   plain circles. Each is one, two or three rings of trilithons, some
   standing (intact or worn), some fallen, with bluestone rubble, one to
   three bluestone chests and, on a Lunar or Boneyard circle, an altar with
   its idol. A Lunar circle is mossy, with Moon Rose bushes and Sweet
   Hawthornes; a Boneyard circle has bone piles, dead trees and thorns.
2. **Pieces.** Hover any piece for its outline and name (a trilithon says
   its state and its bluestone). Workers with iron tools or better quarry
   trilithons and rubble for bluestone; bone piles give bone.
3. **A chest.** Select a unit and right click a chest: the unit walks over
   and opens it, and the chest panel lists the five spaces with Take and
   Take everything. The chest stays open. Esc closes the panel.
4. **The Goddess.** With a unit selected, right click a Lunar altar: the
   altar panel asks for 5 gold (or 35 silver) and 3 Moon Roses (Leave gifts,
   greyed with the reason when you lack them). Leaving them blesses you: a
   Bright Night the next night and every tenth after. **Take the idol** asks
   Yes or No first; once taken, the idol leaves the altar and the circle's
   own Bright Nights stop.
5. **Bright Night.** The night turns white and bright, the clock says Bright
   Night, the moon by the clock is full and the far land glows pale; near a
   Lunar circle the air is faintly rosy and the Moon Roses open. On any
   bright night (your Bright Night, or one night in three near a Lunar circle
   with its idol on the altar) a worker right clicked onto an open bush picks
   it, and a woodsman set to Forage with open Moon Roses in his reach goes
   out for them and comes home when none are left.
6. **Sweet Hawthorne.** Right click an Ancient Seed in the stock and pick
   **Plant seed**, then left click grass or dirt: the selected workers (or
   the nearest worker) plant it there; it grows over 5 nights. The same
   menu plays the Pan Flute, uses the Moon Goddess idol and, on a mage's own
   inventory, drinks enchanted wine for 50 mana. Farms and animals within 30 m do 35% better (the selection
   panel says so). Right click a tree with no fruit with a worker to cut it
   down for 15 hardwood lumber.
7. **The land.** Grass, soil, sand, clay, stone and ore seams have pixel
   tiles; the Heartland's grass is lusher than the Fringe's, the Deepwoods'
   floor is brown leaf litter, the Barrens are ochre and red rock, the
   Deadlands ash and black rock whose cracks glow orange. Water is animated:
   shallow water is see-through blue-green, deep water (where units cannot
   wade) a solid darker blue, bog water brown-green, a stream's shallows
   rippling along, with foam along the shore. Your buildings stand on
   trodden dirt that runs about a metre out round them, its edge blending
   into the grass; a Farm's plot is tilled in furrows, darker and wet while
   bonemeal works it or just after each harvest. Before: flat colours with
   noise.
8. **Props.** Trees, saplings, seeds, berry bushes and the bog pear bush,
   mushrooms, flax, rocks, ore nodes, boulders, hot springs and carcasses
   are each drawn with their own model (a fish stretch shows its live fish);
   a picked bush shows bare, and a rock half mined shows worn down. A moment of coloured cubes may show
   while a model loads.
9. **The day.** Press **Speed** to watch a day turn: warm white light by
   day, deep orange at dusk, blue moonlight at night, pink-gold at dawn,
   the far land hazing over at dusk and night. The little sky beside the
   clock shows the sun crossing from dawn to dusk, the moon at night, the
   stars and clouds. **Fog** brings a fog night: fog drifts low over the
   ground and the lights shrink to small orange halos.
10. **Glitter.** Gold and silver on the ground and in ore nodes glitter in
    their colour.

## How a tester checks mages and spells (Patch 5)

*Patch 5's mages (MB-14 to MB-25, VX-5, VX-8 to VX-10, and three demon horns
for a mana crystal): autocast on a right click, Energy dart for the support
mage, no melee for mages, a cast order for every selected mage, bolts that
arc only so high, Area blast that lands on a unit or the ground and hurts
everything that is not a player's, the training bar at the Magi Sanctum,
the cooldown clock, and glowing spells. Picks in
blueprint/patch5-mages-picks.md. The rules are `packages/sim/src/magic/`; the
effects are `packages/client/src/world/spell-fx.ts`.*

1. **The tests.** `pnpm test` runs packages/sim/test/patch5-mages.test.ts:
   the autocast a mage starts with (a battle mage Arcane bolt and
   Counterspell, a support mage Heal and Energy dart); a battle mage's attack
   spells taking turns and the last one staying on; a support mage with
   several or none, kept in a save; a fresh support mage darting a rat from
   12 m; a mage with no attack spell on autocast, or no mana, never hitting
   in melee; two battle mages both bolting on one cast order; Area blast cast
   on a monster hurting it and a wild deer beside it but not the player's
   warrior; and rank training paid with 6 demon horns, with the training
   bar's numbers. packages/client/test/m6-controls.test.ts checks the card:
   Energy dart beside Heal, the right click, the autocast ring and the
   cooldown.
2. **The card.** `pnpm dev`, open http://localhost:5173/?seed=1, and make
   mages with the tester tools (**Mage kit**, then the Sanctum). Select a
   support mage: twelve buttons, Energy dart (D) next to Heal. Heal and
   Energy dart have a ring of violet and white light running round them:
   they are on autocast. Right click Quicken: it gets the ring too; right
   click it again: off. On a phone, hold the button and let go. Select a
   battle mage: Arcane bolt and Counterspell ringed; right click Beam (rank 2)
   and the ring moves from Arcane bolt to Beam; right click Beam again: "A
   battle mage always keeps one spell on autocast."
3. **The cooldown clock.** Cast a spell (left click it, then a target): the
   button goes dark and a clock hand sweeps round from twelve, taking the
   dark off until it is ready again.
4. **Fighting.** Send a fresh support mage at a monster with Attack: she
   darts it from range, a little arrow of gold light. Take Energy dart off
   autocast and Attack again: "A support mage has no attack spell on
   autocast. Right-click one of her spells to set one." A mage out of mana
   never swings her wand. With several mages selected, a spell clicked on a
   target is cast by every one that knows it and has the mana.
5. **By herself.** A support mage heals your hurt units (not one missing
   only a little), and an ally's while you share control; buffs on autocast
   go out only in a fight, on the unit most worth keeping that is in the
   most danger.
6. **Area blast.** A rank 4 battle mage: click Area blast, then a monster,
   or the ground. On a monster it lands where the monster is when it goes
   off. A ring of violet force runs out to 4 m with a flash and a burst of
   sparks; every monster, wild animal and people's unit in it is hurt
   (casting on peoples at peace asks first, as Attack does); your units and
   your allies' are not.
7. **Bolts.** Arcane bolt, Energy dart and Fireball arc over a low wall in
   the way, never climbing much more than a third of the distance; a wall
   too high for that leaves the mage walking to a clear shot. Each flies as
   its own model with a glowing trail and bursts of light where it ends; the
   goblin mage's spark, the mana wraith's bolt and the flamecaller's
   hellfire fly as their own models too. A held Beam is a stream of light
   from the wand's tip, and while any spell is being cast its light gathers
   at the tip of her wand.
8. **Training.** Send a mage to rank training at a Magi Sanctum (U) and
   select the Sanctum: she shows under "Training 1" on a card the size of the
   queue's, with her bar filling, and a gold bar fills in the Sanctum's bar
   stack over it. Rank training takes 3 demon horns for each
   mana crystal it needs, horns first. Every rank's mana bar is 10 lower.

## License

Copyright 2026 Jade Fairbanks. All rights reserved; see [LICENSE](LICENSE).
