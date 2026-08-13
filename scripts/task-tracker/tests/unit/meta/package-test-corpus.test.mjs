// @story #876
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const manifestPath = path.join(
  PROJECT_ROOT,
  'scripts/task-tracker/tests/fixtures/test-corpus-pre-move.json'
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

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
