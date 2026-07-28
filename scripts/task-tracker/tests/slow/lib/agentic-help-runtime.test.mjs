// @story #1011 #1023
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { COMMAND_MANIFEST } from '../../../command-manifest.mjs';
import { agentCommandCatalog } from '../../../lib/command-surface/catalog.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../lib/command-surface/entrypoints.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const AITM = path.join(ROOT, 'bin/aitm.mjs');
const PACKAGE_CLI = path.join(ROOT, 'bin/cli.mjs');
const TASK_TRACKER = path.join(ROOT, 'scripts/task-tracker/task-tracker.mjs');
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`);
const DIRECT_CLASSES = new Set([
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);

function run(file, args, cwd, env = {}) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: cwd,
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
      NO_COLOR: '1',
      ...env,
    },
    timeout: 10_000,
  });
}

function assertSafeHelp(result, label) {
  assert.equal(result.signal, null, `${label}: timed out`);
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.ok(result.stdout.trim(), `${label}: empty stdout`);
  assert.equal(ANSI_RE.test(`${result.stdout}${result.stderr}`), false, `${label}: ANSI`);
}

function assertDetailedHelp(result, label) {
  assertSafeHelp(result, label);
  for (const heading of [
    'Purpose:',
    'Usage:',
    'Arguments:',
    'Preconditions:',
    'Effects:',
    'Output:',
    'Exit codes:',
    'Examples:',
    'Related:',
  ]) {
    assert.match(result.stdout, new RegExp(heading, 'i'), `${label}: ${heading}`);
  }
}

test('every public direct entry point exits safely for --help and -h', () => {
  const temp = mkdtempProjectIsolated('aitm-help-');
  try {
    const before = readdirSync(temp).sort();
    for (const entry of EXECUTABLE_ENTRYPOINTS.filter((row) =>
      DIRECT_CLASSES.has(row.classification)
    )) {
      for (const token of ['--help', '-h']) {
        const result = run(path.join(ROOT, entry.path), [token], temp);
        if (entry.path === 'bin/aitm.mjs') {
          assertSafeHelp(result, `${entry.path} ${token}`);
        } else {
          assertDetailedHelp(result, `${entry.path} ${token}`);
          const name = entry.command || path.basename(entry.path).replace(/\.(?:mjs|js)$/, '');
          assert.ok(
            result.stdout.startsWith(`${name} —`),
            `${entry.path} ${token}: wrong command identity`
          );
        }
      }
    }
    assert.deepEqual(readdirSync(temp).sort(), before, 'help must not mutate the temporary cwd');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('every package bin emits detailed help through an install-style symlink', () => {
  const temp = mkdtempProjectIsolated('aitm-package-bin-help-');
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const [name, target] of Object.entries(pkg.bin)) {
      const shim = path.join(temp, name);
      symlinkSync(path.join(ROOT, target), shim);
      assertDetailedHelp(run(shim, ['--help'], temp), name);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('every package lifecycle subcommand help exits before mutation', () => {
  const temp = mkdtempProjectIsolated('aitm-package-subcommand-help-');
  try {
    const before = readdirSync(temp).sort();
    for (const args of [
      ['install', '--help'],
      ['init', '--help'],
      ['repair', '--help'],
      ['statusline', '--help'],
      ['configure', 'preferences', '--help'],
      ['memory-resync', '--help'],
      ['version', '--help'],
    ]) {
      assertDetailedHelp(
        run(PACKAGE_CLI, args, temp, { HOME: temp }),
        `ai-task-manager ${args.join(' ')}`
      );
    }
    assert.deepEqual(
      readdirSync(temp).sort(),
      before,
      'package subcommand help must not mutate target or HOME'
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('help probes do not consume option values and run before subprocess work', () => {
  const temp = mkdtempProjectIsolated('aitm-help-position-');
  try {
    const createIssue = path.join(ROOT, 'scripts/gh/create-issue.mjs');
    const legitimateValue = run(
      createIssue,
      ['--title', 'help', '--body-file', path.join(temp, 'missing.md'), '--dry-run'],
      temp
    );
    assert.notEqual(legitimateValue.status, 0, 'option value "help" must not trigger help');
    assert.doesNotMatch(legitimateValue.stdout, /^create-issue —/);

    const verbValue = run(
      AITM,
      [
        'refine',
        '999999',
        '--size',
        'S',
        '--estimate',
        '1',
        '--priority',
        'p2',
        '--reason',
        'help',
      ],
      temp
    );
    assert.notEqual(verbValue.status, 0, 'verb option value "help" must not trigger help');
    assert.doesNotMatch(verbValue.stdout, /^\/task refine —/);

    const marker = path.join(temp, 'git-was-called');
    const fakeBin = path.join(temp, 'fake-bin');
    const fakeGit = path.join(fakeBin, 'git');
    mkdirSync(fakeBin);
    writeFileSync(fakeGit, `#!/bin/sh\nprintf called > ${JSON.stringify(marker)}\nexit 1\n`, {
      mode: 0o755,
    });
    chmodSync(fakeGit, 0o755);
    const report = path.join(ROOT, 'scripts/reports/generate-value-report.mjs');
    assertDetailedHelp(
      run(report, ['--help'], temp, {
        PATH: `${fakeBin}:${process.env.PATH}`,
      }),
      'value-report early help'
    );
    assert.equal(existsSync(marker), false, 'help must exit before spawning git');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('every routed verb supports help, ?, --help, and -h', () => {
  const temp = mkdtempProjectIsolated('aitm-routed-help-');
  try {
    const before = readdirSync(temp).sort();
    for (const entry of COMMAND_MANIFEST) {
      for (const token of ['help', '?', '--help', '-h']) {
        assertDetailedHelp(run(AITM, [entry.verb, token], temp), `${entry.verb} ${token}`);
      }
    }
    for (const entry of agentCommandCatalog().filter((record) => record.routing === 'standalone')) {
      for (const token of ['help', '?', '--help', '-h']) {
        assertDetailedHelp(run(AITM, [entry.name, token], temp), `${entry.name} ${token}`);
      }
    }
    assert.deepEqual(
      readdirSync(temp).sort(),
      before,
      'routed help must not mutate the temporary cwd'
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('equivalent direct, routed, and package-bin forms render the same contract', () => {
  const temp = mkdtempProjectIsolated('aitm-help-equivalence-');
  try {
    const routedVerb = run(AITM, ['help', 'refine'], temp);
    const flaggedVerb = run(AITM, ['refine', '--help'], temp);
    assertDetailedHelp(routedVerb, 'help refine');
    assertDetailedHelp(flaggedVerb, 'refine --help');
    assert.equal(flaggedVerb.stdout, routedVerb.stdout);

    const createIssue = path.join(ROOT, 'scripts/gh/create-issue.mjs');
    const directStandalone = run(createIssue, ['--help'], temp);
    const routedStandalone = run(AITM, ['create-issue', '--help'], temp);
    assertDetailedHelp(directStandalone, 'direct create-issue');
    assertDetailedHelp(routedStandalone, 'routed create-issue');
    assert.equal(routedStandalone.stdout, directStandalone.stdout);

    const packageBin = path.join(temp, 'ai-task-manager');
    symlinkSync(PACKAGE_CLI, packageBin);
    const directPackage = run(PACKAGE_CLI, ['--help'], temp);
    const linkedPackage = run(packageBin, ['--help'], temp);
    assertDetailedHelp(directPackage, 'direct package CLI');
    assertDetailedHelp(linkedPackage, 'linked package CLI');
    assert.equal(linkedPackage.stdout, directPackage.stdout);

    const directSubcommand = run(PACKAGE_CLI, ['install', '--help'], temp, { HOME: temp });
    const linkedSubcommand = run(packageBin, ['install', '--help'], temp, { HOME: temp });
    assertDetailedHelp(directSubcommand, 'direct package install');
    assertDetailedHelp(linkedSubcommand, 'linked package install');
    assert.equal(linkedSubcommand.stdout, directSubcommand.stdout);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('direct task help forms exit before project configuration is read', () => {
  const temp = mkdtempProjectIsolated('aitm-direct-task-help-');
  try {
    const before = readdirSync(temp).sort();
    const canonical = run(TASK_TRACKER, ['help', 'refine'], temp);
    const flagged = run(TASK_TRACKER, ['refine', '--help'], temp);
    assertDetailedHelp(canonical, 'direct task help refine');
    assertDetailedHelp(flagged, 'direct task refine --help');
    assert.equal(canonical.stdout, flagged.stdout);
    assert.deepEqual(
      readdirSync(temp).sort(),
      before,
      'direct task help must not initialize state'
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('routed task wrappers propagate command return codes', () => {
  const temp = mkdtempProjectIsolated('aitm-task-exit-');
  try {
    const configDir = path.join(temp, '.ai-task-manager');
    mkdirSync(configDir);
    writeFileSync(
      path.join(configDir, 'task-tracker.json'),
      JSON.stringify({ repo: 'test-owner/test-repo' })
    );
    const stateDir = path.join(temp, '.tmp/aitm/state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      path.join(stateDir, 'task-tracker-state.json'),
      JSON.stringify({ active: '#123', lastActive: '#123' })
    );
    const result = run(AITM, ['pull-next'], temp, {
      TT_SKIP_FIELD_SELF_CHECK: '1',
      TT_SKIP_NETWORK: '1',
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage: \/task pull-next/);
    for (const verb of ['promote', 'demote', 'plan-approve', 'approve']) {
      const missingTarget = run(AITM, [verb], temp, {
        TT_SKIP_FIELD_SELF_CHECK: '1',
        TT_SKIP_NETWORK: '1',
      });
      assert.equal(missingTarget.status, 1, `${verb}: ${missingTarget.stderr}`);
      assert.match(missingTarget.stderr, /Usage:/, verb);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('unknown commands return usage error with compact ANSI-free aggregate help', () => {
  const temp = mkdtempProjectIsolated('aitm-unknown-help-');
  try {
    for (const [file, label] of [
      [AITM, 'aitm'],
      [PACKAGE_CLI, 'ai-task-manager'],
    ]) {
      const result = run(file, ['definitely-not-a-command'], temp);
      assert.equal(result.status, 2, label);
      assert.match(`${result.stdout}${result.stderr}`, /Usage/i, label);
      assert.equal(ANSI_RE.test(`${result.stdout}${result.stderr}`), false, label);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
