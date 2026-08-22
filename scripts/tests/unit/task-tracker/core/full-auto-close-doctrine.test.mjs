// @story #939
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  resolveReviewAuthorization,
  resolveGate,
} from '../../../../task-tracker/lib/gate-resolve.mjs';
import { applyChoice } from '../../../../task-tracker/lib/session-store.mjs';
import { validateDeliveryPreflight } from '../../../../task-tracker/lib/delivery-preflight.mjs';
import { runApprove } from '../../../../task-tracker/verbs/approve.mjs';

const HEAD = 'a'.repeat(40);

function evidence(accepted = true) {
  return { accepted, currentHead: true };
}

function decision(session, projectConfig = {}, human = null, fullAuto = evidence()) {
  return resolveReviewAuthorization({
    session,
    projectConfig,
    humanApprovalEvidence: human,
    fullAutoApprovalEvidence: fullAuto,
  });
}

test('auto both/review provide repeatable standing authority; off and reset revoke/re-evaluate it', () => {
  const fresh = {
    sessionId: 's',
    gates: { analysisToDevelopment: null, reviewToDone: null },
    lastPromptedParent: null,
  };
  for (const choice of ['both', 'review']) {
    const session = applyChoice(fresh, choice);
    assert.equal(resolveGate('reviewToDone', { session }), false);
    assert.deepEqual(decision(session), {
      mode: 'full-auto',
      standing: true,
      source: 'session',
    });
    assert.equal(decision(session).mode, 'full-auto', 'retry keeps standing authority');
  }

  const off = applyChoice(fresh, 'off');
  assert.deepEqual(decision(off), { mode: 'missing', standing: false, source: 'none' });
  assert.equal(decision(off, {}, evidence(), null).mode, 'human');

  const reset = applyChoice(applyChoice(fresh, 'both'), 'reset');
  assert.equal(decision(reset, { gateReviewToDone: false }).source, 'project');
  assert.deepEqual(decision(reset, { gateReviewToDone: true }), {
    mode: 'missing',
    standing: false,
    source: 'none',
  });
});

test('approval evidence must be current-head and genuine human approval remains independent', () => {
  const session = applyChoice({ gates: {}, lastPromptedParent: null }, 'off');
  assert.equal(decision(session, {}, { accepted: true, currentHead: false }, null).mode, 'missing');
  assert.deepEqual(decision(session, {}, evidence(), null), {
    mode: 'human',
    standing: true,
    source: 'human-evidence',
  });
});

function preflight() {
  return {
    issue: {
      number: 939,
      state: 'OPEN',
      projectState: 'Review',
      assignees: ['kpburson'],
      agentReviewPassed: true,
      approvalEvidence: null,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'session' },
    },
    binding: { issueNumber: 939, timerState: 'running', branch: 'codex/939' },
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    pullRequests: [
      {
        number: 1400,
        state: 'OPEN',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/939',
        headRefOid: HEAD,
        mergeable: 'MERGEABLE',
      },
    ],
    localHeadSha: HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    checks: {
      readable: true,
      required: [{ name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    dirtyPaths: [],
    config: {
      repo: 'kburson/ai-task-manager',
      assignee: 'kpburson',
      trunkRef: 'origin/trunk',
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
      repositoryMergeMethods: ['squash'],
    },
    commitSubjects: ['[#939] implement'],
  };
}

test('Full-Auto changes only review authorization; delivery safety gates still refuse independently', () => {
  assert.equal(validateDeliveryPreflight(preflight()).expectedHeadSha, HEAD);
  const cases = [
    ['agent-review-evidence', (x) => (x.issue.agentReviewPassed = false)],
    ['head-mismatch', (x) => (x.testReceiptSha = 'b'.repeat(40))],
    ['dirty-overlap', (x) => x.dirtyPaths.push('tracked.mjs')],
    ['required-check-not-green', (x) => (x.checks.required[0].conclusion = 'FAILURE')],
    ['configuration', (x) => (x.config.fullAutoMerge.mechanism = 'unknown')],
  ];
  for (const [category, mutate] of cases) {
    const value = preflight();
    mutate(value);
    assert.throws(() => validateDeliveryPreflight(value), new RegExp(category));
  }
});

test('runApprove remains the audited producer of Full-Auto approval evidence', async () => {
  let written = '';
  const body = [
    '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-22T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->',
    '- [ ] Passed final human review',
  ].join('\n');
  const result = await runApprove({
    issueNumber: 939,
    cfg: { repo: 'o/r' },
    projectDir: process.cwd(),
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'review',
      fetchIssueBody: async () => body,
      detectFullAuto: () => ({ fired: true, signals: 'session=1' }),
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      deriveDrivers: () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate }) => ({ status: 'ok', body: (written = mutate(body)) }),
      reconcileReviewApprovedTiming: async () => {},
    },
  });
  assert.equal(result.fullAuto, true);
  assert.match(written, /aitm-review-approved[^>]*full-auto="yes"/);
});
