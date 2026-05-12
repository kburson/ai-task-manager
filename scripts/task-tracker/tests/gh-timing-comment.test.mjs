#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  buildRow,
  appendRow,
  buildInitialComment,
  TIMING_HEADING,
  RETROACTIVE_TS_ERROR,
  readLastKnownState,
  writeLastKnownState,
} from '../gh-timing-comment.mjs';

function localMinuteWithOffset(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${offset}`;
}

// All "now-ish" timestamps used below — buildRow refuses retroactive entries
// outside a ±60s window, so tests must use current time anchors.
const tsNow1 = new Date().toISOString();
const tsNow2 = new Date(Date.now() - 30_000).toISOString(); // 30 s ago, within window
const tsNow3 = new Date(Date.now() - 5_000).toISOString();

// Test 1: buildRow formats correctly
const row = buildRow({
  ts: tsNow1,
  event: 'start',
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 8541,
  description: 'task opened',
});
const ts1 = localMinuteWithOffset(tsNow1);
assert.equal(row, `| ${ts1} | start | 0 | 0 | 0 | 8,541 | task opened |`);

// Test 2: buildRow with deltas
const row2 = buildRow({
  ts: tsNow2,
  event: 'pre-compact-flush',
  activeMin: 38,
  idleMin: 7,
  deltaWords: 12400,
  wordMarker: 20941,
  description: 'context compacted',
});
const ts2 = localMinuteWithOffset(tsNow2);
assert.equal(row2, `| ${ts2} | pre-compact-flush | 38 | 7 | 12,400 | 20,941 | context compacted |`);

// Test 3: buildRow null values render as —
const row3 = buildRow({
  ts: tsNow3,
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

// ---- retroactive-ts refusal -------------------------------------------------

// Test 6: backdated ts (5 min ago) throws with the documented error.
assert.throws(
  () =>
    buildRow({
      ts: Date.now() - 5 * 60_000,
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 1,
    }),
  (err) => err.message.startsWith(RETROACTIVE_TS_ERROR),
  'backdated ts must throw retroactive-ts error'
);

// Test 7: current ts (Date.now()) succeeds.
assert.doesNotThrow(
  () =>
    buildRow({
      ts: Date.now(),
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 1,
    }),
  'current ts must succeed'
);

// Test 8: 30s-old ts succeeds (within ±60s window).
assert.doesNotThrow(
  () =>
    buildRow({
      ts: Date.now() - 30_000,
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 1,
    }),
  '30s-old ts must succeed within window'
);

// Test 9: future ts (5 min ahead) throws — no asymmetry.
assert.throws(
  () =>
    buildRow({
      ts: Date.now() + 5 * 60_000,
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 1,
    }),
  (err) => err.message.startsWith(RETROACTIVE_TS_ERROR),
  'future ts must throw retroactive-ts error'
);

// Test 10: non-parseable ts throws.
assert.throws(
  () =>
    buildRow({
      ts: 'not-a-date',
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 1,
    }),
  (err) => err.message.startsWith(RETROACTIVE_TS_ERROR),
  'non-parseable ts must throw retroactive-ts error'
);

// ---- lastKnownState helpers ------------------------------------------------

// Test 11: readLastKnownState returns nulls when markers absent.
{
  const empty = readLastKnownState('## Title\n\nbody body body\n');
  assert.deepEqual(empty, { state: null, ts: null }, 'absent markers -> nulls');
  assert.deepEqual(readLastKnownState(''), { state: null, ts: null }, 'empty body -> nulls');
  assert.deepEqual(
    readLastKnownState(undefined),
    { state: null, ts: null },
    'undefined body -> nulls'
  );
}

// Test 12: readLastKnownState parses both pair members.
{
  const body = [
    '<!-- aitm-last-known-state: develop -->',
    '<!-- aitm-last-known-state-ts: 2026-05-10T14:32:11Z -->',
    '',
    '## Title',
    'rest',
  ].join('\n');
  const out = readLastKnownState(body);
  assert.equal(out.state, 'develop', 'state parsed');
  assert.equal(out.ts, '2026-05-10T14:32:11Z', 'ts parsed');
}

// Test 13: writeLastKnownState round-trips through readLastKnownState.
{
  const body = '## Title\n\nbody body\n';
  const next = writeLastKnownState(body, 'review');
  const round = readLastKnownState(next);
  assert.equal(round.state, 'review', 'roundtrip state');
  assert.ok(round.ts && !Number.isNaN(Date.parse(round.ts)), 'roundtrip ts is parseable ISO');
  assert.ok(next.includes('## Title'), 'original body preserved');
}

// Test 14: writeLastKnownState updates existing pair in place — no duplicates.
{
  let body = '## Title\n\nbody\n';
  body = writeLastKnownState(body, 'plan');
  body = writeLastKnownState(body, 'develop');
  body = writeLastKnownState(body, 'review');
  const stateMatches = body.match(/aitm-last-known-state:/g) || [];
  const tsMatches = body.match(/aitm-last-known-state-ts:/g) || [];
  assert.equal(stateMatches.length, 1, 'exactly one state marker');
  assert.equal(tsMatches.length, 1, 'exactly one ts marker');
  assert.equal(readLastKnownState(body).state, 'review', 'last write wins');
}

// Test 15: writeLastKnownState refuses empty/non-string state.
assert.throws(() => writeLastKnownState('body', ''), /non-empty string/);
assert.throws(() => writeLastKnownState('body', null), /non-empty string/);

console.log('gh-timing-comment.test.mjs: all passed');
