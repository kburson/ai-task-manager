// @story #1381

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DeliveryAuthorityError,
  resolveAcceptedDeliveryAuthority,
  resolveAcceptedDeliveryHead,
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
