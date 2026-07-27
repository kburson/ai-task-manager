// @story #1002
// #1002 — the V3 `timing-log-sequence` validator's `isKnownSlug` must recognize
// the `update` event slug emitted by the legitimate `/task update <description>`
// checkpoint verb (`verbs/update.mjs`'s `verbUpdate`). Discovered on #1001's own
// timing log: a bare `update` row failed Agent Review with `malformed — unknown
// event slug "update"` even though the row is real, intentional, non-ladder audit
// vocabulary — the same class of gap #843 fixed for `gate-refused`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCanonicalPhaseSlug } from '../../../../../lib/timing-event-map.mjs';
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

const malformedFailures = (res) =>
  res.failures.filter((f) => /malformed — unknown event slug/.test(f));

test('isCanonicalPhaseSlug("update") is true', () => {
  assert.equal(isCanonicalPhaseSlug('update'), true);
});

test('a bare `update` checkpoint row does not fail timing-log-sequence as malformed', () => {
  const body = bodyWith([
    row('13:00:00', 'refine:started'),
    row('13:05:00', 'update', '1001 --size XS --estimate 1'),
    row('13:10:00', 'refine:completed'),
  ]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'refine' }] },
  };
  const res = validate(ctx);
  assert.deepEqual(
    malformedFailures(res),
    [],
    `update must not be flagged malformed: ${JSON.stringify(res.failures)}`
  );
});
