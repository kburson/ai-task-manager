#!/usr/bin/env node
// @story #654
// `/task close` must land the board at Done BEFORE it invokes `gh issue close`
// on the NON-force path — mirroring the #505 force-path pre-walk — so a refused
// terminal `review → done` move can never strand the issue CLOSED-but-not-Done.
//
// Before #654 the non-force path mutated GitHub first (`gh issue close`) and
// walked the board second (`runMoveStateDone`, #385). When that terminal move
// was refused — board drifted off `review`, or move-state's own
// `review-approval-missing` guard fired because the `aitm-review-approved`
// marker never persisted (the #652 half-state) — the issue was already CLOSED
// while the board stayed stranded. The fix runs the board move first through the
// existing `decideBoardMoveFailure` decision helper; on a genuine failure it
// refuses, leaves the issue OPEN, and does not clear local state. The post-close
// move (#385) then degrades to a benign `done → done` no-op.
//
// close.mjs is network- and side-effect-heavy, so this follows the
// close-fail-closed.test.mjs pattern: the pure decision helper exercised
// directly plus source-shape assertions on verbs/close.mjs.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideBoardMoveFailure } from '../../../lib/close-convergence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const closeSrc = readFileSync(path.resolve(__dirname, '..', '..', 'verbs/close.mjs'), 'utf8');

// Anchor on the #654 non-force pre-walk guard so the assertions target the new
// block specifically and not the #505 force block or the #385 post-close move.
const PRE_WALK_GUARD = 'if (!force && !SKIP_NETWORK && closeIssueNum) {';

// ── AC1: on the non-force path, the board move to Done precedes `gh issue close`
// in source order, and aborts before the close when a gate fails ──────────────

test('source: non-force pre-walk runs runMoveStateDone before `gh issue close`', () => {
  const guardIdx = closeSrc.indexOf(PRE_WALK_GUARD);
  assert.ok(guardIdx >= 0, 'non-force pre-walk guard block must exist in close.mjs');

  const moveIdx = closeSrc.indexOf('runMoveStateDone', guardIdx);
  const closeIdx = closeSrc.indexOf("'issue', 'close'", guardIdx);
  assert.ok(moveIdx >= 0, 'pre-walk must call runMoveStateDone');
  assert.ok(closeIdx >= 0, '`gh issue close` invocation must exist after the pre-walk');
  assert.ok(
    moveIdx < closeIdx,
    'board move to Done must appear BEFORE `gh issue close` on the non-force path'
  );
});

test('source: non-force pre-walk gates the close, force flag excluded', () => {
  // The guard is non-force only (the force path is the separate #505 block).
  assert.ok(
    closeSrc.includes(PRE_WALK_GUARD),
    'pre-walk must be guarded by `!force` so it never duplicates the #505 force walk'
  );
});

// ── AC2: a failed pre-close board move surfaces via decideBoardMoveFailure and
// leaves the issue OPEN (returns before the close) ────────────────────────────

test('decideBoardMoveFailure: refused move with board not Done surfaces (issue stays OPEN)', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, status: 1, stderr: 'review-approval-missing' },
    boardState: 'review',
  });
  assert.equal(d.surface, true, 'a non-benign move with board off Done must surface a refusal');
});

test('decideBoardMoveFailure: benign done→done no-op does not surface (close proceeds)', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, benign: true },
    boardState: 'done',
  });
  assert.equal(d.surface, false, 'a benign no-op must not block the close');
});

test('decideBoardMoveFailure: board already Done does not surface (race-safe)', () => {
  const d = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, status: 1 },
    boardState: 'done',
  });
  assert.equal(d.surface, false, 'if the board already reached Done the close is safe to proceed');
});

test('source: surfaced pre-walk failure refuses and returns before `gh issue close`', () => {
  const guardIdx = closeSrc.indexOf(PRE_WALK_GUARD);
  // #752 widened the pre-walk block (the board re-read now goes through the
  // lag-tolerant resolveBoardStateForClose), so the window must reach past the
  // longer assignment to still contain the trailing `process.exitCode`/`return`.
  const block = closeSrc.slice(guardIdx, guardIdx + 1100);
  assert.ok(
    /decideBoardMoveFailure\(/.test(block),
    'pre-walk must route its decision through decideBoardMoveFailure'
  );
  assert.ok(
    /\.surface\)/.test(block) && /process\.exitCode = 1;/.test(block) && /\breturn;/.test(block),
    'a surfaced failure must set a non-zero exit and return BEFORE the close (issue left OPEN)'
  );
});

// ── AC3: the half-state scenario (board=review, human-review box ticked, no
// approval marker) yields a refusal carrying `review-approval-missing`, OPEN ──

test('source: pre-walk delegates the gate decision to move-state (review-approval-missing)', () => {
  // The pre-walk intentionally does NOT re-implement the approval check: it runs
  // runMoveStateDone, which re-evaluates move-state.mjs's own one-step guards —
  // including review-approval-missing — as the single source of truth. When the
  // board sits at `review` with no aitm-review-approved marker, that guard fires,
  // the move is refused, decideBoardMoveFailure surfaces it, and the issue is
  // never closed. Assert the wiring that produces that outcome.
  const guardIdx = closeSrc.indexOf(PRE_WALK_GUARD);
  const block = closeSrc.slice(guardIdx, guardIdx + 1100);
  assert.ok(
    /runMoveStateDone\(s\.active, \{ silent: true \}\)/.test(block),
    'pre-walk must invoke the terminal move-state walk (not a `--force` bypass) so the ' +
      'review-approval-missing guard is honored'
  );
  assert.ok(
    !/extraArgs:\s*\[\s*'--force'\s*\]/.test(block),
    'non-force pre-walk must NOT pass --force (that would bypass review-approval-missing)'
  );
});

test('decideBoardMoveFailure: half-state (review + approval-missing refusal) leaves issue OPEN', () => {
  // Reproduce the #652 half-state at the decision boundary: move-state refuses
  // with review-approval-missing while the board is still at `review`.
  const d = decideBoardMoveFailure({
    moveResult: {
      ok: false,
      benign: false,
      status: 7,
      stderr: 'review-exit-review-approved review-approval-missing',
    },
    boardState: 'review',
  });
  assert.equal(d.surface, true, 'half-state refusal must surface so close is skipped (issue OPEN)');
});
