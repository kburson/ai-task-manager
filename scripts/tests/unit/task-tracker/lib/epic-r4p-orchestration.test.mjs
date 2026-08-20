// @story #1216 #1339
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  developEpicTestChildrenGate,
  findNextEligibleChild,
  planEpicDevelopChildrenGate,
  wipAdvanceDecision,
} from '../../../../task-tracker/lib/epic-children-gate.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { runPullNext } from '../../../../task-tracker/verbs/pull-next.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { STATES } from '../../../../task-tracker/states/index.mjs';
import { refineExitWipBudgetGuard } from '../../../../task-tracker/lib/refine-exit-wip-budget-guard.mjs';

const cfg = { repo: 'o/r', projectId: 'PVT_1' };

function fetchChildren(children) {
  return { fetchSiblings: async () => children };
}

function currentChild(number, state, rank, extra = {}) {
  return {
    number,
    state,
    boardState: state,
    rank,
    blockedBy: [],
    hasCurrentRefinement: true,
    ...extra,
  };
}

function refinementBody({ blocker = null, rank = 1 } = {}) {
  const body = `## Scope

Keep one current refinement snapshot.

## Plan Metadata

- **Depends On**: none

## Acceptance Criteria

- [ ] Current refinement remains verifiable

<!-- aitm-refinement-rationale: {"size":"S","estimate":"1","priority":"P1","rank":${rank},"rationale":"current"} -->
${blocker ? `<!-- aitm-blocked-by refs="#${blocker}" -->\n` : ''}<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":1,"rank":${rank},"blockedBy":null}} -->`;
  return stampRefinementSnapshot(body, {
    labels: blocker ? ['BLOCKED', 'enhancement'] : ['enhancement'],
    ts: '2026-08-12T00:00:00.000Z',
  });
}

function projectNode({
  number,
  issueState = 'OPEN',
  stateReason = null,
  status,
  rank,
  body,
  labels = ['enhancement'],
}) {
  return {
    number,
    state: issueState,
    stateReason,
    body,
    labels: { nodes: labels.map((name) => ({ name })), pageInfo: { hasNextPage: false } },
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

test('blocked R4P child stays current for epic admission but waits for its predecessor', async () => {
  const [blockedChild] = mapSubIssueNodes(
    [
      projectNode({
        number: 12,
        status: 'Ready for Planning',
        rank: 2,
        body: refinementBody({ blocker: 11, rank: 2 }),
        labels: ['BLOCKED', 'enhancement'],
      }),
    ],
    cfg.projectId
  );

  assert.deepEqual(blockedChild.blockedBy, [11]);
  assert.equal(blockedChild.hasCurrentRefinement, true);

  const admission = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([currentChild(11, 'ready-for-plan', 1), blockedChild]),
  });
  assert.equal(admission.ok, true);

  assert.equal(
    findNextEligibleChild([currentChild(11, 'ready-for-plan', 1), blockedChild]).number,
    11
  );

  const predecessorDone = {
    number: 11,
    state: 'done',
    boardState: 'done',
    rank: 1,
    issueState: 'closed',
    closeReason: 'completed',
  };
  assert.equal(findNextEligibleChild([predecessorDone, blockedChild]).number, 12);
});

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
  assert.equal(abandoned.childEvidenceError, undefined);
});

test('configured-project mapping rejects stale refinement evidence and board-rank drift', () => {
  const current = refinementBody();
  const stale = current.replace(
    'Keep one current refinement snapshot.',
    'Mutated after refinement.'
  );
  const [mapped] = mapSubIssueNodes(
    [
      projectNode({
        number: 10,
        status: 'Ready for Planning',
        rank: 99,
        body: stale,
      }),
    ],
    cfg.projectId
  );

  assert.equal(mapped.hasCurrentRefinement, false);
  assert.match(mapped.childEvidenceError, /stale|rank/i);
});

test('epic admission and terminal delivery fail closed on incomplete descriptors and board drift', async () => {
  const malformed = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([null]),
  });
  assert.equal(malformed.ok, false);

  const mismatchedCompleted = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([
      {
        number: 10,
        state: 'done',
        boardState: 'Develop',
        issueState: 'closed',
        closeReason: 'completed',
      },
    ]),
  });
  assert.equal(mismatchedCompleted.ok, false);

  const [malformedRecovery] = mapSubIssueNodes(
    [
      projectNode({
        number: 11,
        issueState: 'CLOSED',
        stateReason: 'COMPLETED',
        status: 'Done',
        rank: 2,
        body: '<!-- aitm-unauthorized-close tx="abc" phase="intent" -->',
      }),
    ],
    cfg.projectId
  );
  assert.match(malformedRecovery.childEvidenceError, /recovery.*malformed/i);
  const malformedRecoveryGate = await developEpicTestChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([malformedRecovery]),
  });
  assert.equal(malformedRecoveryGate.ok, false);
});

test('strict local WIP cannot be disabled by project configuration', async () => {
  const result = await refineExitWipBudgetGuard.run({
    toState: 'plan',
    issueNumber: 12,
    cfg: { ...cfg, gatePlanRefineWip: false },
    deps: {
      projectDir: process.cwd(),
      withIssueLock: async (_options, fn) => fn(),
      fetchParentIssue: async () => 1209,
      epicChildren: fetchChildren([
        currentChild(11, 'develop', 1),
        currentChild(12, 'ready-for-plan', 2),
      ]),
    },
  });
  assert.equal(result.ok, false);
});

test('epic Plan admission requires every executable child at R4P or later with refinement evidence', async () => {
  const admitted = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 1209,
    deps: fetchChildren([
      currentChild(1216, 'ready-for-plan', 6),
      currentChild(1217, 'plan', 7),
      {
        number: 1215,
        state: 'done',
        boardState: 'done',
        rank: 5,
        issueState: 'closed',
        closeReason: 'completed',
      },
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
      boardState: 'done',
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
      {
        number: 10,
        state: 'done',
        boardState: 'done',
        issueState: 'closed',
        closeReason: 'completed',
      },
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
      projectDir: process.cwd(),
      withIssueLock: async (_options, fn) => fn(),
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
      projectDir: process.cwd(),
      withIssueLock: async (_options, fn) => fn(),
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

  const activeCollateral = [
    'templates/stub-body.md',
    'docs/guides/github-native-coordination.md',
    'docs/introduction/README.md',
    'docs/introduction/core-workflow.md',
    'docs/guides/test-authoring.md',
  ].map((path) => readFileSync(path, 'utf8'));
  for (const text of activeCollateral) {
    assert.doesNotMatch(text, /Backlog\s*(?:→|->)\s*Assigned/);
    assert.doesNotMatch(text, /Refine\s*(?:→|->)\s*Plan/);
  }
  assert.match(activeCollateral[0], /Refine(?:→|->)Ready for Planning gate/);
  assert.match(activeCollateral[3], /Backlog --> Refine[\s\S]*Refine --> ReadyForPlanning/);
});

test('epic child enumeration exhausts every GraphQL page and refuses cursor ambiguity', async () => {
  const { fetchAllSubIssueNodes } = await import('../../../../gh/lib/wave-admission.mjs');
  assert.equal(typeof fetchAllSubIssueNodes, 'function');

  const afters = [];
  const nodes = await fetchAllSubIssueNodes({
    parentEpicNumber: 1209,
    repo: 'o/r',
    gqlFn: async (query, variables) => {
      if (variables.after == null && query.includes('stateReason')) {
        assert.match(query, /\btitle\b/);
      }
      afters.push(variables.after);
      return {
        repository: {
          issue: {
            subIssues:
              variables.after == null
                ? {
                    totalCount: 2,
                    nodes: [{ id: 'I1', number: 1 }],
                    pageInfo: { hasNextPage: true, endCursor: 'c1' },
                  }
                : {
                    totalCount: 2,
                    nodes: [{ id: 'I2', number: 2 }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
          },
        },
      };
    },
  });
  assert.deepEqual(
    nodes.map((node) => node.number),
    [1, 2]
  );
  assert.deepEqual(afters, [null, 'c1', null, 'c1']);

  await assert.rejects(
    () =>
      fetchAllSubIssueNodes({
        parentEpicNumber: 1209,
        repo: 'o/r',
        gqlFn: async (_query, variables) => ({
          repository: {
            issue: {
              subIssues:
                variables.after == null
                  ? {
                      totalCount: 2,
                      nodes: [{ id: 'I1', number: 1 }],
                      pageInfo: { hasNextPage: true, endCursor: 'dup' },
                    }
                  : {
                      totalCount: 2,
                      nodes: [{ id: 'I1', number: 1 }],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
            },
          },
        }),
      }),
    /duplicate sub-issue identity/
  );

  await assert.rejects(
    () =>
      fetchAllSubIssueNodes({
        parentEpicNumber: 1209,
        repo: 'o/r',
        gqlFn: async () => ({
          repository: {
            issue: {
              subIssues: {
                totalCount: 0,
                nodes: [],
                pageInfo: { hasNextPage: true, endCursor: null },
              },
            },
          },
        }),
      }),
    /missing end cursor/
  );

  let scan = 0;
  await assert.rejects(
    () =>
      fetchAllSubIssueNodes({
        parentEpicNumber: 1209,
        repo: 'o/r',
        gqlFn: async (_query, variables) => {
          if (variables.after == null) scan += 1;
          const identities = scan === 1 ? ['I1', 'I3'] : ['I2', 'I3'];
          const index = variables.after == null ? 0 : 1;
          return {
            repository: {
              issue: {
                subIssues: {
                  totalCount: 2,
                  nodes: [{ id: identities[index], number: index + 1 }],
                  pageInfo: {
                    hasNextPage: index === 0,
                    endCursor: index === 0 ? `c${scan}` : null,
                  },
                },
              },
            },
          };
        },
      }),
    /sub-issue snapshot changed during verification/
  );
});

test('configured child project membership and fields paginate exhaustively', async () => {
  const { fetchConfiguredProjectItem } = await import('../../../../gh/lib/wave-admission.mjs');
  assert.equal(typeof fetchConfiguredProjectItem, 'function');

  const calls = [];
  const item = await fetchConfiguredProjectItem({
    issueNumber: 10,
    repo: 'o/r',
    projectId: cfg.projectId,
    gqlFn: async (query, variables) => {
      calls.push({ query, variables });
      if (query.includes('issue(number: $issue)')) {
        return {
          repository: {
            issue: {
              projectItems:
                variables.after == null
                  ? {
                      nodes: [{ id: 'OTHER', project: { id: 'PVT_other' } }],
                      pageInfo: { hasNextPage: true, endCursor: 'p1' },
                    }
                  : {
                      nodes: [
                        {
                          id: 'ITEM_1',
                          project: { id: cfg.projectId },
                          fieldValues: {
                            nodes: [{ name: 'Ready for Planning', field: { id: 'STATUS' } }],
                            pageInfo: { hasNextPage: true, endCursor: 'f1' },
                          },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
            },
          },
        };
      }
      return {
        node: {
          fieldValues: {
            nodes: [{ number: 7, field: { id: 'RANK' } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    },
  });

  assert.equal(item.id, 'ITEM_1');
  assert.equal(item.fieldValues.nodes.length, 2);
  assert.equal(calls.length, 3);
});
