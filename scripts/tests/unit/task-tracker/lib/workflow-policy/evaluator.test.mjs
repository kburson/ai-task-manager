// @story #1625
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateWorkflowPolicy,
  POLICY_OUTCOMES,
} from '../../../../../task-tracker/lib/workflow-policy/evaluator.mjs';
import { computeScopeIdentity } from '../../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 57;
const body = `## User Story

As a maintainer
I want to ship a bounded change
So that behavior is correct

## Scope

Implement the bounded change.

## Acceptance Criteria

- [ ] The behavior is correct. <!-- aitm-verified vc-list="vc:1" -->

## AITM Progress Markers

<!-- aitm-entered-plan ts="2026-09-14T00:00:00Z" -->`;
const scopeIdentity = computeScopeIdentity({ repository, issue, body });

function activeRecord(overrides = {}) {
  return {
    recordId: '01M2H000000000000000000001',
    revision: 1,
    disposition: 'active',
    repository,
    issue,
    scopeIdentity,
    requirementIds: ['planning.deep-dive'],
    constraints: [],
    authority: {
      reference: 'chat://thread/message-1',
      verificationLevel: 'host-attested-user-message',
    },
    createdAt: '2026-09-14T00:00:00Z',
    expiresAt: null,
    ...overrides,
  };
}

test('scope identity ignores progress but changes with substantive scope', () => {
  const progressed = body
    .replace('- [ ] The behavior', '- [x] The behavior')
    .replace('00:00:00Z', '12:34:56Z');
  assert.equal(computeScopeIdentity({ repository, issue, body: progressed }), scopeIdentity);
  assert.notEqual(
    computeScopeIdentity({
      repository,
      issue,
      body: body.replace('bounded change.', 'different change.'),
    }),
    scopeIdentity
  );
  assert.notEqual(computeScopeIdentity({ repository, issue: 58, body }), scopeIdentity);
});

test('without an exception baseline missing and future evidence remain distinct', () => {
  const result = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    state: 'plan',
    activity: 'transition:plan-develop',
    baselineRequirementIds: ['planning.deep-dive', 'delivery.tests'],
    records: [],
    evidence: {
      'planning.deep-dive': { state: 'missing', remediation: 'post deep dive' },
      'delivery.tests': { state: 'pending-future-evidence', remediation: 'run tests in Test' },
    },
    now: '2026-09-14T01:00:00Z',
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(
    result.decisions.map(({ outcome }) => outcome),
    ['missing', 'missing']
  );
  assert.deepEqual(
    result.decisions.map(({ evaluation }) => evaluation),
    ['evaluated', 'pending-future-evidence']
  );
  assert.deepEqual(result.blockers, [
    {
      code: 'requirement-missing',
      requirementId: 'planning.deep-dive',
      remediation: 'post deep dive',
    },
  ]);
});

test('not-applicable decisions cite the policy that made them inapplicable', () => {
  const result = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    state: 'test',
    activity: 'transition:test-review',
    baselineRequirementIds: ['planning.deep-dive'],
    records: [],
    evidence: {
      'planning.deep-dive': {
        state: 'not-applicable',
        reasonCode: 'state-does-not-require-planning-output',
        policyReference: 'baseline:test-review/v1',
      },
    },
    now: '2026-09-14T01:00:00Z',
  });
  assert.equal(result.status, 'policy-compatible');
  assert.equal(result.decisions[0].outcome, 'not-applicable');
  assert.equal(result.decisions[0].policyReference, 'baseline:test-review/v1');
  assert.deepEqual(result.blockers, []);
});

test('valid explicit waiver affects only the named waivable requirement', () => {
  const result = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    state: 'plan',
    activity: 'transition:plan-develop',
    baselineRequirementIds: ['planning.deep-dive', 'approval.plan', 'delivery.tests'],
    records: [activeRecord()],
    evidence: {
      'approval.plan': { state: 'satisfied', reference: 'approval:1' },
      'delivery.tests': { state: 'pending-future-evidence' },
    },
    now: '2026-09-14T01:00:00Z',
  });
  assert.equal(result.status, 'policy-compatible');
  assert.equal(result.decisions[0].outcome, 'waived');
  assert.equal(result.decisions[0].authority.recordId, activeRecord().recordId);
  assert.equal(result.decisions[0].authority.reference, 'chat://thread/message-1');
  assert.equal(result.decisions[1].outcome, 'satisfied');
  assert.equal(result.decisions[2].evaluation, 'pending-future-evidence');
});

test('non-waivable requests and invalid authority fail closed', () => {
  for (const record of [
    activeRecord({ requirementIds: ['delivery.tests'] }),
    activeRecord({ repository: 'other/repo' }),
    activeRecord({ issue: 58 }),
    activeRecord({ scopeIdentity: 'sha256:stale' }),
    activeRecord({ disposition: 'revoked' }),
    activeRecord({ expiresAt: '2026-09-14T00:30:00Z' }),
  ]) {
    const result = evaluateWorkflowPolicy({
      repository,
      issue,
      scopeIdentity,
      state: 'plan',
      activity: 'transition:plan-develop',
      baselineRequirementIds: ['planning.deep-dive', 'delivery.tests'],
      records: [record],
      evidence: {},
      now: '2026-09-14T01:00:00Z',
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.decisions[0].outcome, POLICY_OUTCOMES.MISSING);
  }
});

test('ambiguous active records are not combined', () => {
  const result = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    state: 'plan',
    activity: 'transition:plan-develop',
    baselineRequirementIds: ['planning.deep-dive'],
    records: [activeRecord(), activeRecord({ recordId: '01M2H000000000000000000002' })],
    evidence: {},
    now: '2026-09-14T01:00:00Z',
  });
  assert.equal(result.status, 'blocked');
  assert.match(result.conflicts[0].code, /ambiguous-active-records/);
});

test('managed provider denial wins over Full-Auto and launch flags', () => {
  const record = activeRecord({
    requirementIds: [],
    constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
  });
  const result = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    state: 'review',
    activity: 'managed-provider:launch',
    baselineRequirementIds: [],
    records: [record],
    evidence: {},
    projectPolicy: { fullAuto: true, allowProviderLaunch: true },
    now: '2026-09-14T01:00:00Z',
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.prohibitions, [
    {
      id: 'provider.managed-execution',
      effect: 'deny',
      reasonCode: 'exception-constraint-deny',
      authority: {
        recordId: record.recordId,
        revision: 1,
        reference: 'chat://thread/message-1',
        verificationLevel: 'host-attested-user-message',
      },
    },
  ]);
  assert.deepEqual(result.blockers, [
    {
      code: 'execution-prohibited',
      constraintId: 'provider.managed-execution',
      remediation: 'remove or supersede the active deny constraint through an authorized revision',
    },
  ]);
});
