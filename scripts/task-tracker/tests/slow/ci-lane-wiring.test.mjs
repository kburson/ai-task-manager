#!/usr/bin/env node
// @story #438
// #438 AC6 — CI lane wiring.
//
// The five sibling AC suites only protect against regression if they actually
// execute in CI. scripts/run-tests.mjs discovers slow-lane tests by
// `readdirSync(slowDir).filter(f => f.endsWith('.test.mjs'))`, and `npm run
// test:slow` (`--lane slow`) runs that set. This test replicates that exact
// discovery contract and asserts all six #438 files are picked up.
//
// #864 — `test:all` is retired. The suite is runnable only as bounded sections
// (`test:unit`, `test:integration`, `test:slow`); `--lane all` survives ONLY as
// the internal coverage/divergence union reached through `test:coverage`, never a
// `test:all` script. This suite pins that package.json shape so the monolith
// cannot be re-introduced.

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

test('#864: the suite is runnable only in bounded sections — no test:all script', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['test:all'],
    undefined,
    'test:all must NOT exist — a single unbounded run breaches the 10-min ceiling'
  );
  assert.match(pkg.scripts['test:unit'], /--lane unit/, 'test:unit must invoke the unit section');
  assert.match(
    pkg.scripts['test:integration'],
    /--lane integration/,
    'test:integration must invoke the integration section'
  );
  assert.match(pkg.scripts['test:slow'], /--lane slow/, 'test:slow must invoke the slow lane');
});

test('#864: --lane all survives ONLY as the internal coverage union', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  // The union lane is still reachable — the divergence guard and c8 coverage need
  // it — but only through test:coverage, never a bare test:all run-script.
  assert.match(
    pkg.scripts['test:coverage'],
    /--lane all/,
    'test:coverage keeps the internal all-lane union (one c8 process over every file)'
  );
  const allLaneScripts = Object.entries(pkg.scripts)
    .filter(([, cmd]) => /--lane all\b/.test(cmd))
    .map(([name]) => name);
  assert.deepEqual(
    allLaneScripts.sort(),
    ['test:coverage'],
    'test:coverage must be the ONLY script invoking --lane all'
  );
});
