#!/usr/bin/env node
// @story #1212
// cspell:ignore nesac tokenless
// Indirect git message sources still carry story attribution and therefore
// must traverse the exclusive-ownership guard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');
const GUARD = path.join(ROOT, 'scripts/task-tracker/bash-guard.mjs');

function makeFixture() {
  const dir = mkdtempProjectIsolated('aitm-1212-commit-guard-');
  const bin = path.join(dir, '.tmp', 'bin');
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'acme/widgets', projectId: 'PVT_1' })
  );
  const gh = path.join(bin, 'gh');
  writeFileSync(
    gh,
    '#!/bin/sh\ncase "$*" in\n  *"api user"*) echo alice ;;\n  *) echo \'{"data":{"repository":{"issue":{"assignees":{"nodes":[{"login":"bob"}]}}}}}\' ;;\nesac\n'
  );
  chmodSync(gh, 0o755);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['commit', '--allow-empty', '-m', '[#1212] baseline'], { cwd: dir });
  return { dir, bin, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runGuard(fixture, command) {
  const result = spawnSync(process.execPath, [GUARD], {
    cwd: fixture.dir,
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      AI_TASK_MANAGER_SESSION_ID: 'commit-ownership-message-sources',
    },
    timeout: 10_000,
  });
  const payload = JSON.parse(result.stdout || '{}');
  return { result, payload };
}

test('indirect and globally-configured attributed commits enforce ownership', () => {
  const fixture = makeFixture();
  try {
    const messagePath = path.join(fixture.dir, '.tmp', 'message.txt');
    writeFileSync(messagePath, '[#1212] indirect attribution\n');
    for (const command of [
      'git commit -F .tmp/message.txt',
      'git commit --amend --no-edit',
      'git -c user.name=x commit -m "[#1212] configured attribution"',
    ]) {
      const { payload } = runGuard(fixture, command);
      assert.equal(payload.decision, 'block', `must block foreign ownership: ${command}`);
      assert.match(payload.reason, /exclusive ownership|ownership is foreign-owner/i);
    }
  } finally {
    fixture.cleanup();
  }
});

test('indirect tokenless chore message remains the explicit escape hatch', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.dir, '.tmp', 'message.txt'), 'chore: local maintenance\n');
    const { payload } = runGuard(fixture, 'git commit -F .tmp/message.txt');
    assert.notEqual(payload.decision, 'block');
  } finally {
    fixture.cleanup();
  }
});
