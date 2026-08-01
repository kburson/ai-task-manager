// @story #1089
// cspell:ignore deadbee
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appendReviewProbeEvidence,
  resolveReviewVerificationEvidence,
} from '../../../verbs/review.mjs';
import { testExitDodVerifiedGuard } from '../../../lib/test-exit-dod-verified-guard.mjs';
import {
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../lib/verification-receipt.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-08-01T20:00:00.000Z';

function fingerprint(overrides = {}) {
  return {
    commitSha: overrides.commitSha || SHA,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: overrides.lockfileHash || `sha256:${'a'.repeat(64)}`,
      configHashes: overrides.configHashes || {
        'package.json': `sha256:${'b'.repeat(64)}`,
      },
      sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
    },
  };
}

function testReceipt({ commands, receiptFingerprint = fingerprint() } = {}) {
  return createVerificationReceipt({
    issueNumber: 1089,
    stage: 'test',
    fingerprint: receiptFingerprint,
    commands:
      commands ||
      [
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
}

function bodyWith(receipt) {
  return upsertVerificationReceipt(
    [
      '<!-- aitm-last-known-state: test -->',
      `<!-- aitm-test-started sha="${SHA}" ts="${INSTANT}" -->`,
      `<!-- aitm-dod-verified sha="${SHA}" ts="${INSTANT}" -->`,
    ].join('\n'),
    receipt
  );
}

test('Review validates a Test receipt and seeds standard results without spawning commands', async () => {
  let spawns = 0;
  const receipt = testReceipt();
  const result = await resolveReviewVerificationEvidence({
    body: bodyWith(receipt),
    projectDir: '/project',
    getHeadSha: async () => SHA,
    buildFingerprint: async () => fingerprint(),
    execCommand: async () => {
      spawns += 1;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'receipt-v1');
  assert.equal(spawns, 0);
  for (const command of [
    'npm run lint',
    'npm run format:check',
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
    'npm test',
    'npm run test:all',
  ]) {
    assert.equal(result.commandResults.get(command), true, command);
  }
  assert.equal(result.receipt.receiptId, receipt.receiptId);
});

test('Review seeds targeted commands only when the Test receipt recorded them', async () => {
  const receipt = testReceipt();
  receipt.commands.push({
    classification: 'test-targeted-1',
    command: 'node',
    args: ['--test', 'focused.test.mjs'],
    exitCode: 0,
    durationMs: 4,
  });
  const result = await resolveReviewVerificationEvidence({
    body: bodyWith(receipt),
    projectDir: '/project',
    getHeadSha: async () => SHA,
    buildFingerprint: async () => fingerprint(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.commandResults.get('node --test focused.test.mjs'), true);
  assert.equal(result.commandResults.has('node --test unrecorded.test.mjs'), false);
});

for (const [name, currentFingerprint, code] of [
  ['SHA', fingerprint({ commitSha: 'c'.repeat(40) }), 'sha-mismatch'],
  [
    'config',
    fingerprint({ configHashes: { 'package.json': `sha256:${'c'.repeat(64)}` } }),
    'config-mismatch',
  ],
  ['lockfile', fingerprint({ lockfileHash: `sha256:${'c'.repeat(64)}` }), 'lockfile-mismatch'],
]) {
  test(`Review fails closed on ${name} drift`, async () => {
    const result = await resolveReviewVerificationEvidence({
      body: bodyWith(testReceipt()),
      projectDir: '/project',
      getHeadSha: async () => currentFingerprint.commitSha,
      buildFingerprint: async () => currentFingerprint,
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((reason) => reason.code === code));
    assert.match(result.remediation, /Develop finalization.*Test pass/);
  });
}

test('Review fails closed when a required complete lane is absent', async () => {
  const receipt = testReceipt();
  receipt.commands = receipt.commands.filter(
    ({ classification }) => classification !== 'test-slow'
  );
  const result = await resolveReviewVerificationEvidence({
    body: bodyWith(receipt),
    projectDir: '/project',
    getHeadSha: async () => SHA,
    buildFingerprint: async () => fingerprint(),
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.reasons.some(
      ({ code, classification }) => code === 'command-missing' && classification === 'test-slow'
    )
  );
});

test('Review fails closed when HEAD cannot be resolved for a v1 receipt', async () => {
  const result = await resolveReviewVerificationEvidence({
    body: bodyWith(testReceipt()),
    projectDir: '/project',
    getHeadSha: async () => {
      throw new Error('git unavailable');
    },
    buildFingerprint: async () => fingerprint(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, [{ code: 'head-unresolvable' }]);
});

test('Review and its Test-exit guard reject a malformed v1 marker instead of falling back', async () => {
  const malformed = [
    '<!-- aitm-dod-verified sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
    '<!-- aitm-verification-receipt stage="test" data="not-json" -->',
  ].join('\n');
  const result = await resolveReviewVerificationEvidence({
    body: malformed,
    projectDir: '/project',
    getHeadSha: async () => SHA,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, [{ code: 'receipt-malformed' }]);
  const guard = testExitDodVerifiedGuard.run({
    issueNumber: 1089,
    body: malformed,
    toState: 'review',
  });
  assert.equal(guard.ok, false);
  assert.match(guard.reason, /receipt-malformed/);
});

test('Review retains marker-only compatibility when no v1 receipt exists', async () => {
  const result = await resolveReviewVerificationEvidence({
    body: '<!-- aitm-dod-verified sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
    projectDir: '/project',
    getHeadSha: async () => {
      throw new Error('legacy path remains opportunistic');
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'legacy-marker');
  assert.equal(result.commandResults.get('npm test'), true);
});

test('a reviewer probe appends separate review evidence without mutating the Test receipt', () => {
  const testEvidence = testReceipt();
  const initial = bodyWith(testEvidence);
  const result = appendReviewProbeEvidence({
    body: initial,
    issueNumber: 1089,
    fingerprint: fingerprint(),
    probes: [
      {
        command: 'node',
        args: ['--test', 'probe.test.mjs'],
        exitCode: 0,
        durationMs: 7,
      },
    ],
    now: () => INSTANT,
  });
  assert.equal(
    parseVerificationReceipt(result.body, 'test').receiptId,
    testEvidence.receiptId,
    'Test receipt remains immutable'
  );
  const reviewReceipt = parseVerificationReceipt(result.body, 'review');
  assert.equal(reviewReceipt.commands.length, 1);
  assert.equal(reviewReceipt.commands[0].classification, 'review-probe');
  assert.equal(reviewReceipt.commands[0].command, 'node');
});
