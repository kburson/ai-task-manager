// @story #978
// `memory-resync` CLI surface, driven as a child process (spawnSync), matching
// the coverage-cli.test.mjs pattern for bin/cli.mjs command coverage.
// --dry-run / --list / non-TTY-with-no-flag must all print the classification
// and make zero filesystem changes — verified by asserting the target's
// `.ai-task-manager/memory` dir is never created.

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const CLI = join(repoRoot, 'bin', 'cli.mjs');

function run(argv) {
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8' });
}

function scratch() {
  return mkdtempSync(join(projectScratchDir('test'), 'aitm-resync-cli-'));
}

test('memory-resync --dry-run prints the classification and touches nothing', () => {
  const dir = scratch();
  const res = run(['memory-resync', '--target', dir, '--dry-run']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Memory seed resync/i);
  assert.match(res.stdout, /New:/);
  assert.ok(
    !existsSync(join(dir, '.ai-task-manager', 'memory')),
    'dry-run makes no filesystem changes'
  );
});

test('memory-resync --list behaves the same as --dry-run', () => {
  const dir = scratch();
  const res = run(['memory-resync', '--target', dir, '--list']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Memory seed resync/i);
  assert.ok(!existsSync(join(dir, '.ai-task-manager', 'memory')));
});

test('memory-resync with no flag on a non-TTY child process degrades to the same summary', () => {
  const dir = scratch();
  const res = run(['memory-resync', '--target', dir]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Memory seed resync/i);
  assert.match(res.stdout, /New:/);
  assert.ok(!existsSync(join(dir, '.ai-task-manager', 'memory')));
});
