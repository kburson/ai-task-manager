// @story #1052
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
