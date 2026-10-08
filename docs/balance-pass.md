# Balance pass (milestone 10)

Jade is rebalancing everything after this milestone and replacing the tech pacing frame (2026-10-03). So this pass builds the balance harness as a tool, runs it once, and writes down what it measures. It retunes nothing.

- No (s) value changed: nothing broke a run outright, with no softlock, no unlock that cannot be reached and no crash.
- Every number the harness reads comes from the sim's data modules, which the balance editor imports and `balance:apply` writes. A change made in the editor shows up in the next harness run.

## How to run it

```
pnpm --filter @blockyrts/tools balance --pacing        # pacing and supply only, about a second
pnpm --filter @blockyrts/tools balance                 # plus every wave night, seeds 1 to 3, about 10 minutes
pnpm --filter @blockyrts/tools balance --nights 40,60 --seeds 1 [--csv out.csv]
```

`--csv` writes the wave rows to a file, relative to where the command was run.

## What it measures

### Pacing check (packages/tools/src/harness/pacing.ts)

This check works out the night each tech tier lands. It uses only the sim's tables:

- **Worker-seconds per resource:**
  - A raw resource costs its Table 5 node's time per load, a 20 s walk, and extra walking for things that lie far out.
  - A made resource costs its cheapest recipe.
- **Each tier's ladder:**
  - The main base levels, buildings and research it needs, and the first kits it arms.
  - The ladder's structure is listed in TIERS. Every cost, build time and research time comes from the sim.
- **The town:**
  - It starts with 4 workers and gains half a worker a day, up to 40.
  - It spends half its working day on the ladder.
  - These assumptions are the check's own (s), printed with the result.

It is an estimate of the same kind as the doc's Balance notes, not a played game. It answers whether a change moves a tier by a night or by ten.

### Supply at night 110

The night 110 town keeps 45 warriors, 6 mages, 52 workers and 2 Lodges, on a level 10 main base and 10 tier 3 crop fields. The check gives:

- the supply cap and how much is used;
- nutrition a day at 2 a unit;
- what one tier 3 wheat farmer makes as bread;
- the farmers needed, against the room on the fields.

### Wave versus defence (packages/tools/src/harness/defence.ts)

The check runs one real night of the sim per seed, at nights 0, 10, 20, 40, 60, 80 and 110, against the fixture town the Balance notes describe for that night:

- **Walls:** a ring of the night's wall material with a gate in the south side and towers at the corners.
- **Defenders:** warriors in the night's kit, plus crossbows and muskets with their ammunition. From night 60 there are cannons in Citadel ports.
- **Mages:** mages on the main base's parapets once it is level 3 or more. On the ground their Arcane bolt cannot clear the wall.
- **Night 0:** four workers who fight.

The scripted defence gives orders every half second:

1. Three free warriors go for each mob inside the ring, and for each flyer just outside it.
2. Two swords sally out to each archer standing off 2 to 44 columns out.
3. Spears and pikes stab over the wall from 3 columns inside, at whatever is chewing it.
4. Everyone else goes back to their post.

Columns in each row:

| Column | Meaning |
|---|---|
| budgetTenths / plannedTenths | Table 8 budget for the night, and what the spawner planned |
| mobs, mobsHp, killed, aliveAtDawn | The night's own monsters (lair dwellers and day creatures are left out; Morvath counts) |
| warriors, warriorsLost, mages, magesLost, workersLost | Defenders and losses |
| wallColumns, wallsLost, gaps | Wall and gate columns, how many broke, gaps left on purpose (none) |
| firstWallBreakS, firstInsideS | Seconds into the night of the first break and of the first walker inside (-1: never) |
| baseHpLostPct, bossKilled, bossHpPm | Main base damage; Morvath killed, or his health per mille at the end |
| boltsSpent, musketShots, cannonShots, gunpowderUsed | Ammunition used |
| outcome | held, breached (a wall or gate column broke), or lost (the main base fell or the game ended) |

## Results with the tables as they stand (2026-10-03)

### Pacing

| Tier | Target nights | Build ws | Material worker-s | Research s | Lands | Verdict |
|---|---|---|---|---|---|---|
| Bronze | 4 to 6 | 540 | 4,421 | 75 | 8 | late |
| Wrought iron, crossbows and mail | 13 to 18 | 2,920 | 16,244 | 90 | 22 | late |
| Steel | 25 to 30 | 2,700 | 23,402 | 150 | 34 | late |
| Muskets and cannons | 40 to 48 | 2,700 | 29,224 | 540 | 46 | on target |

Supply at night 110: 105 of 130 supply used. The town eats 210 nutrition a day; one tier 3 wheat farmer makes 30 as bread, so it needs 7 farmers and the fields have room for 40. **It carries.**

### Waves, seeds 1 to 3

| Night | Budget | Mobs (HP) | Defenders | Warriors lost | Others lost | Walls lost | Outcome |
|---|---|---|---|---|---|---|---|
| 0 | 12 | 12 (532) | 1 warrior, 4 workers | 0 | 1 worker on seed 1 | 0 | held ×3 |
| 10 | 46 | 13 to 18 (1,200 to 1,500) | 6 | 1 to 3 | 0 | 0 to 9 | held ×1, breached ×2 |
| 20 | 88 | 29 to 41 (about 2,200) | 14 | 0 to 1 | 0 | 0 | held ×3 |
| 40 | 196 | 24 to 29 (5,900 to 6,900) | 24, 3 mages | 1 to 8 | 0 | 0 | held ×3 |
| 60 | 336 | 60 to 90 (about 13,500) | 33, 4 mages, 2 cannons | 1 to 20 | 0 | 0 | held ×3 |
| 80 | 508 | 60 to 92 (about 20,000) | 45, 6 mages, 4 cannons | 2 to 7 | 1 mage each | 0 | held ×3 |
| 110 | 826 + Morvath | 63 to 90 (64,000 to 68,000) | 45, 6 mages, 4 cannons | 27 to 33 | 2 to 6 mages, 4 workers | 20 to 101 | lost ×3 |

`--csv` writes the full rows; re-run the harness for current numbers after any table change.

## Plainly off (observations for Jade's rebalance, nothing changed)

1. **Night 110 is lost on every seed.**
   - Walls first break 27 to 43 s in, and walkers are inside by 14 to 43 s.
   - Morvath ends at 60 to 70% health, and he deals the most damage of anything that night (2,300 to melee warriors on seed 1, with engines next).
   - Five or six warriors die in the first few seconds, and about ten more at once around 23 s.
   - The doc expected a night that is "beaten with losses on a good night".
2. **Bronze, wrought iron and steel land 2 to 4 nights late** in the pacing check with its (s) town. Muskets and cannons land on target. Jade is replacing this frame, so this is only a marker.
3. **Battle mages on the ground cannot shoot over a wall.** Arcane bolt flies flat, so a mage behind a wall walks out of the gate to find a shot and dies there. The harness puts mages on the main base's parapets. In play, a player who leaves them on the ground loses them.
4. **Skeleton archers stand off out of reach of a closed wall.**
   - Warriors on hold never answer them, so the harness sends two swords out.
   - A player who keeps the gate shut loses tower and wall health to them all night.
5. **Night 10 breaks the hardwood wall** on two seeds out of three (4 and 9 columns).
   - Most of the wall damage comes from bloated corpses chewing and bursting, and small slimes.
   - On seed 3, skeleton archers shooting from outside reach also do a lot of it.
   - The doc's night 10 note expected the hardwood wall to hold.
6. **Night 0:** a bat or the giant spider sometimes kills a worker on seed 1. The rest holds easily.
