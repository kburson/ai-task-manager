// @story #1683

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { NEXT_HEAD, WAIVED_TIMING_COMMENT, deliver, makeHarness } from './deliver-test-harness.mjs';

test('current semantic-review waiver reaches provider delivery without pass evidence', async () => {
  const harness = makeHarness({
    agentReviewPassed: false,
    acceptedReviewSha: null,
    comments: [WAIVED_TIMING_COMMENT],
  });

  const result = await deliver(harness);

  assert.equal(result.status, 'action-required');
  assert.equal(harness.data.agentReviewPassed, false);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('semantic-review waiver fails closed before delivery mutation when live authority is invalid', async () => {
  const cases = [
    ['agent-review-evidence', { comments: [] }],
    [
      'policy',
      {
        comments: [WAIVED_TIMING_COMMENT],
        workflowPolicy: { status: 'blocked', isWaived: () => false },
      },
    ],
    [
      'authority',
      {
        comments: [WAIVED_TIMING_COMMENT],
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
    ['accepted-head', { comments: [WAIVED_TIMING_COMMENT], acceptedReviewSha: NEXT_HEAD }],
  ];

  for (const [category, options] of cases) {
    const harness = makeHarness({
      agentReviewPassed: false,
      acceptedReviewSha: null,
      ...options,
    });
    await assert.rejects(
      () => deliver(harness),
      new RegExp(
        category === 'agent-review-evidence'
          ? `delivery-preflight:${category}`
          : `delivery-preflight:review-authority-${category}`
      )
    );
    assert.equal(harness.calls.createIssueComment, 0);
  }
});

test('semantic-review waiver refuses an ambiguous Timing Log authority source', async () => {
  const harness = makeHarness({
    agentReviewPassed: false,
    acceptedReviewSha: null,
    comments: [WAIVED_TIMING_COMMENT, { ...WAIVED_TIMING_COMMENT, id: 'timing-comment-2' }],
  });

  await assert.rejects(
    () => deliver(harness),
    /delivery-preflight:review-authority-timing-ambiguous/
  );
  assert.equal(harness.calls.createIssueComment, 0);
});
