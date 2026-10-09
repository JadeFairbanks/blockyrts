// What the keepers say (Jade's Patch 5): the Bog guardian (MB-11: "Make the
// texts fun to read and not technical", 30 lines at war) and the Fae
// Guardian (MF-9: "a wrathful lady, and has at least 20 variations of text
// bubbles of different situations including threats"). Her own words are
// kept where she wrote them: the roar, the promise, the peace and the
// fairy's warning. {item} is what was being taken ("bog iron", "silver
// nugget"); {verb} how ("digging up", "picking up").

/** The Bog guardian's lines. */
export const BOG_LINES = {
  /** A player's unit comes into his bog: a polite greeting, asking it not to disturb the bog (MB-11). */
  greet: [
    'Oh! Visitors! Welcome to my bog. Please don\'t disturb anything, the frogs are very sensitive.',
    'Hullo, little ones. Mind the moss, and kindly leave my bog as you found it.',
    'Ah, guests! Admire the mud all you like, but please don\'t take any of it home.',
    'Welcome, welcome! Wipe your feet... actually, don\'t. Just please don\'t disturb the bog.',
    'Careful where you step, friends. This bog is my home, and I\'d like it to stay in one piece.',
    'Good day! The bog is lovely this time of year. Please look, but don\'t touch.',
    'Oh, hello. I\'ve just got the reeds how I like them. Please don\'t disturb anything.',
    'Visitors! How nice. Do enjoy the smell, and please leave the bog alone.',
  ],
  /** One of them starts to take something from the bog: outraged, and up until the Yes or No (MB-11). */
  outraged: [
    'Oi! That {item} belongs to the bog!',
    'Put that {item} DOWN! Do you know how long the bog took to make it?',
    'Hey! Hands off my {item}, you little thief!',
    'WHAT do you think you\'re doing with my {item}?!',
    'That {item} is not yours! Step away from it, slowly.',
    'My {item}! You can\'t just squelch in here and take my {item}!',
  ],
  /** The gatherer's question to its player (MB-11). */
  ask: [
    'Shall I keep {verb} the {item} and risk angering the Bog guardian?',
    'He looks very cross. Keep {verb} the {item} and risk angering the Bog guardian?',
    'Uh oh. Should I keep {verb} the {item} and risk angering the Bog guardian?',
  ],
  /** No: the gatherer leaves it be. */
  thanks: [
    'Thank you. The bog thanks you too, in its own squelchy way.',
    'Much obliged, little one. The frogs say thank you.',
    'Lovely. Off you pop, then.',
  ],
  /** The gatherer went off (or fell) before its player answered. */
  gone: [
    'Hmph. And stay away from my bog!',
    'Good riddance. Don\'t come squelching back!',
  ],
  /** Yes, or he was attacked: he roars and runs at them (MB-11, Jade's words). */
  roar: 'I didn\'t want to have to resort to violence, but this bog is my home!',
  /** Now and then as he chases the one who angered him. */
  chase: [
    'Come back here, you little bog robber!',
    'You can\'t outrun me, I\'ve got very long legs!',
    'Stop! Thief! Bog thief!',
    'I only wanted a quiet life in a nice wet bog!',
  ],
  /** His promise, which any player may answer (MB-11, Jade's words). */
  promise: 'If you agree to leave my bog alone, I won\'t have to hurt any more of you little creatures. Do you promise?',
  /** Yes to the promise (MB-11, Jade's words). */
  peace: 'Peace in the bog is all I ever wanted.',
  /** No to the promise: one now and then while he wages war on every player (MB-11: "30 different creative ones about what it is doing and why it has to fight"). */
  war: [
    'You had your chance. Now the bog comes to YOU!',
    'Every frog in that bog was counting on me. I won\'t let them down!',
    'I\'m not angry. I\'m just very, very disappointed. And also angry.',
    'Your houses look nice. It\'d be a shame if a bog guardian sat on them.',
    'I asked nicely. I always ask nicely. Nobody ever listens!',
    'This is for the newts!',
    'You wouldn\'t promise. An ogre never forgets a promise you didn\'t make.',
    'I\'ll flatten your walls and plant reeds where they stood!',
    'My club has a name, you know. It\'s called Diplomacy.',
    'Your main base will make a lovely mud pit.',
    'First you take from my bog, then you won\'t promise? Rude!',
    'Smash first, tea later. Maybe.',
    'I\'m doing this for the bog. The bog can\'t hold a club.',
    'Mum always said: protect your bog. So here I am, protecting it. Loudly.',
    'Run all you like. I run faster. Much faster.',
    'Every brick I knock down goes back to the mud where it belongs!',
    'I\'ll stop when you\'re all gone. That\'s the deal now. You had a better one.',
    'You thought I was just a big softie. You thought wrong.',
    'Peace was all I wanted. War is all you gave me.',
    'The Bog guardian is off duty. The Bog WARRIOR is on duty!',
    'Knock knock! Who\'s there? A very cross ogre!',
    'I\'ll squish your soldiers like bog beetles!',
    'The swamp remembers. And so do I!',
    'One more town gone, and the reeds can grow in peace.',
    'Hold still! This won\'t hurt. Much. Actually, it will hurt a lot.',
    'You should have taken the deal, little ones!',
    'I\'ll be home for supper. You won\'t have a home for supper.',
    'The bog sends its regards. Here they are: THWACK!',
    'I\'m not a monster. I\'m a Bog guardian having a VERY bad day.',
    'Bring me your strongest! I\'ve wrestled crocodiles bigger than your army!',
  ],
  /** One of the others tries to gather while the question is open: it waits. */
  wait: [
    'I\'d better wait. That Bog guardian looks cross.',
    'Best leave it until the Bog guardian has calmed down.',
  ],
} as const;

/** Yes's and No's tooltips. */
export const BOG_BUTTONS = {
  askYes: 'Carry on. The Bog guardian will fight for his bog.',
  askNo: 'Leave it be. The Bog guardian calms down.',
  promiseYes: 'Promise. The Bog guardian calms down and goes back to his bog.',
  promiseNo: 'Refuse. The Bog guardian goes to war against every player, units and bases.',
} as const;

/** The Fae Guardian's lines (MF-9: at least 20). */
export const FAE_LINES = {
  /** A player's unit comes near her crystal. */
  warn: [
    'Admire my crystal from there, mortal. Any closer and you\'ll regret it.',
    'I can hear your grubby little thoughts. Leave.',
    'Another mud-footed mortal. How tiresome.',
    'Keep walking, worm. This glade is not for you.',
    'My crystal sings, and it does not sing for you.',
  ],
  /** One of them starts to mine her crystal: until the Yes or No (MF-10, Jade's words). */
  touch: 'Don\'t you dare even touch my crystal, worm!',
  /** The gatherer's question to its player (MF-10). */
  ask: [
    'Do I really want to keep mining her crystal and risk angering the fairy?',
    'She\'s glowing rather angrily. Keep mining the crystal and risk angering the fairy?',
    'Should I really risk angering the fairy for this crystal?',
  ],
  /** No: the gatherer leaves it be. */
  spared: [
    'Wise little worm. Crawl away now.',
    'Good. You may keep your hands. For now.',
  ],
  /** The miner went off (or fell) before its player answered. */
  gone: [
    'Hmph. Gone already, worm?',
    'Run along, little thief. I will remember your face.',
  ],
  /** Yes, or another one goes to mine it: she kills the thief (MF-4). */
  thief: [
    'You were warned. Now you will be a lesson to the others!',
    'Fool! My crystal is NOT for your filthy hands!',
    'I\'ll turn you into a toad. A dead toad.',
  ],
  /** One of the others tries to mine while the question is open: it waits. */
  wait: [
    'I\'d better wait. That fairy looks furious.',
    'Best leave the crystal until the fairy has calmed down.',
  ],
  /** She killed one. */
  killed: [
    'Let that be a lesson to all thieves!',
    'One less grubby little thief.',
    'Who\'s next? Anyone else fancy a crystal?',
  ],
  /** She was attacked: wrathful for good (MF-4). */
  wrath: [
    'You DARE strike me? Now you will ALL suffer!',
    'Wrong fairy, mortal. Very wrong fairy!',
    'Now I am angry. You will not like me angry.',
  ],
  /** Now and then in her wrath. */
  fight: [
    'Fly, little mortals! Oh wait, you can\'t. Ha!',
    'I have outlived kings. I will outlive you by suppertime!',
    'Every bolt I cast has your name on it!',
    'Scream louder, I can barely hear you up here!',
    'Did you think I was just a pretty little light? Think again!',
    'My crystal, my glade, my wrath!',
    'I\'ll scatter your bones across the meadow for the crows!',
    'Come closer, worms. My aim improves the closer you are.',
  ],
} as const;

export const FAE_BUTTONS = {
  askYes: 'Carry on. The Fae Guardian will kill whoever mines her crystal.',
  askNo: 'Leave it be. The Fae Guardian lets it go.',
} as const;
