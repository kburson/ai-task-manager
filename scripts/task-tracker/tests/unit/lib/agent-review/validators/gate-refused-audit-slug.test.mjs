// @story #843
// #843 — the V3 `timing-log-sequence` validator must accept `gate-refused` audit
// rows. `gate-refused` is current audit vocabulary emitted on every gate refusal
// by `verbs/review.mjs` (completeness-refusal / review-entry) and
// `lib/move-state/guard-execution.mjs` (body-gates-entry). It records real
// orchestration work — an attempted, refused transition — never a departure or a
// stage move. Before the fix, `gate-refused` was absent from `AUDIT_PHASE_SLUGS`,
// so `isCanonicalPhaseSlug('gate-refused')` was false, V3's `isKnownSlug`
// rejected the row as `malformed — unknown event slug`, and any issue whose ⏱
// Timing Log carried a gate refusal permanently failed the Agent Review Gate.
//
// The fix adds `'gate-refused'` to the canonical timing-event catalog.
// Because `gate-refused` is not a kanban ladder
// rung, `stageOf('gate-refused')` still returns null and the entered-marker
// reconciliation walk is unaffected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  stageOf,
} from '../../../../../lib/agent-review/validators/timing-log-sequence.mjs';
import { isCanonicalPhaseEvent as isCanonicalPhaseSlug } from '../../../../../lib/timing-events/index.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-16 ${hms} ${TZ}`;

function row(hms, event, desc = '') {
  return `| ${ts(hms)} | ${event} |  |  |  | 0 | ${desc} |`;
}

function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

const unknownSlugFailures = (res) => res.failures.filter((f) => /unknown event slug/.test(f));

test("isCanonicalPhaseSlug('gate-refused') returns true", () => {
  assert.equal(isCanonicalPhaseSlug('gate-refused'), true);
});

test('V3 raises no "unknown event slug" objection for a gate-refused row', () => {
  const body = bodyWith([
    row('13:00:00', 'develop:started'),
    row('13:05:00', 'gate-refused', 'review gate refused entry'),
    row('13:06:00', 'develop:started', 'still in develop'),
  ]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }] },
  };
  const res = validate(ctx);
  assert.deepEqual(
    unknownSlugFailures(res),
    [],
    `gate-refused must not be flagged unknown: ${JSON.stringify(res.failures)}`
  );
});

test("stageOf('gate-refused') returns null — the row does not move the kanban walk", () => {
  assert.equal(stageOf('gate-refused'), null);
});
