// @story #1011
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, rmSync } from 'node:fs';
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
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`);
const DIRECT_CLASSES = new Set([
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);

function run(file, args, cwd) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: cwd,
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
      NO_COLOR: '1',
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
        if (entry.path.startsWith('bin/')) {
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
