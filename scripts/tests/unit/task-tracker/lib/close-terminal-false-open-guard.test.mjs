#!/usr/bin/env node
// @story #714
// Proves the close verb's "Issue left OPEN" split-brain guard does NOT fire on
// a false positive: a committed terminal board move whose only failure was a
// post-commit best-effort side-effect (audit-comment post, field sync). The
// disambiguating signal is the board's ACTUAL state re-read AFTER the move
// attempt — `decideBoardMoveFailure` swallows a reported failure when the board
// is verifiably Done, and still surfaces a genuine non-committed move.
//
// With #714's move-state tail isolation, a committed terminal move now exits 0,
// so `runMoveStateDone` reports `{ ok: true }` and the guard swallows at the
// `ok-or-benign` branch. This test also covers the belt-and-suspenders case
// where move-state (pre-fix, or a genuine throw before the board write) reports
// a non-zero status but the board re-read shows Done: the guard STILL swallows.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { decideBoardMoveFailure } from '../../../../task-tracker/lib/close-convergence.mjs';

test('AC2: committed terminal move (ok:true) is never surfaced as "Issue left OPEN"', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: true, status: 0, benign: false },
    boardState: 'done',
  });
  assert.equal(d.surface, false);
  assert.equal(d.reason, 'ok-or-benign');
});

test('AC2: reported-failure move but board re-read = done → swallowed (false-open avoided)', () => {
  // A post-commit tail throw that (pre-#714) made move-state exit non-zero. The
  // board Status write already committed, so the re-read is `done`. The guard
  // must NOT surface — no "Issue left OPEN".
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, status: 1, benign: false, stderr: 'field sync exploded' },
    boardState: 'done',
  });
  assert.equal(d.surface, false);
  assert.equal(d.reason, 'board-already-done');
});

test('AC2: a benign audit stderr line on a done board is still swallowed (not a failure reason)', () => {
  // Even if move-state reported non-zero AND the trailing stderr was the benign
  // human-reviewer-audit informational line, the board-state signal governs.
  const d = decideBoardMoveFailure({
    moveResult: {
      ok: false,
      status: 1,
      benign: false,
      stderr: '[human-reviewer-audit] #714: posted full-auto audit comment (no human reviewer)',
    },
    boardState: 'done',
  });
  assert.equal(d.surface, false);
});

test('AC2 (guard integrity): a genuinely non-committed move (board still at review) STILL refuses', () => {
  // The move genuinely failed BEFORE the board Status write committed, so the
  // re-read shows the source column. The guard MUST surface — the real
  // split-brain refusal is preserved.
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, status: 4, benign: false, stderr: 'review-approval-missing' },
    boardState: 'review',
  });
  assert.equal(d.surface, true);
  assert.equal(d.reason, 'board-not-done');
});

test('AC2 (guard integrity): board re-read unknown/null with a failed move STILL refuses', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, status: 1, benign: false },
    boardState: null,
  });
  assert.equal(d.surface, true);
  assert.equal(d.reason, 'board-not-done');
});

test('AC2: a benign self-loop (done→done) move is swallowed regardless of board read', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, benign: true, status: 1 },
    boardState: 'done',
  });
  assert.equal(d.surface, false);
  assert.equal(d.reason, 'ok-or-benign');
});
