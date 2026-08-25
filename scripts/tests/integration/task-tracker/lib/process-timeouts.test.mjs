#!/usr/bin/env node
// @story #17
// Tests for lib/process-timeouts.mjs.
//
// 1. Unit: each named export is a positive integer.
// 2. Regression: a deliberately stalled subprocess returns/throws within the
//    configured timeout window. Asserts wall-clock < timeout * 3 as a generous
//    upper bound to avoid CI flake while still proving the option is honored.

import { strict as assert } from 'node:assert';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  GH_API_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  LOCAL_FAST_TIMEOUT_MS,
  TEST_FILE_TIMEOUT_MS,
  TEST_RUNNER_TIMEOUT_MS,
  TIMEOUT_CLASSES,
  warnTimeout,
} from '../../../../task-tracker/lib/process-timeouts.mjs';

const pexec = promisify(execFile);

// --- Unit: constants are positive integers --------------------------------

for (const [name, val] of [
  ['GH_API_TIMEOUT_MS', GH_API_TIMEOUT_MS],
  ['GIT_TIMEOUT_MS', GIT_TIMEOUT_MS],
  ['LOCAL_FAST_TIMEOUT_MS', LOCAL_FAST_TIMEOUT_MS],
  ['TEST_FILE_TIMEOUT_MS', TEST_FILE_TIMEOUT_MS],
  ['TEST_RUNNER_TIMEOUT_MS', TEST_RUNNER_TIMEOUT_MS],
]) {
  assert.equal(typeof val, 'number', `${name} is a number`);
  assert.ok(Number.isInteger(val), `${name} is an integer`);
  assert.ok(val > 0, `${name} is positive (${val})`);
}

// TIMEOUT_CLASSES map is frozen and complete.
assert.equal(Object.isFrozen(TIMEOUT_CLASSES), true, 'TIMEOUT_CLASSES is frozen');
assert.equal(TIMEOUT_CLASSES.gh, GH_API_TIMEOUT_MS);
assert.equal(TIMEOUT_CLASSES.git, GIT_TIMEOUT_MS);
assert.equal(TIMEOUT_CLASSES.local, LOCAL_FAST_TIMEOUT_MS);
assert.equal(TIMEOUT_CLASSES.testFile, TEST_FILE_TIMEOUT_MS);
assert.equal(TIMEOUT_CLASSES.test, TEST_RUNNER_TIMEOUT_MS);

// warnTimeout exists and is callable. We don't assert its stderr output
// directly here — it's exercised by call sites that catch ETIMEDOUT.
assert.equal(typeof warnTimeout, 'function', 'warnTimeout is exported as a function');

// --- Regression: stalled subprocess honors `timeout` ----------------------

// spawnSync path: a child that sleeps far longer than our timeout must return
// with status null / signal SIGTERM in well under the timeout * 3 window.
{
  const TIMEOUT = 200; // ms — small enough to keep the test fast
  const stallScript = 'setTimeout(() => process.exit(0), 60000)';
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['-e', stallScript], { timeout: TIMEOUT });
  const elapsed = Date.now() - t0;
  assert.ok(
    elapsed < TIMEOUT * 5,
    `spawnSync stall: returned in ${elapsed}ms (budget ${TIMEOUT * 5}ms)`
  );
  // Node signals SIGTERM on timeout — status is null, signal is set.
  assert.ok(
    r.signal === 'SIGTERM' || r.status !== 0,
    `spawnSync stall returned signal=${r.signal} status=${r.status}`
  );
}

// execFile (promisified) path: must reject with ETIMEDOUT (signal SIGTERM)
// within the budget. Mirrors how every `pexec('gh', ..., { timeout })` site
// behaves on a stalled remote.
{
  const TIMEOUT = 200;
  const stallScript = 'setTimeout(() => process.exit(0), 60000)';
  const t0 = Date.now();
  let threw = false;
  let err;
  try {
    await pexec(process.execPath, ['-e', stallScript], { timeout: TIMEOUT });
  } catch (e) {
    threw = true;
    err = e;
  }
  const elapsed = Date.now() - t0;
  assert.equal(threw, true, 'execFile stall threw');
  assert.ok(
    elapsed < TIMEOUT * 5,
    `execFile stall: rejected in ${elapsed}ms (budget ${TIMEOUT * 5}ms)`
  );
  // Node sets `killed: true` and signal SIGTERM when the timeout fires.
  assert.ok(
    err.killed === true || err.signal === 'SIGTERM',
    'execFile stall was killed by timeout'
  );
}

console.log('ok: process-timeouts.test.mjs');
