# Asset manifest

One row per model file under `models/`. Cube counts include cubes hidden by default; texture sizes are the embedded texture (also committed as `<file>.png`), followed by any colour or material variants (`<file>_<variant>.png`, same UV layout). Each model's full notes (hit box, move speeds, key times, attachment points, second grip distances) are in its Blockbench description.

## peoples

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| halfling_male | models/peoples/halfling_male/halfling_male.bbmodel | 22 | 128x128 + 2 variants (brown, mustard) | 2 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| halfling_female | models/peoples/halfling_female/halfling_female.bbmodel | 25 | 128x128 + 2 variants (brown, mustard) | 2 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| halfling_spearman | models/peoples/halfling_spearman/halfling_spearman.bbmodel | 28 | 128x128 | held-item preview groups sit inside slot_hand_l, slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| halfling_archer | models/peoples/halfling_archer/halfling_archer.bbmodel | 32 | 128x128 | held-item preview groups sit inside slot_hand_l, slot_hip_l, slot_quiver (the game removes or swaps them; the slot pivots are unchanged) |
| halfling_buckler | models/peoples/halfling_equipment/halfling_buckler.bbmodel | 3 | 32x32 | one piece of the halfling_equipment set, in its folder |
| halfling_iron_cap | models/peoples/halfling_equipment/halfling_iron_cap.bbmodel | 2 | 32x32 | one piece of the halfling_equipment set, in its folder |
| halfling_shortbow | models/peoples/halfling_equipment/halfling_shortbow.bbmodel | 6 | 64x64 | one piece of the halfling_equipment set, in its folder |
| halfling_shortspear | models/peoples/halfling_equipment/halfling_shortspear.bbmodel | 3 | 64x64 | one piece of the halfling_equipment set, in its folder |
| halfling_shortsword | models/peoples/halfling_equipment/halfling_shortsword.bbmodel | 4 | 32x32 | one piece of the halfling_equipment set, in its folder |
| runkin_male | models/peoples/runkin_male/runkin_male.bbmodel | 31 | 128x128 + 2 variants (moss, ochre) | 5 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| runkin_female | models/peoples/runkin_female/runkin_female.bbmodel | 30 | 128x128 + 2 variants (moss, ochre) | 5 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| runkin_archer | models/peoples/runkin_archer/runkin_archer.bbmodel | 40 | 128x128 | held-item preview groups sit inside slot_hand_l, slot_hip_r (the game removes or swaps them; the slot pivots are unchanged) |
| runkin_clubber | models/peoples/runkin_clubber/runkin_clubber.bbmodel | 34 | 128x128 | 3 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| runkin_flint_spear | models/peoples/runkin_equipment/runkin_flint_spear.bbmodel | 3 | 128x64 | one piece of the runkin_equipment set, in its folder |
| runkin_hardwood_club | models/peoples/runkin_equipment/runkin_hardwood_club.bbmodel | 4 | 32x32 | one piece of the runkin_equipment set, in its folder |
| runkin_hide_quiver | models/peoples/runkin_equipment/runkin_hide_quiver.bbmodel | 2 | 32x32 | one piece of the runkin_equipment set, in its folder |
| runkin_recurve_bow | models/peoples/runkin_equipment/runkin_recurve_bow.bbmodel | 8 | 64x64 | one piece of the runkin_equipment set, in its folder |
| elf_villager | models/peoples/elf_villager/elf_villager.bbmodel | 30 | 128x128 + 3 variants (black, gold, silver) | held-item preview groups sit inside slot_hip_l (the game removes or swaps them; the slot pivots are unchanged) |
| elf_bladewarden | models/peoples/elf_bladewarden/elf_bladewarden.bbmodel | 37 | 128x128 + 3 variants (black, gold, silver) | the glaive dips about 4 u into the ground mid-fall in death (the final rest is exact); 2 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r, slot_hip_l (the game removes or swaps them; the slot pivots are unchanged) |
| elf_longbow_ranger | models/peoples/elf_longbow_ranger/elf_longbow_ranger.bbmodel | 38 | 128x128 + 3 variants (black, gold, silver) | held-item preview groups sit inside slot_hand_l, slot_quiver (the game removes or swaps them; the slot pivots are unchanged) |
| elf_grovesinger | models/peoples/elf_grovesinger/elf_grovesinger.bbmodel | 39 | 128x128 + 3 variants (black, gold, silver) | the robe dips up to 6 u into the ground while kneeling and up to 7 u mid-fall in death (the final rest is exact); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| elf_bear_rider | models/peoples/elf_bear_rider/elf_bear_rider.bbmodel | 37 | 128x128 + 3 variants (black, gold, silver) | the glaive dips into the ground mid-fall in death (the final rest is exact); 2 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r, slot_hip_l (the game removes or swaps them; the slot pivots are unchanged) |
| elf_war_bear | models/peoples/elf_war_bear/elf_war_bear.bbmodel | 28 | 128x256 + 2 variants (cub, elf_tamed_bear) | elf_tamed_bear is a texture variant (the game hides the `saddle` group) |
| dwarf_villager | models/peoples/dwarf_villager/dwarf_villager.bbmodel | 29 | 128x128 + 5 variants (black, brown, female, grey, red) | 2 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| dwarf_shieldbearer | models/peoples/dwarf_shieldbearer/dwarf_shieldbearer.bbmodel | 31 | 128x128 + 4 variants (black, brown, grey, red) | held-item preview groups sit inside slot_hand_r, slot_shield_l (the game removes or swaps them; the slot pivots are unchanged) |
| dwarf_hammerguard | models/peoples/dwarf_hammerguard/dwarf_hammerguard.bbmodel | 30 | 128x128 + 4 variants (black, brown, grey, red) | held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |
| dwarf_crossbowman | models/peoples/dwarf_crossbowman/dwarf_crossbowman.bbmodel | 29 | 128x128 + 4 variants (black, brown, grey, red) | held-item preview groups sit inside slot_hand_r, slot_hip_l, slot_hip_r (the game removes or swaps them; the slot pivots are unchanged) |
| dwarf_gunner | models/peoples/dwarf_gunner/dwarf_gunner.bbmodel | 29 | 128x128 + 4 variants (black, brown, grey, red) | held-item preview groups sit inside slot_hand_r, slot_hip_l (the game removes or swaps them; the slot pivots are unchanged) |
| dwarf_cannon_crew | models/peoples/dwarf_cannon_crew/dwarf_cannon_crew.bbmodel | 31 | 128x128 + 4 variants (black, brown, grey, red) | the rammer dips about 1 u into the ground in aim; 3 cubes hidden by default (game-swapped previews or alternates); held-item preview groups sit inside slot_hand_r (the game removes or swaps them; the slot pivots are unchanged) |

## animals

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| horse | models/animals/horse/horse.bbmodel | 25 | 128x256 + 5 variants (black, chestnut, foal, grey, wild) |  |
| horse_tack | models/animals/horse_tack/horse_tack.bbmodel | 15 | 64x128 + 4 variants (blue, green, plain, yellow) | a tack layer for the horse rig (same skeleton and clips as horse) |
| horse_harness | models/animals/horse_harness/horse_harness.bbmodel | 13 | 64x128 | 13 cubes: a harness layer for the horse rig, not a standalone animal (the 15-40 range does not apply) |
| ox | models/animals/ox/ox.bbmodel | 29 | 128x256 + 1 variants (young) |  |
| halfling_war_ox | models/animals/halfling_war_ox/halfling_war_ox.bbmodel | 38 | 128x256 + 1 variants (young) |  |
| cow | models/animals/cow/cow.bbmodel | 30 | 128x128 + 3 variants (black_white, calf, dun) | the calf texture still shows the horns (shared geometry) |
| bull | models/animals/bull/bull.bbmodel | 29 | 128x256 + 3 variants (black_white, calf, dun) | the calf texture still shows the horns (shared geometry) |
| chicken_hen | models/animals/chicken_hen/chicken_hen.bbmodel | 17 | 64x64 + 1 variants (chick) |  |
| chicken_rooster | models/animals/chicken_rooster/chicken_rooster.bbmodel | 19 | 64x64 |  |
| wolf | models/animals/wolf/wolf.bbmodel | 25 | 64x128 + 2 variants (runkin, young) |  |
| bear | models/animals/bear/bear.bbmodel | 22 | 128x256 + 1 variants (cub) |  |
| fish_trout | models/animals/fish_trout/fish_trout.bbmodel | 15 | 64x64 + 1 variants (young) |  |
| fish_salmon | models/animals/fish_salmon/fish_salmon.bbmodel | 16 | 64x64 + 1 variants (young) |  |
| fish_giant_catfish | models/animals/fish_giant_catfish/fish_giant_catfish.bbmodel | 17 | 64x128 + 1 variants (young) |  |
| hare | models/animals/hare/hare.bbmodel | 20 | 64x64 + 1 variants (young) |  |
| deer | models/animals/deer/deer.bbmodel | 30 | 128x128 + 2 variants (hind, young) | the game hides the `antlers` group for the deer_hind and deer_young textures |

## items

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| axe | models/items/axe/axe.bbmodel | 6 | 32x64 + 9 variants (bronze, copper, flint, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| axe_flint | models/items/axe/axe_flint.bbmodel | 6 | 32x64 | extra file in axe/: flint axe (knapped head lashed on) |
| axe_hardwood | models/items/axe/axe_hardwood.bbmodel | 4 | 32x32 | extra file in axe/: hardwood axe |
| digging_stick | models/items/digging_stick/digging_stick.bbmodel | 4 | 64x64 |  |
| mallet | models/items/mallet/mallet.bbmodel | 4 | 32x32 |  |
| pick | models/items/pick/pick.bbmodel | 7 | 32x64 + 8 variants (bronze, copper, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| pick_flint | models/items/pick/pick_flint.bbmodel | 6 | 32x64 | extra file in pick/: flint pick |
| knife | models/items/knife/knife.bbmodel | 5 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sickle | models/items/sickle/sickle.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| saw | models/items/saw/saw.bbmodel | 6 | 64x32 + 6 variants (bronze, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| hoe | models/items/hoe/hoe.bbmodel | 3 | 64x64 + 8 variants (bronze, copper, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| plough | models/items/plough/plough.bbmodel | 13 | 64x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | 13 cubes (small-item cap 11): two handles, beam, share, mouldboard, landside and hitch ring each need their own cube; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| fishing_rod | models/items/fishing_rod/fishing_rod.bbmodel | 6 | 64x32 |  |
| fishing_net | models/items/fishing_net/fishing_net.bbmodel | 5 | 32x32 + 1 variants (open) |  |
| fishing_net_open | models/items/fishing_net/fishing_net_open.bbmodel | 7 | 128x256 | extra file in fishing_net/: net spread open |
| prospecting_hammer | models/items/prospecting_hammer/prospecting_hammer.bbmodel | 5 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| club | models/items/club/club.bbmodel | 6 | 32x32 |  |
| axe_war | models/items/axe_war/axe_war.bbmodel | 7 | 32x64 + 2 variants (copper, flint) |  |
| axe_war_flint | models/items/axe_war/axe_war_flint.bbmodel | 7 | 32x64 | extra file in axe_war/: flint war axe |
| dagger | models/items/dagger/dagger.bbmodel | 6 | 32x32 + 1 variants (copper) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword_short | models/items/sword_short/sword_short.bbmodel | 7 | 32x32 + 1 variants (bronze) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword | models/items/sword/sword.bbmodel | 6 | 32x32 + 4 variants (iron_bloom, iron_refined, iron_wrought, steel) |  |
| sword_steel | models/items/sword/sword_steel.bbmodel | 7 | 32x64 + 2 variants (hq_steel, steel) | extra file in sword/: steel sword (different blade); adds an hq_steel (high-quality steel) texture wherever steel is listed |
| mace | models/items/mace/mace.bbmodel | 7 | 32x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| spear | models/items/spear/spear.bbmodel | 6 | 128x128 + 3 variants (bronze, flint, hardwood) |  |
| spear_flint | models/items/spear/spear_flint.bbmodel | 5 | 128x128 | extra file in spear/: flint spear |
| spear_hardwood | models/items/spear/spear_hardwood.bbmodel | 4 | 128x128 | extra file in spear/: fire-hardened wooden spear |
| pike | models/items/pike/pike.bbmodel | 7 | 256x128 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| halberd | models/items/halberd/halberd.bbmodel | 9 | 128x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| sling | models/items/sling/sling.bbmodel | 5 | 32x32 | texture padded from 16x32 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| javelin | models/items/javelin/javelin.bbmodel | 5 | 64x64 + 2 variants (bronze, flint) |  |
| javelin_flint | models/items/javelin/javelin_flint.bbmodel | 4 | 64x64 | extra file in javelin/: flint javelin |
| bow | models/items/bow/bow.bbmodel | 8 | 64x64 |  |
| crossbow | models/items/crossbow/crossbow.bbmodel | 10 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| crossbow_steel | models/items/crossbow_steel/crossbow_steel.bbmodel | 11 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| musket | models/items/musket/musket.bbmodel | 11 | 64x64 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| arrow | models/items/arrow/arrow.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt | models/items/bolt/bolt.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| arrow_poison | models/items/arrow_poison/arrow_poison.bbmodel | 7 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt_poison | models/items/bolt_poison/bolt_poison.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| quiver | models/items/quiver/quiver.bbmodel | 7 | 32x32 + 1 variants (empty) |  |
| quiver_empty | models/items/quiver/quiver_empty.bbmodel | 4 | 32x32 | extra file in quiver/: empty quiver |
| bolt_case | models/items/bolt_case/bolt_case.bbmodel | 4 | 32x32 + 1 variants (empty) |  |
| bolt_case_empty | models/items/bolt_case/bolt_case_empty.bbmodel | 3 | 32x32 | extra file in bolt_case/: empty bolt case |
| powder_horn | models/items/powder_horn/powder_horn.bbmodel | 9 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| lead_shot_pouch | models/items/lead_shot_pouch/lead_shot_pouch.bbmodel | 4 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| arrow_bundle | models/items/arrow_bundle/arrow_bundle.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt_bundle | models/items/bolt_bundle/bolt_bundle.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| javelin_bundle | models/items/javelin_bundle/javelin_bundle.bbmodel | 8 | 64x64 + 2 variants (bronze, flint) |  |
| cannonball_stack | models/items/cannonball_stack/cannonball_stack.bbmodel | 10 | 32x32 + 2 variants (iron, stone) |  |
| shield_bronze | models/items/shield_bronze/shield_bronze.bbmodel | 8 | 64x64 |  |
| shield_wicker | models/items/shield_wicker/shield_wicker.bbmodel | 6 | 64x64 |  |
| shield_wood | models/items/shield_wood/shield_wood.bbmodel | 8 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| shield_iron_kite | models/items/shield_iron_kite/shield_iron_kite.bbmodel | 9 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| shield_steel_heater | models/items/shield_steel_heater/shield_steel_heater.bbmodel | 7 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| armour_leather | models/items/armour_leather/armour_leather.bbmodel | 8 | 64x64 |  |
| armour_bronze_scale | models/items/armour_bronze_scale/armour_bronze_scale.bbmodel | 8 | 64x64 |  |
| armour_iron_mail | models/items/armour_iron_mail/armour_iron_mail.bbmodel | 10 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| armour_steel_plate | models/items/armour_steel_plate/armour_steel_plate.bbmodel | 18 | 64x128 + 2 variants (hq_steel, steel) | 18 cubes (small-item cap 11): a full plate layer needs shells on every limb bone of the rig; worn on the rig, not a loose item; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| boots | models/items/boots/boots.bbmodel | 4 | 64x64 + 2 variants (flax, leather) |  |
| helmet_leather_cap | models/items/helmet_leather_cap/helmet_leather_cap.bbmodel | 4 | 64x32 |  |
| helmet_bronze | models/items/helmet_bronze/helmet_bronze.bbmodel | 6 | 64x32 |  |
| helmet_iron_nasal | models/items/helmet_iron_nasal/helmet_iron_nasal.bbmodel | 5 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| helmet_steel_sallet | models/items/helmet_steel_sallet/helmet_steel_sallet.bbmodel | 5 | 64x32 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| wand | models/items/wand/wand.bbmodel | 2 | 32x32 + 5 variants (acolyte, adept_acolyte, grand_magician, mage, master_mage) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_acolyte | models/items/wand/wand_acolyte.bbmodel | 3 | 32x32 | extra file in wand/: Acolyte rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_adept_acolyte | models/items/wand/wand_adept_acolyte.bbmodel | 6 | 32x32 | extra file in wand/: Adept Acolyte rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_grand_magician | models/items/wand/wand_grand_magician.bbmodel | 10 | 32x32 | extra file in wand/: Grand Magician rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_mage | models/items/wand/wand_mage.bbmodel | 6 | 32x32 | extra file in wand/: Mage rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| wand_master_mage | models/items/wand/wand_master_mage.bbmodel | 7 | 32x32 | extra file in wand/: Master Mage rank wand; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_token | models/items/trinket_token/trinket_token.bbmodel | 5 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_charm | models/items/trinket_charm/trinket_charm.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_brooch | models/items/trinket_brooch/trinket_brooch.bbmodel | 10 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| trinket_heirloom | models/items/trinket_heirloom/trinket_heirloom.bbmodel | 11 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| trinket_moonleaf | models/items/trinket_moonleaf/trinket_moonleaf.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| trinket_sunheart | models/items/trinket_sunheart/trinket_sunheart.bbmodel | 8 | 32x32 + 7 variants (bronze, copper, gold, iron, silver, steel, tin) |  |
| log_softwood | models/items/log_softwood/log_softwood.bbmodel | 4 | 64x128 |  |
| log_hardwood | models/items/log_hardwood/log_hardwood.bbmodel | 4 | 64x128 |  |
| sticks_bundle | models/items/sticks_bundle/sticks_bundle.bbmodel | 8 | 64x64 |  |
| stone_chunk | models/items/stone_chunk/stone_chunk.bbmodel | 3 | 32x32 |  |
| flint_nodule | models/items/flint_nodule/flint_nodule.bbmodel | 3 | 32x32 |  |
| coal_lump | models/items/coal_lump/coal_lump.bbmodel | 3 | 32x32 |  |
| marble_block | models/items/marble_block/marble_block.bbmodel | 2 | 32x32 |  |
| clay_lump | models/items/clay_lump/clay_lump.bbmodel | 3 | 32x32 |  |
| sand_sack | models/items/sand_sack/sand_sack.bbmodel | 7 | 32x32 |  |
| gravel_sack | models/items/gravel_sack/gravel_sack.bbmodel | 7 | 32x32 |  |
| earth_sack | models/items/earth_sack/earth_sack.bbmodel | 7 | 32x32 |  |
| ore_copper | models/items/ore_copper/ore_copper.bbmodel | 3 | 32x32 |  |
| ore_tin | models/items/ore_tin/ore_tin.bbmodel | 3 | 32x32 |  |
| ore_bog_iron | models/items/ore_bog_iron/ore_bog_iron.bbmodel | 3 | 32x32 |  |
| ore_iron_rock | models/items/ore_iron_rock/ore_iron_rock.bbmodel | 3 | 32x32 |  |
| ore_vein_iron | models/items/ore_vein_iron/ore_vein_iron.bbmodel | 3 | 32x32 |  |
| ore_lead | models/items/ore_lead/ore_lead.bbmodel | 3 | 32x32 |  |
| ore_silver | models/items/ore_silver/ore_silver.bbmodel | 3 | 32x32 |  |
| gold_nugget | models/items/gold_nugget/gold_nugget.bbmodel | 2 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| gem_emerald | models/items/gem_emerald/gem_emerald.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| gem_ruby | models/items/gem_ruby/gem_ruby.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| gem_diamond | models/items/gem_diamond/gem_diamond.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| mana_crystal | models/items/mana_crystal/mana_crystal.bbmodel | 4 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sulphur_lump | models/items/sulphur_lump/sulphur_lump.bbmodel | 3 | 32x32 |  |
| saltpetre_lump | models/items/saltpetre_lump/saltpetre_lump.bbmodel | 3 | 32x32 |  |
| ingot_copper | models/items/ingot_copper/ingot_copper.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_tin | models/items/ingot_tin/ingot_tin.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_bronze | models/items/ingot_bronze/ingot_bronze.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_pig_iron | models/items/ingot_pig_iron/ingot_pig_iron.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_iron | models/items/ingot_iron/ingot_iron.bbmodel | 12 | 64x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) | textures are the iron grades (bloom, wrought, refined); 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_steel | models/items/ingot_steel/ingot_steel.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| ingot_hq_steel | models/items/ingot_hq_steel/ingot_hq_steel.bbmodel | 12 | 64x64 | 12 cubes (small-item cap 11): a 3/2/1 ground stack of six ingots, two cubes each |
| herb_bundle | models/items/herb_bundle/herb_bundle.bbmodel | 6 | 32x32 |  |
| flax_bundle | models/items/flax_bundle/flax_bundle.bbmodel | 4 | 64x64 |  |
| wheat_sheaf | models/items/wheat_sheaf/wheat_sheaf.bbmodel | 5 | 64x64 |  |
| potato_sack | models/items/potato_sack/potato_sack.bbmodel | 9 | 32x32 |  |
| carrot_bunch | models/items/carrot_bunch/carrot_bunch.bbmodel | 10 | 32x32 |  |
| corn_bundle | models/items/corn_bundle/corn_bundle.bbmodel | 8 | 32x32 |  |
| meat_haunch | models/items/meat_haunch/meat_haunch.bbmodel | 6 | 32x32 |  |
| hide_rolled | models/items/hide_rolled/hide_rolled.bbmodel | 5 | 64x32 |  |
| fish_carried | models/items/fish_carried/fish_carried.bbmodel | 7 | 32x32 + 2 variants (catfish, salmon) |  |
| fish_carried_catfish | models/items/fish_carried/fish_carried_catfish.bbmodel | 9 | 128x64 | extra file in fish_carried/: giant catfish version (carried over the shoulder) |
| fish_carried_salmon | models/items/fish_carried/fish_carried_salmon.bbmodel | 8 | 32x64 | extra file in fish_carried/: salmon version |
| egg_basket | models/items/egg_basket/egg_basket.bbmodel | 11 | 32x32 |  |
| feather_bundle | models/items/feather_bundle/feather_bundle.bbmodel | 9 | 32x32 |  |
| sinew_bundle | models/items/sinew_bundle/sinew_bundle.bbmodel | 5 | 32x32 |  |
| bone_bundle | models/items/bone_bundle/bone_bundle.bbmodel | 11 | 64x32 |  |
| spider_silk | models/items/spider_silk/spider_silk.bbmodel | 6 | 32x32 |  |
| demon_horn | models/items/demon_horn/demon_horn.bbmodel | 7 | 32x32 |  |
| venom_vial | models/items/venom_vial/venom_vial.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| hexstone | models/items/hexstone/hexstone.bbmodel | 7 | 32x32 | built about 8 cm across instead of the 4 cm in the brief so it reads at game zoom; texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| planks | models/items/planks/planks.bbmodel | 6 | 128x64 |  |
| stone_blocks | models/items/stone_blocks/stone_blocks.bbmodel | 2 | 32x32 |  |
| bricks | models/items/bricks/bricks.bbmodel | 6 | 32x32 |  |
| charcoal_sack | models/items/charcoal_sack/charcoal_sack.bbmodel | 6 | 32x32 |  |
| gunpowder_keg | models/items/gunpowder_keg/gunpowder_keg.bbmodel | 6 | 64x32 |  |
| glass_bottle | models/items/glass_bottle/glass_bottle.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| rope_coil | models/items/rope_coil/rope_coil.bbmodel | 6 | 32x32 |  |
| resin_pot | models/items/resin_pot/resin_pot.bbmodel | 8 | 32x32 |  |
| leather_folded | models/items/leather_folded/leather_folded.bbmodel | 4 | 32x32 |  |
| bread_loaf | models/items/bread_loaf/bread_loaf.bbmodel | 2 | 32x32 |  |
| roast_meat | models/items/roast_meat/roast_meat.bbmodel | 4 | 32x32 |  |
| roast_fish | models/items/roast_fish/roast_fish.bbmodel | 4 | 32x32 |  |
| smoked_meat | models/items/smoked_meat/smoked_meat.bbmodel | 5 | 32x32 |  |
| smoked_fish | models/items/smoked_fish/smoked_fish.bbmodel | 7 | 32x32 |  |
| salted_meat_barrel | models/items/salted_meat_barrel/salted_meat_barrel.bbmodel | 9 | 64x32 |  |
| salted_fish_barrel | models/items/salted_fish_barrel/salted_fish_barrel.bbmodel | 15 | 64x32 | 15 cubes (small-item cap 11): staves, hoops and lid plus the fish tails showing, as described |
| stew_pot | models/items/stew_pot/stew_pot.bbmodel | 13 | 32x32 | 13 cubes (small-item cap 11): pot, rim, legs, bail handle, stew surface and carrot chunks |
| pie | models/items/pie/pie.bbmodel | 4 | 32x32 |  |
| bandage_roll | models/items/bandage_roll/bandage_roll.bbmodel | 3 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| healing_remedy | models/items/healing_remedy/healing_remedy.bbmodel | 4 | 32x32 | texture padded from 16x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |

## mechanical

| id | path | cube count | texture size | deviation and reason |
|---|---|---|---|---|
| cannon_bronze | models/mechanical/cannon_bronze/cannon_bronze.bbmodel | 52 | 256x128 | extra clips move_towed and aim; fire ends recoiled, so reload must follow; slot_hitch at the trail eye (+Z, towed trail-first); spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| cannon_iron | models/mechanical/cannon_iron/cannon_iron.bbmodel | 50 | 256x128 | extra clips move_towed and aim; fire ends recoiled, so reload must follow; slot_hitch at the trail eye (+Z, towed trail-first); spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| cannon_rammer | models/mechanical/cannon_rammer/cannon_rammer.bbmodel | 4 | 64x64 + 1 variants (ladle) | the rammer and the sponge/ladle are two files in this folder (see cannon_rammer_ladle) |
| cannon_rammer_ladle | models/mechanical/cannon_rammer/cannon_rammer_ladle.bbmodel | 6 | 64x64 | one piece of the cannon_rammer set, in its folder; extra file in cannon_rammer/: the powder ladle and sponge end |
| cannon_dwarf | models/mechanical/cannon_dwarf/cannon_dwarf.bbmodel | 51 | 256x128 | extra clips move_towed and aim; fire ends recoiled, so reload must follow; slot_hitch at the trail eye (+Z, towed trail-first); spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| catapult | models/mechanical/catapult/catapult.bbmodel | 59 | 256x256 | fire ends with the arm up, so reload must follow; in destroyed the broken tongue dips slightly into the ground |
| ballista | models/mechanical/ballista/ballista.bbmodel | 53 | 256x256 | extra clip move_towed; fire ends released, so reload must follow; ballista_bolt is section H and comes later (slot_bolt is ready); slot_hitch at the trail (+Z); in destroyed the trail shoe dips slightly into the ground; spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| cart_hand | models/mechanical/cart_hand/cart_hand.bbmodel | 24 | 128x128 | slot_hitch at the handle grips (+Z): it is pushed, not pulled |
| cart_ox | models/mechanical/cart_ox/cart_ox.bbmodel | 67 | 256x256 | 67 cubes: the wishlist sets no vehicle budget (above the 60 big-monster cap); the four spoked wheels are 13 cubes each; spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| elf_caravan_wagon | models/mechanical/elf_caravan_wagon/elf_caravan_wagon.bbmodel | 100 | 256x512 | 100 cubes: no vehicle budget in the wishlist; four wheels (44 cubes), carved trim, canopy and stall goods; `open` is its use clip (key 1.5 s); destroyed slumps about 15 degrees onto the broken wheels |
| dwarf_sled | models/mechanical/dwarf_sled/dwarf_sled.bbmodel | 58 | 256x512 | move is a drag (no wheels) |

## textures

Terrain textures (wishlist section I), one PNG per file id. Top tiles may be rotated and mixed freely unless a row says otherwise.

| id | path | frames | size | notes, deviations and reasons |
|---|---|---|---|---|
| deadlands_volcanic_glow | textures/deadlands_volcanic_glow.png | 1 | 80x16 | size 80x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); glow masks (crack pixels only) for top_1, top_2, top_3, top_4 and side, as one 80 x 16 strip of 16 x 16 cells |
| terrain_barrens_ground_side | textures/terrain_barrens_ground_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_barrens_ground_top_1 | textures/terrain_barrens_ground_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_barrens_ground_top_2 | textures/terrain_barrens_ground_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_barrens_ground_top_3 | textures/terrain_barrens_ground_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_barrens_ground_top_4 | textures/terrain_barrens_ground_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_barrens_rock_side | textures/terrain_barrens_rock_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_barrens_rock_top_1 | textures/terrain_barrens_rock_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_barrens_rock_top_2 | textures/terrain_barrens_rock_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_barrens_rock_top_3 | textures/terrain_barrens_rock_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_barrens_rock_top_4 | textures/terrain_barrens_rock_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_clay_side | textures/terrain_clay_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_clay_top_1 | textures/terrain_clay_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_clay_top_2 | textures/terrain_clay_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_clay_top_3 | textures/terrain_clay_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_clay_top_4 | textures/terrain_clay_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_deadlands_ash_side | textures/terrain_deadlands_ash_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_deadlands_ash_top_1 | textures/terrain_deadlands_ash_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_deadlands_ash_top_2 | textures/terrain_deadlands_ash_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_deadlands_ash_top_3 | textures/terrain_deadlands_ash_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_deadlands_ash_top_4 | textures/terrain_deadlands_ash_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_deadlands_volcanic_side | textures/terrain_deadlands_volcanic_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_deadlands_volcanic_top_1 | textures/terrain_deadlands_volcanic_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_deadlands_volcanic_top_2 | textures/terrain_deadlands_volcanic_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_deadlands_volcanic_top_3 | textures/terrain_deadlands_volcanic_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_deadlands_volcanic_top_4 | textures/terrain_deadlands_volcanic_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_forest_floor_side | textures/terrain_forest_floor_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_forest_floor_side_top | textures/terrain_forest_floor_side_top.png | 1 | 16x4 | size 16x4 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); 16 x 4 lip for the top step of a side (transparent under the hanging blades) |
| terrain_forest_floor_top_1 | textures/terrain_forest_floor_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_forest_floor_top_2 | textures/terrain_forest_floor_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_forest_floor_top_3 | textures/terrain_forest_floor_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_forest_floor_top_4 | textures/terrain_forest_floor_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_grass_fringe_side | textures/terrain_grass_fringe_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_grass_fringe_side_top | textures/terrain_grass_fringe_side_top.png | 1 | 16x4 | size 16x4 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); 16 x 4 lip for the top step of a side (transparent under the hanging blades) |
| terrain_grass_fringe_top_1 | textures/terrain_grass_fringe_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_grass_fringe_top_2 | textures/terrain_grass_fringe_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_grass_fringe_top_3 | textures/terrain_grass_fringe_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_grass_fringe_top_4 | textures/terrain_grass_fringe_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_grass_heartland_side | textures/terrain_grass_heartland_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_grass_heartland_side_top | textures/terrain_grass_heartland_side_top.png | 1 | 16x4 | size 16x4 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); 16 x 4 lip for the top step of a side (transparent under the hanging blades) |
| terrain_grass_heartland_top_1 | textures/terrain_grass_heartland_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_grass_heartland_top_2 | textures/terrain_grass_heartland_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_grass_heartland_top_3 | textures/terrain_grass_heartland_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_grass_heartland_top_4 | textures/terrain_grass_heartland_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_gravel_side | textures/terrain_gravel_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_gravel_top_1 | textures/terrain_gravel_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_gravel_top_2 | textures/terrain_gravel_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_gravel_top_3 | textures/terrain_gravel_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_gravel_top_4 | textures/terrain_gravel_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_marble_side | textures/terrain_marble_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_marble_top_1 | textures/terrain_marble_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_marble_top_2 | textures/terrain_marble_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_marble_top_3 | textures/terrain_marble_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_marble_top_4 | textures/terrain_marble_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_mud_bog_side | textures/terrain_mud_bog_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_mud_bog_top_1 | textures/terrain_mud_bog_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_mud_bog_top_2 | textures/terrain_mud_bog_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_mud_bog_top_3 | textures/terrain_mud_bog_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_mud_bog_top_4 | textures/terrain_mud_bog_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_path_side | textures/terrain_path_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_path_top_1 | textures/terrain_path_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_path_top_2 | textures/terrain_path_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature); grassy edge along row 0: rotate it to face the grass |
| terrain_path_top_3 | textures/terrain_path_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature); grassy edge along row 0: rotate it to face the grass |
| terrain_path_top_4 | textures/terrain_path_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature); grassy edge along row 0: rotate it to face the grass |
| terrain_preview | textures/terrain_preview.png | 1 | 256x256 | 256 x 256 check sheet: a patch of each material over a two-step cliff |
| terrain_rock_coal_seam_side | textures/terrain_rock_coal_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_coal_seam_top_1 | textures/terrain_rock_coal_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_coal_seam_top_2 | textures/terrain_rock_coal_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_coal_seam_top_3 | textures/terrain_rock_coal_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_coal_seam_top_4 | textures/terrain_rock_coal_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_copper_seam_side | textures/terrain_rock_copper_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_copper_seam_top_1 | textures/terrain_rock_copper_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_copper_seam_top_2 | textures/terrain_rock_copper_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_copper_seam_top_3 | textures/terrain_rock_copper_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_copper_seam_top_4 | textures/terrain_rock_copper_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_flint_chalk_side | textures/terrain_rock_flint_chalk_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_flint_chalk_top_1 | textures/terrain_rock_flint_chalk_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_flint_chalk_top_2 | textures/terrain_rock_flint_chalk_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_flint_chalk_top_3 | textures/terrain_rock_flint_chalk_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_flint_chalk_top_4 | textures/terrain_rock_flint_chalk_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_gold_seam_side | textures/terrain_rock_gold_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_gold_seam_top_1 | textures/terrain_rock_gold_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_gold_seam_top_2 | textures/terrain_rock_gold_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_gold_seam_top_3 | textures/terrain_rock_gold_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_gold_seam_top_4 | textures/terrain_rock_gold_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_iron_seam_side | textures/terrain_rock_iron_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_iron_seam_top_1 | textures/terrain_rock_iron_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_iron_seam_top_2 | textures/terrain_rock_iron_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_iron_seam_top_3 | textures/terrain_rock_iron_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_iron_seam_top_4 | textures/terrain_rock_iron_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_lead_seam_side | textures/terrain_rock_lead_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_lead_seam_top_1 | textures/terrain_rock_lead_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_lead_seam_top_2 | textures/terrain_rock_lead_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_lead_seam_top_3 | textures/terrain_rock_lead_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_lead_seam_top_4 | textures/terrain_rock_lead_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_saltpetre_side | textures/terrain_rock_saltpetre_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_saltpetre_top_1 | textures/terrain_rock_saltpetre_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_saltpetre_top_2 | textures/terrain_rock_saltpetre_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_saltpetre_top_3 | textures/terrain_rock_saltpetre_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_saltpetre_top_4 | textures/terrain_rock_saltpetre_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_tin_seam_side | textures/terrain_rock_tin_seam_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_tin_seam_top_1 | textures/terrain_rock_tin_seam_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_tin_seam_top_2 | textures/terrain_rock_tin_seam_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_tin_seam_top_3 | textures/terrain_rock_tin_seam_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_tin_seam_top_4 | textures/terrain_rock_tin_seam_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_rock_vein_iron_side | textures/terrain_rock_vein_iron_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_rock_vein_iron_top_1 | textures/terrain_rock_vein_iron_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_rock_vein_iron_top_2 | textures/terrain_rock_vein_iron_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_rock_vein_iron_top_3 | textures/terrain_rock_vein_iron_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_rock_vein_iron_top_4 | textures/terrain_rock_vein_iron_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_sand_side | textures/terrain_sand_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_sand_top_1 | textures/terrain_sand_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_sand_top_2 | textures/terrain_sand_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_sand_top_3 | textures/terrain_sand_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_sand_top_4 | textures/terrain_sand_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_soil_side | textures/terrain_soil_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_soil_tilled_side | textures/terrain_soil_tilled_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_soil_tilled_top_1 | textures/terrain_soil_tilled_top_1.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 1 (plain base) |
| terrain_soil_tilled_top_2 | textures/terrain_soil_tilled_top_2.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 2 (one small feature) |
| terrain_soil_tilled_top_3 | textures/terrain_soil_tilled_top_3.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 3 (one small feature) |
| terrain_soil_tilled_top_4 | textures/terrain_soil_tilled_top_4.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 4 (one small feature) |
| terrain_soil_tilled_wet_side | textures/terrain_soil_tilled_wet_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_soil_tilled_wet_top_1 | textures/terrain_soil_tilled_wet_top_1.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 1 (plain base) |
| terrain_soil_tilled_wet_top_2 | textures/terrain_soil_tilled_wet_top_2.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 2 (one small feature) |
| terrain_soil_tilled_wet_top_3 | textures/terrain_soil_tilled_wet_top_3.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 3 (one small feature) |
| terrain_soil_tilled_wet_top_4 | textures/terrain_soil_tilled_wet_top_4.png | 1 | 16x16 | Deviation: the furrows run along X, so this top may only be rotated by 180 degrees (the wishlist asks for any rotation, which straight furrows cannot allow); top tile, variant 4 (one small feature) |
| terrain_soil_top_1 | textures/terrain_soil_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_soil_top_2 | textures/terrain_soil_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_soil_top_3 | textures/terrain_soil_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_soil_top_4 | textures/terrain_soil_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_stone_side | textures/terrain_stone_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_stone_top_1 | textures/terrain_stone_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_stone_top_2 | textures/terrain_stone_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_stone_top_3 | textures/terrain_stone_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_stone_top_4 | textures/terrain_stone_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| terrain_sulphur_crust_side | textures/terrain_sulphur_crust_side.png | 1 | 16x16 | side tile, tiles vertically; features kept inside the 4 px step bands |
| terrain_sulphur_crust_top_1 | textures/terrain_sulphur_crust_top_1.png | 1 | 16x16 | top tile, variant 1 (plain base) |
| terrain_sulphur_crust_top_2 | textures/terrain_sulphur_crust_top_2.png | 1 | 16x16 | top tile, variant 2 (one small feature) |
| terrain_sulphur_crust_top_3 | textures/terrain_sulphur_crust_top_3.png | 1 | 16x16 | top tile, variant 3 (one small feature) |
| terrain_sulphur_crust_top_4 | textures/terrain_sulphur_crust_top_4.png | 1 | 16x16 | top tile, variant 4 (one small feature) |
| water_bog_anim | textures/water_bog_anim.png | 8 | 128x16 | 8 frames of 16 x 16, 6 fps loop |
| water_deep_anim | textures/water_deep_anim.png | 8 | 128x16 | 8 frames of 16 x 16, 6 fps loop; solid |
| water_edge_foam | textures/water_edge_foam.png | 8 | 128x4 | size 128x4 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); shore foam, 8 frames of 16 x 4, 6 fps loop |
| water_shallow_anim | textures/water_shallow_anim.png | 8 | 128x16 | 8 frames of 16 x 16, 6 fps loop; alpha 153 (60%) |
| water_stream_anim | textures/water_stream_anim.png | 8 | 128x16 | 8 frames of 16 x 16, 6 fps loop; ripples drift along +X 2 px per frame |

## effects

Effect sprite strips, hit particles and order markers (section J). Frames run left to right; frame size, count and fps are in each row and in the PNG tEXt Comment.

| id | path | frames | size | notes, deviations and reasons |
|---|---|---|---|---|
| fx_cannon_flash | effects/fx_cannon_flash.png | 4 | 128x32 | fx_cannon_flash: 4 frames of 32 x 32 left to right, 10 fps, play once. Larger cannon flash and grey-white smoke cloud. Muzzle at the left-centre. |
| fx_dust | effects/fx_dust.png | 5 | 80x16 | size 80x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_dust: 5 frames of 16 x 16 left to right, 10 fps, play once. Brown-grey dust burst: digging, big footsteps, construction. |
| fx_dust_white | effects/fx_dust_white.png | 5 | 80x16 | size 80x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_dust_white: 5 frames of 16 x 16 left to right, 10 fps, play once. White version of fx_dust for tinting. |
| fx_embers | effects/fx_embers.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_embers: 6 frames of 16 x 16 left to right, 8 fps, loop. Tiny orange sparks rising (loops seamlessly: sparks wrap from top to bottom). |
| fx_explosion | effects/fx_explosion.png | 8 | 256x32 | fx_explosion: 8 frames of 32 x 32 left to right, 12 fps, play once. Fireball with debris and black smoke: exploding creatures, bombs, gunpowder. |
| fx_explosion_green | effects/fx_explosion_green.png | 8 | 256x32 | fx_explosion_green: 8 frames of 32 x 32 left to right, 12 fps, play once. Sick yellow-green burst for a bursting plague corpse. |
| fx_fire_large | effects/fx_fire_large.png | 8 | 256x32 | fx_fire_large: 8 frames of 32 x 32 left to right, 10 fps, loop. Big fire for burning buildings and fire breath. Anchor at the bottom centre. |
| fx_flame | effects/fx_flame.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_flame: 6 frames of 16 x 16 left to right, 10 fps, loop. Torches, campfires, braziers, burning buildings: yellow core, orange, red tips. Anchor at the bottom centre. |
| fx_fog | effects/fx_fog.png | 1 | 32x32 | fx_fog: 1 frames of 32 x 32 left to right, 1 fps, play once. A soft patch of pale grey-blue fog built from an ordered (Bayer) dither, no alpha gradients. The game layers many of them. |
| fx_level_up | effects/fx_level_up.png | 8 | 256x32 | fx_level_up: 8 frames of 32 x 32 left to right, 10 fps, play once. A ring of gold light rising round a unit when it gains a rank (anchor at the unit's feet, bottom centre). |
| fx_magic_blue | effects/fx_magic_blue.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_blue: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for haste. Loops. |
| fx_magic_gold | effects/fx_magic_gold.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_gold: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for protection and rallying. Loops. |
| fx_magic_green | effects/fx_magic_green.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_green: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for healing. Loops. |
| fx_magic_hex | effects/fx_magic_hex.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_hex: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for goblin hexes (dirty green). Loops. |
| fx_magic_violet | effects/fx_magic_violet.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_violet: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for battle magic. Loops. |
| fx_magic_void | effects/fx_magic_void.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_magic_void: 6 frames of 16 x 16 left to right, 10 fps, loop. Sparkles for the most powerful demons (deep purple and black). Loops. |
| fx_mana_motes | effects/fx_mana_motes.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_mana_motes: 6 frames of 16 x 16 left to right, 6 fps, loop. Small cyan dots drifting up (mana crystals, mages refilling). Seamless loop. |
| fx_muzzle_flash | effects/fx_muzzle_flash.png | 3 | 48x16 | size 48x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_muzzle_flash: 3 frames of 16 x 16 left to right, 15 fps, play once. Bright yellow-white musket flash with a puff (last frame). Muzzle at the left-centre; flip for the other side. |
| fx_ripple | effects/fx_ripple.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_ripple: 6 frames of 16 x 16 left to right, 6 fps, loop. Ring of ripples (squashed to lie on the water) marking fishing spots. Seamless loop. |
| fx_smoke_black | effects/fx_smoke_black.png | 8 | 256x32 | fx_smoke_black: 8 frames of 32 x 32 left to right, 8 fps, play once. Thick black smoke for burning buildings and explosions. |
| fx_smoke_black_white | effects/fx_smoke_black_white.png | 8 | 256x32 | fx_smoke_black_white: 8 frames of 32 x 32 left to right, 8 fps, play once. White version of fx_smoke_black for tinting. |
| fx_smoke_puff | effects/fx_smoke_puff.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_smoke_puff: 6 frames of 16 x 16 left to right, 8 fps, play once. Grey puff that grows and fades (chimneys, snuffed torches, undead burning). Fades by dithering. |
| fx_smoke_puff_white | effects/fx_smoke_puff_white.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_smoke_puff_white: 6 frames of 16 x 16 left to right, 8 fps, play once. White version of fx_smoke_puff for tinting. |
| fx_splash | effects/fx_splash.png | 5 | 80x16 | size 80x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_splash: 5 frames of 16 x 16 left to right, 10 fps, play once. Water splash for units entering water and things falling in. Anchor at the bottom centre (the water line). |
| fx_sunburn | effects/fx_sunburn.png | 6 | 96x16 | size 96x16 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); fx_sunburn: 6 frames of 16 x 16 left to right, 8 fps, play once. Smoke with small orange sparks for undead caught by the sun. |
| marker_attack | effects/marker_attack.png | 4 | 128x32 | marker_attack: 4 frames of 32 x 32 left to right, 10 fps, play once. Ring that shrinks and fades in 4 frames, drawn flat on the ground (from above). |
| marker_move | effects/marker_move.png | 4 | 128x32 | marker_move: 4 frames of 32 x 32 left to right, 10 fps, play once. Ring that shrinks and fades in 4 frames, drawn flat on the ground (from above). |
| marker_patrol | effects/marker_patrol.png | 4 | 128x32 | marker_patrol: 4 frames of 32 x 32 left to right, 10 fps, play once. Ring that shrinks and fades in 4 frames, drawn flat on the ground (from above). |
| marker_rally | effects/marker_rally.png | 4 | 64x16 | marker_rally: 4 frames of 16 x 16 left to right, 8 fps, loop. Small flag on a pole with a 4-frame flutter; the cloth is team colour (52,96,178) with a lighter top row. Anchor at the pole foot (x 4, y 15). |
| particle_ash | effects/particle_ash.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_ash: 32 x 8 strip, four 8 x 8 variants. Black and grey flakes, one orange ember (variant 3): demons and burnt things. |
| particle_ash_white | effects/particle_ash_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_ash_white: 32 x 8 strip, four 8 x 8 variants. Black and grey flakes, one orange ember (variant 3): demons and burnt things. |
| particle_blood | effects/particle_blood.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_blood: 32 x 8 strip, four 8 x 8 variants. Dark red drops and a short splash streak (variant 3): living creatures and people. |
| particle_blood_dark | effects/particle_blood_dark.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_blood_dark: 32 x 8 strip, four 8 x 8 variants. Black-green ichor drops: zombies and rotting things. |
| particle_blood_dark_white | effects/particle_blood_dark_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_blood_dark_white: 32 x 8 strip, four 8 x 8 variants. Black-green ichor drops: zombies and rotting things. |
| particle_blood_white | effects/particle_blood_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_blood_white: 32 x 8 strip, four 8 x 8 variants. Dark red drops and a short splash streak (variant 3): living creatures and people. |
| particle_bone | effects/particle_bone.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_bone: 32 x 8 strip, four 8 x 8 variants. Bone-white shards: skeletons. |
| particle_bone_white | effects/particle_bone_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_bone_white: 32 x 8 strip, four 8 x 8 variants. Bone-white shards: skeletons. |
| particle_dirt | effects/particle_dirt.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_dirt: 32 x 8 strip, four 8 x 8 variants. Brown clods: digging, big feet on soft ground. |
| particle_dirt_white | effects/particle_dirt_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_dirt_white: 32 x 8 strip, four 8 x 8 variants. Brown clods: digging, big feet on soft ground. |
| particle_leaf | effects/particle_leaf.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_leaf: 32 x 8 strip, four 8 x 8 variants. Single leaves in two greens and one brown (variant 3): trees being struck. |
| particle_leaf_white | effects/particle_leaf_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_leaf_white: 32 x 8 strip, four 8 x 8 variants. Single leaves in two greens and one brown (variant 3): trees being struck. |
| particle_slime | effects/particle_slime.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_slime: 32 x 8 strip, four 8 x 8 variants. Green glossy blobs with a highlight pixel: slimes and similar. |
| particle_slime_white | effects/particle_slime_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_slime_white: 32 x 8 strip, four 8 x 8 variants. Green glossy blobs with a highlight pixel: slimes and similar. |
| particle_spark | effects/particle_spark.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_spark: 32 x 8 strip, four 8 x 8 variants. White-yellow sparks with a one-pixel orange tail: metal on metal, shields, anvil, pick on hard rock. |
| particle_spark_white | effects/particle_spark_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_spark_white: 32 x 8 strip, four 8 x 8 variants. White-yellow sparks with a one-pixel orange tail: metal on metal, shields, anvil, pick on hard rock. |
| particle_stone_chip | effects/particle_stone_chip.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_stone_chip: 32 x 8 strip, four 8 x 8 variants. Small angular grey chips: mining, stone walls, rock creatures (tint the white version per rock). |
| particle_stone_chip_white | effects/particle_stone_chip_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_stone_chip_white: 32 x 8 strip, four 8 x 8 variants. Small angular grey chips: mining, stone walls, rock creatures (tint the white version per rock). |
| particle_wood_chip | effects/particle_wood_chip.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_wood_chip: 32 x 8 strip, four 8 x 8 variants. Pale splinters and chips: chopping, wooden walls and buildings. |
| particle_wood_chip_white | effects/particle_wood_chip_white.png | 4 variants | 32x8 | size 32x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); particle_wood_chip_white: 32 x 8 strip, four 8 x 8 variants. Pale splinters and chips: chopping, wooden walls and buildings. |
| place_tile_bad | effects/place_tile_bad.png | 1 | 16x16 | place_tile_bad: 1 frames of 16 x 16 left to right, 1 fps, play once. Single 16 x 16 tile with a thin border and a light fill (alpha 70), placed under a building being positioned. |
| place_tile_ok | effects/place_tile_ok.png | 1 | 16x16 | place_tile_ok: 1 frames of 16 x 16 left to right, 1 fps, play once. Single 16 x 16 tile with a thin border and a light fill (alpha 70), placed under a building being positioned. |
| selection_ring | effects/selection_ring.png | 1 | 32x32 | selection_ring: 1 frames of 32 x 32 left to right, 1 fps, play once. Thin white ring drawn under a selected unit; tint it per side (team colour, yellow neutral, red enemy). |

## ui

Interface art (section K): icons, portraits, badges, minimap icons, cursors, 9-slice panels, bars, menus and screens. Slice sizes, hotspots and frame layouts are in each row and in the PNG tEXt Comment.

Pending (not in the repo yet): portraits of `ash_golem` and `mana_wraith` (their models are not built yet), and of the 21 existing-set creatures other than giant_spider (their models were not supplied). They follow in a later PR.

| id | path | frames | size | notes, deviations and reasons |
|---|---|---|---|---|
| icon_bandage | ui/icon_bandage.png | 1 | 32x32 | K1 resource icon bandage (rendered from bandage_roll.bbmodel), 32x32, 1px outline, top-left light. |
| icon_bog_iron | ui/icon_bog_iron.png | 1 | 32x32 | K1 resource icon bog_iron (rendered from ore_bog_iron.bbmodel), 32x32, 1px outline, top-left light. |
| icon_bone | ui/icon_bone.png | 1 | 32x32 | K1 resource icon bone (rendered from bone_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_bread | ui/icon_bread.png | 1 | 32x32 | K1 resource icon bread (rendered from bread_loaf.bbmodel), 32x32, 1px outline, top-left light. |
| icon_bricks | ui/icon_bricks.png | 1 | 32x32 | K1 resource icon bricks (rendered from bricks.bbmodel), 32x32, 1px outline, top-left light. |
| icon_carrots | ui/icon_carrots.png | 1 | 32x32 | K1 resource icon carrots (rendered from carrot_bunch.bbmodel), 32x32, 1px outline, top-left light. |
| icon_charcoal | ui/icon_charcoal.png | 1 | 32x32 | K1 resource icon charcoal: sack + heap of contents. |
| icon_clay | ui/icon_clay.png | 1 | 32x32 | K1 resource icon clay (rendered from clay_lump.bbmodel), 32x32, 1px outline, top-left light. |
| icon_coal | ui/icon_coal.png | 1 | 32x32 | K1 resource icon coal (rendered from coal_lump.bbmodel), 32x32, 1px outline, top-left light. |
| icon_copper_ore | ui/icon_copper_ore.png | 1 | 32x32 | K1 resource icon copper_ore (rendered from ore_copper.bbmodel), 32x32, 1px outline, top-left light. |
| icon_corn | ui/icon_corn.png | 1 | 32x32 | K1 resource icon corn (rendered from corn_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_demon_horn | ui/icon_demon_horn.png | 1 | 32x32 | K1 resource icon demon_horn (rendered from demon_horn.bbmodel), 32x32, 1px outline, top-left light. |
| icon_diamond | ui/icon_diamond.png | 1 | 32x32 | K1 resource icon diamond (rendered from gem_diamond.bbmodel), 32x32, 1px outline, top-left light. |
| icon_earth | ui/icon_earth.png | 1 | 32x32 | K1 resource icon earth: sack + heap of contents. |
| icon_eggs | ui/icon_eggs.png | 1 | 32x32 | K1 resource icon eggs (rendered from egg_basket.bbmodel), 32x32, 1px outline, top-left light. |
| icon_emerald | ui/icon_emerald.png | 1 | 32x32 | K1 resource icon emerald (rendered from gem_emerald.bbmodel), 32x32, 1px outline, top-left light. |
| icon_feathers | ui/icon_feathers.png | 1 | 32x32 | K1 resource icon feathers (rendered from feather_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_fish | ui/icon_fish.png | 1 | 32x32 | K1 resource icon fish (rendered from fish_carried.bbmodel), 32x32, 1px outline, top-left light. |
| icon_flax | ui/icon_flax.png | 1 | 32x32 | K1 resource icon flax (rendered from flax_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_flint | ui/icon_flint.png | 1 | 32x32 | K1 resource icon flint (rendered from flint_nodule.bbmodel), 32x32, 1px outline, top-left light. |
| icon_food | ui/icon_food.png | 1 | 32x32 | K1 food stock total (resource bar): a bread loaf and a roast drumstick together. |
| icon_glass | ui/icon_glass.png | 1 | 32x32 | K1 resource icon glass (rendered from glass_bottle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_gold | ui/icon_gold.png | 1 | 32x32 | K1 resource icon gold (rendered from gold_nugget.bbmodel), 32x32, 1px outline, top-left light. |
| icon_gravel | ui/icon_gravel.png | 1 | 32x32 | K1 resource icon gravel: sack + heap of contents. |
| icon_gunpowder | ui/icon_gunpowder.png | 1 | 32x32 | K1 resource icon gunpowder (rendered from gunpowder_keg.bbmodel), 32x32, 1px outline, top-left light. |
| icon_hardwood_lumber | ui/icon_hardwood_lumber.png | 1 | 32x32 | K1 resource icon hardwood_lumber (rendered from log_hardwood.bbmodel), 32x32, 1px outline, top-left light. |
| icon_hardwood_sticks | ui/icon_hardwood_sticks.png | 1 | 32x32 | K1 resource icon hardwood_sticks (rendered from sticks_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_healing_remedy | ui/icon_healing_remedy.png | 1 | 32x32 | K1 resource icon healing_remedy (rendered from healing_remedy.bbmodel), 32x32, 1px outline, top-left light. |
| icon_hexstone | ui/icon_hexstone.png | 1 | 32x32 | K1 resource icon hexstone (rendered from hexstone.bbmodel), 32x32, 1px outline, top-left light. |
| icon_hides | ui/icon_hides.png | 1 | 32x32 | K1 resource icon hides (rendered from hide_rolled.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_bronze | ui/icon_ingot_bronze.png | 1 | 32x32 | K1 resource icon ingot_bronze (rendered from ingot_bronze.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_copper | ui/icon_ingot_copper.png | 1 | 32x32 | K1 resource icon ingot_copper (rendered from ingot_copper.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_hq_steel | ui/icon_ingot_hq_steel.png | 1 | 32x32 | K1 resource icon ingot_hq_steel (rendered from ingot_hq_steel.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_iron_bloom | ui/icon_ingot_iron_bloom.png | 1 | 32x32 | K1 ingot iron_bloom; grade dots bottom-right = 1. |
| icon_ingot_iron_refined | ui/icon_ingot_iron_refined.png | 1 | 32x32 | K1 ingot iron_refined; grade dots bottom-right = 3. |
| icon_ingot_iron_wrought | ui/icon_ingot_iron_wrought.png | 1 | 32x32 | K1 ingot iron_wrought; grade dots bottom-right = 2. |
| icon_ingot_pig_iron | ui/icon_ingot_pig_iron.png | 1 | 32x32 | K1 resource icon ingot_pig_iron (rendered from ingot_pig_iron.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_steel | ui/icon_ingot_steel.png | 1 | 32x32 | K1 resource icon ingot_steel (rendered from ingot_steel.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ingot_tin | ui/icon_ingot_tin.png | 1 | 32x32 | K1 resource icon ingot_tin (rendered from ingot_tin.bbmodel), 32x32, 1px outline, top-left light. |
| icon_iron_rock | ui/icon_iron_rock.png | 1 | 32x32 | K1 resource icon iron_rock (rendered from ore_iron_rock.bbmodel), 32x32, 1px outline, top-left light. |
| icon_lead_ore | ui/icon_lead_ore.png | 1 | 32x32 | K1 resource icon lead_ore (rendered from ore_lead.bbmodel), 32x32, 1px outline, top-left light. |
| icon_lead_shot | ui/icon_lead_shot.png | 1 | 32x32 | K1 resource icon lead_shot (rendered from lead_shot_pouch.bbmodel), 32x32, 1px outline, top-left light. |
| icon_leather | ui/icon_leather.png | 1 | 32x32 | K1 resource icon leather (rendered from leather_folded.bbmodel), 32x32, 1px outline, top-left light. |
| icon_mana_crystal | ui/icon_mana_crystal.png | 1 | 32x32 | K1 resource icon mana_crystal (rendered from mana_crystal.bbmodel), 32x32, 1px outline, top-left light. |
| icon_marble | ui/icon_marble.png | 1 | 32x32 | K1 resource icon marble (rendered from marble_block.bbmodel), 32x32, 1px outline, top-left light. |
| icon_meat | ui/icon_meat.png | 1 | 32x32 | K1 resource icon meat (rendered from meat_haunch.bbmodel), 32x32, 1px outline, top-left light. |
| icon_medicinal_herbs | ui/icon_medicinal_herbs.png | 1 | 32x32 | K1 resource icon medicinal_herbs (rendered from herb_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_pie | ui/icon_pie.png | 1 | 32x32 | K1 resource icon pie (rendered from pie.bbmodel), 32x32, 1px outline, top-left light. |
| icon_planks | ui/icon_planks.png | 1 | 32x32 | K1 resource icon planks (rendered from planks.bbmodel), 32x32, 1px outline, top-left light. |
| icon_potatoes | ui/icon_potatoes.png | 1 | 32x32 | K1 resource icon potatoes: sack + heap of contents. |
| icon_resin | ui/icon_resin.png | 1 | 32x32 | K1 resource icon resin (rendered from resin_pot.bbmodel), 32x32, 1px outline, top-left light. |
| icon_roast_fish | ui/icon_roast_fish.png | 1 | 32x32 | K1 resource icon roast_fish (rendered from roast_fish.bbmodel), 32x32, 1px outline, top-left light. |
| icon_roast_meat | ui/icon_roast_meat.png | 1 | 32x32 | K1 resource icon roast_meat (rendered from roast_meat.bbmodel), 32x32, 1px outline, top-left light. |
| icon_rope | ui/icon_rope.png | 1 | 32x32 | K1 resource icon rope (rendered from rope_coil.bbmodel), 32x32, 1px outline, top-left light. |
| icon_ruby | ui/icon_ruby.png | 1 | 32x32 | K1 resource icon ruby (rendered from gem_ruby.bbmodel), 32x32, 1px outline, top-left light. |
| icon_salted_fish | ui/icon_salted_fish.png | 1 | 32x32 | K1 resource icon salted_fish (rendered from salted_fish_barrel.bbmodel), 32x32, 1px outline, top-left light. |
| icon_salted_meat | ui/icon_salted_meat.png | 1 | 32x32 | K1 resource icon salted_meat (rendered from salted_meat_barrel.bbmodel), 32x32, 1px outline, top-left light. |
| icon_saltpetre | ui/icon_saltpetre.png | 1 | 32x32 | K1 resource icon saltpetre (rendered from saltpetre_lump.bbmodel), 32x32, 1px outline, top-left light. |
| icon_sand | ui/icon_sand.png | 1 | 32x32 | K1 resource icon sand: sack + heap of contents. |
| icon_silver | ui/icon_silver.png | 1 | 32x32 | K1 resource icon silver (rendered from ore_silver.bbmodel), 32x32, 1px outline, top-left light. |
| icon_sinew | ui/icon_sinew.png | 1 | 32x32 | K1 resource icon sinew (rendered from sinew_bundle.bbmodel), 32x32, 1px outline, top-left light. |
| icon_smoked_fish | ui/icon_smoked_fish.png | 1 | 32x32 | K1 resource icon smoked_fish (rendered from smoked_fish.bbmodel), 32x32, 1px outline, top-left light. |
| icon_smoked_meat | ui/icon_smoked_meat.png | 1 | 32x32 | K1 resource icon smoked_meat (rendered from smoked_meat.bbmodel), 32x32, 1px outline, top-left light. |
| icon_softwood_lumber | ui/icon_softwood_lumber.png | 1 | 32x32 | K1 resource icon softwood_lumber (rendered from log_softwood.bbmodel), 32x32, 1px outline, top-left light. |
| icon_spider_silk | ui/icon_spider_silk.png | 1 | 32x32 | K1 resource icon spider_silk (rendered from spider_silk.bbmodel), 32x32, 1px outline, top-left light. |
| icon_stew | ui/icon_stew.png | 1 | 32x32 | K1 resource icon stew (rendered from stew_pot.bbmodel), 32x32, 1px outline, top-left light. |
| icon_stone | ui/icon_stone.png | 1 | 32x32 | K1 resource icon stone (rendered from stone_chunk.bbmodel), 32x32, 1px outline, top-left light. |
| icon_stone_blocks | ui/icon_stone_blocks.png | 1 | 32x32 | K1 resource icon stone_blocks (rendered from stone_blocks.bbmodel), 32x32, 1px outline, top-left light. |
| icon_sulphur | ui/icon_sulphur.png | 1 | 32x32 | K1 resource icon sulphur (rendered from sulphur_lump.bbmodel), 32x32, 1px outline, top-left light. |
| icon_supply | ui/icon_supply.png | 1 | 32x32 | K1 supply total (resource bar): a small house with a figure beside it. |
| icon_tin_ore | ui/icon_tin_ore.png | 1 | 32x32 | K1 resource icon tin_ore (rendered from ore_tin.bbmodel), 32x32, 1px outline, top-left light. |
| icon_vein_iron_ore | ui/icon_vein_iron_ore.png | 1 | 32x32 | K1 resource icon vein_iron_ore (rendered from ore_vein_iron.bbmodel), 32x32, 1px outline, top-left light. |
| icon_venom | ui/icon_venom.png | 1 | 32x32 | K1 resource icon venom (rendered from venom_vial.bbmodel), 32x32, 1px outline, top-left light. |
| icon_wheat | ui/icon_wheat.png | 1 | 32x32 | K1 resource icon wheat (rendered from wheat_sheaf.bbmodel), 32x32, 1px outline, top-left light. |
| icon_axe_bronze | ui/icon_axe_bronze.png | 1 | 32x32 | K2 item icon axe_bronze (rendered from axe.bbmodel + axe_bronze.png), tier bronze. |
| icon_axe_copper | ui/icon_axe_copper.png | 1 | 32x32 | K2 item icon axe_copper (rendered from axe.bbmodel + axe_copper.png), tier copper. |
| icon_axe_flint | ui/icon_axe_flint.png | 1 | 32x32 | K2 item icon axe_flint (rendered from axe_flint.bbmodel), tier None. |
| icon_axe_hardwood | ui/icon_axe_hardwood.png | 1 | 32x32 | K2 item icon axe_hardwood (rendered from axe_hardwood.bbmodel), tier None. |
| icon_axe_hq_steel | ui/icon_axe_hq_steel.png | 1 | 32x32 | K2 item icon axe_hq_steel (rendered from axe.bbmodel + axe_hq_steel.png), tier hq_steel. |
| icon_axe_iron_bloom | ui/icon_axe_iron_bloom.png | 1 | 32x32 | K2 item icon axe_iron_bloom (rendered from axe.bbmodel + axe_iron_bloom.png), tier iron_bloom. |
| icon_axe_iron_refined | ui/icon_axe_iron_refined.png | 1 | 32x32 | K2 item icon axe_iron_refined (rendered from axe.bbmodel + axe_iron_refined.png), tier iron_refined. |
| icon_axe_iron_wrought | ui/icon_axe_iron_wrought.png | 1 | 32x32 | K2 item icon axe_iron_wrought (rendered from axe.bbmodel + axe_iron_wrought.png), tier iron_wrought. |
| icon_axe_steel | ui/icon_axe_steel.png | 1 | 32x32 | K2 item icon axe_steel (rendered from axe.bbmodel + axe_steel.png), tier steel. |
| icon_digging_stick | ui/icon_digging_stick.png | 1 | 32x32 | K2 item icon digging_stick (rendered from digging_stick.bbmodel), tier None. |
| icon_fishing_net | ui/icon_fishing_net.png | 1 | 32x32 | K2 item icon fishing_net (rendered from fishing_net.bbmodel), tier None. |
| icon_fishing_rod | ui/icon_fishing_rod.png | 1 | 32x32 | K2 item icon fishing_rod (rendered from fishing_rod.bbmodel), tier None. |
| icon_hoe_bronze | ui/icon_hoe_bronze.png | 1 | 32x32 | K2 item icon hoe_bronze (rendered from hoe.bbmodel + hoe_bronze.png), tier bronze. |
| icon_hoe_copper | ui/icon_hoe_copper.png | 1 | 32x32 | K2 item icon hoe_copper (rendered from hoe.bbmodel + hoe_copper.png), tier copper. |
| icon_hoe_hardwood | ui/icon_hoe_hardwood.png | 1 | 32x32 | K2 item icon hoe_hardwood (rendered from hoe.bbmodel + hoe_hardwood.png), tier hardwood. |
| icon_hoe_hq_steel | ui/icon_hoe_hq_steel.png | 1 | 32x32 | K2 item icon hoe_hq_steel (rendered from hoe.bbmodel + hoe_hq_steel.png), tier hq_steel. |
| icon_hoe_iron_bloom | ui/icon_hoe_iron_bloom.png | 1 | 32x32 | K2 item icon hoe_iron_bloom (rendered from hoe.bbmodel + hoe_iron_bloom.png), tier iron_bloom. |
| icon_hoe_iron_refined | ui/icon_hoe_iron_refined.png | 1 | 32x32 | K2 item icon hoe_iron_refined (rendered from hoe.bbmodel + hoe_iron_refined.png), tier iron_refined. |
| icon_hoe_iron_wrought | ui/icon_hoe_iron_wrought.png | 1 | 32x32 | K2 item icon hoe_iron_wrought (rendered from hoe.bbmodel + hoe_iron_wrought.png), tier iron_wrought. |
| icon_hoe_steel | ui/icon_hoe_steel.png | 1 | 32x32 | K2 item icon hoe_steel (rendered from hoe.bbmodel + hoe_steel.png), tier steel. |
| icon_knife | ui/icon_knife.png | 1 | 32x32 | K2 item icon knife (rendered from knife.bbmodel), tier None. |
| icon_mallet | ui/icon_mallet.png | 1 | 32x32 | K2 item icon mallet (rendered from mallet.bbmodel), tier None. |
| icon_pick_bronze | ui/icon_pick_bronze.png | 1 | 32x32 | K2 item icon pick_bronze (rendered from pick.bbmodel + pick_bronze.png), tier bronze. |
| icon_pick_copper | ui/icon_pick_copper.png | 1 | 32x32 | K2 item icon pick_copper (rendered from pick.bbmodel + pick_copper.png), tier copper. |
| icon_pick_flint | ui/icon_pick_flint.png | 1 | 32x32 | K2 item icon pick_flint (rendered from pick_flint.bbmodel), tier None. |
| icon_pick_hq_steel | ui/icon_pick_hq_steel.png | 1 | 32x32 | K2 item icon pick_hq_steel (rendered from pick.bbmodel + pick_hq_steel.png), tier hq_steel. |
| icon_pick_iron_bloom | ui/icon_pick_iron_bloom.png | 1 | 32x32 | K2 item icon pick_iron_bloom (rendered from pick.bbmodel + pick_iron_bloom.png), tier iron_bloom. |
| icon_pick_iron_refined | ui/icon_pick_iron_refined.png | 1 | 32x32 | K2 item icon pick_iron_refined (rendered from pick.bbmodel + pick_iron_refined.png), tier iron_refined. |
| icon_pick_iron_wrought | ui/icon_pick_iron_wrought.png | 1 | 32x32 | K2 item icon pick_iron_wrought (rendered from pick.bbmodel + pick_iron_wrought.png), tier iron_wrought. |
| icon_pick_steel | ui/icon_pick_steel.png | 1 | 32x32 | K2 item icon pick_steel (rendered from pick.bbmodel + pick_steel.png), tier steel. |
| icon_plough_hq_steel | ui/icon_plough_hq_steel.png | 1 | 32x32 | K2 item icon plough_hq_steel (rendered from plough.bbmodel + plough_hq_steel.png), tier hq_steel. |
| icon_plough_iron_bloom | ui/icon_plough_iron_bloom.png | 1 | 32x32 | K2 item icon plough_iron_bloom (rendered from plough.bbmodel + plough_iron_bloom.png), tier iron_bloom. |
| icon_plough_iron_refined | ui/icon_plough_iron_refined.png | 1 | 32x32 | K2 item icon plough_iron_refined (rendered from plough.bbmodel + plough_iron_refined.png), tier iron_refined. |
| icon_plough_iron_wrought | ui/icon_plough_iron_wrought.png | 1 | 32x32 | K2 item icon plough_iron_wrought (rendered from plough.bbmodel + plough_iron_wrought.png), tier iron_wrought. |
| icon_plough_steel | ui/icon_plough_steel.png | 1 | 32x32 | K2 item icon plough_steel (rendered from plough.bbmodel + plough_steel.png), tier steel. |
| icon_prospecting_hammer_iron_bloom | ui/icon_prospecting_hammer_iron_bloom.png | 1 | 32x32 | K2 item icon prospecting_hammer_iron_bloom (rendered from prospecting_hammer.bbmodel + prospecting_hammer_iron_bloom.png), tier iron_bloom. |
| icon_prospecting_hammer_iron_refined | ui/icon_prospecting_hammer_iron_refined.png | 1 | 32x32 | K2 item icon prospecting_hammer_iron_refined (rendered from prospecting_hammer.bbmodel + prospecting_hammer_iron_refined.png), tier iron_refined. |
| icon_prospecting_hammer_iron_wrought | ui/icon_prospecting_hammer_iron_wrought.png | 1 | 32x32 | K2 item icon prospecting_hammer_iron_wrought (rendered from prospecting_hammer.bbmodel + prospecting_hammer_iron_wrought.png), tier iron_wrought. |
| icon_saw_bronze | ui/icon_saw_bronze.png | 1 | 32x32 | K2 item icon saw_bronze (rendered from saw.bbmodel + saw_bronze.png), tier bronze. |
| icon_saw_hq_steel | ui/icon_saw_hq_steel.png | 1 | 32x32 | K2 item icon saw_hq_steel (rendered from saw.bbmodel + saw_hq_steel.png), tier hq_steel. |
| icon_saw_iron_bloom | ui/icon_saw_iron_bloom.png | 1 | 32x32 | K2 item icon saw_iron_bloom (rendered from saw.bbmodel + saw_iron_bloom.png), tier iron_bloom. |
| icon_saw_iron_refined | ui/icon_saw_iron_refined.png | 1 | 32x32 | K2 item icon saw_iron_refined (rendered from saw.bbmodel + saw_iron_refined.png), tier iron_refined. |
| icon_saw_iron_wrought | ui/icon_saw_iron_wrought.png | 1 | 32x32 | K2 item icon saw_iron_wrought (rendered from saw.bbmodel + saw_iron_wrought.png), tier iron_wrought. |
| icon_saw_steel | ui/icon_saw_steel.png | 1 | 32x32 | K2 item icon saw_steel (rendered from saw.bbmodel + saw_steel.png), tier steel. |
| icon_sickle_bronze | ui/icon_sickle_bronze.png | 1 | 32x32 | K2 item icon sickle_bronze (rendered from sickle.bbmodel + sickle_bronze.png), tier bronze. |
| icon_sickle_copper | ui/icon_sickle_copper.png | 1 | 32x32 | K2 item icon sickle_copper (rendered from sickle.bbmodel + sickle_copper.png), tier copper. |
| icon_sickle_hq_steel | ui/icon_sickle_hq_steel.png | 1 | 32x32 | K2 item icon sickle_hq_steel (rendered from sickle.bbmodel + sickle_hq_steel.png), tier hq_steel. |
| icon_sickle_iron_bloom | ui/icon_sickle_iron_bloom.png | 1 | 32x32 | K2 item icon sickle_iron_bloom (rendered from sickle.bbmodel + sickle_iron_bloom.png), tier iron_bloom. |
| icon_sickle_iron_refined | ui/icon_sickle_iron_refined.png | 1 | 32x32 | K2 item icon sickle_iron_refined (rendered from sickle.bbmodel + sickle_iron_refined.png), tier iron_refined. |
| icon_sickle_iron_wrought | ui/icon_sickle_iron_wrought.png | 1 | 32x32 | K2 item icon sickle_iron_wrought (rendered from sickle.bbmodel + sickle_iron_wrought.png), tier iron_wrought. |
| icon_sickle_steel | ui/icon_sickle_steel.png | 1 | 32x32 | K2 item icon sickle_steel (rendered from sickle.bbmodel + sickle_steel.png), tier steel. |
| icon_tool_set_bronze | ui/icon_tool_set_bronze.png | 1 | 32x32 | K2 tool set icon, tier bronze: axe and pick crossed. |
| icon_tool_set_copper | ui/icon_tool_set_copper.png | 1 | 32x32 | K2 tool set icon, tier copper: axe and pick crossed. |
| icon_tool_set_flint | ui/icon_tool_set_flint.png | 1 | 32x32 | K2 tool set icon, tier flint: axe and pick crossed. |
| icon_tool_set_hq_steel | ui/icon_tool_set_hq_steel.png | 1 | 32x32 | K2 tool set icon, tier hq_steel: axe and pick crossed. |
| icon_tool_set_iron_bloom | ui/icon_tool_set_iron_bloom.png | 1 | 32x32 | K2 tool set icon, tier iron_bloom: axe and pick crossed. |
| icon_tool_set_iron_refined | ui/icon_tool_set_iron_refined.png | 1 | 32x32 | K2 tool set icon, tier iron_refined: axe and pick crossed. |
| icon_tool_set_iron_wrought | ui/icon_tool_set_iron_wrought.png | 1 | 32x32 | K2 tool set icon, tier iron_wrought: axe and pick crossed. |
| icon_tool_set_steel | ui/icon_tool_set_steel.png | 1 | 32x32 | K2 tool set icon, tier steel: axe and pick crossed. |
