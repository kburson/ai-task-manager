// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEstimationOutcomeRuntime } from '../../../../lib/estimation/runtime-adapter.mjs';

const repository = 'kburson/ai-task-manager';

test('epic child outcome discovery paginates children and delegates full comment reads to the record store', async () => {
  const childIds = ['01J00000000000000000000811', '01J00000000000000000000812'];
  const recordCalls = [];
  const graphqlCalls = [];
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      graphql: async ({ query, variables }) => {
        graphqlCalls.push({ query, variables });
        assert.match(query, /subIssues\(first:\s*100,\s*after:\s*\$after\)/);
        const first = variables.after == null;
        return {
          data: {
            repository: {
              issue: {
                number: 1067,
                repository: { nameWithOwner: repository },
                subIssues: {
                  nodes: [{ number: first ? 101 : 102 }],
                  pageInfo: first
                    ? { hasNextPage: true, endCursor: 'CHILD_CURSOR' }
                    : { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        };
      },
      recordIo: {
        graphql: async () => {},
        listIssueRecords: async ({ issue }) => {
          recordCalls.push(issue);
          if (issue === 1067) return [];
          const index = issue - 101;
          return [
            {
              commentNodeId: `IC_child_${issue}`,
              envelope: {
                recordType: 'estimation-outcome',
                recordId: childIds[index],
                createdAt: `2026-08-02T14:0${index}:00.000Z`,
              },
            },
          ];
        },
        write: async ({ envelope }) => ({ commentNodeId: 'IC_epic', envelope }),
      },
      readTimingCommentBody: async () => ({
        status: 'found',
        body: [
          '| 2026-08-02 10:00:00 -05:00 | plan:stopped | | | | | | <!-- row-sec: a=60 i=0 -->',
          '| 2026-08-02 10:01:00 -05:00 | develop:stopped | | | | | | <!-- row-sec: a=60 i=0 -->',
          '| 2026-08-02 10:02:00 -05:00 | test:stopped | | | | | | <!-- row-sec: a=60 i=0 -->',
          '| 2026-08-02 10:03:00 -05:00 | review:stopped | | | | | | <!-- row-sec: a=60 i=0 -->',
        ].join('\n'),
      }),
      readDiffEvidence: async () => ({
        filesChanged: 0,
        modules: ['epic-orchestration'],
        lanes: ['sandbox'],
        dependencyBreadth: 0,
      }),
    },
  });

  const result = await runtime.ensure({ issueNumber: 1067, forecastRecordId: null, body: '' });
  assert.equal(result.status, 'written');
  assert.equal(graphqlCalls.length, 2);
  assert.deepEqual(recordCalls, [1067, 101, 102]);
});
