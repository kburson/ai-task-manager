// @story #1218
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';
import { runDevelopVerification } from '../../../../task-tracker/verify-develop.mjs';
import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-09-01T12:00:00.000Z';
const PROJECT_DIR = process.cwd();
const verificationProvider = {
  id: 'project',
  develop: {
    iterationSteps: [],
    finalSteps: [{ classification: 'xcode-build', kind: 'build', command: 'npm run lint' }],
  },
  test: {
    setup: 'npm-ci',
    steps: [
      {
        classification: 'simulator-ready',
        kind: 'environment',
        command: 'npm run format:check',
      },
      { classification: 'xcode-tests', kind: 'test', command: 'npm run test:unit' },
    ],
  },
};

function fingerprint(identity) {
  return {
    commitSha: SHA,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity, clean: true },
    },
  };
}

test('project provider owns Develop and Test plans with typed exact-SHA evidence', async () => {
  let body = [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run test:unit`',
    '- [ ] `npm run test:slow`',
  ].join('\n');
  const spawned = [];
  const record = ({ command, args }) => {
    spawned.push([command, ...args].join(' '));
    return { exitCode: 0, durationMs: 1, startedAt: INSTANT, completedAt: INSTANT };
  };
  const finalize = async () =>
    runDevelopVerification({
      projectDir: PROJECT_DIR,
      mode: 'final',
      issueNumber: 1218,
      verificationProvider,
      deps: {
        isClean: () => true,
        getHeadSha: () => SHA,
        buildFingerprint: () => fingerprint('/outer'),
        runCommand: record,
        now: () => INSTANT,
      },
    });

  const result = await runVerbTest({
    cfg: { repo: 'o/r', verificationProvider },
    issueNumber: 1218,
    projectDir: PROJECT_DIR,
    now: () => INSTANT,
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
      },
      postComment: async () => {},
      getHeadSha: async () => SHA,
      runDevelopFinalization: finalize,
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/sandbox'),
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

  assert.equal(result.status, 'passed');
  assert.deepEqual(spawned, [
    'npm run lint',
    'npm run format:check',
    'npm run test:unit',
    'npm run test:slow',
  ]);
  const receipt = parseVerificationReceipt(body, 'test');
  assert.deepEqual(receipt.provider, {
    id: 'project',
    requiredClassifications: ['xcode-build', 'simulator-ready', 'xcode-tests'],
  });
  assert.deepEqual(
    receipt.commands.map(({ classification, kind }) => [classification, kind]),
    [
      ['xcode-build', 'build'],
      ['simulator-ready', 'environment'],
      ['xcode-tests', 'test'],
      ['test-targeted-1', 'test'],
    ]
  );
});
