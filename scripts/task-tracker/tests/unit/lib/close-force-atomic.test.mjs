#!/usr/bin/env node
// @story #505
// #505 — `/task close <N> --force` must be ATOMIC: it either fully lands the
// board in Done or refuses before `gh issue close` — never closed-but-not-Done.
//
// Before the fix, the terminal board move ran only AFTER `gh issue close` and
// delegated to move-state.mjs, whose one-step matrix refused any non-`review` →
// `done` transition. A force-close from `plan`/`refine`/`develop`/`test`
// therefore closed the GitHub issue but stranded the board at the source column
// (split-brain; observed live on #371). The fix pre-walks the board to Done
// using move-state's `--force` flag BEFORE closing the issue, and refuses
// (issue left OPEN) if that move cannot reach Done.
//
// These tests cover: (AC1) the reproduction invariant — the matrix genuinely
// refuses the terminal move so the bypass is load-bearing; (AC3/AC4) the close
// verb pre-walks with `--force` before `gh issue close`; (AC5) per non-review
// state, the swallow-vs-surface decision yields no split-brain.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideBoardMoveFailure } from '../../../lib/close-convergence.mjs';
import { validateTransition } from '../../../state-machine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLOSE_SRC = readFileSync(path.resolve(__dirname, '../../verbs/close.mjs'), 'utf8');

const NON_REVIEW_STATES = ['refine', 'plan', 'develop', 'test'];

// ── AC1: reproduction invariant ──────────────────────────────────────────────
// The split-brain root is the one-step matrix refusing the terminal move from a
// non-review column. If any of these became a legal one-step move, the bug (and
// the need for the --force bypass) would not exist.
test('AC1: the matrix refuses the terminal done-move from every non-review state', () => {
  for (const from of NON_REVIEW_STATES) {
    const v = validateTransition(from, 'done');
    assert.equal(v.ok, false, `${from} → done must be illegal under the normal matrix`);
  }
});

// ── AC5: no split-brain — the swallow-vs-surface decision per non-review state ─
// The forced terminal move is decided by decideBoardMoveFailure (#435), the same
// helper the post-close move uses. For each non-review state:
//   • forced move FAILS and board stays at the source column → refuse (surface),
//     so the issue is NOT closed → no split-brain.
//   • forced move SUCCEEDS (board → done) → proceed, then close → board=Done.
test('AC5: a failed forced move from any non-review state refuses (no split-brain)', () => {
  for (const from of NON_REVIEW_STATES) {
    const moveResult = {
      ok: false,
      benign: false,
      status: 5,
      stderr: `illegal transition: ${from} → done`,
    };
    const decision = decideBoardMoveFailure({ moveResult, boardState: from });
    assert.equal(decision.surface, true, `${from}: a stranded board must refuse the close`);
    assert.equal(decision.reason, 'board-not-done');
  }
});

test('AC5: a successful forced move (board → done) proceeds to close', () => {
  for (const from of NON_REVIEW_STATES) {
    // With the --force bypass the move succeeds: ok:true.
    const decision = decideBoardMoveFailure({
      moveResult: { ok: true, benign: false, status: 0, stderr: '' },
      boardState: 'done',
    });
    assert.equal(decision.surface, false, `${from}: a Done board must proceed to close`);
  }
});

test('AC5: a benign done→done forced move (race won out-of-band) proceeds', () => {
  const decision = decideBoardMoveFailure({
    moveResult: { ok: false, benign: true, status: 5, stderr: 'illegal transition: done → done' },
    boardState: 'done',
  });
  assert.equal(decision.surface, false);
});

// ── AC3 / AC4: the close verb pre-walks with --force before gh issue close ─────
test('AC4: the force path moves the board with the --force flag', () => {
  // The forced terminal move must pass extraArgs including '--force' so
  // move-state.mjs bypasses the matrix for this delivered override.
  assert.ok(
    /runMoveStateDone\([^)]*\{[^}]*extraArgs:\s*\[\s*'--force'\s*\]/s.test(CLOSE_SRC),
    'close.mjs must call runMoveStateDone with extraArgs:["--force"] on the force path'
  );
});

test('AC3: the forced board move is gated on the force path only', () => {
  assert.ok(
    /if \(force && !SKIP_NETWORK && closeIssueNum\) \{/.test(CLOSE_SRC),
    'the pre-close forced move must be guarded by `force` so non-force closes are unchanged'
  );
});

test('AC3: the forced board move runs BEFORE the primary gh issue close', () => {
  const forceMoveIdx = CLOSE_SRC.indexOf("extraArgs: ['--force']");
  assert.ok(forceMoveIdx > 0, 'force move call must exist');
  // The primary close is the `gh issue close` guarded by the #425 comment block.
  const primaryCloseIdx = CLOSE_SRC.indexOf('#425 — explicitly close the primary issue');
  assert.ok(primaryCloseIdx > 0, '#425 primary-close block must exist');
  assert.ok(
    forceMoveIdx < primaryCloseIdx,
    'the forced board move must be ordered before the primary gh issue close (atomicity)'
  );
});

test('AC3: a failed forced move refuses (exitCode 1 + return) without closing', () => {
  // The refusal must set a non-zero exit and return out of verbClose before the
  // primary `gh issue close` runs, so the issue is never closed-but-not-Done.
  const block = CLOSE_SRC.slice(
    CLOSE_SRC.indexOf('if (force && !SKIP_NETWORK && closeIssueNum) {'),
    CLOSE_SRC.indexOf('#425 — explicitly close the primary issue')
  );
  assert.ok(
    /decideBoardMoveFailure\(/.test(block),
    'force block must reuse decideBoardMoveFailure'
  );
  assert.ok(/process\.exitCode = 1;/.test(block), 'force block must set exitCode 1 on refusal');
  assert.ok(/return;/.test(block), 'force block must return (skip gh issue close) on refusal');
});

console.log('close-force-atomic.test.mjs — all assertions passed');
