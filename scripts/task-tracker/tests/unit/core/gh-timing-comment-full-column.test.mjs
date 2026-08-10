#!/usr/bin/env node
// @story #1142
// Trailing `Full Word Marker` column: buildRow renders the absolute cumulative
// full-expansion cursor and buildInitialComment advertises the canonical column.
import { strict as assert } from 'node:assert';
import { buildRow } from '../../../gh-timing-comment.mjs';
import { buildInitialComment } from '../../../gh-timing-comment.internals.mjs';

function localMinuteWithOffset(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${offset}`;
}

// Test 1: buildRow emits the supplied absolute full-expansion marker.
{
  const ts = new Date().toISOString();
  const tsLocal = localMinuteWithOffset(ts);
  const full = buildRow({
    ts,
    event: 'pre-compact-flush',
    activeMin: 5,
    idleMin: 0,
    deltaWords: 120,
    fullWordMarker: 12_400,
    wordMarker: 9000,
    description: 'context compacted',
  });
  assert.equal(
    full,
    `| ${tsLocal} | pre-compact-flush | 5 |  | 120 | 9,000 | context compacted | 12,400 |`,
    'absolute full-expansion marker renders after Description'
  );
}

// Test 2: omitting `deltaWordsFull` is byte-identical to today (no trailing
// cell) — historical rows and exact-match callers stay unchanged.
{
  const ts = new Date().toISOString();
  const tsLocal = localMinuteWithOffset(ts);
  const legacy = buildRow({
    ts,
    event: 'start',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 8541,
    description: 'task opened',
  });
  assert.equal(legacy, `| ${tsLocal} | start |  |  |  | 8,541 | task opened |`);
}

// Test 3: an absolute full-expansion marker of 0 is real data, never blank.
{
  const ts = new Date().toISOString();
  const zeroFull = buildRow({
    ts,
    event: 'post-compact-resume',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    fullWordMarker: 0,
    wordMarker: 1,
    description: 'resumed after compact',
  });
  assert.ok(
    zeroFull.endsWith('| resumed after compact | 0 |'),
    'zero absolute marker remains numeric'
  );
}

// Test 4: buildInitialComment header advertises the new column.
assert.ok(
  buildInitialComment().includes('Full Word Marker'),
  'initial comment header must include the Full Word Marker column'
);

console.log('gh-timing-comment-full-column.test.mjs: all passed');
