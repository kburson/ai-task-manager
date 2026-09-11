// @story #1579

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  validateGovernedLinkedPlan,
  validateGovernedPlanContent,
} from '../../../../task-tracker/lib/governed-plan-policy.mjs';

function linkedBody(relative) {
  return `## Plan Metadata\n\n- **Implementation-plan**: ${relative}\n`;
}

test('accepts the governed issue-body verb and runtime output paths', () => {
  const result = validateGovernedPlanContent(`
# Plan

Run: \`npx aitm issue-body #42 --operation-file .scratch/gh/42-operation.json\`

Inspect generated state under \`.tmp/aitm/state/\`.
`);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('rejects direct GitHub issue-body replacement with a stable line diagnostic', () => {
  const result = validateGovernedPlanContent(
    '# Plan\n\nRun: `gh issue edit 42 --body-file .scratch/gh/body.md`\n'
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations[0], {
    rule: 'governed-plan-raw-issue-body-write',
    line: 3,
    excerpt: 'Run: `gh issue edit 42 --body-file .scratch/gh/body.md`',
  });
});

test('rejects executable internal issue-body mutator calls', () => {
  const result = validateGovernedPlanContent(
    '# Plan\n\n```js\nawait mutateIssueBody({ issueNumber, repo, mutate });\n```\n'
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ rule }) => rule === 'governed-plan-internal-mutator-call'));
});

test('rejects one-off GitHub mutator scripts in disposable scratch', () => {
  const result = validateGovernedPlanContent(
    '# Plan\n\nRun: `node .scratch/gh/42-align-body.mjs`\n'
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ rule }) => rule === 'governed-plan-one-off-mutator'));
});

test('rejects operator GitHub and plan artifacts in the runtime output bucket', () => {
  const result = validateGovernedPlanContent(
    '# Plan\n\nUse `.tmp/gh/body.json` and `.tmp/plan/scope.md`.\n'
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.violations.map(({ rule }) => rule),
    ['governed-plan-scratch-drift', 'governed-plan-scratch-drift']
  );
});

test('validates only the active linked plan and leaves no-plan issues compatible', () => {
  const noPlan = validateGovernedLinkedPlan({ body: '## Plan Metadata\n', projectDir: '.' });
  assert.deepEqual(noPlan, { ok: true, status: 'not-applicable', violations: [] });

  const relative = 'docs/plan.md';
  const valid = validateGovernedLinkedPlan({
    body: linkedBody(relative),
    projectDir: '/repo',
    deps: {
      resolvePlanPath: () => ({ path: '/repo/docs/plan.md' }),
      readFile: () =>
        '# Plan\n\nRun: `npx aitm issue-body #42 --operation-file .scratch/gh/42-op.json`\n',
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.status, 'valid');
  assert.equal(valid.planPath, relative);
});

test('fails closed when linked Plan Metadata does not resolve to a readable file', () => {
  const result = validateGovernedLinkedPlan({
    body: linkedBody('docs/missing.md'),
    projectDir: '/repo',
    deps: {
      resolvePlanPath: () => ({
        path: null,
        diagnostic: 'linked plan path is not a readable file',
      }),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid');
  assert.equal(result.violations[0].rule, 'governed-plan-unreadable');
  assert.match(result.violations[0].excerpt, /not a readable file/);
});
