// @story #2079 — repeated full-plan parsing must not consume native snapshot deadlines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { extractPlanTasks } from '../../../../task-tracker/lib/decomposition-policy.mjs';
import { evaluateMaterializedWbsReadiness } from '../../../../task-tracker/lib/decomposition-delivery-readiness.mjs';

// Break caught: independently reparsing a large accepted plan for each of 32 child selections.
// The 3s local budget leaves room inside the unchanged 6s native snapshot bound for remote reads.
test('32-child readiness leaves native snapshot time for remote authority reads', async () => {
  const text = Array.from(
    { length: 32 },
    (_, i) =>
      `### Task ${i + 1}: Part ${i + 1}\n\n#### Story Intent\n\n- **Beneficiary:** delivery maintainer\n- **Capability:** validate bounded child ${i + 1}\n- **Need:** repeated parsing exhausts the snapshot deadline\n- **Value or failure prevented:** retain fresh authority within finite bounds\n\n${'Concrete offline verification and ownership requirements. '.repeat(80)}\n\nRun: \`node --test part-${i + 1}.test.mjs\``
  ).join('\n\n');
  const tasks = extractPlanTasks(text);
  const children = tasks.map((task, i) => ({
    number: 3001 + i,
    title: `Part ${i + 1}`,
    body: `## Plan Metadata\n\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: accepted-plan\n- **Source-plan-section**: ### Task ${i + 1}: Part ${i + 1}\n`,
    rank: i + 1,
    blockedBy: [],
    hasCurrentRefinement: true,
  }));
  const input = {
    issueNumber: 2079,
    tasks,
    acceptedPlanPath: 'docs/plan.md',
    acceptedPlanText: text,
    children,
    readPlanAtCommit: async () => text,
  };
  const started = performance.now();
  const result = await evaluateMaterializedWbsReadiness(input);
  const elapsed = performance.now() - started;
  assert.equal(result.deliveryReady, true, result.blockers.join('\n'));
  assert.equal(result.boundaries.coverage.coveredCount, 32);
  assert.ok(
    elapsed < 3000,
    `local readiness took ${Math.round(elapsed)}ms, exhausting remote headroom`
  );
  children[31].body = children[31].body.replace('### Task 32: Part 32', '### Task 99: Missing');
  const changed = await evaluateMaterializedWbsReadiness(input);
  assert.equal(changed.deliveryReady, false);
  assert.ok(changed.blockers.some((reason) => reason.startsWith('section-selection: #3032')));
});

// Break caught: sharing prepared plan state across invocations or exposing mutable result state.
test('prepared selectors isolate newer plan bytes and returned selection objects', async () => {
  const { createDecompositionPlanSelector } =
    await import('../../../../task-tracker/lib/decomposition-policy.mjs');
  const body =
    '## Plan Metadata\n\n- **Source-plan**: docs/plan.md\n- **Source-plan-section**: ### Task 1: First\n';
  const old = createDecompositionPlanSelector('### Task 1: First\n\nOriginal scope');
  const first = old({ body, activePlanKey: 'Source-plan' });
  assert.deepEqual(first, {
    ok: true,
    applied: true,
    planText: '### Task 1: First\n\nOriginal scope',
    heading: '### Task 1: First',
    diagnostic: null,
  });
  first.planText = 'tampered';
  assert.equal(
    old({ body, activePlanKey: 'Source-plan' }).planText,
    '### Task 1: First\n\nOriginal scope'
  );
  const fresh = createDecompositionPlanSelector('### Task 1: First\n\nChanged scope');
  assert.equal(
    fresh({ body, activePlanKey: 'Source-plan' }).planText,
    '### Task 1: First\n\nChanged scope'
  );
  const conflicting = body + '- **Source-plan-section**: ### Task 2: Other\n';
  assert.equal(fresh({ body: conflicting, activePlanKey: 'Source-plan' }).ok, false);
  assert.deepEqual(fresh({ body: '' }), {
    ok: true,
    applied: false,
    planText: '### Task 1: First\n\nChanged scope',
    heading: null,
    diagnostic: null,
  });
});
