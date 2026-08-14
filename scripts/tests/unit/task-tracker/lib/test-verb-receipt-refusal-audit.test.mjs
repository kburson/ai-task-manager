// @story #1089
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

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

function issueBody() {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
  ].join('\n');
}

test('/task test audits a stale Develop-final receipt before one replacement finalization', async () => {
  const stale = { ...developReceipt(), commitSha: 'c'.repeat(40) };
  let body = upsertVerificationReceipt(issueBody(), stale);
  const comments = [];
  let finalizations = 0;
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
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      buildFingerprint: ({ projectDir }) =>
        fingerprint(projectDir === process.cwd() ? '/outer' : '/sandbox'),
      runDevelopFinalization: async () => {
        finalizations += 1;
        return { ok: true, fingerprint: fingerprint('/outer'), receipt: developReceipt() };
      },
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      execInSandbox: async () => ({
        exit: 0,
        stdout: '',
        stderr: '',
        durationMs: 1,
        startedAt: INSTANT,
        completedAt: INSTANT,
      }),
      moveState: async () => ({ ok: true }),
      logIssueTime: async () => {},
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(finalizations, 1);
  assert.ok(comments.some((comment) => /reuse refused.*sha-mismatch/i.test(comment)));
});

test('/task test audits every Develop-final reuse refusal family before one new finalization', async () => {
  const wrongIssue = { ...developReceipt(), issue: 999 };
  const wrongCommand = structuredClone(developReceipt());
  wrongCommand.commands[0].command = 'node';
  const cases = [
    ['receipt-missing', () => issueBody(), false],
    [
      'receipt-malformed',
      () =>
        `${issueBody()}\n<!-- aitm-verification-receipt stage="develop-final" data="not-json" -->`,
      false,
    ],
    ['issue-mismatch', () => upsertVerificationReceipt(issueBody(), wrongIssue), false],
    [
      'command-identity-mismatch',
      () => upsertVerificationReceipt(issueBody(), wrongCommand),
      false,
    ],
    [
      'fingerprint-unresolvable',
      () => upsertVerificationReceipt(issueBody(), developReceipt()),
      true,
    ],
  ];

  for (const [expectedCode, makeBody, fingerprintThrows] of cases) {
    let finalizations = 0;
    const comments = [];
    const result = await runVerbTest({
      cfg,
      issueNumber: 1089,
      projectDir: process.cwd(),
      deps: {
        fetchBody: async () => makeBody(),
        postComment: async ({ body: comment }) => comments.push(comment),
        getHeadSha: async () => SHA,
        buildFingerprint: () => {
          if (fingerprintThrows) throw new Error('fingerprint unavailable');
          return fingerprint('/outer');
        },
        runDevelopFinalization: async () => {
          finalizations += 1;
          return { ok: false, reasons: [{ code: 'intentional-stop' }] };
        },
      },
    });
    assert.equal(result.status, 'develop-final-invalid', expectedCode);
    assert.equal(finalizations, 1, expectedCode);
    assert.match(comments[0], new RegExp(expectedCode), expectedCode);
  }
});
