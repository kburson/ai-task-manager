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
  const { expectedStatus = 0, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    ...spawnOptions,
  });
  const diagnostic = [
    `command: ${command}`,
    `args: ${JSON.stringify(args)}`,
    `cwd: ${cwd}`,
    `error: ${result.error?.message ?? 'none'}`,
    `status: ${result.status}; signal: ${result.signal}`,
    `stdout:\n${result.stdout ?? ''}`,
    `stderr:\n${result.stderr ?? ''}`,
  ].join('\n');
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(result.status, expectedStatus, diagnostic);
  return result;
}

for (const [name, program, options, errorCode] of [
  [
    'timeout',
    "require('fs').writeSync(1, 'captured-out'); require('fs').writeSync(2, 'captured-err'); setInterval(() => {}, 1000);",
    { timeout: 2000 },
    'ETIMEDOUT',
  ],
  [
    'buffer overflow',
    "require('fs').writeSync(2, 'captured-err'); require('fs').writeSync(1, 'captured-out' + 'x'.repeat(65536));",
    { maxBuffer: 1024 },
    'ENOBUFS',
  ],
]) {
  test(`spawn ${name} reports command arguments and both captured streams`, () => {
    assert.throws(
      () => run(process.execPath, ['-e', program, 'diagnostic-argument'], PROJECT_ROOT, options),
      (error) => {
        assert.ok(error.message.includes(`command: ${process.execPath}`), error.message);
        assert.ok(error.message.includes('diagnostic-argument'), error.message);
        assert.ok(error.message.includes(errorCode), error.message);
        assert.match(error.message, /stdout:\ncaptured-out/);
        assert.match(error.message, /stderr:\ncaptured-err/);
        return true;
      }
    );
  });
}

function commands(settings, event) {
  return (settings.hooks[event] ?? []).flatMap((entry) =>
    entry.hooks.map(({ command }) => command)
  );
}

function executeGenerated(command, payload, cwd, env, expectedStatus = 0) {
  // These generated command hooks have no args field. Claude, Codex, and
  // Grok dispatch the complete command through a shell, including its quoting.
  return run('/bin/sh', ['-c', command], cwd, {
    env,
    input: JSON.stringify(payload),
    expectedStatus,
  });
}

function firstInstalledReference(markdown, suffix, consumerDir) {
  const reference = [...markdown.matchAll(/`(node_modules\/[^`]+)`/g)]
    .map((match) => match[1])
    .find((candidate) => candidate.endsWith(suffix));
  assert.ok(reference, `missing installed instruction reference: ${suffix}`);
  const absolute = join(consumerDir, reference);
  assert.ok(existsSync(absolute), `unresolved transitive instruction reference: ${reference}`);
  return absolute;
}

function assertNoBlockedAitmScripts(output) {
  let inBlockedWarning = false;
  let blocked = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/^npm warn install-scripts(?: |$)/i, '');
    if (/\b(?:install scripts blocked|blocked(?: install)? scripts)\b/i.test(line)) {
      inBlockedWarning = true;
    }
    if (
      !/^\s/.test(line) &&
      /\bblocked\b/i.test(line) &&
      /(?:^|\s)@kburson\/ai-task-manager(?:@[^\s()]+)?(?=\s|$)/.test(line)
    ) {
      blocked = true;
    }
    if (inBlockedWarning && /^\s+@kburson\/ai-task-manager(?:@[^\s()]+)?(?=\s|$)/.test(line)) {
      blocked = true;
    } else if (!/^\s+\S/.test(line) && !/\bblocked\b/i.test(line)) {
      inBlockedWarning = false;
    }
  }
  assert.equal(blocked, false, `AITM must not require a blocked install lifecycle:\n${output}`);
}

const blockedHeader =
  'npm warn install-scripts 2 packages had install scripts blocked because they are not covered by allowScripts:';
for (const [name, output] of [
  [
    'npm 12 multiline postinstall',
    `${blockedHeader}\nnpm warn install-scripts   other@1.0.0 (install: node install.js)\nnpm warn install-scripts   @kburson/ai-task-manager@1.0.0 (postinstall: node setup.mjs)\nnpm warn install-scripts\n`,
  ],
  [
    'multiline without npm log prefixes',
    '1 package had install scripts blocked because they are not covered by allowScripts:\n  @kburson/ai-task-manager@1.0.0 (prepare: node setup.mjs)\n',
  ],
  ['same-line warning', 'npm warn install-scripts blocked @kburson/ai-task-manager@1.0.0'],
]) {
  test(`blocked script detection rejects ${name}`, () => {
    assert.throws(() => assertNoBlockedAitmScripts(output), /AITM must not require/);
  });
}
for (const [name, output] of [
  [
    'unrelated package',
    `${blockedHeader}\nnpm warn install-scripts   other@1.0.0 (postinstall: node setup.mjs)\nnpm warn install-scripts\nnpm notice installed @kburson/ai-task-manager@1.0.0\n`,
  ],
  [
    'similar package name',
    `${blockedHeader}\nnpm warn install-scripts   @kburson/ai-task-manager-tools@1.0.0 (install: node setup.mjs)\n`,
  ],
  [
    'AITM mentioned by another script',
    `${blockedHeader}\nnpm warn install-scripts   other@1.0.0 (install: echo @kburson/ai-task-manager)\n`,
  ],
  [
    'blocked text inside another script',
    `${blockedHeader}\nnpm warn install-scripts   other@1.0.0 (install: echo blocked @kburson/ai-task-manager in fixture)\n`,
  ],
  [
    'AITM outside warning block',
    `${blockedHeader}\nnpm warn install-scripts   other@1.0.0 (install: node setup.mjs)\nnpm warn deprecated @kburson/ai-task-manager@1.0.0: example\n`,
  ],
  ['no blocked scripts', 'added @kburson/ai-task-manager@1.0.0\n'],
]) {
  test(`blocked script detection permits ${name}`, () => assertNoBlockedAitmScripts(output));
}

// Catches a reintroduced package lifecycle, retired seed hook, or unscoped
// consumer path even when the checkout's dogfood self-link masks that defect.
test('restrictive downstream tarball install runs CLI and generated provider hooks without an alias', (t) => {
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
    const npmMajor = Number.parseInt(run('npm', ['--version'], consumerDir).stdout, 10);
    const dependencies = { [PACKAGE_NAME]: `file:${join(packDir, report.filename)}` };
    if (npmMajor >= 12) {
      // An unrelated blocked dependency is a live negative control: npm must
      // visibly report its warning even if the invoking environment is silent.
      const controlDir = join(sandbox, 'blocked-control');
      mkdirSync(controlDir);
      writeFileSync(
        join(controlDir, 'package.json'),
        JSON.stringify({
          name: 'aitm-boundary-blocked-control',
          version: '1.0.0',
          scripts: { postinstall: 'node -e "process.exit(99)"' },
        })
      );
      const controlPack = run('npm', ['pack', '--json', '--pack-destination', packDir], controlDir);
      const controlReport = parseNpmPackReport(controlPack.stdout, {
        expectedPackageName: 'aitm-boundary-blocked-control',
        requireFilename: true,
      });
      dependencies['aitm-boundary-blocked-control'] =
        `file:${join(packDir, controlReport.filename)}`;
    } else {
      t.diagnostic(
        `npm ${npmMajor}: allowScripts policy requires npm 12; checking installed runtime compatibility only`
      );
    }
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'aitm-downstream-boundary',
        private: true,
        type: 'module',
        dependencies,
        allowScripts: {},
      })
    );
    const installed = run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--loglevel=warn'],
      consumerDir,
      {
        env: { ...env, npm_config_loglevel: 'silent' },
      }
    );
    if (npmMajor >= 12) {
      assert.match(installed.stderr, /npm warn install-scripts[^\n]*install scripts blocked/i);
      assert.match(installed.stderr, /aitm-boundary-blocked-control@1\.0\.0 \(postinstall:/);
    }
    for (const output of [installed.stdout, installed.stderr]) {
      assertNoBlockedAitmScripts(output);
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
        '--agent',
        'grok',
        '--memory-seed',
        'all',
      ],
      consumerDir,
      { env }
    );

    const claude = JSON.parse(readFileSync(join(consumerDir, '.claude', 'settings.json'), 'utf8'));
    const codex = JSON.parse(readFileSync(join(consumerDir, '.codex', 'hooks.json'), 'utf8'));
    const grok = JSON.parse(readFileSync(join(consumerDir, '.grok', 'hooks', 'aitm.json'), 'utf8'));
    for (const settings of [claude, codex, grok]) {
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
      ['grok', '.grok'],
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
      const canonical = readFileSync(
        firstInstalledReference(skill, `/adapters/${provider}/SKILL.md`, consumerDir),
        'utf8'
      );
      const routerPath = firstInstalledReference(canonical, '/shared/router.md', consumerDir);
      const router = readFileSync(routerPath, 'utf8');
      const shared = readFileSync(join(installedRoot, 'skill/shared/SKILL.md'), 'utf8');
      assert.equal(firstInstalledReference(shared, '/shared/router.md', consumerDir), routerPath);
      firstInstalledReference(router, '/docs/DESIGN.md', consumerDir);
      if (provider !== 'grok') {
        const scriptRoot = firstInstalledReference(canonical, '/scripts/', consumerDir);
        assert.ok(existsSync(join(scriptRoot, 'task-tracker/task-tracker.mjs')));
      }
      for (const instructions of [canonical, shared, router]) {
        assert.doesNotMatch(instructions, /node_modules\/ai-task-manager\//);
        for (const [, rule] of instructions.matchAll(/`(rules\/[\w-]+\.md)`/g)) {
          assert.ok(
            readFileSync(join(dirname(routerPath), rule), 'utf8').length > 0,
            `unreadable routed rule: ${rule}`
          );
        }
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
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const ask = commands(claude, event).find((command) => command.includes('/on-ask.mjs'));
      assert.ok(ask);
      const result = executeGenerated(ask, { hook_event_name: event }, consumerDir, env);
      assert.equal(result.stderr, '');
    }
    const grokGuard = commands(grok, 'PreToolUse').find((command) =>
      command.includes('bash-guard')
    );
    assert.ok(grokGuard);
    const grokDenied = executeGenerated(
      grokGuard,
      {
        hookEventName: 'pre_tool_use',
        sessionId: 'package-smoke',
        timestamp: '2026-09-15T12:00:00.000Z',
        toolName: 'run_terminal_command',
        toolInput: { command: 'sudo whoami' },
      },
      consumerDir,
      env,
      2
    );
    assert.equal(JSON.parse(grokDenied.stdout).decision, 'deny');
    assert.match(JSON.parse(grokDenied.stdout).reason, /sudo elevation/);
    assert.equal(
      existsSync(alias),
      false,
      'provider installation must not create an unscoped alias'
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
