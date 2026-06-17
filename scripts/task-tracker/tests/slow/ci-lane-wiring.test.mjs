#!/usr/bin/env node
// @story #438
// #438 AC6 — CI lane wiring.
//
// The five sibling AC suites only protect against regression if they actually
// execute in CI. scripts/run-tests.mjs discovers slow-lane tests by
// `readdirSync(slowDir).filter(f => f.endsWith('.test.mjs'))`, and `--lane all`
// (what `npm run test:all` runs, the DoD verifier) unions the slow set with the
// fast set. This test replicates that exact discovery contract and asserts all
// six #438 files are picked up.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const slowDir = __dir; // this file lives IN the slow lane
const repoRoot = path.resolve(__dir, '..', '..', '..', '..');

const AC_FILES = [
  'lifecycle-traversal-e2e.test.mjs', // AC1
  'config-completeness-invariant.test.mjs', // AC2
  'body-write-roundtrip.test.mjs', // AC3
  'recovery-path-independence.test.mjs', // AC4
  'deadlock-regression.test.mjs', // AC5
  'ci-lane-wiring.test.mjs', // AC6 (this file)
];

test('AC6: all six #438 suites are discovered by the slow-lane glob', () => {
  // Mirror run-tests.mjs's discovery filter exactly.
  const discovered = new Set(
    readdirSync(slowDir)
      .filter((f) => f.endsWith('.test.mjs'))
      .sort()
  );
  for (const f of AC_FILES) {
    assert.ok(discovered.has(f), `${f} must be discovered by the slow-lane readdir filter`);
  }
});

test('AC6: package.json test:all runs the slow lane (--lane all)', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['test:all'], 'test:all script must exist');
  assert.match(
    pkg.scripts['test:all'],
    /--lane all/,
    'test:all must invoke the runner with --lane all (unions fast + slow)'
  );
  assert.match(pkg.scripts['test:slow'], /--lane slow/, 'test:slow must invoke the slow lane');
});
