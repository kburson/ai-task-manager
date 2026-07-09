// @story #753
// Regression: the close converge/no-op fast-path must STILL reconcile the
// Lifecycle DoD boxes. Before #753, a close that had already run once (issue
// verifiably CLOSED, board Done) took the `decision.action === 'noop'`
// short-circuit and returned BEFORE the `tickLifecycleOnClose` reconcile that
// only the full close pipeline reached. So a close that bailed after the board
// move but before the lifecycle tick (a crash, a timeout-killed tail, the #737
// split-brain) left `story-closed` / `timing-flushed` unchecked forever — every
// re-run hit the noop path and skipped the tick again.
//
// The invariant (matching the real `verbClose` seam, not the plan's
// illustrative `runClose`): whenever close resolves as an idempotent converge/
// no-op, it invokes the lifecycle-box reconcile (`tickLifecycleOnClose`).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { verbClose } from '../../verbs/close.mjs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

const baseState = (active = '#5') => ({
  active,
  lastActive: active,
  entryStartTs: new Date(Date.now() - 60_000).toISOString(),
  wordsAtEntryStart: 0,
  lastWordMarker: 0,
});

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-753-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return { statePath, dir };
}

// Drive the real verbClose down the converge/noop path with injected fakes.
// `getIssueClosedState → true` + a board state make decideCloseConvergence
// return `{action:'noop'}`; `tickLifecycleOnClose` is injected as a spy so the
// reconcile is observable without touching GitHub.
async function runConverge({ boardState, reconcileSpy }) {
  const { statePath, dir } = tmpState(baseState());
  const ctx = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest: ['#5'],
    SKIP_NETWORK: false,
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async () => {},
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => ({ ok: true, benign: false }),
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => boardState,
    getIssueClosedState: async () => true,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
    tickLifecycleOnClose: reconcileSpy,
  };
  const prevSkip = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const realLog = console.log;
  console.log = () => {};
  try {
    await verbClose(ctx);
  } finally {
    console.log = realLog;
    if (prevSkip === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkip;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('close on already-done issue (no drift) re-ticks strayed lifecycle DoD boxes', async () => {
  let reconciled = 0;
  await runConverge({
    boardState: 'done',
    reconcileSpy: async ({ issueNum }) => {
      assert.equal(issueNum, '5', 'reconcile targets the closing issue');
      reconciled++;
    },
  });
  assert.equal(reconciled, 1, 'converge/no-op path must reconcile lifecycle boxes (#753)');
});

test('close on closed issue with lagging board (drift) reconciles after converging', async () => {
  let reconciled = 0;
  await runConverge({
    boardState: 'develop',
    reconcileSpy: async () => {
      reconciled++;
    },
  });
  assert.equal(reconciled, 1, 'board-drift converge path must also reconcile lifecycle boxes');
});

console.log('close-reconcile-lifecycle.test.mjs: defined');
