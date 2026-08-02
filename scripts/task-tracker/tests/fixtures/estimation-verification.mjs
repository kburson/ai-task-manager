// @story #1091

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
