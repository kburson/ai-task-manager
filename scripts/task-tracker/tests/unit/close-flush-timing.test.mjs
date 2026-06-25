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
//
// #540 reworked the terminal emission: the `issue:wrap` (done.enter) row is no
// longer built inline via `closeBr({ event: _PE3.done.enter.event })`. It is
// now produced by the `buildReviewToDoneClosePair` helper, which emits the
// canonical pair `review:approved → issue:wrap` (the approval row carries the
// review→close delta; the wrap row is the zero-delta paired half). This
// tripwire re-anchors on that helper call but preserves the original intent:
// the terminal wrap row must be posted before runLogIssueTime, which must run
// before the terminal runMoveStateDone.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '..', '..', 'verbs/close.mjs'), 'utf8');

assert.ok(/runLogIssueTime,\s*\n/.test(src), 'verbClose must destructure runLogIssueTime from ctx');

// #540 — the review→done lifecycle pair (`review:approved → issue:wrap`) is
// built by exactly one `buildReviewToDoneClosePair` call in the close path.
const pairBuildCount = (src.match(/buildReviewToDoneClosePair\(\{/g) || []).length;
assert.equal(
  pairBuildCount,
  1,
  `expected exactly 1 buildReviewToDoneClosePair call in verbClose, found ${pairBuildCount}`
);
// The wrap (done.enter) row from that pair is posted exactly once.
const wrapPostCount = (src.match(/safePostTiming\(closeTarget,\s*_issueWrapRow\)/g) || []).length;
assert.equal(
  wrapPostCount,
  1,
  `expected exactly 1 safePostTiming(closeTarget, _issueWrapRow) call in verbClose, found ${wrapPostCount}`
);

const flushCount = (src.match(/await runLogIssueTime\(closeTarget\)/g) || []).length;
assert.equal(
  flushCount,
  1,
  `expected exactly 1 runLogIssueTime(closeTarget) call in verbClose, found ${flushCount}`
);

// Ordering: terminal wrap row must precede runLogIssueTime, which must precede runMoveStateDone.
// #425 added an earlier `runMoveStateDone` call in the close-convergence
// short-circuit (board-drift recovery on an already-CLOSED issue), so anchor
// this ordering check to the TERMINAL (last) board move in the full pipeline,
// not the first textual occurrence.
const doneIdx = src.search(/safePostTiming\(closeTarget,\s*_issueWrapRow\)/);
const flushIdx = src.indexOf('await runLogIssueTime(closeTarget)');
const moveDoneMatches = [...src.matchAll(/runMoveStateDone\(/g)];
const moveDoneIdx = moveDoneMatches.length ? moveDoneMatches[moveDoneMatches.length - 1].index : -1;
assert.ok(doneIdx >= 0 && flushIdx >= 0 && moveDoneIdx >= 0);
assert.ok(doneIdx < flushIdx, 'runLogIssueTime must come after the terminal issue:wrap row');
assert.ok(flushIdx < moveDoneIdx, 'runLogIssueTime must come before runMoveStateDone');

console.log('close-flush-timing.test.mjs: all passed');
