// @story #881
//
// The Agent Review Gate is the ACTION of the Review state — not an exit
// condition of Test, and not an entry condition of Review. That framing fixes
// two things at once:
//
//   * The Test → Review move is unconditional and happens FIRST. The gate is no
//     longer evaluated as a precondition of the transition.
//   * A gate objection leaves the issue IN Review with its action incomplete,
//     to be fixed in place and re-run. It no longer demotes to Develop, which
//     discarded the story's Test-stage verification (observed on #878).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { emitReviewGateFailureTimeline } from '../../verbs/review.mjs';

const reviewSrc = readFileSync(
  fileURLToPath(new URL('../../verbs/review.mjs', import.meta.url)),
  'utf8'
);

// Drive the failure timeline with fakes that append to one ordered log. Any
// board move is recorded, so "no move happened" is an assertion, not an
// assumption.
function drive(overrides = {}) {
  const log = [];
  const deps = {
    runMoveState: async (_target, state) => {
      log.push(`MOVE:${state}`);
      return { ok: true };
    },
    buildRow: ({ event, description }) => `ROW event=${event} desc=${description}`,
    safePostTiming: async (_target, row) => log.push(`ROW:${String(row)}`),
    mutateBodyFn: async () => log.push('stamp:aitm-review-failed'),
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    ...overrides,
  };
  return { log, deps };
}

const ARGS = {
  target: '#999',
  issueNum: '999',
  repo: 'o/r',
  failures: ['objection A', 'objection B'],
  failedBody: 'BODY',
  ts: '2026-07-15T00:00:00.000Z',
  delta: { activeSec: 10, idleSec: 0 },
  wordMarker: 42,
};

test('a gate objection performs NO board move — the issue stays in Review', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.equal(
    log.some((e) => e.startsWith('MOVE:')),
    false,
    `no move may be driven from the failure path; saw ${JSON.stringify(log)}`
  );
});

test('the failure timeline is exactly: stamp the marker, then post review:failed', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.equal(log.length, 2);
  assert.equal(log[0], 'stamp:aitm-review-failed');
  assert.match(log[1], /^ROW:ROW event=review:failed/);
});

test('the review:failed row says the issue stays in Review, not that it reverted', async () => {
  const { log, deps } = drive();
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  const row = log.find((e) => e.startsWith('ROW:'));
  assert.match(row, /staying in Review/);
  assert.doesNotMatch(row, /reverted to Develop/);
  assert.match(row, /agent review failed — 2 objection\(s\)/);
});

test('the marker stamp is best-effort — a mutate throw does not lose the row', async () => {
  const { log, deps } = drive({
    mutateBodyFn: async () => {
      throw new Error('gh edit failed');
    },
  });
  await emitReviewGateFailureTimeline({ ...ARGS, deps: { ...deps, logError: () => {} } });
  assert.equal(log.length, 1);
  assert.match(log[0], /^ROW:ROW event=review:failed/);
});

test('the failure path never passes --demote to anything', async () => {
  const seen = [];
  const { deps } = drive({
    runMoveState: async (_t, state, opts = {}) => {
      seen.push({ state, extraArgs: opts.extraArgs });
      return { ok: true };
    },
  });
  await emitReviewGateFailureTimeline({ ...ARGS, deps });
  assert.deepEqual(seen, [], 'no runMoveState call at all, demote or otherwise');
});

// ── Ordering: the move precedes the gate ────────────────────────────────────
//
// The ordering lives in `verbReview`, whose dynamic-import network path is not
// interceptable from node:test (the same constraint that forced
// `emitReviewGateFailureTimeline` to be extracted). Pin it at the source level:
// a regression that reinstates gate-before-move is a textual reordering and this
// catches it.

test('verbReview performs the authoritative Test → Review move BEFORE running the gate', () => {
  const moveIdx = reviewSrc.indexOf("await runMoveState(target, 'review'");
  const gateIdx = reviewSrc.indexOf('runAgentReviewGate({');
  assert.notEqual(moveIdx, -1, 'the authoritative move call must exist');
  assert.notEqual(gateIdx, -1, 'the gate call must exist');
  assert.ok(
    moveIdx < gateIdx,
    'entering Review is unconditional — the move must precede the Agent Review Gate'
  );
});

test('there is exactly ONE authoritative move-to-review call site', () => {
  const hits = reviewSrc.match(/await runMoveState\(target, 'review'/g) || [];
  assert.equal(
    hits.length,
    1,
    'the old post-gate call site was removed, not duplicated; and the failure path adds none'
  );
});

test('emitReviewGateFailureTimeline no longer destructures runMoveState', () => {
  const start = reviewSrc.indexOf('export async function emitReviewGateFailureTimeline');
  assert.notEqual(start, -1);
  const body = reviewSrc.slice(start, start + 1200);
  assert.doesNotMatch(
    body,
    /^\s*runMoveState,$/m,
    'the failure path drives no move, so it must not claim the dep'
  );
});

test('the operator is told to fix in place and re-run, not to fix in Develop', () => {
  assert.match(reviewSrc, /stays in Review with its state action incomplete/);
  assert.doesNotMatch(reviewSrc, /Fix the objections above in Develop/);
});

// ── The gate reads a POST-move body ─────────────────────────────────────────
//
// Hoisting the move above the gate created a stale-body read: `scanBody` is
// captured upstream of `runMoveState`, which stamps `aitm-entered-review` and
// writes the `review:started` timing row. Feeding the gate that pre-move copy
// made `timing-log-sequence` object on EVERY issue — it saw the new
// `review:started` row in the live timing log but no `aitm-entered-review`
// marker in the body — and the failure stamp, derived from the same stale copy,
// then threw `MarkerLossError` for dropping that marker. Observed live on #881.

test('the gate is handed a body fetched AFTER the move, not the pre-move scanBody', () => {
  const moveIdx = reviewSrc.indexOf("await runMoveState(target, 'review'");
  const refetchIdx = reviewSrc.indexOf("'body,comments'");
  const gateIdx = reviewSrc.indexOf('runAgentReviewGate({');
  assert.notEqual(refetchIdx, -1, 'the post-move body+comments re-fetch must exist');
  assert.ok(moveIdx < refetchIdx, 're-fetch must happen after the move that stamps the marker');
  assert.ok(refetchIdx < gateIdx, 're-fetch must happen before the gate consumes it');
  assert.match(
    reviewSrc.slice(gateIdx, gateIdx + 200),
    /body:\s*gateBody/,
    'the gate must consume the post-move snapshot'
  );
});

test('both gate outcome paths derive their write from the post-move body', () => {
  const gateIdx = reviewSrc.indexOf('runAgentReviewGate({');
  const tail = reviewSrc.slice(gateIdx);
  // The fail path stamps aitm-review-failed; the pass path stamps the tick.
  // Either deriving from `scanBody` reintroduces the dropped-marker throw.
  assert.doesNotMatch(
    tail.slice(0, 2500),
    /:\s*scanBody;/,
    'neither baseBody nor passBase may fall back to the pre-move scanBody'
  );
});
