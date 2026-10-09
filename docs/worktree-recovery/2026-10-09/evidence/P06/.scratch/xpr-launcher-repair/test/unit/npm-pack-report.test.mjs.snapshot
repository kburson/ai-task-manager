import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseNpmPackOutput } from '../helpers/npm-command.mjs';

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/npm-pack-report'
);
const options = { expectedPackageName: 'ai-peer-review' };

function fixture(name) {
  return readFileSync(path.join(fixtures, name), 'utf8');
}

test('accepts the observed npm 11 single-package array report', () => {
  const report = parseNpmPackOutput(fixture('npm-11-single.json'), options);
  assert.equal(report.name, 'ai-peer-review');
  assert.equal(report.filename, 'ai-peer-review-0.2.2.tgz');
  assert.deepEqual(report.files, [{ path: 'package.json' }]);
});

test('accepts the observed npm 12 package-keyed object report', () => {
  const report = parseNpmPackOutput(fixture('npm-12-single.json'), options);
  assert.equal(report.name, 'ai-peer-review');
  assert.equal(report.filename, 'ai-peer-review-0.2.2.tgz');
  assert.deepEqual(report.files, [{ path: 'package.json' }]);
});

test('requires the caller to bind the expected package identity', () => {
  assert.throws(
    () => parseNpmPackOutput(fixture('npm-11-single.json')),
    /expectedPackageName must be a non-empty string/
  );
});

test('rejects malformed npm pack JSON with a bounded error', () => {
  assert.throws(
    () => parseNpmPackOutput(fixture('malformed.txt'), options),
    /Invalid npm pack JSON/
  );
});

test('rejects zero and multiple npm pack reports', () => {
  assert.throws(
    () => parseNpmPackOutput(fixture('empty.json'), options),
    /Expected exactly one npm pack report, received 0/
  );
  assert.throws(
    () => parseNpmPackOutput(fixture('multiple.json'), options),
    /Expected exactly one npm pack report, received 2/
  );
});

test('rejects unsupported outer JSON values', () => {
  for (const value of ['null', '"ai-peer-review"', '42']) {
    assert.throws(
      () => parseNpmPackOutput(value, options),
      /Expected npm pack JSON to be an array or package-keyed object/
    );
  }
});

test('rejects an unexpected npm 12 package key', () => {
  assert.throws(
    () => parseNpmPackOutput(fixture('unexpected-name.json'), options),
    /Expected npm pack report for ai-peer-review, received other-package/
  );
});

test('rejects an inner report for a different package', () => {
  const output = JSON.stringify([
    {
      name: 'other-package',
      filename: 'other-package-1.0.0.tgz',
      files: [{ path: 'package.json' }],
    },
  ]);
  assert.throws(
    () => parseNpmPackOutput(output, options),
    /Expected packed package name ai-peer-review, received other-package/
  );
});

test('rejects a report without a files array', () => {
  assert.throws(
    () => parseNpmPackOutput(fixture('missing-files.json'), options),
    /npm pack report files must be an array/
  );
});

test('requires filename only for consumers that use it', () => {
  const report = parseNpmPackOutput(fixture('missing-filename.json'), options);
  assert.equal(report.filename, undefined);
  assert.throws(
    () =>
      parseNpmPackOutput(fixture('missing-filename.json'), {
        ...options,
        requireFilename: true,
      }),
    /npm pack report filename must be a non-empty string/
  );
});
