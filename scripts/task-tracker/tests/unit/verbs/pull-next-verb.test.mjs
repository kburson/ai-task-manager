#!/usr/bin/env node
// @story #135
// Unit tests for scripts/task-tracker/verbs/pull-next.mjs (#135).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPullNext } from '../../../verbs/pull-next.mjs';
import { runPromote } from '../../../verbs/promote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ liveState = 'develop', children = [], promoteResult = { status: 'ok' } } = {}) {
  const calls = { promotes: [], stateLookups: 0, audits: [] };
  return {
    calls,
    deps: {
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

test('runPullNext returns no-children for epic with no sub-issues', async () => {
  const { deps } = makeDeps({ children: [] });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-children');
});

test('runPullNext returns no-eligible when no refine-state children', async () => {
  const { deps } = makeDeps({
    children: [
      { number: 101, state: 'plan', rank: 1 },
      { number: 102, state: 'done', rank: 2 },
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'no-eligible');
  assert.deepEqual(result.counts, { plan: 1, done: 1 });
});

test('runPullNext promotes lowest-rank refine child', async () => {
  const { deps, calls } = makeDeps({
    children: [
      { number: 105, state: 'refine', rank: 5 },
      { number: 103, state: 'refine', rank: 3 },
      { number: 104, state: 'plan', rank: 4 },
    ],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 103);
  assert.equal(result.childRank, 3);
  assert.deepEqual(calls.promotes, [['103']]);
});

test('runPullNext delegates the selected child through the real promote bind seam (#1114)', async () => {
  const { deps } = makeDeps({
    children: [{ number: 103, state: 'refine', rank: 3 }],
  });
  delete deps.promote;

  const moves = [];
  const resolvedIssues = [];
  deps.resolveProjectDir = ({ issue }) => {
    resolvedIssues.push(issue);
    return '/repo/worktrees/epic-100';
  };
  const refineBody = `<!-- aitm-last-known-state: refine -->
<!-- aitm-last-known-state-ts: 2026-08-05T00:00:00Z -->

## User Story

As an operator
I want the selected child promoted
So that JIT planning can continue

<!-- aitm-refine-complete: 2026-08-05T00:00:00Z -->
<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->

## Acceptance Criteria

- [ ] Selected child reaches Plan
`;
  deps.promoteDeps = {
    preflightDeps: {
      fetchSnapshot: async () => ({ state: 'refine', assignees: [] }),
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
    getLiveState: async () => 'refine',
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
    refineToPlanGate: async () => ({ ok: true, blockers: [] }),
    codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
    commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: [] }),
  };

  const result = await runPullNext({ epicNumber: 100, cfg, deps });

  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 103);
  assert.deepEqual(resolvedIssues, [100], 'execution authority comes from the bound epic');
  assert.deepEqual(moves, [{ issueNumber: 103, target: 'ready-for-plan' }]);
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
  // #103 (lowest rank) is blocked by #105, which is still in develop.
  // Enrichment surfaces that marker, so #104 is pulled instead.
  const { deps, calls } = makeDeps({
    children: [
      { number: 103, state: 'refine', rank: 3 },
      { number: 104, state: 'refine', rank: 4 },
      { number: 105, state: 'develop', rank: 5 },
    ],
  });
  deps.enrich = {
    fetchBody: async ({ issueNumber }) =>
      issueNumber === 103 ? '<!-- aitm-blocked-by: #105 -->' : '',
  };
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.equal(result.childNumber, 104);
  assert.deepEqual(calls.promotes, [['104']]);
});

test('runPullNext audits the epic before child selection (#758)', async () => {
  const { deps, calls } = makeDeps({
    children: [{ number: 103, state: 'refine', rank: 3 }],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(calls.audits, [100], 'auditor runs once, on the epic');
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
