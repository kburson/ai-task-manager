#!/usr/bin/env node
// Regression tests for the close-convergence decision (#425).
//
// The bug: `/task close` treated board Status == 'done' as a no-op, without
// checking the actual GitHub issue state. A board=Done + issue-OPEN pair (the
// Projects auto-close workflow missed) was therefore treated as "already Done"
// and stranded OPEN forever (observed live on #171; #424 showed the board-move
// and issue-close steps are non-atomic). The fix gates the clean no-op on the
// issue being verifiably CLOSED and re-closes on the drift.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideCloseConvergence } from '../lib/close-convergence.mjs';

test('REGRESSION: board=Done + issue OPEN → close the issue (the #425 drift)', () => {
  const d = decideCloseConvergence({ boardState: 'done', issueClosed: false });
  assert.deepEqual(d, { action: 'close-issue' });
});

test('issue CLOSED + board Done → clean no-op, no board drift', () => {
  const d = decideCloseConvergence({ boardState: 'done', issueClosed: true });
  assert.deepEqual(d, { action: 'noop', boardDrift: false });
});

test('issue CLOSED + board NOT Done → no-op but converge the lagging board', () => {
  const d = decideCloseConvergence({ boardState: 'review', issueClosed: true });
  assert.deepEqual(d, { action: 'noop', boardDrift: true });
  const d2 = decideCloseConvergence({ boardState: null, issueClosed: true });
  assert.deepEqual(d2, { action: 'noop', boardDrift: true });
});

test('issue OPEN + board not Done → proceed with the full close pipeline', () => {
  assert.deepEqual(decideCloseConvergence({ boardState: 'review', issueClosed: false }), {
    action: 'proceed',
  });
  assert.deepEqual(decideCloseConvergence({ boardState: 'develop', issueClosed: false }), {
    action: 'proceed',
  });
});

test('issueClosed unknown (null) → always proceed, never a blind no-op', () => {
  // The whole point of #425: an unknown GitHub state must NOT short-circuit on
  // board=Done alone — that is exactly the stranding bug.
  assert.deepEqual(decideCloseConvergence({ boardState: 'done', issueClosed: null }), {
    action: 'proceed',
  });
  assert.deepEqual(decideCloseConvergence({ boardState: 'review', issueClosed: null }), {
    action: 'proceed',
  });
});

test('no args / empty object → proceed (safe default)', () => {
  assert.deepEqual(decideCloseConvergence(), { action: 'proceed' });
  assert.deepEqual(decideCloseConvergence({}), { action: 'proceed' });
});

console.log('close-convergence.test.mjs: all passed');
