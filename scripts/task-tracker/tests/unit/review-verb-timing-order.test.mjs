#!/usr/bin/env node
// @story #463
// Unit tests for review.mjs timing-row deferral (#463).
//
// Verifies that the verb-level "starting review" row is NOT posted before
// runMoveState — i.e., flushActiveToGH is called with { computeOnly: true }
// so the row is deferred until after the board move emits test:passed +
// review:started.
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

test('s.active === target: flushActiveToGH called with computeOnly:true', async () => {
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
    const { ctx } = makeCtx({
      statePath,
      rest: ['#999'],
      flushFn: async (_s, event, desc, _phase, opts) => {
        flushCalls.push({ event, desc, opts: { ...opts } });
        return { row: { event, description: desc } };
      },
    });

    await verbReview(ctx);

    assert.equal(flushCalls.length, 1, 'flushActiveToGH called exactly once');
    assert.equal(flushCalls[0].event, 'review');
    assert.equal(flushCalls[0].desc, 'starting review');
    assert.equal(
      flushCalls[0].opts?.computeOnly,
      true,
      'flushActiveToGH must be called with computeOnly:true so row is deferred'
    );
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
