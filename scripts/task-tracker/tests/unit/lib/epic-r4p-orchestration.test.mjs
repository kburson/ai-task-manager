// @story #1216
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  developEpicTestChildrenGate,
  findNextEligibleChild,
  planEpicDevelopChildrenGate,
  wipAdvanceDecision,
} from '../../../lib/epic-children-gate.mjs';
import { stampRefinementSnapshot } from '../../../lib/refinement-snapshot.mjs';
import { runPullNext } from '../../../verbs/pull-next.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { STATES } from '../../../states/index.mjs';

const cfg = { repo: 'o/r', projectId: 'PVT_1' };

function fetchChildren(children) {
  return { fetchSiblings: async () => children };
}

function currentChild(number, state, rank, extra = {}) {
  return { number, state, rank, blockedBy: [], hasCurrentRefinement: true, ...extra };
}

function refinementBody() {
  return stampRefinementSnapshot(
    `## Scope

Keep one current refinement snapshot.

## Plan Metadata

- **Depends On**: none

## Acceptance Criteria

- [ ] Current refinement remains verifiable

<!-- aitm-refinement-rationale: {"size":"S","estimate":"1","priority":"P1","rank":1,"rationale":"current"} -->
<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":1,"rank":1,"blockedBy":null}} -->`,
    { labels: ['enhancement'], ts: '2026-08-12T00:00:00.000Z' }
  );
}

function projectNode({ number, issueState = 'OPEN', stateReason = null, status, rank, body }) {
  return {
    number,
    state: issueState,
    stateReason,
    body,
    projectItems: {
      nodes: [
        {
          project: { id: cfg.projectId },
          fieldValues: {
            nodes: [
              { name: status, field: { name: 'Status' } },
              { number: rank, field: { name: 'Rank' } },
            ],
          },
        },
      ],
    },
  };
}

test('configured-project child mapping carries current refinement and terminal evidence', () => {
  const [ready, abandoned] = mapSubIssueNodes(
    [
      projectNode({
        number: 10,
        status: 'Ready for Planning',
        rank: 1,
        body: refinementBody(),
      }),
      projectNode({
        number: 11,
        issueState: 'CLOSED',
        stateReason: 'NOT_PLANNED',
        status: 'Backlog',
        rank: 2,
        body: '',
      }),
    ],
    cfg.projectId
  );

  assert.equal(ready.state, 'ready-for-plan');
  assert.equal(ready.hasCurrentRefinement, true);
  assert.equal(ready.issueState, 'open');
  assert.equal(abandoned.state, 'done');
  assert.equal(abandoned.closeReason, 'not_planned');
  assert.equal(abandoned.issueState, 'closed');
});

test('epic Plan admission requires every executable child at R4P or later with refinement evidence', async () => {
  const admitted = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([
      currentChild(1216, 'ready-for-plan', 6),
      currentChild(1217, 'plan', 7),
      { number: 1215, state: 'done', rank: 5, issueState: 'closed', closeReason: 'completed' },
      {
        number: 1214,
        state: 'done',
        rank: 4,
        issueState: 'closed',
        closeReason: 'not_planned',
      },
    ]),
  });
  assert.equal(admitted.ok, true);

  for (const offender of [
    currentChild(1216, 'refine', 6),
    currentChild(1216, 'backlog', 6),
    { number: 1216, state: 'ready-for-plan', rank: 6, hasCurrentRefinement: false },
    { number: 1216, state: 'ready-for-plan', rank: null, hasCurrentRefinement: true },
  ]) {
    const refused = await planEpicDevelopChildrenGate({
      cfg,
      issueNumber: 1209,
      deps: fetchChildren([offender]),
    });
    assert.equal(refused.ok, false, JSON.stringify(offender));
    assert.match(refused.blockers[0], /#1216/);
  }
});

test('R4P state enforces epic child admission before entering Plan', () => {
  const ids = STATES['ready-for-plan'].exitGuards.map((guard) => guard.id);
  assert.ok(
    ids.includes('ready-for-plan-exit-epic-children-r4p-or-beyond'),
    `missing R4P epic admission guard in [${ids.join(', ')}]`
  );
});

test('next-child selection uses only dependency-ready R4P children and rank', () => {
  const next = findNextEligibleChild([
    currentChild(10, 'refine', 1),
    currentChild(11, 'ready-for-plan', 2, { blockedBy: [13] }),
    currentChild(12, 'ready-for-plan', 3, { blockedBy: [] }),
    {
      number: 13,
      state: 'done',
      rank: 4,
      issueState: 'closed',
      closeReason: 'completed',
    },
  ]);
  assert.equal(next.number, 11);
});

test('next-child selection fails closed while any sibling is locally active', () => {
  for (const state of ['plan', 'develop', 'test', 'review']) {
    const next = findNextEligibleChild([
      currentChild(10, 'ready-for-plan', 1),
      currentChild(11, state, 2),
    ]);
    assert.equal(next, null, state);
  }
});

test('local WIP policy has no blocker exception while another child is active', () => {
  const decision = wipAdvanceDecision({
    promotingNumber: 12,
    children: [
      currentChild(10, 'develop', 1),
      currentChild(11, 'develop', 2, { blockedBy: [12] }),
      currentChild(12, 'ready-for-plan', 3),
    ],
  });
  assert.equal(decision.ok, false);
  assert.deepEqual(decision.advancing, [10, 11]);
});

test('epic Test admission requires Done or an accepted closed disposition', async () => {
  const admitted = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([
      { number: 10, state: 'done', issueState: 'closed', closeReason: 'completed' },
      { number: 11, state: 'done', issueState: 'closed', closeReason: 'not_planned' },
    ]),
  });
  assert.equal(admitted.ok, true);

  for (const offender of [
    currentChild(10, 'review', 1),
    { number: 10, state: 'done', issueState: 'open', closeReason: null },
    { number: 10, state: 'done', issueState: 'closed', closeReason: null },
    {
      number: 10,
      state: 'done',
      issueState: 'closed',
      closeReason: 'not_planned',
      recoveryPhase: 'timing',
    },
  ]) {
    const refused = await developEpicTestChildrenGate({
      cfg,
      issueNumber: 1209,
      deps: fetchChildren([offender]),
    });
    assert.equal(refused.ok, false, JSON.stringify(offender));
    assert.match(refused.blockers[0], /#10/);
  }
});

test('pull-next advances one dependency-ready R4P child exactly one edge and then stops', async () => {
  const calls = [];
  const result = await runPullNext({
    epicNumber: 1209,
    cfg,
    deps: {
      audit: async () => ({ ok: true }),
      getLiveState: async () => 'develop',
      getChildLiveState: async () => 'plan',
      epicChildren: fetchChildren([
        currentChild(1216, 'done', 6, { issueState: 'closed', closeReason: 'completed' }),
        currentChild(1217, 'ready-for-plan', 7),
      ]),
      enrich: { fetchBody: async () => '' },
      promote: async (rest) => {
        calls.push(rest);
        return { status: 'ok', target: 'plan' };
      },
    },
  });

  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 1217);
  assert.deepEqual(calls, [['1217']]);
  assert.match(result.message, /ready-for-plan.*plan/i);
  assert.match(result.message, /JIT/i);
});

test('pull-next refuses to start another local child while a sibling is active', async () => {
  const result = await runPullNext({
    epicNumber: 1209,
    cfg,
    deps: {
      audit: async () => ({ ok: true }),
      getLiveState: async () => 'develop',
      epicChildren: fetchChildren([
        currentChild(1216, 'develop', 6),
        currentChild(1217, 'ready-for-plan', 7),
      ]),
      enrich: { fetchBody: async () => '' },
      promote: async () => assert.fail('must not promote while a sibling is active'),
    },
  });

  assert.equal(result.status, 'active-child');
  assert.match(result.message, /#1216/);
});

test('operator help, architecture, and pickup guidance describe R4P child staging', () => {
  const surfaces = [
    'scripts/task-tracker/verbs/help-data.mjs',
    'docs/DESIGN.md',
    'docs/guides/workflow.md',
    '.ai-task-manager/templates/pickup-directive.md',
    '.ai-task-manager/templates/references/pickup-directive-rationale.md',
  ].map((path) => readFileSync(path, 'utf8'));

  assert.match(surfaces[0], /next dependency-ready R4P child/);
  assert.match(surfaces[1], /Backlog → Refine → Ready for Planning → Plan/);
  assert.match(surfaces[2], /next child pulled Ready for Planning → Plan/);
  assert.match(surfaces[3], /R4P pull budget/);
  assert.match(surfaces[4], /Ready for Planning is the durable child queue/);
});

test('epic child enumeration exhausts every GraphQL page and refuses cursor ambiguity', async () => {
  const { fetchAllSubIssueNodes } = await import('../../../../gh/lib/wave-admission.mjs');
  assert.equal(typeof fetchAllSubIssueNodes, 'function');

  const afters = [];
  const nodes = await fetchAllSubIssueNodes({
    parentEpicNumber: 1209,
    repo: 'o/r',
    gqlFn: async (_query, variables) => {
      afters.push(variables.after);
      return {
        repository: {
          issue: {
            subIssues:
              variables.after == null
                ? { nodes: [{ number: 1 }], pageInfo: { hasNextPage: true, endCursor: 'c1' } }
                : { nodes: [{ number: 2 }], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      };
    },
  });
  assert.deepEqual(
    nodes.map((node) => node.number),
    [1, 2]
  );
  assert.deepEqual(afters, [null, 'c1']);

  await assert.rejects(
    () =>
      fetchAllSubIssueNodes({
        parentEpicNumber: 1209,
        repo: 'o/r',
        gqlFn: async () => ({
          repository: {
            issue: {
              subIssues: {
                nodes: [],
                pageInfo: { hasNextPage: true, endCursor: null },
              },
            },
          },
        }),
      }),
    /missing end cursor/
  );
});
