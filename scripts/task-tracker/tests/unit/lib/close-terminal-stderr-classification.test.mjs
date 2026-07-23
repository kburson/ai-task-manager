#!/usr/bin/env node
// @story #747
// Regression test (Defect 2): `close`'s terminal review→done board-move
// success/failure decision must key on move-state.mjs's EXIT CODE plus a
// re-read of the live `Status` field — NEVER on the text content of stderr.
//
// The observed defect: a terminal move that in fact reached Done (GitHub
// auto-close fired) was reported as a false failure ("Issue left OPEN to avoid
// a closed-but-not-Done split-brain") because move-state.mjs emitted
// informational stderr lines (`[human-reviewer-audit:info] ...`, `[unpark]
// ...`) that the caller treated as a move error, forcing a needless second
// `/task close` to converge.
//
// The decision lives in `decideBoardMoveFailure({ moveResult, boardState })`
// (scripts/task-tracker/lib/close-convergence.mjs). Its signature takes NO
// stderr argument at all, so it is structurally incapable of keying on stderr
// text; it decides purely from `moveResult.ok`/`moveResult.benign` (derived
// from the child exit code) and the re-read post-attempt `boardState`.
//
// Coverage:
//   AC5 — the decision keys on ok/benign + boardState, provably not on stderr
//         (structural: the param is absent; behavioral: stderr content is
//         inert across ok and failure paths).
//   AC6 — info-level stderr lines never flip an otherwise-successful move to a
//         reported failure.
//   AC7 — an exit-0 terminal move that lands the board at Done while emitting
//         those info lines is reported as success (no false "left OPEN"), and
//         needs no second close to converge.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideBoardMoveFailure } from '../../../lib/close-convergence.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dir, '..', '..', '..', '..');

// The exact info-level stderr lines that triggered the original false failure.
const INFO_STDERR =
  '[human-reviewer-audit:info] auto-approval recorded\n[unpark] #740 released from wait\n';

test('AC5: the decision function cannot see stderr — its signature omits it', () => {
  const src = readFileSync(
    path.join(repoRoot, 'scripts', 'task-tracker', 'lib', 'close-convergence.mjs'),
    'utf8'
  );
  const sig = src.match(/export function decideBoardMoveFailure\(\{([^}]*)\}/);
  assert.ok(sig, 'decideBoardMoveFailure is a destructuring-param export');
  const params = sig[1];
  assert.ok(/moveResult/.test(params), 'decision reads moveResult');
  assert.ok(/boardState/.test(params), 'decision reads the re-read boardState');
  assert.equal(/stderr/.test(params), false, 'decision never receives stderr — cannot key on it');
});

test('AC5/AC6: a successful move is not-surfaced regardless of stderr content', () => {
  // ok:true with a fat info-laden stderr must still be swallowed. If the
  // decision ever regressed to inspecting stderr, this would flip to surface.
  const decision = decideBoardMoveFailure({
    moveResult: { ok: true, benign: false, stderr: INFO_STDERR },
    boardState: 'done',
  });
  assert.equal(decision.surface, false, 'an ok move never surfaces a failure');
  assert.equal(decision.reason, 'ok-or-benign', 'classified by ok, not by stderr');
});

test('AC7: exit-0 landing Done while emitting info lines reports success (no false left-OPEN)', () => {
  // The exact defect shape: the move succeeded (ok:true) and the board is Done,
  // and the child emitted the info lines on stderr. Reported as success.
  const decision = decideBoardMoveFailure({
    moveResult: { ok: true, benign: false, stderr: INFO_STDERR },
    boardState: 'done',
  });
  assert.equal(decision.surface, false, 'no false "Issue left OPEN" when the move succeeded');
});

test('AC7: even a FAILED move whose board is verifiably Done needs no second close', () => {
  // The race variant: move-state reported failure (e.g. done→done self-loop
  // that was not stderr-classified benign) but the board is Done. Keying on the
  // re-read boardState — not stderr — swallows it, so no second close is needed.
  const decision = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, stderr: INFO_STDERR },
    boardState: 'done',
  });
  assert.equal(decision.surface, false, 'board-verified-Done swallows the false failure');
  assert.equal(decision.reason, 'board-already-done', 'the re-read board state is the signal');
});

test('AC5: a genuine failure (move failed AND board NOT Done) still surfaces', () => {
  // The guardrail: the honest classification must NOT mask a real failure. Same
  // info-laden stderr, but the board never reached Done → surface + exit.
  const decision = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, stderr: INFO_STDERR },
    boardState: 'review',
  });
  assert.equal(decision.surface, true, 'a genuine stuck move still surfaces');
  assert.equal(decision.reason, 'board-not-done', 'surfaced because the board is not Done');
});

test('AC6: stderr text is inert — identical (ok, boardState) decides the same with or without info lines', () => {
  const withInfo = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, stderr: INFO_STDERR },
    boardState: 'done',
  });
  const withoutInfo = decideBoardMoveFailure({
    moveResult: { ok: false, benign: false, stderr: '' },
    boardState: 'done',
  });
  assert.deepEqual(withInfo, withoutInfo, 'the presence of info-level stderr changes nothing');
});
