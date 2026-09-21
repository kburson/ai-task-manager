// @story #1729
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACTION_DECISION_SCHEMA,
  ACTION_DECISION_SCHEMA_V1,
  validateActionDecision,
  validateBlocker,
} from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { actionDecisionSnapshot } from '../../../helpers/action-decision-fixtures.mjs';

test('v2 preserves a known blocked refusal beside an indeterminate read cause, while v1 stays closed', () => {
  const issue = 1729;
  const known = {
    guardId: 'plan-exit-plan-approved',
    code: 'plan-approval-missing',
    args: {},
    remediation: { id: 'record-plan-approval', args: { issue } },
  };
  const unknown = {
    guardId: 'authority-collection',
    code: 'authority-read-failed',
    args: { source: 'workflow-policy', reason: 'unavailable' },
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  };
  const decision = {
    schema: ACTION_DECISION_SCHEMA,
    issue,
    actionId: 'promote',
    status: 'indeterminate',
    snapshot: actionDecisionSnapshot({
      observations: [
        {
          source: 'issue-body',
          identity: `issue:${issue}`,
          observedAt: '2026-09-20T15:00:00.500Z',
          digest: `sha256:${'c'.repeat(64)}`,
        },
      ],
    }),
    blockers: [known, unknown],
    normalizations: [],
    warnings: [],
    humanDecision: {
      requests: [
        {
          kind: 'plan-approval',
          actor: 'configured-approver',
          subject: { issue, actionId: 'promote' },
          args: {},
        },
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue, actionId: 'promote' },
          args: { guardId: 'authority-collection', code: 'authority-read-failed' },
        },
      ],
    },
    guidanceIds: ['action.promote'],
  };
  assert.deepEqual(validateActionDecision(decision), decision);
  assert.throws(
    () => validateActionDecision({ ...decision, schema: ACTION_DECISION_SCHEMA_V1 }),
    /blockers\[0\]\.code:status/
  );
  assert.throws(
    () => validateActionDecision({ ...decision, blockers: [known] }),
    /blockers\[0\]\.code:status/
  );
});

test('v1 keeps the original guard-error producer restriction', () => {
  const blocker = {
    guardId: 'action-result-validation',
    code: 'guard-error',
    args: {},
    noAutomaticRemediation: { reason: 'result-investigation-required' },
  };
  assert.deepEqual(
    validateBlocker(blocker, { status: 'indeterminate', schema: ACTION_DECISION_SCHEMA }),
    blocker
  );
  assert.throws(
    () =>
      validateBlocker(blocker, {
        status: 'indeterminate',
        schema: ACTION_DECISION_SCHEMA_V1,
      }),
    /guardId:producer/
  );
});
