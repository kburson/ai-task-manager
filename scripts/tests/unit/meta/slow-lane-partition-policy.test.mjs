// @story #1307

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { partitionTestEntries } from '../../../run-tests-schedule.mjs';
import { laneFiles } from '../../../run-tests-lanes.mjs';
import {
  SLOW_PARALLEL_SAFE_MARKER_RE,
  slowTestSchedulingClass,
  TEST_SCHEDULING_CLASSES,
} from '../../../task-tracker/lib/test-parallel-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const AUDITED_PARALLEL_SLOW_FILES = Object.freeze([
  'scripts/tests/slow/articles/publish-articles-e2e.test.mjs',
  'scripts/tests/slow/review/co-review-boundaries.test.mjs',
  'scripts/tests/slow/task-tracker/lib/agentic-help-runtime.test.mjs',
]);

const STATE_SENSITIVE_SLOW_FILES = Object.freeze([
  'scripts/tests/slow/task-tracker/core/fleet-registry-concurrent.test.mjs',
  'scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs',
  'scripts/tests/slow/task-tracker/verbs/promote-verb.test.mjs',
]);

test('slow concurrency is an explicit source-local opt-in that fails closed', () => {
  assert.ok(SLOW_PARALLEL_SAFE_MARKER_RE instanceof RegExp);
  assert.equal(
    slowTestSchedulingClass(
      '/x/marked.test.mjs',
      () => '// @slow-parallel-safe (isolated temporary repository)'
    ),
    TEST_SCHEDULING_CLASSES.SLOW_PARALLEL
  );
  assert.equal(
    slowTestSchedulingClass('/x/unmarked.test.mjs', () => "import test from 'node:test';"),
    TEST_SCHEDULING_CLASSES.SERIAL
  );
  assert.equal(
    slowTestSchedulingClass('/x/blank-rationale.test.mjs', () => '// @slow-parallel-safe (   )'),
    TEST_SCHEDULING_CLASSES.SERIAL
  );
  assert.equal(
    slowTestSchedulingClass(
      '/x/conflict.test.mjs',
      () => '// @slow-parallel-safe (isolated)\n// @parallel-unsafe (shared state)'
    ),
    TEST_SCHEDULING_CLASSES.SERIAL
  );
  assert.equal(
    slowTestSchedulingClass('/x/unreadable.test.mjs', () => {
      throw new Error('unreadable');
    }),
    TEST_SCHEDULING_CLASSES.SERIAL
  );
});

test('only marked slow entries enter the bounded slow phase', () => {
  const entries = [
    { label: 'scripts/tests/slow/a.test.mjs', class: 'slow-parallel' },
    { label: 'scripts/tests/slow/b.test.mjs', class: 'serial' },
    { label: 'scripts/tests/integration/c.test.mjs', class: 'slow-parallel' },
    { label: 'scripts/tests/unit/d.test.mjs', class: 'pooled' },
  ];
  const result = partitionTestEntries(entries, {
    laneOfEntry: (entry) => entry.label.split('/')[2],
    classify: (entry) => entry.class,
    classifySlow: (entry) => entry.class,
  });

  assert.deepEqual(
    result.slowParallelEntries.map((entry) => entry.label),
    [entries[0].label]
  );
  assert.deepEqual(
    result.pooledEntries.map((entry) => entry.label),
    [entries[3].label]
  );
  assert.deepEqual(
    result.serialEntries.map((entry) => entry.label),
    [entries[1].label, entries[2].label]
  );
});

test('the real slow corpus opts in only the audited isolated fixtures', () => {
  const markedFiles = laneFiles('slow').filter((relative) =>
    SLOW_PARALLEL_SAFE_MARKER_RE.test(readFileSync(path.join(ROOT, relative), 'utf8'))
  );
  assert.deepEqual(markedFiles, [...AUDITED_PARALLEL_SLOW_FILES].sort());

  for (const relative of AUDITED_PARALLEL_SLOW_FILES) {
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(source, SLOW_PARALLEL_SAFE_MARKER_RE, `${relative} must carry the opt-in`);
    assert.equal(
      slowTestSchedulingClass(path.join(ROOT, relative)),
      TEST_SCHEDULING_CLASSES.SLOW_PARALLEL
    );
  }

  for (const relative of STATE_SENSITIVE_SLOW_FILES) {
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(source, SLOW_PARALLEL_SAFE_MARKER_RE, `${relative} must stay serial`);
    assert.equal(
      slowTestSchedulingClass(path.join(ROOT, relative)),
      TEST_SCHEDULING_CLASSES.SERIAL
    );
  }
});
