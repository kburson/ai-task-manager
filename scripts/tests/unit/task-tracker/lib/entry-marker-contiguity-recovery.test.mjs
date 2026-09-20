// @story #544
//
// Regression coverage for the entry-marker contiguity-hole defect: a forward
// move-state stamps the board first and the `aitm-entered-<stage>` marker
// second, best-effort. When the marker write fails the board advances with no
// recorded entry, leaving a silent hole that later blocks a forward promotion —
// and `reconcile` (board-vs-recorded only) could not repair it.
//
// AC2 — gap repro: a chain missing its middle prefix refuses on the next
//        forward move, and pre-fix reconcile (accept-live, board==recorded)
//        returns `no-drift-refused` — proving the recovery gap.
// AC3 — `stampEntryMarkers` posts a DURABLE failure-audit comment (naming the
//        `reconcile backfill` recovery) instead of swallowing to stderr.
// AC4 — `reconcile backfill` stamps every missing prior-stage marker.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stampEntryMarker,
  evaluateContiguity,
  verifyChainIntegrity,
} from '../../../../task-tracker/lib/stage-entry-markers.mjs';
import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { runReconcile } from '../../../../task-tracker/verbs/reconcile.mjs';
import {
  stampEntryMarkers,
  buildStampFailureCommentBody,
  postStampFailureAudit,
} from '../../../../task-tracker/lib/move-state/github-mutation.mjs';

const CFG = { repo: 'kburson/ai-task-manager', projectId: 'P', kanbanFieldId: 'F' };

// A body wedged at `develop` whose chain is missing the `refine` and `plan`
// entry markers (backlog and develop were stamped, the middle never recorded).
function gapBody() {
  let body = 'Issue body.\n';
  body = stampEntryMarker(body, 'backlog', '2026-06-01T00:00:00.000Z');
  body = stampEntryMarker(body, 'develop', '2026-06-04T00:00:00.000Z');
  body = writeLastKnownState(body, 'develop');
  return body;
}

// ---------------------------------------------------------------------------
// AC2 — the gap blocks a forward promotion, and pre-fix reconcile can't help.
// ---------------------------------------------------------------------------

test('AC2: a mid-chain hole refuses the next forward move (develop → test)', () => {
  const body = gapBody();
  const decision = evaluateContiguity({ fromState: 'develop', toState: 'test', body });
  assert.equal(decision.action, 'refuse');
  assert.ok(decision.missing.includes('refine'), 'refine flagged missing');
  assert.ok(decision.missing.includes('plan'), 'plan flagged missing');
});

test('AC2: reconcile accept-live returns no-drift-refused when board == recorded', async () => {
  const body = gapBody();
  const res = await runReconcile({
    issueNumber: 544,
    mode: 'accept-live',
    cfg: CFG,
    deps: {
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => 'develop',
      writeIssueBody: async () => {
        throw new Error('should not write — no drift to reconcile');
      },
    },
  });
  // Board and recorded both say "develop", so the historical marker hole is
  // invisible to drift-based reconcile: it refuses with no repair.
  assert.equal(res.status, 'no-drift-refused');
});

// ---------------------------------------------------------------------------
// AC3 — stamp failure posts a durable audit comment instead of swallowing.
// ---------------------------------------------------------------------------

test('AC3: stampEntryMarkers posts a failure-audit comment on stamp failure', async () => {
  const posted = [];
  await assert.rejects(
    stampEntryMarkers({
      issueArg: '544',
      stateArg: 'develop',
      cfg: CFG,
      SKIP_NETWORK: false,
      // Force the fresh-base mutation to throw → drives the catch path.
      _mutateBody: async () => {
        throw new Error('gh view exploded');
      },
      gh: async () => {
        throw new Error('gh should not be the audit poster in this test');
      },
      postComment: async ({ issueNumber, repo, body }) => {
        posted.push({ issueNumber, repo, body });
      },
    }),
    /gh view exploded/
  );
  assert.equal(posted.length, 1, 'exactly one audit comment posted');
  assert.equal(posted[0].issueNumber, '544');
  assert.match(posted[0].body, /Entry-marker stamp FAILED/);
  assert.match(posted[0].body, /aitm promote #544/);
  assert.match(posted[0].body, /aitm-stamp-failure stage="develop"/);
});

test('Plan → Develop scope drift from the real marker writer is never swallowed', async () => {
  const original =
    '## User Story\n\nAs a maintainer\nI want durable authority\nSo that transitions are auditable\n\n## Scope\n\nOriginal scope.\n\n## Acceptance Criteria\n\n- [ ] Evidence persists.\n';
  const drifted = original.replace('Original scope.', 'Changed scope.');
  const posted = [];

  await assert.rejects(
    stampEntryMarkers({
      issueArg: '1720',
      stateArg: 'develop',
      resolvedFromState: 'plan',
      transitionId: 'move:11111111-1111-4111-8111-111111111111',
      cfg: CFG,
      SKIP_NETWORK: false,
      planTransitionAuthority: {
        record: {
          scopeIdentity: computeScopeIdentity({
            repository: CFG.repo,
            issue: 1720,
            body: original,
          }),
        },
      },
      _mutateBody: async ({ mutate, validateFreshBase }) => {
        validateFreshBase(drifted);
        mutate(drifted);
        throw new Error('mutation must not reach persistence');
      },
      postComment: async (comment) => posted.push(comment),
    }),
    /plan-transition-authority:scope-drift-before-entry/
  );
  assert.equal(posted.length, 0, 'authority refusal is not downgraded to a recovery audit');
});

test('Plan → Develop scope validation reruns after a non-overlapping conflict rebase', async () => {
  const source =
    '## User Story\n\nAs a maintainer\nI want durable authority\nSo that transitions are auditable\n\n## Scope\n\nOriginal scope.\n\n## Acceptance Criteria\n\n- [ ] Evidence persists.\n\nUnrelated tail.\n';
  const transitionId = 'move:11111111-1111-4111-8111-111111111111';
  const original = writeLastKnownState(
    stampEntryMarker(source, 'develop', '2026-09-19T15:22:16.000Z', transitionId),
    'develop'
  ).replace(/(aitm-last-known-state[^>]*\bts=")[^"]+/, '$12026-01-01T00:00:00.000Z');
  const drifted = original.replace('Original scope.', 'Changed scope.');
  let remote = stampBodyVersion(original, 1);
  let pushes = 0;
  const deps = {
    fetchBody: async () => remote,
    pushBody: async (_repo, _issue, next) => {
      pushes += 1;
      remote = pushes === 1 ? stampBodyVersion(drifted, 2) : next;
    },
  };

  await assert.rejects(
    stampEntryMarkers({
      issueArg: '1720',
      stateArg: 'develop',
      resolvedFromState: 'plan',
      transitionId,
      cfg: CFG,
      SKIP_NETWORK: false,
      planTransitionAuthority: {
        record: {
          scopeIdentity: computeScopeIdentity({
            repository: CFG.repo,
            issue: 1720,
            body: original,
          }),
        },
      },
      _mutateBody: (args) => mutateIssueBody({ ...args, deps }),
    }),
    /plan-transition-authority:scope-drift-before-entry/
  );
  assert.equal(pushes, 1, 'rebased stale authority must be refused before a second push');
});

test('AC3: failure-comment body names the stage, error and recovery command', () => {
  const body = buildStampFailureCommentBody({
    issueNumber: 99,
    stage: 'plan',
    error: 'timeout after 30s',
  });
  assert.match(body, /into `plan` was refused before Status/);
  assert.match(body, /timeout after 30s/);
  assert.match(body, /npx aitm promote #99/);
});

test('AC3: postStampFailureAudit degrades (no throw) when the post itself fails', async () => {
  const res = await postStampFailureAudit({
    issueNumber: 1,
    repo: CFG.repo,
    stage: 'develop',
    error: 'x',
    postComment: async () => {
      throw new Error('comment API down');
    },
  });
  assert.equal(res.mode, 'error');
  assert.equal(res.error, 'comment API down');
});

// ---------------------------------------------------------------------------
// AC4 — reconcile backfill stamps every missing prior-stage marker.
// ---------------------------------------------------------------------------

test('AC4: reconcile backfill fills the missing prior-stage markers', async () => {
  const body = gapBody();
  // Confirm the precondition: Refine, Ready for Planning, and Plan are holes.
  const rawHoles = verifyChainIntegrity(body, 'develop').holes;
  assert.ok(
    rawHoles.includes('refine') && rawHoles.includes('ready-for-plan') && rawHoles.includes('plan')
  );

  let written = null;
  const res = await runReconcile({
    issueNumber: 544,
    mode: 'backfill',
    cfg: CFG,
    deps: {
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => 'develop',
      writeIssueBody: async ({ body: b }) => {
        written = b;
      },
      persistTrackerState: () => {},
    },
  });

  assert.equal(res.status, 'backfilled');
  assert.equal(res.stage, 'develop');
  assert.deepEqual(res.filled, ['refine', 'plan']);
  assert.ok(written, 'a repaired body was written');
  assert.match(written, /aitm-entered-refine/);
  assert.match(written, /aitm-entered-plan/);
  // The repaired chain has no remaining non-optional holes at develop.
  const remaining = verifyChainIntegrity(written, 'develop').holes.filter(
    (stage) => stage !== 'ready-for-plan'
  );
  assert.deepEqual(remaining, []);
});

test('AC4: reconcile backfill is a no-op when the chain is already contiguous', async () => {
  let body = 'Body.\n';
  for (const [i, stage] of ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop'].entries()) {
    body = stampEntryMarker(body, stage, `2026-06-0${i + 1}T00:00:00.000Z`);
  }
  body = writeLastKnownState(body, 'develop');

  const res = await runReconcile({
    issueNumber: 544,
    mode: 'backfill',
    cfg: CFG,
    deps: {
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => 'develop',
      writeIssueBody: async () => {
        throw new Error('should not write — nothing to backfill');
      },
    },
  });
  assert.equal(res.status, 'no-holes');
});
