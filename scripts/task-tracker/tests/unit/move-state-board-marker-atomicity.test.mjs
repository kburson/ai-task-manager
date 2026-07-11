// @story #741
//
// #741 — a state transition must never leave the GitHub board Status field
// silently behind the authoritative `aitm-last-known-state` marker. The saga
// advances the marker (stampEntryMarkers) BEFORE the board write (runStatusWrite,
// #711 fail-closed). If the board write fails, the marker is ahead of the board.
// This suite proves the failure path now compensates (rolls the marker back to
// the prior stage → marker == board), the success path asserts board == marker,
// and — critically — the happy-path saga wiring is unchanged when no priorState
// is captured (AC4 invariance; the offline/DI stubs return undefined).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../lib/move-state/move-state-core.mjs';
import {
  rollbackRecordedState,
  assertBoardMarkerConsistent,
} from '../../lib/move-state/github-mutation.mjs';
import { writeLastKnownState, readLastKnownState } from '../../gh-timing-comment.mjs';

// Mirror move-state-core.test.mjs's DI harness: every network seam is stubbed so
// the saga runs with zero I/O. Overrides layer on top.
function baseCtx(overrides = {}) {
  const calls = [];
  return {
    issueArg: '741',
    stateArg: 'test',
    calls,
    _runGuardExecution: async () => {
      calls.push('guard');
      return { exit: null };
    },
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
    // Production stampEntryMarkers returns { priorState }; the offline core stub
    // returns undefined. Default here mirrors the NEW production contract so the
    // #741 branches are exercised; individual tests override priorState.
    _stampEntryMarkers: async () => {
      calls.push('markers');
      return { priorState: 'develop' };
    },
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT_1', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _assertBoardMarkerConsistent: async () => {
      calls.push('consistency');
      return { consistent: true, recorded: 'test', expected: 'test', exit: null };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
    ...overrides,
  };
}

// ── AC1 / AC3 — failed board write triggers the compensating rollback ────────

test('AC1: a failed board write rolls the marker back to the prior stage and stays loud', async () => {
  const rollbackArgs = [];
  const ctx = baseCtx({
    _stampEntryMarkers: async () => ({ priorState: 'develop' }),
    _runStatusWrite: async () => ({ itemId: 'IT_1', exit: 4 }),
    _rollbackRecordedState: async (_ctx, priorState) => {
      rollbackArgs.push(priorState);
      return { rolledBack: true, priorState };
    },
  });
  const res = await moveState(ctx);
  // loud: the non-zero exit from #711 is preserved, not swallowed by the rollback
  assert.equal(res.exit, 4);
  assert.equal(res.boardMoved, false);
  assert.equal(res.phase, 'status');
  assert.equal(res.rolledBack, true);
  // the marker was restored to the stage the board is still confirmed at
  assert.deepEqual(rollbackArgs, ['develop']);
  // neither the sentinel nor the tail ran after a failed board write
  assert.ok(!ctx.calls.includes('sentinel'), 'sentinel must not run');
  assert.ok(!ctx.calls.includes('tail'), 'tail must not run');
});

test('AC3: rollback restores aitm-last-known-state to priorState (real code)', async () => {
  // Seed a body whose marker points at the TARGET (as stampEntryMarkers left it
  // just before the board write failed), using the real marker writer.
  const advancedBody = writeLastKnownState('# Issue\n\nbody text\n', 'test');
  assert.equal(readLastKnownState(advancedBody).state, 'test');

  let writtenBody = null;
  const ctx = {
    issueArg: '741',
    cfg: { repo: 'kburson/ai-task-manager' },
    pexec: async () => ({ stdout: JSON.stringify({ body: advancedBody }) }),
    // rollback's legacy writeIssueBodyWithRetry path writes the body to a tmp
    // file then invokes `gh ... --body-file <tmp>`; capture that file's content.
    gh: async (args) => {
      const flag = args.indexOf('--body-file');
      if (flag !== -1) {
        const { readFileSync } = await import('node:fs');
        writtenBody = readFileSync(args[flag + 1], 'utf8');
      }
      return { stdout: '' };
    },
  };
  const res = await rollbackRecordedState(ctx, 'develop');
  assert.equal(res.rolledBack, true);
  assert.ok(writtenBody, 'a body-file write occurred');
  assert.equal(readLastKnownState(writtenBody).state, 'develop');
});

test('AC3: rollback is a no-op when the marker already reads priorState', async () => {
  const consistentBody = writeLastKnownState('# Issue\n', 'develop');
  const ctx = {
    issueArg: '741',
    cfg: { repo: 'kburson/ai-task-manager' },
    pexec: async () => ({ stdout: JSON.stringify({ body: consistentBody }) }),
    gh: async () => {
      throw new Error('gh must not be called on an already-consistent rollback');
    },
  };
  const res = await rollbackRecordedState(ctx, 'develop');
  assert.equal(res.rolledBack, false);
  assert.equal(res.reason, 'already-consistent');
});

// ── AC2 — success path asserts board == marker ───────────────────────────────

test('AC2: success path runs the board==marker consistency assertion', async () => {
  const ctx = baseCtx();
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.ok(ctx.calls.includes('consistency'), 'consistency assertion ran');
  assert.ok(
    ctx.calls.indexOf('sentinel') < ctx.calls.indexOf('consistency'),
    'consistency runs after the sentinel'
  );
  assert.ok(
    ctx.calls.indexOf('consistency') < ctx.calls.indexOf('tail'),
    'consistency runs before the tail'
  );
});

test('AC2: a board/marker mismatch on success fails closed and never runs the tail', async () => {
  const ctx = baseCtx({
    _assertBoardMarkerConsistent: async () => ({
      consistent: false,
      recorded: 'develop',
      expected: 'test',
      exit: 8,
    }),
  });
  const res = await moveState(ctx);
  assert.equal(res.exit, 8);
  assert.equal(res.phase, 'consistency');
  assert.ok(!ctx.calls.includes('tail'), 'a failed post-condition must not run the tail');
});

test('AC2: assertBoardMarkerConsistent reports consistent iff marker == expected (real code)', async () => {
  const body = writeLastKnownState('# Issue\n', 'test');
  const ctx = {
    issueArg: '741',
    cfg: { repo: 'kburson/ai-task-manager' },
    pexec: async () => ({ stdout: JSON.stringify({ body }) }),
  };
  const ok = await assertBoardMarkerConsistent(ctx, 'test');
  assert.equal(ok.consistent, true);
  assert.equal(ok.exit, null);
  const bad = await assertBoardMarkerConsistent(ctx, 'review');
  assert.equal(bad.consistent, false);
  assert.equal(bad.exit, 8);
  assert.equal(bad.recorded, 'test');
});

// ── AC4 — happy-path invariance when no priorState is captured ────────────────

test('AC4: with no priorState (undefined stamp result) the #741 branches stay dormant', async () => {
  const ctx = baseCtx({
    // reproduce the offline/DI stub contract: stampEntryMarkers returns undefined
    _stampEntryMarkers: async () => {
      ctx.calls.push('markers');
      return undefined;
    },
    _assertBoardMarkerConsistent: async () => {
      throw new Error('consistency assertion must NOT run when priorState is null');
    },
  });
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  // the success saga is byte-behaviour-identical: no consistency step inserted
  assert.deepEqual(ctx.calls, ['guard', 'rows', 'markers', 'status', 'sentinel', 'tail']);
});

test('AC4: with no priorState a failed board write does NOT attempt a rollback', async () => {
  const ctx = baseCtx({
    _stampEntryMarkers: async () => {
      ctx.calls.push('markers');
      return undefined;
    },
    _runStatusWrite: async () => ({ itemId: 'IT_1', exit: 7 }),
    _rollbackRecordedState: async () => {
      throw new Error('rollback must NOT run when priorState is null');
    },
  });
  const res = await moveState(ctx);
  assert.equal(res.exit, 7);
  assert.equal(res.rolledBack, false);
});
