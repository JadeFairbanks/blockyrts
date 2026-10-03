// The file the balance editor exports and `balance:apply` reads: only the
// values Jade changed, each with a stable path into the sim's data.

/** Bumped when the file's shape changes in a way old readers cannot follow. */
export const SCHEMA_VERSION = 1;
export const FILE_KIND = 'blockyrts-balance-changes';

/** A path into a module's exports: the export's name, then object keys and array indices. */
export type DataPath = ReadonlyArray<string | number>;

export type RawValue = number | boolean;

export interface BalanceChange {
  /** The sim source file the value lives in, relative to packages/sim/src, e.g. "buildings/data.ts". */
  module: string;
  /** The export's name, then keys and indices down to the value, e.g. ["BUILDINGS", 0, "levels", 1, "ws"]. */
  path: DataPath;
  /** Where the value sits, in the editor's words, e.g. "Buildings > Big House > Level 2: Longhall > Build work". */
  label: string;
  /** The value as the sim holds it (steps, basis points, world units...). */
  old: RawValue;
  new: RawValue;
  /** The unit the editor showed, and the old and new values in it, for people reading the file. */
  unit: string;
  oldDisplay: string;
  newDisplay: string;
  note?: string;
}

/** A free note about one entry (a building, a mob...), for asks the editor cannot express as a value. */
export interface EntryNote {
  module: string;
  path: DataPath;
  label: string;
  note: string;
}

export interface BalanceFile {
  kind: typeof FILE_KIND;
  schema: number;
  /** The git commit the editor's tables were built from. */
  commit: string;
  /** When the editor was built and when the file was exported (ISO times). */
  builtAt: string;
  exportedAt: string;
  changes: BalanceChange[];
  entryNotes: EntryNote[];
  /** Anything else Jade wants to say about this round of balancing. */
  notes: string;
}

export function pathKey(module: string, path: DataPath): string {
  return `${module}#${path.join('.')}`;
}

function isPath(p: unknown): p is DataPath {
  return Array.isArray(p) && p.length > 0 && p.every((s) => typeof s === 'string' || (typeof s === 'number' && Number.isInteger(s) && s >= 0));
}

function isRaw(v: unknown): v is RawValue {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

/** Checks a parsed file; throws with a readable message when it is not a balance changes file this version reads. */
export function parseBalanceFile(json: unknown): BalanceFile {
  const f = json as Partial<BalanceFile> | null;
  if (!f || typeof f !== 'object' || f.kind !== FILE_KIND) throw new Error('This is not a balance changes file from the balance editor.');
  if (typeof f.schema !== 'number' || f.schema > SCHEMA_VERSION) {
    throw new Error(`This file uses schema ${String(f.schema)}; this editor reads schema ${SCHEMA_VERSION} and older.`);
  }
  if (!Array.isArray(f.changes)) throw new Error('The file has no list of changes.');
  f.changes.forEach((c, i) => {
    if (typeof c?.module !== 'string' || !isPath(c.path) || !isRaw(c.old) || !isRaw(c.new)) {
      throw new Error(`Change ${i + 1} is missing its module, path, old or new value.`);
    }
  });
  const notes = Array.isArray(f.entryNotes) ? f.entryNotes.filter((n) => typeof n?.module === 'string' && isPath(n.path) && typeof n.note === 'string') : [];
  return {
    kind: FILE_KIND,
    schema: f.schema,
    commit: typeof f.commit === 'string' ? f.commit : '',
    builtAt: typeof f.builtAt === 'string' ? f.builtAt : '',
    exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '',
    changes: f.changes.map((c) => ({
      module: c.module, path: [...c.path], label: String(c.label ?? ''), old: c.old, new: c.new,
      unit: String(c.unit ?? ''), oldDisplay: String(c.oldDisplay ?? c.old), newDisplay: String(c.newDisplay ?? c.new),
      ...(typeof c.note === 'string' && c.note !== '' ? { note: c.note } : {}),
    })),
    entryNotes: notes.map((n) => ({ module: n.module, path: [...n.path], label: String(n.label ?? ''), note: n.note })),
    notes: typeof f.notes === 'string' ? f.notes : '',
  };
}

/** The value at a path inside a module's exports, or undefined when the path leads nowhere. */
export function valueAt(exports: Readonly<Record<string, unknown>>, path: DataPath): unknown {
  let v: unknown = exports;
  for (const step of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string | number, unknown>)[step];
  }
  return v;
}

/** The download's file name for a date: balance-changes-YYYY-MM-DD.json. */
export function exportFileName(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `balance-changes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
