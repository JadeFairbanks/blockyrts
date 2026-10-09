// What the stone circles' keepers say (Jade's Patch 5): the Great White Ape
// (SCA-3: "a monstrous beast calmed into the guardian of a sacred space ...
// He refers to the Moon Goddess as The Goddess"), Silenus and his satyrs
// (SCS-1: they "revel and make merry, drinking toasts to Zagreus god of the
// hunt. Silenus boasts the Moon Goddess is supposed to marry him"), and the
// Lich (SCB-3: "completely demented and creepy"). Jade's own words are kept
// as she wrote them; the rest are picks, in blueprint/patch5-mobs-picks.md.

/** SCA-3: the Ape's warning, and its two answers, in Jade's words. */
export const APE_ASK = { text: 'Do not dare to defile the circle!', yes: 'I will do what I want!', no: 'Sorry!' } as const;

export const APE_LINES = {
  /** To the players' units who come onto the circle's grounds while he is calm. */
  greet: [
    'Hush. You walk on the Goddess\'s ground.',
    'The Goddess sees you, small ones. Tread gently.',
    'Eat of her fruit if you hunger. Leave her stones be.',
    'These stones are sacred. I keep them for the Goddess.',
    'Mind the roses. They bloom for the Goddess alone.',
    'The moon will rise soon. The Goddess likes it quiet.',
    'Welcome, little ones. Be gentle in her garden.',
  ],
  /** At the altar, now and then, when someone is near to hear it. */
  worship: [
    'Goddess, I keep your garden.',
    'Shine on, my Goddess. Your priest is here.',
    'Another flower for you, Goddess.',
    'Smile on us tonight, Goddess.',
  ],
  /** While his warning is up. */
  warning: [
    'Put it back. The Goddess is watching.',
    'You stand on holy ground. Choose your next words well.',
  ],
  /** "Sorry!": he stands down. */
  forgiven: [
    'The Goddess forgives you. Once.',
    'Go in peace. Do not make me ask again.',
    'Good. The Goddess is merciful. I am less so.',
  ],
  /** "I will do what I want!", or wronging the circle again after a Sorry. */
  rage: [
    'You spit on the Goddess\'s ground! Now you face her priest!',
    'Defilers! I will grind your bones into garden soil!',
    'For the Goddess!',
  ],
  /** SCA-2: the idol is stolen. */
  idol: 'THE GODDESS! You lay hands on THE GODDESS?! Give her back!',
  /** SCA-3: "prompting him to taunt the players", while he rages. */
  taunt: [
    'Run, little thief! The stones remember your face!',
    'Is that all? The Goddess laughs at you!',
    'I have broken bigger things than you on these stones.',
    'Your bones will feed her roses!',
    'Come closer. Let me hold you.',
    'The moon is my witness: none of you leave!',
    'You cut her trees. I will cut you down!',
    'Where is your courage now, desecrator?',
    'I smell your fear. It smells of stolen fruit.',
    'Weak! Soft! Faithless!',
    'The Goddess sees what you did. She sees all of it.',
    'I will make an offering of you!',
    'Pray to your own gods, thief. Mine is angry.',
    'You came to her garden with axes. Leave it in pieces.',
  ],
  /** His leap lands. */
  thunder: ['The ground shakes for the Goddess!', 'HRAAAH!'],
  /** He throws one of them. */
  toss: ['Fly, little one! Fly!', 'Off the Goddess\'s ground!', 'Out!'],
  /** The fight is over and he goes back to his circle. */
  calm: ['Go, and never come back.', 'The circle is quiet again. Stay away from it.'],
  /** SCA-2: "he may become permanently enraged and seek out the players base". */
  sworn: 'Enough! I will find your nest and tear it down, stone by stone!',
  /** On his way to their bases, and at them. */
  rampage: [
    'Where are your little workers? I am coming for them.',
    'No wall will keep the Goddess\'s wrath out!',
    'Your home will be a ruin, like the stones you defiled.',
    'I can smell your fires from here, thieves!',
    'Hide your workers. It will not help.',
    'Every stone you laid, I will throw.',
  ],
  /** SCA-4: "if the Great White Ape is alive he will warn the player not to touch it or face the consequences", on the altar's Yes or No. */
  idolWarn: 'Do not touch the Goddess, little thief, or face my wrath!',
  /** At peace, selling his goods (SCA-2). */
  trade: ['The Goddess provides.', 'Take it, and be gentle with her garden.', 'Her gifts, for your silver.'],
  /** He drives a monster off the circle's grounds. */
  monsters: ['Filth! Off the Goddess\'s ground!', 'No monster walks in her garden!', 'Back to the dark with you!'],
} as const;

export const SILENUS_LINES = {
  /** SCS-1: reveling, boasting of his bride, when the players' units are near. */
  revel: [
    'To Zagreus, god of the hunt! Drink!',
    'When the Moon is my bride, every night will be a feast!',
    'The Moon Goddess is promised to me, you know. Any night now.',
    'Her idol should be here, on my altar, waiting for me.',
    'Where is my bride? Has anyone seen the Moon?',
    'More cider! A demigod cannot be engaged sober!',
    'I grow tired of waiting, little Moon.',
    'Zagreus! Another toast to the hunt!',
  ],
  /** Question 8: attacked, or their circle looted. */
  roused: ['You dare spoil my feast? Satyrs, hunt them!', 'Thieves at my party! Seize them!', 'Zagreus, bless the chase!'],
  /** Fighting. */
  fight: ['I am a god, you insects!', 'The thorns will have you!', 'Hold still, morsel.', 'You will make a fine trophy for my wedding!', 'Dance for me! Dance!'],
  /** SCS-5: into the sabretooth, and back. */
  tiger: 'Zagreus, lend me your beast!',
  back: 'Ahh... where was I? Oh yes. Killing you.',
} as const;

export const SATYR_LINES = {
  revel: ['Another toast to Zagreus!', 'Ha! Dance, you fool!', 'The cider is sweet tonight!', 'A toast to the bride who never comes!', 'More! More!'],
  /** The Trickster vanishes and comes back (SCS-2). */
  vanish: ['Now you see me...', 'Catch me if you can!'],
  ambush: ['...and now you don\'t!', 'Surprise!'],
} as const;

export const LICH_LINES = {
  /** SCB-3, Jade's words: "When the lich becomes visible on screen to the player ... 'You will join me, in your death…'" */
  seen: 'You will join me, in your death…',
  /** SCB-3, Jade's words: "If he kills a unit he will exclaim in satisfaction 'I can feel warmth fleeing!'" */
  kill: 'I can feel warmth fleeing!',
  /** SCB-3: "promising to enslave the humans ... completely demented and creepy". */
  quip: [
    'Your heartbeat is so loud. Let me quiet it.',
    'Kneel, and I will make you a crown of your own ribs.',
    'Every breath you take is a breath I will keep.',
    'I remember every death. Yours will be my favourite.',
    'Hush now. The grave is soft. The grave is kind.',
    'Your bones are wasted on you. I will put them to work.',
    'Slaves, every one of you. You simply do not know it yet.',
    'I have catalogued ten thousand screams. I will add yours to my library.',
    'So warm... so warm... not for long.',
    'Come closer. I collect pretty skulls.',
    'Live forever? Oh, you will. In chains. As bone.',
    'The crystal hungers. It hungers for you.',
    'Run, little lamps. I will snuff you one by one.',
  ],
  /** SCB-2: Sacrificial Rite on one of his own. */
  rite: ['Your bones are mine to spend.', 'Serve me, one last time.'],
} as const;
