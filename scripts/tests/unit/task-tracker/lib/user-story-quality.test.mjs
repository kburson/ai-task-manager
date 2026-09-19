// @story #1709
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  evaluateStoryProse,
  evaluateStoryBody,
  storyDigest,
  intentDigest,
  parseStoryIntent,
  resolveStoryIntent,
  renderStoryFromIntent,
} from '../../../../task-tracker/lib/user-story-quality.mjs';
import { markdownViews } from '../../../../task-tracker/lib/plan-markdown-views.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from '../../../../task-tracker/lib/user-story-author.mjs';
import {
  extractPlanTasks,
  selectDecompositionPlanSection,
} from '../../../../task-tracker/lib/decomposition-policy.mjs';
import { validateUserStory } from '../../../../task-tracker/lib/user-story-guard.mjs';
import { verifyIssueBody } from '../../../../gh/lib/issue-body-verifier.mjs';

const draft = { mode: 'draft', canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE };
const approval = { ...draft, mode: 'approval' };
const good =
  'As a release operator\nI want to stop partial publication because checks can fail\nSo that consumers receive a complete package';
const intent = {
  beneficiary: 'release operator',
  capability: 'stop partial publication',
  need: 'checks can fail',
  value: 'consumers receive a complete package',
};
const fields =
  '- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** checks can fail\n- **Value or failure prevented:** consumers receive a complete package';
const block = (level = 2) => `${'#'.repeat(level)} Story Intent\n\n${fields}`;
const metadata = (selector = '', refs = '- **Source-plan**: docs/plan.md') =>
  `## Plan Metadata\n${refs}\n${selector ? `- **Source-plan-section**: ${selector}` : ''}`;
const deepDive = `## Deep-Dive Analysis (2026-09-19)\n${block(3)}`;
const planText = `${block()}\n## Tasks\n### Task 1: Release safely\n${block(4)}\n### Task 2: Audit\n${block(4).replace('release operator', 'security auditor')}`;
const observation = (text = planText, key = 'Source-plan', path = 'docs/plan.md') => ({
  key,
  path,
  text,
  contentSha256: createHash('sha256').update(text).digest('hex'),
  tasks: extractPlanTasks(text),
});
const codes = (result) => result.violations.map((v) => v.code);

test('requires explicit valid evaluator configuration', () => {
  for (const options of [undefined, {}, { mode: 'draft' }, { ...draft, mode: 'other' }]) {
    assert.throws(() => evaluateStoryProse(good, options), TypeError);
    assert.throws(() => evaluateStoryBody(`## User Story\n${good}`, options), TypeError);
  }
});

test('only draft mode accepts empty or canonical template prose', () => {
  for (const prose of ['', CANONICAL_USER_STORY_TEMPLATE]) {
    assert.equal(evaluateStoryProse(prose, draft).ok, true);
    assert.deepEqual(codes(evaluateStoryProse(prose, approval)), [
      'story-required-at-plan-approval',
    ]);
  }
  assert.equal(evaluateStoryProse(good, approval).ok, true);
});

test('reports the nine closed story codes in specification order', () => {
  const cases = [
    [evaluateStoryBody('## Scope\ntext', approval), ['story-section-missing']],
    [
      evaluateStoryBody(`## Scope\ntext\n## User Story\n${good}`, approval),
      ['story-section-position-invalid'],
    ],
    [evaluateStoryProse('', approval), ['story-required-at-plan-approval']],
    [evaluateStoryProse(good + '\nExtra', approval), ['story-shape-invalid']],
    [
      evaluateStoryProse(
        good.replace('release operator', '[who wants to accomplish something]'),
        approval
      ),
      ['story-placeholder'],
    ],
    [
      evaluateStoryProse(good.replace('release operator', 'governed delivery agent'), approval),
      ['story-administrative-beneficiary'],
    ],
    [
      evaluateStoryProse(
        good.replace(
          'stop partial publication because checks can fail',
          'execute Milestone 2 from the plan'
        ),
        approval
      ),
      ['story-task-as-capability'],
    ],
    [
      evaluateStoryProse(
        good.replace('consumers receive a complete package', 'the parent issue advances'),
        approval
      ),
      ['story-workflow-progress-value'],
    ],
    [
      evaluateStoryProse(
        good.replace('consumers receive a complete package', 'implementation is traceable'),
        approval
      ),
      ['story-traceability-only-value'],
    ],
  ];
  for (const [result, expected] of cases) assert.deepEqual(codes(result), expected);
});

test('aggregates independent violations without duplicate codes in draft and approval', () => {
  const weak =
    'As a governed delivery agent\nI want to deliver Task 1: Release from the pinned source plan\nSo that issue #1 advances through traceable execution';
  const expected = [
    'story-administrative-beneficiary',
    'story-task-as-capability',
    'story-workflow-progress-value',
    'story-traceability-only-value',
  ];
  for (const options of [draft, approval])
    assert.deepEqual(codes(evaluateStoryProse(weak, options)), expected);
});

test('requires exact prefixes and three substantive lines without bullets', () => {
  for (const prose of [
    good.toLowerCase(),
    `- ${good}`,
    good.replace('I want to', 'I want'),
    good.replace('As a', 'As the'),
    good + '\nextra',
    good.split('\n').slice(0, 2).join('\n'),
  ]) {
    assert.ok(codes(evaluateStoryProse(prose, approval)).includes('story-shape-invalid'), prose);
  }
  assert.equal(
    evaluateStoryProse(good.replace('As a release operator', 'As an auditor'), approval).ok,
    true
  );
});

test('hashes normalized lines but preserves internal spacing and excludes marker lines', () => {
  const first = evaluateStoryBody(`## User Story\n${good}`, approval);
  const marked = evaluateStoryBody(
    `## User Story\r\n${good.replaceAll('\n', '\r\n')}\r\n <!-- evidence -->`,
    approval
  );
  assert.equal(marked.ok, true);
  assert.deepEqual(marked.lines, good.split('\n'));
  assert.equal(storyDigest(first.lines), createHash('sha256').update(good).digest('hex'));
  assert.equal(storyDigest(first.lines), storyDigest(marked.lines));
  assert.notEqual(
    storyDigest(first.lines),
    storyDigest(good.replace('stop partial', 'stop  partial').split('\n'))
  );
  assert.equal(storyDigest([...first.lines, '<!-- updated -->']), storyDigest(first.lines));
});

test('all body validation surfaces retain raw first-H2 semantics around fenced decoys', () => {
  for (const prefix of ['```md\n## Scope\n```\n', '<!--\n## Scope\n-->\n', '## Scope\n']) {
    const body = `${prefix}## User Story\n${good}`;
    assert.ok(codes(evaluateStoryBody(body, approval)).includes('story-section-position-invalid'));
    assert.equal(validateUserStory(body).ok, false);
    assert.ok(verifyIssueBody(body).missing.includes('## User Story must be the first H2 section'));
  }
  const body = `<!-- marker -->\n## User Story\n${good}`;
  assert.equal(evaluateStoryBody(body, approval).ok, true);
  assert.equal(validateUserStory(body).ok, true);
  assert.ok(!verifyIssueBody(body).missing.includes('## User Story must be the first H2 section'));
});

test('anchored phrase families accept meaningful delivery, agent and traceability roles', () => {
  for (const actor of ['delivery operator', 'agent platform operator', 'security auditor']) {
    const prose = good
      .replace('release operator', actor)
      .replace(
        'consumers receive a complete package',
        'auditors trace an unauthorized change to prevent recurrence'
      );
    assert.equal(evaluateStoryProse(prose, approval).ok, true);
  }
  for (const actor of ['governed agent', 'delivery agent.', 'implementation agent!']) {
    assert.ok(
      codes(evaluateStoryProse(good.replace('release operator', actor), approval)).includes(
        'story-administrative-beneficiary'
      )
    );
  }
  for (const value of [
    'the epic completes.',
    'task #7 is completed',
    'the parent advances through traceable implementation',
  ]) {
    assert.ok(
      codes(
        evaluateStoryProse(good.replace('consumers receive a complete package', value), approval)
      ).includes('story-workflow-progress-value')
    );
  }
});

test('offline corpus has exactly 24 honestly observed repairs and renderer negatives', () => {
  const corpus = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/user-story-quality/audited-stories.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(corpus.schema, 'aitm.user-story-quality-corpus/v1');
  assert.deepEqual(
    corpus.stories.map((r) => r.issue).sort((a, b) => a - b),
    [749, 750, 1462, 1463, ...Array.from({ length: 18 }, (_, i) => 1532 + i), 1692, 1693]
  );
  assert.equal(new Set(corpus.stories.map((r) => r.issue)).size, 24);
  for (const row of corpus.stories) {
    assert.deepEqual(
      codes(evaluateStoryProse(row.weakStory, approval)),
      row.expectedViolationCodes,
      String(row.issue)
    );
    assert.equal(evaluateStoryProse(row.repairedStory, approval).ok, true, String(row.issue));
    assert.equal(row.provenance.repairedSource, 'live-body');
    assert.ok(Number.isFinite(Date.parse(row.provenance.capturedAt)));
    assert.equal(
      row.provenance.repairedSha256,
      createHash('sha256').update(row.repairedStory).digest('hex')
    );
    assert.match(row.provenance.rendererCommit, /^[a-f0-9]{40}$/);
    assert.ok(row.provenance.metadataSource.includes(row.issueUrl));
  }
});

test('all scope levels parse original inline-code field values with normalized indentation and CRLF', () => {
  for (const level of [2, 3, 4]) {
    const text = block(level)
      .replace('checks can fail', '`checks` can fail')
      .replaceAll('- **', '\t - **')
      .replaceAll('\n', '\r\n');
    const result = parseStoryIntent(text, { headingLevel: level });
    assert.equal(result.ok, true);
    assert.deepEqual(result.intent, { ...intent, need: '`checks` can fail' });
    assert.equal(result.range.start, 1);
  }
});

test('rejects missing, duplicate, unknown, empty, continuation and nested intent fields', () => {
  const cases = [
    block().replace('- **Need:** checks can fail', ''),
    block() + '\n- **Need:** duplicate',
    block() + '\n- **Unknown:** extra',
    block().replace('checks can fail', ''),
    block() + '\n  continuation',
    block() + '\n### Details\ntext',
    block() + '\n' + block(),
    block(3),
  ];
  for (const text of cases) {
    const result = parseStoryIntent(text, { headingLevel: 2 });
    assert.equal(result.ok, false, text);
    assert.equal(result.intent, null);
  }
});

test('ignores fenced, commented and inline-code heading decoys without losing line alignment', () => {
  for (const decoy of [
    `\`\`\`md\n${block()}\n\`\`\``,
    `<!--\n${block()}\n-->`,
    '`## Story Intent`',
  ]) {
    const text = `${decoy}\n${block()}`;
    assert.equal(parseStoryIntent(text, { headingLevel: 2 }).ok, true);
    const views = markdownViews(text);
    assert.deepEqual(views.originalLines, text.split('\n'));
    assert.equal(views.structuralLines.length, views.originalLines.length);
    assert.equal(views.commandLines.length, views.originalLines.length);
  }
});

test('one-based inclusive parser bounds exclude neighboring intent blocks', () => {
  const text = `${block()}\n${block()}`;
  const result = parseStoryIntent(text, { headingLevel: 2, startLine: 7, endLine: 12 });
  assert.equal(result.ok, true);
  assert.equal(result.range.start, 7);
});

test('rendering and fixed-key hashing validate exactly four single-line fields', () => {
  assert.equal(renderStoryFromIntent(intent), good);
  assert.equal(
    intentDigest({ ...intent, beneficiary: ' release operator ' }),
    createHash('sha256').update(JSON.stringify(intent)).digest('hex')
  );
  assert.notEqual(intentDigest(intent), intentDigest({ ...intent, need: 'checks fail' }));
  for (const invalid of [
    { ...intent, extra: 'x' },
    { ...intent, need: '' },
    { ...intent, need: 'two\nlines' },
    { ...intent, need: 12 },
    null,
  ]) {
    assert.throws(() => renderStoryFromIntent(invalid), TypeError);
    assert.throws(() => intentDigest(invalid), TypeError);
  }
});

test('linked task then linked root then unlinked deep dive select the closed authority', () => {
  const task = resolveStoryIntent({
    body: metadata('### Task 1: Release safely') + '\n' + deepDive,
    plan: observation(),
  });
  const root = resolveStoryIntent({ body: metadata() + '\n' + deepDive, plan: observation() });
  const deep = resolveStoryIntent({ body: deepDive, plan: null });
  assert.deepEqual(
    [task.source, root.source, deep.source],
    ['linked-plan-task', 'linked-plan', 'deep-dive']
  );
  for (const result of [task, root, deep]) {
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.intent, intent);
    assert.equal(result.digest, intentDigest(intent));
    assert.ok(result.location.line > 0);
  }
});

test('linked authority never falls back on absent, unreadable, mismatched or malformed observations', () => {
  for (const plan of [
    null,
    {},
    observation('', 'Source-plan'),
    observation(planText, 'Plan'),
    observation(planText, 'Source-plan', 'docs/other.md'),
    { ...observation(), contentSha256: 'bad' },
  ]) {
    const result = resolveStoryIntent({ body: metadata() + '\n' + deepDive, plan });
    assert.equal(result.ok, false);
    assert.equal(result.digest, null);
  }
  assert.equal(resolveStoryIntent({ body: deepDive, plan: observation() }).ok, false);
  assert.equal(resolveStoryIntent({ body: deepDive + '\n' + deepDive, plan: null }).ok, false);
  assert.equal(resolveStoryIntent({ body: '## Other\n' + block(3), plan: null }).ok, false);
});

test('selector conflicts and same-path aliases have identical decomposition and intent decisions', () => {
  for (const [refs, want] of [
    ['- **Implementation-plan**: docs/other.md\n- **Source-plan**: docs/plan.md', false],
    ['- **Implementation-plan**: docs/plan.md\n- **Source-plan**: docs/plan.md', true],
  ]) {
    const body = metadata('### Task 1: Release safely', refs);
    const result = resolveStoryIntent({
      body,
      plan: observation(planText, 'Implementation-plan', want ? 'docs/plan.md' : 'docs/other.md'),
    });
    const selected = selectDecompositionPlanSection({
      body,
      planText,
      activePlanKey: 'Implementation-plan',
    });
    assert.equal(result.ok, want);
    assert.equal(selected.ok, want);
    assert.equal(selected.applied, true);
  }
});

test('only Plan Metadata supplies selectors; blank, template and duplicate selectors fail closed', () => {
  const body = metadata() + '\n## Story Origin\n- **Source-plan-section**: missing';
  assert.equal(resolveStoryIntent({ body, plan: observation() }).source, 'linked-plan');
  for (const selector of [
    '',
    '[source-plan-section]',
    '### Task 9: Missing',
    '### Task 1: Release safely\n- **Source-plan-section**: ### Task 1: Release safely',
  ]) {
    const body = metadata() + '\n- **Source-plan-section**: ' + selector;
    assert.equal(resolveStoryIntent({ body, plan: observation() }).ok, false);
    assert.equal(
      selectDecompositionPlanSection({ body, planText, activePlanKey: 'Source-plan' }).ok,
      false
    );
  }
});

test('masked extractor selector round-trips exactly and raw inline-code headings suggest exact candidates', () => {
  const text = '### tAsK 1: Keep  `code`  safe\n' + block(4);
  const [task] = extractPlanTasks(text);
  assert.equal(task.sourceLine, 1);
  assert.equal(task.heading, '### Task 1: Keep          safe');
  const body = metadata(task.heading);
  assert.equal(resolveStoryIntent({ body, plan: observation(text) }).ok, true);
  assert.equal(
    selectDecompositionPlanSection({ body, planText: text, activePlanKey: 'Source-plan' }).ok,
    true
  );
  const copied = metadata('### Task 1: Keep  `code`  safe');
  const result = resolveStoryIntent({ body: copied, plan: observation(text) });
  assert.equal(result.ok, false);
  assert.ok(result.violations[0].message.includes(task.heading));
  assert.equal(
    selectDecompositionPlanSection({ body: copied, planText: text, activePlanKey: 'Source-plan' })
      .ok,
    false
  );
});

test('diagnostics bound untrusted excerpts and duplicate tasks cannot select authority', () => {
  const result = resolveStoryIntent({ body: metadata('x'.repeat(1000)), plan: observation() });
  assert.equal(result.ok, false);
  assert.ok(result.violations.every((v) => v.message.length <= 240));
  const duplicate =
    '### Task 1: Release safely\n' + block(4) + '\n### Task 1: Release safely\n' + block(4);
  assert.equal(
    resolveStoryIntent({
      body: metadata('### Task 1: Release safely'),
      plan: observation(duplicate),
    }).ok,
    false
  );
});

test('inline-code-only continuations are refused instead of silently folded or discarded', () => {
  assert.equal(parseStoryIntent(block() + '\n`continued value`', { headingLevel: 2 }).ok, false);
});

test('unknown object-prototype labels produce a normal malformed-intent refusal', () => {
  assert.equal(
    parseStoryIntent(block().replace('Need:', 'toString:'), { headingLevel: 2 }).ok,
    false
  );
});

test('an intent field containing only an HTML comment is empty', () => {
  assert.equal(
    parseStoryIntent(block().replace('checks can fail', '<!-- TBD -->'), { headingLevel: 2 }).ok,
    false
  );
});

test('heading-shaped labels hidden by inline code never become live fields', () => {
  assert.equal(
    parseStoryIntent(
      block().replace('- **Need:** checks can fail', '`- **Need:** checks can fail`'),
      { headingLevel: 2 }
    ).ok,
    false
  );
});

test('duplicate active plan references fail closed instead of selecting the first observation', () => {
  const body = metadata() + '\n- **Source-plan**: docs/other.md';
  assert.equal(resolveStoryIntent({ body, plan: observation() }).ok, false);
});

test('root authority cannot hide malformed nested content by truncating at a deeper heading', () => {
  const text = block() + '\n### Unexpected child\ncontinuation';
  assert.equal(resolveStoryIntent({ body: metadata(), plan: observation(text) }).ok, false);
});

test('selector repair diagnostics name the matching task candidate, not an unrelated first task', () => {
  const text = '### Task 1: First\n' + block(4) + '\n### Task 2: Keep `code` safe\n' + block(4);
  const body = metadata('### Task 2: Keep `code` safe');
  const result = resolveStoryIntent({ body, plan: observation(text) });
  assert.ok(result.violations[0].message.includes('### Task 2: Keep        safe'));
});

test('duplicate linked references cannot disagree between decomposition and intent selection', () => {
  const body = metadata('### Task 1: Release safely') + '\n- **Source-plan**: docs/other.md';
  assert.equal(resolveStoryIntent({ body, plan: observation() }).ok, false);
  assert.equal(
    selectDecompositionPlanSection({ body, planText, activePlanKey: 'Source-plan' }).ok,
    false
  );
});

test('multiline inline code cannot hide a nonempty continuation after the four fields', () => {
  assert.equal(parseStoryIntent(block() + '\n`continued\nvalue`', { headingLevel: 2 }).ok, false);
});

test('prototype-named extra fields refuse without throwing or extending the four-field contract', () => {
  assert.equal(
    parseStoryIntent(block() + '\n- **constructor:** unexpected', { headingLevel: 2 }).ok,
    false
  );
});
