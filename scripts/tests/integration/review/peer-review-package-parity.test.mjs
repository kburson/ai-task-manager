// @story #1546
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const entrypointsPath = path.join(
  repoRoot,
  'scripts/task-tracker/lib/command-surface/entrypoints.mjs'
);

test('AITM exposes a published peer-review adapter without adding a peer-review wrapper', () => {
  assert.ok(existsSync(adapterPath), 'published package adapter must exist');
  const entrypoints = readFileSync(entrypointsPath, 'utf8');
  assert.doesNotMatch(entrypoints, /['"]peer-review['"]/);
});

test('adapter passes only the workspace to the package public status API', async () => {
  const { AITM_PEER_REVIEW_CONFIG, peerReviewStatus } = await import(adapterPath);
  assert.deepEqual(AITM_PEER_REVIEW_CONFIG, {
    reviewsRoot: 'docs/superpowers/reviews',
    reviewPathTemplate: '<issue>/<kind>',
    allowNoCommit: false,
  });

  const calls = [];
  const result = peerReviewStatus({
    workspace: '/worktree',
    api: {
      statusReview(workspace) {
        calls.push(workspace);
        return { review_id: 'review-1546', state: 'accepted', worktree: '/worktree' };
      },
    },
  });

  assert.deepEqual(calls, ['/worktree']);
  assert.deepEqual(result, { reviewId: 'review-1546', state: 'accepted', worktree: '/worktree' });
  assert.ok(Object.isFrozen(result));
});
