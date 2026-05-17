#!/usr/bin/env node
// Regression tripwire: verbClose must call runLogIssueTime after posting the
// final `event: 'done'` timing row, in BOTH the closingDifferentIssue branch
// and the s.active branch. Without this call, Engaged/Session/Review Time on
// the project board remain null after close when the test→review flush in
// verbReview was bypassed or interrupted (#147).

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '..', 'verbs/close.mjs'), 'utf8');

assert.ok(/runLogIssueTime,\s*\n/.test(src), 'verbClose must destructure runLogIssueTime from ctx');

// Both close branches (closingDifferentIssue + s.active) post a closeBr({ ...
// event: 'done' ... }) row, and EACH must be followed by a
// runLogIssueTime(closeTarget) call before runMoveStateDone fires.
const closeBrDoneCount = (src.match(/closeBr\(\{[^}]*event:\s*'done'/g) || []).length;
assert.equal(
  closeBrDoneCount,
  2,
  `expected 2 closeBr event:'done' rows in verbClose, found ${closeBrDoneCount}`
);

const flushCount = (src.match(/await runLogIssueTime\(closeTarget\)/g) || []).length;
assert.equal(
  flushCount,
  2,
  `expected 2 runLogIssueTime(closeTarget) calls in verbClose (one per branch), found ${flushCount}`
);

// Ordering check: each runLogIssueTime call must appear AFTER a done row and
// BEFORE the corresponding runMoveStateDone call. We check positions.
const closeBrPositions = [...src.matchAll(/closeBr\(\{[^}]*event:\s*'done'/g)].map((m) => m.index);
const flushPositions = [...src.matchAll(/await runLogIssueTime\(closeTarget\)/g)].map(
  (m) => m.index
);
const moveDonePositions = [...src.matchAll(/runMoveStateDone\(/g)].map((m) => m.index);
assert.equal(closeBrPositions.length, 2);
assert.equal(flushPositions.length, 2);
assert.equal(moveDonePositions.length, 2);
for (let i = 0; i < 2; i++) {
  assert.ok(
    closeBrPositions[i] < flushPositions[i],
    `branch ${i}: runLogIssueTime must come after the event:'done' row`
  );
  assert.ok(
    flushPositions[i] < moveDonePositions[i],
    `branch ${i}: runLogIssueTime must come before runMoveStateDone`
  );
}

console.log('close-flush-timing.test.mjs: all passed');
