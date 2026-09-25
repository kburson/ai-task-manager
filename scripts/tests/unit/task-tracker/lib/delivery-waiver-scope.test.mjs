// @story #1787 #1793
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';

const scope = {
  schema: 'aitm.delivery-exception-scope/v1',
  repository: 'kburson/ai-task-manager',
  issue: 1784,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: 1785,
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.verification.merge-method',
  deliveryOperationId: '01M2H000000000000000000002',
};

test('exact canonical scope has deterministic digest and operation partition', () => {
  const first = buildDeliveryScope(scope);
  assert.deepEqual(first.scope, scope);
  assert.ok(Object.isFrozen(first.scope));
  assert.equal(first.waiverScopeDigest, buildDeliveryScope({ ...scope }).waiverScopeDigest);
  assert.equal(
    first.waiverScopeDigest,
    `sha256:${createHash('sha256').update(canonicalRecordJson(scope), 'utf8').digest('hex')}`
  );
  assert.equal(
    first.partitionKey,
    canonicalRecordJson([
      scope.repository,
      scope.issue,
      scope.exceptionKind,
      scope.requirementId,
      scope.deliveryOperationId,
    ])
  );
  for (const [key, value] of [
    ['repository', 'other/repo'],
    ['issue', 1786],
    ['pullRequest', 1786],
    ['acceptedHeadSha', 'b'.repeat(40)],
    ['baseRef', 'release'],
    ['resolvedTrunkRef', 'origin/release'],
    ['requirementId', 'delivery.verification.pr-scope'],
    ['deliveryOperationId', '01M2H000000000000000000003'],
  ]) {
    assert.notEqual(
      first.waiverScopeDigest,
      buildDeliveryScope({ ...scope, [key]: value }).waiverScopeDigest,
      key
    );
  }
});

test('scope refuses extra, missing, wildcard, and malformed fields', () => {
  const { baseRef, ...withoutBase } = scope;
  for (const candidate of [
    { ...scope, resolvedTrunkSha: 'c'.repeat(40) },
    withoutBase,
    { ...scope, repository: '*' },
    { ...scope, issue: 0 },
    { ...scope, pullRequest: '*' },
    { ...scope, acceptedHeadSha: 'A'.repeat(40) },
    { ...scope, baseRef: 'refs/heads/*' },
    { ...scope, resolvedTrunkRef: 'origin/*' },
    { ...scope, requirementId: 'planning.deep-dive' },
    { ...scope, deliveryOperationId: 'short' },
    { ...scope, schema: 'aitm.delivery-exception-scope/v2' },
  ]) {
    assert.throws(() => buildDeliveryScope(candidate), /delivery-scope:/);
  }
});

test('explicit null PR is representable only as local-trunk scope', () => {
  const local = buildDeliveryScope({
    ...scope,
    exceptionKind: 'delivery.local-trunk-close-authorization',
    pullRequest: null,
    requirementId: 'delivery.local-trunk-close-authorization',
  });
  assert.equal(local.scope.pullRequest, null);
  assert.notEqual(local.waiverScopeDigest, buildDeliveryScope(scope).waiverScopeDigest);
  assert.throws(() => buildDeliveryScope({ ...scope, pullRequest: null }), /delivery-scope:/);
});
