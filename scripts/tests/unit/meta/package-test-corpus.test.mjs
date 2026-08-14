// @story #876
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from '../../../task-tracker/lib/discover-test-files.mjs';
import { parseCanonicalTestPath } from '../../../task-tracker/lib/test-lanes.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const manifestPath = path.join(PROJECT_ROOT, 'scripts/tests/fixtures/test-corpus-pre-move.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const TASK3_BASE_COMMIT = 'a48aa89be065b015c817d08cbdae71c92e8f99ed';
const TASK3_MIGRATION_COMMIT = '859996db6728beabef821ad7e724c584bfcef31b';
const EXPECTED_POST_SNAPSHOT_TESTS = [
  'scripts/tests/unit/meta/audit-story-tags.test.mjs',
  'scripts/tests/unit/meta/package-test-corpus.test.mjs',
  'scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs',
];

function npmPackFiles() {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const packages = JSON.parse(result.stdout);
  assert.equal(packages.length, 1, 'npm pack describes exactly one package');
  return packages[0].files.map(({ path: relPath }) => `package/${relPath}`);
}

function readHistoricalBlobsBatch(sourceCommit, entries) {
  const requests = entries.map(({ oldPath }) => `${sourceCommit}:${oldPath}`);
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: PROJECT_ROOT,
    input: `${requests.join('\n')}\n`,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));

  const blobs = new Map();
  let offset = 0;
  for (const [index, entry] of entries.entries()) {
    const headerEnd = result.stdout.indexOf(0x0a, offset);
    assert.ok(headerEnd >= 0, `${entry.oldPath} has a cat-file header`);
    const header = result.stdout.subarray(offset, headerEnd).toString('utf8');
    const match = /^[a-f0-9]+ blob (\d+)$/.exec(header);
    assert.ok(match, `${entry.oldPath} resolves to a blob: ${header}`);
    const size = Number(match[1]);
    const start = headerEnd + 1;
    const end = start + size;
    assert.ok(end < result.stdout.length, `${entry.oldPath} blob is complete`);
    blobs.set(entry.oldPath, result.stdout.subarray(start, end));
    assert.equal(result.stdout[end], 0x0a, `${entry.oldPath} blob has a batch separator`);
    offset = end + 1;
    assert.equal(blobs.size, index + 1);
  }
  assert.equal(offset, result.stdout.length, 'cat-file batch output is fully consumed');
  return blobs;
}

function readTask3MigrationRenames({ baseCommit, migrationCommit }) {
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '--find-renames=50%', `${baseCommit}..${migrationCommit}`],
    { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const expectedOldPaths = new Set(manifest.tests.map(({ oldPath }) => oldPath));
  const renames = new Map();
  for (const line of output.split('\n').filter(Boolean)) {
    const [status, oldPath, newPath] = line.split('\t');
    if (!/^R\d+$/.test(status) || !expectedOldPaths.has(oldPath)) continue;
    assert.ok(!renames.has(oldPath), `duplicate rename provenance for ${oldPath}`);
    renames.set(oldPath, newPath);
  }
  return renames;
}

test('pre-move corpus manifest freezes the expected schema and lane census', () => {
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.sourceCommit, '4f4d7ccf1c3b2f7375e38e7a227f8bec1ef2fdc3');
  assert.deepEqual(manifest.counts, { all: 915, unit: 837, integration: 27, slow: 51 });
  assert.equal(manifest.tests.length, manifest.counts.all);
});

test('pre-move corpus manifest is a one-to-one, lane-preserving path map', () => {
  const oldPaths = new Set();
  const newPaths = new Set();
  const allowedLanes = new Set(['unit', 'integration', 'slow']);
  const counts = { unit: 0, integration: 0, slow: 0 };

  for (const entry of manifest.tests) {
    assert.ok(allowedLanes.has(entry.lane), `${entry.oldPath} has an allowed lane`);
    assert.equal(entry.basename, path.posix.basename(entry.oldPath));
    assert.equal(entry.basename, path.posix.basename(entry.newPath));
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!oldPaths.has(entry.oldPath), `duplicate old path: ${entry.oldPath}`);
    assert.ok(!newPaths.has(entry.newPath), `duplicate new path: ${entry.newPath}`);
    oldPaths.add(entry.oldPath);
    newPaths.add(entry.newPath);
    counts[entry.lane] += 1;
  }

  assert.equal(oldPaths.size, manifest.counts.all);
  assert.equal(newPaths.size, manifest.counts.all);
  assert.deepEqual(counts, {
    unit: manifest.counts.unit,
    integration: manifest.counts.integration,
    slow: manifest.counts.slow,
  });
});

test('pre-move corpus manifest destinations and hashes retain their immutable source', () => {
  const historicalSources = readHistoricalBlobsBatch(manifest.sourceCommit, manifest.tests);
  assert.equal(historicalSources.size, manifest.counts.all);
  for (const entry of manifest.tests) {
    const parsed = parseCanonicalTestPath(entry.newPath);
    assert.ok(parsed, `${entry.newPath} is canonical`);
    assert.equal(parsed.lane, entry.lane, `${entry.newPath} retains its lane`);

    const source = historicalSources.get(entry.oldPath);
    const digest = createHash('sha256').update(source).digest('hex');
    assert.equal(digest, entry.sha256, `${entry.oldPath} retains its source digest`);
  }
});

test('the immutable Task 3 migration commit records every frozen path pair as a Git rename', () => {
  const renames = readTask3MigrationRenames({
    baseCommit: TASK3_BASE_COMMIT,
    migrationCommit: TASK3_MIGRATION_COMMIT,
  });
  assert.equal(renames.size, manifest.counts.all);
  for (const entry of manifest.tests) {
    assert.equal(renames.get(entry.oldPath), entry.newPath, `${entry.oldPath} rename provenance`);
  }
});

test('live discovery realizes the migration manifest exactly once and only in canonical lanes', () => {
  const discovered = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const live = new Set(discovered);
  assert.equal(live.size, discovered.length, 'live discovery has no duplicate path');

  const manifestDestinations = new Set(manifest.tests.map(({ newPath }) => newPath));
  for (const entry of manifest.tests) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, entry.newPath)), `${entry.newPath} exists`);
    assert.ok(live.has(entry.newPath), `${entry.newPath} is discovered`);
    if (entry.oldPath !== entry.newPath) {
      assert.ok(!existsSync(path.join(PROJECT_ROOT, entry.oldPath)), `${entry.oldPath} is absent`);
      assert.ok(!live.has(entry.oldPath), `${entry.oldPath} is not discovered`);
    }
    const parsed = parseCanonicalTestPath(entry.newPath);
    assert.ok(parsed, `${entry.newPath} is canonical`);
    assert.equal(parsed.lane, entry.lane, `${entry.newPath} retains ${entry.lane}`);
    assert.equal(path.posix.basename(entry.newPath), entry.basename);
  }

  const storyOwned = discovered.filter((rel) => !manifestDestinations.has(rel));
  assert.equal(storyOwned.length, 3, 'exactly three story-owned tests follow the snapshot');
  assert.deepEqual(storyOwned, EXPECTED_POST_SNAPSHOT_TESTS);
  for (const rel of storyOwned) {
    assert.ok(parseCanonicalTestPath(rel), `${rel} is a canonical story-owned test`);
  }
});

test('package files explicitly exclude the canonical test support root', () => {
  const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.ok(packageJson.files.includes('!scripts/tests/**'));
  assert.ok(!packageJson.files.includes('!scripts/**/tests/**'));
  assert.ok(packageJson.files.includes('!**/*.test.mjs'), 'test suffix remains defense in depth');
});

test('npm pack excludes the test corpus while retaining required runtime files and assets', () => {
  const packed = new Set(npmPackFiles());
  const leakedTests = [...packed].filter((relPath) => relPath.startsWith('package/scripts/tests/'));
  assert.deepEqual(leakedTests, []);

  for (const required of [
    'package/scripts/gh/create-issue.mjs',
    'package/scripts/task-tracker/task-tracker.mjs',
    'package/config/activity-policy.default.json',
    'package/config/project-fields.default.json',
    'package/scripts/reports/regional-rates.json',
  ]) {
    assert.ok(packed.has(required), `npm pack retains required runtime asset: ${required}`);
  }
});
