// @story #1213
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionPolicyFor,
  backwardTargets,
  isTimingHistoryEdge,
} from '../../../lib/lifecycle-policy/index.mjs';
import { applyRefinementEstimate } from '../../../lib/apply-refinement-estimate.mjs';
import { planPlannedEstimateGate } from '../../../lib/refine-estimate-comment.mjs';
import {
  buildRefinementSnapshotMarker,
  stampRefinementSnapshot,
  verifyRefinementSnapshot,
} from '../../../lib/refinement-snapshot.mjs';
import { refinementSnapshotGuard } from '../../../lib/refinement-snapshot-guard.mjs';
import * as cancelPlanModule from '../../../verbs/cancel-plan.mjs';
import { runRefine } from '../../../verbs/refine.mjs';

const { runCancelPlan } = cancelPlanModule;

const CFG = { repo: 'owner/repo', projectId: 'PVT_PROJECT' };
const TS = '2026-08-12T12:00:00.000Z';

function refinedBody({
  state = 'refine',
  scope = 'Implement the governed R4P boundary.',
  rank = 4,
} = {}) {
  return [
    `<!-- aitm-last-known-state state="${state}" ts="2026-08-12T11:00:00.000Z" -->`,
    `<!-- aitm-refinement-rationale: {"size":"M","estimate":"8","priority":"p1","rank":${rank},"rationale":"current architecture"} -->`,
    '',
    '## Scope',
    '',
    scope,
    '',
    '## Plan Metadata',
    '',
    '- **Depends On**: #1212',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Snapshot is current.',
    '- [ ] Plan cancellation is recoverable.',
    '',
    '## Definition of Done',
    '',
    '- [ ] Acceptance criteria met.',
    '',
    `<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":8,"rank":${rank},"blockedBy":null}} -->`,
    '',
  ].join('\n');
}

test('refinement snapshot records and validates current scope, AC, fields, dependencies, labels, and provenance', () => {
  const body = refinedBody();
  const marker = buildRefinementSnapshotMarker(body, {
    labels: ['enhancement', 'team-ready'],
    ts: TS,
  });
  assert.match(marker, /aitm-refinement-snapshot/);
  assert.match(marker, /schema="1"/);

  const stamped = stampRefinementSnapshot(body, {
    labels: ['team-ready', 'enhancement'],
    ts: TS,
  });
  const verified = verifyRefinementSnapshot(stamped, {
    labels: ['enhancement', 'team-ready'],
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.snapshot.ts, TS);
  assert.deepEqual(verified.snapshot.fields, {
    priority: 'P1',
    size: 'M',
    estimate: 8,
    rank: 4,
    blockedBy: null,
  });
});

test('refinement snapshot fails closed when refinement inputs or labels become stale', () => {
  const stamped = stampRefinementSnapshot(refinedBody(), {
    labels: ['enhancement'],
    ts: TS,
  });
  assert.equal(
    verifyRefinementSnapshot(stamped.replace('governed R4P', 'stale R4P'), {
      labels: ['enhancement'],
    }).ok,
    false
  );
  assert.equal(verifyRefinementSnapshot(stamped, { labels: ['bug'] }).ok, false);
});

test('the Refine success hook may remove transient rationale without invalidating the durable snapshot', async () => {
  let body = stampRefinementSnapshot(refinedBody(), {
    labels: ['enhancement'],
    ts: TS,
  });
  const result = await applyRefinementEstimate({
    cfg: CFG,
    issueNumber: 1213,
    plan: { commentBody: '<!-- aitm-refined-estimate: 1213 -->\n### Refine estimate\n' },
    deps: {
      listCommentBodies: async () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
    },
  });
  assert.equal(result.status, 'posted');
  assert.equal(body.includes('aitm-refinement-rationale'), false);
  assert.equal(verifyRefinementSnapshot(body, { labels: ['enhancement'] }).ok, true);
});

test('refinement snapshot refuses incomplete refinement evidence', () => {
  const missingRank = refinedBody().replace('"rank":4,', '').replace(',"rank":4', '');
  assert.throws(
    () => stampRefinementSnapshot(missingRank, { labels: ['enhancement'], ts: TS }),
    /refinement-snapshot:.*rank/
  );
  assert.throws(
    () => stampRefinementSnapshot(refinedBody(), { labels: [], ts: TS }),
    /refinement-snapshot:.*labels/
  );
});

test('Refine exit guard requires a current snapshot and allows owner-optional R4P parking', async () => {
  const stamped = stampRefinementSnapshot(refinedBody(), {
    labels: ['enhancement'],
    ts: TS,
  });
  const pass = await refinementSnapshotGuard.run({
    toState: 'ready-for-plan',
    body: stamped,
    issueNumber: 1213,
    cfg: CFG,
    deps: {
      refinementSnapshot: {
        fetchLabels: async () => ['enhancement'],
        fetchBoardFields: async () => ({
          priority: 'P1',
          size: 'M',
          estimate: 8,
          rank: 4,
        }),
      },
    },
  });
  assert.deepEqual(pass, { ok: true });

  const fail = await refinementSnapshotGuard.run({
    toState: 'ready-for-plan',
    body: stamped,
    issueNumber: 1213,
    cfg: CFG,
    deps: {
      refinementSnapshot: {
        fetchLabels: async () => ['bug'],
        fetchBoardFields: async () => ({
          priority: 'P1',
          size: 'M',
          estimate: 8,
          rank: 4,
        }),
      },
    },
  });
  assert.equal(fail.ok, false);
  assert.match(fail.reason, /stale refinement snapshot/);
});

test('Refine exit guard refuses body snapshot fields that disagree with the live board', async () => {
  const stamped = stampRefinementSnapshot(refinedBody(), {
    labels: ['enhancement'],
    ts: TS,
  });
  const result = await refinementSnapshotGuard.run({
    toState: 'ready-for-plan',
    body: stamped,
    issueNumber: 1213,
    cfg: CFG,
    deps: {
      refinementSnapshot: {
        fetchLabels: async () => ['enhancement'],
        fetchBoardFields: async () => ({
          priority: 'P1',
          size: 'L',
          estimate: 13,
          rank: 4,
        }),
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /live board fields disagree with refinement snapshot/);
});

test('Refine exit guard refuses a missing live Rank instead of coercing it to rank zero', async () => {
  const stamped = stampRefinementSnapshot(refinedBody({ rank: 0 }), {
    labels: ['enhancement'],
    ts: TS,
  });
  const result = await refinementSnapshotGuard.run({
    toState: 'ready-for-plan',
    body: stamped,
    issueNumber: 1213,
    cfg: CFG,
    deps: {
      refinementSnapshot: {
        fetchLabels: async () => ['enhancement'],
        fetchBoardFields: async () => ({
          priority: 'P1',
          size: 'M',
          estimate: 8,
          rank: null,
        }),
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /live board fields disagree with refinement snapshot/);
});

test('runRefine stamps the snapshot from the final body and exact live labels', async () => {
  let current = refinedBody();
  let promoted = 0;
  await runRefine({
    args: {
      issueNumber: 1213,
      size: 'M',
      estimate: '8',
      priority: 'p1',
      rank: '4',
      labels: 'team-ready',
      reason: 'current architecture',
    },
    cfg: CFG,
    deps: {
      assertBound: () => {},
      tetherIssueToProject: async () => ({}),
      addLabels: async () => {},
      fetchBody: async () => current,
      fetchLabels: async () => ['enhancement', 'team-ready'],
      mutateBody: async ({ mutate }) => {
        current = mutate(current);
        return { status: 'ok' };
      },
      verbPromote: async () => {
        promoted += 1;
      },
    },
  });
  assert.equal(
    verifyRefinementSnapshot(current, { labels: ['team-ready', 'enhancement'] }).ok,
    true
  );
  assert.equal(promoted, 1, 'completed Refine advances one edge to Ready for Planning');
});

test('runRefine refuses R4P and later states before changing fields or body', async () => {
  let tetherWrites = 0;
  let bodyWrites = 0;
  await assert.rejects(
    runRefine({
      args: {
        issueNumber: 1213,
        size: 'M',
        estimate: '8',
        priority: 'p1',
        rank: '4',
        labels: 'enhancement',
        reason: 'attempted stale refresh',
      },
      cfg: CFG,
      deps: {
        assertBound: () => {},
        fetchBody: async () => refinedBody({ state: 'ready-for-plan' }),
        tetherIssueToProject: async () => {
          tetherWrites += 1;
        },
        mutateBody: async () => {
          bodyWrites += 1;
        },
      },
    }),
    /refine: current state ready-for-plan is not Backlog or Refine/
  );
  assert.equal(tetherWrites, 0);
  assert.equal(bodyWrites, 0);
});

test('cancel-plan is the sole governed Plan to R4P one-edge action', () => {
  assert.equal(actionPolicyFor('cancel-plan', 'plan').ok, true);
  assert.equal(actionPolicyFor('cancel-plan', 'plan').target, 'ready-for-plan');
  assert.equal(actionPolicyFor('cancel-plan', 'refine').ok, false);
  assert.ok(backwardTargets('plan').includes('ready-for-plan'));
  assert.equal(isTimingHistoryEdge('plan', 'ready-for-plan'), true);
});

function plannedBody({ rank = 4 } = {}) {
  const refined = stampRefinementSnapshot(refinedBody({ state: 'plan', rank }), {
    labels: ['enhancement'],
    ts: TS,
  });
  return [
    refined,
    '<!-- aitm-deep-dive-posted ts="2026-08-12T12:05:00.000Z" -->',
    '<!-- aitm-deep-dive-complete ts="2026-08-12T12:06:00.000Z" -->',
    '<!-- aitm-estimation-forecast-ready record-id="forecast-record-1213" -->',
    '<!-- aitm-plan-approved ts="2026-08-12T12:07:00.000Z" forecast-record-id="forecast-record-1213" mode="full-auto" -->',
    `<!-- aitm-epic-orchestration-plan schema="1" digest="${'a'.repeat(64)}" payload="e30" -->`,
    '<!-- aitm-test-started sha="abcdef1" ts="2026-08-12T12:08:00.000Z" -->',
    '<!-- aitm-dod-verified sha="abcdef1" ts="2026-08-12T12:09:00.000Z" -->',
  ].join('\n');
}

function fetchPlanBoardFields(overrides = {}) {
  return async () => ({ priority: 'P1', size: 'M', estimate: 8, rank: 4, ...overrides });
}

function plannedEstimateFixture() {
  const comments = [
    {
      id: 42,
      body:
        '<!-- aitm-refined-estimate: 1213 -->\n### Refine estimate\n\n' +
        '### Planned Estimate\n\n| Field | Refine | Plan | Δ |\n|---|---|---|---|\n' +
        '| Size | M | L | M→L |\n| Estimate (h) | 8 | 13 | +5 |\n',
    },
  ];
  return {
    comments,
    deps: {
      listComments: async () => comments,
      patchComment: async ({ commentId, body }) => {
        assert.equal(commentId, 42);
        comments[0].body = body;
      },
    },
  };
}

test('cancel-plan clears Plan-only artifacts while preserving refinement evidence and fields', async () => {
  let body = plannedBody();
  const plannedEstimate = plannedEstimateFixture();
  const originalSnapshot = body.match(/<!-- aitm-refinement-snapshot[^>]+-->/)[0];
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async ({ fields }) => {
        assert.equal(fields.estimate, 8);
      },
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 0,
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.from, 'plan');
  assert.equal(result.to, 'ready-for-plan');
  assert.equal(body.includes('aitm-plan-approved'), false);
  assert.equal(body.includes('aitm-epic-orchestration-plan'), false);
  assert.equal(body.includes('aitm-estimation-forecast-ready'), false);
  assert.equal(body.includes('aitm-deep-dive-complete'), false);
  assert.equal(body.includes('aitm-deep-dive-posted'), false);
  assert.equal(body.includes('aitm-test-started'), false);
  assert.equal(body.includes('aitm-dod-verified'), false);
  assert.equal(body.includes(originalSnapshot), true);
  assert.match(body, /<!-- aitm-fields:/);
});

test('cancel-plan refuses a stale refinement snapshot before any mutation', async () => {
  let body = plannedBody().replace('governed R4P', 'changed after refinement');
  let writes = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'snapshot-refused');
  assert.equal(writes, 0);
});

test('cancel-plan restores Refine fields after legitimate Plan re-estimation drift', async () => {
  let body = plannedBody().replace('"size":"M","estimate":8', '"size":"L","estimate":13');
  const plannedEstimate = plannedEstimateFixture();
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted after re-estimate',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields({ size: 'L', estimate: 13 }),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async ({ fields }) => {
        assert.equal(fields.size, 'M');
        assert.equal(fields.estimate, 8);
      },
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 0,
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.match(body, /"size":"M"/);
  assert.match(body, /"estimate":8/);
});

test('cancel-plan still refuses non-estimation refinement field drift', async () => {
  const body = plannedBody().replace('"priority":"P1"', '"priority":"P0"');
  let writes = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted after priority drift',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      mutateIssueBody: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'snapshot-refused');
  assert.equal(writes, 0);
});

test('cancel-plan refuses concurrent configured-project field drift before any artifact mutation', async () => {
  let body = plannedBody();
  const plannedEstimate = plannedEstimateFixture();
  let bodyWrites = 0;
  let boardWrites = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted after board-only priority drift',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: async () => ({ priority: 'P0', size: 'M', estimate: 8, rank: 4 }),
      mutateIssueBody: async ({ mutate }) => {
        bodyWrites += 1;
        body = mutate(body);
        return { status: 'ok' };
      },
      restoreBoardFields: async () => {
        boardWrites += 1;
      },
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 0,
    },
  });
  assert.equal(result.status, 'board-fields-refused');
  assert.match(result.reason, /live board fields disagree/);
  assert.equal(bodyWrites, 0);
  assert.equal(boardWrites, 0);
  assert.match(plannedEstimate.comments[0].body, /### Planned Estimate/);
});

test('cancel-plan refuses a missing live Rank instead of coercing it to rank zero', async () => {
  const body = plannedBody({ rank: 0 });
  let bodyWrites = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted with missing board rank',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: async () => ({ priority: 'P1', size: 'M', estimate: 8, rank: null }),
      mutateIssueBody: async () => {
        bodyWrites += 1;
      },
      plannedEstimate: plannedEstimateFixture().deps,
      runMoveState: async () => 0,
    },
  });
  assert.equal(result.status, 'board-fields-refused');
  assert.equal(bodyWrites, 0);
});

test('cancel-plan remains a hub-only handler with no direct executable entrypoint', () => {
  assert.equal(cancelPlanModule.runCancelPlanEntrypoint, undefined);
});

test('cancel-plan restores original Plan artifacts without clobbering concurrent body edits', async () => {
  const original = plannedBody();
  let body = original;
  const plannedEstimate = plannedEstimateFixture();
  const originalComment = plannedEstimate.comments[0].body;
  let bodyWrites = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        bodyWrites += 1;
        if (bodyWrites === 2) body += '\n## Concurrent Note\n\nPreserve this remote edit.\n';
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 7,
    },
  });
  assert.equal(result.status, 'transition-failed-restored');
  assert.match(body, /## Concurrent Note/);
  assert.equal(body.includes('aitm-plan-cancelled'), false);
  for (const marker of [
    'aitm-plan-approved',
    'aitm-estimation-forecast-ready',
    'aitm-deep-dive-complete',
    'aitm-deep-dive-posted',
    'aitm-test-started',
    'aitm-dod-verified',
  ]) {
    assert.equal(body.includes(marker), true, `${marker} restored`);
  }
  assert.equal(plannedEstimate.comments[0].body, originalComment);
});

test('cancel-plan reconciles a thrown mover and restores Plan artifacts when Status stayed Plan', async () => {
  let body = plannedBody();
  const plannedEstimate = plannedEstimateFixture();
  const originalComment = plannedEstimate.comments[0].body;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => {
        throw new Error('transport lost');
      },
    },
  });
  assert.equal(result.status, 'transition-failed-restored');
  assert.match(result.error, /transport lost/);
  assert.equal(body.includes('aitm-plan-cancelled'), false);
  assert.equal(body.includes('aitm-plan-approved'), true);
  assert.equal(plannedEstimate.comments[0].body, originalComment);
});

test('successful cancellation removes the old Planned Estimate appendix', async () => {
  let body = plannedBody();
  const plannedEstimate = plannedEstimateFixture();
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 0,
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(
    (
      await planPlannedEstimateGate({
        cfg: CFG,
        issueNumber: 1213,
        deps: plannedEstimate.deps,
      })
    ).ok,
    false
  );
});

test('early Plan cancellation succeeds when no Planned Estimate appendix exists yet', async () => {
  let body = plannedBody();
  let moves = 0;
  const plannedEstimate = plannedEstimateFixture();
  plannedEstimate.comments[0].body = '<!-- aitm-refined-estimate: 1213 -->\n### Refine estimate\n';
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'cancel before estimation',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => {
        moves += 1;
        return 0;
      },
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(moves, 1);
});

test('Plan cancellation succeeds when best-effort Refine estimate comment posting failed', async () => {
  let body = plannedBody();
  let moves = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'cancel without refine comment',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: { listComments: async () => [] },
      runMoveState: async () => {
        moves += 1;
        return 0;
      },
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(moves, 1);
});

test('cancel-plan refuses before body mutation when Planned Estimate read-back is stale', async () => {
  let body = plannedBody();
  let bodyWrites = 0;
  const plannedEstimate = plannedEstimateFixture();
  plannedEstimate.deps.patchComment = async () => {};
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => 'plan',
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async () => {
        bodyWrites += 1;
      },
      plannedEstimate: plannedEstimate.deps,
    },
  });
  assert.equal(result.status, 'planned-estimate-refused');
  assert.equal(result.detail, 'verification-failed-restored');
  assert.equal(bodyWrites, 0);
});

test('cancel-plan accepts a nonzero delegate when live Status reached R4P', async () => {
  let body = plannedBody();
  let stateReads = 0;
  const plannedEstimate = plannedEstimateFixture();
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'planning interrupted',
    now: () => TS,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => (stateReads++ === 0 ? 'plan' : 'ready-for-plan'),
      fetchBoardFields: fetchPlanBoardFields(),
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      loadProjectFieldDefs: () => [
        { key: 'priority', name: 'Priority' },
        { key: 'size', name: 'Size' },
        { key: 'estimate', name: 'Estimate' },
        { key: 'rank', name: 'Rank' },
        { key: 'blockedBy', name: 'Blocked By' },
      ],
      restoreBoardFields: async () => {},
      plannedEstimate: plannedEstimate.deps,
      runMoveState: async () => 7,
    },
  });
  assert.equal(result.status, 'cancelled-with-warning');
  assert.equal(body.includes('aitm-plan-cancelled'), true);
});

test('cancel-plan refuses every source except Plan without writing', async () => {
  let writes = 0;
  const result = await runCancelPlan({
    issueNumber: 1213,
    cfg: CFG,
    reason: 'not in plan',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: refinedBody({ state: 'ready-for-plan' }) }),
      getLiveState: async () => 'ready-for-plan',
      mutateIssueBody: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'invalid-source-refused');
  assert.equal(writes, 0);
});
