#!/usr/bin/env node
// Regression tripwire: verbClose must call runLogIssueTime after posting the
// final `event: 'done'` timing row. Without this call, Engaged/Session/Review
// Time on the project board remain null after close when the test→review flush
// in verbReview was bypassed or interrupted (#147).
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

const closeBrDoneCount = (src.match(/closeBr\(\{[^}]*event:\s*'done'/g) || []).length;
assert.equal(
  closeBrDoneCount,
  1,
  `expected exactly 1 closeBr event:'done' row in verbClose, found ${closeBrDoneCount}`
);

const flushCount = (src.match(/await runLogIssueTime\(closeTarget\)/g) || []).length;
assert.equal(
  flushCount,
  1,
  `expected exactly 1 runLogIssueTime(closeTarget) call in verbClose, found ${flushCount}`
);

// Ordering: done row must precede runLogIssueTime, which must precede runMoveStateDone.
const doneIdx = src.search(/closeBr\(\{[^}]*event:\s*'done'/);
const flushIdx = src.indexOf('await runLogIssueTime(closeTarget)');
const moveDoneIdx = src.search(/runMoveStateDone\(/);
assert.ok(doneIdx >= 0 && flushIdx >= 0 && moveDoneIdx >= 0);
assert.ok(doneIdx < flushIdx, "runLogIssueTime must come after the event:'done' row");
assert.ok(flushIdx < moveDoneIdx, 'runLogIssueTime must come before runMoveStateDone');

console.log('close-flush-timing.test.mjs: all passed');
