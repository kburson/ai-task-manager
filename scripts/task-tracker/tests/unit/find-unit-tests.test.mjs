// @story #448
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

import { unitTestPath, findUnitTests } from '../../find-unit-tests.mjs';

const UNIT_TEST_PREFIX = 'scripts/task-tracker/tests/unit';

// ---------------------------------------------------------------------------
// unitTestPath — pure mapping, no I/O
// ---------------------------------------------------------------------------

describe('unitTestPath', () => {
  it('maps a lib source file to its unit test path', () => {
    assert.equal(
      unitTestPath('scripts/task-tracker/lib/body-invariants.mjs'),
      `${UNIT_TEST_PREFIX}/body-invariants.test.mjs`
    );
  });

  it('maps a root-level source file', () => {
    assert.equal(
      unitTestPath('scripts/task-tracker/verify-develop.mjs'),
      `${UNIT_TEST_PREFIX}/verify-develop.test.mjs`
    );
  });

  it('maps a verb source file', () => {
    assert.equal(
      unitTestPath('scripts/task-tracker/verbs/review.mjs'),
      `${UNIT_TEST_PREFIX}/review.test.mjs`
    );
  });

  it('returns null for a test file (no self-discovery)', () => {
    assert.equal(unitTestPath('scripts/task-tracker/tests/unit/foo.test.mjs'), null);
  });

  it('returns null for any path ending in .test.mjs', () => {
    assert.equal(unitTestPath('some/other/bar.test.mjs'), null);
  });

  it('two source files in different dirs with the same basename map to the same test', () => {
    const a = unitTestPath('scripts/task-tracker/lib/foo.mjs');
    const b = unitTestPath('scripts/task-tracker/verbs/foo.mjs');
    assert.equal(a, b);
    assert.equal(a, `${UNIT_TEST_PREFIX}/foo.test.mjs`);
  });
});

// ---------------------------------------------------------------------------
// findUnitTests — filesystem-checked, uses a controlled temp tree
// ---------------------------------------------------------------------------

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-fut-'));
mkdirSync(path.join(tmp, UNIT_TEST_PREFIX), { recursive: true });

writeFileSync(path.join(tmp, `${UNIT_TEST_PREFIX}/body-invariants.test.mjs`), '');
writeFileSync(path.join(tmp, `${UNIT_TEST_PREFIX}/verify-develop.test.mjs`), '');

after(() => rmSync(tmp, { recursive: true, force: true }));

describe('findUnitTests', () => {
  it('returns repo-root-relative paths for source files whose unit test exists', () => {
    const result = findUnitTests(['scripts/task-tracker/lib/body-invariants.mjs'], {
      projectRoot: tmp,
    });
    assert.deepEqual(result, [`${UNIT_TEST_PREFIX}/body-invariants.test.mjs`]);
  });

  it('silently skips source files whose unit test does not exist', () => {
    const result = findUnitTests(['scripts/task-tracker/lib/nonexistent-module.mjs'], {
      projectRoot: tmp,
    });
    assert.deepEqual(result, []);
  });

  it('handles mixed present/absent cases', () => {
    const result = findUnitTests(
      [
        'scripts/task-tracker/lib/body-invariants.mjs',
        'scripts/task-tracker/lib/nonexistent.mjs',
        'scripts/task-tracker/verify-develop.mjs',
      ],
      { projectRoot: tmp }
    );
    assert.deepEqual(result, [
      `${UNIT_TEST_PREFIX}/body-invariants.test.mjs`,
      `${UNIT_TEST_PREFIX}/verify-develop.test.mjs`,
    ]);
  });

  it('ignores test files in the input list', () => {
    const result = findUnitTests(['scripts/task-tracker/tests/unit/body-invariants.test.mjs'], {
      projectRoot: tmp,
    });
    assert.deepEqual(result, []);
  });

  it('deduplicates when two source files map to the same test', () => {
    writeFileSync(path.join(tmp, `${UNIT_TEST_PREFIX}/foo.test.mjs`), '');
    const result = findUnitTests(
      ['scripts/task-tracker/lib/foo.mjs', 'scripts/task-tracker/verbs/foo.mjs'],
      { projectRoot: tmp }
    );
    assert.deepEqual(result, [`${UNIT_TEST_PREFIX}/foo.test.mjs`]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(findUnitTests([], { projectRoot: tmp }), []);
  });
});

// ---------------------------------------------------------------------------
// Merge behavior (mirrors verify-develop.mjs step 3b)
// ---------------------------------------------------------------------------

describe('merge + dedup with direct test files', () => {
  it('direct test already in diff — discovered duplicate is suppressed', () => {
    const direct = [`${UNIT_TEST_PREFIX}/verify-develop.test.mjs`];
    const discovered = findUnitTests(['scripts/task-tracker/verify-develop.mjs'], {
      projectRoot: tmp,
    });
    const merged = [...new Set([...direct, ...discovered])];
    assert.deepEqual(merged, [`${UNIT_TEST_PREFIX}/verify-develop.test.mjs`]);
  });

  it('discovered test not in direct diff — appended after direct changes', () => {
    const direct = [`${UNIT_TEST_PREFIX}/verify-develop.test.mjs`];
    const discovered = findUnitTests(['scripts/task-tracker/lib/body-invariants.mjs'], {
      projectRoot: tmp,
    });
    const merged = [...new Set([...direct, ...discovered])];
    assert.deepEqual(merged, [
      `${UNIT_TEST_PREFIX}/verify-develop.test.mjs`,
      `${UNIT_TEST_PREFIX}/body-invariants.test.mjs`,
    ]);
  });
});
