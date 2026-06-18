#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { collectEventTimestamps, computeActiveMinutes } from '../../active-time.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-at-'));
const jsonlPath = path.join(tmp, 'session.jsonl');

// Helper to build an iso timestamp from a base + offset seconds.
const BASE = Date.parse('2026-04-24T12:00:00Z');
const iso = (sec) => new Date(BASE + sec * 1000).toISOString();

function writeJsonl(entries) {
  writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

// ---- collectEventTimestamps ----

// Filters by type, isMeta, isSidechain; sorts; honors window.
writeJsonl([
  { type: 'user', timestamp: iso(10) },
  { type: 'assistant', timestamp: iso(30) },
  { type: 'user', timestamp: iso(20) }, // out of order — should sort
  { type: 'system', timestamp: iso(15) }, // non-activity — skip
  { type: 'user', timestamp: iso(40), isMeta: true }, // meta — skip
  { type: 'assistant', timestamp: iso(50), isSidechain: true }, // sidechain — skip
  { type: 'user', timestamp: iso(200) }, // outside window — skip
  { type: 'user' /* no timestamp */ }, // malformed — skip
  { type: 'user', timestamp: 'not-a-date' }, // unparseable — skip
]);
let ev = collectEventTimestamps(jsonlPath, BASE, BASE + 100 * 1000);
assert.deepEqual(ev, [BASE + 10_000, BASE + 20_000, BASE + 30_000], 'filters + sorts correctly');

// Missing file returns [].
assert.deepEqual(collectEventTimestamps(path.join(tmp, 'nope.jsonl'), 0, 1), []);

// ---- computeActiveMinutes ----

const threshold = 5 * 60_000; // 5 min

// Empty window → 0.
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 0, events: [], idleThresholdMs: threshold }),
  0
);

// Non-empty window, zero events → 0 (no evidence of activity).
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 60 * 60_000, events: [], idleThresholdMs: threshold }),
  0,
  'zero events in non-empty window → 0 active'
);

// All gaps sub-threshold → active == wall.
// Wall = 20 min; events every 4 min → max gap 4 min < 5 min threshold.
ev = [4, 8, 12, 16].map((m) => m * 60_000);
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 20 * 60_000, events: ev, idleThresholdMs: threshold }),
  20,
  'all gaps sub-threshold → active == wall'
);

// Excess-only math: single 15-min gap in a 16-min window → 16 - (15 - 5) = 6 active.
ev = [1 * 60_000]; // one event 1 min in, then silence until end at 16 min
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 16 * 60_000, events: ev, idleThresholdMs: threshold }),
  6,
  'excess-only: 15-min gap with 5-min threshold leaves 6 active in 16-min window'
);

// Gap before first event: start=0, first event at 30 min, end at 32 min →
// first gap 30 min (excess 25), second gap 2 min. active = 32 - 25 = 7.
ev = [30 * 60_000];
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 32 * 60_000, events: ev, idleThresholdMs: threshold }),
  7,
  'idle gap before first event is subtracted'
);

// Gap after last event: event at 2 min, end at 32 min → second gap 30 min (excess 25).
// first gap 2 min (sub-threshold). active = 32 - 25 = 7.
ev = [2 * 60_000];
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 32 * 60_000, events: ev, idleThresholdMs: threshold }),
  7,
  'idle gap after last event is subtracted'
);

// Overnight-style gap: 480-min wall, single event at 1 min, then silence.
// gap1 = 1 min (ok), gap2 = 479 min (excess 474). active = 480 - 474 = 6.
ev = [1 * 60_000];
assert.equal(
  computeActiveMinutes({ startMs: 0, endMs: 480 * 60_000, events: ev, idleThresholdMs: threshold }),
  6,
  'overnight idle: active collapses to 2 * threshold window'
);

// endMs <= startMs → 0.
assert.equal(
  computeActiveMinutes({ startMs: 1000, endMs: 1000, events: [1000], idleThresholdMs: threshold }),
  0
);
assert.equal(
  computeActiveMinutes({ startMs: 2000, endMs: 1000, events: [1500], idleThresholdMs: threshold }),
  0
);

rmSync(tmp, { recursive: true });
console.log('active-time.test.mjs: all passed');
