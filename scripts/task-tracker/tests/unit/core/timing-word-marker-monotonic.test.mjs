#!/usr/bin/env node
// @story #152
// Behavioral lock: when a verb computes wordMarker live (the
// `s.wordsAtEntryStart + deltaWords` pattern used by start.mjs, switch.mjs,
// update.mjs, and the agent-timing branch of review.mjs), a sequence of
// rows posted across a simulated session must show non-zero, monotonically
// non-decreasing Word Marker values. This complements the source-level
// regression test by exercising buildRow against the live-compute idiom.

import { strict as assert } from 'node:assert';
import { buildRow } from '../../../gh-timing-comment.mjs';

function simulateSession(initialWords, deltas) {
  // Mirror the live-compute pattern from verbs/start.mjs:72 and update.mjs:44.
  let wordsAtEntryStart = initialWords;
  const rows = [];
  for (const delta of deltas) {
    const wordMarker = wordsAtEntryStart + delta;
    rows.push(
      buildRow({
        ts: new Date().toISOString(),
        event: 'update',
        activeMin: 1,
        idleMin: 0,
        deltaWords: delta,
        wordMarker,
        description: 'simulated update',
      })
    );
    // Next event starts where this one ended (matches `flushActiveToGH`).
    wordsAtEntryStart = wordMarker;
  }
  return rows;
}

const rendered = simulateSession(1000, [50, 75, 120, 30]);
assert.equal(rendered.length, 4);

// Extract the "Word Marker" column (column index 6 in the pipe-delimited row).
const markers = rendered.map((row) => {
  const cols = row.split('|').map((c) => c.trim());
  // cols[0] is '' (leading pipe), cols[1] ts, cols[2] event, cols[3] active,
  // cols[4] idle, cols[5] deltaWords, cols[6] wordMarker, cols[7] description.
  return Number.parseInt(cols[6].replace(/,/g, ''), 10);
});

assert.deepEqual(markers, [1050, 1125, 1245, 1275], 'word markers must follow live-compute idiom');
for (const m of markers) assert.ok(m > 0, `expected non-zero wordMarker, got ${m}`);
for (let i = 1; i < markers.length; i++) {
  assert.ok(
    markers[i] >= markers[i - 1],
    `word marker must be monotonic non-decreasing: ${markers[i - 1]} → ${markers[i]}`
  );
}

console.log('timing-word-marker-monotonic: PASS');
