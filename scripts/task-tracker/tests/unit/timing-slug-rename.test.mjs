// @story #520
// Verifier for #520 — historical timing-slug rename.
//   AC1 — the rename map rewrites every old Event slug to the #516 vocabulary.
//   AC2 — `approved` disambiguates to `issue:wrap` (done-enter borrow) vs
//          `review:approved` (genuine review approval).
//   AC4 — re-running on an already-migrated log is a no-op (idempotent).
//   AC5 — these tests cover the rename map, the disambiguation, and idempotency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENAME_MAP,
  renameTimingSlug,
  renameTimingLogBody,
} from '../../lib/timing-slug-rename.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
];

function logWith(rows) {
  return ['⏱ Timing Log', '', ...HEADER, ...rows].join('\n');
}

// One data row carrying the given event slug, plus a row-sec marker to prove it
// survives the rewrite untouched.
function row(event, { ts = '2026-01-01 09:00:00 +00:00', desc = 'x', sec = true } = {}) {
  const tail = sec ? ' <!-- row-sec: a=60 i=0 -->' : '';
  return `| ${ts} | ${event} | 1m | | | 100 | ${desc} |${tail}`;
}

test('AC1 — RENAME_MAP rewrites every old slug to the new vocabulary', () => {
  const expected = {
    created: 'backlog:created',
    'refine:start': 'refine:started',
    'refine:done': 'refine:completed',
    'plan:start': 'plan:started',
    'plan:done': 'plan:completed',
    'develop:start': 'develop:started',
    'develop:done': 'develop:completed',
    'test:start': 'test:started',
    'test:done': 'test:passed',
    'review:waiting': 'review:started',
    closed: 'issue:closed',
    pause: 'paused',
  };
  assert.deepEqual({ ...RENAME_MAP }, expected);
  for (const [oldSlug, newSlug] of Object.entries(expected)) {
    assert.equal(renameTimingSlug(oldSlug), newSlug, `${oldSlug} → ${newSlug}`);
  }
});

test('AC1 — renameTimingSlug is case-insensitive and trims', () => {
  assert.equal(renameTimingSlug('  Refine:Start '), 'refine:started');
});

test('AC1 — unknown / already-new slugs pass through unchanged', () => {
  for (const slug of ['start', 'resumed', 'refine:started', 'issue:closed', 'pause:question']) {
    assert.equal(renameTimingSlug(slug), slug);
  }
});

test('AC2 — `approved` followed by a close is the done-enter borrow → issue:wrap', () => {
  assert.equal(renameTimingSlug('approved', { isDoneEnterBorrow: true }), 'issue:wrap');
  const out = renameTimingLogBody(logWith([row('approved'), row('closed')]));
  const events = out.rewrites.map((r) => `${r.from}→${r.to}`);
  assert.deepEqual(events, ['approved→issue:wrap', 'closed→issue:closed']);
});

test('AC2 — `approved` with no following close is a genuine review approval', () => {
  assert.equal(renameTimingSlug('approved', { isDoneEnterBorrow: false }), 'review:approved');
  const out = renameTimingLogBody(logWith([row('refine:start'), row('approved')]));
  const map = Object.fromEntries(out.rewrites.map((r) => [r.from, r.to]));
  assert.equal(map['approved'], 'review:approved');
});

test('AC2 — earlier `approved` claims the borrow; the one before the close wins', () => {
  // Two approvals: only the one whose forward scan reaches a close before the
  // next approval is the borrow. The first approval sees another approval first.
  const out = renameTimingLogBody(logWith([row('approved'), row('approved'), row('closed')]));
  const tos = out.rewrites.filter((r) => r.from === 'approved').map((r) => r.to);
  assert.deepEqual(tos, ['review:approved', 'issue:wrap']);
});

test('row-sec marker, timestamp, and description survive the rewrite', () => {
  const before = row('test:done', { desc: 'develop→test', sec: true });
  const out = renameTimingLogBody(logWith([before]));
  const line = out.body.split('\n').find((l) => l.includes('test:passed'));
  assert.match(line, /<!-- row-sec: a=60 i=0 -->$/);
  assert.match(line, /2026-01-01 09:00:00 \+00:00/);
  assert.match(line, /develop→test/);
  assert.ok(!line.includes('test:done'));
});

test('AC4 — re-running on an already-migrated log is a no-op', () => {
  const original = logWith([
    row('created'),
    row('refine:start'),
    row('refine:done'),
    row('approved'),
    row('closed'),
  ]);
  const first = renameTimingLogBody(original);
  assert.equal(first.changed, true);
  const second = renameTimingLogBody(first.body);
  assert.equal(second.changed, false);
  assert.deepEqual(second.rewrites, []);
  assert.equal(second.body, first.body);
});

test('a log with no timing table is returned untouched', () => {
  const out = renameTimingLogBody('no table here');
  assert.equal(out.changed, false);
  assert.equal(out.body, 'no table here');
});

test('a fully-new-vocabulary log reports changed:false', () => {
  const out = renameTimingLogBody(
    logWith([row('backlog:created'), row('refine:started'), row('issue:wrap'), row('issue:closed')])
  );
  assert.equal(out.changed, false);
});
