#!/usr/bin/env node
// @story #1512
// Manual code review is a CI-first, exact-head human PR approval gate.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  evaluateManualCodeReview,
  resolveManualCodeReviewer,
} from '../../../../task-tracker/lib/manual-code-review.mjs';
import { deliver, makeHarness } from '../verbs/deliver-test-harness.mjs';

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);

function pullRequest(overrides = {}) {
  return {
    number: 1512,
    author: { login: 'aitm-author', isBot: false },
    reviewRequests: [],
    reviews: [],
    ...overrides,
  };
}

test('@me resolves to the authenticated user and an explicit reviewer is preserved', () => {
  assert.equal(
    resolveManualCodeReviewer({ configuredReviewer: '@me', authenticatedLogin: 'kburson' }),
    'kburson'
  );
  assert.equal(
    resolveManualCodeReviewer({ configuredReviewer: ' teammate ', authenticatedLogin: 'kburson' }),
    'teammate'
  );
  assert.throws(
    () => resolveManualCodeReviewer({ configuredReviewer: '@me', authenticatedLogin: '' }),
    /manual-code-review:reviewer-unresolved/
  );
});

test('disabled gate authorizes delivery without PR review evidence', () => {
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: false,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest(),
    }),
    { status: 'authorized', mode: 'full-auto' }
  );
});

test('missing approval requests the eligible human reviewer', () => {
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest(),
    }),
    {
      status: 'request-review',
      reviewerLogin: 'kburson',
      reason: 'approval-missing',
    }
  );
});

test('an existing review request waits without requesting the same reviewer again', () => {
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest({ reviewRequests: [{ login: 'KBurson', isBot: false }] }),
    }),
    {
      status: 'waiting',
      reviewerLogin: 'kburson',
      reason: 'approval-missing',
    }
  );
});

test('only the latest applicable exact-head review can authorize delivery', () => {
  const reviews = [
    {
      authorLogin: 'kburson',
      authorIsBot: false,
      state: 'APPROVED',
      commitOid: OLD_HEAD,
      submittedAt: '2026-09-04T10:00:00Z',
    },
    {
      authorLogin: 'kburson',
      authorIsBot: false,
      state: 'CHANGES_REQUESTED',
      commitOid: HEAD,
      submittedAt: '2026-09-04T10:01:00Z',
    },
    {
      authorLogin: 'kburson',
      authorIsBot: false,
      state: 'APPROVED',
      commitOid: HEAD,
      submittedAt: '2026-09-04T10:02:00Z',
    },
  ];
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest({ reviews }),
    }),
    {
      status: 'authorized',
      mode: 'human-pr-review',
      reviewerLogin: 'kburson',
      approvedHeadSha: HEAD,
      submittedAt: '2026-09-04T10:02:00Z',
    }
  );

  reviews.push({
    authorLogin: 'kburson',
    authorIsBot: false,
    state: 'COMMENTED',
    commitOid: HEAD,
    submittedAt: '2026-09-04T10:02:30Z',
  });
  assert.equal(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest({ reviews }),
    }).status,
    'authorized'
  );

  reviews.push({
    authorLogin: 'kburson',
    authorIsBot: false,
    state: 'DISMISSED',
    commitOid: HEAD,
    submittedAt: '2026-09-04T10:03:00Z',
  });
  assert.equal(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'kburson',
      pullRequest: pullRequest({ reviews }),
    }).status,
    'request-review'
  );
});

test('review assignment and stale-head approval are not approval evidence', () => {
  const decision = evaluateManualCodeReview({
    gateEnabled: true,
    expectedHeadSha: HEAD,
    reviewerLogin: 'kburson',
    pullRequest: pullRequest({
      reviewRequests: [{ login: 'kburson', isBot: false }],
      reviews: [
        {
          authorLogin: 'kburson',
          authorIsBot: false,
          state: 'APPROVED',
          commitOid: OLD_HEAD,
          submittedAt: '2026-09-04T10:00:00Z',
        },
      ],
    }),
  });
  assert.equal(decision.status, 'waiting');
});

test('the PR author, bots, and unreadable evidence fail closed', () => {
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'aitm-author',
      pullRequest: pullRequest(),
    }),
    { status: 'refused', reason: 'reviewer-is-author' }
  );
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: HEAD,
      reviewerLogin: 'review-bot',
      pullRequest: pullRequest({
        reviewRequests: [{ login: 'review-bot', isBot: true }],
      }),
    }),
    { status: 'refused', reason: 'reviewer-bot' }
  );
  assert.deepEqual(
    evaluateManualCodeReview({
      gateEnabled: true,
      expectedHeadSha: 'not-a-sha',
      reviewerLogin: 'kburson',
      pullRequest: pullRequest(),
    }),
    { status: 'refused', reason: 'evidence-unreadable' }
  );
});

test('delivery checks CI before requesting a reviewer and emits no delivery intent', async () => {
  const harness = makeHarness({ manualCodeReview: true });
  const result = await deliver(harness);
  assert.deepEqual(result, {
    status: 'manual-review-required',
    reason: 'approval-missing',
    prNumber: 1400,
    reviewerLogin: 'kburson',
    expectedHeadSha: HEAD,
    reviewRequested: true,
  });
  assert.deepEqual(harness.calls.events, ['comments:read', 'checks:read', 'review:request']);
  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.calls.requestPullRequestReview, 1);
});

test('exact-head human PR approval authorizes normal provider delivery', async () => {
  const harness = makeHarness({
    manualCodeReview: true,
    reviews: [
      {
        authorLogin: 'kburson',
        authorIsBot: false,
        state: 'APPROVED',
        commitOid: HEAD,
        submittedAt: '2026-09-04T10:02:00Z',
      },
    ],
  });
  const result = await deliver(harness);
  assert.equal(result.status, 'action-required');
  assert.equal(harness.calls.requestPullRequestReview, 0);
  assert.deepEqual(harness.calls.events.slice(0, 2), ['comments:read', 'checks:read']);
  assert.ok(harness.calls.events.includes('intent:post'));
});
