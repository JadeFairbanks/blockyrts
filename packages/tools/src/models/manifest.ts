// Reads the deviations column of packages/assets/src/MANIFEST.md.
//
// The manifest is a Markdown table with one row per model. The converter only
// needs two cells: the model id (the column headed "id", else the first) and
// the deviation text (the column whose header contains "deviation"; a table
// without one has no deviations), plus the path cell when there is one. A deviation text waives every rule whose keywords it mentions; see
// RULE_KEYWORDS in rules.ts.

export interface ManifestDeviation {
  id: string;
  /** The row's path cell (relative to packages/assets/src), or '' if the table has none. */
  path: string;
  deviation: string;
}

function cellsOf(line: string): string[] {
  const trimmed = line.trim();
  return trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseManifestDeviations(text: string): ManifestDeviation[] {
  const out: ManifestDeviation[] = [];
  let idCol = 0;
  let devCol = -1;
  let pathCol = -1;
  let headerSeen = false;
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) {
      headerSeen = false;
      continue;
    }
    const cells = cellsOf(line);
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (!headerSeen) {
      // The first row of each table is its header.
      headerSeen = true;
      const lower = cells.map((c) => c.toLowerCase().replace(/[*`]/g, ''));
      idCol = Math.max(0, lower.indexOf('id'));
      devCol = lower.findIndex((c) => c.includes('deviation'));
      pathCol = lower.indexOf('path');
      continue;
    }
    const id = (cells[idCol] ?? '').replace(/[`*]/g, '').trim();
    const path = pathCol >= 0 ? (cells[pathCol] ?? '').replace(/[`*]/g, '').trim() : '';
    let deviation = devCol >= 0 ? (cells[devCol] ?? '') : '';
    if (/^(none|-|—|n\/a)$/i.test(deviation)) deviation = '';
    if (id) out.push({ id, path, deviation });
  }
  return out;
}

/** All deviation texts for one model id. */
export function deviationsFor(rows: readonly ManifestDeviation[], id: string): string[] {
  return rows.filter((r) => r.id === id && r.deviation).map((r) => r.deviation);
}
