import { createHash } from 'node:crypto';

import { canonicalRequestJson } from '@kburson/aitm-ledger';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value;
}

export function switchProjectionIntegrityDigest(projectionInputs) {
  if (
    !projectionInputs ||
    typeof projectionInputs !== 'object' ||
    Array.isArray(projectionInputs)
  ) {
    throw new Error('switch projection inputs are required for integrity binding');
  }
  return createHash('sha256').update(canonicalRequestJson(projectionInputs)).digest('hex');
}

export function switchTargetIntegrityKey({
  sessionId,
  targetIssueId,
  requestId,
  projectionInputs,
} = {}) {
  const sid = requiredString(sessionId, 'switch integrity sessionId');
  const target = requiredString(targetIssueId, 'switch integrity target issue');
  const request = requiredString(requestId, 'switch integrity requestId');
  return `switch-target:${sid}:${target}:${request}:integrity:${switchProjectionIntegrityDigest(
    projectionInputs
  )}`;
}

export function validateSwitchProjectionIntegrity({
  request,
  sessionId,
  targetIssueId,
  projectionInputs,
} = {}) {
  const target = requiredString(targetIssueId, 'switch integrity target issue');
  const source = requiredString(request?.issueId, 'switch integrity source issue');
  const outerPrefix = `switch:${requiredString(
    sessionId,
    'switch integrity sessionId'
  )}:${source}:${target}:`;
  const outer = requiredString(request?.idempotencyKey, 'switch integrity request idempotency');
  if (!outer.startsWith(outerPrefix)) {
    throw new Error('switch authority request identity is malformed');
  }
  const requestId = requiredString(outer.slice(outerPrefix.length), 'switch integrity requestId');
  const expected = switchTargetIntegrityKey({
    sessionId,
    targetIssueId: target,
    requestId,
    projectionInputs,
  });
  if (request?.target?.idempotencyKey !== expected) {
    throw new Error('switch projection integrity does not match immutable authority request');
  }
  return switchProjectionIntegrityDigest(projectionInputs);
}
