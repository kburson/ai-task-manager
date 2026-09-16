// @story #1631
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PACKAGE_NAME = '@kburson/ai-task-manager';

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
  return result;
}

function commands(settings, event) {
  return (settings.hooks[event] ?? []).flatMap((entry) =>
    entry.hooks.map(({ command }) => command)
  );
}

function executeGenerated(command, payload, cwd, env) {
  // Provider commands carry a node -e payload; preserve its embedded JSON
  // quotes, as the provider dispatcher does, rather than parsing again in a shell.
  assert.ok(command.startsWith('node -e "') && command.endsWith('"'));
  return run(process.execPath, ['-e', command.slice(9, -1)], cwd, {
    env,
    input: JSON.stringify(payload),
  });
}

// Catches a reintroduced package lifecycle, retired seed hook, or unscoped
// consumer path even when the checkout's dogfood self-link masks that defect.
test('restrictive downstream tarball install runs CLI and generated provider hooks without an alias', () => {
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'downstream-package-'));
  const packDir = join(sandbox, 'pack');
  const consumerDir = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });
  const env = {
    ...process.env,
    AI_TASK_MANAGER_PROJECT_DIR: consumerDir,
    TASK_TRACKER_PROJECT_DIR: consumerDir,
    TT_SKIP_NETWORK: '1',
    npm_config_offline: 'true',
    npm_config_ignore_scripts: 'false',
  };

  try {
    // Hooks must not discover the source worktree's Git root or runtime state.
    run('git', ['init', '-q', '-b', 'trunk'], consumerDir);
    const packed = run('npm', ['pack', '--json', '--pack-destination', packDir], PROJECT_ROOT, {
      env: { ...process.env, npm_config_loglevel: 'silent' },
    });
    const report = parseNpmPackReport(packed.stdout, {
      expectedPackageName: PACKAGE_NAME,
      requireFilename: true,
    });
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'aitm-downstream-boundary',
        private: true,
        type: 'module',
        dependencies: { [PACKAGE_NAME]: `file:${join(packDir, report.filename)}` },
        allowScripts: {},
      })
    );
    const installed = run('npm', ['install', '--no-audit', '--no-fund'], consumerDir, { env });
    for (const output of [installed.stdout, installed.stderr]) {
      assert.doesNotMatch(
        output,
        /(?:blocked[^\n]*@kburson\/ai-task-manager|@kburson\/ai-task-manager[^\n]*blocked)/i,
        'AITM must not require a blocked install lifecycle'
      );
    }
    const installedRoot = join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager');
    const alias = join(consumerDir, 'node_modules', 'ai-task-manager');
    assert.ok(existsSync(installedRoot));
    assert.equal(existsSync(alias), false, 'consumer must not need the dogfood alias');
    const manifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.prepare, undefined);

    const help = run(join(consumerDir, 'node_modules', '.bin', 'aitm'), ['help'], consumerDir, {
      env,
    });
    assert.match(help.stdout, /AI Task Manager|aitm/i);
    run(
      process.execPath,
      [
        join(installedRoot, 'bin', 'cli.mjs'),
        'install',
        '--target',
        consumerDir,
        '--agent',
        'claude',
        '--agent',
        'codex',
        '--memory-seed',
        'all',
      ],
      consumerDir,
      { env }
    );

    const claude = JSON.parse(readFileSync(join(consumerDir, '.claude', 'settings.json'), 'utf8'));
    const codex = JSON.parse(readFileSync(join(consumerDir, '.codex', 'hooks.json'), 'utf8'));
    for (const settings of [claude, codex]) {
      const all = Object.keys(settings.hooks).flatMap((event) => commands(settings, event));
      assert.ok(all.length > 0);
      for (const command of all) {
        assert.doesNotMatch(command, /node_modules\/ai-task-manager\//);
        assert.doesNotMatch(command, /ensure-worktree-seeded\.mjs/);
        const paths = command.match(/node_modules\/@kburson\/ai-task-manager\/[\w/.-]+/g) ?? [];
        assert.ok(paths.length > 0, `missing scoped entrypoint: ${command}`);
        for (const path of paths) assert.ok(existsSync(join(consumerDir, path)), path);
      }
    }
    for (const [provider, directory] of [
      ['claude', '.claude'],
      ['codex', '.agents'],
    ]) {
      const skill = readFileSync(
        join(consumerDir, directory, 'skills', 'task', 'SKILL.md'),
        'utf8'
      );
      assert.doesNotMatch(skill, /node_modules\/ai-task-manager\//);
      const adapter = `node_modules/@kburson/ai-task-manager/skill/adapters/${provider}/SKILL.md`;
      assert.ok(skill.includes(adapter));
      for (const path of skill.match(/node_modules\/@kburson\/ai-task-manager\/[\w/.-]+/g) ?? []) {
        assert.ok(existsSync(join(consumerDir, path)), `unresolved skill reference: ${path}`);
      }
    }

    for (const settings of [claude, codex]) {
      const memory = commands(settings, 'SessionStart').find((command) =>
        command.includes('/memory-index.mjs')
      );
      assert.ok(memory, 'memory seed selection must install the index hook');
      const result = executeGenerated(
        memory,
        { hook_event_name: 'SessionStart' },
        consumerDir,
        env
      );
      assert.equal(result.stderr, '');
      assert.match(
        JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
        /Operational-lessons memory index/
      );

      const guard = commands(settings, 'PreToolUse').find((command) =>
        command.includes('/bash-guard.mjs')
      );
      assert.ok(guard);
      const allowed = executeGenerated(guard, { tool_input: { command: 'pwd' } }, consumerDir, env);
      assert.equal(allowed.stdout, '');
      assert.equal(allowed.stderr, '');
      // This is input to a policy evaluator; no command in this payload runs.
      const denied = executeGenerated(
        guard,
        { tool_input: { command: 'sudo whoami' } },
        consumerDir,
        env
      );
      assert.equal(JSON.parse(denied.stdout).decision, 'block');
      assert.match(JSON.parse(denied.stdout).reason, /sudo elevation/);
    }
    const timestamp = commands(codex, 'UserPromptSubmit').find((command) =>
      command.includes('/codex-prompt-timestamp.mjs')
    );
    assert.ok(timestamp);
    const prompt = executeGenerated(
      timestamp,
      { hook_event_name: 'UserPromptSubmit', turn_id: 'package-smoke' },
      consumerDir,
      env
    );
    assert.match(
      JSON.parse(prompt.stdout).hookSpecificOutput.additionalContext,
      /turn package-smoke/
    );
    assert.equal(
      existsSync(alias),
      false,
      'provider installation must not create an unscoped alias'
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
