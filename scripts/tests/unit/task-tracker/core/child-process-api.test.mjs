// @story #22
// Guards the child-process API convention documented in #22 and
// scripts/task-tracker/lib/process-timeouts.mjs:
//   - Production code uses execFileSync (sync) / promisify(execFile) (async).
//   - spawnSync is reserved for scripts/run-tests.mjs.
//
// Implementation: static source scan of the migrated production sites.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)) + '/..', '../../../..');

const MIGRATED_SITES = [
  'scripts/gh/create-issue.mjs',
  'scripts/gh/ensure-wave-parent.mjs',
  'scripts/gh/migrate-project.mjs',
  'scripts/task-tracker/runtime.mjs',
];

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

for (const rel of MIGRATED_SITES) {
  test(`${rel} imports execFileSync, not spawnSync`, () => {
    const src = read(rel);
    // Allow neither bare identifier nor named import of spawnSync.
    assert.equal(
      /\bspawnSync\b/.test(src),
      false,
      `${rel} should not reference spawnSync (use execFileSync per #22)`
    );
    assert.match(src, /\bexecFileSync\b/, `${rel} should import execFileSync (per #22 convention)`);
  });
}

test('scripts/run-tests.mjs is the documented spawnSync carve-out', () => {
  const src = read('scripts/run-tests.mjs');
  assert.match(src, /\bspawnSync\b/, 'run-tests.mjs should still use spawnSync (carve-out)');
  // The carve-out header must explain why.
  const firstLines = src.split('\n').slice(0, 5).join('\n');
  assert.match(
    firstLines,
    /spawnSync/i,
    'run-tests.mjs needs a header comment explaining the spawnSync carve-out'
  );
});

test('process-timeouts.mjs documents the execFileSync convention', () => {
  const src = read('scripts/task-tracker/lib/process-timeouts.mjs');
  assert.match(src, /execFileSync/, 'process-timeouts.mjs should document execFileSync convention');
  assert.match(
    src,
    /run-tests\.mjs/,
    'process-timeouts.mjs should call out the run-tests.mjs carve-out'
  );
});
