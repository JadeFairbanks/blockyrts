# Survive and Conquer

A co-op browser RTS survival game: build by day, hold the walls by night, and
see how many nights you last. The design spec is [docs/blueprint.md](docs/blueprint.md),
a copy of the canonical blueprint document.

The build order's milestones 0 to 11 are in: the deterministic sim and its
tools, the generated world with the camera, HUD and minimap, workers and
building, warriors, combat and the nights, the economy (research, smelting,
food, animals, mining), the threats beyond the nights (lairs, blood and fog
nights, tribes, goblin villages, creatures), the mages with their ten
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
| `pnpm --filter @blockyrts/tools balance` | The balance harness: pacing, supply at night 110 and the wave checks (`--pacing`, `--nights`, `--seeds`, `--blood`, `--csv`; docs/balance-pass.md) |
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
   prints `final step 10000 hash b96aebc6`. Run it again: the same hash. (The
   M0, M1, M2 and M4 scripts run with `"peaceful": true`, no night mobs, so they
   keep checking the world and the economy; M3's script has the monsters.)
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `cf52a6d8`
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
   with the wheel or Page Up and Page Down; Home resets the zoom. Right-click
   to walk your units out: the land they see turns from black to colour,
   and stays grey once they have left. The land round your buildings stays
   in colour (see "How a tester checks shared vision" below).
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
   `cf52a6d8` at step 40, with two players `504e575d`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash 42e2ef70`: two players dig trenches from a
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
   up: it sends everyone to shelter in the Big House or a farm, and at day
   they come out and carry on. Lights more than 40 m from the main base are
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
   prints `final step 10000 hash 9cc5fe20`: workers chop and quarry, the Big
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
3. **Walls.** Workers, B then G (Walls): softwood, hardwood and stone walls,
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
5. **Equipment.** Select the Big House: K opens the crafting menu on the grid
   keys (K then A makes a hardwood club); F refurbishes items back into
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
   step down to 3 m. Left click confirms. Marking a slope that rises more than
   about 2 m starts a tunnel instead (+ and - then set its height); D again,
   or a click on a cliff face, digs a level tunnel in a chain of stretches
   (see wall and tunnel chains below). Digging
   puts Earth (or stone, flint, sand...) in the pool. B, Z (Earthworks) heaps
   an earth bank, a ramp (drag from the bottom to the top) or fill from that
   Earth. Marked areas stay outlined until done; right-click one with workers
   to help. Zombies walk round a trench they cannot climb out of.
8. **Losing.** When every worker is dead and no main base or farm stands, the
   game is over and the screen shows the nights survived.
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m3-nights.json --quiet`
   prints `final step 10000 hash 67be25f9`: two workers raise a gate and a
   softwood wall ring while two chop and then join them; the Big House
   trains a long-melee spearman and the three starting warriors walk to it
   to upgrade their cudgels to flint hand-axes (Upgrade Weapon, milestone
   11); they hold inside the gate through night 0 while a debug skeleton
   archer and bomber come at the camp (the spearman comes through, the
   axemen fall and some columns are broken, but the Big House and all four
   workers come through), then at dawn the workers dig a trench and heap an
   earth bank from its Earth.
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
   prints `final step 10000 hash 92e79419`: two workers pick flint while two
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
   and cap after it; a fifth of the night coming out of a lair's mouth 20 s
   after nightfall; a barrow attacked by day waking its sleepers, and when
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
   per 15 nights alive per player. A lair shows on the minimap as a red
   square once one of your units has seen it (rifts from 120 m at night).
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
   prints `final step 10000 hash 01e899e9`: the debug tools put a Barracks
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
   prints `final step 10000 hash f5ed6eeb`: the debug tools put a Magi
   Sanctum by the Big House, the mage kit in the stock and a troop kit 20 m
   west, and two starting warriors upgrade to carbon steel and steel (Max);
   the Sanctum trains a support and a battle mage and researches Hexcraft,
   and both train to Acolyte; in night 0 the support mage quickens the
   warrior, wards the crowd and heals while the battle mage beams and bolts
   the monsters; at dawn Mage XP takes both to Adept Acolyte and then to
   Mage, paying 2 mana crystals each (milestone 11: no rank wands); at a
   goblin village 80 m north the warriors and the battle mage attack while
   the support mage follows, Rally, Fireball, Fortify and Area blast are
   cast, the battle mage counters the goblin mage, and all four walk home.
   All ten spells land.
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
    prints `final step 10000 hash 24fd6d98`: the debug tools put a Halfling
    village 40 m north, a mercenary camp 15 m east, the trade kit in the
    pool and a troop kit 20 m west, and send an Elf caravan; the Barracks
    trains a ranger with wrought-iron arrowheads and two starting warriors
    upgrade to the best; two mercenaries are hired; the third warrior trades
    3 Copper Tokens to the village for 5 smoked fish, then a Bronze Charm to
    the caravan; the workers shelter in the Big House, war is declared on
    the village and the troops and mercenaries take it (two of its spearmen
    ride out on war oxen with an archer behind each, and most of the troops
    and a mercenary fall), the workers come out, and its plunder comes in
    (livestock, bread and wrought iron); the mercenaries and the caravan
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
   prints `final step 10000 hash 348d76e0`. The script plays by Patch 2's
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
   only three damaged huts and one goblin are left; a horse hauls the bronze
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
   `--seeds`, `--blood`, `--csv`). Nights 0 to 80 hold, night 110 falls. See
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
   prints `final step 10000 hash 348d76e0`, as in milestone 8 above.

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

1. **A wall chain.** Select workers, B, G and a wall. Click: one wall is
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
   prints `final step 10000 hash 990993ff`: the four workers are given a
   chain of softwood walls a stretch at a time from (0, 20), east 9, south 5,
   south-west 3, west 6 and north 8 back to the first wall (34 walls, a
   closed ring, from the 40 softwood lumber the camp starts with); a second
   chain south of it, started with Shift, runs over a plant (skipped) and has
   lumber for 6 of its 9 walls, so 6 are planned from its start. All 40
   stand by step 1500.
7. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/chain-tunnel.json --quiet`
   prints `final step 10000 hash dbd5b96b`: the debug tools heap a soil hill
   south-east of the camp and the four workers dig a tunnel chain from its
   west face: east 3 columns, south 3, south-east 2 and east 4, out of its
   east side, 480 bites of soil by step 7300; then worker 1 walks to a point
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
   (B, W) and right-click it with one worker. Select it: under its health and
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
   their bags are half full. They never go farther than they could walk back
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
   night; at daybreak they go out again.
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
   4 rows tall and 10 columns wide here; the usual 5 x 3 block with the grid
   keys is its bottom right corner. At 1280 x 720 the card has 5 columns; at
   1024 x 768 the whole HUD is drawn smaller and nothing is cut off.
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
   reach, so not on the town: 1 or 2 of a kind on each 25 m patch, of the
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
   prints `final step 10000 hash c31d6a54`: the debug tools explore 200 m round the
   camp, and the three warriors walk 90 m east at dusk, into the Fringe
   since Jade's mini patch, and stand there through night 0. About 27
   monsters are out at nightfall, round them and round the workers at the
   camp, up to 72 at once later and 115 over the night; one of them goes for
   a unit, and night 0's monsters marching on the camp fall on the warriors
   and kill one; the other two end the night at about three quarters and
   full health. They walk home at step 8200.
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
3. **Lights.** Select a worker: the Lights slot (B then V) has the torch
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
   their kit first. Nothing in the stock ever goes below zero.
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
   only on the first day, first come first served three ways) and the held
   bubbles in `packages/client/test/question-bubbles.test.ts`.

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
   the workers and press B: Big House (Q), Farm (W), Barn (E), Storehouse
   (R), Fishing dock (T), Workshop (A), Forge (S), Artillery workshop (D),
   Barracks (F), Magi Sanctum (G), Scholar's Lodge (Z), Mineshaft (X),
   Defences (C) and Lights (V); B is Back. The worker card has one Build
   button where Basic and Advanced were.
2. **Defences and Lights.** C opens Defences: the softwood, hardwood and
   stone walls, the gates each way, the towers, then the earthworks. It is
   17 choices, so the last slot reads "More 1/2" (V) and shows the rest, as
   the K menu pages. V in the build menu opens Lights: the torch post and
   the bonfire.
3. **The Farm and the Barn.** Build a Farm: two farmers grow farm fare ("A
   hearty medley of vegetables"), 8 a farmer-day, and it gives 4 supply. The
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
   them, still squares. Press B: one build menu, the fourteen buildings on
   the grid keys, with walls, gates, towers and earthworks under Defences and
   the torch post and bonfire under Lights; B is Back.
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
3. **One unit.** Click a warrior: "Club fighter", a gold chevron after it,
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
   weapon first." Click it: one queues, shown in the title row; Shift +
   click: five.
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
   show the first one's kits and a tile per Barracks in the title row with
   its queue count. The padlock locks both; with one locked, it opens it.
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

## How a tester checks the balance editor

The editor reads the sim's own data modules when it is built, so what it shows
is what the game runs on. Its build is one self-contained HTML file.

1. `pnpm balance:dev` and open http://localhost:5175 (or
   `pnpm --filter @blockyrts/balance build` and open
   `packages/balance/dist/index.html` straight from disk). The left menu lists
   14 groups, from Buildings and levels to Pacing (Mages and spells among them), plus the blueprint's tables
   read only; the header names the commit the tables came from.
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

## License

Copyright 2026 Jade Fairbanks. All rights reserved; see [LICENSE](LICENSE).
