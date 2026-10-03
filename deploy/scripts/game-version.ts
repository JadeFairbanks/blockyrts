// The game version shown on the main menu, worked out by the Deploy workflow
// (deploy/README.md, "Game version"). version.json at the repository root
// names the stage ("indev", later "alpha" and "beta") and the lowest number
// the next deploy may take; each deploy tags its commit live-<number> and the
// next one goes up by 0.1. Pure functions, so the client's tests cover them.

export interface VersionFile {
  stage: string;
  next: string;
}

export interface DeployVersion {
  /** What the main menu shows, such as "indev 0.1". */
  label: string;
  /** The git tag for the deployed commit, such as "live-0.1". */
  tag: string;
  /** False when this commit already went live under that tag (a re-run). */
  fresh: boolean;
}

export const LIVE_TAG_PREFIX = 'live-';

/** "0.1" to 1, "1.0" and "1" to 10; whole tenths only. */
export function toTenths(version: string): number {
  const m = /^(\d+)(?:\.(\d))?$/.exec(version.trim());
  if (!m) throw new Error(`"${version}" is not a version such as 0.1 or 1.0.`);
  return Number(m[1]) * 10 + Number(m[2] ?? '0');
}

/** 1 to "0.1", 10 to "1.0". */
export function fromTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

function liveTenths(tag: string): number | null {
  if (!tag.startsWith(LIVE_TAG_PREFIX)) return null;
  try {
    return toTenths(tag.slice(LIVE_TAG_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * The version for a deploy: the commit's own live tag when it already went
 * live, else 0.1 above the highest live tag, but never below version.json's
 * `next` (so a bigger step is an edit to that file).
 */
export function deployVersion(file: VersionFile, liveTags: readonly string[], headTags: readonly string[]): DeployVersion {
  const stage = file.stage.trim();
  if (stage === '') throw new Error('version.json needs a stage, such as "indev".');
  const own = headTags.map(liveTenths).filter((t): t is number => t !== null);
  if (own.length > 0) {
    const t = Math.max(...own);
    return { label: `${stage} ${fromTenths(t)}`, tag: `${LIVE_TAG_PREFIX}${fromTenths(t)}`, fresh: false };
  }
  const last = Math.max(0, ...liveTags.map(liveTenths).filter((t): t is number => t !== null));
  const t = Math.max(toTenths(file.next), last + 1);
  return { label: `${stage} ${fromTenths(t)}`, tag: `${LIVE_TAG_PREFIX}${fromTenths(t)}`, fresh: true };
}
