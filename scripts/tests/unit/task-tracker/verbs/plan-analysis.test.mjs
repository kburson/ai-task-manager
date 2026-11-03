// @story #2143
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from '../lib/decomposition-authority-fixtures.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { currentUnitAuthority } from '../lib/decomposition-unit-admission-fixture.mjs';
import { runCommentVerb } from '../../../../task-tracker/verbs/comment.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../../task-tracker/lib/issue-worktree-location.mjs';
import { planDeepDiveGate } from '../../../../task-tracker/lib/deep-dive-gate.mjs';
import { readDeepDiveSignals } from '../../../../task-tracker/lib/deep-dive.mjs';

const api = () => import('../../../../task-tracker/verbs/plan-analysis.mjs');
const shortProse = `## Plan Deep-Dive Analysis

### Story Intent
- **Beneficiary:** project planning owner
- **Capability:** publish bounded planning analysis
- **Need:** unfinished children prevent ordinary deliverable comments
- **Value or failure prevented:** required planning remains attributable

### Diagnosis and bounded design
Current authority distinguishes planning readiness from completion readiness. Preserve that policy and publish only bounded analysis through the registered operation.

### Files and steps
Implement the owning-source adapter and its real authority regression tests. Verify the fixed owned comment and canonical body mirror before reporting analysis complete.

### Dependency Map
Children are already refined and their immutable source sections are readable. Source review precedes package bootstrap and application implementation remains gated.

### Risks and limits
Narrative structure does not establish factual truth or product completion. Human semantic review and existing delivery boundaries remain required.
`;
const prose = shortProse.replace(
  '### Files and steps',
  `The registered effect must read the current issue, configured project item, accepted source plan and every child refinement before it admits the operation. An unavailable child, pending publication or stale projection means the planning decision remains unknown and no comment should be written. A caller-controlled ownership key cannot replace these observations. The actual native session and binding generation identify the active operator; durable worktree location identifies the path and branch independently of historical session identifiers.

The comment and body mirror have separate effect fences. A comment may be verified before the mirror transport fails; the retry must retain that same comment identifier and recheck live Plan state, ownership and readiness before it attempts the body write. Literal readback must bind the entire canonical backpointer and analysis together inside the deep-dive section. A copied analysis elsewhere in the issue or a reference to a longer comment identifier cannot establish successful mirroring.

Tests must exercise the production comment ownership and versioned body writer through controlled transport ports. Exact correlated identifiers, complete child observations and current source-plan content are inputs to the same production admission path; test fixtures cannot substitute a boolean permission or supply a caller-controlled capability.

### Files and steps`
);
async function setup() {
  const f = await currentUnitAuthority({
    body: '## Pickup Directive — MANDATORY, DO NOT SKIP\n> Follow the registered workflow.\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n',
    hours: 25,
    childTerminal: false,
  });
  const template = f.authority.values.project.children[0];
  const content = Array.from(
    { length: 11 },
    (_, i) => `### Task ${i + 1}: Bounded child ${i + 1}\n\nRun: \`node verify-child.mjs\`\n`
  ).join('\n');
  f.authority.values.project.children = Array.from({ length: 11 }, (_, i) => ({
    ...structuredClone(template),
    number: 1001 + i,
    title: `Bounded child ${i + 1}`,
    body: stampRefinementSnapshot(
      template.body
        .replaceAll('One bounded child', `Bounded child ${i + 1}`)
        .replace('### Task 1:', `### Task ${i + 1}:`),
      { labels: ['feature'], ts: '2026-11-02T12:00:00Z' }
    ),
  }));
  f.authority.values.plan = { ...f.authority.values.plan, content, digest: hash(content) };
  f.authority.deps.readPlanAtCommit = async () => content;
  writeFileSync(path.join(f.projectDir, 'docs/plan.md'), content);
  const operator = {
    worktreePath: f.projectDir,
    branch: 'feature/epic/1',
    sessionId: 'planning-owner',
    headSha: 'a'.repeat(40),
    boundIssue: 1,
    bindingGenerationId: 'generation',
  };
  f.authority.body =
    '<!-- aitm-last-known-state state="plan" ts="2026-11-02T12:00:00Z" -->\n' +
    f.authority.body +
    '\n' +
    serializeIssueWorktreeLocationMarker({
      worktreePath: f.projectDir,
      worktreeBranch: operator.branch,
      sessionId: operator.sessionId,
      ts: '2026-11-02T12:00:00Z',
    });
  await f.runtime.refresh(f.subject);
  const state = { active: '#1', entryStartTs: '2026-11-02T12:00:00Z' };
  const comments = [];
  let writes = 0;
  const deps = {
    loadState: () => state,
    readFile: () => prose,
    captureOperator: () => ({ ...operator }),
    collectSnapshot: async () => ({
      subject: f.subject,
      current: await f.runtime.collect(f.subject),
      signals: {
        state: 'plan',
        body: f.authority.body,
        assignees: ['owner'],
        currentUser: 'owner',
      },
    }),
    listComments: async () => ({ issueId: 'I_1', comments: comments.map((x) => ({ ...x })) }),
    createComment: async ({ body }) => {
      writes++;
      comments.push({
        id: 'IC_1',
        body,
        issue: 1,
        repository: 'o/r',
        url: 'https://github.com/o/r/issues/1#issuecomment-6592547411',
      });
      return { id: 'IC_1' };
    },
    updateComment: async ({ id, body }) => {
      const comment = comments.find((c) => c.id === id);
      comment.body = body;
      return { id };
    },
    readComment: async ({ id }) => ({ ...comments.find((c) => c.id === id) }),
    mutateIssueBody: (options) => mutateIssueBody({ ...options, deps: f.authority.deps }),
  };
  const ctx = { rest: ['1', '--body-file', 'analysis.md'], cfg: f.cfg, projectDir: f.projectDir };
  return { ...f, ctx, deps, state, operator, comments, writes: () => writes };
}

test('registered planning analysis parses no caller key and requires grounded planning sections', async () => {
  const { parsePlanAnalysisArgs, validatePlanAnalysis } = await api();
  assert.deepEqual(parsePlanAnalysisArgs(['#1', '--body-file', 'analysis.md']), {
    issueNumber: 1,
    bodyFile: 'analysis.md',
  });
  assert.throws(
    () => parsePlanAnalysisArgs(['1', '--body-file', 'x', '--key', 'delivery']),
    /argument/
  );
  assert.match(validatePlanAnalysis(prose), /^## Plan Deep-Dive Analysis/);
  for (const injected of [
    '\n### Deliverable\nShipped result.',
    '\n<!-- aitm-deep-dive-complete ts="x" -->',
    '\n- [x] Delivered',
    '\n#### Completion\nComplete',
    '\n```\n### Result\n```',
    '\nDelivery\n--------\nShipped results',
    '\n> ### Delivery\n> - [x] Shipped',
    '\n1. [x] Delivered',
    '\n- ### Delivery\n  Shipped output',
    '\n- - [x] Completed',
    '\n1. > ### Evidence',
  ]) {
    assert.throws(() => validatePlanAnalysis(prose + injected), /plan-analysis:/);
  }
  assert.throws(
    () =>
      validatePlanAnalysis(
        prose.replace(
          '**Need:** unfinished children prevent ordinary deliverable comments',
          '**Need:**'
        )
      ),
    /intent/
  );
});

test('planning-ready incomplete epic owns comment and exact canonical mirror without completion elevation', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const before = await f.runtime.collect(f.subject);
  assert.equal(before.input.epicReadiness.children.length, 11);
  assert.equal(before.input.epicReadiness.planning, true);
  assert.equal(before.input.epicReadiness.completion, false);
  const result = await runPlanAnalysisVerb(f.ctx, f.deps);
  assert.equal(result.status, 'complete');
  assert.equal(f.writes(), 1);
  assert.equal(result.commentId, 'IC_1');
  assert.match(f.comments[0].body, /aitm-owned-comment key="deep-dive.analysis-v1"/);
  const flags = readDeepDiveSignals(f.authority.body);
  assert.equal(flags.hasPosted, true);
  assert.equal(flags.hasComplete, true);
  assert.deepEqual(planDeepDiveGate({ body: f.authority.body }), { ok: true });
  assert.ok(
    f.authority.body.includes(f.comments[0].body.replace(/^## Plan Deep-Dive Analysis\n+/, ''))
  );
  assert.match(f.authority.body, /#issuecomment-6592547411/);
  assert.match(f.authority.body, /state="plan"/);
  const after = await f.runtime.collect(f.subject);
  assert.equal(after.input.epicReadiness.completion, false);
  assert.equal(after.assessment.capabilities.includes('scoped-completion'), false);
  await assert.rejects(
    () =>
      runCommentVerb(
        { ...f.ctx, rest: ['1', '--key', 'deep-dive.analysis-v1', '--body-file', 'x'] },
        {
          ...f.deps,
          readFile: () => 'ordinary deliverable',
          decomposition: { subject: f.subject, runtime: f.runtime },
        }
      ),
    /decomposition/
  );
});

test('mirror failure retries the fixed comment and rechecks current authority before continuation', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const mirror = f.deps.mutateIssueBody;
  f.deps.mutateIssueBody = async () => {
    throw new Error('mirror unavailable');
  };
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /mirror unavailable/);
  assert.equal(f.writes(), 1);
  const snapshot = f.deps.collectSnapshot;
  f.deps.collectSnapshot = async () => ({
    ...(await snapshot()),
    signals: { ...(await snapshot()).signals, state: 'develop' },
  });
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /plan-state/);
  f.deps.collectSnapshot = snapshot;
  f.deps.mutateIssueBody = mirror;
  assert.equal((await runPlanAnalysisVerb(f.ctx, f.deps)).status, 'complete');
  assert.equal(f.writes(), 1);
  assert.equal((await runPlanAnalysisVerb(f.ctx, f.deps)).status, 'complete');
  assert.equal(f.comments[0].id, 'IC_1');
});

for (const variant of [
  'unknown-readiness',
  'not-ready',
  'stale-projection',
  'pending',
  'wrong-owner',
  'wrong-worktree',
  'paused',
]) {
  test('planning analysis refuses ' + variant + ' before a comment write', async () => {
    const { runPlanAnalysisVerb } = await api();
    const f = await setup();
    const collect = f.deps.collectSnapshot;
    if (variant === 'paused') f.state.pausedAtTs = '2026-11-02T12:01:00Z';
    if (variant === 'wrong-worktree') f.operator.worktreePath = '/foreign';
    f.deps.collectSnapshot = async () => {
      const snapshot = await collect();
      if (variant === 'unknown-readiness')
        snapshot.current.input.epicReadiness.availability = 'unavailable';
      if (variant === 'not-ready') snapshot.current.input.epicReadiness.planning = false;
      if (variant === 'stale-projection') snapshot.current.projection.status = 'stale';
      if (variant === 'pending') snapshot.current.publication = { status: 'pending' };
      if (variant === 'wrong-owner') snapshot.signals.currentUser = 'foreign';
      return snapshot;
    };
    await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /plan-analysis:|session/);
    assert.equal(f.writes(), 0);
  });
}

test('fresh prewrite source drift refuses without creating a comment', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const list = f.deps.listComments;
  f.deps.listComments = async (input) => {
    f.authority.body = f.authority.body.replace(
      'One bounded fixture delivery.',
      'A changed scope.'
    );
    // Modify the actual scope, regardless of helper wording.
    f.authority.body = f.authority.body.replace('## Scope\n', '## Scope\nChanged source scope.\n');
    return list(input);
  };
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /source-drift|authority/);
  assert.equal(f.writes(), 0);
});

test('the actual native binding checker rejects a foreign issue before any transport effect', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  delete f.deps.captureOperator;
  await assert.rejects(
    () => runPlanAnalysisVerb(f.ctx, f.deps),
    /binding mismatch|worktree|operator/
  );
  assert.equal(f.writes(), 0);
});

test('changed live state at the comment effect fence refuses before write', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const snapshot = f.deps.collectSnapshot;
  let reads = 0;
  f.deps.collectSnapshot = async () => {
    const value = await snapshot();
    if (++reads > 1) value.signals.state = 'develop';
    return value;
  };
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /plan-state/);
  assert.equal(f.writes(), 0);
});

test('the mirror effect fence rejects changed ownership without completing deep dive', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const mutate = f.deps.mutateIssueBody;
  const snapshot = f.deps.collectSnapshot;
  let changed = false;
  f.deps.collectSnapshot = async () => {
    const value = await snapshot();
    if (changed) value.signals.currentUser = 'foreign';
    return value;
  };
  f.deps.mutateIssueBody = async (options) => {
    changed = true;
    return mutate(options);
  };
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /owner/);
  assert.equal(f.writes(), 1);
  assert.equal(readDeepDiveSignals(f.authority.body).hasComplete, false);
});

test('canonical mirror readback cannot report completion for a missing write', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  f.deps.mutateIssueBody = async () => ({ status: 'ok' });
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /mirror-readback/);
  assert.equal(f.writes(), 1);
});

test('correlated comment readback refuses foreign source and changed prose', async () => {
  const { runPlanAnalysisVerb } = await api();
  for (const changed of [
    { repository: 'foreign/repo' },
    { body: 'changed narrative' },
    { url: 'https://github.com/o/r/issues/1#issuecomment-invalid' },
  ]) {
    const f = await setup();
    const read = f.deps.readComment;
    let reads = 0;
    f.deps.readComment = async (input) => ({
      ...(await read(input)),
      ...(++reads > 1 ? changed : {}),
    });
    await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /comment-readback|comment-url/);
    assert.equal(readDeepDiveSignals(f.authority.body).hasComplete, false);
  }
});

test('eleventh child losing current refinement refuses at the fresh effect fence', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const list = f.deps.listComments;
  f.deps.listComments = async (input) => {
    f.authority.values.project.children[10].hasCurrentRefinement = false;
    return list(input);
  };
  await assert.rejects(
    () => runPlanAnalysisVerb(f.ctx, f.deps),
    /authority|planning-readiness|source-drift/
  );
  assert.equal(f.writes(), 0);
});

test('missing canonical Pickup boundary refuses before publishing analysis', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  f.authority.body = f.authority.body.replace(/^## Pickup Directive.*$/m, 'Pickup unavailable');
  await f.runtime.refresh(f.subject);
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /mirror-boundary/);
  assert.equal(f.writes(), 0);
});

// Completed analysis is immutable through this bounded operation; edits need a separately reviewed route.
test('changed prose after a successful mirror refuses before changing the fixed comment', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  await runPlanAnalysisVerb(f.ctx, f.deps);
  const before = { comment: f.comments[0].body, body: f.authority.body };
  f.deps.readFile = () =>
    prose.replace('Current authority distinguishes', 'Revised authority distinguishes');
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /existing-analysis-conflict/);
  assert.equal(f.comments[0].body, before.comment);
  assert.equal(f.authority.body, before.body);
});

test('undersized analysis refuses before the comment and canonical gate is never bypassed', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  f.deps.readFile = () => shortProse;
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /deep-dive-gate/);
  assert.equal(f.writes(), 0);
});

test('registered handoff retains durable path and branch while current native binding owns the session', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  f.authority.body = f.authority.body.replace(
    'sid="planning-owner"',
    'sid="previous-owner-session"'
  );
  await f.runtime.refresh(f.subject);
  assert.equal((await runPlanAnalysisVerb(f.ctx, f.deps)).status, 'complete');
});

test('canonical line endings and blank lines survive exact mirror readback', async () => {
  const { runPlanAnalysisVerb, validatePlanAnalysis } = await api();
  const f = await setup();
  f.deps.readFile = () => prose.replaceAll('\n', '\r\n').replace('### Files', '\r\n\r\n### Files');
  assert.equal(validatePlanAnalysis(f.deps.readFile()), validatePlanAnalysis(prose));
  assert.equal((await runPlanAnalysisVerb(f.ctx, f.deps)).status, 'complete');
});

test('a longer comment-id prefix in canonical mirror cannot establish exact readback', async () => {
  const { runPlanAnalysisVerb } = await api();
  const f = await setup();
  const mutate = f.deps.mutateIssueBody;
  f.deps.mutateIssueBody = async (options) => {
    const result = await mutate(options);
    f.authority.body = f.authority.body.replaceAll(
      '#issuecomment-6592547411',
      '#issuecomment-65925474110'
    );
    return result;
  };
  await assert.rejects(() => runPlanAnalysisVerb(f.ctx, f.deps), /mirror-readback/);
});
