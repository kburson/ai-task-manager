// @story #1266

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const CLI = path.join(ROOT, 'scripts/review/co-review.mjs');
const temporaryRoots = new Set();

function temporaryRoot(prefix = 'aitm-co-review-') {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

function runCli(args, { cwd = temporaryRoot() } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
}

test.afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

test('top-level help is recovery-grade and safe before initialization', () => {
  const emptyRoot = temporaryRoot();
  for (const args of [['help'], ['--help']]) {
    const result = runCli(args, { cwd: emptyRoot });
    assert.equal(result.status, 0, result.stderr);
    for (const heading of [
      'WHAT',
      'WHY',
      'WHO',
      'WHEN',
      'WHERE',
      'HOW',
      'LIFECYCLE',
      'COMMANDS',
      'OPTION GLOSSARY',
      'ARTIFACT FORMAT',
      'EXIT CODES',
      'CONTEXT-RESET CHECKLIST',
    ]) {
      assert.match(result.stdout, new RegExp(heading));
    }
    assert.deepEqual(readdirSync(emptyRoot), []);
  }
});

test('every command has standalone recovery help in both forms', () => {
  const emptyRoot = temporaryRoot();
  for (const command of ['init', 'status', 'claim', 'wait', 'handoff', 'continue']) {
    const canonical = runCli(['help', command], { cwd: emptyRoot });
    const flag = runCli([command, '--help'], { cwd: emptyRoot });
    assert.equal(canonical.status, 0, canonical.stderr);
    assert.equal(flag.stdout, canonical.stdout);
    for (const field of [
      'Purpose',
      'Authorized caller',
      'Prerequisites',
      'Usage',
      'Arguments',
      'Effects',
      'Validations',
      'Output',
      'Exit codes',
      'State transition',
      'Idempotency',
      'Examples',
      'Failure recovery',
      'Next commands',
    ]) {
      assert.match(canonical.stdout, new RegExp(field));
    }
  }
});

test('co-review is a routed agent-callable standalone command', async () => {
  const { SELF_DOC } = await import('../../../lib/self-doc.mjs');
  const { EXECUTABLE_ENTRYPOINTS } =
    await import('../../../task-tracker/lib/command-surface/entrypoints.mjs');
  assert.equal(SELF_DOC['co-review']?.path, 'scripts/review/co-review.mjs');
  assert.deepEqual(
    EXECUTABLE_ENTRYPOINTS.find((row) => row.command === 'co-review'),
    {
      path: 'scripts/review/co-review.mjs',
      classification: 'agent-callable-standalone',
      command: 'co-review',
    }
  );
});
