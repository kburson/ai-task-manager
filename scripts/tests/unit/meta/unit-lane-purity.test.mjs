// @story #1413
// The unit lane touches no live system.
//
// Under the 2026-08-24 test-architecture direction, live systems are exercised
// in a few CI-only integration tests and mocked everywhere else. This is the
// gate that keeps the unit lane on the right side of that line.
//
// It is not a style preference. A traced unit-lane run measured 1976 `git`
// spawns and ~900s of aggregate `git` time; at that saturation a bare
// `git init -q -b trunk` took 10.5s and whichever test lost the race against the
// 10s GIT_TIMEOUT_MS failed — a different one each run. Removing the systems
// from the lane is what makes it deterministic.
//
// If this test fails, the fix is to move the offending file to
// `scripts/tests/integration/`, not to widen the classifier.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { laneManifest } from '../../../task-tracker/lib/test-lanes.mjs';
import {
  classifySystemReach,
  classifyTransitiveSystemReach,
  isTestSupportModule,
  touchesLiveSystem,
  SYSTEM_REACH_SIGNALS,
} from '../../lib/system-reach.mjs';

// The classifier's own source names every token it searches for, and so does
// this file. Both would otherwise report themselves.
const SELF = 'scripts/tests/unit/meta/unit-lane-purity.test.mjs';
const CLASSIFIER = 'scripts/tests/lib/system-reach.mjs';

test('no unit-lane test touches a live system', () => {
  const deps = { root: process.cwd(), readFileSync, existsSync, path };
  const offenders = [];
  for (const file of laneManifest().unit) {
    if (file === SELF || file === CLASSIFIER) continue;
    // Transitive through test fixtures, not just the file's own source: the
    // co-review suites spawn nothing themselves and inherit it all from
    // `co-review-fixture.mjs`.
    const signals = classifyTransitiveSystemReach(file, deps);
    if (signals.length > 0) offenders.push(`${file} [${signals.join(', ')}]`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these belong in scripts/tests/integration/, not the unit lane:\n  ${offenders.join('\n  ')}`
  );
});

// The gate is only worth anything if the classifier still says no to the things
// it is supposed to catch. Without these, a regression that made
// classifySystemReach return [] for everything would leave the case above green.

test('the classifier catches a git sandbox', () => {
  assert.deepEqual(
    classifySystemReach('const dir = mkdtempProjectIsolated("x-");'),
    ['sandbox']
  );
});

test('the classifier catches a direct git spawn in each spawn form', () => {
  for (const form of [
    "execFileSync('git', ['status'])",
    'execFile("git", ["status"])',
    "spawnSync('git', ['status'])",
    'spawn(`git`, ["status"])',
  ]) {
    assert.deepEqual(classifySystemReach(form), ['git-spawn'], form);
  }
});

test('the classifier catches a product-CLI spawn by name or by execPath', () => {
  assert.deepEqual(classifySystemReach("execFileSync('node', ['scripts/x.mjs'])"), ['cli-spawn']);
  assert.deepEqual(classifySystemReach('spawnSync(process.execPath, [cli])'), ['cli-spawn']);
});

test('the classifier reports every signal a file trips, in stable order', () => {
  const source = [
    'const d = mkdtempProjectIsolated("x-");',
    "execFileSync('git', ['init']);",
    "spawnSync('node', ['scripts/x.mjs']);",
  ].join('\n');
  assert.deepEqual(classifySystemReach(source), ['sandbox', 'git-spawn', 'cli-spawn']);
  assert.deepEqual(classifySystemReach(source), [...SYSTEM_REACH_SIGNALS]);
});

test('an ordinary unit test trips nothing', () => {
  const source = [
    "import { strict as assert } from 'node:assert';",
    "import { parseThing } from '../../lib/thing.mjs';",
    "test('parses', () => assert.equal(parseThing('a'), 'A'));",
  ].join('\n');
  assert.deepEqual(classifySystemReach(source), []);
  assert.equal(touchesLiveSystem(source), false);
});

test('merely mentioning git in prose or data is not a spawn', () => {
  // The signal is the spawn call, not the word. A test that asserts on a git
  // argument vector without running one belongs in the unit lane.
  assert.deepEqual(classifySystemReach("assert.deepEqual(argv, ['git', 'status']);"), []);
  assert.deepEqual(classifySystemReach('// spawns git somewhere else'), []);
});

test('the closure follows test fixtures but stops at product code', () => {
  assert.equal(isTestSupportModule('scripts/tests/fixtures/co-review-fixture.mjs'), true);
  assert.equal(isTestSupportModule('scripts/tests/lib/stub-gh.mjs'), true);
  // A test is not support for another test.
  assert.equal(isTestSupportModule('scripts/tests/unit/meta/unit-lane-purity.test.mjs'), false);
  // Product code is where the walk stops. Following it flags 63% of the lane —
  // that population is the mocking backlog, not a relocation list.
  assert.equal(isTestSupportModule('scripts/task-tracker/verbs/close.mjs'), false);
  assert.equal(isTestSupportModule('scripts/gh/lib/github-projects.mjs'), false);
});
