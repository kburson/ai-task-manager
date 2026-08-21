// @story #1365
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupTemporaryRoots,
  realRepositoryFixture,
  runCli,
} from '../../../fixtures/co-review-fixture.mjs';

const GUARD = path.resolve('scripts/task-tracker/bash-guard.mjs');
const AITM_BIN = path.resolve('bin/aitm.mjs');
const REVIEWER_ENV = {
  ...process.env,
  AI_TASK_MANAGER_SESSION_ID: 'reviewer-command-boundary-1365',
  GROK_AGENT: '1',
  GROK_SESSION_ID: 'reviewer-command-boundary-1365',
};

test.afterEach(cleanupTemporaryRoots);

function successfulCli(args, root) {
  const result = runCli(args, { cwd: root, env: REVIEWER_ENV });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function successfulNpx(args, root) {
  const result = spawnSync('npx', ['aitm', 'co-review', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...REVIEWER_ENV, npm_config_offline: 'true' },
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runGuard(root, command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GUARD], {
      cwd: root,
      env: REVIEWER_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(
      JSON.stringify({
        tool_name: 'Bash',
        cwd: root,
        tool_input: { command },
      })
    );
  });
}

test('live reviewer command passes the guard and reaches accepted archived state', async () => {
  const fixture = realRepositoryFixture();
  const dir = '.tmp/co-review/boundary-1365';
  const archiveDir = 'docs/superpowers/reviews/1365/boundary-fixture';
  mkdirSync(path.join(fixture.root, 'node_modules'), { recursive: true });
  mkdirSync(path.join(fixture.root, 'bin'), { recursive: true });
  symlinkSync('..', path.join(fixture.root, 'node_modules', 'ai-task-manager'), 'dir');
  symlinkSync(AITM_BIN, path.join(fixture.root, 'bin', 'aitm.mjs'), 'file');
  writeFileSync(
    path.join(fixture.root, 'package.json'),
    `${JSON.stringify({
      name: '@kburson/ai-task-manager',
      version: '1.0.0',
      type: 'module',
      bin: { aitm: 'bin/aitm.mjs' },
    })}\n`
  );

  successfulCli(
    [
      'init',
      '--dir',
      dir,
      '--artifact',
      fixture.artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '3',
      '--archive-dir',
      archiveDir,
    ],
    fixture.root
  );
  successfulCli(['claim', '--dir', dir, '--actor', 'owner-agent'], fixture.root);

  const response = `${dir}/round-1-owner-response.md`;
  writeFileSync(path.join(fixture.root, response), '# Owner response\n\nReady for review.\n');
  successfulCli(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      fixture.artifact,
      '--commit',
      fixture.initialCommit,
      '--message',
      'owner handoff complete',
    ],
    fixture.root
  );
  successfulCli(['claim', '--dir', dir, '--actor', 'reviewer-agent'], fixture.root);

  const review = `${dir}/round-2-reviewer-review.md`;
  writeFileSync(path.join(fixture.root, review), '# Review\n\nDecision: accepted.\n');
  const message =
    'review complete: accepted with 4 refinement findings ' +
    '(F-001 squash token completeness is the only load-bearing one)';
  const command = [
    'npx aitm co-review handoff',
    `--dir ${dir}`,
    '--actor reviewer-agent',
    `--review ${review}`,
    `--review-of ${fixture.initialCommit}`,
    '--decision accepted',
    `--message '${message}'`,
  ].join(' ');

  for (const allowed of [
    `npx aitm co-review status --dir ${dir}`,
    `npx aitm co-review status --dir ${dir} --json`,
    'npx aitm co-review help handoff',
  ]) {
    const inspection = await runGuard(fixture.root, allowed);
    assert.equal(inspection.status, 0, inspection.stderr);
    assert.equal(inspection.stdout, '', allowed);
  }

  for (const denied of [
    `npx aitm co-review handoff --dir ${dir} --actor owner-agent ` +
      `--review ${review} --review-of ${fixture.initialCommit} ` +
      '--decision accepted --message "review complete"',
    `npx aitm co-review handoff --dir ${dir} --actor reviewer-agent ` +
      `--review ${review} --review-of ${fixture.initialCommit} ` +
      '--decision accepted --message "review complete" && touch owned',
    `npx aitm co-review finalize --dir ${dir}`,
  ]) {
    const refusal = await runGuard(fixture.root, denied);
    assert.equal(refusal.status, 0, refusal.stderr);
    const decision = JSON.parse(refusal.stdout);
    assert.equal(decision.decision, 'block', denied);
  }

  const guard = await runGuard(fixture.root, command);
  assert.equal(guard.status, 0, guard.stderr);
  assert.equal(guard.stdout, '');

  const accepted = successfulNpx(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'reviewer-agent',
      '--review',
      review,
      '--review-of',
      fixture.initialCommit,
      '--decision',
      'accepted',
      '--message',
      message,
    ],
    fixture.root
  );
  assert.equal(accepted.lifecycle, 'accepted');
  assert.equal(accepted.archive.completion, 'complete-and-identical');
  assert.equal(accepted.archivePublication.status, 'published');
  assert.equal(accepted.lastHandoff.message, message);
});
