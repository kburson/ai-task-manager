// @story #545 — epic re-title on first child link (AC4: "applied when an issue
// gains its first child"). Exercises the injected-runGql seam offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ensureParentEpicTitle } from '../../../../../gh/lib/epic-retitle.mjs';
import { EPIC_PREFIX } from '../../../../../gh/lib/kind-prefix.mjs';

// Build a runGql mock that returns `title` for the node-title query and records
// every updateIssue mutation it sees.
function mockRunner(title) {
  const updates = [];
  const runGql = async (query, variables) => {
    if (query.includes('... on Issue') && query.includes('title')) {
      return { node: { number: 42, title, repository: { nameWithOwner: 'o/r' } } };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  const reconcileEpicMetadata = async () => {
    if (title.startsWith(EPIC_PREFIX)) return { status: 'already-converged' };
    updates.push({ id: 'P1', title: `${EPIC_PREFIX}${title.replace(/^EPIC: /, '')}` });
    return { status: 'reconciled' };
  };
  return { runGql, updates, reconcileEpicMetadata };
}

test('re-titles a plain parent on first child link (AC4)', async () => {
  const { runGql, updates, reconcileEpicMetadata } = mockRunner('platform work');
  const res = await ensureParentEpicTitle({ parentId: 'P1', runGql, reconcileEpicMetadata });
  assert.equal(res.status, 'reconciled');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].title, `${EPIC_PREFIX}platform work`);
});

test('is a no-op when the parent is already an epic (idempotent)', async () => {
  const { runGql, updates, reconcileEpicMetadata } = mockRunner(`${EPIC_PREFIX}platform work`);
  const res = await ensureParentEpicTitle({ parentId: 'P1', runGql, reconcileEpicMetadata });
  assert.equal(res.status, 'already-epic');
  assert.equal(updates.length, 0);
});

test('migrates the legacy EPIC: convention to the epic prefix (AC4)', async () => {
  const { runGql, updates, reconcileEpicMetadata } = mockRunner('EPIC: platform work');
  const res = await ensureParentEpicTitle({ parentId: 'P1', runGql, reconcileEpicMetadata });
  assert.equal(res.status, 'reconciled');
  assert.equal(updates[0].title, `${EPIC_PREFIX}platform work`);
});

test('returns no-title when the parent has no readable title', async () => {
  const { runGql, updates, reconcileEpicMetadata } = mockRunner(undefined);
  const res = await ensureParentEpicTitle({ parentId: 'P1', runGql, reconcileEpicMetadata });
  assert.equal(res.status, 'no-title');
  assert.equal(updates.length, 0);
});

test('validates required arguments', async () => {
  await assert.rejects(() => ensureParentEpicTitle({ runGql: async () => ({}) }), /parentId/);
  await assert.rejects(() => ensureParentEpicTitle({ parentId: 'P1' }), /runGql/);
});

test('first-child linking resolves the parent and delegates all Epic carriers', async () => {
  const calls = [];
  const runGql = async (query) => {
    if (query.includes('... on Issue')) {
      return {
        node: {
          number: 42,
          title: 'platform work',
          repository: { nameWithOwner: 'o/r' },
        },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  const result = await ensureParentEpicTitle({
    parentId: 'P1',
    runGql,
    reconcileEpicMetadata: async (input) => {
      calls.push(input);
      return { status: 'reconciled' };
    },
  });
  assert.equal(result.status, 'reconciled');
  assert.equal(calls.length, 1);
  assert.deepEqual(
    { issueNumber: calls[0].issueNumber, repo: calls[0].repo, forceEpic: calls[0].forceEpic },
    { issueNumber: 42, repo: 'o/r', forceEpic: true }
  );
});
