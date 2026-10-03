<!--
Generated from the canonical blueprint, adventure-blueprint-controls.docx, by
packages/tools/scripts/extract-blueprint.py. Do not edit by hand: the .docx is
canon and blueprint changes go through the project coordinator. Re-run the
script to refresh this copy.
-->

# Survive and Conquer

*Note*

This blueprint is a work in progress and does not cover everything yet.

## Technology

The game runs in a web browser. Three.js is used for rendering and Blockbench for the models. The rest of this section is the recommended technology for everything else.

### Language

- **TypeScript** for both the game and the server. TypeScript is JavaScript with type checking added; it turns into plain JavaScript, so it works with Three.js and in every browser. Using one language on both sides lets the game rules be written once and shared.
- **Vite** as the development and build tool for the browser game.

### Multiplayer model: deterministic lockstep

Recommended: **deterministic lockstep**, the method traditionally used by real-time strategy games with large numbers of units. Every player's computer runs the same simulation of the game, and the only thing sent over the network is the players' orders ("these 12 units attack-move here"). Unit positions and health are never sent.

Why it fits this game:

- Hundreds or thousands of units and monsters cost almost nothing to send, because only orders are sent.
- The design already pauses the game when a player disconnects, which is exactly what lockstep needs to do anyway.
- The world is generated from a seed, so every player's computer can generate the same world without sending it.
- The server stays small and cheap, which matters for games that run for many hours across many sessions.

What it requires (the main technical risk, to plan for from the start):

- The game simulation must give exactly the same result on every computer. Anything that affects the game uses whole-number (fixed-point) maths and a seeded random number generator, and avoids the browser's built-in sine, cosine and similar functions, which can give slightly different answers in different browsers. Lookup tables replace them.
- The simulation runs in fixed steps (20 per second), separate from drawing. Three.js draws smoothly between steps.
- The simulation runs in a background thread (a Web Worker) so drawing stays smooth.
- Every few seconds each computer sends a short checksum of its game state. If they ever differ (a "desync"), the game reloads everyone from the host's state.

Alternative considered: a server that runs the game and sends the state of every unit to the players. It is easier to get right, but sending the state of thousands of units is heavy, and the server would have to run every game for its whole length. Not recommended for this game.

### Server

- **Node.js** (running TypeScript). The server does not run the game. It handles accounts and lobbies, passes orders between players each step, handles reconnecting players, and can store multiplayer saves.
- **WebSockets** for the connection between browsers and the server: simple and supported everywhere.
- No third-party lobby framework: lobbies, invites and reconnecting are a small part of the relay server (see "Technical decisions").

### Accounts and saved data

- Accounts, usernames and saved games are stored on the server in a database. Recommended: **PostgreSQL**.
- Passwords are never stored as they are typed; only a secure hash is kept (for example with Argon2 or bcrypt). All traffic uses HTTPS and secure WebSockets.
- An email-sending service is needed for password resets. Reset links expire after a short time and work only once.
- A save stores the world seed, the changes to the world, and the state of every player, unit and building, rather than the whole map.
- Saves are stored on the server under the player's account. A multiplayer save is stored under the host's account.
- Guests have no account, so their games are never saved unless they create an account (see "Accounts and guests").

### World generation and terrain

- **Generation is pure:** the seed plus a cell's and a chunk's position always give the same land, on every computer and in any order. All the noise used to shape the land is whole-number noise made by hashing, with no browser maths functions.
- **Growing cells (suggested):** because cells get bigger with distance, they cannot be a uniform grid. Instead, cells are laid out in rings around the start, and each ring's cell size is set by its ring number. Every cell can still be worked out from the seed and its own ring and position alone.
- The world is generated in chunks of 64 x 64 columns (28.8 m squares). A chunk looks up which cells it sits in and builds its land from their descriptions; cells are only descriptions until a chunk needs them.
- Chunks are requested a ring ahead of the explored edge, so exploring never stalls. Generation work is spread across simulation steps and runs in the simulation's background thread.
- Terrain changes (digging, filling, building the land up) are simulation events with a step number, applied in the same order on every computer. The desync checksum covers edited chunks.
- Saves hold the seed, the changes in each chunk (which column layers changed), and the water in chunks where water has moved.
- Monster pathfinding uses a coarse navigation map (tiles about 2 m across) with costs for each kind of monster. Only changed tiles are rebuilt when the land changes.
- Turning the column data into drawable cuboids happens on the drawing side and is not part of the simulation.

### Performance notes

- The world is generated and stored in chunks, created as players explore.
- Large groups of identical models (units, trees, rocks) are drawn with Three.js instancing so thousands of them stay fast.
- Large groups move using shared "flow field" pathfinding rather than each unit finding its own path.
- Terrain is stored as columns on a 45 cm grid: 4,096 columns in a 28.8 m chunk instead of about 65,500 at 11 cm. Only faces that touch air are drawn, and touching faces of the same material are merged (see "Terrain").
- Digging, filling, water flow and the walkable map are part of the game simulation, so they follow the same whole-number rules as everything else and give the same result on every computer. Only the area around a change is recalculated.

### Technical decisions

Decided (Jade accepted these on 2026-10-02). JavaScript (as TypeScript) and Three.js are Jade's own choices; the rest are the picks Jade accepted. Each decision names the problem, the choice and the main reasons.

#### 1. Stack and tooling

**Question:** which language, build tool, server runtime and packages, and what to leave out?

**Decision:** TypeScript 5 in strict mode on both sides, Vite for the client, Node.js 22 LTS for the server, pnpm workspaces, three.js pinned to one release, ws on the server and the browser's own WebSocket, Vitest for tests, ESLint with typescript-eslint, and a hand-written binary codec over typed arrays for messages and saves.

**Why:** one language lets the simulation be written once and shared. Vitest reuses the Vite config. ws is a small library that does exactly what a relay needs. A hand-written codec is deterministic, compact and versionable, which JSON and generic serialisers are not at the size of a 100-hour save.

**Rules out:** Colyseus (its value is server-run state sync, which lockstep does not use; its lobby and reconnect features are a few hundred lines here); any engine on top of three.js; React or another framework for the HUD (a fixed set of panels updated every frame is faster and smaller as plain DOM and CSS); SharedArrayBuffer (needs cross-origin isolation headers and is not needed).

#### 2. Simulation determinism for lockstep

**Question:** what maths, step rate, random numbers and ordering make every computer compute the same game, and how is a mismatch caught?

**Decision:** integers held in ordinary JS numbers (exact below 2^53), with one world unit (wu) of 0.125 mm; 20 steps per second; xoshiro128 **streams seeded from the world seed; a sim that never touches floats, Math.random, Math.sin and friends, Date or timers; the sim in a Web Worker; the renderer interpolating between the last two steps; a 32-bit state hash every 20 steps compared through the relay.**

**Why 0.125 mm:** it is the largest unit that makes every size in the game a whole number: 1 model unit (2.8125 cm) = 225 wu, 1 terrain unit (11.25 cm) = 900 wu, 1 column (45 cm) = 3,600 wu, 1 m = 8,000 wu. A 32-bit value then reaches 268 km from the start, far beyond any 100-hour run. Heights use the same unit on the vertical axis. Products of two distances stay below 2^53 for anything under 10 km, and all range checks are local anyway.

**Why 20 steps:** a warrior at 3 m/s moves 15 cm a step and a galloping horse at 8 m/s moves 40 cm, both under one 45 cm column, so nothing tunnels through a column between steps; at 10 steps the horse would cross almost two. Attack times of 1.2 to 1.5 s are whole steps (24 to 30). A 3-minute day is 3,600 steps, a full cycle 8,800, and a 100-hour run 7.2 million, which fits a 32-bit step counter. 30 or more steps would eat the CPU budget on the minimum machine. Fast projectiles (an arrow at 40 m/s moves 2 m a step) use a swept segment test, not a point test.

**Rules:** division only through an integer helper (floor), isqrt by Newton iteration, angles as 16-bit turn fractions with sin and cos from a 4,096-entry table scaled by 2^16, no Math.* except imul, floor, trunc, min, max and abs. One RNG stream per subsystem (spawns, combat, trade, weather) so an extra random call in one does not shift the others; world generation uses a stateless 32-bit hash of seed and coordinates, never a stream. Entities live in struct-of-arrays typed arrays iterated by index; any sort uses a comparator with the entity id as tie-break (Array sort is stable). Spells and mana (checklist) follow the same rules: cooldowns in steps, mana in integer tenths, beams as per-step segment tests, areas as squared-distance tests.

**Worker and render:** the sim worker owns the state and posts a per-step delta (positions, headings, animation clip and start step, health) in a transferable ArrayBuffer; the main thread keeps the last two deltas and lerps positions by the fraction of the 50 ms step that has passed, so three.js draws smoothly. Desync: hash is FNV-1a over the canonical serialised state, sent in the input frame every 20 steps; the relay compares all players' hashes for the same step and names the minority; recovery is the doc's rule, reload everyone from the host's snapshot (the same bytes as a save). ESLint no-restricted-globals and no-restricted-properties enforce the bans in the sim package.

#### 3. Networking

**Question:** how do orders travel, what happens when a player is late or gone, and how does someone rejoin?

**Decision:** lockstep over a WebSocket relay; every client sends one small frame per step holding its orders for step N + D, with D = 4 steps (200 ms) by default and raised automatically to the measured round trip plus 2 steps (at most 12); the relay forwards each frame to the others at once and keeps the last 2 minutes of frames; no host migration for state; no WebRTC.

**Late or gone:** a client runs step N only when it holds every player's frame for N, so a late frame stalls everyone (the doc's pause); after 1 s the HUD shows "Waiting for X". After 3 s without a heartbeat the relay marks the player dropped and tells the room; after 30 s the host gets the doc's choice, save and quit or carry on without them (their assets are shared out as if eliminated).

**Rejoin:** because the match pauses while someone is missing, a returning player usually missed only the frames since their last acknowledged step, which the relay replays from its log. If the gap is longer (the carry-on case, or loading a save), a present peer serialises a snapshot at step S, the relay stores it, and the rejoiner loads it and replays frames after S. Loading a multiplayer save is the same path with the save as the snapshot.

**Host:** every peer holds the full state, so there is nothing to migrate. The host is a lobby role (owner of the save slot, maker of pause choices). If the host drops, the role passes to the next player in join order so decisions are never stuck; the save slot stays under the original host's account.

**Constraints:** browsers cannot listen for connections, so peer to peer would need WebRTC with STUN and TURN servers; a relay on a public address over WSS avoids NAT problems entirely and costs about the same as a TURN server would. Traffic is 20 frames per second per player of under 100 bytes, so an 8-player match is about 16 KB/s through the relay.

#### 4. Save format and where saves live

**Question:** save a full state snapshot or the seed plus every order ever given, in what format, how big, where?

**Decision:** a full simulation snapshot in a versioned binary container (little-endian sections with a 4-byte tag, length and version), compressed with the browser's CompressionStream (gzip, no library), stored on the server under the account with a local IndexedDB copy of the last autosave as a fallback, and an export and import button for a .sac file.

**Why not seed plus input log:** loading would mean replaying up to 7.2 million steps (hours on a laptop), and any rule change in a patch would alter the replay and break every old save. A snapshot loads in seconds. The input log is kept only as a rolling desync buffer (decision 11).

**Sections:** header (format version, game version, seed, step, night, players), entities as struct-of-arrays, edited columns per chunk, water per changed column, tree and rock diffs, explored and minimap tiles, factions and villages, research and queues, RNG streams, message log tail. A format version in the header plus one migration function per version; the number tables are not in the save, so balance patches apply to old saves. Saves more than 10 versions old are refused with a message.

**Autosave at dawn:** the sim worker copies the state at the dawn step and compresses it asynchronously so play is not stalled; the bytes are identical on every peer, so in multiplayer the host client uploads and the others keep a local copy. Three rolling autosaves plus manual saves per match; 500 MB per account.

**Size for a 100-hour, 8-player match (a 3 km explored radius, 20,000 entities, 200,000 edited columns):**

| **Part** | **Raw** | **Compressed** |
|---|---|---|
| Entities, 20,000 records at 64 B | 1.3 MB | 0.4 MB |
| Edited columns, 200,000 at 20 B | 4 MB | 1 MB |
| Water, 300,000 changed columns at 4 B | 1.2 MB | 0.3 MB |
| Tree and rock diffs, 200,000 at 8 B | 1.6 MB | 0.4 MB |
| Explored and minimap tiles at 1.8 m over 34,000 chunks | 8 MB | 1 MB |
| Factions, research, queues, RNG, messages | 0.5 MB | 0.2 MB |
| Total | about 17 MB | about 3 to 4 MB |

**Targets:** under 10 MB compressed for a 100-hour match, a hard limit of 50 MB per slot, load under 5 s.

#### 5. World and terrain representation

**Question:** how are columns, chunks, streaming, generation and the generated trees and rocks stored?

**Decision:** chunks of 64 x 64 columns (28.8 m square, 4,096 columns), so that column to chunk mapping is a bit shift; per chunk a flat layer pool (bottom and top as signed 16-bit terrain units, material as a byte, 6 bytes per layer with padding) indexed by a 16-bit offset and a layer count per column; a 16-bit water surface per column; a per-chunk edit log while loaded, folded into a column diff when the chunk unloads or the game saves; coarse pathing tiles of 4 x 4 columns (1.8 m, the doc's "about 2 m"), 256 per chunk.

**Memory:** about 75 KB of columns, 8 KB of water and 5 KB of props per chunk, call it 90 KB. The Deadlands begin about 2.9 km out, and a disc of that radius is about 34,000 chunks, or 3 GB if all were loaded, so they are not. Loaded set: chunks within 60 m of any player unit or building, plus one ring ahead, plus chunks the camera looks at and chunks with live mobs or active fields; budget 2,048 chunks (about 180 MB in the sim worker), evicted least recently used. An untouched chunk is dropped entirely and regenerated from the seed on demand; an edited chunk keeps its diff. Cell descriptions (polygon, type, edges, gaps, village) are about 1 KB each and are cached for the whole match. Explored land is remembered at 1.8 m tiles (a fog bit and a minimap colour byte, about 8 MB for the 3 km radius), not as columns.

**Generation:** pure from seed, cell and chunk coordinates, budgeted at 3 ms per step in the sim worker; a warrior takes 200 steps to cross a chunk, so one chunk per step is ample. World edge: 100 km from the start, a nine-hour run and in practice never reached; it keeps every coordinate well inside 32 bits and answers the checklist's explored-area question.

**Trees and rocks:** generated per chunk from the seed into a prop table (species or rock kind, column, age at generation, variant hash); they are game objects but not global entities until touched; a felled, planted, damaged or grown tree becomes a diff record in its chunk. Each species is a small set of parts (trunk segments, canopy tiers, stump), so the renderer draws them with one InstancedMesh per part per species (doc: built from parts so they can be instanced). Decoration (grass, pebbles, flowers) is render-side only and never stored.

#### 6. Pathfinding

**Question:** build the doc's flow fields plus 45 cm local steering, or use a library?

**Decision:** build it in the sim package. Flow fields on the 1.8 m coarse tiles for every night-mob target and for player groups of 8 or more, A* on the same tiles for smaller groups and single units, and local steering on the 45 cm column grid with a 5 x 5 column look-ahead that applies the doc's step, jump and drop rules and keeps units apart.

**Why:** no library fits a column grid with per-class costs, break-through costs, edits every step and integer determinism; navmesh and float-based grid libraries would have to be wrapped and audited anyway. The doc already specifies the algorithm.

**Costs:** each coarse tile stores a cost per class, recomputed from its 16 columns in the step an edit lands. Open ground is 12 (steps to cross at 3 m/s); a 3 to 4 terrain unit rise 18; wading 24; marsh 18; a rise of 5 or more, a wall, a cliff or deep water is blocked for walkers and wheeled units; climbers pass walls and cliffs at 12 plus height divided by their climb speed and cannot attack while on them; flyers have no field and fly straight at an altitude above the land; swimmers cross deep water at 24; wheeled units are blocked above 1 terrain unit. Breakers get a second value per tile, the break cost: a player wall or gate costs its health divided by the breaker's damage against walls, in steps; natural terrain costs the table 10 break points per cubic metre in the same way, multiplied by 3; the field takes the smaller of walking around and breaking through, barricades first.

**Rebuild:** an edit marks its tile dirty and the tile cost is redone in the same step; fields covering a dirty tile are marked stale and recomputed within 10 steps under a 3 ms per step budget, oldest first; a stale field is still followed meanwhile. A field is one byte of direction per tile over a region of up to 200 m radius (about 50 KB); a hundred live fields on a busy night are about 5 MB.

#### 7. Rendering

**Question:** how are thousands of units and a column world drawn fast in three.js?

**Decision:** one InstancedMesh per model type, with per-instance bone matrices in a DataTexture and each vertex carrying a bone index (rigid cubes per bone, no skinning weights, which matches the Blockbench rigs); props and trees as InstancedMesh per part; one greedy-meshed mesh per terrain chunk built in a separate mesh worker from a copy of the column data; two levels of detail; one directional sun or moon plus a hemisphere light and linear fog driven by lighting.json; shadows as one 2,048 cascade on medium and high and off on low; a draw-call budget of 300 at medium.

**Greedy meshing:** for each chunk and each of the six face directions, build masks per height slice and merge rectangles of the same material; side faces come from interval differences between neighbouring columns, tops and bottoms from interval ends. Only faces touching air are built. A chunk re-meshes in under 2 ms when edited, and only edited chunks are re-meshed.

**LOD:** full detail within 60 m of the camera focus; beyond that decoration and small props are dropped and tree canopies become one cube. Because the farthest zoom is capped, the visible area is bounded, so LOD mainly serves the far edge and the minimap.

**Lighting:** colours and fog from the artist's lighting sheet for day, dusk, night, dawn, blood night and fog night, interpolated over the 40 s of dusk and dawn; at night the 16 point lights nearest the camera are real three.js lights and every other torch is an emissive sprite plus a baked glow on the ground; fog of war is an R8 texture at 1.8 m tiles sampled by the terrain and prop shaders (black unexplored, grey explored and unseen). Pixel textures use nearest filtering. Unit animation: the main thread advances clips at render rate from the sim's (clip, start step) and writes bone matrices for visible instances only.

#### 8. Asset pipeline

**Question:** how do Blockbench models, textures and icons reach the game?

**Decision:** a build-time converter in packages/tools that reads each .bbmodel (Generic Model, cubes with inflate, groups as bones, keyframed clips) plus a manifest line per model, validates the wishlist rules (bone and slot_* names, cube budget, facing -Z, texture sizes) and writes a .glb with one mesh per model, a bone index per vertex, the clips as glTF animations, and the key keyframes as a JSON table of key times in steps for the sim. Scale: 1 model unit = 2.8125 cm, so the converter multiplies by 0.028125 to get metres, and the sim's heading 0 points along -Z so an unrotated model faces the way the sim says. The manifest carries per-model overrides, which is how the 26 existing creatures at 5 cm per unit come in without remodelling.

**Textures:** every model's embedded PNG goes into a 2D texture array per category (units and items at 256 x 256 layers, buildings at 512, terrain in its own array), with a layer index per instance, so variants (metal tiers, young animals, blood-night mobs) are a layer swap and nothing bleeds at the edges. Team colour: pixels matching the placeholder blue (52, 96, 178) are written into a one-channel mask array at build time and the shader recolours them with the player's colour, keeping the pixel's brightness.

Clip names are the contract between sim and renderer: idle, walk, run, attack_*, injured, death, climb, burn and the extras listed in the wishlist; the sim only ever says "clip X from step S". UI icons (32 x 32, whole-number scaling) are packed into one atlas with a JSON map and drawn by the DOM HUD as CSS sprites with image-rendering: pixelated.

**Rules out:** loading .bbmodel at runtime (an editor format that would have to be parsed, validated and fixed in the browser on every load) and per-model draw calls per bone.

#### 9. Hosting and accounts

**Question:** where do the relay and save server run, how do accounts and invites work, what does it cost, and how would someone self-host?

**Decision:** one Node process serving the API, the relay and the lobby, PostgreSQL for accounts, matches and save metadata, S3-compatible object storage for save blobs, the static client on a CDN host, all behind Caddy for automatic HTTPS, shipped as a docker compose file. Accounts are email, password and username handled in our own code: Argon2id hashes via @node-rs/argon2, an opaque session token in an httpOnly cookie that is also presented once when the WebSocket opens, password reset by a one-time emailed link that expires in 30 minutes, sent through a transactional email API. Invites: a 6-character code from an unambiguous alphabet and a link /join/<code> that the API resolves to the relay room.

**Cost:** a small VPS (2 cores, 4 GB) carries hundreds of concurrent players, since the relay only forwards small frames; with object storage and email at low volume the order of magnitude is USD 10 to 30 a month. Saves dominate storage at about 4 MB each.

**Self-hosting:** the same compose file with a disk save store flag instead of object storage, pointed at a domain; the client reads the API address from a config file so one build serves both.

**Rules out:** social or OAuth login (not needed for a game, adds provider setup), hosted auth services (cost and lock-in), save blobs in database rows (10 MB rows bloat backups), and running game logic on the server.

#### 10. Performance targets

**Question:** what must run, where, and how fast?

**Decision:**

| **Target** | **Minimum machine (low setting)** | **Reference machine (medium setting)** |
|---|---|---|
| Hardware | 2018 laptop: 4 cores, 8 GB, Intel UHD 620 class | 2020 desktop: 6 cores, 16 GB, GTX 1060 class or Apple M1 |
| Frames per second | 30 at 1080p with 400 animated units on screen | 60 at 1080p with 800 animated units on screen |
| Simulation | 3,000 live mobile units in 25 ms per step | 6,000 live mobile units in 25 ms per step |
| Draw calls per frame | 200 | 300 |
| Tab memory | under 1 GB | under 1.5 GB |

**Why:** night 110 for 8 players spends a budget of about 6,600 threat points (table 8 and Night mobs), which is a few thousand mobs over the night, spawning in waves and dying; 6,000 live units covers a blood night with room to spare. Half of the 50 ms step is kept for pathing, generation and serialisation.

**Browsers:** the latest two versions of Chrome, Edge, Firefox and Safari on desktop, which means Chrome and Edge 120 or later, Firefox 120 or later, Safari 17 or later as a floor. Needed features: WebGL2, module Web Workers, CompressionStream, Pointer Lock, the Fullscreen API. Keyboard Lock exists only in Chromium, which is why the doc lets the Ctrl layout work only in Chrome and Edge full screen.

**F11:** a page cannot press F11 itself, so the reminder stays text and the main menu also gets a "Full screen" button that calls requestFullscreen, which has the same effect. On a Mac the key is Ctrl + Cmd + F and the reminder says so there.

- **Measured in Milestone 10 (2026-10-03):** on a 4-core cloud container, slower than either target machine. The sim runs 3,000 live monsters at about 19 ms a step (target 25 ms; it was 95 to 99 ms before) and 6,000 at about 30 ms. The client draws about 80 draw calls whatever the crowd (budget 200 / 300). The heap is 37 to 67 MB with 291 to 1,086 units (budget 1 / 1.5 GB). Frames per second need a real GPU to measure.
- **Wall breaks:** a step that breaks a wall costs about 150 ms with 6,000 monsters (about 220 ms before the last fix). Most of it is the claimed-land enclosure flood after a breach, and the flow field's coarse tiles are rebuilt the next step; both are the next things to cut.
- **Hashes:** every speed-up left every hash identical (all the M0 to M8 check scripts, step by step).
- **Debug tools:** new readout lines for fps, frame ms, draw calls and triangles, units, and memory (Chrome only); a Crowd +200 button sets down 200 night mobs (zombies, skeleton archers, giant rats, grave hounds) on a ring 15 to 40 m round the view; pnpm --filter @blockyrts/tools perf:sim with --units, --steps and --seed. Notes in the repo's docs/performance.md.

#### 11. Testing and tooling

**Question:** how is determinism proven, a desync found, balance checked and a seed inspected?

**Decision:** Vitest unit tests on the sim; a headless runner (Node, no DOM) that takes a seed and a scripted order list, runs N steps and prints the hash every 20 steps; a CI job that runs the same script in Node, headless Chromium and headless Firefox through Playwright and fails on any hash difference; a desync tool; a balance harness; a map viewer.

**Desync tool:** every client keeps a ring buffer of the last 2 minutes of input frames plus the last agreeing snapshot; on a desync both sides upload them, and the tool replays them offline, reports the first diverging step and diffs the serialised state to the first differing field.

**Balance harness:** the headless runner with fixture towns (night 0 camp, night 10 palisade town, night 25 stone fort, night 45 fortress with muskets) and a scripted defence; the night spawner spends the table 8 budget for a given night and player count, and the harness writes one CSV row per run: losses, time to first breach, mobs alive at dawn, resources spent. Run after every table change.

- **Balance harness as built (Milestone 10, 2026-10-03):** pnpm --filter @blockyrts/tools balance prints the pacing check and the night 110 supply from the sim's own tables, then runs nights 0, 10, 20, 40, 60, 80 and 110 on seeds 1 to 3 against fixture towns with a scripted defence, one CSV row per run; options --pacing, --nights, --seeds, --blood, --csv. Its suggested assumptions and today's results are in the Balance notes (number tables, Pacing check). Harness fixture note, not a defence rule: mages stand on the main base's parapets from level 3.

**Map viewer:** a Vite dev page that runs the sim package's generation in the browser and draws a seed's cells, barrier edges, gaps, bands, villages and chunk heights on a 2D canvas, with a click to inspect any chunk's columns. Same code as the game, so what it shows is what players get.

#### 12. Project structure

**Question:** how is the code split so the shared simulation stays pure?

**Decision:** a pnpm monorepo with packages/sim (the rules, world generation, pathing, water, factions, save codec; zero dependencies; tsconfig lib set to es2022 only, no DOM), packages/protocol (frame, lobby and API message codecs), packages/client (Vite app: worker host, renderer, HUD, input, camera), packages/server (API, relay, database, save store), packages/tools (model converter, headless runner, desync tool, balance harness, map viewer), packages/assets (source models, textures, lighting sheet, icons). Shared: sim, protocol and the number tables, which live in sim as data.

**The rule:** sim never imports from client, server or three.js. It is enforced three ways: the sim tsconfig has no DOM lib, so window, document or performance fail to compile; project references stop a reverse import; an ESLint no-restricted-imports rule names the forbidden packages. The sim talks to the outside only through its step function (inputs in, state delta and events out).

#### 13. Faction AI

**Question:** how do the neutral peoples, goblin villages and hostile tribes decide what to do?

**Decision:** a deterministic two-level utility system inside the sim, with no learning and no scripting language. Level one is the faction: each village, colony, kingdom, goblin village and tribe band has a small state machine (settled, trading, warned, at war, migrating, gone) whose transitions are the doc's triggers (kill counts, seen tree cutting, 50% losses, reparations, surrender), plus a few scored goals it re-evaluates once per in-game minute (1,200 steps), staggered so no two factions think on the same step. Level two is the unit: behaviours as short lists of scored actions (gather, patrol, trade, caravan, raid a light, chase with the 20 s give-up, go home at dusk, flee) run every 10 steps, using the shared flow fields and the same path costs as player units. Every choice draws from the faction's own seeded random stream, so lockstep stays deterministic and a replay reproduces it. Night mobs keep their simpler target-and-path rules from the roster; the boss gets a scripted phase list.

**Why:** it covers everything the doc asks of the peoples without a second AI framework, costs a bounded slice of each step, and is easy to tune by changing scores.

**Rules out:** behaviour-tree libraries with their own timers, any AI that reads the renderer, and per-step faction thinking.

#### Start here: the first week of programming

- 1. Create the monorepo with the six packages, project references, the sim ESLint bans and Vitest, and commit a CI job that runs the tests.
- 2. Write the fixed-point helpers (wu constants, floor division, isqrt, the sin and cos table, 16-bit angles) with known-answer tests.
- 3. Write xoshiro128 **streams and the 32-bit coordinate hash with known-answer tests, then the first noise function on top of the hash.**
- 4. Build the chunk store: 64 x 64 columns, the layer pool, the edit API, the edit log and its fold into a diff; test that generate plus diff equals the live chunk.
- 5. Stand up the sim worker at 20 steps per second with a step counter, an input queue and the state hash; render one flat chunk in three.js under the doc's camera (fixed angle, pan, zoom limits).
- 6. Write the greedy mesher in a mesh worker, draw a 3 x 3 chunk area with a hill and a cave, and check draw calls and re-mesh time after an edit.
- 7. Run the model converter on worker_base.bbmodel, draw 500 instanced workers playing walk from the bone-matrix texture, and measure frames per second on the minimum machine.
- 8. Implement the move order: coarse tiles, A* and the 45 cm steering with the step and jump rules; 100 workers walking around a boulder and up a stair-stepped slope.
- 9. Write the relay (rooms, join code, one frame per step, hash compare) and run two browser tabs in lockstep for ten minutes with no desync.
- 10. Add the headless runner and the Node versus Chromium versus Firefox hash comparison to CI, so determinism is checked from the first week on.

### Build order

Decided (Jade accepted the coordinator's picks on 2026-10-02). The order in which the first playable is programmed, in eleven milestones, M0 to M10.

**Rule (Jade):** the first playable iteration contains all content in the blueprint; nothing is cut or deferred. This document only sequences that work, it never trims it, and every system in the doc appears in exactly one milestone below.

A milestone is a runnable build: the game starts, the deterministic simulation runs, and a tester can confirm the milestone's one-line "you can now" check by playing it. Later milestones add systems and never remove earlier ones.

Balance numbers come from the doc's tables 1 to 19 as they stand, including values marked (s). The data module built in M0 holds them; they are tuned only after a milestone has been played, in M10's balance pass or when a milestone check fails on numbers alone.

Each milestone depends on the ones before it unless its "depends on" line says otherwise. Where a doc section holds a piece that needs a later system, that piece is named in the later milestone, and the closing table shows where every piece lands.

#### M0: Project skeleton, deterministic simulation, desync hash, headless runner

**You can now:** run the headless simulation for 10,000 steps from seed 1 in Node, Chrome and Firefox and get three identical state hashes; a scripted order list replays to the same hash.

**Builds:**

- Technology, Language: a TypeScript workspace (Vite client, Node server package, a shared sim package so the rules are written once).
- Multiplayer model, deterministic lockstep (simulation side): fixed-point maths, a seeded RNG, lookup tables instead of Math.sin and friends, a fixed step of 20 per second in a Web Worker, an order queue per step (one local player for now), a state checksum every few seconds and a desync hook. The relay transport is M9.
- Reading the number tables: tables 1 to 19 as typed data with their (s) flags, plus the header rules as a rules library (damage x (1 - armour) capped at 75%, shield block, fire burn, XP sharing, rank bonus, the nutrition unit, vp).
- Technical decisions: the settled list recorded in the repo (stack, step rate, chunk budget and cell cache rules, the Deadlands ring rule, save format sketch, hosting, performance targets to be measured in M10), laid out as technical-decisions.md picks: a pnpm monorepo of sim, protocol, client, server, tools and assets, with the sim package banned from importing the client, server or Three.js.
- Headless runner: the sim without Three.js, driven by a seed and an order script, printing the hash; a CI job that runs the same script in Node, headless Chromium and headless Firefox and fails on any difference; the desync tool's ring buffer and offline replay; the map viewer and the balance harness as empty tools that later milestones fill with fixture towns.

**Depends on:** nothing.

**Risks:** a float leaking into the sim through Three.js or a library; Worker message overhead at 20 steps a second; fixed-point range for a world measured in integer world units of 0.125 mm covering a 100 km world edge.

#### M1: World generation, terrain, water, camera, controls shell, HUD shell and minimap

**You can now:** type a seed, start a game and pan and zoom across a generated world with cells, barrier edges, gaps, rivers with fords, a start basin and a pocket per player; the minimap fills in behind a debug reveal; two machines with the same seed show the same land and the same hash.

**Builds:**

- Technology, World generation and terrain: pure generation from the seed plus cell and chunk position, rings of growing cells, 28.8 m chunks of 64 columns requested a ring ahead, generation spread across steps in the sim Worker, terrain edits as stepped sim events.
- The world: cells, the seven barrier edge types and their 0 to 2 gaps, the no natural fortress rule, cell looks, the five depth bands with their trees and ores (including sulphur at the rare Barrens hot springs), the start basin and pockets (Table 9), fog of war, regrowth of trees and hazel, grassland thinning. Table 5 node placement, yields, gatherer limits and tool gates (its prospect and mineshaft rows are used in M4).
- Terrain, What the land is made of: 45 cm columns of layers in 11 cm units, materials, face merging and chunk meshing on the drawing side, far chunks at less detail, scenery batches, chunk deltas (the save format's foundation, written out in M9).
- Generated rocks and trees: seeded rock, ore, tree and hazel generators with growth stages and instanced parts, one reference tree per species from the wishlist. Hit feedback and hit particles are M3.
- Water: water as a column layer, flow only near changed land, river sources with a fixed inflow, ponds, fords.
- Controls: the six rules; Screen layout and mouse zones (every HUD panel as a solid rectangle, hotkeys on buttons and tooltips); Selecting units and buildings (click versus 4 px drag, the clamped box, priority rules, double click and Ctrl, exercised on resource nodes until M2); Camera (edge zones, the 0.1 s delay, arrows, middle drag, wheel zoom to the cursor, limits, settings sliders); Browser requirements (key blocking, no context menu, pointer lock, Mac Cmd, leave page confirm); Playing with the mouse only as the standing rule for every later control; minimap drawing, jump and drag.
- Visuals: the Blockbench model loader, the cube art pipeline, instancing; building looks per level are hooked up as each building arrives.

**Depends on:** M0.

**Risks:** meshing and water cost in a browser; cells and barriers looking natural; the growing-ring layout at Deadlands scale.

#### M2: Workers, gathering, carrying, building, farms, the main base levels and the day

**You can now:** from the starting camp (Big House level 1, four workers with hardwood tools, the Table 9 stock) send workers to chop, quarry and build; a crop field with assigned farmers puts wheat into the pool; the Big House upgrades to Longhall; the clock runs day, dusk, night and dawn; torches claim land; Idle Gatherer finds the worker whose trees ran out.

**Builds:**

- Premise and Details: the starting setup and the 3 min, 40 s, 3 min, 40 s cycle (Day and night: the periods, the clock, the dusk and dawn alerts; sunburn is M3, blood and fog nights M5). The starting warrior joins in M3.
- Units, Workers: every job (gathering, building and repairing, farming by right click assignment, crafting inside production buildings, hauling, sheltering with the 10% damage rule, the flee rule); Table 1 worker rows; training at the Big House and farms (Table 7 worker rows).
- Moving over the land: step, clamber and blocked rises, drops, headroom, wading, the swim rule by armour, the walkable map rebuilt only where land changed; unit pathfinding on the 45 cm grid with flow fields for groups.
- Unit orders (move, follow, stop, the smart right click rows for ground, friends, nodes, unfinished buildings, drop-offs and the minimap), group movement, order markers; Queuing orders with Shift, production queues, rally routes; Command card and hotkeys (the 15 slot card, letter keys, the grid build menus B and V, greyed buttons with reasons, rebinding); Control groups and camera hotkeys (the group key, ten groups, group tabs, F5 to F8, Backspace, Space, F1 to F3, L); the selection panel, subgroups and Tab from Selecting units and buildings.
- Building placement (ghost, tiles, cost on arrival, Shift chains, dragged lines, unfinished buildings as real objects, the 75% refund). Gathering resources (the loop, loads of 25 lb from Table 12, drop-offs, node crowding, run-out search, Return Cargo, rally on a node, the idle alert). Semi-automation: Everyone Home and double-tap Repair (fishing and hunting are M4).
- Resources: the shared pool and the expandable resource bar; the 20 main resources and the Additional resources list as data, each becoming obtainable with its source.
- Buildings and Table 4 as data, with these live now: Main base levels 1 to 10 (fixed footprint, decorative fill, upgrade from the panel, supply, shelter, parapets from level 3, marble from 5; levels 4 and up become reachable as M4 makes their materials), farms of four types and three tiers with farmhouses and the Table 6 farm yield rows, pen and barn, lumber mill with waterwheel, storehouse, torch post and wall torch. Visuals: each level's look.
- Light and torches and Table 18: every light, fuel and refuelling, claimed land (5 m, 10 m, enclosed regions), the outlying torch count (its goblin consequence is M5).

**Depends on:** M1.

**Risks:** pathfinding for hundreds of units; the HUD click rules and the clamped box; order queue edge cases (blocked spots, dead targets).

#### M3: Warriors, combat, equipment, defences, digging, night spawning and nights 0 to 20

**You can now:** survive night 0 with the starting warrior, four workers and a softwood fence; skeleton archers shoot over it on night 5 and a bomber breaks a softwood column on night 10; a dug trench turns zombies aside; Equip Best hands out flint spears; losing every worker with no main base or farm left ends the game with the night count as the score.

**Builds:**

- Units, Warriors (melee and backup weapon switching, ranged and melee switching with a lock, carcass nodes; hunting orders are M4); Experience and training (combat XP, five ranks; training at buildings is M4); Table 1 warrior rows.
- Combat: Melee (stab versus 90 degree arc), One-handed weapons and shields, Polearms (reach, minimum range, the three fallbacks), Fighting flying enemies, Ranged attacks, How ranged attacks hit (swept projectiles, hit boxes, lead aiming with spread, first thing hit, friendly pass-through, the clear shot search), Walls, trees and ranged attacks, Bows and crossbows (bows, arrows, quivers, tip tiers; crossbows are M4). Unit orders: Attack and attack-move, Hold, Patrol, the leash, target choice, the targeting cursor.
- Equipment: Making equipment (K crafting at the Big House: the Items rows for hardwood, stone and flint tools, club, spears, flint axe, javelin, sling, bow and flint arrows, fire arrows, wicker and wood shields, boots, hand torch), Equipping units (Equip Best, pick-up at a main base, rank order, Auto-Equip F4), Choosing by hand (I panel), Seeing equipment, Unit models (the shared body, warrior skin, injured and death animations; other races' models arrive with their milestones), Refurbishing (F). Table 2c hardwood and flint rows, 2d tiers 1 and 2, 2e sling, javelin, bow, arrows, quiver, fire arrows; Table 3 boots, wicker and wood shields.
- Table 4 Defences: walls, gates and towers in three materials, garrison with E and U, tower slots and parapets; Earthworks (ramps, banks, fill) with the dragged preview.
- Digging and prospecting (Dig: area, depth, preview, tunnels), Digging and building up the land (Jade's dig rate, bites, the 3 m limit, carving yields, Earth), Table 10 dig speeds and break costs, Keeping digging fair (its unlit tunnel as cave rule is applied by M5's lairs), water reacting to digs through M1's water. Generated rocks and trees: hit feedback and hit particles.
- Threats and Monsters and terrain: the dark edge, claimed land exclusion, the coarse 2 m navigation map with per-kind costs and flow fields, break cost versus walking with the x3 natural terrain rule. Table 8 rows: claimed land, dark edge, light and unit weights, first night, split and picking, first appearance, the base budget 12 + 3n + 0.04n^2 (the other rows are M5). Day and night: sunburn, fleeing and sun-proof behaviour at dawn.
- Night mobs, nights 0 to 20 from roster 5.2 to 5.6 (zombie, cave bat, giant rat, giant spider, slime, skeleton archer, bloated corpse, skeleton bomber, the goblin warband with cutters, slingers and a chief, grave hound) with Jade's rules: climbers, swooping flyers, explode on death, no monster friendly fire, 0.5% a night growth, small valuables and spider silk drops.
- Winning, losing and score: nights survived, elimination, game over.

**Depends on:** M2.

**Risks:** the projectile sweep with thousands of mobs; flow field memory per target and monster kind; polearm fallback oscillation; terrain edits and water settling inside the step budget.

#### M4: Economy to steel, food and supply, animals, research, mining and carrying

**You can now:** make stone and flint tools at the Big House without research, research Bronze at a Scholar's Lodge, smelt bronze at a Casting Hearth, climb through Bloomery and Ironworks to a Steelworks fed with vein iron hauled by ox cart from a tier 2 mineshaft; stew from a Great Kitchen feeds the town; a wild horse is tamed at the Stables; warriors hunt deer with N and bring the meat home; Rations starves workers but not troops.

**Builds:**

- Food, supply and health and Table 6: nutrition per food, even eating, Don't eat, upkeep for units and research facilities, starving and natural healing, Rations (F9), eating at a building, supply from main base levels and farms, the over-limit rule; the Food and medicine items.
- Progression tiers 1 to 7 (tier 8 is M8); Research (Scholar's Lodge, Scriptorium, Grand Academy, the rising facility cost, the cap of 10, research loading like training) with Table 2a Bronze, Deep Mining I to III, Halberds, Crossbows, Steel, High-quality steel, Steel crossbow (Hexcraft is M6; Siege engines, Gunpowder, Muskets and Cannons are M8).
- Forge levels and Table 2b smelting; Items: Materials, Tools (Table 2c forge rows, prospecting hammer, carts), Weapons and armour forge and tannery rows (Table 2d tiers 3 to 7, 2e crossbow, steel crossbow, bolts, tips, poison arrows; Table 3 metal armour, helmets and shields), Bows and crossbows (the crossbow part).
- Cooking tiers 1 to 5; Workshop tiers 1 to 4 and Trinkets (Tokens to Heirlooms, Moonleaf, Sunheart; siege engines are M8); Kiln, Tannery, Herbalist hut, Fishing dock, Barracks, Stables (taming, stalls, breeding; riding is M8); Mineshafts and prospecting with Prospect (T), tiers 1 to 3 and the Table 5 prospect and output rows.
- Animals, Wild herds, Game and other wild animals (hare, deer, boar, wolves, lynx, giant frog, crocodile, giant crab, badgers smashing outlying torches, roster 6.1), Bears (never tamed, the 60 cap), Young animals, Fish (three species, crowding, young), livestock farms with breeding and slaughter, grazing and the crop fallback, working animals eating from stock, monsters killing animals left out. Semi-automation: Hunt (N) and fishing dock stretch rotation; Warriors' hunting.
- Experience and training at buildings and Table 7 (worker, warrior, archery and crossbow rows; mage rows M6; riding, musket and cannon crew rows M8).
- Inventory and carrying weight and Table 12: the 100 lb and 25 lb limits, the slowdown curve, quivers and cases, hand cart, ox and horse carts, pack animals, mounted units unslowed. Additional resources: every one now obtainable from its source.

**Depends on:** M3.

**Risks:** the largest milestone by content; economy pacing against the Balance notes (checked in M10); animal and herd AI cost; many buildings whose per-level looks must exist.

#### M5: Lairs, rising difficulty, blood and fog nights, hostile tribes and goblin villages

**You can now:** by night 15 a barrow and a cave mouth sit at the frontier and send a fifth of the wave; clearing the barrow by day yields its hoard and 20 XP to the warriors; claiming 60% of the Fringe triggers a blood night at dusk with the warning; more outlying torches than the limit at dusk bring the goblin horde; a Deepwoods goblin village declares war after the fifth kill and marches on the nearest building 30 s after dawn.

**Builds:**

- Rising difficulty and the remaining Table 8 rows: budget factors (town size, provoked, player count), depth weighting and later-night draws per band, lair cadence and cap, outlying torches and the dusk horde, the blood night trigger, warning and double horn, the fog night. Day and night: blood nights and fog night.
- Lairs and Table 15: all eight types with destroyed versions, sleepers and guardians (giant centipede, myconid, and the ash golem and mana wraith from Deadlands creatures), clearing and hoards under Jade's wealth rule, the 10 day cooldown, minimap marks and rift glow, lair placement from Monsters and terrain and the Threats bullets, unlit tunnels as cave sites (Keeping digging fair), ruins as decoration and sites. Sleeper types from night 25 up are filled in by M8's roster.
- Hostile tribes and Table 16: gnoll, kobold and hobgoblin bands (roster 6.2), spawn odds and keep-away, the 20 per player cap, chase and give-up, dusk camps.
- Goblin villages and Table 17: frequency, huts, fire pit, totem, stake ring, goblins, archers and the goblin mage with Snuff, Stumble hex and Spark toss (the shared ability, mana and cooldown core that M6 extends), aggro, the war threshold and its warning, daily raids that put out lights, rebuilding, hexstone and other drops, breaking down huts; territorial creatures. Wolf riders and the wolf pen activate in M8 with mounts.

**Depends on:** M4 (drops, hexstone, buildings to raid) and M3.

**Risks:** budget factors stacking into unplayable nights before M10 tunes them; lair placement finding no legal cell; raid AI pathing through player defences.

#### M6: Mages, mana, spells, the Sanctum, Hexcraft, Warding and Counterspell

**You can now:** train a Novice Acolyte at a Magi Sanctum; Heal and Arcane bolt resolve inside the lockstep step with identical hashes on two machines; Hexcraft research adds Warding, and a Counterspell cancels a goblin mage's Snuff; a Grand Magician keeps up a bolt every 4 s.

**Builds:**

- Magic, Mage types and Mage ranks and mana: support and battle mages, six ranks, mana bars and refill, the 10 s combat pause, spell power by rank (Table 1 mage rows), training at the Sanctum and at main base 6+, mages on towers and parapets.
- Table 13 player spells: Heal, Quicken, Fortify, Rally, Arcane bolt, Beam, Fireball, Area blast, Warding, Counterspell, with the projectile and non-projectile rules from Combat; Hexcraft (Table 2a) researched at the Sanctum with hexstone.
- Magi Sanctum (Table 4), Table 7 mage rows (novices, ranks to Adept, rank wands of mana crystals), wands as the mage weapon, Unit models: the mage model. Technical decisions: spells and mana inside the fixed-point step.

**Depends on:** M5 (hexstone, the ability core) and M4 (mana crystal nodes, main base 4).

**Risks:** beams and area effects straddling steps; spell power stacking with Rally and Fortify against the armour cap.

#### M7: Neutral peoples, trade and barter, war and surrender, mercenaries, speech and the message panel

**You can now:** find a Halfling village and trade a Copper Token for grain through the barter menu; an Elf caravan stops outside the base five days after first contact; chopping Deepwoods trees in sight of an Elf gives three warnings and then war; a Dwarf colony names the direction of the nearest city after the first trade; the message panel records a declaration of war and clicking it jumps the camera.

**Builds:**

- Neutral villages and trade and Table 11: villages generated on discovery, specialisations, the trade menu (stock, wants, offer box, worth bar, three bundles), hidden values, daily limits and restock, mood, refusals, the war confirmation pop-up, allies drawn in, surrender, plunder, breaking down abandoned buildings; mercenary camps hired in silver.
- Halflings (placed at generation per Table 9, burrows and farm buildings, spearmen, surrender and flight; war oxen are M8), Runkin (camps, walk-and-shoot archers, clubbers, their wolves turned on the player, migration to a new camp), Elves (the one kingdom, caravans and their wagons, tree warnings, no surrender, Bladewarden, Longbow ranger, tamed bear, Grovesinger with the five nature spells from Table 13 on M6's engine; bear riders are M8), Dwarves (colonies and cities as separate factions, grudges and migration, reparations, Shieldbearer, Hammerguard, Crossbowman; Gunner, Cannon crew and city cannons are M8), Table 19 price lists. Faction AI (trade, war, surrender and migration states).
- Unit speech and the message panel: speech bubbles, random remarks, triggered speech, other races' lines, which speech reaches the panel, the 60 message panel with filters, collapse, click to jump, urgent pings and flashes, Space (chat typing is M9).
- Open questions: the four peoples are built; more peoples stay a later iteration, as the doc says.

**Depends on:** M4 (trinkets, goods), M6 (Grovesingers) and M5 (tribes attacking villages).

**Risks:** the barter valuation producing silly bundles; four faction AIs with war, surrender and migration states; speech volume flooding the panel.

#### M8: Mounts and charges, siege engines, gunpowder and the full roster to night 110

**You can now:** a warrior trained to ride charges a wave and knocks zombies back; an ox hauls a catapult that breaks a goblin hut; a Gunnery yard trains musketeers and cannon crew, and a bronze cannon fires from the Citadel's ports; by night 85 the budget buys juggernauts; Morvath arrives on night 110, withdraws at dawn if alive and returns ten nights after a defeat.

**Builds:**

- Combat, Charges and Table 14: the charge run, double damage, knockback by height, player horses and riding (Table 7 riding, Stables, the Table 1 mounted row), oxen as haulers, Halfling war oxen with two riders, Elf bear riders, goblin wolf riders and their pens.
- Siege engines research (Table 2a), Table 2f catapult and ballista with their munitions from the Great Workshop and Manufactory, hauling by horse or ox, crew pushing, wheels needing ramps, repair by workers only.
- Progression tier 8: Powder mill, Gunpowder, Foundry, Gunnery yard, Muskets and Cannons research (Table 2a), musket and lead shot, powder horn and shot pouch, bronze and iron cannons and cannonballs (Tables 2e and 2f), Citadel cannon ports, Dwarf Gunner, Cannon crew and city cannons.
- Night mobs nights 25 to 110 from roster 5.7 to 5.25: barrow knight through rift colossus, the Rift-touched beasts, Morvath with his boss drops and return rule, the later lair sleepers of Table 15, demon horn and mana crystal drops.

**Depends on:** M4 (steel, Stables, workshops), M7 (the peoples' mounted and gun units) and M5 (lairs).

**Risks:** wheeled pathing over column terrain; cannon splash and musket damage against the armour formula; the night 110 budget's unit count on screen.

Built (2026-10-03, PR #59): picks in m8-picks.md, now in the docx and number-tables.md (Milestone 8 picks under table 14). Table 14's rider weapons were corrected to 18 (Halfling spear) and 45 (Elf glaive), and the Dwarf city keeps 1 cannon a day plus 3 muskets, with 6 Gunners, 4 Cannon crew and 2 gate cannons added to its garrison.

#### M9: Multiplayer, accounts, saving and loading, settings and outside the match

**You can now:** two players on different machines join by code, pick colours and play a night with shared control and sent resources; one disconnects and the game pauses; the host saves, both quit, and the game resumes once both have rejoined; a guest who clicks Save is asked to make an account; the main menu reminds the player about F11.

**Builds:**

- Multiplayer model (network side): the order relay each step, the state checksum compared between players, reload from the host's state on a desync. Server: Node.js with a plain WebSocket relay (the lobby and reconnection are handled by the same Node server). Accounts and saved data: PostgreSQL, hashed passwords, HTTPS, expiring reset emails, saves as full state snapshots in a versioned compressed file.
- Multiplayer and saving: up to 8 players, Allies panel (share control with coloured rings, send resources, map pings), When a player is eliminated or leaves (split resources, inherited buildings and technology access), Accounts and guests, Saving and disconnects (autosave at dawn, save at any time, pause and the host's choice). Chat with Enter and the Who sees what rule.
- Outside the match: main menu, hosting and joining with links and codes, the lobby, load screen and save slots, settings (graphics, scale, shadows, view distance, volumes, hotkeys, camera sliders, the optional Ctrl layout), seeds, onboarding hints, browser support, the F11 reminder.

**Depends on:** M0 (the lockstep core) and every milestone, since the save covers all state.

**Risks:** 100 hour saves with every edited chunk; rejoin ordering; hosting cost and account email delivery.

Done (merged 2026-10-03, PR #61): picks in m9-picks.md, now in the docx (Multiplayer and saving, Outside the match, Controls) and number-tables.md table 20.

#### M10: Audio, performance pass, balance pass against the pacing check, bug bash

Done (merged 2026-10-03, PR #63): picks in m10-picks.md, now in the docx (Audio, Controls, technical decisions 10 and 11, Balance notes, Open questions). The first iteration (M0 to M10) is complete.

**You can now:** a single-player run reaches bronze by night 4 to 6, iron by 13 to 18, steel by 25 to 30 and gunpowder by 40 to 48 (s) as in the pacing check, at the agreed frame rate on the minimum hardware; the Quick reference works end to end with the mouse alone; every sound in the Audio list plays.

**Builds:**

- Audio: day, dusk, night, dawn and blood night music, unit voice cues, the sound list.
- Performance notes measured against the Technical decisions targets (30 fps with 400 animated units on the minimum machine, 60 with 800 on the reference machine, 6,000 live mobile units inside a 25 ms step): instancing, flow fields, chunk streaming, column meshing and water, units on screen at the night 110 budget.
- Balance notes: the pacing check and the wave versus defence checks at nights 0, 10, 20, 40, 60, 80 and 110, supply at 110, run through the balance harness and then confirmed in play; What makes it fun as the review checklist for the decision tensions; (s) values retuned here, Jade's values untouched.
- Quick reference and Playing with the mouse only as the control test script; the bug bash across every earlier check.

**Depends on:** M9.

**Risks:** retuning one table shifting another; performance fixes breaking determinism.

#### M11: Troop rework

Agreed by Jade on 2026-10-03 (go at 05:25 UTC). The full design is in troop-rework.md and the docx section "Troops and gear (agreed 2026-10-03)"; the numbers are in Tables 2a to 2e, 3, 7, 12 and 13.

**You can now:** click a Barracks, pick a weapon tier and an armour tier for close melee, long melee, ranger or brawler, tick Lock, and train troops that come out already armed; train cavalry at the Stables; select warriors and press Upgrade Weapon or Upgrade Armour (or the Max twins) and watch them walk to a forge, Barracks or main base and come back better armed; upgrade a worker's whole tool kit with Q; see a long-melee troop land 30% critical hits at the tip of its reach.

**Builds:**

- Sim: no tool, weapon, armour or ammunition items; a weapon tier, armour tier and type on every troop, a tool tier on every worker, a wand and robe tier on every mage; five troop types fixed at training; kit costs (today's item costs carried across, summed, no tuning) plus food and 1 supply; feathers and gunpowder paid at training; unlimited ammunition; Upgrade Weapon, Upgrade Armour and their Max twins with the walk to the nearest forge, Barracks, main base (Stables for cavalry, Magi Sanctum for mages) and a fill bar; shortage rule (highest rank first, whole steps only).
- Combat: long melee and cavalry with no minimum range and +30% damage in the outer third of reach (Jade; outer third (s)); shields only on close melee, from the armour tier; no backup weapon; no load slowdown and no armoured swimming rule; worker carrying limit kept for the walk back only.
- Forge as smelting only (Casting Hearth, Bloomery, Ironworks, Steelworks with carbon steel); Tannery with no tiers making hardened leather; research list without Halberds and Steel crossbow; wild geese and pheasants hunted for meat and feathers.
- Client: the Barracks, Stables and main base training panel (picture buttons, tier dropdowns with icons, Lock, best-affordable default favouring the weapon); the four Upgrade buttons (Q, X, Z, V (s)) and Q Upgrade on workers; K, F, I, F4, the Equipment panel, the inventory panel, the Train skills page entries for Archery, Crossbow, Musket and Riding, and the Ride button removed; Hitch and Cannon crew kept; start with 4 workers and 3 unarmoured close-melee warriors with hardwood cudgels.
- Balance editor: a group per new table (kits, armour and shields, tools, training and upgrading, wands and robes); no tuning, numbers stay Jade's.
- Models: tinted bodies per tier until the model thread makes the per-tier looks and the brawler's pistol; wild geese and pheasants borrow the hen's model, sized to each bird, until theirs are made.

**Depends on:** M10.

**Risks:** old saves carry items (a save from before M11 either converts each unit's best gear to tiers or is refused with a clear message (s)); trade and plunder rows that sold items now give ingots at the same value.

#### Completeness check: where every section and table is built

| **Doc section or table** | **Milestone** |
|---|---|
| Technology (intro), Language, Technical decisions, Reading the number tables | M0 |
| Multiplayer model: deterministic lockstep | M0 (simulation); M9 (relay and desync reload) |
| Server, Accounts and saved data | M9 |
| World generation and terrain | M1 |
| Performance notes | M10 |
| Premise, Details | M2 (the warrior joins in M3) |
| What makes it fun | M10 |
| Winning, losing and score | M3 |
| Day and night | M2 (cycle); M3 (dawn sunburn); M5 (blood and fog nights) |
| Rising difficulty | M5 |
| Table 8: Night spawn geometry | M3 (dark edge, claimed land, first night, split, first appearance, base budget); M5 (the rest) |
| Light and torches, Table 18: Lights | M2 |
| Threats, Monsters and terrain | M3 (lair placement bullets M5) |
| Lairs, Table 15: Lairs | M5 (sleepers from night 25 filled by M8) |
| Night mobs | M3 (nights 0 to 20); M8 (nights 25 to 110, Rift-touched beasts, Morvath) |
| Hostile tribes, Table 16: Hostile tribe bands | M5 |
| Goblin villages, Table 17: Goblin villages | M5 (wolf riders and pen M8) |
| Neutral villages and trade, Table 11: Trade values, village stock and wants, Halflings, Runkin, Elves, Dwarves, Table 19: Elf and Dwarf price lists | M7 (war oxen, bear riders, Dwarf gunners and cannons M8) |
| The world, Table 9: Start pocket contents | M1 |
| Table 5: Resource nodes per band | M1 (prospect and mineshaft rows M4) |
| Food, supply and health, Table 6: Food and supply, Food and medicine | M4 (farm yield rows M2) |
| Open questions | M7 (noted for later iterations) |
| Troops and gear, Tables 2c to 2e, 3, 7 and 13 (wands and robes), Unit looks | M11 |
| Gameplay Mechanics (heading), Controls, Screen layout and mouse zones, Camera, Browser requirements, Playing with the mouse only | M1 |
| Selecting units and buildings | M1 (selection panel and subgroups M2) |
| Control groups and camera hotkeys, Command card and hotkeys, Building placement, Gathering resources, Queuing orders with Shift | M2 |
| Unit orders | M2 (move, follow, stop, smart orders); M3 (attack, hold, patrol, leash) |
| Semi-automation | M2 (Everyone Home, repair); M4 (hunting, fishing) |
| Digging and prospecting | M3 (Dig); M4 (Prospect) |
| Unit speech and the message panel | M7 (chat M9) |
| Quick reference | M10 |
| Resources | M2 |
| Additional resources | M4 (listed as data in M2) |
| Units (intro), Workers | M2 |
| Warriors | M3 (hunting M4) |
| Experience and training, Table 7: Training | M3 (combat XP); M4 (training at buildings; mage rows M6; riding, musket and cannon rows M8) |
| Table 1: Player unit stats | M3 (worker rows read in M2; mage rows M6; mounted row M8) |
| Combat, Melee, One-handed weapons and shields, Polearms, Fighting flying enemies, Ranged attacks, How ranged attacks hit, Walls, trees and ranged attacks | M3 |
| Charges, Table 14: Mounts and charges | M8 |
| Bows and crossbows | M3 (bows); M4 (crossbows) |
| Animals, Wild herds, Game and other wild animals, Bears, Young animals, Fish | M4 |
| Buildings, Main base, Table 4: Buildings | M2 (data, main base, farms, pen and barn, lumber mill, storehouse, lights); M3 (defences, earthworks); M4 (production, research, mining, Barracks, Stables); M6 (Sanctum); M8 (Powder mill, Foundry, Gunnery yard) |
| Research, Forge levels, Cooking, Workshop, Trinkets | M4 |
| Items, Materials, Tools, Weapons and armour, Table 3: Armour, helmets, boots and shields | M4 (Big House rows M3; musket and cannon rows M8) |
| Equipment, Making equipment, Equipping units, Choosing by hand, Seeing equipment, Unit models, Refurbishing | M3 (other races' models with their milestones) |
| Inventory and carrying weight, Table 12: Carrying weights and capacities | M4 (the 25 lb load from M2, quivers from M3) |
| Progression, Table 2: Tools and weapons per tier (2a to 2f) | M4 (2a Hexcraft M6; 2a Siege engines, Gunpowder, Muskets, Cannons and 2f M8; hardwood and flint rows M3) |
| Balance notes | M10 |
| Magic, Mage types, Mage ranks and mana, Table 13: Mage spells and mana | M6 (Elf Grovesinger rows M7) |
| Terrain, What the land is made of, Water | M1 |
| Generated rocks and trees | M1 (hit feedback and particles M3) |
| Moving over the land | M2 |
| Digging and building up the land, Table 10: Dig speeds and break costs, Keeping digging fair | M3 (tunnel caves as lair sites M5) |
| Mineshafts and prospecting | M4 |
| Multiplayer and saving, Allies panel, When a player is eliminated or leaves, Accounts and guests, Saving and disconnects, Outside the match | M9 |
| Audio | M10 |
| Visuals | M1 (per-building looks with each building) |

## Premise

This is a procedurally generated survival and strategy game, played in the browser alone or with up to 8 players working together. The players start with a small camp on a flat, grassy patch in the middle of an unexplored, endless world: a Big House, four workers with nothing but hardwood tools, and one warrior with a flint-tipped spear and a hardwood club. By day they gather, farm, build, research and explore. By night, swarms of monsters pour out of the darkness and out of lairs to attack them. Each night is harder than the one before, and the game never ends: the score is the number of nights the players survive.

Over a game, the camp grows into a fortified town. Its technology climbs from hardwood clubs and flint tools through copper, bronze, iron and steel, up to flintlock muskets and cannons, while mages bring healing, battle magic and other spells. Workers do every job in the town, warriors fight and hunt, and both get better as they gain experience and better equipment.

The farther the players go from their starting point, the richer the resources and the greater the danger. Almost everything in the wild runs out, so even a cautious player is eventually forced to expand, and a small settlement that never expands will be wiped out. Some rare resources needed for advanced buildings and equipment are only found far from the start, or around certain aggressive creatures, which gives players a reason to expand faster. But expanding has its own risks: isolated buildings are destroyed at night, discovered tribes may start raiding, and disturbing tribes or territorial creatures makes the game harder. Being too aggressive or too cautious can both lose the game if done at the wrong time. Knowing when to push out and when to hold back is one of the main skills.

The map is generated as the players explore it. Natural obstacles (mountains, cliffs, crevasses, ravines and so on) form chokepoints that can be fortified. As the map expands, filling every chokepoint gets harder, and large areas may have no chokepoints at all. The world is laid out as cells divided by natural barriers with gaps in them, so there are always passes to fight over but never a natural fortress (see "The world"). Players can also shape the land themselves: digging trenches and moats, raising earth banks, and cutting passes through mountains (see "Terrain").

The land shapes the town. Grassland, which herds and most crops need, thins out with distance until the land is barren, so farming stays in the heartland while outposts reach out for ore, stone and rare materials. Food is a constant pressure: every person eats, farms provide most of the supply that limits how many units a player can have, and a destroyed farm at night can mean a hungry town the next day.

### Details

**Single player and multiplayer:** the game can be played alone or co-operatively by up to 8 players, all on the same side against the world (there is no player-versus-player). The game gets harder with each extra player.

**Day/Night:** The game starts in day. Day lasts 3 minutes, then dusk (40 seconds), night (3 minutes) and dawn (40 seconds), and the cycle repeats. One full cycle takes 7 minutes 20 seconds. See "Day and night" below for what happens in each period.

**Monsters:** most monsters have the **sunburn** trait: sunlight burns them and kills them quickly. At night, swarms of monsters attack the players. Some attack in waves, others in trickles or alone, depending on the type of monster.

**Starting setup:** Every player starts with:

- A level 1 **Big House**, the main base. It is a drop-off point for every resource, trains workers and tier 1 troops, and can be upgraded up to level 10 (see "Main base").
- 4 **workers**.
- 3 **warriors** (Jade, 2026-10-03), all close melee with a tier 1 weapon (a hardwood cudgel) and no armour, so no shield (see "Troops and gear").
- Tier 1 **hardwood tools** for the workers: hardwood axes, digging sticks and mallets. Workers upgrade their tool kit one tier at a time (see "Troops and gear").
- Extra starting food and supply for the three warriors (Jade, 2026-10-03).

### What makes it fun

The game is built around three moments players should remember, the first two above all:

- **Surviving a brutal night.** Holding a wall or a chokepoint while the night throws everything at it, and seeing the sun come up with the town still standing.
- **A risky expedition that pays off.** Sending a party far from home into danger and bringing back the rare resource, the cleared lair or the discovery that changes the run.
- **A well-built town.** A base that grows from a log hut into a fortress, laid out so it runs and defends itself well.

The strategy comes from a set of tensions. None of them has one right answer; the right choice depends on the night count, the map and what the player has found so far.

| **Decision** | **Pull one way** | **Pull the other way** |
|---|---|---|
| Expand or stay close | Richer resources and rare materials are only found far from spawn. A small settlement that never expands will eventually be wiped out. | Distance means more danger. Isolated buildings are destroyed at night, and discovered tribes may start raiding. |
| Army or economy | More warriors and mages survive harder nights. | Every unit costs supply and eats food every day. Farms give the supply, so the army is only as big as the farmland. |
| Train or work | Training at a building makes units stronger and unlocks cannon crews; better gear comes from upgrading at a forge, Barracks or main base. | A unit in training is stuck inside the building, costs time and food, and does no other work. |
| Light the land or not | Torches and light make monsters far less likely to spawn nearby. | Isolated torches get smashed by day creatures, and too many torches outside the base call a goblin horde at dusk. |
| Clear lairs or build | Clearing lairs removes about 20% of each night's monsters. | It costs daylight that could go to gathering and building, and new lairs keep appearing. |
| Disturb the world or not | Tribes and territorial creatures guard rare resources and some tribes can be traded with. | Provoking them raises difficulty. Some give up when you leave their territory; others hunt you until one side is dead. |
| One great base or many | A high-level main base unlocks the best units and technology. | Each upgrade costs more than the last, so outlying bases stay small and serve as drop-off points. |
| Research or units | Research facilities unlock better tools, weapons and buildings. | Each research facility costs supply and food like a unit, and each one costs more than the last. |

### Winning, losing and score

- The game is **player versus environment only**. In multiplayer, all players are on the same side.
- A game is **endless**. The score is the **number of nights survived**. In multiplayer, the team shares one score.
- There is **one difficulty**. It keeps rising so that almost every game ends in defeat eventually. Even the very best real-time strategy players should only last on the order of 100 hours.
- A player is **eliminated** when they have no workers left and no way to make new ones (no main base and no farm). Their resources are split evenly between the remaining players. Their buildings and units become shared by all remaining players (see "Multiplayer and saving").
- The game ends when every player has been eliminated.

### Day and night

| **Period** | **Length** | **What happens** |
|---|---|---|
| Day | 3 min | Gathering, building, exploring and clearing lairs. Daytime threats are territorial creatures, discovered tribes that raid, sun-proof monsters left over from the night, and creatures that smash isolated torches. |
| Dusk | 40 s | Last chance to get units home. Normal night monsters do not spawn yet. If too many torches are lit outside the base, goblins spawn now (see "Light and torches"). |
| Night | 3 min | Monsters spawn at the dark edge of the explored map and in lairs, then walk to their targets. They attack in waves, trickles or alone depending on their type (see "Threats"). |
| Dawn | 40 s | Normal night monsters stop spawning. Sunlight starts to burn the monsters that are left (see below). Goblins flee. The game autosaves. |

**At dawn**, monsters react differently by type:

- Most monsters have the **sunburn** trait and lose 10% of their maximum health every second in sunlight, so even a monster at full health dies in 10 seconds.
- Some flee to caves or shade and come back out at night.
- A few are sun-proof and stay as daytime threats.
- Goblins are not burned by the sun, but they always run away at dawn.

**Blood nights** are rare special nights. They last twice as long (6 minutes) and can never come before night 13. A blood night brings more of the rarer types of the existing mobs, not stronger versions of them. **Trigger (Jade):** a blood night falls when the players occupy **60% of a single depth band**. That band's trigger is then spent, so each band gives at most one blood night. The Deadlands have no trigger, because they are infinite. "Occupy" means the players' claimed cells (see "Claimed land") reach 60% of the band's cells, checked at dusk. A blood night never falls before night 13, so a band crossed earlier fires its blood night on night 13. The message panel warns at dusk.

**Fog night (suggested):** a random night event, announced at dusk. Sight and light radius are halved for everyone, and monsters spawn 20% closer. Nothing else changes.

**Random events:** the fog night is the only random night event for now (Jade). Its chance is in table 8.

### Rising difficulty

How hard each night is depends on several things added together:

- **The night count.** The main driver, rising faster as the game goes on, and new monster types join every 5 nights (see "Night mobs").
- **The size and wealth of the town.** Bigger, richer towns draw more monsters.
- **How far the players have explored.**
- **Which tribes and territorial creatures have been provoked.**
- **How deep the players are.** More monsters come the farther out the players are, but one building in the Deadlands does not bring the whole world down on them. Each player unit and building in a deeper band adds weight to that night's difficulty, deeper ones more, on top of the normal rise by night.
- **Depth weight (suggested):** each unit or building standing outside the Heartland at dusk adds to the night's monster budget: Fringe 0.5%, Deepwoods 1%, Barrens 2%, Deadlands 4% each, up to double the base budget. The extra monsters spawn at the dark edge nearest those units and buildings and go for them, so a lone deep outpost draws a small, nasty group. Deeper bands also draw monster types from later nights: Deepwoods 10 nights ahead, Barrens 25, Deadlands 50.
- **The number of players.** Difficulty scales in proportion to the number of players: three players get three times the monsters and three times the lairs of one player. The night budget and the lair count and cap are multiplied by the player count.

Because the night count keeps rising no matter what, staying small is never safe for long. The only way to keep up is to grow, and growing means going out into danger.

#### Reading the number tables

**Number tables.** Every number the game needs is in tables 1 to 19, each placed in the section it belongs to. Values Jade set are copied as they are; the rest are suggested and marked (s). Units: metres, seconds, pounds (lb), and worker-seconds (ws) for build and craft time, meaning the seconds one worker needs; up to 4 builders on a building (8 on a main base) each add a full share. Trade values are in value points (vp): 1 vp is the hidden value of 1 softwood lumber.

**Rules used by every table (suggested):**

- Damage taken = damage x (1 - armour %), rounded down, never below 1. Armour pieces add up and the total is capped at 75%. The roster's piercing and blunt modifiers apply per mob after that.
- Shields cut projectile damage only, by their block %, applied after armour.
- Fire burns wood: a burning wall, building or siege engine takes the listed burn per second until a worker repairs it or the burn ends.
- Experience: a kill is worth 2 x the mob's roster threat, shared equally among every player unit that hit it in the last 10 s; a creature with no threat value is worth its HP / 50 (minimum 1); clearing a lair gives 20 to every warrior within 20 m; a support mage earns 1 per 25 health healed in combat.
- Rank bonus: +5% damage per rank above the first for warriors and workers; spell power +10% per rank for mages; ranged spread -10% per rank.
- Nutrition is the food unit. Every unit, and every research facility, eats 2 nutrition per full day-night cycle, drawn evenly from the foods in stock (doc). All training and unit costs that say "food" are nutrition drawn the same way.
- Trade value is in value points (vp): 1 vp is the hidden value of 1 softwood lumber. Table 11 lists every item.

#### Table 8: Night spawn geometry

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Claimed land | 5 m around a lit torch and 10 m around a player building measured from its outer edge (Jade), plus any region enclosed by barriers that holds a player building (doc); no other light claims (Jade) |
| Dark edge | the line between explored and unexplored land; a spawn point sits on it at least 50 m from claimed land and 30 m from any player unit; if no such point exists the nearest unexplored spot 50 m from claimed land is used (s) |
| Light and units out in the dark | spawn weight x0.25 within twice a light's radius, x0.5 within three times; x0.5 within 20 m of a player unit; weights multiply (s) |
| Lair cadence | per player (Jade: the lair count and the cap multiply by the player count): 1 new lair every 3 nights to night 14, every 2 nights to night 44, 1 a night from 45, placed at dusk in a cell with no player building, preferring one next to claimed land, at least 40 m from claimed land; live lairs capped at 2 + night / 15 per player; a cleared site waits 10 days (doc, suggested) (s) |
| Outlying torches | lights more than 40 m from any main base count (wall torches count half); limit 4 + night / 5; dusk goblins: 3 cutters and 1 slinger per light over the limit, 1 chief per 5 over, at most 40 (s) |
| First night | budget 12 (roster) buys a fixed pick of 4 zombies, 2 cave bats, 2 giant rats, 1 giant spider and 1 slime (12.4 threat; the last pick may overrun by one mob), so all five of Jade's night 0 mobs come on night 0, with a single spider (s) |
| Budget factors | (12 + 3n + 0.04n2) x the player count (three players, three times: Jade) x town (1 + 0.02 x (player buildings - 10), never below 1) (s) x provoked (1 + 0.1 per village or kingdom at war + 0.05 per territorial creature hunting the player) (s), plus the depth weighting below |
| Depth weighting | each player unit or building standing outside the Heartland at dusk adds to that night's budget: Fringe 0.5%, Deepwoods 1%, Barrens 2%, Deadlands 4% each, capped at double the base budget; the extra mobs spawn at the dark edge nearest those assets and target them; deeper bands draw mob types from later nights (Deepwoods 10 nights ahead, Barrens 25, Deadlands 50) (s) |
| Split and picking | 80% at the dark edge, 20% shared equally among live lairs, counted across the whole world (Jade); with no live lair that fifth is not spawned, so clearing pays; a lair spawns only its own mob types; picks are weighted 3:1 towards mobs unlocked in the last 10 nights (s) |
| First appearance | a mob's first night sends at most 3 of it (lone mobs 1) (roster: a handful) (s) |
| Blood night | the longer night (6 min) with the budget doubled (roster) and the extra spent on the rarer existing mob types; no stronger variants (Jade); trigger (Jade): the players occupy 60% of a single band, after which that band's trigger is spent, so at most one blood night per band; the Deadlands have none because they are infinite; occupied means claimed cells reach 60% of the band's cells, checked at dusk; never before night 13 (a band crossed earlier fires on night 13); a message at dusk (Jade delegated these); a double horn (s) |
| Random night event | one event only (Jade), the fog night (doc, suggested): announced at dusk, sight and light radius halved for everyone, monsters spawn 20% closer (the 50 m stand-off becomes 40 m); (s): 10% chance a night from night 5 |

**How these were set:** a 50 m spawn stand-off and 1.4 m/s zombies give about 35 s between the dusk horn and the first zombie at a fence on the frontier, and about 60 s for a town 30 m inside its claimed edge, which leaves the 180 s night mostly for fighting.

### Light and torches

A lit torch extends the players' claimed land, where monsters almost never spawn (see "Threats"). Out in the unclaimed dark, light also lowers the chance of monsters spawning nearby: the closer a spot is to light, and to the players' units, the less likely a spawn there becomes. Light can only reduce the flow of monsters, never stop it, because monsters still spawn at the dark edge and in lairs and walk in.

- **Light sources:** torch posts (a wooden post with an iron cup) and wall torches (in an iron bracket). Suggested: iron braziers, and glass-and-iron lanterns once glass can be made.

To stop players from simply lighting the whole map:

- Several kinds of daytime creatures, including some that are not aggressive, destroy torches that are far from the base.
- If dusk finds too many torches lit outside the base, a large group of goblins spawns during dusk. Their main goal is to destroy the torches, and they attack players and their units as normal along the way.
- Suggested way to measure "too many": count the torches that are more than a set distance from any main base, and compare that with a limit that grows slowly with the night count. The more the count goes over the limit, the more goblins come.

#### Table 18: Lights

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Light** | **Light radius** | **Claimed radius** | **Fuel and burn** | **Cost** | **Build** | **Health** | **Spawn cut beyond its claim** | **Smashed by** |
|---|---|---|---|---|---|---|---|---|
| Torch post | 10 m (s) | 5 m (Jade) | 1 softwood lumber per 3 days; a worker refuels it, or the pool does automatically within 40 m of a main base | 2 softwood lumber, 1 resin (doc) | 10 ws | 40 | x0.25 to 20 m, x0.5 to 30 m | badger (beyond 40 m from a main base), goblins, kobolds (s) |
| Wall torch | 6 m (s) | 5 m (Jade) | as the post | 1 softwood lumber, 1 resin (doc) | 5 ws | 30, dies with its wall | x0.25 to 12 m, x0.5 to 18 m | goblins (s) |
| Campfire (cooking tier 1) | 8 m (s) | none (Jade) | 1 lumber per day | 5 softwood lumber | 10 ws | 60 | x0.25 to 16 m, x0.5 to 24 m | badger, wild boar, goblins (s) |
| Brazier | 14 m (s) | none (Jade) | 1 coal per day | 10 stone, 2 bronze ingots | 60 ws | 150 | x0.25 to 28 m, x0.5 to 42 m | goblins and hobgoblins only (s) |
| Lantern | 6 m (s) | none (Jade) | 1 resin per 5 days | 1 glass, 1 wrought iron, made at a Great Workshop in 20 s | 5 ws to hang | 20; 1 lb carried | as the wall torch | goblins (s) |
| Hand torch (carried, the Items table's torch) | 4 m (s) | none (Jade) | burns one day, then is used up (s) | 1 softwood lumber, 1 resin (doc) | 5 s at the Big House | 1 lb carried (s) | x0.5 within 8 m of the carrier (s) |  |

Snuff and Morvath's Crown of night put lights out without damage; a worker relights one in 2 s at no cost; a destroyed light is rebuilt from scratch (s). Which lights count against the dusk limit is in table 8.

### Threats

- **Where night monsters come from:** they spawn at the dark edge of the explored map and in lairs, then walk to their targets. They never appear at just any dark spot. Because they have to travel, the land, walls, trenches and water funnel them, and they follow the path of least resistance (see "Monsters and terrain"). Exploring in a direction pushes the dark edge away on that side.
- **Claimed land:** monsters almost never spawn inside the players' claimed land. Claimed land is any land within **5 m of a lit torch** or **10 m of a player building** (measured from the building's outer edge), plus any region fully enclosed by barriers (cliffs, water too deep to cross, walls and gates) that contains a player building. Enclosing land is strong but not absolute: climbers, flyers and wall-breakers are the counters.
- **Lairs** appear around the map over time, but never inside claimed land. They prefer cells next to it, so pressure builds at the frontier (see "Monsters and terrain").

#### Lairs

- **Two sources:** about 80% of each night's monsters come from the dark edge, which only exploring and claiming land can push back. The other 20% or so is shared among the live lairs, so clearing every lair drops a night to the edge's share alone. This split is for the whole world in total, not per band. Caves are not a third source: they are where cave-type lairs sit, and where monsters that flee the sun hide by day.
- **Clearing is a day job:** a lair has health like a building, a few sleeping monsters inside and a guardian (such as the giant centipede or myconid). Attacking it wakes them. When it falls, it leaves its destroyed version, workers can loot its hoard, and the warriors gain experience.
- **Loot:** a hoard of that lair's monster drops plus one valuable, scaled by depth band. The rule for all monster drops and hoards (Jade): a whole night's wave early on gives the players very little value, it grows slowly, and it is never a good way to build wealth.
- **Clear, then claim:** a cleared site cannot hold a new lair for about 10 days (suggested), and never once it is inside claimed land.
- **Lairs do not grow** if ignored. Great barrows are their own lair type that appears in the later undead nights.
- **Deadlands creatures (suggested):** the ash golem, a 3.5 m breaker of black rock that hunts players until one side is dead, and the mana wraith, a floating caster that drops mana crystals.
- **Ruins (suggested):** half-buried towers, walls and shrines of the old kingdom are scattered through the land as decoration and lair sites, and buildings players abandon become ruins too.
- **Lair types:** barrow, great barrow, mass grave, cave mouth, nest, goblin camp, Rift scar (from night 45) and Void rift (from night 80), each with a destroyed version. Each night mob has a lair type (see the mob roster file). Their models are on the models wishlist.
- Suggested: lairs show on the minimap once a unit has seen them, and Rift scars and Void rifts glow and can be seen from far off at night.
- **Wall-bypassing monsters:** climbers go over walls, flyers ignore them, and wall-breakers smash through. Wall-breakers can also break terrain, but prefer not to (see "Monsters and terrain"). There are no diggers that tunnel under defences.
- **Isolated buildings** are quickly destroyed at night, which makes spreading cheap buildings everywhere a losing strategy.
- **Tribes and villages** of hostile creatures and other races. There are three kinds of community: **neutral villages** that can be traded with (see "Neutral villages and trade"), **hostile villages** that cannot be traded with (goblins, see "Goblin villages"), and **hostile tribes**, roaming bands with no villages (see "Hostile tribes"). The neutral peoples so far are the Halflings, Runkin, Elves and Dwarves; more will be added later.

#### Table 15: Lairs

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Lair** | **From night** | **Health** | **Sleepers (asleep until attacked)** | **Guardian (awake)** | **Band** |
|---|---|---|---|---|---|
| Barrow | 0 | 400 | 4: zombies, skeleton archers from night 5, grave hounds from 20, a hollow priest from 40 | 1 giant centipede | any (s) |
| Cave mouth | 0 | 500 | 6: cave bats and giant rats | 1 giant centipede | foot of barrier edges (s) |
| Nest | 0 | 300 | 3 giant spiders, which are also its guard | none | caves and dead forest (s) |
| Mass grave | 10 | 600 | 3 bloated corpses, a plague bearer from 30 | 1 myconid | Fringe and deeper (s) |
| Goblin camp | 15 | 800 (4 huts of 200) | 6 cutters, 2 slingers | 1 goblin chief | Fringe and deeper (s) |
| Great barrow | 25 | 1200 | 5: 1 barrow knight, 2 grave hounds, 2 skeleton archers; a bone colossus from 35 | 2 giant centipedes | Fringe and deeper (s) |
| Rift scar | 45 | 2000 | 6 red demons of the current roster | 1 ash golem | Deepwoods and deeper; glows (s) |
| Void rift | 80 | 4000 | 4 purple demons of the current roster | 2 mana wraiths | Barrens and deeper; glows (s) |

Hoard (s): 10 rolls on the sleepers' drop tables (roster) plus one valuable by band: Heartland 1 silver, Fringe 1 gold, Deepwoods 1 emerald, Barrens 1 ruby, Deadlands 1 diamond; about 20 to 40 vp for an early barrow, which keeps Jade's rule that killing is never a way to build wealth. How many appear a night, and where: table 8 cadence; a type is picked among those unlocked, weighted to the newest. Minimap: shown once any unit sees it (doc, suggested); Rift scars and Void rifts are visible from 120 m at night (s). A lair's share of the 20% comes out of its mouth 20 s after night falls (s). Clearing gives 20 XP to every warrior within 20 m (header rule).

#### Night mobs

Only the mobs below take part in the nightly attacks. A new mob joins every 5 nights until night 110. The theme grows more demonic over time: nights 0 to 40 are the dead and the creatures of the dark, red demons arrive from night 45, and the purple demons of the Void, the most powerful things in the game, arrive from night 80. Most demons are red; only the really powerful ones are purple. Jade set the mobs up to night 10 and the goblins; the rest, marked "(suggested)", are Claude's ideas.

| **First night** | **Mobs** | **Role** |
|---|---|---|
| 0 | Zombie, cave bat, giant rat, giant spider, slime | Basic walkers, a low flyer, two climbers and a slow brawler |
| 5 | Skeleton archer | The first ranged enemy |
| 10 | Bloated corpse, skeleton bomber | Heavy melee that explodes on death; the first wall-breaker |
| 15 | Goblin warband | A mixed raiding pack that wants to put out your torches |
| 20 | Grave hound (suggested) | Fast pack that runs past the front line to reach workers |
| 25 | Barrow knight (suggested) | Armoured skeleton with a shield that blocks arrows |
| 30 | Plague bearer (suggested), gravewing (suggested) | Stops healing around it; a high flyer that snatches workers |
| 35 | Bone colossus (suggested) | Big undead wall-breaker |
| 40 | Hollow priest (suggested) | Necromancer that raises zombies; the last of the undead |
| 45 | Cinderling (suggested) | The first demon: small, red, sets timber on fire |
| 50 | Hellhound (suggested), Rift scorpion | Red demon dog pack with fire breath; the first Rift-touched beast |
| 55 | Fiend (suggested), Rift centipede | Red demon foot soldier; a venomous climber |
| 60 | Scorchwing (suggested), Rift hornet | Red winged demon that drops fire; a stinging swarm |
| 65 | Demon brute (suggested), Rift beetle | Red demon wall-breaker; a ramming small breaker |
| 70 | Flamecaller (suggested), Rift griffin | Red demon fire-caster, deadly to wooden defences; a heavy flyer |
| 75 | Chain fiend (suggested), Rift minotaur | Red climber that hooks archers off towers; a heavy brawler |
| 80 | Void stalker (suggested) | The first purple demon: invisible until it strikes |
| 85 | Infernal juggernaut (suggested) | Red armoured siege beast |
| 90 | Void witch (suggested) | Purple caster that drains health and mana |
| 95 | Abyssal drake (suggested) | Purple high-flying dragon |
| 100 | Archfiend (suggested) | Purple demon general that strengthens other demons |
| 105 | Rift colossus (suggested) | Huge purple breaker |
| 110 | Morvath, the Hollow Crown (suggested) | The demon lord, a boss. The last new mob |

- **Rift-touched beasts:** six existing creatures (scorpion, centipede, hornet, beetle, griffin and minotaur) also join the night attacks from nights 50 to 75 and stay for the rest of the game, as scorched, glowing variants of their daytime selves. Jade asked for six more mid-game night mobs; which six and their nights are suggested.
- **Morvath, the Hollow Crown** (the boss) first comes on night 110. Each time he is defeated he returns 10 nights later. His drops (20 mana crystals, 10 gold, 3 diamonds) are bigger than the small-valuables rule because he is a boss. Suggested: if he survives a night, he withdraws at dawn and returns the next night until beaten.
- **Late mob tricks (suggested)** (as built, 2026-10-03): plague bearer, a 6 m miasma of 1 damage a second that stops natural healing; gravewing, snatches lone workers within 30 m (40 damage, held 2 s); bone colossus, a boulder every 8 s; hollow priest, raises the dead every 12 s, at most 6; hellhound, a 5 m cone of breath, 24 over 2 s, every 8 s; fiend, attacks 40% faster below 30% health; chain fiend, a 10 m hook for 15 every 8 s; void stalker, seen only within 4 m unless lit, triple damage on its first strike out of the cloak; infernal juggernaut, 5 damage a second within 3 m of its sides, double damage taken from behind, never knocked back; barrow knight, blocks 60% of projectile damage from the front; void witch, a 10 m hex every 15 s and a 15 m blink every 10 s; abyssal drake, breath in a line 1.5 m wide; archfiend, +20% damage to monsters within 15 m and 4 cinderlings every 20 s; rift colossus, a 200 beam every 10 s; Rift scorpion, every other hit stings for 10 plus 30 poison; Rift hornet, slows by 30% for 3 s. High flyers circle at 12 m; breakers cave in the land ahead of them. Late mobs sleeping in a lair do not use their tricks.
- **Morvath in detail (suggested):** he comes for the first player still in the game. Crown of night puts out every light within 30 m. Ruin every 20 s: 3 s of warning, then 300 damage within 20 m. The Rift every 60 s: open for 30 s, a demon every 3 s. His spells start 20 s and 30 s after he arrives. Below half health he takes to the air and flies at 4 m/s.

After night 110 no new mobs arrive; nights keep getting harder through the night budget and the per-night strengthening.

- **Jade's rules:** giant spiders and giant rats climb walls. A bat is a flying melee attacker that swoops down to attack. The bloated corpse is a large melee attacker, twice as wide as a human and slightly taller, that does heavy damage and explodes on death, hurting nearby units. The skeleton bomber is a skeleton in a rusty helmet carrying a bomb as tall as a human torso; it runs to walls or barriers and blows up, but goes for clusters of troops instead if they are on its way. Mobs can drop small amounts of valuables now and then, never on every kill.
- **No friendly fire for monsters:** monster explosions and area attacks only hurt the players' units and buildings.
- **Climbers (suggested):** climbing is slow, a mob on a wall cannot attack and takes 50% extra damage, and rats and spiders will not climb a shut gate lit by a torch.
- **Valuables (suggested):** gold, silver and gems drop on at most about 1 kill in 20, one unit at a time. Common drops are ordinary resources.
- **Stronger over time (suggested):** every mob gains 0.5% health and damage for each night after its first. On a mob's first night only a handful come, so players can learn it.
- **Night budget (suggested):** each night spends a monster budget of 12 + 3 x night + 0.04 x night² on the unlocked mobs (about 12 on night 0, 262 on night 50, 826 on night 110), multiplied by the other difficulty factors in "Rising difficulty". Blood nights double it.
- **Wall-breakers** (the skeleton bomber, bone colossus, demon brute, infernal juggernaut and rift colossus) follow the existing rule: they can smash terrain and trench edges, but prefer not to (see "Monsters and terrain").
- **Goblins:** the goblin warband joins the nightly attacks from night 15. Separately, the dusk goblins that come for too many outlying torches (see "Light and torches") can appear from the start.
- **Full details:** each mob's stats, look, abilities, drops and lore, the suggested backstory (a fallen kingdom, the Hollow Priests and the Rift), and the daytime roles of every other creature are in the mob roster file (models/mob_roster.md). Creatures not in the table above never join night attacks; they are wild animals, territorial creatures, lair guardians or hostile tribes.

#### Hostile tribes

- Gnolls, kobolds and hobgoblins are **roaming bands with no villages**. Unlike the neutral races, they cannot be traded with and never make peace.
- **Where:** they spawn at random spots in the Fringe and Deepwoods and roam only those two bands.
- **Not near anyone:** they never spawn near the players' units or buildings, or near a neutral race's units or buildings (suggested: within 60 m, and never inside claimed land). If there is no room left to spawn, they stop spawning.
- **Hard cap:** at most 20 tribesmen per player in the world at once (suggested), counting individual tribesmen, not bands (suggested).
- **Who they attack:** any group they find, players and neutral races alike, including Elf caravans and Halfling and Runkin villages. They chase anything they find, even out of their own bands (suggested: they give up after losing sight of the target for 20 seconds, then wander back).
- **Daytime only:** they fight by day. Suggested: at dusk a band makes camp where it is and only fights if attacked; it never joins night attacks, and night monsters leave it alone. Band sizes and stats are in the mob roster file.

#### Table 16: Hostile tribe bands

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Band sizes | gnolls 3 to 5, kobolds 4 to 6, hobgoblins 3 or 4 (roster) |
| Spawn | one band every 2 days while the world holds fewer than 20 tribesmen per player (roster; per player (s)); the first band on day 3 (s); tribe odds Fringe 40 / 40 / 20, Deepwoods 20 / 30 / 50 for gnoll / kobold / hobgoblin (s) |
| Keep-away | 60 m from any unit or building of the players or a neutral race, and outside claimed land (roster); nothing spawns if no spot is free (doc) |
| Chase | 20 s after losing sight, then wander back (roster); bands never leave the Fringe and Deepwoods (doc) |
| Dusk camp | a 6 m circle with a fire (light radius 6 m, no claim), fights only if attacked, ignored by night mobs (roster) (s) |
| Sight and targets | sight 30 m (s); a band attacks the first unit, building, caravan or village it sees; buildings are hit with roster "vs walls" damage of 4 (gnoll), 2 (kobold), 8 (hobgoblin) (s) |
| XP and loot | XP by the header rule (gnoll 3, kobold 1, hobgoblin 4); loot roster 6.1 |

#### Goblin villages

- Goblin villages are **hostile villages**: they cannot be traded with, and their goblins attack anyone who comes near. They also attack neutral races they come across. They are rare in the Fringe and common in the Deepwoods.
- **Units:** standard goblins, goblin archers, goblin wolf riders and the goblin mage. Wolf riders are mounted, so the charge rule applies to them (see "Charges").
- **Looks:** goblins are **1.2 m** tall. Suggested: green-grey and wiry, in scraps of leather. Archers carry short crooked bows and a quiver of mismatched arrows. Wolf riders sit on large grey wolves with a bone-and-leather saddle. The goblin mage is hunched, wrapped in a ragged hide cloak hung with pebbles, and carries a gnarled stick with a hexstone tied to the tip. Their villages are clusters of crooked huts of sticks, hides and scavenged planks around a smoky fire pit, behind a ring of sharpened stakes.
- **Goblin mage:** a weak caster, like all goblins, with three goblin spells (suggested): **Snuff** puts out a torch or other light from a distance; **Stumble hex** slows one unit's movement and attacks by 20% for 4 seconds; **Spark toss** throws a small fire bolt that does light damage and can set dry wood smouldering.
- **War:** goblins do not declare war on whoever they meet. They only fight what comes near, until someone kills more than 4 of them, or kills one and destroys one of their buildings. Then they **declare war** and come looking for that side instead of waiting. They can also declare war on neutral races, and players are alerted in the message panel when they do. Suggested: when a player is one kill away from starting a war with a goblin village, the message panel warns them.
- **Lights:** goblins like to destroy the players' torches and lights. Because lit torches keep night spawns away (see "Claimed land"), a daytime goblin raid on torches lets night monsters spawn closer that night.
- **Night mobs:** goblins get on well with the night mobs. Night mobs never attack goblins or goblin villages, so unlike other villages, goblin villages are not attacked at night.
- **Drops:** iron weapons, leather, rarely a small amount of silver or gold, and **hexstone** (see "Additional resources").
- Village goblins stay home at night. The goblin warband in the night attacks (from night 15) spawns at the dark edge like other night mobs.
- **Village extras:** a totem pole hung with hexstones and skulls, and a wolf pen. Night-raid goblins also include **goblin slingers** and a **goblin chief** with a dented helmet and a big cleaver.
- **Territorial creatures** react to players entering their territory. Some leave as soon as the players leave, some chase them a long way past it, and some hunt the players once disturbed until either side is dead.

#### Table 17: Goblin villages

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value** |
|---|---|
| Frequency | Fringe 1 village per 12 cells, Deepwoods 1 per 4 cells, never in the start basin (s) |
| Size | Fringe 3 or 4 huts, Deepwoods 4 to 6; a fire pit, a totem and a stake ring; a wolf pen from 4 huts (s) |
| Units | 2 goblins per hut, 2 archers per village, 1 wolf rider per 2 huts (needs the wolf pen), 1 goblin mage in every Deepwoods village and half the Fringe ones; stats roster 6.3 (s) |
| Buildings | hut 200 HP, fire pit 100, totem 150, stake ring 150 per column, wolf pen 300; broken down by workers for 5 sticks and 2 hides a hut (s) |
| Aggro | attack anything within 25 m of the stake ring, chase 40 m, then go home (s) |
| War | threshold as the doc; at war, 60% of the fighters (at least 4) march on that side's nearest building each day 30 s after dawn, putting out lights on the way, and go home at dusk; a village at peace rebuilds 1 hut per 5 days up to its size (s) |
| Dusk torch horde | table 8: 3 cutters and 1 slinger per light over the limit, 1 chief per 5, at most 40 (s) |
| Spells | Snuff 20 m (roster), puts out one light, 8 s cooldown; Stumble hex 14 m, 6 s cooldown; Spark toss 14 m, 8 damage and sets dry wood smouldering 2 per s for 5 s (roster 8 + smoulder), 3 s cooldown; mage mana 60, refill 1 per s (s) |

**How these were set:** a Deepwoods village of 5 huts fields 10 goblins, 2 archers, 2 wolf riders and a mage (about 25 threat on the roster scale), which is a fair fight for 6 bronze warriors and a hard one for 3.

### Neutral villages and trade

- Neutral villages are the tribes that can be traded with. The deeper they are, the larger and grander they get, and the better their trades.
- Villages and mercenary camps are only generated when players discover them, so nothing can happen to them before that. Once discovered, they are attacked by monsters like the players are.
- **Where they turn up (suggested):** each newly explored cell has a chance to hold one (one cell in N, table 11): Runkin camps 1 in 12 in the Heartland, 1 in 6 in the Fringe, 1 in 16 in the Deepwoods, none further out; Dwarf colonies 1 in 6 in the Barrens; Dwarf cities 1 in 120 in the Deadlands; mercenary camps 1 in 20 in the Fringe and Deepwoods; wandering Elf caravans 1 in 6 in the Fringe and Deepwoods until a player has met the Elves. Halfling villages are placed with the world (table 9) and the one Elf kingdom sits one ring into the Deepwoods at a seeded place around the ring. A new camp or village is at least 40 m from the players when found and 60 m from any other village, camp or goblin village.
- **Bigger and richer further out (suggested):** by band (Heartland, Fringe, Deepwoods, Barrens, Deadlands) a village has 100, 100, 125, 150 and 175% of its usual people and 100, 125, 150, 175 and 200% of its usual stock. Usual sizes are in table 11.
- Each village has a **specialisation**. Villages generally offer basic raw materials and ingots. Suggested: each Halfling village leans to one trade (crops, livestock, fishing or weaving), which sets what it sells cheaply and what it pays well for.
- **Mercenary camps** are separate places where recruits can be hired. Suggested: small neutral camps in the Fringe and Deepwoods that hire out two to six warriors for one day, paid in silver (2 silver each until dusk). They fight for whoever paid last and walk home at dusk. Right click the camp with any unit to hire. A camp gains one recruit back every 2 days. Fringe camps hire out Runkin archers and Halfling spearmen; Deepwoods camps hire out Elf Bladewardens and Dwarf crossbowmen.
- Once a village has been found, trade happens through a **trade menu**, opened by talking to the village leader or by using some of its buildings (right click the leader or building with any unit). Goods go straight between the player's resource pool and the village; nothing has to be carried.
- Trade is barter. The player puts up an offer, and the village answers with a few choices of what it will give in return. The player picks one, or withdraws the offer.
- Every item has a **hidden value** that drives what a village will offer.
- **Trinkets** made at the workshop are made for trade (see "Trinkets").
- **How a trade works:**
  - **Opening:** right click the village leader, a trade building or an Elf caravan with any unit. Trade only opens while the player has a unit within about 15 m (suggested), and never during a war.
  - **The trade menu** has three parts: the village's stock (what it sells today), its wants (what it pays well for, with the goods it refuses greyed out), and the offer box. There are no coins and no prices on screen. Every good has a hidden value in value points (see table 11), and a rough worth bar under the offer box shows how good the deal is (suggested).
  - **Making an offer:** the player drags goods from their pool into the offer box. The village weighs them by how much it wants each one (table 11) and answers with **3 bundles** of about that worth from its stock (each worth 85 to 100% of the offer (suggested)). The offer box takes up to 8 different goods (suggested). The player takes one bundle, or withdraws the offer and loses nothing.
  - **Limits:** a village buys at most about 300 value points of one kind of good a day, and its stock refills about 20% a day (table 11). Elf and Dwarf limits are in table 19.
  - **Mood (suggested):** offering a village the same goods again after turning down its answer three times in a day makes it close trade to that player until the next dawn. Refusing an answer otherwise costs nothing.
  - **What each people will not take:** Halflings refuse raw gold, silver and gems. Elves are insulted by lumber and close trade to that player for a day. Goods a people refuses are greyed out in its menu.
  - **Elf caravans** come to the player once the Elves have been met: about every 5 days a caravan stops outside the player's main base, trades through the same menu, and leaves at dusk (suggested). Its stock is in table 19. Dwarves send no caravans; players go to their colonies and cities.
- Different types of community favour certain items over others, so the same offer can get a much better answer from one village than another.
- **War:** a player can turn a neutral village hostile by attacking it on purpose, with the Attack command clicked directly on its people or buildings. This starts a **state of war** that lasts until one side is eliminated or the village surrenders. During a war, the player's units attack the village's people automatically, like any other hostile.
- An attack order on a neutral village never starts straight away. A pop-up first asks the player to confirm the war. If the player cancels, no order is given. Attack-move, patrol and idle units never target a neutral village.
- In multiplayer, a war started by one player draws in **all of their allies** automatically, whether they wanted it or not.
- **Surrender:** when a neutral people surrenders, the player gets their things as described for the Halflings (livestock, the remaining fighters' weapons and some loot). Elves and goblins never surrender. A Dwarf faction holds a grudge and starts attacking again once it has regained its strength in a new place.
- **Plunder:** winning a war against a village that keeps livestock gives the player its livestock. The loot also holds food and metal by people (suggested): Halflings bread and wrought iron, Runkin meat and flint, Elves bread and steel, Dwarves bread and wrought iron.
- **How their fighters behave (suggested):** defenders go for enemies within 40 m of the middle of their village and chase up to 60 m. Raiders set out 70 m from their target. At war, the Elves send a band of 6 every 2 days. Villagers who flee or migrate vanish once 60 m from home or after 60 seconds.
- **Daily life (suggested):** villagers wander up to 10 m from home; the peoples heal 1 health every 2 seconds after 10 seconds out of a fight; a faction at peace gains back one lost person every 3 days.
- **Abandoned buildings** of other races cannot be used. The only thing players can do with them is send workers to break them down, which gives back the resources they were built from (right click or A the building with workers (suggested)).

**Peoples.** Each neutral village belongs to a people with its own looks, homes, tastes in trade and way of fighting. The four peoples so far, the Halflings, Runkin, Elves and Dwarves, are below; more will be added in later iterations.

#### Table 11: Trade values, village stock and wants

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** 1 vp = 1 softwood lumber; a made item is worth 2 x its recipe inputs; a trinket 2.5 / 3 / 3.5 / 4 x its metal by tier and 5 x for the special pair.

| **Item** | **Value (vp) (s)** |
|---|---|
| Softwood lumber 1, hardwood lumber 2, sticks 0.5, planks 1.5, stone 1, flint 1, clay 1, sand 1, gravel 0.5, Earth 0.2, bricks 1, glass 3, resin 1, bone 1 | raw and simple goods |
| Coal 2, charcoal 1.5, copper ore 2, tin ore 3, bog iron 2, iron rock 2, vein iron 4, lead ore 3, saltpetre 4, sulphur 6, marble 6 | minerals |
| Meat 3, fish 2, eggs 1, wheat 1.5, potatoes 1, carrots 1, corn 1.5, flax 1, herbs 2, hides 3, leather 4, feathers 0.5; cooked foods 0.75 x nutrition (bread 4, roast meat 5, stew 9, pie 12); bandage 5, remedy 15 | food and farm goods |
| Copper 5, tin 7, bronze 6, wrought iron 9, pig iron 11, iron 24, steel 30, carbon steel 60; gunpowder (10 charges) 16 | ingots and powder |
| Gold 40, silver 15, emerald 50, ruby 60, diamond 100, mana crystal 30, demon horn 20, hexstone 10, venom 5, spider silk 3 | valuables and monster goods |
| Any engine or cart: 2 x the sum of its recipe (bronze cannon 280, iron cannon 256); weapons, armour and tools are no longer items (2026-10-03) | made goods |
| Token 1 ingot x2.5 (copper 12, gold 100); Charm 2 ingots x3 (copper 30, gold 240); Brooch 4 ingots x3.5 (copper 70, gold 560); Heirloom 6 ingots x4 (copper 120, gold 960); Moonleaf 3 silver + 2 emeralds x5 = 725; Sunheart 3 gold + 2 rubies x5 = 1200; made in 15 / 30 / 60 / 120 / 180 / 240 s | trinkets |

How a village pays (s): it values the player's offer at the share below and answers with 3 bundles of that worth from its stock; it sells at 100% of value; it buys at most 300 vp of one category a day and its stock refills 20% a day.

| **People** | **Pays for** | **Stock it sells** | **Refuses** |
|---|---|---|---|
| Halflings (Heartland) | food 110%; tools and weapons 70%; metal ingots 60%; trinkets 50%, silver and gold trinkets 35%; lumber 30%; anything else 50% (s) | wheat, potatoes, carrots, corn, eggs, meat, bread; live hen 8, cow 40, ox 60; shortbow (bow stats, 20 m range) 10; shortsword (bloom iron, 16 / 1.1 s) 20; buckler (blocks 10%, 4 lb) 8; bloom iron ingots 8 (s) | gold, silver, gems (doc) |
| Runkin (Fringe, some Deepwoods, rare Heartland) | tools, bows, metal weapons 110%; food 100%; trinkets 80%, silver and gold trinkets 70%; raw gold and silver 70%; lumber 40%; else 50% (s) | fish, meat, hides, sticks, flint, herbs, bone, feathers (s) | nothing; at war their wolves fight (doc) |
| Elves and Dwarves | table 19 | table 19 | lumber (Elves) |
| Mercenary camps (doc, suggested) | paid in silver (doc): 2 silver per warrior for the day (s) | small neutral camps in the Fringe and Deepwoods, 1 per 20 cells (s), hire out 2 to 6 warriors for one day; they fight for whoever paid last and walk home at dusk (doc); (s): Runkin archers and Halfling spearmen in the Fringe, Elf Bladewardens and Dwarf crossbowmen in the Deepwoods |  |

Specialisations (doc, suggested): each Halfling village leans to one trade (crops, livestock, fishing or weaving), selling that good at 80% and paying 130% for what it lacks (the percentages (s)); (s): Runkin camps lean to fish, hides or herbs, Dwarf colonies to one metal or gem, Elf caravans to one weapon. Surrender (doc): as for the Halflings (livestock, the fighters' weapons and some loot, which I set at 10 vp per villager in food and metal); Elves and goblins never surrender; a Dwarf faction holds its grudge and attacks again once it has rebuilt elsewhere.

**Milestone 7 picks (s), added 2026-10-02 from what was built (blueprint/m7-picks.md)**

| **Rule** | **Value (s)** |
|---|---|
| Discovery, one cell in N (Heartland, Fringe, Deepwoods, Barrens, Deadlands) | Runkin camps 12, 6, 16, never, never; Dwarf colonies Barrens 1 in 6; Dwarf cities Deadlands 1 in 120 (doc); mercenary camps Fringe and Deepwoods 1 in 20; wandering Elf caravans Fringe and Deepwoods 1 in 6 until a player meets the Elves; Halfling villages at table 9's sites |
| Placement | Elf kingdom one ring into the Deepwoods at a seeded place round the ring; new factions at least 40 m from the players when found and 60 m from each other and from goblin villages |
| Halfling village | 4 burrows, inn, mill, barn; 4 men, 4 women, 4 spearmen, 2 archers; 4 hens, 2 cattle, an ox |
| Runkin camp | 3 tents, fire, drying rack, wolf den; 3 men, 3 women, 4 archers, 2 clubbers, 3 wolves |
| Elf kingdom | 3 halls, gate, bear pen, 4 tree platforms; 8 villagers, 6 Bladewardens, 6 Longbow rangers, 2 Grovesingers, 3 bears |
| Elf caravan | a wagon, a caravan master, 2 Bladewardens, 2 rangers |
| Dwarf colony | forge, mineshaft, 3 houses; 4 villagers, 3 Shieldbearers, 2 Hammerguard, 3 Crossbowmen |
| Dwarf city | hall, gate, 2 forges, 2 mineshafts, 6 houses; 10 villagers, 8 Shieldbearers, 6 Hammerguard, 8 Crossbowmen; plus 6 Gunners, 4 Cannon crew (both grow with the band) and 2 Dwarf cannons inside the gate (M8, 2026-10-03) |
| Deeper is larger and richer, by band | people 100, 100, 125, 150, 175%; stock 100, 125, 150, 175, 200% |
| Payment by kind (food, tools and weapons, armour and shields, ingots, trinkets, silver and gold trinkets, lumber, raw gold and silver, gems, livestock, other) | Halflings 110, 70, 50, 60, 50, 35, 30, refuse, refuse, 50, 50; Runkin 100, 110, 50, 50, 80, 70, 40, 70, 50, 50, 50; Elves 100, 60, 60, 60, 130, 130, insulted, 100, 100, 60, 60; Dwarves 110, 50, 50, 80, 100, 100, 50, 110, 110, 50, 50 |
| Bundles and offer | each of the 3 bundles is worth 85 to 100% of the offer; the offer box takes up to 8 different goods |
| Specialisation | the lean good sells at 80% and is stocked double; what the lean lacks pays 130% |
| Plunder food and metal | Halflings bread and wrought iron; Runkin meat and flint; Elves bread and steel; Dwarves bread and wrought iron |
| Values not listed above | iron ingot as wrought iron; rope as two flax; ramp steps and a lantern as twice their inputs |
| War | Elf war band of 6 every 2 days; raiders start 70 m out; defenders take enemies within 40 m of the middle and chase up to 60 m; leavers vanish 60 m from home or after 60 s; Runkin look up to 200 cells away for a new camp; Elf tree warnings from an Elf within 30 m, at most one every 20 s, the third is war |
| Caravans | start 60 m out and stop 14 m from the main base; a wandering caravan leaves at the second dusk after it was found |
| Mercenaries | 2 silver each until dusk; a camp hires out 2 to 6 and gains one back every 2 days; Fringe camps Runkin archers and Halfling spearmen, Deepwoods camps Elf Bladewardens and Dwarf crossbowmen |
| Daily life | heal 1 health every 2 s after 10 s out of a fight; a faction at peace gains back one lost person every 3 days; villagers wander up to 10 m; important lines reach the panel when a player unit is within 30 m or the speaker is on screen; a Dwarf colony's first trade names the direction of the nearest city |
| Speech | remarks about every 9 s from a unit on screen; bubbles 3.5 s plus 40 ms per letter, at most 10 at once; urgent messages are alerts, idle workers and nightfall |

Troop rework (2026-10-03, (s), Open for Jade's rebalance): weapons, armour and tools are no longer items, so wherever a people above or in table 19 sold or bought one, it now trades the ingots and materials that made it at the same value: Halfling shortbows, shortswords and bucklers become their wood, leather and wrought iron (bloom iron is gone), and their bloom iron ingots become wrought iron.

#### Halflings

- **Where:** only in the Heartland. All Halfling villages are placed when the world is generated from the seed (they are drawn only once found). No new ones appear during a game, so once the Halflings are wiped out, they are gone for good. How many there are and where they sit is in table 9.
- **Who they are:** a down-to-earth farming community. Males are 1.5 m tall and females 1 m, in a mix. Light brown skin and blonde hair.
- **Homes:** burrows with wooden doors and little windows, plus some stone and wooden buildings above ground, mostly for farming.
- **What they want:** food and trinkets. They undersell trinkets, giving much less than a trinket is worth, especially for trinkets of the more valuable metals. A gold trinket still gets more in return than a copper one, just nowhere near its value.
- **What they refuse:** gold and silver, raw or as ingots, and gems. They do not value them at all and will not accept them.
- **What they sell:** farm goods, including live livestock for the player's own farms, and leather, hardened leather and wrought iron ingots. They can make iron, but only the lowest grade (wrought iron).
- **Buildings:** a little windmill, a two-storey inn half dug into the hill, and barns. Halfling spearmen wear an iron cap and carry a short spear.
- **War oxen (suggested):** a village keeps 2 war oxen in its barn (more in richer villages). When a war starts, a spearman takes each ox with an archer behind him; the archer gets down if the ox falls.
- **Ox riders:** only in times of war, Halflings ride oxen into battle with two riders on each: a spear-wielding Halfling in front and an archer behind. An ox rider can attack in melee and at range while it moves.
- **War:** they fight if they must, and offer to surrender once more than half of them have died. If the player accepts the surrender or defeats them, the player gets their livestock, the weapons of their remaining fighters and a little general loot dropped at the village. The remaining Halflings flee to the edge of the explored land and disappear there.

#### Runkin

- **Where:** most common in the Fringe, uncommon in the Deepwoods, and rare in the Heartland.
- **Who they are:** a friendly hunter-gatherer people. Males and females are both 1.5 m tall, in a mix. Pale skin with light brown blotches, and long dark hair.
- **Homes:** tents made from animal hides.
- **Competition:** they hunt and fish around their camp, competing with the player for the limited fish and game. They never fight over it unless the player starts a war.
- **What they want:** tools, bows, metal weapons, trinkets and food. They undersell gold and silver, giving less than it is worth, though still more than for a copper trinket.
- **What they sell:** their catch (fish and game), the kinds of sticks that grow near their camp, flint and medicinal herbs.
- **Fighters:** mostly archers, who can walk (but not run) while shooting a bow. Some fight with hardwood clubs and flint spears.
- **Wolves:** the Runkin keep friendly wolves. If the player goes to war with them, the wolves are turned against the player.
- **War:** like the Halflings, they offer to surrender once more than half of them have died, and surrender or defeat gives the player their livestock, the weapons of their remaining fighters and a little loot from the village. The rest flee to the edge of the explored land and set up a new camp there (searching up to 200 cells away (suggested)), as long as that spot is in the Heartland, Fringe or Deepwoods. Once the players have explored every place in those three bands that could hold a village, the Runkin run off the map instead and disappear.
- **Camp buildings:** hide tents, drying racks, a wolf den (a hide windbreak and scratched post) and a communal fire ring.

#### Elves

Rows and lines marked "(suggested)" are Claude's ideas to fill gaps, for Jade to keep, change or drop.

- **Where:** only **one kingdom** in the whole game, somewhere in the Deepwoods, and it is very large. Its name (suggested): Sylvareth.
- **Caravans:** the Elves send travelling caravans inland (the Deepwoods, Fringe and Heartland, never the Barrens or beyond), so players can trade with them before finding the kingdom. Suggested: attacking a caravan starts a war with the whole kingdom. A wandering caravan found in the Fringe or Deepwoods before the Elves are met leaves at the second dusk after it was found; once met, caravans set out 60 m from the main base and stop 14 m from it.
- **Who they are:** androgynous-looking, with long hair. Suggested: tall (about 1.9 m) and slender, with pale grey-green and silver clothing.
- **Homes:** they like wood and marble in their buildings but use other materials too. Suggested: tall marble-footed halls built around and up into giant living trees, linked by wooden walkways.
- **What they want:** they value **trinkets** highly.
- **Lumber offends them.** Offering lumber in trade insults them. Suggested: they close the trade menu to that player for one day.
- **What they sell:** many kinds of goods, including food, and **carbon steel ingots** at a very high price, so buying them is never a cost-effective way to arm an army.
- **Cutting trees in the Deepwoods:** if an Elf (from the kingdom or a caravan) actually sees players cutting down trees in the Deepwoods, they warn them to stop (suggested: an Elf within 30 m warns, at most once every 20 seconds). After a few warnings (suggested: three) they **declare war** and try to wipe the player out. Cutting trees where no Elf can see it, or outside the Deepwoods, does not bother them.
- **War:** the Elves **never surrender**. A war with them lasts until one side is gone.

**Elf units:** Jade's list is skilled warriors, archers, tamed bears and bear riders. Suggested units:

| **Unit** | **What it does (suggested)** |
|---|---|
| Bladewarden | Skilled warrior with a carbon steel glaive (a polearm). Fast and hard-hitting, lightly armoured. |
| Longbow ranger | Archer with the longest bow range in the game. Can walk while shooting, like the Runkin, and its arrows have carbon steel tips. |
| Tamed bear | Fights on foot alongside the Elves. Big, tough, and swipes in an arc. |
| Bear rider | An Elf warrior riding a bear. Charges like cavalry (see "Charges"), knocking back anything smaller than the bear. |
| Grovesinger | Elf mage (see below). |

**Elf mages (Grovesingers) (suggested).** They work differently from the players' mages:

- They cast with **living-wood staves** instead of wands, and men and women both become mages. (suggested)
- Their mana refills faster near living trees and much slower in barren land, so they are strongest at home in the Deepwoods. (suggested)
- Their spells are nature magic (suggested):
  - **Rootbind:** roots burst from the ground and hold enemies in an area in place for a few seconds (non-projectile).
  - **Thorn volley:** a spray of thorns that flies like arrows (projectile, blocked by walls like arrows).
  - **Barkskin:** allies in an area take less damage for a while.
  - **Mending bloom:** flowers spring up and heal allies standing on them over time.
  - **Call of the wild:** wild animals nearby join the fight for a short time.

**What Elves say (suggested):**

  - First meeting: "You walk under old trees, stranger. Walk gently."
  - Trading: "A fine piece. The smith had patience." / Offered lumber: "You bring us the bones of our forest?"
  - Tree warnings: "Put down the axe." / "The forest remembers. Stop." / "Last warning, axe-bearer."
  - Attacked or at war: "Then the forest will have you."
- **Other buildings:** ring platforms around the great trees, bear pens, and a gate of marble pillars with a carved-leaf arch. Caravans travel in covered wagons pulled by two horses that fold open into a market stall.

#### Dwarves

- **Where:** small **colonies** in the Barrens, and big but rare **cities** in the Deadlands (about one city for every 3 rings of cells, which is roughly 1 in 120 cells, so they are very rare). Once a player has traded with a Dwarf colony, it tells them the direction and rough distance to the nearest city. There are no roads leading there.
- **Who they are (suggested):** short (about 1.3 m) and very broad, with braided beards and heavy, practical clothing.
- **Homes:** sturdy-looking stone buildings, and their own **mineshafts**.
- **What they want:** food, precious metals and trinkets. They also buy **lumber**, paying more for it than other races do, though still not much.
- **What cities sell:** cannons, muskets and high-quality armour at about **three times** what they would cost a player to make, plus gold and gems. They also sell **gunpowder and shot**, so a bought musket or cannon can be used.
- **What colonies sell:** a small amount of good steel, but mostly lower-quality metals and weapons, plus gems.
- **Factions:** each colony and each city is its own faction. A war, and the reparations to end it, only involve that one colony or city.
- **War:** Dwarves fight until half of them are dead, then **migrate away**. That group stays at war with the player for good unless the player pays **reparations**, which are very expensive. A migrated group first tries to survive and rebuild, and only then starts attacking the player again. Suggested: it rebuilds for about 10 days before raiding.
- **Other buildings and gear:** a stone forge with an iron chimney, pillared halls, and city gates carved into cliffs with two guardian statues. Dwarf cities field their own cannons, and colonies haul goods on iron-shod sleds dragged by oxen.

**Dwarf units (suggested):**

| **Unit** | **What it does (suggested)** |
|---|---|
| Shieldbearer | Heavily armoured, with an axe and a large shield. Slow, very hard to kill, and holds chokepoints. |
| Hammerguard | Two-handed war hammer. Smashes through shields and walls faster than other units. |
| Crossbowman | Colonies and cities. Short range, hard-hitting bolts. |
| Gunner | Cities only. Musket, slow to reload. |
| Cannon crew | Cities only. Defends the city walls. |

- Suggested, as built: a city's garrison adds 6 Gunners, 4 Cannon crew and 2 Dwarf cannons inside its gate (always 2, never for sale) to its 10 villagers, 8 Shieldbearers, 6 Hammerguard and 8 Crossbowmen. A city sells 1 cannon a day in total, bronze or iron, whichever is bought first, and 3 steel muskets a day.
- Suggested: Dwarves have no mages; their strength is their gear and their stone walls.

**What Dwarves say (suggested):**

  - First meeting: "Surface folk. Mind where you step, it's all ours below."
  - Trading: "Fair metal, fair price. Well. Our price." / Offered lumber: "Wood? Fine, fine. Not worth much down here."
  - Retreating: "This isn't over. We remember every grudge." / Reparations paid: "Paid in full. We'll forget. Mostly."

**What Halflings and Runkin say (suggested):**

  - Halflings, first meeting: "Oh! Visitors! Mind the cabbages." Trading: "Ooh, shiny. Not much use for it, but shiny." Attacked: "Ruffians! Ring the bell!"
  - Runkin, first meeting: "Hunters? Good. Take only what you need." Trading: "A good blade. Our wolves will eat well." Attacked: "Wolves! Bows!"

#### Table 19: Elf and Dwarf price lists

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Seller** | **Sells (price in vp) (s)** | **Pays for (s)** | **Limits (s)** |
|---|---|---|---|
| Elf caravan (every 5 days once met; also at the kingdom) | bread 5, roast meat 5, smoked fish 7, wheat 2, flax 1, herbs 2, bandage 5, healing remedy 15 (all 120% of value); HQ steel sword 1500, HQ steel pike 1600, HQ steel glaive (steel halberd stats, 45 damage) 1800 (4 x their value, so never cost-effective, as the doc wants) | trinkets 130%; food 100%; gold, silver, gems 100%; else 60% | a caravan carries 1 weapon and 200 vp of food a visit; the kingdom 3 weapons a day; lumber offered closes trade to that player for 1 day |
| Dwarf colony (Barrens) | steel ingot 45 (1.5 x), at most 5 a day; bronze 6, wrought iron 9; bronze, wrought iron and iron at 1.5 x value (weapons and shields are no longer items, 2026-10-03); emerald 50, ruby 60, diamond 100 | food 110%; gold, silver, gems 110%; trinkets 100%; metal 80%; lumber 50% (more than anyone else, still not much); else 50% | after the first trade it gives the direction and distance of the nearest city (doc) |
| Dwarf city (Deadlands, about 1 in 120 cells) | at 3 x make cost: bronze cannon 420, iron cannon 384, musket 102, steel plate 564, steel sallet 102, steel heater shield 282, wrought iron mail 120, steel sword 288; gold 40, gems at value, gunpowder (10 charges) 48, lead shot (10) 12, cannonballs 30; HQ steel ingot 90 (1.5 x), at most 2 a day (the doc's richer-far-out rule, still rare) | as the colony | 1 cannon a day in total (bronze or iron, whichever is bought first; the other waits for the dawn restock) and 3 steel muskets a day; powder horns and shot pouches at 1.5 x value; its own 2 Dwarf cannons inside the gate are not for sale |
| Reparations (either faction) | 2000 vp plus 100 per Dwarf killed, in gold, silver, gems, trinkets or food |  | a migrated group rebuilds for 10 days (doc, suggested), then raids with a band of 6 every 3 days until paid |

Troop rework (2026-10-03, (s), Open for Jade's rebalance): Elf high-quality steel weapons become carbon steel ingots at the same 4 x value, and Dwarf muskets and armour become the carbon steel or steel that made them at the same 3 x make cost; cannons, gunpowder and cannonballs are unchanged. Lead shot is gone, since ammunition is unlimited.

**How these were set:** a Gold Heirloom (960) and a Copper Token do not buy one Elf sword (1500), and a Dwarf city cannon (420) is about two days of a tier 3 mineshaft's gold at Fair; both keep the doc's "very expensive" and "about three times".

### The world

- The map is **endless** in practice. It is procedurally generated as the players explore, out to a world edge 100 km from the start, a nine-hour run that no game will reach. An advanced AI system (Fable) will be used to help design procedural generation that fits the game.
- **Fog of war:** unexplored land is black, and land that has been explored but is not currently seen is greyed out.
- **Vision as built (shared vision patch, 2026-10-03, (s)):** a player's buildings see as units do, out from their outer edge: the main base and towers 20 m, braziers 14 m, every other building 10 m (BUILDING_SIGHT_M, halved on a fog night), from the moment the foundation is laid. The players are one side with one picture: land any player explores is explored for all, everyone sees what any player's units and buildings see now, and lairs, villages and peoples one player finds are marked for all. Units sheltering or working inside a building see nothing of their own; a tower's or parapet's garrison and a cannon in a port still do. An Attack keeps its target while anyone on the side sees it. Night spawns keep their stand-off from every player's claimed land, since the dark edge is shared.
- **Cells:** the world is laid out as a network first and filled in afterwards. It is divided into **cells**, like a slightly uneven honeycomb. Near the start, each cell is roughly 150 to 200 m across (about 50 to 67 seconds of running at a warrior's base speed of 3 m/s, see "Warriors"), and cells get bigger farther out. Every cell can be worked out from the world seed and its own position alone, so the world can be generated in any order and comes out the same on every computer.
- **Cell sizes:** the first two rings of cells around the start basin are 150 to 200 m across. Each ring after that is about 10 to 30% larger than the one before, until cells are about 2.5 times the starting size (about 375 to 500 m across). From there on, cells stay around that size, give or take 30%. The Barrens begin where cells reach this full size.
- **Scale:** with cells growing by about 20% per ring on average, they reach full size about 7 rings out, so the Barrens begin roughly 1.6 km from the start: about a 10-minute run at a warrior's base speed.
- **What bigger cells mean:** barrier edges get farther apart the deeper the players go, so deep land has much longer open frontiers to hold. Together with deep land being more broken, the deep cells are big, with rough insides (mesas, ravines and the rare plateau) and perimeters far too long to wall. That is why deep outposts are forts, not farms, and why a rare plateau is so valuable.
- **Barriers:** every edge between two cells may become a barrier. From the seed, each edge becomes one of these:

| **Cell edge** | **What it does** |
|---|---|
| Nothing | Open ground. |
| Low hills | Walkable. |
| Ridge or mountain range | Blocks walking. Can be tunnelled through. |
| Cliff line | Blocks walking up; a drop going down. |
| Ravine | Blocks walking. |
| River | Blocks walking, except at fords. |
| Marsh | Slows movement. |

- **Gaps:** each barrier edge also gets 0 to 2 gaps: a pass, a ford or a break in a cliff. These are the passes players will fight over.
- **No natural fortresses:** every cell always has at least two edges that are open or have a gap. Deeper bands have more barriers and fewer gaps, but never break this rule. A safe enclosure always has to be finished by the players themselves.
- **Inside a cell,** the land is shaped in detail: terraces, boulders, streams, soil depth, grass and trees. The cell's type, set by its depth and the seed, decides its look: meadow, woodland, rocky scrub, badlands or dead land.
- **Natural homes:** lairs sit in caves at the foot of barrier edges, villages fill cells whose grandeur is set by their depth, vein iron lies inside the rock of ridges, and sulphur is found in volcanic cells from the Deadlands outwards, and in small amounts at rare hot springs in the Barrens.
- **Defensible terrain:** expanding outward, players are likely, but never guaranteed, to find terrain that helps defence, such as a thick mountain range with a pass through it. There will always be other areas with large open stretches. The cells and barriers give this rhythm on purpose. Example near the start: a warrior runs 30 seconds (about 90 m) from the main base and finds a mountain range; the next mountain range, ravine, cliff or deep river is another 50 to 67 seconds of running beyond it, and the valley between the two may be a good place to build.
- **Depth:** "deeper" means farther from the start basin, counted in rings of cells. The deeper the land, the greater the risks and the rewards: richer resources, more potentially hostile creatures and tribes, and larger, grander neutral villages with better trades. The land also looks more barren, less habitable and more hostile the deeper it is.
- **Broken land:** deep land is more broken, with more ravines, mesas and cliffs. It is easier to defend and harder to farm, so deep outposts are forts supplied from the Heartland, not farms. Flat plateaus still turn up now and then deeper out, and they are valuable spots because they are rare.

**Depth bands.** Depth is split into five bands. Run times are for a warrior at base speed, starting from the main base:

| **Band** | **Name** | **What it is like** |
|---|---|---|
| 0 | Heartland | The start basin. Flat, grassy, deep soil. Only softwood trees, plus hazel bushes for hardwood sticks. Copper and tin, streams, and likely bogs with bog iron. Few barriers and no hostile territory. The only place Halfling villages are found; Runkin camps are rare. |
| 1 | Fringe | From the edge of the start basin until cells pass 1.5 times the starting size (about a 5-minute run). Normal barrier odds. Grass still good. A mix of softwood and small hardwood trees. Iron rock, stone outcrops and clay. The first territorial creatures and lairs. Runkin camps are most common here. |
| 2 | Deepwoods | The one Elf kingdom lies somewhere in this band. From where cells pass 1.5 times the starting size (about a 5-minute run) until they reach full size. Grass thinning. Forests of large hardwood trees, vein iron inside ridges, more tribes and villages (Runkin camps are uncommon). Mesas and ravines more common. |
| 3 | Barrens | From where cells reach full size (about a 10-minute run, see "Cell sizes") to 3 rings farther out. Barren patches and little grass. Dead trees and twisted thornwood, richer gold and gem deposits for mineshafts, large villages, small Dwarf colonies, caves, rare hot springs with a little sulphur. |
| 4 and beyond | Deadlands | From 3 rings into the full-size cells (about a 16-minute run) outwards, forever. Dead land, volcanic ground with sulphur, mana crystal nodes, the grandest villages, rare great Dwarf cities and the worst creatures. |

- **Start basin:** all players share one start basin at about sea level (the height reference for digging, see "Terrain"). It is sized by the number of players: about one cell for 1 or 2 players, up to three cells for 8. Inside it, barriers are less likely and there is no hostile territory. Its outer edges follow the normal barrier odds, so the group shares a few natural passes to defend together.
- **Each player's pocket:** every player gets their own roughly flat, grassy pocket of the basin, with enough room to build their own town and a guaranteed set of resources within about 30 seconds: a stand of softwood, hazel bushes, copper ore and tin ore outcrops (the two ores needed to make bronze), stone, a water source, and very likely a bog with bog iron or an iron rock deposit. Each player also starts with enough food to feed all five starting units (the 4 workers and the warrior) for **10 days**. The foods and the resource amounts are in tables 6 and 9.
- **Iron ores:** bog iron is only found in bogs. Iron rock is found as surface rock, or in mineshafts of the right depth. Vein iron ore lies inside the rock of ridges and mountains, so mountains are both a wall and a mine, and tunnelling through one can expose ore; it also comes from mineshafts of the right depth.
- **Trees:** in the Heartland only softwood trees grow, and hardwood sticks can be gathered from a hardwood bush, the **hazel bush**. The Fringe has a mix of softwood and small hardwood trees. The Deepwoods have large hardwood trees. It is named after the real hazel, a hardwood shrub that is traditionally cut for straight sticks and rods.
- **Shaping the land:** workers can clear obstacles, dig trenches and moats, build the land up, and given enough time tunnel through a cliff wall or a mountain. Rivers can be dug and redirected. See "Terrain".
- **Grassland and the heartland:** grassland becomes thinner the farther it is from the start basin, until the land is eventually barren. Agriculture, and especially grazing herds, therefore has to be centred in the heartland. Some vegetable farms can still work in poorer land.
- **Regrowth:** fish breed, so fishing spots refill over time (see "Fish"). Felled trees drop seeds around them. Seeds left on the ground grow into saplings; workers can also pick them up and plant them. The smallest softwood tree takes about an hour to grow to full size, and other trees take much longer. Hazel bushes grow back from the stump after they are cut. All other resources are used up for good.
- **Exploration rewards:** richer resources the farther out players go, such as more gold and the ores for carbon steel. These stay rare even far out; the world is never brimming with metals. Trading with the peoples found along the way is the other reward. There are no blueprints or magic sites to find.

#### Table 5: Resource nodes per band

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 12 weights set the load (5 lumber, 5 stone or ore, 10 sticks, 10 fish, 10 meat per trip); times are for hardwood tools and divide by the table 2c multiplier.

| **Node** | **Band** | **Yield per node** | **Per load** | **Time per load** | **Gatherers** | **Tool needed** | **Regrowth** |
|---|---|---|---|---|---|---|---|
| Softwood tree (pine, spruce, small softwood) | Heartland, Fringe | 20 lumber | 5 | 15 s | 1 (doc) | hardwood | 60 min seed to full (doc); 2 seeds drop per felled tree (s) |
| Hazel bush | Heartland | 10 sticks | 10 | 10 s | 1 | hardwood | 2 days from the stump (s) |
| Small hardwood (birch, hornbeam) | Fringe | 15 hardwood lumber | 5 | 20 s | 1 | flint | 3 hours (s) |
| Large hardwood (oak, beech) | Deepwoods | 40 hardwood lumber | 5 | 20 s | 2 | copper | 6 hours (s) |
| Dead trees, thornwood | Barrens, Deadlands | nothing: dead and twisted, no lumber (Jade); cover and lair sites only |  |  |  |  | none |
| Herbs / wild flax | Heartland, Fringe; rare deeper | 10 / 10 | 10 | 10 s | 1 | hardwood | 5 days (s) |
| Loose stone / flint scatter | Heartland | 40 stone / 20 flint | 5 / 10 | 10 s | 2 | hardwood | none (s) |
| Stone outcrop | Heartland (a few), Fringe | 200 stone | 5 | 15 s | 2 | hardwood digging stick or stone maul (s) | none (s) |
| Copper outcrop / tin outcrop | Heartland | 60 / 30 ore | 5 | 20 s | 2 | stone maul (s) | none (s) |
| Coal, surface seam | Fringe | 60 | 5 | 15 s | 2 | copper | none (s) |
| Bog iron patch | Heartland bogs (giant frog guards it, roster) | 40 | 5 | 20 s | 2 | bronze | none (s) |
| Iron rock | Fringe | 80 | 5 | 25 s | 2 | bronze | none (s) |
| Vein iron seam, inside a ridge; exposed by a tunnel | Deepwoods and deeper | 150 | 5 | 30 s | 2 | wrought iron | none (s) |
| Clay bank | Fringe riverbanks and wetlands | 100 | 5 | 15 s | 2 | hardwood | none (s) |
| Sand | riverbeds and beaches, any band | 100 | 5 | 10 s | 2 | hardwood | none (s) |
| Marble rock | Fringe (rare, about 1 rock in 6 cells), common from the Deepwoods | 80 | 2 | 30 s | 2 | bronze | none (s) |
| Saltpetre | rare: cave floors in the Fringe and Deepwoods and deeper, about 1 deposit in 3 caves (s) | 30 | 5 | 20 s | 2 | copper | none (s) |
| Lead ore | Deepwoods and deeper, beside silver-grey rock | 40 | 5 | 20 s | 2 | bronze | none (s) |
| Sulphur | Deadlands volcanic ground | 60 | 5 | 20 s | 2 | bronze | none (s) |
| Sulphur at a hot spring | Barrens, rare (Jade): about 1 in 10 cells (s) | 20 (s) | 5 | 20 s | 2 | bronze | none (s) |
| Surface gold / surface gem | Barrens and deeper | 1 to 3 / 1 | 1 | 20 s / 30 s | 1 | bronze | none (s) |
| Mana crystal node | Deadlands | 5 | 1 | 30 s | 1 | bronze | none (s) |
| Fish stretch: trout / salmon / giant catfish | Heartland streams / Fringe streams / Deepwoods pools | 1 per 4 m2 / 1 per 8 m2 / 1 per 8 m2 (doc) | 10 | rod 15 s a fish, net or dock 10 s | 1 per 4 m of bank (s) | rod or net | a pair every 3 / 6 / 9 days (doc) |
| Carcass | where it fell | boar 3 meat, 1 hide (roster); deer 4 meat, 2 hide; hare 1 meat, 1 hide; cow 6 meat, 2 leather; bear 8 meat, 2 hide; others roster 6.1 | 10 | 10 s | 2 | none | none (s) |
| Wild herds per cell | cattle: Heartland, 3 pairs; chickens: Heartland and Fringe, 4 pairs; horses and oxen: Fringe, 2 pairs each; bears: Deepwoods, 1 pair plus cubs (doc) |  |  |  |  |  | pairs breed every 10 days (doc) (s) |

Prospect (20 s with a prospecting hammer, 40 s without): Poor x0.5, Fair x1, Good x1.5, Rich x2.5 on mineshaft output (s). Mineshaft output per miner-day at Fair (s): tier 1, 10 stone and 8 ore (copper, tin, iron rock or coal in a mix set by the seed), 600 loads before it is worked out; tier 2, 10 stone, 12 ore including vein iron, 4 coal, 1 silver or gold every 2 days, 1 gem every 5 days, 2400 loads; tier 3, 10 stone, 16 vein iron, 8 coal, 1 lead ore, 1 gold a day, 1 gem every 2 days, never worked out. Richer farther out but still rare (doc): surface gold and gems come as 2 to 5 in the Deadlands, and mineshaft gold, silver and gem output is x1.5 in the Barrens and x2 in the Deadlands (s).

#### Table 9: Start pocket contents

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Item** | **Per player (s)** |
|---|---|
| Flat grassy pocket | about 60 m across, deep soil, at sea level |
| Softwood stand | 24 trees (480 lumber), 20 to 40 m from the Big House |
| Hazel bushes | 8 (80 sticks, regrowing) |
| Copper outcrops / tin outcrop | 2 of 60 ore / 1 of 30 ore |
| Stone | loose stone 60 and one 200 outcrop |
| Flint scatter / herbs / wild flax | 40 / 20 / 20 |
| Water | one stream stretch of at least 60 m2 (15 trout) or a pond of 40 m2, within 60 m |
| Food | 15 meat, 10 fish, 10 eggs: 100 nutrition, 10 days for the starting five (Jade confirmed); with 3 starting warriors now (Jade, 2026-10-03), the extra starting food Jade set covers the seven (s: 140 nutrition, Open for Jade's rebalance) |
| Iron | a bog of 40 bog iron (80% of pockets) or an iron rock of 60 (20%) |
| Wild cattle / chickens | 1 pair / 2 pairs within 90 m, shared with neighbouring pockets |
| Basin size | 1 to 2 players 1 cell (150 to 200 m); 3 to 5 players 2 cells; 6 to 8 players 3 cells (doc); pockets at least 80 m apart |
| Halfling villages | placed when the world is generated, never later (doc); (s): one per basin cell (1 for 1 or 2 players, 2 for 3 to 5, 3 for 6 to 8), each in its own pocket at least 120 m from every player pocket, plus one in every 6 Heartland cells beyond the basin |

**How these were set:** a pocket holds about 25 worker-days of softwood, so the stand lasts to about night 8 with 2 to 3 choppers before regrowth or the Fringe has to carry the load, which is when the player should be looking outward anyway.

### Food, supply and health

- **Food in and out:** the food stock is constantly refilled by farms, hunting, fishing and gathering, and constantly drained by feeding the player's people. Food shortages happen when this goes wrong: poor planning, raids on farms, livestock killed, a fish stretch fished out, rations set too high, or more units than supply allows.
- **Separate foods:** each type of food stays its own resource. No food is "better" than another, except that some feed more than others: each type has a nutrition value. Cooked food has more nutrition than raw (see "Cooking").
- **Eating evenly:** when several kinds of food are in stock, units eat from all of them equally.
- **Keeping a food back:** any food type can easily be opted out of being eaten, for example to save it for another use. Suggested control: right click a food in the resource bar to toggle "Don't eat", shown by a crossed-out icon.
- **Food upkeep:** every unit (and every research facility) has a running food cost that is taken from the food stock automatically.
- **Mechanical units** (cannons, catapults, ballistas and similar) do not eat, so they never drain food. They also never heal by themselves: a worker has to repair them.
- **Starving:** if there is not enough food, units starve. Starving units move more slowly. After three full day-night cycles of starving (about 22 minutes), they start to lose 1% of their maximum health every 15 seconds.
- **Natural healing:** units that are not starving regain 1% of their maximum health every 15 seconds (mechanical units excepted).
- **Rationing:** a Rations button on the utility bar cycles between three settings. **Feed everyone** is the default and the normal way to play. **Troops only** and **Workers only** are for food shortages: only that group is fed, and the other group starves under the normal starving rules until rationing is switched back. Mages count as troops. Research facilities also count as troops: they never starve or take damage, but they stop working while they are not fed.
- **Eating:** a unit can go to a building that holds food and eat, healing a large amount over 10 seconds. Combat interrupts this.
- **Supply:** the number of units a player can have is limited by supply. Supply comes from main base levels and from farms. Later in the game most supply comes from farms. Different farm types and tiers give different amounts.
- **Over the limit:** if farms are destroyed and supply drops below the number of units, no units are lost, but no new units can be made until supply is back.

#### Table 6: Food and supply

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** 2 nutrition per unit per cycle (header rule), so one raw meat feeds two units for a day and one tier 1 farmer feeds six.

| **Food** | **Nutrition** | **Comes from** | **Cooking tier** |
|---|---|---|---|
| Meat / fish / eggs | 4 / 3 / 1 | hunting, fishing, hens | raw (s) |
| Wheat / potatoes / carrots / corn | 2 / 2 / 1 / 2 | farms | raw (s) |
| Roast meat / roast fish | 6 / 5 | 1 meat or fish, 1 fuel per 5 | 1 Campfire (s) |
| Smoked meat / smoked fish | 7 / 6 | as roast | 2 Cook Hut (s) |
| Bread / salted meat / salted fish | 5 / 8 / 7 | 2 wheat / 1 meat / 1 fish, 1 fuel per 5 | 3 Kitchen (s) |
| Stew | 12 | 1 meat, 2 potatoes, 1 carrot | 4 Great Kitchen (s) |
| Pie | 16 | 1 meat, 2 wheat, 1 egg | 5 Grand Kitchen (s) |

Cooking takes 10 / 8 / 6 / 5 / 4 s per item by tier, 1 lumber or coal per 5 items (s). Upkeep per cycle: every unit 2, every research facility 2, a working horse 2, a working ox 3, mechanical units 0 (s). Eating at a building heals 50% of maximum health over 10 s and costs 2 nutrition (s). Farm yield per farmer-day at tier 1 (x1.5 at tier 2, x2 at tier 3): wheat 6, corn 6, flax 6, potatoes 8, carrots 8, herbs 4; a new field gives nothing for its first 2 days; crop fields yield half outside the Heartland and nothing in the Barrens or Deadlands, vegetable farms and herb beds yield in full anywhere with soil (s). Livestock: a hen lays 1 egg a day and gives 1 meat and 2 feathers; a cow gives 6 meat and 2 leather; tamed pairs breed every 10 days (doc) and the young are adult after 2 days (doc); slaughter takes 10 s at the farm (s). Grazing need: cattle, horses and oxen 20 m2 of grass within 30 m of their farm each, chickens 2 m2; short of grass they eat 2 (cattle, horse, ox) or 1 (chicken) nutrition a day from crops (s). Supply is in table 4 (main base 8 to 50, farms 1 to 8). Starting stock: 15 meat, 10 fish, 10 eggs (100 nutrition, 10 days for 4 workers and 1 warrior; Jade confirmed), plus 40 softwood lumber, 20 stone, 10 flint, 20 sticks (s). The tier 1 foods are my pick (s). Game (s): hare 20 HP, 6 m/s, runs; deer 80 HP, 7 m/s, runs; boar fights (roster 6.1).

### Open questions

- More tribe and village peoples (the Halflings and Runkin are the first), and which ones can be traded with.
- **Battle mages behind walls (suggested)** (found by the Milestone 10 balance harness, awaiting Jade's word): a battle mage standing on the ground cannot shoot over a wall, because Arcane bolt flies flat, so she walks out of the gate and dies. Should spells arc over walls, should mages refuse to leave the walls, or is placing them on parapets the player's job?
- **Warriors on hold against archers (suggested)** (found by the Milestone 10 balance harness, awaiting Jade's word): skeleton archers stand off out of reach of a closed wall, and warriors on Hold Position never answer them. Should held warriors step out to answer ranged attackers, or is that left to the player?

## Gameplay Mechanics

### Controls

The game is played with mouse and keyboard from a top-down, angled camera. The whole scheme rests on six rules that apply everywhere, so a player who learns them once can control any unit or building:

- **Left click selects.** Left click (or a left-drag box) chooses what the player is controlling. It never issues an order on its own, except to confirm a command the player has already chosen.
- **Right click acts.** Right click issues the "smart" order that fits whatever is under the cursor: move to ground, attack an enemy, gather a resource, enter a building, and so on.
- **One key, one command.** Every button on the HUD has a single-key hotkey. Unit commands use letters named after the command (A for Attack, P for Patrol); building menus use a fixed grid of keys that matches the button layout on screen.
- **Shift adds.** Holding Shift adds to whatever already exists: units to a selection, orders to a unit's queue, buildings to a worker's build list, rally points to a building.
- **Esc (or right click) backs out.** Any pending targeting cursor, ghost building or sub-menu is cancelled with Esc or a right click, and nothing is spent or ordered.
- **Everything can be clicked.** Every command and every screen action can be done with the mouse alone, by clicking a button on the HUD. Hotkeys and modifier keys are faster ways of doing the same things, never the only way. A mouse-only player can play the whole game; a player who learns the hotkeys can simply act faster. The one exception is the keyboard shortcuts for control groups and camera locations, which are pure speed tools (and even those have mouse versions).

Specific numbers in this section (pixel sizes, timings, refunds, carry amounts) are starting values to be tuned in playtesting.

#### Screen layout and mouse zones

The screen is split into two zones, and almost every control rule below depends on which zone the cursor is in.

- **Game view:** the 3D world. All selecting, ordering and building placement happens here.
- **HUD:** every panel drawn over the game view. The HUD panels are:
  - Minimap (bottom left): the whole explored map, with the current camera view drawn as an outlined box.
  - Selection panel (bottom centre): portraits of the selected units, or detailed stats when only one thing is selected.
  - Command card (bottom right): a 3-row by 5-column grid of buttons for the selected units (see "Command card and grid hotkeys").
  - Resource bar (top right): stockpiled resources, expandable to show every resource type (see "Resources" below).
  - Clock (top centre): the current day or night, time remaining, and the night count.
  - Top-right buttons, under the resource bar (suggested, as built 2026-10-03): Peoples (O), Allies ([), Send (]), Ping (\) and Pause (❚❚). Allies and Send are greyed when playing alone (see "Allies panel").
  - Message panel (left side, above the minimap): what the player's units say, game alerts such as "Night is falling", and chat between players (see "Unit speech and the message panel").
  - Utility bar (a slim row of buttons along the top edge of the minimap): Idle Gatherer, Select Army, Town Hall, Follow, Queue Mode, Rations (F9, suggested), Everyone Home (J, suggested), Reset Zoom, four Camera Location buttons, and Menu. Each button does the same as its hotkey (see "Playing with the mouse only").

The HUD is solid: a click on any HUD panel, including its transparent padding, is handled by the HUD and never passes through to the world behind it. Panels have a defined rectangle, and that rectangle (not the visible artwork) is what counts.

Every HUD button shows its hotkey in a corner and in its tooltip, so mouse players learn the hotkeys naturally over time.

#### Selecting units and buildings

**Click vs. drag.** When the left button goes down in the game view, the game waits to see what the mouse does. If the button is released after the cursor has moved less than 4 pixels, it is a click. If the cursor moves 4 pixels or more while held, it becomes a drag and a selection box appears.

**Single click.** Clicking a unit or building selects it and replaces the current selection. Clicks use a generous hit area around each model (slightly larger than the model itself) so small units are easy to grab. When models overlap, the one drawn nearest the camera wins. Clicking empty ground does nothing and keeps the current selection; Esc or F3 deselects everything (see quick reference).

**Drag box.** The box is drawn from the point where the drag started to the cursor, as a thin outline with a faint fill. Every unit that would be selected is highlighted live while the box is being dragged, so the player can see the result before letting go. A unit counts as inside the box if any part of its hit area is inside.

**The drag box never covers the HUD.** This is a hard requirement:

- A drag can only start in the game view. Pressing the left button on a HUD panel never starts a box.
- If the cursor moves onto the HUD during a drag, the box keeps growing but its edges are clamped to the edge of the game view. The box stops at the HUD's border as if it were a wall, while still following the cursor along that border.
- Releasing the button over the HUD completes the selection using the clamped box. It does not click the HUD button under the cursor.
- The box ignores units hidden behind HUD panels, even if the clamped rectangle would visually reach them.
- Edge panning is switched off for the duration of a drag so the box does not run away from the player. Arrow keys still pan during a drag, and the corner where the drag started stays pinned to the same spot in the world.

**What a drag box picks up (priority rules).** A box can contain a mix of things, so the game filters it in this order:

- If the box contains any of the player's own units, it selects only those units and ignores buildings, other players' units, monsters and resources.
- If it contains no units but some of the player's own buildings, it selects those buildings.
- Otherwise it selects a single thing to inspect (an ally's unit, a monster, an animal, a resource node), choosing the one closest to where the drag started. Things the player does not own can be inspected but never ordered.

**Selecting all of one type.** Double-clicking a unit, or Ctrl + left click on it, selects every unit of that same type that the player owns and that is currently visible in the game view. The same works for buildings.

**Modifier keys for selection:**

| **Input** | **Result** |
|---|---|
| Shift + left click on a unit | Adds it to the selection, or removes it if it was already selected. |
| Shift + drag | Adds everything in the box to the current selection. |
| Ctrl + left click (or double click) | Selects all units of that type on screen. |
| Ctrl + Shift + left click | Adds all units of that type on screen to the selection, or removes them if that type is already selected. |
| Esc | Cancels any pending order or menu first; pressed again with nothing pending, clears the selection. |

**Selection panel.** When several things are selected, the selection panel shows a portrait for each, grouped by type, with a small health bar under each portrait. Portraits are ordered by type in a fixed order, so the same army always looks the same. If there are more portraits than fit, the panel shows pages with small page tabs. Clicking in the panel:

- Left click a portrait: select only that unit.
- Shift + left click a portrait: remove that unit from the selection.
- Ctrl + left click a portrait: select only the units of that type.
- Ctrl + Shift + left click a portrait: remove all units of that type.
- Double-click a portrait: centre the camera on that unit.
- Right click a portrait: remove that unit from the selection (mouse-only version of Shift + click).
- On a Mac, the selection panel's hint says Cmd + click in place of Ctrl + click (suggested, as built 2026-10-03).

**Subgroups and Tab.** A mixed selection is split into subgroups by unit type. Each subgroup has a small tab above its portraits showing the unit type and count. Clicking a tab makes that subgroup active, double-clicking it keeps only that type selected, and right clicking it removes that type from the selection. One subgroup is "active" and is shown with a brighter border in the panel; the command card shows the buttons of the active subgroup. Tab moves to the next subgroup and Shift + Tab to the previous one. Pressing a hotkey or clicking a command card button sends the order to every selected unit that can carry it out, not just the active subgroup. Units that cannot carry it out ignore it. For example, with gatherers and fighters selected, Attack goes to both, but Build only to the gatherers.

**No selection cap.** There is no fixed limit on how many units can be selected at once.

#### Control groups and camera hotkeys

Control groups let the player save a selection to a number key and get it back instantly. There are ten groups, on keys 1 to 9 and 0. A group can hold units, buildings or a mix.

**The group key.** Saving a group uses the **group key**: the key directly left of 1, under Esc (the ` / ~ key on most keyboards). The game reads it by its physical position, so it is the same key on every keyboard layout. Browsers never use this key for anything, so control groups work the same in any browser, in a window or full screen, on Windows, Mac and Linux. The common Ctrl + number layout is not used by default because browsers take Ctrl + 1 to 8 for switching tabs and do not let a web page block that.

| **Input** | **Result** |
|---|---|
| Group key + number | Hold the group key and press a number: saves the current selection to that group, replacing whatever the group held before. |
| Shift + number | Adds the current selection to that group without removing anything already in it. |
| Group key + Shift + number | Saves the selection to that group and removes those units from every other group (a "steal"). |
| Number | Selects that group. |
| Number twice, quickly (within 0.3 s) | Selects the group and centres the camera on it. |

**Group tabs (mouse).** Each group shows its number and unit count in a row of small tabs above the selection panel, with an empty tab for each unused number. Left click a tab selects the group and double-click centres on it. Right click a tab saves the current selection to it, and Shift + right click adds to it. So a player can manage groups entirely with the mouse if they want to.

**Optional Ctrl layout.** In settings, players can switch the group key to Ctrl (Ctrl + number to save). This option can only be turned on while the game is full screen in a browser that lets a page claim the keyboard (currently Chrome and Edge). If the player leaves full screen, the game switches back to the group key and says so on screen. Not built yet (Milestone 10, 2026-10-03): claiming the keyboard in full screen and this Ctrl layout. Until it is, a quick Esc in full screen also leaves full screen, because the browser takes Esc there.

Dead units drop out of their groups automatically. When a group of identical buildings is told to train or produce something, the order goes to whichever building in the group has the shortest queue, so work is spread evenly across them.

**Camera locations.** Group key + F5, F6, F7 or F8 saves the current camera position, the same way the group key saves a unit group. Pressing F5 to F8 jumps back to it instantly. These are meant for spots the player keeps returning to: the town centre, a fortified chokepoint, a far-off mining camp.

**Other camera and selection keys:**

- Backspace: centre the camera on the player's town hall. Pressing again cycles to the next town hall if the player has more than one.
- Space: jump to the most recent urgent message (for example, a building under attack, a unit that is stuck, or the night warning at dusk). Pressing again steps back through the last 8.
- F1: select an idle gatherer and centre on it; pressing again cycles to the next. Shift + F1 selects all idle gatherers at once.
- F2: select every combat unit the player owns (gatherers excluded).
- F3: clear the selection.
- L: toggle "follow" mode, where the camera stays locked on the selected unit until the player pans or presses L again.

#### Unit orders

**Smart order (right click).** Right click picks the obvious order for whatever is under the cursor. The order goes to every selected unit that can carry it out.

| **Right click on** | **Selected units will** |
|---|---|
| Open ground | Move there, ignoring enemies on the way (they do not stop to fight). |
| Enemy unit, monster or hostile building | Attack that specific target, chasing it until it dies, the player gives a new order, or it can no longer be seen. |
| Friendly or allied unit | Follow it, staying close and matching its movement. |
| Neutral village leader or trading building | Walk to it and open the trade menu (see "Neutral villages and trade"). |
| Other neutral unit or building | Move next to it. A right click never attacks anything neutral. |
| Resource node (gatherers) | Start gathering from it (see "Gathering resources"). |
| Unfinished friendly building (gatherers) | Go and continue building it. |
| Drop-off building while carrying resources (gatherers) | Drop off what they are carrying, then go back to the last node they gathered from. |
| The minimap | The same as a right click on that point of the map. |

**Command hotkeys.** Unit commands use letter keys named after the command, and the keys are the same for every unit that can move:

| **Key** | **Command** | **Exact behaviour** |
|---|---|---|
| A | Attack | Puts the cursor into targeting mode. Left click on an enemy attacks that target only. Left click on a neutral village's people or buildings does not attack straight away: a pop-up asks the player to confirm declaring war on that village, and the attack only starts once confirmed (see "Neutral villages and trade"). Left click on ground is an attack-move: the units walk toward the point and stop to fight any hostile thing that comes within their sight range on the way, then carry on to the point once it is dead or gone. |
| S | Stop | Cancels every queued order immediately. Units stand still but will still fight back against hostiles that come close, and will chase them a short distance (the leash, see below) before returning. |
| H | Hold Position | Cancels every queued order. Units never move for any reason, not even to chase. Ranged units shoot anything that comes in range; melee units hit anything that comes adjacent. Used for blocking a chokepoint or a gap in a wall. |
| P | Patrol | Left click a point. Units walk back and forth between where they were standing and that point, forever. Patrolling units behave like attack-moving units: they stop to fight anything hostile they see, chase it within the leash, then return to the nearest point on their patrol route and continue. |
| M | Move | Puts the cursor into targeting mode. Left click on ground moves there exactly like a right click. Left click on a unit follows it. Used when a right click would do something else, for example to walk over a resource node without gathering it. |

**Leash.** When a unit that is not on Hold Position auto-targets a hostile (on Stop, idle, attack-move or patrol), it will chase that target up to a set distance (the leash, a tunable value per unit type) from where the chase started. If the target gets beyond the leash, the unit gives up and goes back to what it was doing. An idle unit that was attacked returns to its original spot after the fight.

**Target choice.** Units that auto-target (attack-move, patrol, idle, stop) pick targets in this order: hostiles that are attacking them or can fight back; then other hostiles that can fight back; then harmless targets such as walls and passive creatures. Within the same tier, the closest wins. This stops an attack-moving army from wasting its time on a wall while monsters are hitting it.

**Targeting mode.** After pressing A, P or M (or any ability that needs a target), the cursor changes to a reticle that is coloured by the command (red for Attack, yellow for Patrol, green for Move; red for a spell aimed at enemies and green for a spell aimed at allies (suggested)). The next left click in the game view or on the minimap confirms it. Right click or Esc cancels with no order given. Clicking a HUD panel other than the minimap also cancels. Holding the hotkey down and clicking repeatedly gives the same order to each click, so it can be spammed quickly.

**Order feedback.** Every order the game accepts plays a short marker at the target point: a green ring for move, a red ring for attack, a yellow ring for patrol, and the outline of the target for a unit or resource. Selected units also play a short voice or sound cue. An order that cannot be carried out (no path, nothing selected can do that) plays an error sound and a short message at the top centre instead.

**Group movement.** When a group is told to move to one point, the units keep roughly the shape they had and spread out around the target point rather than all trying to stand on the same spot. Units in a group travel at the speed of the slowest unit in it when they start close together, so they arrive together.

#### Command card and hotkeys

The command card is a grid of 15 buttons in 3 rows of 5 showing everything the selection can do. Each button shows its hotkey in the corner. Outside the build menus, hotkeys are letters named after the command:

- Every unit that can move: A Attack, S Stop, H Hold Position, P Patrol, M Move. These buttons are always in the same five places on the top row.
- Gatherers also have: G Gather, C Return Cargo, R Repair (buildings and mechanical units), D Dig, T Prospect, B Build Basic Structures, V Build Advanced Structures.
- Warriors also have N Hunt (suggested letter): click an animal to hunt it (see "Semi-automation").
- **Engines (suggested, as built 2026-10-03):** an engine's card has A Attack, S Stop, H Hold Position, M Move, R Hitch (Let go when hitched) and E Port (send it into a free Citadel port). Right clicks with an engine: on one of your horses or oxen, hitch it; on the Citadel, go to a port. Warriors right click your engine to crew it; workers right click a damaged engine to repair it. The Gunnery yard has U Train for Cannon crew training, the only skill training left. There is no Ride button: cavalry is a troop type trained at the Stables (Jade, 2026-10-03).
- **Neutral peoples (suggested, as built 2026-10-02):** O, or the Peoples button at the top right, opens the Peoples panel listing the peoples met. Right click a leader, a trade building (Halfling inn or barn, Runkin drying rack, Elf hall or caravan wagon, Dwarf forge or hall) or a caravan with any unit to trade; right click a mercenary camp to hire. A on their units while at peace asks before war (see "Neutral villages and trade").
- **Mages (suggested, as built 2026-10-02):** the top row is A Attack, S Stop, H Hold Position, P Patrol, M Move; the second row is the five spells of the mage's school (support: R Heal, K Quicken, F Fortify, Y Rally, W Warding; battle: R Arcane bolt, B Beam, F Fireball, T Area blast, C Counterspell); the third row is Eat (no hotkey on a mage, because F is Fortify or Fireball there), U Rank (rank training at a Magi Sanctum), E Enter, Q Upgrade Wand, X Upgrade Robe and their Max twins Z and V (see "Upgrading units"). Casting is described under "Casting spells" in "Magic".
- E Enter: click a building to go inside it. Workers can shelter in farms, fishing docks and main bases. Ranged warriors and mages can garrison towers and the parapets of a level 3+ main base and fight from there. A building with units inside shows a U Unload All button, and clicking a unit's portrait in the building's panel lets just that unit out.
- **Double-tap for auto-target:** press any targeted command twice (or click its button twice) and the unit picks the target itself instead of waiting for a click. This works for every targeted command (see "Semi-automation").
  - Double-tap in detail (suggested, as built 2026-10-03): A, each unit attacks the nearest enemy it can see; G, each worker gathers the nearest node it can within 15 m, more of what it already carries first; E, each unit goes into the nearest of its player's buildings with room for it (workers shelter, ranged warriors and mages garrison); T, each worker prospects the column it stands on. Repair, Hunt and spells work as described elsewhere. When a unit has nothing to pick, the player is told once: "No enemy in sight.", "Nothing they can gather nearby.", "No building with room for them." or "Only workers prospect." Move and Patrol have no target of their own, so pressing them twice only keeps the targeting.
- Buildings: what they train or research gets a letter taken from its name where possible (that letter is underlined on the button), plus R Set Rally Point and, while under construction, X Cancel. Two buttons on the same card never share a letter.
- **Training troops (Jade, 2026-10-03):** a Barracks card shows one picture button per troop type (a small head-to-toe picture of the unit with its weapons, greyed out when it cannot be afforded), each with a weapon-tier and an armour-tier dropdown and a Lock checkbox; the Stables shows the same for cavalry, and a main base the same limited to tier 1. Without a lock, each type defaults to the best tiers the player can afford, the weapon first. Hotkeys (suggested): C Close melee, L Long melee, G Ranger, B Brawler; C Cavalry at the Stables. Choose the tiers once, then click or press the type as often as supply and resources allow. See "Troops and gear".
- **Upgrading units (Jade, 2026-10-03):** warriors have Upgrade Weapon and Upgrade Armour, one tier each, plus Upgrade Weapon Max and Upgrade Armour Max to the best tier researched and affordable; a Max button shows only when it would do more than the plain one. Keys (suggested): Q Upgrade Weapon, X Upgrade Armour, Z Weapon Max, V Armour Max. Workers have one Q Upgrade for their tool kit; mages use the same four keys for wand and robe. The units walk to the nearest Forge, Barracks or main base (cavalry also the Stables, mages also the Magi Sanctum) and pay from stock.
- A button keeps the same position even when it is unavailable, so the layout never shifts. Unavailable buttons are greyed out; their tooltip says why (not enough resources, a missing building, a technology not yet researched).
- Hovering any button shows a tooltip with its name, hotkey, cost in each resource, build time and any requirements.
- All hotkeys can be rebound in the settings menu. Rebinding changes the key shown on each button. Spell keys have their own Mages group there (suggested).

**Build menus use grid hotkeys.** Creating buildings is the one place where hotkeys follow the grid instead of letters. When B (Basic) or V (Advanced) opens a build menu, the command card is replaced by up to 15 buildings, and each one's hotkey is the key in the same position on the left side of the keyboard:

| Q | W | E | R | T |
|---|---|---|---|---|
| A | S | D | F | G |
| Z | X | C | V | B |

So "B then Q" means "open Basic Structures, then pick the building in the top-left slot". The player does not have to learn a letter for each building, only where it sits. Inside a build menu, the grid keys only pick buildings (they do not issue unit commands), and Esc returns to the main card. The bottom-right slot (B) is always Back, so the player can never lose track of how to get out. Buildings are assigned to slots as the building list for this blueprint is written; basic buildings (homes, storage, walls, simple workshops) go in the Basic menu and buildings that need rare resources or technology go in the Advanced menu.

#### Building placement

Any unit that is able to build does so by choosing a building from its command card (by click or hotkey). The cursor then carries a **ghost** of the building: a see-through copy of the model at full size, which follows the cursor and snaps to the building grid.

- The ghost's footprint is drawn on the ground as a grid of tiles. Each tile is green if it can be built on and red if it is blocked (by terrain that is too steep, water, another building, a unit that will not move, a resource node, or unexplored map).
- A building can only be placed when every tile is green. Left click on a red ghost plays an error sound and keeps the ghost on the cursor.
- Things that matter to placement are shown while the ghost is out: for example the range of a defensive tower, the reach of a drop-off building, or the area a farm covers.
- If the player cannot afford the building, the ghost still appears (so they can plan), but placing it gives a "Not enough [resource]" message and nothing is ordered.
- Left click on a valid spot confirms. The ghost leaves a faint marker on the ground and the builder walks there. The cost is taken from the stockpile only when the builder arrives and construction actually begins. If the spot has become blocked by then, the order is cancelled, nothing is spent, and an alert says so.
- Shift + left click places the building and keeps the ghost on the cursor so the player can place another of the same building. Every building placed this way goes into the builder's queue in order (see "Queuing orders with Shift"). Releasing Shift and clicking again places the last one and ends placement.
- Right click or Esc removes the ghost without placing anything.
- Planned but not yet started buildings show as faint ghosts on the ground, visible only to the player (and to allies in multiplayer), until the builder reaches them.
- Walls and other line-based buildings can be dragged: hold left click at one end and drag to the other, and a straight line of segments is previewed and placed together.

A building under construction is a real object from the moment it is started. It can be attacked, which matters because a building left unfinished at dusk can be destroyed at night. If the builder is ordered away or killed, construction pauses, and any gatherer can be right-clicked onto it to continue. Cancelling an unfinished building refunds 75% of its cost.

#### Gathering resources

Only units with the gatherer role can collect resources. A gatherer that is told to gather runs the following loop by itself until it is given another order or nothing is left to collect:

- Walk to the resource node.
- Work the node for that resource's gather time (for example, chopping a tree or mining a rock), with a matching animation.
- Pick up one load: as much of the resource as the gatherer can carry, up to the 25 lb limit for raw materials (table 12). The load is shown in the gatherer's hands or on its back.
- Walk to the nearest drop-off building that accepts that resource.
- Drop the load. It is added to the player's stockpile at that moment, not before.
- Walk back to the same node and repeat.

**Starting to gather:** right click a node, or press G (Gather) and left click a node.

**Running out:** when a node is used up, the gatherer automatically moves to the closest node of the same resource within a short search radius. If there is none, it returns its last load to storage and goes idle, and an idle gatherer alert plays.

**Return Cargo (C):** sends a gatherer that is carrying something straight to storage, then back to its node.

**Rallying new gatherers:** when a building that trains gatherers has its rally point on a resource node, each new gatherer starts gathering from it the moment it appears.

**Node crowding:** each node has a set number of gatherers that can work it at once (for example, one per tree, two per rock face). Extra gatherers sent to a full node work the closest free node of the same resource instead, so players do not have to place each gatherer by hand. Hovering a node shows how much is left and how many gatherers are on it.

**What is gathered, and what is made.** Raw resources from the resource list are gathered directly from nodes in the world: softwood and hardwood lumber (from different tree types), hardwood sticks (from hazel bushes), medicinal herbs, stone, flint, coal, copper ore, tin ore, bog iron, iron rock, vein iron ore and fish. Meat and leather come from hunting: animals are killed with an attack order first, and the carcass then becomes a node that gatherers harvest. Ingots (copper, tin, bronze, pig iron, iron, steel) are never gathered; they are produced by buildings from raw resources. Digging the land also gives resources, depending on what it is made of (see "Digging and building up the land").

**Idle gatherers.** The Idle Gatherer button on the utility bar shows how many gatherers are idle. Clicking it or pressing F1 selects the next idle gatherer.

#### Semi-automation

These let units pick sensible targets on their own, while the player's own orders always win. They use one rule (double-tap a targeted command) and one dusk button, rather than new buttons for each job.

- **Fishing:** G Gather on water fishes that stretch like any other node. Workers assigned to a fishing dock fish the nearest stretch and move to another once it falls to half the fish it can hold, so no stretch is ever fished out (a stretch with no fish left never breeds again).
- **Hunting:** N Hunt sends warriors after an animal. Double-tapped, they take the nearest game animal within their leash, carry what they can to the nearest drop-off and repeat. Bears and territorial creatures are skipped unless ordered directly. Workers in the same selection follow and haul the carcasses. A hunt ends at dusk, and the hunters walk home.
- **Repair:** double-tap R and workers repair every damaged building and mechanical unit nearby, worst first.
- **Everyone Home:** a one-shot button on the utility bar that lights up during dusk. Clicking it sends every unit without a standing job to the nearest shelter. Workers assigned to a farm or fishing dock shelter in their own building without being told. It is not a toggle, so it never pulls units out of a fight later.

#### Digging and prospecting

**Dig (D)**: press D or click Dig, then left drag over the ground to mark an area. The depth is set (suggested) with the + and − buttons that appear on the command card, or with the mouse wheel while dragging, and a see-through preview shows the cut, stopping at the dig limit. Left click confirms. Marking a hillside, cliff or mountain face starts a tunnel instead, and the depth then sets how far in it goes. The marked area stays outlined until it is finished, and any worker can be right-clicked onto it to help. See "Digging and building up the land" for what can be dug.

**Prospect (T)**: press T or click Prospect, then left click a spot. The worker walks there, spends a short time prospecting, and the result is shown over the area (see "Mineshafts and prospecting").

#### Queuing orders with Shift

Holding Shift while giving any order adds it to the end of the unit's list of orders instead of replacing what it is doing. There is no limit on how many orders can be queued.

- Any order can be queued: move, attack, attack-move, patrol, hold position, gather, build, return cargo, and unit abilities. Orders of different kinds can be mixed in one queue.
- An order given without Shift clears the whole queue and replaces it.
- Stop (S) and Hold Position (H) without Shift also clear the queue. Shift + H adds a "hold here" at the end, so units walk a route and then hold the last point.
- While Shift is held, the selected units' queues are drawn in the world: a line from each unit through each queued point, with a small icon at each point for the kind of order (move, attack, build, gather). Releasing Shift hides the lines again.
- Shift + Patrol to several points in a row creates a patrol route through all of them, which loops from the last point back to the first.
- A typical gatherer chain: Shift + build a house, Shift + build a second house, Shift + right click a tree. The gatherer builds both, then goes back to chopping wood with no idle time.
- Queued builds keep their place markers on the ground, and their cost is only taken when each one is started.
- If a queued order becomes impossible (its target is dead, its spot is blocked), it is skipped and the unit moves on to the next one.

**Production queues.** Buildings that train units or make goods have their own queue, shown as icons in the selection panel. Each press of a production hotkey adds one item and takes its cost immediately; Shift + the hotkey adds five. Clicking a queued icon cancels it and refunds it in full.

**Rally points.** With a building selected, a right click sets where its new units go (ground, a unit to follow, or a resource node). Shift + right click adds further rally points, so new units follow a whole route. The rally route is drawn while the building is selected. Buildings that train warriors or mages (the Barracks, the Magi Sanctum, a main base from level 6) have Set Rally Point (R) and the right click too (suggested, as built 2026-10-03).

#### Camera

The camera looks down at the world at a fixed angle and can be panned and zoomed. It cannot be moved past the edge of the generated map.

**Edge panning (mouse).** Moving the cursor to the very edge of the screen pans the camera in that direction. To make sure players never pan by accident while using the HUD:

- The pan zones are only the outermost 4 pixels of the screen on each side (the very edge of the monitor or browser window). They are not the edges of the HUD panels.
- Where a HUD panel touches the screen edge (for example, the minimap at the bottom left), edge panning still works, but only in a thinner band: the outermost 2 pixels of the window (suggested), in that edge's direction, with the corners panning diagonally. Using the panel normally, anywhere inside that band, never pans the camera; pushing the cursor all the way to the edge of the screen does, just as it does over the game view.
- A cursor that leaves the window stops edge panning. Players who never edge-pan still have the arrow keys, middle-mouse drag and the minimap.
- Panning starts only after the cursor has stayed in a pan zone for 0.1 seconds, so the cursor briefly brushing the edge does nothing.
- The cursor changes to a directional arrow while in a pan zone, so the player always knows it is panning.
- In the corners, panning is diagonal.
- Edge panning is paused while the player is dragging a selection box, and while any menu or dialogue is open.
- The cursor is kept inside the game window while the game is in focus (see "Browser requirements"), so it can actually reach the edge of the screen.

**Arrow keys.** The arrow keys pan the camera at the same speed as edge panning; two keys together pan diagonally.

**Drag panning.** Holding the middle mouse button and dragging moves the camera as if the player had grabbed the ground.

**Minimap.** Left click on the minimap jumps the camera there; holding left click and dragging slides the camera around. Right click on the minimap gives a smart order to that spot. The minimap also accepts targets for Attack, Move, Patrol and abilities.

**Zoom.** The mouse wheel zooms in and out in smooth steps, centred on the cursor so the player zooms toward what they are pointing at. Page Up and Page Down also zoom. There is a closest and farthest zoom limit; the farthest limit is chosen so that the screen never shows enough area to give a big advantage. The camera keeps the same fixed angle at every zoom level; it never tilts. Zooming in gives a closer look at the models. Pressing Home resets zoom to the default level.

**Settings.** Edge pan speed, arrow key pan speed, and zoom speed each have a slider. Edge panning can be turned off completely.

#### Unit speech and the message panel

Units talk to their player. This is how the game tells the player what their units need, and it gives units personality. It is not used for players talking to each other.

- **Speech bubbles:** when a unit speaks, a short text bubble appears above it for a few seconds (suggested: 3.5 s plus 40 ms per letter, at most 10 bubbles on screen at once).
- **Random remarks:** now and then (suggested: about every 9 seconds, from a unit on screen), a unit makes a remark or an observation about what it is doing or what it sees. Random remarks only appear as speech bubbles; they are never added to the message panel or kept anywhere.
- **Triggered speech:** units speak when something happens to them, for example when they are hungry, under attack, the resource they were gathering has run out, a hand-picked item was taken by someone else, or they cannot carry out an order.
- **Other races talk too.** Units of other races speak in bubbles like the player's units, saying what you would expect from them: when players first find them, when trading, when they are attacked, and as random remarks. Examples are under each race in "Neutral villages and trade".
- **When their speech reaches the message panel:** their random remarks never do. Their important speech (a greeting on first meeting, a warning, a declaration of war, a surrender offer) is added to a player's message panel if the player sees it on screen, or if one of the player's units is close enough that the speaker would be on screen if the camera were centred on that unit (suggested: within 30 m), even when the player is looking somewhere else.

**The message panel.** Everything units say, apart from random remarks, also appears in the message panel with the name of the unit that said it, along with game alerts (such as "Night is falling") and messages from other players.

- The panel is semi-transparent until the cursor is over it, so it does not hide the game.
- It can be scrolled up and down, and collapsed entirely to a small button.
- Clicking a message moves the camera to the unit that said it.
- The panel keeps the latest 60 messages. Older messages are deleted, except messages from other players, which are kept.
- Messages from other players are highlighted differently from unit speech and alerts.
- A filter button switches between three views: everything; alerts and player messages only; and player messages only.

**Urgent messages.** Some messages need the player's attention, such as an order blocked by terrain or a lack of resources (suggested, as built: alerts, idle workers and nightfall count as urgent, and Space steps through them). For these:

- The minimap is always pinged at the spot where it happened.
- If the panel is collapsed, its button flashes as an alarm.
- If the panel is open, the message is shown in a way that makes it stand out from the rest (for example, a bright background).

**Chat between players.** The same panel is used for players to talk to each other. Player messages appear only in the panel, never as speech bubbles. Press Enter (or click the text box at the bottom of the panel) to type, Enter to send, and Esc to cancel. The keypad Enter works like Enter (suggested, as built 2026-10-03). Game hotkeys are paused while typing.

**Who sees what.** A player only sees speech from their own units, and from units they inherited from an eliminated or departed player. They never see speech from another active player's units, even when that player has shared control of them.

#### Playing with the mouse only

The game must be fully playable without touching the keyboard. Keyboard controls make a player faster and let them do more actions per minute, which is part of the skill ceiling, but they are never required. Every keyboard control in this section has a mouse equivalent:

| **Keyboard control** | **Mouse equivalent** |
|---|---|
| Unit command hotkeys (A, S, H, P, M, G, C, R, D, T, E, U, Q, X, Z, V) | Click the matching button on the command card. Commands that need a target then work the same way (click a spot or a unit). |
| Build menus (B, V) and grid keys in a build menu | Click Build Basic or Build Advanced on the command card, then click the building. |
| Production hotkeys in buildings | Click the item's button. Each click adds one to the queue. |
| Troop tiers and Lock at a Barracks, Stables or main base | Pick the tiers in the dropdowns and tick Lock with the mouse; there are no keys for them. |
| Shift (queue orders, place several buildings, add rally points) | Click the Queue Mode button on the utility bar. While it is lit, every order, building placement and rally point is added to the queue exactly as if Shift were held. Click it again to turn it off. It also turns off by itself when the selection changes. |
| Esc (cancel) | Right click, or click the Cancel button that appears in the bottom-right slot of the command card while targeting or placing a building. |
| Esc / F3 (clear selection) | Click the small "x" in the corner of the selection panel. |
| Tab (next subgroup) | Click the subgroup tab above a group of portraits in the selection panel to make that subgroup active. |
| Shift / Ctrl + click to change the selection | Use the selection panel: click a portrait to keep only that unit, double-click a subgroup tab to keep only that type, right click a portrait to remove that unit, and right click a subgroup tab to remove that type. Double-clicking a unit in the game view selects all of its type on screen. |
| F1 / Shift + F1 (idle gatherers) | Click the Idle Gatherer button (left click: next one; double-click: all of them). |
| F2 (select army) | Click Select Army on the utility bar. |
| Backspace (town hall) | Click Town Hall on the utility bar. |
| Space (latest urgent message) | Click the message in the message panel; the camera jumps to where it happened. |
| Enter (chat with players) | Click the text box at the bottom of the message panel. |
| A, G, E or T twice (each unit picks its own target) | Double-click the button on the command card (suggested, as built 2026-10-03). |
| Tab, Enter and Space in menus and dialogues | Click the button; Tab moves between buttons and Enter or Space presses the one in focus, while Esc and F10 still close the menu (suggested, as built 2026-10-03). |
| L (follow unit) | Click Follow on the utility bar. |
| Control group keys | Use the group tabs above the selection panel (left click to select, double-click to centre, right click to save, Shift + right click to add). |
| Camera location keys (F5 to F8) | Use the four Camera Location buttons on the utility bar (left click to jump, right click to save the current view). |
| Arrow keys (pan) | Edge panning, middle-mouse drag, or clicking and dragging on the minimap. |
| Page Up / Page Down / Home (zoom) | Mouse wheel, and Reset Zoom on the utility bar. |
| F10 (menu) | Click Menu on the utility bar. |

#### Browser requirements

Because the game runs in a web browser, some key combinations above are normally taken by the browser itself. The controls must work around this:

- Right click must never open the browser's right click menu over the game.
- Every key the game uses must be blocked from doing its normal browser job while the game has focus: for example F1 (help), F5 (refresh), Backspace, Space (page scroll), Tab (focus change) and the arrow keys (scroll). F11 (full screen) and F12 (developer tools) are left alone.
- Some browser shortcuts cannot be blocked in a normal window: Ctrl + 1 to 8 switch tabs, Ctrl + W closes the tab, Ctrl + T and Ctrl + N open new ones, and Alt + number switches tabs in some browsers on Linux. No default control in the game uses Ctrl or Alt for this reason; control groups use the group key instead (see "Control groups and camera hotkeys").
- Ctrl + F5 and Shift + F5 reload the page in most browsers, so camera locations are saved with the group key + F5 to F8 rather than Ctrl.
- On a Mac, the system treats Ctrl + click as a right click, so on Mac the game uses Cmd + click everywhere this section says Ctrl + click.
- Full screen is optional. In Chrome and Edge, full screen can also claim the keyboard (with the player's permission), which is the only case where the optional Ctrl layout for control groups is allowed.
- In full screen, a quick press of Esc works as in-game Esc; holding Esc down exits full screen. The in-game menu is on F10 so it never depends on Esc.
- The game asks the browser to lock the cursor inside the window while playing, so edge panning works on the side of the screen next to a second monitor. The cursor is released when the player opens the menu.
- Leaving or refreshing the page during a match asks the player to confirm first.

#### Quick reference

| **Input** | **Action** |
|---|---|
| Left click / left drag | Select / box select (box stays inside the game view) |
| Right click | Smart order (move, attack, gather, follow, build) |
| Shift + any order | Add to the order queue |
| A / S / H / P / M | Attack / Stop / Hold Position / Patrol / Move |
| G / C / R (gatherers) | Gather / Return Cargo / Repair |
| N (warriors) | Hunt (suggested letter) |
| R, K, F, Y, W / R, B, F, T, C (mages) | Support spells / battle spells; U Rank (suggested) |
| O | Peoples panel (suggested; rebinding it moves its badge) |
| R, E (engines) / U (Gunnery yard) | Hitch, Port / Cannon crew training (suggested) |
| Any targeted command twice | The unit picks its own target (A, G, E, T, R, N and spells; Move and Patrol only keep targeting) (suggested) |
| Shift + H | Queue Hold Position after earlier orders |
| D / T (workers) | Dig / Prospect |
| E / U | Enter a building (shelter or garrison) / Unload all |
| B / V (gatherers) | Basic Structures / Advanced Structures build menu |
| Q to T, A to G, Z to B (in a build menu) | Pick the building in that grid position (B is Back) |
| R / X (buildings) | Set Rally Point / Cancel construction |
| C / L / G / B (Barracks), C (Stables) (suggested) | Train Close melee / Long melee / Ranger / Brawler, Cavalry |
| Q / X / Z / V (warriors and mages) (suggested) | Upgrade Weapon / Upgrade Armour / Weapon Max / Armour Max (wand and robe on a mage) |
| Q (workers) (suggested) | Upgrade tool kit |
| Esc | Cancel order, ghost or menu; then clear selection |
| Tab / Shift + Tab | Next / previous subgroup |
| Double click, Ctrl + click | Select all of that type on screen |
| Group key (left of 1) + number | Save control group |
| Shift + number | Add to control group |
| Group key + Shift + number | Steal into control group |
| Right click / Shift + right click a group tab | Save / add to control group with the mouse |
| Number / number twice | Select group / select and centre camera |
| F1 / Shift + F1 | Next idle gatherer / all idle gatherers |
| F2 | Select all combat units |
| F3 | Clear selection |
| F5 to F8 / group key + F5 to F8 | Jump to / save camera location |
| Backspace | Centre on town hall (cycles) |
| Space | Jump to latest urgent message (cycles through last 8) |
| Enter | Type a message to other players (Enter to send, Esc to cancel) |
| [ / ] / \ (suggested) | Allies panel / Send resources / Map ping |
| Pause (suggested) | Pause or carry on (anyone may, online) |
| L | Follow selected unit |
| F9 / J (suggested) | Rations / Everyone Home (during dusk) |
| Arrow keys, edge of screen, middle drag | Pan camera |
| Mouse wheel, Page Up / Page Down, Home | Zoom in / out, reset zoom |
| F10 | Game menu: Resume, Pause or Carry on, Save game, Download a save file, Full screen, Settings, Quit (Leave the game online) (suggested) |

### Resources

There will be a number of different resources, viewable in an expandable section of the HUD.

So far we have:

Softwood lumber

Hardwood lumber

Medicinal herbs

Stone

Flint

Coal

Leather

Meat

Fish

Copper Ore

Tin Ore

Copper ingot

Tin Ingot

Bronze ingot

Bog iron

Iron rock

Vein iron ore

Pig iron ingot

Iron ingot

Steel ingot

All resources go into one shared pool for each player. Resources are not kept inside buildings, so losing a building never loses resources. Workers deposit what they gather at drop-off buildings, and buildings take what they need straight from the pool.

#### Additional resources

Resources not in the list above. Eggs and feathers come from livestock (see "Animals"); gold and gems are used in trade, directly or made into trinkets (see "Neutral villages and trade" and "Trinkets"). Rows marked "(suggested)" fill gaps in the path to muskets and cannons or give farms and magic something to work with:

| **Resource** | **Where it comes from** | **Why it is needed** |
|---|---|---|
| Eggs | Chickens | Food. |
| Feathers | Chickens, hunted wild geese and pheasants (Jade: wild birds), and Runkin traders | Needed to train bow and crossbow rangers (see "Troops and gear"); bedding, quills for research. |
| Gold | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or made into gold trinkets and Sunhearts (see "Trinkets"); the Deep Mining III fee and the level 10 main base (see tables 2a and 4). |
| Emeralds | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or set into Moonleafs (see "Trinkets"). |
| Rubies | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages, directly or set into Sunhearts (see "Trinkets"). |
| Diamonds | Mostly mineshafts; very rarely, tiny amounts on the surface | Trading with villages. |
| Silver | Mostly from mineshafts, often found together with lead ore, as in real life | Silver trinkets and Moonleafs, for trading with villages (see "Trinkets"); the Deep Mining II and III fees (see tables 2a and 4). |
| Marble | Carved from marble rock, which appears in places in the land (see "Terrain") | Grand buildings, such as main base levels 5 and up (see "Main base"); also traded with the Elves. |
| Earth | Digging soil (see "Terrain") | Building the land up: ramps, earth banks and filling holes and ditches. |
| Gravel | Digging gravel (see "Terrain"), or crushing stone at a workshop | Paths, and fill for raising the land (suggested). |
| Hardwood sticks | Gathered from hazel bushes near the start (they grow back after cutting), or made from hardwood lumber at a workshop | Tier 1 and 2 tool kits and weapons, so they can be made before large hardwood trees are within reach. |
| Clay (suggested) | Riverbanks and wetlands | Bricks, furnace linings, moulds for casting metal and cannons. |
| Sand (suggested) | Beaches and riverbeds | Glass (lanterns, lenses, potion bottles) and casting moulds. |
| Charcoal (suggested) | Made at a kiln from hardwood | The fuel for smelting until coal takes over, and one of the three gunpowder ingredients. |
| Saltpetre (suggested) | Rare deposits on cave floors in the Fringe and Deepwoods and deeper (table 5), or made over time in a compost or nitre bed | Gunpowder (the largest part of it). |
| Sulphur (suggested) | Near volcanic ground and hot springs, far from spawn | Gunpowder. A good "rare resource that forces expansion" like those described in the Premise. |
| Wheat | Farms | Food, and made into bread at a higher-tier cooking building. |
| Potatoes | Vegetable farms | Food. Some vegetable farms can grow in poorer land where grass is thin. |
| Carrots | Vegetable farms | Food. |
| Corn | Farms | Food. |
| Flax | Farms and wild plants (suggested) | Another way to make rope besides leather, robes for mages, and the fabric in metal armour instead of leather (see "Troops and gear"). Suggested: bowstrings, cloth, sails, bandages. |
| Hides (suggested) | Hunting wild animals | Raw skins that a tannery turns into leather, and leather into hardened leather. (Cattle give leather directly.) |
| Bone (suggested) | Hunting and some monsters | Early tools, arrowheads, glue, and fertiliser for farms. |
| Resin / pitch (suggested) | Softwood trees | Waterproofing, torches, glue. |
| Spider silk | Dropped by giant spiders | Bowstrings and rope, like flax and sinew. Suggested: a silk bowstring gives a bow a little more range. |
| Demon horn | Dropped by red demons and the archfiend | Trinkets and wands. |
| Hexstone (suggested) | Dropped by goblins | A dull green pebble scratched with crude goblin runes that still hums with stolen magic. Used at the Magi Sanctum to research the **Warding** and **Counterspell** spells (suggested), and spells that break curses and hexes (suggested). There is no ward item: mages do this with spells (Jade). |
| Venom | Dropped by vipers, scorpions, centipedes and hornets | Trading and later uses (poison arrows went with the troop rework, since ammunition is unlimited (suggested)). |
| Lead ore (suggested) | Mineral deposits, often near silver-grey rock | Trading and later uses (ammunition is unlimited since the troop rework, so shot is no longer made). |
| Mana crystal (working name) (suggested) | Rare nodes far from spawn, or dropped by certain magical creatures | Rank-ups for higher-tier mages, top wands and robes, and magic research. Spells themselves use the mage's own mana (see "Magic"). |

### Units

There are three kinds of unit: workers, who keep the town running; warriors, who fight and hunt; and mages (see "Magic").

#### Workers

Workers do every non-combat job. A worker's current job decides its animation, what it carries and which command card buttons it shows. Jobs:

- **Gathering:** chopping trees, picking herbs, collecting stone and flint from the surface.
- **Mining:** working ore, coal and stone inside a mineshaft or at an open rock face.
- **Digging:** carving out the land, digging trenches, moats and tunnels, and building the land up (see "Terrain").
- **Prospecting:** checking an area for hidden minerals before a mineshaft is built (see "Mineshafts and prospecting").
- **Farming:** working an assigned farm field. A worker assigned to a farm stays there until reassigned. Suggested: right-clicking a farm with workers assigns them to it, while E Enter only shelters them; assigned workers shelter in their own farm.
- **Fishing:** fishing from shorelines or a fishing dock.
- **Building and repairing** structures, and repairing mechanical units such as cannons and catapults (they do not heal on their own).
- **Crafting:** working inside a production building (forge, lumber mill, kiln and so on). A production building only works while workers are assigned to it, and works faster with more of them up to its limit.
- **Hauling:** carrying meat back from a hunt (within the 25 lb limit for raw materials), and driving carts pulled by horses or oxen for heavier loads.
- **Sheltering:** at night, workers can shelter inside farms, fishing docks and main bases. If the building is destroyed while they are inside, each worker takes damage equal to 10% of its maximum health and is left standing where the building was.

Workers can defend themselves weakly with whatever tool they are holding but are not meant to fight. A worker's **tool tier** decides how fast it works and which resources it can work at all (see "Progression"). Tools are not items: each worker has one tool kit for its tier and upgrades it with Q (see "Troops and gear").

Workers are trained at main bases and at farms.

#### Warriors

Warriors (troops) fight and hunt. Each troop is one of five types and keeps that type for good: close melee, long melee, ranger, brawler and cavalry. Its weapon and armour are not items: they are tiers chosen when it is trained and raised with the Upgrade buttons (see "Troops and gear" (Jade, 2026-10-03)).

- **Speed:** a warrior's base running speed is 3 m/s (a placeholder), so 30 seconds of running covers about 90 m. Gear has no weight, so nothing it wears slows it down or stops it swimming (Jade, 2026-10-03).
- **Material limits follow real life.** Bronze is heavy for what it gives and softer than good iron and steel: bronze swords are short swords, since long bronze blades bend, and bronze armour stops at scale.
- **Hunting:** warriors kill animals for meat and leather. Once an animal dies, its carcass becomes a resource node. The warrior can carry meat back, within its carrying limit (table 12), or leave the carcass for workers to collect. Some animals run away; some fight back.

Troops are trained at the Barracks, cavalry at the Stables, and tier 1 close melee, long melee and rangers also at main bases (Jade, 2026-10-03). Rangers and brawlers can fight from towers, and from the parapets of a main base of level 3 or higher.

#### Experience and training

- Units gain **experience** in combat and grow stronger as they rank up, so losing a veteran hurts.
- Units can also be **trained** at a training building. Training costs time and food, and the unit stays inside the building and cannot do anything else until it finishes. Training can be cancelled early in an emergency, but the unit gains nothing.
- Training has a **limit**. Out of about five levels, training buildings can raise a unit at most **two levels above its starting level**; everything beyond that comes only from combat experience. Crewing a cannon is the one specialist skill left: training only makes the unit able to crew one; getting good comes from combat.
- **No specialist weapon training (Jade, 2026-10-03):** archery, crossbow, musket and riding training are gone, because a troop's type (ranger, brawler, cavalry and so on) is chosen when it is trained. Cannon crews are still trained at the Gunnery yard.

#### Table 1: Player unit stats

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Warriors and workers have 5 ranks (Jade: about five levels) and mages the doc's 6. A training building raises a unit at most two levels above its start (Jade), so training reaches rank 3 (Veteran, Adept Acolyte, Master worker) and everything above comes only from combat experience. Weapon specialisations only make a unit able to use the weapon and give no bonus (Jade).

| **Unit** | **Rank** | **XP to reach** | **Health** | **Damage** | **Attack time** | **Move** | **Armour** | **Sight** | **Leash** | **Reach / min range** |
|---|---|---|---|---|---|---|---|---|---|---|
| Worker | 1 Labourer | training only (s) | 60 | tool (4 hardwood) | 1.5 s | 3.0 | none | 20 m (s) | none; flees 10 m from attackers (s) | 1.2 m (s) |
| Worker | 2 Hand | training (s) | 70 (s) | tool +5% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Worker | 3 Master | training (s) | 80 (s) | tool +10% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Worker | 4 Foreman / 5 Elder | combat XP 400 / 1000, which workers rarely earn (s) | 90 / 100 (s) | tool +15% / +20% (s) | 1.5 s | 3.0 | gear | 20 m (s) | as above | 1.2 m (s) |
| Warrior (any troop type) | 1 Recruit | 0 | 100 | weapon (tables 2d, 2e) | weapon | 3.0 | gear | 24 m (s) | 20 m idle, 40 m Hunt (s) | close melee 1.2 to 1.3 m; long melee 2.5 m (pike 3.5 m), no minimum range, +30% at the outer third (Jade) |
| Warrior | 2 Soldier | 50 (s) | 120 (s) | weapon +5% (s) | weapon | 3.0 | gear | 24 m (s) | same | same |
| Warrior | 3 Veteran | 150 (s) | 140 (s) | weapon +10% (s) | weapon | 3.0 | gear | 24 m (s) | same | same |
| Warrior | 4 Elite | 400 (s) | 160 (s) | weapon +15% (s) | weapon | 3.0 | gear | 26 m (s) | same | same |
| Warrior | 5 Hero | 1000 (s) | 180 (s) | weapon +20% (steel sword 36) (s) | weapon (sword 1.2 s) | 3.0 | gear | 28 m (s) | same | same |
| Cavalry (Jade: a type trained at the Stables) | rider's | rider's | rider's; horse 160 (s) | rider's weapon, +0.5 m reach from the saddle (s) | weapon | horse: walk 2, trot 5, gallop 8 (s) | rider's; horse 0 (s) | 30 m (s) | 60 m (s) | long melee only (Jade) |
| Support mage | 1 Novice Acolyte | 0 | 70 (s) | wand tap 3 (s) | 1.5 s (s) | 3.0 | robe (table 13) | 24 m (s) | 15 m (s) | spells, table 13 |
| Support mage | 2 Acolyte | 40 (s) | 80 (s) | spells x1.1 |  | 3.0 |  |  |  |  |
| Support mage | 3 Adept Acolyte | 120 (s) | 90 (s) | x1.2 |  | 3.0 |  |  |  |  |
| Support mage | 4 Mage | 300 (s) | 100 (s) | x1.3 |  | 3.0 |  |  |  |  |
| Support mage | 5 Master Mage | 800 (s) | 110 (s) | x1.4 |  | 3.0 |  |  |  |  |
| Support mage | 6 Grand Magician | 2000 (s) | 120 (s) | x1.5 |  | 3.0 |  |  |  |  |
| Battle mage | 1 to 6 | as support (s) | as support (s) | spells, table 13, same multipliers | 1.0 s cast (s) | 3.0 | robe (table 13) | 24 m (s) | 15 m (s) | spells |

**How these were set:** health steps of 20 per warrior rank put the roster's "veteran about 180" at rank 5 (Hero); the XP ladder is set so that one warrior who takes most of night 0's kills (budget 12, so about 24 XP) reaches Soldier on night 1, and a 30-warrior army averages Hero around night 80 (table 8 budgets, 2 XP per threat). Mage health is 10 below a warrior at every step because they wear no metal.

#### Table 7: Training and upgrading

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 1 ranks; the food costs are nutrition (header rule). A unit's kit is the weapon (table 2c, 2d or 2e), the armour and, for close melee, the shield (table 3), or for a mage the wand and robe (table 13).

| **Training** | **Where** | **Cost** | **Time** | **Needs** |
|---|---|---|---|---|
| New worker | Big House or any farm | 20 food, a tier 1 tool kit | 15 s plus the kit's time (s) | free supply |
| New close melee, long melee or ranger, tier 1 | main base (Jade) or Barracks | 30 food, the kit | 45 s plus the kit's time (s) | free supply |
| New troop, any type and tiers | Barracks; cavalry at the Stables (Jade) | 30 food, the kit; feathers and gunpowder as table 2e | 45 s plus the kit's time (s) | free supply; the tier's forge or research (troops and gear table) |
| New cavalry | Stables (Jade) | 30 food, the kit, a tamed horse in the stalls, used up (Jade) | 45 s plus the kit's time (s) | free supply |
| New mage (Novice Acolyte) | Magi Sanctum or main base 6+ | 50 food, a hazel wand and a homespun robe (table 13) | 60 s plus the kit's time (s) | free supply |
| Upgrade weapon, armour, tools, wand or robe (one tier) | beside the nearest Forge, Barracks or main base; cavalry also the Stables; mages also the Magi Sanctum | the new tier's kit cost; the old kit comes back in full (Jade) | half the new piece's time to make (s) | the tier's forge or research |
| Worker to Hand / to Master | Big House | 20 / 40 food | 60 / 120 s | base 2 / base 5 (s) |
| Troop to Soldier / to Veteran | Barracks | 30 / 60 food | 60 / 120 s | (s) |
| Mage to Acolyte / to Adept Acolyte | Magi Sanctum | 40 food / 60 food, 2 mana crystals | 60 / 120 s | (s) |
| Mage, Master Mage, Grand Magician (combat ranks) | Magi Sanctum | 2 / 5 / 10 mana crystals from stock (no rank-wand item); the XP is banked until it is given | 30 s | XP from table 1 (s) |
| Cannon crew | Gunnery yard | 40 food | 90 s | Cannons (s) |

Training stops two levels above the start (Jade): rank 3 (Veteran, Adept Acolyte, Master worker); the ranks above are combat only. Archery, Crossbow, Musket and Riding training are gone: a troop's type is chosen when it is trained (Jade, 2026-10-03). One unit trains at a time per building; a Barracks, Stables or Sanctum can queue 5 (s). Every time here is Open for Jade's rebalance.

### Combat

Every attack is either **melee** (the attacker strikes with what it holds, nothing flies) or **ranged**. Each attack has its own predefined range.

#### Melee

Melee fighters use one of two kinds of weapon:

- **One-handed weapons** (cudgels, axes, swords and so on), used by close-melee troops, who carry a **shield** with any armour.
- **Polearms:** the two-handed spears, pikes, halberds and great swords of long-melee troops and cavalry. In this blueprint "polearm" means all of these, the zweihänder included.

**How melee hits land.** Melee damage does not need the weapon model to physically touch the enemy. At the moment of the hit in the attack animation, everything inside the attack's area takes damage:

- **Stabs** (spear and pike thrusts and other stabbing attacks) hit a single target.
- **Slashes, cleaves and every other swing** (anything that is not a stab) hit everything in an arc in front of the attacker, roughly matching the swing of the weapon. Suggested: the main target takes full damage, others in the arc take less, and friendly units are never hurt.

#### Charges

- Cavalry and ox riders deal **100% extra damage** (double damage) when they hit with a charge.
- A hit counts as a charge only after a short, straight run at the mount's full speed.
- A charge **knocks back** enemies smaller than the charging animal by 1 to 2 m on impact; smaller targets are thrown farther. Enemies as big as the mount or bigger are not knocked back.

**Riding in detail (suggested)** (as built, 2026-10-03):

- A rider and its mount are one unit. A blow lands on whichever of the two has more health (the mount on a tie), through the mount's armour. When the mount dies, the rider fights on foot with the same weapon.
- Cavalry is its own troop type, trained at the Stables with a long-melee weapon (Jade); it gets +0.5 m reach, 30 m sight and a 60 m leash. Cavalry cannot garrison a building or crew an engine. A cavalry horse still eats.
- A rider trots on orders and gallops when closing on a foe. The run stays straight while the heading turns less than about 11 degrees a step and the speed stays at 80% of a gallop or more. Reining in within 4 m of the foe keeps the run, so the blow that ends a gallop is a charge.
- There is no mounting or dismounting: a horse at the Stables is used up when the cavalry unit is trained, and a rider whose horse dies stays a cavalry unit on foot (suggested).

#### Siege engines and cannons (suggested)

As built, 2026-10-03. Numbers are in tables 2f and 14.

- Catapults are made at the Great Workshop, ballistas at the Manufactory and cannons at the Foundry. Engines use no supply and never heal by themselves; a worker repairs one from 3 m away, and a full repair takes as long as making the engine.
- A hitched horse or ox hauls an engine while within 5 m of it. Crew stand within 4 m of their engine to work it or push it, fight whatever comes within 6 m of them, then go back to it.
- An engine sees 20 m by itself; its crew's eyes do the rest.
- The Citadel's 4 cannon ports are the four corners of its roof. A cannon hauled to the door goes up into a free port; its animal is let go at the door and its crew follow it in.
- One gunpowder makes 10 cannon charges; a cannon shot uses one charge and one cannonball. Muskets and pistols need no ammunition after training (unlimited ammunition, Jade).

#### One-handed weapons and shields

- One-handed weapons have to get in close to deal damage, but have no minimum range: they can always hit an enemy right next to them.
- A close-melee troop carries the **shield** that comes with its armour tier (none with no armour), which blunts damage from **projectile** ranged attacks by a percentage set by the shield (table 3). No other troop type has a shield (Jade).

#### Polearms

- Polearms have **reach**: they hit from a short distance away. This is still a melee attack, with no projectile.
- Polearms have **no minimum range** and no close-in penalty: they can always attack, even an enemy right next to them (Jade, 2026-10-03).
- **Edge of reach:** a polearm hit landing in the outer third of the weapon's reach (suggested) is a **critical hit** for **30% extra damage** (Jade). Cavalry, who carry long-melee weapons, get the same rule (Jade). So a long-melee troop does best holding an enemy at the tip of its weapon.
- The price of a polearm is no shield and a slower swing than a close-melee weapon of the same tier (Jade), which makes long melee the damage-focused, versatile attacking type. Numbers are in table 2d.
- There is no backup weapon: every troop fights with the one weapon of its type and tier.

#### Fighting flying enemies

- Polearms can hit **low-flying** enemies.
- One-handed weapons can only hit a **flying melee attacker** while it swoops down to make its attack.
- Ranged attacks can hit flying enemies. Suggested: enemies that fly higher than low-flying ones can only be hit by ranged attacks and magic.

#### Ranged attacks

- **Projectile attacks** send something flying that can be dodged or blocked: arrows, crossbow bolts, sling stones, thrown spears, musket balls, cannonballs, and some spells, such as a fireball.
- **Non-projectile attacks** deal damage at range with nothing flying. Some magic attacks work this way. Some of them still show a visible beam or arc of particles, but that is only for show: they still count as non-projectile.
- Every ranged attack has its own predefined range.

#### How ranged attacks hit (suggested)

Direct collision works well, with a few additions so that it stays fair, fast and the same on every computer:

- **Projectiles really fly.** Every simulation step, a projectile moves along its path (an arc for arrows, sling stones, thrown spears and cannonballs; close to straight for bolts and musket balls) and checks the whole stretch it has just travelled for anything solid. Checking the whole stretch, not only the point where it ends up, stops a fast musket ball from skipping through a thin wall or a small unit between steps.
- **Simple hit shapes.** Everything that can be hit uses one or a few simple boxes rather than its detailed model. This suits the cube art style and keeps the checks cheap. Only things in nearby chunks are checked.
- **Aiming.** The shooter aims at where a moving target will be when the projectile arrives, with a small random spread that is smaller for better weapons and more experienced units. A target that changes direction can make a shot miss.
- **First thing hit.** A projectile stops at the first solid thing on its path (the target, another enemy, a tree, a wall, a building or the ground), and that thing takes the hit.
- **Friendly units.** Projectiles pass through friendly and allied units, so archers can shoot past their own front line.
- **Finding a clear shot.** Before shooting, a unit checks that its own side's walls and buildings are not in the way. Arcing shots such as arrows can go over a wall when the target is far enough away; straight shots such as crossbow bolts and musket balls need a clear line, for example from a tower, a parapet or a gap. A unit without a clear shot moves to find one, unless it is on Hold Position.
- **Non-projectile attacks** can only be cast when the attacker has a clear line of sight to a target in range. Once cast, they hit even if the target moves behind a wall or a tree.
- All of this is part of the game simulation, so it uses whole-number maths and the seeded random number generator, and every computer sees the same hits and misses (see "Technology").

#### Walls, trees and ranged attacks

- Walls, trees and other obstacles block projectiles, and take damage when they do. They only stop non-projectile attacks by blocking the line of sight needed to cast them.
- Each attack has a separate damage value against barriers. An arrow or bolt does a completely negligible amount, even to the weakest barrier. A fireball does substantial damage, with a bonus against wooden targets.

#### Rangers (agreed 2026-10-03)

- A ranger climbs one ladder (Jade): leather sling (tier 1), yew longbow (2), recurve bow (3 to 6, each tier with arrowheads of its own metal), steel-prod crossbow (7, needs the Crossbows research) and flintlock musket (8, needs Gunpowder and Muskets). Numbers are in table 2e.
- **Ammunition is unlimited** (Jade): there are no arrows, bolts, quivers, shot or powder horns. Feathers are paid when a bow or crossbow ranger is trained or upgraded, and gunpowder when a musket ranger or brawler is (Jade).
- There are no poison or fire arrows (suggested, since ammunition is unlimited). Venom and resin keep their other uses.
- A crossbow hits much harder than a recurve bow but reloads slowly; the musket hits hardest of all and reloads slowest.
- **Brawler** (tier 8 only): a flintlock pistol for a close shot, then a cutlass in melee (suggested).

**Iron or steel? (history)** The earliest crossbows, in ancient China and Greece, used no iron at all: the bow part (the "prod") was wood or horn, and Chinese trigger mechanisms were bronze. Medieval European crossbows added iron fittings such as the trigger lever and the foot stirrup used for loading. From around 1400, steel prods made crossbows much more powerful. The game uses the steel-prod crossbow only, at tier 7, behind one Crossbows research (Jade).

### Animals

| **Animal** | **How you get it** | **What it gives** |
|---|---|---|
| Horse | Tamed in the wild (Fringe) | Used up to train cavalry at the Stables (Jade, 2026-10-03). Pulls carts for hauling, and hauls catapults, ballistas and cannons. |
| Ox | Tamed in the wild (Fringe) or bred | Hauling: pulls carts, catapults, ballistas and cannons. Slower than a horse but stronger. Oxen are a separate, bigger wild breed, not trained cattle, and are domesticated just like cattle. |
| Chicken | Tamed in the wild (Heartland and Fringe), then raised on farms | Meat, eggs and feathers. |
| Wild goose (suggested) | Hunted with N by Heartland water | Meat and feathers (Jade: a wild source of feathers). |
| Pheasant (suggested) | Hunted with N in the Fringe woods | Meat and feathers. |
| Cattle (cows and bulls) | Tamed in the wild (Heartland), then raised on farms | Meat and leather. Leather is used in armour kits and can be made into sinew (rope) or hardened leather. Grazes on grassland (see below). |

Livestock can also be bought live from Halfling villages, or taken as plunder by winning a war against a village that keeps livestock (see "Neutral villages and trade").

#### Wild herds

- Wild **cattle** roam the Heartland, wild **chickens** roam the Heartland and Fringe, and wild **oxen** and **horses** roam the Fringe. All of them can be tamed.
- There is a **fixed number** of wild animals; they do not keep spawning, so taming them matters mostly in the early game.
- Each wild pair produces a young one every **10 days**. Once every wild pair has been domesticated, wild breeding stops. Tamed pairs keep breeding on the player's farms, so only the wild stock is limited.

#### Game and other wild animals

- **Game for hunting (suggested):** hares and deer (stags carry antlers) run away when attacked; wild boar fight back. All give meat and hides.
- **Other wild creatures (suggested):** grey forest wolves roam in packs; lynx stalk lone workers; giant frogs guard bogs; crocodiles wait in rivers and bogs; giant crabs live on shores and streams; badgers knock over outlying torches. Their roles and stats are in the mob roster file.

#### Bears

- Wild **bears** roam the Deepwoods. They can never be tamed by players (only the Elves have tamed bears).
- Bears do not attack unless they are attacked first or something comes within **2 m** of them.
- Bears breed in pairs like other animals. A cub stays with one of its parents until it grows up. A **mother bear with a cub** attacks anything that comes within **15 m**.
- Wild bears keep breeding (they can never be domesticated), but only up to about **one adult pair plus their cubs per Deepwoods cell**, like the crowding limit for fish. There is also a **hard ceiling** on the total number of bears, so the Deepwoods never fill with them (at most 60 bears in total). Suggested: hunted bears give meat and hides.

#### Young animals

- Every animal is born young, as with fish: a young animal uses the adult model at about half the size, with a different texture, and cannot breed until it grows up. Suggested: animals stay young for 2 days, like fish.

#### Fish

| **Fish** | **Where it lives** | **A pair breeds every** | **Most fish per area of water** |
|---|---|---|---|
| Trout | Streams in the Heartland | 3 days | 1 per 4 m² |
| Salmon | Streams in the Fringe | 6 days | 1 per 8 m² |
| Giant catfish | Pools in the Deepwoods | 9 days | 1 per 8 m² |

- Fish breed **endlessly**, as long as their water is not too crowded. Once a stretch of water holds its maximum, breeding there stops until fish are caught. Water is finite (see "Water" under "Terrain"), so the size of a stream or pool sets how many fish it can hold.
- New fish are born as **young fish**. They stay young for 2 days and cannot breed. A young fish uses the same model as the adult at about half the size, with a different texture.

Monsters kill livestock left out at night, so animals need protecting (pens and barns, walls, or guards).

**Grazing.** Cattle, horses, oxen and chickens graze on grassland. Where there is not enough grass, they eat from the player's non-animal food instead (crops such as wheat and potatoes), which is very wasteful: feeding a large herd on potatoes rather than grass should cost far more food than the herd is worth. Grassland becomes thinner the farther it is from the start basin, until the land is barren (see "The world").

**Working animals** cannot graze while they work. Horses being ridden or hauling, and oxen hauling, eat from the food stock instead. Oxen are the more efficient haulers: they haul more for the food they eat than horses do.

#### Table 14: Mounts and charges

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Knockback rule (s): 2 m if the target is no taller than 60% of the mount's shoulder height, 1 m if shorter than the mount, none otherwise. A charge counts after 6 m (8 m for an ox) of straight running at gallop; after the hit the mount must run that distance again before the next charge counts (s).

| **Mount** | **Health** | **Armour** | **Shoulder height** | **Walk / trot / gallop** | **Charge run** | **Rider attack** | **Taming** | **Breeding** | **Housed at** |
|---|---|---|---|---|---|---|---|---|---|
| Horse (player) | 160 (s) | 0 (s) | 1.6 m (s) | 2 / 5 / 8 m/s (s) | 6 m (s) | rider's weapon, x2 on a charge | a worker with 5 wheat, carrots or corn stands by a wild horse for 45 s; needs Stables (s) | tamed pair: 1 foal every 10 days; adult after 2 days | Stables, 6 stalls (s) |
| Ox (player, hauling only) | 250 (s) | 10% (s) | 1.5 m (s) | 1.5 / 3 / 4 m/s (s) | not ridden by players (s) | none | as the horse but 10 food and 60 s (s) | as the horse | Stables or livestock farm (s) |
| Halfling war ox (two riders) | 250 (s) | 10% (s) | 1.5 m (s) | 1.5 / 3.5 / 5 m/s (s) | 8 m (s) | front rider bronze spear 18 / 1.4 s (was 14; matches the spearman, coordinator 2026-10-02), x2 on a charge; rear rider shortbow 12 / 2.0 s, 20 m, fires while moving (s) | Halflings only | Halfling village | Halfling barn |
| Goblin wolf (wolf rider) | 70 | 0 (s) | 0.9 m (s) | 2 / 4 / 5.5 m/s (s) | 5 m (s) | roster 6.3 (spear 9, charge doubles) | goblins only | goblin wolf pen | goblin village |
| Elf war bear (bear rider) | 400 (s) | 15% (s) | 1.5 m (s) | 1.5 / 4 / 6 m/s (s) | 6 m (s) | rider: Elf HQ steel glaive 45 / 1.6 s (was 38; matches the Bladewarden and table 19, coordinator 2026-10-02) (s), x2 on a charge; the bear also swipes 25 / 1.5 s in a 2 m arc (s) | Elves only | Elf bear pen | Elf kingdom |
| Tamed bear (on foot) | 400 (s) | 15% (s) | 1.5 m (s) | 1.5 / 4 / 6 m/s (s) | none | swipe 25 / 1.5 s, 2 m arc (s) | Elves only |  |  |

**How these were set:** a horse at 8 m/s needs 0.75 s of straight run for 6 m, so charges happen naturally when cavalry closes on a wave but not in a melee. Wild herd sizes are in table 5. Elf caravan wagons are pulled by two horses (doc); a Dwarf sled by one ox.

**Milestone 8 picks (s), added 2026-10-03 from what was built (blueprint/m8-picks.md)**

| **Rule** | **Value (s)** |
|---|---|
| Rider and mount | one unit; a blow lands on whichever has more health (the mount on a tie), through the mount's armour; when the mount dies the rider fights on foot |
| Mounted | reach +0.5 m, sight 30 m, leash 60 m, bow spread doubled; must get down to garrison or crew; a ridden horse still eats 2 a cycle |
| Charge run | trot on orders, gallop when closing; straight while the heading turns under about 11 degrees a step and speed stays at 80% of gallop or more; reining in within 4 m keeps the run |
| Mounting | within 2 m of the horse; a dismounted horse walks back to its Stables; mounted hit box 0.6 m half width; riding training needs a tamed horse in the Stables |
| Rider weapons | Halfling ox front rider bronze spear 18; Elf bear rider glaive 45 (table above, corrected 2026-10-02) |
| Halfling war oxen | 2 per barn (grows with the band); at war a spearman takes each ox with an archer behind; the archer gets down if the ox falls |
| Engines | Great Workshop catapult, Manufactory ballista, Foundry cannons; no supply; never heal; a worker repairs from 3 m, a full repair takes the make time; a hitched animal hauls within 5 m; crew within 4 m to work or push, fight within 6 m then return; an engine sees 20 m |
| Citadel ports | the roof's four corners; a cannon hauled to the door goes up into a free port; its animal is let go and its crew follow |
| Dwarf city guns | garrison adds 6 Gunners, 4 Cannon crew and 2 cannons inside the gate; sells 1 cannon a day (bronze or iron) and 3 steel muskets; powder horns and shot pouches at 1.5 x, gunpowder 48, lead shot 12 per ten, cannonballs 30 |
| Late mob tricks | plague bearer miasma 1 per s within 6 m, no healing; gravewing snatches lone workers within 30 m, 40 damage, held 2 s; bone colossus boulder every 8 s; hollow priest raises every 12 s, at most 6; hellhound 5 m cone, 24 over 2 s, every 8 s; fiend 40% faster below 30% health; chain fiend hook 10 m, 15, every 8 s; void stalker seen within 4 m unless lit, first strike x3; juggernaut 5 per s within 3 m of its sides, double damage from behind, no knockback; barrow knight blocks 60% of frontal projectile damage; void witch hex 10 m every 15 s, blink 15 m every 10 s; abyssal drake breath line 1.5 m wide; archfiend +20% damage within 15 m, 4 cinderlings every 20 s; rift colossus beam 200 every 10 s; Rift scorpion every other hit 10 plus 30 poison; Rift hornet slows 30% for 3 s; high flyers circle at 12 m; breakers cave in the land ahead; lair sleepers use no tricks |
| Morvath | targets the first player still in the game; Crown of night 30 m; Ruin every 20 s, 3 s warning, 300 within 20 m; the Rift every 60 s, open 30 s, a demon every 3 s; spells start 20 s and 30 s after arrival; below half health flies at 4 m/s |
| Controls | U Train opens Archery, Crossbow, Riding, Musket, Cannon, Back; R Ride or Dismount; engine card A, S, H, M, R Hitch (Let go), E Port; right clicks: engine on your horse or ox hitches, on the Citadel ports; warriors on your engine crew; workers on a damaged engine repair |
| Debug buttons (test builds) | Stables, Siege kit, Gun kit, Citadel, Night mob (cycles nights 25 to 110 and the Rift-touched beasts), Wave (nights 30, 50, 85, 105), Morvath |

### Buildings

A first list of buildings. Names in this list are working names, and buildings marked "suggested" were not in the original notes.

| **Building** | **Build menu** | **Purpose** |
|---|---|---|
| Big House (main base) | Start; extra ones from the Basic menu | Drop-off point for every resource. Trains workers and tier 1 close melee, long melee and rangers (Jade, 2026-10-03), and mages from level 6. Workers can shelter inside. Upgraded up to level 10 (see "Main base" below). |
| Farms | Basic | Suggested types: crop fields, vegetable farms, herb beds and livestock farms (a pen with a coop and trough), each with 3 tiers (stick fence, then rail fence and shed, then stone wall and well), plus a farmhouse (thatched, then timber, then stone) where assigned workers shelter. Grow crops or raise livestock when workers are assigned. Food comes in slowly but never runs out. Farms are the main source of supply, train workers, and shelter workers at night. There are different types and tiers that give different amounts of supply. |
| Pen and barn (suggested) | Basic | Keep livestock safe at night, when monsters will kill animals left in the open. |
| Lumber mill | Basic | Turns logs into planks for carts, shields and gun stocks (buildings are paid in lumber, see table 4). Also a drop-off point for wood. Suggested: an upgrade adds a waterwheel and works faster. |
| Storehouse (suggested) | Basic | A drop-off point for all resources, built near far-off gathering spots so workers walk less. |
| Fishing dock | Basic | Built on a shoreline from lumber and rope, or lumber and a little metal. Lets workers fish faster and in deeper water. Workers assigned to it shelter in it at night. |
| Torch post and wall torch | Basic | Lights that claim land around them (see "Light and torches"). Built from softwood lumber and resin or pitch (suggested). |
| Tannery (suggested) | Basic | Turns hides from hunting into leather, and leather into hardened leather. It has no tiers and does all leather work (Jade). |
| Cooking building (5 tiers) | Basic | Cooks raw food into food with more nutrition. Burns lumber or coal. See "Cooking" below. |
| Herbalist hut (suggested) | Basic | Turns medicinal herbs into bandages and remedies that heal units. |
| Walls, gates and towers | Basic | Defences for chokepoints. Walls can be built from any type of lumber or from stone. Softwood walls are the weakest, and stone walls take much longer to build. Ranged warriors and mages can fight from towers. |
| Earthworks | Basic | Ramps, earth banks and filling holes and ditches. Ramps can be built from Earth, any type of lumber or stone (lumber and stone ramps are made at a workshop); banks and fill are made from Earth (see "Digging and building up the land"). |
| Scholar's Lodge | Advanced | Research building (see "Research" below). |
| Magi Sanctum | Advanced | Trains novice mages and trains mages up through the lower ranks. |
| Stables (suggested) | Advanced | Tames and breeds horses and oxen, and trains cavalry, using up a tamed horse for each (Jade, 2026-10-03). |
| Gunnery yard (suggested) | Advanced | Trains cannon crews. Muskets need it for their research. |
| Mineshaft | Advanced | Built on flat stone. Lets workers mine ore, coal, stone, gold and gems from underground, which lasts much longer than surface rocks. Comes in tiers (suggested: 3) that dig deeper, each unlocked by research (see "Research") (see "Mineshafts and prospecting"). |
| Workshop | Basic | Crushes stone into gravel, turns hardwood lumber into hardwood sticks, makes ramps from lumber or stone, and makes trinkets for trading with villages. Has 4 tiers, and each tier makes a higher tier of trinket; the upper tiers' other uses are still to be added (see "Workshop" below). |
| Kiln / charcoal pit (suggested) | Advanced | Burns hardwood into charcoal and fires clay into bricks. |
| Forge | Advanced | Only smelts ore into ingots (Jade, 2026-10-03); it makes no items. Has 4 levels that decide which metals it can smelt (see "Forge levels" below). Units can upgrade their gear beside it. |
| Powder mill (suggested) | Advanced | Mixes saltpetre, sulphur and charcoal into gunpowder. |
| Foundry (suggested) | Advanced | Casts cannons and cannonballs from bronze or iron. |
| Barracks | Advanced | Trains close melee, long melee, rangers and brawlers at any weapon and armour tier, with a Lock per type (see "Troops and gear" (Jade, 2026-10-03)). |

#### Main base

- The main base starts as the level 1 Big House and can be upgraded up to **level 10**. Each level looks grander and larger, following the technology of the time: from a log hut (clubs and stone tools) to a large, tall fortress (steel and early gunpowder) at level 10. Each level has its own name. Suggested names: 1 Big House, 2 Longhall, 3 Hall (first parapets), 4 Stockade Hall, 5 Marble Hall, 6 Keep (with a mage balcony), 7 Fortified Keep, 8 Castle, 9 Great Castle, 10 Citadel (with gun ports).
- **The footprint never changes.** Every level takes up the same floor space. On early levels the unused space is filled with decorative items (woodpiles, fences, campfire and so on) that units can walk through but nothing can be built on, so the space is kept free for the bigger buildings to come.
- Each upgrade costs more than the last, so players will usually keep one high-level main base in the centre of their town and smaller main bases farther out as drop-off points. Extra main bases are expensive to build.
- Main bases train workers and tier 1 close melee, long melee and rangers (Jade, 2026-10-03). From level 6 they also train mages.
- From level 3, the main base has parapets that ranged warriors and mages can fight from.
- From **level 5** upward, the main base is a grand building built with **marble**.
- Workers can shelter inside at night.

#### Research

- Research is done at the **Scholar's Lodge**, which can be upgraded twice to research faster: **Scholar's Lodge**, then **Scriptorium**, then **Grand Academy**. Like the main base, each upgrade changes the building's name and makes it grander.
- **How research works:** pick a research, pay its fee, and it loads over time like a training order; when the bar fills, the player has it.
- **Mineshaft research (suggested):** Deep Mining I, II and III unlock the mineshaft tiers. The higher tiers cost precious metals (silver and gold) as well as the usual fee.
- A research facility has no unit inside, but it costs supply and drains food like a unit.
- Each research facility a player builds costs more than the last (the cost rises in equal steps), and a player can have at most **10 research facilities** of all types.

#### Forge levels

The forge is upgraded through 4 levels, and higher levels smelt higher ores (Jade, 2026-10-03). The forge only makes ingots; the grade of iron depends on the ore: bog iron and iron rock are the low-quality ores, and vein iron ore is the high-quality ore.

| **Level** | **Name** | **What it smelts** |
|---|---|---|
| 1 | Casting Hearth | Copper, tin and bronze ingots (tiers 3 and 4). |
| 2 | Bloomery | Wrought iron from any iron ore (tier 5). Bloom iron is gone. |
| 3 | Ironworks | Pig iron from vein iron ore, and iron from pig iron (tier 6). |
| 4 | Steelworks | Steel (tier 7) and, after the Carbon steel research, carbon steel (tier 8). |

**Iron and steel, from worst to best:** wrought iron, iron, steel, carbon steel. Low-quality ores can never go higher than wrought iron, so iron and better need vein iron ore, which lies inside the rock of ridges and mountains from the Deepwoods outwards, and in mineshafts (see "The world").

**Carbon steel** replaces high-quality steel (suggested) as the prized, hard-won top metal. It needs its own research and a level 4 forge, and is made slowly, in small batches, with large amounts of charcoal.

#### Cooking

Cooked food has more nutrition than raw food. Food is cooked at the cooking building, which has 5 tiers and burns lumber or coal.

| **Tier** | **Name** | **Notes** |
|---|---|---|
| 1 | Campfire | A campfire with a spit. The only tier with no actual building. Roasts meat and fish. |
| 2 | Cook Hut | Smoked meat and fish (suggested). |
| 3 | Kitchen | Bread from wheat, salted meat and fish (suggested). |
| 4 | Great Kitchen | Stew (suggested). |
| 5 | Grand Kitchen | Pie (suggested). |

Nutrition, recipes and cooking times are in table 6.

#### Workshop

The workshop turns raw materials into simple processed goods and building parts. It has 4 tiers, and like the other upgradeable buildings its look follows the technology of the time, from a log hut to a large, busy manufactory. The tier names are suggested.

| **Tier** | **Name** | **What it can make** |
|---|---|---|
| 1 | Work Hut | Crushes stone into gravel, turns hardwood lumber into hardwood sticks, makes ramps from lumber or stone, and makes **Tokens** (tier 1 trinkets) from any metal. |
| 2 | Workshop | Everything the Work Hut makes, plus **Charms** (tier 2 trinkets), hand carts (suggested), and helps make bows (the workshop shapes the bow staves). |
| 3 | Great Workshop | Everything below, plus **Brooches** (tier 3 trinkets), **Moonleafs** (silver and emeralds), ox and horse carts, and catapults with their stones (suggested), and helps make crossbows (with the forge). |
| 4 | Manufactory | Everything below, plus **Heirlooms** (tier 4 trinkets), **Sunhearts** (gold and rubies) and ballistas with their iron-headed bolts (suggested), and helps make muskets (with the forge). |

An upgraded workshop keeps everything the tiers below it could make. What else the upper tiers make will be added as their uses are decided.

#### Trinkets

Trinkets are made at the workshop from metal and are for **trading with villages** (see "Neutral villages and trade"; more on trade is still to come). They come in 4 tiers, and each workshop tier can make one tier higher than the last. Every metal comes in every tier: copper, tin, bronze, iron, steel, silver and gold. A trinket is named by its metal and tier, for example a Copper Token, an Iron Brooch or a Gold Heirloom. The names and looks below are suggested.

| **Tier** | **Made at (and above)** | **Name** | **What it looks like** |
|---|---|---|---|
| 1 | Work Hut | Token | A flat, square tag stamped with a simple mark, hung on a cord. |
| 2 | Workshop | Charm | A small stepped pendant with notched edges, on a short chain. |
| 3 | Great Workshop | Brooch | A layered, cross-shaped pin with a raised pattern on its face. |
| 4 | Manufactory | Heirloom | An ornate locket on a fine chain, built up from many tiny pieces like filigree. |

Two **special trinkets** set a gem in a precious metal. Each has its own name:

| **Name** | **Made from** | **Made at** | **What it looks like** |
|---|---|---|---|
| Moonleaf | Silver and emeralds | Great Workshop or Manufactory | A silver crescent shaped like a curled leaf, cradling a green emerald. |
| Sunheart | Gold and rubies | Manufactory only | A gold sunburst of rays around a red ruby core. |

- A Moonleaf is the same whether it is made at the Great Workshop or the Manufactory.
- Higher tiers are worth more in trade, and the special trinkets most of all (suggested).

#### Table 4: Buildings

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** table 2b for materials, and the pacing targets (bronze by night 4 to 6, iron by 13 to 18, steel by 25 to 30, gunpowder by 40 to 48 (s)), with each main base level gating the next forge level so the town has to grow to climb. Upgrades are ordered from the building's own panel; the menu slot is where the first level is placed. Footprints are in 45 cm columns.

| **Building** | **Cost** | **Build (ws)** | **Health** | **Footprint** | **Menu slot** | **Supply** | **Needs** | **Gives or unlocks** |
|---|---|---|---|---|---|---|---|---|
| Main base 1 Big House | start; an extra one 300 softwood, 150 stone | 1200 | 1200 | 14 x 14 (6.3 m) | Basic 1 (doc) | 8 |  | drop-off, workers, warriors, hardwood, stone and flint gear, bows, arrows, javelins, slings, rope, boots, hand carts; shelters 8 (s) |
| 2 Longhall | 100 softwood, 40 stone | 400 | 1600 | same | upgrade | 12 |  | Barracks (s) |
| 3 Hall | 110 softwood, 45 stone, 15 sticks (s) | 420 (s) | 2000 | same | upgrade | 16 |  | parapets, 8 slots (doc); Forge 2, Stables, Kiln, Workshop 2 (s) |
| 4 Stockade Hall | 120 softwood, 60 stone, 25 hardwood, 5 bronze (s) | 450 (s) | 2500 | same | upgrade | 20 | Bronze | Magi Sanctum, Mineshaft 1, Scriptorium, Kitchen, farm tier 2 (s) |
| 5 Marble Hall | 75 hardwood, 100 stone, 20 bricks, 20 marble, 10 bronze (s) | 600 (s) | 3000 | same | upgrade | 25 |  | Forge 3, Great Workshop (catapults, carts), farm tier 3; the first marble level (Jade) (s) |
| 6 Keep | 100 hardwood, 150 stone, 40 bricks, 30 marble, 15 wrought iron (s) | 800 (s) | 3600 | same | upgrade | 30 |  | trains mages (doc); Mineshaft 2, Great Kitchen (s) |
| 7 Fortified Keep | 125 hardwood, 200 stone, 60 bricks, 40 marble, 25 wrought iron (s) | 1000 (s) | 4200 | same | upgrade | 35 |  | Forge 4, Grand Academy, Manufactory, Powder mill (s) |
| 8 Castle | 150 hardwood, 250 stone, 100 bricks, 50 marble, 30 refined iron (s) | 1200 (s) | 5000 | same | upgrade | 40 |  | Foundry, Gunnery yard, Mineshaft 3, Grand Kitchen (s) |
| 9 Great Castle | 150 hardwood, 250 stone, 100 bricks, 75 marble, 30 steel (s) | 1500 (s) | 6000 | same | upgrade | 45 |  | marble facing and banners (s) |
| 10 Citadel | 200 hardwood, 300 stone, 150 bricks, 125 marble, 50 steel, 5 gold (s) | 2000 (s) | 7500 | same | upgrade | 50 |  | 4 cannon ports on the roof (s) |
| Crop field 1 (wheat, corn or flax, chosen when built) | 30 softwood, 10 sticks | 150 | 400 | 12 x 12 | Basic 2, Farms | 4 |  | 2 farmers, trains workers, farmhouse shelters 4 (s) |
| Crop field 2 / 3 | +20 softwood, +15 stone / +20 hardwood, +30 stone (s) | 150 / 300 (s) | 600 / 800 | same | upgrade | 6 / 8 | base 4 / base 5 | 3 / 4 farmers; yield x1.5 / x2 (s) |
| Vegetable farm 1 / 2 / 3 (potatoes or carrots) | as crop field | as crop field | as crop field | 12 x 12 | Basic 2, Farms | 3 / 5 / 7 | as crop field | full yield on thin grass (s) |
| Herb bed 1 / 2 / 3 | 20 softwood, 10 herbs / +15 softwood, +10 stone / +15 hardwood, +20 stone (s) | 100 / 100 / 200 (s) | 300 / 500 / 700 | 8 x 8 | Basic 2, Farms | 1 / 2 / 3 | as crop field | 1 farmer; herbs 4 / 6 / 8 a day (s) |
| Livestock farm 1 / 2 / 3 | as crop field but 40 softwood at tier 1 | 200 / 150 / 300 (s) | 400 / 600 / 800 | 12 x 12 | Basic 2, Farms | 4 / 6 / 8 | as crop field | 6 / 10 / 16 animals, 1 worker, breeding, slaughter (s) |
| Pen and barn | 30 softwood | 120 | 500 | 8 x 8 | Basic 3 | 0 |  | shelters 8 animals at night, no breeding (s) |
| Lumber mill | 40 softwood, 10 stone; waterwheel upgrade +40 hardwood, +20 stone, on a stream, 300 ws | 200 | 600 | 8 x 8 | Basic 4 | 0 |  | wood drop-off, planks (table 2b), 2 workers (s) |
| Storehouse | 40 softwood, 20 stone | 150 | 600 | 8 x 8 | Basic 5 | 0 |  | drop-off for everything (s) |
| Fishing dock | 30 softwood lumber, 5 rope (doc: lumber and rope) | 150 | 400 | 6 x 4 | Basic 6 | 0 | shoreline | 3 workers fish at net speed in any depth and shelter inside (doc) (s) |
| Tannery | 40 softwood, 20 stone | 200 | 500 | 8 x 8 | Basic 7 | 0 |  | leather, boots, leather armour and cap, carrying gear, 2 workers (s) |
| Cooking 1 Campfire | 5 softwood | 10 | 60 | 2 x 2 | Basic 8 | 0 |  | roast meat and fish; also a light (table 18) (s) |
| 2 Cook Hut / 3 Kitchen | 40 softwood, 20 stone / +30 hardwood, +30 stone, +10 bricks (s) | 200 / 200 (s) | 500 / 800 | 6 x 6 / 8 x 8 | upgrade | 0 | none / base 4 | smoked foods / bread, salted foods (s) |
| 4 Great Kitchen / 5 Grand Kitchen | +50 hardwood, +50 stone, +30 bricks, +5 wrought iron / +75 hardwood, +100 stone, +50 bricks, +10 steel (s) | 400 / 750 (s) | 1200 / 1800 | 10 x 10 / 12 x 12 | upgrade | 0 | base 6 / base 8 | stew / pie, and cooks twice as fast (s) |
| Herbalist hut | 30 softwood, 10 herbs | 150 | 400 | 6 x 6 | Basic 9 | 0 |  | bandages, remedies, poison arrows (s) |
| Wall, per column: softwood / hardwood / stone | 1 softwood / 1 hardwood / 2 stone | 5 / 8 / 20 | 300 / 600 / 1500 (roster) | 1 x 1, 3 m tall (stone 3.6 m) | Basic 10 Defences | 0 |  | (s) |
| Gate, 3 columns: softwood / hardwood / stone | 6 softwood / 6 hardwood / 10 stone, 2 hardwood | 30 / 45 / 90 | 600 / 1200 / 3000 | 3 x 1 | Basic 10 | 0 |  | shut and lit by a torch it stops rats and spiders climbing (roster) (s) |
| Tower: softwood / hardwood / stone | 20 softwood / 20 hardwood / 40 stone, 10 hardwood | 100 / 150 / 300 | 800 / 1600 / 4000 | 3 x 3 | Basic 10 | 0 |  | 4 ranged slots, +10 m sight (s) |
| Earthworks: earth ramp, bank, fill | 1 Earth per column per 11 cm step | 5 per step | terrain | 1 column wide | Basic 11 | 0 |  | built on the spot (s) |
| Lumber ramp / stone ramp | 1 lumber per 2 steps / 2 stone per 2 steps, made at any workshop in 10 / 15 s | 5 / 8 per step to place | 300 / 1500 per column | 1 column wide | Basic 11 | 0 | Work Hut | 1-, 2- and 4-step pieces (s) |
| Workshop 1 Work Hut | 40 softwood, 20 stone | 200 | 600 | 8 x 8 | Basic 12 | 0 |  | gravel, sticks, ramps, Tokens, 2 workers (s) |
| 2 Workshop / 3 Great Workshop | +30 hardwood, +20 stone, +5 bronze / +50 hardwood, +40 stone, +20 bricks, +10 wrought iron (s) | 200 / 400 (s) | 900 / 1200 | same | upgrade | 0 | base 3 / base 5 | Charms, hand carts, shapes bow staves so bows take half the time / Brooches, Moonleafs, ox and horse carts, catapults and their stones, crossbow stocks with the forge (doc), glass lanterns (s) |
| 4 Manufactory | +75 hardwood, +75 stone, +50 bricks, +15 steel (s) | 750 (s) | 1800 | same | upgrade | 0 | base 7 | Heirlooms, Sunhearts, ballistas and their bolts, musket stocks with the forge (doc); every workshop good at double speed (s) |
| Lights | table 18 |  |  |  | Basic 13 |  |  | torch post, wall torch, campfire, brazier, lantern |
| Scholar's Lodge 1 | 60 softwood, 20 stone; every further research facility costs this much again on top (doc) | 240 | 500 | 8 x 8 | Advanced 1 | uses 1, eats 2 a day |  | one research at a time (s) |
| 2 Scriptorium / 3 Grand Academy | +50 hardwood, +50 stone, +20 bricks / +75 hardwood, +100 stone, +50 bricks, +30 marble, +10 steel (s) | 450 / 900 (s) | 900 / 1500 | same | upgrade | same | base 4 / base 7 | research 25% / 50% faster (s) |
| Magi Sanctum | 40 hardwood, 60 stone, 20 bricks, 1 mana crystal (s) | 450 (s) | 1200 | 8 x 8 | Advanced 2 | 0 | base 4 | novices, ranks to Adept, rank wands (s) |
| Barracks | 80 softwood, 40 stone, 20 sticks | 400 | 1000 | 10 x 10 | Advanced 3 | 0 | base 2 | warriors, archery, crossbow, rank training (s) |
| Stables | 30 softwood, 10 stone, 5 sticks (s) | 150 (s) | 800 | 10 x 8 | Advanced 4 | 0 | base 3 | taming, 6 stalls, breeding, riding (s) |
| Gunnery yard | 50 hardwood, 75 stone, 30 bricks, 10 steel (s) | 600 (s) | 1500 | 12 x 12 | Advanced 5 | 0 | base 8 | musket and cannon crew training (s) |
| Mineshaft 1 / 2 / 3 | 60 hardwood, 80 stone, 10 bronze / +40 hardwood, +50 stone, +15 wrought iron / +50 hardwood, +75 stone, +20 steel (s) | 600 / 450 / 600 (s) | 800 / 1200 / 1600 | 6 x 6 on flat stone | Advanced 6 | 0 | base 4, 6, 8 and Deep Mining I, II, III at the lodge, fees 20 bronze ingots and 50 stone / 30 wrought iron, 100 stone and 3 silver / 30 steel, 200 stone, 3 gold and 3 silver (s) (the higher tiers cost precious metals, doc) | 4 miners; output in table 5 (s) |
| Kiln | 30 softwood, 40 stone, 20 clay | 300 | 600 | 6 x 6 | Advanced 7 | 0 | base 3 | charcoal, bricks, glass, 2 workers (s) |
| Forge 1 Casting Hearth | 60 softwood, 40 stone | 300 | 600 | 8 x 8 | Advanced 8 | 0 |  | copper, tin, bronze, 2 workers (s) |
| 2 Bloomery / 3 Ironworks | +30 softwood, +40 stone, +10 clay, +5 bronze / +50 hardwood, +60 stone, +20 bricks, +10 bronze (s) | 300 / 450 (s) | 900 / 1200 | same | upgrade | 0 | base 3 / base 5 | wrought iron / pig iron and iron; 3 workers (s) |
| 4 Steelworks | +75 hardwood, +100 stone, +60 bricks, +20 wrought iron (s) | 900 (s) | 1800 | same | upgrade | 0 | base 7 | steel and, with research, carbon steel; 4 workers (s) |
| Powder mill | 20 hardwood, 40 stone, 20 bricks, 5 wrought iron (s) | 300 (s) | 600 | 6 x 6 | Advanced 9 | 0 | base 7 | gunpowder (s) |
| Foundry | 50 hardwood, 75 stone, 50 bricks, 10 bronze, 10 wrought iron (s) | 600 (s) | 1500 | 10 x 10 | Advanced 10 | 0 | base 8 | cannons, cannonballs (s) |

Production buildings work only with workers assigned and each extra worker adds a full share up to the limit (doc); a building under construction has 10% of its health plus the share built (s).

### Items

There are no tools, weapons, armour or ammunition items (Jade, 2026-10-03): gear is a tier on each unit (see "Troops and gear"). What is still made is materials, food and medicine, carts, siege engines and cannons. "Made at" is the building from the list above.

#### Materials (used to make other things)

| **Item** | **Made at** | **From** |
|---|---|---|
| Sinew / rope | Tannery or Big House | Leather (sinew) or flax (rope) |
| Planks | Lumber mill | Softwood or hardwood lumber. Used in gear kits, carts and engines; buildings are paid in lumber (see table 2b). |
| Stone blocks | Worker on site | Stone |
| Gravel | Workshop | Stone (crushed) |
| Hardwood sticks | Workshop (or gathered from hazel bushes) | Hardwood lumber only |
| Ramps (lumber or stone) | Workshop | Any type of lumber, or stone |
| Trinkets (Token, Charm, Brooch, Heirloom) | Workshop (its tier decides the highest trinket tier) | A metal: copper, tin, bronze, iron or steel ingots, silver or gold. Every metal comes in every tier (a Copper Token, a Gold Heirloom and so on). For trading with villages (see "Trinkets"). |
| Moonleaf | Great Workshop or Manufactory | Silver, emeralds. For trading with villages. |
| Sunheart | Manufactory | Gold, rubies. For trading with villages. |
| Charcoal (suggested) | Kiln | Hardwood lumber |
| Bricks (suggested) | Kiln | Clay, fuel (charcoal or coal) |
| Leather | Tannery | Hides (or directly from hunting until hides are added) |
| Hardened leather (Jade) | Tannery | Leather |
| Copper ingot | Forge (level 1+) | Copper ore, fuel |
| Tin ingot | Forge (level 1+) | Tin ore, fuel |
| Bronze ingot | Forge (level 1+) | Copper ingots and tin ingots (roughly 9 copper to 1 tin) |
| Wrought iron ingot | Forge (level 2+, Bloomery) | Any iron ore, charcoal or coal. The first iron a player can make. |
| Pig iron ingot | Forge (level 3+) | Vein iron ore, coal or charcoal, stone (flux). Brittle; only used to make iron. |
| Iron ingot | Forge (level 3+, Ironworks) | Pig iron ingot, fuel. |
| Steel ingot | Forge (level 4) | Iron ingot, coal or charcoal. |
| Carbon steel ingot | Forge (level 4), Carbon steel research | Iron ingots, large amounts of charcoal. Very slow, small batches. |
| Gunpowder (suggested) | Powder mill | Saltpetre, sulphur, charcoal |
| Glass (suggested) | Kiln | Sand, fuel |

#### Carts, engines and torches

| **Thing** | **Made at** | **From** |
|---|---|---|
| Torch | Big House | Softwood lumber, resin or pitch (suggested). Placed as a light; see "Light and torches". |
| Hand cart | Workshop (tier 2) | Planks, hardwood lumber. A two-wheeled cart a worker pushes to haul loads. |
| Ox or horse cart | Great Workshop | Hardwood lumber, planks, a little iron. Pulled by a horse or an ox. |
| Cannon | Foundry | Bronze ingots (early, lighter) or iron ingots (later, cheaper), hardwood lumber (carriage) |
| Cannonballs | Foundry | Iron ingot or stone |
| Catapult, ballista | Great Workshop, Manufactory | See table 2f. |

#### Food and medicine

| **Item** | **Made at** | **From** |
|---|---|---|
| Roast meat / roast fish | Cooking building, tier 1 (campfire) | Meat or fish, lumber or coal. More nutrition than raw. |
| Smoked or salted fish and meat | Cooking building, higher tier | Meat or fish, lumber or coal. More nutrition than raw. |
| Bread | Cooking building, higher tier | Wheat, lumber or coal. |
| Bandages | Herbalist hut | Medicinal herbs, flax (or leather strips early on). Heals units slowly. |
| Healing remedy | Herbalist hut | Medicinal herbs, glass bottle. Heals more and faster. |

### Troops and gear (agreed 2026-10-03)

Agreed by Jade on 2026-10-03 (designed in the project chat from 04:20 UTC; Jade's go at 05:25 UTC). This is canon. It replaces the old items, equipment panel and gear tables: Tables 2c, 2d, 2e, 3 and 7 now hold the kit, armour, shield, tool and training numbers below, and Table 13 holds the mage wand and robe ladders. Values marked (Jade) are Jade's; values marked (s) are suggested. Costs are today's old item recipes carried across as kit costs, summed, with no tuning; a number marked "Open for Jade's rebalance" is only a placeholder. Built in Milestone 11 ("Troop rework").

#### Aim

To vastly increase the simplicity and usability of building an army (Jade).

#### Forges, items and leather

- The Forge only turns ore into ingots, and higher forge tiers are needed to smelt higher ores (Jade). Casting Hearth (level 1): copper, tin and bronze. Bloomery (level 2): wrought iron, from any iron ore (bloom iron goes). Ironworks (level 3): iron, from pig iron, so vein iron ore is needed. Steelworks (level 4): steel and carbon steel (s).
- Carbon steel replaces high-quality steel and is a research at the Scholar's Lodge (s).
- Weapons, armour, workers' tools and ammunition are no longer items. There are no items at all (Jade).
- The Tannery has no tiers. The one Tannery does all leather work, including turning leather into hardened leather (Jade). Any higher-tier tannery models stay on disk, unused, for later (Jade).
- Research: Bronze, Steel, Carbon steel, Gunpowder and Muskets; one Crossbows research stays (Jade); Halberds and Steel crossbow research go (Jade).

#### Troop types

- Five types (Jade): four trained at the Barracks, and cavalry at the Stables:
  - Close melee: a one-handed weapon and a shield; weapon tiers 0 to 8.
  - Long melee: a two-handed weapon; weapon tiers 1 to 8.
  - Ranger: one ladder with deliberate repeats; tier 8 is the top.
  - Brawler: a hybrid that exists only at tier 8 (flintlock pistol plus sword), with any armour.
  - Cavalry: trained at the Stables, not the Barracks; a tamed horse at the Stables is used up as the rider builds (Jade). One cavalry type for now, carrying the long-melee weapon ladder only (tiers 1 to 8, same names) with any armour tier (Jade).
- A troop is always the type it was created as: no retraining and no type change (Jade).
- Main bases train only tier 1 close melee, long melee and ranger troops (Jade); every other troop comes from the Barracks or, for cavalry, the Stables.
- Each type's button is a small head-to-toe picture of the unit with its weapons instead of text, greyed out when it cannot be afforded (Jade).

#### Tiers

Weapon and armour tiers are chosen independently, so any weapon can go with any armour (Jade). Examples Jade gave: bronze armour with a carbon steel sword; no armour with a musket; a sling with carbon steel armour.

| **Tier** | **Material (Jade)** | **Needs (s)** | **Armour (Jade's material; names s)** | **Shield, close melee only (Jade; names 3 to 8 s)** | **Long melee and cavalry (s; tiers 4 and 5 Jade)** | **Close melee (s; tiers 4 and 5 Jade)** | **Ranger (Jade; names s)** |
|---|---|---|---|---|---|---|---|
| 0 | fists, no armour | nothing | none | none | none | fists (the fist fighter) | none |
| 1 | wood, leather | nothing | leather jerkin | wooden shield | fire-hardened spear | hardwood cudgel | leather sling |
| 2 | flint, hardened leather | a Tannery for hardened leather | boiled-leather cuirass | wooden shield | flint-headed spear | flint hand-axe | yew longbow |
| 3 | copper | Casting Hearth | copper scale jack (copper over hardened leather) | boiled-leather targe (wood faced with hardened leather) | copper leaf-blade spear | copper short sword | recurve bow |
| 4 | bronze | Bronze research | bronze scale armour (bronze over hardened leather) | boiled-leather targe | bronze spear | bronze shortsword | recurve bow |
| 5 | wrought iron | Bloomery | wrought-iron mail | boiled-leather targe | crude iron spear | wrought iron sword | recurve bow |
| 6 | iron | Ironworks, vein iron ore | iron coat of plates | iron-rimmed heater shield | iron pike | iron broadsword | recurve bow |
| 7 | steel | Steelworks, Steel research | steel plate harness | steel heater shield | steel halberd | steel side-sword | steel-prod crossbow (also Crossbows research) |
| 8 | carbon steel | Carbon steel research | fluted Gothic harness | steel rotella | zweihänder | basket-hilted broadsword | flintlock musket (also Gunpowder and Muskets) |

- The ranger ladder's repeats are deliberate: the same recurve bow at tiers 3 to 6, the crossbow only at 7 and the musket only at 8 (Jade). One ranger upgrades along this ladder. Each recurve tier fits arrowheads of its own metal, which is all that changes between them (s).
- Brawler, tier 8 only: flintlock pistol and cutlass (s), with a new pistol model to be made when it is time (Jade). Needs Gunpowder, Muskets and Carbon steel (s).
- Shields come with the armour on close melee only; no other type gets a shield (Jade). Shield tech deliberately lags behind armour and weapons, so some tiers repeat a shield (Jade): wooden shield at armour tiers 1 and 2, a wooden shield faced with hardened leather at 3 to 5 (named the boiled-leather targe (s)), then the coordinator's picks at 6 to 8 (Jade asked for them). No armour means no shield.
- The fist fighter (tier 0 weapon, no armour) can only be built when there is not enough material for anything else (Jade).
- Numbers for every tier (damage, swing time, reach, range, protection, shield block, cost and time) are in Tables 2c (tools), 2d (melee), 2e (ranged), 3 (armour and shields), 7 (training) and 13 (wands and robes).

#### Long melee: reach and the edge of reach

- Long-melee weapons (and cavalry, who carry them) have no close-in penalty and no minimum range: they can always attack, even when an enemy is right next to them (Jade).
- A hit at the edge of their reach is a critical hit for 30% extra damage (Jade). The edge is the outer third of the weapon's reach (s).
- Their drawback is no shield and a slower swing than close melee at every tier (Jade). So long melee is the damage-focused, versatile attacking type, and close melee the shielded one (Jade).

#### Weight

- Gear has no weight and no consequences: the load slowdown and the rule that armoured units cannot swim go, for every unit (Jade).
- A worker's carrying limit stays only to decide when it walks back to base, and is tuned for that alone (Jade). The inventory panel goes (Jade).

#### Cost

- A unit costs its food plus the materials its kit used to need: ingots, sticks, leather, hardened leather and so on (Jade). It takes 1 supply (Jade).
- Ammunition is unlimited (Jade). Gunpowder is needed to train musket rangers and brawlers, and feathers to train bow and crossbow rangers (Jade); feathers from the longbow up (s).
- Feathers come from hens, the Runkin traders and hunted wild birds (Jade). Wild geese by Heartland water and pheasants in the Fringe woods, hunted with N like deer, give meat and feathers (s).

#### Barracks and Stables panel

- Clicking a Barracks shows each type with a weapon-tier and an armour-tier dropdown, each entry with a small icon of an example weapon or armour of that tier (Jade). The player chooses once, then clicks the unit button as many times as supply and resources allow (Jade).
- A Lock checkbox per type locks that one Barracks into making that combination (Jade).
- With no lock, each type defaults to the highest weapon and armour tier the player can afford. When short of a metal, the weapon gets the best material first. The default refreshes as queued troops spend resources (Jade).
- The Stables shows the same picture button, dropdowns and Lock for cavalry (s). Main bases show the same panel limited to tier 1 (s).

#### Upgrading units

- Select one warrior or a group and click Upgrade on the command card. Each unit walks to the nearest Forge, Barracks or main base and stands beside it; speech bubbles tell the player what is happening (Jade). Cavalry can also upgrade at the Stables (s).
- There are separate Upgrade Weapon and Upgrade Armour buttons (Jade). Each moves the unit up one tier and pays the ingots or other materials from stock (Jade).
- An Upgrade Max twin of each takes the unit to the best tier researched and affordable; it appears only when it would give a different result from the plain button, so there can be up to 4 buttons (Jade).
- Keys (s, rebindable): Q Upgrade Weapon (tools on a worker, wand on a mage), X Upgrade Armour (robe on a mage), Z Upgrade Weapon Max, V Upgrade Armour Max.
- A bar on the unit fills once it is near the building. Better gear takes longer, with a preset time per item tied to how long a unit starting with it takes to build, but much shorter than making a new unit (Jade). Times are in Table 7.
- An upgrade pays the new tier's full kit cost; the old kit is scrapped with a full refund (Jade), so a step costs the difference.
- When stock runs short (s): the highest rank upgrades first, a unit only takes a whole step, and as many units upgrade as can be paid for.

#### Starting units

- 4 workers with tier 1 tools and 3 warriors, all close melee with a tier 1 weapon (hardwood cudgel) and no armour, so no shield (Jade), plus the extra starting food and supply set earlier (Jade). Starting food covers the seven for 10 days (s: 140 nutrition, Open for Jade's rebalance).

#### Workers' tools

- Workers' tools move to the same tiers and upgrading as weapons; there are no tool items (Jade).
- One tool tier per worker covering every tool it uses (axe, pick or maul, hammer, hoe, sickle, fishing gear and prospecting hammer); one Upgrade button on Q pays the whole kit (Jade agreed with the suggestion).
- Tool tiers (s): 1 hardwood; 2 stone and flint (flint axe and knife, stone maul, stone hammer); 3 copper; 4 bronze; 5 wrought iron; 6 iron; 7 steel; 8 carbon steel. What each tier may gather is in Progression; numbers in Table 2c.

#### Mages

- Mages do not climb the armour ladder. They have their own wand and robe tiers, mixed freely like weapon and armour (Jade).
- The coordinator's ladders, kept by Jade (names s):
  - Wands: 1 hazel wand, 2 copper-tipped wand, 3 bronze-bound staff, 4 iron-shod staff, 5 crystal staff (steel-shod and set with mana crystals), 6 archstaff (carbon steel with more crystals).
  - Robes: 1 homespun robe of flax, 2 leather-trimmed robe, 3 hardened-leather robe, 4 warded robe with a mana crystal sewn in, 5 rune-stitched vestments with copper thread and crystals, 6 archmage's mantle with steel thread and crystals.
  - The wand tier sets spell power and mana; the robe tier sets protection and mana regain. Numbers in Table 13.
  - Ranks stay earned by experience; the rank-ups at 4, 5 and 6 pay their mana crystals from stock, with no rank-wand item.
- A new mage starts with a hazel wand and a homespun robe (s). Mages upgrade with the same buttons at the Magi Sanctum, a Forge or a main base (s).

#### What goes, what stays

- Goes: Craft (K), Refurbish (F), Equip Best (Q on warriors), the Equipment panel (I), Auto-Equip (F4), forge item queues, arrows, bolts, quivers, shot and powder horns (s, following Jade's "no more items"); poison and fire arrows (s, since ammunition is unlimited; venom and resin keep their other uses); Archery, Crossbow and Musket training, since the type is chosen at the Barracks (s); Riding training and the Ride button, since cavalry is a type (Jade); the load slowdown, the armoured swimming rule and the inventory panel (Jade); the backup weapon (s).
- Stays (s): Cannon crew training at the Gunnery yard, the siege engines, cannons and cannonballs, carts, and Hitch for oxen, horses and engines.
- Weapons, armour and tools in trade and plunder become the ingots and materials that made them, at the same value (s).
- Each tier needs its own look, made by the model thread; tinted bodies until then (s).
- Numbers stay Jade's: today's item costs carry across as kit costs, and the balance editor gets a group per new table, with no tuning (s).

#### Table 3: Armour and shields by tier

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Tier** | **Armour (body, helmet and boots)** | **Protection** | **Kit cost** | **Flax instead of leather** | **Time to make** |
|---|---|---|---|---|---|
| 0 | none | 0% | nothing |  | 0 s |
| 1 | leather jerkin | 10% (s, Open for Jade's rebalance) | 3 leather | never | 30 s (s) |
| 2 | boiled-leather cuirass | 20% (hardened leather 15%, cap 2%, boots 3%) | 3 hardened leather, 2 leather | never | 50 s |
| 3 | copper scale jack | 25% (s, Open for Jade's rebalance) | 5 copper ingots, 2 hardened leather, 1 leather | the leather only | 80 s (s) |
| 4 | bronze scale armour | 37% (scale 30%, helmet 4%, boots 3%) | 5 bronze, 2 hardened leather, 1 leather | the leather only | 90 s |
| 5 | wrought-iron mail | 48% (mail 40%, nasal helm 5%, boots 3%) | 5 wrought iron, 3 leather | yes | 90 s |
| 6 | iron coat of plates | 53% (45%, 5%, 3%) | 5 iron, 3 leather | yes | 90 s |
| 7 | steel plate harness | 65% (plate 55%, sallet 7%, boots 3%) | 7 steel, 4 leather | yes | 160 s |
| 8 | fluted Gothic harness | 70% (60%, 7%, 3%) | 7 carbon steel, 4 leather | yes | 160 s |

Shields, close melee only, paid with the armour tier (Jade: shield tech lags on purpose):

| **Armour tier** | **Shield** | **Blocks projectile damage** | **Kit cost** | **Time to make** |
|---|---|---|---|---|
| 0 | none |  |  |  |
| 1 and 2 | wooden shield (Jade) | 15% | 3 planks, 1 leather | 20 s |
| 3 to 5 | boiled-leather targe: wood faced with hardened leather (Jade; name s) | 20% (s, Open for Jade's rebalance) | 3 planks, 1 hardened leather | 25 s (s) |
| 6 | iron-rimmed heater shield (s) | 25% | 3 iron, 1 plank, 1 leather | 40 s |
| 7 | steel heater shield (s) | 30% (Jade: the best shield in the game) | 3 steel, 1 leather | 45 s |
| 8 | steel rotella (s) | 30% (Jade's cap) | 3 carbon steel, 1 leather | 45 s |

**How these were set:** each armour kit is the old body armour, helmet and boots of that metal summed, with hardened leather in place of leather where Jade's tiers put it; each shield is the old shield of the nearest material. Gear has no weight (Jade), so armour never slows a unit or stops it swimming. Mages wear robes instead (table 13). Protection from spells is the Warding spell in table 13.

### Unit looks

#### Table 12: Carrying weights and capacities

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Thing** | **Weight per unit (s)** | **Load per trip (25 lb)** |
|---|---|---|
| Softwood or hardwood lumber, planks, stone, every ore, clay, sand, gravel, bricks (2.5), coal (2.5) | 5 lb | 5 (10 bricks or coal) |
| Hardwood sticks, bone, wheat, potatoes, corn, flint, resin | 1 lb (sticks 2.5 lb) | 25 (10 sticks) |
| Meat, fish, hides, leather, charcoal, saltpetre, sulphur | 2.5 lb | 10 |
| Herbs, flax, carrots, mana crystal, spider silk, venom, hexstone, eggs, feathers | 0.5 lb (feathers 0.1) | 50 |
| Marble block | 10 lb | 2 |
| Gold, silver (a nugget), lead ore (5), demon horn (2) | 1 lb | 25 |
| Gems, gunpowder (10 charges) | 0.1 lb per gem; 1 lb | by node |
| Copper, tin, bronze, pig, iron, steel ingots | 5 lb | 5 (made goods, not raw) |
| Cannonball iron / stone; catapult stone; ballista bolt | 6 / 4 lb; 40 lb; 5 lb | carried by the engine's crew or cart |
| Hand cart | 150 lb raw, pushed at 2.0 m/s by a worker | wheels only (doc) |
| Ox cart | 600 lb behind an ox at 1.5 m/s; 400 lb behind a horse at 2.5 m/s | wheels only |
| Pack animal without a cart | ox 150 lb, horse 100 lb, led by a worker |  |
| Siege engine haul | table 2f speeds; a horse or ox hauls one engine at a time |  |

Gear has no weight (Jade, 2026-10-03): these weights only set how much a worker carries per trip, and nothing slows a unit or stops it swimming. Derived from: a worker's trip is one load of 5 lumber, stone or ore, which with table 5 times gives the per-day income used in the pacing check; an ox cart moves 24 worker-loads at once, which is what makes a far-off mine or the Deepwoods vein iron worth the walk.

#### Seeing gear

- Each unit's weapon, armour, shield and tool tiers are drawn on its model, so players can see at a glance who has what. Every tier needs its own look, made by the model thread; until then units show tinted bodies (suggested).

#### Unit models

- **Workers and warriors share one human body model.** Warriors only have a different skin, which is also unarmoured; the armour tier is drawn over it. Warriors have their own animations for everything they do (fighting with each weapon type, shooting, hunting and so on). Workers also get animations for farming (with a hoe) and fishing.
- **Mages** have their own model. All mages are female, with long hair, and the body is somewhat dimorphic from the worker body. They cast spells with **wands** and wear **robes**, each with its own tiers (see "Troops and gear").
- **Stone tools (suggested):** the stone maul is a grooved, rounded stone head lashed with cord to a thick wooden handle, held in both hands; the stone hammer has a squarer stone head on a shorter handle, held in one hand. Neither looks like a pickaxe, which only exists from copper upward. They are part of the tier 2 tool kit.
- **Injured and death animations:** every unit has an injured animation and a death animation. Injured looks like being hit from the front and reacting; warriors also throw up their shield arm as if trying to block, but less composed than a real block.
- **Other models needed:** the Halfling war ox needs two rider points (a spear rider in front, an archer behind). Young fish reuse the adult fish model at about half scale with their own texture. Elves are a slim, androgynous version of the human body with long hair; Dwarves a shorter, stockier version with beards; Elf mages are their own mage type. Goblin villages need standard goblins, goblin archers, goblin wolf riders (goblins on wolves) and a goblin mage.

### Progression

The game moves through tiers of material. The tier numbers are the troop and tool tiers (Jade, 2026-10-03): each tier needs a forge level or a research, and tool tiers also decide what workers can gather, so moving up a tier opens up new resources rather than only being faster.

| **Tier** | **Unlocked by** | **What it opens up** |
|---|---|---|
| 0. Fists | Always | The fist fighter, only when nothing else is affordable (Jade). |
| 1. Wood and leather | Start of game | Hardwood tools, cudgels and spears, slings, leather jerkins and wooden shields. Chopping trees, gathering herbs, loose stone and flint, fishing from shore. |
| 2. Flint, stone and hardened leather | No research; hardened leather from the Tannery | Stone is the blunt tool (the stone maul breaks rock and mines copper and tin ore, the stone hammer builds) and flint the edge (axes, knives, spearheads, arrowheads). Longbows, boiled-leather cuirasses. |
| 3. Copper | Forge level 1 (Casting Hearth) | Smelting copper and tin; copper tools with the first pickaxes, copper weapons and scale; recurve bows; coal at the surface. |
| 4. Bronze | Copper and tin ingots; Bronze research | Bronze tools, weapons and scale; the first tier of mineshaft; mining bog iron and iron rock. |
| 5. Wrought iron | Forge level 2 (Bloomery) | Wrought iron from any ore; mail; mining vein iron ore. |
| 6. Iron | Forge level 3 (Ironworks); vein iron ore | Pig iron and iron; coats of plates, iron-rimmed heater shields, iron cannonballs. |
| 7. Steel | Forge level 4 (Steelworks); Steel research; Crossbows research for the crossbow | Steel tools, weapons and plate; the steel-prod crossbow. |
| 8. Carbon steel and gunpowder | Carbon steel research; saltpetre, sulphur and charcoal at a powder mill; Gunpowder and Muskets research | The best tools, weapons and armour, the flintlock musket and the brawler; cannons (the end of the tech tree). |

**Stone and flint need no research** (Jade) and do not overlap, as in real life: stone makes blunt tools for breaking rock and building, flint makes edges for chopping, cutting and points. From copper upward every tool kit has an axe, a **pickaxe** and a hammer; a pickaxe needs metal, which is why the stone rock-breaking tool is a maul instead.

Because sulphur, vein iron and other late resources are mostly found far from spawn, the later tiers push players to expand, in line with the Premise.

#### Table 2: Tools and weapons per tier

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**2a. Research steps (at a Scholar's Lodge; Scriptorium 25% faster, Grand Academy 50% faster (s))**

| **Step** | **Needs first** | **Cost (s)** | **Time (s)** | **Opens** |
|---|---|---|---|---|
| Bronze | Forge level 1, 1 tin ingot made | 10 copper ingots, 2 tin ingots | 75 s (s) | bronze tier, mining bog iron and iron rock |
| Deep Mining I | Bronze | fee in table 4 (20 bronze ingots, 50 stone) | 90 s (s) | mineshaft tier 1 |
| Crossbows (one research, Jade) | Steel (s) | 10 wrought iron, 20 hardwood lumber | 90 s (s) | the tier 7 steel-prod crossbow for rangers |
| Hexcraft (researched at the Magi Sanctum, not a lodge) | Magi Sanctum | 6 hexstone, 20 herbs (hexstone is the reagent: Jade) | 90 s (s) | the Warding and Counterspell spells (table 13) |
| Deep Mining II | Forge level 3 | fee in table 4 (30 wrought iron, 100 stone, 3 silver (s)) | 120 s (s) | mineshaft tier 2 |
| Siege engines | Great Workshop | 40 hardwood lumber, 10 rope, 10 bronze ingots | 120 s (s) | catapult; the ballista needs a Manufactory and Forge level 3 as well |
| Steel | Forge level 4, 1 pig iron made | 10 pig iron, 20 charcoal | 150 s (s) | tier 7 (steel) |
| Carbon steel (replaces high-quality steel) | Steel | 5 steel, 50 charcoal | 210 s (s) | carbon steel ingots and tier 8 |
| Deep Mining III | Steel | fee in table 4 (30 steel, 200 stone, 3 gold, 3 silver (s)) | 180 s (s) | mineshaft tier 3 |
| Gunpowder | Powder mill | 10 saltpetre, 5 sulphur (s), 10 charcoal | 150 s (s) | gunpowder |
| Muskets | Gunpowder, Gunnery yard | 10 steel, 10 gunpowder | 180 s (s) | the tier 8 flintlock musket ranger and the brawler (with Carbon steel) |
| Cannons | Gunpowder, Foundry | 20 bronze ingots, 10 gunpowder, 20 hardwood lumber | 210 s (s) | bronze cannon, cannonballs; iron cannon once Forge level 3 exists |

Copper, wrought iron and iron need no research: the forge level opens them, as Progression says. Halberds and Steel crossbow research are gone (Jade, 2026-10-03). Research is paid up front and loads like a training order (doc).

**2b. Smelting and processing (needed by every recipe below; all (s) except the 9:1 bronze ratio)**

| **Product** | **Made at** | **Recipe** | **Time (1 worker)** |
|---|---|---|---|
| Copper or tin ingot | Forge 1+ | 2 ore, 1 fuel (1 lumber, 1 charcoal or 1 coal) | 5 s (s) |
| Bronze ingot | Forge 1+ | 9 copper ingots, 1 tin ingot gives 10 bronze | 30 s (s) |
| Wrought iron | Forge 2+ (Bloomery) | 3 any iron ore, 2 charcoal or coal | 10 s (s) |
| Pig iron | Forge 3+ | 2 vein iron ore, 1 coal or charcoal, 1 stone | 8 s (s) |
| Iron (refined) | Forge 3+ (Ironworks) | 2 pig iron, 1 fuel | 10 s (s) |
| Steel | Forge 4 | 1 refined iron, 2 coal or charcoal | 15 s (s) |
| Carbon steel | Forge 4, Carbon steel research | 2 iron, 6 charcoal | 60 s (batch of 1) (s) |
| Charcoal | Kiln | 2 hardwood lumber gives 3 charcoal | 10 s (s) |
| Bricks | Kiln | 2 clay, 1 fuel gives 4 bricks | 10 s (s) |
| Glass | Kiln | 2 sand, 1 fuel | 10 s (s) |
| Planks | Lumber mill | 1 lumber gives 1 plank (any wood); waterwheel upgrade: 2 per 1 lumber (s) | 5 s |
| Leather | Tannery | 1 hide | 15 s |
| Hardened leather (Jade: the Tannery) | Tannery | 2 leather (s, Open for Jade's rebalance) | 20 s (s) |
| Sinew / rope | Tannery or Big House | 1 leather, or 2 flax | 10 s |
| Gunpowder (10 charges) | Powder mill | 2 saltpetre, 1 sulphur, 1 charcoal | 15 s (s) |
| Cannonball | Foundry | 1 iron ingot (any grade) or 2 stone | 5 s (s) |
| Catapult stone / ballista bolt (5) | Great Workshop / Manufactory | 1 stone / 2 hardwood lumber, 1 wrought iron | 10 s / 30 s |
| Bandage / healing remedy | Herbalist hut | 1 herb, 1 flax (or leather) heals 30 over 15 s / 2 herbs, 1 glass bottle heals 60 over 5 s | 10 s / 20 s |

Building costs below are paid in lumber and stone straight from the pool (workers hew on site, as the doc says for stone blocks); planks are only for kits, carts and engines (s). The forges only smelt; they make no items (Jade, 2026-10-03).

**2c. Worker tool kits (one kit per tier covers every tool a worker uses: axe, pick or maul, hammer, hoe, sickle, fishing gear and, from copper, the prospecting hammer (Jade: one kit, upgraded on Q); costs are the old tool items summed (s))**

| **Tier** | **Kit** | **Gather speed** | **Worker damage** | **Kit cost** | **Time to make** |
|---|---|---|---|---|---|
| 1 | Hardwood (axe, digging stick, mallet, hoe; the digging stick digs earth and quarries stone but mines no ore) | x1.0 | 4 | 3 hardwood sticks | 10 s |
| 2 | Stone and flint (flint axe and knife for chopping, stone maul for quarrying, digging and breaking rock, stone hammer for building; mines copper and tin at x1.0, no iron) | chopping x1.25; quarrying, digging, building and repair x1.15 | 5 | 6 hardwood sticks, 1 flint, 5 stone | 30 s |
| 3 | Copper (the first pickaxe) | x1.5 | 6 | 2 copper ingots, 2 hardwood lumber | 35 s |
| 4 | Bronze (mines bog iron and iron rock) | x1.75 | 7 | 2 bronze ingots, 2 hardwood lumber | 35 s |
| 5 | Wrought iron (mines vein iron) | x2.25 | 8 | 2 wrought iron, 2 hardwood lumber | 40 s |
| 6 | Iron | x2.5 | 9 | 2 iron, 2 hardwood lumber | 40 s |
| 7 | Steel | x3.0 | 10 | 2 steel, 2 hardwood lumber | 45 s |
| 8 | Carbon steel | x3.5 | 11 | 2 carbon steel, 2 hardwood lumber | 55 s |

All (s), carried across from the old tool items. Prospecting takes 20 s with a tier 3 kit or better; fishing gives 1 fish per 10 s. What each tier may gather is the Progression table; dig speed has its own scale in table 10.

**2d. Melee kits: close melee, long melee and cavalry (costs are the old weapon items carried across (s); arc hits: main target full damage, others within reach in a 90 degree arc take half (s))**

Close melee (a one-handed weapon; the shield comes with the armour, table 3):

| **Tier** | **Weapon** | **Damage** | **Swing time** | **Reach** | **Hit** | **Kit cost** | **Time to make** |
|---|---|---|---|---|---|---|---|
| 0 | fists (the fist fighter, only when nothing else is affordable: Jade) | 4 (s, Open for Jade's rebalance) | 1.2 s (s) | 1.0 m | blunt | nothing | 0 s |
| 1 | hardwood cudgel | 8 | 1.3 s | 1.2 m | arc, blunt | 3 hardwood sticks | 10 s |
| 2 | flint hand-axe | 10 | 1.3 s | 1.2 m | arc | 2 hardwood sticks, 1 flint | 10 s |
| 3 | copper short sword | 12 | 1.3 s | 1.2 m | arc | 1 copper ingot, 1 hardwood lumber | 20 s |
| 4 | bronze shortsword | 16 | 1.2 s | 1.2 m | arc | 2 bronze, 1 hardwood lumber, 1 leather | 30 s |
| 5 | wrought iron sword | 21 | 1.2 s | 1.2 m | arc | 2 wrought iron, 1 hardwood lumber, 1 leather | 30 s |
| 6 | iron broadsword | 24 | 1.2 s | 1.2 m | arc | 2 iron, 1 hardwood lumber, 1 leather | 30 s |
| 7 | steel side-sword | 30 | 1.2 s | 1.3 m | arc | 3 steel, 1 hardwood lumber, 1 leather | 45 s |
| 8 | basket-hilted broadsword | 36 | 1.2 s | 1.3 m | arc | 3 carbon steel, 1 hardwood lumber, 1 leather | 60 s |

Long melee and cavalry (a two-handed weapon; no shield; a slower swing than close melee at every tier; no minimum range and no close-in penalty; a hit at the outer third of reach is a critical for +30% damage (Jade; the outer third is (s))):

| **Tier** | **Weapon** | **Damage** | **Swing time** | **Reach** | **Hit** | **Kit cost** | **Time to make** |
|---|---|---|---|---|---|---|---|
| 1 | fire-hardened spear | 9 | 1.4 s | 2.5 m | stab | 4 hardwood sticks | 10 s |
| 2 | flint-headed spear | 12 | 1.4 s | 2.5 m | stab | 3 hardwood sticks, 1 flint | 10 s |
| 3 | copper leaf-blade spear | 15 (Open for Jade's rebalance: no old copper spear) | 1.4 s | 2.5 m | stab | 1 copper ingot, 1 hardwood lumber | 20 s |
| 4 | bronze spear | 18 | 1.4 s | 2.5 m | stab | 1 bronze, 1 hardwood lumber | 25 s |
| 5 | crude iron spear | 28 | 1.6 s | 2.5 m | stab | 3 wrought iron, 2 hardwood lumber | 40 s |
| 6 | iron pike | 32 | 1.6 s | 3.5 m | stab | 3 iron, 2 hardwood lumber | 40 s |
| 7 | steel halberd | 38 | 1.6 s | 2.5 m | arc; hits low flyers | 3 steel, 2 hardwood lumber | 45 s |
| 8 | zweihänder | 45 | 1.6 s | 2.0 m | arc | 3 carbon steel, 2 hardwood lumber | 60 s |

**How these were set:** the old weapon items of the same metal (copper axe, bronze sword and spear, the wrought, refined, steel and high-quality steel swords and halberds, the steel pike's reach); each metal tier adds about 25%. Cavalry use the long-melee row from the saddle with +0.5 m reach and double damage on a charge (table 14). Open for Jade's rebalance: every damage and time here is carried across untouched.

**2e. Ranged kits: the ranger ladder and the brawler (ammunition is unlimited (Jade); a shooter reloads only while standing still (s))**

| **Tier** | **Weapon** | **Damage** | **Attack time** | **Range** | **Spread** | **Kit cost (s)** | **Time to make** |
|---|---|---|---|---|---|---|---|
| 1 | leather sling | 8 blunt | 2.0 s | 20 m | 8% of range | 1 leather or 1 flax | 10 s |
| 2 | yew longbow | 10 | 2.0 s | 25 m | 6% | 3 lumber, 1 sinew or flax, 1 flint, 1 feather | 35 s |
| 3 | recurve bow, copper arrowheads | 12 (copper tip +2, Open for Jade's rebalance) | 2.0 s | 25 m | 6% | 3 lumber, 1 sinew or flax, 1 copper ingot, 1 feather | 35 s |
| 4 | recurve bow, bronze arrowheads | 13 | 2.0 s | 25 m | 6% | 3 lumber, 1 sinew or flax, 1 bronze, 1 feather | 35 s |
| 5 | recurve bow, wrought-iron arrowheads | 15 | 2.0 s | 25 m | 6% | 3 lumber, 1 sinew or flax, 1 wrought iron, 1 feather | 35 s |
| 6 | recurve bow, iron arrowheads | 16 | 2.0 s | 25 m | 6% | 3 lumber, 1 sinew or flax, 1 iron, 1 feather | 35 s |
| 7 | steel-prod crossbow (Crossbows research) | 40 | 4.5 s | 34 m | 3% | 3 steel, 1 wrought iron, 2 planks, 1 flax, 1 hardwood lumber, 1 feather | 75 s |
| 8 | flintlock musket (Muskets, Carbon steel) | 60 | 8.0 s | 40 m | 4% | 1 carbon steel, 2 planks, 1 flint, 1 gunpowder | 90 s |
| 8, brawler only | flintlock pistol and cutlass (the cutlass is the tier 8 close-melee row) | pistol 40 (s, Open for Jade's rebalance) | pistol 6.0 s (s) | 15 m (s) | 6% (s) | 4 carbon steel, 1 plank, 1 flint, 1 hardwood lumber, 1 leather, 1 gunpowder | 120 s (s) |

Feathers are needed from the longbow up and gunpowder for the musket and the brawler (Jade). Each kit's cost is the old weapon plus one batch of its old ammunition (arrows, bolts, a powder charge), since the troop never needs ammunition again (s). The brawler fires the pistol at range and fights with the cutlass when close (s). Damage to walls and buildings: arrows, bolts and sling stones 0; musket ball and pistol ball 2 (s). Blunt hits follow the roster's skeleton rule (+50%).

**2f. Mechanical units (do not eat, never heal, repaired by workers; wheels need ramps (doc))**

| **Unit** | **Damage** | **Range (min)** | **Reload** | **Crew** | **Health** | **Haul speed** | **Recipe** | **Made at** | **Time** |
|---|---|---|---|---|---|---|---|---|---|
| Bronze cannon | 150, 50 splash in 2 m; 400 vs walls (s) | 60 m (10 m) (s) | 12 s (s) | 2 cannon crew (s) | 400 (s) | horse 2.5, ox 1.5, crew pushing 1.0 m/s (s) | 20 bronze ingots, 10 hardwood lumber (s) | Foundry, Cannons | 180 s (s) |
| Iron cannon | as bronze (s) | as bronze | 12 s (s) | 2 | 500 (s) | as bronze | 12 wrought iron, 10 hardwood lumber (cheaper than bronze, as the doc says) (s) | Foundry, Cannons, Forge 3 | 150 s (s) |
| Catapult | 80 in 3 m; 200 vs walls (s) | 50 m (15 m) (s) | 15 s (s) | 2 warriors, no training (s) | 300 (s) | horse 2.0, ox 1.5, crew 0.8 (s) | 40 hardwood lumber, 20 planks, 10 rope, 10 bronze (s) | Great Workshop (doc), Siege engines | 240 s (s) |
| Ballista | 90, pierces 2 targets in a line; 20 vs walls (s) | 45 m (5 m) (s) | 8 s (s) | 1 warrior, no training (s) | 250 (s) | horse 2.5, ox 1.5, crew 1.0 (s) | 40 hardwood lumber, 20 wrought iron, 10 rope (s) | Manufactory (doc), Siege engines, Forge 3 | 240 s (s) |
| Hand cart |  |  |  | 1 worker pushes at 2.0 m/s (s) | 100 (s) |  | 6 planks, 4 hardwood lumber (s) | Workshop tier 2 (doc) | 60 s (s) |
| Ox cart |  |  |  | driven by 1 worker (s) | 200 (s) | ox 1.5, horse 2.5 m/s (s) | 12 planks, 8 hardwood lumber, 4 leather, 2 wrought iron (doc: a little iron) (s) | Great Workshop (doc) | 120 s (s) |

A cannon shot uses 1 gunpowder charge and 1 cannonball; a musket shot 1 charge and 1 ball (doc). Capacities are in table 12.

#### Balance notes (suggested)

Tuning notes that go with the number tables: which open questions they answer, and the pacing they were designed for. All suggested.

**Questions the tables answer**

- 1. Dig speeds per tool tier: Jade's steel day sets the scale; the per-tier curve is mine (table 10).
- 2. Shield block: Jade capped the best shield at 30%; the ladder 10 / 15 / 20 / 25 / 30 is mine (table 3).
- 3. Training limit: Jade's two levels above the start; the rank names, health and XP steps are mine (tables 1 and 7).
- 4. Foods per cooking tier: mine (table 6).
- 5. First marble main base level: Jade's level 5; the marble amounts, and marble in the Grand Academy, are mine (table 4).
- 6. Upper workshop tiers: the doc's new list (bows, crossbows and muskets with the forge, carts, catapults, ballistas); the costs are mine (tables 2 and 4).
- 7. Mineshaft tiers: 3, unlocked by Deep Mining I, II, III with silver and gold in the higher fees (doc); the fee amounts are mine (table 4).
- 8. Claimed land: Jade's 5 m and 10 m (table 8); the light radii beyond that are mine (table 18).
- 9. Random night events: the doc's single fog night; its 10% chance is mine (table 8).
- 10. Blood night trigger and warning: Jade set it: the players occupy 60% of a single band, once per band, none in the Deadlands; "occupy" as claimed cells checked at dusk, the night 13 floor and the dusk warning were delegated by Jade and are decided; no stronger variants (table 8).
- 11. Start pocket amounts: mine; the starter food (15 meat, 10 fish, 10 eggs for 10 days) is confirmed by Jade (table 9).
- 12. Village specialisations, mercenary camps and surrender: the doc's suggestions, priced by me (table 11).
- 13. Halfling villages: placed at generation (doc); the count and the 120 m stand-off are mine (table 9).

Not touched (outside the 19 tables): the exact carving size beyond the bite rule, and more peoples.

**Pacing check**

Written before the troop rework of 2026-10-03, so it names the old items (flint spear, bloom iron, HQ steel); the metal tiers it tracks are unchanged, bloom iron is now wrought iron and HQ steel carbon steel.

Worker-day income with hardwood tools and a 30 m walk: 20 softwood lumber (15 s a load plus 20 s walking, about 5 loads in 3 minutes less overheads), 25 loose stone, 12 fish by rod; with a stone maul 25 copper or tin ore (s). A tier 1 farmer makes 6 wheat (12 nutrition, feeds 6). A forge worker smelts 36 copper ingots a day (s) if ore is there. Worker-minutes per building (ws / 60): Lodge 4, Forge 1 5, Kiln 5, main base 2 to 10: 7, 7, 8, 10, 13, 17, 20, 25, 33; Bloomery 5, Ironworks 8, Steelworks 15, Powder mill 5, Foundry 10, Gunnery yard 10 (s), stone wall 1 per 3 columns.

Time to each tier, steady play, counting days (nights) from the start:

- Stone and flint: day 0 (no research; 4 tool sets at the Big House in 40 s); the Lodge is built for Bronze (s).
- Bronze: Forge 1 day 1; 2 miners on copper 2 days = 100 ore = 50 ingots, tin 30 ore = 15 ingots; Bronze research day 2 to 3 (10 copper, 2 tin, 75 s); 44 bronze ingots by day 4 arms 5 warriors with sword, scale and shield (8 each) and the workers with bronze tools: night 4 to 6. Target 4 to 6 (s).
- Iron: main base 3 (day 5 to 6, 6 workers), Kiln with 20 Fringe clay (day 6), Bloomery (day 6 to 7): bloom iron night 7 to 9; base 4 (day 8 to 9), base 5 with 20 bricks, 20 marble from a Fringe marble rock and 75 hardwood from the Fringe (day 11 to 13, 10 workers), Ironworks (day 13 to 15): wrought iron, crossbows and mail night 14 to 16. Target 13 to 18 (s).
- Steel: base 6 (day 17 to 19), base 7 (day 21 to 23), Steelworks (day 24 to 26), vein iron from a Deepwoods ridge by ox cart (the cart from a Great Workshop on day 15 to 16, the first 120-ore load home by about day 20) or a tier 2 mineshaft, Steel research 150 s: steel night 26 to 29. Target 25 to 30 (s).
- Gunpowder: Powder mill (day 22 to 24), base 8 (day 30 to 33), Foundry and Gunnery yard (day 34 to 37), 5 sulphur for the research from one Barrens hot spring (a 10-minute run, 20 a spring) or the Deadlands (a 16-minute run each way, one ox cart carries 240 sulphur, about 5 days a round trip) or skeleton bomber drops, then Gunpowder, Muskets and Cannons research (540 s, 3 days on one lodge, about 2 at a Grand Academy): muskets night 40 to 44, cannons night 43 to 46. Target 40 to 48 (s).

Wave versus a reasonable defence (single-player budgets without depth weighting; mob stats roster 5.0; damage after table 3 armour):

- Night 0, budget 12: 4 zombies, 2 bats, 2 rats, 1 giant spider, 1 slime against 1 warrior (flint spear, 8.6 damage a second), 4 workers (2.7 each) and a 300 HP softwood fence. The warrior kills a zombie in 7 s stabbing over the fence (reach 2.5 m); 4 zombies chewing one column (2.5 a second each, 10 total) need 30 s to break it and are all dead at 28 s, so the fence holds. Rats (26 HP) climb in 4 to 6 s and die to the four workers in about 2.5 s each (s); bats die to 3 stabs each; the spider (40 HP) dies on the fence in about 3.5 s to the warrior's stabs before it gets over (ruling 10 below) (s); the slime (half damage from stabs) takes 21 s. About 60 s of fighting in a 180 s night with the first arrival at about 35 s (s). The zombies at the fence are the real test, and it teaches the fence.
- Night 10, budget 46: 2 bloated corpses, 2 bombers, 6 skeleton archers, 8 zombies, 3 rats, 2 bats, 1 slime (about 1560 HP (s)) against 6 warriors in bronze or bloom iron behind a hardwood fence (s). A bloated corpse does 8 a second through bronze scale and bursts for 28; a bomber breaks a softwood column (220 vs 300) but not hardwood. The night-13 blood night now meets wrought iron (s).
- Night 20, budget 88: about 3500 HP of hounds, goblins, bombers and corpses against 10 warriors in wrought iron and mail, 4 crossbows and the first stone walls (s). Hounds at 5.5 m/s reach sheltered workers only if a gate is open.
- Night 40, budget 196: about 8800 HP including a bone colossus (900 HP, 30%, 120 a hit on walls, 36 s per stone column) and a hollow priest raising zombies, against 16 steel warriors (HQ steel from about night 30), 8 crossbows, 2 to 4 mages and stone walls; muskets land on nights 40 to 44 and are not counted (s).
- Night 60, budget 336: about 13400 HP of fiends, hellhounds, scorchwings, cinderlings and Rift beasts against 25 HQ steel warriors, 8 muskets, 2 cannons, 4 mages and stone walls (cinderlings burn wood) (s).
- Night 80, budget 508: about 23000 HP including demon brutes (1400 HP, 35%, 180 a hit: a stone column in 22 s) and void stalkers (triple first strike of 90 on a 100 HP mage) against 30 HQ steel warriors at about Elite rank, 15 muskets, 4 cannons, 6 mages and the Citadel ports (s). Mages stand behind warriors.
- Night 110 (unchanged; gear is complete by about night 55, so only ranks, numbers and walls grow after that), budget 826 plus Morvath (25000 HP, 50%, Violet ruin 300 in 20 m with 3 s warning, 105 through plate): 30 Hero warriors (about 540 a second after his armour, at +20%), 15 muskets (56), 4 cannons (25), 6 battle mages (about 90) make about 710 a second: Morvath falls in about 35 s of concentrated fire and the rest of the wave (about 37000 HP) in about 52 more. About 87 s of pure damage in a 180 s night, so he is beaten with losses on a good night and wins on a bad one, which is what a boss should do.

Supply and food at night 110: main base 10 (50) and 10 tier 3 farms (80) carry 130 units; 105 units eat 210 nutrition a day, which 7 tier 3 wheat farmers through the Grand Kitchen (12 wheat a day each, as bread 30 nutrition) provide.

**Balance harness results (Milestone 10, 2026-10-03; no table value changed)**

How to run: `pnpm --filter @blockyrts/tools balance` prints this pacing check and the night 110 supply, both worked out from the sim's own tables, then runs the wave versus defence on nights 0, 10, 20, 40, 60, 80 and 110 on seeds 1 to 3 against fixture towns with a scripted defence, one CSV row per run. Options: --pacing alone, --nights, --seeds, --blood, --csv.

The harness's own assumptions (s):

- The town starts with 4 workers and gains 0.5 a day, up to 40, and spends half its working day on the tech ladder.
- Each load costs a 20 s walk, plus extra for far resources: hardwood, clay and coal 40 s; marble and saltpetre 60 s; sulphur 600 s.
- Vein iron costs 12 worker-seconds a unit and a hide 40.
- The night 110 supply town: 45 warriors, 6 mages, 52 workers, 2 Lodges, a level 10 main base and 10 tier 3 wheat fields.
- Fixture towns follow the defences above. Harness fixture note only, not a defence rule: in the harness, mages stand on the main base's parapets from level 3.

Results with today's tables:

- Bronze lands on night 8, wrought iron on 22, steel on 34, and muskets and cannons on 46.
- Supply carries 105 of 130, with 7 farmers needed.
- Nights 0 to 80 hold; night 10 breaks the hardwood wall on 2 seeds of 3; night 110 falls on every seed.

**Known imbalances, for Jade's rebalance (s) observations**

From the Milestone 10 balance pass; details in the repo's docs/balance-pass.md. None of these deviates from a table value; they wait for Jade's rebalance.

- 1. Night 110 falls on every seed: walls break 27 to 43 s in, Morvath ends at 60 to 70% health, and 27 to 33 of 45 warriors die.
- 2. Bronze, wrought iron and steel land 2 to 4 nights after their targets in this pacing check.
- 3. A battle mage on the ground cannot shoot over a wall (Arcane bolt flies flat); she walks out of the gate and dies. Also an open question for Jade.
- 4. Skeleton archers stand off out of reach of a closed wall, and warriors on hold never answer them. Also an open question for Jade.
- 5. Night 10 breaks a hardwood wall on 2 seeds of 3 (bloated corpses, small slimes, and archers on seed 3).
- 6. On night 0, a bat or the giant spider sometimes kills a worker.

### Magic

Magic is used by a special unit type, the **mage**. Novice mages are common; powerful mages are rare, because the top ranks can only be reached through combat experience.

#### Mage types

- **Support mage:** heals and gives allies temporary stat boosts.
- **Warding (suggested):** a support mage spell. Friendly units within 8 m take half damage from enemy spells for 30 seconds.
- **Battle mage:** attacks with elemental and arcane spells. Some spells are projectiles, such as a fireball; others are non-projectile and hit with no projectile (see "Combat").
- **Battle mage spells (suggested):** fireball (projectile), arcane bolt (a violet-white orb, projectile), beam (a continuous line of damage), and area blast (a ring of damage around a point).
- **Counterspell (suggested):** a battle mage spell that cancels one enemy spell being cast within range. Warding and Counterspell are researched at the Magi Sanctum with hexstone.

More types will be added later.

#### Mage ranks and mana

Every mage has its own mana bar, which spells use up and which refills over time. Being in combat stops the refill for 10 seconds. Higher ranks refill faster:

| **Rank** | **Refill speed** | **Time to refill an empty bar** |
|---|---|---|
| Novice Acolyte | Base | 2 min 0 s |
| Acolyte | 10% faster | about 1 min 49 s |
| Adept Acolyte | 20% faster | 1 min 40 s |
| Mage | 30% faster | about 1 min 32 s |
| Master Mage | 40% faster | about 1 min 26 s |
| Grand Magician | 55% faster | about 1 min 17 s |

- Mages are trained at the **Magi Sanctum**, and at main bases of level 6 or higher. On both, S trains a Support mage and M a Battle mage (suggested). Mages upgrade their wand and robe beside the Sanctum, a Forge or a main base (see "Troops and gear"), and the Sanctum researches Hexcraft.
- All mages are female, and they cast spells with wands (see "Unit models").
- Mages with ranged spells can fight from towers and from the parapets of a level 3+ main base.
- Mages wear leather armour at most (suggested).

#### Casting spells (suggested)

Added 2026-10-02 from what Milestone 6 built. Each spell has a letter on the mage's command card (see "Command card and hotkeys"); the keys can be rebound under a Mages group in settings.

| **Spell** | **Key** | **Click on** | **Casts by herself** |
|---|---|---|---|
| Heal (support) | R | own unit | yes |
| Quicken (support) | K | own unit | no |
| Fortify (support) | F | ground | no |
| Rally (support) | Y | ground | no |
| Warding (support, Hexcraft) | W | ground | no |
| Arcane bolt (battle) | R | enemy | yes |
| Beam (battle) | B | enemy | no |
| Fireball (battle) | F | enemy | no |
| Area blast (battle) | T | ground | no |
| Counterspell (battle, Hexcraft) | C | an enemy that is casting | yes |

- **Casting:** press the spell, then click its target. The cursor is red for spells aimed at enemies and green for spells aimed at allies. Of the selected mages, one that has the mana and the spell ready casts it.
- **Everyone casts:** press the spell twice, or double-click its button, and every selected mage casts it on her own best target.
- **Cooldowns:** a spell that is cooling down shows its remaining seconds on the button and can still be ordered; the mage casts as soon as it is ready.
- **Casting by herself:** support mages heal and battle mages fire arcane bolts on their own, and both counterspell on their own. Each spell has a "casts by herself" flag in the spell table (table 13).
- **Timing:** a cast takes 1 second. Mana and the cooldown are paid when the spell lands, so a cast that is interrupted or cancelled costs nothing. A cast order gives up after 30 seconds if the mage cannot reach a spot to cast from.
- **In combat** means hurt in the last 10 seconds; that is what stops the mana refill. A battle mage chases a target at most 15 m (her leash).

#### Table 13: Mage spells and mana

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

Mana bar per rank (s): 100, 120, 140, 160, 180, 200; refill per second from the doc's times: 0.83, 1.10, 1.40, 1.74, 2.09, 2.60. Each rank adds one spell and keeps the earlier ones, and Hexcraft research adds Warding and Counterspell at rank 2; spell power scales x1.0 to x1.5 by rank (table 1). Cast time 1.0 s (s). Non-projectile spells need line of sight to cast and then always land (doc).

| **Spell (clip)** | **Key (s)** | **Casts by herself** | **Target** | **Mage** | **From rank** | **Mana** | **Cooldown** | **Range** | **Projectile** | **Effect** |
|---|---|---|---|---|---|---|---|---|---|---|
| Heal (cast_heal) | R | yes (s) | own unit | support | 1 | 15 (s) | 2 s (s) | 12 m (s) | no | one ally regains 30 over 3 s (s) |
| Quicken (cast_bolt) | K | no | own unit | support | 2 | 20 (s) | 10 s (s) | 12 m (s) | no | one ally moves and attacks 25% faster for 8 s (s) |
| Fortify (cast_area) | F | no | ground | support | 3 | 30 (s) | 15 s (s) | 10 m (s) | no | allies within 5 m get +15% armour for 10 s (s) |
| Rally (cast_beam) | Y | no | ground | support | 4 | 40 (s) | 20 s (s) | 12 m (s) | no | allies within 6 m do +20% damage for 10 s and are cured of poison and hexes (s) |
| Arcane bolt (cast_bolt) | R | yes (s) | enemy | battle | 1 | 10 (s) | 1.5 s (s) | 18 m (s) | yes | 20 damage to one target; 2 vs walls (s) |
| Beam (cast_beam) | B | no | enemy | battle | 2 | 25 (s) | 6 s (s) | 14 m (s) | no | 12 per second for 3 s to one target (s) |
| Fireball (cast_bolt) | F | no | enemy | battle | 3 | 30 (s) | 8 s (s) | 22 m (s) | yes | 35 to the target, 15 to everything within 2 m; x3 vs wooden walls and buildings, 30 vs stone, sets wood burning 8 per s for 5 s (s) |
| Area blast (cast_area) | T | no | ground | battle | 4 | 50 (s) | 15 s (s) | 16 m (s) | no | 45 to everything within 4 m of the point, 40 vs walls (s) |
| Warding (cast_area) | W | no | ground | support | 2, with Hexcraft | 30 (s) | 30 s (s) | 10 m (s) | no | units within 8 m of the point take half damage from enemy spells for 30 s (Jade) |
| Counterspell (cast_bolt) | C | yes (s) | casting enemy | battle | 2, with Hexcraft | 20 (s) | 8 s (s) | 18 m (s) | no | cancels one enemy spell while it is being cast within range (Jade); the enemy's mana and cooldown are still spent (s) |

Casting controls (s), added 2026-10-02 from what Milestone 6 built: keys are rebindable in a Mages hotkey group; press the spell, then click its target; of the selected mages, one with the mana and the spell ready casts it; press the spell twice (or double-click it) and every selected mage casts on her own best target; a cooling spell shows its seconds and can still be ordered. A mage is in combat when she was hurt in the last 10 s. Mana and cooldown are paid when the spell lands, not when the cast starts. A cast order gives up after 30 s without reaching its target. Battle mage leash 15 m; mages wear leather at most (table 1).

No ward item (Jade): mages do it as spells and hexstone is the research reagent. Hexcraft (the name is (s)): researched at the Magi Sanctum (not a lodge) for 6 hexstone and 20 herbs in 90 s (s), and opens Warding and Counterspell for every mage of rank 2 or higher (table 2a).

Elf Grovesinger (s): health 100, mana 150, refill 1.5 per s within 20 m of a living tree, 0.75 elsewhere, 0.3 in the Barrens and Deadlands. Rootbind: 30 mana, 12 s, 20 m, non-projectile, holds enemies within 4 m still for 3 s. Thorn volley: 20 mana, 4 s, 20 m, projectile, 5 thorns of 8 at up to 5 targets. Barkskin: 30 mana, 20 s, 10 m, allies within 6 m +25% armour for 10 s. Mending bloom: 30 mana, 15 s, 12 m, allies standing within 4 m regain 5 per s for 8 s. Call of the wild: 40 mana, 60 s, wild animals within 30 m fight for the Elves for 15 s.

**Wands and robes (Jade: mages have their own two ladders, mixed freely; names and numbers (s), Open for Jade's rebalance)**

| **Tier** | **Wand** | **Spell power, mana bar** | **Wand cost** | **Robe** | **Protection, mana regain** | **Robe cost** | **Time to make (wand / robe)** | **Needs** |
|---|---|---|---|---|---|---|---|---|
| 1 | hazel wand | x1.0, +0 | 5 hardwood sticks | homespun robe of flax | 0%, +0% | 3 flax | 10 / 10 s | nothing |
| 2 | copper-tipped wand | x1.05, +10 | 5 hardwood sticks, 1 copper ingot | leather-trimmed robe | 5%, +5% | 3 flax, 1 leather | 20 / 20 s | Casting Hearth |
| 3 | bronze-bound staff | x1.10, +20 | 2 hardwood lumber, 2 bronze | hardened-leather robe | 10%, +10% | 3 flax, 2 hardened leather | 30 / 30 s | Bronze |
| 4 | iron-shod staff | x1.15, +30 | 2 hardwood lumber, 2 iron | warded robe, a mana crystal sewn in | 15%, +15% | 3 flax, 2 hardened leather, 1 mana crystal | 30 / 30 s | Ironworks |
| 5 | crystal staff, steel-shod and set with mana crystals | x1.20, +40 | 2 hardwood lumber, 2 steel, 2 mana crystals | rune-stitched vestments, copper thread and crystals | 20%, +20% | 3 flax, 2 hardened leather, 2 copper, 2 mana crystals | 45 / 45 s | Steel |
| 6 | archstaff, carbon steel with more crystals | x1.25, +50 | 2 hardwood lumber, 2 carbon steel, 5 mana crystals | archmage's mantle, steel thread and crystals | 25%, +25% | 3 flax, 2 hardened leather, 2 steel, 5 mana crystals | 60 / 60 s | Carbon steel |

The wand multiplies with the rank's spell power (table 1). The tier 2 wand is the old novice wand; the mana crystals at tiers 5 and 6 echo the old rank wands.

**How these were set:** an Arcane bolt every 1.5 s costs 6.7 mana per second, so a Novice (0.83 per s refill) empties a 100 bar in about 20 s of casting and then fires one bolt every 12 s; a Grand Magician (2.6 per s, 200 bar) keeps up a bolt every 4 s indefinitely. Battle mages are support for the line, not a replacement for it, until the top ranks.

### Terrain

The land is natural-looking ground that players can dig into, tunnel through and build up. How the world is laid out (cells, barriers and depth bands) is in "The world"; this section is about the land itself. Parts marked "(suggested)" are starting values to tune in play.

#### What the land is made of

- The land looks like **stacked, unrotated cuboids of many sizes**. A wide, flat field looks like a few huge cuboids; rough ground, cliffs and rubble look like many small ones. This matches the art style: everything is made of cubes, but not of fixed-size blocks.
- **Columns:** the land is stored as columns on a grid. Across the ground there is one column every stride (4 terrain units, about 45 cm). Heights are measured in **terrain units** of about 11 cm (about half a human head). Each column holds a short list of solid layers, each with a bottom, a top and a material. Overhangs, arches, caves and tunnels are simply columns with more than one layer.
- **Drawing:** only the faces of the land that touch air are drawn, and neighbouring columns of the same material and height are merged into one large face. That is what gives cuboids of many sizes on screen without storing them as cuboids. Far-away chunks are drawn with less detail.
- Each layer has a **material**: soil, sand, gravel, clay, stone, marble, ore-bearing rock and so on. The ground is layered, usually soil on top, then clay, sand or gravel in places, then stone, with ore in places deeper down. The material decides what carving it gives and how hard it is to break.
- Within each cell of the world (see "The world"), generation from the seed shapes the land into natural forms, as natural as the cuboid style allows: stepped hills, terraces, cliffs, rock layers, scattered boulders, overhangs, natural arches and caves. Edges are kept uneven so that hills do not look like pyramids.
- **Saving:** the untouched land is rebuilt from the seed every time it is loaded. Only the changes players make are stored, chunk by chunk (which column layers changed), together with the water in chunks where water has moved. A save stays small however large the world gets.
- **Scenery:** grass, pebbles, small bushes and flowers are decoration only. They are drawn in large batches, have no collision, cannot be gathered and are not game objects. They disappear where the land is dug away or built on. Trees, gatherable bushes (such as hazel bushes), gatherable rocks and ore are real game objects, but they are generated in code rather than made as models (see "Generated rocks and trees").

#### Generated rocks and trees

- **Rocks and ore outcrops** are small clusters of stone cuboids in the terrain's own style, with an ore texture where they hold ore. Each is generated from the world seed, so every one looks different and sits naturally in the land.
- **Trees** are generated in code from a set of settings for each species: tall, tiered softwood; small hardwood; thick, broad large hardwood; and multi-stemmed hazel bushes that grow back from the stump. The generator also gives the growth stages (seed, sapling, full size) from the tree's age.
- Generation is **deterministic** from the world seed, so every player's computer grows exactly the same tree, which lockstep multiplayer needs. Each tree is built from a small set of parts so trees can be drawn with instancing.
- **Species (suggested):** pine, spruce and small softwood (Heartland and Fringe); birch and hornbeam (Fringe); great oak and great beech (Deepwoods); dead trees and twisted thornwood (Barrens and Deadlands).
- One **reference tree per species** is made in Blockbench to set the look, which the generator then varies. These are on the models wishlist (see "Visuals").
- **Hit feedback:** when an axe hits a small tree (at the key moment of the chop animation) or a projectile hits it, the tree gives a tiny, quickly fading shake at its base for about a fifth of a second. The thicker the trunk, the smaller the shake. Big trees only get a faint rustle of the canopy. For now only trees react like this; buildings do not flinch, and units have their own injured animation (see "Unit models").
- **Hit particles:** generated in code, like the rocks and trees. Anything hit or attacked gives off a small burst of particles to match: blood from flesh, sparks from metal, and chips of stone or wood from rock, trees, walls and buildings.

Why this approach: a fixed grid of small blocks would force one block size and need millions of blocks, and a smooth height map could not have overhangs, arches, caves or tunnels. Columns of layers allow all of those, are cheap to edit, to find paths over, to flood with water and to save, and still look like cuboids of many sizes. Storing a column every 45 cm instead of every 11 cm means 4,096 columns in a 28.8 m chunk instead of about 65,500, which makes generation, drawing, pathfinding and water roughly 16 times cheaper. In a browser that is the difference between smooth and stuttering.

#### Moving over the land (suggested)

Units walk up small rises as if they were stairs, jump or clamber up slightly taller ones, and are completely blocked by anything taller, such as a cliff or a large boulder. Height is compared between neighbouring columns, one stride apart (about 45 cm).

| **Rise to the next spot** | **What a person-sized unit does** |
|---|---|
| Up to 2 units (about 22 cm, a stair step) | Walks up at full speed. In slope terms, ground up to about 25 degrees steep. |
| 3 to 4 units (about 33 to 45 cm) | Jumps or clambers up, which slows it down for a moment. Ground up to about 45 degrees steep. |
| 5 units or more (about 55 cm and up) | Blocked. Cliffs, large boulders and steep rock faces cannot be crossed; units find a way around. |
| A drop of up to about 9 units (1 m) | Steps or jumps down. |
| A drop of more than 1 m | Treated like a cliff: units never path off it. |

- These values are set per unit type and scale with size: big creatures step and jump higher, small ones lower.
- **Wheeled things** (carts and cannons on wheels) can only roll over rises of 1 unit and cannot jump, so they need ramps and level ground (see "Digging and building up the land").
- **Water:** units wade through water up to about waist height (about 1 m). Deeper water blocks walking units (see "Water").
- Climbing monsters (see "Threats") ignore the climb limit, as they do with walls. Flyers ignore terrain.
- A spot can only be stood on if there is enough headroom above it for the unit, so tunnels and cave passages have to be tall enough for the units that will use them.
- Because jumping slows units down, pathfinding prefers smooth routes when they are not much longer.
- Whenever the land changes (digging, filling, a building placed or destroyed), only the affected part of the walkable map is rebuilt.

#### Digging and building up the land

- Workers can dig with the **Dig** command: mark an area of ground, choose how deep, and the workers carve it out. Only workers can dig.
- **Dig rate (Jade's rule):** one worker with good steel tools takes **a full day** to carve a human-sized chunk of stone, or to dig a trench 1 m wide, 1 m long and 3 m deep. Worse tools are slower, and wooden tools basically never break through stone. The rate for each tool tier is scaled from this (see table 10). This replaces the earlier rate of 1.25 cubic metres per worker-minute and its trench and moat examples.
- **Carving bites (suggested):** each bite a worker takes varies by about a quarter either way around the mean for its tool tier, and the time taken is in proportion to the volume removed.
- **Pieces and steps:** the terrain unit (about 11 cm) is a unit of digging work, not the size of the steps the land changes in. The land's shape changes one column at a time (45 cm across) in 11 cm steps of height, so carving a slab 45 cm by 45 cm by 11 cm takes 16 pieces of work. At the dig rate a worker moves many pieces with every swing, so the digging animation is not one swing per piece.
- **Sea level** is the height reference for digging. There is no sea; it is only a reference point. The start basin and the main bases begin at about sea level.
- **Dig limit:** workers can dig down to **3 m below sea level**, or to 3 m below the natural ground if the land there was already lower than that. The natural ground is the land as it was generated, before anyone dug or built on it. Reaching deeper underground is what mineshafts are for.
- In practice: on flat ground at sea level, workers can dig a hole, trench or moat about 3 m deep. At the bottom of a natural ravine 5 m below sea level, they can still dig about 3 m deeper (to 8 m below sea level). From the top of a 20 m cliff, they can dig all the way down through the cliff to 3 m below sea level.
- **Into hillsides, cliffs and mountains,** workers can dig tunnels sideways, all the way through if they have the time, as long as the tunnel stays above the dig limit. This is how a pass is cut through a mountain range. Vein iron lies inside the rock of ridges and mountains, so tunnelling through one can expose ore (see "The world").
- Carving gives resources depending on the material: stone from rock (one of the ways to collect stone), clay from clay, sand from sand, gravel from gravel, marble from marble, ore from ore-bearing rock, and **Earth** from soil.
- Players can **build the land up** with **Earthworks** in the basic build menu: ramps, earth banks and filling holes and ditches. Ramps can be built from Earth, any type of lumber or stone; earth banks and fill are made from Earth. Lumber and stone ramps are made at a workshop, then placed by workers; earth ramps, banks and fill are built on the spot. All of them are placed like walls, by dragging, with a see-through preview of the new shape.
- **Moats and trenches** are real defences, strong but not absolute. A trench too deep to climb out of cannot be crossed on foot, so walking monsters have to go around it or break a way through something. Wall-breakers can smash a trench edge into a crossing: slower than breaking a softwood wall, faster than breaking stone. Climbers and flyers still cross it, as with walls.

#### Table 10: Dig speeds and break costs

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

**How these were set:** steel = 3 m3 of soil a day (1.0 a minute) and a human-sized chunk of stone (0.35 m3) a day; hardwood half the soil rate and no stone; the tiers between on a rising curve with flint and copper barely scratching stone; high-quality steel a little above steel (the scale the coordinator gave; the per-tier figures (s)).

| **Tool tier** | **Soil, m3 per worker-minute** | **Stone, marble and ore rock** | **Clay, sand, gravel** | **10 m3 trench, 4 workers** | **300 m3 moat, 4 workers** |
|---|---|---|---|---|---|
| Hardwood | 0.5 (s) | 0, cannot (Jade) | 0.4 (s) | 5 min (1.7 days) | 150 min (50 days of daylight) |
| Tier 2 kit (stone maul) | 0.58 (s) | 0.005, breaks rock slowly (s) | 0.46 (s) | 4.3 min (s) | 129 min (43 days) (s) |
| Copper | 0.6 (s) | 0.01 (s) | 0.5 (s) | 4.2 min | 125 min (42 days) |
| Bronze | 0.7 (s) | 0.03 (s) | 0.55 (s) | 3.6 min | 107 min (36 days) |
| Wrought iron / iron | 0.8 / 0.9 (s) | 0.065 / 0.09 (s) | 0.65 / 0.7 (s) | 3.1 / 2.8 min | 94 / 83 min (31 / 28 days) |
| Steel | 1.0 (Jade: 3 m3 a day) | 0.117 (Jade: 0.35 m3 a day) | 0.8 (s) | 2.5 min | 75 min (25 days) |
| Carbon steel | 1.1 (s) | 0.13 (s) | 0.9 (s) | 2.3 min | 68 min (23 days) |

Bite (s): the mean bite is one column 11 cm deep (0.022 m3), varying a quarter either way; a swing takes volume / rate, so about 1.3 s in soil and 11 s in stone with steel. A 2 m by 2 m tunnel 20 m long through a ridge (80 m3 of stone) is 285 worker-days with steel tools, so a pass is a mid-game town's project, not a trick.

Break cost for monsters, in the same points as wall health, per cubic metre (s): soil 200, clay 250, sand 120, gravel 150, stone 1500, marble 2000, ore-bearing rock 1500; a breaker must deal that much "vs walls" damage to open a 1 m wide crossing through each cubic metre, so a 2 m deep soil trench costs 400 (between a softwood wall at 300 and stone at 1500, as the doc wants), and the x3 comparison rule of the doc applies when it chooses between the trench and a wall. Earth from digging goes straight to the pool with no hauling (s). Marble carving needs bronze or better, ore rock needs the tool of its ore (table 5) (s).

#### Keeping digging fair

Digging and earthworks are a resource economy: time, pieces of work, materials out and Earth in. These rules stop them from becoming an easy win:

- **The ring moat:** a deep trench round the whole base is strong against walkers, but it takes many days to dig (see the moat example above), wall-breakers can smash an edge into a crossing, and climbers and flyers cross it anyway.
- **The mesa fortress:** building on a cliff-topped plateau with a single ramp up is meant to be strong. Its limits: mesas have thin soil or none, so no farms and little grass; isolated buildings are still destroyed at night; climbers go up cliffs; and the ramp is a chokepoint for both sides.
- **The mountain hall:** players can tunnel into a ridge and live inside. Unlit tunnels count as caves: monsters that flee the sun at dawn shelter in them, and cave-type lairs can appear in them unless they are inside claimed land. Tunnels also need headroom for the units that use them. Living underground only works with torches and gates.
- **Pit spam:** digging lots of shallow pits to confuse monsters does not work. Monster pathfinding uses a coarse map with costs, so pits only add a little cost, and every pit is work.
- **Earth from nowhere:** Earth only comes from digging soil, so land can only be built up with soil dug out somewhere else.

#### Water

- Water follows real-world logic. Every body of water holds a set amount: it flows downhill and fills low ground, and it can only spread as far as its volume allows.
- Water is one more layer in a column. It flows to lower neighbouring columns, fills low ground and settles. To keep this fast, water only moves near places where the land has changed, and it stops once it is level.
- **Rivers** are barrier edges between cells (see "The world"), fed from a source uphill with a fixed inflow, so they keep flowing. A channel dug from a river fills and keeps flowing. **Ponds** hold a fixed amount: a channel dug from a small pond only drains it into a thin layer, so a small pond will never fill a long river.
- **Fords** are a river's gaps, where it can be waded across.
- **Wading and swimming:** units wade through water up to about waist height (about 1 m). Deeper water blocks walking units. All player units can swim, whatever they wear, since gear has no weight (Jade, 2026-10-03). Some monsters can swim.
- Rivers can be dug, redirected and drained. Draining or redirecting a river by digging a new channel is slow and easy to see, because it can reshape a defence for both sides.

#### Monsters and terrain

- Night monsters spawn at the dark edge of the explored map and in lairs, then walk in, and they almost never spawn inside claimed land (see "Threats"). So the land, walls, trenches and water decide which way they come.
- **Pathfinding:** monsters find their way on a coarse navigation map of tiles about 2 m across. Each tile has a walking cost for each kind of monster (walkers, climbers, flyers and breakers) and, for barriers, a break cost that depends on the material. Groups share "flow fields" for each target and each kind of monster. When the land changes, only the changed tiles are rebuilt. The fine 45 cm grid is only used to steer around nearby obstacles.
- Monsters that can break walls can also break terrain, but they would rather not. Every obstacle has a **break cost**: how long it would take that monster to get through, based on the material (soil is weak, stone is strong) or the barricade's strength.
- When a monster looks for a way to its target, it compares walking around with breaking through and takes the path of least resistance.
- Player-built barricades (walls, gates and buildings in the way) come first. A monster only breaks natural terrain instead when the barricade is much tougher than a nearby natural barrier that also forms part of the defensive line. Natural terrain counts as three times harder than it really is when the monster compares the two.
- **Lairs** are placed in cells with no player buildings, preferring cells next to claimed land, so pressure builds at the frontier, and the spots the land offers: caves at the foot of ridges, ravines and dead forest. They never appear inside claimed land.
- **Caves** form at the foot of barrier edges and in the deeper bands. They are dark by nature, and by day they are home to monsters that flee the sun.

#### Mineshafts and prospecting

- Gold and gems (emeralds, rubies and diamonds) are very rarely found in tiny amounts on the surface. Most come from mineshafts, along with ore, coal and stone.
- Minerals lie hidden underground, set by the world seed. A worker can **prospect** an area with the **Prospect** command, which gives a rough idea of whether a mineshaft there would be worth building. Suggested result: a rating of Poor, Fair, Good or Rich shown over the area for a while.
- A mineshaft can be built on **flat stone**.
- Mineshafts come in **tiers**. Each tier digs deeper and brings up better quantities of materials, and each needs a higher level of research. There are **3 tiers**, unlocked by the Deep Mining I, II and III research; costs and output are in tables 4 and 5.

### Multiplayer and saving

Up to 8 players play together against the world. Single player is the same game with one player.

#### Allies panel

Two buttons next to the resource bar open the multiplayer tools. Both are clickable, like every other control. Suggested, as built 2026-10-03: they sit under the resource bar with Peoples, Ping and Pause; [ opens the Allies panel and ] Send resources, and both are greyed when playing alone.

- **Allies** opens a list of the other players, with a "Share control" checkbox next to each. Ticking it lets that player command your units.
- **Send resources** opens a window with a row for each ally. The player picks a resource, enters an amount (or clicks +10, +100 or All), and clicks Send. Resources arrive immediately. There is no cooldown, no limit and nothing is lost in transit.

**What shared control allows:**

- Allies can select and order your units exactly like their own: move, attack, patrol, hold, gather, shelter and garrison. Shared units show a ring in your colour so they are easy to tell apart.
- Allies can never use your buildings or spend your resources. They cannot start buildings with your workers, train units at your buildings, or start research for you.
- You keep full control of your units too. If two players order the same unit, the latest order wins.
- Resources gathered by your units always go to your own pool, whoever ordered them to gather.
- Map pings (suggested): a player can click a Ping button (or press \) and then a spot on the map or minimap to flash it for everyone, with a sound and "Look here" with their name, to point out a threat or a target. Right click or Esc cancels.
- Selecting only allied units shows a short command card (suggested): Attack, Stop, Hold, Patrol, Move, Gather, Return cargo.
- **Who sees what (suggested):** chat lines, pings, joins, leaves and pauses go to every player. A player's own alerts (attacks, deaths, trades, sent resources) go only to them. Messages name players by their names, never "Player 2".
- **Pause (suggested):** the Pause key or the ❚❚ button. Alone, the game also pauses while the F10 menu or the account page is open. Online, anyone may pause and anyone may carry on; a banner says who paused.

#### When a player is eliminated or leaves

- Their resources are split evenly between the remaining players.
- Their buildings and units become shared by all remaining players. Any remaining player can use those buildings, paying with their own resources.
- If an option at an inherited building needs a technology or building the eliminated player did not have, a player can still use it as long as they have that requirement themselves (or through another inherited building).
- Normal shared control while the owner is still playing does not give this technology access to allies.

#### Accounts and guests

- Players create an account with an email address, a password and a username. The username is also their in-game name, shown to other players and in the message panel.
- The usual account options are available, including "Forgot my password", which emails a link to set a new password.
- Players can also play as a **guest**. Before starting, the game warns them that a guest's progress will not be saved.
- A guest appears in game as "Guest" followed by a random 4-digit number (for example, "Guest 4821").
- Guests can join and host multiplayer games.
- If a guest clicks Save, the game pauses and offers to create an account. Once the account is made, the game is saved to the new account and play can continue.
- A game hosted by a guest can only be saved once the guest has created an account this way, since multiplayer saves are stored under the host's account.
- Saved games belong to the player's account, so they can be continued from any computer after logging in.

#### Saving and disconnects

- A game is meant to be played over many sessions.
- The game autosaves at every dawn.
- In single player the player can save at any time, even at night. In multiplayer the host can save at any time.
- A multiplayer game only runs with every player present. If someone disconnects, the game pauses and waits for them.
- If the player does not come back, the host chooses: save and quit, or carry on without them, in which case their resources, buildings and units are shared out as if they had been eliminated.
- Suggested, as built 2026-10-03: everyone sees "Waiting for NAME" after 1 s; after 30 s the host gets three choices: Wait, Carry on without them, or Save and quit (saves first, then closes the room for everyone). A player who leaves from the menu leaves for good and their side is shared out at once. Shared-out buildings keep the research their old owner had.
- Suggested, as built: the dawn autosave keeps the newest 5 matches in this browser and, with an account, on the server too (online, only the host's). Download a save file (F10 menu) writes a .sac file that Load game can open. A save carries each seat's name, colour and account, so a loaded game puts the same people back in the same seats, and loading gives the same game state as when it was saved. Online, only the host may save; the others see why the button is off.

### Outside the match

Jade approved these as written. The details are Claude's suggestions.

- **Main menu:** New game, Load game, Join game, Settings, Account, and Quit. A reminder on the menu tells players to press **F11** for full screen.
  - Suggested, as built 2026-10-03: the reminder also gives Ctrl + Cmd + F for a Mac, with a Full screen button. New game has a seed box (blank picks one), then Play alone or Host a game for friends. Join game takes the 6-letter code or the whole invite link, ignoring spaces, dashes and case. Opening an invite link goes straight to that lobby, and during an online match the address bar shows the same link, so a refresh rejoins the same seat. Quit in a browser goes back to the menu, since a page cannot close its own tab.
- **Hosting and joining:** the host creates a game, picks a seed (or a random one) and gets an invite link and a short code. Friends open the link or type the code to join the lobby. In the lobby, players see each other, pick their colours and mark themselves ready; the host starts the game when everyone is ready.
  - Suggested, as built: the lobby shows the code and the link, each with a Copy button, the player list (name, colour, ready, host marked), 8 colours with taken ones greyed, and Ready, Start the game (host only) and Leave. A host alone in the lobby may start too. Players are seated in slot order.
- **Loading and save slots:** the Load screen lists the player's saved games, newest first, with the night count, players and last played date. Multiplayer saves sit under the host's account; to continue one, the host loads it and the other players rejoin by invite, and the game starts once everyone who was in it is back (as in "Saving and disconnects").
  - Suggested, as built: Load game lists account saves (Continue, Delete), then this browser's autosaves; a save with more than one player shows Host to continue, which opens a lobby for those players to join by invite.
- **Settings:** graphics quality (low, medium, high), resolution scale, shadows on or off, view distance, music, effects and voice volume, hotkeys, and the camera sliders.
  - Suggested, as built: the quality presets are in table 20, and each setting can still be changed after picking one. Hotkeys can rebind any key, except that Enter is kept for chat. Settings never change the game itself.
- **Seeds:** every game has a seed shown in the pause menu. Players can type a seed when starting a game to play the same world again or share it with friends.
- **Onboarding:** there is no tutorial. Instead, a short series of hints guides the first day: select a worker, gather wood, build, light a torch, shelter at dusk. Hints can be turned off in Settings. Suggested, as built: one hint at a time, each gone once done; the last is Everyone Home at dusk, and dusk skips straight to it.
- **Browser check (suggested):** the menu checks the browser's features, not its name, and says plainly what is missing (a phone or tablet, no WebGL2, no save compression, no pointer lock).
- **Browsers:** the latest two versions of Chrome, Edge, Firefox and Safari on desktop computers. Phones and tablets are not supported.
- **Full screen:** the game reminds the player to press F11 for full screen when it starts, since some controls (such as Ctrl + number) only work in full screen.

#### Table 20: Multiplayer, saving and settings

Key: a value followed by (s) is suggested; a row ending in (s) is suggested throughout except values marked (doc). Values marked (Jade) or (doc), or unmarked, are fixed values already in this blueprint.

| **Rule** | **Value (s)** |
|---|---|
| Invite | 6-letter code or the link /join/CODE; spaces, dashes and case ignored |
| Lobby | 8 colours, one each; host starts once everyone else is ready, or alone |
| Missing player | "Waiting for NAME" after 1 s; host choices (Wait, Carry on without them, Save and quit) after 30 s |
| Autosave | every dawn; newest 5 matches kept in the browser; also on the server with an account (online, the host's only) |
| Save file | .sac, with a SEAT section (each seat's name, colour and account); loading gives the saved hash |
| Graphics presets | Low: resolution 75%, no shadows, view near; Medium (default): 100%, shadows, medium; High: 100%, shadows, far |
| Graphics ranges | resolution scale 50 to 100%; sun shadows cover 45 m round the camera; view distance near, medium, far = 5, 7, 9 chunk rings |
| Volumes (default) | music 70%, effects 80%, voices 80% |
| First-day hints | 5, one at a time: select a worker, gather wood, build, light a torch, Everyone Home at dusk |
| Accounts | email, name, password of 8 or more characters; forgot password by email link |
| Keys | [ Allies, ] Send resources, \ Map ping, Pause key, Enter chat; all rebindable except Enter |
| Send resources | +10, +100, All or a typed amount; arrives at once |
| Relay protocol | version 2: each player's account id travels with their name in the room state |

### Audio

- **Music:** separate tracks for day, dusk, night and dawn, plus a blood-night track.
- **Unit voices:** short voice cues when units get orders, are hungry, are under attack, or run out of a resource.
- **Sounds:** chopping, mining, digging, building, hits, blocks, deaths, explosions, a torch being lit and snuffed out, horns at dusk and dawn, the idle-worker alert, map pings and an error sound.

**As built (suggested)** (Milestone 10, 2026-10-03):

- Music follows the time of day: a day, dusk, night and dawn track, with the blood-night track in place of night on a blood night. Fight layers come in when hostile units are within 45 m of the camera's ground point, reaching the full fight at 12 of them.
- The dusk horn sounds at dusk (a double horn instead when tonight is a blood night) and the dawn horn at dawn.
- World sounds (work, hits, blocks, deaths, explosions, shots, spells and torches) play where they happen, and nothing more than 70 m from the camera's ground point is played. At most 24 hit and death sounds start per game update; the rest are capped.
- Hits are told apart: blades, arrows and bolts landing, blocks on a shield, and blows on walls. Big blasts (bombers, cannons) sound different from small ones.
- Unit voices play on select, on an order, on attack, under attack, hungry, out of a resource and on a refused order. Each unit kind and people has its own voice; beasts, the dead and engines have none. The same cue is not repeated within its gap, so a crowd never chants: 0.25 s for select and orders, 0.4 s for attack, 3 s for under attack, 20 s for hungry, 2 s for a resource running out, 1 s for a refused order.
- Interface sounds: button clicks, building placement, pings, the idle-worker alert and the error sound. The same alert sound is not repeated within 1.5 s.
- The music, effects and voice sliders apply at once. Sound starts after the player's first click, because browsers require it.
- Sound only listens to what the game reports. It never changes the game or its state hash.

## Visuals

Game assets are roughly inspired by Minecraft: everything is built from cubes. Unlike Minecraft, the cubes can be any size and any rectangular shape rather than fixed blocks. As in Minecraft, almost all cubes are not rotated. A few rotated cubes are allowed where needed, as long as the vast majority of cubes in the game are unrotated. In animations, some clipping is allowed so that movement looks lifelike.

Visuals follow the technology of the time. The main base, the research buildings, the forge, the cooking building and the workshop change their look with each upgrade, from log huts and campfires to stone, brick and finally a tall fortress. Tools, weapons and armour are attached to the character models, so the player can see at a glance how each unit is equipped.

Every model the game needs is described in two files kept by the modelling work: a stand-alone "models wishlist" that can be handed to an outside modelling artist or agent (art style, scale, how animations should work, and a description of each model), and an internal "models blueprint" covering the same plus the models already made. Rocks, ore and trees are generated in code instead (see "Generated rocks and trees").
