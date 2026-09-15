// @story #1628
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateWorkflowBoundary,
  loadWorkflowBoundary,
  requirementIdsForGuardRefusals,
} from '../../../../../task-tracker/lib/workflow-policy/enforcement.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from '../../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1628;
const now = '2026-09-15T01:00:00.000Z';
const body = `## User Story

As a maintainer
I want bounded enforcement
So that exceptions stay honest

## Scope

Integrate current authority at each boundary.

## Acceptance Criteria

- [ ] Revocation blocks the next boundary.
`;
const authorization = Object.freeze({
  reference: 'codex://sessions/session-1/messages/message-1',
  statement: 'Waive the deep-dive output for issue #1628 only.',
  principal: 'github-user:kburson',
  recordingActor: 'codex/session:session-1',
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
    exceptionId: 'bounded-plan-exception',
    revision: 1,
    status: 'active',
    scopeIdentity: computeScopeIdentity({ repository, issue, body }),
    requirementIds: ['planning.deep-dive'],
    constraints: [],
    reason: 'The operator explicitly authorized this bounded planning exception.',
    authorization,
    expiresAt: null,
    operationId: `sha256:${'a'.repeat(64)}`,
    createdAt: '2026-09-15T00:00:00.000Z',
    recordId: recordId(1),
    grantId: recordId(90),
    ...overrides,
  });
}

function stored(value, suffix = '1') {
  return { commentNodeId: `IC_boundary_${suffix}`, envelope: value };
}

test('a live scope-bound exception waives only its named requirement', () => {
  const result = evaluateWorkflowBoundary({
    repository,
    issue,
    body,
    records: [stored(envelope())],
    requirementIds: ['planning.deep-dive', 'approval.plan'],
    evidence: {
      'approval.plan': { state: 'satisfied', reference: 'issue-body://aitm-plan-approved' },
    },
    activity: 'workflow-transition:develop',
    state: 'plan',
    now,
  });

  assert.equal(result.status, 'policy-compatible');
  assert.equal(result.isWaived('planning.deep-dive'), true);
  assert.equal(result.isWaived('approval.plan'), false);
  assert.equal(result.decision('planning.deep-dive').authority.recordId, recordId(1));
});

test('revocation and material scope change invalidate a prior waiver', () => {
  const first = envelope();
  const revoked = envelope({
    revision: 2,
    status: 'revoked',
    predecessor: first.recordId,
    supersedes: first.recordId,
    recordId: recordId(2),
    grantId: recordId(91),
    operationId: `sha256:${'b'.repeat(64)}`,
    createdAt: '2026-09-15T00:30:00.000Z',
  });
  const revokedResult = evaluateWorkflowBoundary({
    repository,
    issue,
    body,
    records: [stored(first), stored(revoked, '2')],
    requirementIds: ['planning.deep-dive'],
    activity: 'source-edit',
    state: 'develop',
    now,
  });
  const changedResult = evaluateWorkflowBoundary({
    repository,
    issue,
    body: body.replace('bounded enforcement', 'materially different enforcement'),
    records: [stored(first)],
    requirementIds: ['planning.deep-dive'],
    activity: 'source-edit',
    state: 'develop',
    now,
  });

  assert.equal(revokedResult.isWaived('planning.deep-dive'), false);
  assert.equal(revokedResult.exceptionStatus, 'revoked');
  assert.equal(changedResult.isWaived('planning.deep-dive'), false);
  assert.equal(changedResult.exceptionStatus, 'stale-scope');
});

test('live loader reads records on every boundary and fails closed on read ambiguity', async () => {
  let reads = 0;
  const runtime = {
    async listRecords() {
      reads += 1;
      if (reads === 1) return [stored(envelope())];
      throw new Error('record history unavailable');
    },
  };
  const input = {
    repository,
    issue,
    body,
    requirementIds: ['planning.deep-dive'],
    activity: 'source-edit',
    state: 'develop',
    now,
    runtime,
  };

  const first = await loadWorkflowBoundary(input);
  const second = await loadWorkflowBoundary(input);

  assert.equal(first.isWaived('planning.deep-dive'), true);
  assert.equal(second.isWaived('planning.deep-dive'), false);
  assert.equal(second.status, 'indeterminate');
  assert.match(second.conflicts[0].detail, /record history unavailable/);
  assert.equal(reads, 2);
});

test('every waivable Plan-exit guard maps to its finite requirement IDs', () => {
  assert.deepEqual(
    requirementIdsForGuardRefusals([
      { id: 'plan-exit-plan-approved' },
      { id: 'plan-exit-planned-estimate' },
      { id: 'plan-exit-deep-dive' },
      { id: 'plan-exit-plan-metadata' },
      { id: 'plan-exit-vc-presence' },
    ]),
    [
      'approval.plan',
      'planning.planned-estimate',
      'planning.forecast',
      'planning.deep-dive',
      'planning.metadata',
    ]
  );
});
