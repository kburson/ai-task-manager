// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createBootstrapRubric } from '../../../../lib/estimation/rubric-model.mjs';
import { loadOrRefreshRubric } from '../../../../lib/estimation/rubric-refresh.mjs';

const rubricId = '01J00000000000000000000400';
const outcomeId = '01J00000000000000000000401';
const outcome = {
  recordId: outcomeId,
  createdAt: '2026-08-02T14:00:00.000Z',
  payload: {
    schema: 'aitm.estimation-outcome/v1',
    kind: 'story',
    issue: 1091,
    forecastRecordId: '01J00000000000000000000402',
    humanPlanHours: 10,
    aiForecast: { p50EngagedHours: 5, p80EngagedHours: 8 },
    actual: {
      engagedHours: 5,
      stages: { plan: 1, develop: 2, test: 1, review: 1 },
      reviewFixCycles: 0,
      commands: [],
    },
    landscape: {
      filesChanged: 2,
      modules: ['estimation'],
      lanes: ['unit'],
      dependencyBreadth: 1,
      childOutcomeRecordIds: [],
    },
    variance: { vsAiP50Hours: 0, vsAiP80Hours: -3 },
    costClassification: {
      necessaryHours: 5,
      avoidableProcessWasteHours: 0,
      unclassifiedHours: 0,
      drivers: [],
    },
  },
};

function comment(payload, recordId = rubricId, overrides = {}) {
  return {
    commentNodeId: `IC_${recordId}`,
    envelope: {
      recordId,
      recordType: 'estimation-rubric',
      createdAt: payload.generatedAt,
      predecessor: payload.predecessorRecordId,
      supersedes: payload.predecessorRecordId,
      payload,
      ...overrides,
    },
  };
}

test('zero configured rubric issue returns the explicit low-confidence bootstrap without writes', async () => {
  let writes = 0;
  const result = await loadOrRefreshRubric({
    cfg: { repo: 'o/r', estimationRubricIssue: 0 },
    through: '2026-08-02T15:00:00.000Z',
    deps: {
      writeRubric: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'unconfigured');
  assert.equal(result.rubric.version, 1);
  assert.equal(writes, 0);
});

test('new eligible outcomes create one superseding snapshot and read it back', async () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const calls = [];
  const result = await loadOrRefreshRubric({
    cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
    through: '2026-08-02T15:00:00.000Z',
    deps: {
      listRubricRecords: async () => [comment(previous)],
      listEligibleOutcomes: async () => [outcome],
      writeRubric: async ({ payload, predecessorRecordId }) => {
        calls.push({ payload, predecessorRecordId });
        return comment(payload, '01J00000000000000000000403', { predecessor: predecessorRecordId });
      },
    },
  });
  assert.equal(result.status, 'refreshed');
  assert.equal(result.recordId, '01J00000000000000000000403');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].predecessorRecordId, rubricId);
  assert.equal(result.rubric.cohort[0].outcomeRecordId, outcomeId);
  assert.equal(result.commentNodeId, 'IC_01J00000000000000000000403');
});

test('concurrent refreshes claim one cohort transition and create one successor', async () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const records = [comment(previous)];
  let writes = 0;
  const deps = {
    listRubricRecords: async () => [...records],
    listEligibleOutcomes: async () => [outcome],
    writeRubric: async ({ payload, predecessorRecordId }) => {
      writes += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const record = comment(payload, '01J00000000000000000000413', {
        predecessor: predecessorRecordId,
      });
      records.push(record);
      return record;
    },
  };

  const results = await Promise.all(
    [1, 2].map(() =>
      loadOrRefreshRubric({
        cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
        through: '2026-08-02T15:00:00.000Z',
        deps,
      })
    )
  );

  assert.equal(writes, 1);
  assert.equal(records.length, 2);
  assert.deepEqual(results.map((result) => result.status).sort(), ['current', 'refreshed']);
  assert.equal(results[0].recordId, results[1].recordId);
});

test('the exact existing cohort is idempotent and creates no comment', async () => {
  const current = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  current.cohort = [{ issue: 1091, outcomeRecordId: outcomeId }];
  current.human.sampleSize = 1;
  current.ai.sampleSize = 1;
  let writes = 0;
  const result = await loadOrRefreshRubric({
    cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
    through: '2026-08-02T15:00:00.000Z',
    deps: {
      listRubricRecords: async () => [comment(current)],
      listEligibleOutcomes: async () => [outcome],
      writeRubric: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'current');
  assert.equal(result.recordId, rubricId);
  assert.equal(writes, 0);
});

test('conflicting latest snapshots fail closed', async () => {
  const one = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const two = {
    ...createBootstrapRubric({ generatedAt: '2026-08-02T13:30:00.000Z' }),
    workflowDiagnostics: { avoidableProcessWasteHours: 1 },
  };
  await assert.rejects(
    loadOrRefreshRubric({
      cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
      through: '2026-08-02T15:00:00.000Z',
      deps: {
        listRubricRecords: async () => [comment(one), comment(two, '01J00000000000000000000404')],
        listEligibleOutcomes: async () => [],
      },
    }),
    /rubric-refresh:conflicting-latest/
  );
});

test('rubric payload and envelope predecessor links must describe one complete chain', async () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const next = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  next.version = 2;
  next.predecessorRecordId = rubricId;
  await assert.rejects(
    loadOrRefreshRubric({
      cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
      through: '2026-08-02T15:00:00.000Z',
      deps: {
        listRubricRecords: async () => [
          comment(previous),
          comment(next, '01J00000000000000000000405', {
            predecessor: '01J00000000000000000000406',
            supersedes: '01J00000000000000000000406',
          }),
        ],
        listEligibleOutcomes: async () => [],
      },
    }),
    /rubric-refresh:lineage/
  );
});

test('a historical rubric fork fails closed even when only one branch reaches the maximum version', async () => {
  const root = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const branch = (recordId, generatedAt) => {
    const payload = createBootstrapRubric({ generatedAt });
    payload.version = 2;
    payload.predecessorRecordId = rubricId;
    return comment(payload, recordId, { predecessor: rubricId, supersedes: rubricId });
  };
  const leftId = '01J00000000000000000000410';
  const left = branch(leftId, '2026-08-02T14:00:00.000Z');
  const right = branch('01J00000000000000000000411', '2026-08-02T14:01:00.000Z');
  const tipPayload = createBootstrapRubric({ generatedAt: '2026-08-02T15:00:00.000Z' });
  tipPayload.version = 3;
  tipPayload.predecessorRecordId = leftId;

  await assert.rejects(
    loadOrRefreshRubric({
      cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
      through: '2026-08-02T16:00:00.000Z',
      deps: {
        listRubricRecords: async () => [
          comment(root),
          left,
          right,
          comment(tipPayload, '01J00000000000000000000412', {
            predecessor: leftId,
            supersedes: leftId,
          }),
        ],
        listEligibleOutcomes: async () => [],
      },
    }),
    /rubric-refresh:lineage/
  );
});
