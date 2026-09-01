// @story #881 #1117 #1458
//
// The Agent Review Gate is the ACTION of the Review state — not an exit
// condition of Test, and not an entry condition of Review. That framing fixes
// two things at once:
//
//   * The Test → Review move is unconditional and happens FIRST. The gate is no
//     longer evaluated as a precondition of the transition.
//   * A gate objection leaves the issue IN Review with its action incomplete,
//     to be fixed in place and re-run. It no longer demotes to Develop, which
//     discarded the story's Test-stage verification (observed on #878).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { emitReviewGateFailureTimeline } from '../../../../task-tracker/verbs/review.mjs';
import reviewState from '../../../../task-tracker/states/review.mjs';
import { reviewAgentValidationAction } from '../../../../task-tracker/lib/resident-actions/review-agent-validation.mjs';
import {
  buildReviewCursorRequest,
  classifyReviewCursorResult,
  executeReviewCursor,
} from '../../../../task-tracker/lib/state-cursor.mjs';

const reviewSrc = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/verbs/review.mjs', import.meta.url)),
  'utf8'
);
const actionSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../task-tracker/lib/resident-actions/review-agent-validation.mjs',
      import.meta.url
    )
  ),
  'utf8'
);
const startSrc = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/verbs/start.mjs', import.meta.url)),
  'utf8'
);
const resumeSrc = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/verbs/resume.mjs', import.meta.url)),
  'utf8'
);
const switchSrc = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/verbs/switch.mjs', import.meta.url)),
  'utf8'
);
const trackerSrc = readFileSync(
  fileURLToPath(new URL('../../../../task-tracker/task-tracker.mjs', import.meta.url)),
  'utf8'
);

test('Review installs the agent-validation resident action by direct reference', () => {
  assert.deepEqual(
    reviewState.residentActions.map(({ id }) => id),
    ['review-agent-validation']
  );
});

test('fresh Agent Review Passed evidence completes the current Review visit', async () => {
  const body = [
    '<!-- aitm-entered-review ts="2026-08-31T12:00:00.000Z" -->',
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-31T12:01:00.000Z" sha="sandbox" validators="timing-log-sequence" result="pass" -->',
  ].join('\n');

  const result = await reviewAgentValidationAction.verify(
    {},
    { body: { value: body }, stateVisitId: 'review:1' }
  );

  assert.equal(result.status, 'complete');
  assert.equal(result.evidence.reviewEntryTs, '2026-08-31T12:00:00.000Z');
  assert.equal(result.evidence.passTs, '2026-08-31T12:01:00.000Z');
});

test('an objection persists failed evidence and returns failed without a board move', async () => {
  const calls = [];
  const body = '<!-- aitm-entered-review ts="2026-08-31T12:00:00.000Z" -->';
  const result = await reviewAgentValidationAction.run(
    {
      now: () => Date.parse('2026-08-31T12:01:00.000Z'),
      review: {
        readComments: async () => [],
        computeChangedPaths: async () => ['scripts/task-tracker/verbs/review.mjs'],
        runAgentReviewGate: () => ({
          pass: false,
          failures: ['missing required comment'],
          validatorsRun: ['required-comments'],
        }),
        onFailure: async (input) => calls.push({ name: 'failure', input }),
        onPass: async (input) => calls.push({ name: 'pass', input }),
      },
    },
    {
      issue: { value: 999 },
      body: { value: body },
      stateVisitId: 'review:1',
      invocation: { cwd: '/worktree' },
    },
    { correlation: { key: 'review:1' } }
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'missing required comment');
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['failure']
  );
  assert.match(calls[0].input.failedBody, /aitm-review-failed/);
  assert.deepEqual(calls[0].input.failures, ['missing required comment']);
});

test('Review entry is forward while an in-Review retry is actions-only', () => {
  assert.deepEqual(buildReviewCursorRequest({ currentState: 'test', issue: 1458, cwd: '/wt' }), {
    issue: 1458,
    cwd: '/wt',
    trigger: 'advance-forward',
    requestedTarget: 'review',
    flags: { verb: 'review' },
  });
  assert.deepEqual(buildReviewCursorRequest({ currentState: 'review', issue: 1458, cwd: '/wt' }), {
    issue: 1458,
    cwd: '/wt',
    trigger: 'actions-only',
    flags: { verb: 'review-probe' },
  });
});

test('an in-Review retry executes only the Cursor actions-only trigger', async () => {
  const requests = [];
  const result = await executeReviewCursor({
    cursor: {
      execute: async (request) => {
        requests.push(request);
        return { kind: 'resident-complete', state: 'review' };
      },
    },
    currentState: 'review',
    issue: 1458,
    cwd: '/wt',
  });

  assert.deepEqual(result, { kind: 'resident-complete', state: 'review' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].trigger, 'actions-only');
  assert.equal('requestedTarget' in requests[0], false);
});

test('Review classifies resident and boundary Cursor outcomes without swallowing failures', () => {
  assert.deepEqual(classifyReviewCursorResult({ kind: 'resident-complete', state: 'review' }), {
    status: 'complete',
  });
  assert.deepEqual(
    classifyReviewCursorResult({
      kind: 'resident-result',
      state: 'review',
      result: { status: 'failed', reason: 'objection' },
    }),
    { status: 'action-failed', result: { status: 'failed', reason: 'objection' } }
  );
  assert.deepEqual(
    classifyReviewCursorResult({ kind: 'drift', expectedState: 'review', actualState: 'test' }),
    {
      status: 'cursor-refused',
      result: { kind: 'drift', expectedState: 'review', actualState: 'test' },
    }
  );
});

test('start, resume, and switch wake Review resident work through the dispatcher callback', () => {
  assert.match(startSrc, /resumeReviewActionsAfterBind/);
  assert.match(resumeSrc, /resumeReviewActionsAfterBind/);
  assert.match(switchSrc, /resumeReviewActionsAfterBind/);
  assert.match(trackerSrc, /resumeReviewActionsAfterBind/);
  assert.match(trackerSrc, /state !== 'review'/);
});

test('a passing Review probe continues into actions-only resident execution', () => {
  const passBranch = reviewSrc.slice(
    reviewSrc.indexOf("if (probeResult.status === 'passed')"),
    reviewSrc.indexOf('const reasons = (probeResult.reasons || [])')
  );
  assert.doesNotMatch(passBranch, /\breturn;/);
  assert.match(reviewSrc, /await executeReviewCursor\(/);
});

// Drive the failure timeline with fakes that append to one ordered log. Any
// board move is recorded, so "no move happened" is an assertion, not an
// assumption.
function drive(overrides = {}) {
  const log = [];
  const deps = {
    runMoveState: async (_target, state) => {
      log.push(`MOVE:${state}`);
      return { ok: true };
    },
    buildRow: ({ event, description }) => `ROW event=${event} desc=${description}`,
    safePostTiming: async (_target, row) => log.push(`ROW:${String(row)}`),
    mutateBodyFn: async () => log.push('stamp:aitm-review-failed'),
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    ...overrides,
  };
  return { log, deps };
}

const ARGS = {
  target: '#999',
  issueNum: '999',
  repo: 'o/r',
  failures: ['objection A', 'objection B'],
  failedBody: 'BODY',
  ts: '2026-07-15T00:00:00.000Z',
  delta: { activeSec: 10, idleSec: 0 },
  wordMarker: 42,
};

test('a gate objection performs NO board move — the issue stays in Review', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.equal(
    log.some((e) => e.startsWith('MOVE:')),
    false,
    `no move may be driven from the failure path; saw ${JSON.stringify(log)}`
  );
});

test('the failure timeline is exactly: stamp the marker, then post review:failed', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.equal(log.length, 2);
  assert.equal(log[0], 'stamp:aitm-review-failed');
  assert.match(log[1], /^ROW:ROW event=review:failed/);
});

test('the review:failed row says the issue stays in Review, not that it reverted', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  const row = log.find((e) => e.startsWith('ROW:'));
  assert.match(row, /staying in Review/);
  assert.doesNotMatch(row, /reverted to Develop/);
  assert.match(row, /agent review failed — 2 objection\(s\)/);
});

test('the marker stamp is best-effort — a mutate throw does not lose the row', async () => {
  const { log, deps } = drive({
    mutateBodyFn: async () => {
      throw new Error('gh edit failed');
    },
  });
  await emitReviewGateFailureTimeline({ ...ARGS, deps: { ...deps, logError: () => {} } });
  assert.equal(log.length, 1);
  assert.match(log[0], /^ROW:ROW event=review:failed/);
});

test('the failure path never passes --demote to anything', async () => {
  const seen = [];
  const { deps } = drive({
    runMoveState: async (_t, state, opts = {}) => {
      seen.push({ state, extraArgs: opts.extraArgs });
      return { ok: true };
    },
  });
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.deepEqual(seen, [], 'no runMoveState call at all, demote or otherwise');
});

// ── Ordering: the move precedes the gate ────────────────────────────────────
//
// The ordering lives in `verbReview`, whose dynamic-import network path is not
// interceptable from node:test (the same constraint that forced
// `emitReviewGateFailureTimeline` to be extracted). Pin it at the source level:
// a regression that reinstates gate-before-move is a textual reordering and this
// catches it.

test('verbReview delegates the authoritative Test → Review move and gate to the Cursor', () => {
  const moveIdx = reviewSrc.indexOf("await runMoveState(target, 'review'");
  const cursorIdx = reviewSrc.indexOf('await executeReviewCursor({');
  assert.notEqual(moveIdx, -1, 'the authoritative move call must exist');
  assert.notEqual(cursorIdx, -1, 'the Cursor execution must exist');
  assert.ok(
    moveIdx < cursorIdx,
    'the legacy boundary adapter must be installed before Cursor execution'
  );
  assert.doesNotMatch(reviewSrc, /const gate = runAgentReviewGate\(/);
});

test('there is exactly ONE authoritative move-to-review call site', () => {
  const hits = reviewSrc.match(/await runMoveState\(target, 'review'/g) || [];
  assert.equal(
    hits.length,
    1,
    'the old post-gate call site was removed, not duplicated; and the failure path adds none'
  );
});

test('emitReviewGateFailureTimeline no longer destructures runMoveState', () => {
  const start = reviewSrc.indexOf('export async function emitReviewGateFailureTimeline');
  assert.notEqual(start, -1);
  const body = reviewSrc.slice(start, start + 1200);
  assert.doesNotMatch(
    body,
    /^\s*runMoveState,$/m,
    'the failure path drives no move, so it must not claim the dep'
  );
});

test('the operator is told to fix in place and re-run, not to fix in Develop', () => {
  assert.match(reviewSrc, /stays in Review with its state action incomplete/);
  assert.doesNotMatch(reviewSrc, /Fix the objections above in Develop/);
});

// ── The gate reads a POST-move body ─────────────────────────────────────────
//
// Hoisting the move above the gate created a stale-body read: `scanBody` is
// captured upstream of `runMoveState`, which stamps `aitm-entered-review` and
// writes the `review:started` timing row. Feeding the gate that pre-move copy
// made `timing-log-sequence` object on EVERY issue — it saw the new
// `review:started` row in the live timing log but no `aitm-entered-review`
// marker in the body — and the failure stamp, derived from the same stale copy,
// then threw `MarkerLossError` for dropping that marker. Observed live on #881.

test('the resident action consumes the Cursor-hydrated body and comments snapshot', () => {
  assert.match(actionSrc, /valueOf\(snapshot\?\.body\)/);
  assert.match(reviewSrc, /'body,comments'/);
  assert.match(reviewSrc, /reviewComments:\s*comments/);
});

test('both gate outcome paths derive their write from the post-move body', () => {
  assert.match(actionSrc, /const body = String\(valueOf\(snapshot\?\.body\)/);
  assert.match(actionSrc, /const base = .*gate\.normalizedBody.*: body/);
  assert.match(actionSrc, /stampReviewFailed\(base,/);
  assert.match(actionSrc, /stampAgentReviewPassed\(clearReviewFailed\(base\)/);
  assert.doesNotMatch(actionSrc, /scanBody/);
});
