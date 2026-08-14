// @story #875
//
// AC4 single-source guard: after the C4 consumer migration, no independent
// test-file walker survives under `scripts/` outside the canonical module
// (`lib/discover-test-files.mjs`). This test is the permanent proof that the
// 614/618/630/642 divergence cannot recur — re-introducing a private walk in any
// consumer flips it red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverFiles,
  discoverTestFiles,
} from '../../../../task-tracker/lib/discover-test-files.mjs';
import {
  unitTestPath,
  coLocatedTestPath,
  findUnitTests,
} from '../../../../task-tracker/find-unit-tests.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// tests/unit → repo root is four up.
const PROJECT_ROOT = path.resolve(__dir, '../../../..');
const opts = { projectRoot: PROJECT_ROOT };

const CANONICAL = 'scripts/task-tracker/lib/discover-test-files.mjs';

function read(rel) {
  return readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');
}

// A shell `find … -name '*.mjs'` / '*.test.mjs' scan — the clearest independent
// walker signal.
const FIND_SCAN_RE = /\bfind\b[^\n]*-name\s+['"]\*\.(?:test\.)?mjs['"]/;
// A readdir-based recursion that filters test files (readdirSync anywhere in the
// file AND a `.test.mjs` basename filter) — the other walker shape.
const READDIR_WALK_RE = /\breaddirSync\s*\(/;
const TEST_FILTER_RE = /\.test\.mjs['"]|TEST_FILE_RE/;

// --- AC1/AC2/AC3 — the migrated consumers are on canonical discovery ---------

const CONSUMERS = [
  {
    rel: 'scripts/tests/tools/audit-story-tags.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
  {
    rel: 'scripts/maintenance/lint-fleet-sandbox-isolation.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
  {
    rel: 'scripts/task-tracker/find-unit-tests.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
  {
    rel: 'scripts/maintenance/lint-no-system-tmp.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
  {
    rel: 'scripts/tests/tools/audit-line-cap.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
  {
    rel: 'scripts/task-tracker/tag-story-ids.mjs',
    importsFrom: /discover-test-files\.mjs/,
  },
];

test('each migrated consumer imports canonical discovery and owns no private walker', () => {
  for (const { rel, importsFrom } of CONSUMERS) {
    const src = read(rel);
    assert.match(src, importsFrom, `${rel} imports from the canonical module`);
    assert.doesNotMatch(src, FIND_SCAN_RE, `${rel} has no shell find-scan`);
    assert.ok(
      !READDIR_WALK_RE.test(src) || !TEST_FILTER_RE.test(src),
      `${rel} has no readdirSync-based test-file walk`
    );
    assert.doesNotMatch(
      src,
      /statSync\s*\([^)]*\)\.isDirectory\s*\(\)/,
      `${rel} has no statSync recursion`
    );
  }
});

// --- AC4 — whole-tree sweep: the canonical module is the SOLE walker ----------

test('AC4: no independent test-file walker exists under scripts/ outside the canonical module', () => {
  // Every source `.mjs` under scripts/, excluding *.test.mjs (test bodies
  // legitimately reference `.test.mjs` strings) and node_modules.
  const sources = discoverFiles({ match: /\.mjs$/, excludes: ['node_modules'], ...opts }).filter(
    (f) => !f.endsWith('.test.mjs')
  );
  assert.ok(sources.length > 100, 'sweep found the source tree');

  const findScanners = sources.filter((f) => FIND_SCAN_RE.test(read(f)));
  assert.deepEqual(findScanners, [], 'no source file shells out to find for test files');

  const readdirWalkers = sources.filter((f) => {
    const src = read(f);
    return READDIR_WALK_RE.test(src) && TEST_FILTER_RE.test(src);
  });
  assert.deepEqual(
    readdirWalkers,
    [CANONICAL],
    'the only readdir-based test-file walker is the canonical module'
  );
});

// --- AC2 — the generalized primitive is a superset that honors excludes -------

test('AC2: discoverFiles(all-.mjs) is a superset of discoverTestFiles and honors fixtures excludes', () => {
  const allMjs = new Set(discoverFiles({ match: /\.mjs$/, excludes: ['node_modules'], ...opts }));
  const tests = discoverTestFiles(opts);
  for (const t of tests) assert.ok(allMjs.has(t), `all-.mjs superset contains test file ${t}`);

  // discoverTestFiles is exactly the `match: TEST_FILE_RE` view over discoverFiles.
  assert.deepEqual(
    discoverTestFiles(opts),
    discoverFiles({ match: /\.test\.mjs$/, ...opts }),
    'discoverTestFiles == discoverFiles(match: /.test.mjs$/)'
  );

  // Fixtures are excluded by default but retained when the caller asks — the
  // lint-fleet path depends on this.
  const withFixtures = discoverFiles({ match: /\.mjs$/, excludes: ['node_modules'], ...opts });
  const defaultExcludes = discoverFiles({ match: /\.mjs$/, ...opts });
  assert.ok(
    withFixtures.length >= defaultExcludes.length,
    'narrowing excludes to node_modules retains at least as many files'
  );
});

// --- AC3 — find-unit-tests uses complete source-relative canonical paths -----

test('AC3: findUnitTests resolves complete source-relative canonical unit tests', () => {
  // Pure mappers.
  assert.equal(unitTestPath('scripts/foo/bar.mjs'), 'scripts/tests/unit/foo/bar.test.mjs');
  assert.equal(coLocatedTestPath('scripts/foo/bar.mjs'), 'scripts/foo/bar.test.mjs');
  assert.equal(unitTestPath('scripts/foo/bar.test.mjs'), null);
  assert.equal(coLocatedTestPath('scripts/foo/bar.test.mjs'), null);

  // Full source-relative identity wins over both a retired co-located path and
  // a same-basename collision.
  const discovered = [
    'scripts/tests/unit/gh/create-issue.test.mjs',
    'scripts/tests/unit/gh/create-issue.test.mjs',
    'scripts/tests/unit/whatever/widget.test.mjs',
    'scripts/tests/unit/elsewhere/widget.test.mjs',
  ];
  const got = findUnitTests(
    ['scripts/gh/create-issue.mjs', 'scripts/whatever/widget.mjs', 'scripts/none/absent.mjs'],
    { discovered, ...opts }
  );
  assert.deepEqual(got, [
    'scripts/tests/unit/gh/create-issue.test.mjs',
    'scripts/tests/unit/whatever/widget.test.mjs',
  ]);

  // Live: the migrated create-issue test is found at its canonical destination.
  const live = findUnitTests(['scripts/gh/create-issue.mjs'], opts);
  assert.deepEqual(live, ['scripts/tests/unit/gh/create-issue.test.mjs']);
});
