// @story #601
// Smoke leaf for `scripts/task-tracker/config-get.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split, this script is covered by a clean-invocation
// smoke rather than a ≥80% coverage target: it is a thin CLI wrapper that reads
// one key out of `.ai-task-manager/task-tracker.json`. The tests drive it as a
// child process with `cwd` pointed at a throwaway sandbox seeded with a fixture
// config, asserting the three observable behaviors — key hit, missing-key
// default, and the no-arg usage error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempOutsideRepo } from '../../../lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(new URL('../../../config-get.mjs', import.meta.url));

function run(cwd, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function seedConfig(values) {
  const cwd = mkdtempOutsideRepo('config-get-');
  mkdirSync(path.join(cwd, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(cwd, '.ai-task-manager', 'task-tracker.json'), JSON.stringify(values));
  return cwd;
}

test('config-get smoke: reads an existing key from the project config, exit 0', () => {
  const cwd = seedConfig({ repo: 'example/repo', assignee: '@me' });
  const res = run(cwd, ['repo']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, 'example/repo');
});

test('config-get smoke: missing key prints the supplied default, exit 0', () => {
  const cwd = seedConfig({ repo: 'example/repo' });
  const res = run(cwd, ['assignee', '@me']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, '@me');
});

test('config-get smoke: no key argument prints usage and exits 1', () => {
  const cwd = seedConfig({ repo: 'example/repo' });
  const res = run(cwd, []);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage: config-get\.mjs/);
});
