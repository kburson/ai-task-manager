// @story #1782
// Project verification providers may require deterministic npm ci arguments
// during Test sandbox setup without changing the default Node setup command.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  createVerificationReceipt,
  validateVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { buildNpmCiArgv } from '../../../../task-tracker/verbs/test.mjs';

const FINGERPRINT = Object.freeze({
  commitSha: 'a'.repeat(40),
  verificationCommands: Object.freeze([]),
  environment: Object.freeze({
    node: 'v26.8.1',
    platform: 'darwin',
    lockfileHash: `sha256:${'b'.repeat(64)}`,
    configHashes: Object.freeze({ package: `sha256:${'c'.repeat(64)}` }),
    sandbox: Object.freeze({ kind: 'worktree', identity: '/tmp/aitm-1782', clean: true }),
  }),
});

test('buildNpmCiArgv keeps the default Test setup command unchanged', () => {
  assert.deepEqual(buildNpmCiArgv(), ['ci', '--no-audit', '--no-fund']);
});

test('buildNpmCiArgv appends validated project-provider npm-ci args', () => {
  assert.deepEqual(buildNpmCiArgv(['--legacy-peer-deps']), [
    'ci',
    '--no-audit',
    '--no-fund',
    '--legacy-peer-deps',
  ]);
});

test('verification receipt preserves project-provider setup policy', () => {
  const receipt = createVerificationReceipt({
    issueNumber: 1782,
    stage: 'test',
    fingerprint: FINGERPRINT,
    commands: [
      {
        classification: 'xcode-tests',
        providerId: 'project',
        kind: 'test',
        command: 'npm',
        args: ['run', 'test:slow'],
        exitCode: 0,
        durationMs: 12,
        startedAt: '2026-09-24T00:00:00.000Z',
        completedAt: '2026-09-24T00:00:00.012Z',
      },
    ],
    provider: {
      id: 'project',
      requiredClassifications: ['xcode-tests'],
      setup: { name: 'npm-ci', args: ['--legacy-peer-deps'] },
    },
    now: () => '2026-09-24T00:00:00.000Z',
  });

  assert.deepEqual(receipt.provider.setup, {
    name: 'npm-ci',
    args: ['--legacy-peer-deps'],
  });
  assert.equal(
    validateVerificationReceipt({
      receipt,
      expectedIssue: 1782,
      expectedStage: 'test',
      fingerprint: FINGERPRINT,
      required: ['xcode-tests'],
    }).ok,
    true
  );
});
