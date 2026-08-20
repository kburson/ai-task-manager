// @story #1356
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createVerificationReceipt } from '../../../../task-tracker/lib/verification-receipt.mjs';
import {
  commandCoveredByReceipt,
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

test('Review + valid receipt covering standard lanes → reuse', () => {
  const result = resolveStampExecution({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'review',
    receipt: greenTestReceipt(),
    headSha: SHA,
  });
  assert.equal(result.action, 'reuse');
});

test('Review + sha-mismatch receipt → refuse, do not run', () => {
  const result = resolveStampExecution({
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
  const result = resolveStampExecution({
    commands: ['npm test'],
    liveState: 'review',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.match(result.message, /demote/i);
});

test('Test + valid receipt covering standard lanes → reuse', () => {
  const result = resolveStampExecution({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'test',
    receipt: greenTestReceipt(),
    headSha: SHA,
  });
  assert.equal(result.action, 'reuse');
});

test('Test + no covering receipt → run', () => {
  const result = resolveStampExecution({
    commands: ['npm test', 'npm run test:slow'],
    liveState: 'test',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'run');
});

test('Develop + test:slow → refuse without treating it as Review', () => {
  const result = resolveStampExecution({
    commands: ['npm run test:slow'],
    liveState: 'develop',
    receipt: null,
    headSha: SHA,
  });
  assert.equal(result.action, 'refuse');
  assert.doesNotMatch(result.message, /demote/i);
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
});
