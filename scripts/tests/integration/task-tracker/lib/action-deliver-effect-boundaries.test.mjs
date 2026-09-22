// @story #1668
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateDeliveryReadiness } from '../../../../task-tracker/lib/action-decision/deliver.mjs';
import { renderDeliveryIntentComment } from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  cfg as deliveryCfg,
  deliver as executeDelivery,
  makeHarness,
  NEXT_HEAD,
  trackerState,
} from '../../../unit/task-tracker/verbs/deliver-test-harness.mjs';

const BODY = `## User Story
As a delivery operator
I want current delivery readiness
So that stale evidence cannot authorize delivery

## Scope
Explain current provider delivery authorization without effects.

## Acceptance Criteria
- [x] The explanation is read-only.`;

test('execution refreshes authority after intent write before emitting provider action', async () => {
  const harness = makeHarness();
  const createIssueComment = harness.deps.createIssueComment;
  harness.deps.createIssueComment = async (...args) => {
    const result = await createIssueComment(...args);
    harness.data.prHead = NEXT_HEAD;
    return result;
  };
  await assert.rejects(executeDelivery(harness), /delivery-preflight:/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('execution refuses a same-ID ledger edit after intent readback', async () => {
  const harness = makeHarness();
  const getLocalHeadSha = harness.deps.getLocalHeadSha;
  let edited = false;
  harness.deps.getLocalHeadSha = async (...args) => {
    if (harness.calls.createIssueComment === 1 && !edited) {
      edited = true;
      const comment = harness.data.comments[0];
      const match = /^<!-- aitm-delivery-intent (.+) -->/.exec(comment.body);
      const intent = JSON.parse(match[1]);
      intent.mergeMethod = 'merge';
      comment.body = renderDeliveryIntentComment(intent);
    }
    return getLocalHeadSha(...args);
  };
  await assert.rejects(executeDelivery(harness), /delivery-preflight:delivery-record-drift/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('open PR with a matching receipt is blocked in explanation as execution refuses it', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  assert.equal((await executeDelivery(harness)).status, 'delivered');
  harness.data.prState = 'OPEN';
  const fetchIssue = harness.deps.fetchIssue;
  const decision = await evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    deps: {
      ...harness.deps,
      fetchIssue: async (...args) => ({ ...(await fetchIssue(...args)), body: BODY }),
      providerActionAvailable: true,
    },
  });
  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.ok(decision.blockers.some(({ code }) => code === 'delivery-record-conflict'));
});

test('merged execution refuses a changed PR head before posting a receipt', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  const fetchOriginTrunk = harness.deps.fetchOriginTrunk;
  harness.deps.fetchOriginTrunk = async (...args) => {
    const result = await fetchOriginTrunk(...args);
    harness.data.prHead = NEXT_HEAD;
    return result;
  };
  await assert.rejects(executeDelivery(harness), /delivery-preflight:/);
  assert.equal(harness.calls.createIssueComment, 1);
});

test('merged execution rechecks trunk reachability before posting a receipt', async () => {
  const harness = makeHarness();
  assert.equal((await executeDelivery(harness)).status, 'action-required');
  harness.data.prState = 'MERGED';
  const isAncestor = harness.deps.isAncestor;
  let trunkChecks = 0;
  harness.deps.isAncestor = async (args) => {
    if (args.descendant === 'origin/trunk' && ++trunkChecks === 2) return false;
    return isAncestor(args);
  };
  await assert.rejects(executeDelivery(harness), /trunk-reachability-drift/);
  assert.equal(harness.calls.createIssueComment, 1);
});
