import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  appendWakeOutcome,
  readWakeOperation,
  reserveWakeOperation,
} from '../../src/coordinator/ledger.mjs';

const NOW = new Date('2026-09-13T12:00:00.000Z');

function workspace(t) {
  const root = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(root, { recursive: true });
  const value = mkdtempSync(path.join(root, 'coordinator-ledger-'));
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function decision(overrides = {}) {
  return {
    kind: 'wake',
    authority_revision: 4,
    participant_fingerprint: `sha256:${'b'.repeat(64)}`,
    transport: { capability: 'native-push', adapter: 'codex-app', adapter_version: '2.0.0' },
    delivery: {
      delivery_id: 'author-turn-1-to-reviewer',
      recipient: 'reviewer',
      digest: `sha256:${'d'.repeat(64)}`,
      sequence: 7,
      revision: 4,
      receipt_verified: true,
    },
    capsule: {
      schema: 'ai-peer-review.wake-capsule/v1',
      review_id: 'review-ledger-01',
      expected_revision: 4,
      target_role: 'reviewer',
      reason: 'role-actionable',
      next_command: 'peer-review resume /repo/workspace',
    },
    ...overrides,
  };
}

test('exact retry returns one immutable operation and additive outcomes', (t) => {
  const root = workspace(t);
  const first = reserveWakeOperation(root, decision(), NOW);
  const retry = reserveWakeOperation(root, decision(), new Date(NOW.valueOf() + 1000));
  assert.deepEqual(retry, first);
  assert.equal(first.status, 'reserved');

  const acknowledged = appendWakeOutcome(
    root,
    first.operation_id,
    { status: 'acknowledged', reason: 'adapter-acknowledged' },
    new Date(NOW.valueOf() + 2000)
  );
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.outcomes.length, 1);
  assert.deepEqual(readWakeOperation(root, first.operation_id), acknowledged);
});

test('same key with different immutable bytes refuses without replacement', (t) => {
  const root = workspace(t);
  const first = reserveWakeOperation(root, decision(), NOW);
  const operationFile = first.paths.operation;
  const before = readFileSync(operationFile);
  assert.throws(
    () =>
      reserveWakeOperation(
        root,
        decision({ capsule: { ...decision().capsule, next_command: 'peer-review status other' } }),
        NOW
      ),
    (error) => error.code === 'APR_WAKE_CONFLICT'
  );
  assert.deepEqual(readFileSync(operationFile), before);
});

test('rejects unknown outcomes and terminal outcome extension', (t) => {
  const root = workspace(t);
  const operation = reserveWakeOperation(root, decision(), NOW);
  assert.throws(
    () => appendWakeOutcome(root, operation.operation_id, { status: 'wat', reason: 'x' }, NOW),
    (error) => error.code === 'APR_WAKE_LEDGER_INVALID'
  );
  appendWakeOutcome(root, operation.operation_id, { status: 'acknowledged', reason: 'ok' }, NOW);
  assert.throws(
    () =>
      appendWakeOutcome(root, operation.operation_id, { status: 'refused', reason: 'late' }, NOW),
    (error) => error.code === 'APR_WAKE_CONFLICT'
  );
});

test('rejects symlinked wake storage and malformed immutable bytes', (t) => {
  const root = workspace(t);
  const outside = workspace(t);
  symlinkSync(outside, path.join(root, 'wake'));
  assert.throws(
    () => reserveWakeOperation(root, decision(), NOW),
    (error) => error.code === 'APR_WAKE_LEDGER_INVALID'
  );

  rmSync(path.join(root, 'wake'));
  const operation = reserveWakeOperation(root, decision(), NOW);
  writeFileSync(operation.paths.operation, '{"torn":true}');
  assert.throws(
    () => readWakeOperation(root, operation.operation_id),
    (error) => error.code === 'APR_WAKE_LEDGER_INVALID'
  );
});
