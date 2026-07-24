// @story #853
// #853 — package.json and package-lock.json versions disagreed on trunk
// (1.0.0 vs 2.0.0), diverged at commit d0741ff which reverted only
// package.json. Regression guard for AC3: fails if the two files' version
// fields ever diverge again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findVersionParityMismatches } from '../lib/package-lockfile-version-parity.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

test('AC3 — package.json and package-lock.json versions agree', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(findVersionParityMismatches(pkg, lock), []);
});

test('findVersionParityMismatches reports the drift #853 fixed', () => {
  const pkg = { version: '1.0.0' };
  const lock = { version: '2.0.0', packages: { '': { version: '2.0.0' } } };
  const mismatches = findVersionParityMismatches(pkg, lock);
  assert.equal(mismatches.length, 2);
});
