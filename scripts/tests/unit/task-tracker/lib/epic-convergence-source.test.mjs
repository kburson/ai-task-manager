// @story #2161 — exceptional reads preserve actual source and ordinary refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../../../../task-tracker/lib/decomposition-hook-authority.mjs';
import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import * as guard from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';
import { tetherIssueToProject } from '../../../../gh/lib/project-tether.mjs';

const connection = (nodes) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
function fixture() {
  const cfg = {
    repo: 'o/r',
    projectId: 'P',
    kanbanFieldId: 'STATUS',
    fieldIds: { size: 'S', estimate: 'E' },
  };
  const item = (id, state) => ({
    id,
    project: { id: 'P' },
    fieldValueByName: { name: state },
    fieldValues: connection([
      {
        id: id + '-status',
        __typename: 'ProjectV2ItemFieldSingleSelectValue',
        name: state,
        field: { id: 'STATUS', name: 'Status' },
      },
    ]),
  });
  const body =
    '## User Story\nAs a task operator\nI want to retain my child because interrupted conversion can lose progress\nSo that duplicate creation is avoided\n\n## Scope\nRetain the first child.\n\n## Acceptance Criteria\n- [ ] Preserve the child.\n\n## AITM Progress Markers\n<!-- aitm-last-known-state state="plan" ts="2026-11-05T00:00:00Z" -->\n' +
    formatIssueFieldDb({ size: 'M', estimate: 4 });
  const child = {
    id: 'C',
    number: 43,
    title: 'First child',
    body: '## Scope\nA child\n',
    state: 'OPEN',
    stateReason: null,
    labels: connection([]),
    blockedBy: connection([]),
    projectItems: connection([item('CI', 'Backlog')]),
  };
  const node = {
    id: 'I',
    number: 42,
    repository: { nameWithOwner: 'o/r' },
    body: body.replace(
      '## AITM Progress Markers',
      '## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers'
    ),
    state: 'OPEN',
    assignees: { nodes: [{ login: 'operator' }] },
    comments: connection([]),
    projectItems: connection([item('PI', 'Plan')]),
    subIssues: connection([child]),
  };
  const operator = {
    sessionId: 'actual-session',
    boundIssue: 42,
    bindingGenerationId: 'generation',
    worktreePath: '/fixture',
    branch: 'codex/fixture',
    headSha: '1'.repeat(40),
  };
  const binding = {
    issue: '42',
    kanbanState: 'plan',
    entryStartTs: '2026-11-05T00:00:00Z',
    bindingGenerationId: 'generation',
    worktreePath: '/fixture',
    worktreeBranch: 'codex/fixture',
  };
  const queries = [];
  const deps = {
    env: { AI_TASK_MANAGER_SESSION_ID: 'actual-session' },
    captureArtifactOperator: () => ({ ...operator }),
    getActiveTask: () => ({ ...binding }),
    loadState: () => ({
      active: '42',
      entryStartTs: binding.entryStartTs,
      pausedAtTs: binding.pausedAtTs,
    }),
    graphql: async ({ query }) => {
      queries.push(query);
      return {
        data: { viewer: { login: 'operator' }, repository: { issue: structuredClone(node) } },
      };
    },
  };
  return {
    cfg,
    node,
    child,
    operator,
    binding,
    queries,
    deps,
    options: { issue: 42, cfg, projectDir: '/fixture', deps },
  };
}

test('actual non-Epic child source is readable only inside convergence and remains non-Epic', async () => {
  const f = fixture();
  await assert.rejects(
    source.collectHookDecompositionSnapshot(f.options),
    /non-epic child presence/
  );
  assert.equal(typeof source.collectEpicConvergenceSnapshot, 'function');
  const result = await source.collectEpicConvergenceSnapshot(f.options);
  assert.equal(result.current.input.kind, 'code');
  assert.equal(result.signals.body, f.node.body);
  assert.deepEqual(result.childInventory, [{ id: 'C', number: 43, projectItemId: 'CI' }]);
  assert.deepEqual(result.current.input.epicReadiness.children, []);
  assert.equal(f.queries.length, 4);
  await assert.rejects(
    source.collectHookDecompositionSnapshot(f.options),
    /non-epic child presence/
  );
});

for (const scenario of [
  'default',
  'transcript',
  'wrong-session',
  'paused',
  'foreign-issue',
  'foreign-root',
  'generation-drift',
  'closed',
  'done',
  'unknown',
  'state-drift',
  'missing-state',
  'foreign-owner',
  'unassigned',
  'duplicate-child',
  'missing-membership',
  'duplicate-membership',
  'malformed-kind',
])
  test('convergence refuses ' + scenario + ' without leaking authority', async () => {
    const f = fixture();
    if (scenario === 'default' || scenario === 'transcript') {
      f.deps.env = {};
      f.operator.sessionId = scenario === 'default' ? 'default-session' : 'transcript-guess';
    }
    if (scenario === 'wrong-session') f.operator.sessionId = 'other';
    if (scenario === 'paused') f.binding.pausedAtTs = '2026-11-05T00:01:00Z';
    if (scenario === 'foreign-issue') f.binding.issue = '99';
    if (scenario === 'foreign-root') f.operator.worktreePath = '/other';
    if (scenario === 'generation-drift') f.binding.bindingGenerationId = 'other';
    if (scenario === 'closed') f.node.state = 'CLOSED';
    if (scenario === 'done') f.node.projectItems.nodes[0].fieldValues.nodes[0].name = 'Done';
    if (scenario === 'unknown')
      f.node.projectItems.nodes[0].fieldValues.nodes[0].name = 'Unrecognized';
    if (scenario === 'state-drift') f.binding.kanbanState = 'develop';
    if (scenario === 'missing-state') delete f.node.state;
    if (scenario === 'foreign-owner') f.node.assignees.nodes = [{ login: 'other' }];
    if (scenario === 'unassigned') f.node.assignees.nodes = [];
    if (scenario === 'duplicate-child') f.node.subIssues.nodes.push(structuredClone(f.child));
    if (scenario === 'missing-membership') f.child.projectItems.nodes = [];
    if (scenario === 'duplicate-membership')
      f.child.projectItems.nodes.push({ ...f.child.projectItems.nodes[0], id: 'other' });
    if (scenario === 'malformed-kind') f.node.body += '\n<!-- aitm-issue-kind kind="unknown" -->';
    assert.equal(typeof source.collectEpicConvergenceSnapshot, 'function');
    await assert.rejects(source.collectEpicConvergenceSnapshot(f.options));
  });

test('canonical recovery accepts absent plan but preserves actual non-Epic classification', async () => {
  const f = fixture();
  assert.equal(typeof guard.assertEpicConvergenceRecovery, 'function');
  const result = await guard.assertEpicConvergenceRecovery({
    issueNumber: 42,
    ...f.options,
    requirePlan: false,
  });
  assert.equal(result.input.plan.availability, 'absent');
  assert.equal(result.input.kind, 'code');
  f.node.body = f.node.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Implementation-plan**: docs/missing.md\n\n## AITM Progress Markers'
  );
  f.deps.readPlanAtCommit = async () => {
    throw new Error('unreadable');
  };
  await assert.rejects(
    guard.assertEpicConvergenceRecovery({ issueNumber: 42, ...f.options, requirePlan: false })
  );
});

test('prospective admission permits zero children and refuses existing anomaly before another create', async () => {
  const f = fixture();
  f.deps.readParentBody = async () => f.node.body;
  assert.equal(typeof guard.assertProspectiveEpicParent, 'function');
  const options = { parentIssueNumber: 42, ...f.options };
  await assert.rejects(guard.assertProspectiveEpicParent(options), /recover-kind-first/);
  f.node.subIssues.nodes = [];
  const admitted = await guard.assertProspectiveEpicParent(options);
  assert.equal(admitted.status, 'admitted');
  f.node.body += '\n<!-- aitm-issue-kind kind="epic" -->';
  f.deps.captureArtifactOperator = () => {
    throw new Error('foreign');
  };
  assert.equal((await guard.assertProspectiveEpicParent(options)).status, 'not-required');
});

test('direct tether refuses foreign non-Epic parent before any project read/write', async () => {
  const f = fixture();
  f.deps.readParentBody = async () => f.node.body;
  f.binding.issue = '99';
  let calls = 0;
  await assert.rejects(
    tetherIssueToProject({
      cfg: f.cfg,
      issueNumber: 43,
      parentIssueNumber: 42,
      projectDir: '/fixture',
      deps: f.deps,
      runGql: async () => {
        calls++;
        throw new Error('unexpected project traffic');
      },
    }),
    /convergence:operator-binding-mismatch/
  );
  assert.equal(calls, 0);
});

test('complete census rejects distinct nodes claiming the same issue', async () => {
  const f = fixture();
  const duplicate = structuredClone(f.child);
  duplicate.id = 'different-node';
  duplicate.projectItems.nodes[0].id = 'different-item';
  f.node.subIssues.nodes.push(duplicate);
  await assert.rejects(source.collectEpicConvergenceSnapshot(f.options), /child issue identity/);
});

test('operator HEAD changed during a read refuses before returning usable evidence', async () => {
  const f = fixture();
  const graphql = f.deps.graphql;
  f.deps.graphql = async (input) => {
    f.operator.headSha = '2'.repeat(40);
    return graphql(input);
  };
  await assert.rejects(source.collectEpicConvergenceSnapshot(f.options), /operator-drift/);
});

test('observed child field and label changes alter the fenced child source', async () => {
  const f = fixture();
  const first = await source.collectEpicConvergenceSnapshot(f.options);
  f.child.labels.nodes.push({ id: 'LABEL', name: 'changed' });
  const second = await source.collectEpicConvergenceSnapshot(f.options);
  assert.notEqual(first.childSourceDigest, second.childSourceDigest);
});

test('single child with valid delayed transport needs only base, full graph and root fence', async () => {
  const f = fixture();
  const graphql = f.deps.graphql;
  f.deps.graphql = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return graphql(input);
  };
  assert.equal((await source.collectEpicConvergenceSnapshot(f.options)).childInventory.length, 1);
  assert.equal(f.queries.length, 3);
});
