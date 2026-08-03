// @story #1052
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyDecomposition,
  extractPlanTasks,
  linkedPlanPath,
  parseDecompositionWaiver,
  resolvePlanPath,
  visibleMetadataFieldValue,
} from '../../../lib/decomposition-policy.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

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

test('ignores fenced examples, zero-number tasks, and empty task titles', () => {
  const planText = [
    '```markdown',
    '### Task 1: Example only',
    'Run: `node --test example.test.mjs`',
    '```',
    '~~~text',
    '### Milestone 2: Another example',
    '~~~',
    '### Task 0: Invalid zero',
    'Run: `node --test zero.test.mjs`',
    '### Task 3:',
    'Run: `node --test empty.test.mjs`',
    '### Task 4: Real task',
    'Run: `node --test real.test.mjs`',
  ].join('\n');
  const tasks = extractPlanTasks(planText);
  assert.deepEqual(
    tasks.map((task) => [task.number, task.title]),
    [[4, 'Real task']]
  );
  assert.equal(classifyDecomposition({ size: 'M', estimateHours: 8, planText }).status, 'story-ok');
});

test('ignores task headings and commands hidden inside HTML comments', () => {
  const tasks = extractPlanTasks(`<!--
### Task 1: Hidden
Run: \`node --test hidden.test.mjs\`
-->
### Task 2: Visible
Run: \`node --test visible.test.mjs\``);
  assert.deepEqual(
    tasks.map(({ number, title, commands }) => ({ number, title, commands })),
    [{ number: 2, title: 'Visible', commands: ['node --test visible.test.mjs'] }]
  );
});

test('preserves pinned task body bytes while hiding comments from command extraction', () => {
  const [task] = extractPlanTasks(`### Task 1: Preserve source
\`\`\`markdown
<!-- aitm-visible-example -->
\`\`\`
<!-- Run: \`node --test hidden.test.mjs\` -->
Run: \`node --test visible.test.mjs --grep '<!-- literal -->'\``);
  assert.match(task.body, /<!-- aitm-visible-example -->/);
  assert.match(task.body, /hidden\.test\.mjs/);
  assert.deepEqual(task.commands, ["node --test visible.test.mjs --grep '<!-- literal -->'"]);
});

test('ignores verifier examples inside multiline code spans and ordinary fences', () => {
  const [task] = extractPlanTasks(`### Task 1: Examples are not verifiers
\`\`
Run: \`node --test inline-example.test.mjs\`
\`\`
\`\`\`markdown
Run: \`node --test fenced-example.test.mjs\`
\`\`\``);
  assert.deepEqual(task.commands, []);
});

test('does not let a verification label authorize a later ordinary fence', () => {
  const [task] = extractPlanTasks(`### Task 1: Fence ownership
**Verification Commands:**
\`\`\`sh
node --test real.test.mjs
\`\`\`

\`\`\`markdown
Run: \`node --test example-only.test.mjs\`
\`\`\``);
  assert.deepEqual(task.commands, ['node --test real.test.mjs']);
});

test('preserves verifier source order and accepts labeled tilde fences', () => {
  const [task] = extractPlanTasks(`### Task 1: Ordered verifiers
**Verification Commands:**
~~~sh
node --test first.test.mjs
~~~
Run: \`node --test second.test.mjs\``);
  assert.deepEqual(task.commands, ['node --test first.test.mjs', 'node --test second.test.mjs']);
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

test('linked plan metadata skips placeholder values', () => {
  const body = `## Plan Metadata

- **Implementation-plan**: <!-- TBD -->
- **Source-plan**: docs/source.md
- **Plan**: docs/fallback.md`;
  assert.equal(linkedPlanPath(body), 'docs/source.md');
});

test('linked plan metadata ignores sections hidden inside HTML comments', () => {
  const body = `<!--
## Plan Metadata
- **Implementation-plan**: docs/hidden.md
-->
## Plan Metadata
- **Plan**: docs/visible.md`;
  assert.equal(linkedPlanPath(body), 'docs/visible.md');
});

test('linked plan metadata ignores fenced examples', () => {
  const body = `\`\`\`markdown
## Plan Metadata
- **Implementation-plan**: docs/example.md
\`\`\`
## Plan Metadata
- **Plan**: docs/visible.md`;
  assert.equal(linkedPlanPath(body), 'docs/visible.md');
});

test('resolvePlanPath contains paths to the repository and reports unavailable inputs', () => {
  const projectDir = mkdtempSync(join(projectScratchDir('test'), 'aitm-decomposition-policy-'));
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
    resolvePlanPath({ projectDir, body: '', overridePath: join(projectDir, 'docs', 'plan.md') })
      .diagnostic,
    /must be repository-relative/
  );
  assert.match(
    resolvePlanPath({ projectDir, body: '## Plan Metadata\n\n- **Plan**: docs/missing.md' })
      .diagnostic,
    /not a readable file/
  );

  const outside = join(projectDir, '..', 'outside-plan.md');
  writeFileSync(outside, '# Outside\n', 'utf8');
  symlinkSync(outside, join(projectDir, 'docs', 'outside-link.md'));
  assert.match(
    resolvePlanPath({
      projectDir,
      body: '## Plan Metadata\n\n- **Plan**: docs/outside-link.md',
    }).diagnostic,
    /must not be a symbolic link/
  );

  symlinkSync('plan.md', join(projectDir, 'docs', 'inside-link.md'));
  assert.match(
    resolvePlanPath({
      projectDir,
      body: '## Plan Metadata\n\n- **Plan**: docs/inside-link.md',
    }).diagnostic,
    /must not be a symbolic link/
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
  assert.match(
    parseDecompositionWaiver(waiverBody({ 'Approved-at': 'August 3, 2026' })).reason,
    /invalid Approved-at/
  );
  assert.match(
    parseDecompositionWaiver(waiverBody({ 'Approved-at': '2026-02-30T12:00:00Z' })).reason,
    /invalid Approved-at/
  );
});

test('rejects duplicate decomposition waiver sections', () => {
  const duplicate = `${waiverBody()}\n\n${waiverBody()}`;
  assert.equal(parseDecompositionWaiver(duplicate).ok, false);
  assert.equal(parseDecompositionWaiver(duplicate).reason, 'duplicate sections');
});

test('rejects a complete waiver hidden inside an HTML comment', () => {
  const hidden = `<!--\n${waiverBody()}\n-->`;
  assert.equal(parseDecompositionWaiver(hidden).ok, false);
  assert.equal(parseDecompositionWaiver(hidden).reason, 'missing');
});

test('rejects a complete waiver presented only as a fenced example', () => {
  const fenced = `\`\`\`markdown\n${waiverBody()}\n\`\`\``;
  assert.equal(parseDecompositionWaiver(fenced).ok, false);
  assert.equal(parseDecompositionWaiver(fenced).reason, 'missing');
});

test('escaped and unmatched backticks do not expose hidden structures', () => {
  for (const prefix of ['\\`', '`']) {
    const hiddenWaiver = [prefix + '<!--', waiverBody(), '-->'].join('\n');
    assert.equal(parseDecompositionWaiver(hiddenWaiver).reason, 'missing');

    const hiddenTask = [
      prefix + '<!--',
      '### Task 9: Hidden',
      'Run: `node --test hidden.test.mjs`',
      '-->',
    ].join('\n');
    assert.deepEqual(extractPlanTasks(hiddenTask), []);

    const hiddenMetadata = [
      prefix + '<!--',
      '## Plan Metadata',
      '- **Governing-spec**: docs/hidden.md',
      '-->',
    ].join('\n');
    assert.equal(
      visibleMetadataFieldValue(hiddenMetadata, 'Plan Metadata', 'Governing-spec'),
      null
    );
  }
});

test('multiline code spans stop at Markdown block boundaries', () => {
  for (const delimiter of ['`', '``']) {
    const visibleWaiver = [`Introduction ${delimiter}unmatched`, '', waiverBody()].join('\n');
    assert.equal(parseDecompositionWaiver(visibleWaiver).ok, true);

    const visibleTask = [`Introduction ${delimiter}unmatched`, '', taskPlan(4, 4)].join('\n');
    const classification = classifyDecomposition({
      size: 'M',
      estimateHours: 8,
      planText: visibleTask,
    });
    assert.equal(classification.taskCount, 4);
    assert.equal(classification.status, 'must-split');

    const visibleMetadata = [
      `Introduction ${delimiter}unmatched`,
      '',
      '## Plan Metadata',
      '- **Governing-spec**: docs/visible.md',
    ].join('\n');
    assert.equal(
      visibleMetadataFieldValue(visibleMetadata, 'Plan Metadata', 'Governing-spec'),
      'docs/visible.md'
    );
  }
});

test('multiline code spans remain active across soft line breaks', () => {
  const [task] = extractPlanTasks(`### Task 1: Visible
Paragraph with \`literal text
and <!-- comment-looking text --> inside the span\`
Run: \`node --test visible.test.mjs\``);
  assert.deepEqual(task.commands, ['node --test visible.test.mjs']);
});
