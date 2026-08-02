// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimationOutcomeSamples,
  loadProjectEstimationCorpus,
  refineEstimateFromProjection,
} from '../../../../lib/estimation/runtime-adapter.mjs';

const repository = 'kburson/ai-task-manager';

test('process retry preserves the immutable Refine baseline after partial Plan writes', () => {
  assert.deepEqual(
    refineEstimateFromProjection({
      refineAppendix: {
        refine: { size: 'L', humanHours: 20 },
        plan: { size: 'XL', humanHours: 40 },
      },
      board: { size: 'XL', estimate: 40 },
    }),
    { size: 'L', humanHours: 20 }
  );
});

test('rubric corpus pairs each story outcome with its exact frozen forecast', () => {
  const forecastPayload = {
    issue: 1091,
    refine: { humanHours: 8 },
    plan: { humanHours: 10 },
  };
  const forecastRecordId = '01J00000000000000000000601';
  const records = [
    {
      envelope: {
        recordType: 'estimation-forecast',
        recordId: forecastRecordId,
        issue: 1091,
        payload: forecastPayload,
      },
    },
    {
      envelope: {
        recordType: 'estimation-outcome',
        recordId: '01J00000000000000000000602',
        createdAt: '2026-08-02T15:00:00.000Z',
        issue: 1091,
        payload: { kind: 'story', forecastRecordId },
      },
    },
  ];

  const [sample] = estimationOutcomeSamples(records);
  assert.strictEqual(sample.forecastPayload, forecastPayload);
  assert.equal(sample.payload.forecastRecordId, forecastRecordId);
  assert.throws(
    () => estimationOutcomeSamples(records.slice(1)),
    /estimation-runtime:rubric-outcome-forecast/
  );
});

test('project corpus batches only unique Done candidates and excludes open outcomes', async () => {
  const calls = [];
  const recordCalls = [];
  const graphql = async ({ query, variables }) => {
    calls.push({ query, variables });
    if (query.includes('AitmEstimationCorpus')) {
      return {
        data: {
          node: {
            items: {
              nodes: [
                {
                  content: { id: 'ISSUE_DONE', number: 1 },
                  fieldValues: { nodes: [{ name: 'Done', field: { id: 'STATUS' } }] },
                },
                {
                  content: { id: 'ISSUE_OPEN', number: 2 },
                  fieldValues: { nodes: [{ name: 'Develop', field: { id: 'STATUS' } }] },
                },
                {
                  content: { id: 'ISSUE_DONE', number: 1 },
                  fieldValues: { nodes: [{ name: 'Done', field: { id: 'STATUS' } }] },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    }
    if (query.includes('AitmEstimationDoneRecords')) {
      assert.deepEqual(variables.ids, ['ISSUE_DONE']);
      return {
        data: {
          nodes: [
            {
              id: 'ISSUE_DONE',
              number: 1,
              comments: { nodes: [], pageInfo: { hasNextPage: true } },
            },
          ],
        },
      };
    }
    throw new Error('unexpected query');
  };
  const expected = { envelope: { recordType: 'estimation-outcome' } };
  const records = await loadProjectEstimationCorpus({
    cfg: { repo: repository, projectId: 'PROJECT', kanbanFieldId: 'STATUS' },
    graphql,
    io: {
      graphql,
      listIssueRecords: async ({ issue }) => {
        recordCalls.push(issue);
        return [expected];
      },
    },
  });

  assert.deepEqual(records, [expected]);
  assert.deepEqual(recordCalls, [1]);
  assert.equal(calls.length, 2);
});

test('project corpus fails closed on incomplete project, issue-batch, or comment pagination evidence', async () => {
  const cfg = { repo: repository, projectId: 'PROJECT', kanbanFieldId: 'STATUS' };
  const doneItem = {
    content: { id: 'ISSUE_DONE', number: 1 },
    fieldValues: { nodes: [{ name: 'Done', field: { id: 'STATUS' } }] },
  };
  const projectResponse = {
    data: {
      node: {
        items: { nodes: [doneItem], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    },
  };

  await assert.rejects(
    loadProjectEstimationCorpus({
      cfg,
      io: {},
      graphql: async () => ({ data: { node: { items: { nodes: [] } } } }),
    }),
    /estimation-runtime:corpus-pagination/
  );
  await assert.rejects(
    loadProjectEstimationCorpus({
      cfg,
      io: {},
      graphql: async ({ query }) =>
        query.includes('AitmEstimationCorpus') ? projectResponse : { data: { nodes: [] } },
    }),
    /estimation-runtime:corpus-response/
  );
  await assert.rejects(
    loadProjectEstimationCorpus({
      cfg,
      io: {},
      graphql: async ({ query }) =>
        query.includes('AitmEstimationCorpus')
          ? projectResponse
          : {
              data: {
                nodes: [{ id: 'ISSUE_DONE', number: 1, comments: { nodes: [] } }],
              },
            },
    }),
    /estimation-runtime:corpus-pagination/
  );
});
