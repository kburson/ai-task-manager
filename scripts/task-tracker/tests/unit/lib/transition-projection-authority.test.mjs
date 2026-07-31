// @story #1049

import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRequestDigest } from '@kburson/aitm-ledger';

import {
  authenticateTransitionMutationCommit,
  assertTransitionProjectionAuthority,
  deriveTransitionProjectionAuthority,
} from '../../../lib/work-lease/transition-projection-authority.mjs';
import { mutateTransitionProjectionIssueBody } from '../../../lib/issue-body-mutate.mjs';
import { postTransitionTimingProjection } from '../../../gh-timing-comment.mjs';
import { stampBodyVersion } from '../../../lib/body-version.mjs';

const holder = Object.freeze({
  principalKind: 'worker',
  provider: 'codex',
  agentRunId: 'run-1',
  sessionId: 'session-1',
  hostId: 'host-1',
  pid: 123,
  worktreeId: 'worktree-1',
  pathHash: 'ea0135bca5e3bd815f5b7b8f8c83d86f584697bc29e0cc3b30937153abef2844',
  branch: 'feature/child/1049',
});
const sourceHolder = Object.freeze({ ...holder, pid: 77 });
const sourceBinding = Object.freeze({
  sessionId: 'session-1',
  issueId: '1048',
  worktreeId: 'worktree-1',
  displayPath: '/project',
});
const targetBinding = Object.freeze({ ...sourceBinding, issueId: '1049' });
const request = Object.freeze({
  projectId: 'project-1',
  issueId: '1048',
  leaseId: 'source-lease',
  fencingToken: '7',
  holder: sourceHolder,
  binding: sourceBinding,
  idempotencyKey: 'switch:session-1:1048:1049:request-1',
  switchedAt: '2026-07-30T12:00:00.000Z',
  target: Object.freeze({
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    idempotencyKey: 'switch-target:session-1:1049:request-1',
    requestedAt: '2026-07-30T12:00:00.000Z',
    ttlMs: 900_000,
    holder,
    binding: targetBinding,
  }),
});
const receipt = Object.freeze({
  lease: Object.freeze({
    projectId: 'project-1',
    issueId: '1049',
    mode: 'write',
    state: 'active',
    leaseId: 'target-lease',
    fencingToken: '8',
    holder,
    acquiredAt: '2026-07-30T12:00:00.000Z',
    heartbeatAt: '2026-07-30T12:00:00.000Z',
    expiresAt: '2026-07-30T12:15:00.000Z',
    audit: Object.freeze({ operation: 'switch' }),
  }),
  transition: Object.freeze({
    transitionId: 'transition-1',
    fromIssueId: '1048',
    fromLeaseId: 'source-lease',
    fromToken: '7',
    toIssueId: '1049',
  }),
});
const commitAuthority = await authenticateTransitionMutationCommit({
  store: {
    replayMutation: async (selector) => ({
      selector,
      outcome: 'committed',
      statusCode: 200,
      result: receipt,
    }),
  },
  rawRequest: request,
  request,
  receipt,
  transitionId: 'transition-1',
});

test('transition projection authority exposes a dedicated non-boolean proof API', async () => {
  const api = await import('../../../lib/work-lease/transition-projection-authority.mjs').catch(
    () => ({})
  );
  assert.equal(typeof api.authenticateTransitionMutationCommit, 'function');
  assert.equal(typeof api.assertTransitionMutationCommitAuthority, 'function');
  assert.equal(typeof api.deriveTransitionProjectionAuthority, 'function');
  assert.equal(typeof api.assertTransitionProjectionAuthority, 'function');
});

test('central body and timing seams expose dedicated transition-projection entrypoints', async () => {
  const bodyApi = await import('../../../lib/issue-body-mutate.mjs');
  const timingApi = await import('../../../gh-timing-comment.mjs');
  assert.equal(typeof bodyApi.mutateTransitionProjectionIssueBody, 'function');
  assert.equal(typeof timingApi.postTransitionTimingProjection, 'function');
});

function derive(overrides = {}) {
  return deriveTransitionProjectionAuthority({
    commitAuthority,
    receipt,
    request,
    transitionId: 'transition-1',
    projectionName: 'timing',
    projectionId: 'switch:timing',
    subOperationId: 'outgoing:switch-out',
    issueId: '1048',
    operation: 'evidence-mutation',
    ...overrides,
  });
}

test('transition commit proof authenticates the exact raw request digest and receipt', async () => {
  let replaySelector;
  const proof = await authenticateTransitionMutationCommit({
    store: {
      replayMutation: async (selector) => {
        replaySelector = selector;
        return { selector, outcome: 'committed', statusCode: 200, result: receipt };
      },
    },
    rawRequest: request,
    request,
    receipt,
    transitionId: 'transition-1',
  });
  assert.equal(replaySelector.requestDigest, canonicalRequestDigest(request));
  assert.equal(JSON.stringify(proof), '{}');
});

test('fresh branded proof validates exact receipt, projection, operation, and affected issue', () => {
  const proof = derive();
  assert.notEqual(proof, derive(), 'every recovery must derive a fresh in-memory proof');
  assert.equal(JSON.stringify(proof), '{}', 'proof must not serialize into queue/env state');
  assert.equal(
    assertTransitionProjectionAuthority(proof, {
      transitionId: 'transition-1',
      projectionName: 'timing',
      projectionId: 'switch:timing',
      subOperationId: 'outgoing:switch-out',
      issueId: '1048',
      operation: 'evidence-mutation',
    }),
    proof
  );
});

for (const [field, value] of [
  ['transitionId', 'other-transition'],
  ['projectionName', 'github'],
  ['projectionId', 'other-projection'],
  ['subOperationId', 'other-sub-operation'],
  ['issueId', '1049'],
  ['operation', 'issue-body-mutation'],
]) {
  test(`transition proof refuses mismatched ${field}`, () => {
    const proof = derive();
    assert.throws(
      () =>
        assertTransitionProjectionAuthority(proof, {
          transitionId: 'transition-1',
          projectionName: 'timing',
          projectionId: 'switch:timing',
          subOperationId: 'outgoing:switch-out',
          issueId: '1048',
          operation: 'evidence-mutation',
          [field]: value,
        }),
      /transition projection authority/
    );
  });
}

test('serialized or receipt-mismatched transition proofs fail closed', () => {
  const proof = derive();
  assert.throws(
    () =>
      assertTransitionProjectionAuthority(JSON.parse(JSON.stringify(proof)), {
        transitionId: 'transition-1',
        projectionName: 'timing',
        projectionId: 'switch:timing',
        subOperationId: 'outgoing:switch-out',
        issueId: '1048',
        operation: 'evidence-mutation',
      }),
    /transition projection authority/
  );
  assert.throws(
    () =>
      derive({
        receipt: {
          ...receipt,
          transition: { ...receipt.transition, fromToken: '6' },
        },
      }),
    /transition projection authority/
  );
});

test('proof derivation revalidates the complete request and receipt schema', () => {
  const { audit: _audit, ...leaseWithoutAudit } = receipt.lease;
  assert.throws(
    () => derive({ receipt: { ...receipt, lease: leaseWithoutAudit } }),
    /switch receipt lease audit is required/
  );
  assert.throws(
    () => derive({ request: { ...request, untrusted: true } }),
    /request\.untrusted is not allowed/
  );
});

test('transition issue-body retry revalidates exact proof and preserves one caller mutation', async () => {
  const projectionId = 'switch:github';
  const subOperationId = 'source-session-ref';
  const authority = derive({
    projectionName: 'github',
    projectionId,
    subOperationId,
  });
  let remote = stampBodyVersion(['head', 'A', 'middle', 'B', 'tail'].join('\n'), 1);
  let firstPush = true;
  let mutateCalls = 0;
  let pushes = 0;
  const result = await mutateTransitionProjectionIssueBody({
    authority,
    transitionId: 'transition-1',
    projectionName: 'github',
    projectionId,
    subOperationId,
    issueNumber: 1048,
    repo: 'owner/repo',
    mutate: (body) => {
      mutateCalls += 1;
      return body.replace('A', 'A-session-ref');
    },
    deps: {
      fetchBody: async () => remote,
      pushBody: async (_repo, _issue, next) => {
        pushes += 1;
        remote = next;
        if (firstPush) {
          firstPush = false;
          remote = stampBodyVersion(['head', 'A', 'middle', 'B-theirs', 'tail'].join('\n'), 3);
        }
      },
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(mutateCalls, 1);
  assert.equal(pushes, 2);
  assert.match(remote, /A-session-ref/);
  assert.match(remote, /B-theirs/);
});

test('transition central seams reject mismatched affected issue before remote effects', async () => {
  const projectionId = 'switch:timing';
  const subOperationId = 'outgoing:switch-out';
  const authority = derive({ projectionId, subOperationId });
  const effects = [];
  await assert.rejects(
    () =>
      postTransitionTimingProjection({
        authority,
        transitionId: 'transition-1',
        projectionName: 'timing',
        projectionId,
        subOperationId,
        issueNumber: 1049,
        repo: 'owner/repo',
        row: '| invalid only after authority |',
        lock: false,
        deps: {
          findTimingComment: async () => effects.push('find'),
          createTimingComment: async () => effects.push('create'),
        },
      }),
    /issueId does not match/
  );
  assert.deepEqual(effects, []);
});
