// @story #937

import assert from 'node:assert/strict';
import test from 'node:test';

import developState from '../../../../task-tracker/states/develop.mjs';
import { developExitReceiptGuard } from '../../../../task-tracker/lib/develop-exit-receipt-guard.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const SHA = 'b'.repeat(40);

function receiptBody(commands = ['npm run lint']) {
  const verificationCommands = commands.map((command) => command.split(/\s+/));
  const receipt = createVerificationReceipt({
    issueNumber: 937,
    stage: 'develop-final',
    fingerprint: {
      commitSha: SHA,
      verificationCommands,
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: `sha256:${'a'.repeat(64)}`,
        configHashes: {},
        sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
      },
    },
    commands: [
      ['lint-full', 'lint'],
      ['format-full', 'format:check'],
    ].map(([classification, script]) => ({
      classification,
      command: 'npm',
      args: ['run', script],
      exitCode: 0,
      durationMs: 1,
    })),
    now: '2026-09-01T18:00:00.000Z',
  });
  const body = [
    '## Verification Commands',
    ...commands.map((command) => `- [ ] \`${command}\``),
  ].join('\n');
  return upsertVerificationReceipt(body, receipt);
}

test('Develop exit consumes only a fresh Develop action receipt', async () => {
  assert.equal(
    developState.exitGuards.some(({ id }) => id === 'develop-exit-sandbox-proof'),
    false
  );
  assert.ok(developState.exitGuards.includes(developExitReceiptGuard));

  const accepted = await developExitReceiptGuard.run({
    toState: 'test',
    issueNumber: 937,
    headSha: SHA,
    body: receiptBody(),
  });
  assert.deepEqual(accepted, { ok: true });

  const stale = await developExitReceiptGuard.run({
    toState: 'test',
    issueNumber: 937,
    headSha: SHA,
    body: '',
    deps: { readDevelopReceipt: () => ({ stage: 'develop-final', commitSha: 'c'.repeat(40) }) },
  });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /fresh Develop action receipt/);
});

test('Develop exit refuses a receipt whose live Verification Commands changed', async () => {
  const body = receiptBody().replace('`npm run lint`', '`npm run audit`');
  const result = await developExitReceiptGuard.run({
    toState: 'test',
    issueNumber: 937,
    headSha: SHA,
    projectDir: process.cwd(),
    body,
    deps: { evidenceBranchReachability: async () => ({ ok: true, reasons: [] }) },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /develop-to-test-receipt-vc-set-mismatch/);
});
