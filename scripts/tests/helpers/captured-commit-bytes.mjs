// @story #1558
// Historical capture commits were rewritten during #1558 branch synchronization.
// A missing original object uses its reachable byte-equivalent, or the
// checksum-bound archive when a squash merge removed that ancestry.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REBASED_EQUIVALENTS = new Map([
  ['1b300cd8121b33631c5c3119daed583eb1d636fb', '4f10bb5d59c47ac91cc3fdd15b0695d5cac2a0fa'],
  ['a38843a639df71cced9f2ee5a40c46fe34ca2f00', 'f65be7720912f989e127a5adf64cef4426f0255a'],
]);
const ARCHIVE = 'scripts/tests/fixtures/1558/captured-sources';

function archivedBytes(projectRoot, commit, filePath) {
  if (
    !/^[0-9a-f]{40}$/.test(commit) ||
    typeof filePath !== 'string' ||
    filePath.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    filePath.includes('\\')
  ) {
    throw new Error('captured source archive path is invalid');
  }
  const manifest = JSON.parse(readFileSync(path.join(projectRoot, ARCHIVE, 'manifest.json')));
  if (manifest.schema !== 'aitm.captured-source-archive/v1' || !Array.isArray(manifest.entries)) {
    throw new Error('captured source archive manifest is invalid');
  }
  const matches = manifest.entries.filter(
    (entry) => entry.commit === commit && entry.filePath === filePath
  );
  if (matches.length !== 1 || !/^sha256:[0-9a-f]{64}$/.test(matches[0].sha256)) {
    throw new Error(`captured source archive lacks ${commit}:${filePath}`);
  }
  const bytes = readFileSync(path.join(projectRoot, ARCHIVE, commit, `${filePath}.snapshot`));
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== matches[0].sha256) throw new Error('captured source archive checksum mismatch');
  return bytes;
}

export function capturedCommitBytes(projectRoot, commit, filePath) {
  const original = spawnSync('git', ['show', `${commit}:${filePath}`], {
    cwd: projectRoot,
    encoding: null,
  });
  if (original.status === 0) return original.stdout;

  const equivalent = REBASED_EQUIVALENTS.get(commit);
  if (!equivalent) throw new Error(`captured commit is unavailable: ${commit}`);
  const reachable = spawnSync('git', ['merge-base', '--is-ancestor', equivalent, 'HEAD'], {
    cwd: projectRoot,
  });
  if (reachable.status === 0) {
    const replacement = spawnSync('git', ['show', `${equivalent}:${filePath}`], {
      cwd: projectRoot,
      encoding: null,
    });
    if (replacement.status !== 0) throw new Error(`captured equivalent lacks ${filePath}`);
    return replacement.stdout;
  }
  return archivedBytes(projectRoot, commit, filePath);
}
