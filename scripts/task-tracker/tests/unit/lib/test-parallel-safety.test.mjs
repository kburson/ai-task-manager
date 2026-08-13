// @story #863
/**
 * Classifier proof for #863's pool-safety cut. Pure and in-process by design —
 * it uses an injected reader, never child_process — so it is itself pool-eligible.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  spawnsSubprocess,
  isParallelSafe,
  SUBPROCESS_RE,
  PARALLEL_UNSAFE_MARKER_RE,
} from '../../../lib/test-parallel-safety.mjs';

test('spawnsSubprocess flags every child_process reference shape', () => {
  assert.equal(spawnsSubprocess("import { spawn } from 'node:child_process';"), true);
  assert.equal(spawnsSubprocess('import {execFileSync} from "node:child_process"'), true);
  assert.equal(spawnsSubprocess("const cp = require('node:child_process');"), true);
  assert.equal(spawnsSubprocess('child_process.execSync("git status")'), true);
});

test('spawnsSubprocess leaves a pure in-process file alone', () => {
  const pure = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { laneOf } from '../../../lib/test-lanes.mjs';",
    'test("classifies", () => assert.equal(laneOf("a/b.test.mjs"), "unit"));',
  ].join('\n');
  assert.equal(spawnsSubprocess(pure), false);
});

test('spawnsSubprocess tolerates nullish input', () => {
  assert.equal(spawnsSubprocess(undefined), false);
  assert.equal(spawnsSubprocess(''), false);
});

test('SUBPROCESS_RE is exported for reuse', () => {
  assert.ok(SUBPROCESS_RE instanceof RegExp);
});

test('isParallelSafe: pure file is pool-eligible', () => {
  const read = () => "import assert from 'node:assert/strict';";
  assert.equal(isParallelSafe('/x/pure.test.mjs', read), true);
});

test('isParallelSafe: subprocess-spawning file runs serial', () => {
  const read = () => "import { execFileSync } from 'node:child_process';";
  assert.equal(isParallelSafe('/x/coverage-close.test.mjs', read), false);
});

test('isParallelSafe: unreadable file defaults to UNSAFE (serial)', () => {
  const read = () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  assert.equal(isParallelSafe('/x/missing.test.mjs', read), false);
});

test('PARALLEL_UNSAFE_MARKER_RE is exported for reuse', () => {
  assert.ok(PARALLEL_UNSAFE_MARKER_RE instanceof RegExp);
});

test('isParallelSafe: @parallel-unsafe-marked file runs serial, even with no child_process reference (#974)', () => {
  const read = () =>
    [
      '// @parallel-unsafe (spawns transitively via an imported helper)',
      "import { test } from 'node:test';",
    ].join('\n');
  assert.equal(isParallelSafe('/x/coverage-reconcile.test.mjs', read), false);
});

test('isParallelSafe: unmarked pure file is still pool-eligible (regression guard)', () => {
  const read = () => "import assert from 'node:assert/strict';";
  assert.equal(isParallelSafe('/x/still-pure.test.mjs', read), true);
});

test('isParallelSafe: unmarked SUBPROCESS_RE-matching file is still serial (regression guard)', () => {
  const read = () => "import { execFileSync } from 'node:child_process';";
  assert.equal(isParallelSafe('/x/still-subprocess.test.mjs', read), false);
});

test('#1014 transitive subprocess guard tests are excluded from the parallel pool', () => {
  const files = [
    'guard-parity-done-stages.test.mjs',
    'guard-parity-mid-stages.test.mjs',
    'guard-parity-plan-develop.test.mjs',
    'guard-parity-review-done.test.mjs',
    'guard-registry-review-exit.test.mjs',
  ];

  for (const file of files) {
    const fullPath = fileURLToPath(new URL(file, import.meta.url));
    assert.equal(isParallelSafe(fullPath), false, `${file} must run serially`);
  }
});

// @story #1139
test('#1139 approval fixtures that share issue 58 are excluded from the parallel pool', () => {
  const files = ['../verbs/approve-core.test.mjs', '../verbs/approve-full-auto-detect.test.mjs'];

  for (const file of files) {
    const fullPath = fileURLToPath(new URL(file, import.meta.url));
    assert.equal(isParallelSafe(fullPath), false, `${file} must run serially`);
  }
});

// @story #1203
test('#1203 timing-comment issue-number regression is excluded from the parallel pool', () => {
  const fullPath = fileURLToPath(
    new URL('../core/gh-timing-comment-issue-number.test.mjs', import.meta.url)
  );

  assert.equal(
    isParallelSafe(fullPath),
    false,
    'the real timing-comment test spawns gh transitively and must run serially'
  );
});

test('#1203 pure source remains eligible for the parallel pool', () => {
  const read = () =>
    [
      '// @story #1203 pure-source control',
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
    ].join('\n');

  assert.equal(isParallelSafe('/x/1203-pure-control.test.mjs', read), true);
});

// @story #1212
test('#1212 ownership aggregate is excluded from the parallel pool', () => {
  const fullPath = fileURLToPath(new URL('exclusive-ownership-policy.test.mjs', import.meta.url));

  assert.equal(
    isParallelSafe(fullPath),
    false,
    'the ownership aggregate imports subprocess-spawning guard tests and must run serially'
  );
});
