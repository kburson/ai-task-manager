// @story #821
// #821 vc:6 — the shared append path (`appendRow`) clamps a late/deferred
// finalize row's timestamp forward to the current log tail, so a row drained from
// the durable queue can never sort before an already-posted later row. Guards
// Fault Y: on #812 an `idle` finalize row crediting a window ending 12:58:22 was
// appended AFTER a `review:started` row at 13:07:45, corrupting the monotonic
// sequence V3 depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendRow } from '../../gh-timing-comment.internals.mjs';
import { validate } from '../../lib/agent-review/validators/timing-log-sequence.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const TZ = '-05:00';
const ts = (hms) => `2026-07-14 ${hms} ${TZ}`;

// A raw table row string (bypasses buildRow's retroactive-ts guard so the test
// can use fixed historical timestamps). Carries a row-sec marker so we can prove
// the credited seconds survive a ts rewrite byte-for-byte.
function row(hms, event, { a = 0, i = 0, desc = '' } = {}) {
  return `| ${ts(hms)} | ${event} |  |  |  | 0 | ${desc} | <!-- row-sec: a=${a} i=${i} -->`;
}

function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

// Data rows from a table body (skips heading/header/separator/blank lines).
function dataRows(body) {
  return body.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Timestamp'));
}
const rowTsCell = (line) => line.split('|').map((s) => s.trim())[1];

test('a stale finalize row is clamped forward to the log tail, not appended behind it', () => {
  const base = bodyWith([row('13:00:00', 'develop:started'), row('13:07:45', 'review:started')]);
  // The #812 defect: an idle finalize crediting a window ending 12:58:22 arrives
  // after 13:07:45 already landed.
  const stale = row('12:58:22', 'idle', { i: 574, desc: 'late flush' });
  const next = appendRow(base, stale);

  const rows = dataRows(next);
  assert.equal(rows.length, 3);
  const appended = rows[rows.length - 1];
  assert.equal(
    rowTsCell(appended),
    ts('13:07:45'),
    'stale row ts must be clamped forward to the 13:07:45 tail'
  );
  assert.ok(
    appended.includes('<!-- row-sec: a=0 i=574 -->'),
    'credited seconds must be preserved byte-for-byte through the ts rewrite'
  );
});

test('the clamped body is monotonic-by-timestamp — V3 reports no out-of-order', () => {
  let body = bodyWith([row('13:00:00', 'develop:started')]);
  body = appendRow(body, row('13:07:45', 'review:started'));
  body = appendRow(body, row('12:58:22', 'idle', { i: 574 }));

  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }, { stage: 'review' }] },
  };
  const res = validate(ctx);
  assert.ok(
    !res.failures.some((f) => /out-of-order/.test(f)),
    `unexpected out-of-order failure: ${JSON.stringify(res.failures)}`
  );
});

test('an in-order live row is a no-op — its timestamp is left untouched', () => {
  const base = bodyWith([row('13:00:00', 'develop:started')]);
  const live = row('13:09:00', 'develop:completed');
  const next = appendRow(base, live);
  const appended = dataRows(next).pop();
  assert.equal(rowTsCell(appended), ts('13:09:00'), 'a forward-in-time row must not be clamped');
});
