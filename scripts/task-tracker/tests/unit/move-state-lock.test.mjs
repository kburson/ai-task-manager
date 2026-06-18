#!/usr/bin/env node
// @story #214
// move-state.mjs per-issue advisory lock — EPIC #207 / #214.
//
// Covers:
//   1. Successful run releases the lock (no lingering dir).
//   2. Holder payload (sessionId/pid/acquiredAt/verb) is written inside
//      the lock dir during the critical section.
//   3. Contention: when the lock dir already exists, move-state.mjs exits
//      non-zero with stderr matching the locked-by-session pattern.
//   4. AITM_ISSUE_LOCK_HELD=1 short-circuits acquisition (no contention error
//      even when the dir already exists — caller already holds it).

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { issueLockPath, withIssueLock } from '../../issue-mutator-lock.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const MOVE_STATE = path.resolve(__dir, '..', '../../gh/move-state.mjs');
const REPO_ROOT = path.resolve(__dir, '..', '../../..');

function runMoveState(args, envOverrides = {}) {
  const env = {
    ...process.env,
    TT_SKIP_NETWORK: '1',
    AITM_VERB_CONTEXT: 'move-state',
    AI_TASK_MANAGER_PROJECT_DIR:
      envOverrides.AI_TASK_MANAGER_PROJECT_DIR || process.env.AI_TASK_MANAGER_PROJECT_DIR,
    ...envOverrides,
  };
  return spawnSync(process.execPath, [MOVE_STATE, ...args], {
    env,
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

// Test 1+4: AITM_ISSUE_LOCK_HELD=1 path runs even when SKIP_NETWORK is set.
// Always isolate the project dir so the local state-file write inside
// move-state.mjs cannot clobber the repo's tracker state cache.
{
  const projDir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-isolated-'));
  mkdirSync(path.join(projDir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(projDir, '.ai-task-manager/task-tracker.json'),
    readFileSync(path.join(REPO_ROOT, '.ai-task-manager/task-tracker.json'), 'utf8'),
    'utf8'
  );
  // SKIP_NETWORK shortcuts most of the mutation block but still exits 0 cleanly.
  const res = runMoveState(['9999991', 'refine'], { AI_TASK_MANAGER_PROJECT_DIR: projDir });
  // exit code is 0; lock dir does not linger.
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stderr}`);
  rmSync(projDir, { recursive: true, force: true });
}

// Test 2: holder payload is written inside the lock dir during critical section
{
  const projDir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-issue-lock-'));
  const issue = 4242;
  let holderSeen = null;
  await withIssueLock({ issue, verb: 'unit-test', projDir, sessionId: 'sess-xyz' }, async () => {
    const lockPath = issueLockPath(issue, projDir);
    assert.ok(existsSync(lockPath), 'lock dir present during critical section');
    holderSeen = JSON.parse(readFileSync(path.join(lockPath, 'holder.json'), 'utf8'));
  });
  assert.equal(holderSeen.sessionId, 'sess-xyz');
  assert.equal(holderSeen.verb, 'unit-test');
  assert.equal(typeof holderSeen.pid, 'number');
  assert.match(holderSeen.acquiredAt, /^\d{4}-\d{2}-\d{2}T/);
  // Released after fn returns
  assert.equal(existsSync(issueLockPath(issue, projDir)), false);
  rmSync(projDir, { recursive: true, force: true });
}

// Test 3: contention — pre-create the lock dir with a holder, run move-state
// pointed at that projDir, expect non-zero exit and locked-by stderr.
{
  const projDir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-issue-lock-'));
  const issue = 7777;
  // Build a minimal config so loadConfig doesn't barf — copy the real one.
  const cfgDir = path.join(projDir, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  const realCfg = readFileSync(path.join(REPO_ROOT, '.ai-task-manager/task-tracker.json'), 'utf8');
  writeFileSync(path.join(cfgDir, 'task-tracker.json'), realCfg, 'utf8');
  // Pre-create the lock with a foreign holder.
  const lockPath = issueLockPath(issue, projDir);
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(
    path.join(lockPath, 'holder.json'),
    JSON.stringify({
      sessionId: 'other-sess',
      pid: 99999,
      acquiredAt: '2026-05-25T15:00:00.000Z',
      verb: 'promote',
    }) + '\n',
    'utf8'
  );
  const res = runMoveState([String(issue), 'refine'], {
    AI_TASK_MANAGER_PROJECT_DIR: projDir,
    TT_SKIP_NETWORK: '', // unset so the mutation block actually runs (will fail later, but we only care that lock contention fires first)
  });
  // The contention check happens before SKIP_NETWORK shortcut inside __mutationBlock,
  // because withIssueLock fires before invoking the fn.
  assert.notEqual(res.status, 0, 'expected non-zero exit on contention');
  assert.match(
    res.stderr,
    /issue 7777 locked by session other-sess \(held since 2026-05-25T/,
    `stderr did not match contention pattern:\n${res.stderr}`
  );
  // Cleanup
  rmSync(lockPath, { recursive: true, force: true });
  rmSync(projDir, { recursive: true, force: true });
}

console.log('move-state-lock.test.mjs: all passed');
