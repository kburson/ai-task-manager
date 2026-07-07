// @story #720
//
// Regression: `flushActiveToGH` (the pause/flush path) anchored its
// Active-duration window on `state.entryStartTs`, which forward move-state
// promotions do NOT advance. After a bind followed by refine→plan rows, a
// `pause` re-counted wall time the intervening move-state rows already logged
// (System A owns the window since the previous row). The fix anchors on
// `max(entryStartTs, lastRowTs)` and renders at second precision so pause rows
// stop being minute-quantized. These assertions pin the two pure helpers the
// flush path now depends on.
import assert from 'node:assert/strict';

import {
  resolveFlushStartMs,
  computeActiveAndIdleSeconds,
  computeActiveAndIdleMinutes,
} from '../../active-time.mjs';

// Fixture from the #715 sequence (UTC, so the arithmetic is TZ-independent).
const ENTRY = Date.parse('2026-07-06T15:00:49Z'); // bind → entryStartTs (stale)
const LAST_ROW = Date.parse('2026-07-06T15:18:50Z'); // last move-state row ts
const PAUSE = Date.parse('2026-07-06T15:47:19Z'); // flush (pause) ts

// --- AC1 / AC2: max-anchor picks the later of entryStart and lastRow ---------
{
  const startMs = resolveFlushStartMs(ENTRY, LAST_ROW);
  assert.equal(
    startMs,
    LAST_ROW,
    'anchor is the later timestamp (lastRow), not the stale entryStart'
  );
  const activeSec = Math.round((PAUSE - startMs) / 1000);
  assert.equal(
    activeSec,
    1709,
    'pause-row Active is 0h 28m 29s (1709s) from the last row, not the double-counted window from bind'
  );
  // Guard: the old stale-anchor path produces a different, larger value.
  assert.notEqual(
    Math.round((PAUSE - ENTRY) / 1000),
    1709,
    'the stale entryStart anchor would have over-counted (this is the bug the fix removes)'
  );
}

// --- AC3: no intervening row (entryStart >= lastRow) -> anchor on entryStart --
{
  // A fresh resume advanced entryStartTs PAST the last row.
  const entryAfter = LAST_ROW + 5000;
  assert.equal(
    resolveFlushStartMs(entryAfter, LAST_ROW),
    entryAfter,
    'anchor stays entryStart when it is the later mark (happy path preserved)'
  );
  // Equal marks resolve to the shared value (max of equals).
  assert.equal(resolveFlushStartMs(LAST_ROW, LAST_ROW), LAST_ROW);
}

// --- AC4: unreadable last-row ts falls back to entryStart, never throws ------
{
  assert.equal(resolveFlushStartMs(ENTRY, NaN), ENTRY, 'NaN lastRow -> entryStart fallback');
  assert.equal(resolveFlushStartMs(ENTRY, null), ENTRY, 'null lastRow -> entryStart fallback');
  assert.equal(
    resolveFlushStartMs(ENTRY, undefined),
    ENTRY,
    'undefined lastRow -> entryStart fallback'
  );
  assert.doesNotThrow(() => resolveFlushStartMs(ENTRY, NaN));
}

// --- AC2 (precision): seconds sibling preserves sub-minute; minutes rounds it away
{
  const startMs = Date.parse('2026-07-06T15:00:00Z');
  const endMs = startMs + 90_000; // 90-second window
  const events = [startMs + 45_000]; // one mid-window event -> idle 0
  const idleThresholdMs = 5 * 60_000;

  const sec = computeActiveAndIdleSeconds({ startMs, endMs, events, idleThresholdMs });
  assert.equal(sec.activeSec, 90, 'second precision preserves the 90s active window');
  assert.equal(sec.idleSec, 0, 'no idle: both gaps are under threshold');

  const min = computeActiveAndIdleMinutes({ startMs, endMs, events, idleThresholdMs });
  assert.equal(min.activeMin, 2, 'minute rounding coarsens the same 90s window to 2m');

  // Empty events -> {0,0}, mirroring the minutes contract (no evidence of activity).
  assert.deepEqual(
    computeActiveAndIdleSeconds({ startMs, endMs, events: [], idleThresholdMs }),
    { activeSec: 0, idleSec: 0 },
    'empty events -> zero seconds, same contract as the minutes function'
  );
  // Degenerate window -> {0,0}.
  assert.deepEqual(
    computeActiveAndIdleSeconds({ startMs: endMs, endMs: startMs, events, idleThresholdMs }),
    { activeSec: 0, idleSec: 0 },
    'end <= start -> zero'
  );
}

console.log('flush-active-anchor.test.mjs: all assertions passed');
