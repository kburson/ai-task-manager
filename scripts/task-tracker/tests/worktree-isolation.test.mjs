#!/usr/bin/env node
// Worktree isolation — issue #130.
//
// Asserts that two sub-agent worktrees, each with their own
// `.ai-task-manager/` root, never share active-task state. Each child's
// bind writes to its own state file; the parent epic's state is not
// mutated when a child binds in its sibling worktree.
//
// This is the structural-test equivalent of "parent epic's timing log
// contains zero child-emitted rows": if state is correctly partitioned
// per-worktree (no shared global), then the chokepoint in move-state.mjs
// cannot post a child-issue's row against the parent epic's log.
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

function makeSandbox(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  return dir;
}

function readState(dir) {
  // Per-session migration (#212): bound-issue triple lives in
  // .ai-task-manager/sessions/<sid>/active-task.json. Fall back to the legacy
  // global file if a session record isn't present.
  const sid = process.env.CLAUDE_SESSION_ID || 'default-session';
  const sessionPath = path.join(dir, '.ai-task-manager', 'sessions', sid, 'active-task.json');
  const globalPath = path.join(dir, '.ai-task-manager', 'task-tracker-state.json');
  const globalRaw = (() => {
    try {
      return JSON.parse(readFileSync(globalPath, 'utf8'));
    } catch {
      return {};
    }
  })();
  try {
    const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
    return { ...globalRaw, active: session.issue ?? null };
  } catch {
    return { active: globalRaw.active ?? null, ...globalRaw };
  }
}

const parent = makeSandbox('tt-iso-parent-');
const childA = makeSandbox('tt-iso-child-a-');
const childB = makeSandbox('tt-iso-child-b-');

const baseEnv = { ...process.env, TT_SKIP_NETWORK: '1' };

// Parent worktree binds epic #500.
await pexec('node', [CLI, '#500'], {
  env: { ...baseEnv, AI_TASK_MANAGER_PROJECT_DIR: parent },
});

// Child A worktree binds sub-issue #501.
await pexec('node', [CLI, '#501'], {
  env: { ...baseEnv, AI_TASK_MANAGER_PROJECT_DIR: childA },
});

// Child B worktree binds sub-issue #502.
await pexec('node', [CLI, '#502'], {
  env: { ...baseEnv, AI_TASK_MANAGER_PROJECT_DIR: childB },
});

// Each worktree's state must contain only its own active issue.
const sParent = readState(parent);
const sA = readState(childA);
const sB = readState(childB);

assert.equal(sParent.active, '#500', 'parent worktree active must be #500');
assert.equal(sA.active, '#501', 'child A worktree active must be #501');
assert.equal(sB.active, '#502', 'child B worktree active must be #502');

// Cross-pollination check: no child's state file references the
// other child's or the parent's active issue.
assert.notEqual(sA.active, sParent.active, 'child A must not inherit parent active');
assert.notEqual(sA.active, sB.active, 'child A active must differ from child B');
assert.notEqual(sB.active, sParent.active, 'child B must not inherit parent active');

// Each state directory's file is physically distinct (sanity check —
// different sandbox dirs cannot share an inode through ts/json contents).
const parentPath = path.join(parent, '.ai-task-manager', 'task-tracker-state.json');
const aPath = path.join(childA, '.ai-task-manager', 'task-tracker-state.json');
const bPath = path.join(childB, '.ai-task-manager', 'task-tracker-state.json');
assert.notEqual(parentPath, aPath);
assert.notEqual(aPath, bPath);

// Closing child A in its worktree must not clear the parent's active.
await pexec('node', [CLI, 'close', '#501'], {
  env: { ...baseEnv, AI_TASK_MANAGER_PROJECT_DIR: childA },
});
const sParentAfter = readState(parent);
const sAAfter = readState(childA);
assert.equal(sParentAfter.active, '#500', 'parent active must persist after child A close');
assert.equal(sAAfter.active, null, 'child A active must clear after its own close');

rmSync(parent, { recursive: true });
rmSync(childA, { recursive: true });
rmSync(childB, { recursive: true });

console.log('worktree-isolation.test.mjs: ok');
