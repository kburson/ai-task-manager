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

import { verbReview, emitReviewGateFailureTimeline } from '../../verbs/review.mjs';

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

// ── EPIC #823 timing model v2 (C7 / defects D2+D3): gate-failure timeline ────
//
// emitReviewGateFailureTimeline is the extracted, injectable orchestrator for the
// agent-review-gate failure path. Driving it with fakes that append to a single
// ordered log lets us assert the canonical emission order without the verb's
// dynamic-import network path.

// Build an ordered event log from the real runMoveState (which, in production,
// emits `test:passed`+`review:started` for a →review move and
// `demoted:develop`+`develop:started` for a →develop --demote move). The fakes
// below stand in for runMoveState by recording the equivalent rows so the test
// asserts the sequence the helper drives.
function drive(overrides = {}) {
  const log = [];
  const deps = {
    runMoveState: async (target, state, opts = {}) => {
      if (state === 'review') {
        log.push('test:passed');
        log.push('review:started');
      } else if (state === 'develop') {
        const extra = Array.isArray(opts.extraArgs) ? opts.extraArgs : [];
        const isDemote = extra.includes('--demote');
        const ri = extra.indexOf('--demote-reason');
        const reason = ri !== -1 ? extra[ri + 1] : '';
        log.push(isDemote ? `demoted:develop:${reason}` : 'develop:started(no-demote)');
        log.push('develop:started');
      } else {
        log.push(`move:${state}`);
      }
      return { ok: true };
    },
    // Inject a fake buildRow so the helper does not hit the real buildRow's
    // retroactive-ts guard (which rejects any ts >60s from now). We assert
    // emission ORDER, not row formatting — the fake just carries the Event slug.
    buildRow: ({ event }) => `ROW event=${event}`,
    safePostTiming: async (_target, row) => {
      // The fake buildRow above returns a string carrying the Event slug.
      const s = String(row);
      log.push(/review:failed/.test(s) ? 'review:failed' : `post:${s.slice(0, 24)}`);
    },
    mutateBodyFn: async () => {
      log.push('stamp:aitm-review-failed');
    },
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    ...overrides,
  };
  return { log, deps };
}

test('gate-failure timeline: canonical order test:passed → review:started → review:failed → demoted:develop → develop:started', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({
    target: '#999',
    issueNum: '999',
    repo: 'o/r',
    failures: ['objection A', 'objection B'],
    failedBody: 'BODY',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 10, idleSec: 0 },
    wordMarker: 42,
    deps,
  });

  // Strip the body-stamp (not a timing row) to check the timing sequence.
  const timing = log.filter((e) => e !== 'stamp:aitm-review-failed');
  assert.deepEqual(timing, [
    'test:passed',
    'review:started',
    'review:failed',
    'demoted:develop:agent review failed — 2 objection(s)',
    'develop:started',
  ]);
});

test('gate-failure timeline: review:started precedes review:failed', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({
    target: '#999',
    issueNum: '999',
    repo: 'o/r',
    failures: ['x'],
    failedBody: 'BODY',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    deps,
  });
  assert.ok(
    log.indexOf('review:started') < log.indexOf('review:failed'),
    'review:started must precede review:failed'
  );
});

test('gate-failure timeline: no test:passed emitted AFTER review:failed (D2)', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({
    target: '#999',
    issueNum: '999',
    repo: 'o/r',
    failures: ['x'],
    failedBody: 'BODY',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    deps,
  });
  const failedIdx = log.indexOf('review:failed');
  assert.ok(failedIdx !== -1, 'review:failed row present');
  assert.equal(
    log.slice(failedIdx + 1).includes('test:passed'),
    false,
    'no spurious test:passed after review:failed'
  );
});

test('gate-failure timeline: demote carries --demote and --demote-reason with objection summary (D3)', async () => {
  const seen = { extraArgs: null };
  const { deps } = drive({
    runMoveState: async (_target, state, opts = {}) => {
      if (state === 'develop') seen.extraArgs = opts.extraArgs;
      return { ok: true };
    },
    safePostTiming: async () => {},
    mutateBodyFn: async () => {},
  });
  await emitReviewGateFailureTimeline({
    target: '#999',
    issueNum: '999',
    repo: 'o/r',
    failures: ['a', 'b', 'c'],
    failedBody: 'BODY',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    deps,
  });
  assert.ok(Array.isArray(seen.extraArgs), 'develop demote received extraArgs');
  assert.ok(seen.extraArgs.includes('--demote'), 'demote flag present');
  const ri = seen.extraArgs.indexOf('--demote-reason');
  assert.ok(ri !== -1, '--demote-reason present');
  assert.equal(seen.extraArgs[ri + 1], 'agent review failed — 3 objection(s)');
});

test('gate-failure timeline: body-stamp survives a mutate throw (best-effort) and order is unchanged', async () => {
  const { log, deps } = drive({
    mutateBodyFn: async () => {
      throw new Error('gh edit failed');
    },
  });
  await emitReviewGateFailureTimeline({
    target: '#999',
    issueNum: '999',
    repo: 'o/r',
    failures: ['x'],
    failedBody: 'BODY',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    deps: { ...deps, logError: () => {} },
  });
  const timing = log.filter((e) => e !== 'stamp:aitm-review-failed');
  assert.deepEqual(timing, [
    'test:passed',
    'review:started',
    'review:failed',
    'demoted:develop:agent review failed — 1 objection(s)',
    'develop:started',
  ]);
});
