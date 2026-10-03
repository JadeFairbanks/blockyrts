# Performance notes (milestone 10)

The targets come from Technical decisions 10 in the blueprint:

| Target | Minimum machine | Reference machine |
|---|---|---|
| Animated units on screen | 30 fps with 400 | 60 fps with 800 |
| Live mobile units in one sim step | 3,000 inside 25 ms | 6,000 inside 25 ms |
| Draw calls | under 200 | under 300 |
| Memory | under 1 GB | under 1.5 GB |

## How to measure

- **Sim step time:** `pnpm --filter @blockyrts/tools perf:sim [--units 3000,6000] [--steps 400] [--seed 1]`.
  - It builds the balance harness's night 80 town (walls, towers, 45 warriors, 6 mages, Citadel cannons), steps to nightfall, then sets down N monsters of eight late-night kinds on a ring 30 to 70 m out.
  - It times every step while they march, break walls and fight, and prints the mean, the 95th percentile, the worst step (the first tenth is skipped as warm-up) and the state hash.
  - The hash lets a speed-up be checked against the code before it: same arguments, same hash.
- **Client frame:** the debug readout (top left) now shows fps, frame ms (main-thread work per frame), draw calls and triangles, units in the state message, and the JavaScript heap (Chrome only).
  - The debug tools bar has a **Crowd +200** button that sets down 200 night mobs round the view.
  - Press it at night, after **Citadel** if the town should hold.
- **By script:** `node packages/client/test-e2e/perf-look.mjs http://localhost:5198 <out dir> [--gpu]` drives a dev server at 1920 by 1080. It runs to night 1, reveals the map, builds a Citadel, reads the readout, adds 400 and then 800 mobs, and reads the readout again. It saves screenshots as perf-*.png.
  - Without `--gpu` it renders on SwiftShader, so its fps is meaningless, but draw calls, triangles, units and heap are the same as on a real GPU.

## Measured (this milestone, a shared 4-core cloud container)

### Sim

The run used 3,000 and 6,000 monsters set down on the night 80 town, plus the 51 defenders, so it counts about 3,050 and 6,040 live mobile units.

| Code | 3,000: mean / 95th / worst ms | 6,000: mean / 95th / worst ms |
|---|---|---|
| Before M10 | 95 to 99 / - / - | not run (over 200) |
| After M10 | 18.8 to 20.5 / 32.5 / 45 | 30 to 35 / 47 to 105 / 62 to 235 |

- 3,000 units fit inside 25 ms on average on this container, which is slower than either target machine.
- 6,000 units do not quite fit: about 30 ms on average on an idle container, and 35 ms while other jobs share it.
- The step that breaks a wall is the outlier, at about 150 ms on this container with 6,000 monsters (it was about 220 ms before the last fix).
  - Most of it is the claimed-land enclosure flood after a breach (up to 65,000 columns).
  - The step after it rebuilds the walls' coarse tiles for the flow fields (about 75 ms).
  - Both scale with the town's size, not with the number of monsters.
  - In the client the sim runs in its own worker, so a slow step shows as units hitching for a moment, not as a dropped frame.
- Every check script's hash trace (M0 to M8) is identical before and after, and so is perf:sim's own hash. No speed-up changed what the sim does.

### Client

These figures are from SwiftShader at 1920 by 1080, with the Citadel at night, the whole map revealed and fog of war off:

| Scene | Units | Draw calls | Triangles | Main thread a frame | Heap |
|---|---|---|---|---|---|
| Town at night | 291 | 79 | 397,000 | 5.1 ms | 37 MB |
| Plus 400 mobs | 686 | 78 | 430,000 | 5.0 ms | 52 MB |
| Plus 800 mobs | 1,086 | 76 | 444,000 | 6.3 ms | 67 MB |

- Draw calls stay at about 80 whatever the crowd, because every body and every mob is drawn as one instanced mesh per model.
- That is well under both budgets.
- The heap stays under 100 MB.
- The page has no console errors.
- The main thread spends 5 to 6 ms a frame on the scene. That leaves room for 60 fps on any machine whose GPU keeps up.
- The GPU side (fps itself) needs a real GPU. Use `--gpu` on a desktop, or watch the debug readout in play.
- Mobs draw with their catalogue models since the catalogue merged (PR #67). The real models add vertices per instance, not draw calls.

## What M10 changed

1. **Monsters stop scanning each other.**
   - The unit grid (combat/space.ts) keeps a second set of cells holding only units the monsters do not own, and a third holding only goblin chiefs.
   - A monster looking for prey (pickUnit, the late mobs' tricks, blasts, foes) or listening for a chief's shout now walks those cells instead of every unit near it.
   - On a late night that removes thousands of monsters from every monster's scan.
   - No unit becomes the monsters' during a step, so the answers are exactly the same.
2. **Flow fields are checked once, not by every monster.**
   - fieldFor remembers when it last confirmed a field, as the world's walk-map epoch and the building store's revision.
   - While neither has moved, the field is the same and the window and signature are not worked out again. Before, every monster did this every step.
   - The revision moves when a building is added or removed, or when an eliminated player's buildings change hands.
   - Each field also memoises its next step per tile, because the answer cannot change for the field's life.
3. **Coarse path tiles trust the epoch.** A coarse chunk confirmed at the current walk-map epoch is returned without reading nine chunk versions.
4. **The enclosure is reused.**
   - computeEnclosed runs once for each building that falls, then again after the step's deaths.
   - It now keeps its last answer with what it was worked out from: the walk-map epoch and the list of buildings that can be closed in, with their owners.
   - When neither has moved, it hands the same answer back.
5. **Target picking tests distance first.** pickTarget rules out units beyond reach before the hostility and harm checks, which are pure, so the order of the tests does not matter.

All of the caches above are "not state": they live beside the sim in WeakMaps keyed by the world, or on the building store, are never saved or hashed, and a loaded game starts with a fresh world and empty caches.

## Notes on the five areas

- **Instancing.**
  - Units, props, scenery, water cubes and buildings are instanced (InstancedModel and InstancedMesh in packages/client/src/world).
  - Each body or model is one draw call however many there are.
  - The unit view holds up to 2,048 instances per model. Monsters are drawn only where the player can see them, so the cap is far above any night seen in testing.
  - If a future change draws every unit everywhere, raise the cap or keep the nearest.
- **Flow fields.**
  - Monsters marching on a town share one field per player and mover class (combat/fields.ts), built by Dijkstra over 4-column coarse tiles round the town's goal buildings.
  - Breakers pay to go through walls, climbers to go over them, walkers to go round.
  - The field is rebuilt only when the walk map round the town changes (a wall breaks or is built). That rebuild is the main cost of a wall break after the enclosure flood.
  - Next step to cut it: rebuild only the coarse tiles round the columns that changed, not the nine chunks round them.
- **Chunk streaming.**
  - The sim generates chunks lazily when something looks at them, and caches walk maps per chunk version, keeping up to 1,024.
  - The client meshes explored chunks in mesh workers in rings round the camera focus: full detail within 2 chunks, half within 4, a quarter out to the view distance setting (7 by default). Farther chunks are dropped.
  - On the perf runs, chunk generation showed only at start-up, plus animal stocking when new land comes into sight.
- **Column meshing.**
  - The mesher (client/src/world/mesher.ts) draws only faces that touch air.
  - It merges neighbouring columns of the same material and height into one quad.
  - It runs off the main thread. A dug or built column re-meshes only its chunk.
- **Water.**
  - Water moves in the sim only near columns that changed (the world's active set), not over the whole map. A chunk whose water moved is re-meshed.
  - In the client, water is one transparent mesh per chunk, drawn after the land, with depth writes off.
  - Neither showed in any profile this milestone.
