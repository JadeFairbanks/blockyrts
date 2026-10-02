// Shapes of the blueprint's number tables as data.

export interface TableCell {
  /** The cell as written in the blueprint, markers such as (s), (doc) and (Jade) included. */
  text: string;
  /**
   * True when the value is a suggestion that may be retuned in the balance
   * pass, following the tables' key: the cell says (s); or its row ends in
   * (s), its column header ends in (s) or its sub-table caption says
   * "all (s)", and the cell holds a number not marked (doc) or (Jade).
   * False means a fixed value set by Jade or the doc.
   */
  suggested: boolean;
  /**
   * True when the cell carries its own (s). The key cannot tell whether a
   * trailing (s) on a row's last value marks that value or the whole row;
   * `suggested` takes the whole row, and this flag keeps the narrower reading.
   */
  marked: boolean;
}

export interface NumberTable {
  /** "1" to "19", sub-tables as "2a" to "2f", unlabelled pairs as "11.1" and "11.2". */
  id: string;
  /** The table number, 1 to 19. */
  table: number;
  title: string;
  /** The paragraph or bold line just above the table, which often scopes it. */
  caption: string;
  columns: string[];
  rows: TableCell[][];
  /** Every paragraph of the table's section: how the values were set, rules, exceptions. */
  notes: string[];
}
