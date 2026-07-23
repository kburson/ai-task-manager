// @story #829
// #829 — the V3 `timing-log-sequence` validator's entered-marker reconciliation
// must EXCLUDE `<stage>:failed` gate-audit rows. The Agent Review Gate writes a
// `review:failed` row on a failed review and demotes to Develop WITHOUT stamping
// `aitm-entered-review`, so treating that audit row as a stage-entry claim creates
// a catch-22: a failed-then-retried review can never pass reconciliation again.
// Genuine entry rows (`<stage>:started` / `<stage>:completed`) must STILL require
// their `aitm-entered-<stage>` marker — no regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../../../lib/agent-review/validators/timing-log-sequence.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-14 ${hms} ${TZ}`;

function row(hms, event, desc = '') {
  return `| ${ts(hms)} | ${event} |  |  |  | 0 | ${desc} |`;
}

function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

const reconFailures = (res) => res.failures.filter((f) => /but body has no aitm-entered-/.test(f));

test('a `<stage>:failed` audit row does NOT require an aitm-entered-<stage> marker', () => {
  // A failed review followed by a legitimate re-entry. No aitm-entered-review yet
  // (the gate demoted to develop). The review:failed row must be tolerated.
  const body = bodyWith([
    row('13:00:00', 'develop:started'),
    row('13:09:46', 'review:failed', 'gate rejected'),
    row('13:10:00', 'develop:started', 'demoted back'),
  ]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }] },
  };
  const res = validate(ctx);
  assert.deepEqual(
    reconFailures(res),
    [],
    `review:failed must not trigger reconciliation: ${JSON.stringify(res.failures)}`
  );
});

test('a genuine `<stage>:started` row WITHOUT its marker still fails reconciliation', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started'),
    row('13:20:00', 'review:started', 'entered review for real'),
  ]);
  // Only develop is marked entered; review:started has no aitm-entered-review.
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }] },
  };
  const res = validate(ctx);
  assert.ok(
    reconFailures(res).some((f) => /records stage "review"/.test(f)),
    `review:started without its marker must still fail: ${JSON.stringify(res.failures)}`
  );
});

test('a genuine `<stage>:completed` row WITHOUT its marker still fails reconciliation', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started'),
    row('13:30:00', 'test:completed', 'exited test'),
  ]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }] },
  };
  const res = validate(ctx);
  assert.ok(
    reconFailures(res).some((f) => /records stage "test"/.test(f)),
    `test:completed without its marker must still fail: ${JSON.stringify(res.failures)}`
  );
});

test('a `<stage>:failed` row for a stage that DID get entered is also tolerated', () => {
  const body = bodyWith([row('13:00:00', 'develop:started'), row('13:05:00', 'review:failed')]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }, { stage: 'review' }] },
  };
  const res = validate(ctx);
  assert.deepEqual(reconFailures(res), [], JSON.stringify(res.failures));
});
