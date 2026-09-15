// @story #1626
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkflowExceptionEnvelope,
  resolveWorkflowExceptionRecords,
  toEvaluatorRecord,
  validateWorkflowExceptionEnvelope,
  WORKFLOW_EXCEPTION_SCHEMA,
} from '../../../../../task-tracker/lib/workflow-policy/exception-record.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1626;
const scopeIdentity = `sha256:${'a'.repeat(64)}`;
const createdAt = '2026-09-14T20:00:00.000Z';
const expiresAt = '2026-09-15T20:00:00.000Z';

const authorization = Object.freeze({
  reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_authority',
  statement: 'For issue #1626, waive the deep-dive output and deny managed providers.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
  origin: 'codex-session-transcript',
  verificationLevel: 'host-verified-user-message',
});

function recordId(n) {
  return `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
}

function envelope(overrides = {}) {
  return createWorkflowExceptionEnvelope({
    repository,
    issue,
    exceptionId: 'incident-plan-review',
    revision: 1,
    status: 'active',
    scopeIdentity,
    requirementIds: ['planning.deep-dive'],
    constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
    reason: 'The existing incident authorization explicitly permits this bounded exception.',
    authorization,
    expiresAt,
    operationId: `sha256:${'b'.repeat(64)}`,
    createdAt,
    recordId: recordId(1),
    grantId: recordId(90),
    ...overrides,
  });
}

function stored(value, suffix = '1') {
  return { commentNodeId: `IC_exception_${suffix}`, envelope: value };
}

test('a valid record preserves closed authority, policy, identity, and lifecycle fields', () => {
  const value = envelope();
  assert.equal(value.payload.schema, WORKFLOW_EXCEPTION_SCHEMA);
  assert.equal(validateWorkflowExceptionEnvelope(value), value);
  assert.deepEqual(value.payload.approvalEvidence, authorization);
  assert.notEqual(
    value.payload.approvalEvidence.principal,
    value.payload.approvalEvidence.recordingActor
  );
  assert.deepEqual(value.payload.requirementIds, ['planning.deep-dive']);
  assert.deepEqual(value.payload.constraints, [
    { id: 'provider.managed-execution', effect: 'deny' },
  ]);
  assert.equal(value.authority.actor, authorization.recordingActor);
});

test('the schema rejects unknown keys, versions, authority claims, and invalid policy', () => {
  const valid = envelope();
  const cases = [
    { ...valid, payload: { ...valid.payload, schema: 'aitm.workflow-exception/v2' } },
    { ...valid, payload: { ...valid.payload, authorized: true } },
    {
      ...valid,
      payload: {
        ...valid.payload,
        approvalEvidence: { ...authorization, verificationLevel: 'caller-asserted-human' },
      },
    },
    { ...valid, payload: { ...valid.payload, requirementIds: ['delivery.tests'] } },
    {
      ...valid,
      payload: {
        ...valid.payload,
        constraints: [{ id: 'provider.managed-execution', effect: 'allow' }],
      },
    },
  ];
  for (const candidate of cases) {
    assert.throws(() => validateWorkflowExceptionEnvelope(candidate), /workflow-exception:/);
  }
});

test('repository, issue, scope, timestamps, revisions, dispositions, and links fail closed', () => {
  assert.throws(
    () => validateWorkflowExceptionEnvelope(envelope(), { repository: 'other/repo', issue }),
    /repository-mismatch/
  );
  assert.throws(
    () => validateWorkflowExceptionEnvelope(envelope(), { repository, issue: issue + 1 }),
    /issue-mismatch/
  );
  for (const overrides of [
    { scopeIdentity: 'sha256:short' },
    { revision: 0 },
    { status: 'unknown' },
    { expiresAt: createdAt },
    { revision: 2 },
    { status: 'revoked' },
  ]) {
    assert.throws(() => envelope(overrides), /workflow-exception:/);
  }
});

test('an active effective record projects exactly the evaluator authority shape', () => {
  const result = resolveWorkflowExceptionRecords({
    records: [stored(envelope())],
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now: '2026-09-14T21:00:00.000Z',
  });
  assert.equal(result.status, 'active');
  assert.deepEqual(result.history, [{ recordId: recordId(1), revision: 1, disposition: 'active' }]);
  assert.deepEqual(result.active, toEvaluatorRecord(envelope()));
  assert.deepEqual(result.active.authority, {
    reference: authorization.reference,
    verificationLevel: 'host-verified-user-message',
  });
});

test('a linear revision supersedes immutable history and becomes the sole active head', () => {
  const first = envelope();
  const second = envelope({
    revision: 2,
    requirementIds: ['review.implementation'],
    predecessor: first.recordId,
    supersedes: first.recordId,
    recordId: recordId(2),
    grantId: recordId(91),
    operationId: `sha256:${'c'.repeat(64)}`,
    createdAt: '2026-09-14T21:00:00.000Z',
  });
  const result = resolveWorkflowExceptionRecords({
    records: [stored(first), stored(second, '2')],
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now: '2026-09-14T22:00:00.000Z',
  });
  assert.equal(result.status, 'active');
  assert.equal(result.active.recordId, second.recordId);
  assert.deepEqual(result.history, [
    { recordId: first.recordId, revision: 1, disposition: 'superseded' },
    { recordId: second.recordId, revision: 2, disposition: 'active' },
  ]);
});

test('concurrent successors are ambiguous and are never combined', () => {
  const first = envelope();
  const successor = (n, requirementId) =>
    envelope({
      revision: 2,
      requirementIds: [requirementId],
      predecessor: first.recordId,
      supersedes: first.recordId,
      recordId: recordId(n),
      grantId: recordId(90 + n),
      operationId: `sha256:${String(n).repeat(64).slice(0, 64)}`,
      createdAt: '2026-09-14T21:00:00.000Z',
    });
  const result = resolveWorkflowExceptionRecords({
    records: [
      stored(first),
      stored(successor(2, 'review.design'), '2'),
      stored(successor(3, 'review.peer'), '3'),
    ],
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now: '2026-09-14T22:00:00.000Z',
  });
  assert.equal(result.status, 'invalid');
  assert.equal(result.active, null);
  assert.deepEqual(result.conflicts, [{ code: 'ambiguous-active-records' }]);
});

test('expired, stale-scope, and revoked heads never project evaluator authority', () => {
  const first = envelope();
  const revoked = envelope({
    revision: 2,
    status: 'revoked',
    predecessor: first.recordId,
    supersedes: first.recordId,
    recordId: recordId(2),
    grantId: recordId(91),
    operationId: `sha256:${'d'.repeat(64)}`,
    createdAt: '2026-09-14T21:00:00.000Z',
  });
  const scenarios = [
    {
      records: [stored(first)],
      currentScopeIdentity: scopeIdentity,
      now: '2026-09-16T00:00:00.000Z',
      status: 'expired',
    },
    {
      records: [stored(first)],
      currentScopeIdentity: `sha256:${'e'.repeat(64)}`,
      now: '2026-09-14T21:00:00.000Z',
      status: 'stale-scope',
    },
    {
      records: [stored(first), stored(revoked, '2')],
      currentScopeIdentity: scopeIdentity,
      now: '2026-09-14T22:00:00.000Z',
      status: 'revoked',
    },
  ];
  for (const scenario of scenarios) {
    const result = resolveWorkflowExceptionRecords({ repository, issue, ...scenario });
    assert.equal(result.status, scenario.status);
    assert.equal(result.active, null);
  }
});
