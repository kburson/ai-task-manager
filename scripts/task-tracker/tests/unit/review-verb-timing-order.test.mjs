#!/usr/bin/env node
// @story #463 (deferral) / #830 (C6 — bare-row retirement)
// Unit tests for review.mjs timing-row emission.
//
// Original #463 intent: the verb-level "starting review" row was deferred past
// runMoveState. EPIC #823 timing model v2 (C6 / #830) RETIRES that bare `review`
// row and the `review-ready` state-move row entirely — the canonical
// `test:passed` + `review:started` pair (emitted by runMoveState) is now the
// complete lifecycle record. These tests therefore assert the review verb:
//   • never posts a timing row on the pre-network path (SKIP_NETWORK short-
//     circuits before the board move), and
//   • no longer calls flushActiveToGH at all (the computeOnly deferral seam the
//     #463 mechanism relied on is gone).
//
// Full ordering verification (runMoveState before safePostTiming) requires
// the E2E suite because runReviewPreflight and runGuards use dynamic import()
// and cannot be intercepted by Node's built-in test runner.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

import { verbReview } from '../../verbs/review.mjs';

function makeTmpStatePath(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-463-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return { statePath: p, dir };
}

function makeCtx({ statePath, rest = ['#999'], active = '#999', flushFn } = {}) {
  const calls = { flush: [], postTiming: [] };

  const ctx = {
    cfg: { repo: 'o/r', projectId: 'PROJ', idleThresholdMinutes: 5 },
    statePath,
    projectDir: '/proj',
    rest,
    SKIP_NETWORK: true,
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    safePostTiming: async (_target, row) => {
      calls.postTiming.push(row);
    },
    flushActiveToGH:
      flushFn ||
      (async (_state, event, desc, _phase, opts) => {
        calls.flush.push({ event, desc, opts });
        const row = { event, description: desc };
        if (opts?.computeOnly) return { row };
        // should never get here in a passing test
        return { row };
      }),
    runMoveState: async () => ({ ok: true }),
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'test',
    nowIso: () => new Date().toISOString(),
  };
  return { ctx, calls };
}

// ── Branch: s.active === target ──────────────────────────────────────────────

test('s.active === target: C6 no longer calls flushActiveToGH (deferral seam removed)', async () => {
  const state = {
    active: '#999',
    entryStartTs: '2026-06-19T00:00:00.000Z',
    wordsAtEntryStart: 0,
    lastActive: '#999',
    discoverBucket: null,
  };
  const { statePath, dir } = makeTmpStatePath(state);
  try {
    const flushCalls = [];
    const { ctx, calls } = makeCtx({
      statePath,
      rest: ['#999'],
      flushFn: async (_s, event, desc, _phase, opts) => {
        flushCalls.push({ event, desc, opts: { ...opts } });
        return { row: { event, description: desc } };
      },
    });

    await verbReview(ctx);

    assert.equal(
      flushCalls.length,
      0,
      'C6 retired the bare `review` row, so flushActiveToGH must not be called by the review verb'
    );
    assert.equal(calls.postTiming.length, 0, 'no timing row is posted on the pre-network path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('s.active === target: safePostTiming NOT called before SKIP_NETWORK block', async () => {
  const state = {
    active: '#999',
    entryStartTs: '2026-06-19T00:00:00.000Z',
    wordsAtEntryStart: 0,
    lastActive: '#999',
    discoverBucket: null,
  };
  const { statePath, dir } = makeTmpStatePath(state);
  try {
    const { ctx, calls } = makeCtx({ statePath, rest: ['#999'] });

    await verbReview(ctx);

    assert.equal(
      calls.postTiming.length,
      0,
      'safePostTiming must not be called when SKIP_NETWORK:true (row is deferred to network block)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Branch: hasAgentTiming ───────────────────────────────────────────────────

test('hasAgentTiming branch: safePostTiming NOT called before SKIP_NETWORK block', async () => {
  const state = {
    active: '#999',
    entryStartTs: '2026-06-19T00:00:00.000Z',
    wordsAtEntryStart: 100,
    lastActive: '#999',
    discoverBucket: null,
  };
  const { statePath, dir } = makeTmpStatePath(state);
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rest: ['#999', '--duration-minutes', '30', '--words', '500'],
    });

    await verbReview(ctx);

    assert.equal(
      calls.postTiming.length,
      0,
      'safePostTiming must not be called in hasAgentTiming branch (row is deferred)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Branch: else (no active session for this target) ────────────────────────

test('else branch: safePostTiming NOT called before SKIP_NETWORK block', async () => {
  const state = {
    active: '#888',
    entryStartTs: null,
    wordsAtEntryStart: 0,
    lastActive: '#888',
    discoverBucket: null,
  };
  const { statePath, dir } = makeTmpStatePath(state);
  try {
    const { ctx, calls } = makeCtx({ statePath, rest: ['#999'] });

    await verbReview(ctx);

    assert.equal(
      calls.postTiming.length,
      0,
      'safePostTiming must not be called in else branch (row is deferred)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
