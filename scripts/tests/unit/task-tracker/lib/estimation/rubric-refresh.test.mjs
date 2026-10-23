// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createBootstrapRubric } from '../../../../../task-tracker/lib/estimation/rubric-model.mjs';
import { loadOrRefreshRubric } from '../../../../../task-tracker/lib/estimation/rubric-refresh.mjs';

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

// @story #1094
test('refresh validates a corpus outcome containing targeted verification classifications', async () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const targeted = structuredClone(outcome);
  targeted.payload.actual.commands = [
    {
      classification: 'test-targeted-7',
      durationMs: 60_000,
      attempts: 1,
      executions: [
        {
          receiptId: '01J00000000000000000000420',
          stage: 'test',
          commitSha: 'a'.repeat(40),
          command: 'node',
          args: ['--test', 'focused.test.mjs'],
          exitCode: 0,
          durationMs: 60_000,
          reusedFrom: null,
        },
      ],
    },
  ];

  const result = await loadOrRefreshRubric({
    cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
    through: '2026-08-02T15:00:00.000Z',
    deps: {
      listRubricRecords: async () => [comment(previous)],
      listEligibleOutcomes: async () => [targeted],
      writeRubric: async ({ payload, predecessorRecordId }) =>
        comment(payload, '01J00000000000000000000421', {
          predecessor: predecessorRecordId,
        }),
    },
  });

  assert.equal(result.status, 'refreshed');
  assert.equal(result.rubric.testLandscape.laneMinutes.focused, 1);
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

// @story #2039 #2062
import {
  deriveLocalRubric,
  refreshLocalRubric,
} from '../../../../../task-tracker/lib/estimation/rubric-refresh.mjs';
import {
  bundle as localBundle,
  envelope as localEnvelope,
  outcome as localOutcome,
  id as localId,
  bytes as localBytes,
  incompleteOutcome as localIncompleteOutcome,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';
import { validateLocalEvidence } from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
function localFixture({ outcomes = true } = {}) {
  const evidence = localBundle([
    { record: localEnvelope(), provenance: 'imported-local' },
    ...(outcomes
      ? [
          {
            record: localEnvelope({ recordId: localId(2), payload: localOutcome(), issue: 1002 }),
            provenance: 'imported-local',
          },
        ]
      : []),
  ]);
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canon,
    ...selection
  } = evidence.manifest;
  return {
    mode: { mode: 'local' },
    evidence,
    selection: structuredClone(selection),
    recordId: localId(3),
    generatedAt: '2026-10-22T00:00:00.000Z',
  };
}
test('local rubric derives reproducibly from retained complete outcomes without a cloud grant', () => {
  const args = localFixture();
  const original = localBytes(args.evidence.manifest);
  const one = deriveLocalRubric(args),
    two = deriveLocalRubric(args);
  assert.equal(one.status, 'derived');
  assert.deepEqual(one, two);
  assert.equal(one.record.recordId, localId(3));
  assert.equal(one.record.schema, 'aitm.local-derived-record/v1');
  assert.equal(one.record.recordType, 'estimation-rubric');
  assert.equal(one.record.predecessor, localId(1));
  assert.equal(one.record.supersedes, localId(1));
  assert.equal(one.record.payload.predecessorRecordId, localId(1));
  assert.equal(one.record.payload.version, 2);
  assert.deepEqual(one.record.payload.cohort, [{ issue: 1002, outcomeRecordId: localId(2) }]);
  assert.equal(one.record.payload.ai.coefficients.implementationHour, 0.4286);
  assert.equal(one.record.payload.human.coefficients.implementationHour, 1);
  assert.equal(one.record.payload.human.sampleSize, 0);
  assert.equal(one.record.grantId, undefined);
  assert.equal(one.bundle.manifest.inputs.at(-1).provenance, 'derived-local');
  assert.equal(one.bundle.manifest.inputs.at(-1).sourceCommentId, null);
  assert.ok(original.equals(localBytes(args.evidence.manifest)));
  assert.equal(validateLocalEvidence(one.bundle).activeRubric.record.recordId, localId(3));
});
test('a locally unchanged cohort reuses the exact rubric identity without inventing a bootstrap', () => {
  const args = localFixture({ outcomes: false });
  const result = deriveLocalRubric(args);
  assert.equal(result.status, 'current');
  assert.equal(result.record.recordId, localId(1));
  assert.equal(result.bundle.manifest.inputs.length, 1);
});
test('derivation of the same retained cohort is idempotent after selecting the successor bundle', () => {
  const args = localFixture();
  const first = deriveLocalRubric(args);
  const second = deriveLocalRubric({ ...args, evidence: first.bundle });
  assert.equal(second.status, 'current');
  assert.equal(second.record.recordId, localId(3));
  assert.equal(second.bundle.manifest.inputs.length, 3);
});
for (const change of [
  'missing',
  'selection',
  'bytes',
  'id-collision',
  'bad-id',
  'missing-time',
  'past-time',
]) {
  test('local derivation refuses ' + change + ' without returning a usable rubric', () => {
    const args = localFixture();
    if (change === 'missing') args.evidence = null;
    if (change === 'selection') args.selection.repository = 'wrong/repo';
    if (change === 'bytes')
      args.evidence.payloads.set(args.evidence.payloads.keys().next().value, Buffer.from('{}'));
    if (change === 'id-collision') args.recordId = localId(1);
    if (change === 'bad-id') args.recordId = 'invented';
    if (change === 'missing-time') delete args.generatedAt;
    if (change === 'past-time') args.generatedAt = '2026-10-20T00:00:00.000Z';
    const result = deriveLocalRubric(args);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.record, undefined);
    assert.equal(result.bundle, undefined);
  });
}
test('incomplete local timing refuses before deriving a rubric', async () => {
  const args = localFixture();
  args.evidence = localBundle([
    { record: localEnvelope(), provenance: 'imported-local' },
    {
      record: localEnvelope({
        recordId: localId(2),
        payload: await localIncompleteOutcome(),
        issue: 1002,
      }),
      provenance: 'imported-local',
    },
  ]);
  assert.equal(deriveLocalRubric(args).status, 'unavailable');
});
test('disabled refresh never opens storage or derives a bootstrap', async () => {
  const result = await refreshLocalRubric({
    mode: { mode: 'disabled' },
    get evidenceStore() {
      throw Error('must not read storage');
    },
  });
  assert.deepEqual(result, { status: 'disabled', reason: 'rubric-disabled' });
});
test('a forged store cannot acknowledge a derived record as durable', async () => {
  let reads = 0;
  const result = await refreshLocalRubric({
    ...localFixture(),
    evidenceStore: {
      read() {
        reads++;
        return {};
      },
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.recordId, undefined);
  assert.equal(reads, 0);
});

for (const [name, thrown] of [
  ['null', null],
  ['undefined', undefined],
  ['object reason', { reason: { invalid: 'object' } }],
  [
    'throwing reason getter',
    {
      get reason() {
        throw null;
      },
    },
  ],
]) {
  test('local derivation and refresh normalize thrown ' + name, async () => {
    const args = localFixture();
    Object.defineProperty(args, 'evidence', {
      get() {
        throw thrown;
      },
    });
    const result = deriveLocalRubric(args);
    assert.equal(result.status, 'unavailable');
    assert.equal(typeof result.reason, 'string');
    const refreshed = await refreshLocalRubric(args);
    assert.equal(refreshed.status, 'unavailable');
    assert.equal(typeof refreshed.reason, 'string');
  });
}
