// @story #759
// Consolidated regression + behavioral coverage for the atomic-move classes.
//
// This file ships NO runtime behavior. It is the single place that pins each
// NAMED historical drift class of epic #754 end-to-end against the delivered
// saga (`moveState`, #755/#756), the sentinel gate (sentinel.mjs), and the §9/§12
// output formatters (readout.mjs, #757). The granular `move-state-*.test.mjs`
// files each exercise one seam; here we assert the composed saga guarantee so a
// future refactor that passes the granular tests but reopens a drift class still
// fails. All cases drive injected `ctx._`-prefixed seams — no `gh`, no network.
//
//   AC1 / #741 — a completion marker (aitm-move-complete sentinel) can never
//                outrun a verified Status write.
//   AC2 / #752 — a killed/timed-out post-commit tail AFTER the board write never
//                false-reports failure; a present sentinel is success.
//   AC3 / #753 — a re-run of a complete move reconciles tail-owned artifacts
//                instead of short-circuiting past them, and rewrites no board
//                element.
//   AC4 / §9   — the pure formatters emit the exact §9 success / §12 failure
//                contract, rendered only from the result object.
//
// vc:1 = node --test scripts/task-tracker/tests/unit/move-regression.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../lib/move-state/move-state-core.mjs';
import { formatMoveReadout, formatMoveError } from '../../lib/move-state/readout.mjs';

// A ctx whose every seam is a spy that records its name into `calls`. Each seam
// returns the success-path value; individual tests override the ones they probe.
function spyCtx(overrides = {}) {
  const calls = [];
  const ctx = {
    issueArg: '759',
    stateArg: 'test',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: '',
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    }),
    _emitPhasePairRows: async () => {
      calls.push('rows');
    },
    _stampEntryMarkers: async () => {
      calls.push('markers');
    },
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [], total: 8 };
    },
    ...overrides,
  };
  return { calls, ctx };
}

// --- AC1 / #741 — the sentinel can never outrun a verified Status -------------

test('#741: an unconfirmed Status write never reaches the sentinel', async () => {
  const { calls, ctx } = spyCtx({
    // #711 fail-closed: the Status write could not confirm the board reached
    // target, so it returns a non-null exit.
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: 6 };
    },
  });
  const res = await moveState(ctx);

  assert.equal(res.phase, 'status', 'failure is classified at the Status phase');
  assert.equal(res.exit, 6, 'the Status write exit is propagated');
  assert.equal(res.boardMoved, false, 'an unconfirmed Status write is not a board move');
  assert.equal(res.sentinelPresent, false, 'no sentinel may be reported for an unmoved board');
  assert.ok(
    !calls.includes('sentinel'),
    'the sentinel write seam must be UNREACHED when Status is unconfirmed'
  );
});

// --- AC2 / #752 — a dead tail after the board write is still success ----------

test('#752: a killed post-commit tail after the board write reports success', async () => {
  const { ctx } = spyCtx({
    // The board moved and the sentinel landed; the best-effort tail then died
    // (as if timed-out / killed).
    _runPostCommitTail: async () => ({
      failures: [{ name: 'unpark', error: 'killed' }],
      total: 8,
    }),
  });
  const res = await moveState(ctx);

  assert.equal(res.exit, null, 'a dead tail does not make the move fail');
  assert.equal(res.phase, 'complete', 'the move is complete once Status + sentinel landed');
  assert.equal(res.boardMoved, true, 'the board move stands');
  assert.equal(res.sentinelPresent, true, 'the sentinel confirms completion');
  assert.equal(res.tail.failures.length, 1, 'the tail failure is carried, not swallowed');
});

test('#752: a sentinel-present failure classifies as complete, never a failure', () => {
  // Even if some caller routes a sentinel-present result through the ERROR
  // formatter, §12 must classify a present sentinel as actually-complete.
  const out = formatMoveError({
    result: {
      exit: 3,
      phase: 'sentinel',
      sentinelPresent: true,
      boardMoved: true,
      tail: { failures: [{ name: 'unpark' }], total: 8 },
    },
    issue: '759',
    from: 'develop',
    to: 'test',
  });
  assert.match(
    out,
    /sentinel present ⇒ move is actually COMPLETE — treat as success \/ reconcile/,
    'a present sentinel must be classified as complete, not a failure'
  );
  assert.match(out, /sentinel {6}: present/, 'the sentinel is reported present');
});

// --- AC3 / #753 — a re-run reconciles the tail, rewrites no board element -----

test('#753: replay of a complete move reconciles the tail but rewrites nothing', async () => {
  const { calls, ctx } = spyCtx({
    // The board already shows this exact move fully landed.
    _probeCompletion: async () => ({
      sentinelState: 'test',
      statusState: 'test',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    }),
  });
  const res = await moveState(ctx);

  assert.equal(res.alreadyComplete, true, 'the replay is recognized as already complete');
  assert.equal(res.exit, null);
  assert.equal(res.phase, 'complete');
  assert.equal(res.sentinelPresent, true);
  assert.equal(res.boardMoved, true);

  // The tail-owned artifacts ARE reconciled on replay...
  assert.ok(calls.includes('tail'), 'the post-commit tail MUST run on replay (reconcile)');
  // ...but no board-mutating seam is re-run.
  for (const seam of ['rows', 'markers', 'status', 'sentinel']) {
    assert.ok(
      !calls.includes(seam),
      `a complete-move replay must NOT re-run the board seam "${seam}"`
    );
  }
});

// --- AC4 / §9 §12 — the exact output contract, rendered from the result -------

test('§9: formatMoveReadout emits the exact success block', () => {
  const out = formatMoveReadout({
    result: {
      exit: null,
      phase: 'complete',
      sentinelPresent: true,
      boardMoved: true,
      tail: { failures: [], total: 8 },
    },
    issue: '759',
    from: 'develop',
    to: 'test',
  });
  const expected = [
    '✓ move #759 develop→test complete',
    '  exit flush  : develop row closed (verified)',
    '  entry stamp : aitm-entered-test present (verified)',
    '  entry row   : test row opened (verified)',
    '  status      : Status == Test (verified)',
    '  sentinel    : aitm-move-complete state=test (written last)',
    '  tail        : 8/8 best-effort steps ok',
  ].join('\n');
  assert.equal(out, expected, '§9 success readout must match the contract byte-for-byte');
});

test('§9: an idempotent replay is labelled in the readout header', () => {
  const out = formatMoveReadout({
    result: { alreadyComplete: true, tail: { failures: [], total: 8 } },
    issue: '759',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /already complete \(idempotent replay\)/);
});

test('§12: formatMoveError emits the status-phase failure block (sentinel absent)', () => {
  const out = formatMoveError({
    result: { exit: 6, phase: 'status', sentinelPresent: false, boardMoved: false },
    issue: '759',
    from: 'develop',
    to: 'test',
  });
  const expected = [
    '⛔ move #759 develop→test FAILED',
    '  failed element: Status write (unconfirmed, #711 fail-closed) (before the Status write)',
    '  sentinel      : absent — sentinel absent ⇒ incomplete, board not moved — safe to re-run to roll forward',
    '  recommendation: re-run with `--repair` or corrected params',
  ].join('\n');
  assert.equal(out, expected, '§12 status-phase failure must match the contract byte-for-byte');
});

test('§12: a sentinel-present failure renders the reconcile block', () => {
  const out = formatMoveError({
    result: { exit: 3, phase: 'sentinel', sentinelPresent: true, boardMoved: true },
    issue: '759',
    from: 'develop',
    to: 'test',
  });
  assert.match(out, /⛔ move #759 develop→test FAILED/);
  assert.match(out, /failed element: sentinel \(aitm-move-complete\) \(after the Status write\)/);
  assert.match(out, /re-run to reconcile \(safe — the sentinel confirms completion\)/);
});
