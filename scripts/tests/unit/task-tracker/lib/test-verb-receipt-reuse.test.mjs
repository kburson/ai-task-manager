// @story #1089
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import {
  canonicalVerificationCommandSet,
  createVerificationReceipt,
  parseVerificationReceipt,
  requiredTestReceiptClassifications,
  upsertVerificationReceipt,
  validateVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { partitionVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-08-01T18:00:00.000Z';
const cfg = { repo: 'o/r' };
const LIVE_COMMANDS = [
  { command: 'npm run lint' },
  { command: 'npm run format:check' },
  { command: 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs' },
];
const TARGETED_COMMANDS = LIVE_COMMANDS.slice(2);

function fingerprint(identity, verificationCommands = LIVE_COMMANDS) {
  return {
    commitSha: SHA,
    verificationCommands: canonicalVerificationCommandSet(verificationCommands, {
      projectDir: process.cwd(),
    }),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity, clean: true },
    },
  };
}

function developReceipt(verificationCommands = LIVE_COMMANDS) {
  return createVerificationReceipt({
    issueNumber: 1089,
    stage: 'develop-final',
    fingerprint: fingerprint('/outer', verificationCommands),
    commands: [
      {
        classification: 'lint-full',
        command: 'npm',
        args: ['run', 'lint'],
        exitCode: 0,
        durationMs: 10,
        startedAt: '2026-08-01T17:59:58.000Z',
        completedAt: '2026-08-01T17:59:59.000Z',
      },
      {
        classification: 'format-full',
        command: 'npm',
        args: ['run', 'format:check'],
        exitCode: 0,
        durationMs: 10,
        startedAt: '2026-08-01T17:59:59.000Z',
        completedAt: INSTANT,
      },
    ],
    now: () => INSTANT,
  });
}

function testReceipt(verificationCommands = LIVE_COMMANDS) {
  return createVerificationReceipt({
    issueNumber: 1089,
    stage: 'test',
    fingerprint: fingerprint('/sandbox', verificationCommands),
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

function docsOnlyTestReceipt() {
  const full = testReceipt();
  return {
    ...full,
    commands: full.commands.filter(({ classification }) =>
      ['lint-full', 'format-full'].includes(classification)
    ),
    laneSkip: {
      reason: 'docs-only-diff',
      kind: 'docs-only',
      lanes: ['test-unit', 'test-integration', 'test-slow'],
      changedPaths: ['docs/DESIGN.md'],
    },
  };
}

function issueBody() {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
  ].join('\n');
}

function targetedOnlyIssueBody() {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
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
  let body = targetedOnlyIssueBody();
  const events = [];
  const sandboxRuns = [];
  const receipt = developReceipt(TARGETED_COMMANDS);
  let finalizationCommands;
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
      runDevelopFinalization: async ({ verificationCommands }) => {
        finalizationCommands = verificationCommands;
        events.push('finalize');
        return { ok: true, fingerprint: fingerprint('/outer', TARGETED_COMMANDS), receipt };
      },
      createWorktree: async () => {
        events.push('worktree');
      },
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: ({ verificationCommands }) => fingerprint('/sandbox', verificationCommands),
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
  assert.deepEqual(
    finalizationCommands.map(({ command }) => command),
    TARGETED_COMMANDS.map(({ command }) => command)
  );
  assert.ok(events.indexOf('finalize') < events.indexOf('worktree'));
  assert.deepEqual(sandboxRuns, [
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:slow',
    'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs',
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
  assert.deepEqual(
    testReceipt.commands
      .slice(0, 2)
      .map(({ command, args, startedAt, completedAt, reusedFrom }) => ({
        command,
        args,
        startedAt,
        completedAt,
        reusedFrom,
      })),
    receipt.commands.map(({ command, args, startedAt, completedAt }) => ({
      command,
      args,
      startedAt,
      completedAt,
      reusedFrom: receipt.receiptId,
    }))
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
      buildFingerprint: ({ projectDir, verificationCommands }) =>
        fingerprint(projectDir === process.cwd() ? '/outer' : '/sandbox', verificationCommands),
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
  const carried = parseVerificationReceipt(body, 'test').commands.filter(({ classification }) =>
    ['lint-full', 'format-full'].includes(classification)
  );
  assert.deepEqual(
    carried.map(({ classification }) => classification),
    ['lint-full', 'format-full'],
    'legacy standard VCs must not duplicate validator-approved carried results'
  );
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
  assert.ok(comments.some((comment) => /sha-mismatch/.test(comment)));
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

test('/task test reruns when live Verification Commands add a command', async () => {
  let body = issueBody().replace('last-known-state: develop', 'last-known-state: test');
  body = upsertVerificationReceipt(body, testReceipt());
  body = body.replace(
    '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
    [
      '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
      '- [ ] `node --test scripts/tests/unit/task-tracker/lib/new-command.test.mjs`',
    ].join('\n')
  );
  let worktrees = 0;
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
        return { status: 'ok', body };
      },
      postComment: async () => {},
      getHeadSha: async () => SHA,
      buildFingerprint: ({ projectDir, verificationCommands }) =>
        fingerprint(projectDir === process.cwd() ? '/outer' : '/sandbox', verificationCommands),
      createWorktree: async () => {
        worktrees += 1;
      },
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      execInSandbox: async ({ argv }) => {
        sandboxRuns.push(argv.join(' '));
        return { exit: 0, stdout: '', stderr: '', durationMs: 1 };
      },
      moveState: async () => ({ ok: true, selfLoop: true }),
      logIssueTime: async () => {},
    },
  });

  assert.notEqual(result.status, 'already-verified');
  assert.equal(worktrees, 1);
  assert.ok(
    sandboxRuns.includes('node --test scripts/tests/unit/task-tracker/lib/new-command.test.mjs')
  );
});

test('/task test does not rerun a valid docs-only lane-skip receipt without --force', async () => {
  let body = issueBody().replace('last-known-state: develop', 'last-known-state: test');
  body = upsertVerificationReceipt(body, docsOnlyTestReceipt());
  const persisted = parseVerificationReceipt(body, 'test');
  const validation = validateVerificationReceipt({
    receipt: persisted,
    expectedIssue: 1089,
    expectedStage: 'test',
    fingerprint: fingerprint('/outer'),
    required: requiredTestReceiptClassifications(persisted),
  });
  assert.deepEqual(validation.reasons, []);
  let worktrees = 0;
  const result = await runVerbTest({
    cfg,
    issueNumber: 1089,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      getHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/outer'),
      runDevelopFinalization: async () => ({ ok: false }),
      createWorktree: async () => {
        worktrees += 1;
      },
    },
  });
  assert.equal(result.status, 'already-verified');
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
  assert.equal(result.status, 'reverified');
  assert.equal(finalizations, 1);
  assert.match(comments[0], /Audited Test re-run override/);
});

test('/task test refuses when the completed sandbox fingerprint is dirty', async () => {
  let body = issueBody();
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
      buildFingerprint: ({ projectDir }) => {
        const isSandbox = projectDir !== process.cwd();
        const value = fingerprint(isSandbox ? '/sandbox' : '/outer');
        if (isSandbox) value.environment.sandbox.clean = false;
        return value;
      },
      execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '', durationMs: 1 }),
    },
  });
  assert.equal(result.status, 'develop-evidence-invalid');
  assert.ok(result.reasons.some(({ code }) => code === 'sandbox-dirty'));
  assert.match(comments.at(-1), /sandbox-dirty/);
});

// @story #1899
async function runCloudCoverageFixture({
  cloudExit = 0,
  extraExit = 0,
  multiple = false,
  prerequisite = 'test-cloud-complete',
} = {}) {
  const commands = [
    { command: 'npm test' },
    { command: 'npm run test:slow' },
    { command: 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs' },
  ];
  let body = [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    ...commands.map(({ command }, i) => '- [ ] `' + command + '` <!-- id=' + (i + 1) + ' -->'),
  ].join('\n');
  const providerConfig = {
    id: 'project',
    develop: {
      iterationSteps: [],
      finalSteps: [
        { classification: 'lint-full', kind: 'lint', command: 'npm run lint' },
        { classification: 'format-full', kind: 'format', command: 'npm run format:check' },
      ],
    },
    test: {
      setup: 'npm-ci',
      steps: [
        {
          classification: prerequisite,
          kind: 'test',
          command: 'node scripts/maintenance/verify-ci-receipts.mjs',
        },
        ...(multiple
          ? [
              {
                classification: 'test-extra',
                kind: 'test',
                command: 'node scripts/maintenance/verify-affected-or-cloud.mjs',
              },
            ]
          : []),
      ],
      declaredCommandCoverage: [
        {
          command: 'npm test',
          requires: multiple ? [prerequisite, 'test-extra'] : [prerequisite],
        },
        { command: 'npm run test:slow', requires: [prerequisite] },
      ],
    },
  };
  const base = developReceipt(commands);
  base.provider = { id: 'project', requiredClassifications: ['lint-full', 'format-full'] };
  base.commands = base.commands.map((command) => ({
    ...command,
    providerId: 'project',
    kind: command.classification === 'lint-full' ? 'lint' : 'format',
  }));
  const executed = [];
  const comments = [];
  const result = await runVerbTest({
    cfg: { ...cfg, verificationProvider: providerConfig },
    issueNumber: 1089,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok', body };
      },
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      runDevelopFinalization: async () => ({
        ok: true,
        fingerprint: fingerprint('/outer', commands),
        receipt: base,
      }),
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: ({ verificationCommands }) => fingerprint('/sandbox', verificationCommands),
      execInSandbox: async ({ argv }) => {
        const command = argv.join(' ');
        executed.push(command);
        const exit =
          command === 'node scripts/maintenance/verify-ci-receipts.mjs'
            ? cloudExit
            : command === 'node scripts/maintenance/verify-affected-or-cloud.mjs'
              ? extraExit
              : 0;
        return {
          exit,
          stdout: 'fixture execution',
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
  return { result, body, executed, comments };
}

test('native Test derives covered suites from cloud proof without forged execution records', async () => {
  const { result, body, executed } = await runCloudCoverageFixture();
  assert.equal(result.status, 'passed');
  assert.deepEqual(executed, [
    'node scripts/maintenance/verify-ci-receipts.mjs',
    'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs',
  ]);
  assert.deepEqual(
    result.results
      .filter(({ command }) => ['npm test', 'npm run test:slow'].includes(command))
      .map(({ command, passed, receiptCommand }) => ({ command, passed, receiptCommand })),
    [
      { command: 'npm test', passed: true, receiptCommand: undefined },
      { command: 'npm run test:slow', passed: true, receiptCommand: undefined },
    ]
  );
  const receipt = parseVerificationReceipt(body, 'test');
  assert.equal(receipt.provider.id, 'project');
  assert.ok(
    receipt.commands.some(
      ({ classification, command, args }) =>
        classification === 'test-cloud-complete' &&
        command === 'node' &&
        args.join(' ') === 'scripts/maintenance/verify-ci-receipts.mjs'
    )
  );
  assert.ok(
    receipt.commands.every(
      ({ command, args }) =>
        !['npm test', 'npm run test:slow'].includes([command, ...args].join(' '))
    )
  );
  assert.ok(
    receipt.commands.every(({ classification }) => !classification.startsWith('test-covered-'))
  );
});

test('a failed cloud proof fails every dependent suite and never executes covered suites', async () => {
  const { result, body, executed } = await runCloudCoverageFixture({ cloudExit: 1 });
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.results
      .filter(({ command }) => ['npm test', 'npm run test:slow'].includes(command))
      .map(({ passed }) => passed),
    [false, false]
  );
  assert.ok(!executed.includes('npm test') && !executed.includes('npm run test:slow'));
  assert.equal(parseVerificationReceipt(body, 'test'), null);
});

test('all explicit prerequisites must pass; an unrelated suite may still pass', async () => {
  const { result, executed } = await runCloudCoverageFixture({ multiple: true, extraExit: 1 });
  assert.equal(result.status, 'failed');
  assert.equal(result.results.find(({ command }) => command === 'npm test').passed, false);
  assert.equal(result.results.find(({ command }) => command === 'npm run test:slow').passed, true);
  assert.ok(executed.includes('node scripts/maintenance/verify-affected-or-cloud.mjs'));
  assert.ok(!executed.includes('npm test') && !executed.includes('npm run test:slow'));
});

test('a successful uncovered check cannot shadow a failed configured coverage prerequisite', async () => {
  const { result, body } = await runCloudCoverageFixture({
    cloudExit: 1,
    prerequisite: 'test-targeted-1',
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.results
      .filter(({ command }) => ['npm test', 'npm run test:slow'].includes(command))
      .map(({ passed }) => passed),
    [false, false]
  );
  assert.equal(parseVerificationReceipt(body, 'test'), null);
});

test('successful coverage retains distinct configured and uncovered execution identities', async () => {
  const { result, body } = await runCloudCoverageFixture({ prerequisite: 'test-targeted-1' });
  assert.equal(result.status, 'passed');
  const receipt = parseVerificationReceipt(body, 'test');
  assert.deepEqual(
    receipt.commands
      .filter(({ command }) => command === 'node')
      .map(({ classification, args }) => ({ classification, args })),
    [
      { classification: 'test-targeted-1', args: ['scripts/maintenance/verify-ci-receipts.mjs'] },
      {
        classification: 'test-targeted-2',
        args: ['--test', 'scripts/tests/unit/task-tracker/lib/markers.test.mjs'],
      },
    ]
  );
});
