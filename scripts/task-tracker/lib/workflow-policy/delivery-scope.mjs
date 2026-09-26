// @story #1787 #1793
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

export const DELIVERY_SCOPE_SCHEMA = 'aitm.delivery-exception-scope/v1';

const SCOPE_KEYS = Object.freeze([
  'schema',
  'repository',
  'issue',
  'exceptionKind',
  'pullRequest',
  'acceptedHeadSha',
  'baseRef',
  'resolvedTrunkRef',
  'requirementId',
  'deliveryOperationId',
]);
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const DELIVERY_ID_RE = /^delivery\.[a-z][a-z0-9.-]{0,127}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function fail(category) {
  throw new TypeError(`delivery-scope:${category}`);
}

function validRef(value) {
  return (
    typeof value === 'string' &&
    REF_RE.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.split('/').some((part) => part === '.' || part === '..' || part.endsWith('.lock'))
  );
}

export function buildDeliveryScope(input) {
  try {
    canonicalRecordJson(input);
  } catch {
    fail('canonical');
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('keys');
  const actual = Object.keys(input).sort();
  const expected = [...SCOPE_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('keys');
  }
  if (input.schema !== DELIVERY_SCOPE_SCHEMA) fail('schema');
  if (typeof input.repository !== 'string' || !REPOSITORY_RE.test(input.repository)) {
    fail('repository');
  }
  if (!Number.isSafeInteger(input.issue) || input.issue <= 0) fail('issue');
  if (
    !['delivery.invariant-waiver', 'delivery.local-trunk-close-authorization'].includes(
      input.exceptionKind
    )
  ) {
    fail('exception-kind');
  }
  if (input.exceptionKind === 'delivery.invariant-waiver') {
    if (!Number.isSafeInteger(input.pullRequest) || input.pullRequest <= 0) fail('pull-request');
  } else if (input.pullRequest !== null) {
    fail('pull-request');
  }
  if (
    input.exceptionKind === 'delivery.local-trunk-close-authorization' &&
    input.requirementId !== 'delivery.local-trunk-close-authorization'
  ) {
    fail('requirement-id');
  }
  if (typeof input.acceptedHeadSha !== 'string' || !SHA_RE.test(input.acceptedHeadSha)) {
    fail('accepted-head');
  }
  if (!validRef(input.baseRef) || !validRef(input.resolvedTrunkRef)) fail('ref');
  if (typeof input.requirementId !== 'string' || !DELIVERY_ID_RE.test(input.requirementId)) {
    fail('requirement-id');
  }
  if (typeof input.deliveryOperationId !== 'string' || !ULID_RE.test(input.deliveryOperationId)) {
    fail('operation-id');
  }
  const scope = Object.freeze({ ...input });
  const waiverScopeDigest = `sha256:${createHash('sha256')
    .update(canonicalRecordJson(scope), 'utf8')
    .digest('hex')}`;
  const partitionKey = canonicalRecordJson([
    scope.repository,
    scope.issue,
    scope.exceptionKind,
    scope.requirementId,
    scope.deliveryOperationId,
  ]);
  return Object.freeze({ scope, waiverScopeDigest, partitionKey });
}
