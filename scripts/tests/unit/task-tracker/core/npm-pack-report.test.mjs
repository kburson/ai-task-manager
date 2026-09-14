// @story #1615
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const FIXTURES = path.join(ROOT, 'scripts/tests/fixtures/npm-pack-report');
const EXPECTED_PACKAGE = '@kburson/ai-task-manager';
const OPTIONS = { expectedPackageName: EXPECTED_PACKAGE };

function fixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

test('normalizes the observed npm 11 single-package array report', () => {
  const report = parseNpmPackReport(fixture('npm-11-single.json'), OPTIONS);

  assert.equal(report.name, EXPECTED_PACKAGE);
  assert.equal(report.filename, 'kburson-ai-task-manager-1.0.0.tgz');
  assert.deepEqual(report.files, [{ path: 'package.json' }]);
});

test('normalizes the observed npm 12 package-keyed report', () => {
  const report = parseNpmPackReport(fixture('npm-12-single.json'), OPTIONS);

  assert.equal(report.name, EXPECTED_PACKAGE);
  assert.equal(report.filename, 'kburson-ai-task-manager-1.0.0.tgz');
  assert.deepEqual(report.files, [{ path: 'package.json' }]);
});

test('requires callers to bind the expected package identity', () => {
  assert.throws(
    () => parseNpmPackReport(fixture('npm-11-single.json')),
    /expectedPackageName must be a non-empty string/
  );
});

test('rejects malformed JSON and unsupported outer values', () => {
  assert.throws(
    () => parseNpmPackReport(fixture('malformed.txt'), OPTIONS),
    /Invalid npm pack JSON/
  );
  for (const value of ['null', '"package"', '42']) {
    assert.throws(
      () => parseNpmPackReport(value, OPTIONS),
      /Expected npm pack JSON to be an array or package-keyed object/
    );
  }
});

test('rejects zero or multiple reports', () => {
  assert.throws(
    () => parseNpmPackReport(fixture('empty.json'), OPTIONS),
    /Expected exactly one npm pack report, received 0/
  );
  assert.throws(
    () => parseNpmPackReport(fixture('multiple.json'), OPTIONS),
    /Expected exactly one npm pack report, received 2/
  );
});

test('rejects an unexpected npm 12 package key or inner report identity', () => {
  assert.throws(
    () => parseNpmPackReport(fixture('unexpected-name.json'), OPTIONS),
    /Expected npm pack report for @kburson\/ai-task-manager, received other-package/
  );
  assert.throws(
    () =>
      parseNpmPackReport(
        JSON.stringify([{ name: 'other-package', filename: 'other.tgz', files: [] }]),
        OPTIONS
      ),
    /Expected packed package name @kburson\/ai-task-manager, received other-package/
  );
});

test('requires a files array and optionally a non-empty filename', () => {
  assert.throws(
    () => parseNpmPackReport(fixture('missing-files.json'), OPTIONS),
    /npm pack report files must be an array/
  );
  const report = parseNpmPackReport(fixture('missing-filename.json'), OPTIONS);
  assert.equal(report.filename, undefined);
  assert.throws(
    () =>
      parseNpmPackReport(fixture('missing-filename.json'), {
        ...OPTIONS,
        requireFilename: true,
      }),
    /npm pack report filename must be a non-empty string/
  );
});

test('all pack consumers import the shared normalizer', () => {
  for (const relativePath of [
    'scripts/tests/unit/task-tracker/core/package-boundary.test.mjs',
    'scripts/tests/unit/task-tracker/core/memory-seed-packaged.test.mjs',
    'scripts/tests/unit/task-tracker/core/scope-pack.test.mjs',
    'scripts/tests/integration/meta/package-test-corpus.test.mjs',
    'scripts/tests/slow/task-tracker/core/packaged-tail-profile-consumer.test.mjs',
  ]) {
    const source = readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.match(source, /import \{ parseNpmPackReport \}/, `${relativePath} must import helper`);
    assert.doesNotMatch(
      source,
      /Object\.values\([^\n]+pack/i,
      `${relativePath} keeps local fallback`
    );
  }
});
