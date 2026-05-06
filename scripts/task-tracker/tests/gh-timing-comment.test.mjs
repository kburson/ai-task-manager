#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { buildRow, appendRow, buildInitialComment, TIMING_HEADING } from '../gh-timing-comment.mjs';

function localMinuteWithOffset(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${offset}`;
}

// Test 1: buildRow formats correctly
const row = buildRow({
  ts: '2026-04-24T14:02:00Z',
  event: 'start',
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 8541,
  description: 'task opened',
});
const ts1 = localMinuteWithOffset('2026-04-24T14:02:00Z');
assert.equal(row, `| ${ts1} | start | 0 | 0 | 0 | 8,541 | task opened |`);

// Test 2: buildRow with deltas
const row2 = buildRow({
  ts: '2026-04-24T14:47:00Z',
  event: 'pre-compact-flush',
  activeMin: 38,
  idleMin: 7,
  deltaWords: 12400,
  wordMarker: 20941,
  description: 'context compacted',
});
const ts2 = localMinuteWithOffset('2026-04-24T14:47:00Z');
assert.equal(row2, `| ${ts2} | pre-compact-flush | 38 | 7 | 12,400 | 20,941 | context compacted |`);

// Test 3: buildRow null values render as —
const row3 = buildRow({
  ts: '2026-04-24T14:02:00Z',
  event: 'session-start',
  activeMin: null,
  idleMin: null,
  deltaWords: null,
  wordMarker: 8541,
  description: 'session resumed',
});
assert.ok(row3.includes('| — | — | — |'));

// Test 4: buildInitialComment has heading and table header
const initial = buildInitialComment();
assert.ok(initial.includes(TIMING_HEADING));
assert.ok(initial.includes('| Timestamp |'));
assert.ok(initial.includes('Word Marker'));
assert.ok(initial.includes('Description'));
assert.ok(!initial.includes('Cum '));

// Test 5: appendRow inserts into table, no trailing footer
const withOne = appendRow(initial, row);
assert.ok(withOne.includes(`| ${ts1} | start |`));
assert.ok(!withOne.includes('Session total:'));

const withTwo = appendRow(withOne, row2);
assert.ok(withTwo.includes(`| ${ts1} | start |`));
assert.ok(withTwo.includes(`| ${ts2} | pre-compact-flush |`));
assert.ok(!withTwo.includes('Session total:'));

console.log('gh-timing-comment.test.mjs: all passed');
