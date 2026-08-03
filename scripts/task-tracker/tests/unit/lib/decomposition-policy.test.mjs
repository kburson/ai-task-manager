import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifyDecomposition,
  extractPlanTasks,
  linkedPlanPath,
  parseDecompositionWaiver,
  resolvePlanPath,
} from '../../../lib/decomposition-policy.mjs';

function taskPlan(taskCount, verifiedCount) {
  return Array.from({ length: taskCount }, (_, index) => {
    const number = index + 1;
    const verifier = index < verifiedCount ? `\nRun: \`node --test task-${number}.test.mjs\`` : '';
    return `### Task ${number}: Deliver part ${number}${verifier}`;
  }).join('\n\n');
}

test('classifies fixed decomposition thresholds with must-split precedence', () => {
  const cases = [
    [{ size: 'M', estimateHours: 8, planText: taskPlan(2, 1) }, 'story-ok'],
    [{ size: 'XL', estimateHours: 12, planText: '' }, 'needs-decomposition-review'],
    [{ size: 'L', estimateHours: 16, planText: '' }, 'needs-decomposition-review'],
    [{ size: 'M', estimateHours: 8, planText: taskPlan(3, 1) }, 'needs-decomposition-review'],
    [{ size: 'M', estimateHours: 8, planText: taskPlan(2, 2) }, 'needs-decomposition-review'],
    [{ size: 'XL', estimateHours: 12, planText: taskPlan(2, 2) }, 'must-split'],
    [{ size: 'L', estimateHours: 24, planText: '' }, 'must-split'],
    [{ size: 'M', estimateHours: 8, planText: taskPlan(4, 1) }, 'must-split'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(classifyDecomposition(input).status, expected);
  }
});

test('preserves missing values instead of treating them as zero', () => {
  const result = classifyDecomposition({ size: null, estimateHours: null, planText: '' });
  assert.equal(result.status, 'story-ok');
  assert.deepEqual(result.signals, []);
});

test('extracts only exact numbered H3 tasks and explicit verifier syntax', () => {
  const tasks = extractPlanTasks(`
## Task 9: ignored depth
### Task 1: Parser
Run: \`node --test parser.test.mjs\`
Run: \`node --test parser.test.mjs\`
### Milestone 2: CLI
**Verification Commands:**
\`\`\`sh
node --test cli.test.mjs
npm run lint
\`\`\`
#### Task 3: ignored depth
`);

  assert.deepEqual(
    tasks.map(({ number, kind, title, commands }) => ({ number, kind, title, commands })),
    [
      {
        number: 1,
        kind: 'task',
        title: 'Parser',
        commands: ['node --test parser.test.mjs'],
      },
      {
        number: 2,
        kind: 'milestone',
        title: 'CLI',
        commands: ['node --test cli.test.mjs', 'npm run lint'],
      },
    ]
  );
});

test('matches task keywords case-insensitively and retains duplicate numbers for validation', () => {
  const tasks = extractPlanTasks('### task 1: First\n\n### MILESTONE 1: Second');
  assert.deepEqual(
    tasks.map((task) => [task.number, task.kind, task.title]),
    [
      [1, 'task', 'First'],
      [1, 'milestone', 'Second'],
    ]
  );
});

test('linked plan metadata prefers Implementation-plan and strips a commit suffix', () => {
  const body = `## Plan Metadata

- **Plan**: docs/third.md
- **Source-plan**: docs/second.md
- **Implementation-plan**: docs/first.md @ abc1234

## Scope
text`;
  assert.equal(linkedPlanPath(body), 'docs/first.md');
});

test('resolvePlanPath contains paths to the repository and reports unavailable inputs', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'aitm-decomposition-policy-'));
  mkdirSync(join(projectDir, 'docs'), { recursive: true });
  writeFileSync(join(projectDir, 'docs', 'plan.md'), '# Plan\n', 'utf8');

  assert.deepEqual(
    resolvePlanPath({
      projectDir,
      body: '## Plan Metadata\n\n- **Plan**: docs/plan.md',
    }),
    { path: join(projectDir, 'docs', 'plan.md'), source: 'metadata', diagnostic: null }
  );
  assert.match(
    resolvePlanPath({ projectDir, body: '', overridePath: '../outside.md' }).diagnostic,
    /outside repository root/
  );
  assert.match(
    resolvePlanPath({ projectDir, body: '## Plan Metadata\n\n- **Plan**: docs/missing.md' })
      .diagnostic,
    /not a readable file/
  );
});

function waiverBody(overrides = {}) {
  const values = {
    Rationale: 'One coordinated change is safer.',
    'Expected-focused-duration': '8h',
    'Milestone-checkpoint-plan': 'Policy, guard, split, verification.',
    'Why-no-nested-children': 'The shared command registry makes branches conflict.',
    'Approved-by': 'Automated executor; no human review claimed.',
    'Approved-at': '2026-08-03T12:45:50.976Z',
    ...overrides,
  };
  return `## Decomposition Waiver\n\n${Object.entries(values)
    .map(([key, value]) => `- **${key}**: ${value}`)
    .join('\n')}\n\n## Acceptance Criteria`;
}

test('accepts a complete visible decomposition waiver', () => {
  const result = parseDecompositionWaiver(waiverBody());
  assert.equal(result.ok, true);
  assert.equal(result.fields['Expected-focused-duration'], '8h');
});

test('rejects missing, duplicated, and malformed decomposition waiver fields', () => {
  assert.equal(parseDecompositionWaiver('## Scope\nnone').reason, 'missing');

  const missing = waiverBody().replace(/^- \*\*Approved-by\*\*.*\n/m, '');
  assert.equal(parseDecompositionWaiver(missing).ok, false);
  assert.deepEqual(parseDecompositionWaiver(missing).missing, ['Approved-by']);

  const duplicate = waiverBody().replace(
    '## Acceptance Criteria',
    '- **Rationale**: duplicate\n\n## Acceptance Criteria'
  );
  assert.deepEqual(parseDecompositionWaiver(duplicate).duplicates, ['Rationale']);

  assert.match(
    parseDecompositionWaiver(waiverBody({ 'Expected-focused-duration': 'zero' })).reason,
    /invalid Expected-focused-duration/
  );
  assert.match(
    parseDecompositionWaiver(waiverBody({ 'Approved-at': 'not-a-date' })).reason,
    /invalid Approved-at/
  );
});
