// @story #1667
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';

const ISSUE = 1667;
const REPOSITORY = 'example/project';
const HEAD = 'a'.repeat(40);
const now = () => '2026-09-21T21:20:00.000Z';
const bodyDigest = (body) => `sha256:${createHash('sha256').update(body).digest('hex')}`;

const bodyFor = (state) => `## User Story
As a review operator
I want to inspect Review readiness
So that explanation never performs reviewer work

## Scope
Review readiness is explained without effects.

## Acceptance Criteria
- [x] Review entry is explainable. <!-- aitm-verified cmd="node --test review.test.mjs" -->

## Verification Commands
- [x] \`node --test review.test.mjs\`

<!-- aitm-last-known-state state="${state}" ts="2026-09-21T21:20:00Z" -->`;

function fixture({
  state = 'test',
  issueBody = bodyFor(state),
  boardState = state,
  preflight = null,
  worktree = { matches: true, headSha: HEAD, clean: true },
  resident = { status: 'incomplete', reason: 'review-entry-missing' },
  runGuards,
  genericGuards = null,
  unreadable = null,
} = {}) {
  const scope = computeScopeIdentity({ repository: REPOSITORY, issue: ISSUE, body: issueBody });
  const effectivePreflight = preflight ?? {
    ok: true,
    reasons: [],
    headSha: HEAD,
    bodyDigest: bodyDigest(issueBody),
  };
  const effects = [];
  const decision = async (actionId) => {
    const attempt = createObservationAttempt({
      repository: REPOSITORY,
      issue: ISSUE,
      boundaryId: `action:${actionId}:${ISSUE}`,
      now,
      read: async (request) => {
        if (request.resource === unreadable) return undefined;
        const value = {
          'issue-body': { number: ISSUE, body: issueBody },
          'project-board': { state: boardState },
          worktree,
          'session-state': { active: '#1667', paused: false },
          delivery: { preflight: effectivePreflight },
        }[request.resource];
        return { ...request, value };
      },
    });
    return evaluateAction({
      actionId,
      repository: REPOSITORY,
      issue: ISSUE,
      inputs: { body: issueBody, state, head: HEAD, config: { repo: REPOSITORY } },
      attempt,
      deps: {
        ...(genericGuards ? { runReadOnlyGuards: genericGuards } : {}),
        effectAttempts: () => effects,
        reviewPorts: {
          scope,
          projectDir: process.cwd(),
          verifyResident: async () => resident,
          runGuards:
            runGuards ??
            (async () => ({
              ok: true,
              status: 'ready',
              refusals: [],
              humanDecision: null,
            })),
        },
      },
    });
  };
  return { decision, effects };
}

test('direct Review and Test-state Promote share ready evidence without effects', async () => {
  const direct = fixture();
  const delegated = fixture();
  const directDecision = await direct.decision('review');
  const delegatedDecision = await delegated.decision('promote');
  assert.equal(directDecision.status, 'ready', JSON.stringify(directDecision));
  assert.equal(delegatedDecision.status, 'ready', JSON.stringify(delegatedDecision));
  assert.deepEqual(directDecision.blockers, delegatedDecision.blockers);
  assert.deepEqual(direct.effects, []);
  assert.deepEqual(delegated.effects, []);
});

test('Review routing uses its complete collector even when generic guards are available', async () => {
  const item = fixture({
    genericGuards: async () => {
      throw new Error('generic guards must not replace Review collection');
    },
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.deepEqual(item.effects, []);
});

test('Review explanation refuses stale HEAD, unreadable evidence, and board drift', async (t) => {
  for (const [name, options, code] of [
    [
      'stale HEAD',
      { worktree: { matches: true, headSha: 'b'.repeat(40) } },
      'authority-read-failed',
    ],
    ['unreadable preflight', { unreadable: 'delivery' }, 'authority-read-failed'],
    ['board drift', { boardState: 'develop' }, 'state-unavailable'],
  ]) {
    await t.test(name, async () => {
      const item = fixture(options);
      const decision = await item.decision('review');
      assert.equal(decision.status, 'indeterminate');
      assert.ok(decision.blockers.some((blocker) => blocker.code === code));
      assert.deepEqual(item.effects, []);
    });
  }
});

test('Review preserves simultaneous typed preflight refusals without exposing prose', async () => {
  const item = fixture({
    preflight: {
      ok: false,
      headSha: HEAD,
      bodyDigest: bodyDigest(bodyFor('test')),
      reasons: [
        'tracked worktree changes are uncommitted',
        "missing canonical `### 🔗 Commits` comment recording this issue's commit trail",
      ],
    },
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'blocked');
  assert.deepEqual(
    decision.blockers.map(({ code, args }) => ({ code, category: args.category })),
    [
      { code: 'review-preflight-refused', category: 'worktree-dirty' },
      { code: 'review-preflight-refused', category: 'commit-trail' },
    ]
  );
  assert.doesNotMatch(JSON.stringify(decision), /tracked worktree changes|canonical/);
  assert.deepEqual(item.effects, []);
});

test('Review retains independent preflight and completeness blockers together', async () => {
  const item = fixture({
    preflight: {
      ok: false,
      headSha: HEAD,
      bodyDigest: bodyDigest(bodyFor('test')),
      reasons: ['tracked worktree changes are uncommitted'],
    },
    runGuards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'test-exit-pre-close-completeness',
          guardId: 'test-exit-pre-close-completeness',
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      humanDecision: null,
    }),
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'blocked');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['review-preflight-refused', 'unclassified-refusal']
  );
});

test('Review does not accept a contradictory successful preflight carrying refusals', async () => {
  const item = fixture({
    preflight: {
      ok: true,
      headSha: HEAD,
      bodyDigest: bodyDigest(bodyFor('test')),
      reasons: ['tracked worktree changes are uncommitted'],
    },
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(decision.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('Review refuses a preflight computed from a different issue-body revision', async () => {
  const item = fixture({
    preflight: {
      ok: true,
      reasons: [],
      headSha: HEAD,
      bodyDigest: `sha256:${'b'.repeat(64)}`,
    },
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(decision.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('Review reports a projected Functional DoD normalization without persistence', async () => {
  const issueBody = bodyFor('test').replace(
    '<!-- aitm-last-known-state',
    `## Definition of Done

### Functional (verified at Test)
- [x] All automated tests pass <!-- dod:functional:tests -->
- [x] Lint and format checks pass <!-- dod:functional:lint -->
- [x] All changes committed <!-- dod:functional:commits -->
- [ ] Acceptance criteria met <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (verified at Review)
- [ ] Agent Review Passed

### Housekeeping (verified at Close)
- [ ] Story closed and moved to Done

<!-- aitm-last-known-state`
  );
  const item = fixture({ issueBody });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.equal(decision.normalizations[0].normalizerId, 'functional-dod-derived/v1');
  assert.deepEqual(item.effects, []);
});

test('Review guards receive the current directory-backed Test evidence from preflight', async () => {
  const evidence = { sourceKind: 'github-records/v1', acceptedRecordIds: ['test-record'] };
  const item = fixture({
    preflight: {
      ok: true,
      reasons: [],
      headSha: HEAD,
      bodyDigest: bodyDigest(bodyFor('test')),
      lifecycleEvidence: evidence,
    },
    runGuards: async (_from, _to, context) =>
      context.lifecycleEvidence?.acceptedRecordIds?.[0] === 'test-record'
        ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
        : {
            ok: false,
            status: 'blocked',
            refusals: [
              {
                id: 'test-exit-dod-verified',
                guardId: 'test-exit-dod-verified',
                code: 'unclassified-refusal',
                args: {},
                noAutomaticRemediation: {
                  reason: 'legacy-guard-requires-human-investigation',
                },
              },
            ],
            humanDecision: null,
          },
  });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
});

test('real Test-to-Review guards refuse missing exact-HEAD Test proof and incomplete ACs', async () => {
  const issueBody = bodyFor('test').replace('- [x] Review entry', '- [ ] Review entry');
  const item = fixture({ issueBody, runGuards });
  const decision = await item.decision('review');
  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.ok(decision.blockers.some(({ guardId }) => guardId === 'test-exit-dod-verified'));
  assert.ok(
    decision.blockers.some(({ guardId }) => guardId === 'test-exit-pre-close-completeness')
  );
  assert.deepEqual(item.effects, []);
});

test('Review resident reruns only incomplete evidence and does not recommend close', async () => {
  const incomplete = fixture({ state: 'review' });
  const pending = fixture({ state: 'review', resident: { status: 'complete' } });
  assert.equal((await incomplete.decision('review')).status, 'ready');
  assert.notEqual((await pending.decision('review')).status, 'ready');
  assert.deepEqual(incomplete.effects, []);
  assert.deepEqual(pending.effects, []);
});

test('Review-state Promote selects a Review rerun only from current resident evidence', async () => {
  const incomplete = fixture({ state: 'review' });
  const complete = fixture({ state: 'review', resident: { status: 'complete' } });
  const rerun = await incomplete.decision('promote');
  const afterComplete = await complete.decision('promote');
  assert.equal(rerun.status, 'ready', JSON.stringify(rerun));
  assert.equal(rerun.actionId, 'review');
  assert.ok(rerun.guidanceIds.includes('action.review'));
  assert.notEqual(afterComplete.status, 'ready');
  assert.deepEqual(incomplete.effects, []);
  assert.deepEqual(complete.effects, []);
});

test('live Review read adapter refreshes issue, board, HEAD, and preflight at this boundary', async () => {
  const { evaluateReviewReadiness } =
    await import('../../../../task-tracker/lib/action-decision/review.mjs');
  const reads = [];
  const result = await evaluateReviewReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY },
    projectDir: process.cwd(),
    deps: {
      readBody: async () => {
        reads.push('body');
        return bodyFor('test');
      },
      readHead: async () => {
        reads.push('head');
        return HEAD;
      },
      fetchBoard: async () => {
        reads.push('board');
        return { state: 'test' };
      },
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
      readSessionState: async () => ({ active: '#1667' }),
      runPreflight: async () => {
        reads.push('preflight');
        return { ok: true, reasons: [], headSha: HEAD, bodyDigest: bodyDigest(bodyFor('test')) };
      },
      runGuards: async () => ({
        ok: true,
        status: 'ready',
        refusals: [],
        humanDecision: null,
      }),
    },
  });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(reads, ['body', 'head', 'body', 'board', 'preflight']);
  assert.ok(result.bundle.observations.some(({ resource }) => resource === 'delivery'));
});

test('live Review-state adapter selects a rerun only after current semantic policy is read', async () => {
  const { evaluateReviewReadiness } =
    await import('../../../../task-tracker/lib/action-decision/review.mjs');
  const result = await evaluateReviewReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY },
    projectDir: process.cwd(),
    deps: {
      readBody: async () => bodyFor('review'),
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'review' }),
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
      readSessionState: async () => ({ active: '#1667' }),
      runPreflight: async () => ({
        ok: true,
        reasons: [],
        headSha: HEAD,
        bodyDigest: bodyDigest(bodyFor('review')),
      }),
      loadWorkflowBoundary: async () => ({
        status: 'policy-compatible',
        isWaived: () => false,
      }),
    },
  });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(result.selectedAction, 'review');
  assert.ok(result.bundle.observations.some(({ resource }) => resource === 'workflow-policy'));
  assert.ok(
    result.bundle.observations.some(
      ({ resource, identity }) => resource === 'delivery' && identity === `evidence:${ISSUE}:3`
    )
  );
});

test('live Review-state policy read failure is typed indeterminate, never a rerun grant', async () => {
  const { evaluateReviewReadiness } =
    await import('../../../../task-tracker/lib/action-decision/review.mjs');
  const result = await evaluateReviewReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY },
    projectDir: process.cwd(),
    deps: {
      readBody: async () => bodyFor('review'),
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'review' }),
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
      readSessionState: async () => ({ active: '#1667' }),
      runPreflight: async () => ({
        ok: true,
        reasons: [],
        headSha: HEAD,
        bodyDigest: bodyDigest(bodyFor('review')),
      }),
      loadWorkflowBoundary: async () => {
        throw new Error('policy transport offline');
      },
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});
