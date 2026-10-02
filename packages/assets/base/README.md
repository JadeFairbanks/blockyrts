# Base bodies

The project's own base models, made by the project's model thread (not by the
outside modelling bot): `models/peoples/worker`, `warrior` and `mage`, each a
`.bbmodel` with its texture as `<id>.png`. They sit outside `src/` so the
modelling bot's asset pull requests never touch them, and they need no
`MANIFEST.md` row.

The model converter (`pnpm --filter @blockyrts/tools models:build`) reads both
`base/models/` and `src/models/` and checks the same rules for both.

## Clips and looks added on 2 October (for the milestones that use them)

All are made by the model thread's generator (`models/worker/source/` in the
project files: `main3.py`, then `clips5.py`, then `final5.py`).

Worker (`worker`), new hidden parts `iron_pick`, `spade` and `hammer` (show
them with the clip; a catalogue item can be attached at `slot_hand_r` instead):

| clip | length | plays | use |
|---|---|---|---|
| `mine` | 1.2 s | loop | pick swing onto rock at knee height, hit at 0.6 s (`iron_pick`) |
| `dig` | 1.8 s | loop | spade in, foot on it, lever, toss over the right shoulder (`spade`) |
| `build` | 0.8 s | loop | hammer blows at chest height, hit at 0.28 s; building and repairing (`hammer`) |
| `craft` | 1.2 s | loop | short taps at a workbench, then a look at the work (`hammer`) |
| `gather` | 1.6 s | loop | crouch, pick from the ground, put it in the other hand (no tool) |
| `prospect` | 2.4 s | loop | on one knee, two taps on the rock, then a chip held up to the eye (`hammer`, or the catalogue's `prospecting_hammer`) |
| `carry` | 1.2 s | loop | walking with a load hugged at `slot_carry` (chest) |
| `carry_shoulder` | 1.1 s | loop | walking with a log or beam on the right shoulder (`slot_shoulder_r`) |
| `harvest` | 1.2 s | loop | bent over, sickle sweeps through the crop at knee height, left hand gathering (catalogue sickle at `slot_hand_r`) |
| `pull_cart` | 1.2 s | loop | leaning forward, both hands on the shafts at hip height, slow steps |
| `stir` | 1.6 s | loop | stirring a pot at hip height in a circle, left hand steadying it (a ladle at `slot_hand_r`) |
| `light_torch` | 1.6 s | once | hand torch held up to the top of a torch post ahead from 0.5 s to 1.0 s, then lowered (`torch`) |
| `tame` | 2.0 s | loop | crouched low, a hand held out to an animal ahead, leaning slowly in and back |
| `cast_net` | 1.6 s | once | wind up to the right and throw a net with both hands, released at 0.7 s (the catalogue's net at `slot_hand_r`) |

Warrior (`warrior`), new hidden parts `rammer` and `linstock`:

| clip | length | plays | use |
|---|---|---|---|
| `cannon_load` | 2.4 s | once | two ramming strokes along the barrel ahead (`rammer`) |
| `cannon_aim` | 2.0 s | loop | crouched at the trail, sighting, shifting it |
| `cannon_fire` | 1.6 s | once | linstock to the touch hole; the shot goes off at 0.5 s; flinch and recover (`linstock`) |
| `cannon_push` | 1.4 s | loop | leaning into the wheels, slow heavy steps |
| `switch_weapon` | 0.8 s | once | hand to the right hip, draw into the one-handed guard; swap the item at 0.3 s |
| `ride_attack_1h` | 0.8 s | once | slash down from the saddle, hit at 0.45 s |
| `ride_attack_polearm` | 0.8 s | once | spear thrust down from the saddle, hit at 0.45 s |
| `ride_bow_shoot` | 1.5 s | loop | shooting from the saddle, release at 1.0 s |
| `ride_charge` | 0.6 s | loop | leaning forward at a gallop, spear couched, reins in the left hand |

The riding clips keep the legs of `ride`, so they all sit the same saddle.

Every human body (`worker`, `warrior`, `mage` and the twelve mage looks) also has:

| clip | length | plays | use |
|---|---|---|---|
| `swim` | 1.2 s | loop | breaststroke, body flat with the back at y = 0 (the water line), head up (the sim's Swim order) |
| `climb` | 1.2 s | loop | facing the wall ahead, hands and feet taking turns (the sim's Climb order; the sim moves the unit up) |

The worker body also carries the warrior's fighting clips (`guard_1h`,
`attack_1h_slash`, `attack_1h_stab`, `shield_block`, `guard_polearm`,
`attack_polearm_thrust`, `attack_polearm_swing`, `bow_shoot`,
`crossbow_shoot`, `crossbow_reload`, `musket_fire`, `musket_reload`,
`throw_spear`, `sling_throw`) and `switch_weapon`, since workers can equip
every weapon; they share the warrior's skeleton, so the same keys fit.

Mage looks: `mage_support_1` to `mage_support_6` and `mage_battle_1` to
`mage_battle_6`, one per rank (1 Novice Acolyte, 2 Acolyte, 3 Adept Acolyte,
4 Mage, 5 Master Mage, 6 Grand Magician). Same body, bones, slots and clips as
`mage`, with the rank's wand in hand. Support mages wear pale blue and white,
battle mages deep purple and ember red; novices wear undyed robes. Each rank
adds to the last: 2 a sash, 3 a collar, 4 a mantle and shoulder trim, 5 a cape
and clasp with gold trim, 6 a circlet with a glowing gem and a high collar. The
wand's gem grows and brightens with rank. `mage` stays as the plain body.

## Mage armour, rank marks and portraits (2 October, second round)

Mages wear the same armour slots as everyone, but their body is shorter and
narrower, so the catalogue's leather pieces float on them. These fit the mage
body and carry its skeleton, like the catalogue's armour models:

| model | fits | cubes |
|---|---|---|
| `models/items/armour_leather_mage` | cuirass over the robe, shoulders, a short skirt | 5 |
| `models/items/boots_mage` | both feet and shins | 4 |
| `models/items/helmet_leather_cap_mage` | leather cap and knot over the long hair | 2 |

Worker and warrior rank marks: bands round the left upper arm, carrying the
shared body's skeleton, shown over whatever armour is worn. Rank 1 has none.

| model | rank | look |
|---|---|---|
| `models/items/rank_mark_2` | 2 (Hand) | one bronze band |
| `models/items/rank_mark_3` | 3 (Master worker) | two bronze bands |
| `models/items/rank_mark_4` | 4 | two steel bands |
| `models/items/rank_mark_5` | 5 | three gold bands |

Portraits: `ui/portrait_mage_support_1.png` to `_6` and
`ui/portrait_mage_battle_1.png` to `_6`, 64 x 64, one per mage look, in the
style of the catalogue's portraits (`tools/portrait.py`). The catalogue's own
`portrait_mage_support` (green) and `portrait_mage_battle` (purple) predate the
looks; these are the ones that match them.
