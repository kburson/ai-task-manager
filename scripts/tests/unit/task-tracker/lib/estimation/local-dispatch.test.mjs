// @story #2039 #2063
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as runtime from '../../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { runPreflight, preflightVerb } from '../../../../../task-tracker/lib/verb-preflight.mjs';
import { decideSourceEdit } from '../../../../../task-tracker/source-edit-gate.mjs';

const cfg = { repo: 'test/repo', projectId: 'PVT_test', estimationRubricIssue: 0 };
const transport = () => {
  throw Error('PROHIBITED TRANSPORT');
};

test('mode is resolved locally with defaulted zero and invalid configuration', () => {
  assert.equal(typeof runtime.resolveEstimationMode, 'function');
  for (const [configuration, mode] of [
    [{}, 'disabled'],
    [{ estimationRubricIssue: 0 }, 'disabled'],
    [{ estimationRubricIssue: 12 }, 'local'],
    [{ estimationRubricIssue: -1 }, 'unavailable'],
    [{ estimationRubricIssue: null }, 'unavailable'],
    [{ estimationRubricIssue: '12' }, 'unavailable'],
    [{ estimationRubricIssue: 1.5 }, 'unavailable'],
    [{ estimationRubricIssue: Number.MAX_SAFE_INTEGER + 1 }, 'unavailable'],
  ]) {
    assert.equal(runtime.resolveEstimationMode(configuration).mode, mode);
  }
});

for (const [rubric, status] of [
  [0, 'disabled'],
  [12, 'unavailable'],
  [-1, 'unavailable'],
]) {
  test(`legacy cloud adaptive runtime stops rubric ${rubric} before constructing IO`, () => {
    assert.throws(
      () =>
        runtime.createAdaptivePlanRuntime({
          cfg: { ...cfg, estimationRubricIssue: rubric },
          deps: new Proxy({}, { get: transport }),
        }),
      (error) => error.status === status && error.code === 'estimation-cloud-dispatch-prohibited'
    );
  });
  test(`corpus discovery stops rubric ${rubric} before transport`, async () => {
    await assert.rejects(
      runtime.loadProjectEstimationCorpus({
        cfg: { ...cfg, estimationRubricIssue: rubric },
        graphql: transport,
      }),
      (error) => error.code === 'estimation-cloud-dispatch-prohibited'
    );
  });
}

test('CLI estimation stops before ownership, decomposition or live preflight loaders', async () => {
  const result = await runPreflight({
    stateBefore: { active: '#2063' },
    target: 2063,
    cfg,
    verb: 'plan-estimate',
    args: ['2063', '--evidence-file', 'input.json'],
    deps: {
      migrationFreezeActive: () => false,
      fetchSnapshot: transport,
      fetchLive: transport,
      gql: transport,
      exec: transport,
    },
  });
  assert.equal(result.kind, 'estimation-dispatch-stopped');
  assert.equal(result.estimation.status, 'disabled');
});

test('human compatibility estimate still uses native lifecycle and ownership preflight', async () => {
  let fetched = 0;
  const result = await runPreflight({
    stateBefore: { active: '#2063', state: 'plan' },
    target: 2063,
    cfg,
    verb: 'plan-estimate',
    args: ['2063', '--compatibility-mode'],
    deps: {
      migrationFreezeActive: () => false,
      fetchSnapshot: async () => {
        fetched++;
        return { state: 'plan', assignees: ['owner'] };
      },
      fetchCurrentUser: async () => 'owner',
      fetchLastKnownState: async () => 'plan',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(fetched, 1);
});

test('estimation configuration never exempts a mismatched native binding', async () => {
  const result = await runPreflight({
    stateBefore: { active: '#99' },
    target: 2063,
    cfg,
    verb: 'plan-estimate',
    args: [],
    deps: { migrationFreezeActive: () => false, fetchSnapshot: transport },
  });
  assert.equal(result.kind, 'bind-mismatch');
});

test('current-target forecast projection remains available for lifecycle authority', async () => {
  let calls = 0;
  const projection = await runtime.loadForecastProjection({
    cfg,
    issueNumber: 2063,
    deps: {
      graphql: async ({ query, variables }) => {
        calls++;
        assert.equal(variables.issue, 2063);
        assert.doesNotMatch(query, /AitmEstimationCorpus|AitmEstimationDoneRecords/);
        return {
          data: {
            repository: {
              issue: {
                body: '',
                comments: { nodes: [], pageInfo: { hasNextPage: false } },
                projectItems: {
                  nodes: [{ id: 'item', project: { id: 'PVT_test' }, fieldValues: { nodes: [] } }],
                },
              },
            },
          },
        };
      },
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(projection.activeForecastRecordIds, []);
});

test('source-edit admission retains its native Plan refusal when rubric is disabled', () => {
  const result = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/x.mjs',
    projectDir: '/fake',
    boundIssue: '#2063',
    issueState: 'plan',
    hasPostedMarker: true,
    hasCompleteMarker: true,
    assignees: ['owner'],
    currentUser: 'owner',
    cfg,
  });
  assert.equal(result.code, 'source-edit-state-gate');
});

test('CLI preflight exposes disabled/unavailable without claiming publication success', async () => {
  for (const [rubric, status] of [
    [0, 'disabled'],
    [12, 'unavailable'],
    [-1, 'unavailable'],
  ]) {
    await assert.rejects(
      preflightVerb({
        stateBefore: { active: '#2063' },
        target: 2063,
        cfg: { ...cfg, estimationRubricIssue: rubric },
        verb: 'plan-estimate',
        args: ['--evidence-file', 'input.json'],
        deps: { migrationFreezeActive: () => false, fetchSnapshot: transport },
      }),
      (error) => error.code === 'estimation-dispatch-stopped' && error.status === status
    );
  }
});

test('positive rubric calculation delegates to the accepted retained-input runtime without a cloud fallback', () => {
  assert.deepEqual(
    runtime.calculateLocalEstimate({
      mode: runtime.resolveEstimationMode({ ...cfg, estimationRubricIssue: 12 }),
      evidence: null,
    }),
    { status: 'unavailable', reason: 'evidence-missing' }
  );
});

test('canonical estimation commands are recognized without treating quoted mentions as requests', () => {
  for (const command of [
    'npx aitm plan-estimate 2063 --evidence-file input.json',
    'node bin/aitm.mjs plan-estimate 2063',
    'npx aitm plan-estimate --compatibility-mode --evidence-file input.json',
  ]) {
    const args = runtime.estimationCommandArgs(command);
    assert.ok(args);
    assert.equal(runtime.estimationHookRefusal({ cfg, args }).estimation.status, 'disabled');
  }
  for (const command of [
    'printf "%s" "npx aitm plan-estimate 2063"',
    'npx aitm plan-estimate 2063 --compatibility-mode',
    'gh issue view 2063',
    'git commit -m "plan-estimate"',
  ])
    assert.equal(runtime.estimationCommandArgs(command), null);
});
