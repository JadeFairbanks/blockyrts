// The model converter's command line: converts every .bbmodel under
// packages/assets/base/models (the project's own bodies) and
// packages/assets/src/models (the modelling bot's pull requests) into
// packages/client/public/models/<id>.glb and <id>.json, plus index.json.
// A world prop's state sets (state-sets.ts) are written as <id>@<set> too.
//
//   pnpm --filter @blockyrts/tools models:build [--out <dir>] [--assets <dir>]
//
// --assets (or MODELS_ASSETS_DIR) points at another packages/assets copy, for
// example an unmerged asset branch extracted with git archive.
//
// Every rule violation is printed; any violation that the model's
// MANIFEST.md row does not waive fails the build (exit code 1).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertModel, type ConvertedModel } from './convert.ts';
import { deviationsFor, parseManifestDeviations } from './manifest.ts';
import { CATEGORIES } from './rules.ts';
import { STATE_SEP, STATE_SET_CATEGORIES, stateSetVariants } from './state-sets.ts';

export const ASSETS_DIR = fileURLToPath(new URL('../../../assets/', import.meta.url));
export const DEFAULT_OUT_DIR = fileURLToPath(new URL('../../../client/public/models/', import.meta.url));
/** The model trees, relative to packages/assets. Only src/ models use MANIFEST.md. */
export const MODEL_TREES = ['base/models', 'src/models'] as const;

export interface ModelIndexEntry {
  id: string;
  category: string;
  glb: string;
  json: string;
}

export interface BuildResult {
  models: ConvertedModel[];
  /** Problems not tied to one model (duplicate ids). */
  problems: string[];
  ok: boolean;
}

function findBbmodels(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findBbmodels(full));
    else if (name.endsWith('.bbmodel')) out.push(full);
  }
  return out;
}

/** Indented JSON with arrays of numbers kept on one line. */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 1).replace(/\[[-\d.e,\s]*\]/g, (m) => m.replace(/\s+/g, ' ').replace('[ ', '[').replace(' ]', ']'));
}

export function buildModels(options: { assetsDir?: string; outDir?: string | null } = {}): BuildResult {
  const assetsDir = resolve(options.assetsDir ?? ASSETS_DIR);
  const outDir = options.outDir === undefined ? DEFAULT_OUT_DIR : options.outDir;
  const manifestPath = join(assetsDir, 'src', 'MANIFEST.md');
  const manifest = existsSync(manifestPath) ? parseManifestDeviations(readFileSync(manifestPath, 'utf8')) : [];
  const models: ConvertedModel[] = [];
  const problems: string[] = [];
  const index: ModelIndexEntry[] = [];
  const seen = new Map<string, string>();

  for (const tree of MODEL_TREES) {
    const root = join(assetsDir, tree);
    for (const file of findBbmodels(root)) {
      const id = basename(file, '.bbmodel');
      const source = relative(assetsDir, file).split(sep).join('/');
      const [category = '', folder = '', ...rest] = relative(root, file).split(sep);
      const layoutProblems: string[] = [];
      if (!(CATEGORIES as readonly string[]).includes(category)) {
        layoutProblems.push(`category folder "${category}" is not one of ${CATEGORIES.join(', ')}`);
      }
      // A file elsewhere is fine when its MANIFEST.md row gives that path (equipment sets share a folder).
      const listedHere = tree === 'src/models' && manifest.some((r) => r.id === id && r.path === `models/${relative(root, file).split(sep).join('/')}`);
      if ((folder !== id || rest.length !== 1) && !listedHere) layoutProblems.push(`the file must be at ${tree}/<category>/${id}/${id}.bbmodel`);
      // Pieces of an equipment set (a <name>_equipment folder) are small items.
      const budgetCategory = folder.endsWith('_equipment') ? 'items' : category;
      const previous = seen.get(id);
      if (previous) {
        problems.push(`model id "${id}" is used by both ${previous} and ${source}`);
        continue;
      }
      seen.set(id, source);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        problems.push(`${source}: not valid JSON (${(e as Error).message})`);
        continue;
      }
      const deviations = tree === 'src/models' ? deviationsFor(manifest, id) : [];
      const result = convertModel(raw, { id, category, source, layoutProblems, budgetCategory }, deviations);
      models.push(result);
      if (result.errors.length === 0 && result.glb && result.sidecar) {
        index.push({ id, category, glb: `${id}.glb`, json: `${id}.json` });
        // Each state set as a drawn model of its own, under the same rules and waivers.
        if (STATE_SET_CATEGORIES.includes(category)) {
          for (const v of stateSetVariants(raw)) {
            const vid = `${id}${STATE_SEP}${v.set}`;
            const variant = convertModel(v.raw, { id: vid, category, source, layoutProblems, budgetCategory }, deviations);
            models.push(variant);
            if (variant.errors.length === 0 && variant.glb && variant.sidecar) index.push({ id: vid, category, glb: `${vid}.glb`, json: `${vid}.json` });
          }
        }
      }
    }
  }

  const ok = problems.length === 0 && models.every((m) => m.errors.length === 0 && m.glb !== null);
  if (outDir !== null) {
    // The folder is generated output: start clean so removed models disappear.
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const m of models) {
      if (m.errors.length > 0 || !m.glb || !m.sidecar) continue;
      writeFileSync(join(outDir, `${m.id}.glb`), m.glb);
      writeFileSync(join(outDir, `${m.id}.json`), `${formatJson(m.sidecar)}\n`);
    }
    writeFileSync(join(outDir, 'index.json'), `${JSON.stringify({ version: 1, models: index }, null, 1)}\n`);
  }
  return { models, problems, ok };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const flag = (name: string): string | undefined => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const outArg = flag('--out');
  const outDir = outArg ? resolve(outArg) : DEFAULT_OUT_DIR;
  const assetsArg = flag('--assets') ?? process.env.MODELS_ASSETS_DIR;
  const result = buildModels({ outDir, ...(assetsArg ? { assetsDir: resolve(assetsArg) } : {}) });
  for (const m of result.models) {
    const s = m.sidecar;
    const summary = s ? `${s.cubes} cubes, ${s.bones.length} bones, ${s.clips.length} clips, ${s.parts.length} parts` : 'not built';
    console.log(`${m.errors.length === 0 && m.glb ? 'ok  ' : 'FAIL'} ${m.id} (${summary})`);
    for (const v of m.violations) console.log(`     ${v.waived ? 'waived by MANIFEST.md' : 'error'} [${v.rule}] ${m.id}: ${v.message}`);
  }
  for (const p of result.problems) console.log(`FAIL ${p}`);
  const byRule = new Map<string, number>();
  for (const m of result.models) for (const v of m.errors) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
  const clean = result.models.filter((m) => m.errors.length === 0 && m.glb).length;
  console.log(`${clean} of ${result.models.length} model(s) converted cleanly${byRule.size ? `; errors by rule: ${[...byRule].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ')}` : ''}`);
  console.log(`${result.models.length} model(s) -> ${relative(process.cwd(), outDir) || '.'}${result.ok ? '' : ' (build failed)'}`);
  if (!result.ok) process.exitCode = 1;
}

