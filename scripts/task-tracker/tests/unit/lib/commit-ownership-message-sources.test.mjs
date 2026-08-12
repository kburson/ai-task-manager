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
    // The governed unit lane runs hundreds of files concurrently; cold Node
    // startup plus guard dependency loading can exceed 10s under host pressure.
    // Keep a finite hang ceiling without turning scheduler contention into a
    // false ownership-policy failure.
    timeout: 120_000,
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
      'git commit --amend',
      'git commit --reuse-message=HEAD',
      'git commit -C HEAD',
      'git commit --reedit-message=HEAD',
      'git commit -c HEAD',
      'git -c user.name=x commit -m "[#1212] configured attribution"',
      '/usr/bin/git commit -m "[#1212] absolute git path"',
      'git commit --fixup=HEAD',
      'git commit --squash HEAD',
      'git commit',
    ]) {
      const { payload } = runGuard(fixture, command);
      assert.equal(payload.decision, 'block', `must block foreign ownership: ${command}`);
      assert.match(payload.reason, /exclusive ownership|ownership is foreign-owner/i);
    }
  } finally {
    fixture.cleanup();
  }
});

test('attributed commits fail closed when repository ownership config is unreadable', () => {
  const fixture = makeFixture();
  try {
    rmSync(path.join(fixture.dir, '.ai-task-manager', 'task-tracker.json'));
    const { payload } = runGuard(fixture, 'git commit -m "[#1212] missing config"');
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /config|ownership.*unverifiable/i);
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
