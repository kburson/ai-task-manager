// @story #1052 #1279
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import planState from '../../../../task-tracker/states/plan.mjs';
import {
  decompositionPlanExitGuard,
  evaluateIssueDecomposition,
} from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';
import {
  parseDecomposeCheckArgs,
  runDecomposeCheck,
} from '../../../../task-tracker/verbs/decompose-check.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  parseWbsChildClaim,
  reconcileWbsCoverage,
} from '../../../../task-tracker/lib/decomposition-wbs-coverage.mjs';
import { classifyDecomposition } from '../../../../task-tracker/lib/decomposition-policy.mjs';

const SOURCE_PLAN = 'docs/plan.md';

function wbsChild({
  number,
  task,
  sourcePlan = SOURCE_PLAN,
  sourcePlanCommit = 'child-plan-commit',
  sourcePlanSection = task.heading,
  title = task.title,
} = {}) {
  return {
    number,
    title,
    body: [
      '## Plan Metadata',
      `- **Source-plan**: ${sourcePlan}`,
      `- **Source-plan-commit**: ${sourcePlanCommit}`,
      `- **Source-plan-section**: ${sourcePlanSection}`,
    ].join('\n'),
  };
}

function projectPlan(text) {
  const projectDir = mkdtempSync(join(projectScratchDir('test'), 'aitm-decomposition-gate-'));
  mkdirSync(join(projectDir, 'docs'), { recursive: true });
  const planPath = join(projectDir, 'docs', 'plan.md');
  writeFileSync(planPath, text, 'utf8');
  return { projectDir, planPath };
}

function planText(taskCount = 2, verifiedCount = 2) {
  return Array.from({ length: taskCount }, (_, index) => {
    const number = index + 1;
    const verifier = index < verifiedCount ? `\nRun: \`node --test part-${number}.test.mjs\`` : '';
    return `### Task ${number}: Part ${number}${verifier}`;
  }).join('\n\n');
}

test('parses visible WBS child provenance without trusting Generated-by', () => {
  const task = { number: 1, title: 'Classifier', heading: '### Task 1: Classifier' };
  assert.deepEqual(parseWbsChildClaim(wbsChild({ number: 1201, task })), {
    number: 1201,
    title: 'Classifier',
    sourcePlan: SOURCE_PLAN,
    sourcePlanCommit: 'child-plan-commit',
    sourcePlanSection: '### Task 1: Classifier',
  });
});

test('reconciles complete WBS coverage against content-equivalent pinned plans', async () => {
  const acceptedPlanText = planText(6, 6);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const reads = [];
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: tasks.map((task, index) => wbsChild({ number: 1273 + index, task })),
    readPlanAtCommit: async (input) => {
      reads.push(input);
      return acceptedPlanText;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.expectedCount, 6);
  assert.equal(result.coveredCount, 6);
  assert.equal(reads.length, 1, 'identical commit/path reads are cached');
});

test('rejects duplicate accepted task identities instead of reusing one child claim', async () => {
  const acceptedPlanText = ['### Task 1: Repeated task', '', '### Task 1: Repeated task'].join(
    '\n'
  );
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  assert.equal(tasks.length, 2, 'the classifier preserves duplicate tasks for validation');

  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: [wbsChild({ number: 1301, task: tasks[0] })],
    readPlanAtCommit: async () => acceptedPlanText,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.blockers.some((item) => /wbs-duplicate-task-(?:number|heading)/.test(item)),
    result.blockers.join('\n')
  );
  assert.ok(result.coveredCount <= 1, 'one child claim cannot cover both duplicate tasks');
});

test('reports missing, duplicate, unknown, title, path, and content contradictions', async () => {
  const acceptedPlanText = planText(4, 4);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: [
      wbsChild({ number: 1401, task: tasks[0] }),
      wbsChild({ number: 1402, task: tasks[0] }),
      wbsChild({ number: 1403, task: tasks[1], title: 'Wrong title' }),
      wbsChild({ number: 1404, task: tasks[2], sourcePlan: 'docs/wrong.md' }),
      wbsChild({
        number: 1405,
        task: tasks[2],
        sourcePlanSection: '### Task 99: Unknown',
      }),
      wbsChild({ number: 1406, task: tasks[3] }),
    ],
    readPlanAtCommit: async ({ planPath }) =>
      planPath === SOURCE_PLAN ? `${acceptedPlanText}\nchanged` : acceptedPlanText,
  });
  assert.equal(result.ok, false);
  assert.ok(result.duplicateClaims.some((item) => /#1401.*#1402/.test(item)));
  assert.ok(result.provenanceMismatches.some((item) => /#1403.*title/.test(item)));
  assert.ok(result.provenanceMismatches.some((item) => /#1404.*Source-plan/.test(item)));
  assert.ok(result.unknownSections.some((item) => /#1405.*Task 99/.test(item)));
  assert.ok(result.blockers.some((item) => /pinned plan content differs/.test(item)));
});

test('unrelated children coexist but cannot satisfy a missing WBS task', async () => {
  const acceptedPlanText = planText(2, 2);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const unrelated = wbsChild({
    number: 1500,
    task: { title: 'Follow-on', heading: '### Task 50: Follow-on' },
    sourcePlan: 'docs/other-plan.md',
  });
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: [wbsChild({ number: 1501, task: tasks[0] }), unrelated],
    readPlanAtCommit: async () => acceptedPlanText,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingTasks, [tasks[1].heading]);
  assert.doesNotMatch(result.blockers.join('\n'), /#1500/);
});

function waiver() {
  return `
## Decomposition Waiver

- **Rationale**: One coordinated change is safer.
- **Expected-focused-duration**: 8h
- **Milestone-checkpoint-plan**: Policy, guard, split, verification.
- **Why-no-nested-children**: Shared command registration would conflict.
- **Approved-by**: Automated executor; no human review claimed.
- **Approved-at**: 2026-08-03T12:45:50.976Z
`;
}

function context({ size = 'XL', estimate = 12, text = planText(), bodySuffix = '' } = {}) {
  const { projectDir } = projectPlan(text);
  return {
    issueNumber: 1052,
    cfg: { repo: 'owner/repo', projectId: 'project' },
    body: `## Plan Metadata\n\n- **Plan**: docs/plan.md\n${bodySuffix}`,
    deps: {
      decomposition: {
        projectDir,
        loadProjectFieldDefs: () => [],
        projectValuesForIssue: async () => ({ size, estimate }),
      },
    },
  };
}

function epicMarker() {
  return '\n## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="epic" -->\n';
}

function completeEpicContext(taskCount = 6) {
  const text = planText(taskCount, taskCount);
  const ctx = context({ size: 'L', estimate: 16, text, bodySuffix: epicMarker() });
  const tasks = classifyDecomposition({ planText: text }).tasks;
  ctx.deps.decomposition.fetchWbsChildren = async () =>
    tasks.map((task, index) => wbsChild({ number: 1273 + index, task }));
  ctx.deps.decomposition.readPlanAtCommit = async () => text;
  return ctx;
}

test('evaluator preserves the underlying must-split classification and valid waiver', async () => {
  const result = await evaluateIssueDecomposition(context({ bodySuffix: waiver() }));
  assert.equal(result.classification.status, 'must-split');
  assert.equal(result.waiver.ok, true);
  assert.equal(result.effectiveStatus, 'waived');
  assert.equal(result.planDiagnostic.diagnostic, null);
});

test('plan exit refuses must-split without a valid visible waiver', async () => {
  const result = await decompositionPlanExitGuard.run(context());
  assert.equal(result.ok, false);
  assert.match(result.reason, /plan-exit-decomposition: must-split/);
  assert.ok(result.blockers.some((blocker) => /Decomposition Waiver/.test(blocker)));
});

test('plan exit admits must-split with a complete waiver and preserves warning', async () => {
  const result = await decompositionPlanExitGuard.run(context({ bodySuffix: waiver() }));
  assert.equal(result.ok, true);
  assert.match(result.warn, /waiver accepted/);
});

test('plan exit admits a must-split epic with complete linked WBS coverage', async () => {
  const result = await decompositionPlanExitGuard.run(completeEpicContext());
  assert.equal(result.ok, true);
  assert.match(result.warn, /WBS instantiated \(6\/6\)/);
});

test('plan exit reconciles the exact accepted-plan snapshot used for classification', async () => {
  const acceptedPlanText = planText(4, 4);
  const changedPlanText = `${acceptedPlanText}\n\nChanged after classification.`;
  const ctx = context({
    size: 'L',
    estimate: 16,
    text: acceptedPlanText,
    bodySuffix: epicMarker(),
  });
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  let reads = 0;
  ctx.deps.decomposition.readFile = () => {
    reads += 1;
    return reads === 1 ? acceptedPlanText : changedPlanText;
  };
  ctx.deps.decomposition.fetchWbsChildren = async () =>
    tasks.map((task, index) => wbsChild({ number: 1601 + index, task }));
  ctx.deps.decomposition.readPlanAtCommit = async () => acceptedPlanText;

  const result = await decompositionPlanExitGuard.run(ctx);

  assert.equal(result.ok, true, result.reason);
  assert.match(result.warn, /WBS instantiated \(4\/4\)/);
  assert.equal(reads, 1, 'one guard run consumes one accepted-plan snapshot');
});

test('plan exit reports exact incomplete epic WBS blockers', async () => {
  const ctx = completeEpicContext(4);
  const children = await ctx.deps.decomposition.fetchWbsChildren();
  ctx.deps.decomposition.fetchWbsChildren = async () => children.slice(0, 3);
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => /wbs-missing-task: ### Task 4/.test(item)));
});

test('plan exit keeps a non-epic must-split issue blocked even if child-shaped data exists', async () => {
  const ctx = context({ size: 'L', estimate: 16, text: planText(4, 4) });
  ctx.deps.decomposition.fetchWbsChildren = async () => {
    throw new Error('must not fetch children for code kind');
  };
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /must-split/);
});

test('plan exit fails closed when epic WBS evidence cannot be read', async () => {
  const ctx = completeEpicContext(4);
  ctx.deps.decomposition.fetchWbsChildren = async () => {
    throw new Error('GraphQL unavailable');
  };
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /wbs-evidence-unreadable: GraphQL unavailable/);
});

test('plan exit reports review-only signals without blocking', async () => {
  const result = await decompositionPlanExitGuard.run(
    context({ size: 'L', estimate: 16, text: planText(1, 1) })
  );
  assert.equal(result.ok, true);
  assert.match(result.warn, /needs-decomposition-review/);
  assert.match(result.warn, /estimate-hours/);
});

test('plan exit is a quiet no-op for an atomic story', async () => {
  const result = await decompositionPlanExitGuard.run(
    context({ size: 'M', estimate: 8, text: planText(1, 1) })
  );
  assert.deepEqual(result, { ok: true });
});

test('known board inputs still refuse when the linked plan is unavailable', async () => {
  const ctx = context({ size: 'L', estimate: 24, text: '' });
  ctx.body = '## Plan Metadata\n\n- **Plan**: docs/missing.md';
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /must-split/);
  assert.match(result.reason, /not a readable file/);
});

test('Plan exit still refuses known must-split board fields when the plan link is absent', async () => {
  let boardReads = 0;
  const result = await decompositionPlanExitGuard.run({
    issueNumber: 1052,
    cfg: { repo: 'owner/repo', projectId: 'project' },
    body: '## just a legacy body',
    deps: {
      decomposition: {
        projectValuesForIssue: async () => {
          boardReads += 1;
          return { size: 'XL', estimate: 24 };
        },
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /must-split/);
  assert.match(result.reason, /no linked plan path/);
  assert.equal(boardReads, 1);
});

test('registers the decomposition guard before the epic children guard', () => {
  const ids = planState.exitGuards.map((guard) => guard.id);
  assert.ok(ids.includes('plan-exit-decomposition'));
  assert.ok(
    ids.indexOf('plan-exit-decomposition') < ids.indexOf('plan-exit-epic-children-r4p-or-beyond')
  );
});

test('read-only command returns structured classification without mutation', async () => {
  const ctx = context({ size: 'M', estimate: 8, text: planText(1, 1) });
  const result = await runDecomposeCheck({
    issueNumber: 1052,
    cfg: ctx.cfg,
    deps: {
      fetchIssueBody: async () => ctx.body,
      decomposition: ctx.deps.decomposition,
    },
  });
  assert.equal(result.classification.status, 'story-ok');
  assert.equal(result.issueNumber, 1052);
  assert.equal(result.exitCode, 0);
});

test('decompose-check rejects a missing --plan value instead of consuming another option', () => {
  assert.throws(() => parseDecomposeCheckArgs(['1052', '--plan', '--json']), /requires a path/);
});
