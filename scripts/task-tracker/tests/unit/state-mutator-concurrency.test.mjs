#!/usr/bin/env node
// @story #214
// State-mutator concurrency — EPIC #207 / #214.
//
// Drives two move-state.mjs processes against the same issue in a sandboxed
// project dir at the same time. With TT_SKIP_NETWORK=1 the inner mutation
// block is a near no-op but the lock dance still runs end-to-end. We slow the
// inner body by holding the lock externally first, then race two processes
// while the lock dir is occupied — exactly one of the two should observe
// contention and exit non-zero with the locked-by message; the other should
// succeed once we release.
//
// The richer test is exercised manually with real `gh` calls; here we focus on
// the lock primitive's serialization guarantee.

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { issueLockPath } from '../../issue-mutator-lock.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const MOVE_STATE = path.resolve(__dir, '..', 'helpers/move-state-cli.mjs');
const REPO_ROOT = path.resolve(__dir, '..', '../../..');

function setupProjectDir() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-conc-'));
  const cfgDir = path.join(dir, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    path.join(cfgDir, 'task-tracker.json'),
    readFileSync(path.join(REPO_ROOT, '.ai-task-manager/task-tracker.json'), 'utf8'),
    'utf8'
  );
  return dir;
}

function runMoveState(projDir, issue, state) {
  // @story #541 — scrub the session-scoped lock flag from the inherited base
  // env. Inside the `/task test` sandbox (spawned under promote's held
  // `withIssueLock`), `AITM_ISSUE_LOCK_HELD` leaks in via `process.env` and makes
  // move-state skip lock acquisition, so neither racer observes contention and
  // both exit 0 — the assertion `expected non-zero exit; got code 0` fires.
  const baseEnv = { ...process.env };
  delete baseEnv.AITM_ISSUE_LOCK_HELD;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MOVE_STATE, String(issue), state], {
      env: {
        ...baseEnv,
        AI_TASK_MANAGER_PROJECT_DIR: projDir,
        AITM_VERB_CONTEXT: 'move-state',
        TT_SKIP_NETWORK: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const projDir = setupProjectDir();
const issue = 31415;

// Pre-create the lock dir to force contention on first attempt
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

// Race two processes — both see the held lock. Default retries=1 with
// timeoutMs=500 means each retries once before failing.
const [a, b] = await Promise.all([
  runMoveState(projDir, issue, 'refine'),
  runMoveState(projDir, issue, 'refine'),
]);

// Both should fail with the locked-by message (lock is externally held the
// whole time — no winner).
for (const [label, res] of [
  ['a', a],
  ['b', b],
]) {
  assert.notEqual(
    res.code,
    0,
    `${label}: expected non-zero exit; got code ${res.code}\n${res.stderr}`
  );
  assert.match(
    res.stderr,
    new RegExp(`issue ${issue} locked by session holder-sess \\(held since `),
    `${label}: stderr missing locked-by pattern:\n${res.stderr}`
  );
}

// Release and retry — should succeed cleanly.
rmSync(lockPath, { recursive: true, force: true });
const c = await runMoveState(projDir, issue, 'refine');
assert.equal(c.code, 0, `after release expected exit 0, got ${c.code}\n${c.stderr}`);
assert.equal(existsSync(lockPath), false, 'lock released after successful run');

rmSync(projDir, { recursive: true, force: true });
console.log('state-mutator-concurrency.test.mjs: all passed');
