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
| `pnpm --filter @blockyrts/client art` | Renders the main menu's battle and the lobby's map from the game's models and world into `packages/client/src/ui/art/` (`battle` or `map` for one; needs `models:build` first) |
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
| `packages/tools` | Headless runner, desync tool, cross-browser test, the headless two-player network test, map viewer, model converter, balance harness, sim speed check |
| `packages/protocol` | Relay message codecs, the lockstep scheduler, the save file container and the HTTP API shapes; see its README |
| `packages/server` | Accounts and save API, lobby and lockstep relay in one Node process; see its README for settings |
| `packages/audio` | Every sound and the music, synthesised in code; the Web Audio engine and an audition page (`pnpm audio:dev`) |
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
   prints `final step 10000 hash 5d423a09`. Run it again: the same hash. (The
   M0, M1, M2 and M4 scripts run with `"peaceful": true`, no night mobs, so they
   keep checking the world and the economy; M3's script has the monsters.)
2. `pnpm test` runs the same seed and script in Node twice and in headless
   Chromium, Firefox and WebKit, and fails if any of the 500 hashes differ.
   CI runs this on every push; the log prints each engine's final hash.
3. In a real Chrome or Firefox: `pnpm dev`, open http://localhost:5173/?seed=1
   and watch the step counter and the hash (taken every 20 steps). Until you
   give an order, every machine and browser shows the same hash at the same
   step as the headless runner with no script: for seed 1 that is `2bef3041`
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
   and stays grey once they have left. The land round your buildings stays
   in colour (see "How a tester checks shared vision" below).
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
   `2bef3041` at step 40, with two players `2cc48c2e`. The land matches too.
5. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m1-world.json --quiet`
   prints `final step 10000 hash 4d77e6b8`: two players dig trenches from a
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
   centres on the Big House; F4 jumps to the latest alert (Space until patch
   notes 1, when Space became Centre on the selection). Every hotkey
   can be rebound in the menu (F10, Hotkeys).
9. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m2-camp.json --quiet`
   prints `final step 10000 hash 170958b8`: workers chop and quarry, the Big
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
   prints `final step 10000 hash ca960742`: two workers raise a gate and a
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
   prints `final step 10000 hash 19575f09`: two workers pick flint while two
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
   broken leaving a ruin, a hoard in the pool and 20 XP for the warriors near
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
   read "The barrow is cleared. Its hoard: …", the hoard goes into your pool,
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
   the way (a worker on its refuel round relights them for nothing), hexes a
   unit to stumble (slowed) and tosses sparks that leave wood smouldering.
   At peace a village rebuilds a hut every 5 days. Workers who break down a
   hut take 5 hardwood sticks and 2 hides from it.
9. **Territorial creatures.** Giant beetles (Fringe) and giant hornet nests
   (Deepwoods) see off what comes within 8 m; vipers and giant scorpions
   (Barrens) strike what steps close and poison it; a griffin (Barrens and
   Deadlands) or a minotaur (Deadlands), once disturbed, hunts its quarry
   down.
10. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m5-threats.json --quiet`
   prints `final step 10000 hash 761676b7`: the debug tools put a Barracks
   and a level 4 forge 44 m north with the stock for every tier (Troop kit),
   a barrow 60 m east of the Big House and a cave mouth 60 m west; the
   Barracks trains a crossbow ranger while the three starting warriors
   press Upgrade Weapon Max and Upgrade Armour Max and come back in carbon
   steel and steel; the four wake the barrow's dwellers, break it, take its
   hoard and earn XP; fog rolls in for night 0 and they guard the Big House;
   at dawn a goblin village goes up 80 m north, a gnoll band to the
   south-east and a giant beetle to the north-west; they attack the village,
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
   prints `final step 10000 hash 6ffbcd3f`: the debug tools put a Magi
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
    prints `final step 10000 hash cd2f7096`: the debug tools put a Halfling
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
   prints `final step 10000 hash 51915831`: the debug tools make the Big
   House a Citadel, put a Stables 20 m east, a siege kit 20 m west, a goblin
   village 80 m north and a troop kit to the south-east; the Big House
   trains a long-melee spearman and the Stables a bronze cavalry rider, who
   uses up a horse from its stalls and comes out mounted (milestone 11); an
   ox hauls the catapult 40 m north and a horse hauls the bronze cannon up
   into a Citadel port; at dusk the gun kit trains the warriors, two crew
   the cannon in its port and two crew the catapult, which breaks the goblin
   huts until the village goes to war, and its crew fight off the goblins
   that reach it; through night 0 the port cannon fires at the night mobs,
   and the rider gallops at them and his first blow on a zombie is a charge
   that throws it back; at dawn he rides home to the Stables.
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
   Play alone starts a game with first-day hints (Settings > Help turns them
   off). `?seed=N` (and `&players=K`) still skips the menu for testers.
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
   Select a warrior: the panel reads "Close melee (Recruit)", its cudgel, no
   armour, weapon tier 1 and armour tier 0.
3. **The troop panel.** On the debug bar press **Troop kit**: a Barracks and
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
   prints `final step 10000 hash 51915831`, as in milestone 8 above.

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
buildings.* The step-40 hashes (`2bef3041`, two players `2cc48c2e`) and the
M1, M6 and M8 scripts' hashes changed with this patch: the Big House and every
other building now explore the land round them, and the players keep one
explored picture. The M0, M2, M3, M4, M5 and M7 scripts keep their hashes,
because their units had already walked over all their buildings see. Each
script still plays out as its description says. Saves from before this patch
still load, with every player's explored land joined into one.

1. `pnpm test` runs `packages/sim/test/vision.test.ts`: a lone building far
   from any unit explores and sees out to its sight from its walls; the sight
   table (main base and towers 20 m, braziers 14 m, every other building
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
   colour, in sight, not grey. Towers see 20 m and braziers 14 m; on a fog
   night every building sees half as far. The Big House and towers also mark
   lairs and goblin villages they see on the minimap.
3. **Two players.** Open `?seed=1&players=2`: both pockets are in colour
   from the start, and panning to the second pocket shows its units' and
   buildings' sight as in sight. On two machines in a lobby, what one player's
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
   prints `final step 10000 hash 6d357b86`: the four workers are given a
   chain of softwood walls a stretch at a time from (0, 20), east 9, south 5,
   south-west 3, west 6 and north 8 back to the first wall (34 walls, a
   closed ring, from the 40 softwood lumber the camp starts with); a second
   chain south of it, started with Shift, runs over a plant (skipped) and has
   lumber for 6 of its 9 walls, so 6 are planned from its start. All 40
   stand by step 1500.
7. `pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/chain-tunnel.json --quiet`
   prints `final step 10000 hash e42ed368`: the debug tools heap a soil hill
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
   (softwood, sticks, stone, flint, meat and the rest) each sit in a slot with
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
5. Right click the meat slot: it is crossed out in red and a message says
   nobody eats it; right click again to eat it. With the cursor locked
   (Settings) the tooltips, arrows, wheel and right click work the same.
6. Unit tests: `packages/client/test/inventory.test.ts` (slot order, an icon
   in the catalogue for every good, scrolling, counts, the wheel, the change
   over a minute). `node packages/client/test-e2e/hud-check.mjs` checks the
   grid in a browser.

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

## How a tester checks the balance editor

The editor reads the sim's own data modules when it is built, so what it shows
is what the game runs on. Its build is one self-contained HTML file.

1. `pnpm balance:dev` and open http://localhost:5175 (or
   `pnpm --filter @blockyrts/balance build` and open
   `packages/balance/dist/index.html` straight from disk). The left menu lists
   14 groups, from Buildings and levels to Pacing (Mages and spells among them), plus the blueprint's tables
   read only; the header names the commit the tables came from.
2. Buildings and levels > Basic build menu > Big House. Its "Unlocks and uses"
   box lists what each main base level unlocks (Barracks at level 2, and so
   on) and what is made there; click a chip and that entry opens. Research >
   Bronze lists everything that needs it, and its "Forge level needed first"
   names the Casting Hearth.
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

