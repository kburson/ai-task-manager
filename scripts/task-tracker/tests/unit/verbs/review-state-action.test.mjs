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

import {
  buildReviewFailureBody,
  emitReviewGateFailureTimeline,
  makeAgentReviewPassMutator,
  normalizeReviewVerificationCheckboxes,
  prepareAgentReviewPassStamp,
} from '../../../verbs/review.mjs';
import {
  derivePersistedReviewAuthority,
  serializeAgentReviewProof,
  serializeReviewApproval,
} from '../../../lib/review-authority.mjs';
import { clearReviewFailed } from '../../../lib/agent-review/review-gate.mjs';

const reviewSrc = readFileSync(
  fileURLToPath(new URL('../../../verbs/review.mjs', import.meta.url)),
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

test('#1050 active Review failure persists invalidation before its failure block and demands renewed approval', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const body = [
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00Z" -->',
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    serializeAgentReviewProof({
      epoch,
      sha: 'abc1234',
      ts: '2026-07-29T10:01:00Z',
      validators: 'unit',
      result: 'pass',
    }),
    serializeReviewApproval({
      epoch,
      proofSha: 'abc1234',
      ts: '2026-07-29T10:02:00Z',
      provenance: 'human',
    }),
  ].join('\n');
  const failed = buildReviewFailureBody(body, ['lint: failed'], '2026-07-29T10:03:00Z');
  assert.match(failed, /aitm-review-invalidated[\s\S]*aitm-review-failed:start/);
  const retried = `${clearReviewFailed(failed)}\n${serializeAgentReviewProof({ epoch, sha: 'abc1234', ts: '2026-07-29T10:04:00Z', validators: 'unit', result: 'pass' })}`;
  assert.equal(derivePersistedReviewAuthority(retried).status, 'stale');
});

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

test('a failure-marker write error is propagated so an unrevoked authority is never reported safe', async () => {
  const { log, deps } = drive({
    mutateBodyFn: async () => {
      throw new Error('gh edit failed');
    },
  });
  await assert.rejects(
    emitReviewGateFailureTimeline({ ...ARGS, deps: { ...deps, logError: () => {} } }),
    /gh edit failed/
  );
  assert.deepEqual(log, []);
});

test('failure mutation derives both markers from the writer fresh base', async () => {
  let written = '';
  const { deps } = drive({
    mutateBodyFn: async ({ mutate }) => {
      written = mutate('fresh concurrent text');
    },
  });
  await emitReviewGateFailureTimeline({
    ...ARGS,
    buildFailedBody: (base) =>
      `${base}\n<!-- aitm-review-invalidated schema="1" -->\n<!-- aitm-review-failed:start -->`,
    deps,
  });
  assert.match(written, /^fresh concurrent text/);
  assert.match(written, /aitm-review-invalidated[\s\S]*aitm-review-failed:start/);
});

test('#1050 failure persistence adopts the fresh gate objections for its body, timing, and result', async () => {
  let written = '';
  const { log, deps } = drive();
  deps.mutateBodyFn = async ({ mutate }) => {
    written = mutate('fresh concurrent text');
  };

  const result = await emitReviewGateFailureTimeline({
    ...ARGS,
    failures: ['stale objection'],
    prepareFailedBody: (base) => ({
      body: `${base}\n<!-- aitm-review-failed:start -->\n- fresh objection\n<!-- aitm-review-failed:end -->`,
      failures: ['fresh objection'],
    }),
    deps,
  });

  assert.doesNotMatch(written, /stale objection/);
  assert.match(written, /fresh objection/);
  assert.deepEqual(result, { status: 'failed', failures: ['fresh objection'] });
  assert.match(
    log.find((entry) => entry.startsWith('ROW:')),
    /1 objection\(s\)/
  );
});

test('#1050 a concurrent fresh gate pass suppresses the obsolete failure marker and timing row', async () => {
  let written = '';
  const { log, deps } = drive();
  deps.mutateBodyFn = async ({ mutate }) => {
    written = mutate('fresh passing body');
  };

  const result = await emitReviewGateFailureTimeline({
    ...ARGS,
    failures: ['stale objection'],
    prepareFailedBody: (base) => ({ body: base, failures: [] }),
    deps,
  });

  assert.equal(written, 'fresh passing body');
  assert.deepEqual(result, { status: 'superseded', failures: [] });
  assert.equal(
    log.some((entry) => entry.startsWith('ROW:')),
    false,
    'a superseded failure must not emit review:failed timing'
  );
});

test('#1050 pass mutation reruns the gate on the writer fresh base and preserves a concurrent objection', () => {
  const comments = [{ body: 'fresh review context' }];
  const changedPaths = ['scripts/task-tracker/verbs/review.mjs'];
  const freshBase = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00.000Z" -->',
    '<!-- aitm-test-started sha="abc1234" ts="2026-07-29T09:00:00.000Z" -->',
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00.000Z" -->',
    '- [ ] Agent Review Passed',
    '<!-- aitm-review-failed:start -->',
    '<!-- aitm-review-failed-meta ts="2026-07-29T10:00:30.000Z" -->',
    '**Agent Review Gate failed.**',
    '- concurrent-validator: objection',
    '<!-- aitm-review-failed:end -->',
  ].join('\n');
  let prepared;
  let gateInput;

  const mutate = makeAgentReviewPassMutator({
    ts: '2026-07-29T10:01:00.000Z',
    issueNumber: 1050,
    repo: 'o/r',
    comments,
    changedPaths,
    validators: ['stale-validator'],
    runGate: (input) => {
      gateInput = input;
      const blocked = input.body.includes('<!-- aitm-review-failed:start -->');
      return {
        pass: !blocked,
        failures: blocked ? ['concurrent-validator: objection'] : [],
        validatorsRun: ['concurrent-validator'],
        normalizedBody: `${input.body}\n<!-- fresh-normalization -->`,
      };
    },
    onPrepared: (result) => {
      prepared = result;
    },
  });
  const returned = mutate(freshBase);

  assert.deepEqual(gateInput, {
    body: freshBase,
    issueNumber: 1050,
    repo: 'o/r',
    comments,
    changedPaths,
  });
  assert.equal(prepared.ok, false);
  assert.deepEqual(prepared.failures, ['concurrent-validator: objection']);
  assert.deepEqual(prepared.validators, ['concurrent-validator']);
  assert.equal(returned, freshBase, 'the concurrent failure block must remain untouched');
  assert.match(returned, /aitm-review-failed:start/);
  assert.doesNotMatch(returned, /aitm-agent-review-proof|gate="agent-review"[^>]*result="pass"/);
});

test('#1050 pass preparation ignores fenced Test, DoD, and Review-entry examples', () => {
  const body = [
    '```md',
    '<!-- aitm-entered-review-9 ts="2026-07-29T19:00:00Z" -->',
    '<!-- aitm-test-started sha="dec0de1" ts="2026-07-29T19:01:00Z" -->',
    '<!-- aitm-dod-verified sha="dec0de1" ts="2026-07-29T19:02:00Z" -->',
    '```',
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    '<!-- aitm-test-started sha="abc1234" ts="2026-07-29T09:00:00Z" -->',
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00Z" -->',
    '- [ ] Agent Review Passed',
  ].join('\n');

  const prepared = prepareAgentReviewPassStamp({
    body,
    ts: '2026-07-29T10:01:00Z',
    validators: ['unit'],
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.verifiedSha, 'abc1234');
  assert.equal(prepared.epoch, 'review:1:2026-07-29T10:00:00Z');
  assert.match(prepared.body, /epoch="review:1:2026-07-29T10:00:00Z" sha="abc1234"/);
  assert.ok(prepared.body.includes('<!-- aitm-entered-review-9'));
});

test('#1050 pass mutation stamps the fresh normalization and validator list, never preflight results', () => {
  const freshBase = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00.000Z" -->',
    '<!-- aitm-test-started sha="abc1234" ts="2026-07-29T09:00:00.000Z" -->',
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00.000Z" -->',
    '- [ ] Agent Review Passed',
  ].join('\n');
  const freshNormalized = `${freshBase}\n<!-- fresh-normalization -->`;

  const returned = makeAgentReviewPassMutator({
    ts: '2026-07-29T10:01:00.000Z',
    issueNumber: 1050,
    repo: 'o/r',
    validators: ['stale-validator'],
    runGate: () => ({
      pass: true,
      failures: [],
      validatorsRun: ['fresh-validator'],
      normalizedBody: freshNormalized,
    }),
  })(freshBase);

  assert.match(returned, /fresh-normalization/);
  assert.match(returned, /validators="fresh-validator"/);
  assert.doesNotMatch(returned, /stale-validator/);
});

test('#1050 checkbox normalization preserves a fresh validator objection and the proof gate fails closed', () => {
  const freshBase = [
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00.000Z" -->',
    '<!-- aitm-test-started sha="abc1234" ts="2026-07-29T09:00:00.000Z" -->',
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00.000Z" -->',
    '## Scope',
    'concurrent-validator: objection',
    '## Verification Commands',
    '- [ ] `npm test`',
    '## Definition of Done',
    '- [ ] Acceptance criteria met',
    '- [ ] Issue body checkboxes ticked',
    '- [ ] Agent Review Passed',
  ].join('\n');
  const normalized = normalizeReviewVerificationCheckboxes({
    body: freshBase,
    commandResults: new Map([['npm test', true]]),
  });

  assert.match(normalized.body, /concurrent-validator: objection/);
  assert.match(normalized.body, /- \[x\] `npm test`/);

  let prepared;
  let gateBody;
  const returned = makeAgentReviewPassMutator({
    ts: '2026-07-29T10:01:00.000Z',
    issueNumber: 1050,
    repo: 'o/r',
    runGate: ({ body }) => {
      gateBody = body;
      const blocked = body.includes('concurrent-validator: objection');
      return {
        pass: !blocked,
        failures: blocked ? ['concurrent-validator: objection'] : [],
        validatorsRun: ['concurrent-validator'],
        normalizedBody: body,
      };
    },
    onPrepared: (result) => {
      prepared = result;
    },
  })(normalized.body);

  assert.equal(gateBody, normalized.body);
  assert.equal(prepared.ok, false);
  assert.deepEqual(prepared.failures, ['concurrent-validator: objection']);
  assert.equal(returned, normalized.body);
  assert.doesNotMatch(returned, /aitm-agent-review-proof|gate="agent-review"[^>]*result="pass"/);
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
  const moveIdx = reviewSrc.indexOf("await scopedRunMoveState(target, 'review'");
  const gateIdx = reviewSrc.indexOf('runAgentReviewGate({');
  assert.notEqual(moveIdx, -1, 'the authoritative move call must exist');
  assert.notEqual(gateIdx, -1, 'the gate call must exist');
  assert.ok(
    moveIdx < gateIdx,
    'entering Review is unconditional — the move must precede the Agent Review Gate'
  );
});

test('there is exactly ONE authoritative move-to-review call site', () => {
  const hits = reviewSrc.match(/await scopedRunMoveState\(target, 'review'/g) || [];
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
  const moveIdx = reviewSrc.indexOf("await scopedRunMoveState(target, 'review'");
  const refetchIdx = reviewSrc.indexOf("'body,comments'");
  const gateIdx = reviewSrc.indexOf('runAgentReviewGate({');
  assert.notEqual(moveIdx, -1, 'the scoped authoritative move call must exist');
  assert.notEqual(refetchIdx, -1, 'the post-move body+comments re-fetch must exist');
  assert.notEqual(gateIdx, -1, 'the agent review gate call must exist');
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

test('#1050 the production failure path adopts the fresh gate verdict and objection list', () => {
  const failurePath = reviewSrc.slice(reviewSrc.indexOf('if (failures) {'));
  assert.match(failurePath, /prepareFailedBody:\s*\(freshBase\)/);
  assert.match(failurePath, /failures:\s*freshGate\.failures/);
  assert.match(failurePath, /if\s*\(freshGate\.pass\)/);
  assert.match(failurePath, /failureResult\.failures/);
});
