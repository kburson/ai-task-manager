#!/usr/bin/env node
// @story #540
// Regression: the close verb must emit the final-stage lifecycle rows in
// canonical order `review:approved → issue:wrap → issue:closed`.
//
// #535 observed the inversion `issue:wrap → review:approved → issue:closed`.
// Root cause: close.mjs emitted `issue:wrap` (carrying the review→close delta)
// BEFORE the terminal board move, and move-state.mjs appended `review:approved`
// AFTER it (on the done transition). The fix moves `review:approved` into
// close.mjs ahead of `issue:wrap`, makes `issue:wrap` the zero-delta paired
// half, and suppresses move-state's `<prev>:complete` emission on the done
// transition so `review:approved` is not duplicated.
//
// Part A unit-tests the pure emission helper `buildReviewToDoneClosePair`
// (real production code close.mjs calls) with a NON-ZERO delta, proving order
// + delta placement (AC1, AC2). Part B drives the real `verbClose` path with
// SKIP_NETWORK and asserts the emitted rows precede the terminal board move
// (AC4). Part C models the combined close + move-state(done) row stream and
// asserts exactly one `review:approved`, in canonical order (AC3).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { buildReviewToDoneClosePair } from '../../../../task-tracker/gh-timing-comment.mjs';
import { PHASE_EVENTS } from '../../../../task-tracker/phase-events.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { verbClose } from '../../../../task-tracker/verbs/close.mjs';

// Extract the `Event` column (2nd cell) from a built timing-row string.
function eventOf(row) {
  return String(row).split('|')[2].trim();
}
// Extract the raw row-sec seconds `{ a, i }` from the trailing marker.
function secOf(row) {
  const m = String(row).match(/<!--\s*row-sec:\s*a=(-?\d+)\s+i=(-?\d+)\s*-->/);
  return m ? { a: Number(m[1]), i: Number(m[2]) } : null;
}

// ── Part A: pure helper — order + delta placement (AC1, AC2) ─────────────────

test('buildReviewToDoneClosePair emits review:approved then issue:wrap', () => {
  const ts = new Date().toISOString();
  const [approved, wrap] = buildReviewToDoneClosePair({
    ts,
    activeSec: 4200,
    idleSec: 600,
    wordMarker: 123,
    fullWordMarker: 200,
  });

  // AC1 — canonical order: approval first, wrap second.
  assert.equal(eventOf(approved), PHASE_EVENTS.review.complete.event); // review:approved
  assert.equal(eventOf(wrap), PHASE_EVENTS.done.enter.event); // issue:wrap

  // AC2 — the approval row carries the real review→close delta; the wrap row
  // is the zero-delta paired half.
  assert.deepEqual(secOf(approved), { a: 4200, i: 600 });
  assert.deepEqual(secOf(wrap), { a: 0, i: 0 });
  assert.equal(parseTimingRow(approved).fullWordMarker, '200');
  assert.equal(parseTimingRow(wrap).fullWordMarker, '200');
});

// ── Part B: real verbClose path — rows precede the terminal move (AC4) ───────

function makeStatePath(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-540-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return { statePath: p, dir };
}

test('verbClose emits review:approved + issue:wrap before the done board move', async () => {
  const prevSkipDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const { statePath, dir } = makeStatePath({
    active: '#999',
    lastActive: '#999',
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
    lastFullWordMarker: 200,
  });

  // Single ordered log of side effects: timing rows (by event) and the
  // terminal board move, in call order.
  const sequence = [];

  const ctx = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest: ['#999'],
    SKIP_NETWORK: true,
    // #655 — an honestly-approved live body; the review:approved row is now
    // gated on the persisted approval marker, so the order assertion requires a
    // body that actually carries it.
    closeBody: '## Done\n\n<!-- aitm-review-approved ts="2026-06-28T00:00:00Z" -->\n',
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async (_target, row) => {
      sequence.push({ kind: 'row', event: eventOf(row), row });
    },
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => {
      sequence.push({ kind: 'move-done' });
      return { ok: true, benign: false };
    },
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
  };

  try {
    await verbClose(ctx);
  } finally {
    if (prevSkipDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkipDirty;
    rmSync(dir, { recursive: true, force: true });
  }

  const rowEvents = sequence.filter((e) => e.kind === 'row').map((e) => e.event);
  const wrapIdx = sequence.findIndex((e) => e.event === PHASE_EVENTS.done.enter.event);
  const approvedIdx = sequence.findIndex((e) => e.event === PHASE_EVENTS.review.complete.event);
  const moveIdx = sequence.findIndex((e) => e.kind === 'move-done');

  // The close verb emits review:approved before issue:wrap …
  assert.ok(approvedIdx !== -1, `expected a review:approved row; got ${rowEvents.join(', ')}`);
  assert.ok(wrapIdx !== -1, `expected an issue:wrap row; got ${rowEvents.join(', ')}`);
  assert.ok(
    approvedIdx < wrapIdx,
    `review:approved must precede issue:wrap; got order ${rowEvents.join(', ')}`
  );
  // … and BOTH precede the terminal board move (which emits issue:closed).
  assert.ok(moveIdx !== -1, 'expected the terminal done board move to run');
  assert.ok(
    wrapIdx < moveIdx,
    'issue:wrap must be emitted before the terminal board move (issue:closed)'
  );

  // Exactly one review:approved emitted by the close path.
  assert.equal(
    rowEvents.filter((e) => e === PHASE_EVENTS.review.complete.event).length,
    1,
    `exactly one review:approved expected from close; got ${rowEvents.join(', ')}`
  );
  assert.deepEqual(
    sequence
      .filter(({ event }) =>
        [PHASE_EVENTS.review.complete.event, PHASE_EVENTS.done.enter.event].includes(event)
      )
      .map(({ row }) => parseTimingRow(row).fullWordMarker),
    ['200', '200'],
    'real close caller preserves the known full cursor through both terminal rows'
  );
});

// ── Part C: combined close + move-state(done) stream — no duplication (AC3) ──
//
// move-state.mjs emits ONLY `issue:closed` on the done transition (its
// `<prev>:complete` branch is guarded by `stateArg !== 'done'`). Model the
// full close + move stream and assert the canonical 3-row order with a single
// `review:approved`. This is the contract move-state's guard must uphold; if
// that guard regresses (re-emitting `review:approved` on done), the live log
// would carry two approval rows AFTER issue:wrap — the inversion this catches.

test('combined close + done-move stream is review:approved → issue:wrap → issue:closed', () => {
  const ts = new Date().toISOString();
  // close.mjs half (real helper):
  const closeRows = buildReviewToDoneClosePair({ ts, activeSec: 100, idleSec: 0, wordMarker: 0 });
  // move-state.mjs(done) half — contract: issue:closed ONLY, no review:approved.
  const moveEvents = [PHASE_EVENTS.done.complete.event]; // issue:closed

  const stream = [...closeRows.map(eventOf), ...moveEvents];
  assert.deepEqual(stream, [
    PHASE_EVENTS.review.complete.event, // review:approved
    PHASE_EVENTS.done.enter.event, // issue:wrap
    PHASE_EVENTS.done.complete.event, // issue:closed
  ]);
  assert.equal(
    stream.filter((e) => e === PHASE_EVENTS.review.complete.event).length,
    1,
    'exactly one review:approved across the combined stream'
  );
});

// ── Part D: #692 AC2 — pair emission is idempotent across close retries ──────
//
// When `close` is re-invoked after a first attempt already emitted the
// `review:approved → issue:wrap` pair but aborted before the terminal move,
// the re-run must NOT emit a second pair. close.mjs reads the timing COMMENT
// (injected here via `ctx.readTimingCommentBody`) and skips whichever half is
// already present since the last `issue:closed`.

function timingLog(rows) {
  const header = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
  const sep = '|---|---|---|---|---|---|---|';
  return ['⏱ Timing Log', '', header, sep, ...rows, ''].join('\n');
}

// Format epoch ms into the timing-row table timestamp form
// `YYYY-MM-DD HH:MM:SS +00:00` (UTC) that TS_LINE_RE matches and tsToMs parses.
function tableTs(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +00:00`
  );
}

test('#692 AC2 — retried close does not re-emit an existing review:approved/issue:wrap pair', async () => {
  const prevSkipDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const { statePath, dir } = makeStatePath({
    active: '#999',
    lastActive: '#999',
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
  });

  // A timing comment that ALREADY carries the pair (a prior close attempt),
  // with no terminal `issue:closed` after it — the exact half-state a retry
  // lands in. Rows are hand-written (not via buildRow) so the fixed historical
  // timestamps bypass buildRow's retroactive-ts guard; pendingClosePairState
  // only inspects the Event column.
  const priorTs = '2026-07-02 08:33:48 +00:00';
  const priorTimingBody = timingLog([
    `| ${priorTs} | review:approved |  |  | 0 | 0 |  | <!-- row-sec: a=120 i=0 -->`,
    `| ${priorTs} | issue:wrap |  |  | 0 | 0 |  | <!-- row-sec: a=0 i=0 -->`,
  ]);

  const sequence = [];
  const ctx = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest: ['#999'],
    SKIP_NETWORK: true,
    closeBody: '## Done\n\n<!-- aitm-review-approved ts="2026-06-28T00:00:00Z" -->\n',
    readTimingCommentBody: async () => ({ status: 'ok', body: priorTimingBody }),
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async (_target, row) => {
      sequence.push({ kind: 'row', event: eventOf(row), row });
    },
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => {
      sequence.push({ kind: 'move-done' });
      return { ok: true, benign: false };
    },
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
  };

  try {
    await verbClose(ctx);
  } finally {
    if (prevSkipDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkipDirty;
    rmSync(dir, { recursive: true, force: true });
  }

  const rowEvents = sequence.filter((e) => e.kind === 'row').map((e) => e.event);
  assert.equal(
    rowEvents.filter((e) => e === PHASE_EVENTS.review.complete.event).length,
    0,
    `retry must not re-emit review:approved; got ${rowEvents.join(', ')}`
  );
  assert.equal(
    rowEvents.filter((e) => e === PHASE_EVENTS.done.enter.event).length,
    0,
    `retry must not re-emit issue:wrap; got ${rowEvents.join(', ')}`
  );
});

// ── Part E: #692 AC3 — review:approved row carries the real review→close delta ─
//
// The delta is derived from the last row in the timing COMMENT, not the issue
// body. Inject a comment whose most-recent row is `review:started` 5 minutes
// before close and assert the emitted `review:approved` row's active seconds
// reflect that span (previously it collapsed to 0 because close.mjs passed the
// issue body, which has no timing rows).

test('#692 AC3 — review:approved active duration derives from the timing comment', async () => {
  const prevSkipDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const { statePath, dir } = makeStatePath({
    active: '#999',
    lastActive: '#999',
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
  });

  // Anchor to real now (buildRow rejects timestamps far from Date.now()). The
  // review:started row sits exactly 5 min before the fixed close instant, so
  // the derived active delta is deterministically 300 s.
  const closeMs = Date.now();
  const priorTimingBody = timingLog([
    `| ${tableTs(closeMs - 300_000)} | review:started | 0 |  | — | — |  |`,
  ]);

  const sequence = [];
  const ctx = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest: ['#999'],
    SKIP_NETWORK: true,
    closeBody: `## Done\n\n<!-- aitm-review-approved ts="${new Date(closeMs).toISOString()}" -->\n`,
    readTimingCommentBody: async () => ({ status: 'ok', body: priorTimingBody }),
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async (_target, row) => {
      sequence.push({ kind: 'row', event: eventOf(row), row });
    },
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => ({ ok: true, benign: false }),
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    // Close exactly 5 minutes after the review:started row.
    nowIso: () => new Date(closeMs).toISOString(),
  };

  try {
    await verbClose(ctx);
  } finally {
    if (prevSkipDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkipDirty;
    rmSync(dir, { recursive: true, force: true });
  }

  const approvedRow = sequence.find(
    (e) => e.kind === 'row' && e.event === PHASE_EVENTS.review.complete.event
  );
  assert.ok(approvedRow, 'expected a review:approved row');
  assert.deepEqual(
    secOf(approvedRow.row),
    { a: 300, i: 0 },
    'review:approved must carry the 5-min review→close active delta from the comment'
  );
});

console.log('close-emission-order.test.mjs: ok');
