// @story #1089
// cspell:ignore deadbee
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appendReviewProbeEvidence,
  emitSandboxVerificationFailureTimeline,
  resolveReviewVerificationEvidence,
} from '../../../../task-tracker/verbs/review.mjs';
import * as reviewVerb from '../../../../task-tracker/verbs/review.mjs';
import { testExitDodVerifiedGuard } from '../../../../task-tracker/lib/test-exit-dod-verified-guard.mjs';
import {
  canonicalVerificationCommandSet,
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-08-01T20:00:00.000Z';
const VERIFICATION_COMMANDS = [
  ['node', '--test', 'scripts/tests/unit/task-tracker/lib/markers.test.mjs'],
  ['npm', 'run', 'format:check'],
  ['npm', 'run', 'lint'],
];

function fingerprint(overrides = {}) {
  return {
    commitSha: overrides.commitSha || SHA,
    verificationCommands: overrides.verificationCommands || VERIFICATION_COMMANDS,
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
      '## Verification Commands',
      '- [ ] `npm run lint`',
      '- [ ] `npm run format:check`',
      '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
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

test('Review refuses a Test receipt after live Verification Commands change', async () => {
  const receipt = testReceipt();
  const body = bodyWith(receipt).replace('`npm run lint`', '`npm test`');
  const result = await resolveReviewVerificationEvidence({
    body,
    projectDir: process.cwd(),
    getHeadSha: async () => SHA,
    buildFingerprint: async ({ verificationCommands }) => ({
      ...fingerprint(),
      verificationCommands: canonicalVerificationCommandSet(verificationCommands, {
        projectDir: process.cwd(),
      }),
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(({ code }) => code === 'vc-set-mismatch'));
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

test('receipt refusal uses the audited Test-to-Develop rework path', async () => {
  const moves = [];
  const rows = [];
  const reason =
    'verification receipt invalid: lockfile-mismatch; Develop finalization and a new Test pass required';
  await emitSandboxVerificationFailureTimeline({
    target: '#1089',
    ts: INSTANT,
    delta: { activeSec: 2, idleSec: 0 },
    wordMarker: 10,
    reason,
    deps: {
      safePostTiming: async (_target, row) => rows.push(row),
      buildRow: (row) => row,
      runMoveState: async (...args) => moves.push(args),
    },
  });
  assert.equal(rows[0].event, 'test:failed');
  assert.match(rows[0].description, /lockfile-mismatch/);
  assert.deepEqual(moves, [
    ['#1089', 'develop', { extraArgs: ['--demote', '--demote-reason', reason] }],
  ]);
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

test('a reviewer probe drops prior Review evidence from a different fingerprint', () => {
  const initialProbe = appendReviewProbeEvidence({
    body: bodyWith(testReceipt()),
    issueNumber: 1089,
    fingerprint: fingerprint(),
    probes: [
      {
        command: 'node',
        args: ['--test', 'old.test.mjs'],
        exitCode: 0,
        durationMs: 7,
      },
    ],
    now: () => INSTANT,
  });
  const changedFingerprint = fingerprint({ commitSha: 'c'.repeat(40) });
  const result = appendReviewProbeEvidence({
    body: initialProbe.body,
    issueNumber: 1089,
    fingerprint: changedFingerprint,
    probes: [
      {
        command: 'node',
        args: ['--test', 'current.test.mjs'],
        exitCode: 0,
        durationMs: 9,
      },
    ],
    now: () => INSTANT,
  });
  const reviewReceipt = parseVerificationReceipt(result.body, 'review');
  assert.equal(reviewReceipt.commitSha, changedFingerprint.commitSha);
  assert.deepEqual(
    reviewReceipt.commands.map(({ args }) => args),
    [['--test', 'current.test.mjs']]
  );
});

test('Review probe mode executes an allowlisted command and persists read-back evidence', async () => {
  assert.equal(typeof reviewVerb.runReviewProbes, 'function');
  let body = bodyWith(testReceipt());
  let executions = 0;
  const result = await reviewVerb.runReviewProbes({
    body,
    issueNumber: 1089,
    projectDir: '/project',
    commands: ['node --test probe.test.mjs'],
    now: () => INSTANT,
    deps: {
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(),
      captureEvidenceProvenance: () => ({
        worktreePath: '/project',
        branch: 'feature/child/1089',
        boundIssue: 1089,
      }),
      validateCommand: () => ({ ok: true, argv: ['node', '--test', 'probe.test.mjs'] }),
      executeCommand: async () => {
        executions += 1;
        return {
          exitCode: 0,
          durationMs: 7,
          startedAt: INSTANT,
          completedAt: INSTANT,
        };
      },
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
      },
      fetchBody: async () => body,
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(executions, 1);
  assert.equal(parseVerificationReceipt(body, 'test').stage, 'test');
  const reviewReceipt = parseVerificationReceipt(body, 'review');
  assert.equal(reviewReceipt.issue, 1089);
  assert.equal(reviewReceipt.commands[0].classification, 'review-probe');
  assert.deepEqual(reviewReceipt.commands[0].args, ['--test', 'probe.test.mjs']);
});

test('Review probe mode persists a red probe and returns failure', async () => {
  assert.equal(typeof reviewVerb.runReviewProbes, 'function');
  let body = bodyWith(testReceipt());
  const result = await reviewVerb.runReviewProbes({
    body,
    issueNumber: 1089,
    projectDir: '/project',
    commands: ['node --test probe.test.mjs'],
    now: () => INSTANT,
    deps: {
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(),
      captureEvidenceProvenance: () => ({
        worktreePath: '/project',
        branch: 'feature/child/1089',
        boundIssue: 1089,
      }),
      validateCommand: () => ({ ok: true, argv: ['node', '--test', 'probe.test.mjs'] }),
      executeCommand: async () => ({
        exitCode: 1,
        durationMs: 7,
        startedAt: INSTANT,
        completedAt: INSTANT,
      }),
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
      },
      fetchBody: async () => body,
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(parseVerificationReceipt(body, 'review').commands[0].exitCode, 1);
});

test('Review probe parser accepts repeatable quoted values and rejects a missing value', () => {
  assert.deepEqual(
    reviewVerb.parseReviewProbeCommands([
      '#1089',
      '--probe',
      'node --test one.test.mjs',
      '--probe=node --test two.test.mjs',
    ]),
    ['node --test one.test.mjs', 'node --test two.test.mjs']
  );
  assert.throws(() => reviewVerb.parseReviewProbeCommands(['#1089', '--probe']), /requires/);
});
