// @story #881 #1117 #1458 #1629
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

import {
  emitReviewGateFailureTimeline,
  emitReviewGateWaivedTimeline,
  reviewCompletionMessage,
} from '../../../../task-tracker/verbs/review.mjs';
import { wakeReviewResidents } from '../../../../task-tracker/verbs/resume.mjs';
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

function waiverTimingBody({
  recordId = '01M2H000000000000000000001',
  revision = 1,
  acceptedSha = 'a'.repeat(40),
} = {}) {
  return [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-09-15 01:00:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${recordId}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${recordId}" revision="${revision}" accepted-sha="${acceptedSha}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
}

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

test('resident semantic review reloads policy only for missing waivable planning sections', async () => {
  const calls = [];
  const workflowPolicy = {
    isWaived: (id) => ['planning.metadata', 'planning.deep-dive'].includes(id),
  };
  const result = await reviewAgentValidationAction.run(
    {
      now: () => Date.parse('2026-09-15T01:00:00.000Z'),
      review: {
        repo: 'kburson/ai-task-manager',
        readComments: async () => [],
        computeChangedPaths: async () => [],
        runAgentReviewGate: (input) => {
          calls.push(['gate', input.workflowPolicy || null]);
          return input.workflowPolicy
            ? { pass: true, failures: [], validatorsRun: ['body-sections'] }
            : {
                pass: false,
                failures: ["body-sections: section 'Deep Dive' is missing"],
                validatorsRun: ['body-sections'],
              };
        },
        loadWorkflowBoundary: async () => {
          calls.push(['policy']);
          return workflowPolicy;
        },
        onFailure: async () => calls.push(['failure']),
        onPass: async () => calls.push(['pass']),
      },
    },
    {
      issue: { value: 1628 },
      body: { value: '## User Story\nA\n## Scope\nS\n## Acceptance Criteria\n- [ ] A' },
      stateVisitId: 'review:1',
    }
  );

  assert.equal(result.status, 'complete');
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['policy', 'gate', 'policy', 'gate', 'pass']
  );
  assert.equal(calls[3][1], workflowPolicy);
});

test('a current semantic-review waiver returns waived without running validators or mutations', async () => {
  const calls = [];
  const authority = { recordId: '01M2H000000000000000000001', revision: 1 };
  const result = await reviewAgentValidationAction.run(
    {
      now: () => Date.parse('2026-09-15T01:00:00.000Z'),
      review: {
        repo: 'kburson/ai-task-manager',
        loadWorkflowBoundary: async (input) => {
          calls.push(['policy', input.requirementIds, input.activity]);
          return {
            status: 'policy-compatible',
            isWaived: (id) => id === 'review.semantic-resident',
            decision: () => ({ authority }),
          };
        },
        runAgentReviewGate: () => assert.fail('waived review must not run validators'),
        onFailure: () => assert.fail('waived review must not stamp failure'),
        onPass: () => assert.fail('waived review must not stamp pass'),
        onWaived: async (input) => calls.push(['waived', input]),
      },
    },
    {
      issue: { value: 1629 },
      body: { value: '<!-- aitm-entered-review ts="2026-09-15T00:00:00.000Z" -->' },
      headSha: { value: 'a'.repeat(40) },
      stateVisitId: 'review:1',
    },
    { correlation: { key: 'review:1' } }
  );

  assert.deepEqual(result, {
    status: 'waived',
    evidence: {
      authority,
      acceptedSha: 'a'.repeat(40),
      requirementId: 'review.semantic-resident',
    },
  });
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['policy', 'waived']
  );
  assert.deepEqual(calls[1][1].evidence, {
    authority,
    acceptedSha: 'a'.repeat(40),
    requirementId: 'review.semantic-resident',
  });
});

test('waived semantic review emits a truthful durable timeline row', async () => {
  const rows = [];
  await emitReviewGateWaivedTimeline({
    target: '#1629',
    ts: '2026-09-15T01:00:00.000Z',
    delta: { activeSec: 7, idleSec: 3 },
    wordMarker: 10,
    fullWordMarker: 20,
    evidence: {
      authority: { recordId: '01M2H000000000000000000001', revision: 1 },
      acceptedSha: 'a'.repeat(40),
      requirementId: 'review.semantic-resident',
    },
    deps: {
      mutateBodyFn: async ({ mutate }) => ({ body: mutate('') }),
      safePostTiming: async (_target, row) => {
        rows.push(row);
        return { ok: true };
      },
      readTimingCommentBodyFn: async () => ({
        status: 'found',
        body: waiverTimingBody(),
      }),
      buildRow: (row) => row,
    },
  });

  assert.deepEqual(
    rows.map(({ event }) => event),
    ['review:waived']
  );
  assert.match(rows[0].description, /review\.semantic-resident/);
  assert.match(rows[0].description, /01M2H000000000000000000001/);
  assert.match(rows[0].description, new RegExp(`accepted-sha="${'a'.repeat(40)}"`));
  assert.doesNotMatch(rows[0].description, /passed|REVIEW_COMPLETE/i);
});

test('waived semantic review retires the active failure carrier without stamping pass evidence', async () => {
  let body = [
    '- [ ] Agent Review Passed',
    '<!-- aitm-review-failed:start -->',
    '<!-- aitm-review-failed-meta ts="2026-09-15T00:30:00.000Z" -->',
    '**Agent Review Gate failed.**',
    '- historical objection',
    '<!-- aitm-review-failed:end -->',
  ].join('\n');
  const rows = [];
  const order = [];

  await emitReviewGateWaivedTimeline({
    target: '#1629',
    issueNumber: 1629,
    repo: 'kburson/ai-task-manager',
    ts: '2026-09-15T01:00:00.000Z',
    delta: { activeSec: 7, idleSec: 3 },
    wordMarker: 10,
    fullWordMarker: 20,
    evidence: {
      authority: { recordId: '01M2H000000000000000000001', revision: 1 },
      acceptedSha: 'a'.repeat(40),
      requirementId: 'review.semantic-resident',
    },
    deps: {
      mutateBodyFn: async ({ mutate }) => {
        order.push('clear-failure');
        body = mutate(body);
        return { body };
      },
      safePostTiming: async (_target, row) => {
        order.push('post-waiver');
        rows.push(row);
        return { ok: true };
      },
      readTimingCommentBodyFn: async () => ({
        status: 'found',
        body: waiverTimingBody(),
      }),
      buildRow: (row) => row,
    },
  });

  assert.doesNotMatch(body, /aitm-review-failed/);
  assert.doesNotMatch(body, /gate="agent-review"[^>]*result="pass"/);
  assert.deepEqual(
    rows.map(({ event }) => event),
    ['review:waived']
  );
  assert.deepEqual(order, ['post-waiver', 'clear-failure']);
});

test('verify revalidates a durable waiver and treats revocation as incomplete', async () => {
  const snapshot = {
    issue: { value: 1629 },
    body: { value: '<!-- aitm-entered-review ts="2026-09-15T00:00:00.000Z" -->' },
    headSha: { value: 'a'.repeat(40) },
    stateVisitId: 'review:1',
    actionLedger: {
      status: 'clean',
      events: [{ phase: 'waived', correlation: { key: 'review:1' } }],
    },
    reviewComments: [
      {
        body: [
          '## ⏱ Timing Log',
          '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
          '|---|---|---|---|---|---|---|---|',
          `| 2026-09-15 01:00:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record 01M2H000000000000000000001; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="01M2H000000000000000000001" revision="1" accepted-sha="${'a'.repeat(40)}" --> | <!-- row-sec: a=0 i=0 -->`,
        ].join('\n'),
      },
    ],
  };
  const authority = { recordId: '01M2H000000000000000000001', revision: 1 };
  const context = (waived) => ({
    review: {
      repo: 'kburson/ai-task-manager',
      loadWorkflowBoundary: async () => ({
        isWaived: () => waived,
        decision: () => (waived ? { authority } : { outcome: 'missing' }),
      }),
    },
  });

  assert.deepEqual(await reviewAgentValidationAction.verify(context(true), snapshot), {
    status: 'waived',
    evidence: {
      authority,
      acceptedSha: 'a'.repeat(40),
      requirementId: 'review.semantic-resident',
    },
  });
  assert.deepEqual(await reviewAgentValidationAction.verify(context(false), snapshot), {
    status: 'incomplete',
    reason: 'not-run',
  });
});

test('verify re-runs a durable waiver whose terminal row lacks exact-head authority', async () => {
  const snapshot = {
    issue: { value: 1629 },
    body: { value: '<!-- aitm-entered-review ts="2026-09-15T00:00:00.000Z" -->' },
    headSha: { value: 'a'.repeat(40) },
    stateVisitId: 'review:1',
    actionLedger: {
      status: 'clean',
      events: [{ phase: 'waived', correlation: { key: 'review:1' } }],
    },
    reviewComments: [
      {
        body: [
          '## ⏱ Timing Log',
          '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
          '|---|---|---|---|---|---|---|---|',
          '| 2026-09-15 01:00:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record 01M2H000000000000000000001; result=waived | <!-- row-sec: a=0 i=0 -->',
        ].join('\n'),
      },
    ],
  };

  const result = await reviewAgentValidationAction.verify(
    {
      review: {
        repo: 'kburson/ai-task-manager',
        loadWorkflowBoundary: async () => ({
          isWaived: () => true,
          decision: () => ({
            outcome: 'waived',
            authority: { recordId: '01M2H000000000000000000001', revision: 1 },
          }),
        }),
      },
    },
    snapshot
  );

  assert.deepEqual(result, { status: 'incomplete', reason: 'stale-waiver-evidence' });
});

test('verify pauses when Review comments are unreadable or no reader exists', async () => {
  const context = {
    review: {
      repo: 'kburson/ai-task-manager',
      loadWorkflowBoundary: async () => ({
        isWaived: () => true,
        decision: () => ({
          outcome: 'waived',
          authority: { recordId: '01M2H000000000000000000001', revision: 1 },
        }),
      }),
    },
  };
  const snapshot = {
    issue: { value: 1629 },
    body: { value: '<!-- aitm-entered-review ts="2026-09-15T00:00:00.000Z" -->' },
    headSha: { value: 'a'.repeat(40) },
    actionLedger: { status: 'clean', events: [{ phase: 'waived' }] },
  };
  for (const reviewCommentsStatus of ['error', undefined]) {
    const result = await reviewAgentValidationAction.verify(context, {
      ...snapshot,
      reviewCommentsStatus,
    });
    assert.deepEqual(result, { status: 'paused', reason: 'review-comments-unavailable' });
  }
});

test('waived semantic review refuses unusable authority before clearing a failure carrier', async () => {
  let mutated = false;
  let posted = false;

  await assert.rejects(
    emitReviewGateWaivedTimeline({
      target: '#1629',
      issueNumber: 1629,
      repo: 'kburson/ai-task-manager',
      ts: '2026-09-15T01:00:00.000Z',
      delta: { activeSec: 7, idleSec: 3 },
      wordMarker: 10,
      fullWordMarker: 20,
      evidence: {
        authority: { recordId: '01M2H000000000000000000001', revision: 1 },
        acceptedSha: 'accepted-test-evidence',
        requirementId: 'review.semantic-resident',
      },
      deps: {
        mutateBodyFn: async () => {
          mutated = true;
        },
        safePostTiming: async () => {
          posted = true;
        },
        buildRow: (row) => row,
      },
    }),
    /unusable waiver authority/
  );

  assert.equal(mutated, false);
  assert.equal(posted, false);
});

test('waived semantic review requires the failure-retirement capability before posting', async () => {
  let posted = false;

  await assert.rejects(
    emitReviewGateWaivedTimeline({
      target: '#1629',
      issueNumber: 1629,
      repo: 'kburson/ai-task-manager',
      ts: '2026-09-15T01:00:00.000Z',
      delta: { activeSec: 7, idleSec: 3 },
      wordMarker: 10,
      fullWordMarker: 20,
      evidence: {
        authority: { recordId: '01M2H000000000000000000001', revision: 1 },
        acceptedSha: 'a'.repeat(40),
        requirementId: 'review.semantic-resident',
      },
      deps: {
        safePostTiming: async () => {
          posted = true;
          return { ok: true };
        },
        readTimingCommentBodyFn: async () => ({
          status: 'found',
          body: waiverTimingBody(),
        }),
        buildRow: (row) => row,
      },
    }),
    /failure retirement capability unavailable/
  );

  assert.equal(posted, false);
});

test('waived semantic review preserves the failure carrier when the terminal row is only queued', async () => {
  let mutated = false;

  await assert.rejects(
    emitReviewGateWaivedTimeline({
      target: '#1629',
      issueNumber: 1629,
      repo: 'kburson/ai-task-manager',
      ts: '2026-09-15T01:00:00.000Z',
      delta: { activeSec: 7, idleSec: 3 },
      wordMarker: 10,
      fullWordMarker: 20,
      evidence: {
        authority: { recordId: '01M2H000000000000000000001', revision: 1 },
        acceptedSha: 'a'.repeat(40),
        requirementId: 'review.semantic-resident',
      },
      deps: {
        mutateBodyFn: async () => {
          mutated = true;
        },
        safePostTiming: async () => ({ ok: false, queued: true }),
        buildRow: (row) => row,
      },
    }),
    /terminal waiver row was not posted/
  );

  assert.equal(mutated, false);
});

test('waived semantic review preserves the failure carrier when posted evidence fails readback', async () => {
  let mutated = false;

  await assert.rejects(
    emitReviewGateWaivedTimeline({
      target: '#1629',
      issueNumber: 1629,
      repo: 'kburson/ai-task-manager',
      ts: '2026-09-15T01:00:00.000Z',
      delta: { activeSec: 7, idleSec: 3 },
      wordMarker: 10,
      fullWordMarker: 20,
      evidence: {
        authority: { recordId: '01M2H000000000000000000001', revision: 1 },
        acceptedSha: 'a'.repeat(40),
        requirementId: 'review.semantic-resident',
      },
      deps: {
        mutateBodyFn: async () => {
          mutated = true;
        },
        safePostTiming: async () => ({ ok: true }),
        readTimingCommentBodyFn: async () => ({
          status: 'found',
          body: waiverTimingBody().replace('review:waived', 'issue:closed'),
        }),
        buildRow: (row) => row,
      },
    }),
    /failed readback verification/
  );

  assert.equal(mutated, false);
});

test('verify re-runs a durable waiver when a stale failure carrier still needs retirement', async () => {
  const snapshot = {
    issue: { value: 1629 },
    body: {
      value: [
        '<!-- aitm-entered-review ts="2026-09-15T00:00:00.000Z" -->',
        '<!-- aitm-review-failed:start -->',
        '**Agent Review Gate failed.**',
        '<!-- aitm-review-failed:end -->',
      ].join('\n'),
    },
    headSha: { value: 'a'.repeat(40) },
    stateVisitId: 'review:1',
    actionLedger: {
      status: 'clean',
      events: [{ phase: 'waived', correlation: { key: 'review:1' } }],
    },
  };

  const result = await reviewAgentValidationAction.verify(
    {
      review: {
        repo: 'kburson/ai-task-manager',
        loadWorkflowBoundary: async () => ({
          isWaived: () => true,
          decision: () => ({
            authority: { recordId: 'record-1', revision: 1 },
          }),
        }),
      },
    },
    snapshot
  );

  assert.deepEqual(result, { status: 'incomplete', reason: 'review-failed' });
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
      kind: 'resident-waived',
      state: 'review',
      result: { status: 'waived' },
    }),
    { status: 'waived', result: { status: 'waived' } }
  );
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

test('Review reports waived semantic work without claiming verification passed', () => {
  const waived = reviewCompletionMessage('#1629', 'waived');
  assert.match(waived, /semantic resident action waived/i);
  assert.doesNotMatch(waived, /all verification passed|review_complete/i);
  assert.equal(
    reviewCompletionMessage('#1629', 'complete'),
    '✓ #1629 moved to Review — all verification passed.'
  );
});

test('resume, switch, and the dispatcher carry the Review resident wake', () => {
  assert.match(resumeSrc, /resumeReviewActionsAfterBind/);
  assert.match(switchSrc, /resumeReviewActionsAfterBind/);
  assert.match(trackerSrc, /resumeReviewActionsAfterBind/);
  assert.match(trackerSrc, /state !== 'review'/);
});

// #1488 — `verbStart` used to re-issue the wake AFTER delegating to
// `verbResume`, which had already declined it for the `start` verb. That second
// call re-ran the Review action and re-paused the timer it had just started, so
// `deliver` — which requires Review state AND a running binding together — was
// structurally unreachable. The decision belongs in exactly one place.
test('#1488: verbStart delegates to verbResume and does not re-issue the Review wake', () => {
  assert.match(startSrc, /verbResume\(ctx\)/);
  assert.doesNotMatch(
    startSrc,
    /resumeReviewActionsAfterBind/,
    'verbStart must not re-issue the Review wake that verbResume already declined for `start`'
  );
});

test('#1488: the wake decision exempts the start verb and no other', () => {
  const calls = [];
  const ctx = (verb, rest = []) => ({
    verb,
    rest,
    resumeReviewActionsAfterBind: async (target, command) => {
      calls.push({ target, command });
    },
  });

  // `start` binds without waking Review residents, so the session it opened
  // survives — this is what makes governed delivery reachable from Review.
  wakeReviewResidents(ctx('start', ['#1485']), '#1485');
  assert.deepEqual(calls, []);
});

test('#1488: resume and rebind still wake Review residents', async () => {
  const calls = [];
  const ctx = (verb, rest = []) => ({
    verb,
    rest,
    resumeReviewActionsAfterBind: async (target, command) => {
      calls.push({ target, command });
    },
  });

  // No explicit issue argument — un-pausing the last active task.
  await wakeReviewResidents(ctx('resume'), '#1485');
  assert.deepEqual(calls, [{ target: '#1485', command: 'resume' }]);

  // Explicit issue argument — rebinding to a named issue.
  calls.length = 0;
  await wakeReviewResidents(ctx('resume', ['#1485']), '#1485');
  assert.deepEqual(calls, [{ target: '#1485', command: 'rebind' }]);
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
