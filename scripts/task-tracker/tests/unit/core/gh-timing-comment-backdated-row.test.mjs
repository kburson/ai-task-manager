#!/usr/bin/env node
// @story #1104
// buildBackdatedDepartureRow: exempt from buildRow's retroactive-ts guard (#981)
// but only ever a zero-delta marker row, and — since #1104 — rendered at an
// explicitly supplied UTC offset rather than the emitting machine's zone. Split
// out of gh-timing-comment.test.mjs to stay under the 400-line cap.
import { strict as assert } from 'node:assert';
import { buildBackdatedDepartureRow, fmtTs } from '../../../gh-timing-comment.mjs';

const historicalTs = '2026-07-24 04:20:00 -05:00';

function row(overrides = {}) {
  return buildBackdatedDepartureRow({
    ts: historicalTs,
    event: 'pause:auto-detected-gap',
    wordMarker: 0,
    fullWordMarker: 0,
    description: 'synthetic departure',
    ...overrides,
  });
}

// Test 27: a backdated ts (days ago) does NOT throw — the whole point of the
// exemption — and renders the byte-identical zero-delta shape buildRow itself
// produces for activeMin/idleMin/deltaWords all 0.
//
// #1104: the row renders at the offset the CALLER supplies (verbResume supplies
// the offset of the row this one lands one second after), not the emitting
// machine's zone. Passing `offsetMin` is what makes this an assertion about the
// decided semantics rather than an assertion that the machine is in Chicago —
// the pre-#1104 form omitted it and so failed on every non-CDT runner.
assert.equal(
  row({ offsetMin: -300 }),
  '| 2026-07-24 04:20:00 -05:00 | pause:auto-detected-gap |  |  |  | 0 | synthetic departure | 0 | <!-- row-sec: a=0 i=0 -->'
);

// Test 27b: omitting `offsetMin` keeps the pre-#1104 local-zone rendering.
// Asserted against `fmtTs`'s own output rather than a literal, so the assertion
// holds in every zone while still pinning the fallback behavior.
assert.equal(
  row(),
  `| ${fmtTs(historicalTs)} | pause:auto-detected-gap |  |  |  | 0 | synthetic departure | 0 | <!-- row-sec: a=0 i=0 -->`
);

// Test 27c: the change is display-only — rendering the same instant at +00:00
// shifts the wall-clock by exactly the offset difference and nothing else.
assert.ok(row({ offsetMin: 0 }).startsWith('| 2026-07-24 09:20:00 +00:00 |'));

// Test 27d: a non-integer-hour offset round-trips (the `abs % 60` path).
assert.ok(row({ offsetMin: 330 }).startsWith('| 2026-07-24 14:50:00 +05:30 |'));

// Test 27e: a non-numeric offset is ignored rather than rendering `NaN` — it
// falls through to the local-zone default, same as omitting it entirely.
assert.equal(row({ offsetMin: null }), row());
assert.equal(row({ offsetMin: 'noon' }), row());

// Test 28: no activeSec/idleSec/deltaWords parameter exists on the signature —
// extra keys are silently ignored, never escalate the zero-delta claim.
const histRowIgnoresExtras = buildBackdatedDepartureRow({
  ts: historicalTs,
  event: 'pause:x',
  wordMarker: 5,
  fullWordMarker: 8,
  description: 'd',
  activeSec: 99999,
  idleSec: 99999,
  deltaWords: 99999,
});
assert.ok(histRowIgnoresExtras.includes('<!-- row-sec: a=0 i=0 -->'));
assert.ok(histRowIgnoresExtras.includes('| 5 | d | 8 |'));

// Test 29: a non-parseable ts throws rather than silently building a bad row.
assert.throws(() => buildBackdatedDepartureRow({ ts: 'not-a-timestamp', event: 'pause:x' }));

console.log('gh-timing-comment-backdated-row.test.mjs: all passed');
