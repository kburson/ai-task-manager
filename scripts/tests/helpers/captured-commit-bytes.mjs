// @story #1558
// Historical capture commits were rewritten during #1558 branch synchronization.
// A missing original object may use only its audited, reachable byte-equivalent.
import { spawnSync } from 'node:child_process';

const REBASED_EQUIVALENTS = new Map([
  ['1b300cd8121b33631c5c3119daed583eb1d636fb', '4f10bb5d59c47ac91cc3fdd15b0695d5cac2a0fa'],
  ['a38843a639df71cced9f2ee5a40c46fe34ca2f00', 'f65be7720912f989e127a5adf64cef4426f0255a'],
]);

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
  if (reachable.status !== 0)
    throw new Error(`captured equivalent is not reachable: ${equivalent}`);
  const replacement = spawnSync('git', ['show', `${equivalent}:${filePath}`], {
    cwd: projectRoot,
    encoding: null,
  });
  if (replacement.status !== 0) throw new Error(`captured equivalent lacks ${filePath}`);
  return replacement.stdout;
}
