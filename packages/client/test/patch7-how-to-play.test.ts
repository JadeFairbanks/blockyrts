import { describe, expect, it } from 'vitest';
import { importSimModules, readSimDocs } from '@blockyrts/balance/node';
import { Mob } from '@blockyrts/sim';
import { MODEL_PICTURE, modelOfPic } from '../src/ui/how-to-play/book.ts';
import { GUIDES } from '../src/ui/how-to-play/guides.ts';
import { pictureUrl } from '../src/ui/how-to-play/picture-url.ts';
import { buildingPic, entryModel, entryPic, goodPic } from '../src/ui/how-to-play/pictures.ts';
import { FOLDS, formName, targetEntry } from '../src/ui/how-to-play/sheets.ts';
import { buildWiki } from '../src/ui/how-to-play/wiki.ts';

// Jade's Patch 7 (How to play): "When I search 'Fae' in how to play, I had
// three returns for monsters ... I should have only seen one copy of a Fae
// Guardian and the two guides"; the combined monsters sheets "should not
// exist at all, nor should others like it, that data should be on each
// individual monster sheet. Follow that logic for the rest of the how to
// play guide." And: "replace all images with the rendered models (you can
// still use 2d images of things that are already 2d images such as icons."

const mods = await importSimModules();
const w = buildWiki(mods, readSimDocs(), {
  entry: (e) => entryPic(e, mods),
  ref: (kind, id) => (kind === 'res' ? goodPic(id) : null),
  level: (e, level) => (e.path[0] === 'BUILDINGS' ? buildingPic((mods[e.module]!.BUILDINGS as Array<{ kind: number }>)[e.path[1] as number]!.kind, level) : null),
  model: (e) => entryModel(e, mods),
  form: (e) => formName(e, mods),
});
const monsters = w.articles.filter((a) => a.category === 'monsters');
const fieldsOn = (title: string): Set<string> => {
  const seen = new Set<string>();
  w.blocks(w.byTitle(title)!, seen);
  return seen;
};

describe('Patch 7: one sheet per monster', () => {
  it('finds one Fae Guardian when "Fae" is searched, and the guides', () => {
    const found = w.search('fae');
    expect(found.filter((a) => a.category === 'monsters').map((a) => a.title)).toEqual(['Fae Guardian']);
    expect(found.filter((a) => a.category === 'guides').length).toBeGreaterThan(0);
  });

  it('keeps a second form on its monster\'s sheet', () => {
    for (const title of ['Fae Guardian', 'Morvath, the Hollow Crown']) {
      expect(monsters.filter((a) => a.title === title)).toHaveLength(1);
      expect(w.byTitle(title)!.parts.map((p) => p.label)).toContain(title === 'Fae Guardian' ? 'Second form: aloft, once attacked' : 'Second form: aloft');
    }
    expect(w.slugOf(`combat/mobs.ts:MOBS:${Mob.FaeGuardianAloft}`)).toBe(w.byTitle('Fae Guardian')!.slug);
  });

  it('has no two pages of one name in a section, anywhere in the book', () => {
    const seen = new Set<string>();
    const twice = w.articles.map((a) => `${a.category}: ${a.title.toLowerCase()}`).filter((k) => seen.has(k) || !seen.add(k));
    expect(twice).toEqual([]);
  });

  it('has no sheet for several monsters together: their rules are on their own sheets', () => {
    const titles = monsters.map((a) => a.title);
    for (const gone of ['The Bog guardian and the Fae Guardian', "The stone circles' keepers: the Great White Ape, Silenus and the Lich", "Late night monsters' abilities", 'The necromancer', 'Mana crystal guardians', 'Morvath', 'Where Bog guardians live']) {
      expect(titles).not.toContain(gone);
    }
    expect([...fieldsOn('Bog guardian')].some((id) => id.includes('KEEPERS.bog.'))).toBe(true);
    expect([...fieldsOn('Bog guardian')].some((id) => id.includes('KEEPERS.fae.'))).toBe(false);
    expect([...fieldsOn('Fae Guardian')].some((id) => id.includes('KEEPER_LOOT.fae.'))).toBe(true);
    expect([...fieldsOn('Lich')].some((id) => id.includes('ENCOUNTERS.lich.'))).toBe(true);
    expect([...fieldsOn('Hellhound')].some((id) => id.includes('LATE.breath.'))).toBe(true);
    expect([...fieldsOn('Morvath, the Hollow Crown')].some((id) => id.includes('LATE.ruin.'))).toBe(true);
    expect([...fieldsOn('Ash golem')].some((id) => id.includes('CRYSTAL_GUARDS.'))).toBe(true);
    expect([...fieldsOn('Necromancer')].some((id) => id.includes('NECROMANCER.'))).toBe(true);
  });

  it('sends every rule it moves to a sheet that exists', () => {
    for (const f of FOLDS) {
      for (const t of f.to) {
        const id = targetEntry(w.catalog, t);
        expect(id, `${f.from} to ${JSON.stringify(t)}`).toBeTruthy();
        expect(w.bySlug.get(w.slugOf(id!))?.title, f.from).toBeTruthy();
      }
    }
  });

  it('does the same for the rest of the book: the Tavern, the Barn, the Dreadnought and the woodsman', () => {
    for (const gone of ['The Tavern', 'The Barn', 'The Dreadnought', 'The woodsman', 'Hot spring guardians', 'The Headless God Idol']) expect(w.byTitle(gone)).toBeUndefined();
    expect([...fieldsOn('Tavern')].some((id) => id.includes('TAVERN.'))).toBe(true);
    expect([...fieldsOn('Dreadnought')].some((id) => id.includes('DREADNOUGHT.'))).toBe(true);
  });
});

describe('Patch 7: models in place of pictures', () => {
  it('shows the model of a portrait, and keeps an icon or a map mark', () => {
    expect(modelOfPic({ file: 'portrait_zombie' })).toBe('zombie');
    expect(modelOfPic({ file: 'portrait_worker_labourer' })).toBe('worker');
    expect(modelOfPic({ file: `${MODEL_PICTURE}elf_hall` })).toBe('elf_hall');
    expect(modelOfPic({ file: 'icon_tavern' })).toBe('');
    expect(modelOfPic({ file: 'minimap_lair' })).toBe('');
    expect(modelOfPic(null)).toBe('');
  });

  it('gives every monster sheet a model', () => {
    expect(monsters.filter((a) => a.entry?.path[0] === 'MOBS' && !a.model).map((a) => a.title)).toEqual([]);
  });

  it('shows no screenshots in How to Play; the patch notes keep theirs', () => {
    expect(GUIDES.flatMap((g) => [g.picture, ...g.parts.map((p) => p.picture ?? '')]).filter((f) => f.startsWith('shot_'))).toEqual([]);
    for (const shot of ['shot_start', 'shot_citadel', 'shot_barn', 'shot_barracks', 'shot_siege', 'shot_unit_card']) expect(pictureUrl(shot), shot).toBe('');
    for (const shot of ['shot_quest_offer', 'shot_quest_menu']) expect(pictureUrl(shot), shot).not.toBe('');
  });
});
