// @story #1110
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { resolveReviewVerificationEvidence } from '../../../../task-tracker/verbs/review.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const RECEIPT_SHA = 'a'.repeat(40);
const CURRENT_SHA = 'c'.repeat(40);
const INSTANT = '2026-08-05T09:16:00.000Z';

function environment() {
  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: `sha256:${'d'.repeat(64)}`,
    configHashes: { 'package.json': `sha256:${'e'.repeat(64)}` },
    sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
  };
}

function receiptBody() {
  const receipt = createVerificationReceipt({
    issueNumber: 1110,
    stage: 'test',
    fingerprint: { commitSha: RECEIPT_SHA, verificationCommands: [], environment: environment() },
    commands: [
      ['lint-full', 'lint'],
      ['format-full', 'format:check'],
      ['test-unit', 'test:unit'],
      ['test-integration', 'test:integration'],
      ['test-slow', 'test:slow'],
    ].map(([classification, script]) => ({
      classification,
      command: 'npm',
      args: ['run', script],
      exitCode: 0,
      durationMs: 10,
    })),
    now: () => INSTANT,
  });
  return upsertVerificationReceipt(
    [
      `<!-- aitm-test-started sha="${RECEIPT_SHA}" ts="${INSTANT}" -->`,
      `<!-- aitm-dod-verified sha="${RECEIPT_SHA}" ts="${INSTANT}" -->`,
    ].join('\n'),
    receipt
  );
}

test('#1110 reproduces the exact Review refusal after Test SHA drift', async () => {
  const result = await resolveReviewVerificationEvidence({
    body: receiptBody(),
    issueNumber: 1110,
    projectDir: '/project',
    getHeadSha: async () => CURRENT_SHA,
    buildFingerprint: async () => ({
      commitSha: CURRENT_SHA,
      verificationCommands: [],
      environment: environment(),
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.reasons.map(({ code }) => code),
    ['sha-mismatch', 'test-started-sha-mismatch', 'dod-verified-sha-mismatch']
  );
  assert.equal(
    result.remediation,
    'Return to Develop, run Develop finalization, then complete one new Test pass.'
  );
});

test('#1110 documents parent sync before Test and re-Test after any later HEAD move', () => {
  const guide = readFileSync(
    new URL('../../../../../docs/guides/workflow.md', import.meta.url),
    'utf8'
  );
  const section = guide.match(
    /### Stage-owned verification and exact-SHA receipts\n([\s\S]*?)(?=\n### )/
  )?.[1];

  assert.ok(section, 'stage-owned verification section is present');
  const syncBeforeTest = section.indexOf('Synchronize the branch with its resolved parent');
  const testOwnsBoundary = section.indexOf('`/task test #N` owns the boundary sequence');
  assert.notEqual(syncBeforeTest, -1, 'the guide states the pre-Test synchronization contract');
  assert.ok(
    syncBeforeTest < testOwnsBoundary,
    'the synchronization contract appears before Test finalization'
  );
  assert.match(
    section,
    /After Test, any operation that moves HEAD[\s\S]*requires a new\s+`\/task test #N` pass/
  );
});
