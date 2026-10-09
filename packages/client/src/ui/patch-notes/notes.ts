// The patch notes players read on the site: one entry per patch, newest
// first, each split into Bug fixes, Balance, Gameplay and content, and
// Quality of life. They are written for players, as any game's patch notes
// are: plain English, every changed number given exactly, no names of
// people and nothing about tools only the developers use. A new patch goes
// at the top of PATCH_NOTES; the one below it then keeps its own version
// and date (the newest shows the game's version and the day the site was
// built for it, see page.ts).

export type NoteCategory = 'bugFixes' | 'balance' | 'gameplay' | 'qol';

/** The categories in the order a patch shows them. */
export const NOTE_CATEGORIES: ReadonlyArray<{ id: NoteCategory; title: string; picture: string }> = [
  { id: 'bugFixes', title: 'Bug fixes', picture: 'icon_cmd_repair' },
  { id: 'balance', title: 'Balance', picture: 'icon_status_fortified' },
  { id: 'gameplay', title: 'Gameplay and content', picture: 'icon_cmd_attack' },
  { id: 'qol', title: 'Quality of life', picture: 'icon_status_quickened' },
];

export interface PatchNoteItem {
  /** A short lead in bold, such as the feature's name. */
  title?: string;
  text: string;
  /** Exact numbers or steps, one line each. */
  details?: readonly string[];
  /** A picture beside the change: an interface-kit file or a game picture (picture-url.ts), without its extension. */
  picture?: string;
  /** A screenshot of the game under the change, shown wide (a book picture's name). */
  shot?: string;
}

export interface PatchNote {
  /** "Patch 5". */
  name: string;
  /** The game version it went live as. The newest patch leaves it out and shows the game's own version. */
  version?: string;
  /** The day it went live, YYYY-MM-DD. The newest patch may leave it out: the page then shows the day the site was built. */
  date?: string;
  /** One line under the name. */
  headline: string;
  intro?: readonly string[];
  changes: Partial<Record<NoteCategory, readonly PatchNoteItem[]>>;
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    name: 'Patch 5.1',
    headline: 'Smoother play: the same picture for less work every frame, and no more freezes as night falls.',
    changes: {
      bugFixes: [
        {
          title: 'No more freezes as night falls',
          text: 'The game no longer stands still for up to half a second when the first monsters of the night set out for your town, or stutters when your units come near new land. It now prepares the routes and the land it will need while it has time to spare, and dusk takes half the work it did.',
        },
      ],
      qol: [
        {
          title: 'Smoother frames',
          text: 'The world looks exactly as before, but the game works less to draw it: only the trees, rocks and props on screen or casting a shadow onto it are drawn, unlit lamps cost nothing, and far less data goes to the graphics card. In a busy town the game’s own work per frame falls from about 8 ms to 6.5 ms.',
        },
      ],
    },
  },
  {
    name: 'Patch 5',
    version: 'indev 1.0',
    date: '2026-10-09',
    headline: 'The biggest update yet: quests, stone circles, the Tavern, gear you can hold, and a whole new look for the world.',
    intro: [
      'Patch 5 brings the game to indev 1.0. Saves from indev 0.9 and older will not load: they show in the list as no longer valid, and can be cleared from there.',
      'Every number below, and every other number in the game, is on its own page in the new How to Play book on the main menu.',
    ],
    changes: {
      bugFixes: [
        {
          title: 'Night sieges no longer lag',
          text: 'Late-night sieges, where monsters break the ground round your walls, used to slow the game to a crawl. A siege step now takes under 10 ms instead of about 80 ms, and blood nights, which were the worst of it, are gone (see Gameplay and content).',
        },
        {
          title: 'Troops show their gear',
          text: 'Musketeers no longer look like fist fighters: every troop now carries the weapon, armour and shield it really has, drawn on its body.',
          picture: 'icon_musket_steel',
        },
        { title: 'Cursor', text: 'The cursor no longer disappears after switching browser tabs or coming back from another window.' },
        {
          title: 'Holes in the world',
          text: 'No more gaps showing the empty void under ravines, dug pits and distant cliffs.',
        },
        {
          title: 'Minimap far from home',
          text: 'The minimap no longer shrinks your land to a speck once you have explored a long way out. It shows all your explored land while that fits in 600 m; past that it shows a 600 m window round the camera, and lairs and villages outside it sit pinned to its edge.',
        },
        { title: 'Digging', text: 'Wild animals wandering into a dig no longer hold it up.' },
      ],
      balance: [
        {
          title: 'Main base costs',
          text: 'With four tiers in place of ten (see Gameplay and content), each tier costs what its old level did, and only the Citadel needs anything but wood and stone.',
          details: [
            'Tier 1, Big House: 100 lumber, 50 stone. 1,200 health, 10 supply.',
            'Tier 2, Hall: 118 lumber, 45 stone. 2,000 health, 16 supply.',
            'Tier 3, Keep: 235 lumber, 370 stone. 3,600 health, 30 supply.',
            'Tier 4, Citadel: 200 lumber, 300 stone, 150 bricks, 125 marble, 50 steel ingots, 5 gold and 1 mana crystal. 7,500 health, 50 supply.',
          ],
          picture: 'icon_main_base_citadel',
        },
        {
          title: 'Workers',
          text: 'Workers deal 2 less damage with every tool tier: wooden 2, stone and flint 3, copper 4, bronze 5, wrought iron 6, iron 7, steel 8, carbon steel 9. Bare hands stay at 2.',
          picture: 'icon_tool_set_steel',
        },
        {
          title: 'Monsters',
          text: 'Night monsters deal 5% less damage, and hostile daytime monsters 15% less. Monsters whose numbers had already been hand-tuned keep them.',
        },
        {
          title: 'Mages',
          text: 'Mage mana is 10 lower at every rank: 90, 110, 130, 150, 170 and 190. Refill rates are unchanged.',
          picture: 'icon_train_mage_battle',
        },
        {
          title: 'Walking and running',
          text: 'Units on foot walk 15% slower, at 2.55 m/s, and can now run (see Gameplay and content) at 3.57 m/s, 40% faster than walking. Siege engines are 15% slower; cavalry keeps its 5 m/s trot and 8 m/s gallop.',
        },
        {
          title: 'Jumping',
          text: 'Units on foot jump up 56 cm (was 45 cm) and drop down 1 m. Horses clear 2.5 m. Every walking monster can jump at least 1 m.',
        },
        {
          title: 'Digging',
          text: 'Digging is 10 times faster (the walk to the drop-off is unchanged), and earth weighs 2.5 lb instead of 5: a load holds 10 and a hand cart 100.',
          picture: 'icon_earth',
        },
        {
          title: 'Farms and animals',
          text: 'Farms make 10 farm fare a farmer-day (was 8). Prey animals have young every 6 2/3 days (was 10).',
          picture: 'icon_farm_fare',
        },
        {
          title: 'Gunpowder',
          text: 'Gunpowder units now need lead ore: a musketeer 2, a brawler’s pistol 1, a bronze cannon 4 and an iron cannon 6. Upgrades pay it too.',
          picture: 'icon_lead_ore',
        },
        {
          title: 'Bronze cannon',
          text: 'The bronze cannon costs 40 bronze ingots (was 10) and hits a little lighter than the iron cannon: 120 damage, 300 to walls and 35 splash damage within 1.5 m (iron: 150, 400 and 50 within 2 m).',
          picture: 'icon_cannon_bronze',
        },
        {
          title: 'Gear making',
          text: 'Weapons and armour of tiers 3 to 8 are quicker to make, in even steps up to 15% quicker at tier 8. Upgrading a unit takes 45% of the new piece’s time (was 50%), and never less than the difference, so training low and upgrading is never cheaper than training high.',
          details: ['Shields take 20, 25, 36, 39 and 39 s by tier (were 20, 25, 40, 45 and 45).'],
        },
        {
          title: 'Eating and healing',
          text: 'A unit eats 1 food for each quarter of its health that is missing, healing over 10 s, and a unit at full health no longer eats.',
        },
        {
          title: 'Ore and carts',
          text: 'The six ores weigh 8 lb each (was 5). Carts hold much more: a hand cart 250 lb (was 150), a horse cart 700 (was 400) and an ox cart 1,000 (was 600).',
          picture: 'icon_ox_cart',
        },
        {
          title: 'Trade',
          text: 'Every settlement has a daily trade allowance, shared by all players and refilled at dawn.',
          details: [
            'Runkin camp 300, Halfling village and Elf caravan 400, Dwarf colony 500, Elf kingdom 1,200 and Dwarf city 1,500 trade value a day, raised by 100% to 175% the farther out the settlement stands (the caravan stays as it is).',
            'Nobody buys earth. Every people pays only 20% for stone, and Dwarf colonies and cities now sell it (40 and 80 a day).',
            'Halflings now pay 70% for gold, silver and their trinkets (were 0% and 35%).',
            'Diamonds are worth 100; Dwarves and Elves pay 150% for them, the Runkin 50%, and Halflings refuse them.',
            'Bluestone is worth 12 (Elves pay 120%, Dwarves 130%). Moon Roses are worth 30, and the Elves pay 250% for them.',
          ],
          picture: 'icon_diamond',
        },
        {
          title: 'Mercenaries',
          text: 'Mercenaries are hired for good, for silver or gold (1 gold counts as 7 silver): 7 silver or 1 gold each at a Fringe camp, 14 silver or 2 gold in the Deepwoods. Each takes 1 supply.',
          picture: 'icon_silver',
        },
        {
          title: 'Repairs',
          text: 'Repairing a building now costs its materials in proportion to the health restored. Engines and cannons still repair for free.',
        },
        {
          title: 'Working at night',
          text: 'A worker may now work on through the night only within 5 m of a main base with a troop within 10 m (was within 25 m of any building and 50 m of a troop).',
        },
        {
          title: 'Hunters',
          text: 'Hunting warriors go home only once their bags are full (was half full).',
        },
      ],
      gameplay: [
        {
          title: 'Four main base tiers',
          text: 'The main base now has four tiers instead of ten: Big House, Hall, Keep and Citadel. Every building and research that needed a level moved with it: old levels 2 and 3 to the Hall, 4 to 7 to the Keep and 8 to 10 to the Citadel. The panel reads "Tier 2 of 4".',
          picture: 'icon_main_base_l6',
        },
        {
          title: 'The Citadel’s engine platform',
          text: 'The Citadel’s cannon ports are replaced by a platform on top. Build defense (D) mounts a fixed engine there: Springald, Mangonel, Bronze culverin or Iron bombard, each at its mobile engine’s cost and upgradable to the next for the difference. Garrison artillery crewmen (G) trains crewmen straight onto it, and they stay up there for good. An empty platform holds 4 regular units.',
          picture: 'icon_cannon_iron_fixed',
        },
        {
          title: 'Earth rampart',
          text: 'New in the Defences menu (M): an earth rampart, a 2 m tall chunk of earth chained point to point like a wall. Each chunk costs 10 earth, a worker’s full load, and has 300 health, as much as one wooden wall column. Your units cannot climb it (monsters that climb walls still go over it), and it cannot be dug away.',
          picture: 'icon_rampart_earth',
        },
        {
          title: 'Defences',
          text: 'Gates are twice as wide (6 columns). Towers take 4 by 4 columns to fit their new models. Earthworks (bank, ramp and fill), the lumber and stone ramps, ramp steps and gravel are removed; earth can still be dug, and gravel ground is now sand.',
          picture: 'icon_gate_stone',
        },
        {
          title: 'Lumber and sticks',
          text: 'Either kind of lumber now pays for everything except hardwood walls, gates and towers, taken from whichever stock is larger. Softwood things are now called wooden: wooden walls, gates, towers and fences, and the wooden cudgel, axe, mallet and hoe.',
          details: [
            'The Storehouse’s Make sticks (K) turns 1 lumber into 4 sticks in 20 s; the Workshop does it in 10 s. There is only one kind of stick.',
            'The main base’s K is now Make rope: 2 flax or 1 leather, 10 s.',
          ],
          picture: 'icon_storehouse',
        },
        {
          title: 'Gunfire and blasts',
          text: 'Cannonballs fell trees they hit (a catapult’s stone only small ones) and chip craters into soft ground; a wall breaker’s bomb leaves a shallow crater. Guns flash and leave smoke (cannons 5 s, muskets 4 s, pistols 3 s), and their shot leaves a streak that glows orange at night. Cannonballs and bombs go off in a bright burst of light.',
          details: ['An engine ordered to attack something fires at it, whatever it is; on its own it still picks only enemies.'],
        },
        {
          title: 'The woodsman',
          text: 'A new unit, trained at the Scholar’s Lodge (W) for 32 food, 4 sticks, 1 leather or hides and 4 flax. The woodsman fishes, forages for berries, mushrooms and other wild food, and fights with a spear (any tier of long weapon, 2 less damage). Select one to see the food he brings in against what he eats.',
          details: [
            'Fishing docks are gone: only woodsmen fish. Fish swim visibly in every stretch of water, a woodsman lands one every 12 s, and a stretch is never fished out.',
            'Woodsmen climb up to 7 m, as workers do, and are never shared with allies.',
          ],
          picture: 'portrait_woodsman',
        },
        {
          title: 'Wild food',
          text: 'Berry bushes (black berries, raspberries and blueberries) grow in the Heartland, Fringe and Deepwoods and refill 2 minutes after picking. Mushrooms grow under trees and come back nearby 1 to 3.5 minutes after being picked, but never in the Barrens or Deadlands. Hunters pick berries on the way.',
          picture: 'icon_raspberries',
        },
        {
          title: 'Bonemeal',
          text: 'The Workshop grinds bone into bonemeal (N). A farm’s Fertilize (F) spends 2 bonemeal for 30% more growth for 2 minutes. Up to 10 boosts can wait in line, right click sets it to fertilize by itself, and the farm shows the boost left.',
          picture: 'icon_bonemeal',
        },
        {
          title: 'The Barn',
          text: 'The Barn now needs its barn hand on the job, tending the animals by day. By day the animals graze within 15 m of the Barn in the Heartland, Fringe and Deepwoods, which saves a quarter of their feed.',
          picture: 'icon_barn',
        },
        {
          title: 'Taming and breeding',
          text: 'Workers can tame chickens, cattle, horses and oxen by feeding them plant food (a chicken takes 3, a horse 15, cattle and oxen 20), then lead them home to a Barn. Animals look for a mate when ready and show hearts as they breed.',
          picture: 'icon_train_cow',
        },
        {
          title: 'Nights at home',
          text: 'At night, workers shelter in a farm or Barn with room before the main base. Occupied farms, Barns and main bases are lit at night, with chimney and campfire smoke.',
        },
        {
          title: 'Gear is real',
          text: 'Weapons, armour, shields, tool kits, wands and robes are now items in your stockpile. Train or upgrade a unit when a ready piece is in stock and it puts it on in a fifth of the time; the piece it replaces goes to the stockpile.',
          details: [
            'The Workshop scraps unwanted gear back into its full materials, 10 s a piece, one at a time, 10 at a time or all.',
            'Close melee troops carry a shield in a slot of its own.',
            'Night waves carry gear from night 5 on and drop it as loot, at the tier you would expect by then.',
            'Poison tips (1 venom, 10 s) add 20 poison damage over 5 s to arrows and bolts and are never used up. Spider silk counts as rope, and obsidian as flint. Obsidian also makes a hand-axe as strong as a bronze shortsword.',
          ],
          picture: 'icon_shield_steel_heater_steel',
        },
        {
          title: 'Mage autocast',
          text: 'Right click a spell to put it on autocast; left click casts it at once. A battle mage always keeps one attack spell on autocast (the Arcane bolt to start with), plus Counterspell. A support mage chooses freely and starts on Heal and Energy dart.',
          details: [
            'Autocast heals go only to units missing at least half a heal, the most hurt first. Autocast buffs go, in a fight, to the most valuable unit in the most danger.',
            'A group of selected mages all cast the spell you give them.',
            'Bolts arc over low walls, within limits. Mages no longer fight in melee.',
            'Rank training can take 3 demon horns in place of each mana crystal.',
          ],
          picture: 'icon_spell_arcane_bolt',
        },
        {
          title: 'Energy dart',
          text: 'A new spell for the support mage from rank 1 (D): a dart of light for 14 damage at up to 16 m, every 1.5 s, for 10 mana, the same mana as the Arcane bolt for about 30% less damage.',
          picture: 'icon_energy_dart',
        },
        {
          title: 'Area blast',
          text: 'Area blast can now be cast on a unit or on the ground, and hurts every unit within 4 m that is not a player’s, wild animals included, for 45 damage.',
          picture: 'icon_spell_area_blast',
        },
        {
          title: 'Smarter waves',
          text: 'Night waves now go for every base and every group of units by what they are worth, not only the main base. Monsters break a tower that is shooting them when no unit is in reach, and go round walls unless the way round is very long. Each player draws their own share of every night, so more players face more monsters.',
        },
        {
          title: 'The Necromancer',
          text: 'A new night monster, from night 10: he raises 9 or 10 skeleton archers and zombies every 60 s and throws a 35-damage bolt that also hurts everything within 0.5 m. He drops 2 to 4 pieces of gear, 1 to 5 ingots, bones, and sometimes a mana crystal. He and his raised dead burn away at dawn.',
          picture: 'portrait_necromancer',
        },
        {
          title: 'Morvath',
          text: 'The last boss has his own model, a swing that also hits everything within 1 m for 100, and, once, at half health, a drain of up to 500 health from your units within 12 m over 5 s.',
          picture: 'portrait_morvath',
        },
        {
          title: 'Mana crystal guardians',
          text: 'Mana crystals in the Deadlands are guarded by 2 or 3 ash golems or mana wraiths, who come when your units first get within 60 m and go for a gathering worker first. Once killed they are gone for good.',
          picture: 'portrait_mana_wraith',
        },
        {
          title: 'The Bog guardian',
          text: 'Every bog now has a keeper, a huge ogre with 400 health. Bogs hold twice the bog iron and 3 to 6 silver nuggets on the ground. Answer his question before you take from his bog; anger him and he hunts the offender, then asks for peace. He drops armour, weapons, silver, gold and a bog pear.',
          picture: 'portrait_bog_guardian',
        },
        {
          title: 'The Fae Guardian',
          text: 'Large mana crystals, holding 40 crystals each, now stand in every band. Each is guarded by a Fae Guardian, a fairy with 300 health who kills anyone who mines her crystal and, once struck, flies high out of melee reach. She drops mana crystals, a wand or robe, trinkets and gear.',
          picture: 'portrait_fairy',
        },
        {
          title: 'Remarks',
          text: 'Your units now make the occasional remark about what is around them.',
        },
        {
          title: 'Running',
          text: 'Every unit on foot has a new Run/Walk button (H). Running is 40% faster than walking and costs 1 food for every 50 m run.',
        },
        {
          title: 'Climbing',
          text: 'Units climb cliffs and rock faces when their path needs it: workers and woodsmen up to 7 m, other units on foot up to 4 m, at a fifth of walking pace. Walls, buildings and the earth rampart still need a gate.',
        },
        {
          title: 'Digging up and in',
          text: 'Digs can now go upward to remove hills: a depth below 0 draws the box upward. Diggers work in layers from the high points across the whole area. Tunnels are dug from the face inward, and clicking a cliff face starts a tunnel into it. Workers in a pit climb out with their loads, so the crude stairs are gone.',
          picture: 'icon_cmd_dig',
        },
        {
          title: 'Pathfinding',
          text: 'Pathfinding is rebuilt: units leave walled villages by their gates and gaps, cross ridges and lakes, use tunnels and climbs, and large groups no longer slow the game. A unit that cannot find its way says where and why it is stuck, and pings your minimap every 5 s until you look.',
        },
        {
          title: 'Quests',
          text: 'The peoples now have quests for you. Once you have met a Halfling village, Runkin camp, Dwarf colony or Dwarf city, or the Elves, and are at peace with them, their leader asks over their head whether you will take on their task. Answer Yes with one of your units within 15 m of the leader to take it, and come back with a unit when it is done to claim the reward, straight into your inventory.',
          details: [
            'Halflings, the Bog Pear: bring the Village elder a bog pear from a bog. While you hold one, the elder offers to take it for 50 farm fare (100 food), 50 softwood lumber and 50 stone. Hint: "It\'s in a bog. Duh."',
            'Runkin, the Raid: wipe out the band of gnolls, kobolds or hobgoblins nearest the camp, which your minimap pings when you take the quest, and come back for 10 leather and 4 bronze ingots.',
            'Elves, Fae Guardians: kill 2 Fae Guardians, then come back to the Elf steward or any caravan master for 3 basket-hilted broadswords, 3 fluted Gothic harnesses and 3 steel rotellas, all carbon steel. Hint: "Fae Guardians protect mana stones. They are flying so swords won\'t be much help."',
            'Dwarf colonies, Griffin Hunt: kill 2 griffins for 15 silver ingots. Dwarf cities, Minotaur Hunt: kill 2 minotaurs for 8 gold ingots. Each pings the nearest beast when taken.',
            'Each player has their own copy of every quest: another player\'s progress never counts for you. A quest stays open until you claim it, and comes back 20 days after you do.',
            'A people at war with you offers no quest and takes no claims until there is peace again.',
          ],
          picture: 'portrait_halfling_male',
          shot: 'shot_quest_offer',
        },
        {
          title: 'Trading with the peoples',
          text: 'Trade opens from any of a people’s buildings or from its leader, with one of your units within 10 m. Elf caravans have their own trade menu.',
        },
        {
          title: 'Stone circles',
          text: 'Ancient stone circles stand in the Fringe, Deepwoods and Barrens, up to four in each band, in three tiers and four kinds: plain, Lunar, Silenus and Boneyard. Their ruins hold bluestone (worked with iron tools or better), bones and treasure chests.',
          details: [
            'Chest finds include the Ancient Seed, which grows into a Sweet Hawthorne in 5 nights: its fruit feeds you, farms within 30 m grow 35% more and animals near it breed 35% faster.',
            'The Pan Flute (10 uses) calls every animal within 300 m to your base. Honey, enchanted wine and hawthorne cider are good food; enchanted wine also gives a mage 50 mana.',
          ],
          picture: 'icon_bluestone',
        },
        {
          title: 'The Moon Goddess and Bright Nights',
          text: 'Leave 5 gold or 35 silver and 3 Moon Roses at a Lunar circle’s altar for the Moon Goddess’s blessing: one Bright Night in every ten, starting the next night, when your share of the waves stays away. Monsters already nearby, and waves on their way to other players, can still attack you. Moon Roses bloom on Bright Nights and are picked by a worker or woodsman.',
          picture: 'icon_moon_rose',
        },
        {
          title: 'The circles’ keepers',
          text: 'Each kind of circle has its keepers, who come when your units first get within 60 m.',
          details: [
            'Lunar circles: the Great White Ape, 1,500 health, tends a garden, sells fruit, honey and wine for silver, and fights the night’s monsters on his grounds. Take from his chests, cut his hawthorne or break his stones and he warns you first; push on and he rages, throwing your units and leaping in with a thunderclap that deals 5 to 10 damage to every unit within 6 m as he lands.',
            'Silenus circles: Silenus feasts with his satyrs (2 Tricksters and 2 Revelers, 3 of each at the largest circles) until struck or robbed; then they fight. Pressed hard, Silenus turns into a sabretooth tiger.',
            'Boneyard circles: a Lich, hostile to everyone, guarded by 5 necromancers who raise the dead as the fight begins. His Acrid Wind leaves a grave-touch that wears units down, and he drains his own followers to heal.',
            'The Headless God Idol, found at a Boneyard, turns one night’s waves on a people of your choosing. It can be used again after 15 nights.',
          ],
          picture: 'portrait_great_white_ape',
        },
        {
          title: 'The Tavern',
          text: 'A new building (V, needs a Keep): 80 lumber, 60 stone, 5 leather and 1 gold ingot or 7 silver ingots. Open it for business (F) and it turns 1 food every 3 s into silver, 18 food to an ingot; withdraw whole silver ingots when ready. At night it glows and fills with figures while open.',
          picture: 'icon_tavern',
        },
        {
          title: 'The Dreadnought',
          text: 'A new unit, hired at a Tavern (H) for 100 food and 15 gold or 105 silver: 200 health, heavy armour, and a mace that strikes every 3 s, by turns a 140-damage smash and a 70-damage sweep. He walks and runs 20% slower and never climbs. One per player with a Keep, three with a Citadel.',
          picture: 'icon_dreadnought',
        },
        {
          title: 'The world',
          text: 'The land is rebuilt round your base. Bands sit 150 to 180 m apart, ravines are at most 5 m deep, most cliffs before the Barrens are now mountains, and a small landmark mountain stands near the first base.',
          details: [
            'New: 3 m boulders full of stone, coal rocks, silver and gold nodes on mountain slopes, flax fields, hot springs guarded by ash golems, dead trees and thorn bushes.',
            'Trees are thinner in open land; marble and iron are placed by band.',
          ],
          picture: 'icon_coal',
        },
        {
          title: 'The world’s look',
          text: 'The land is drawn with a full set of textures for every material and band, animated water with see-through shallows, and glowing cracks in the Deadlands. Light follows the day and night, and torches and bonfires flicker. Gold and silver glitter, hot springs steam, paths of trodden earth surround your buildings, and farm plots are tilled.',
        },
        {
          title: 'Units and buildings',
          text: 'Workers, warriors and mages have new bodies with full animations, including one for every worker task. Every building has its own model, with construction stages, a damaged look and ruins; walls look cracked below 70% health and broken below 40%. Mage robes change colour with rank, and top-rank mages wear a halo. Carts, harnesses and carried goods are drawn.',
        },
        {
          title: 'Blood nights',
          text: 'Blood nights are removed. Fog nights can now come on any night they are able to.',
        },
        {
          title: 'Playing together',
          text: 'The site is open to everyone, with no password. Join game lists every open game; hosts can run private games and remove players.',
        },
      ],
      qol: [
        {
          title: 'How to Play',
          text: 'A new How to Play button on the main menu opens a guide to the whole game: the premise, guides on how to play, and a page for every building, unit, weapon, piece of armour, spell, recipe, item, animal and monster.',
          details: [
            'Every page shows that thing’s numbers straight from the game: costs, build and training times, health, damage, ranges, speeds and more, so they are always up to date.',
            'Search any page by name from the search box, or browse the sections in the sidebar.',
            'Pages link to each other: a resource’s page shows what drops it, what makes it and what it is used for.',
            'The address follows the page you are reading, so the browser’s Back button works and you can share a link to any page.',
          ],
        },
        {
          title: 'Patch notes',
          text: 'The main menu now shows the latest update by name, with a mark until you have read its notes, and a Patch notes button that lists every update from this one on, newest first.',
        },
        {
          title: 'Quest menu',
          text: 'A small ! button right above the messages button opens your quests: what each asks, how far along you are, the reward, and a Hint that shows a tip or pings your target on the minimap. It starts folded, and a number on it counts quests you have taken or finished and not looked at yet.',
          details: ["Under your quests it also tracks the stone circles: the Moon Goddess's blessing and the nights to your next Bright Night, the Great White Ape's warning and vengeance, and the Headless God Idol's wait."],
          shot: 'shot_quest_menu',
        },
        {
          title: 'Action buttons',
          text: 'Hotkey letters use a crisper font, button pictures fill more of the button, and buttons stop growing at 128 px. Messages start folded, with an unread count. Troops go by their tier names everywhere.',
        },
        {
          title: 'Health bars and markers',
          text: 'Every unit and building below 95% health shows one bar stack: health, mana under it, and a gold bar while a building trains, makes or upgrades. Damage numbers rise over units. Hovering outlines a unit. Orders show dotted lines with flags. Other players’ things carry a small star in their colour; your own never do.',
        },
        {
          title: 'Gather, Hunt and Repair',
          text: 'Left click picks a target; right click turns on the automatic version. Autorepair sends idle or gathering workers to anything damaged within 8 m. Repair All moves to F8 and calls workers within 20 m of a damaged building (never Farm or Barn workers).',
        },
        {
          title: 'Buildings and groups',
          text: 'Workers fill a building nearest first, and units leave the selection as they go in. F2 skips units in towers and buildings. With several buildings selected, each trains one unit, the least busy first. Double click keeps one type of ten.',
        },
        {
          title: 'Unit inventory',
          text: 'Select one unit to see what it carries, its weight and an Unload all button. Right click any item in your stockpile or on a unit for Use, Equip, Unload, Drop, Scrap or Don’t eat. Equip a stock item straight onto a unit. Units near a drop-off hand in their load by themselves.',
          picture: 'icon_cmd_unload_all',
        },
        {
          title: 'Sheltering',
          text: 'Right click the main base to send workers inside; troops and mages shelter too, melee deeper inside and ranged up top. Eject brings everyone out.',
        },
        {
          title: 'Spells',
          text: 'Spell effects show bars with the time left. Autocast spells have a moving streak on their button, cooldowns show a clock, and a Magi Sanctum shows the mages training inside.',
        },
        {
          title: 'Flat menus',
          text: 'The Artillery workshop, Magi Sanctum and Barn show all their buttons at once, without submenus.',
        },
        {
          title: 'Trade windows',
          text: 'Trade menus, the hire box, the Allies panel and Send resources keep their title and close button in place, show a picture and name for every good, and take typed amounts.',
        },
        {
          title: 'Camera',
          text: 'Hold , (comma) or . (full stop) to turn the camera; double tap either to face north again.',
        },
        {
          title: 'Hotkeys',
          text: 'Select All Woodsmen is on F7, and the camera spots are now F5 and F6. Rebound build-menu keys now follow the building’s name.',
        },
      ],
    },
  },
];

/** The newest patch. */
export const LATEST_PATCH: PatchNote = PATCH_NOTES[0]!;

const SEEN_KEY = 'sac.patch-notes-seen';

/** Whether this browser has opened the newest patch's notes. */
export function latestSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === LATEST_PATCH.name;
  } catch {
    return false;
  }
}

export function markLatestSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_PATCH.name);
  } catch {
    // Storage may be off (a private window): the mark just stays.
  }
}
