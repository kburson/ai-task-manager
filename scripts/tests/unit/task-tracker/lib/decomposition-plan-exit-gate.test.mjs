// @story #1052 #1279 #1281
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
  rank = number,
  blockedBy = [],
  hasCurrentRefinement = true,
} = {}) {
  return {
    number,
    title,
    rank,
    blockedBy,
    hasCurrentRefinement,
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

// @story #1991 — decisions use the real current collector, not legacy permission fixtures.
import { governedFixture } from './decomposition-governed-fixtures.mjs';
import { currentUnitAuthority } from './decomposition-unit-admission-fixture.mjs';
import { formatDecomposeCheck } from '../../../../task-tracker/verbs/decompose-check.mjs';
import { unavailable } from './decomposition-authority-fixtures.mjs';
async function selectedContext({
  text = planText(6, 6),
  section = '### Task 1: Part 1',
  hours = 13,
} = {}) {
  const f = await governedFixture(hours);
  writeFileSync(join(f.projectDir, 'docs/plan.md'), text);
  f.authority.deps.readPlanAtCommit = async () => text;
  delete f.authority.deps.readSelectedPlan;
  f.authority.body = f.authority.body.replace(
    '- **Source-plan-commit**:',
    '- **Source-plan-section**: ' + section + '\n- **Source-plan-commit**:'
  );
  await f.runtime.refresh(f.subject).catch(() => {});
  const ctx = {
    issueNumber: 1,
    cfg: f.cfg,
    body: f.authority.body,
    deps: { decomposition: f.deps },
  };
  return { ...f, ctx };
}
test('bounded selected child derives one task from exact pinned source bytes', async () => {
  const f = await selectedContext();
  const evaluated = await evaluateIssueDecomposition(f.ctx);
  assert.equal(evaluated.classification.taskCount, 1);
  assert.equal(evaluated.assessment.status, 'story-ok');
  assert.equal(evaluated.planSelection.heading, '### Task 1: Part 1');
  assert.deepEqual(await decompositionPlanExitGuard.run(f.ctx), { ok: true });
});
for (const section of [
  '### Task 99: Missing',
  '### Task 1: Part 1\n- **Source-plan-section**: ### Task 2: Part 2',
])
  test('invalid selected source cannot grant permission: ' + section, async () => {
    const f = await selectedContext({ section });
    const evaluated = await evaluateIssueDecomposition(f.ctx);
    assert.equal(evaluated.assessment.status, 'indeterminate');
    assert.equal(evaluated.planSelection.ok, false);
    const gate = await decompositionPlanExitGuard.run(f.ctx);
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'decomposition-authority-unavailable');
    const check = await runDecomposeCheck({
      issueNumber: 1,
      cfg: f.cfg,
      deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
    });
    assert.equal(check.exitCode, 3);
  });
test('a command plan override cannot replace the bound child authority', async () => {
  const f = await selectedContext();
  const checked = await runDecomposeCheck({
    issueNumber: 1,
    cfg: f.cfg,
    planOverride: 'docs/plan.md',
    deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
  });
  assert.equal(checked.classification.taskCount, 1);
  assert.equal(checked.planSelection.applied, true);
  assert.equal(checked.exitCode, 0);
});
for (const hours of [8, 16, 24, 25])
  test('Plan exit preserves current estimate boundary ' + hours, async () => {
    const f = await selectedContext({ text: planText(1, 1), hours });
    const r = await decompositionPlanExitGuard.run(f.ctx);
    assert.equal(r.ok, hours < 24);
    if (hours >= 24) {
      assert.equal(r.code, 'decomposition-required');
      assert.match(r.reason, /split-plan 1 --dry-run/);
    }
  });
test('an unavailable linked plan refuses while retaining known mandatory estimate signals', async () => {
  const f = await selectedContext({ hours: 25 });
  f.authority.body = f.authority.body.replace('docs/plan.md', 'docs/missing.md');
  const r = await evaluateIssueDecomposition({ ...f.ctx, body: f.authority.body });
  assert.equal(r.assessment.status, 'indeterminate');
  assert.equal(r.input.estimate.hours, 25);
  assert.ok(r.assessment.signals.some((s) => s.code === 'estimate-hours' && s.value === 25));
});
for (const terminal of [false, true])
  test(
    'materialized children permit only their affected epic boundary: terminal=' + terminal,
    async () => {
      const f = await currentUnitAuthority({
        body: '## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n',
        hours: 25,
        childTerminal: terminal,
      });
      await f.runtime.refresh(f.subject);
      const ctx = {
        issueNumber: 1,
        cfg: f.cfg,
        body: f.authority.body,
        deps: {
          decomposition: { subject: f.subject, runtime: f.runtime, projectDir: f.projectDir },
        },
      };
      const r = await evaluateIssueDecomposition(ctx);
      assert.equal(r.assessment.status, 'epic-readiness-required');
      assert.equal(r.input.epicReadiness.planning, true);
      assert.equal(r.input.epicReadiness.completion, terminal);
      assert.equal(r.capabilities.includes('scoped-implementation'), false);
      assert.equal(r.capabilities.includes('scoped-completion'), terminal);
      assert.equal((await decompositionPlanExitGuard.run(ctx)).ok, true);
      const checked = await runDecomposeCheck({
        issueNumber: 1,
        cfg: f.cfg,
        deps: {
          fetchIssueBody: async () => f.authority.body,
          decomposition: ctx.deps.decomposition,
        },
      });
      assert.equal(checked.exitCode, terminal ? 0 : 3);
      assert.doesNotMatch(formatDecomposeCheck(checked), /waiver/i);
    }
  );
test('unreviewed converted epic cannot claim planning or completion from kind alone', async () => {
  const f = await governedFixture();
  f.ctx.rest = ['1', 'epic'];
  const { verbKind } = await import('../../../../task-tracker/verbs/kind.mjs');
  await verbKind(f.ctx);
  const ctx = {
    issueNumber: 1,
    cfg: f.cfg,
    body: f.authority.body,
    deps: { decomposition: f.deps },
  };
  const r = await evaluateIssueDecomposition(ctx);
  assert.equal(r.input.epicReadiness.planning, false);
  assert.equal(r.input.epicReadiness.completion, false);
  assert.equal((await decompositionPlanExitGuard.run(ctx)).ok, false);
});
test('unreadable children remain unavailable rather than being treated as an empty ready graph', async () => {
  const f = await currentUnitAuthority({
    body: '## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n',
    hours: 25,
  });
  f.authority.deps.readProject = async () => unavailable();
  const r = await decompositionPlanExitGuard.run({
    issueNumber: 1,
    cfg: f.cfg,
    body: f.authority.body,
    deps: { decomposition: { subject: f.subject, runtime: f.runtime, projectDir: f.projectDir } },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'decomposition-authority-unavailable');
});
test('read-only command neither writes nor refreshes current authority', async () => {
  const f = await selectedContext();
  const before = f.authority.body,
    count = f.authority.writes.length;
  const r = await runDecomposeCheck({
    issueNumber: 1,
    cfg: f.cfg,
    deps: { fetchIssueBody: async () => f.authority.body, decomposition: f.deps },
  });
  assert.equal(r.exitCode, 0);
  assert.equal(f.authority.body, before);
  assert.equal(f.authority.writes.length, count);
});
test('decompose-check rejects a missing --plan value instead of consuming another option', () => {
  assert.throws(() => parseDecomposeCheckArgs(['1', '--plan', '--json']), /requires a path/);
});
