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

// @story #1855
// Coherent historical receipt DATA is separate from current eligibility.
test('recorded Develop receipt predicate shares native required results without current authority', async () => {
  const receipts = await import('../../../../task-tracker/lib/verification-receipt.mjs');
  const receipt = receipts.parseVerificationReceipt(receiptBody(), 'develop-final');
  const input = { receipt, issueNumber: 937, headSha: SHA };
  assert.equal(receipts.qualifyRecordedDevelopReceipt(input), true);
  for (const change of [
    (x) => {
      x.issueNumber++;
    },
    (x) => {
      x.headSha = 'c'.repeat(40);
    },
    (x) => {
      x.receipt.commands[0].exitCode = 1;
    },
    (x) => {
      x.receipt.commands.pop();
    },
    (x) => {
      x.receipt.stage = 'test';
    },
    (x) => {
      x.receipt = { ok: true, stage: 'develop-final', commitSha: SHA };
    },
    (x) => {
      x.receipt.commands[0].args = ['run', 'weak-check'];
    },
  ]) {
    const changed = structuredClone(input);
    change(changed);
    assert.equal(receipts.qualifyRecordedDevelopReceipt(changed), false);
  }
  assert.throws(
    () => receipts.qualifyRecordedDevelopReceipt({ ...input, current: true }),
    /recorded-develop-receipt/
  );
  const projected = structuredClone(input);
  projected.receipt.provider = { id: 'project', requiredClassifications: ['native-custom'] };
  projected.receipt.commands = [
    {
      classification: 'native-custom',
      command: 'node',
      args: ['check.mjs'],
      exitCode: 0,
      durationMs: 1,
    },
  ];
  assert.equal(receipts.qualifyRecordedDevelopReceipt(projected), true);
  projected.receipt.commands[0].exitCode = 2;
  assert.equal(receipts.qualifyRecordedDevelopReceipt(projected), false);
});
