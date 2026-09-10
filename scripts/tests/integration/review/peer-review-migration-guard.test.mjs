// @story #1546
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const occupancyPath = path.join(repoRoot, 'scripts/task-tracker/lib/occupancy.mjs');

test('migration guard is available before legacy runtime removal is considered', () => {
  assert.ok(existsSync(adapterPath), 'migration guard must be provided by the package adapter');
});

test('AITM caches package review status as a non-authoritative occupancy observation', () => {
  const occupancy = readFileSync(occupancyPath, 'utf8');
  assert.match(occupancy, /cachePeerReviewStatus/);
});

test('active legacy review refuses removal while package status cache remains advisory', async () => {
  const { assertLegacyReviewMigrationSafe } = await import(adapterPath);
  const { cachePeerReviewStatus } = await import(occupancyPath);
  assert.throws(
    () =>
      assertLegacyReviewMigrationSafe({
        legacyRows: [{ protocolId: 'legacy-1', lifecycle: 'active' }],
      }),
    /active legacy review legacy-1/
  );
  const cache = new Map();
  const observation = cachePeerReviewStatus({
    workspace: '/worktree',
    cache,
    api: {
      statusReview: () => ({
        review_id: 'review-1546',
        state: 'author-revision',
        worktree: '/worktree',
      }),
    },
  });
  assert.deepEqual(observation, {
    reviewId: 'review-1546',
    state: 'author-revision',
    worktree: '/worktree',
    authoritative: false,
  });
  assert.equal(cache.get('/worktree'), observation);
  assert.ok(Object.isFrozen(observation));
});
