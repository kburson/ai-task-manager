// @story #1089
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runDevelopVerification } from '../../../../task-tracker/verify-develop.mjs';
import { parseVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';
import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import { resolveReviewVerificationEvidence } from '../../../../task-tracker/verbs/review.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const INSTANT = '2026-08-01T21:00:00.000Z';
const cfg = { repo: 'o/r' };
const PROJECT_DIR = process.cwd();

function fingerprint(commitSha, identity = '/sandbox') {
  return {
    commitSha,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity, clean: true },
    },
  };
}

function initialBody() {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    '- [ ] `npm test`',
    '- [ ] `npm run test:slow`',
    '- [ ] `node --test focused.test.mjs`',
  ].join('\n');
}

function counts(commands) {
  return commands.reduce((map, command) => {
    map.set(command, (map.get(command) || 0) + 1);
    return map;
  }, new Map());
}

test('unchanged lifecycle owns each standard command once and invalidates on a new SHA', async () => {
  let sha = SHA_A;
  let body = initialBody();
  const spawned = [];

  const iteration = runDevelopVerification({
    projectDir: PROJECT_DIR,
    mode: 'iteration',
    deps: {
      collectChangedPaths: () => ['src/feature.mjs'],
      selectAffectedTests: () => ({ tests: ['focused.test.mjs'], explanations: [] }),
      runCommand: ({ command, args }) => {
        spawned.push([command, ...args].join(' '));
        return { exitCode: 0, durationMs: 1, startedAt: INSTANT, completedAt: INSTANT };
      },
    },
  });
  assert.equal(iteration.ok, true);

  const finalize = async () =>
    runDevelopVerification({
      projectDir: PROJECT_DIR,
      mode: 'final',
      issueNumber: 1089,
      deps: {
        isClean: () => true,
        getHeadSha: () => sha,
        buildFingerprint: () => fingerprint(sha, '/outer'),
        now: () => INSTANT,
        runCommand: ({ command, args }) => {
          spawned.push([command, ...args].join(' '));
          return { exitCode: 0, durationMs: 1, startedAt: INSTANT, completedAt: INSTANT };
        },
      },
    });

  async function testPass() {
    return runVerbTest({
      cfg,
      issueNumber: 1089,
      projectDir: PROJECT_DIR,
      now: () => INSTANT,
      deps: {
        fetchBody: async () => body,
        mutateBody: async ({ mutate }) => {
          body = mutate(body);
          return { status: 'ok' };
        },
        postComment: async () => {},
        getHeadSha: async () => sha,
        runDevelopFinalization: finalize,
        createWorktree: async () => {},
        removeWorktree: async () => {},
        npmCi: async () => {},
        getSandboxHeadSha: async () => sha,
        buildFingerprint: () => fingerprint(sha),
        execInSandbox: async ({ argv }) => {
          spawned.push(argv.join(' '));
          return {
            exit: 0,
            stdout: '',
            stderr: '',
            durationMs: 1,
            startedAt: INSTANT,
            completedAt: INSTANT,
          };
        },
        moveState: async () => ({ ok: true }),
        logIssueTime: async () => {},
      },
    });
  }

  const firstTest = await testPass();
  assert.equal(firstTest.status, 'passed');
  const testReceiptA = parseVerificationReceipt(body, 'test');
  assert.equal(testReceiptA.commitSha, SHA_A);

  const beforeReview = spawned.length;
  const review = await resolveReviewVerificationEvidence({
    body,
    projectDir: PROJECT_DIR,
    getHeadSha: async () => sha,
    buildFingerprint: async () => fingerprint(sha),
  });
  assert.equal(review.ok, true);
  assert.equal(spawned.length, beforeReview, 'Review spawns no standard command');

  body = body.replace('last-known-state: develop', 'last-known-state: test');
  const repeat = await testPass();
  assert.equal(repeat.status, 'already-verified');
  assert.equal(spawned.length, beforeReview, 'no-change repeat spawns no command');

  const unchangedCounts = counts(spawned);
  for (const command of [
    'npm run lint',
    'npm run format:check',
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
  ]) {
    assert.equal(unchangedCounts.get(command), 1, `${command} runs once at SHA A`);
  }

  sha = SHA_B;
  const drift = await resolveReviewVerificationEvidence({
    body,
    projectDir: PROJECT_DIR,
    getHeadSha: async () => sha,
    buildFingerprint: async () => fingerprint(sha),
  });
  assert.equal(drift.ok, false);
  assert.ok(drift.reasons.some(({ code }) => code === 'sha-mismatch'));

  body = body.replace('last-known-state: test', 'last-known-state: develop');
  const secondTest = await testPass();
  assert.equal(secondTest.status, 'passed');
  assert.equal(parseVerificationReceipt(body, 'test').commitSha, SHA_B);
  const changedCounts = counts(spawned);
  for (const command of [
    'npm run lint',
    'npm run format:check',
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
  ]) {
    assert.equal(changedCounts.get(command), 2, `${command} runs once more at SHA B`);
  }
});
