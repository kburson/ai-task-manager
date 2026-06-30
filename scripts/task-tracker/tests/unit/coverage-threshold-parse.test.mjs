#!/usr/bin/env node
// @story #588
// Guards the multi-file parsing branch added to tools/coverage-threshold.mjs so
// a target file's coverage may be measured across several test files (the case
// that arose when verbs/check.mjs grew past the per-file line cap and its tests
// were split into coverage-check / coverage-check-verb / ensure-checked /
// ensure-unchecked). Importing the tool must be side-effect free (the CLI body
// is guarded by an entry-point check), so this import alone proves the guard.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseTestFiles } from '../../tools/coverage-threshold.mjs';

test('parseTestFiles: single file → one-element list (back-compat)', () => {
  assert.deepEqual(parseTestFiles('a/b/c.test.mjs'), ['a/b/c.test.mjs']);
});

test('parseTestFiles: comma list → every file, trimmed', () => {
  assert.deepEqual(parseTestFiles('one.test.mjs, two.test.mjs ,three.test.mjs'), [
    'one.test.mjs',
    'two.test.mjs',
    'three.test.mjs',
  ]);
});

test('parseTestFiles: empty / blank entries are dropped', () => {
  assert.deepEqual(parseTestFiles(''), []);
  assert.deepEqual(parseTestFiles('  '), []);
  assert.deepEqual(parseTestFiles('a.test.mjs,,, ,b.test.mjs'), ['a.test.mjs', 'b.test.mjs']);
});

test('parseTestFiles: nullish arg → empty list (no throw)', () => {
  assert.deepEqual(parseTestFiles(undefined), []);
  assert.deepEqual(parseTestFiles(null), []);
});

console.log('coverage-threshold-parse.test.mjs: defined');
