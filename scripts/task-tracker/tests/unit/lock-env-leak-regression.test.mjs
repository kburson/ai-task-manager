#!/usr/bin/env node
// @story #541
// Regression: AITM_ISSUE_LOCK_HELD must not leak into the move-state subprocess
// the lock-contention tests spawn.
//
// `promote` spawns the develop→test delegate while holding `withIssueLock`,
// which sets `AITM_ISSUE_LOCK_HELD=1` in `process.env`. That flag flowed
// promote → test delegate → `npm run test:all` → each test file → the move-state
// child the contention tests spawn. move-state honors the flag as "lock already
// held upstream, skip re-acquisition", so contention never fired and the tests
// silently passed through to a live `gh` call — green at repo root, red in the
// sandbox.
//
// This test reproduces the leak in-process: it sets `AITM_ISSUE_LOCK_HELD=1` in
// the ambient env, pre-creates a held lock dir, then spawns move-state twice:
//   1. With the flag scrubbed (the production fix) → contention MUST fire.
//   2. As a negative control, with the flag passed through → move-state skips
//      acquisition and exits 0, demonstrating the leak the scrub defends against.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { issueLockPath } from '../../issue-mutator-lock.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const MOVE_STATE = path.resolve(__dir, '..', '../../gh/move-state.mjs');
const REPO_ROOT = path.resolve(__dir, '..', '../../..');

function setupProjectDir() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-leak-'));
  const cfgDir = path.join(dir, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    path.join(cfgDir, 'task-tracker.json'),
    readFileSync(path.join(REPO_ROOT, '.ai-task-manager/task-tracker.json'), 'utf8'),
    'utf8'
  );
  return dir;
}

function holdLock(projDir, issue) {
  const lockPath = issueLockPath(issue, projDir);
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(
    path.join(lockPath, 'holder.json'),
    JSON.stringify({
      sessionId: 'holder-sess',
      pid: 12345,
      acquiredAt: new Date().toISOString(),
      verb: 'external-test-hold',
    }) + '\n',
    'utf8'
  );
  return lockPath;
}

// Spawn move-state with the ambient env. `scrub` mirrors the production sandbox
// boundary (and the contention-test helpers): delete the leaked flag before the
// child inherits it.
function runMoveState(projDir, issue, { scrub }) {
  const env = { ...process.env, AITM_ISSUE_LOCK_HELD: '1' };
  if (scrub) delete env.AITM_ISSUE_LOCK_HELD;
  env.AI_TASK_MANAGER_PROJECT_DIR = projDir;
  env.AITM_VERB_CONTEXT = 'move-state';
  env.TT_SKIP_NETWORK = '1';
  return spawnSync(process.execPath, [MOVE_STATE, String(issue), 'refine'], {
    env,
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

test('AC2: contention fires even when AITM_ISSUE_LOCK_HELD=1 is in the ambient env (scrubbed)', () => {
  const prior = process.env.AITM_ISSUE_LOCK_HELD;
  process.env.AITM_ISSUE_LOCK_HELD = '1'; // simulate the sandbox running under promote's held lock
  const projDir = setupProjectDir();
  const issue = 27182;
  const lockPath = holdLock(projDir, issue);
  try {
    const res = runMoveState(projDir, issue, { scrub: true });
    assert.notEqual(res.status, 0, `expected non-zero exit; got ${res.status}\n${res.stderr}`);
    assert.match(
      res.stderr,
      new RegExp(`issue ${issue} locked by session holder-sess \\(held since `),
      `stderr missing locked-by pattern:\n${res.stderr}`
    );
  } finally {
    rmSync(projDir, { recursive: true, force: true });
    if (prior === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
    else process.env.AITM_ISSUE_LOCK_HELD = prior;
  }
});

test('AC2 (negative control): leaving the flag unscrubbed reproduces the leak (exit 0)', () => {
  const prior = process.env.AITM_ISSUE_LOCK_HELD;
  const projDir = setupProjectDir();
  const issue = 16180;
  holdLock(projDir, issue);
  try {
    const res = runMoveState(projDir, issue, { scrub: false });
    assert.equal(
      res.status,
      0,
      `negative control: leaked flag should bypass the lock and exit 0; got ${res.status}\n${res.stderr}`
    );
  } finally {
    rmSync(projDir, { recursive: true, force: true });
    if (prior === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
    else process.env.AITM_ISSUE_LOCK_HELD = prior;
  }
});
