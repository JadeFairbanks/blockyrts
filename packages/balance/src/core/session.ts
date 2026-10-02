// One editing session: the values changed so far, with notes, and turning
// them into the export file and back.

import type { Catalog, FieldNode } from './catalog.ts';
import { FILE_KIND, SCHEMA_VERSION, pathKey, type BalanceFile, type RawValue } from './schema.ts';
import { formatValue, UNITS } from './units.ts';

export interface Pending {
  value: RawValue;
  note: string;
}

export interface LoadReport {
  /** Changes now pending. */
  applied: number;
  /** Changes whose old value differs from these tables: the tables moved since the file was made. */
  moved: string[];
  /** Changes whose path no longer exists in these tables. */
  missing: string[];
  /** Changes that equal these tables already: nothing to do. */
  same: string[];
}

export class Session {
  readonly changes = new Map<string, Pending>();
  readonly entryNotes = new Map<string, string>();
  notes = '';

  constructor(readonly cat: Catalog) {}

  /** The value shown for a field: the pending one, else the tables'. */
  current(f: FieldNode): RawValue {
    return this.changes.get(f.id)?.value ?? f.value;
  }

  set(id: string, value: RawValue): void {
    const f = this.cat.fields.get(id);
    if (!f || f.readOnly) return;
    if (value === f.value) {
      this.changes.delete(id);
      return;
    }
    this.changes.set(id, { value, note: this.changes.get(id)?.note ?? '' });
  }

  setNote(id: string, note: string): void {
    const p = this.changes.get(id);
    if (p) p.note = note;
  }

  reset(id: string): void {
    this.changes.delete(id);
  }

  clear(): void {
    this.changes.clear();
    this.entryNotes.clear();
    this.notes = '';
  }

  /** "Buildings and levels > Big House > Level 2: Longhall > Build work". */
  labelOf(f: FieldNode): string {
    const e = this.cat.entries.get(f.entryId);
    const group = this.cat.groups.find((g) => g.id === e?.group)?.label ?? '';
    return [group, e?.label ?? '', ...f.trail, f.label].filter((s) => s !== '').join(' > ');
  }

  /** A value as a person reads it: "75 s", "Bronze", "Yes". */
  show(f: FieldNode, v: RawValue): string {
    if (f.ref && typeof v === 'number') return this.cat.refNames[f.ref].get(v) ?? `#${v}`;
    return formatValue(v, f.unit);
  }

  toFile(meta: { commit: string; builtAt: string; now: Date }): BalanceFile {
    const changes = [...this.changes].flatMap(([id, p]) => {
      const f = this.cat.fields.get(id);
      if (!f) return [];
      return [{
        module: f.module, path: [...f.path], label: this.labelOf(f), old: f.value, new: p.value,
        unit: f.ref ? `${f.ref} id` : UNITS[f.unit].hint || 'number', oldDisplay: this.show(f, f.value), newDisplay: this.show(f, p.value),
        ...(p.note.trim() ? { note: p.note.trim() } : {}),
      }];
    });
    changes.sort((a, b) => a.label.localeCompare(b.label));
    const entryNotes = [...this.entryNotes].flatMap(([id, note]) => {
      const e = this.cat.entries.get(id);
      if (!e || !note.trim()) return [];
      const group = this.cat.groups.find((g) => g.id === e.group)?.label ?? '';
      return [{ module: e.module, path: [...e.path], label: `${group} > ${e.label}`, note: note.trim() }];
    });
    return {
      kind: FILE_KIND, schema: SCHEMA_VERSION, commit: meta.commit, builtAt: meta.builtAt, exportedAt: meta.now.toISOString(),
      changes, entryNotes, notes: this.notes.trim(),
    };
  }

  /** Restores a file's changes on top of what is pending. */
  load(file: BalanceFile): LoadReport {
    const report: LoadReport = { applied: 0, moved: [], missing: [], same: [] };
    for (const c of file.changes) {
      const f = this.cat.fields.get(pathKey(c.module, c.path));
      if (!f || f.readOnly || typeof f.value !== typeof c.new) {
        report.missing.push(c.label || pathKey(c.module, c.path));
        continue;
      }
      if (f.value === c.new) {
        report.same.push(c.label);
        continue;
      }
      if (f.value !== c.old) report.moved.push(`${c.label}: was ${c.oldDisplay} when exported, these tables say ${this.show(f, f.value)}`);
      this.changes.set(f.id, { value: c.new, note: c.note ?? '' });
      report.applied++;
    }
    for (const n of file.entryNotes) {
      const e = [...this.cat.entries.values()].find((x) => x.module === n.module && pathKey(x.module, x.path) === pathKey(n.module, n.path));
      if (e) this.entryNotes.set(e.id, n.note);
      else report.missing.push(`Note on ${n.label}`);
    }
    if (file.notes) this.notes = this.notes ? `${this.notes}\n${file.notes}` : file.notes;
    return report;
  }
}
