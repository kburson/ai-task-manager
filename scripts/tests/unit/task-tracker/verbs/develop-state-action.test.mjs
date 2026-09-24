// @story #937

import assert from 'node:assert/strict';
import test from 'node:test';

import developState from '../../../../task-tracker/states/develop.mjs';
import { developVerificationAction } from '../../../../task-tracker/lib/resident-actions/develop-verification.mjs';
import { createVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';

const INSTANT = '2026-09-01T12:00:00.000Z';

function fingerprint(commitSha) {
  return {
    commitSha,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/workspace', clean: true },
    },
  };
}

function command(classification, overrides = {}) {
  return {
    classification,
    providerId: 'project',
    kind: 'build',
    command: 'npm',
    args: ['run', 'lint'],
    exitCode: 0,
    durationMs: 1,
    startedAt: INSTANT,
    completedAt: INSTANT,
    ...overrides,
  };
}

test('Develop owns exact-head implementation verification as a resident action', () => {
  assert.deepEqual(developState.residentActions, [developVerificationAction]);
});

test('Develop verification runs the finalizer and persists its receipt', async () => {
  const writes = [];
  const receipt = { stage: 'develop-final', commitSha: 'a'.repeat(40) };
  const result = await developVerificationAction.run(
    {
      develop: {
        finalize: async () => ({ ok: true, receipt }),
        persistReceipt: async (input) => writes.push(input),
      },
    },
    { issue: { value: 937 }, headSha: { value: 'a'.repeat(40) } },
    { correlation: { action: 'develop' } }
  );

  assert.equal(result.status, 'complete');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].receipt, receipt);
});

test('Develop verification accepts project-provider required classifications at exact head', async () => {
  const sha = 'b'.repeat(40);
  const receipt = createVerificationReceipt({
    issueNumber: 1779,
    stage: 'develop-final',
    fingerprint: fingerprint(sha),
    provider: {
      id: 'project',
      requiredClassifications: ['repository-check'],
    },
    commands: [command('repository-check')],
    now: () => INSTANT,
  });

  const result = await developVerificationAction.verify(
    {
      develop: {
        readReceipt: async () => receipt,
      },
    },
    { issue: { value: 1779 }, headSha: { value: sha }, body: { value: '' } }
  );

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.evidence, { receiptId: receipt.receiptId, commitSha: sha });
});

test('Develop verification rejects malformed project-provider required classifications', async () => {
  const sha = 'c'.repeat(40);
  const receipt = createVerificationReceipt({
    issueNumber: 1779,
    stage: 'develop-final',
    fingerprint: fingerprint(sha),
    provider: {
      id: 'project',
      requiredClassifications: ['repository-check'],
    },
    commands: [command('repository-check')],
    now: () => INSTANT,
  });
  receipt.provider.requiredClassifications = ['repository-check', 'repository-check'];

  const result = await developVerificationAction.verify(
    {
      develop: {
        readReceipt: async () => receipt,
      },
    },
    { issue: { value: 1779 }, headSha: { value: sha }, body: { value: '' } }
  );

  assert.deepEqual(result, { status: 'incomplete', reason: 'fresh-develop-receipt-missing' });
});
