import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import { WorkLeaseError } from '@kburson/aitm-ledger';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';

function firstWorktree(output) {
  const normalized = String(output || '').replaceAll('\0', '\n');
  const match = normalized.match(/(?:^|\n)worktree ([^\n]+)/);
  return match?.[1]?.trim() || null;
}

export function resolveMainWorktreePath(
  projectDir,
  { allowFallback = false, exec = execFileSync, realpath = realpathSync } = {}
) {
  try {
    const output = exec('git', ['worktree', 'list', '--porcelain', '-z'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
    const main = firstWorktree(output);
    if (!main) throw new Error('git returned no main worktree');
    return realpath(path.resolve(main));
  } catch (error) {
    if (allowFallback) {
      try {
        return realpath(path.resolve(projectDir));
      } catch {
        return path.resolve(projectDir);
      }
    }
    throw new WorkLeaseError(
      'main-worktree-unresolved',
      'cannot resolve the authoritative main worktree',
      { projectDir, cause: error?.message }
    );
  }
}
