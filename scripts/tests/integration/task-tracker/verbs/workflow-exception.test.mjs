// @story #1626 #1787 #1794
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import {
  executeWorkflowExceptionWrite,
  inspectWorkflowException,
} from '../../../../task-tracker/lib/workflow-policy/exception-store.mjs';
import { partitionWorkflowExceptions } from '../../../../task-tracker/lib/workflow-policy/exception-partitions.mjs';
import {
  createCodexSessionSourceLoader,
  hashAuthorizationStatement,
  resolveWorkflowExceptionAuthority,
} from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  formatWorkflowExceptionResult,
  parseWorkflowExceptionArgs,
  parseWorkflowExceptionRequest,
  runWorkflowException,
} from '../../../../task-tracker/verbs/workflow-exception.mjs';

const repository = 'kburson/ai-task-manager';
const scopeBody = `## User Story

As a maintainer
I want a scoped exception
So that the policy remains explicit

## Scope

Implement only this bounded story.

## Acceptance Criteria

- [ ] The record remains auditable.
`;
const source = Object.freeze({
  schema: 'aitm.authorization-source/v1',
  adapter: 'codex-session/v1',
  sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
  messageId: 'msg_authority',
  statementHash: `sha256:${'f'.repeat(64)}`,
});
const request = Object.freeze({
  schema: 'aitm.workflow-exception-request/v1',
  exceptionId: 'incident-plan-review',
  requirementIds: ['planning.deep-dive'],
  constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
  reason: 'The operator explicitly authorized this bounded exception.',
  authorizationSource: source,
  expiresAt: '2026-09-15T20:00:00.000Z',
});

function resolvedAuthority(issue) {
  return {
    status: 'verified',
    authority: {
      reference: `codex://sessions/${source.sessionId}/messages/${source.messageId}`,
      statement: `For issue #${issue}, use the bounded workflow exception.`,
      principal: null,
      recordingActor: `codex/session:${source.sessionId}`,
      origin: 'codex-session-transcript',
      verificationLevel: 'host-verified-user-message',
    },
  };
}

function createRuntime({
  failIssues = new Set(),
  ambiguousAfterWrite = new Set(),
  injectForkIssues = new Set(),
} = {}) {
  const comments = new Map();
  let idCounter = 1;
  let appendCount = 0;
  const records = (issue) => comments.get(issue) ?? [];
  return {
    comments,
    get appendCount() {
      return appendCount;
    },
    async fetchIssue(issue) {
      return { number: issue, body: scopeBody };
    },
    async resolveAuthority({ issue }) {
      return resolvedAuthority(issue);
    },
    async listRecords(issue) {
      return records(issue);
    },
    async appendRecord({ issue, body }) {
      appendCount += 1;
      const commentNodeId = `IC_exception_${issue}_${idCounter++}`;
      const parsed = parseAitmRecord({
        commentNodeId,
        body,
        expectedRepository: repository,
        expectedIssue: issue,
      });
      const stored = { ...parsed, body };
      comments.set(issue, [...records(issue), stored]);
      if (injectForkIssues.has(issue)) {
        const payload = parsed.envelope.payload;
        const fork = createWorkflowExceptionEnvelope({
          repository,
          issue,
          exceptionId: payload.exceptionId,
          revision: payload.revision,
          status: payload.status,
          scopeIdentity: payload.scopeIdentity,
          requirementIds: ['review.design'],
          constraints: payload.constraints,
          reason: 'A concurrent writer recorded a conflicting bounded policy.',
          authorization: payload.approvalEvidence,
          expiresAt: payload.expiresAt,
          operationId: `sha256:${'e'.repeat(64)}`,
          predecessor: parsed.envelope.predecessor,
          supersedes: parsed.envelope.supersedes,
          createdAt: parsed.envelope.createdAt,
          recordId: '01M2H000000000000000000070',
          grantId: '01M2H000000000000000000071',
        });
        comments.set(issue, [
          ...records(issue),
          { commentNodeId: `IC_exception_${issue}_fork`, envelope: fork },
        ]);
      }
      if (failIssues.has(issue)) {
        if (!ambiguousAfterWrite.has(issue)) comments.set(issue, records(issue).slice(0, -1));
        throw new Error(`transport lost for #${issue}`);
      }
      return stored;
    },
    nextIds() {
      const suffix = String(idCounter).padStart(2, '0');
      return {
        recordId: `01M2H0000000000000000000${suffix}`,
        grantId: `01M2H0000000000000000009${suffix}`,
      };
    },
  };
}

test('ordinary exception and two delivery operations retain isolated histories', async () => {
  const runtime = createRuntime();
  const issue = 57;
  const ordinary = await runWorkflowException({
    action: 'record',
    issues: [issue],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  assert.equal(ordinary.status, 'recorded');
  const scopeIdentity = runtime.comments.get(issue)[0].envelope.payload.scopeIdentity;
  const authority = resolvedAuthority(issue).authority;
  for (const n of [1, 2]) {
    const deliveryScope = {
      schema: 'aitm.delivery-exception-scope/v1',
      repository,
      issue,
      exceptionKind: 'delivery.invariant-waiver',
      pullRequest: 1785,
      acceptedHeadSha: 'a'.repeat(40),
      baseRef: 'trunk',
      resolvedTrunkRef: 'origin/trunk',
      requirementId: 'delivery.verification.merge-method',
      deliveryOperationId: `01M2H00000000000000000000${n}`,
    };
    const result = await executeWorkflowExceptionWrite({
      action: 'record',
      repository,
      issue,
      scopeIdentity,
      request: {
        scopeKind: 'delivery',
        deliveryScope,
        waiverScopeDigest: buildDeliveryScope(deliveryScope).waiverScopeDigest,
        exceptionId: `delivery-${n}`,
        requirementIds: [deliveryScope.requirementId],
        constraints: [],
        reason: 'The operator approved one exact delivery operation.',
        expiresAt: '2026-09-15T20:00:00.000Z',
      },
      authority,
      now: '2026-09-14T21:00:00.000Z',
      runtime,
    });
    assert.equal(result.status, 'created');
  }
  const records = runtime.comments.get(issue);
  const grouped = partitionWorkflowExceptions({ records, repository, issue });
  assert.equal(grouped.ordinary.length, 1);
  assert.equal(grouped.delivery.size, 2);
  const ordinaryHead = await inspectWorkflowException({
    repository,
    issue,
    scopeIdentity,
    now: '2026-09-14T21:00:00.000Z',
    runtime,
  });
  assert.equal(ordinaryHead.status, 'active');
  assert.deepEqual(ordinaryHead.active.requirementIds, ['planning.deep-dive']);
  assert.deepEqual(ordinaryHead.active.constraints, [
    { id: 'provider.managed-execution', effect: 'deny' },
  ]);
});

test('argument and request parsers enforce explicit actions, issues, and closed shapes', () => {
  assert.deepEqual(
    parseWorkflowExceptionArgs(['record', '#57', '58', '--input-file', 'request.json', '--json']),
    { action: 'record', issues: [57, 58], inputFile: 'request.json', json: true }
  );
  assert.deepEqual(parseWorkflowExceptionArgs(['show', '#57']), {
    action: 'show',
    issues: [57],
    inputFile: null,
    json: false,
  });
  assert.deepEqual(
    parseWorkflowExceptionRequest(JSON.stringify(request), { action: 'record' }),
    request
  );
  assert.throws(
    () =>
      parseWorkflowExceptionRequest(JSON.stringify({ ...request, authorized: true }), {
        action: 'record',
      }),
    /workflow-exception-request:keys/
  );
  assert.throws(() => parseWorkflowExceptionArgs(['record', '--json']), /workflow-exception:usage/);
});

test('authority resolution preserves a host-verified user message and rejects agent-authored evidence', async () => {
  const verified = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: `codex/session:${source.sessionId}`,
    loadSource: async () => ({
      role: 'user',
      statement: 'Use the exact bounded exception.',
      statementHash: source.statementHash,
      principal: null,
    }),
  });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.authority.statement, 'Use the exact bounded exception.');
  assert.equal(verified.authority.principal, null);

  const blocked = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: `codex/session:${source.sessionId}`,
    loadSource: async () => ({
      role: 'assistant',
      statement: 'Use the exact bounded exception.',
      statementHash: source.statementHash,
      principal: 'kburson',
    }),
  });
  assert.deepEqual(blocked, {
    status: 'blocked',
    code: 'authorization-source-not-human',
    remediation:
      'Supply an exact user-message reference through a supported host authorization adapter.',
  });
});

test('Codex source loading excludes host-injected blocks from the preserved user statement', async () => {
  const sandbox = mkdtempProjectIsolated('workflow-authority-');
  const transcriptPath = path.join(sandbox, 'session.jsonl');
  const statement = 'For issue #57, authorize only the named bounded workflow exception.';
  writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        id: source.messageId,
        role: 'user',
        content: [
          { type: 'input_text', text: '<user-memory>injected setup</user-memory>' },
          { type: 'input_text', text: statement },
        ],
      },
    })}\n`,
    'utf8'
  );
  try {
    const loader = createCodexSessionSourceLoader({
      transcriptPath,
      expectedSessionId: source.sessionId,
    });
    const observed = await loader({
      ...source,
      statementHash: hashAuthorizationStatement(statement),
    });
    assert.deepEqual(observed, {
      role: 'user',
      statement,
      principal: null,
      statementHash: hashAuthorizationStatement(statement),
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('record writes one exact-readback capsule and an identical retry is idempotent', async () => {
  const runtime = createRuntime();
  const first = await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  const second = await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:01:00.000Z',
    runtime,
  });
  assert.equal(first.status, 'recorded');
  assert.equal(first.results[0].status, 'created');
  assert.equal(second.results[0].status, 'existing');
  assert.equal(second.results[0].recordId, first.results[0].recordId);
  assert.equal(runtime.appendCount, 1);
});

test('changed policy requires revise, which appends revision two and preserves revision one', async () => {
  const runtime = createRuntime();
  await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  const changed = { ...request, requirementIds: ['review.implementation'] };
  const refused = await runWorkflowException({
    action: 'record',
    issues: [57],
    request: changed,
    repository,
    now: '2026-09-14T20:30:00.000Z',
    runtime,
  });
  const revised = await runWorkflowException({
    action: 'revise',
    issues: [57],
    request: changed,
    repository,
    now: '2026-09-14T21:00:00.000Z',
    runtime,
  });
  assert.equal(refused.results[0].code, 'revision-required');
  assert.equal(revised.results[0].revision, 2);
  assert.equal(runtime.comments.get(57).length, 2);
  assert.equal(
    runtime.comments.get(57)[1].envelope.supersedes,
    runtime.comments.get(57)[0].envelope.recordId
  );
});

test('revoke appends a terminal revision and show reports immutable history', async () => {
  const runtime = createRuntime();
  const recorded = await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  const revokeRequest = {
    schema: 'aitm.workflow-exception-revocation/v1',
    exceptionId: request.exceptionId,
    reason: 'The operator withdrew the bounded authorization.',
    authorizationSource: source,
  };
  const revoked = await runWorkflowException({
    action: 'revoke',
    issues: [57],
    request: revokeRequest,
    repository,
    now: '2026-09-14T21:00:00.000Z',
    runtime,
  });
  const shown = await runWorkflowException({
    action: 'show',
    issues: [57],
    repository,
    now: '2026-09-14T21:01:00.000Z',
    runtime,
  });
  assert.equal(revoked.results[0].status, 'revoked');
  assert.equal(revoked.results[0].revision, 2);
  assert.equal(shown.results[0].status, 'revoked');
  assert.deepEqual(
    shown.results[0].history.map((item) => item.disposition),
    ['superseded', 'revoked']
  );
  assert.equal(shown.results[0].history[0].recordId, recorded.results[0].recordId);
});

test('a lost response reconciles the exact operation while partial series reports every issue', async () => {
  const recoveredRuntime = createRuntime({
    failIssues: new Set([57]),
    ambiguousAfterWrite: new Set([57]),
  });
  const recovered = await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime: recoveredRuntime,
  });
  assert.equal(recovered.results[0].status, 'created');
  assert.equal(recovered.results[0].recoveredAfterTransport, true);

  const partialRuntime = createRuntime({ failIssues: new Set([58]) });
  const partial = await runWorkflowException({
    action: 'record',
    issues: [57, 58],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime: partialRuntime,
  });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(
    partial.results.map(({ issue, status }) => ({ issue, status })),
    [
      { issue: 57, status: 'created' },
      { issue: 58, status: 'indeterminate' },
    ]
  );
});

test('post-write resolution reports a concurrent active fork instead of claiming creation', async () => {
  const runtime = createRuntime({ injectForkIssues: new Set([57]) });
  const result = await runWorkflowException({
    action: 'record',
    issues: [57],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.results[0].status, 'blocked');
  assert.equal(result.results[0].code, 'ambiguous-active-records');
});

test('human and JSON formatters expose the same per-issue disposition without success inflation', async () => {
  const runtime = createRuntime({ failIssues: new Set([58]) });
  const result = await runWorkflowException({
    action: 'record',
    issues: [57, 58],
    request,
    repository,
    now: '2026-09-14T20:00:00.000Z',
    runtime,
  });
  const human = formatWorkflowExceptionResult(result, { json: false });
  const json = JSON.parse(formatWorkflowExceptionResult(result, { json: true }));
  assert.match(human, /#57: created/);
  assert.match(human, /#58: indeterminate/);
  assert.equal(json.status, 'partial');
  assert.deepEqual(
    json.results.map((item) => item.status),
    ['created', 'indeterminate']
  );
});
