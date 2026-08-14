// @story #1091

export const VERIFIED_SHA = 'a'.repeat(40);

export function canonicalTestReceiptFixture({ issue, sha = VERIFIED_SHA } = {}) {
  const environment = {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: `sha256:${'1'.repeat(64)}`,
    configHashes: {},
    sandbox: { kind: 'worktree', identity: '/tmp/fake-adaptive-project', clean: true },
  };
  const receipt = {
    schema: 'aitm.verification-receipt/v1',
    receiptId: '01J00000000000000000000991',
    issue,
    stage: 'test',
    commitSha: sha,
    startedAt: '2026-08-02T14:00:00.000Z',
    completedAt: '2026-08-02T14:01:00.000Z',
    environment,
    commands: [
      ['lint-full', ['run', 'lint']],
      ['format-full', ['run', 'format:check']],
      ['test-unit', ['run', 'test:unit']],
      ['test-integration', ['run', 'test:integration']],
      ['test-slow', ['run', 'test:slow']],
    ].map(([classification, args]) => ({
      classification,
      command: 'npm',
      args,
      exitCode: 0,
      durationMs: 1_000,
    })),
    supersedes: null,
  };
  return {
    body: `<!-- aitm-verification-receipt stage="test" data="${Buffer.from(JSON.stringify(receipt)).toString('base64url')}" -->`,
    fingerprint: { commitSha: sha, environment },
  };
}

export function repeatedVerificationCommand({
  classification = 'test-unit',
  durationMs = 60_000,
  commitSha = 'a'.repeat(40),
} = {}) {
  const execution = (receiptId, stage) => ({
    receiptId,
    stage,
    commitSha,
    command: 'npm',
    args: ['run', `test:${classification.replace(/^test-/, '')}`],
    exitCode: 0,
    durationMs,
    reusedFrom: null,
  });
  return {
    classification,
    durationMs: durationMs * 2,
    attempts: 2,
    executions: [
      execution('01J00000000000000000000820', 'develop-final'),
      execution('01J00000000000000000000821', 'review'),
    ],
  };
}
