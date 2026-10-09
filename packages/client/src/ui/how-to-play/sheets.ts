// One sheet per thing (Jade's Patch 7, How to play): every monster, animal,
// building or item has one page, and what the game says about it is on
// that page. Jade's words: searching "Fae" "had three returns for monsters,
// Two Fae Guardians with different speeds and 'The Bog guardian and the Fae
// Guardian'. This is cluttered and bad"; "that data should be on each
// individual monster sheet. Follow that logic for the rest of the how to
// play guide."
//
// So two things come together here, and nowhere else:
// - Rows with the same name in the same section (the Fae Guardian calm and
//   aloft, Morvath on the ground and in the air, the skeletons' arrows
//   beside the players') are one sheet: the first row is the page and the
//   others are its other forms, each a part of it (FORM_NAMES names them).
// - A rules page about one thing or a few (the keepers, the stone circles'
//   keepers, the late monsters' abilities, the Tavern) goes onto those
//   things' own sheets (FOLDS); its numbers that are about everything stay
//   on a rules page, which is left out when nothing is left on it.
// A table this file does not name keeps its pages as they are, so a new
// row or rule still has a page the day it is added.
import type { Catalog, CatNode, Entry, FieldNode, SimModules } from '@blockyrts/balance';
import { valueAt } from '@blockyrts/balance';
import { BuildingKind, Gait, Mob, PeopleUnit, PropKind, Res, Shot } from '@blockyrts/sim';

type RefKind = Parameters<Catalog['refEntry']>[0];

/** A sheet a rule goes to: a row by its reference kind and id, or a row of a table with no reference kind by its place. */
export type Target = { ref: RefKind; id: number } | { table: string; index: number };

export interface Fold {
  /**
   * What moves: a rules page by its entry id ("rules:..."), which moves
   * whole, or a rule by its module and path ("threats/keepers.ts:KEEPERS.bog"),
   * which takes everything under it. The longest match wins.
   */
  from: string;
  to: readonly Target[];
  /** The heading it has on those sheets; parts with the same heading are one. */
  label: string;
}

const mob = (id: number): Target => ({ ref: 'mob', id });
const res = (id: number): Target => ({ ref: 'res', id });
const building = (id: number): Target => ({ ref: 'building', id });
const gait = (index: number): Target => ({ table: 'GAITS', index });

const ABILITIES = 'Abilities';
const CIRCLE = 'At its stone circle';

export const FOLDS: readonly Fold[] = [
  // The monsters' own rules.
  { from: 'combat/mobs.ts:GRASP', to: [mob(Mob.Zombie)], label: ABILITIES },
  { from: 'combat/mobs.ts:WEB', to: [mob(Mob.GiantSpider)], label: ABILITIES },
  { from: 'combat/mobs.ts:ENGULF_STEPS', to: [mob(Mob.Slime)], label: ABILITIES },
  { from: 'combat/mobs.ts:BURST', to: [mob(Mob.BloatedCorpse)], label: ABILITIES },
  { from: 'combat/mobs.ts:BLAST', to: [mob(Mob.SkeletonBomber), mob(Mob.BombKeg)], label: ABILITIES },
  { from: 'combat/mobs.ts:CLUSTER', to: [mob(Mob.SkeletonBomber)], label: ABILITIES },
  { from: 'combat/mobs.ts:SHOUT', to: [mob(Mob.GoblinChief)], label: ABILITIES },
  { from: 'combat/mobs.ts:HOWL', to: [mob(Mob.GraveHound)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.miasma', to: [mob(Mob.PlagueBearer)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.snatch', to: [mob(Mob.Gravewing), mob(Mob.RiftGriffin)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.boulder', to: [mob(Mob.BoneColossus)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.raise', to: [mob(Mob.HollowPriest)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.breath', to: [mob(Mob.Hellhound)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.fury', to: [mob(Mob.Fiend)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.hook', to: [mob(Mob.ChainFiend)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.cloak', to: [mob(Mob.VoidStalker)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.heat', to: [mob(Mob.InfernalJuggernaut)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.hex', to: [mob(Mob.VoidWitch)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.blink', to: [mob(Mob.VoidWitch)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.line', to: [mob(Mob.AbyssalDrake)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.command', to: [mob(Mob.Archfiend)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.summon', to: [mob(Mob.Archfiend)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.beam', to: [mob(Mob.RiftColossus)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.sting', to: [mob(Mob.RiftScorpion)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE.hornet', to: [mob(Mob.RiftHornet)], label: ABILITIES },
  { from: 'threats/late-mobs.ts:LATE', to: [mob(Mob.Morvath)], label: ABILITIES },
  { from: 'rules:mobs:threats/boss.ts', to: [mob(Mob.Morvath)], label: 'Coming back' },
  { from: 'rules:mobs:threats/necromancer.ts', to: [mob(Mob.Necromancer)], label: 'Summoning and drops' },
  { from: 'rules:mobs:threats/guardians.ts', to: [mob(Mob.AshGolem), mob(Mob.ManaWraith)], label: 'Guarding mana crystals' },
  { from: 'rules:lairs:threats/springs.ts', to: [mob(Mob.AshGolem)], label: 'Guarding hot springs' },
  { from: 'rules:mobs:world/generate.ts', to: [mob(Mob.BogGuardian)], label: 'Where it lives' },
  { from: 'threats/keepers.ts:KEEPERS', to: [mob(Mob.BogGuardian), mob(Mob.FaeGuardian)], label: 'Waking' },
  { from: 'threats/keepers.ts:KEEPERS.bog', to: [mob(Mob.BogGuardian)], label: 'Keeping its bog' },
  { from: 'threats/keepers.ts:KEEPER_LOOT.bog', to: [mob(Mob.BogGuardian)], label: 'What it drops' },
  { from: 'threats/keepers.ts:KEEPERS.fae', to: [mob(Mob.FaeGuardian)], label: 'Keeping her crystal' },
  { from: 'threats/keepers.ts:KEEPER_LOOT.fae', to: [mob(Mob.FaeGuardian)], label: 'What she drops' },
  {
    from: 'threats/encounters.ts:ENCOUNTERS',
    to: [mob(Mob.GreatWhiteApe), mob(Mob.Silenus), mob(Mob.Sabretooth), mob(Mob.SatyrTrickster), mob(Mob.SatyrReveler), mob(Mob.Lich)],
    label: CIRCLE,
  },
  { from: 'threats/encounters.ts:ENCOUNTERS.ape', to: [mob(Mob.GreatWhiteApe)], label: CIRCLE },
  { from: 'threats/encounters.ts:ENCOUNTERS.silenus', to: [mob(Mob.Silenus)], label: CIRCLE },
  { from: 'threats/encounters.ts:ENCOUNTERS.silenus.tiger', to: [mob(Mob.Silenus), mob(Mob.Sabretooth)], label: 'His tiger form' },
  { from: 'threats/encounters.ts:ENCOUNTERS.silenus.tigerLeap', to: [mob(Mob.Silenus), mob(Mob.Sabretooth)], label: 'His tiger form' },
  { from: 'threats/encounters.ts:ENCOUNTERS.satyr', to: [mob(Mob.SatyrTrickster), mob(Mob.SatyrReveler)], label: CIRCLE },
  { from: 'threats/encounters.ts:ENCOUNTERS.lich', to: [mob(Mob.Lich)], label: CIRCLE },
  // The rest of the book, by the same rule.
  { from: 'rules:mobs:threats/headless.ts', to: [res(Res.HeadlessIdol)], label: 'Using it' },
  { from: 'rules:circles:circles/items.ts', to: [res(Res.EnchantedWine)], label: 'Using it' },
  { from: 'rules:buildings:buildings/tavern.ts', to: [building(BuildingKind.Tavern)], label: 'Meals and places' },
  { from: 'rules:animals:animals/barn.ts', to: [building(BuildingKind.Barn)], label: 'Grazing' },
  { from: 'rules:training:units/dreadnought.ts', to: [gait(Gait.Dreadnought)], label: 'Training and upkeep' },
  { from: 'rules:training:units/woodsman.ts', to: [gait(Gait.Woodsman)], label: 'Training and upkeep' },
  { from: 'peoples/data.ts:GROVESINGER', to: [{ ref: 'peopleUnit', id: PeopleUnit.ElfGrovesinger }], label: 'Mana' },
];

/** A rules page that keeps a few numbers after its things' rules go to their sheets, by a name for what is left. */
export const KEPT_TITLES: Readonly<Record<string, string>> = {
  "rules:peoples:peoples/data.ts:the peoples' units": "The peoples' animals",
};

/** Other forms' headings on a sheet, by the table and the row's id (Patch 7: one sheet per monster). */
const FORM_NAMES: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  MOBS: { [Mob.MorvathAloft]: 'Second form: aloft', [Mob.FaeGuardianAloft]: 'Second form: aloft, once attacked' },
  SHOTS: { [Shot.BoneArrow]: "A skeleton archer's arrow", [Shot.GoblinStone]: "A goblin slinger's stone" },
  PROPS: {
    [PropKind.HawthorneSapling]: 'Its sapling',
    [PropKind.BoneyardDeadTree]: 'In a Boneyard Circle',
    [PropKind.BoneyardThorn]: 'In a Boneyard Circle',
    [PropKind.CirclePine]: 'At a stone circle',
    [PropKind.Sand]: 'To gather',
    [PropKind.IronRock]: 'To mine',
  },
};

/** A merged row's heading on its sheet: its name in FORM_NAMES (by its id, or its place in its table), else "Another kind". */
export function formName(entry: Entry, mods: SimModules): string {
  const table = String(entry.path[0]);
  const rec = valueAt(mods[entry.module] ?? {}, entry.path) as Record<string, unknown> | undefined;
  const id = typeof rec?.id === 'number' ? rec.id : typeof entry.path[1] === 'number' ? entry.path[1] : -1;
  return FORM_NAMES[table]?.[id] ?? (table === 'MATERIALS' ? 'As the ground' : 'Another kind');
}

/** The key a field is matched on: its module and path. */
const keyOf = (f: FieldNode): string => `${f.module}:${f.path.join('.')}`;

/** The fold a rule goes by (its key, '' for words with no number): the longest `from` that is its page, its key or holds it, or -1. */
function foldOf(key: string, entryId: string): number {
  let best = -1;
  let len = -1;
  FOLDS.forEach((fold, i) => {
    const hit = fold.from === entryId || (key !== '' && (fold.from === key || key.startsWith(`${fold.from}.`)));
    if (hit && fold.from.length > len) {
      best = i;
      len = fold.from.length;
    }
  });
  return best;
}

/** Every field under some nodes. */
function fieldsOf(nodes: readonly CatNode[], out: FieldNode[] = []): FieldNode[] {
  for (const n of nodes) {
    if (n.type === 'field') out.push(n);
    else if (n.type === 'pair') out.push(n.ref, n.amount);
    else if (n.type === 'section') fieldsOf(n.children, out);
  }
  return out;
}

/** A rules page split up: what stays on it and what goes to each fold. */
export interface Split {
  kept: CatNode[];
  moved: Map<number, CatNode[]>;
}

/** Splits a rules page's nodes by FOLDS: a section whose numbers all go one way goes whole. */
export function splitRules(entry: Entry): Split {
  const moved = new Map<number, CatNode[]>();
  const give = (i: number, n: CatNode): void => {
    if (!moved.has(i)) moved.set(i, []);
    moved.get(i)!.push(n);
  };
  const walk = (nodes: readonly CatNode[]): CatNode[] => {
    const kept: CatNode[] = [];
    for (const n of nodes) {
      const fields = fieldsOf([n]);
      // Words with no numbers (a section of a keeper's lines) go with the whole page or stay.
      const folds = new Set(fields.length ? fields.map((f) => foldOf(keyOf(f), entry.id)) : [foldOf('', entry.id)]);
      if (folds.size === 1) {
        const i = [...folds][0]!;
        if (i >= 0) give(i, n);
        else kept.push(n);
      } else if (n.type === 'section') {
        const children = walk(n.children);
        if (children.length) kept.push({ ...n, children });
      } else kept.push(n);
    }
    return kept;
  };
  return { kept: walk(entry.children), moved };
}

/** The entry a target is, or undefined. */
export function targetEntry(cat: Catalog, t: Target): string | undefined {
  if ('ref' in t) return cat.refEntry(t.ref, t.id);
  for (const e of cat.entries.values()) if (e.path[0] === t.table && e.path[1] === t.index) return e.id;
  return undefined;
}
