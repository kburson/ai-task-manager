// Dirty-workspace detection for issue-boundary gates.
// Runs `git status --porcelain=v1` in a given cwd and classifies the result.
// Pure: callers pass a runner so tests can stub the shell.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { findMainWorktreePath, fleetRegistryPath } from '../../task-tracker/fleet-registry.mjs';
import { readFileSync } from 'node:fs';

const pexec = promisify(execFile);

export const DEFAULT_TRUNCATE_LINES = 10;
export const DEFAULT_AUDIT_LINES = 5;

const defaultRunner = async (cwd) => {
  const { stdout } = await pexec(
    'git',
    ['-c', 'core.quotepath=false', 'status', '--porcelain=v1'],
    {
      cwd,
      timeout: 5000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    }
  );
  return stdout;
};

export async function checkDirty({ cwd, runner = defaultRunner } = {}) {
  if (!cwd || !existsSync(cwd)) {
    return { dirty: false, lines: [], total: 0, skipped: true };
  }
  let stdout = '';
  try {
    stdout = await runner(cwd);
  } catch {
    return { dirty: false, lines: [], total: 0, skipped: true };
  }
  const lines = stdout
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);
  return { dirty: lines.length > 0, lines, total: lines.length, skipped: false };
}

export function formatSummary({ lines, total }, { max = DEFAULT_TRUNCATE_LINES } = {}) {
  if (total === 0) return '';
  const shown = lines.slice(0, max);
  const remainder = total - shown.length;
  const out = shown.slice();
  if (remainder > 0) out.push(`… +${remainder} more (total ${total} dirty paths)`);
  return out.join('\n');
}

export function shortAuditDescription({ lines, total }, { max = DEFAULT_AUDIT_LINES } = {}) {
  const shown = lines.slice(0, max).map((l) => l.trim());
  const tail = total > shown.length ? `; +${total - shown.length} more` : '';
  return `dirty=${total}: ${shown.join('; ')}${tail}`;
}

// Workspace resolution: fleet entry wins, else fall back to provided projectDir.
export function resolveWorkspaceForIssue({ issueRef, projectDir }) {
  try {
    const mainPath = findMainWorktreePath(projectDir);
    const rPath = fleetRegistryPath(mainPath);
    if (existsSync(rPath)) {
      const data = JSON.parse(readFileSync(rPath, 'utf8'));
      const entry = data?.[issueRef];
      if (entry?.worktreePath && existsSync(entry.worktreePath)) {
        return resolvePath(entry.worktreePath);
      }
    }
  } catch {
    /* fall through */
  }
  return resolvePath(projectDir);
}

export const CLEANUP_GUIDANCE =
  'Cleanup flow (manual; see docs/guides/workflow.md → Cleanup Procedure):\n' +
  '  1. Inspect: git status\n' +
  '  2. Stage + commit issue-relevant changes for this issue ONLY.\n' +
  '  3. For unrelated changes: stash (`git stash push -m "…"`) or move to a separate branch.\n' +
  '  4. Re-run: /task close <id>\n';
