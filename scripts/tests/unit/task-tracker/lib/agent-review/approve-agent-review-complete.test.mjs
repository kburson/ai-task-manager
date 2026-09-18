// @story #881 #1629
//
// The human approval is the Review → Done EXIT condition. It is offered only
// once the Review state's ACTION — the Agent Review Gate — has completed with
// `result="pass"`. Before this, `approve` checked only that the board said
// `review`, so on #878 a human was asked to sign off on a story whose agent
// review had not run (and which the later gate run then rejected).

import { test } from 'node:test';
import '../../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

import {
  isAgentReviewComplete,
  agentReviewIncompleteReason,
  stampAgentReviewPassed,
  stampReviewFailed,
} from '../../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { runApprove } from '../../../../../task-tracker/verbs/approve.mjs';
import { computeScopeIdentity } from '../../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { loadWorkflowBoundary } from '../../../../../task-tracker/lib/workflow-policy/enforcement.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../../task-tracker/lib/workflow-policy/exception-record.mjs';

// `runApprove` takes the mutator lock, which mkdirs under projectDir — give it a
// real scratch dir rather than a path that cannot be created.
const PROJECT_DIR = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-approve-881-'));
const REPOSITORY = 'o/r';
const ISSUE_NUMBER = 881;
const APPROVED_SHA = 'a'.repeat(40);
const WAIVER_RECORD_ID = '01M2H000000000000000000001';
const WAIVER_GRANT_ID = '01M2H000000000000000000090';
const WAIVER_OPERATION_ID = `sha256:${'b'.repeat(64)}`;
const WAIVER_AUTHORIZATION = Object.freeze({
  reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_waiver',
  statement: 'For issue #881, waive the semantic resident review requirement.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
});

const UNTICKED = ['## Definition of Done', '', '- [ ] Agent Review Passed', ''].join('\n');
const VALID_UNTICKED = [
  '## User Story',
  'Original story',
  '## Scope',
  'Original scope',
  '## Acceptance Criteria',
  '- [ ] Original criterion',
  UNTICKED,
].join('\n');

const PASSED = stampAgentReviewPassed(UNTICKED, {
  ts: '2026-07-18T00:00:00.000Z',
  validators: ['body-sections', 'required-comments'],
});

function terminalWaiverComment({ revision = 2 } = {}) {
  return [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="${revision}" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
}

function semanticReviewWaiverRecord(body) {
  return {
    commentNodeId: 'IC_semantic_review_waiver',
    envelope: createWorkflowExceptionEnvelope({
      repository: REPOSITORY,
      issue: ISSUE_NUMBER,
      exceptionId: 'review-semantic-resident-waiver',
      revision: 1,
      status: 'active',
      scopeIdentity: computeScopeIdentity({
        repository: REPOSITORY,
        issue: ISSUE_NUMBER,
        body,
      }),
      requirementIds: ['review.semantic-resident'],
      constraints: [],
      reason: 'Test waiver for approve default clock regression coverage.',
      authorization: WAIVER_AUTHORIZATION,
      expiresAt: null,
      operationId: WAIVER_OPERATION_ID,
      createdAt: '2026-07-18T01:00:00.000Z',
      recordId: WAIVER_RECORD_ID,
      grantId: WAIVER_GRANT_ID,
    }),
  };
}

// ── the predicate ───────────────────────────────────────────────────────────

test('a body with no agent-review evidence is incomplete', () => {
  assert.equal(isAgentReviewComplete(UNTICKED), false);
  assert.equal(agentReviewIncompleteReason(UNTICKED), 'not-run');
});

test('a passing gate stamp completes the state action', () => {
  assert.equal(isAgentReviewComplete(PASSED), true);
  assert.equal(agentReviewIncompleteReason(PASSED), null);
});

test('a hand-ticked box with no run evidence is NOT complete', () => {
  const handTicked = UNTICKED.replace('- [ ] Agent Review Passed', '- [x] Agent Review Passed');
  assert.equal(isAgentReviewComplete(handTicked), false);
  assert.equal(agentReviewIncompleteReason(handTicked), 'not-run');
});

test('the evidence marker completes the action whether or not the box is ticked', () => {
  // `stampAgentReviewPassed` writes the marker and leaves the tick to the derived
  // ticking pass, so completeness must not depend on the checkbox state.
  assert.match(PASSED, /- \[ \] Agent Review Passed <!-- aitm-verified/);
  assert.equal(isAgentReviewComplete(PASSED.replace('- [ ]', '- [x]')), true);
});

test('an aitm-review-failed marker makes the action incomplete even alongside a pass stamp', () => {
  // The gate passed on an earlier run, then a later run objected. The objection
  // is the live state of the action.
  const failed = stampReviewFailed(PASSED, ['body-sections: Scope missing'], {
    ts: '2026-07-18T01:00:00.000Z',
  });
  assert.equal(isAgentReviewComplete(failed), false);
  assert.equal(agentReviewIncompleteReason(failed), 'review-failed');
});

test('clearing the failure marker restores completeness', async () => {
  const { clearReviewFailed } =
    await import('../../../../../task-tracker/lib/agent-review/review-gate.mjs');
  const failed = stampReviewFailed(PASSED, ['x'], { ts: '2026-07-18T01:00:00.000Z' });
  assert.equal(isAgentReviewComplete(clearReviewFailed(failed)), true);
});

test('empty and non-string bodies are incomplete, not crashes', () => {
  for (const b of ['', null, undefined, 42]) {
    assert.equal(isAgentReviewComplete(b), false);
    assert.equal(agentReviewIncompleteReason(b), 'not-run');
  }
});

// ── the verb ────────────────────────────────────────────────────────────────

function approveWith(body, extra = {}) {
  const calls = { mutated: 0, commented: 0 };
  let current = body;
  return {
    calls,
    getBody: () => current,
    run: () =>
      runApprove({
        issueNumber: ISSUE_NUMBER,
        cfg: { repo: REPOSITORY },
        projectDir: PROJECT_DIR,
        deps: {
          assertBound: () => {},
          getBoardState: async () => 'review',
          fetchIssueBody: async () => current,
          // Apply the caller's mutate for real: approve verifies its own stamp
          // persisted, so a constant echo fails the post-write check.
          mutateIssueBody: async ({ mutate, validateFreshBase, validateFreshBaseAsync } = {}) => {
            calls.mutated += 1;
            const next = typeof mutate === 'function' ? await mutate(current) : current;
            validateFreshBase?.(current, next);
            await validateFreshBaseAsync?.(current, next);
            current = next;
            return { body: current };
          },
          postComment: async () => {
            calls.commented += 1;
          },
          fetchComments: async () => [],
          getHeadSha: async () => APPROVED_SHA,
          resolveTestReceiptSha: () => APPROVED_SHA,
          fetchProjectValues: async () => ({}),
          promptDrivers: async () => [],
          deriveDrivers: () => [],
          detectFullAuto: () => ({ fired: true, signals: 'test' }),
          nowIso: () => '2026-07-18T02:00:00.000Z',
          reconcileReviewApprovedTiming: async () => ({
            status: 'posted',
            ts: '2026-07-18T02:00:00Z',
          }),
          loadWorkflowBoundary: async () => ({ isWaived: () => false }),
          ...extra,
        },
      }),
  };
}

test('approve refuses when the gate has not run, and writes nothing', async () => {
  const { calls, run } = approveWith(UNTICKED);
  const res = await run();
  assert.equal(res.status, 'agent-review-incomplete');
  assert.equal(res.reason, 'not-run');
  assert.match(res.message, /Run `\/task review #881` first/);
  assert.equal(calls.mutated, 0, 'no approval marker may be stamped');
  assert.equal(calls.commented, 0, 'no Review Notes may be posted');
});

test('approve refuses a live waiver without a matching terminal waived Review outcome', async () => {
  const failed = stampReviewFailed(UNTICKED, ['historical objection'], {
    ts: '2026-07-18T01:00:00.000Z',
  });
  const { calls, run } = approveWith(failed, {
    loadWorkflowBoundary: async () => ({
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  await assert.rejects(run, /semantic review waiver timing missing-or-unavailable/);
  assert.equal(calls.mutated, 0);
});

test('approve reports ambiguous timing authority instead of claiming review never ran', async () => {
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: '## ⏱ Timing Log' }, { body: '## ⏱ Timing Log' }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  await assert.rejects(run, /semantic review waiver timing ambiguous/);
  assert.equal(calls.mutated, 0);
});

test('approve accepts exact terminal waived Review authority without fabricating pass evidence', async () => {
  const terminalWaiver = terminalWaiverComment();
  const { calls, getBody, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  const result = await run();

  assert.notEqual(result.status, 'agent-review-incomplete');
  assert.equal(calls.mutated, 1);
  assert.doesNotMatch(getBody(), /gate="agent-review"[^>]*result="pass"/);
});

test('approve default clock uses canonical millisecond ISO for waiver boundary checks', async () => {
  const seenNow = [];
  const records = [semanticReviewWaiverRecord(VALID_UNTICKED)];
  const { calls, run } = approveWith(VALID_UNTICKED, {
    nowIso: undefined,
    fetchComments: async () => [{ body: terminalWaiverComment({ revision: 1 }) }],
    loadWorkflowBoundary: async (input) => {
      const { now } = input;
      seenNow.push(now);
      return loadWorkflowBoundary({
        ...input,
        runtime: {
          listRecords: async () => records,
        },
      });
    },
  });

  const result = await run();

  assert.equal(result.status, 'approved');
  assert.equal(calls.mutated, 1);
  assert.equal(seenNow.length, 3, 'initial, post-driver, and fresh-base checks');
  assert.ok(
    seenNow.every(
      (now) =>
        typeof now === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(now) &&
        new Date(now).toISOString() === now
    ),
    'approve sends canonical millisecond ISO instants to the real waiver resolver'
  );
});

test('approve refuses legacy abbreviated Test evidence for exact-head waiver authority', async () => {
  const terminalWaiver = terminalWaiverComment();
  const legacyBody = `${VALID_UNTICKED}\n<!-- aitm-dod-verified sha="${APPROVED_SHA.slice(0, 8)}" ts="2026-07-18T01:00:00.000Z" -->`;
  const { calls, run } = approveWith(legacyBody, {
    resolveTestReceiptSha: undefined,
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  await assert.rejects(run, /accepted head does not match Test receipt/);
  assert.equal(calls.mutated, 0);
});

test('approve rechecks waiver authority after driver collection before writing', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  let policyReads = 0;
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => {
      policyReads += 1;
      const waived = policyReads === 1;
      return {
        status: 'policy-compatible',
        scopeIdentity: computeScopeIdentity({ repository, issue, body }),
        isWaived: (id) => waived && id === 'review.semantic-resident',
        decision: () =>
          waived
            ? {
                outcome: 'waived',
                authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
              }
            : { outcome: 'required' },
      };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 0);
});

test('approve rechecks waiver authority inside the fresh-base write attempt', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  let policyReads = 0;
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => {
      policyReads += 1;
      const waived = policyReads < 3;
      return {
        status: 'policy-compatible',
        scopeIdentity: computeScopeIdentity({ repository, issue, body }),
        isWaived: (id) => waived && id === 'review.semantic-resident',
        decision: () =>
          waived
            ? {
                outcome: 'waived',
                authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
              }
            : { outcome: 'required' },
      };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 1);
  assert.equal(policyReads, 3);
});

test('approve refuses a waiver when HEAD changes during driver collection', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  let headReads = 0;
  const { calls, run } = approveWith(VALID_UNTICKED, {
    getHeadSha: async () => (++headReads === 1 ? APPROVED_SHA : 'b'.repeat(40)),
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  await assert.rejects(run, /HEAD changed before approval write/);
  assert.equal(calls.mutated, 0);
});

test('approve binds waived authority to the Test receipt rather than local HEAD alone', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    resolveTestReceiptSha: () => 'b'.repeat(40),
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
  });

  await assert.rejects(run, /accepted head does not match Test receipt/);
  assert.equal(calls.mutated, 0);
});

test('approve refuses a waiver stamp when the fresh body scope changed after validation', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  const initial = VALID_UNTICKED;
  const changed = initial.replace('Original scope', 'Expanded concurrent scope');
  const { calls, run } = approveWith(initial, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      calls.mutated += 1;
      const next = mutate(changed);
      validateFreshBase?.(changed, next);
      return { body: next };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 1);
});

test('approve refuses a waiver stamp when the fresh Test receipt changes without a scope change', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  const initial = `${VALID_UNTICKED}\n<!-- test-receipt current -->`;
  const changed = initial.replace('test-receipt current', 'test-receipt changed');
  const { calls, run } = approveWith(initial, {
    resolveTestReceiptSha: (body) =>
      body.includes('test-receipt changed') ? 'b'.repeat(40) : APPROVED_SHA,
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      calls.mutated += 1;
      const next = mutate(changed);
      validateFreshBase?.(changed, next);
      return { body: next };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 1);
});

test('approve still checks waiver scope when fresh pass evidence appears concurrently', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  const changedWithPass = stampAgentReviewPassed(
    VALID_UNTICKED.replace('Original scope', 'Expanded concurrent scope'),
    { ts: '2026-07-18T01:59:00.000Z', validators: ['body-sections'] }
  );
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      calls.mutated += 1;
      const next = mutate(changedWithPass);
      validateFreshBase?.(changedWithPass, next);
      return { body: next };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 1);
});

test('approve refuses a waiver stamp when a fresh failure carrier appears after validation', async () => {
  const terminalWaiver = [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '|---|---|---|---|---|---|---|---|',
    `| 2026-07-18 01:30:00 +00:00 | review:waived |  |  |  | 10 | semantic resident action waived — requirement review.semantic-resident; authority record ${WAIVER_RECORD_ID}; result=waived <!-- aitm-review-waiver requirement="review.semantic-resident" record-id="${WAIVER_RECORD_ID}" revision="2" accepted-sha="${APPROVED_SHA}" --> | <!-- row-sec: a=0 i=0 -->`,
  ].join('\n');
  const failed = stampReviewFailed(VALID_UNTICKED, ['new concurrent objection'], {
    ts: '2026-07-18T01:59:00.000Z',
  });
  const { calls, run } = approveWith(VALID_UNTICKED, {
    fetchComments: async () => [{ body: terminalWaiver }],
    loadWorkflowBoundary: async ({ repository, issue, body }) => ({
      status: 'policy-compatible',
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({
        outcome: 'waived',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      }),
    }),
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      calls.mutated += 1;
      const next = mutate(failed);
      validateFreshBase?.(failed, next);
      return { body: next };
    },
  });

  await assert.rejects(run, /waiver authority changed before approval write/);
  assert.equal(calls.mutated, 1);
});

test('approve refuses while an objection is unresolved', async () => {
  const failed = stampReviewFailed(PASSED, ['body-sections: Scope missing'], {
    ts: '2026-07-18T01:00:00.000Z',
  });
  const { calls, run } = approveWith(failed);
  const res = await run();
  assert.equal(res.status, 'agent-review-incomplete');
  assert.equal(res.reason, 'review-failed');
  assert.match(res.message, /aitm-review-failed/);
  assert.equal(calls.mutated, 0);
});

test('approve proceeds once the state action has passed', async () => {
  const { run } = approveWith(PASSED);
  const res = await run();
  assert.notEqual(
    res.status,
    'agent-review-incomplete',
    'a passing gate must not be blocked by this check'
  );
});

test('ordinary approval refuses when fresh pass evidence disappears before the write', async () => {
  const { calls, run } = approveWith(PASSED, {
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      calls.mutated += 1;
      const next = mutate(UNTICKED);
      validateFreshBase?.(UNTICKED, next);
      return { body: next };
    },
  });

  await assert.rejects(run, /agent review evidence changed before approval write/);
  assert.equal(calls.mutated, 1);
});

test('the wrong-state check still precedes the completeness check', async () => {
  const res = await runApprove({
    issueNumber: 881,
    cfg: { repo: 'o/r' },
    projectDir: PROJECT_DIR,
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'develop',
      fetchIssueBody: async () => UNTICKED,
    },
  });
  assert.equal(res.status, 'wrong-state');
});
