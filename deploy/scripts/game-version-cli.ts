// Deploy workflow helper: prints label=, tag= and fresh= lines for
// $GITHUB_OUTPUT from version.json and the repository's live-* tags.
// Run from the repository root after `git fetch --tags`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deployVersion, LIVE_TAG_PREFIX, type VersionFile } from './game-version.ts';

const git = (...args: string[]): string[] =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter((s) => s !== '');

const file = JSON.parse(readFileSync('version.json', 'utf8')) as VersionFile;
const v = deployVersion(file, git('tag', '--list', `${LIVE_TAG_PREFIX}*`), git('tag', '--points-at', 'HEAD'));
process.stdout.write(`label=${v.label}\ntag=${v.tag}\nfresh=${v.fresh}\n`);
