// @story #872
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverTestFiles,
  onDiskTestFileCount,
  divergence,
  DEFAULT_EXCLUDES,
} from '../../lib/discover-test-files.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// tests/unit → repo root is four up (unit → tests → task-tracker → scripts → root).
const PROJECT_ROOT = path.resolve(__dir, '../../../..');

// Independent oracle: git's view of the working tree, decoupled from the fs
// walk under test. `--cached --others --exclude-standard` = tracked + untracked
// (non-ignored), so a just-authored, not-yet-committed test file appears here
// exactly as it appears to the fs walk — the two agree in both pre- and
// post-commit states.
function gitGroundTruth() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'scripts'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' }
  );
  return [...new Set(out.split('\n').filter((line) => line.endsWith('.test.mjs')))].sort();
}

test('discoverTestFiles equals the git ground truth exactly', () => {
  const discovered = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const truth = gitGroundTruth();
  assert.deepEqual(
    discovered,
    truth,
    `fs walk diverged from git-known *.test.mjs (walk=${discovered.length}, git=${truth.length})`
  );
});

test('exported API surface is present and stable', () => {
  assert.equal(typeof discoverTestFiles, 'function');
  assert.equal(typeof onDiskTestFileCount, 'function');
  assert.equal(typeof divergence, 'function');
  assert.ok(Array.isArray(DEFAULT_EXCLUDES) && DEFAULT_EXCLUDES.includes('node_modules'));

  const count = onDiskTestFileCount({ projectRoot: PROJECT_ROOT });
  assert.ok(Number.isInteger(count) && count > 0, 'onDiskTestFileCount is a positive integer');
  assert.equal(
    count,
    discoverTestFiles({ projectRoot: PROJECT_ROOT }).length,
    'counter agrees with the discovered set length'
  );
});

test('discoverTestFiles returns sorted, repo-relative POSIX paths', () => {
  const files = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  assert.ok(files.length > 0);
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, 'output is sorted');
  for (const f of files) {
    assert.ok(f.startsWith('scripts/'), `repo-relative under scripts/: ${f}`);
    assert.ok(!f.includes('\\'), `POSIX separators only: ${f}`);
    assert.ok(!f.includes('node_modules/'), `excludes node_modules: ${f}`);
  }
});

test('divergence reports a withheld co-located test as missing', () => {
  const all = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const withheld = all[0];
  const claimed = all.slice(1); // drop one on-disk file from the "discovered" set
  const { missing, extra } = divergence({ discovered: claimed, projectRoot: PROJECT_ROOT });
  assert.deepEqual(missing, [withheld], 'the dropped file is reported missing');
  assert.deepEqual(extra, [], 'no phantom extras');
});

test('divergence flags a claimed file that is not on disk as extra', () => {
  const all = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const phantom = 'scripts/task-tracker/tests/unit/__does-not-exist__.test.mjs';
  const { missing, extra } = divergence({
    discovered: [...all, phantom],
    projectRoot: PROJECT_ROOT,
  });
  assert.deepEqual(missing, [], 'nothing missing when every real file is present');
  assert.deepEqual(extra, [phantom], 'the phantom file is reported extra');
});

test('divergence is empty when the discovered set is the ground truth', () => {
  const all = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const { missing, extra } = divergence({ discovered: all, projectRoot: PROJECT_ROOT });
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
});

test('divergence throws on a non-array discovered set', () => {
  assert.throws(() => divergence({ discovered: null, projectRoot: PROJECT_ROOT }), TypeError);
});
