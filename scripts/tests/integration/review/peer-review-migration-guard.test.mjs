// @story #1592
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { selectAffectedTests } from '../../../task-tracker/lib/test-impact-selector.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const archiveManifest = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'scripts/tests/fixtures/legacy-review-archive-sha256.json'),
    'utf8'
  )
);

test('the completed migration leaves every pre-migration archive byte-identical', () => {
  assert.equal(archiveManifest.schema, 'aitm.legacy-review-archive-digests/v1');
  assert.equal(archiveManifest.sourceCommit, '0988881f5796d19c270e4121a851143bb5046a6f');
  assert.equal(archiveManifest.files.length, 137);
  for (const entry of archiveManifest.files) {
    const bytes = readFileSync(path.join(repoRoot, entry.path));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, entry.sha256, entry.path);
  }
});

test('test-impact authority selects occupancy and extraction coverage', () => {
  for (const changedPath of ['scripts/task-tracker/lib/occupancy.mjs']) {
    const selected = selectAffectedTests({ projectDir: repoRoot, changedPaths: [changedPath] });
    for (const expected of [
      'scripts/tests/unit/task-tracker/lib/occupancy.test.mjs',
      'scripts/tests/integration/review/peer-review-migration-guard.test.mjs',
      'scripts/tests/integration/review/peer-review-decommission.test.mjs',
    ]) {
      assert.ok(selected.tests.includes(expected), `${changedPath} -> ${expected}`);
    }
  }
});
