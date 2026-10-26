// @story #2096
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as deliveryDecision from '../../../../task-tracker/lib/action-decision/deliver.mjs';
import {
  cfg as deliveryCfg,
  HEAD as DELIVERY_HEAD,
  NEXT_HEAD,
  makeHarness,
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

test('#2096 explicit artifact delivery readiness uses source PR and actual controller head', async () => {
  const artifactSubject = { commitSha: DELIVERY_HEAD, treeSha: 'd'.repeat(40) };
  const h = makeHarness({
    issueBody: BODY,
    prSourceEvidence: [{ oid: DELIVERY_HEAD, tree: artifactSubject.treeSha }],
  });
  h.deps.providerActionAvailable = true;
  h.deps.getCurrentBranch = async () => 'controller';
  h.deps.getLocalHeadSha = async () => NEXT_HEAD;
  h.deps.listPullRequests = async ({ headSha }) => {
    assert.equal(headSha, DELIVERY_HEAD);
    return [{ number: h.data.prNumber }];
  };
  h.deps.listCommitSubjects = async () => h.data.commitSubjects;
  h.deps.assertArtifactDeliveryContext = async () => {};
  const result = await deliveryDecision.evaluateDeliveryReadiness({
    issue: 939,
    cfg: deliveryCfg(),
    projectDir: process.cwd(),
    state: trackerState(),
    artifactSubject,
    deps: h.deps,
  });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(h.calls.createIssueComment, 0);
});
