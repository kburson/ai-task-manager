// @story #279
// Unit tests for the review-exit guards introduced in #279:
//   - reviewExitReviewApprovedGuard (lib/review-exit-review-approved-guard.mjs)
//   - reviewExitCloseGatesGuard     (lib/review-exit-close-gates-guard.mjs)
//
// Asserts:
//   1. Each guard's pure behavior in isolation (with mocked close-gates deps).
//   2. Each guard short-circuits when ctx.toState !== 'done' (rollback /
//      bounce-back semantics — does NOT fire on review → test).
//   3. Both guards are wired into STATES.review.exitGuards in the correct
//      order, alongside blockedByGuard and childCannotLeadEpicExitGuard.
//   4. runGuards('review', 'done', ctx) surfaces refusals from both, and
//      forwards the dirtyCheckSkipped signal via the warn channel.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reviewExitReviewApprovedGuard } from '../../../lib/review-exit-review-approved-guard.mjs';
import { reviewExitCloseGatesGuard } from '../../../lib/review-exit-close-gates-guard.mjs';
import { STATES } from '../../../states/index.mjs';
import { runGuards } from '../../../lib/guard-registry.mjs';
import '../../../lib/guard-bootstrap.mjs';

// `lifecycleCheckboxesRequired: false` bypasses the body-gates-entry-done
// lifecycle gate so these tests can focus on the review-exit migration
// without re-stamping a full passed-final-review tick + proof marker. The
// body-gates entry guard is tested independently in its own suite.
const CFG = { repo: 'owner/name', projectId: 'PVT', lifecycleCheckboxesRequired: false };

// Build a body that passes:
//   - chainIntegrityGate (all REQUIRED_CHAIN_STAGES entry markers + no illegal arcs)
//   - markerPresentGate (aitm-dod-verified)
//   - shaFreshGate (marker SHA == HEAD SHA via deps.getHeadSha)
//   - reviewExitReviewApprovedGuard (aitm-review-approved)
const HEAD_SHA = 'abcdef1234567';
function makeApprovedBody({ withApproved = true, withDod = true } = {}) {
  return [
    '## Scope',
    '',
    '<!-- aitm-entered-backlog: 2026-06-07T05:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-06-07T05:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-06-07T05:45:00Z -->',
    '<!-- aitm-entered-develop: 2026-06-07T06:00:00Z -->',
    '<!-- aitm-entered-test: 2026-06-07T06:30:00Z -->',
    '<!-- aitm-entered-review: 2026-06-07T07:00:00Z -->',
    '<!-- aitm-plan-approved: 2026-06-07T06:00:00Z -->',
    withDod ? `<!-- aitm-dod-verified: ${HEAD_SHA}:2026-06-07T07:30:00Z -->` : '',
    withApproved ? '<!-- aitm-review-approved: 2026-06-07T08:00:00Z -->' : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

// deps.closeGates that returns deterministic results — no real git / gh.
// `commits` comment carries one SHA so commitsOnTrunkGate + issueDirtyGate
// can exercise both ok / dirty paths via the dirtyFiles override.
// #733 — commitsOnTrunkGate is trunk-scoped MESSAGE attribution now; inject
// `attributingCommits` (default: an attributed [#N] commit exists on trunk).
function makeCloseGatesDeps({ dirty = [], attributedOnTrunk = true } = {}) {
  return {
    // #877 — review exit now runs reviewExitEpicChildrenDoneGuard. These
    // fixtures are leaf issues, so stub the children fetch to empty; without
    // the stub the gate would reach the live GraphQL client.
    epicChildren: { fetchSiblings: async () => [] },
    closeGates: {
      getHeadSha: async () => HEAD_SHA,
      commitsSince: async () => [],
      listComments: async () => [
        {
          id: 'cmt_commits',
          body: ['### 🔗 Commits', '', `<!-- aitm-commits: ${HEAD_SHA} -->`, ''].join('\n'),
        },
      ],
      filesForSha: async () => ['scripts/example.mjs'],
      dirtyFiles: async () => new Set(dirty),
      resolveTrunkRef: async () => 'refs/heads/main',
      attributingCommits: async () =>
        attributedOnTrunk ? [{ sha: HEAD_SHA, subject: '[#279] feat', ts: 't' }] : [],
    },
  };
}

// ── reviewExitReviewApprovedGuard ───────────────────────────────────────────

test('reviewExitReviewApprovedGuard: body with marker → ok', () => {
  const r = reviewExitReviewApprovedGuard.run({
    toState: 'done',
    body: makeApprovedBody(),
  });
  assert.deepEqual(r, { ok: true });
});

test('reviewExitReviewApprovedGuard: missing marker, toState=done → refuse', () => {
  const r = reviewExitReviewApprovedGuard.run({
    toState: 'done',
    body: makeApprovedBody({ withApproved: false }),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /aitm-review-approved/);
  assert.match(r.reason, /\/task approve/);
});

test('reviewExitReviewApprovedGuard: missing marker, toState=test (rollback) → ok', () => {
  // Bounce-backs out of review must NOT require fresh review-approved markers.
  const r = reviewExitReviewApprovedGuard.run({
    toState: 'test',
    body: makeApprovedBody({ withApproved: false }),
  });
  assert.deepEqual(r, { ok: true });
});

test('reviewExitReviewApprovedGuard: empty body → refuse', () => {
  const r = reviewExitReviewApprovedGuard.run({ toState: 'done' });
  assert.deepEqual(r, { ok: true }); // fail-open without body (other guards surface real cause)
});

// ── reviewExitCloseGatesGuard ───────────────────────────────────────────────

test('reviewExitCloseGatesGuard: toState=test (rollback) → ok regardless of body', async () => {
  const r = await reviewExitCloseGatesGuard.run({
    toState: 'test',
    cfg: CFG,
    issueNumber: 279,
    body: '',
  });
  assert.deepEqual(r, { ok: true });
});

test('reviewExitCloseGatesGuard: missing cfg/issueNumber/body → fail-open', async () => {
  const r1 = await reviewExitCloseGatesGuard.run({ toState: 'done' });
  assert.deepEqual(r1, { ok: true });
  const r2 = await reviewExitCloseGatesGuard.run({ toState: 'done', cfg: CFG });
  assert.deepEqual(r2, { ok: true });
});

test('reviewExitCloseGatesGuard: clean body + clean deps → ok', async () => {
  const r = await reviewExitCloseGatesGuard.run({
    toState: 'done',
    cfg: CFG,
    issueNumber: 279,
    body: makeApprovedBody(),
    deps: makeCloseGatesDeps(),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('reviewExitCloseGatesGuard: missing aitm-dod-verified marker → refuse', async () => {
  const r = await reviewExitCloseGatesGuard.run({
    toState: 'done',
    cfg: CFG,
    issueNumber: 279,
    body: makeApprovedBody({ withDod: false }),
    deps: makeCloseGatesDeps(),
  });
  assert.equal(r.ok, false);
  assert.ok(
    (r.blockers || []).some((b) => /close-marker-missing/.test(b)),
    `expected close-marker-missing blocker; got ${JSON.stringify(r.blockers)}`
  );
});

test('reviewExitCloseGatesGuard: dirty overlap → refuse with close-dirty-touched blocker', async () => {
  const r = await reviewExitCloseGatesGuard.run({
    toState: 'done',
    cfg: CFG,
    issueNumber: 279,
    body: makeApprovedBody(),
    deps: makeCloseGatesDeps({ dirty: ['scripts/example.mjs'] }),
  });
  assert.equal(r.ok, false);
  assert.ok(
    (r.blockers || []).some((b) => /close-dirty-touched/.test(b)),
    `expected close-dirty-touched blocker; got ${JSON.stringify(r.blockers)}`
  );
});

// ── states/review.mjs wiring ────────────────────────────────────────────────

test('STATES.review.exitGuards: includes review-exit-review-approved', () => {
  const ids = STATES.review.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('review-exit-review-approved'),
    `expected review-exit-review-approved in [${ids.join(', ')}]`
  );
});

test('STATES.review.exitGuards: includes review-exit-close-gates', () => {
  const ids = STATES.review.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('review-exit-close-gates'),
    `expected review-exit-close-gates in [${ids.join(', ')}]`
  );
});

test('STATES.review.exitGuards: includes child-cannot-lead-epic-exit', () => {
  // Parent-admission / children-closed coverage is provided by the
  // cross-cutting guard (#356).
  const ids = STATES.review.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('child-cannot-lead-epic-exit'),
    `expected child-cannot-lead-epic-exit in [${ids.join(', ')}]`
  );
});

test('STATES.review.exitGuards: blockedBy runs before review-exit guards', () => {
  const ids = STATES.review.exitGuards.map((g) => g.id);
  const blocked = ids.indexOf('blocked-by-not-done');
  const approved = ids.indexOf('review-exit-review-approved');
  const close = ids.indexOf('review-exit-close-gates');
  assert.ok(blocked !== -1 && approved !== -1 && close !== -1);
  assert.ok(
    blocked < approved,
    `blocked-by should run before review-approved; got [${ids.join(', ')}]`
  );
  assert.ok(blocked < close, `blocked-by should run before close-gates; got [${ids.join(', ')}]`);
});

test('STATES.review.exitGuards: epic-children-done runs before close-gates (#877)', () => {
  // Ordering is deliberate: the children check is a cheap structural read, the
  // close-gates guard shells out to git. An operator closing an epic with open
  // children should see that refusal first.
  const ids = STATES.review.exitGuards.map((g) => g.id);
  const children = ids.indexOf('review-exit-epic-children-done');
  const close = ids.indexOf('review-exit-close-gates');
  assert.ok(children !== -1, `review-exit-epic-children-done missing; got [${ids.join(', ')}]`);
  assert.ok(
    children < close,
    `epic-children-done should run before close-gates; got [${ids.join(', ')}]`
  );
});

// ── runGuards integration ────────────────────────────────────────────────────

test('runGuards(review,done): missing review-approved marker → refusal surfaces from registry', async () => {
  const r = await runGuards('review', 'done', {
    issueNumber: 279,
    repo: 'owner/name',
    fromState: 'review',
    toState: 'done',
    body: makeApprovedBody({ withApproved: false }),
    cfg: CFG,
    deps: makeCloseGatesDeps(),
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, false);
  const ids = r.refusals.map((x) => x.id);
  assert.ok(ids.includes('review-exit-review-approved'), JSON.stringify(r));
});

test('runGuards(review,test): rollback bypasses review-exit-done guards', async () => {
  const r = await runGuards('review', 'test', {
    issueNumber: 279,
    repo: 'owner/name',
    fromState: 'review',
    toState: 'test',
    body: makeApprovedBody({ withApproved: false, withDod: false }),
    cfg: CFG,
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});

test('runGuards(review,done): approved + clean deps → ok', async () => {
  const r = await runGuards('review', 'done', {
    issueNumber: 279,
    repo: 'owner/name',
    fromState: 'review',
    toState: 'done',
    body: makeApprovedBody(),
    cfg: CFG,
    deps: makeCloseGatesDeps(),
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});

test('runGuards(review,done): no commits trail → dirtyCheckSkipped warn surfaces', async () => {
  // listComments returns no commit-trail comment, so issueDirtyGate skips.
  const r = await runGuards('review', 'done', {
    issueNumber: 279,
    repo: 'owner/name',
    fromState: 'review',
    toState: 'done',
    body: makeApprovedBody(),
    cfg: CFG,
    deps: {
      ...makeCloseGatesDeps(),
      closeGates: {
        ...makeCloseGatesDeps().closeGates,
        listComments: async () => [],
      },
    },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
  const warn = (r.warns || []).find((w) => w.id === 'review-exit-close-gates');
  assert.ok(warn, `expected a warn from review-exit-close-gates; got ${JSON.stringify(r)}`);
  assert.equal(warn.warn.dirtyCheckSkipped, 'no-commits-marker');
});
