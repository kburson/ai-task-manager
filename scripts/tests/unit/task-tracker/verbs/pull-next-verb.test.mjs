#!/usr/bin/env node
// @story #135
// Unit tests for scripts/task-tracker/verbs/pull-next.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';

import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import {
  defaultGetLiveState,
  promoteSelectedChild,
  runPullNext,
} from '../../../../task-tracker/verbs/pull-next.mjs';
import { runPromote } from '../../../../task-tracker/verbs/promote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function ready(number, rank, extra = {}) {
  return {
    number,
    state: 'ready-for-plan',
    rank,
    blockedBy: [],
    hasCurrentRefinement: true,
    ...extra,
  };
}

function terminal(number, rank) {
  return {
    number,
    state: 'done',
    boardState: 'done',
    rank,
    issueState: 'closed',
    closeReason: 'completed',
  };
}

function makeDeps({
  liveState = 'develop',
  childState = 'plan',
  children = [],
  promoteResult = { status: 'ok' },
} = {}) {
  const calls = { promotes: [], stateLookups: 0, childStateLookups: [], audits: [] };
  return {
    calls,
    deps: {
      resolveProjectDir: () => '/repo/worktrees/epic-100',
      withIssueLock: async (_options, fn) => fn(),
      childIssueLock: async (_options, fn) => fn(),
      // #758 — inject a hermetic no-op auditor so the unit tests never spawn a
      // real `gh`/gql read; the spy also lets us assert it ran before selection.
      audit: async ({ issueNumber }) => {
        calls.audits.push(issueNumber);
        return { ok: true, drift: 'none' };
      },
      getLiveState: async ({ issueNumber }) => {
        calls.stateLookups++;
        calls.lastLookup = issueNumber;
        return liveState;
      },
      getChildLiveState: async ({ issueNumber }) => {
        calls.childStateLookups.push(issueNumber);
        return childState;
      },
      epicChildren: {
        fetchSiblings: async () => children,
      },
      // No-op body fetch → no blockers → selection stays pure-rank (#248).
      enrich: {
        fetchBody: async () => '',
      },
      promote: async (rest) => {
        calls.promotes.push(rest);
        return promoteResult;
      },
    },
  };
}

test('runPullNext refuses when epic is not in develop', async () => {
  const { deps, calls } = makeDeps({ liveState: 'plan' });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'epic-not-in-develop');
  assert.equal(calls.promotes.length, 0);
});

test('pull-next live-state reads use the exact configured-project snapshot', async () => {
  const result = await defaultGetLiveState({
    issueNumber: 100,
    cfg,
    deps: {
      fetchSnapshot: async ({ issueNumber, cfg: actualCfg }) => {
        assert.equal(issueNumber, 100);
        assert.equal(actualCfg, cfg);
        return { state: 'plan', assignees: [] };
      },
    },
  });

  assert.equal(result, 'plan');
});

test('runPullNext returns no-children for epic with no sub-issues', async () => {
  const { deps } = makeDeps({ children: [] });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-children');
});

test('runPullNext returns no-eligible when no R4P children exist', async () => {
  const { deps } = makeDeps({
    children: [
      { number: 101, state: 'backlog', rank: 1, blockedBy: [], hasCurrentRefinement: false },
      terminal(102, 2),
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-eligible');
  assert.deepEqual(result.counts, { backlog: 1, done: 1 });
});

test('runPullNext promotes lowest-rank R4P child', async () => {
  const { deps, calls } = makeDeps({
    children: [ready(105, 5), ready(103, 3), ready(104, 4)],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 103);
  assert.equal(result.childRank, 3);
  assert.deepEqual(calls.promotes, [['103']]);
  assert.deepEqual(calls.childStateLookups, [103]);
});

test('runPullNext refuses false success when the selected child did not reach Plan', async () => {
  const { deps, calls } = makeDeps({
    childState: 'ready-for-plan',
    children: [ready(103, 3)],
  });

  const result = await runPullNext({ epicNumber: 100, cfg, deps });

  assert.equal(result.status, 'promotion-unverified');
  assert.equal(result.childNumber, 103);
  assert.equal(result.observedState, 'ready-for-plan');
  assert.deepEqual(calls.promotes, [['103']]);
  assert.deepEqual(calls.childStateLookups, [103]);
  assert.match(result.message, /expected "plan"/);
});

test('runPullNext delegates the selected child through the real promote bind seam (#1114)', async () => {
  const { deps } = makeDeps({
    children: [ready(103, 3)],
  });
  delete deps.promote;
  deps.getChildLiveState = async () => 'plan';

  const moves = [];
  const resolvedIssues = [];
  deps.resolveProjectDir = ({ issue }) => {
    resolvedIssues.push(issue);
    return '/repo/worktrees/epic-100';
  };
  const refineBody = stampRefinementSnapshot(
    `<!-- aitm-last-known-state state="ready-for-plan" ts="2026-08-05T00:00:00Z" -->
<!-- aitm-last-known-state-ts: 2026-08-05T00:00:00Z -->

## User Story

As an operator
I want the selected child promoted
So that JIT planning can continue

<!-- aitm-refine-complete: 2026-08-05T00:00:00Z -->
<!-- aitm-entered-ready-for-plan ts="2026-08-05T00:00:00Z" -->
<!-- aitm-refinement-rationale: {"size":"S","estimate":"1","priority":"P1","rank":3,"rationale":"current"} -->

## Scope

Promote the selected refined child into durable planning readiness.

## Plan Metadata

- **Depends On**: none

## Acceptance Criteria

- [ ] Selected child reaches Ready for Planning

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":1,"rank":3,"blockedBy":null}} -->
`,
    { labels: ['enhancement'], ts: '2026-08-05T00:00:00Z' }
  );
  deps.promoteDeps = {
    withIssueLock: async (_options, fn) => fn(),
    preflightDeps: {
      fetchSnapshot: async () => ({ state: 'ready-for-plan', assignees: [] }),
      fetchCurrentUser: async () => 'alice',
    },
    // This models the active epic bind that rejects a direct child promote.
    // pull-next must replace it only for its already-selected child.
    assertBound: (issueNumber) => {
      throw new Error(`Bind mismatch: active is #100, target is #${issueNumber}`);
    },
    resolveProjectDir: ({ issue, deps: projectDirDeps }) => {
      assert.equal(issue, 103);
      assert.equal(projectDirDeps.projectDir, '/repo/worktrees/epic-100');
      return projectDirDeps.projectDir;
    },
    fetchIssueBody: async () => ({ body: refineBody }),
    mutateIssueBody: async ({ mutate }) => {
      mutate(refineBody);
      return { status: 'ok', attempts: 1 };
    },
    getLiveState: async () => 'ready-for-plan',
    runMoveState: async ({ issueNumber, target }) => {
      moves.push({ issueNumber, target });
      return 0;
    },
    spawnVerb: async () => 0,
    epicChildren: { fetchSiblings: async () => [] },
    decomposition: {
      projectDir: process.cwd(),
      loadProjectFieldDefs: () => [],
      projectValuesForIssue: async () => ({ size: 'XS', estimate: 1 }),
    },
    refinementEstimate: {
      loadProjectFieldDefs: () => [],
      projectValuesForIssue: async () => ({ size: 'S', estimate: 1, priority: 'P1' }),
      listCommentBodies: async () => [],
      postComment: async () => {},
      writeIssueBody: async () => {},
    },
    refinementSnapshot: {
      fetchLabels: async () => ['enhancement'],
      fetchBoardFields: async () => ({ priority: 'P1', size: 'S', estimate: 1, rank: 3 }),
    },
    refineToPlanGate: async () => ({ ok: true, blockers: [] }),
    codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
    commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: [] }),
  };

  const result = await runPullNext({ epicNumber: 100, cfg, deps });

  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 103);
  assert.deepEqual(resolvedIssues, [100], 'execution authority comes from the bound epic');
  assert.deepEqual(moves, [{ issueNumber: 103, target: 'plan' }]);
});

test('selected-child promotion reuses its held lock instead of entering the locking verb wrapper', async () => {
  const calls = [];
  const result = await promoteSelectedChild({
    issueNumber: 103,
    cfg,
    projectDir: '/repo/worktrees/epic-100',
    acquireIssueLock: async (options, fn) => {
      calls.push(`lock:${options.issue}`);
      return fn();
    },
    ownershipPreflight: async () => ({ ok: true }),
    promoteRunner: async ({ issueNumber, deps }) => {
      calls.push(`run:${issueNumber}`);
      deps.assertBound(issueNumber);
      return { status: 'promoted', from: 'ready-for-plan', to: 'plan' };
    },
    promoteVerb: async () => {
      throw new Error('locking verb wrapper must not run inside the selected-child lock');
    },
  });

  assert.equal(result.status, 'promoted');
  assert.deepEqual(calls, ['lock:103', 'run:103']);
});

test('direct promote remains fail-closed on a mismatched bind (#1114)', async () => {
  await assert.rejects(
    () =>
      runPromote({
        issueNumber: 103,
        cfg,
        deps: {
          assertBound: () => {
            throw new Error('Bind mismatch: active is #100, target is #103');
          },
        },
      }),
    /Bind mismatch: active is #100, target is #103/
  );
});

test('runPullNext skips a child whose blocker is not Done (#248)', async () => {
  // #103 (lowest rank) is blocked by #105, which is not terminal.
  // Enrichment surfaces that marker, so #104 is pulled instead.
  const { deps, calls } = makeDeps({
    children: [
      ready(103, 3, { blockedBy: [105] }),
      ready(104, 4),
      { number: 105, state: 'backlog', rank: 5, blockedBy: [], hasCurrentRefinement: false },
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 104);
  assert.deepEqual(calls.promotes, [['104']]);
});

test('runPullNext audits the epic before child selection (#758)', async () => {
  const { deps, calls } = makeDeps({
    children: [ready(103, 3)],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(calls.audits, [100], 'auditor runs once, on the epic');
});

test('runPullNext refuses ambiguous epic audit drift', async () => {
  const { deps, calls } = makeDeps({ children: [ready(103, 3)] });
  deps.audit = async () => ({ ok: false, drift: 'out-of-band' });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'epic-audit-refused');
  assert.deepEqual(calls.promotes, []);
});

test('runPullNext refuses every pull when any child descriptor is incomplete', async () => {
  const { deps, calls } = makeDeps({
    children: [
      { number: 102, state: '', rank: null, childEvidenceError: 'unreadable' },
      ready(103, 3),
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'child-state-ambiguous');
  assert.deepEqual(calls.promotes, []);
});

test('runPullNext holds shared parent authority across selection and promotion', async () => {
  const { deps, calls } = makeDeps({ children: [ready(103, 3)] });
  const order = [];
  deps.withIssueLock = async (options, fn) => {
    order.push(`lock:${options.issue}`);
    const result = await fn();
    order.push(`unlock:${options.issue}`);
    return result;
  };
  const originalPromote = deps.promote;
  deps.promote = async (...args) => {
    order.push('promote');
    return originalPromote(...args);
  };

  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(calls.promotes, [['103']]);
  assert.deepEqual(order, ['lock:100', 'promote', 'unlock:100']);
});

test('runPullNext does not audit when the epic is not in develop (#758)', async () => {
  const { deps, calls } = makeDeps({ liveState: 'plan' });
  await runPullNext({ epicNumber: 100, cfg, deps });
  assert.deepEqual(calls.audits, [], 'no audit when the gate short-circuits');
});

test('runPullNext requires epicNumber and cfg', async () => {
  await assert.rejects(() => runPullNext({ cfg }), /epicNumber is required/);
  await assert.rejects(() => runPullNext({ epicNumber: 1 }), /cfg is required/);
});

test('runPullNext surfaces fetch failures', async () => {
  const deps = {
    projectDir: '/repo/worktrees/epic-100',
    withIssueLock: async (_options, fn) => fn(),
    audit: async () => ({ ok: true, drift: 'none' }),
    getLiveState: async () => 'develop',
    epicChildren: {
      fetchSiblings: async () => {
        throw new Error('graphql down');
      },
    },
    promote: async () => ({ status: 'ok' }),
  };
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'fetch-failed');
  assert.match(result.message, /graphql down/);
});
