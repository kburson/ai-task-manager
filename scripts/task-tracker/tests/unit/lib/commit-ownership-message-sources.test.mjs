#!/usr/bin/env node
// @story #1212
// cspell:ignore nesac tokenless
// Indirect git message sources still carry story attribution and therefore
// must traverse the exclusive-ownership guard.

import test from 'node:test';
// cspell:words nocorrect noglob
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
    '#!/bin/sh\ncase "$*" in\n  *"api user"*) echo alice ;;\n  *) cat >/dev/null; echo \'{"data":{"repository":{"issue":{"assignees":{"nodes":[{"login":"bob"}]}}}}}\' ;;\nesac\n'
  );
  chmodSync(gh, 0o755);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['commit', '--allow-empty', '-m', '[#1212] baseline'], { cwd: dir });
  return { dir, bin, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runGuard(fixture, command, { expectDecision = true } = {}) {
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
  const diagnostic = [
    `guard subprocess failed before emitting a decision for: ${command}`,
    `status=${String(result.status)} signal=${String(result.signal)}`,
    `error=${result.error?.stack || result.error?.message || String(result.error || '')}`,
    `stderr=${String(result.stderr || '').trim()}`,
  ].join('\n');
  assert.ifError(result.error);
  assert.equal(result.signal, null, diagnostic);
  assert.notEqual(result.status, null, diagnostic);
  if (expectDecision) assert.notEqual(String(result.stdout || '').trim(), '', diagnostic);
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
    const { payload } = runGuard(fixture, 'git commit -F .tmp/message.txt', {
      expectDecision: false,
    });
    assert.notEqual(payload.decision, 'block');
  } finally {
    fixture.cleanup();
  }
});

test('dynamic and nested commit messages cannot bypass attribution inspection', () => {
  const fixture = makeFixture();
  try {
    for (const command of [
      'MSG="[#1212] hidden"; git commit -m "$MSG"',
      'sh -c \'git commit -m "[#1212] nested"\'',
      'bash -lc \'git commit -m "[#1212] nested login shell"\'',
      'set -- \'[#1212] hidden\'; git commit -m "$1"',
      'eval \'git commit -m "[#1212] evaluated"\'',
      'CMD=\'git commit -m "[#1212] evaluated variable"\'; eval "$CMD"',
      'eval "$COMMIT_CMD"',
      'builtin eval "$COMMIT_CMD"',
      'command builtin eval "$COMMIT_CMD"',
      'noglob eval "$COMMIT_CMD"',
      'nocorrect eval "$COMMIT_CMD"',
      'git -c alias.ci=commit ci -m "[#1212] alias commit"',
      'git -c alias.ci=\'commit --signoff\' ci -m "[#1212] alias options"',
      'git -c alias.ci=\'!git commit\' ci -m "[#1212] shell alias"',
      'git -c alias.ci=\'!git -c user.name=Test commit\' ci -m "[#1212] git config alias"',
      'git -c alias.ci=\'!git --no-pager commit\' ci -m "[#1212] git option alias"',
      'git -c alias.ci=\'!f() { git commit "$@"; }; f\' ci -m "[#1212] function alias"',
      'git -c alias.ci=\'!f() { git "$@"; }; f\' ci commit -m "[#1212] argument alias"',
      'git -c alias.ci=co -c alias.co=commit ci -m "[#1212] chained builtin alias"',
      'git -c alias.ci=co -c alias.co=\'!git commit\' ci -m "[#1212] chained shell alias"',
      'git -c alias.ci=co -c alias.co=ci ci -m "[#1212] cyclic alias"',
      'git -c alias.ci=\'-c user.name=Test commit\' ci -m "[#1212] option-bearing alias"',
    ]) {
      const { payload } = runGuard(fixture, command);
      assert.equal(payload.decision, 'block', `must inspect or refuse: ${command}`);
      assert.match(payload.reason, /ownership|shell expansion/i);
    }
  } finally {
    fixture.cleanup();
  }
});

test('persistently configured commit aliases enforce ownership', () => {
  const fixture = makeFixture();
  try {
    spawnSync('git', ['config', 'alias.ci', '!f() { git commit "$@"; }; f'], {
      cwd: fixture.dir,
    });
    const { payload } = runGuard(fixture, 'git ci -m "[#1212] configured function alias"');
    assert.equal(payload.decision, 'block');
    assert.match(payload.reason, /exclusive ownership|ownership is foreign-owner/i);

    spawnSync('git', ['config', 'alias.co', '!git --no-pager commit'], {
      cwd: fixture.dir,
    });
    const configuredOptionAlias = runGuard(fixture, 'git co -m "[#1212] configured option alias"');
    assert.equal(configuredOptionAlias.payload.decision, 'block');
    assert.match(
      configuredOptionAlias.payload.reason,
      /exclusive ownership|ownership is foreign-owner/i
    );

    spawnSync('git', ['config', 'alias.cx', '!f() { git "$@"; }; f'], {
      cwd: fixture.dir,
    });
    const configuredArgumentAlias = runGuard(
      fixture,
      'git cx commit -m "[#1212] configured argument alias"'
    );
    assert.equal(configuredArgumentAlias.payload.decision, 'block');
    assert.match(
      configuredArgumentAlias.payload.reason,
      /exclusive ownership|ownership is foreign-owner/i
    );

    spawnSync('git', ['config', 'alias.c1', 'c2'], { cwd: fixture.dir });
    spawnSync('git', ['config', 'alias.c2', 'commit'], { cwd: fixture.dir });
    const configuredAliasChain = runGuard(fixture, 'git c1 -m "[#1212] configured alias chain"');
    assert.equal(configuredAliasChain.payload.decision, 'block');
    assert.match(
      configuredAliasChain.payload.reason,
      /exclusive ownership|ownership is foreign-owner/i
    );

    spawnSync('git', ['config', 'alias.c3', '-c user.name=Test commit'], {
      cwd: fixture.dir,
    });
    const configuredOptionChain = runGuard(
      fixture,
      'git c3 -m "[#1212] configured option-bearing alias"'
    );
    assert.equal(configuredOptionChain.payload.decision, 'block');
    assert.match(
      configuredOptionChain.payload.reason,
      /exclusive ownership|ownership is foreign-owner/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('the word eval outside shell-builtin command position remains harmless', () => {
  const fixture = makeFixture();
  try {
    for (const command of [
      'rg -n eval scripts/task-tracker/bash-guard.mjs',
      "node --eval 'console.log(1)'",
      "printf '%s\\n' 'eval is discussed here'",
    ]) {
      const { payload } = runGuard(fixture, command, { expectDecision: false });
      assert.notEqual(payload.decision, 'block', `must not block harmless eval text: ${command}`);
    }
  } finally {
    fixture.cleanup();
  }
});
