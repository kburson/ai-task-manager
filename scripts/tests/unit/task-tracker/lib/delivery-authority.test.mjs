// @story #1381

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DeliveryAuthorityError,
  resolveAcceptedDeliveryAuthority,
  resolveAcceptedDeliveryHead,
  resolveDeliveryReviewAuthority,
} from '../../../../task-tracker/lib/delivery-authority.mjs';

const ACCEPTED = 'a'.repeat(40);
const LATER = 'b'.repeat(40);
const BRANCH = 'codex/939-full-auto-merge';

function pullRequest(number, headRefOid = ACCEPTED) {
  return {
    number,
    state: 'MERGED',
    headRefName: BRANCH,
    headRefOid,
    baseRefName: 'trunk',
    mergeCommitSha: 'c'.repeat(40),
  };
}

function input(overrides = {}) {
  return {
    issueNumber: 1397,
    branch: BRANCH,
    localHeadSha: LATER,
    testReceiptSha: ACCEPTED,
    reviewReceiptSha: ACCEPTED,
    agentReviewPassed: true,
    pullRequests: [pullRequest(1398), pullRequest(1402, LATER)],
    ...overrides,
  };
}

const WAIVER_RECORD_ID = '01M2H000000000000000000001';

function waivedReviewInput(overrides = {}) {
  const authority = { recordId: WAIVER_RECORD_ID, revision: 2 };
  return {
    agentReviewPassed: false,
    terminalReviewOutcome: {
      outcome: 'waived',
      evidence: {
        requirementId: 'review.semantic-resident',
        authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
      },
    },
    testReceiptSha: ACCEPTED,
    acceptedReviewSha: null,
    workflowPolicy: {
      status: 'policy-compatible',
      isWaived: (id) => id === 'review.semantic-resident',
      decision: () => ({ outcome: 'waived', authority }),
    },
    ...overrides,
  };
}

test('resolves ordinary passed and current waived review authority without conflating outcomes', () => {
  const passed = resolveDeliveryReviewAuthority({
    agentReviewPassed: true,
    terminalReviewOutcome: { outcome: 'passed', evidence: null },
    testReceiptSha: ACCEPTED,
    acceptedReviewSha: ACCEPTED,
    workflowPolicy: null,
  });
  assert.deepEqual(passed, { outcome: 'passed', acceptedSha: ACCEPTED, authority: null });

  const waived = resolveDeliveryReviewAuthority(waivedReviewInput());
  assert.deepEqual(waived, {
    outcome: 'waived',
    acceptedSha: ACCEPTED,
    authority: { recordId: WAIVER_RECORD_ID, revision: 2 },
  });
  assert.ok(Object.isFrozen(waived));
  assert.ok(Object.isFrozen(waived.authority));
});

test('waived review authority fails closed on missing, stale, mismatched, or unavailable authority', () => {
  const cases = [
    ['terminal-outcome', { terminalReviewOutcome: null }],
    ['terminal-outcome', { terminalReviewOutcome: { outcome: 'passed', evidence: null } }],
    ['policy', { workflowPolicy: { status: 'blocked', isWaived: () => false } }],
    [
      'requirement',
      {
        terminalReviewOutcome: {
          outcome: 'waived',
          evidence: {
            requirementId: 'review.peer',
            authority: { recordId: WAIVER_RECORD_ID },
          },
        },
      },
    ],
    [
      'authority',
      {
        workflowPolicy: {
          status: 'policy-compatible',
          isWaived: () => true,
          decision: () => ({
            outcome: 'waived',
            authority: { recordId: '01M2H000000000000000000099', revision: 2 },
          }),
        },
      },
    ],
    [
      'authority',
      {
        terminalReviewOutcome: {
          outcome: 'waived',
          evidence: {
            requirementId: 'review.semantic-resident',
            authority: { recordId: WAIVER_RECORD_ID, revision: 1 },
          },
        },
      },
    ],
    ['accepted-head', { testReceiptSha: 'short' }],
    ['accepted-head', { acceptedReviewSha: LATER }],
  ];

  for (const [category, overrides] of cases) {
    assert.throws(
      () => resolveDeliveryReviewAuthority(waivedReviewInput(overrides)),
      new RegExp(`delivery-review-authority:${category}`)
    );
  }
});

test('accepted head rejects malformed typed authority and inconsistent review receipts', () => {
  assert.throws(
    () =>
      resolveAcceptedDeliveryHead({
        localHeadSha: ACCEPTED,
        testReceiptSha: ACCEPTED,
        reviewReceiptSha: null,
        agentReviewPassed: false,
        reviewAuthority: { outcome: 'waived', acceptedSha: ACCEPTED },
      }),
    /delivery-authority:accepted-evidence/
  );

  assert.throws(
    () =>
      resolveAcceptedDeliveryHead({
        localHeadSha: ACCEPTED,
        testReceiptSha: ACCEPTED,
        reviewReceiptSha: LATER,
        agentReviewPassed: false,
        reviewAuthority: resolveDeliveryReviewAuthority(waivedReviewInput()),
      }),
    /delivery-authority:accepted-evidence/
  );
});

test('accepted delivery authority consumes typed waived authority without a passed boolean', () => {
  const reviewAuthority = resolveDeliveryReviewAuthority(waivedReviewInput());
  const authority = resolveAcceptedDeliveryAuthority(
    input({
      agentReviewPassed: false,
      reviewAuthority,
    })
  );
  assert.equal(authority.acceptedSha, ACCEPTED);
  assert.equal(reviewAuthority.outcome, 'waived');
});

test('resolves immutable accepted authority after the reused branch advances', () => {
  for (const pullRequests of [
    [pullRequest(1398), pullRequest(1402, LATER)],
    [pullRequest(1402, LATER), pullRequest(1398)],
  ]) {
    const authority = resolveAcceptedDeliveryAuthority(input({ pullRequests }));

    assert.deepEqual(authority, {
      issueNumber: 1397,
      acceptedSha: ACCEPTED,
      observedLocalHeadSha: LATER,
      headRelation: 'advanced',
      pullRequest: pullRequest(1398),
    });
    assert.ok(Object.isFrozen(authority));
    assert.ok(Object.isFrozen(authority.pullRequest));
  }
});

test('reports current only when the local and accepted heads are identical', () => {
  const authority = resolveAcceptedDeliveryAuthority(
    input({
      localHeadSha: ACCEPTED,
      pullRequests: [pullRequest(1398)],
    })
  );

  assert.equal(authority.headRelation, 'current');
  assert.equal(authority.observedLocalHeadSha, ACCEPTED);
  assert.equal(resolveAcceptedDeliveryHead(input({ localHeadSha: ACCEPTED })), ACCEPTED);
});

test('refuses invalid lifecycle evidence and zero or duplicate exact-head PRs', () => {
  const cases = [
    ['input', { issueNumber: 0 }],
    ['accepted-evidence', { localHeadSha: 'short' }],
    ['accepted-evidence', { testReceiptSha: 'short' }],
    ['accepted-evidence', { reviewReceiptSha: LATER }],
    ['accepted-evidence', { agentReviewPassed: false }],
    ['ambiguous-pr', { pullRequests: [pullRequest(1402, LATER)] }],
    ['ambiguous-pr', { pullRequests: [pullRequest(1398), pullRequest(1399)] }],
    ['branch-mismatch', { pullRequests: [{ ...pullRequest(1398), headRefName: 'other' }] }],
  ];

  for (const [category, overrides] of cases) {
    assert.throws(
      () => resolveAcceptedDeliveryAuthority(input(overrides)),
      (error) =>
        error instanceof DeliveryAuthorityError &&
        error.category === category &&
        error.message === `delivery-authority:${category}`
    );
  }
});
