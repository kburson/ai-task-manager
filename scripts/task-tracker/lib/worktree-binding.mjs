// @story #1163
// Resolve the Git checkout identity at bind time. This module is intentionally
// write-side only until #1164 introduces the issue-bound project-dir reader.

import { execFileSync as defaultExecFileSync } from 'node:child_process';
import path from 'node:path';

export class WorktreeResolutionError extends Error {
  constructor(projectDir, cause) {
    const detail = String(cause?.stderr || cause?.message || cause || '').trim();
    super(
      `Unable to resolve a Git worktree for bind directory "${projectDir}"${detail ? `: ${detail}` : ''}`
    );
    this.name = 'WorktreeResolutionError';
    this.projectDir = projectDir;
    this.cause = cause;
  }
}

export function resolveWorktreeBinding({
  projectDir = process.cwd(),
  now = () => new Date().toISOString(),
  execFileSync = defaultExecFileSync,
} = {}) {
  const invokingDir = path.resolve(projectDir);
  try {
    const options = { cwd: invokingDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    const worktreePath = path.resolve(
      String(execFileSync('git', ['rev-parse', '--show-toplevel'], options)).trim()
    );
    const worktreeBranch = String(
      execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], options)
    ).trim();
    if (!worktreePath || !worktreeBranch) throw new Error('Git returned an empty identity field');
    return {
      worktreePath,
      worktreeBranch,
      worktreeResolvedAt: now(),
    };
  } catch (error) {
    throw new WorktreeResolutionError(invokingDir, error);
  }
}
