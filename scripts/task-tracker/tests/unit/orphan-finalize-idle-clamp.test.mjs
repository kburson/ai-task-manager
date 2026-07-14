#!/usr/bin/env node
// @story #818 — natural/switch idle finalize must not re-count wall-clock the
// post-stop state-move rows already credited as active.
//
// finalizeOrphanPause anchored its idle window at the raw marker.stoppedAt. When
// a `promote`/`test` verb emitted a timing row AFTER the agent's Stop, the
// issue's last-row ts advanced past stoppedAt; computing idle as `now - stoppedAt`
// re-spanned `[stoppedAt -> lastRowTs]`, which those rows already booked active —
// a double-count (observed live on #817). The fix clamps the idle anchor to
// `max(stoppedMs, lastRowMs)` BEFORE the threshold gate, so idle covers only the
// unaccounted tail and sub-threshold tails emit nothing.
import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { pendingPausePath } from '../../hooks/on-stop.mjs';
import { fmtTs } from '../../gh-timing-comment.mjs';
import { loadConfig } from '../../config.mjs';
import { finalizeOrphanPause } from '../../orphan-finalize.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-orphan-clamp-'));
// Emitted rows carry a real `now` ts (buildRow forbids retroactive timestamps),
// so idle seconds are asserted against the wall clock with a small tolerance —
// same pattern as orphan-finalize-active-credit.test.mjs.
const TOL = 5;
const threshold = Number(loadConfig().pauseThresholdSeconds) || 0;
assert.ok(threshold >= 2, `test assumes a positive pause threshold, got ${threshold}`);

function writeMarker(sid, payload) {
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(payload) + '\n', 'utf8');
  return p;
}

function rowSec(row) {
  const m = row.match(/row-sec: a=(\d+) i=(\d+)/);
  assert.ok(m, `row carries a row-sec marker: ${row}`);
  return { a: Number(m[1]), i: Number(m[2]) };
}

// A timing body whose most-recent row lands at `atMs`, so lastRowTsFromBody
// anchors the clamp there.
function bodyWithLastRow(atMs) {
  return [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${fmtTs(new Date(atMs))} | develop:completed | | | 0 | 0 | bound |`,
  ].join('\n');
}

function markerFor(sid, stoppedMs) {
  writeMarker(sid, {
    stoppedAt: new Date(stoppedMs).toISOString(),
    issue: '#818',
    state: 'develop',
    sessionId: sid,
  });
}

// AC1 — post-stop row (lastRowMs > stoppedMs), tail above threshold: exactly one
// idle row, whose seconds equal `now - lastRowMs`, NOT `now - stoppedMs`.
test('idle anchor clamps to lastRowTs when a post-stop row advanced it', async () => {
  const now = Date.now();
  const tailSec = threshold + 90;
  const lastRowMs = now - tailSec * 1000;
  const stoppedMs = lastRowMs - 4 * 60_000; // stop happened well before the last row
  const sid = 'clamp-above';
  markerFor(sid, stoppedMs);
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: () => [],
    },
  });
  assert.ok(r && r.finalized, 'AC1: finalized (tail above threshold)');
  assert.equal(calls.length, 1, 'AC1: only the idle row (inverted window credits no active)');
  const i = rowSec(calls[0].row);
  const stoppedGap = Math.floor((now - stoppedMs) / 1000);
  assert.ok(
    Math.abs(i.i - tailSec) <= TOL,
    `AC1: idle ~= now - lastRowMs (${tailSec}s), got ${i.i}`
  );
  assert.ok(
    i.i < stoppedGap - 60,
    `AC1: idle clamped well below the raw stoppedAt gap (${stoppedGap}s)`
  );
});

// AC2 — post-stop row, clamped tail BELOW threshold (the #817 case): no row is
// emitted, the marker is deleted, and the call returns null.
test('sub-threshold clamped tail emits no idle row and returns null', async () => {
  const now = Date.now();
  const tailSec = Math.floor(threshold / 2); // strictly < threshold, >= 1
  const lastRowMs = now - tailSec * 1000;
  const stoppedMs = lastRowMs - 5 * 60_000; // raw gap huge, but clamp kills it
  const sid = 'clamp-below';
  markerFor(sid, stoppedMs);
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: () => [],
    },
  });
  assert.equal(r, null, 'AC2: sub-threshold clamped tail → returns null');
  assert.equal(calls.length, 0, 'AC2: no timing row emitted (spurious #817 rows vanish)');
});

// AC3 — genuine human-wait (no row after the stop, lastRowMs <= stoppedMs): the
// full `[stoppedAt → now]` gap is still logged as idle (non-regression).
test('genuine human-wait still logs the full stop-to-now gap as idle', async () => {
  const now = Date.now();
  const stoppedMs = now - 6 * 60_000;
  const lastRowMs = stoppedMs - 10 * 60_000; // last row precedes the stop
  const sid = 'genuine-wait';
  markerFor(sid, stoppedMs);
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: () => [], // no in-window turns → no active row
    },
  });
  assert.ok(r && r.finalized, 'AC3: finalized');
  assert.equal(calls.length, 1, 'AC3: idle row only');
  const i = rowSec(calls[0].row);
  const fullGap = Math.floor((now - stoppedMs) / 1000);
  assert.ok(
    Math.abs(i.i - fullGap) <= TOL,
    `AC3: full stop→now gap preserved (~${fullGap}s), got ${i.i}`
  );
});

after(() => {
  rmSync(tmp, { recursive: true });
});
