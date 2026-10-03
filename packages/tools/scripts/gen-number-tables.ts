// Generates packages/sim/src/data/number-tables.ts from docs/blueprint.md:
// the blueprint's numbered tables 1 to 19 (and their sub-tables, such as 2a
// to 2f) as typed data with each cell's suggested flag.
//
// Run after re-extracting the blueprint: pnpm --filter @blockyrts/tools gen:tables
// A test fails when the committed file is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface GenCell {
  text: string;
  suggested: boolean;
  marked: boolean;
}

export interface GenTable {
  id: string;
  table: number;
  title: string;
  caption: string;
  columns: string[];
  rows: GenCell[][];
  notes: string[];
}

const BLUEPRINT = fileURLToPath(new URL('../../../docs/blueprint.md', import.meta.url));
const TARGET = fileURLToPath(new URL('../../sim/src/data/number-tables.ts', import.meta.url));

function clean(cell: string): string {
  return cell
    .replace(/\\\|/g, '|')
    .replace(/<br>/g, '\n')
    .replace(/\*\*\*?([^*]+?)\*\*\*?/g, '$1')
    .replace(/\*([^*\s][^*]*?)\*/g, '$1')
    .trim();
}

function splitRow(line: string): string[] {
  // Split on pipes that are not escaped.
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map(clean);
}

const SUGGESTED = /\(s\)/;
const FIXED = /\((doc|Jade)\b[^)]*\)/;

/**
 * The tables' own key: "a value followed by (s) is suggested; a row ending in
 * (s) is suggested throughout except values marked (doc)", where "throughout"
 * means every number in the row (number-tables.md). A caption saying "all (s)"
 * marks the whole sub-table the same way, and a column header ending in (s)
 * its column. Label cells without a digit are never suggested by a row,
 * column or caption mark.
 */
function markRow(cells: string[], allSuggested: boolean, columnMarks: boolean[]): GenCell[] {
  const last = [...cells].reverse().find((c) => c !== '') ?? '';
  const rowSuggested = allSuggested || /\(s\)\s*$/.test(last);
  return cells.map((text, i) => {
    const marked = SUGGESTED.test(text);
    const byRow = (rowSuggested || columnMarks[i] === true) && /\d/.test(text) && !FIXED.test(text);
    return { text, suggested: marked || byRow, marked };
  });
}

export function parseNumberTables(markdown: string): GenTable[] {
  const lines = markdown.split('\n');
  const tables: GenTable[] = [];
  let section: { table: number; title: string } | null = null;
  let pendingCaption = '';
  let notes: string[] = [];
  let subIndex = 0;
  let current: GenTable[] = [];
  // A lettered sub-table (**2d. ...**) split into several tables by plain
  // paragraphs (2d: close melee, then long melee): its tables are 2d.1, 2d.2.
  let lettered: { id: string; caption: string; count: number } | null = null;

  const flushNotes = (): void => {
    for (const t of current) t.notes = notes;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = /^(#+) (.*)$/.exec(line);
    if (heading) {
      flushNotes();
      const m = /^Table (\d+): (.*)$/.exec(heading[2]!);
      section = m ? { table: Number(m[1]), title: m[2]!.trim() } : null;
      pendingCaption = '';
      notes = [];
      subIndex = 0;
      current = [];
      lettered = null;
      continue;
    }
    if (!section) continue;
    if (line.startsWith('|') && lines[i + 1]?.startsWith('|---')) {
      const columns = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.startsWith('|')) rows.push(splitRow(lines[i++]!));
      i--;
      let caption = pendingCaption;
      const sub = /^(\d+[a-z])\.\s/.exec(caption);
      subIndex++;
      if (sub) lettered = { id: sub[1]!, caption, count: 0 };
      let id: string;
      if (lettered) {
        lettered.count++;
        id = lettered.count === 1 ? lettered.id : `${lettered.id}.${lettered.count}`;
        if (!sub) caption = caption === '' ? lettered.caption : `${lettered.caption} ${caption}`;
        if (lettered.count === 2) {
          // The lettered sub-table's second part: rename the first to 2d.1 so both read alike.
          const first = tables.find((t) => t.id === lettered!.id);
          if (first) first.id = `${lettered.id}.1`;
        }
      } else id = subIndex === 1 ? String(section.table) : `${section.table}.${subIndex}`;
      if (subIndex === 2 && !sub && !lettered) {
        // A section with a second unlabelled table: rename the first to N.1 so both read alike.
        const first = tables.find((t) => t.id === String(section!.table));
        if (first) first.id = `${section.table}.1`;
      }
      const allSuggested = lettered !== null && /\ball \(s\)/.test(lettered.caption);
      const table: GenTable = {
        id,
        table: section.table,
        title: section.title,
        caption,
        columns: columns.map((c) => c),
        // A column header ending in (s), such as "Cost (s)", marks that column.
        rows: rows.map((r) => markRow(r, allSuggested, columns.map((c) => /\(s\)\s*$/.test(c)))),
        notes: [],
      };
      tables.push(table);
      current.push(table);
      pendingCaption = '';
      continue;
    }
    const text = line.trim();
    if (text === '' || text.startsWith('Key: ')) continue;
    if (/^\*\*\d+[a-z]\. /.test(text)) {
      pendingCaption = clean(text);
      lettered = { id: /^(\d+[a-z])/.exec(pendingCaption)![1]!, caption: pendingCaption, count: 0 };
    } else {
      // A paragraph just before a table is its caption; every paragraph is also kept as a note.
      pendingCaption = clean(text);
      notes.push(clean(text.replace(/^- /, '')));
    }
  }
  flushNotes();
  return tables;
}

export function renderModule(tables: GenTable[]): string {
  // One line per row keeps the file readable in diffs.
  const j = (v: unknown): string => JSON.stringify(v);
  const body =
    '[\n' +
    tables
      .map((t) =>
        [
          '  {',
          `    id: ${j(t.id)},`,
          `    table: ${t.table},`,
          `    title: ${j(t.title)},`,
          `    caption: ${j(t.caption)},`,
          `    columns: ${j(t.columns)},`,
          '    rows: [',
          ...t.rows.map((r) => `      ${j(r)},`),
          '    ],',
          '    notes: [',
          ...t.notes.map((n) => `      ${j(n)},`),
          '    ],',
          '  },',
        ].join('\n'),
      )
      .join('\n') +
    '\n]';
  return `// Generated by packages/tools/scripts/gen-number-tables.ts from docs/blueprint.md.
// Do not edit by hand: the blueprint is canon. Re-extract it, then regenerate.
import type { NumberTable } from './table-types.ts';

export const NUMBER_TABLES: readonly NumberTable[] = ${body};
`;
}

export function generate(): string {
  return renderModule(parseNumberTables(readFileSync(BLUEPRINT, 'utf8')));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = generate();
  writeFileSync(TARGET, out);
  const tables = parseNumberTables(readFileSync(BLUEPRINT, 'utf8'));
  console.log(`wrote ${tables.length} tables (${tables.map((t) => t.id).join(', ')}) to ${TARGET}`);
}
