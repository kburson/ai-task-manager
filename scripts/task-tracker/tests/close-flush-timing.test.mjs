#!/usr/bin/env node
// @story #147
// Regression tripwire: verbClose must call runLogIssueTime after posting the
// final terminal `approved` (Done enter) timing row. Without this call,
// Engaged/Session/Review Time on the project board remain null after close
// when the test→review flush in verbReview was bypassed or interrupted (#147).
// Slug changed from `done` to `approved` under epic #126 (sub-issue #129) to
// match the canonical PHASE_EVENTS.done.enter event.
//
// After #142, the cross-close branch was removed (close refuses when target
// differs from s.active), so there is exactly one close path.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '..', 'verbs/close.mjs'), 'utf8');

assert.ok(/runLogIssueTime,\s*\n/.test(src), 'verbClose must destructure runLogIssueTime from ctx');

const closeBrDoneCount = (src.match(/closeBr\(\{[^}]*event:\s*_PE3\.done\.enter\.event/g) || [])
  .length;
assert.equal(
  closeBrDoneCount,
  1,
  `expected exactly 1 closeBr PHASE_EVENTS.done.enter row in verbClose, found ${closeBrDoneCount}`
);

const flushCount = (src.match(/await runLogIssueTime\(closeTarget\)/g) || []).length;
assert.equal(
  flushCount,
  1,
  `expected exactly 1 runLogIssueTime(closeTarget) call in verbClose, found ${flushCount}`
);

// Ordering: terminal `approved` row must precede runLogIssueTime, which must precede runMoveStateDone.
// #425 added an earlier `runMoveStateDone` call in the close-convergence
// short-circuit (board-drift recovery on an already-CLOSED issue), so anchor
// this ordering check to the TERMINAL (last) board move in the full pipeline,
// not the first textual occurrence.
const doneIdx = src.search(/closeBr\(\{[^}]*event:\s*_PE3\.done\.enter\.event/);
const flushIdx = src.indexOf('await runLogIssueTime(closeTarget)');
const moveDoneMatches = [...src.matchAll(/runMoveStateDone\(/g)];
const moveDoneIdx = moveDoneMatches.length ? moveDoneMatches[moveDoneMatches.length - 1].index : -1;
assert.ok(doneIdx >= 0 && flushIdx >= 0 && moveDoneIdx >= 0);
assert.ok(doneIdx < flushIdx, 'runLogIssueTime must come after the terminal approved row');
assert.ok(flushIdx < moveDoneIdx, 'runLogIssueTime must come before runMoveStateDone');

console.log('close-flush-timing.test.mjs: all passed');
