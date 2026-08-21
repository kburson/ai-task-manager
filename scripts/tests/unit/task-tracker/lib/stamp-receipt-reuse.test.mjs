// @story #1356
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';
import {
  commandCoveredByReceipt,
  decideStampExecutionFromEnv,
  resolveStampExecution,
} from '../../../../task-tracker/lib/stamp-receipt-reuse.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const INSTANT = '2026-08-01T18:00:00.000Z';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');

function fingerprint() {
  return {
    commitSha: SHA,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
    },
  };
}

function greenTestReceipt({ sha = SHA, slowExit = 0 } = {}) {
  return createVerificationReceipt({
    issueNumber: 1356,
    stage: 'test',
    fingerprint: { ...fingerprint(), commitSha: sha },
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
      exitCode: classification === 'test-slow' ? slowExit : 0,
      durationMs: 10,
    })),
    now: () => INSTANT,
  });
}

function resolve(overrides = {}) {
  return resolveStampExecution({
    issueNumber: 1356,
    fingerprint: fingerprint(),
    ...overrides,
  });
}

test('npm test is covered only when unit and integration are green', () => {
  const receipt = greenTestReceipt();
  assert.equal(commandCoveredByReceipt('npm test', receipt), true);
  assert.equal(commandCoveredByReceipt('npm run test:slow', receipt), true);
  assert.equal(commandCoveredByReceipt('npm run test:all', receipt), true);
});

test('npm test is not covered when a required lane is red', () => {
  const receipt = greenTestReceipt({ slowExit: 1 });
  assert.equal(commandCoveredByReceipt('npm run test:slow', receipt), false);
  assert.equal(commandCoveredByReceipt('npm run test:all', receipt), false);
  assert.equal(commandCoveredByReceipt('npm test', receipt), true);
});

test('focused command coverage uses shell-aware argument tokenization', () => {
  const receipt = greenTestReceipt();
  receipt.commands.push({
    classification: 'focused-receipt-reuse',
    command: 'node',
    args: ['--test', '--test-name-pattern=receipt reuse', 'scripts/tests/example.test.mjs'],
    exitCode: 0,
    durationMs: 10,
  });

  assert.equal(
    commandCoveredByReceipt(
      "node --test --test-name-pattern='receipt reuse' scripts/tests/example.test.mjs",
      receipt
    ),
    true
  );
});

test('focused command matching preserves whitespace inside quoted arguments', () => {
  const receipt = greenTestReceipt();
  receipt.commands.push({
    classification: 'focused-whitespace',
    command: 'node',
    args: ['--test', '--test-name-pattern=receipt  reuse', 'scripts/tests/example.test.mjs'],
    exitCode: 0,
    durationMs: 10,
  });

  assert.equal(
    commandCoveredByReceipt(
      "node --test --test-name-pattern='receipt  reuse' scripts/tests/example.test.mjs",
      receipt
    ),
    true
  );
});

test('Review + valid receipt covering standard lanes → reuse', () => {
  const result = resolve({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'review',
    receipt: greenTestReceipt(),
    headSha: SHA,
  });
  assert.equal(result.action, 'reuse');
});

test('Review + sha-mismatch receipt → refuse, do not run', () => {
  const result = resolve({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'review',
    receipt: greenTestReceipt({ sha: OTHER_SHA }),
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.match(result.message, /demote/i);
  assert.match(result.message, /\/task test/i);
});

test('Review + missing receipt → refuse, do not run', () => {
  const result = resolve({
    commands: ['npm test'],
    liveState: 'review',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.match(result.message, /demote/i);
});

test('Test + valid receipt covering standard lanes → reuse', () => {
  const result = resolve({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'test',
    receipt: greenTestReceipt(),
    headSha: SHA,
  });
  assert.equal(result.action, 'reuse');
});

test('Test + no covering receipt → run', () => {
  const result = resolve({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'test',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'run');
});

test('Develop + test:slow → refuse without treating it as Review', () => {
  const result = resolve({
    commands: ['npm run test:slow'],
    liveState: 'develop',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.doesNotMatch(result.message, /demote/i);
});

test('Review refuses a receipt whose issue or canonical command identity is invalid', () => {
  const receipt = greenTestReceipt();
  receipt.issue = 999;
  receipt.commands.find(({ classification }) => classification === 'test-unit').args = [
    'run',
    'not-unit',
  ];

  const result = resolve({
    commands: ['npm test'],
    liveState: 'review',
    receipt,
    headSha: SHA,
  });

  assert.equal(result.action, 'refuse');
  assert.match(result.message, /valid exact-SHA Test receipt/i);
});

test('Review refuses malformed and fingerprint-invalid receipts independently', () => {
  const malformed = greenTestReceipt();
  malformed.schema = 'not-a-verification-receipt';
  const fingerprintInvalid = greenTestReceipt();
  const wrongFingerprint = fingerprint();
  wrongFingerprint.environment.configHashes['package.json'] = `sha256:${'c'.repeat(64)}`;

  for (const [name, receipt, currentFingerprint] of [
    ['malformed', malformed, fingerprint()],
    ['fingerprint-invalid', fingerprintInvalid, wrongFingerprint],
  ]) {
    const result = resolve({
      commands: ['npm test'],
      liveState: 'review',
      receipt,
      headSha: SHA,
      fingerprint: currentFingerprint,
    });
    assert.equal(result.action, 'refuse', name);
  }
});

test('Review refuses uncovered lint and focused commands instead of executing them', () => {
  for (const command of [
    'npm run lint',
    "node --test --test-name-pattern='receipt reuse' scripts/tests/example.test.mjs",
  ]) {
    const result = resolve({
      commands: [command],
      liveState: 'review',
      receipt: null,
      headSha: SHA,
    });
    assert.equal(result.action, 'refuse', command);
    assert.match(result.message, /demote/i);
  }
});

test('unknown live state refuses verifier execution', async () => {
  const result = await decideStampExecutionFromEnv({
    commands: ['npm run lint'],
    body: '',
    issueNumber: 1356,
    cfg: { repo: 'o/r' },
    projectDir: '/project',
    pexec: async (bin, args) => {
      assert.equal(bin, 'git');
      assert.deepEqual(args, ['rev-parse', 'HEAD']);
      return { stdout: `${SHA}\n`, stderr: '' };
    },
    deps: {
      buildFingerprint: () => fingerprint(),
      getLiveState: async () => {
        throw new Error('state unavailable');
      },
    },
  });

  assert.equal(result.action, 'refuse');
  assert.match(result.message, /state/i);
});

test('Develop does not reuse a Test receipt', () => {
  const result = resolve({
    commands: ['npm run lint'],
    liveState: 'develop',
    receipt: greenTestReceipt(),
    headSha: SHA,
  });
  assert.equal(result.action, 'run');
});

test('Done refuses uncovered execution without suggesting an unavailable demotion', () => {
  const result = resolve({
    commands: ['npm run lint'],
    liveState: 'done',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.match(result.message, /Done evidence is immutable/i);
  assert.doesNotMatch(result.message, /demote|\/task test/i);
});

test('skill and pickup docs no longer order Review-stage standard-lane reruns', () => {
  const files = [
    'skill/shared/rules/review.md',
    'skill/shared/rules/functional-dod.md',
    'skill/shared/rules/state-walk.md',
    'templates/pickup-directive.md',
  ];
  const joined = files.map((rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')).join('\n');
  assert.doesNotMatch(joined, /dod-stamp <key>` is a Test\/Review-stage helper/i);
  assert.match(joined, /receipt/i);
  assert.doesNotMatch(
    readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/review.md'), 'utf8'),
    /verify by inspection AND by running the relevant test\/build\/command/i
  );
  assert.match(
    readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/review.md'), 'utf8'),
    /Invoking `dod-stamp` or `ac-stamp` in Review may only reuse/i
  );
  const reviewRule = readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/review.md'), 'utf8');
  assert.match(reviewRule, /aitm-skill-version: 1\.2\.0/);
  assert.match(reviewRule, /aitm-skill-loaded:rules\/review:1\.2\.0/);
  const functionalDodRule = readFileSync(
    path.join(REPO_ROOT, 'skill/shared/rules/functional-dod.md'),
    'utf8'
  );
  assert.match(functionalDodRule, /all Review-stage stamps only reuse validated Test evidence/i);
  assert.match(functionalDodRule, /aitm-skill-version: 1\.3\.0/);
  assert.match(functionalDodRule, /aitm-skill-loaded:rules\/functional-dod:1\.3\.0/);
  for (const rel of [
    'templates/pickup-directive.md',
    '.ai-task-manager/templates/pickup-directive.md',
  ]) {
    assert.match(
      readFileSync(path.join(REPO_ROOT, rel), 'utf8'),
      /Test stamps reuse its receipt\. Review stamps reuse or refuse; never execute/i,
      rel
    );
  }
  for (const rel of [
    'templates/references/pickup-directive-rationale.md',
    '.ai-task-manager/templates/references/pickup-directive-rationale.md',
  ]) {
    assert.match(
      readFileSync(path.join(REPO_ROOT, rel), 'utf8'),
      /After `\/task test` writes a valid receipt,\s*Test-stage stamps reuse it/i,
      rel
    );
  }
});
