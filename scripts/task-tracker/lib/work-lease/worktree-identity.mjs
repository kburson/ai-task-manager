import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import { WorkLeaseError } from '@kburson/aitm-ledger';
import { GIT_TIMEOUT_MS } from '../process-timeouts.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveWorktreeIdentity(
  projectDir,
  { hostId, exec = execFileSync, realpath = realpathSync } = {}
) {
  if (typeof hostId !== 'string' || hostId.trim() === '') {
    throw new WorkLeaseError('invalid-request', 'hostId is required for worktree identity');
  }
  try {
    const displayPath = realpath(path.resolve(projectDir));
    const rawGitDir = String(
      exec('git', ['rev-parse', '--git-dir'], {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
      })
    ).trim();
    if (!rawGitDir) throw new Error('git returned an empty worktree directory');
    const gitDir = realpath(path.resolve(projectDir, rawGitDir));
    return {
      worktreeId: `wt:v1:${sha256(`${hostId}\0${gitDir}`)}`,
      pathHash: sha256(displayPath),
      displayPath,
    };
  } catch (error) {
    if (error instanceof WorkLeaseError) throw error;
    throw new WorkLeaseError(
      'main-worktree-unresolved',
      'cannot resolve canonical worktree identity',
      { projectDir, cause: error?.message }
    );
  }
}
