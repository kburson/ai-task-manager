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
const OTHER_HEAD = 'b'.repeat(40);

function evidence(accepted = true, approvedSha = HEAD) {
  return { accepted, approvedSha };
}

function decision(session, projectConfig = {}, human = null, fullAuto = evidence()) {
  return resolveReviewAuthorization({
    session,
    projectConfig,
    acceptedHeadSha: HEAD,
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
  assert.equal(decision(session, {}, evidence(true, OTHER_HEAD), null).mode, 'missing');
  assert.deepEqual(decision(session, {}, evidence(), null), {
    mode: 'human',
    standing: true,
    source: 'human-evidence',
  });
});

test('fresh Test and Agent Review cannot rebind an approval from an older head', () => {
  const session = applyChoice({ gates: {}, lastPromptedParent: null }, 'review');
  const stale = decision(session, {}, null, evidence(true, OTHER_HEAD));
  assert.equal(stale.mode, 'missing');
  const value = preflight();
  value.issue.reviewAuthorization = stale;
  assert.throws(() => validateDeliveryPreflight(value), /approval-evidence/);

  value.issue.reviewAuthorization = decision(session, {}, null, evidence(true, HEAD));
  assert.equal(validateDeliveryPreflight(value).expectedHeadSha, HEAD);
});

test('stale Full-Auto body evidence cannot survive auto off or reset', () => {
  for (const session of [
    applyChoice({ gates: {}, lastPromptedParent: null }, 'off'),
    applyChoice(applyChoice({ gates: {}, lastPromptedParent: null }, 'both'), 'reset'),
  ]) {
    const value = preflight();
    value.issue.approvalEvidence = 'full-auto';
    value.issue.reviewAuthorization = decision(session, { gateReviewToDone: true });
    assert.throws(() => validateDeliveryPreflight(value), /approval-evidence/);
  }
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
  let approvedHead = HEAD;
  let body = [
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
      getHeadSha: async () => approvedHead,
      detectFullAuto: () => ({ fired: true, signals: 'session=1' }),
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      deriveDrivers: () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate }) => {
        written = mutate(body);
        body = written;
        return { status: 'ok', body };
      },
      reconcileReviewApprovedTiming: async () => {},
    },
  });
  assert.equal(result.fullAuto, true);
  assert.match(written, new RegExp(`aitm-review-approved[^>]*approved-sha="${HEAD}"`));
  assert.match(written, /aitm-review-approved[^>]*full-auto="yes"/);

  approvedHead = OTHER_HEAD;
  const refreshed = await runApprove({
    issueNumber: 940,
    cfg: { repo: 'o/r' },
    projectDir: process.cwd(),
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'review',
      fetchIssueBody: async () => body,
      getHeadSha: async () => approvedHead,
      detectFullAuto: () => ({ fired: true, signals: 'session=1' }),
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      deriveDrivers: () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate }) => {
        written = mutate(body);
        body = written;
        return { status: 'ok', body };
      },
      reconcileReviewApprovedTiming: async () => {},
    },
  });
  assert.equal(refreshed.status, 'approved');
  assert.equal(refreshed.fullAuto, true);
  assert.match(written, new RegExp(`aitm-review-approved[^>]*approved-sha="${OTHER_HEAD}"`));
  assert.doesNotMatch(written, new RegExp(`approved-sha="${HEAD}"`));
});

test('stale human approval cannot be silently rebound after head drift', async () => {
  const staleHumanBody = [
    '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-22T01:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->',
    '- [x] Final Review Passed',
    `<!-- aitm-review-approved ts="2026-08-22T00:00:00Z" approved-sha="${HEAD}" -->`,
  ].join('\n');

  const approveOnNewHead = async ({ human }) => {
    let written = staleHumanBody;
    const result = await runApprove({
      issueNumber: human ? 942 : 941,
      cfg: { repo: 'o/r' },
      projectDir: process.cwd(),
      human,
      deps: {
        assertBound: () => {},
        getBoardState: async () => 'review',
        fetchIssueBody: async () => written,
        getHeadSha: async () => OTHER_HEAD,
        detectFullAuto: () => ({ fired: true, signals: 'session=1' }),
        fetchComments: async () => [],
        fetchProjectValues: async () => ({}),
        deriveDrivers: () => [],
        promptDrivers: async () => [],
        postComment: async () => {},
        mutateIssueBody: async ({ mutate }) => {
          written = mutate(written);
          return { status: 'ok', body: written };
        },
        reconcileReviewApprovedTiming: async () => {},
      },
    });
    return { result, written };
  };

  const automated = await approveOnNewHead({ human: false });
  assert.equal(automated.result.fullAuto, true);
  assert.match(automated.written, /full-auto="yes"/);
  assert.match(automated.written, new RegExp(`approved-sha="${OTHER_HEAD}"`));

  const explicitHuman = await approveOnNewHead({ human: true });
  assert.equal(explicitHuman.result.fullAuto, false);
  assert.doesNotMatch(explicitHuman.written, /full-auto="yes"/);
  assert.match(explicitHuman.written, new RegExp(`approved-sha="${OTHER_HEAD}"`));
});
