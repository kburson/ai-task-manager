// @story #1630
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAitmRecordEnvelope } from '../../../task-tracker/lib/github-records/record-envelope.mjs';
import { evaluateManagedProviderBoundary } from '../../../task-tracker/lib/workflow-policy/enforcement.mjs';
import { evaluateWorkflowPolicy } from '../../../task-tracker/lib/workflow-policy/evaluator.mjs';
import {
  createWorkflowExceptionEnvelope,
  toEvaluatorRecord,
  validateWorkflowExceptionEnvelope,
} from '../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { executeWorkflowExceptionWrite } from '../../../task-tracker/lib/workflow-policy/exception-store.mjs';
import { computeScopeIdentity } from '../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import {
  WORKFLOW_STATES,
  baselineRequirementsThrough,
} from '../../../task-tracker/lib/workflow-policy/snapshot.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1630;
const now = '2026-09-15T05:00:00.000Z';
const body = [
  '## User Story',
  '',
  'As an operator',
  'I want an explicit exception',
  'So that skipped work remains truthful',
  '',
  '## Scope',
  '',
  'Exercise the supported workflow policy.',
  '',
  '## Acceptance Criteria',
  '',
  '- [x] Retained safeguards still pass.',
].join('\n');
const scopeIdentity = computeScopeIdentity({ repository, issue, body });
const planning = [
  'planning.deep-dive',
  'planning.metadata',
  'planning.planned-estimate',
  'planning.forecast',
];
const review = [
  'review.design',
  'review.implementation',
  'review.peer',
  'review.semantic-resident',
];
const retained = [
  'approval.plan',
  'delivery.ownership',
  'delivery.dependencies',
  'delivery.issue-binding',
  'delivery.state-contiguity',
  'delivery.tests',
  'delivery.verification-evidence',
  'approval.human-completion',
  'delivery.commit-provenance',
  'delivery.ci',
  'delivery.safe-delivery',
  'delivery.external-protection',
];
const authority = {
  reference: 'codex://sessions/session-1/messages/message-1',
  statement: 'Waive the named planning and review work, retain approval and delivery safeguards.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:session-1',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
};

function envelope({
  targetRepository = repository,
  targetIssue = issue,
  targetScope = scopeIdentity,
  requirementIds = [...planning, ...review],
  constraints = [{ id: 'provider.managed-execution', effect: 'deny' }],
  status = 'active',
  expiresAt,
  revision = status === 'revoked' ? 2 : 1,
  recordId = revision > 1 ? '01M2HQ00000000000000000002' : '01M2HQ00000000000000000001',
  grantId = revision > 1 ? '01M2HQ00000000000000000092' : '01M2HQ00000000000000000091',
  predecessor = revision > 1 ? '01M2HQ00000000000000000001' : null,
  supersedes = predecessor,
} = {}) {
  return createWorkflowExceptionEnvelope({
    repository: targetRepository,
    issue: targetIssue,
    exceptionId: 'incident-direct-execution',
    revision,
    status,
    scopeIdentity: targetScope,
    requirementIds,
    constraints,
    reason: 'The operator explicitly authorized this finite deviation.',
    authorization: authority,
    operationId: `sha256:${String(revision).repeat(64)}`,
    predecessor,
    supersedes,
    createdAt: '2026-09-15T04:00:00.000Z',
    expiresAt,
    recordId,
    grantId,
  });
}

function evidenceFor(ids, missing = []) {
  return Object.fromEntries(
    ids
      .filter((id) => !missing.includes(id))
      .map((id) => [id, { state: 'satisfied', reference: `fixture://${id}` }])
  );
}

function evaluate({
  state,
  records = [],
  evidence = {},
  activity = `workflow-transition:${state}`,
}) {
  return evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    now,
    state,
    activity,
    baselineRequirementIds: baselineRequirementsThrough(state),
    evidence,
    records,
  });
}

test('ordinary policy reproduces all five Plan blockers while an explicit exception resumes in Plan and reaches Done truthfully', () => {
  const ordinary = evaluate({ state: 'plan' });
  assert.equal(ordinary.status, 'blocked');
  assert.deepEqual(
    ordinary.blockers.map(({ requirementId }) => requirementId),
    [...planning, 'approval.plan']
  );

  const record = toEvaluatorRecord(envelope());
  const visited = [];
  for (const state of WORKFLOW_STATES.slice(WORKFLOW_STATES.indexOf('plan'))) {
    const baseline = baselineRequirementsThrough(state);
    const result = evaluate({ state, records: [record], evidence: evidenceFor(baseline) });
    assert.equal(result.status, 'policy-compatible', state);
    const outcomes = new Map(result.decisions.map((decision) => [decision.id, decision.outcome]));
    for (const id of planning.concat(review).filter((id) => baseline.includes(id))) {
      assert.equal(outcomes.get(id), 'waived', `${state}:${id}`);
    }
    for (const id of retained.filter((id) => baseline.includes(id))) {
      assert.equal(outcomes.get(id), 'satisfied', `${state}:${id}`);
    }
    visited.push(state);
  }
  assert.deepEqual(visited, ['plan', 'develop', 'test', 'review', 'done']);
});

test('retained test, dependency, binding, approval, provenance, CI, delivery, and protection evidence still blocks Done', () => {
  const record = toEvaluatorRecord(envelope());
  for (const missing of retained) {
    const result = evaluate({
      state: 'done',
      records: [record],
      evidence: evidenceFor(baselineRequirementsThrough('done'), [missing]),
    });
    assert.equal(result.status, 'blocked', missing);
    assert.ok(
      result.blockers.some(({ requirementId }) => requirementId === missing),
      `missing retained blocker: ${missing}`
    );
  }
  assert.throws(
    () => envelope({ requirementIds: ['delivery.tests'] }),
    /workflow-exception:policy-non-waivable-requirement:delivery.tests/
  );
});

test('expired, revoked, wrong repository, wrong issue, stale scope, ambiguous, and unsupported records fail closed', () => {
  const cases = [
    ['expired', envelope({ expiresAt: '2026-09-15T04:30:00.000Z' }), 'record-expired'],
    ['revoked', envelope({ status: 'revoked' }), 'record-not-active'],
    [
      'wrong repository',
      envelope({ targetRepository: 'kburson/other-repository' }),
      'record-repository-mismatch',
    ],
    ['wrong issue', envelope({ targetIssue: 57 }), 'record-issue-mismatch'],
    ['stale scope', envelope({ targetScope: `sha256:${'f'.repeat(64)}` }), 'record-scope-stale'],
  ];
  for (const [name, candidate, conflict] of cases) {
    const result = evaluate({
      state: 'plan',
      records: [toEvaluatorRecord(candidate)],
      evidence: evidenceFor(['approval.plan']),
    });
    assert.equal(result.status, 'blocked', name);
    assert.ok(
      result.conflicts.some(({ code }) => code === conflict),
      name
    );
    assert.ok(
      result.decisions.every(({ outcome }) => outcome !== 'waived'),
      name
    );
  }

  const ambiguous = evaluate({
    state: 'plan',
    records: [
      toEvaluatorRecord(envelope()),
      toEvaluatorRecord(
        envelope({
          revision: 2,
          recordId: '01M2HQ00000000000000000002',
          grantId: '01M2HQ00000000000000000092',
        })
      ),
    ],
    evidence: evidenceFor(['approval.plan']),
  });
  assert.ok(ambiguous.conflicts.some(({ code }) => code === 'ambiguous-active-records'));
  assert.ok(ambiguous.decisions.every(({ outcome }) => outcome !== 'waived'));

  const supported = envelope();
  const unsupported = createAitmRecordEnvelope({
    recordType: supported.recordType,
    repository,
    issue,
    payload: { ...supported.payload, schema: 'aitm.workflow-exception/v2' },
    actor: authority.recordingActor,
    createdAt: supported.createdAt,
    recordId: '01M2HQ00000000000000000003',
    grantId: '01M2HQ00000000000000000093',
  });
  assert.throws(
    () => validateWorkflowExceptionEnvelope(unsupported),
    /workflow-exception:unsupported-schema/
  );
});

function storeRuntime({ failAppend = false } = {}) {
  const records = [];
  let ordinal = 0;
  return {
    records,
    async listRecords() {
      return records;
    },
    nextIds() {
      ordinal += 1;
      return {
        recordId: `01M2HR${String(ordinal).padStart(20, '0')}`,
        grantId: `01M2HS${String(ordinal).padStart(20, '0')}`,
      };
    },
    async appendRecord({ envelope: created }) {
      if (failAppend) throw new Error('simulated issue failure');
      records.push({ commentNodeId: `IC_${records.length + 1}`, envelope: created });
    },
  };
}

const request = {
  exceptionId: 'incident-direct-execution',
  requirementIds: [...planning, ...review],
  constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
  reason: 'The operator explicitly authorized this finite deviation.',
  approvalEvidence: authority,
  expiresAt: null,
};

test('record retries are idempotent and an explicit series reports partial results per issue', async () => {
  const runtime = storeRuntime();
  const input = {
    action: 'record',
    repository,
    issue,
    scopeIdentity,
    request,
    authority,
    now,
    runtime,
  };
  const first = await executeWorkflowExceptionWrite(input);
  const retry = await executeWorkflowExceptionWrite(input);
  assert.equal(first.status, 'created');
  assert.equal(retry.status, 'existing');
  assert.equal(first.recordId, retry.recordId);
  assert.equal(runtime.records.length, 1);

  const partial = [];
  for (const [targetIssue, targetRuntime] of [
    [57, storeRuntime()],
    [58, storeRuntime({ failAppend: true })],
  ]) {
    partial.push(
      await executeWorkflowExceptionWrite({
        ...input,
        issue: targetIssue,
        scopeIdentity: computeScopeIdentity({ repository, issue: targetIssue, body }),
        runtime: targetRuntime,
      })
    );
  }
  assert.deepEqual(
    partial.map(({ issue: targetIssue, status }) => [targetIssue, status]),
    [
      [57, 'created'],
      [58, 'indeterminate'],
    ]
  );
});

test('mid-flight activation or revocation is observed at the managed-provider boundary and Full-Auto cannot override denial', async () => {
  let records = [];
  const runtime = { listRecords: async () => records };
  const before = await evaluateManagedProviderBoundary({
    repository,
    issue,
    body,
    activity: 'managed-provider:review',
    now,
    runtime,
  });
  assert.equal(before.status, 'allowed');

  records = [{ commentNodeId: 'IC_deny', envelope: envelope() }];
  const afterActivation = await evaluateManagedProviderBoundary({
    repository,
    issue,
    body,
    activity: 'managed-provider:review',
    now,
    runtime,
    request: { fullAuto: true, launch: true },
  });
  assert.equal(afterActivation.status, 'prohibited');
  assert.equal(afterActivation.reason, 'managed-provider-denied');

  records = [{ commentNodeId: 'IC_revoke', envelope: envelope({ status: 'revoked' }) }];
  const afterRevocation = await evaluateManagedProviderBoundary({
    repository,
    issue,
    body,
    activity: 'managed-provider:review',
    now,
    runtime,
  });
  assert.equal(afterRevocation.status, 'indeterminate');
  assert.notEqual(afterRevocation.status, 'allowed');
});
