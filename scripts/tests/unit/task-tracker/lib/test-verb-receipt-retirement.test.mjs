// @story #1481
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import {
  canonicalVerificationCommandSet,
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const ISSUE = 1481;
const SHA = 'a'.repeat(40);
const STALE_SHA = 'b'.repeat(40);
const INSTANT = '2026-09-01T18:00:00.000Z';
const cfg = { repo: 'o/r' };
const VERIFICATION_COMMANDS = [
  'npm run lint',
  'npm run format:check',
  'npm test',
  'npm run test:slow',
];

function fingerprint(commitSha, identity = '/outer') {
  return {
    commitSha,
    verificationCommands: canonicalVerificationCommandSet(VERIFICATION_COMMANDS),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'c'.repeat(64)}`,
      configHashes: {},
      sandbox: { kind: 'worktree', identity, clean: true },
    },
  };
}

function testReceipt() {
  return createVerificationReceipt({
    issueNumber: ISSUE,
    stage: 'test',
    fingerprint: fingerprint(STALE_SHA, '/stale'),
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
      durationMs: 1,
    })),
    now: () => INSTANT,
  });
}

function testBody(receipt = testReceipt()) {
  const body = [
    '<!-- aitm-last-known-state: test -->',
    '## Verification Commands',
    ...VERIFICATION_COMMANDS.map((command) => `- [ ] \`${command}\``),
  ].join('\n');
  return upsertVerificationReceipt(body, receipt);
}

function passingDeps(initialBody, events, receipt) {
  let body = initialBody;
  return {
    fetchBody: async () => body,
    mutateBody: async ({ mutate }) => {
      body = mutate(body);
      return { status: 'ok', body };
    },
    retireVerificationReceipt: async ({ stage, receiptId }) => {
      events.push('retire');
      assert.equal(stage, 'test');
      assert.equal(receiptId, receipt.receiptId);
      body = body.replace(/<!--\s*aitm-verification-receipt\s+stage="test"[^>]*-->/, '');
      return { status: 'retired', body };
    },
    postComment: async () => {},
    getHeadSha: async () => SHA,
    buildFingerprint: ({ projectDir }) =>
      fingerprint(SHA, projectDir === process.cwd() ? '/outer' : '/sandbox'),
    runDevelopFinalization: async () => {
      events.push('finalize');
      const current = fingerprint(SHA);
      return {
        ok: true,
        fingerprint: current,
        receipt: createVerificationReceipt({
          issueNumber: ISSUE,
          stage: 'develop-final',
          fingerprint: current,
          commands: [
            {
              classification: 'lint-full',
              command: 'npm',
              args: ['run', 'lint'],
              exitCode: 0,
              durationMs: 1,
            },
            {
              classification: 'format-full',
              command: 'npm',
              args: ['run', 'format:check'],
              exitCode: 0,
              durationMs: 1,
            },
          ],
          now: () => INSTANT,
        }),
      };
    },
    createWorktree: async () => events.push('worktree'),
    removeWorktree: async () => {},
    npmCi: async () => {},
    getSandboxHeadSha: async () => SHA,
    execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '', durationMs: 1 }),
    moveState: async () => ({ ok: true, selfLoop: true }),
    logIssueTime: async () => {},
  };
}

test('retires stale claimed Test evidence before finalization or worktree creation', async () => {
  const receipt = testReceipt();
  const events = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: passingDeps(testBody(receipt), events, receipt),
  });

  assert.ok(['passed', 'reverified'].includes(result.status), JSON.stringify(result));
  assert.equal(events[0], 'retire');
  assert.ok(events.indexOf('retire') < events.indexOf('finalize'));
  assert.ok(events.indexOf('retire') < events.indexOf('worktree'));
});

test('stops all execution when receipt retirement fails', async () => {
  const receipt = testReceipt();
  const events = [];
  const comments = [];
  const deps = passingDeps(testBody(receipt), events, receipt);
  deps.retireVerificationReceipt = async () => {
    events.push('retire');
    throw new Error('fresh read-back still contains target');
  };
  deps.postComment = async ({ body }) => comments.push(body);

  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps,
  });
  assert.equal(result.status, 'receipt-retirement-failed');
  assert.deepEqual(events, ['retire']);
  assert.match(comments[0], /receipt retirement refused/i);
});

test('refuses malformed claimed Test evidence before execution', async () => {
  const body = [
    '<!-- aitm-last-known-state: test -->',
    '## Verification Commands',
    ...VERIFICATION_COMMANDS.map((command) => `- [ ] \`${command}\``),
    '<!-- aitm-verification-receipt stage="test" data="not-json" -->',
  ].join('\n');
  const events = [];
  const comments = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(SHA),
      runDevelopFinalization: async () => events.push('finalize'),
      retireVerificationReceipt: async () => events.push('retire'),
      createWorktree: async () => events.push('worktree'),
    },
  });

  assert.equal(result.status, 'receipt-retirement-failed');
  assert.deepEqual(events, []);
  assert.match(comments[0], /identity is unavailable/i);
});

test('refuses malformed generic receipt claims before execution', async () => {
  const body = [
    '<!-- aitm-last-known-state: test -->',
    '## Verification Commands',
    ...VERIFICATION_COMMANDS.map((command) => `- [ ] \`${command}\``),
    '<!-- aitm-verification-receipt stage = "test" data="not-json" -->',
  ].join('\n');
  const events = [];
  const comments = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint(SHA),
      runDevelopFinalization: async () => events.push('finalize'),
      retireVerificationReceipt: async () => events.push('retire'),
      createWorktree: async () => events.push('worktree'),
    },
  });

  assert.equal(result.status, 'receipt-retirement-failed');
  assert.deepEqual(events, []);
  assert.match(comments[0], /identity is unavailable/i);
});

test('refuses live command drift introduced by the fresh evidence mutation', async () => {
  const receipt = testReceipt();
  const events = [];
  const comments = [];
  const deps = passingDeps(testBody(receipt), events, receipt);
  const mutate = deps.mutateBody;
  let evidenceWrites = 0;
  deps.mutateBody = async (input) => {
    if (input.evidenceStamp === true) evidenceWrites += 1;
    if (evidenceWrites === 2) {
      const apply = input.mutate;
      return mutate({
        ...input,
        mutate: (base) =>
          apply(
            base.replace(
              '- [ ] `npm run test:slow`',
              '- [ ] `npm run test:slow`\n- [ ] `npm run audit`'
            )
          ),
      });
    }
    return mutate(input);
  };
  deps.postComment = async ({ body }) => comments.push(body);
  let moves = 0;
  deps.moveState = async () => {
    moves += 1;
    return { ok: true, selfLoop: true };
  };

  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps,
  });
  assert.equal(result.status, 'develop-evidence-invalid');
  assert.deepEqual(result.reasons, [{ code: 'vc-set-mismatch' }]);
  assert.equal(moves, 0);
  assert.ok(comments.some((comment) => /vc-set-mismatch/.test(comment)));
  assert.equal(parseVerificationReceipt(await deps.fetchBody(), 'test'), null);
});

test('reports invalid fresh-base command authority without throwing', async () => {
  const receipt = testReceipt();
  const events = [];
  const comments = [];
  const deps = passingDeps(testBody(receipt), events, receipt);
  const mutate = deps.mutateBody;
  let evidenceWrites = 0;
  deps.mutateBody = async (input) => {
    if (input.evidenceStamp === true) evidenceWrites += 1;
    if (evidenceWrites === 2) {
      const apply = input.mutate;
      return mutate({
        ...input,
        mutate: (base) =>
          apply(base.replace('- [ ] `npm run test:slow`', '- [ ] `npm run test:slow; echo no`')),
      });
    }
    return mutate(input);
  };
  deps.postComment = async ({ body }) => comments.push(body);
  let moves = 0;
  deps.moveState = async () => {
    moves += 1;
    return { ok: true, selfLoop: true };
  };

  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps,
  });

  assert.equal(result.status, 'develop-evidence-invalid');
  assert.deepEqual(result.reasons, [{ code: 'vc-set-invalid' }]);
  assert.equal(moves, 0);
  assert.ok(comments.some((comment) => /vc-set-invalid/.test(comment)));
});

test('refuses command drift reported by the persisted write response', async () => {
  const receipt = testReceipt();
  const deps = passingDeps(testBody(receipt), [], receipt);
  const mutate = deps.mutateBody;
  let evidenceWrites = 0;
  deps.mutateBody = async (input) => {
    const result = await mutate(input);
    if (input.evidenceStamp === true) evidenceWrites += 1;
    if (evidenceWrites === 2) {
      return {
        ...result,
        body: result.body.replace(
          /- \[[ x]\] `npm run test:slow`/,
          '- [x] `npm run test:slow`\n- [ ] `npm run audit`'
        ),
      };
    }
    return result;
  };
  deps.postComment = async () => {};

  const result = await runVerbTest({
    cfg,
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps,
  });
  assert.equal(result.status, 'develop-evidence-invalid');
  assert.deepEqual(result.reasons, [{ code: 'vc-set-mismatch' }]);
});
