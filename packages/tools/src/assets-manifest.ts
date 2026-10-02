// Assets manifest (M0 stub of the model converter): lists the rows of
// packages/assets/src/MANIFEST.md and checks them against the model files.
// The real converter, which writes .glb files and checks the wishlist rules,
// is M1 work.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../assets/src/', import.meta.url));

export interface ManifestRow {
  id: string;
  path: string;
  cubes: string;
  texture: string;
  deviation: string;
}

export function readManifest(text: string): ManifestRow[] {
  const rows: ManifestRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells[0] === 'id') continue;
    const [id = '', path = '', cubes = '', texture = '', deviation = ''] = cells;
    rows.push({ id, path, cubes, texture, deviation });
  }
  return rows;
}

function findModels(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findModels(full));
    else if (name.endsWith('.bbmodel')) out.push(relative(root, full));
  }
  return out.sort();
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const rows = readManifest(readFileSync(join(root, 'MANIFEST.md'), 'utf8'));
  const files = findModels(join(root, 'models'));
  console.log(`${rows.length} manifest rows, ${files.length} model files`);
  for (const r of rows) {
    const ok = existsSync(join(root, r.path)) ? 'ok     ' : 'MISSING';
    console.log(`${ok} ${r.id}  ${r.path}  cubes ${r.cubes}  texture ${r.texture}${r.deviation ? `  (${r.deviation})` : ''}`);
  }
  const listed = new Set(rows.map((r) => r.path));
  const unlisted = files.filter((f) => !listed.has(f));
  for (const f of unlisted) console.log(`NOT IN MANIFEST ${f}`);
  if (unlisted.length > 0 || rows.some((r) => !existsSync(join(root, r.path)))) process.exitCode = 1;
}
