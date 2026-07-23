// @story #608
// Smoke leaf for `scripts/gh/verify-priority-p3.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split this #404 drift checker is covered by a clean
// offline smoke rather than a >=80% coverage target. Its exit-0 path requires a
// live GitHub Project Priority field whose P3 option id matches the configured
// `priorityOptionP3`, so a coverage test is impractical. The config-resolution
// guards, however, run fully offline: the script reads
// `.ai-task-manager/task-tracker.json` relative to cwd and exits 1 (with a
// diagnostic) when the file is missing or carries no `priorityOptionP3`, before
// the live GraphQL query. The smoke drives both guards in isolated temp dirs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempOutsideRepo } from '../../../lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(new URL('../../../../gh/verify-priority-p3.mjs', import.meta.url));

function runIn(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

test('verify-priority-p3 smoke: missing config → exits 1 with cannot-read guard', () => {
  const cwd = mkdtempOutsideRepo('verify-priority-p3-');
  const res = runIn(cwd);
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stderr, /verify-priority-p3: cannot read .*task-tracker\.json/);
});

test('verify-priority-p3 smoke: config without priorityOptionP3 → exits 1 before any network call', () => {
  const cwd = mkdtempOutsideRepo('verify-priority-p3-');
  mkdirSync(path.join(cwd, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(cwd, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'example/repo' })
  );
  const res = runIn(cwd);
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stderr, /verify-priority-p3: .*has no priorityOptionP3/);
});
