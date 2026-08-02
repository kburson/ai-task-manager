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

test('mixed legacy/adaptive epics reference adaptive child outcomes and ignore forecast-free legacy children', async () => {
  const adaptiveOutcomeId = '01J00000000000000000000821';
  let writtenPayload = null;
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      graphql: async () => ({
        data: {
          repository: {
            issue: {
              number: 1067,
              repository: { nameWithOwner: repository },
              subIssues: {
                nodes: [{ number: 101 }, { number: 102 }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      }),
      recordIo: {
        graphql: async () => {},
        listIssueRecords: async ({ issue }) => {
          if (issue === 101) {
            return [
              {
                envelope: {
                  recordType: 'estimation-outcome',
                  recordId: adaptiveOutcomeId,
                  createdAt: '2026-08-02T14:00:00.000Z',
                },
              },
            ];
          }
          return [];
        },
        write: async ({ envelope }) => {
          writtenPayload = envelope.payload;
          return { commentNodeId: 'IC_epic', envelope };
        },
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
  assert.deepEqual(writtenPayload.landscape.childOutcomeRecordIds, [adaptiveOutcomeId]);
});

test('epic close fails closed when an adaptive child has a forecast but no outcome', async () => {
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      graphql: async () => ({
        data: {
          repository: {
            issue: {
              number: 1067,
              repository: { nameWithOwner: repository },
              subIssues: {
                nodes: [{ number: 101 }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      }),
      recordIo: {
        graphql: async () => {},
        listIssueRecords: async ({ issue }) =>
          issue === 101 ? [{ envelope: { recordType: 'estimation-forecast' } }] : [],
        write: async () => {
          throw new Error('must not write');
        },
      },
    },
  });

  await assert.rejects(
    runtime.ensure({ issueNumber: 1067, forecastRecordId: null, body: '' }),
    /estimation-runtime:child-outcomes/
  );
});
