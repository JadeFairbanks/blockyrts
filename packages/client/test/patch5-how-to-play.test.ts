import { describe, expect, it } from 'vitest';
import { importSimModules, readSimDocs } from '@blockyrts/balance/node';
import { bookFromHash } from '../src/ui/book-links.ts';
import { LEFT_OUT_GROUPS } from '../src/ui/how-to-play/categories.ts';
import { GUIDES } from '../src/ui/how-to-play/guides.ts';
import { pictureUrl } from '../src/ui/how-to-play/picture-url.ts';
import { buildingPic, entryPic, goodPic } from '../src/ui/how-to-play/pictures.ts';
import { bookOf, buildWiki } from '../src/ui/how-to-play/wiki.ts';
import { NOTE_CATEGORIES, PATCH_NOTES } from '../src/ui/patch-notes/notes.ts';

// Patch 5 (EX-14, EX-4, EX-5 and Jade's answer on /balance): How to Play
// shows every stat and number, made from the game's own data so it stays
// current, and the patch notes read as a studio's would.

const mods = await importSimModules();
const w = buildWiki(mods, readSimDocs(), {
  entry: (e) => entryPic(e, mods),
  ref: (kind, id) => (kind === 'res' ? goodPic(id) : null),
  level: (e, level) => (e.path[0] === 'BUILDINGS' ? buildingPic((mods[e.module]!.BUILDINGS as Array<{ kind: number }>)[e.path[1] as number]!.kind, level) : null),
});
const included = [...w.catalog.entries.values()].filter((e) => !LEFT_OUT_GROUPS.has(e.group));

describe('How to Play pages', () => {
  it('has one page for every catalog entry, each at its own address and under a section', () => {
    expect(w.articles.filter((a) => a.entry)).toHaveLength(included.length);
    expect(new Set(w.articles.map((a) => a.slug)).size).toBe(w.articles.length);
    for (const e of included) expect(w.slugOf(e.id), e.label).not.toBe('');
    const filed = w.sections.flatMap((s) => s.shelves.flatMap((sh) => sh.articles));
    expect(filed).toHaveLength(w.articles.length);
    expect(w.sections.every((s) => s.count > 0)).toBe(true);
  });

  it('shows every balance number the sim exports on some page', () => {
    const seen = new Set<string>();
    for (const a of w.articles) w.blocks(a, seen);
    const missing = [...w.catalog.fields.values()]
      .filter((f) => !f.readOnly && !LEFT_OUT_GROUPS.has(w.catalog.entries.get(f.entryId)?.group ?? ''))
      .filter((f) => !seen.has(f.id))
      .map((f) => `${f.module} ${f.path.join('.')}`);
    expect(missing).toEqual([]);
  });

  it('puts headline numbers in tiles and shows units a player reads', () => {
    const zombie = w.byTitle('Zombie')!;
    const blocks = w.blocks(zombie);
    const tiles = blocks.find((b) => b.kind === 'tiles');
    expect(tiles?.kind === 'tiles' && tiles.facts.map((f) => f.label)).toEqual(expect.arrayContaining(['Health', 'Damage', 'Speed']));
    const bigHouse = w.blocks(w.byTitle('Big House')!);
    const levels = bigHouse.find((b) => b.kind === 'group' && b.label === 'Levels');
    expect(levels?.kind === 'group' && levels.blocks.filter((b) => b.kind === 'group').length).toBeGreaterThan(1);
    expect(JSON.stringify(bigHouse)).toContain('worker-seconds');
  });

  it('finds pages by name, and things by what they drop or use', () => {
    expect(w.search('zombie')[0]?.title).toBe('Zombie');
    expect(w.search('big house')[0]?.title).toBe('Big House');
    expect(w.search('bone').map((a) => a.title)).toContain('Zombie');
    expect(w.search('qqqqzz')).toEqual([]);
  });

  it("links a good's page to what drops it", () => {
    const bone = w.articles.find((a) => a.entry?.path[0] === 'RESOURCES' && a.title === 'Bone')!;
    const dropped = w.related(bone).find((r) => r.how === 'Dropped by');
    expect(dropped?.items.map((i) => i.title)).toContain('Zombie');
  });

  it('gives every building, kit tier, spell and research step a picture', () => {
    const tables = new Set(['BUILDINGS', 'CLOSE_KITS', 'LONG_KITS', 'RANGER_KITS', 'ARMOUR_KITS', 'SHIELD_KITS', 'TOOL_KITS', 'WAND_KITS', 'ROBE_KITS', 'SPELLS', 'RESEARCH']);
    const bare = w.articles.filter((a) => a.entry && tables.has(String(a.entry.path[0])) && !(a.pic && pictureUrl(a.pic.file))).map((a) => a.title);
    expect(bare).toEqual([]);
  });

  it("links guides only to pages that exist", () => {
    const text = GUIDES.flatMap((g) => g.parts.flatMap((p) => [...p.paragraphs, ...(p.bullets ?? [])])).join('\n');
    const links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((l) => !w.byTitle(l))).toEqual([]);
  });

  it("hands the page its whole book as plain data (How to Play's worker posts it)", () => {
    const book = structuredClone(bookOf(w));
    expect(book.articles).toHaveLength(w.articles.length);
    expect(book.articles.find((a) => a.title === 'Zombie')?.blocks.length).toBeGreaterThan(2);
  });

  it('opens from its address', () => {
    expect(bookFromHash('#how-to-play')).toEqual({ book: 'how-to-play', slug: '' });
    expect(bookFromHash('#how-to-play/monsters/zombie')).toEqual({ book: 'how-to-play', slug: 'monsters/zombie' });
    expect(bookFromHash('#patch-notes')).toEqual({ book: 'patch-notes' });
    expect(bookFromHash('#how-to-player')).toBeNull();
    expect(w.bySlug.get('monsters/zombie')?.title).toBe('Zombie');
  });
});

describe('patch notes', () => {
  const words = (o: unknown): string => JSON.stringify(o);

  it('starts with Patch 5 and keeps the four categories in order', () => {
    expect(PATCH_NOTES[PATCH_NOTES.length - 1]!.name).toBe('Patch 5');
    expect(NOTE_CATEGORIES.map((c) => c.title)).toEqual(['Bug fixes', 'Balance', 'Gameplay and content', 'Quality of life']);
    for (const n of PATCH_NOTES) for (const k of Object.keys(n.changes)) expect(NOTE_CATEGORIES.map((c) => c.id)).toContain(k);
    // Every patch but the newest keeps the version and date it went live with.
    for (const n of PATCH_NOTES.slice(1)) expect(n.version && n.date, n.name).toBeTruthy();
  });

  it("names no person and nothing only the developers see, in the notes or the guides", () => {
    const banned = /\b(jade|proteus|leo|claude|grok|threads?|debug(ger)?|pull request|PR #\d+|commit)\b/i;
    for (const n of PATCH_NOTES) expect(words(n), n.name).not.toMatch(banned);
    for (const g of GUIDES) expect(words(g), g.title).not.toMatch(banned);
  });
});
