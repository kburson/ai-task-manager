// @story #1089
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVerbTest } from '../../../verbs/test.mjs';
import {
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../lib/verification-receipt.mjs';
import { partitionVerificationCommands } from '../../../lib/verification-commands.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-08-01T18:00:00.000Z';
const cfg = { repo: 'o/r' };

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

function developReceipt() {
  return createVerificationReceipt({
    issueNumber: 1089,
    stage: 'develop-final',
    fingerprint: fingerprint('/outer'),
    commands: [
      {
        classification: 'lint-full',
        command: 'npm',
        args: ['run', 'lint'],
        exitCode: 0,
        durationMs: 10,
      },
      {
        classification: 'format-full',
        command: 'npm',
        args: ['run', 'format:check'],
        exitCode: 0,
        durationMs: 10,
      },
    ],
    now: () => INSTANT,
  });
}

function testReceipt() {
  return createVerificationReceipt({
    issueNumber: 1089,
    stage: 'test',
    fingerprint: fingerprint('/sandbox'),
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
}

function issueBody() {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    '- [ ] `node --test scripts/task-tracker/tests/unit/lib/markers.test.mjs`',
  ].join('\n');
}

test('partitionVerificationCommands reuses lint/format and plans all complete lanes once', () => {
  const partition = partitionVerificationCommands({
    commands: [
      'npm run lint',
      'npm run format:check',
      'npm test',
      'npm run test:slow',
      'node --test focused.test.mjs',
    ],
    reusableClassifications: ['lint-full', 'format-full'],
  });
  assert.deepEqual(
    partition.reused.map(({ classification }) => classification),
    ['lint-full', 'format-full']
  );
  assert.deepEqual(
    partition.completeLanes.map(({ classification }) => classification),
    ['test-unit', 'test-integration', 'test-slow']
  );
  assert.deepEqual(
    partition.targeted.map(({ command }) => command),
    ['node --test focused.test.mjs']
  );
});

test('/task test finalizes Develop, reads back evidence, reuses it, and emits Test receipt', async () => {
  let body = issueBody();
  const events = [];
  const sandboxRuns = [];
  const receipt = developReceipt();
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        events.push('write');
        return { status: 'ok' };
      },
      postComment: async () => {},
      getHeadSha: async () => SHA,
      runDevelopFinalization: async () => {
        events.push('finalize');
        return { ok: true, fingerprint: fingerprint('/outer'), receipt };
      },
      createWorktree: async () => {
        events.push('worktree');
      },
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/sandbox'),
      execInSandbox: async ({ argv }) => {
        sandboxRuns.push(argv.join(' '));
        return {
          exit: 0,
          stdout: '',
          stderr: '',
          durationMs: 5,
          startedAt: INSTANT,
          completedAt: INSTANT,
        };
      },
      moveState: async () => ({ ok: true }),
      logIssueTime: async () => {},
    },
  });

  assert.equal(result.status, 'passed');
  assert.ok(events.indexOf('finalize') < events.indexOf('worktree'));
  assert.deepEqual(sandboxRuns, [
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
    'node --test scripts/task-tracker/tests/unit/lib/markers.test.mjs',
  ]);
  assert.ok(!sandboxRuns.includes('npm run lint'));
  assert.ok(!sandboxRuns.includes('npm run format:check'));
  assert.equal(parseVerificationReceipt(body, 'develop-final').receiptId, receipt.receiptId);
  const testReceipt = parseVerificationReceipt(body, 'test');
  assert.ok(testReceipt);
  assert.equal(testReceipt.commitSha, SHA);
  assert.deepEqual(
    testReceipt.commands.slice(0, 5).map(({ classification }) => classification),
    ['lint-full', 'format-full', 'test-unit', 'test-integration', 'test-slow']
  );
});

test('/task test reuses a valid Develop-final receipt when retrying unchanged SHA', async () => {
  let body = upsertVerificationReceipt(issueBody(), developReceipt());
  let finalizations = 0;
  const sandboxRuns = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      postComment: async () => {},
      getHeadSha: async () => SHA,
      buildFingerprint: ({ projectDir }) =>
        fingerprint(projectDir === process.cwd() ? '/outer' : '/sandbox'),
      runDevelopFinalization: async () => {
        finalizations += 1;
        return { ok: false };
      },
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      execInSandbox: async ({ argv }) => {
        sandboxRuns.push(argv.join(' '));
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
  assert.equal(finalizations, 0);
  assert.deepEqual(sandboxRuns.slice(0, 3), [
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
  ]);
});

test('/task test records invalid finalization and never creates a sandbox', async () => {
  let body = issueBody();
  let worktrees = 0;
  const comments = [];
  const stale = { ...developReceipt(), commitSha: 'c'.repeat(40) };
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      runDevelopFinalization: async () => ({
        ok: true,
        fingerprint: fingerprint('/outer'),
        receipt: stale,
      }),
      createWorktree: async () => {
        worktrees += 1;
      },
    },
  });
  assert.equal(result.status, 'develop-final-invalid');
  assert.equal(worktrees, 0);
  assert.match(comments[0], /sha-mismatch/);
});

test('/task test does not rerun a valid exact-SHA Test receipt without --force', async () => {
  let body = issueBody().replace('last-known-state: develop', 'last-known-state: test');
  body = upsertVerificationReceipt(body, testReceipt());
  let finalizations = 0;
  let worktrees = 0;
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/outer'),
      runDevelopFinalization: async () => {
        finalizations += 1;
        return { ok: false };
      },
      createWorktree: async () => {
        worktrees += 1;
      },
    },
  });
  assert.equal(result.status, 'already-verified');
  assert.equal(finalizations, 0);
  assert.equal(worktrees, 0);
});

test('/task test audits --force before rerunning a valid exact-SHA Test receipt', async () => {
  let body = issueBody().replace('last-known-state: develop', 'last-known-state: test');
  body = upsertVerificationReceipt(body, testReceipt());
  const comments = [];
  let finalizations = 0;
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: {
      forceRerun: true,
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/sandbox'),
      runDevelopFinalization: async () => {
        finalizations += 1;
        return {
          ok: true,
          fingerprint: fingerprint('/outer'),
          receipt: developReceipt(),
        };
      },
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '', durationMs: 1 }),
      moveState: async () => ({ ok: true, selfLoop: true }),
      logIssueTime: async () => {},
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(finalizations, 1);
  assert.match(comments[0], /Audited Test re-run override/);
});

test('/task test refuses when the completed sandbox fingerprint is dirty', async () => {
  let body = issueBody();
  let fingerprintCalls = 0;
  const comments = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      runDevelopFinalization: async () => ({
        ok: true,
        fingerprint: fingerprint('/outer'),
        receipt: developReceipt(),
      }),
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: () => {
        fingerprintCalls += 1;
        const value = fingerprint('/sandbox');
        if (fingerprintCalls === 2) value.environment.sandbox.clean = false;
        return value;
      },
      execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '', durationMs: 1 }),
    },
  });
  assert.equal(result.status, 'develop-evidence-invalid');
  assert.ok(result.reasons.some(({ code }) => code === 'sandbox-dirty'));
  assert.match(comments.at(-1), /sandbox-dirty/);
});
