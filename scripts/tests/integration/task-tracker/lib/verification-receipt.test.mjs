// @story #1089
// cspell:ignore HJKMNP
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

import {
  buildVerificationFingerprint,
  createVerificationReceipt,
  upsertVerificationReceipt,
  validateVerificationReceipt,
  validateVerificationReceiptCommandAuthority,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const SHA = 'a'.repeat(40);
const STARTED_AT = '2026-08-01T18:00:00.000Z';
const COMPLETED_AT = '2026-08-01T18:00:01.250Z';
const VERIFICATION_COMMANDS = [
  { command: ' npm   run lint ' },
  { command: 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs' },
];

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function fixtureProject() {
  const projectDir = mkdtempProjectIsolated('verification-receipt-');
  mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
  writeFileSync(path.join(projectDir, '.gitignore'), '\n');
  writeFileSync(path.join(projectDir, 'package.json'), '{"name":"receipt-fixture"}\n');
  writeFileSync(path.join(projectDir, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(path.join(projectDir, 'eslint.config.mjs'), 'export default [];\n');
  writeFileSync(path.join(projectDir, '.prettierrc.json'), '{}\n');
  writeFileSync(path.join(projectDir, 'scripts/run-tests.mjs'), 'export const lanes = [];\n');
  run(projectDir, 'git', ['config', 'user.email', 'receipt@example.test']);
  run(projectDir, 'git', ['config', 'user.name', 'Receipt Test']);
  run(projectDir, 'git', ['add', '.']);
  run(projectDir, 'git', ['commit', '-qm', 'fixture']);
  return projectDir;
}

function greenCommands() {
  return [
    {
      classification: 'lint-full',
      command: ' npm ',
      args: ['run', 'lint'],
      exitCode: 0,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      durationMs: 1250,
    },
    {
      classification: 'format-full',
      command: 'npm',
      args: ['run', 'format:check'],
      exitCode: 0,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      durationMs: 1250,
    },
  ];
}

function fixtureReceipt({ verificationCommands = VERIFICATION_COMMANDS } = {}) {
  const projectDir = fixtureProject();
  const fingerprint = buildVerificationFingerprint({
    projectDir,
    commitSha: SHA,
    verificationCommands,
    configPaths: ['package.json', 'eslint.config.mjs', '.prettierrc.json', 'scripts/run-tests.mjs'],
  });
  const receipt = createVerificationReceipt({
    issueNumber: 1089,
    stage: 'develop-final',
    fingerprint,
    commands: greenCommands(),
    now: () => COMPLETED_AT,
  });
  return { projectDir, fingerprint, receipt };
}

function reasonCodes(result) {
  return result.reasons.map(({ code }) => code);
}

describe('verification fingerprint and receipt creation', () => {
  test('records a canonical semantic Verification Commands projection', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    assert.deepEqual(fingerprint.verificationCommands, [
      ['node', '--test', 'scripts/tests/unit/task-tracker/lib/markers.test.mjs'],
      ['npm', 'run', 'lint'],
    ]);
    assert.deepEqual(receipt.verificationCommands, fingerprint.verificationCommands);
  });

  test('rejects duplicate semantic Verification Commands', () => {
    assert.throws(
      () =>
        fixtureReceipt({
          verificationCommands: [{ command: 'npm run lint' }, { command: ' npm  run lint ' }],
        }),
      /duplicate Verification Command/
    );
  });

  test('captures a complete SHA, runtime, hashes, canonical sandbox, and clean tree', () => {
    const { projectDir, fingerprint } = fixtureReceipt();
    assert.equal(fingerprint.commitSha, SHA);
    assert.match(fingerprint.environment.node, /^v\d+/);
    assert.equal(fingerprint.environment.platform, `${process.platform}-${process.arch}`);
    assert.match(fingerprint.environment.lockfileHash, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(fingerprint.environment.configHashes), [
      '.prettierrc.json',
      'eslint.config.mjs',
      'package.json',
      'scripts/run-tests.mjs',
    ]);
    assert.equal(fingerprint.environment.sandbox.kind, 'worktree');
    assert.equal(fingerprint.environment.sandbox.identity, realpathSync(projectDir));
    assert.equal(fingerprint.environment.sandbox.clean, true);
  });

  test('normalizes command identity and records canonical timestamps and durations', () => {
    const { receipt } = fixtureReceipt();
    assert.equal(receipt.schema, 'aitm.verification-receipt/v1');
    assert.match(receipt.receiptId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.equal(receipt.issue, 1089);
    assert.equal(receipt.stage, 'develop-final');
    assert.equal(receipt.startedAt, STARTED_AT);
    assert.equal(receipt.completedAt, COMPLETED_AT);
    assert.equal(receipt.supersedes, null);
    assert.deepEqual(
      receipt.commands.map(({ classification, command, args, exitCode, durationMs }) => ({
        classification,
        command,
        args,
        exitCode,
        durationMs,
      })),
      [
        {
          classification: 'lint-full',
          command: 'npm',
          args: ['run', 'lint'],
          exitCode: 0,
          durationMs: 1250,
        },
        {
          classification: 'format-full',
          command: 'npm',
          args: ['run', 'format:check'],
          exitCode: 0,
          durationMs: 1250,
        },
      ]
    );
  });

  test('records optional provider identity, required classifications, and semantic command kind (#1218)', () => {
    const { fingerprint } = fixtureReceipt();
    const receipt = createVerificationReceipt({
      issueNumber: 1218,
      stage: 'test',
      fingerprint,
      provider: { id: 'project', requiredClassifications: ['xcode-build', 'xcode-tests'] },
      commands: [
        {
          classification: 'xcode-build',
          providerId: 'project',
          kind: 'build',
          command: 'npm',
          args: ['run', 'test:unit'],
          exitCode: 0,
          durationMs: 1,
        },
      ],
      now: () => COMPLETED_AT,
    });

    assert.deepEqual(receipt.provider, {
      id: 'project',
      requiredClassifications: ['xcode-build', 'xcode-tests'],
    });
    assert.equal(receipt.commands[0].providerId, 'project');
    assert.equal(receipt.commands[0].kind, 'build');
    const validation = validateVerificationReceipt({
      receipt,
      expectedIssue: 1218,
      expectedStage: 'test',
      fingerprint,
      required: receipt.provider.requiredClassifications,
    });
    assert.equal(validation.ok, false);
    assert.ok(reasonCodes(validation).includes('command-missing'));
  });
});

describe('verification receipt validation refusals', () => {
  test('returns reusable commands for a valid exact-fingerprint receipt', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    const result = validateVerificationReceipt({
      receipt,
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      fingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(
      result.reusableCommands.map(({ classification }) => classification),
      ['lint-full', 'format-full']
    );
  });

  test('refuses a receipt copied from another issue', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    const result = validateVerificationReceipt({
      receipt,
      expectedIssue: 1090,
      expectedStage: 'develop-final',
      fingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.equal(result.ok, false);
    assert.ok(reasonCodes(result).includes('issue-mismatch'));
  });

  test('accepts cosmetic Verification Commands changes and declaration reordering', () => {
    const { projectDir, fingerprint, receipt } = fixtureReceipt();
    const currentFingerprint = buildVerificationFingerprint({
      projectDir,
      commitSha: SHA,
      verificationCommands: [
        { command: ' node  --test  scripts/tests/unit/task-tracker/lib/markers.test.mjs ' },
        { command: 'npm run lint' },
      ],
      configPaths: [
        'package.json',
        'eslint.config.mjs',
        '.prettierrc.json',
        'scripts/run-tests.mjs',
      ],
    });
    const result = validateVerificationReceipt({
      receipt,
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      fingerprint: currentFingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.equal(result.ok, true, JSON.stringify(result.reasons));
    assert.deepEqual(currentFingerprint.verificationCommands, fingerprint.verificationCommands);
  });

  for (const [label, verificationCommands] of [
    ['added', [...VERIFICATION_COMMANDS, { command: 'npm run format:check' }]],
    ['removed', VERIFICATION_COMMANDS.slice(0, 1)],
    ['changed', [{ command: 'npm run format:check' }, VERIFICATION_COMMANDS[1]]],
  ]) {
    test(`refuses a receipt when a Verification Command is ${label}`, () => {
      const { projectDir, receipt } = fixtureReceipt();
      const currentFingerprint = buildVerificationFingerprint({
        projectDir,
        commitSha: SHA,
        verificationCommands,
        configPaths: [
          'package.json',
          'eslint.config.mjs',
          '.prettierrc.json',
          'scripts/run-tests.mjs',
        ],
      });
      const result = validateVerificationReceipt({
        receipt,
        expectedIssue: 1089,
        expectedStage: 'develop-final',
        fingerprint: currentFingerprint,
        required: ['lint-full', 'format-full'],
      });
      assert.equal(result.ok, false);
      assert.ok(reasonCodes(result).includes('vc-set-mismatch'));
    });
  }

  test('default-denies a legacy receipt without Verification Commands authority', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    delete receipt.verificationCommands;
    const result = validateVerificationReceipt({
      receipt,
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      fingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.equal(result.ok, false);
    assert.ok(reasonCodes(result).includes('vc-set-mismatch'));
  });

  test('validates marker authority against live issue-body Verification Commands', () => {
    const { projectDir, receipt } = fixtureReceipt();
    const originalBody = [
      '## Verification Commands',
      '- [ ] `npm run lint`',
      '- [ ] `node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs`',
    ].join('\n');
    const body = upsertVerificationReceipt(originalBody, receipt);
    assert.equal(
      validateVerificationReceiptCommandAuthority({
        body,
        expectedIssue: 1089,
        expectedStage: 'develop-final',
        expectedCommitSha: SHA,
        projectDir,
      }).ok,
      true
    );
    const changed = body.replace('- [ ] `npm run lint`', '- [ ] `npm run format:check`');
    const result = validateVerificationReceiptCommandAuthority({
      body: changed,
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      expectedCommitSha: SHA.slice(0, 8),
      projectDir,
    });
    assert.equal(result.ok, false);
    assert.ok(reasonCodes(result).includes('vc-set-mismatch'));
  });

  test('refuses a green command whose classification impersonates a canonical command', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    const result = validateVerificationReceipt({
      receipt: {
        ...receipt,
        commands: receipt.commands.map((command, index) =>
          index === 0 ? { ...command, command: 'node', args: ['--version'] } : command
        ),
      },
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      fingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.equal(result.ok, false);
    assert.ok(reasonCodes(result).includes('command-identity-mismatch'));
  });

  const mutations = [
    [
      'schema',
      (receipt) => ({ ...receipt, schema: 'aitm.verification-receipt/v0' }),
      'receipt-malformed',
    ],
    ['SHA', (receipt) => ({ ...receipt, commitSha: 'b'.repeat(40) }), 'sha-mismatch'],
    [
      'Node major',
      (receipt) => ({
        ...receipt,
        environment: { ...receipt.environment, node: 'v999.0.0' },
      }),
      'node-major-mismatch',
    ],
    [
      'platform',
      (receipt) => ({
        ...receipt,
        environment: { ...receipt.environment, platform: 'other-platform' },
      }),
      'platform-mismatch',
    ],
    [
      'lockfile',
      (receipt) => ({
        ...receipt,
        environment: { ...receipt.environment, lockfileHash: `sha256:${'b'.repeat(64)}` },
      }),
      'lockfile-mismatch',
    ],
    [
      'config',
      (receipt) => ({
        ...receipt,
        environment: {
          ...receipt.environment,
          configHashes: {
            ...receipt.environment.configHashes,
            'package.json': `sha256:${'b'.repeat(64)}`,
          },
        },
      }),
      'config-mismatch',
    ],
    [
      'cleanliness',
      (receipt) => ({
        ...receipt,
        environment: {
          ...receipt.environment,
          sandbox: { ...receipt.environment.sandbox, clean: false },
        },
      }),
      'sandbox-dirty',
    ],
    [
      'missing command',
      (receipt) => ({ ...receipt, commands: receipt.commands.slice(0, 1) }),
      'command-missing',
    ],
    [
      'duplicate classification',
      (receipt) => ({ ...receipt, commands: [...receipt.commands, receipt.commands[0]] }),
      'command-duplicate',
    ],
    [
      'nonzero exit',
      (receipt) => ({
        ...receipt,
        commands: receipt.commands.map((command, index) =>
          index === 0 ? { ...command, exitCode: 1 } : command
        ),
      }),
      'command-red',
    ],
  ];

  for (const [name, mutate, expectedCode] of mutations) {
    test(`refuses ${name} drift with ${expectedCode}`, () => {
      const { fingerprint, receipt } = fixtureReceipt();
      const result = validateVerificationReceipt({
        receipt: mutate(receipt),
        expectedIssue: 1089,
        expectedStage: 'develop-final',
        fingerprint,
        required: ['lint-full', 'format-full'],
      });
      assert.equal(result.ok, false);
      assert.ok(reasonCodes(result).includes(expectedCode), JSON.stringify(result.reasons));
    });
  }

  test('refuses invalid timestamps and negative duration as malformed', () => {
    const { fingerprint, receipt } = fixtureReceipt();
    const result = validateVerificationReceipt({
      receipt: {
        ...receipt,
        completedAt: 'not-an-instant',
        commands: [{ ...receipt.commands[0], durationMs: -1 }, receipt.commands[1]],
      },
      expectedIssue: 1089,
      expectedStage: 'develop-final',
      fingerprint,
      required: ['lint-full', 'format-full'],
    });
    assert.ok(reasonCodes(result).includes('receipt-malformed'));
  });
});
