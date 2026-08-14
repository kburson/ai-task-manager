#!/usr/bin/env node
// @story #677
// Unit tests for computeBackfillHoles (stage-entry-markers.mjs) and its
// integration into reconcile.mjs's backfill mode.
//
// Regression coverage for #677: reconcile backfill was trusting
// verifyChainIntegrity's deliberate zero-tuple "ok: true" early-return to
// also mean "nothing to backfill." An issue with zero aitm-entered-* markers
// that has visibly progressed past backlog (per board Status) needs every
// prior-stage marker backfilled — that's exactly the hole backfill exists to
// fill, and it was being silently skipped.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  computeBackfillHoles,
  stampEntryMarker,
  verifyChainIntegrity,
} from '../../../../task-tracker/lib/stage-entry-markers.mjs';
import { runReconcile } from '../../../../task-tracker/verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

test('computeBackfillHoles: zero markers + non-backlog stage reports every prior stage as a hole', () => {
  const r = computeBackfillHoles('', 'develop');
  assert.equal(r.ok, false);
  assert.deepEqual(r.holes, ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop']);
});

test('computeBackfillHoles: zero markers + backlog stage reports no holes (fresh issue, preserved contract)', () => {
  const r = computeBackfillHoles('', 'backlog');
  assert.equal(r.ok, true);
  assert.deepEqual(r.holes, []);
  assert.deepEqual(r, verifyChainIntegrity('', 'backlog'));
});

test('computeBackfillHoles: non-zero markers delegates to verifyChainIntegrity unchanged', () => {
  let body = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
  body = stampEntryMarker(body, 'plan', '2026-01-03T00:00:00Z');
  const r = computeBackfillHoles(body, 'plan');
  assert.deepEqual(r, verifyChainIntegrity(body, 'plan'));
  assert.deepEqual(r.holes, ['refine', 'ready-for-plan']);
});

function makeDeps({ body = '', createdAt = '2026-01-01T00:00:00Z', live = null } = {}) {
  const calls = { writes: [], persists: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body, createdAt }),
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => live,
      persistTrackerState: ({ issueNumber, state }) => {
        calls.persists.push({ issueNumber, state });
      },
    },
  };
}

test('reconcile backfill: zero markers + board state past backlog backfills every prior stage (#677)', async () => {
  const { deps, calls } = makeDeps({ body: '', live: 'develop' });
  const r = await runReconcile({ issueNumber: 677, mode: 'backfill', cfg, deps });
  assert.equal(r.status, 'backfilled');
  assert.deepEqual(r.filled, ['backlog', 'refine', 'plan', 'develop']);
  assert.equal(calls.writes.length, 1);
  for (const stage of ['backlog', 'refine', 'plan', 'develop']) {
    assert.match(calls.writes[0], new RegExp(`aitm-entered-${stage}(?::|\\s+ts=")`));
  }
  assert.deepEqual(calls.persists, [{ issueNumber: 677, state: 'develop' }]);
});

test('reconcile backfill: zero markers + backlog board state reports no-holes (fresh issue, no false positive)', async () => {
  const { deps, calls } = makeDeps({ body: '', live: 'backlog' });
  const r = await runReconcile({ issueNumber: 678, mode: 'backfill', cfg, deps });
  assert.equal(r.status, 'no-holes');
  assert.equal(calls.writes.length, 0);
});
