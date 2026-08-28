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
import { verbClose, tickLifecycleOnClose } from '../../../../task-tracker/verbs/close.mjs';
import { decideCloseConvergence } from '../../../../task-tracker/lib/close-convergence.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

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

// Drive the real verbClose down the converge/noop path through the grouped
// capability boundary. `getIssueClosedState → true` + a board state make
// decideCloseConvergence return `{action:'noop'}`; `tickLifecycleOnClose` is
// injected as a spy so the reconcile is observable without touching GitHub.
async function runConverge({ boardState, reconcileSpy }) {
  const { statePath, dir } = tmpState(baseState());
  const ctx = {
    rest: ['#5'],
    projectConfig: {
      cfg: { repo: 'o/r' },
      statePath,
      projectDir: dir,
      SKIP_NETWORK: false,
      pexec: async () => ({ stdout: '{}', stderr: '' }),
      uncheckedPreCloseCheckboxes: () => [],
      nowIso: () => new Date().toISOString(),
    },
    timingRecorder: {
      drainQueueIfAny: async () => {},
      flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
      safePostTiming: async () => {},
    },
    stateRunner: {
      runMoveState: async () => ({ ok: true, benign: false }),
      runMoveStateDone: async () => ({ ok: true, benign: false }),
      runLogIssueTime: async () => {},
    },
    githubClient: {
      fetchSubIssues: async () => [],
      getIssueBoardState: async () => boardState,
      getIssueClosedState: async () => true,
    },
    tickLifecycleOnClose: reconcileSpy,
    loadCloseDeliveryBody: async () => '<!-- delivery-test-body -->',
    loadCloseDeliveryGateInput: async () => ({
      issueNumber: 5,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/5',
      acceptedSha: 'a'.repeat(40),
      localHeadSha: 'a'.repeat(40),
      pullRequests: [],
      records: null,
    }),
    resolveReviewAuthorization: () => ({ mode: 'human', standing: true, source: 'test' }),
    requireDeliveryReceipt: () => ({ skipped: false, receipt: {} }),
    verifyCloseDeliveryReceipt: async ({ receiptGate }) => receiptGate,
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

// --- AC4: the reconcile drives a REAL body to ticked (not just a spy) ---------
// Build an in-memory body store so the real `tickLifecycleOnClose` +
// `tickLifecycleItem` operate on actual markdown, and assert the two boxes the
// close verb owns end `[x]`. `deps.mutateIssueBody` is the seam the ticker reads
// (close.mjs:909), so injecting a store here exercises the real mutate closure
// without a single `gh` spawn.
function bodyStore(initial) {
  let body = initial;
  return {
    get: () => body,
    mutateIssueBody: async ({ mutate }) => {
      body = mutate(body);
      return { body, version: 1 };
    },
  };
}

const LIFECYCLE_BLOCK = (a = ' ', b = ' ', c = ' ') =>
  [
    '## Definition of Done',
    '',
    '### Lifecycle (verified at Review)',
    '',
    `- [${a}] Passed final human review`,
    '',
    '### Housekeeping (verified at Close)',
    `- [${b}] Story closed and moved to Done`,
    `- [${c}] Timing data flushed to issue`,
    '',
  ].join('\n');

test('reconcile drives an unticked real body to ticked story-closed + timing-flushed (#753 AC4)', async () => {
  const store = bodyStore(LIFECYCLE_BLOCK(' ', ' ', ' '));
  const res = await tickLifecycleOnClose({
    cfg: { repo: 'o/r' },
    issueNum: '5',
    pexec: async () => ({ stdout: '', stderr: '' }),
    deps: { mutateIssueBody: store.mutateIssueBody },
  });
  assert.equal(res.ok, true, 'ticker reports success');
  const body = store.get();
  assert.match(body, /- \[x\] Story closed and moved to Done/, 'story-closed ends ticked');
  assert.match(body, /- \[x\] Timing data flushed to issue/, 'timing-flushed ends ticked');
  // The close verb owns only these two boxes — the review box is NOT its to tick.
  assert.match(body, /- \[ \] Passed final human review/, 'review box left untouched');
});

// --- AC3: honest — the reconcile only flips boxes that genuinely exist; it
// never fabricates a tick or an absent line, and is idempotent on already-ticked
// boxes. (The complementary fact-gate — that the reconcile is only *invoked*
// when the issue is verifiably CLOSED — is pinned by the decision-invariance test
// below and the two converge tests above.)
test('reconcile does not fabricate an absent lifecycle box (#753 AC3)', async () => {
  // Body has story-closed but the timing-flushed line is absent entirely.
  const partial = [
    '## Definition of Done',
    '',
    '### Lifecycle (verified at Review)',
    '',
    '- [ ] Passed final human review',
    '',
    '### Housekeeping (verified at Close)',
    '- [ ] Story closed and moved to Done',
    '',
  ].join('\n');
  const store = bodyStore(partial);
  await tickLifecycleOnClose({
    cfg: { repo: 'o/r' },
    issueNum: '5',
    pexec: async () => ({ stdout: '', stderr: '' }),
    deps: { mutateIssueBody: store.mutateIssueBody },
  });
  const body = store.get();
  assert.match(body, /- \[x\] Story closed and moved to Done/, 'present box ticked');
  assert.doesNotMatch(
    body,
    /Timing data flushed to issue/,
    'absent timing-flushed line is NOT fabricated'
  );
});

test('reconcile is idempotent on already-ticked boxes (#753 AC3)', async () => {
  const store = bodyStore(LIFECYCLE_BLOCK(' ', 'x', 'x'));
  const before = store.get();
  await tickLifecycleOnClose({
    cfg: { repo: 'o/r' },
    issueNum: '5',
    pexec: async () => ({ stdout: '', stderr: '' }),
    deps: { mutateIssueBody: store.mutateIssueBody },
  });
  const after = store.get();
  assert.match(after, /- \[x\] Story closed and moved to Done/, 'stays ticked');
  assert.match(after, /- \[x\] Timing data flushed to issue/, 'stays ticked');
  assert.equal(
    (after.match(/- \[x\] Story closed and moved to Done/g) || []).length,
    1,
    'no duplicate ticked line introduced'
  );
  assert.match(before, /- \[ \] Passed final human review/, 'review box still unticked');
});

// --- AC4: the happy-path `proceed` decision is behaviorally UNCHANGED ----------
// The #753 seam adds reconcile calls strictly INSIDE the `noop` and `close-issue`
// converge branches. The `proceed` decision — the full close pipeline's entry —
// must be untouched: an OPEN issue with a non-Done board still returns `proceed`,
// so the happy path runs exactly as before (its own end-of-pipeline reconcile,
// after the issue is genuinely closed, is the honest fact-gated tick).
test('convergence decision for the happy path is unchanged by the #753 seam (#753 AC4)', () => {
  assert.deepEqual(
    decideCloseConvergence({ issueClosed: false, boardState: 'develop' }),
    { action: 'proceed' },
    'OPEN issue + non-Done board → proceed (full pipeline), no converge reconcile'
  );
  // The reconcile-carrying branches remain exactly the CLOSED / board-drift cases.
  assert.deepEqual(
    decideCloseConvergence({ issueClosed: true, boardState: 'done' }),
    { action: 'noop', boardDrift: false },
    'CLOSED + board Done → noop (reconcile branch)'
  );
  assert.deepEqual(
    decideCloseConvergence({ issueClosed: true, boardState: 'develop' }),
    { action: 'noop', boardDrift: true },
    'CLOSED + board lagging → noop with drift (reconcile branch)'
  );
  assert.deepEqual(
    decideCloseConvergence({ issueClosed: false, boardState: 'done' }),
    { action: 'close-issue' },
    'OPEN + board Done → close-issue (reconcile branch)'
  );
});

console.log('close-reconcile-lifecycle.test.mjs: defined');
