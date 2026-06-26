#!/usr/bin/env node
// @story #130
// @story #534
// Switch scenario — originally #130 (outgoing-only `switch-out`), reversed by
// #534 to *paired* switch semantics. Every task hop now records both halves:
//
//   - Switching from A to B emits a `switch-out:#B` row on A's log
//     (description "Switching out to task #B").
//   - The incoming bind on B resolves against B's own log: a never-seen B
//     emits `start`; a B that earlier switched out to A (open `switch-out:#A`)
//     emits a paired `switch-in:#A`.
//   - Returning to A — whose log carries the still-open `switch-out:#B` — emits
//     a paired `switch-in:#B` (not a bare `resumed`, and not a duplicate
//     `start`).
//
// This is a structural test over the same `resolveBindEvent` taxonomy and
// `buildRow` renderer the runtime uses.
import { strict as assert } from 'node:assert';
import { buildRow } from '../../gh-timing-comment.mjs';
import { resolveBindEvent, lastOpenInterruption } from '../../lib/bind-event.mjs';

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

// ---- 2. A's log with the open switch-out resolves the return to switch-in --
const aLog = body(
  logRow('start', '2026-06-25 09:00:00 +00:00'),
  logRow('switch-out:#777', '2026-06-25 09:30:00 +00:00')
);
assert.deepEqual(lastOpenInterruption(aLog), { kind: 'switch-out', peer: '#777' });
assert.equal(
  resolveBindEvent({ hasTimingHistory: true, timingBody: aLog }),
  'switch-in:#777',
  'returning into A must pair the open switch-out:#777 with switch-in:#777'
);

// ---- 3. B's log: a never-seen B binds as start ----------------------------
assert.equal(
  resolveBindEvent({ hasTimingHistory: false, timingBody: body() }),
  'start',
  'a never-seen incoming issue must bind as start, not switch-in'
);

// ---- 4. A round-tripped switch (closed) resolves to a benign resumed ------
const closed = body(
  logRow('start', '2026-06-25 09:00:00 +00:00'),
  logRow('switch-out:#777', '2026-06-25 09:30:00 +00:00'),
  logRow('switch-in:#777', '2026-06-25 10:00:00 +00:00')
);
assert.equal(lastOpenInterruption(closed), null, 'switch-in closes the open switch-out');
assert.equal(
  resolveBindEvent({ hasTimingHistory: true, timingBody: closed }),
  'resumed',
  'history with no open interruption is the benign-tail resumed'
);

console.log('switch-scenario.test.mjs: ok');
