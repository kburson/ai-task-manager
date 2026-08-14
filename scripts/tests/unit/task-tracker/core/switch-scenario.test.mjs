#!/usr/bin/env node
// @story #130
// @story #534
// @story #568
// Switch scenario — originally #130 (outgoing-only `switch-out`), reversed by
// #534 to *paired* switch semantics, then refined by #568 to a single return
// verb. Every task hop records:
//
//   - Switching from A to B emits a `switch-out:#B` row on A's log
//     (description "Switching out to task #B") — the departure still names the
//     peer it hands off to.
//   - The incoming bind on B resolves against B's own log: a never-seen B
//     emits `start`; a B with any timing history emits `resumed`.
//   - Returning to A — whose log carries the still-open `switch-out:#B` — emits
//     `resumed` (#568: `resumed` is the SOLE return verb; never `switch-in:#B`,
//     never a bare second `start`). `resumed` closes the open `switch-out`.
//
// This is a structural test over the same `resolveBindEvent` taxonomy and
// `buildRow` renderer the runtime uses.
import { strict as assert } from 'node:assert';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  resolveBindEvent,
  lastOpenInterruption,
} from '../../../../task-tracker/lib/bind-event.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const body = (...rows) => [...HEADER, ...rows].join('\n');
const logRow = (event, ts) => `| ${ts} | ${event} | | | 0 | 1,234 | ${event} |`;

// ---- 1. Outgoing `switch-out:#B` row is well-formed ----------------------
const tsA = new Date(Date.now() - 5000).toISOString();
const outgoing = buildRow({
  ts: tsA,
  event: 'switch-out:#777',
  activeMin: 3,
  idleMin: 0,
  deltaWords: 250,
  wordMarker: 1000,
  description: 'Switching out to task #777',
});
assert.match(outgoing, /\| switch-out:#777 \|/, 'outgoing row must use switch-out:#N slug');
assert.match(
  outgoing,
  /Switching out to task #777/,
  'outgoing row must carry the "Switching out to task #N" description'
);

// ---- 2. A's log with the open switch-out resolves the return to resumed -----
const aLog = body(
  logRow('start', '2026-06-25 09:00:00 +00:00'),
  logRow('switch-out:#777', '2026-06-25 09:30:00 +00:00')
);
assert.deepEqual(lastOpenInterruption(aLog), { kind: 'switch-out', peer: '#777' });
assert.equal(
  resolveBindEvent({ hasTimingHistory: true, timingBody: aLog }),
  'resumed',
  'returning into A must close the open switch-out:#777 with resumed (#568 sole return verb)'
);

// ---- 3. B's log: a never-seen B binds as start ----------------------------
assert.equal(
  resolveBindEvent({ hasTimingHistory: false, timingBody: body() }),
  'start',
  'a never-seen incoming issue must bind as start, not switch-in'
);

// ---- 4. A round-tripped switch (closed) resolves to a benign resumed ------
// #568 — the return row is now `resumed` (the sole return verb), which closes
// the open switch-out exactly as the legacy `switch-in:#N` did.
const closed = body(
  logRow('start', '2026-06-25 09:00:00 +00:00'),
  logRow('switch-out:#777', '2026-06-25 09:30:00 +00:00'),
  logRow('resumed', '2026-06-25 10:00:00 +00:00')
);
assert.equal(lastOpenInterruption(closed), null, 'resumed closes the open switch-out');
assert.equal(
  resolveBindEvent({ hasTimingHistory: true, timingBody: closed }),
  'resumed',
  'history with no open interruption is the benign-tail resumed'
);

console.log('switch-scenario.test.mjs: ok');
