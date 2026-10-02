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
| icon_arrow_bronze | ui/icon_arrow_bronze.png | 1 | 32x32 | K2 item icon arrow_bronze (rendered from arrow.bbmodel + arrow_bronze.png), tier bronze. |
| icon_arrow_fire | ui/icon_arrow_fire.png | 1 | 32x32 | K2 item icon arrow_fire (rendered from arrow_fire.bbmodel), tier None. |
| icon_arrow_flint | ui/icon_arrow_flint.png | 1 | 32x32 | K2 item icon arrow_flint (rendered from arrow.bbmodel + arrow_flint.png), tier flint. |
| icon_arrow_hq_steel | ui/icon_arrow_hq_steel.png | 1 | 32x32 | K2 item icon arrow_hq_steel (rendered from arrow.bbmodel + arrow_hq_steel.png), tier hq_steel. |
| icon_arrow_iron_bloom | ui/icon_arrow_iron_bloom.png | 1 | 32x32 | K2 item icon arrow_iron_bloom (rendered from arrow.bbmodel + arrow_iron_bloom.png), tier iron_bloom. |
| icon_arrow_iron_refined | ui/icon_arrow_iron_refined.png | 1 | 32x32 | K2 item icon arrow_iron_refined (rendered from arrow.bbmodel + arrow_iron_refined.png), tier iron_refined. |
| icon_arrow_iron_wrought | ui/icon_arrow_iron_wrought.png | 1 | 32x32 | K2 item icon arrow_iron_wrought (rendered from arrow.bbmodel + arrow_iron_wrought.png), tier iron_wrought. |
| icon_arrow_poison_bronze | ui/icon_arrow_poison_bronze.png | 1 | 32x32 | K2 item icon arrow_poison_bronze (rendered from arrow_poison.bbmodel + arrow_poison_bronze.png), tier bronze. |
| icon_arrow_poison_flint | ui/icon_arrow_poison_flint.png | 1 | 32x32 | K2 item icon arrow_poison_flint (rendered from arrow_poison.bbmodel + arrow_poison_flint.png), tier flint. |
| icon_arrow_poison_hq_steel | ui/icon_arrow_poison_hq_steel.png | 1 | 32x32 | K2 item icon arrow_poison_hq_steel (rendered from arrow_poison.bbmodel + arrow_poison_hq_steel.png), tier hq_steel. |
| icon_arrow_poison_iron_bloom | ui/icon_arrow_poison_iron_bloom.png | 1 | 32x32 | K2 item icon arrow_poison_iron_bloom (rendered from arrow_poison.bbmodel + arrow_poison_iron_bloom.png), tier iron_bloom. |
| icon_arrow_poison_iron_refined | ui/icon_arrow_poison_iron_refined.png | 1 | 32x32 | K2 item icon arrow_poison_iron_refined (rendered from arrow_poison.bbmodel + arrow_poison_iron_refined.png), tier iron_refined. |
| icon_arrow_poison_iron_wrought | ui/icon_arrow_poison_iron_wrought.png | 1 | 32x32 | K2 item icon arrow_poison_iron_wrought (rendered from arrow_poison.bbmodel + arrow_poison_iron_wrought.png), tier iron_wrought. |
| icon_arrow_poison_steel | ui/icon_arrow_poison_steel.png | 1 | 32x32 | K2 item icon arrow_poison_steel (rendered from arrow_poison.bbmodel + arrow_poison_steel.png), tier steel. |
| icon_arrow_steel | ui/icon_arrow_steel.png | 1 | 32x32 | K2 item icon arrow_steel (rendered from arrow.bbmodel + arrow_steel.png), tier steel. |
| icon_axe_war_copper | ui/icon_axe_war_copper.png | 1 | 32x32 | K2 item icon axe_war_copper (rendered from axe_war.bbmodel + axe_war_copper.png), tier copper. |
| icon_axe_war_flint | ui/icon_axe_war_flint.png | 1 | 32x32 | K2 item icon axe_war_flint (rendered from axe_war_flint.bbmodel), tier None. |
| icon_ballista_bolt | ui/icon_ballista_bolt.png | 1 | 32x32 | K2 item icon ballista_bolt (rendered from ballista_bolt.bbmodel), tier None. |
| icon_bolt_bronze | ui/icon_bolt_bronze.png | 1 | 32x32 | K2 item icon bolt_bronze (rendered from bolt.bbmodel + bolt_bronze.png), tier bronze. |
| icon_bolt_case | ui/icon_bolt_case.png | 1 | 32x32 | K2 item icon bolt_case (rendered from bolt_case.bbmodel), tier None. |
| icon_bolt_flint | ui/icon_bolt_flint.png | 1 | 32x32 | K2 item icon bolt_flint (rendered from bolt.bbmodel + bolt_flint.png), tier flint. |
| icon_bolt_hq_steel | ui/icon_bolt_hq_steel.png | 1 | 32x32 | K2 item icon bolt_hq_steel (rendered from bolt.bbmodel + bolt_hq_steel.png), tier hq_steel. |
| icon_bolt_iron_bloom | ui/icon_bolt_iron_bloom.png | 1 | 32x32 | K2 item icon bolt_iron_bloom (rendered from bolt.bbmodel + bolt_iron_bloom.png), tier iron_bloom. |
| icon_bolt_iron_refined | ui/icon_bolt_iron_refined.png | 1 | 32x32 | K2 item icon bolt_iron_refined (rendered from bolt.bbmodel + bolt_iron_refined.png), tier iron_refined. |
| icon_bolt_iron_wrought | ui/icon_bolt_iron_wrought.png | 1 | 32x32 | K2 item icon bolt_iron_wrought (rendered from bolt.bbmodel + bolt_iron_wrought.png), tier iron_wrought. |
| icon_bolt_poison_bronze | ui/icon_bolt_poison_bronze.png | 1 | 32x32 | K2 item icon bolt_poison_bronze (rendered from bolt_poison.bbmodel + bolt_poison_bronze.png), tier bronze. |
| icon_bolt_poison_flint | ui/icon_bolt_poison_flint.png | 1 | 32x32 | K2 item icon bolt_poison_flint (rendered from bolt_poison.bbmodel + bolt_poison_flint.png), tier flint. |
| icon_bolt_poison_hq_steel | ui/icon_bolt_poison_hq_steel.png | 1 | 32x32 | K2 item icon bolt_poison_hq_steel (rendered from bolt_poison.bbmodel + bolt_poison_hq_steel.png), tier hq_steel. |
| icon_bolt_poison_iron_bloom | ui/icon_bolt_poison_iron_bloom.png | 1 | 32x32 | K2 item icon bolt_poison_iron_bloom (rendered from bolt_poison.bbmodel + bolt_poison_iron_bloom.png), tier iron_bloom. |
| icon_bolt_poison_iron_refined | ui/icon_bolt_poison_iron_refined.png | 1 | 32x32 | K2 item icon bolt_poison_iron_refined (rendered from bolt_poison.bbmodel + bolt_poison_iron_refined.png), tier iron_refined. |
| icon_bolt_poison_iron_wrought | ui/icon_bolt_poison_iron_wrought.png | 1 | 32x32 | K2 item icon bolt_poison_iron_wrought (rendered from bolt_poison.bbmodel + bolt_poison_iron_wrought.png), tier iron_wrought. |
| icon_bolt_poison_steel | ui/icon_bolt_poison_steel.png | 1 | 32x32 | K2 item icon bolt_poison_steel (rendered from bolt_poison.bbmodel + bolt_poison_steel.png), tier steel. |
| icon_bolt_steel | ui/icon_bolt_steel.png | 1 | 32x32 | K2 item icon bolt_steel (rendered from bolt.bbmodel + bolt_steel.png), tier steel. |
| icon_bow | ui/icon_bow.png | 1 | 32x32 | K2 item icon bow (rendered from bow.bbmodel), tier None. |
| icon_cannonball_iron | ui/icon_cannonball_iron.png | 1 | 32x32 | K2 item icon cannonball_iron (rendered from cannonball_iron.bbmodel), tier None. |
| icon_cannonball_stone | ui/icon_cannonball_stone.png | 1 | 32x32 | K2 item icon cannonball_stone (rendered from cannonball_stone.bbmodel), tier None. |
| icon_catapult_stone | ui/icon_catapult_stone.png | 1 | 32x32 | K2 item icon catapult_stone (rendered from catapult_stone.bbmodel), tier None. |
| icon_club | ui/icon_club.png | 1 | 32x32 | K2 item icon club (rendered from club.bbmodel), tier None. |
| icon_crossbow_iron_bloom | ui/icon_crossbow_iron_bloom.png | 1 | 32x32 | K2 item icon crossbow_iron_bloom (rendered from crossbow.bbmodel + crossbow_iron_bloom.png), tier iron_bloom. |
| icon_crossbow_iron_refined | ui/icon_crossbow_iron_refined.png | 1 | 32x32 | K2 item icon crossbow_iron_refined (rendered from crossbow.bbmodel + crossbow_iron_refined.png), tier iron_refined. |
| icon_crossbow_iron_wrought | ui/icon_crossbow_iron_wrought.png | 1 | 32x32 | K2 item icon crossbow_iron_wrought (rendered from crossbow.bbmodel + crossbow_iron_wrought.png), tier iron_wrought. |
| icon_crossbow_steel_hq_steel | ui/icon_crossbow_steel_hq_steel.png | 1 | 32x32 | K2 item icon crossbow_steel_hq_steel (rendered from crossbow_steel.bbmodel + crossbow_steel_hq_steel.png), tier hq_steel. |
| icon_crossbow_steel_steel | ui/icon_crossbow_steel_steel.png | 1 | 32x32 | K2 item icon crossbow_steel_steel (rendered from crossbow_steel.bbmodel + crossbow_steel_steel.png), tier steel. |
| icon_dagger | ui/icon_dagger.png | 1 | 32x32 | K2 item icon dagger (rendered from dagger.bbmodel), tier None. |
| icon_dagger_copper | ui/icon_dagger_copper.png | 1 | 32x32 | K2 item icon dagger_copper (rendered from dagger.bbmodel + dagger_copper.png), tier copper. |
| icon_halberd_hq_steel | ui/icon_halberd_hq_steel.png | 1 | 32x32 | K2 item icon halberd_hq_steel (rendered from halberd.bbmodel + halberd_hq_steel.png), tier hq_steel. |
| icon_halberd_iron_bloom | ui/icon_halberd_iron_bloom.png | 1 | 32x32 | K2 item icon halberd_iron_bloom (rendered from halberd.bbmodel + halberd_iron_bloom.png), tier iron_bloom. |
| icon_halberd_iron_refined | ui/icon_halberd_iron_refined.png | 1 | 32x32 | K2 item icon halberd_iron_refined (rendered from halberd.bbmodel + halberd_iron_refined.png), tier iron_refined. |
| icon_halberd_iron_wrought | ui/icon_halberd_iron_wrought.png | 1 | 32x32 | K2 item icon halberd_iron_wrought (rendered from halberd.bbmodel + halberd_iron_wrought.png), tier iron_wrought. |
| icon_halberd_steel | ui/icon_halberd_steel.png | 1 | 32x32 | K2 item icon halberd_steel (rendered from halberd.bbmodel + halberd_steel.png), tier steel. |
| icon_javelin | ui/icon_javelin.png | 1 | 32x32 | K2 item icon javelin (rendered from javelin.bbmodel), tier None. |
| icon_javelin_bronze | ui/icon_javelin_bronze.png | 1 | 32x32 | K2 item icon javelin_bronze (rendered from javelin.bbmodel + javelin_bronze.png), tier bronze. |
| icon_javelin_flint | ui/icon_javelin_flint.png | 1 | 32x32 | K2 item icon javelin_flint (rendered from javelin_flint.bbmodel), tier None. |
| icon_mace_iron_bloom | ui/icon_mace_iron_bloom.png | 1 | 32x32 | K2 item icon mace_iron_bloom (rendered from mace.bbmodel + mace_iron_bloom.png), tier iron_bloom. |
| icon_mace_iron_refined | ui/icon_mace_iron_refined.png | 1 | 32x32 | K2 item icon mace_iron_refined (rendered from mace.bbmodel + mace_iron_refined.png), tier iron_refined. |
| icon_mace_iron_wrought | ui/icon_mace_iron_wrought.png | 1 | 32x32 | K2 item icon mace_iron_wrought (rendered from mace.bbmodel + mace_iron_wrought.png), tier iron_wrought. |
| icon_musket_hq_steel | ui/icon_musket_hq_steel.png | 1 | 32x32 | K2 item icon musket_hq_steel (rendered from musket.bbmodel + musket_hq_steel.png), tier hq_steel. |
| icon_musket_iron_bloom | ui/icon_musket_iron_bloom.png | 1 | 32x32 | K2 item icon musket_iron_bloom (rendered from musket.bbmodel + musket_iron_bloom.png), tier iron_bloom. |
| icon_musket_iron_refined | ui/icon_musket_iron_refined.png | 1 | 32x32 | K2 item icon musket_iron_refined (rendered from musket.bbmodel + musket_iron_refined.png), tier iron_refined. |
| icon_musket_iron_wrought | ui/icon_musket_iron_wrought.png | 1 | 32x32 | K2 item icon musket_iron_wrought (rendered from musket.bbmodel + musket_iron_wrought.png), tier iron_wrought. |
| icon_musket_steel | ui/icon_musket_steel.png | 1 | 32x32 | K2 item icon musket_steel (rendered from musket.bbmodel + musket_steel.png), tier steel. |
| icon_pike_hq_steel | ui/icon_pike_hq_steel.png | 1 | 32x32 | K2 item icon pike_hq_steel (rendered from pike.bbmodel + pike_hq_steel.png), tier hq_steel. |
| icon_pike_steel | ui/icon_pike_steel.png | 1 | 32x32 | K2 item icon pike_steel (rendered from pike.bbmodel + pike_steel.png), tier steel. |
| icon_powder_horn | ui/icon_powder_horn.png | 1 | 32x32 | K2 item icon powder_horn (rendered from powder_horn.bbmodel), tier None. |
| icon_quiver | ui/icon_quiver.png | 1 | 32x32 | K2 item icon quiver (rendered from quiver.bbmodel), tier None. |
| icon_shield_bronze | ui/icon_shield_bronze.png | 1 | 32x32 | K2 item icon shield_bronze (rendered from shield_bronze.bbmodel), tier None. |
| icon_shield_iron_kite_iron_bloom | ui/icon_shield_iron_kite_iron_bloom.png | 1 | 32x32 | K2 item icon shield_iron_kite_iron_bloom (rendered from shield_iron_kite.bbmodel + shield_iron_kite_iron_bloom.png), tier iron_bloom. |
| icon_shield_iron_kite_iron_refined | ui/icon_shield_iron_kite_iron_refined.png | 1 | 32x32 | K2 item icon shield_iron_kite_iron_refined (rendered from shield_iron_kite.bbmodel + shield_iron_kite_iron_refined.png), tier iron_refined. |
| icon_shield_iron_kite_iron_wrought | ui/icon_shield_iron_kite_iron_wrought.png | 1 | 32x32 | K2 item icon shield_iron_kite_iron_wrought (rendered from shield_iron_kite.bbmodel + shield_iron_kite_iron_wrought.png), tier iron_wrought. |
| icon_shield_steel_heater_hq_steel | ui/icon_shield_steel_heater_hq_steel.png | 1 | 32x32 | K2 item icon shield_steel_heater_hq_steel (rendered from shield_steel_heater.bbmodel + shield_steel_heater_hq_steel.png), tier hq_steel. |
| icon_shield_steel_heater_steel | ui/icon_shield_steel_heater_steel.png | 1 | 32x32 | K2 item icon shield_steel_heater_steel (rendered from shield_steel_heater.bbmodel + shield_steel_heater_steel.png), tier steel. |
| icon_shield_wicker | ui/icon_shield_wicker.png | 1 | 32x32 | K2 item icon shield_wicker (rendered from shield_wicker.bbmodel), tier None. |
| icon_shield_wood_iron_bloom | ui/icon_shield_wood_iron_bloom.png | 1 | 32x32 | K2 item icon shield_wood_iron_bloom (rendered from shield_wood.bbmodel + shield_wood_iron_bloom.png), tier iron_bloom. |
| icon_shield_wood_iron_refined | ui/icon_shield_wood_iron_refined.png | 1 | 32x32 | K2 item icon shield_wood_iron_refined (rendered from shield_wood.bbmodel + shield_wood_iron_refined.png), tier iron_refined. |
| icon_shield_wood_iron_wrought | ui/icon_shield_wood_iron_wrought.png | 1 | 32x32 | K2 item icon shield_wood_iron_wrought (rendered from shield_wood.bbmodel + shield_wood_iron_wrought.png), tier iron_wrought. |
| icon_shot_pouch | ui/icon_shot_pouch.png | 1 | 32x32 | K2 item icon shot_pouch (rendered from lead_shot_pouch.bbmodel), tier None. |
| icon_sling | ui/icon_sling.png | 1 | 32x32 | K2 item icon sling (rendered from sling.bbmodel), tier None. |
| icon_spear | ui/icon_spear.png | 1 | 32x32 | K2 item icon spear (rendered from spear.bbmodel), tier None. |
| icon_spear_bronze | ui/icon_spear_bronze.png | 1 | 32x32 | K2 item icon spear_bronze (rendered from spear.bbmodel + spear_bronze.png), tier bronze. |
| icon_spear_flint | ui/icon_spear_flint.png | 1 | 32x32 | K2 item icon spear_flint (rendered from spear_flint.bbmodel), tier None. |
| icon_spear_hardwood | ui/icon_spear_hardwood.png | 1 | 32x32 | K2 item icon spear_hardwood (rendered from spear_hardwood.bbmodel), tier None. |
| icon_sword_iron_bloom | ui/icon_sword_iron_bloom.png | 1 | 32x32 | K2 item icon sword_iron_bloom (rendered from sword.bbmodel + sword_iron_bloom.png), tier iron_bloom. |
| icon_sword_iron_refined | ui/icon_sword_iron_refined.png | 1 | 32x32 | K2 item icon sword_iron_refined (rendered from sword.bbmodel + sword_iron_refined.png), tier iron_refined. |
| icon_sword_iron_wrought | ui/icon_sword_iron_wrought.png | 1 | 32x32 | K2 item icon sword_iron_wrought (rendered from sword.bbmodel + sword_iron_wrought.png), tier iron_wrought. |
| icon_sword_short | ui/icon_sword_short.png | 1 | 32x32 | K2 item icon sword_short (rendered from sword_short.bbmodel), tier None. |
| icon_sword_short_bronze | ui/icon_sword_short_bronze.png | 1 | 32x32 | K2 item icon sword_short_bronze (rendered from sword_short.bbmodel + sword_short_bronze.png), tier bronze. |
| icon_sword_steel_hq_steel | ui/icon_sword_steel_hq_steel.png | 1 | 32x32 | K2 item icon sword_steel_hq_steel (rendered from sword_steel.bbmodel + sword_steel_hq_steel.png), tier hq_steel. |
| icon_sword_steel_steel | ui/icon_sword_steel_steel.png | 1 | 32x32 | K2 item icon sword_steel_steel (rendered from sword_steel.bbmodel + sword_steel_steel.png), tier steel. |
| icon_armour_bronze_scale | ui/icon_armour_bronze_scale.png | 1 | 32x32 | K2 item icon armour_bronze_scale (rendered from armour_bronze_scale.bbmodel), tier None. |
| icon_armour_iron_mail_iron_bloom | ui/icon_armour_iron_mail_iron_bloom.png | 1 | 32x32 | K2 item icon armour_iron_mail_iron_bloom (rendered from armour_iron_mail.bbmodel + armour_iron_mail_iron_bloom.png), tier iron_bloom. |
| icon_armour_iron_mail_iron_refined | ui/icon_armour_iron_mail_iron_refined.png | 1 | 32x32 | K2 item icon armour_iron_mail_iron_refined (rendered from armour_iron_mail.bbmodel + armour_iron_mail_iron_refined.png), tier iron_refined. |
| icon_armour_iron_mail_iron_wrought | ui/icon_armour_iron_mail_iron_wrought.png | 1 | 32x32 | K2 item icon armour_iron_mail_iron_wrought (rendered from armour_iron_mail.bbmodel + armour_iron_mail_iron_wrought.png), tier iron_wrought. |
| icon_armour_leather | ui/icon_armour_leather.png | 1 | 32x32 | K2 item icon armour_leather (rendered from armour_leather.bbmodel), tier None. |
| icon_armour_steel_plate_hq_steel | ui/icon_armour_steel_plate_hq_steel.png | 1 | 32x32 | K2 item icon armour_steel_plate_hq_steel (rendered from armour_steel_plate.bbmodel + armour_steel_plate_hq_steel.png), tier hq_steel. |
| icon_armour_steel_plate_steel | ui/icon_armour_steel_plate_steel.png | 1 | 32x32 | K2 item icon armour_steel_plate_steel (rendered from armour_steel_plate.bbmodel + armour_steel_plate_steel.png), tier steel. |
| icon_boots | ui/icon_boots.png | 1 | 32x32 | K2 item icon boots (rendered from boots.bbmodel), tier None. |
| icon_boots_flax | ui/icon_boots_flax.png | 1 | 32x32 | K2 item icon boots_flax (rendered from boots.bbmodel + boots_flax.png), tier flax. |
| icon_boots_leather | ui/icon_boots_leather.png | 1 | 32x32 | K2 item icon boots_leather (rendered from boots.bbmodel + boots_leather.png), tier leather. |
| icon_helmet_bronze | ui/icon_helmet_bronze.png | 1 | 32x32 | K2 item icon helmet_bronze (rendered from helmet_bronze.bbmodel), tier None. |
| icon_helmet_iron_nasal_iron_bloom | ui/icon_helmet_iron_nasal_iron_bloom.png | 1 | 32x32 | K2 item icon helmet_iron_nasal_iron_bloom (rendered from helmet_iron_nasal.bbmodel + helmet_iron_nasal_iron_bloom.png), tier iron_bloom. |
| icon_helmet_iron_nasal_iron_refined | ui/icon_helmet_iron_nasal_iron_refined.png | 1 | 32x32 | K2 item icon helmet_iron_nasal_iron_refined (rendered from helmet_iron_nasal.bbmodel + helmet_iron_nasal_iron_refined.png), tier iron_refined. |
| icon_helmet_iron_nasal_iron_wrought | ui/icon_helmet_iron_nasal_iron_wrought.png | 1 | 32x32 | K2 item icon helmet_iron_nasal_iron_wrought (rendered from helmet_iron_nasal.bbmodel + helmet_iron_nasal_iron_wrought.png), tier iron_wrought. |
| icon_helmet_leather_cap | ui/icon_helmet_leather_cap.png | 1 | 32x32 | K2 item icon helmet_leather_cap (rendered from helmet_leather_cap.bbmodel), tier None. |
| icon_helmet_steel_sallet_hq_steel | ui/icon_helmet_steel_sallet_hq_steel.png | 1 | 32x32 | K2 item icon helmet_steel_sallet_hq_steel (rendered from helmet_steel_sallet.bbmodel + helmet_steel_sallet_hq_steel.png), tier hq_steel. |
| icon_helmet_steel_sallet_steel | ui/icon_helmet_steel_sallet_steel.png | 1 | 32x32 | K2 item icon helmet_steel_sallet_steel (rendered from helmet_steel_sallet.bbmodel + helmet_steel_sallet_steel.png), tier steel. |
| icon_trinket_brooch_bronze | ui/icon_trinket_brooch_bronze.png | 1 | 32x32 | K2 item icon trinket_brooch_bronze (rendered from trinket_brooch.bbmodel + trinket_brooch_bronze.png), tier bronze. |
| icon_trinket_brooch_copper | ui/icon_trinket_brooch_copper.png | 1 | 32x32 | K2 item icon trinket_brooch_copper (rendered from trinket_brooch.bbmodel + trinket_brooch_copper.png), tier copper. |
| icon_trinket_brooch_gold | ui/icon_trinket_brooch_gold.png | 1 | 32x32 | K2 item icon trinket_brooch_gold (rendered from trinket_brooch.bbmodel + trinket_brooch_gold.png), tier gold. |
| icon_trinket_brooch_iron | ui/icon_trinket_brooch_iron.png | 1 | 32x32 | K2 item icon trinket_brooch_iron (rendered from trinket_brooch.bbmodel + trinket_brooch_iron.png), tier iron. |
| icon_trinket_brooch_silver | ui/icon_trinket_brooch_silver.png | 1 | 32x32 | K2 item icon trinket_brooch_silver (rendered from trinket_brooch.bbmodel + trinket_brooch_silver.png), tier silver. |
| icon_trinket_brooch_steel | ui/icon_trinket_brooch_steel.png | 1 | 32x32 | K2 item icon trinket_brooch_steel (rendered from trinket_brooch.bbmodel + trinket_brooch_steel.png), tier steel. |
| icon_trinket_brooch_tin | ui/icon_trinket_brooch_tin.png | 1 | 32x32 | K2 item icon trinket_brooch_tin (rendered from trinket_brooch.bbmodel + trinket_brooch_tin.png), tier tin. |
| icon_trinket_charm_bronze | ui/icon_trinket_charm_bronze.png | 1 | 32x32 | K2 item icon trinket_charm_bronze (rendered from trinket_charm.bbmodel + trinket_charm_bronze.png), tier bronze. |
| icon_trinket_charm_copper | ui/icon_trinket_charm_copper.png | 1 | 32x32 | K2 item icon trinket_charm_copper (rendered from trinket_charm.bbmodel + trinket_charm_copper.png), tier copper. |
| icon_trinket_charm_gold | ui/icon_trinket_charm_gold.png | 1 | 32x32 | K2 item icon trinket_charm_gold (rendered from trinket_charm.bbmodel + trinket_charm_gold.png), tier gold. |
| icon_trinket_charm_iron | ui/icon_trinket_charm_iron.png | 1 | 32x32 | K2 item icon trinket_charm_iron (rendered from trinket_charm.bbmodel + trinket_charm_iron.png), tier iron. |
| icon_trinket_charm_silver | ui/icon_trinket_charm_silver.png | 1 | 32x32 | K2 item icon trinket_charm_silver (rendered from trinket_charm.bbmodel + trinket_charm_silver.png), tier silver. |
| icon_trinket_charm_steel | ui/icon_trinket_charm_steel.png | 1 | 32x32 | K2 item icon trinket_charm_steel (rendered from trinket_charm.bbmodel + trinket_charm_steel.png), tier steel. |
| icon_trinket_charm_tin | ui/icon_trinket_charm_tin.png | 1 | 32x32 | K2 item icon trinket_charm_tin (rendered from trinket_charm.bbmodel + trinket_charm_tin.png), tier tin. |
| icon_trinket_heirloom_bronze | ui/icon_trinket_heirloom_bronze.png | 1 | 32x32 | K2 item icon trinket_heirloom_bronze (rendered from trinket_heirloom.bbmodel + trinket_heirloom_bronze.png), tier bronze. |
| icon_trinket_heirloom_copper | ui/icon_trinket_heirloom_copper.png | 1 | 32x32 | K2 item icon trinket_heirloom_copper (rendered from trinket_heirloom.bbmodel + trinket_heirloom_copper.png), tier copper. |
| icon_trinket_heirloom_gold | ui/icon_trinket_heirloom_gold.png | 1 | 32x32 | K2 item icon trinket_heirloom_gold (rendered from trinket_heirloom.bbmodel + trinket_heirloom_gold.png), tier gold. |
| icon_trinket_heirloom_iron | ui/icon_trinket_heirloom_iron.png | 1 | 32x32 | K2 item icon trinket_heirloom_iron (rendered from trinket_heirloom.bbmodel + trinket_heirloom_iron.png), tier iron. |
| icon_trinket_heirloom_silver | ui/icon_trinket_heirloom_silver.png | 1 | 32x32 | K2 item icon trinket_heirloom_silver (rendered from trinket_heirloom.bbmodel + trinket_heirloom_silver.png), tier silver. |
| icon_trinket_heirloom_steel | ui/icon_trinket_heirloom_steel.png | 1 | 32x32 | K2 item icon trinket_heirloom_steel (rendered from trinket_heirloom.bbmodel + trinket_heirloom_steel.png), tier steel. |
| icon_trinket_heirloom_tin | ui/icon_trinket_heirloom_tin.png | 1 | 32x32 | K2 item icon trinket_heirloom_tin (rendered from trinket_heirloom.bbmodel + trinket_heirloom_tin.png), tier tin. |
| icon_trinket_moonleaf_bronze | ui/icon_trinket_moonleaf_bronze.png | 1 | 32x32 | K2 item icon trinket_moonleaf_bronze (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_bronze.png), tier bronze. |
| icon_trinket_moonleaf_copper | ui/icon_trinket_moonleaf_copper.png | 1 | 32x32 | K2 item icon trinket_moonleaf_copper (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_copper.png), tier copper. |
| icon_trinket_moonleaf_gold | ui/icon_trinket_moonleaf_gold.png | 1 | 32x32 | K2 item icon trinket_moonleaf_gold (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_gold.png), tier gold. |
| icon_trinket_moonleaf_iron | ui/icon_trinket_moonleaf_iron.png | 1 | 32x32 | K2 item icon trinket_moonleaf_iron (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_iron.png), tier iron. |
| icon_trinket_moonleaf_silver | ui/icon_trinket_moonleaf_silver.png | 1 | 32x32 | K2 item icon trinket_moonleaf_silver (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_silver.png), tier silver. |
| icon_trinket_moonleaf_steel | ui/icon_trinket_moonleaf_steel.png | 1 | 32x32 | K2 item icon trinket_moonleaf_steel (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_steel.png), tier steel. |
| icon_trinket_moonleaf_tin | ui/icon_trinket_moonleaf_tin.png | 1 | 32x32 | K2 item icon trinket_moonleaf_tin (rendered from trinket_moonleaf.bbmodel + trinket_moonleaf_tin.png), tier tin. |
| icon_trinket_sunheart_bronze | ui/icon_trinket_sunheart_bronze.png | 1 | 32x32 | K2 item icon trinket_sunheart_bronze (rendered from trinket_sunheart.bbmodel + trinket_sunheart_bronze.png), tier bronze. |
| icon_trinket_sunheart_copper | ui/icon_trinket_sunheart_copper.png | 1 | 32x32 | K2 item icon trinket_sunheart_copper (rendered from trinket_sunheart.bbmodel + trinket_sunheart_copper.png), tier copper. |
| icon_trinket_sunheart_gold | ui/icon_trinket_sunheart_gold.png | 1 | 32x32 | K2 item icon trinket_sunheart_gold (rendered from trinket_sunheart.bbmodel + trinket_sunheart_gold.png), tier gold. |
| icon_trinket_sunheart_iron | ui/icon_trinket_sunheart_iron.png | 1 | 32x32 | K2 item icon trinket_sunheart_iron (rendered from trinket_sunheart.bbmodel + trinket_sunheart_iron.png), tier iron. |
| icon_trinket_sunheart_silver | ui/icon_trinket_sunheart_silver.png | 1 | 32x32 | K2 item icon trinket_sunheart_silver (rendered from trinket_sunheart.bbmodel + trinket_sunheart_silver.png), tier silver. |
| icon_trinket_sunheart_steel | ui/icon_trinket_sunheart_steel.png | 1 | 32x32 | K2 item icon trinket_sunheart_steel (rendered from trinket_sunheart.bbmodel + trinket_sunheart_steel.png), tier steel. |
| icon_trinket_sunheart_tin | ui/icon_trinket_sunheart_tin.png | 1 | 32x32 | K2 item icon trinket_sunheart_tin (rendered from trinket_sunheart.bbmodel + trinket_sunheart_tin.png), tier tin. |
| icon_trinket_token_bronze | ui/icon_trinket_token_bronze.png | 1 | 32x32 | K2 item icon trinket_token_bronze (rendered from trinket_token.bbmodel + trinket_token_bronze.png), tier bronze. |
| icon_trinket_token_copper | ui/icon_trinket_token_copper.png | 1 | 32x32 | K2 item icon trinket_token_copper (rendered from trinket_token.bbmodel + trinket_token_copper.png), tier copper. |
| icon_trinket_token_gold | ui/icon_trinket_token_gold.png | 1 | 32x32 | K2 item icon trinket_token_gold (rendered from trinket_token.bbmodel + trinket_token_gold.png), tier gold. |
| icon_trinket_token_iron | ui/icon_trinket_token_iron.png | 1 | 32x32 | K2 item icon trinket_token_iron (rendered from trinket_token.bbmodel + trinket_token_iron.png), tier iron. |
| icon_trinket_token_silver | ui/icon_trinket_token_silver.png | 1 | 32x32 | K2 item icon trinket_token_silver (rendered from trinket_token.bbmodel + trinket_token_silver.png), tier silver. |
| icon_trinket_token_steel | ui/icon_trinket_token_steel.png | 1 | 32x32 | K2 item icon trinket_token_steel (rendered from trinket_token.bbmodel + trinket_token_steel.png), tier steel. |
| icon_trinket_token_tin | ui/icon_trinket_token_tin.png | 1 | 32x32 | K2 item icon trinket_token_tin (rendered from trinket_token.bbmodel + trinket_token_tin.png), tier tin. |
| icon_wand_acolyte | ui/icon_wand_acolyte.png | 1 | 32x32 | K2 item icon wand_acolyte (rendered from wand_acolyte.bbmodel), tier None. |
| icon_wand_adept_acolyte | ui/icon_wand_adept_acolyte.png | 1 | 32x32 | K2 item icon wand_adept_acolyte (rendered from wand_adept_acolyte.bbmodel), tier None. |
| icon_wand_grand_magician | ui/icon_wand_grand_magician.png | 1 | 32x32 | K2 item icon wand_grand_magician (rendered from wand_grand_magician.bbmodel), tier None. |
| icon_wand_mage | ui/icon_wand_mage.png | 1 | 32x32 | K2 item icon wand_mage (rendered from wand_mage.bbmodel), tier None. |
| icon_wand_master_mage | ui/icon_wand_master_mage.png | 1 | 32x32 | K2 item icon wand_master_mage (rendered from wand_master_mage.bbmodel), tier None. |
| icon_wand_novice_acolyte | ui/icon_wand_novice_acolyte.png | 1 | 32x32 | K2 item icon wand_novice_acolyte (rendered from wand.bbmodel), tier None. |
| icon_barracks | ui/icon_barracks.png | 1 | 32x32 | K3 building icon barracks: barracks. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_brazier | ui/icon_brazier.png | 1 | 32x32 | K3 building icon brazier: brazier (light). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_cook_hut | ui/icon_cook_hut.png | 1 | 32x32 | K3 building icon cook_hut: cook_hut. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_cooking_campfire | ui/icon_cooking_campfire.png | 1 | 32x32 | K3 building icon cooking_campfire: cooking_campfire. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_crop_field_t1 | ui/icon_crop_field_t1.png | 1 | 32x32 | K3 building icon crop_field_t1: crop field tier 1 (farm_field_t1 + ripe wheat rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_crop_field_t2 | ui/icon_crop_field_t2.png | 1 | 32x32 | K3 building icon crop_field_t2: crop field tier 2 (farm_field_t2 + ripe wheat rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_crop_field_t3 | ui/icon_crop_field_t3.png | 1 | 32x32 | K3 building icon crop_field_t3: crop field tier 3 (farm_field_t3 + ripe wheat rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_farmhouse_t1 | ui/icon_farmhouse_t1.png | 1 | 32x32 | K3 building icon farmhouse_t1: farmhouse tier 1. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_farmhouse_t2 | ui/icon_farmhouse_t2.png | 1 | 32x32 | K3 building icon farmhouse_t2: farmhouse tier 2. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_farmhouse_t3 | ui/icon_farmhouse_t3.png | 1 | 32x32 | K3 building icon farmhouse_t3: farmhouse tier 3. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_fishing_dock | ui/icon_fishing_dock.png | 1 | 32x32 | K3 building icon fishing_dock: fishing_dock. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_forge_l1 | ui/icon_forge_l1.png | 1 | 32x32 | K3 building icon forge_l1: forge level 1: Casting Hearth. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_forge_l2 | ui/icon_forge_l2.png | 1 | 32x32 | K3 building icon forge_l2: forge level 2: Bloomery. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_forge_l3 | ui/icon_forge_l3.png | 1 | 32x32 | K3 building icon forge_l3: forge level 3: Ironworks. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_forge_l4 | ui/icon_forge_l4.png | 1 | 32x32 | K3 building icon forge_l4: forge level 4: Steelworks. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_foundry | ui/icon_foundry.png | 1 | 32x32 | K3 building icon foundry: foundry. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_gate_hardwood | ui/icon_gate_hardwood.png | 1 | 32x32 | K3 building icon gate_hardwood: hardwood gate (between two wall segments). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_gate_softwood | ui/icon_gate_softwood.png | 1 | 32x32 | K3 building icon gate_softwood: softwood gate (between two wall segments). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_gate_stone | ui/icon_gate_stone.png | 1 | 32x32 | K3 building icon gate_stone: stone gate (between two wall segments). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_grand_academy | ui/icon_grand_academy.png | 1 | 32x32 | K3 building icon grand_academy: grand_academy. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_grand_kitchen | ui/icon_grand_kitchen.png | 1 | 32x32 | K3 building icon grand_kitchen: grand_kitchen. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_great_kitchen | ui/icon_great_kitchen.png | 1 | 32x32 | K3 building icon great_kitchen: great_kitchen. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_gunnery_yard | ui/icon_gunnery_yard.png | 1 | 32x32 | K3 building icon gunnery_yard: gunnery_yard. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_herb_bed_t1 | ui/icon_herb_bed_t1.png | 1 | 32x32 | K3 building icon herb_bed_t1: herb bed tier 1 (farm_field_t1 + herb/flax rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_herb_bed_t2 | ui/icon_herb_bed_t2.png | 1 | 32x32 | K3 building icon herb_bed_t2: herb bed tier 2 (farm_field_t2 + herb/flax rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_herb_bed_t3 | ui/icon_herb_bed_t3.png | 1 | 32x32 | K3 building icon herb_bed_t3: herb bed tier 3 (farm_field_t3 + herb/flax rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_herbalist_hut | ui/icon_herbalist_hut.png | 1 | 32x32 | K3 building icon herbalist_hut: herbalist_hut. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_kiln | ui/icon_kiln.png | 1 | 32x32 | K3 building icon kiln: kiln. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_kitchen | ui/icon_kitchen.png | 1 | 32x32 | K3 building icon kitchen: kitchen. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_lantern | ui/icon_lantern.png | 1 | 32x32 | K3 building icon lantern: lantern (light). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_livestock_farm_t1 | ui/icon_livestock_farm_t1.png | 1 | 32x32 | K3 building icon livestock_farm_t1: livestock farm tier 1 (livestock_farm). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_livestock_farm_t2 | ui/icon_livestock_farm_t2.png | 1 | 32x32 | K3 building icon livestock_farm_t2: livestock farm tier 2 (livestock_farm + hens + cow; only one livestock model exists). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_livestock_farm_t3 | ui/icon_livestock_farm_t3.png | 1 | 32x32 | K3 building icon livestock_farm_t3: livestock farm tier 3 (+ more stock). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_lumber_mill | ui/icon_lumber_mill.png | 1 | 32x32 | K3 building icon lumber_mill: lumber_mill. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_lumber_mill_t2 | ui/icon_lumber_mill_t2.png | 1 | 32x32 | K3 building icon lumber_mill_t2: lumber mill upgrade (waterwheel saw). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_magi_sanctum | ui/icon_magi_sanctum.png | 1 | 32x32 | K3 building icon magi_sanctum: magi_sanctum. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l1 | ui/icon_main_base_l1.png | 1 | 32x32 | K3 building icon main_base_l1: main base level 1: Big House. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l10 | ui/icon_main_base_l10.png | 1 | 32x32 | K3 building icon main_base_l10: main base level 10: Citadel. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l2 | ui/icon_main_base_l2.png | 1 | 32x32 | K3 building icon main_base_l2: main base level 2: Longhall. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l3 | ui/icon_main_base_l3.png | 1 | 32x32 | K3 building icon main_base_l3: main base level 3: Hall. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l4 | ui/icon_main_base_l4.png | 1 | 32x32 | K3 building icon main_base_l4: main base level 4: Stockade Hall. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l5 | ui/icon_main_base_l5.png | 1 | 32x32 | K3 building icon main_base_l5: main base level 5: Stone Hall. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l6 | ui/icon_main_base_l6.png | 1 | 32x32 | K3 building icon main_base_l6: main base level 6: Keep. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l7 | ui/icon_main_base_l7.png | 1 | 32x32 | K3 building icon main_base_l7: main base level 7: Fortified Keep. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l8 | ui/icon_main_base_l8.png | 1 | 32x32 | K3 building icon main_base_l8: main base level 8: Castle. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_main_base_l9 | ui/icon_main_base_l9.png | 1 | 32x32 | K3 building icon main_base_l9: main base level 9: Marble Castle. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_mineshaft_t1 | ui/icon_mineshaft_t1.png | 1 | 32x32 | K3 building icon mineshaft_t1: mineshaft tier 1. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_mineshaft_t2 | ui/icon_mineshaft_t2.png | 1 | 32x32 | K3 building icon mineshaft_t2: mineshaft tier 2. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_mineshaft_t3 | ui/icon_mineshaft_t3.png | 1 | 32x32 | K3 building icon mineshaft_t3: mineshaft tier 3. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_pen_barn | ui/icon_pen_barn.png | 1 | 32x32 | K3 building icon pen_barn: pen_barn. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_powder_mill | ui/icon_powder_mill.png | 1 | 32x32 | K3 building icon powder_mill: powder_mill. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_ramp_earth | ui/icon_ramp_earth.png | 1 | 32x32 | K3 building icon ramp_earth: earth ramp. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_ramp_lumber | ui/icon_ramp_lumber.png | 1 | 32x32 | K3 building icon ramp_lumber: lumber ramp. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_ramp_stone | ui/icon_ramp_stone.png | 1 | 32x32 | K3 building icon ramp_stone: stone ramp. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_scholars_lodge | ui/icon_scholars_lodge.png | 1 | 32x32 | K3 building icon scholars_lodge: scholars_lodge. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_scriptorium | ui/icon_scriptorium.png | 1 | 32x32 | K3 building icon scriptorium: scriptorium. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_stables | ui/icon_stables.png | 1 | 32x32 | K3 building icon stables: stables. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_storehouse | ui/icon_storehouse.png | 1 | 32x32 | K3 building icon storehouse: storehouse. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_tannery | ui/icon_tannery.png | 1 | 32x32 | K3 building icon tannery: tannery. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_torch_post | ui/icon_torch_post.png | 1 | 32x32 | K3 building icon torch_post: torch_post (light). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_torch_wall | ui/icon_torch_wall.png | 1 | 32x32 | K3 building icon torch_wall: torch_wall (light). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_tower_hardwood | ui/icon_tower_hardwood.png | 1 | 32x32 | K3 building icon tower_hardwood: hardwood tower. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_tower_softwood | ui/icon_tower_softwood.png | 1 | 32x32 | K3 building icon tower_softwood: softwood tower. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_tower_stone | ui/icon_tower_stone.png | 1 | 32x32 | K3 building icon tower_stone: stone tower. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_vegetable_farm_t1 | ui/icon_vegetable_farm_t1.png | 1 | 32x32 | K3 building icon vegetable_farm_t1: vegetable farm tier 1 (farm_field_t1 + potato/carrot/corn rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_vegetable_farm_t2 | ui/icon_vegetable_farm_t2.png | 1 | 32x32 | K3 building icon vegetable_farm_t2: vegetable farm tier 2 (farm_field_t2 + potato/carrot/corn rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_vegetable_farm_t3 | ui/icon_vegetable_farm_t3.png | 1 | 32x32 | K3 building icon vegetable_farm_t3: vegetable farm tier 3 (farm_field_t3 + potato/carrot/corn rows). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_wall_hardwood | ui/icon_wall_hardwood.png | 1 | 32x32 | K3 building icon wall_hardwood: hardwood wall (four 16 u segments in a row, outer face toward the viewer). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_wall_softwood | ui/icon_wall_softwood.png | 1 | 32x32 | K3 building icon wall_softwood: softwood wall (four 16 u segments in a row, outer face toward the viewer). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_wall_stone | ui/icon_wall_stone.png | 1 | 32x32 | K3 building icon wall_stone: stone wall (four 16 u segments in a row, outer face toward the viewer). 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_workshop_t1 | ui/icon_workshop_t1.png | 1 | 32x32 | K3 building icon workshop_t1: workshop tier 1: Work Hut. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_workshop_t2 | ui/icon_workshop_t2.png | 1 | 32x32 | K3 building icon workshop_t2: workshop tier 2: Workshop. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_workshop_t3 | ui/icon_workshop_t3.png | 1 | 32x32 | K3 building icon workshop_t3: workshop tier 3: Great Workshop. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_workshop_t4 | ui/icon_workshop_t4.png | 1 | 32x32 | K3 building icon workshop_t4: workshop tier 4: Manufactory. 32x32 three-quarter view, 1px dark outline, top-left light. Rendered from the F models. |
| icon_cmd_attack | ui/icon_cmd_attack.png | 1 | 32x32 | K4 Attack: a sword. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_back | ui/icon_cmd_back.png | 1 | 32x32 | K4 Back: a curved arrow pointing left. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_build_advanced | ui/icon_cmd_build_advanced.png | 1 | 32x32 | K4 Build Advanced Structures: a hammer and a cut stone block. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_build_basic | ui/icon_cmd_build_basic.png | 1 | 32x32 | K4 Build Basic Structures: a hammer and a log. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_cancel | ui/icon_cmd_cancel.png | 1 | 32x32 | K4 Cancel: a red cross. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_craft | ui/icon_cmd_craft.png | 1 | 32x32 | K4 Craft: an anvil with a hammer. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_dig | ui/icon_cmd_dig.png | 1 | 32x32 | K4 Dig: a shovel in earth. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_enter | ui/icon_cmd_enter.png | 1 | 32x32 | K4 Enter: a doorway with an arrow going in. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_gather | ui/icon_cmd_gather.png | 1 | 32x32 | K4 Gather: an axe struck into a tree stump. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_hold | ui/icon_cmd_hold.png | 1 | 32x32 | K4 Hold Position: a shield planted in the ground. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_hunt | ui/icon_cmd_hunt.png | 1 | 32x32 | K4 Hunt: a spear over a deer track. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_move | ui/icon_cmd_move.png | 1 | 32x32 | K4 Move: a boot. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_patrol | ui/icon_cmd_patrol.png | 1 | 32x32 | K4 Patrol: two arrows chasing each other in a loop. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_prospect | ui/icon_cmd_prospect.png | 1 | 32x32 | K4 Prospect: a small hammer tapping a rock, with a glint. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_rally | ui/icon_cmd_rally.png | 1 | 32x32 | K4 Set Rally Point: a flag (player-1 blue). 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_refurbish | ui/icon_cmd_refurbish.png | 1 | 32x32 | K4 Refurbish: an anvil with a curved arrow. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_repair | ui/icon_cmd_repair.png | 1 | 32x32 | K4 Repair: a hammer over a plank. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_return_cargo | ui/icon_cmd_return_cargo.png | 1 | 32x32 | K4 Return Cargo: a sack with an arrow toward a house. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_stop | ui/icon_cmd_stop.png | 1 | 32x32 | K4 Stop: an open hand. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_cmd_unload_all | ui/icon_cmd_unload_all.png | 1 | 32x32 | K4 Unload All: a doorway with three arrows coming out. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_research_bronze | ui/icon_research_bronze.png | 1 | 32x32 | K4 research icon: bronze (bronze ingot), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_cannons | ui/icon_research_cannons.png | 1 | 32x32 | K4 research icon: cannons (bronze field cannon), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_crossbows | ui/icon_research_crossbows.png | 1 | 32x32 | K4 research icon: crossbows (crossbow), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_flint_tools | ui/icon_research_flint_tools.png | 1 | 32x32 | K4 research icon: flint tools (flint axe and pick crossed), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_gunpowder | ui/icon_research_gunpowder.png | 1 | 32x32 | K4 research icon: gunpowder (powder keg), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_halberds | ui/icon_research_halberds.png | 1 | 32x32 | K4 research icon: halberds (steel halberd), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_hq_steel | ui/icon_research_hq_steel.png | 1 | 32x32 | K4 research icon: high-quality steel (HQ steel ingot), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_mineshaft_1 | ui/icon_research_mineshaft_1.png | 1 | 32x32 | K4 research icon: Mineshaft I, with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_mineshaft_2 | ui/icon_research_mineshaft_2.png | 1 | 32x32 | K4 research icon: Mineshaft II, with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_mineshaft_3 | ui/icon_research_mineshaft_3.png | 1 | 32x32 | K4 research icon: Mineshaft III, with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_muskets | ui/icon_research_muskets.png | 1 | 32x32 | K4 research icon: muskets (musket), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_siege_engines | ui/icon_research_siege_engines.png | 1 | 32x32 | K4 research icon: siege engines (catapult), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_steel | ui/icon_research_steel.png | 1 | 32x32 | K4 research icon: steel (steel ingot), with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_research_steel_crossbow | ui/icon_research_steel_crossbow.png | 1 | 32x32 | K4 research icon: steel crossbow, with an open-book badge top-left. 32x32, bottom-right kept plain for the hotkey letter. |
| icon_spell_arcane_bolt | ui/icon_spell_arcane_bolt.png | 1 | 32x32 | K4 spell Arcane Bolt (battle mage): a violet orb. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_area_blast | ui/icon_spell_area_blast.png | 1 | 32x32 | K4 spell Area Blast (battle mage): a violet burst on the ground. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_beam | ui/icon_spell_beam.png | 1 | 32x32 | K4 spell Beam (battle mage): a violet line between two points. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_counterspell | ui/icon_spell_counterspell.png | 1 | 32x32 | K4 spell Counterspell (support mage): a wand snapping a spark in two. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_fireball | ui/icon_spell_fireball.png | 1 | 32x32 | K4 spell Fireball (battle mage): an orange ball of fire. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_fortify | ui/icon_spell_fortify.png | 1 | 32x32 | K4 spell Fortify (support mage): a gold shield inside a ring of light. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_heal | ui/icon_spell_heal.png | 1 | 32x32 | K4 spell Heal (support mage): a green-gold cross of light. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_quicken | ui/icon_spell_quicken.png | 1 | 32x32 | K4 spell Quicken (support mage): a blue winged boot. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_rally | ui/icon_spell_rally.png | 1 | 32x32 | K4 spell Rally (support mage): a gold banner. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_spell_warding | ui/icon_spell_warding.png | 1 | 32x32 | K4 spell Warding (support mage): a green rune circle. Magic colours are saturated by the style rule. 32x32, bottom-right 8x8 kept plain for the hotkey letter. |
| icon_train_ballista | ui/icon_train_ballista.png | 1 | 32x32 | K4 training icon for ballista: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_bull | ui/icon_train_bull.png | 1 | 32x32 | K4 training icon for bull: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_cannon | ui/icon_train_cannon.png | 1 | 32x32 | K4 training icon for cannon: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_catapult | ui/icon_train_catapult.png | 1 | 32x32 | K4 training icon for catapult: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_cow | ui/icon_train_cow.png | 1 | 32x32 | K4 training icon for cow: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_hand_cart | ui/icon_train_hand_cart.png | 1 | 32x32 | K4 training icon for hand_cart: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_hen | ui/icon_train_hen.png | 1 | 32x32 | K4 training icon for hen: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_horse | ui/icon_train_horse.png | 1 | 32x32 | K4 training icon for horse: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_mage_battle | ui/icon_train_mage_battle.png | 1 | 32x32 | K4 training icon for mage_battle: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_mage_support | ui/icon_train_mage_support.png | 1 | 32x32 | K4 training icon for mage_support: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_ox | ui/icon_train_ox.png | 1 | 32x32 | K4 training icon for ox: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_ox_cart | ui/icon_train_ox_cart.png | 1 | 32x32 | K4 training icon for ox_cart: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_rooster | ui/icon_train_rooster.png | 1 | 32x32 | K4 training icon for rooster: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_axe | ui/icon_train_warrior_axe.png | 1 | 32x32 | K4 training icon for warrior_axe: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_bow | ui/icon_train_warrior_bow.png | 1 | 32x32 | K4 training icon for warrior_bow: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_cannon_crew | ui/icon_train_warrior_cannon_crew.png | 1 | 32x32 | K4 training icon for warrior_cannon_crew: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_club | ui/icon_train_warrior_club.png | 1 | 32x32 | K4 training icon for warrior_club: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_crossbow | ui/icon_train_warrior_crossbow.png | 1 | 32x32 | K4 training icon for warrior_crossbow: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_halberd | ui/icon_train_warrior_halberd.png | 1 | 32x32 | K4 training icon for warrior_halberd: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_javelin | ui/icon_train_warrior_javelin.png | 1 | 32x32 | K4 training icon for warrior_javelin: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_mace | ui/icon_train_warrior_mace.png | 1 | 32x32 | K4 training icon for warrior_mace: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_mounted | ui/icon_train_warrior_mounted.png | 1 | 32x32 | K4 training icon for warrior_mounted: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_musket | ui/icon_train_warrior_musket.png | 1 | 32x32 | K4 training icon for warrior_musket: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_pike | ui/icon_train_warrior_pike.png | 1 | 32x32 | K4 training icon for warrior_pike: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_sling | ui/icon_train_warrior_sling.png | 1 | 32x32 | K4 training icon for warrior_sling: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_spear | ui/icon_train_warrior_spear.png | 1 | 32x32 | K4 training icon for warrior_spear: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_warrior_sword | ui/icon_train_warrior_sword.png | 1 | 32x32 | K4 training icon for warrior_sword: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| icon_train_worker_labourer | ui/icon_train_worker_labourer.png | 1 | 32x32 | K4 training icon for worker_labourer: the K6 portrait framing re-rendered at 32x32 on the portrait background (game draws the hotkey letter bottom-right). |
| cursor_attack | ui/cursor_attack.png | 1 | 32x32 | K9 cursor attack: red attack reticle (ring and cross-hair); hotspot at the centre. 32x32. Hotspot (click point) x=15, y=15 (pixels from top-left). |
| cursor_dig | ui/cursor_dig.png | 1 | 32x32 | K9 cursor dig: dig: a shovel, blade tip at top-left; hotspot at the blade tip. 32x32. Hotspot (click point) x=1, y=1 (pixels from top-left). |
| cursor_enter | ui/cursor_enter.png | 1 | 32x32 | K9 cursor enter: enter: an arrow pointing into a doorway; hotspot at the arrow's tail at top-left. 32x32. Hotspot (click point) x=1, y=1 (pixels from top-left). |
| cursor_gather | ui/cursor_gather.png | 1 | 32x32 | K9 cursor gather: gather: an axe, blade at top-left; hotspot on the blade edge. 32x32. Hotspot (click point) x=14, y=4 (pixels from top-left). |
| cursor_hunt | ui/cursor_hunt.png | 1 | 32x32 | K9 cursor hunt: hunt: a spear, point at top-left; hotspot at the spear point. 32x32. Hotspot (click point) x=1, y=1 (pixels from top-left). |
| cursor_move | ui/cursor_move.png | 1 | 32x32 | K9 cursor move: green move reticle; hotspot at the centre. 32x32. Hotspot (click point) x=15, y=15 (pixels from top-left). |
| cursor_not_allowed | ui/cursor_not_allowed.png | 1 | 32x32 | K9 cursor not_allowed: not allowed: a red barred circle; hotspot at the centre. 32x32. Hotspot (click point) x=15, y=15 (pixels from top-left). |
| cursor_pan_e | ui/cursor_pan_e.png | 1 | 32x32 | K9 cursor pan_e: screen-edge pan arrow pointing E; hotspot at the arrow tip. 32x32. Hotspot (click point) x=28, y=16 (pixels from top-left). |
| cursor_pan_n | ui/cursor_pan_n.png | 1 | 32x32 | K9 cursor pan_n: screen-edge pan arrow pointing N; hotspot at the arrow tip. 32x32. Hotspot (click point) x=16, y=2 (pixels from top-left). |
| cursor_pan_ne | ui/cursor_pan_ne.png | 1 | 32x32 | K9 cursor pan_ne: screen-edge pan arrow pointing NE; hotspot at the arrow tip. 32x32. Hotspot (click point) x=27, y=4 (pixels from top-left). |
| cursor_pan_nw | ui/cursor_pan_nw.png | 1 | 32x32 | K9 cursor pan_nw: screen-edge pan arrow pointing NW; hotspot at the arrow tip. 32x32. Hotspot (click point) x=4, y=4 (pixels from top-left). |
| cursor_pan_s | ui/cursor_pan_s.png | 1 | 32x32 | K9 cursor pan_s: screen-edge pan arrow pointing S; hotspot at the arrow tip. 32x32. Hotspot (click point) x=16, y=28 (pixels from top-left). |
| cursor_pan_se | ui/cursor_pan_se.png | 1 | 32x32 | K9 cursor pan_se: screen-edge pan arrow pointing SE; hotspot at the arrow tip. 32x32. Hotspot (click point) x=27, y=27 (pixels from top-left). |
| cursor_pan_sw | ui/cursor_pan_sw.png | 1 | 32x32 | K9 cursor pan_sw: screen-edge pan arrow pointing SW; hotspot at the arrow tip. 32x32. Hotspot (click point) x=4, y=27 (pixels from top-left). |
| cursor_pan_w | ui/cursor_pan_w.png | 1 | 32x32 | K9 cursor pan_w: screen-edge pan arrow pointing W; hotspot at the arrow tip. 32x32. Hotspot (click point) x=2, y=16 (pixels from top-left). |
| cursor_patrol | ui/cursor_patrol.png | 1 | 32x32 | K9 cursor patrol: yellow patrol reticle; hotspot at the centre. 32x32. Hotspot (click point) x=15, y=15 (pixels from top-left). |
| cursor_pointer | ui/cursor_pointer.png | 1 | 32x32 | K9 cursor pointer: default pointer arrow, pale parchment with a dark outline. 32x32. Hotspot (click point) x=1, y=1 (pixels from top-left). |
| cursor_repair | ui/cursor_repair.png | 1 | 32x32 | K9 cursor repair: repair: a hammer, head at top-left; hotspot at the head's striking corner. 32x32. Hotspot (click point) x=3, y=3 (pixels from top-left). |
| icon_rank_mage_acolyte | ui/icon_rank_mage_acolyte.png | 1 | 16x16 | K7 mage rank 2 (Acolyte): 2 small violet gem(s). 16x16 badge for portraits and above units. |
| icon_rank_mage_adept_acolyte | ui/icon_rank_mage_adept_acolyte.png | 1 | 16x16 | K7 mage rank 3 (Adept Acolyte): 3 small violet gem(s). 16x16 badge for portraits and above units. |
| icon_rank_mage_grand_magician | ui/icon_rank_mage_grand_magician.png | 1 | 16x16 | K7 mage rank 6 (Grand Magician): 6 small violet gem(s), gold border. 16x16 badge for portraits and above units. |
| icon_rank_mage_mage | ui/icon_rank_mage_mage.png | 1 | 16x16 | K7 mage rank 4 (Mage): 4 small violet gem(s). 16x16 badge for portraits and above units. |
| icon_rank_mage_master_mage | ui/icon_rank_mage_master_mage.png | 1 | 16x16 | K7 mage rank 5 (Master Mage): 5 small violet gem(s). 16x16 badge for portraits and above units. |
| icon_rank_mage_novice_acolyte | ui/icon_rank_mage_novice_acolyte.png | 1 | 16x16 | K7 mage rank 1 (Novice Acolyte): 1 small violet gem(s). 16x16 badge for portraits and above units. |
| icon_rank_warrior_champion | ui/icon_rank_warrior_champion.png | 1 | 16x16 | K7 warrior rank 5 (Champion): 3 silver chevrons. 16x16 badge for portraits and above units. |
| icon_rank_warrior_elite | ui/icon_rank_warrior_elite.png | 1 | 16x16 | K7 warrior rank 4 (Elite): 2 silver chevrons. 16x16 badge for portraits and above units. |
| icon_rank_warrior_hero | ui/icon_rank_warrior_hero.png | 1 | 16x16 | K7 warrior rank 6 (Hero): a gold star. 16x16 badge for portraits and above units. |
| icon_rank_warrior_recruit | ui/icon_rank_warrior_recruit.png | 1 | 16x16 | K7 warrior rank 1 (Recruit): 1 bronze chevron. 16x16 badge for portraits and above units. |
| icon_rank_warrior_soldier | ui/icon_rank_warrior_soldier.png | 1 | 16x16 | K7 warrior rank 2 (Soldier): 2 bronze chevrons. 16x16 badge for portraits and above units. |
| icon_rank_warrior_veteran | ui/icon_rank_warrior_veteran.png | 1 | 16x16 | K7 warrior rank 3 (Veteran): 3 bronze chevrons. 16x16 badge for portraits and above units. |
| icon_rank_worker_hand | ui/icon_rank_worker_hand.png | 1 | 16x16 | K7 worker rank 2 (Hand): 2 small tool mark(s). 16x16 badge for portraits and above units. |
| icon_rank_worker_labourer | ui/icon_rank_worker_labourer.png | 1 | 16x16 | K7 worker rank 1 (Labourer): 1 small tool mark(s). 16x16 badge for portraits and above units. |
| icon_rank_worker_master | ui/icon_rank_worker_master.png | 1 | 16x16 | K7 worker rank 3 (Master): 3 small tool mark(s). 16x16 badge for portraits and above units. |
| icon_status_burning | ui/icon_status_burning.png | 1 | 16x16 | K7 status burning: a flame. 16x16 badge for portraits and above units. |
| icon_status_carrying | ui/icon_status_carrying.png | 1 | 16x16 | K7 status carrying a load: a sack. 16x16 badge for portraits and above units. |
| icon_status_cursed | ui/icon_status_cursed.png | 1 | 16x16 | K7 status cursed: a violet broken ring. 16x16 badge for portraits and above units. |
| icon_status_fortified | ui/icon_status_fortified.png | 1 | 16x16 | K7 status fortified: a gold shield. 16x16 badge for portraits and above units. |
| icon_status_hexed | ui/icon_status_hexed.png | 1 | 16x16 | K7 status hexed: a green spiral. 16x16 badge for portraits and above units. |
| icon_status_hungry | ui/icon_status_hungry.png | 1 | 16x16 | K7 status hungry: an empty bowl. 16x16 badge for portraits and above units. |
| icon_status_idle | ui/icon_status_idle.png | 1 | 16x16 | K7 status idle: zZ. 16x16 badge for portraits and above units. |
| icon_status_mana_drained | ui/icon_status_mana_drained.png | 1 | 16x16 | K7 status mana drained: an empty blue drop. 16x16 badge for portraits and above units. |
| icon_status_poisoned | ui/icon_status_poisoned.png | 1 | 16x16 | K7 status poisoned: a green drop. 16x16 badge for portraits and above units. |
| icon_status_quickened | ui/icon_status_quickened.png | 1 | 16x16 | K7 status quickened: a blue boot. 16x16 badge for portraits and above units. |
| icon_status_rallied | ui/icon_status_rallied.png | 1 | 16x16 | K7 status rallied: a gold banner. 16x16 badge for portraits and above units. |
| icon_status_sheltered | ui/icon_status_sheltered.png | 1 | 16x16 | K7 status sheltered: a roof. 16x16 badge for portraits and above units. |
| icon_status_starving | ui/icon_status_starving.png | 1 | 16x16 | K7 status starving: a cracked red bowl (danger red). 16x16 badge for portraits and above units. |
| icon_util_allies | ui/icon_util_allies.png | 1 | 16x16 | K5 Allies: two hands clasped. 16x16 utility-bar icon. |
| icon_util_auto_equip | ui/icon_util_auto_equip.png | 1 | 16x16 | K5 Auto-Equip: a helmet with a plus. 16x16 utility-bar icon. |
| icon_util_camera | ui/icon_util_camera.png | 1 | 16x16 | K5 Camera Location (blank): a camera frame with a number slot at the bottom right (game draws the number). 16x16 utility-bar icon. |
| icon_util_camera_1 | ui/icon_util_camera_1.png | 1 | 16x16 | K5 Camera Location 1: camera frame with the number 1 in the slot. 16x16 utility-bar icon. |
| icon_util_camera_2 | ui/icon_util_camera_2.png | 1 | 16x16 | K5 Camera Location 2: camera frame with the number 2 in the slot. 16x16 utility-bar icon. |
| icon_util_camera_3 | ui/icon_util_camera_3.png | 1 | 16x16 | K5 Camera Location 3: camera frame with the number 3 in the slot. 16x16 utility-bar icon. |
| icon_util_camera_4 | ui/icon_util_camera_4.png | 1 | 16x16 | K5 Camera Location 4: camera frame with the number 4 in the slot. 16x16 utility-bar icon. |
| icon_util_everyone_home | ui/icon_util_everyone_home.png | 1 | 16x16 | K5 Everyone Home: a house with a moon above it. 16x16 utility-bar icon. |
| icon_util_follow | ui/icon_util_follow.png | 1 | 16x16 | K5 Follow: an eye. 16x16 utility-bar icon. |
| icon_util_idle_gatherer | ui/icon_util_idle_gatherer.png | 1 | 16x16 | K5 Idle Gatherer: a worker leaning on an axe; the right 5 columns are left free for a small count number. 16x16 utility-bar icon. |
| icon_util_menu | ui/icon_util_menu.png | 1 | 16x16 | K5 Menu: three bars. 16x16 utility-bar icon. |
| icon_util_queue_mode | ui/icon_util_queue_mode.png | 1 | 16x16 | K5 Queue Mode: three stacked arrows. 16x16 utility-bar icon. |
| icon_util_rations_all | ui/icon_util_rations_all.png | 1 | 16x16 | K5 Rations: Feed Everyone (a full bowl). 16x16 utility-bar icon. |
| icon_util_rations_troops | ui/icon_util_rations_troops.png | 1 | 16x16 | K5 Rations: Troops Only (a bowl with a sword). 16x16 utility-bar icon. |
| icon_util_rations_workers | ui/icon_util_rations_workers.png | 1 | 16x16 | K5 Rations: Workers Only (a bowl with an axe). 16x16 utility-bar icon. |
| icon_util_reset_zoom | ui/icon_util_reset_zoom.png | 1 | 16x16 | K5 Reset Zoom: a magnifier. 16x16 utility-bar icon. |
| icon_util_select_army | ui/icon_util_select_army.png | 1 | 16x16 | K5 Select Army: crossed swords. 16x16 utility-bar icon. |
| icon_util_send_resources | ui/icon_util_send_resources.png | 1 | 16x16 | K5 Send Resources: a sack with an arrow to the right. 16x16 utility-bar icon. |
| icon_util_town_hall | ui/icon_util_town_hall.png | 1 | 16x16 | K5 Town Hall: a little hall. 16x16 utility-bar icon. |
| minimap_alert | ui/minimap_alert.png | 4 | 64x16 | K8 alert: 16x16 red ring pulsing outward, 4 frames left to right in a 64x16 strip, 8 fps, loop. |
| minimap_dwarf_city | ui/minimap_dwarf_city.png | 1 | 12x12 | size 12x12 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap Dwarf city: 12x12 grey hall between two towers. |
| minimap_elf_capital | ui/minimap_elf_capital.png | 1 | 12x12 | size 12x12 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap Elf capital: 12x12 pale-gold hall with a tall spire. |
| minimap_gem | ui/minimap_gem.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap resource discovery (gems and gold): a small gem. |
| minimap_goblin_village | ui/minimap_goblin_village.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap goblin village: crude hut in sickly green on black. |
| minimap_lair | ui/minimap_lair.png | 1 | 10x10 | size 10x10 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap lair: 10x10 bone-white skull on dark red. |
| minimap_main_base | ui/minimap_main_base.png | 1 | 12x12 | size 12x12 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap main base: 12x12 crown-roofed hall, greyscale for team-colour tinting (multiply by the team colour). |
| minimap_main_base_p1 | ui/minimap_main_base_p1.png | 1 | 12x12 | size 12x12 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap main base pre-tinted in player-1 blue (52,96,178), for reference. |
| minimap_ore | ui/minimap_ore.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap resource discovery (ore): a small pick. |
| minimap_ping | ui/minimap_ping.png | 4 | 64x16 | K8 ping: 16x16 white-gold ring pulsing outward, 4 frames left to right in a 64x16 strip, 8 fps, loop. |
| minimap_village_dwarf | ui/minimap_village_dwarf.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap neutral village (dwarfs): 8x8 house in that people's colour. |
| minimap_village_elf | ui/minimap_village_elf.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap neutral village (elfs): 8x8 house in that people's colour. |
| minimap_village_halfling | ui/minimap_village_halfling.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap neutral village (halflings): 8x8 house in that people's colour. |
| minimap_village_runkin | ui/minimap_village_runkin.png | 1 | 8x8 | size 8x8 is not a power of two from 16 to 1024: it follows the wishlist's frame, cell or screen layout for this entry (left as drawn, not resized); K8 minimap neutral village (runkins): 8x8 house in that people's colour. |
| portrait_abyssal_drake | ui/portrait_abyssal_drake.png | 1 | 64x64 | K6 unit portrait abyssal_drake: purple demon: abyssal drake. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_archfiend | ui/portrait_archfiend.png | 1 | 64x64 | K6 unit portrait archfiend: purple demon: archfiend. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_ballista | ui/portrait_ballista.png | 1 | 64x64 | K6 unit portrait ballista: vehicle: ballista, close three-quarter view of the machine. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_barrow_knight | ui/portrait_barrow_knight.png | 1 | 64x64 | K6 unit portrait barrow_knight: walking dead: barrow knight. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_bear | ui/portrait_bear.png | 1 | 64x64 | K6 unit portrait bear: animal: bear. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_bloated_corpse | ui/portrait_bloated_corpse.png | 1 | 64x64 | K6 unit portrait bloated_corpse: walking dead: bloated corpse. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_bone_colossus | ui/portrait_bone_colossus.png | 1 | 64x64 | K6 unit portrait bone_colossus: walking dead: bone colossus. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_bull | ui/portrait_bull.png | 1 | 64x64 | K6 unit portrait bull: animal: bull. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_cannon | ui/portrait_cannon.png | 1 | 64x64 | K6 unit portrait cannon: vehicle: cannon, close three-quarter view of the machine. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_catapult | ui/portrait_catapult.png | 1 | 64x64 | K6 unit portrait catapult: vehicle: catapult, close three-quarter view of the machine. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_chain_fiend | ui/portrait_chain_fiend.png | 1 | 64x64 | K6 unit portrait chain_fiend: red demon: chain fiend. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_cinderling | ui/portrait_cinderling.png | 1 | 64x64 | K6 unit portrait cinderling: red demon: cinderling. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_cow | ui/portrait_cow.png | 1 | 64x64 | K6 unit portrait cow: animal: cow. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_deer | ui/portrait_deer.png | 1 | 64x64 | K6 unit portrait deer: animal: deer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_demon_brute | ui/portrait_demon_brute.png | 1 | 64x64 | K6 unit portrait demon_brute: red demon: demon brute. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_dwarf_crossbowman | ui/portrait_dwarf_crossbowman.png | 1 | 64x64 | K6 unit portrait dwarf_crossbowman: other peoples: dwarf crossbowman. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_dwarf_gunner | ui/portrait_dwarf_gunner.png | 1 | 64x64 | K6 unit portrait dwarf_gunner: other peoples: dwarf gunner. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_dwarf_hammerguard | ui/portrait_dwarf_hammerguard.png | 1 | 64x64 | K6 unit portrait dwarf_hammerguard: other peoples: dwarf hammerguard. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_dwarf_shieldbearer | ui/portrait_dwarf_shieldbearer.png | 1 | 64x64 | K6 unit portrait dwarf_shieldbearer: other peoples: dwarf shieldbearer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_dwarf_villager | ui/portrait_dwarf_villager.png | 1 | 64x64 | K6 unit portrait dwarf_villager: other peoples: dwarf villager. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_elf_bear_rider | ui/portrait_elf_bear_rider.png | 1 | 64x64 | K6 unit portrait elf_bear_rider: other peoples: elf bear rider. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_elf_bladewarden | ui/portrait_elf_bladewarden.png | 1 | 64x64 | K6 unit portrait elf_bladewarden: other peoples: elf bladewarden. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_elf_grovesinger | ui/portrait_elf_grovesinger.png | 1 | 64x64 | K6 unit portrait elf_grovesinger: other peoples: elf grovesinger. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_elf_longbow_ranger | ui/portrait_elf_longbow_ranger.png | 1 | 64x64 | K6 unit portrait elf_longbow_ranger: other peoples: elf longbow ranger. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_elf_villager | ui/portrait_elf_villager.png | 1 | 64x64 | K6 unit portrait elf_villager: other peoples: elf villager. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_fiend | ui/portrait_fiend.png | 1 | 64x64 | K6 unit portrait fiend: red demon: fiend. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_flamecaller | ui/portrait_flamecaller.png | 1 | 64x64 | K6 unit portrait flamecaller: red demon: flamecaller. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_giant_catfish | ui/portrait_giant_catfish.png | 1 | 64x64 | K6 unit portrait giant_catfish: animal: giant catfish. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_giant_spider | ui/portrait_giant_spider.png | 1 | 64x64 | K6 unit portrait giant_spider: existing-set creature: giant spider (model supplied in ref/). 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin | ui/portrait_goblin.png | 1 | 64x64 | K6 unit portrait goblin: goblin: goblin. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin_archer | ui/portrait_goblin_archer.png | 1 | 64x64 | K6 unit portrait goblin_archer: goblin: goblin archer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin_chief | ui/portrait_goblin_chief.png | 1 | 64x64 | K6 unit portrait goblin_chief: goblin: goblin chief. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin_mage | ui/portrait_goblin_mage.png | 1 | 64x64 | K6 unit portrait goblin_mage: goblin: goblin mage. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin_slinger | ui/portrait_goblin_slinger.png | 1 | 64x64 | K6 unit portrait goblin_slinger: goblin: goblin slinger. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_goblin_wolf_rider | ui/portrait_goblin_wolf_rider.png | 1 | 64x64 | K6 unit portrait goblin_wolf_rider: goblin wolf rider: goblin with a short spear on its saddled wolf. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and... |
| portrait_grave_hound | ui/portrait_grave_hound.png | 1 | 64x64 | K6 unit portrait grave_hound: walking dead: grave hound. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_gravewing | ui/portrait_gravewing.png | 1 | 64x64 | K6 unit portrait gravewing: walking dead: gravewing. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_halfling_archer | ui/portrait_halfling_archer.png | 1 | 64x64 | K6 unit portrait halfling_archer: other peoples: halfling archer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_halfling_female | ui/portrait_halfling_female.png | 1 | 64x64 | K6 unit portrait halfling_female: other peoples: halfling female. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_halfling_male | ui/portrait_halfling_male.png | 1 | 64x64 | K6 unit portrait halfling_male: other peoples: halfling male. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_halfling_spearman | ui/portrait_halfling_spearman.png | 1 | 64x64 | K6 unit portrait halfling_spearman: other peoples: halfling spearman. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_hand_cart | ui/portrait_hand_cart.png | 1 | 64x64 | K6 unit portrait hand_cart: vehicle: hand cart, close three-quarter view of the machine. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_hare | ui/portrait_hare.png | 1 | 64x64 | K6 unit portrait hare: animal: hare. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_hellhound | ui/portrait_hellhound.png | 1 | 64x64 | K6 unit portrait hellhound: red demon: hellhound. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_hen | ui/portrait_hen.png | 1 | 64x64 | K6 unit portrait hen: animal: hen. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_hollow_priest | ui/portrait_hollow_priest.png | 1 | 64x64 | K6 unit portrait hollow_priest: walking dead: hollow priest. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_horse | ui/portrait_horse.png | 1 | 64x64 | K6 unit portrait horse: animal: horse. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_infernal_juggernaut | ui/portrait_infernal_juggernaut.png | 1 | 64x64 | K6 unit portrait infernal_juggernaut: red demon: infernal juggernaut. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_mage_battle | ui/portrait_mage_battle.png | 1 | 64x64 | Deviation: built from warrior_base, because no worker or mage models exist (recoloured tunic, no beard, added apron, tool belt or robe and hair cubes); K6 unit portrait mage_battle: battle mage: woman with long black hair, purple robe with gold trim, a gold-capped wand. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_mage_support | ui/portrait_mage_support.png | 1 | 64x64 | Deviation: built from warrior_base, because no worker or mage models exist (recoloured tunic, no beard, added apron, tool belt or robe and hair cubes); K6 unit portrait mage_support: support mage: woman with long auburn hair, green robe with gold trim, a wand with a glowing gem. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and... |
| portrait_morvath | ui/portrait_morvath.png | 1 | 64x64 | K6 unit portrait morvath: purple demon: morvath (final boss, the Hollow Crown). 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_ox | ui/portrait_ox.png | 1 | 64x64 | K6 unit portrait ox: animal: ox. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_ox_cart | ui/portrait_ox_cart.png | 1 | 64x64 | K6 unit portrait ox_cart: vehicle: ox cart, close three-quarter view of the machine. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_plague_bearer | ui/portrait_plague_bearer.png | 1 | 64x64 | K6 unit portrait plague_bearer: walking dead: plague bearer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_rift_colossus | ui/portrait_rift_colossus.png | 1 | 64x64 | K6 unit portrait rift_colossus: purple demon: rift colossus. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_rooster | ui/portrait_rooster.png | 1 | 64x64 | K6 unit portrait rooster: animal: rooster. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_runkin_archer | ui/portrait_runkin_archer.png | 1 | 64x64 | K6 unit portrait runkin_archer: other peoples: runkin archer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_runkin_clubber | ui/portrait_runkin_clubber.png | 1 | 64x64 | K6 unit portrait runkin_clubber: other peoples: runkin clubber. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_runkin_female | ui/portrait_runkin_female.png | 1 | 64x64 | K6 unit portrait runkin_female: other peoples: runkin female. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_runkin_male | ui/portrait_runkin_male.png | 1 | 64x64 | K6 unit portrait runkin_male: other peoples: runkin male. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_salmon | ui/portrait_salmon.png | 1 | 64x64 | K6 unit portrait salmon: animal: salmon. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_scorchwing | ui/portrait_scorchwing.png | 1 | 64x64 | K6 unit portrait scorchwing: red demon: scorchwing. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_skeleton_archer | ui/portrait_skeleton_archer.png | 1 | 64x64 | K6 unit portrait skeleton_archer: walking dead: skeleton archer. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_skeleton_bomber | ui/portrait_skeleton_bomber.png | 1 | 64x64 | K6 unit portrait skeleton_bomber: walking dead: skeleton bomber. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_trout | ui/portrait_trout.png | 1 | 64x64 | K6 unit portrait trout: animal: trout. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_void_stalker | ui/portrait_void_stalker.png | 1 | 64x64 | K6 unit portrait void_stalker: purple demon: void stalker. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_void_witch | ui/portrait_void_witch.png | 1 | 64x64 | K6 unit portrait void_witch: purple demon: void witch. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
| portrait_warrior_axe | ui/portrait_warrior_axe.png | 1 | 64x64 | K6 unit portrait warrior_axe: warrior with a copper war axe, leather armour and cap. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_bow | ui/portrait_warrior_bow.png | 1 | 64x64 | K6 unit portrait warrior_bow: archer with a self bow, leather armour and cap. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_cannon_crew | ui/portrait_warrior_cannon_crew.png | 1 | 64x64 | K6 unit portrait warrior_cannon_crew: cannon crew with a rammer, leather armour. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_club | ui/portrait_warrior_club.png | 1 | 64x64 | K6 unit portrait warrior_club: warrior with a club, no armour (russet tunic). 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_crossbow | ui/portrait_warrior_crossbow.png | 1 | 64x64 | K6 unit portrait warrior_crossbow: crossbowman, iron mail and nasal helm. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_halberd | ui/portrait_warrior_halberd.png | 1 | 64x64 | K6 unit portrait warrior_halberd: warrior with a steel halberd, iron mail and steel sallet. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_javelin | ui/portrait_warrior_javelin.png | 1 | 64x64 | K6 unit portrait warrior_javelin: warrior with a bronze javelin, leather armour. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_mace | ui/portrait_warrior_mace.png | 1 | 64x64 | K6 unit portrait warrior_mace: warrior with an iron mace, iron mail and nasal helm. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_mounted | ui/portrait_warrior_mounted.png | 1 | 64x64 | K6 unit portrait warrior_mounted: mounted warrior: rider in iron mail and a bronze helmet with a spear, horse head in front. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and... |
| portrait_warrior_musket | ui/portrait_warrior_musket.png | 1 | 64x64 | K6 unit portrait warrior_musket: musketeer, leather armour and steel sallet. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_pike | ui/portrait_warrior_pike.png | 1 | 64x64 | K6 unit portrait warrior_pike: warrior with a steel pike, steel plate and sallet. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_sling | ui/portrait_warrior_sling.png | 1 | 64x64 | K6 unit portrait warrior_sling: warrior with a sling, no armour. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_spear | ui/portrait_warrior_spear.png | 1 | 64x64 | K6 unit portrait warrior_spear: warrior with a flint spear, leather cap. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_warrior_sword | ui/portrait_warrior_sword.png | 1 | 64x64 | K6 unit portrait warrior_sword: warrior with an iron sword, iron mail and nasal helm. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_wolf | ui/portrait_wolf.png | 1 | 64x64 | K6 unit portrait wolf: animal: wolf. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_worker_hand | ui/portrait_worker_hand.png | 1 | 64x64 | Deviation: built from warrior_base, because no worker or mage models exist (recoloured tunic, no beard, added apron, tool belt or robe and hair cubes); K6 unit portrait worker_hand: worker rank 2 (Hand): linen tunic with a leather apron. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_worker_labourer | ui/portrait_worker_labourer.png | 1 | 64x64 | Deviation: built from warrior_base, because no worker or mage models exist (recoloured tunic, no beard, added apron, tool belt or robe and hair cubes); K6 unit portrait worker_labourer: worker rank 1 (Labourer): plain undyed linen tunic. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and pixel-quantised. |
| portrait_worker_master | ui/portrait_worker_master.png | 1 | 64x64 | Deviation: built from warrior_base, because no worker or mage models exist (recoloured tunic, no beard, added apron, tool belt or robe and hair cubes); K6 unit portrait worker_master: worker rank 3 (Master): fine dyed tunic with gold trim and a tool belt, a mallet on the shoulder. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background. Rendered from the model and... |
| portrait_zombie | ui/portrait_zombie.png | 1 | 64x64 | K6 unit portrait zombie: walking dead: zombie. 64x64, head and shoulders, three-quarter view facing the viewer's left, dark plain background with a hostile tint. Rendered from the model and pixel-quantised. |
