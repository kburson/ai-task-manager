// @story #863
/**
 * Classifier proof for #863's pool-safety cut. Pure and in-process by design —
 * it uses an injected reader, never the subprocess module — so it is itself pool-eligible.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as parallelSafety from '../../../../task-tracker/lib/test-parallel-safety.mjs';

import {
  spawnsSubprocess,
  isParallelSafe,
  testSchedulingClass,
  SUBPROCESS_RE,
  PARALLEL_UNSAFE_MARKER_RE,
} from '../../../../task-tracker/lib/test-parallel-safety.mjs';

const CHILD_PROCESS_TOKEN = ['child', 'process'].join('_');
const NODE_CHILD_PROCESS_TOKEN = `node:${CHILD_PROCESS_TOKEN}`;

test('spawnsSubprocess flags every subprocess-module reference shape', () => {
  assert.equal(spawnsSubprocess(`import { spawn } from '${NODE_CHILD_PROCESS_TOKEN}';`), true);
  assert.equal(spawnsSubprocess(`import {execFileSync} from "${NODE_CHILD_PROCESS_TOKEN}"`), true);
  assert.equal(spawnsSubprocess(`const cp = require('${NODE_CHILD_PROCESS_TOKEN}');`), true);
  assert.equal(spawnsSubprocess(`${CHILD_PROCESS_TOKEN}.execSync("git status")`), true);
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

test('isParallelSafe: subprocess-spawning file is not pure-pool eligible', () => {
  const read = () => `import { execFileSync } from '${NODE_CHILD_PROCESS_TOKEN}';`;
  assert.equal(isParallelSafe('/x/coverage-close.test.mjs', read), false);
});

test('isParallelSafe: unreadable file defaults to UNSAFE (serial)', () => {
  const read = () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  assert.equal(isParallelSafe('/x/missing.test.mjs', read), false);
});

test('testSchedulingClass distinguishes pooled, subprocess, and serial sources', () => {
  assert.equal(
    testSchedulingClass('/x/pure.test.mjs', () => "import assert from 'node:assert/strict';"),
    'pooled'
  );
  assert.equal(
    testSchedulingClass(
      '/x/subprocess.test.mjs',
      () => `import { execFileSync } from '${NODE_CHILD_PROCESS_TOKEN}';`
    ),
    'subprocess'
  );
  assert.equal(
    testSchedulingClass('/x/marked.test.mjs', () => `// @parallel-unsafe\n${CHILD_PROCESS_TOKEN}.exec()`),
    'serial',
    '@parallel-unsafe must override direct subprocess detection'
  );
  assert.equal(
    testSchedulingClass('/x/unreadable.test.mjs', () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    'serial'
  );
});

test('PARALLEL_UNSAFE_MARKER_RE is exported for reuse', () => {
  assert.ok(PARALLEL_UNSAFE_MARKER_RE instanceof RegExp);
});

test('isParallelSafe: @parallel-unsafe-marked file runs serial with no direct subprocess reference (#974)', () => {
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

test('isParallelSafe: unmarked SUBPROCESS_RE-matching file stays out of the pure pool', () => {
  const read = () => `import { execFileSync } from '${NODE_CHILD_PROCESS_TOKEN}';`;
  assert.equal(isParallelSafe('/x/still-subprocess.test.mjs', read), false);
});

test('testSchedulingClass ignores an unsafe marker inside a string literal', () => {
  assert.equal(
    testSchedulingClass(
      '/x/literal-unsafe-marker.test.mjs',
      () => "const marker = '@parallel-unsafe (string literal only)';"
    ),
    'pooled'
  );
});

test('testSchedulingClass keeps a real unsafe marker serial', () => {
  assert.equal(
    testSchedulingClass('/x/comment-unsafe-marker.test.mjs', () => '// @parallel-unsafe (shared state)'),
    'serial'
  );
});

test('testSchedulingClass sends a rationale-bearing transitive marker to the subprocess phase', () => {
  assert.equal(
    testSchedulingClass(
      '/x/transitive-subprocess.test.mjs',
      () => '// @parallel-subprocess (spawns through an imported helper)'
    ),
    'subprocess'
  );
});

test('testSchedulingClass keeps a blank transitive-subprocess rationale serial', () => {
  assert.equal(
    testSchedulingClass('/x/blank-transitive-rationale.test.mjs', () => '// @parallel-subprocess (   )'),
    'serial'
  );
});

test('testSchedulingClass gives an unsafe marker precedence over a transitive subprocess marker', () => {
  assert.equal(
    testSchedulingClass(
      '/x/conflicting-markers.test.mjs',
      () =>
        [
          '// @parallel-subprocess (spawns through an imported helper)',
          '// @parallel-unsafe (shared state)',
        ].join('\n')
    ),
    'serial'
  );
});

test('testSchedulingClass fails closed when source parsing fails', () => {
  assert.equal(testSchedulingClass('/x/unparseable.test.mjs', () => 'const =;'), 'serial');
});

test('PARALLEL_SUBPROCESS_MARKER_RE requires a non-blank parenthesized rationale', () => {
  assert.ok(parallelSafety.PARALLEL_SUBPROCESS_MARKER_RE instanceof RegExp);
  assert.match(
    '@parallel-subprocess (spawns through an imported helper)',
    parallelSafety.PARALLEL_SUBPROCESS_MARKER_RE
  );
  assert.doesNotMatch(
    '@parallel-subprocess (   )',
    parallelSafety.PARALLEL_SUBPROCESS_MARKER_RE
  );
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
