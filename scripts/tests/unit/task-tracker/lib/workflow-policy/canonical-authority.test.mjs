// @story #2145
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashAuthorizationStatement,
  resolveWorkflowExceptionAuthority,
  validateAuthorizationSource,
} from '../../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../../task-tracker/lib/workflow-policy/exception-record.mjs';

const statement = 'Authorize this bounded Review waiver.\nPreserve the approved source.';
const source = {
  schema: 'aitm.authorization-source/v2',
  adapter: 'codex-app-server/v1',
  threadId: 'thread-2145',
  turnId: 'turn-2145',
  sessionId: 'session-2145',
  messageId: 'message-2145',
  statementHash: hashAuthorizationStatement(statement),
};
const authority = {
  reference:
    'codex://threads/thread-2145/turns/turn-2145/messages/message-2145?session=session-2145',
  statement,
  principal: null,
  recordingActor: 'codex/session:session-2145',
  origin: 'codex-app-server',
  verificationLevel: 'host-verified-user-message',
};

test('strict canonical host source retains thread, turn, session and item identity', () => {
  assert.equal(validateAuthorizationSource(source), source);
  for (const changed of [
    { ...source, turnId: '' },
    { ...source, statement },
    { ...source, command: 'sh' },
    { ...source, adapter: 'other' },
  ]) {
    assert.throws(() => validateAuthorizationSource(changed), /authority:source/);
  }
});

test('canonical authority resolves to its actual host reference with original multiline text', async () => {
  const result = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: authority.recordingActor,
    loadSource: async () => ({
      role: 'user',
      statement,
      principal: null,
      statementHash: source.statementHash,
    }),
  });
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.authority, authority);
});

function record(approval = authority) {
  return createWorkflowExceptionEnvelope({
    repository: 'owner/repo',
    issue: 2145,
    exceptionId: 'bounded-review',
    revision: 1,
    status: 'active',
    scopeIdentity: `sha256:${'a'.repeat(64)}`,
    requirementIds: ['review.semantic-resident'],
    constraints: [],
    reason: 'The owner approved this bounded historical timing exception.',
    authorization: approval,
    expiresAt: '2026-11-08T23:59:59.000Z',
    operationId: `sha256:${'b'.repeat(64)}`,
    createdAt: '2026-11-08T03:00:00.000Z',
    recordId: '01M2H000000000000000000001',
    grantId: '01M2H000000000000000000090',
  });
}

test('ordinary exception records preserve authentic multiline host approvals', () => {
  assert.equal(record().payload.approvalEvidence.statement, statement);
  const legacy = {
    ...authority,
    origin: 'codex-session-transcript',
    reference: 'codex://sessions/session-2145/messages/message-2145',
  };
  assert.equal(record(legacy).payload.approvalEvidence.statement, statement);
  for (const bad of ['\u0000', '\u0009', '\u001b', '\u007f']) {
    assert.throws(
      () => record({ ...authority, statement: `Authorize${bad}waiver` }),
      /authorization-statement/
    );
  }
  assert.throws(
    () => record({ ...authority, origin: 'codex-session-transcript' }),
    /authorization-reference/
  );
});
