// @story #827
// EPIC #823 timing model v2 (C4) — historical timing-log heal.
//
// `healTimingLog(body)` is a pure, idempotent transform that upgrades a v1 log
// to v2 grammar: (1) strip every `idle`/`active-work` row, (2) recompute each
// `<phase>:completed` row's active/idle from its phase span minus pause/
// switch-out→resume brackets (via C2's `computePhaseCloseDelta`), (3) fold the
// stripped rows' Δ Words into the enclosing `:completed` row (lossless). These
// tests pin all five #827 ACs against a synthetic legacy log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  healTimingLog,
  countRetiredRows,
  countZeroValueStopResumePairs,
  countRedundantReviewPassRows,
  countPostTerminalRows,
} from '../../../lib/heal-timing-log.mjs';

const HEADER =
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |';
const SEP = '| --- | --- | --- | --- | --- | --- | --- | --- |';

// A legacy (v1) log for one issue: a refine span interrupted by a
// switch-out→resume bracket, and a develop span padded with two `active-work`
// credit rows and one `idle` row — exactly the shapes C1 retired.
const REFINE_STARTED =
  '| 2026-07-14 03:00:00 -05:00 | refine:started |  |  |  | 83,000 | start refinement | <!-- row-sec: a=0 i=0 -->';
const SWITCH_OUT =
  '| 2026-07-14 03:52:01 -05:00 | switch-out:#814 |  |  |  | 83,010 | switched out | 69 | <!-- row-sec: a=20 i=0 -->';
const RESUMED =
  '| 2026-07-14 18:30:24 -05:00 | resumed |  |  |  | 83,340 | resumed | <!-- row-sec: a=0 i=0 -->';
const REFINE_COMPLETED =
  '| 2026-07-14 18:35:25 -05:00 | refine:completed | 0h 05m 01s |  |  | 83,355 | refinement completed | <!-- row-sec: a=301 i=0 -->';
const DEVELOP_STARTED =
  '| 2026-07-14 18:42:05 -05:00 | develop:started |  |  |  | 83,355 | start development | <!-- row-sec: a=0 i=0 -->';
const ACTIVE_WORK_1 =
  '| 2026-07-14 18:47:00 -05:00 | active-work | 0h 04m 55s |  | 10 | 83,365 | working | <!-- row-sec: a=295 i=0 -->';
const ACTIVE_WORK_2 =
  '| 2026-07-14 18:55:00 -05:00 | active-work | 0h 08m 00s |  | 5 | 83,370 | working | <!-- row-sec: a=480 i=0 -->';
const IDLE_ROW =
  '| 2026-07-14 19:10:00 -05:00 | idle |  | 0h 15m 00s |  | 83,370 | idle | <!-- row-sec: a=0 i=900 -->';
const DEVELOP_COMPLETED =
  '| 2026-07-14 21:20:57 -05:00 | develop:completed | 0h 13m 52s |  |  | 83,375 | development complete | <!-- row-sec: a=832 i=0 -->';

function legacyBody() {
  return [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    REFINE_STARTED,
    SWITCH_OUT,
    RESUMED,
    REFINE_COMPLETED,
    DEVELOP_STARTED,
    ACTIVE_WORK_1,
    ACTIVE_WORK_2,
    IDLE_ROW,
    DEVELOP_COMPLETED,
    '',
  ].join('\n');
}

const rowsOf = (body) => body.split('\n').filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
const findRow = (body, slug) => rowsOf(body).find((l) => l.split('|')[2].trim() === slug);

// ---- AC1: strip every idle / active-work row -------------------------------

test('AC1 — heal removes every idle and active-work row', () => {
  const healed = healTimingLog(legacyBody());
  assert.equal(countRetiredRows(legacyBody()), 3, 'fixture has 3 retired rows');
  assert.equal(countRetiredRows(healed), 0, 'healed log has none');
  assert.ok(!/\|\s*active-work\s*\|/.test(healed));
  assert.ok(!/\|\s*idle\s*\|/.test(healed));
});

// ---- AC2: recompute a completed row's active from span (bracket-free) -------

test('AC2 — develop:completed active == full span (idle reclassified away)', () => {
  const healed = healTimingLog(legacyBody());
  const row = findRow(healed, 'develop:completed');
  // 18:42:05 → 21:20:57 = 9532s; the legacy `idle` row inside the span is now
  // neutral (active), so idle collapses to 0.
  assert.match(row, /\|\s*2h 38m 52s\s*\|\s*\|/, 'active cell recomputed, idle blank');
  assert.match(row, /<!--\s*row-sec: a=9532 i=0\s*-->$/, 'marker recomputed');
});

// ---- AC3: recompute active AND idle across a switch-out bracket -------------

test('AC3 — refine:completed splits span into active + bracket idle', () => {
  const healed = healTimingLog(legacyBody());
  const row = findRow(healed, 'refine:completed');
  // active = (03:00:00→03:52:01) + (18:30:24→18:35:25) = 3121 + 301 = 3422s.
  // idle = switch-out→resumed = 03:52:01→18:30:24 = 52703s.
  assert.match(row, /\|\s*0h 57m 02s\s*\|\s*14h 38m 23s\s*\|/, 'active + idle cells');
  assert.match(row, /<!--\s*row-sec: a=3422 i=52703\s*-->$/);
});

// ---- AC4: fold stripped rows' Δ Words into the enclosing :completed ---------

test('AC4 — stripped active-work Δ Words fold into develop:completed', () => {
  const healed = healTimingLog(legacyBody());
  const row = findRow(healed, 'develop:completed');
  // 10 + 5 from the two stripped active-work rows fold into the (blank=0)
  // completed row → 15.
  const dwords = row.split('|')[5].trim();
  assert.equal(dwords, '15', 'Δ Words cell absorbs the stripped increments');
});

// ---- AC5: idempotent, byte-identical re-run --------------------------------

test('AC5 — healing is idempotent (heal twice == heal once)', () => {
  const once = healTimingLog(legacyBody());
  const twice = healTimingLog(once);
  assert.equal(twice, once, 'second heal is a byte-for-byte no-op');
});

// ---- Preservation: non-completion rows pass through verbatim ----------------

test('non-completion rows (started / switch-out / resumed) are untouched', () => {
  const healed = healTimingLog(legacyBody());
  assert.ok(healed.includes(REFINE_STARTED), 'refine:started verbatim');
  assert.ok(healed.includes(SWITCH_OUT), 'switch-out (with Δ Words full column) verbatim');
  assert.ok(healed.includes(RESUMED), 'resumed verbatim');
  assert.ok(healed.includes(DEVELOP_STARTED), 'develop:started verbatim');
  assert.ok(healed.startsWith('## ⏱ Timing Log\n'), 'preamble + header preserved');
});

// ---- Guard: a native v2 log heals to itself (no-op) -------------------------

test('a log with no retired rows and correct completions is unchanged', () => {
  const once = healTimingLog(legacyBody());
  assert.equal(healTimingLog(once), once);
  assert.equal(countRetiredRows(once), 0);
});

// ---- C6 (#830): strip the bare `review` / `review-ready` cruft rows ---------
//
// A legacy review span carries two pre-v2 scaffolding rows the review verb used
// to emit — a bare `review` ("agent session — starting review", holding the
// agent-session Δ Words) and a `review-ready` state-move row. C6 stops emitting
// both; the heal strips them from history and folds their Δ Words forward onto
// the enclosing `review:approved` completion, exactly like the retired slugs.

const REVIEW_STARTED =
  '| 2026-07-14 22:00:00 -05:00 | review:started |  |  |  | 90,000 | entering review | <!-- row-sec: a=0 i=0 -->';
const BARE_REVIEW =
  '| 2026-07-14 22:00:05 -05:00 | review | 0h 30m 00s |  | 40 | 90,040 | agent session — starting review | <!-- row-sec: a=1800 i=0 -->';
const REVIEW_READY =
  '| 2026-07-14 22:00:06 -05:00 | review-ready |  |  |  | 90,040 | task is now in Review | <!-- row-sec: a=0 i=0 -->';
const REVIEW_APPROVED =
  '| 2026-07-14 22:30:00 -05:00 | review:approved | 0h 30m 00s |  |  | 90,050 | approved | <!-- row-sec: a=1800 i=0 -->';

function reviewCruftBody() {
  return [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    REVIEW_STARTED,
    BARE_REVIEW,
    REVIEW_READY,
    REVIEW_APPROVED,
    '',
  ].join('\n');
}

test('C6 — heal removes the bare `review` and `review-ready` rows', () => {
  const healed = healTimingLog(reviewCruftBody());
  const slugs = rowsOf(healed).map((l) => l.split('|')[2].trim());
  assert.ok(!slugs.includes('review'), 'bare `review` row stripped');
  assert.ok(!slugs.includes('review-ready'), '`review-ready` row stripped');
  assert.deepEqual(slugs, ['review:started', 'review:approved'], 'only canonical rows survive');
});

test('C6 — the stripped review-cruft Δ Words fold into review:approved', () => {
  const healed = healTimingLog(reviewCruftBody());
  const row = findRow(healed, 'review:approved');
  // Bare `review` carried 40 words; review-ready carried 0. Both fold onto the
  // (blank=0) review:approved Δ Words cell → 40. No word signal is lost.
  assert.equal(row.split('|')[5].trim(), '40', 'review:approved absorbs the folded words');
  // Span recompute: review:started 22:00:00 → review:approved 22:30:00 = 1800s,
  // no departure bracket → active 0h 30m 00s, idle blank.
  assert.match(row, /\|\s*0h 30m 00s\s*\|\s*\|/, 'active recomputed from span, idle blank');
});

test('C6 — review-cruft heal is idempotent', () => {
  const once = healTimingLog(reviewCruftBody());
  assert.equal(healTimingLog(once), once, 'second heal is a byte-for-byte no-op');
});

// ---- [#996] f3a09cc — bare `develop` reject self-audit row requalified -----

const REVIEW_APPROVED_931 =
  '| 2026-07-26 12:26:04 -05:00 | review:approved | 0h 13m 20s |  |  | 78,389 | story approved | <!-- row-sec: a=800 i=0 -->';
const DEVELOP_STARTED_931 =
  '| 2026-07-26 12:26:04 -05:00 | develop:started |  |  |  | 78,389 | start development | <!-- row-sec: a=0 i=0 -->';
const BARE_REJECT_DEVELOP =
  '| 2026-07-26 12:26:18 -05:00 | develop |  |  |  | 78,389 | review rejected: Agent Review Gate objections fixed (body | <!-- row-sec: a=0 i=0 -->';
const DEVELOP_COMPLETED_931 =
  '| 2026-07-26 12:35:43 -05:00 | develop:completed | 0h 09m 39s |  |  | 78,455 | development complete | <!-- row-sec: a=579 i=0 -->';

function bareRejectDevelopBody() {
  return [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    REVIEW_APPROVED_931,
    DEVELOP_STARTED_931,
    BARE_REJECT_DEVELOP,
    DEVELOP_COMPLETED_931,
    '',
  ].join('\n');
}

test('pre-f3a09cc bare `develop` reject row is requalified to `rejected:develop`', () => {
  const healed = healTimingLog(bareRejectDevelopBody());
  const slugs = rowsOf(healed).map((l) => l.split('|')[2].trim());
  assert.deepEqual(
    slugs,
    ['review:approved', 'develop:started', 'rejected:develop', 'develop:completed'],
    'only the bare develop row changes slug; started/completed are untouched'
  );
});

test('bare `develop` reject requalify preserves every other cell byte-for-byte', () => {
  const healed = healTimingLog(bareRejectDevelopBody());
  const row = findRow(healed, 'rejected:develop');
  assert.equal(
    row,
    BARE_REJECT_DEVELOP.replace('| develop |', '| rejected:develop |'),
    'only the event cell changes'
  );
});

test('a real `develop:started`/`develop:completed` pair is never requalified', () => {
  const healed = healTimingLog(bareRejectDevelopBody());
  const slugs = rowsOf(healed).map((l) => l.split('|')[2].trim());
  assert.ok(slugs.includes('develop:started'));
  assert.ok(slugs.includes('develop:completed'));
});

test('bare-reject-develop requalify is idempotent', () => {
  const once = healTimingLog(bareRejectDevelopBody());
  assert.equal(healTimingLog(once), once, 'second heal is a byte-for-byte no-op');
});

// ---- Guard: non-string input returned unchanged ----------------------------

test('non-string input is returned unchanged', () => {
  assert.equal(healTimingLog(null), null);
  assert.equal(healTimingLog(undefined), undefined);
});

// ---- #1093 — conservative valueless timing-noise healing ------------------

function noiseRow({
  ts,
  event,
  active = '',
  idle = '',
  deltaWords = '',
  wordMarker = '100',
  description = event,
  rowActive = 0,
  rowIdle = 0,
  deltaWordsFull,
} = {}) {
  const fullCell = deltaWordsFull === undefined ? '' : ` ${deltaWordsFull} |`;
  return `| ${ts} | ${event} | ${active} | ${idle} | ${deltaWords} | ${wordMarker} | ${description} |${fullCell} <!-- row-sec: a=${rowActive} i=${rowIdle} -->`;
}

function noiseBody(...rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n');
}

function eventRows(body, event) {
  return rowsOf(body).filter((line) => line.split('|')[2].trim() === event);
}

// @story #1134
test('post-terminal healing reproduces #1127 and preserves the authoritative prefix', () => {
  const prefix = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'start', wordMarker: '103000' }),
    noiseRow({
      ts: '2026-08-01 10:10:00 -05:00',
      event: 'review:approved',
      wordMarker: '103183',
    }),
    noiseRow({
      ts: '2026-08-01 10:10:01 -05:00',
      event: 'issue:wrap',
      wordMarker: '103183',
    }),
    noiseRow({
      ts: '2026-08-01 10:10:02 -05:00',
      event: 'issue:closed',
      wordMarker: '103183',
    }),
  ].join('\n');
  const malformed = 'Malformed timing artifact mentioning issue:closed is preserved.';
  const prose = 'Operator note after the historical timing table.';
  const body = [
    prefix,
    malformed,
    noiseRow({ ts: '2026-08-01 10:11:00 -05:00', event: 'resumed', wordMarker: '103183' }),
    noiseRow({
      ts: '2026-08-01 10:12:00 -05:00',
      event: 'review:approved',
      wordMarker: '103183',
    }),
    noiseRow({
      ts: '2026-08-01 10:12:01 -05:00',
      event: 'issue:wrap',
      wordMarker: '103183',
    }),
    noiseRow({
      ts: '2026-08-01 10:12:02 -05:00',
      event: 'issue:closed',
      wordMarker: '103183',
    }),
    noiseRow({
      ts: '2026-08-01 10:13:00 -05:00',
      event: 'switch-out:#1129',
      wordMarker: '103183',
    }),
    prose,
    '',
  ].join('\n');

  assert.equal(countPostTerminalRows(body), 5);
  const healed = healTimingLog(body);
  assert.equal(countPostTerminalRows(healed), 0);
  assert.equal(healed, [prefix, malformed, prose, ''].join('\n'));
  assert.equal(healTimingLog(healed), healed, 'the second pass is byte-identical');
});

test('zero-value adjacent stop/resume pairs heal at the 0-second and 59-second boundaries', () => {
  const body = noiseBody(
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'stop' }),
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'resumed' }),
    noiseRow({ ts: '2026-08-01 11:00:00 -05:00', event: 'stop' }),
    noiseRow({ ts: '2026-08-01 11:00:59 -05:00', event: 'resumed' })
  );

  assert.equal(countZeroValueStopResumePairs(body), 2);
  const healed = healTimingLog(body);
  assert.equal(eventRows(healed, 'stop').length, 0);
  assert.equal(eventRows(healed, 'resumed').length, 0);
  assert.equal(countZeroValueStopResumePairs(healed), 0);
});

test('stop/resume healing preserves every conservative guard', async (t) => {
  const baseStop = { ts: '2026-08-01 10:00:00 -05:00', event: 'stop' };
  const baseResume = { ts: '2026-08-01 10:00:05 -05:00', event: 'resumed' };
  const cases = [
    ['active cell carries value', { ...baseStop, active: '0h 00m 01s' }, baseResume],
    ['idle cell carries value', { ...baseStop, idle: '0h 00m 01s' }, baseResume],
    ['active cell uses non-canonical zero', { ...baseStop, active: '0' }, baseResume],
    ['idle cell uses non-canonical zero', { ...baseStop, idle: '0' }, baseResume],
    ['row-sec active carries value', { ...baseStop, rowActive: 1 }, baseResume],
    ['row-sec idle carries value', baseStop, { ...baseResume, rowIdle: 1 }],
    ['word delta carries value', { ...baseStop, deltaWords: '1' }, baseResume],
    ['word delta is unknown', { ...baseStop, deltaWords: '—' }, baseResume],
    ['full word delta carries value', { ...baseStop, deltaWordsFull: '1' }, baseResume],
    ['full word delta is unknown', { ...baseStop, deltaWordsFull: '—' }, baseResume],
    ['word marker is absent', { ...baseStop, wordMarker: '' }, { ...baseResume, wordMarker: '' }],
    [
      'word marker is invalid',
      { ...baseStop, wordMarker: 'unknown' },
      { ...baseResume, wordMarker: 'unknown' },
    ],
    ['word marker changes', baseStop, { ...baseResume, wordMarker: '101' }],
    ['event spelling is non-canonical', { ...baseStop, event: 'Stop' }, baseResume],
    [
      'timestamp is invalid',
      { ...baseStop, ts: '2026-02-30 10:00:00 -05:00' },
      { ...baseResume, ts: '2026-02-30 10:00:05 -05:00' },
    ],
    [
      'timestamps are reversed',
      { ...baseStop, ts: '2026-08-01 10:00:05 -05:00' },
      { ...baseResume, ts: '2026-08-01 10:00:00 -05:00' },
    ],
    ['gap is 60 seconds', baseStop, { ...baseResume, ts: '2026-08-01 10:01:00 -05:00' }],
  ];

  for (const [name, stop, resumed] of cases) {
    await t.test(name, () => {
      const body = noiseBody(noiseRow(stop), noiseRow(resumed));
      assert.equal(countZeroValueStopResumePairs(body), 0);
      assert.equal(healTimingLog(body), body);
    });
  }

  await t.test('rows are not adjacent', () => {
    const body = noiseBody(
      noiseRow(baseStop),
      noiseRow({ ts: '2026-08-01 10:00:03 -05:00', event: 'update' }),
      noiseRow(baseResume)
    );
    assert.equal(countZeroValueStopResumePairs(body), 0);
    assert.equal(healTimingLog(body), body);
  });

  await t.test('row-sec marker is absent', () => {
    const withoutMarker = (row) => noiseRow(row).replace(/\s*<!-- row-sec:[^>]+-->$/, '');
    const body = noiseBody(withoutMarker(baseStop), withoutMarker(baseResume));
    assert.equal(countZeroValueStopResumePairs(body), 0);
    assert.equal(healTimingLog(body), body);
  });

  await t.test('row-sec marker is malformed', () => {
    const malformedMarker = (row) =>
      noiseRow(row).replace('<!-- row-sec: a=0 i=0 -->', '<!-- row-sec: unknown -->');
    const body = noiseBody(malformedMarker(baseStop), malformedMarker(baseResume));
    assert.equal(countZeroValueStopResumePairs(body), 0);
    assert.equal(healTimingLog(body), body);
  });
});

test('removed stop/resume brackets feed the existing phase-duration recomputation', () => {
  const body = noiseBody(
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'develop:started' }),
    noiseRow({ ts: '2026-08-01 10:05:00 -05:00', event: 'stop' }),
    noiseRow({ ts: '2026-08-01 10:05:05 -05:00', event: 'resumed' }),
    noiseRow({
      ts: '2026-08-01 10:10:00 -05:00',
      event: 'develop:completed',
      active: '0h 09m 55s',
      idle: '0h 00m 05s',
      rowActive: 595,
      rowIdle: 5,
    })
  );

  const healed = healTimingLog(body);
  const completed = findRow(healed, 'develop:completed');
  assert.equal(eventRows(healed, 'stop').length, 0);
  assert.equal(eventRows(healed, 'resumed').length, 0);
  assert.match(completed, /\|\s*0h 10m 00s\s*\|\s*\|/);
  assert.match(completed, /<!--\s*row-sec: a=600 i=0\s*-->$/);
});

test('review pass healing preserves the first outcome in each reset sequence', () => {
  const approved = noiseRow({
    ts: '2026-08-01 10:11:00 -05:00',
    event: 'review:approved',
    active: '0h 00m 10s',
    rowActive: 10,
  });
  const body = noiseBody(
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'review:started' }),
    noiseRow({ ts: '2026-08-01 10:01:00 -05:00', event: 'review:passed', description: 'pass one' }),
    noiseRow({
      ts: '2026-08-01 10:02:00 -05:00',
      event: 'review:passed',
      description: 'duplicate one',
    }),
    noiseRow({ ts: '2026-08-01 10:03:00 -05:00', event: 'review:failed' }),
    noiseRow({
      ts: '2026-08-01 10:04:00 -05:00',
      event: 'review:passed',
      description: 'pass after failure',
    }),
    noiseRow({
      ts: '2026-08-01 10:05:00 -05:00',
      event: 'review:passed',
      description: 'duplicate two',
    }),
    noiseRow({ ts: '2026-08-01 10:06:00 -05:00', event: 'demoted:develop' }),
    noiseRow({
      ts: '2026-08-01 10:07:00 -05:00',
      event: 'review:passed',
      description: 'outside visit',
    }),
    noiseRow({ ts: '2026-08-01 10:08:00 -05:00', event: 'review:started' }),
    noiseRow({
      ts: '2026-08-01 10:09:00 -05:00',
      event: 'review:passed',
      description: 'new visit pass',
    }),
    noiseRow({
      ts: '2026-08-01 10:10:00 -05:00',
      event: 'review:passed',
      description: 'duplicate three',
    }),
    approved,
    noiseRow({
      ts: '2026-08-01 10:12:00 -05:00',
      event: 'review:passed',
      description: 'after approval',
    })
  );

  assert.equal(countRedundantReviewPassRows(body), 3);
  const healed = healTimingLog(body);
  assert.equal(countRedundantReviewPassRows(healed), 0);
  assert.deepEqual(
    eventRows(healed, 'review:passed').map((line) => line.split('|')[7].trim()),
    ['pass one', 'pass after failure', 'outside visit', 'new visit pass', 'after approval']
  );
  assert.match(healed, /\| review:failed \|/);
  assert.match(healed, /\| demoted:develop \|/);
  assert.match(healed, /\| review:approved \|/);
  assert.ok(healed.includes(approved), 'zero-value duplicate passes do not alter phase totals');
  assert.equal(healTimingLog(healed), healed, 'review-only heal is byte-identical on rerun');
});

test('review pass healing preserves repeated outcomes whose zero value is unproven', async (t) => {
  const started = noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'review:started' });
  const first = noiseRow({
    ts: '2026-08-01 10:01:00 -05:00',
    event: 'review:passed',
    description: 'first pass',
  });
  const baseDuplicate = {
    ts: '2026-08-01 10:02:00 -05:00',
    event: 'review:passed',
    description: 'repeated pass',
  };
  const cases = [
    ['active value', noiseRow({ ...baseDuplicate, active: '0h 00m 01s', rowActive: 1 })],
    ['idle value', noiseRow({ ...baseDuplicate, idle: '0h 00m 01s', rowIdle: 1 })],
    ['non-canonical active zero', noiseRow({ ...baseDuplicate, active: '0' })],
    ['non-canonical idle zero', noiseRow({ ...baseDuplicate, idle: '0' })],
    ['impossible timestamp', noiseRow({ ...baseDuplicate, ts: '2026-02-30 10:02:00 -05:00' })],
    ['word delta', noiseRow({ ...baseDuplicate, deltaWords: '1' })],
    ['full word delta', noiseRow({ ...baseDuplicate, deltaWordsFull: '1' })],
    ['changed word marker', noiseRow({ ...baseDuplicate, wordMarker: '101' })],
    ['missing row-sec marker', noiseRow(baseDuplicate).replace(/\s*<!-- row-sec:[^>]+-->$/, '')],
    [
      'malformed row-sec marker',
      noiseRow(baseDuplicate).replace('<!-- row-sec: a=0 i=0 -->', '<!-- row-sec: unknown -->'),
    ],
  ];

  for (const [name, duplicate] of cases) {
    await t.test(name, () => {
      const body = noiseBody(started, first, duplicate);
      assert.equal(countRedundantReviewPassRows(body), 0);
      assert.equal(healTimingLog(body), body);
    });
  }
});

test('malformed review boundaries break deletion eligibility until a valid restart', async (t) => {
  for (const event of ['review:started', 'review:failed', 'review:approved', 'update']) {
    await t.test(event, () => {
      const body = noiseBody(
        noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'review:started' }),
        noiseRow({ ts: '2026-08-01 10:01:00 -05:00', event: 'review:passed' }),
        noiseRow({ ts: '2026-02-30 10:02:00 -05:00', event }),
        noiseRow({
          ts: '2026-08-01 10:03:00 -05:00',
          event: 'review:passed',
          description: 'must remain',
        })
      );
      assert.equal(countRedundantReviewPassRows(body), 0);
      assert.equal(healTimingLog(body), body);
    });
  }
});

test('mixed valueless-noise healing is byte-identical on a second pass', () => {
  const body = noiseBody(
    noiseRow({ ts: '2026-08-01 10:00:00 -05:00', event: 'review:started' }),
    noiseRow({ ts: '2026-08-01 10:01:00 -05:00', event: 'review:passed' }),
    noiseRow({ ts: '2026-08-01 10:02:00 -05:00', event: 'review:passed' }),
    noiseRow({ ts: '2026-08-01 10:03:00 -05:00', event: 'stop' }),
    noiseRow({ ts: '2026-08-01 10:03:05 -05:00', event: 'resumed' })
  );
  const once = healTimingLog(body);
  assert.equal(healTimingLog(once), once);
});
