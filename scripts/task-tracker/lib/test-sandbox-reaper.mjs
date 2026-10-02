// @story #1412
// Lazy crash recovery for detached worktrees created by `/task test`.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { isProcessAlive } from '../issue-mutator-lock.mjs';

const pexec = promisify(execFile);
const TOKENIZED_SANDBOX_RE = /^\.task-test-([1-9]\d*)-([0-9a-f]{8})-([1-9]\d*)-([0-9a-f]{8})$/;

// #1857 — verification worktrees need Git authority, so they cannot live in
// artifact scratch. Keep this path shared by creation and registered cleanup.
export function testSandboxDirectory(projectDir) {
  if (!projectDir) throw new TypeError('test-sandbox: projectDir is required');
  return path.join(path.resolve(projectDir), '.ai-task-manager', 'runtime', 'test-sandboxes');
}

export function parseRegisteredWorktreePaths(porcelain) {
  return String(porcelain || '')
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
}

export function selectStaleTestSandboxPaths({
  projectDir,
  worktreePaths = [],
  isPidAlive = isProcessAlive,
} = {}) {
  if (!projectDir) throw new TypeError('test-sandbox-reaper: projectDir is required');
  const expectedParents = new Set([
    testSandboxDirectory(projectDir),
    path.join(path.resolve(projectDir), '.tmp'),
  ]);
  const selected = [];

  for (const candidate of worktreePaths) {
    const resolved = path.resolve(String(candidate || ''));
    if (!expectedParents.has(path.dirname(resolved))) continue;
    const match = path.basename(resolved).match(TOKENIZED_SANDBOX_RE);
    if (!match) continue;
    const pid = Number(match[3]);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;

    let alive = true;
    try {
      alive = isPidAlive(pid) !== false;
    } catch {
      alive = true;
    }
    if (!alive) selected.push(resolved);
  }
  return selected;
}

export async function listRegisteredWorktreePaths({ projectDir } = {}) {
  const { stdout } = await pexec('git', ['worktree', 'list', '--porcelain', '-z'], {
    cwd: projectDir,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseRegisteredWorktreePaths(stdout);
}

export async function reapStaleTestSandboxes({
  projectDir,
  removeWorktree,
  listWorktrees = listRegisteredWorktreePaths,
  isPidAlive = isProcessAlive,
} = {}) {
  if (typeof removeWorktree !== 'function') {
    throw new TypeError('test-sandbox-reaper: removeWorktree is required');
  }

  let worktreePaths;
  try {
    worktreePaths = await listWorktrees({ projectDir });
  } catch {
    return { candidates: [], attempted: [] };
  }

  const candidates = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths,
    isPidAlive,
  });
  const attempted = [];
  for (const worktreePath of candidates) {
    attempted.push(worktreePath);
    try {
      await removeWorktree({ projectDir, path: worktreePath });
    } catch {
      // Best-effort crash recovery; normal sandbox creation must still run.
    }
  }
  return { candidates, attempted };
}
