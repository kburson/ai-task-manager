// @story #1496
// cspell:ignore NOSYSTEM hardlink fsmonitor
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, linkSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import { createSandbox } from '../../../../helpers/evidence-v2/sandbox.mjs';
import { resolveExecutionContext } from '../../../../../task-tracker/lib/evidence-v2/execution-context.mjs';
import { guardGitInvocation } from '../../../../helpers/evidence-v2/git-boundary.mjs';

const toolRoot = fileURLToPath(new URL('../../../../../../', import.meta.url));

test('recorded runtime context refuses production source before context construction', () => {
  const root = mkdtempProjectIsolated('evidence-context-');
  mkdirSync(path.join(root, 'home'));
  try {
    const input = { providerMode: 'recorded', toolRoot, sourceRoot: toolRoot, authorityRoot: root };
    const source = `
      import assert from 'node:assert/strict';
      import { buildContext } from ${JSON.stringify(new URL('../../../../../task-tracker/runtime.mjs', import.meta.url).href)};
      assert.throws(() => buildContext(['status'], {executionContext: ${JSON.stringify(input)}}), /rehearsal:/);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: path.join(root, 'home'),
        AI_TASK_MANAGER_PROJECT_DIR: root,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recorded context rejects storage links, alternates, executable config and remote escape', () => {
  const sandbox = createSandbox();
  const objects = path.join(sandbox.context.gitCommonDir, 'objects');
  try {
    assert.ok(Object.isFrozen(sandbox.context));
    assert.equal(sandbox.context.productionEvidenceEligible, false);
    const original = path.join(sandbox.root, 'original');
    writeFileSync(original, 'protected');
    linkSync(original, path.join(objects, 'hardlink'));
    assert.throws(() => resolveExecutionContext(sandbox.context), /shared-object-storage/);
    rmSync(path.join(objects, 'hardlink'));
    symlinkSync(original, path.join(objects, 'symlink'));
    assert.throws(() => resolveExecutionContext(sandbox.context), /shared-object-storage/);
    rmSync(path.join(objects, 'symlink'));
    writeFileSync(path.join(objects, 'info', 'alternates'), `${toolRoot}/.git/objects`);
    assert.throws(() => resolveExecutionContext(sandbox.context), /object-alternates/);
    rmSync(path.join(objects, 'info', 'alternates'));
    const config = path.join(sandbox.context.gitCommonDir, 'config');
    const originalConfig = readFileSync(config, 'utf8');
    writeFileSync(
      config,
      `${originalConfig}\n[remote "unsafe"]\nurl = https://github.com/production/repo\n`
    );
    assert.throws(() => resolveExecutionContext(sandbox.context), /production-remote/);
    writeFileSync(config, `${originalConfig}\n[alias]\nunsafe = !curl https://example.invalid\n`);
    assert.throws(() => resolveExecutionContext(sandbox.context), /executable-git-config/);
    writeFileSync(config, originalConfig);
  } finally {
    sandbox.dispose();
  }
});

test('cold process denies network, arbitrary subprocesses and production filesystem access', () => {
  const sandbox = createSandbox();
  const protectedRoot = mkdtempProjectIsolated('evidence-protected-');
  const protectedFile = path.join(protectedRoot, 'authority.json');
  writeFileSync(protectedFile, 'keep');
  try {
    const result = sandbox.probe(`
      import assert from 'node:assert/strict';
      import {readFileSync,writeFileSync} from 'node:fs';
      import {execFileSync} from 'node:child_process';
      import {connect} from 'node:net';
      import {request} from 'node:https';
      import dns from 'node:dns/promises';
      assert.throws(() => connect(443, 'github.com'), /network-denied/);
      assert.throws(() => request('https://github.com'), /network-denied/);
      assert.throws(() => fetch('https://github.com'), /network-denied/);
      assert.throws(() => dns.resolve4('github.com'), /network-denied/);
      assert.throws(() => execFileSync('ssh', ['github.com']), /unsupported-process/);
      assert.throws(() => readFileSync(${JSON.stringify(protectedFile)}), /Access to this API has been restricted/);
      assert.throws(() => readFileSync(${JSON.stringify(path.join(toolRoot, 'node_modules/ai-task-manager/.ai-task-manager/task-tracker.json'))}), /Access to this API has been restricted/);
      assert.throws(() => writeFileSync(${JSON.stringify(protectedFile)}, 'wrong'), /Access to this API has been restricted/);
      assert.equal(process.env.GH_TOKEN, undefined);
      assert.equal(process.env.CODEX_THREAD_ID, undefined);
    `);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(readFileSync(protectedFile, 'utf8'), 'keep');
    assert.equal(sandbox.provider.effects().length, 0);
  } finally {
    sandbox.dispose();
    rmSync(protectedRoot, { recursive: true, force: true });
  }
});

test('Git executable options and remote hooks refuse before native execution', () => {
  const sandbox = createSandbox();
  try {
    for (const args of [
      ['rebase', '--exec=touch should-not-exist', 'HEAD'],
      ['commit', '-S', '-m', 'unsafe'],
      ['diff', `--git-dir=${sandbox.context.gitCommonDir}`],
    ])
      assert.throws(
        () => guardGitInvocation(sandbox.context, args),
        /git-(?:execution-option|override)/
      );
    const hook = path.join(sandbox.remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    assert.throws(() => sandbox.git(['push', 'origin', 'trunk']), /git-hooks/);
    rmSync(hook);
    const config = path.join(sandbox.context.gitCommonDir, 'config');
    writeFileSync(
      config,
      [readFileSync(config, 'utf8'), '[core]', 'fsmonitor = unsafe-command', ''].join('\n')
    );
    assert.throws(() => sandbox.git(['status']), /executable-git-config/);
  } finally {
    sandbox.dispose();
  }
});

test('real dispatcher runs in a fresh recorded context and refuses production issue preflight', () => {
  const sandbox = createSandbox();
  try {
    const status = sandbox.command(['status']);
    assert.equal(status.exitCode, 0, status.stderr);
    assert.match(status.stdout, /No active task/);
    const unguarded = spawnSync(
      process.execPath,
      [path.join(toolRoot, 'scripts/task-tracker/task-tracker.mjs'), 'status'],
      {
        cwd: sandbox.context.sourceRoot,
        encoding: 'utf8',
        env: { ...sandbox.env, AITM_REHEARSAL_CONTEXT: path.join(sandbox.root, 'context.json') },
      }
    );
    assert.notEqual(unguarded.status, 0);
    assert.match(unguarded.stderr, /recorded-transport-required/);
    const close = sandbox.command(['close', '1490']);
    assert.notEqual(close.exitCode, 0);
    assert.match(close.stderr, /rehearsal:production-target/);
    assert.equal(sandbox.provider.effects().length, 0);
    assert.throws(
      () => sandbox.git(['push', 'https://github.com/production/repo']),
      /production-remote/
    );
  } finally {
    sandbox.dispose();
  }
});
