#!/usr/bin/env node
// @story #535
// Switch-into-an-issue-with-history emits `resumed`, not a second `start`.
//
// The canonical ⏱ Timing Log shape is exactly ONE `start` row (the first-ever
// bind) followed by verb / pause / resume transitions. `verbSwitch` historically
// hard-coded `event: 'start'` for the INCOMING issue, so switching back into a
// previously-worked issue wrote a duplicate `start` (observed on #526). The fix
// mirrors `verbResume` (#482): read the incoming issue's timing comment and emit
// `resolveBindEvent({ hasTimingHistory })`.
//
// Asserts:
//   1. Decision: a timing body with a data row → `resumed`; an empty body → `start`.
//   2. Source-wiring: governed bind orchestration imports the discriminators.
//   3. Source-wiring: governed bind orchestration reads the incoming timing comment via
//      `readTimingCommentBody` and feeds `resolveBindEvent` into the incoming row.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBindEvent, timingCommentHasRows } from '../../../lib/bind-event.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(here, '..', '../../..');
const switchPath = path.join(
  repoRoot,
  'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs'
);
const src = readFileSync(switchPath, 'utf8');

// ---- 1. Decision behavior the switch path now depends on -------------------
const bodyWithRow = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
  '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
].join('\n');
assert.equal(timingCommentHasRows(bodyWithRow), true, 'a data row must register as history');
assert.equal(
  resolveBindEvent({ hasTimingHistory: timingCommentHasRows(bodyWithRow) }),
  'resumed',
  'switch into an issue WITH history must resolve to resumed'
);

const emptyBody = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
].join('\n');
assert.equal(timingCommentHasRows(emptyBody), false, 'a header-only table is not history');
assert.equal(
  resolveBindEvent({ hasTimingHistory: timingCommentHasRows(emptyBody) }),
  'start',
  'switch into an issue with NO history must resolve to the first start (no regression)'
);

// ---- 2. governed orchestration imports the bind-event discriminators -------
assert.match(
  src,
  /import\s*\{[^}]*\bresolveBindEvent\b[^}]*\btimingCommentHasRows\b[^}]*\}\s*from\s*['"]\.\.\/bind-event\.mjs['"]/s,
  'governed bind orchestration must import resolveBindEvent + timingCommentHasRows'
);

// ---- 3. orchestration reads incoming timing history + resolves bind event --
assert.match(src, /readTimingCommentBody/, 'governed switch must read incoming timing history');
assert.match(
  src,
  /resolveBindEvent\(\s*\{[^}]*hasTimingHistory[^}]*\}\s*\)/s,
  'governed switch must compute the incoming event from target history'
);

console.log('switch-resumed-on-history.test.mjs: ok');
