// @story #1546
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { selectAffectedTests } from '../../../task-tracker/lib/test-impact-selector.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const occupancyPath = path.join(repoRoot, 'scripts/task-tracker/lib/occupancy.mjs');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function createLegacyFixture(t, rows) {
  const root = mkdtempProjectIsolated('aitm-legacy-review-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const indexFile = path.join(root, '.tmp/aitm/fleet/co-review-index.json');
  mkdirSync(path.dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, `${JSON.stringify(rows, null, 2)}\n`);
  return { root, indexFile };
}

test('migration guard reads the main-worktree legacy index and refuses active rows', async (t) => {
  const { assertLegacyReviewMigrationSafe } = await import(adapterPath);
  const rows = {
    'legacy-active': {
      protocolId: 'legacy-active',
      lifecycle: 'active',
      dir: '/legacy/review',
    },
  };
  const fixture = createLegacyFixture(t, rows);

  assert.throws(
    () => assertLegacyReviewMigrationSafe({ projectDir: fixture.root }),
    /active legacy review legacy-active/
  );
});

test('terminal rows still refuse removal while production consumers remain', async (t) => {
  const { assertLegacyReviewMigrationSafe } = await import(adapterPath);
  const rows = {
    accepted: { protocolId: 'accepted', lifecycle: 'accepted', dir: '/legacy/accepted' },
    abandoned: { protocolId: 'abandoned', lifecycle: 'abandoned', dir: '/legacy/abandoned' },
  };
  const fixture = createLegacyFixture(t, rows);
  const archive = path.join(fixture.root, 'docs/reviews/accepted.md');
  mkdirSync(path.dirname(archive), { recursive: true });
  writeFileSync(archive, '# Immutable accepted archive\n');
  const beforeIndex = sha256(fixture.indexFile);
  const beforeArchive = sha256(archive);

  assert.throws(
    () => assertLegacyReviewMigrationSafe({ projectDir: repoRoot, indexFile: fixture.indexFile }),
    /legacy runtime still has production consumers/
  );
  assert.equal(sha256(fixture.indexFile), beforeIndex);
  assert.equal(sha256(archive), beforeArchive);
});

test('AITM caches package status only as a non-authoritative occupancy observation', async () => {
  const { cachePeerReviewStatus } = await import(occupancyPath);
  const cache = new Map();
  const observation = cachePeerReviewStatus({
    workspace: '/worktree/.scratch/peer-review/review-1546',
    cache,
    api: {
      statusReview: () => ({
        review_id: 'review-1546',
        state: 'author-revision',
        paths: { workspace: '/worktree/.scratch/peer-review/review-1546' },
      }),
    },
  });

  assert.deepEqual(observation, {
    reviewId: 'review-1546',
    state: 'author-revision',
    worktree: '/worktree/.scratch/peer-review/review-1546',
    authoritative: false,
  });
  assert.equal(cache.get(observation.worktree), observation);
  assert.ok(Object.isFrozen(observation));
});

test('test-impact authority selects both migration tests for adapter changes', () => {
  const selected = selectAffectedTests({
    projectDir: repoRoot,
    changedPaths: ['scripts/task-tracker/lib/peer-review-adapter.mjs'],
  });
  for (const expected of [
    'scripts/tests/integration/review/peer-review-package-parity.test.mjs',
    'scripts/tests/integration/review/peer-review-migration-guard.test.mjs',
  ]) {
    assert.ok(selected.tests.includes(expected), expected);
  }
});
