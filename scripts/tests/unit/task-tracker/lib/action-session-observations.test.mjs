// @story #1750
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import {
  ACTION_DECISION_SCHEMA,
  validateActionDecision,
} from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { actionDecisionSnapshot } from '../../../helpers/action-decision-fixtures.mjs';

function attemptFor(value) {
  return createObservationAttempt({
    repository: 'example/project',
    issue: 1750,
    boundaryId: 'action:bind:1750',
    now: () => '2026-09-21T16:00:00.000Z',
    read: async (request) => ({ ...request, value }),
  });
}

test('local session authority requires an issue-qualified identity', async () => {
  const wrong = await attemptFor({ gateAssigneeMatch: false }).observe({
    resource: 'local-config',
    identity: 'local-config:1751',
    scope: 'session:1750',
  });
  assert.equal(wrong.status, 'indeterminate');
  assert.equal(wrong.cause.code, 'authority-read-failed');
  assert.equal(wrong.cause.args.reason, 'invalid');
  const correct = await attemptFor({ gateAssigneeMatch: false }).observe({
    resource: 'local-config',
    identity: 'local-config:1750',
    scope: 'session:1750',
  });
  assert.equal(correct.status, 'observed');
});

test('local configuration changes the observed digest without exposing an effect port', async () => {
  const request = {
    resource: 'local-config',
    identity: 'local-config:1750',
    scope: 'session:1750',
  };
  const enabled = await attemptFor({ gateAssigneeMatch: true }).observe(request);
  const disabled = await attemptFor({ gateAssigneeMatch: false }).observe(request);
  assert.equal(enabled.status, 'observed');
  assert.equal(disabled.status, 'observed');
  assert.notEqual(enabled.digest, disabled.digest);
});

test('v2 decisions validate issue-qualified local authority and bind its snapshot digest', () => {
  const observations = ['local-config', 'session-state', 'worktree'].map((source) => ({
    source,
    identity: `${source}:1661`,
    observedAt: '2026-09-20T15:00:00.500Z',
    digest: `sha256:${'c'.repeat(64)}`,
  }));
  const decision = {
    schema: ACTION_DECISION_SCHEMA,
    issue: 1661,
    actionId: 'promote',
    status: 'ready',
    blockers: [],
    normalizations: [],
    warnings: [],
    humanDecision: null,
    guidanceIds: ['action.promote'],
    snapshot: actionDecisionSnapshot({ observations }),
  };
  assert.equal(validateActionDecision(decision).status, 'ready');
  const changed = observations.map((observation) => ({ ...observation }));
  changed[0].digest = `sha256:${'d'.repeat(64)}`;
  const changedSnapshot = actionDecisionSnapshot({ observations: changed });
  assert.notEqual(decision.snapshot.digest, changedSnapshot.digest);
  assert.equal(validateActionDecision({ ...decision, snapshot: changedSnapshot }).status, 'ready');
  const wrong = observations.map((observation) => ({ ...observation }));
  wrong[0].identity = 'local-config:1662';
  assert.throws(
    () =>
      validateActionDecision({
        ...decision,
        snapshot: actionDecisionSnapshot({ observations: wrong }),
      }),
    /snapshot.observations\[0\].identity/
  );
});
