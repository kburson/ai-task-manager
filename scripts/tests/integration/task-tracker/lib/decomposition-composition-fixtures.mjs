// @story #1992 — real writers/collectors; only provider effects are controlled.
import { hookFixture } from './decomposition-hook.cases.mjs';
import { readyEpic } from './decomposition-remote.cases.mjs';
import { runInflateEstimate } from '../../../../task-tracker/verbs/inflate-estimate.mjs';
import { runExplain } from '../../../../task-tracker/verbs/explain.mjs';
import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { runSplitPlan } from '../../../../task-tracker/verbs/split-plan.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { formatIssueFieldDb, stripIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { hash } from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const tick = String.fromCharCode(96);
const intent =
  '#### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** remote effects can fail\n- **Value or failure prevented:** consumers receive complete releases\n#### Scope\n';
export async function composedPublication({
  kind = 'code',
  state = 'develop',
  hours = 25,
  failure = null,
  outcome = 'before',
} = {}) {
  const f = await hookFixture(10);
  f.authority.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    proposals: [],
    observedProjections: [],
  };
  f.authority.body =
    f.authority.body.replace('state="develop"', 'state="' + state + '"') +
    '\n<!-- aitm-issue-kind kind="' +
    kind +
    '" -->\n';
  const content = Array.from(
    { length: failure ? 4 : 1 },
    (_, index) =>
      '### Task ' +
      (index + 1) +
      ': Publication recovery ' +
      (index + 1) +
      '\n' +
      intent +
      '\nProve a bounded recovery boundary.\nRun: ' +
      tick +
      'node verify-recovery-' +
      (index + 1) +
      '.mjs' +
      tick +
      '\n'
  ).join('\n');
  f.authority.body = f.authority.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n\n## AITM Progress Markers'
  );
  f.authority.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: null,
    digest: hash(content),
    availability: 'available',
    content,
    references: null,
  };
  f.authority.deps.readPlanAtCommit = async () => content;
  mkdirSync(path.join(f.native.root, 'docs'), { recursive: true });
  writeFileSync(path.join(f.native.root, 'docs/plan.md'), content);
  await f.runtime.refresh(f.subject);
  const cfg = { ...f.cfg, fieldIds: { size: 'SIZE', estimate: 'EST' } };
  const counts = { audit: 0, size: 0, estimate: 0, fields: 0 };
  let comment = { id: 99, body: '<!-- aitm-refined-estimate: 107 -->\n### Refine estimate\n' },
    failed = false;
  async function effect(name, apply) {
    assert.equal(readDecompositionRecords(f.authority.body).publication.status, 'pending');
    if (!failed && failure === name && outcome === 'before') {
      failed = true;
      throw new Error('provider before effect');
    }
    counts[name]++;
    await apply();
    if (!failed && failure === name && outcome === 'after') {
      failed = true;
      throw new Error('provider outcome unknown');
    }
  }
  const deps = {
    decomposition: f.authority.deps,
    projectDir: f.native.root,
    listComments: async () => [comment],
    patchComment: ({ body }) =>
      effect('audit', () => {
        comment = { ...comment, body };
      }),
    getIssueBody: async () => f.authority.body,
    mutateIssueBody: ({ mutate }) =>
      effect('fields', async () => {
        f.authority.body = await mutate(f.authority.body);
      }),
    projectValuesForIssue: async () => ({ ...f.authority.values.project }),
    projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
    fieldOptionMap: async () => ({ SIZE: { M: 'M', L: 'L' } }),
    loadProjectFieldDefs: () => [
      { key: 'size', type: 'single_select' },
      { key: 'estimate', type: 'number' },
    ],
    writeProjectFieldValue: ({ fieldId, value }) =>
      fieldId === 'EST'
        ? effect('estimate', () => {
            f.authority.values.project.estimate = value.number;
          })
        : effect('size', () => {
            f.authority.values.project.size = value.singleSelectOptionName;
          }),
  };
  const args = {
    issueNumber: 107,
    size: 'L',
    estimate: String(hours),
    reason: 'Current growth',
    items: ['One bounded recovery (~1h)'],
  };
  return {
    ...f,
    cfg,
    content,
    counts,
    publish: () => runInflateEstimate(args, cfg, deps),
    get comment() {
      return comment;
    },
  };
}
export async function explainComposedBind(f) {
  const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } },
    state = {},
    startEffects = f.authority.writes.length;
  const attempt = createObservationAttempt({
    repository: 'o/r',
    issue: 107,
    boundaryId: 'composition-proof',
    now: () => new Date().toISOString(),
    read: async (request) => ({
      ...request,
      value:
        request.resource === 'decomposition'
          ? await f.runtime.collect(f.subject)
          : {
              'issue-body': { number: 107, body: f.authority.body },
              'project-board': { state: 'develop', assignees: [] },
              'local-config': { repo: 'o/r', projectId: 'PVT_a', gateAssigneeMatch: false },
              'session-state': state,
              worktree: { matches: true },
              occupancy: { available: true },
              'migration-journal': { active: false },
            }[request.resource],
    }),
  });
  return runExplain(
    { issue: 107, actionId: 'bind', known: [], knownSource: null, diagnostic: false },
    {
      projectRoot: f.native.root,
      stdout: { write() {} },
      evaluate: async () => ({
        decision: await evaluateAction({
          actionId: 'bind',
          repository: 'o/r',
          issue: 107,
          inputs: {
            state: 'develop',
            head: 'a'.repeat(40),
            body: f.authority.body,
            config: cfg,
            sessionState: state,
          },
          attempt,
          deps: {
            effectAttempts: () => f.authority.writes.slice(startEffects),
            sessionPorts: { decomposition: { subject: f.subject, runtime: f.runtime } },
          },
        }),
      }),
    }
  );
}
export async function previewComposedSplit(f) {
  let creatorCalls = 0;
  const result = await runSplitPlan({
    issueNumber: 107,
    mode: 'dry-run',
    cfg: f.cfg,
    deps: {
      resolveProjectDir: () => f.native.root,
      scratchDir: path.join(f.native.root, '.scratch/split'),
      fetchIssueBody: async () => f.authority.body,
      readPlanAtCommit: async () => f.content,
      fetchParentIssue: async () => null,
      resolveHead: async () => '1'.repeat(40),
      decomposition: {
        subject: f.subject,
        runtime: f.runtime,
        projectDir: f.native.root,
        readOwnership: async () => ({
          state: 'develop',
          assignees: ['operator'],
          currentUser: 'operator',
        }),
      },
      runCreator: async (args) => {
        assert.equal(args.at(-1), '--dry-run');
        creatorCalls++;
        return { exitCode: 0, stdout: 'controlled creator preflight', stderr: '' };
      },
    },
  });
  return { result, creatorCalls };
}
export async function sevenChildEpic(terminal = false) {
  const f = await readyEpic(false);
  const titles = [
    'Define shared assessment',
    'Collect fresh authority',
    'Publish estimate revisions',
    'Expose action decisions',
    'Admit current effects',
    'Govern decomposition recovery',
    'Prove complete composition',
  ];
  const hours = [6, 7, 12, 6, 9, 6, 6],
    ranks = [1, 2, 3, 3, 4, 5, 6],
    dependencies = [[], [0], [1], [1], [2, 3], [4], [4, 5]];
  const children = titles.map((title, i) => {
    let body =
      '## User Story\nAs a release operator\nI want a bounded ' +
      title.toLowerCase() +
      ' capability\nSo that incomplete delivery remains fenced\n\n## Scope\nDeliver ' +
      title +
      '.\n\n## Acceptance Criteria\n- [ ] Deliver ' +
      title +
      '.\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task ' +
      (i + 1) +
      ': ' +
      title +
      '\n\n## AITM Progress Markers\n' +
      formatIssueFieldDb({
        priority: 'P1',
        size: i === 2 ? 'L' : 'M',
        estimate: hours[i],
        rank: ranks[i],
      }) +
      '\n<!-- aitm-refinement-rationale: {"rationale":"bounded reviewed child"} -->\n';
    body = stampRefinementSnapshot(body, { labels: ['feature'], ts: '2026-10-11T12:00:00Z' });
    return {
      id: 'CHILD_' + (1986 + i),
      number: 1986 + i,
      title,
      body,
      state: terminal ? 'CLOSED' : 'OPEN',
      stateReason: terminal ? 'COMPLETED' : null,
      labels: {
        nodes: [{ id: 'LABEL_feature', name: 'feature' }],
        pageInfo: { hasNextPage: false },
      },
      blockedBy: {
        nodes: dependencies[i].map((index) => ({
          id: 'CHILD_' + (1986 + index),
          number: 1986 + index,
        })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      projectItems: {
        nodes: [
          {
            id: 'PVTI_' + i,
            project: { id: 'PVT_a' },
            fieldValues: {
              nodes: [
                {
                  name: terminal ? 'Done' : 'Ready for Planning',
                  field: { id: 'STATUS', name: 'Status' },
                },
                { number: ranks[i], field: { id: 'RANK', name: 'Rank' } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };
  });
  const content = titles
    .map(
      (title, i) =>
        '### Task ' +
        (i + 1) +
        ': ' +
        title +
        '\n' +
        intent +
        '\nRun: ' +
        tick +
        'node verify-' +
        (i + 1) +
        '.mjs' +
        tick +
        '\n'
    )
    .join('\n');
  f.authority.body =
    stripIssueFieldDb(f.authority.body) +
    '\n' +
    formatIssueFieldDb({ estimate: 52, size: 'L' }) +
    '\n';
  f.authority.values.project.estimate = 52;
  f.authority.values.project.size = 'L';
  f.authority.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    payloadHash: null,
    proposals: [],
    observedProjections: [
      { size: 'L', estimate: 52 },
      { size: 'L', estimate: 52 },
    ],
  };
  f.authority.values.plan = { ...f.authority.values.plan, content, digest: hash(content) };
  f.authority.deps.readPlanAtCommit = async () => content;
  f.authority.values.project.children = mapSubIssueNodes(children, f.cfg).map((child, index) => ({
    ...child,
    blockedBy: dependencies[index].map((prior) => 1986 + prior),
  }));
  writeFileSync(path.join(f.native.root, 'docs/plan.md'), content);
  await f.runtime.refresh(f.subject);
  const response = structuredClone(f.response);
  response.data.repository.issue.body = f.authority.body;
  response.data.repository.issue.subIssues.nodes = children;
  const fields = response.data.repository.issue.projectItems.nodes[0].fieldValues.nodes;
  fields[0].number = 52;
  fields[1].name = 'L';
  return { ...f, content, response, children };
}
