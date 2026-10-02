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
| axe | models/items/axe/axe.bbmodel | 6 | 32x64 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| axe_flint | models/items/axe/axe_flint.bbmodel | 6 | 32x64 | extra file in axe/: flint axe (knapped head lashed on) |
| axe_hardwood | models/items/axe/axe_hardwood.bbmodel | 4 | 32x32 | extra file in axe/: hardwood axe |
| digging_stick | models/items/digging_stick/digging_stick.bbmodel | 4 | 64x64 |  |
| mallet | models/items/mallet/mallet.bbmodel | 4 | 32x32 |  |
| pick | models/items/pick/pick.bbmodel | 7 | 32x64 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| pick_flint | models/items/pick/pick_flint.bbmodel | 6 | 32x64 | extra file in pick/: flint pick |
| knife | models/items/knife/knife.bbmodel | 5 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sickle | models/items/sickle/sickle.bbmodel | 7 | 32x32 + 7 variants (bronze, copper, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| saw | models/items/saw/saw.bbmodel | 6 | 64x32 + 6 variants (bronze, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| hoe | models/items/hoe/hoe.bbmodel | 3 | 64x64 + 8 variants (bronze, copper, hardwood, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| plough | models/items/plough/plough.bbmodel | 13 | 64x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | 13 cubes (small-item cap 11): two handles, beam, share, mouldboard, landside and hitch ring each need their own cube; adds an hq_steel (high-quality steel) texture wherever steel is listed |
| fishing_rod | models/items/fishing_rod/fishing_rod.bbmodel | 6 | 64x32 |  |
| fishing_net | models/items/fishing_net/fishing_net.bbmodel | 5 | 32x32 |  |
| fishing_net_open | models/items/fishing_net/fishing_net_open.bbmodel | 7 | 128x256 | extra file in fishing_net/: net spread open |
| prospecting_hammer | models/items/prospecting_hammer/prospecting_hammer.bbmodel | 5 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| club | models/items/club/club.bbmodel | 6 | 32x32 |  |
| axe_war | models/items/axe_war/axe_war.bbmodel | 7 | 32x64 + 1 variants (copper) |  |
| axe_war_flint | models/items/axe_war/axe_war_flint.bbmodel | 7 | 32x64 | extra file in axe_war/: flint war axe |
| dagger | models/items/dagger/dagger.bbmodel | 6 | 32x32 + 1 variants (copper) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword_short | models/items/sword_short/sword_short.bbmodel | 7 | 32x32 + 1 variants (bronze) | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| sword | models/items/sword/sword.bbmodel | 6 | 32x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| sword_steel | models/items/sword/sword_steel.bbmodel | 7 | 32x64 + 2 variants (hq_steel, steel) | extra file in sword/: steel sword (different blade); adds an hq_steel (high-quality steel) texture wherever steel is listed |
| mace | models/items/mace/mace.bbmodel | 7 | 32x64 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| spear | models/items/spear/spear.bbmodel | 6 | 128x128 + 1 variants (bronze) |  |
| spear_flint | models/items/spear/spear_flint.bbmodel | 5 | 128x128 | extra file in spear/: flint spear |
| spear_hardwood | models/items/spear/spear_hardwood.bbmodel | 4 | 128x128 | extra file in spear/: fire-hardened wooden spear |
| pike | models/items/pike/pike.bbmodel | 7 | 256x128 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| halberd | models/items/halberd/halberd.bbmodel | 9 | 128x128 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| sling | models/items/sling/sling.bbmodel | 5 | 32x32 | texture padded from 16x32 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| javelin | models/items/javelin/javelin.bbmodel | 5 | 64x64 + 1 variants (bronze) |  |
| javelin_flint | models/items/javelin/javelin_flint.bbmodel | 4 | 64x64 | extra file in javelin/: flint javelin |
| bow | models/items/bow/bow.bbmodel | 8 | 64x64 |  |
| crossbow | models/items/crossbow/crossbow.bbmodel | 10 | 64x32 + 3 variants (iron_bloom, iron_refined, iron_wrought) |  |
| crossbow_steel | models/items/crossbow_steel/crossbow_steel.bbmodel | 11 | 64x64 + 2 variants (hq_steel, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| musket | models/items/musket/musket.bbmodel | 11 | 64x64 + 5 variants (hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| arrow | models/items/arrow/arrow.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt | models/items/bolt/bolt.bbmodel | 5 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| arrow_poison | models/items/arrow_poison/arrow_poison.bbmodel | 7 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed |
| bolt_poison | models/items/bolt_poison/bolt_poison.bbmodel | 6 | 32x32 + 7 variants (bronze, flint, hq_steel, iron_bloom, iron_refined, iron_wrought, steel) | adds an hq_steel (high-quality steel) texture wherever steel is listed; texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
| quiver | models/items/quiver/quiver.bbmodel | 7 | 32x32 |  |
| quiver_empty | models/items/quiver/quiver_empty.bbmodel | 4 | 32x32 | extra file in quiver/: empty quiver |
| bolt_case | models/items/bolt_case/bolt_case.bbmodel | 4 | 32x32 |  |
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
| wand | models/items/wand/wand.bbmodel | 2 | 32x32 | texture padded from 32x16 to the 32 px minimum (empty rows/columns, UVs unchanged) |
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
| fish_carried | models/items/fish_carried/fish_carried.bbmodel | 7 | 32x32 |  |
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
| cannon_rammer | models/mechanical/cannon_rammer/cannon_rammer.bbmodel | 4 | 64x64 | the rammer and the sponge/ladle are two files in this folder (see cannon_rammer_ladle) |
| cannon_rammer_ladle | models/mechanical/cannon_rammer/cannon_rammer_ladle.bbmodel | 6 | 64x64 | one piece of the cannon_rammer set, in its folder; extra file in cannon_rammer/: the powder ladle and sponge end |
| cannon_dwarf | models/mechanical/cannon_dwarf/cannon_dwarf.bbmodel | 51 | 256x128 | extra clips move_towed and aim; fire ends recoiled, so reload must follow; slot_hitch at the trail eye (+Z, towed trail-first); spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| catapult | models/mechanical/catapult/catapult.bbmodel | 59 | 256x256 | fire ends with the arm up, so reload must follow; in destroyed the broken tongue dips slightly into the ground |
| ballista | models/mechanical/ballista/ballista.bbmodel | 53 | 256x256 | extra clip move_towed; fire ends released, so reload must follow; ballista_bolt is section H and comes later (slot_bolt is ready); slot_hitch at the trail (+Z); in destroyed the trail shoe dips slightly into the ground; spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| cart_hand | models/mechanical/cart_hand/cart_hand.bbmodel | 24 | 128x128 | slot_hitch at the handle grips (+Z): it is pushed, not pulled |
| cart_ox | models/mechanical/cart_ox/cart_ox.bbmodel | 67 | 256x256 | 67 cubes: the wishlist sets no vehicle budget (above the 60 big-monster cap); the four spoked wheels are 13 cubes each; spoked wheels are octagons, so the rim dips up to 1.3 u below y = 0 at some rolling angles |
| elf_caravan_wagon | models/mechanical/elf_caravan_wagon/elf_caravan_wagon.bbmodel | 100 | 256x512 | 100 cubes: no vehicle budget in the wishlist; four wheels (44 cubes), carved trim, canopy and stall goods; `open` is its use clip (key 1.5 s); destroyed slumps about 15 degrees onto the broken wheels |
| dwarf_sled | models/mechanical/dwarf_sled/dwarf_sled.bbmodel | 58 | 256x512 | move is a drag (no wheels) |
