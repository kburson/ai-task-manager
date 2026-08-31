#!/usr/bin/env node
// @story #463 (deferral) / #830 (C6 — bare-row retirement) / #1117 #1458
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
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

import {
  verbReview,
  emitReviewGateFailureTimeline,
  emitReviewGatePassTimeline,
} from '../../../../task-tracker/verbs/review.mjs';
import * as reviewModule from '../../../../task-tracker/verbs/review.mjs';
import { reviewAgentValidationAction } from '../../../../task-tracker/lib/resident-actions/review-agent-validation.mjs';

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
    const after = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(
      after.entryStartTs,
      state.entryStartTs,
      'agent Review work must remain timed until a successful human handoff'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a paused binding opens a timing segment before automated Review work', async () => {
  const state = {
    active: '#999',
    entryStartTs: null,
    wordsAtEntryStart: 0,
    lastActive: '#999',
    lastWordMarker: 42,
    discoverBucket: null,
  };
  const { statePath, dir } = makeTmpStatePath(state);
  try {
    const { ctx } = makeCtx({ statePath, rest: ['#999'] });

    await verbReview(ctx);

    const after = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(typeof after.entryStartTs, 'string');
    assert.equal(after.wordsAtEntryStart, state.lastWordMarker);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review handoff policy pauses only when human approval is required', () => {
  assert.equal(
    reviewModule.reviewNeedsHumanApproval?.({ cfg: {}, env: {} }),
    true,
    'interactive Review waits for a human'
  );
  assert.equal(
    reviewModule.reviewNeedsHumanApproval?.({ cfg: {}, env: { TT_FULL_AUTO: '1' } }),
    false,
    'explicit Full-Auto Review continues without a human handoff'
  );
  assert.equal(
    reviewModule.reviewNeedsHumanApproval?.({ cfg: { gateReviewToDone: false }, env: {} }),
    false,
    'a disabled human gate continues without a human handoff'
  );
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
    // emission ORDER, not row formatting — the fake carries the Event slug and
    // the description so pass-path tests can inspect the recorded validator set.
    buildRow: ({ event, description }) => `ROW event=${event} :: ${description ?? ''}`,
    safePostTiming: async (_target, row) => {
      // The fake buildRow above returns a string carrying the Event slug.
      const s = String(row);
      if (/event=review:failed/.test(s)) log.push('review:failed');
      else if (/event=review:passed/.test(s)) log.push('review:passed');
      else log.push(`post:${s.slice(0, 24)}`);
    },
    mutateBodyFn: async () => {
      log.push('stamp:aitm-review-failed');
    },
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    ...overrides,
  };
  return { log, deps };
}

// #881 reshaped this function. The Agent Review Gate is the ACTION of the Review
// state, so by the time it can fail the caller has already performed the
// Test -> Review move: the `test:passed` + `review:started` pair is on the record
// before this function is reached, and D2 (no `test:passed` after `review:failed`)
// stays fixed structurally rather than by an internal transient move. A failed
// action leaves the issue IN Review, so the demote and its `--demote` /
// `--demote-reason` args are gone. The move-ordering half of the contract is
// pinned in `review-state-action.test.mjs`.

test('gate-failure timeline: the only timing row is review:failed', async () => {
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
  assert.deepEqual(timing, ['review:failed']);
});

test('gate-failure timeline: the marker stamp precedes the review:failed row', async () => {
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
    log.indexOf('stamp:aitm-review-failed') < log.indexOf('review:failed'),
    'the objection marker is stamped before the row that reports it'
  );
});

test('gate-failure timeline: no state-change row is emitted at all (D2)', async () => {
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
  // `test:passed` / `review:started` belong to the caller's move, which already
  // ran; re-emitting either here is the D2 regression.
  for (const slug of ['test:passed', 'review:started', 'develop:started']) {
    assert.equal(log.includes(slug), false, `${slug} must not be emitted from the failure path`);
  }
});

test('gate-failure timeline: no demote is driven, with or without extraArgs (D3)', async () => {
  const seen = [];
  const { deps } = drive({
    runMoveState: async (_target, state, opts = {}) => {
      seen.push({ state, extraArgs: opts.extraArgs });
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
  assert.deepEqual(seen, [], 'the issue stays in Review - no move, demote or otherwise');
});

test('gate-failure timeline: a mutate throw is best-effort and does not lose the row', async () => {
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
  assert.deepEqual(timing, ['review:failed']);
});

// ── #904: gate-PASS timeline — the symmetric review:passed row ────────────────
//
// emitReviewGatePassTimeline is the pass-path counterpart to the failure helper.
// Driving it with the same ordered-log fakes lets us assert the pass path emits
// exactly one `review:passed` row (and never a failure / state-change row),
// without the verb's dynamic-import network path that node:test cannot intercept.

test('gate-pass timeline: the only timing row is review:passed', async () => {
  const { log, deps } = drive();
  await emitReviewGatePassTimeline({
    target: '#999',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 12, idleSec: 3 },
    wordMarker: 42,
    validators: ['timing-log-sequence', 'ac-dod-vc-attributes'],
    deps,
  });
  assert.deepEqual(log, ['review:passed']);
});

test('#1458 — resident pass prepares durable evidence before the pass callback', async () => {
  const calls = [];
  const result = await reviewAgentValidationAction.run(
    {
      now: () => Date.parse('2026-08-31T12:01:00.000Z'),
      review: {
        repo: 'o/r',
        readComments: async () => [],
        computeChangedPaths: async () => [],
        runAgentReviewGate: async () => ({
          pass: true,
          failures: [],
          validatorsRun: ['timing-log-sequence'],
        }),
        onFailure: async () => calls.push('failure'),
        onPass: async ({ passedBody, validators, ts }) => {
          calls.push('pass');
          assert.match(passedBody, /Agent Review Passed.*gate="agent-review"/);
          assert.deepEqual(validators, ['timing-log-sequence']);
          assert.equal(ts, '2026-08-31T12:01:00.000Z');
        },
      },
    },
    {
      issue: { value: 1458 },
      currentState: { value: 'review' },
      stateVisitId: 'review:1',
      body: { value: '- [ ] Agent Review Passed' },
      invocation: { cwd: '/worktree' },
    },
    { correlation: { stateVisitId: 'review:1', actionId: 'review-agent-validation' } }
  );

  assert.deepEqual(calls, ['pass']);
  assert.equal(result.status, 'complete');
});

test('gate-pass timeline: the row description records the validator set and result=pass', async () => {
  const rows = [];
  const { deps } = drive({
    // Capture the real row object the helper builds (bypass the log-reducing
    // fake) so we can inspect the description the pass row carries.
    buildRow: (row) => row,
    safePostTiming: async (_target, row) => {
      rows.push(row);
    },
  });
  await emitReviewGatePassTimeline({
    target: '#999',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    validators: ['timing-log-sequence', 'ac-dod-vc-attributes'],
    deps,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'review:passed');
  assert.match(rows[0].description, /timing-log-sequence, ac-dod-vc-attributes/);
  assert.match(rows[0].description, /result=pass/);
});

test('gate-pass timeline: an empty validator set is recorded as "none", still result=pass', async () => {
  const rows = [];
  const { deps } = drive({
    buildRow: (row) => row,
    safePostTiming: async (_target, row) => {
      rows.push(row);
    },
  });
  await emitReviewGatePassTimeline({
    target: '#999',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    validators: [],
    deps,
  });
  assert.match(rows[0].description, /validators: none/);
  assert.match(rows[0].description, /result=pass/);
});

test('gate-pass timeline: no failure or state-change row leaks from the pass path', async () => {
  const { log, deps } = drive();
  await emitReviewGatePassTimeline({
    target: '#999',
    ts: '2026-07-15T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    validators: ['timing-log-sequence'],
    deps,
  });
  for (const slug of ['review:failed', 'test:passed', 'review:started', 'develop:started']) {
    assert.equal(log.includes(slug), false, `${slug} must not be emitted from the pass path`);
  }
});
