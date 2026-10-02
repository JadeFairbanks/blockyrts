// Access to the blueprint's number tables. The values are text as written;
// each milestone turns the rows it needs into typed records next to the
// system that uses them, reading them from here so the doc stays the source.
import { NUMBER_TABLES } from './number-tables.ts';
import type { NumberTable, TableCell } from './table-types.ts';

export { NUMBER_TABLES };
export type { NumberTable, TableCell };

/** A table by id ("1", "2c", "11.2"). Throws on an unknown id. */
export function getTable(id: string): NumberTable {
  const t = NUMBER_TABLES.find((x) => x.id === id);
  if (!t) throw new Error(`no number table ${id}`);
  return t;
}

/** Every table and sub-table with this number. */
export function tablesNumbered(n: number): NumberTable[] {
  return NUMBER_TABLES.filter((t) => t.table === n);
}

/** The cell in a table under a column, on the first row whose first cells match `key` in order. */
export function lookup(id: string, key: readonly string[], column: string): TableCell {
  const t = getTable(id);
  const col = t.columns.indexOf(column);
  if (col < 0) throw new Error(`table ${id} has no column ${column}`);
  const row = t.rows.find((r) => key.every((k, i) => r[i]?.text === k));
  if (!row) throw new Error(`table ${id} has no row ${key.join(' / ')}`);
  return row[col]!;
}
