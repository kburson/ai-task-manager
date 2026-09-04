// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { ensureEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-writer.mjs';

const forecast = { recordId: '01J00000000000000000000900', payload: { issue: 1091 } };
const payload = {
  schema: 'aitm.estimation-outcome/v1',
  kind: 'story',
  issue: 1091,
  forecastRecordId: forecast.recordId,
};

test('no forecast is a legacy skip and epics remain eligible orchestration outcomes', async () => {
  const skipped = await ensureEstimationOutcome({ issue: 1091, forecast: null, deps: {} });
  assert.deepEqual(skipped, { status: 'legacy-no-forecast' });

  const epicPayload = {
    ...payload,
    issue: 1067,
    kind: 'epic-orchestration',
    forecastRecordId: null,
  };
  const epic = await ensureEstimationOutcome({
    issue: 1067,
    forecast: null,
    outcomePayload: epicPayload,
    deps: {
      listOutcomeRecords: async () => [],
      createOutcomeEnvelope: () => ({
        recordId: '01J00000000000000000000909',
        recordType: 'estimation-outcome',
        payload: epicPayload,
      }),
      writeOutcome: async ({ envelope }) => ({ commentNodeId: 'IC_epic', envelope }),
    },
  });
  assert.equal(epic.status, 'written');
  assert.equal(epic.commentNodeId, 'IC_epic');
});

test('writer appends and read-backs exactly one immutable outcome', async () => {
  const records = [];
  const result = await ensureEstimationOutcome({
    issue: 1091,
    forecast,
    outcomePayload: payload,
    deps: {
      listOutcomeRecords: async () => records,
      createOutcomeEnvelope: () => ({
        recordId: '01J00000000000000000000901',
        recordType: 'estimation-outcome',
        payload,
      }),
      writeOutcome: async ({ envelope }) => {
        const record = { commentNodeId: 'IC_outcome', envelope };
        records.push(record);
        return record;
      },
    },
  });
  assert.equal(result.status, 'written');
  assert.equal(result.commentNodeId, 'IC_outcome');
  assert.equal(records.length, 1);
});

test('concurrent closes share one logical outcome claim and append exactly once', async () => {
  const records = [];
  let writes = 0;
  const deps = {
    listOutcomeRecords: async () => [...records],
    createOutcomeEnvelope: () => ({
      recordId: '01J00000000000000000000910',
      recordType: 'estimation-outcome',
      payload,
    }),
    writeOutcome: async ({ envelope }) => {
      writes += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const record = { commentNodeId: 'IC_concurrent_outcome', envelope };
      records.push(record);
      return record;
    },
  };

  const results = await Promise.all(
    [1, 2].map(() =>
      ensureEstimationOutcome({ issue: 1091, forecast, outcomePayload: payload, deps })
    )
  );

  assert.equal(writes, 1);
  assert.equal(records.length, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ['existing', 'written']);
  assert.equal(results[0].recordId, results[1].recordId);
});

test('repeated close and partially written retries return the existing outcome', async () => {
  let writes = 0;
  const existing = {
    commentNodeId: 'IC_existing',
    envelope: { recordId: '01J00000000000000000000902', recordType: 'estimation-outcome', payload },
  };
  const result = await ensureEstimationOutcome({
    issue: 1091,
    forecast,
    outcomePayload: payload,
    deps: {
      listOutcomeRecords: async () => [existing],
      createOutcomeEnvelope: () => {
        throw new Error('no envelope');
      },
      writeOutcome: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'existing');
  assert.equal(result.commentNodeId, 'IC_existing');
  assert.equal(writes, 0);
});

test('repeated close refuses an existing outcome whose immutable payload differs', async () => {
  const existing = {
    commentNodeId: 'IC_existing',
    envelope: {
      recordId: '01J00000000000000000000902',
      recordType: 'estimation-outcome',
      payload: { ...payload, actual: { engagedHours: 99 } },
    },
  };
  await assert.rejects(
    ensureEstimationOutcome({
      issue: 1091,
      forecast,
      outcomePayload: payload,
      deps: { listOutcomeRecords: async () => [existing] },
    }),
    /estimation-outcome-writer:payload-mismatch/
  );
});

test('an explicitly authorized reopened close supersedes a differing active outcome', async () => {
  const priorId = '01J00000000000000000000902';
  const correctionId = '01J00000000000000000000911';
  const records = [
    {
      commentNodeId: 'IC_existing',
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        supersedes: null,
        payload: { ...payload, actual: { engagedHours: 1 } },
      },
    },
  ];

  const result = await ensureEstimationOutcome({
    issue: 1091,
    forecast,
    outcomePayload: { ...payload, actual: { engagedHours: 2 } },
    supersedeExisting: true,
    deps: {
      listOutcomeRecords: async () => records,
      createOutcomeEnvelope: ({ payload: nextPayload, supersedes }) => ({
        recordId: correctionId,
        recordType: 'estimation-outcome',
        supersedes,
        payload: nextPayload,
      }),
      writeOutcome: async ({ envelope }) => {
        const written = { commentNodeId: 'IC_correction', envelope };
        records.push(written);
        return written;
      },
    },
  });

  assert.deepEqual(result, {
    status: 'written',
    recordId: correctionId,
    commentNodeId: 'IC_correction',
  });
});

test('reopened correction refuses when the historical outcome is missing', async () => {
  await assert.rejects(
    ensureEstimationOutcome({
      issue: 1091,
      forecast,
      outcomePayload: payload,
      supersedeExisting: true,
      deps: {
        listOutcomeRecords: async () => [],
        createOutcomeEnvelope: () => ({
          recordId: '01J00000000000000000000912',
          recordType: 'estimation-outcome',
          supersedes: null,
          payload,
        }),
        writeOutcome: async ({ envelope }) => ({ commentNodeId: 'IC_new', envelope }),
      },
    }),
    /estimation-outcome-writer:correction-predecessor/
  );
});

test('reopened correction refuses when a cross-lineage successor already superseded its predecessor', async () => {
  const priorId = '01J00000000000000000000902';
  const successorId = '01J00000000000000000000913';
  const records = [
    {
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        supersedes: null,
        payload: { ...payload, actual: { engagedHours: 1 } },
      },
    },
    {
      envelope: {
        recordId: successorId,
        recordType: 'estimation-outcome',
        supersedes: priorId,
        payload: {
          ...payload,
          forecastRecordId: '01J00000000000000000000999',
          actual: { engagedHours: 1.5 },
        },
      },
    },
  ];

  await assert.rejects(
    ensureEstimationOutcome({
      issue: 1091,
      forecast,
      outcomePayload: { ...payload, actual: { engagedHours: 2 } },
      supersedeExisting: true,
      deps: {
        listOutcomeRecords: async () => records,
        createOutcomeEnvelope: () => {
          throw new Error('must not append a fork');
        },
      },
    }),
    /estimation-outcome-writer:correction-predecessor/
  );
});

test('concurrent reopened corrections append one globally active successor', async () => {
  const priorId = '01J00000000000000000000902';
  const correctionId = '01J00000000000000000000914';
  const correctedPayload = { ...payload, actual: { engagedHours: 2 } };
  const records = [
    {
      commentNodeId: 'IC_prior',
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        supersedes: null,
        payload: { ...payload, actual: { engagedHours: 1 } },
      },
    },
  ];
  let writes = 0;
  const deps = {
    listOutcomeRecords: async () => [...records],
    createOutcomeEnvelope: ({ payload: nextPayload, supersedes }) => ({
      recordId: correctionId,
      recordType: 'estimation-outcome',
      supersedes,
      payload: nextPayload,
    }),
    writeOutcome: async ({ envelope }) => {
      writes += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const written = { commentNodeId: 'IC_correction', envelope };
      records.push(written);
      return written;
    },
  };

  const results = await Promise.all(
    [1, 2].map(() =>
      ensureEstimationOutcome({
        issue: 1091,
        forecast,
        outcomePayload: correctedPayload,
        supersedeExisting: true,
        deps,
      })
    )
  );

  assert.equal(writes, 1);
  assert.equal(records.length, 2);
  assert.deepEqual(results.map(({ status }) => status).sort(), ['existing', 'written']);
  assert.equal(records[1].envelope.supersedes, priorId);
});

test('duplicate or conflicting outcome records fail closed', async () => {
  const record = (id, forecastRecordId) => ({
    commentNodeId: `IC_${id}`,
    envelope: {
      recordId: id,
      recordType: 'estimation-outcome',
      payload: { ...payload, forecastRecordId },
    },
  });
  await assert.rejects(
    ensureEstimationOutcome({
      issue: 1091,
      forecast,
      outcomePayload: payload,
      deps: {
        listOutcomeRecords: async () => [
          record('01J00000000000000000000903', forecast.recordId),
          record('01J00000000000000000000904', forecast.recordId),
        ],
      },
    }),
    /estimation-outcome-writer:duplicate/
  );
});
