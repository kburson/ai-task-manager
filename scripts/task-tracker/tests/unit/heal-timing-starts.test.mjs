#!/usr/bin/env node
// @story #535
// `healTimingStarts(body)` — rewrite every `start` row after the first into
// `resumed`, preserving the first `start`. Idempotent.
import { strict as assert } from 'node:assert';
import { healTimingStarts, countStartRows } from '../../lib/heal-timing-starts.mjs';

const HEADER = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
];

function log(...rows) {
  return [...HEADER, ...rows].join('\n');
}

// ---- 1. Multiple starts → first kept, rest rewritten to resumed ------------
{
  const body = log(
    '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
    '| 2026-06-24 10:00 -05:00 | pause | 60 | 0 | 50 | 150 | break |',
    '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | back |',
    '| 2026-06-24 12:00 -05:00 | start | 0 | 0 | 0 | 200 | back again |'
  );
  assert.equal(countStartRows(body), 3, 'fixture has three start rows');
  const healed = healTimingStarts(body);
  assert.equal(countStartRows(healed), 1, 'exactly one start survives');
  // First start row preserved verbatim.
  assert.match(healed, /\| 2026-06-24 09:00 -05:00 \| start \|/);
  // Secondary starts became resumed.
  assert.match(healed, /\| 2026-06-24 11:00 -05:00 \| resumed \|/);
  assert.match(healed, /\| 2026-06-24 12:00 -05:00 \| resumed \|/);
  // Non-start rows untouched.
  assert.match(healed, /\| 2026-06-24 10:00 -05:00 \| pause \|/);
}

// ---- 2. Idempotency — a second pass is a no-op -----------------------------
{
  const body = log(
    '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
    '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | back |'
  );
  const once = healTimingStarts(body);
  const twice = healTimingStarts(once);
  assert.equal(once, twice, 'second pass must reproduce identical bytes');
  assert.equal(countStartRows(once), 1);
}

// ---- 3. Already-canonical (single start) — unchanged -----------------------
{
  const body = log(
    '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
    '| 2026-06-24 11:00 -05:00 | resumed | 0 | 0 | 0 | 150 | back |'
  );
  assert.equal(healTimingStarts(body), body, 'canonical log must be returned unchanged');
}

// ---- 4. Description containing the word "start" is not rewritten -----------
{
  const body = log(
    '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
    '| 2026-06-24 11:00 -05:00 | resumed | 0 | 0 | 0 | 150 | restart the build |'
  );
  const healed = healTimingStarts(body);
  assert.match(healed, /restart the build/, 'description text must be preserved');
  assert.equal(countStartRows(healed), 1);
}

// ---- 5. Empty / header-only inputs — no throw, no start rows ---------------
{
  assert.equal(countStartRows(''), 0);
  assert.equal(healTimingStarts(''), '');
  assert.equal(countStartRows(HEADER.join('\n')), 0);
}

console.log('heal-timing-starts.test.mjs: ok');
