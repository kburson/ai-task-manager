#!/usr/bin/env node
// @story #425
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

import {
  decideCloseConvergence,
  decideBoardMoveFailure,
} from '../../../../task-tracker/lib/close-convergence.mjs';

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

// ── #708: --repair forces the full pipeline from Done ─────────────────────────

test('#708 AC1: repair=true → proceed for EVERY board/issue combination', () => {
  // The whole point of --repair: a PR closing-reference auto-closed the issue
  // (board=Done, issue=CLOSED), which would otherwise hit `noop` and skip the
  // timing flush / lifecycle boxes / audit rows. repair forces `proceed`.
  const combos = [
    { boardState: 'done', issueClosed: true }, // the bypass case
    { boardState: 'done', issueClosed: false },
    { boardState: 'review', issueClosed: true },
    { boardState: 'review', issueClosed: false },
    { boardState: null, issueClosed: null },
  ];
  for (const c of combos) {
    assert.deepEqual(
      decideCloseConvergence({ ...c, repair: true }),
      { action: 'proceed', repair: true },
      `repair should force proceed for ${JSON.stringify(c)}`
    );
  }
});

test('#708 AC3: repair falsy → noop/close-issue branches are unchanged', () => {
  // Every falsy repair value leaves the pre-#708 behavior byte-for-byte intact.
  for (const repair of [undefined, false, null, 0, '']) {
    assert.deepEqual(decideCloseConvergence({ boardState: 'done', issueClosed: true, repair }), {
      action: 'noop',
      boardDrift: false,
    });
    assert.deepEqual(decideCloseConvergence({ boardState: 'done', issueClosed: false, repair }), {
      action: 'close-issue',
    });
    assert.deepEqual(decideCloseConvergence({ boardState: 'review', issueClosed: false, repair }), {
      action: 'proceed',
    });
  }
});

// ── decideBoardMoveFailure: swallow-vs-surface after runMoveStateDone (#435) ──
//
// Defect B: `close` could surface a spurious `board move to "done" failed` +
// non-zero exit when the board had ALREADY reached Done out-of-band (the
// Projects auto-close workflow or a prior converge) between close's decision
// and its move call. The residual false positive is a race that a pure stderr
// classifier cannot distinguish from a genuine failure without masking real
// failures — so close re-reads the board state after the move and feeds it here.

test('move succeeded (ok) → never surface', () => {
  assert.deepEqual(decideBoardMoveFailure({ moveResult: { ok: true }, boardState: 'develop' }), {
    surface: false,
    reason: 'ok-or-benign',
  });
});

test('move already classified benign → never surface (regardless of board)', () => {
  assert.deepEqual(decideBoardMoveFailure({ moveResult: { benign: true }, boardState: null }), {
    surface: false,
    reason: 'ok-or-benign',
  });
});

test('CAPTURED RACE: move failed but board is verifiably Done → swallow (#435 Defect B)', () => {
  // The reproducing case: issue closed, board reached Done out-of-band, the
  // move-state call then reports failure. close must print `Closed #N.` exit 0.
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, status: 'error', stderr: 'illegal transition' },
    boardState: 'done',
  });
  assert.deepEqual(d, { surface: false, reason: 'board-already-done' });
});

test('GENUINE FAILURE: move failed and board NOT Done → surface + exit non-zero', () => {
  // The negative test guarding AC4: a real failure must still surface. The fix
  // narrows false positives without masking real failures.
  assert.deepEqual(
    decideBoardMoveFailure({
      moveResult: { ok: false, benign: false, stderr: 'boom' },
      boardState: 'develop',
    }),
    { surface: true, reason: 'board-not-done' }
  );
  // Unknown board state (re-read failed) is treated as not-Done → surface.
  assert.deepEqual(
    decideBoardMoveFailure({ moveResult: { ok: false, benign: false }, boardState: null }),
    { surface: true, reason: 'board-not-done' }
  );
});

test('decideBoardMoveFailure: no args / missing moveResult → surface (safe default)', () => {
  // A missing moveResult is not ok/benign and board is unknown → treat as a
  // real failure rather than silently swallowing.
  assert.deepEqual(decideBoardMoveFailure(), { surface: true, reason: 'board-not-done' });
  assert.deepEqual(decideBoardMoveFailure({}), { surface: true, reason: 'board-not-done' });
});

console.log('close-convergence.test.mjs: all passed');
