// @story #821
// #821 vc:5 — the `active-work` finalize slug is a registered, canonical phase
// event, so a real orphan-finalize `active-work → idle` pair walks legally
// through the V3 timing-log-sequence validator with zero malformed / doubled-step
// failures. Guards Fault X: `active-work` (emitted by orphan-finalize.mjs's #802
// active-work credit) was never added to the event vocabulary, so V3 rejected it
// as an unknown slug and the cascade turned the following `idle` into a phantom
// doubled step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../lib/agent-review/validators/timing-log-sequence.mjs';
import {
  EVENT_CLASS,
  classifyTimingEvent,
  isCanonicalPhaseSlug,
  isDepartureEvent,
  isReengagementEvent,
  opensIdleSpan,
} from '../../lib/timing-event-map.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';

function logCtx(rows, enteredStages = []) {
  const body = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    ...rows.map(([ts, ev, desc = '']) => `| ${ts} | ${ev} |  |  |  | 0 | ${desc} |`),
    '',
    '<sub>auto-logged</sub>',
  ].join('\n');
  return { comments: [{ body }], markers: { enteredStages } };
}

const T = (n) => `2026-07-14 03:${String(n).padStart(2, '0')}:00 -05:00`;
const STAGES = [{ stage: 'develop' }];

// --- Event-map classification (the fix, asserted directly) -------------------

test('active-work is a canonical phase slug (V3 isKnownSlug accepts it)', () => {
  assert.equal(isCanonicalPhaseSlug('active-work'), true);
  assert.equal(isCanonicalPhaseSlug('ACTIVE-WORK'), true, 'case-insensitive');
});

test('active-work classifies as PHASE — not a departure, not a reengagement', () => {
  assert.equal(classifyTimingEvent('active-work'), EVENT_CLASS.PHASE);
  assert.equal(isDepartureEvent('active-work'), false);
  assert.equal(isReengagementEvent('active-work'), false);
  assert.equal(opensIdleSpan('active-work'), false, 'active-work never opens an idle span');
});

// --- Full clean walk through V3 ----------------------------------------------

test('a real active-work → idle → resumed walk passes V3 cleanly', () => {
  const rows = [
    [T(0), 'start', 'bound'],
    [T(1), 'develop:started', 'entered develop'],
    [T(2), 'active-work', 'credit pre-orphan window'],
    [T(3), 'idle', 'orphaned'],
    [T(4), 'resumed', 'next bind'],
    [T(5), 'develop:completed', 'done'],
  ];
  const res = validate(logCtx(rows, STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

// --- Scoped Fault-X guard: no malformed / no doubled-step --------------------

test('an active-work → idle finalize pair yields zero malformed and zero doubled-step', () => {
  // A freshly-orphaned log legitimately ends idle (a trailing skipped-step is
  // expected and out of scope for #821); assert only that Fault X is gone.
  const rows = [
    [T(0), 'start'],
    [T(1), 'develop:started'],
    [T(2), 'active-work'],
    [T(3), 'idle'],
  ];
  const res = validate(logCtx(rows, STAGES));
  assert.ok(
    !res.failures.some((f) => /malformed/.test(f)),
    `unexpected malformed failure: ${JSON.stringify(res.failures)}`
  );
  assert.ok(
    !res.failures.some((f) => /doubled step/.test(f)),
    `unexpected doubled-step failure: ${JSON.stringify(res.failures)}`
  );
});

// --- Negative control: the slug check still bites -----------------------------

test('a genuinely unknown slug is still flagged malformed (check is not blanket-passing)', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'totally-bogus'],
      ],
      STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /malformed/.test(f) && /totally-bogus/.test(f)),
    JSON.stringify(res.failures)
  );
});
