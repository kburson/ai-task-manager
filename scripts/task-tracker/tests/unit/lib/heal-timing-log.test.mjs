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
import { healTimingLog, countRetiredRows } from '../../../lib/heal-timing-log.mjs';

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

// ---- Guard: non-string input returned unchanged ----------------------------

test('non-string input is returned unchanged', () => {
  assert.equal(healTimingLog(null), null);
  assert.equal(healTimingLog(undefined), undefined);
});
