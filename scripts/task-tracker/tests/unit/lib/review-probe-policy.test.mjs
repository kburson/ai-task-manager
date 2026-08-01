// @story #1089
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as reviewVerb from '../../../verbs/review.mjs';

const SHA = 'a'.repeat(40);

function fingerprint() {
  return {
    commitSha: SHA,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/project', clean: true },
    },
  };
}

test('Review probe policy rejects standard full commands and semantic aliases', () => {
  for (const command of [
    'npm run lint',
    'npm run-script lint',
    'npm run lint -- --quiet',
    'npm run format:check',
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
    'npm test',
    'npm run test:all',
    'npm run quality',
    'npm run test:coverage',
    'node scripts/run-tests.mjs',
    'node ./scripts/run-tests.mjs --lane unit',
    'node scripts/task-tracker/../run-tests.mjs --lane unit',
    'node --test',
    'node --test scripts/task-tracker/tests/unit/lib/*.test.mjs',
    'scripts/run-tests.mjs --lane slow',
    './scripts/run-tests.mjs --lane integration',
    'scripts/task-tracker/../run-tests.mjs --lane all',
    'npx eslint .',
    'npx eslint scripts/task-tracker/verbs/review.mjs --fix',
    'npx eslint scripts/task-tracker/verbs/review.mjs --output-file report.json',
    'npx prettier --check .',
    'npx prettier --write .',
  ]) {
    const result = reviewVerb.validateReviewProbeCommand(command, { projectDir: process.cwd() });
    assert.equal(result.ok, false, command);
    assert.match(result.reason, /targeted/, command);
  }
});

test('Review probe policy allows a focused test command', () => {
  const focusedTest = 'scripts/task-tracker/tests/unit/lib/review-probe-policy.test.mjs';
  assert.deepEqual(
    reviewVerb.validateReviewProbeCommand(`node --test ${focusedTest}`, {
      projectDir: process.cwd(),
    }),
    { ok: true, argv: ['node', '--test', focusedTest] }
  );
});

test('Review probe policy allows exact-file read-only lint and format probes', () => {
  const source = 'scripts/task-tracker/verbs/review.mjs';
  for (const command of [`npx eslint ${source}`, `npx prettier --check ${source}`]) {
    assert.equal(
      reviewVerb.validateReviewProbeCommand(command, { projectDir: process.cwd() }).ok,
      true,
      command
    );
  }
});

test('Review probe mode validates the complete request before executing any command', async () => {
  let executions = 0;
  const result = await reviewVerb.runReviewProbes({
    body: '',
    issueNumber: 1089,
    projectDir: '/project',
    commands: ['node --test safe.test.mjs', 'npm run lint'],
    deps: {
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(),
      validateCommand: (command) =>
        command === 'npm run lint'
          ? { ok: false, reason: 'standard command is not targeted' }
          : { ok: true, argv: ['node', '--test', 'safe.test.mjs'] },
      executeCommand: async () => {
        executions += 1;
        return { exitCode: 0, durationMs: 1 };
      },
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(executions, 0);
  assert.deepEqual(result.probes, []);
});

test('Review probe mode rejects a non-allowlisted command before execution or persistence', async () => {
  let executions = 0;
  let writes = 0;
  const result = await reviewVerb.runReviewProbes({
    body: '',
    issueNumber: 1089,
    projectDir: '/project',
    commands: ['sh -c bad'],
    deps: {
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(),
      validateCommand: () => ({ ok: false, reason: 'bin not allowlisted' }),
      executeCommand: async () => {
        executions += 1;
      },
      mutateBody: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(executions, 0);
  assert.equal(writes, 0);
  assert.deepEqual(result.reasons, [
    {
      code: 'probe-command-rejected',
      command: 'sh -c bad',
      reason: 'bin not allowlisted',
    },
  ]);
});
