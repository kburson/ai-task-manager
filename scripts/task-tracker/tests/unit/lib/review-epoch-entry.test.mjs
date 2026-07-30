import assert from 'node:assert/strict';
import test from 'node:test';

import { stampAgentReviewPassed } from '../../../lib/agent-review/review-gate.mjs';
import { parseDodVerifiedMarker } from '../../../lib/markers.mjs';
import { parseReviewAuthority, reviewEpochId } from '../../../lib/review-authority.mjs';
import { latestStageEntry, stampEntryMarker } from '../../../lib/stage-entry-markers.mjs';
import { runVerbTest } from '../../../verbs/test.mjs';
import {
  prepareAgentReviewPassStamp,
  validatePersistedTestEvidence,
} from '../../../verbs/review.mjs';

const REVIEW_ONE = '2026-07-29T10:00:00.000Z';
const REVIEW_TWO = '2026-07-29T11:00:00.000Z';
const VERIFIED_SHA = 'abc1234deadbeef';

test('Review epoch follows canonical entry visits and retains its identity on an in-place retry', () => {
  let body = stampEntryMarker('', 'review', REVIEW_ONE);
  const first = latestStageEntry(body, 'review');
  assert.deepEqual(first, { stage: 'review', visit: 1, ts: REVIEW_ONE });
  assert.equal(
    reviewEpochId({ visit: first.visit, enteredReviewAt: first.ts }),
    `review:1:${REVIEW_ONE}`
  );

  body = stampEntryMarker(body, 'review', REVIEW_ONE);
  assert.equal(latestStageEntry(body, 'review').visit, 1, 'same-state retry retains its visit');

  body = stampEntryMarker(body, 'test', '2026-07-29T10:30:00.000Z');
  body = stampEntryMarker(body, 'review', REVIEW_TWO);
  const reentered = latestStageEntry(body, 'review');
  assert.deepEqual(reentered, { stage: 'review', visit: 2, ts: REVIEW_TWO });
  assert.equal(
    reviewEpochId({ visit: reentered.visit, enteredReviewAt: reentered.ts }),
    `review:2:${REVIEW_TWO}`
  );
});

test('Agent Review proof binds the Review epoch and the revision Test actually verified', () => {
  const epoch = `review:1:${REVIEW_ONE}`;
  const body = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${VERIFIED_SHA}" ts="2026-07-29T09:59:00.000Z" -->`,
    '## Definition of Done',
    '',
    '- [ ] Agent Review Passed',
  ].join('\n');

  const stamped = stampAgentReviewPassed(body, {
    epoch,
    verifiedSha: parseDodVerifiedMarker(body).sha,
    ts: '2026-07-29T10:01:00.000Z',
    validators: ['timing-log-sequence', 'required-comments'],
  });
  const proof = parseReviewAuthority(stamped).proofs.at(-1);

  assert.deepEqual(proof && { epoch: proof.epoch, sha: proof.sha, result: proof.result }, {
    epoch,
    sha: VERIFIED_SHA,
    result: 'pass',
  });
  assert.match(stamped, new RegExp(`gate="agent-review"[^>]*sha="${VERIFIED_SHA}"`));
  assert.doesNotMatch(stamped, /sha="sandbox"/);
});

test('Agent Review cannot emit a versioned passing proof without recorded Test evidence', () => {
  const stamped = stampAgentReviewPassed('- [ ] Agent Review Passed', {
    epoch: `review:1:${REVIEW_ONE}`,
    ts: '2026-07-29T10:01:00.000Z',
    validators: ['required-comments'],
  });

  assert.equal(parseReviewAuthority(stamped).proofs.length, 0);
});

test('Test pins the sandbox worktree and recorded evidence to one selected revision', async () => {
  let body = [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `node --version`',
  ].join('\n');
  const created = [];
  const result = await runVerbTest({
    cfg: { repo: 'o/r' },
    issueNumber: 1050,
    projectDir: process.cwd(),
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { body };
      },
      postComment: async () => {},
      getHeadSha: async () => VERIFIED_SHA,
      createWorktree: async (args) => created.push(args),
      removeWorktree: async () => {},
      npmCi: async () => {},
      execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '' }),
      moveState: async () => ({ ok: true }),
    },
    now: () => '2026-07-29T09:59:00.000Z',
  });

  assert.equal(result.status, 'passed');
  assert.equal(created.length, 1);
  assert.equal(created[0].sha, VERIFIED_SHA);
  assert.equal(parseDodVerifiedMarker(body).sha, VERIFIED_SHA);
});

test('Review validates Test evidence only from persisted Test markers', () => {
  const matching = validatePersistedTestEvidence(
    [
      `<!-- aitm-test-started sha="${VERIFIED_SHA}" ts="2026-07-29T09:00:00.000Z" -->`,
      `<!-- aitm-dod-verified sha="${VERIFIED_SHA}" ts="2026-07-29T09:59:00.000Z" -->`,
    ].join('\n')
  );
  assert.deepEqual(matching, { ok: true, sha: VERIFIED_SHA });

  const mismatch = validatePersistedTestEvidence(
    [
      `<!-- aitm-test-started sha="old1234" ts="2026-07-29T09:00:00.000Z" -->`,
      `<!-- aitm-dod-verified sha="${VERIFIED_SHA}" ts="2026-07-29T09:59:00.000Z" -->`,
    ].join('\n')
  );
  assert.deepEqual(mismatch, { ok: false, reason: 'test-evidence-sha-mismatch' });

  assert.deepEqual(
    validatePersistedTestEvidence(`<!-- aitm-test-started sha="${VERIFIED_SHA}" ts="t" -->`),
    { ok: false, reason: 'test-evidence-missing' }
  );
});

test('Review refuses a passing stamp when Test evidence changes after preflight', () => {
  const initiallyValidated = [
    `<!-- aitm-test-started sha="${VERIFIED_SHA}" ts="2026-07-29T09:00:00.000Z" -->`,
    `<!-- aitm-dod-verified sha="${VERIFIED_SHA}" ts="2026-07-29T09:59:00.000Z" -->`,
  ].join('\n');
  assert.equal(validatePersistedTestEvidence(initiallyValidated).ok, true);

  const changedPassBase = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    '<!-- aitm-test-started sha="old1234" ts="2026-07-29T09:00:00.000Z" -->',
    `<!-- aitm-dod-verified sha="${VERIFIED_SHA}" ts="2026-07-29T09:59:00.000Z" -->`,
    '- [ ] Agent Review Passed',
  ].join('\n');
  const prepared = prepareAgentReviewPassStamp({
    body: changedPassBase,
    ts: '2026-07-29T10:01:00.000Z',
    validators: ['required-comments'],
  });

  assert.deepEqual(prepared, { ok: false, reason: 'test-evidence-sha-mismatch' });
});
