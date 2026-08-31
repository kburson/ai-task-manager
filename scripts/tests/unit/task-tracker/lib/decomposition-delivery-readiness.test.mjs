// @story #1287
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describePreSplitReadiness,
  evaluateMaterializedWbsReadiness,
} from '../../../../task-tracker/lib/decomposition-delivery-readiness.mjs';
import { classifyDecomposition } from '../../../../task-tracker/lib/decomposition-policy.mjs';

const PLAN_PATH = 'docs/plan.md';

function planText(count = 3) {
  return Array.from(
    { length: count },
    (_, index) =>
      `### Task ${index + 1}: Part ${index + 1}\n\nRun: \`node --test part-${index + 1}.test.mjs\``
  ).join('\n\n');
}

function child(task, index, overrides = {}) {
  const number = 2001 + index;
  return {
    number,
    title: task.title,
    body: [
      '## Plan Metadata',
      `- **Source-plan**: ${PLAN_PATH}`,
      '- **Source-plan-commit**: accepted-plan',
      `- **Source-plan-section**: ${task.heading}`,
    ].join('\n'),
    rank: index + 1,
    blockedBy: index === 0 ? [] : [number - 1],
    hasCurrentRefinement: true,
    ...overrides,
  };
}

function materialized(overrides = {}) {
  const acceptedPlanText = planText();
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  return {
    issueNumber: 1287,
    tasks,
    acceptedPlanPath: PLAN_PATH,
    acceptedPlanText,
    epicBody:
      '## Plan Metadata\n\n<!-- aitm-worktree-location worktree="/work/epic" branch="codex/1287-live" sid="s" ts="2026-08-31T00:00:00Z" -->',
    children: tasks.map(child),
    readPlanAtCommit: async () => acceptedPlanText,
    ...overrides,
  };
}

test('pre-split must-split evidence is decomposition-ready, never delivery-ready', () => {
  const classification = classifyDecomposition({ planText: planText(6) });
  const result = describePreSplitReadiness({ classification });

  assert.equal(result.status, 'decomposition-ready');
  assert.equal(result.deliveryReady, false);
  assert.deepEqual(
    result.expectedWbs.map((task) => task.heading),
    classification.tasks.map((task) => task.heading)
  );
});

test('fully reconciled materialized WBS is delivery-ready on recorded epic branch', async () => {
  const result = await evaluateMaterializedWbsReadiness(materialized());

  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
  assert.equal(result.deliveryReady, true);
  assert.equal(result.epicBranch, 'codex/1287-live');
  assert.equal(result.boundaries.coverage.ok, true);
  assert.equal(result.boundaries.sections.ok, true);
  assert.equal(result.boundaries.planning.ok, true);
  assert.equal(result.boundaries.branch.ok, true);
});

test('canonical epic branch remains valid when no durable override exists', async () => {
  const result = await evaluateMaterializedWbsReadiness(materialized({ epicBody: '' }));
  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
  assert.equal(result.epicBranch, 'feature/epic/1287');
});

test('an accepted terminal child keeps its existing successful admission behavior', async () => {
  const input = materialized();
  Object.assign(input.children[0], {
    rank: null,
    blockedBy: null,
    hasCurrentRefinement: false,
    state: 'done',
    issueState: 'closed',
    boardState: 'done',
    closeReason: 'completed',
    recoveryPhase: null,
  });

  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
});

test('bounded section contradictions refuse and name the section boundary', async () => {
  const input = materialized();
  input.children[1].body = input.children[1].body.replace('### Task 2', '### Task 99');
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => item.startsWith('section-selection:')));
});

test('rank and dependency contradictions are accumulated fail-closed', async () => {
  const input = materialized();
  input.children[0].rank = null;
  input.children[1].blockedBy = [input.children[1].number];
  input.children[2].blockedBy = [9999];
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /planning-rank.*#2001/.test(item)));
  assert.ok(result.blockers.some((item) => /planning-dependency.*self/.test(item)));
  assert.ok(result.blockers.some((item) => /planning-dependency.*outside/.test(item)));
});

test('stale or unreadable child planning evidence refuses', async () => {
  const input = materialized();
  input.children[0].hasCurrentRefinement = false;
  input.children[1].childEvidenceError = 'live dependencies disagree with snapshot';
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /planning-evidence.*#2001/.test(item)));
  assert.ok(result.blockers.some((item) => /live dependencies disagree/.test(item)));
});

test('malformed durable branch authority refuses without canonical fallback', async () => {
  const result = await evaluateMaterializedWbsReadiness(
    materialized({
      epicBody: '<!-- aitm-worktree-location worktree="/work/epic" branch="codex/1287-live" -->',
    })
  );

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /branch-authority:.*malformed/.test(item)));
});

test('unreadable WBS evidence refuses and evaluator performs no mutations', async () => {
  let mutations = 0;
  const input = materialized({
    readPlanAtCommit: async () => {
      throw new Error('pinned plan missing');
    },
    mutateIssue: () => {
      mutations += 1;
    },
  });
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /pinned plan is unreadable/.test(item)));
  assert.equal(mutations, 0);
});
