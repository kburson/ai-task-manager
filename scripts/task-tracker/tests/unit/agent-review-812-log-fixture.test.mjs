// @story #821
// #821 vc:7 — AC4 as a committed demonstrable form. Run the full V3
// timing-log-sequence validator against a freshly-finalized #812-shaped log
// (the orphan/pause-finalize output after both fixes) and assert zero
// timing-log-sequence failures attributable to Fault X (unregistered
// `active-work` slug → malformed + cascade doubled-step) or Fault Y (out-of-order
// late flush). This pins AC4 to a fixture so it does not depend on a live gate
// re-run against mutable issue state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRow } from '../../gh-timing-comment.internals.mjs';
import { validate } from '../../lib/agent-review/validators/timing-log-sequence.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-14 ${hms} ${TZ}`;

function row(hms, event, { a = 0, i = 0, desc = '' } = {}) {
  return `| ${ts(hms)} | ${event} |  |  |  | 0 | ${desc} | <!-- row-sec: a=${a} i=${i} -->`;
}

// A #812-shaped session: two develop/test cycles each orphan-finalized with an
// `active-work → idle` credit pair (Fault X surface) and closed by a `resumed`,
// then a review phase. Build the tail through appendRow so the finalize rows
// exercise the real append/clamp path (Fault Y surface) rather than being
// hand-placed in order.
function buildFixtureBody() {
  const ordered = [
    row('12:30:00', 'start', { desc: 'bound' }),
    row('12:31:00', 'develop:started'),
    // orphan-finalize emits the #802 active-work credit then the idle row:
    row('12:58:22', 'active-work', { a: 1642, desc: 'pre-orphan credit' }),
    row('12:58:22', 'idle', { i: 0, desc: 'orphaned' }),
    row('13:05:00', 'resumed', { desc: 'next bind' }),
    row('13:06:00', 'develop:completed'),
    row('13:06:30', 'test:started'),
    row('13:07:45', 'review:started'), // a later phase row lands first (the Fault Y trigger)
  ];
  let body = ['## ⏱ Timing Log', '', HEADER, SEP, ''].join('\n').concat('\n');
  for (const r of ordered) body = appendRow(body, r);
  return body;
}

const ENTERED = {
  enteredStages: [{ stage: 'develop' }, { stage: 'test' }, { stage: 'review' }],
};

test('a freshly-finalized #812-shaped log has zero malformed failures (Fault X gone)', () => {
  const res = validate({ comments: [{ body: buildFixtureBody() }], markers: ENTERED });
  assert.ok(!res.failures.some((f) => /malformed/.test(f)), JSON.stringify(res.failures));
});

test('a freshly-finalized #812-shaped log has zero doubled-step failures (Fault X cascade gone)', () => {
  const res = validate({ comments: [{ body: buildFixtureBody() }], markers: ENTERED });
  assert.ok(!res.failures.some((f) => /doubled step/.test(f)), JSON.stringify(res.failures));
});

test('a freshly-finalized #812-shaped log has zero out-of-order failures (Fault Y gone)', () => {
  const res = validate({ comments: [{ body: buildFixtureBody() }], markers: ENTERED });
  assert.ok(!res.failures.some((f) => /out-of-order/.test(f)), JSON.stringify(res.failures));
});

test('no timing-log-sequence failure is attributable to Fault X or Fault Y', () => {
  const res = validate({ comments: [{ body: buildFixtureBody() }], markers: ENTERED });
  const xy = res.failures.filter(
    (f) => /malformed/.test(f) || /doubled step/.test(f) || /out-of-order/.test(f)
  );
  assert.deepEqual(xy, [], `X/Y-attributable failures remain: ${JSON.stringify(xy)}`);
});
