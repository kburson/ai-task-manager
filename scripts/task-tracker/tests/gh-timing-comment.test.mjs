#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { buildRow, appendRow, buildInitialComment, TIMING_HEADING } from '../gh-timing-comment.mjs';

// Test 1: buildRow formats correctly
const row = buildRow({
  ts: '2026-04-24T14:02:00Z',
  event: 'start',
  deltaMin: null,
  deltaWords: null,
  cumMin: 0,
  cumWords: 0,
});
assert.equal(row, '| 2026-04-24T14:02Z | start | — | — | 0 | 0 |');

// Test 2: buildRow with deltas
const row2 = buildRow({
  ts: '2026-04-24T14:47:00Z',
  event: 'pre-compact-flush',
  deltaMin: 45,
  deltaWords: 12400,
  cumMin: 45,
  cumWords: 12400,
});
assert.equal(row2, '| 2026-04-24T14:47Z | pre-compact-flush | 45 | 12,400 | 45 | 12,400 |');

// Test 3: buildInitialComment has heading and headers
const initial = buildInitialComment();
assert.ok(initial.includes(TIMING_HEADING));
assert.ok(initial.includes('| Timestamp |'));

// Test 4: appendRow inserts before total line, replaces total
const startingBody = buildInitialComment();
const withOne = appendRow(startingBody, row, { cumMin: 0, cumWords: 0 });
assert.ok(withOne.includes('| 2026-04-24T14:02Z | start |'));
assert.ok(withOne.includes('**Session total: 0 min, 0 words.**'));

const withTwo = appendRow(withOne, row2, { cumMin: 45, cumWords: 12400 });
// New total, old row still present
assert.ok(withTwo.includes('| 2026-04-24T14:02Z | start |'));
assert.ok(withTwo.includes('| 2026-04-24T14:47Z | pre-compact-flush |'));
assert.ok(withTwo.includes('**Session total: 45 min, 12,400 words.**'));
// Old total line removed
assert.equal((withTwo.match(/Session total:/g) || []).length, 1);

console.log('gh-timing-comment.test.mjs: all passed');
