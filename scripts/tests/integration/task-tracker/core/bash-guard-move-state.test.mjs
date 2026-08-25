#!/usr/bin/env node
// @story #542
// Regression test for the bash-guard move-state refusal (issue #542).
//
// Defect: the move-state guard tested the RAW `command`, so any quoted
// *mention* of `move-state.mjs`/`.sh` (an `ac-stamp` AC label, a `git commit`
// message) was refused even though no invocation was occurring. The fix tests
// the quote-stripped `scanned` string instead, mirroring the gh-issue guards.
//
// The hook reads a JSON payload from stdin and emits either nothing (pass) or
// `{decision:'block', reason:'...'}` on stdout, then exits 0.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GUARD = path.resolve(__dir, '../../../task-tracker/bash-guard.mjs');

function runGuard(command) {
  return new Promise((resolve, reject) => {
    // #1166: this suite exercises move-state policy, not session binding. Give
    // the hook an isolated session so a parent Test sandbox cannot contribute
    // its real issue/worktree binding and preempt these assertions.
    const child = spawn('node', [GUARD], {
      env: { ...process.env, AI_TASK_MANAGER_SESSION_ID: 'bash-guard-move-state-unbound' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', () => resolve({ stdout, stderr }));
    child.stdin.end(JSON.stringify({ tool_input: { command } }));
  });
}

function isBlocked(stdout) {
  if (!stdout.trim()) return false;
  try {
    return JSON.parse(stdout).decision === 'block';
  } catch {
    return false;
  }
}

// -- AC1: genuine direct invocations are still blocked ----------------------

test('blocks a direct node invocation of move-state.mjs', async () => {
  const { stdout } = await runGuard('node scripts/gh/move-state.mjs 540 done');
  assert.equal(isBlocked(stdout), true, 'real invocation must be refused');
});

test('blocks the .sh form of move-state', async () => {
  const { stdout } = await runGuard('bash scripts/gh/move-state.sh 540 done');
  assert.equal(isBlocked(stdout), true, '.sh invocation must be refused');
});

test('blocks a ./-relative move-state.mjs invocation', async () => {
  const { stdout } = await runGuard('./scripts/gh/move-state.mjs 540 done');
  assert.equal(isBlocked(stdout), true, './-relative invocation must be refused');
});

// -- AC2: quoted mentions in another command are allowed (the fix) ----------

test('allows ac-stamp whose quoted AC label mentions move-state.mjs', async () => {
  const { stdout } = await runGuard(
    'npx aitm ac-stamp 540 AC3 --note "move-state.mjs no longer emits the marker"'
  );
  assert.equal(isBlocked(stdout), false, 'quoted mention must NOT be refused');
});

test('allows git commit whose message mentions move-state.mjs', async () => {
  const { stdout } = await runGuard(
    'git commit -m "fix(#542): scrub raw move-state.mjs match in bash-guard"'
  );
  assert.equal(isBlocked(stdout), false, 'quoted commit message must NOT be refused');
});

test('allows a single-quoted mention of move-state.sh', async () => {
  const { stdout } = await runGuard("echo 'see move-state.sh for details'");
  assert.equal(isBlocked(stdout), false, 'single-quoted mention must NOT be refused');
});
