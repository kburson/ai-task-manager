// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
