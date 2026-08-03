// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  costEvidence,
  createEstimationOutcomeRuntime,
  verificationEvidence,
} from '../../../../lib/estimation/runtime-adapter.mjs';

const repository = 'kburson/ai-task-manager';

const environment = {
  node: 'v22.0.0',
  platform: 'darwin-arm64',
  lockfileHash: `sha256:${'1'.repeat(64)}`,
  configHashes: {},
  sandbox: { kind: 'worktree', identity: '/tmp/aitm-1091', clean: true },
};

function receipt({ receiptId, stage, commitSha, commands }) {
  return {
    schema: 'aitm.verification-receipt/v1',
    receiptId,
    issue: 1091,
    stage,
    commitSha,
    startedAt: '2026-08-02T14:00:00.000Z',
    completedAt: '2026-08-02T14:01:00.000Z',
    environment,
    commands: commands.map((command) => ({
      command: 'npm',
      args: ['run', 'test:unit'],
      ...command,
    })),
    supersedes: null,
  };
}

test('verification outcomes retain exact SHA and reuse lineage and only same-SHA reruns are waste', () => {
  const body = [
    receipt({
      receiptId: '01J00000000000000000000901',
      stage: 'develop-final',
      commitSha: 'a'.repeat(40),
      commands: [{ classification: 'test-unit', durationMs: 60_000, exitCode: 0 }],
    }),
    receipt({
      receiptId: '01J00000000000000000000902',
      stage: 'test',
      commitSha: 'a'.repeat(40),
      commands: [
        {
          classification: 'test-unit',
          durationMs: 60_000,
          exitCode: 0,
          reusedFrom: '01J00000000000000000000901',
        },
      ],
    }),
    receipt({
      receiptId: '01J00000000000000000000903',
      stage: 'review',
      commitSha: 'b'.repeat(40),
      commands: [{ classification: 'test-unit', durationMs: 90_000, exitCode: 0 }],
    }),
    receipt({
      receiptId: '01J00000000000000000000904',
      stage: 'review-probe',
      commitSha: 'b'.repeat(40),
      commands: [{ classification: 'test-unit', durationMs: 30_000, exitCode: 0 }],
    }),
  ]
    .map(
      (receipt) =>
        `<!-- aitm-verification-receipt stage="${receipt.stage}" data="${Buffer.from(JSON.stringify(receipt)).toString('base64url')}" -->`
    )
    .join('\n');

  const [command] = verificationEvidence(body, { expectedIssue: 1091 });
  assert.equal(command.attempts, 3);
  assert.equal(command.durationMs, 180_000);
  assert.deepEqual(
    command.executions.map(({ stage, commitSha, reusedFrom }) => ({
      stage,
      commitSha,
      reusedFrom,
    })),
    [
      { stage: 'develop-final', commitSha: 'a'.repeat(40), reusedFrom: null },
      {
        stage: 'test',
        commitSha: 'a'.repeat(40),
        reusedFrom: '01J00000000000000000000901',
      },
      { stage: 'review', commitSha: 'b'.repeat(40), reusedFrom: null },
      { stage: 'review-probe', commitSha: 'b'.repeat(40), reusedFrom: null },
    ]
  );
  assert.deepEqual(costEvidence([command]), {
    avoidableProcessWasteHours: 0.0083,
    drivers: [{ kind: 'repeated-command-same-sha', hours: 0.0083 }],
  });
});

test('verification outcomes reject malformed claimed receipts and preserve distinct command identities', () => {
  const malformed = {
    receiptId: '01J00000000000000000000911',
    stage: 'test',
    commitSha: 'a'.repeat(40),
    commands: [],
  };
  const malformedBody = `<!-- aitm-verification-receipt stage="test" data="${Buffer.from(JSON.stringify(malformed)).toString('base64url')}" -->`;
  assert.throws(
    () => verificationEvidence(malformedBody, { expectedIssue: 1091 }),
    /verification-receipt/
  );

  const valid = receipt({
    receiptId: '01J00000000000000000000912',
    stage: 'review',
    commitSha: 'b'.repeat(40),
    commands: [
      {
        classification: 'test-focused',
        command: 'node',
        args: ['--test', 'a.test.mjs'],
        durationMs: 30_000,
        exitCode: 0,
      },
      {
        classification: 'test-focused',
        command: 'node',
        args: ['--test', 'b.test.mjs'],
        durationMs: 40_000,
        exitCode: 0,
      },
    ],
  });
  const body = `<!-- aitm-verification-receipt stage="review" data="${Buffer.from(JSON.stringify(valid)).toString('base64url')}" -->`;
  const verification = verificationEvidence(body, { expectedIssue: 1091 });
  assert.deepEqual(costEvidence(verification), {
    avoidableProcessWasteHours: 0,
    drivers: [],
  });
});

test('exact final SHA requires a complete canonical Test receipt and rejects an arbitrary green probe', () => {
  const sha = 'b'.repeat(40);
  const probe = receipt({
    receiptId: '01J00000000000000000000913',
    stage: 'review',
    commitSha: sha,
    commands: [
      {
        classification: 'review-probe',
        command: 'node',
        args: ['--test', 'one.test.mjs'],
        durationMs: 1_000,
        exitCode: 0,
      },
    ],
  });
  const marker = (value) =>
    `<!-- aitm-verification-receipt stage="${value.stage}" data="${Buffer.from(JSON.stringify(value)).toString('base64url')}" -->`;
  assert.throws(
    () =>
      verificationEvidence(marker(probe), {
        expectedIssue: 1091,
        expectedFinalSha: sha,
        expectedFingerprint: { commitSha: sha, environment },
      }),
    /complete canonical Test receipt/i
  );

  const canonical = receipt({
    receiptId: '01J00000000000000000000914',
    stage: 'test',
    commitSha: sha,
    commands: [
      ['lint-full', ['run', 'lint']],
      ['format-full', ['run', 'format:check']],
      ['test-unit', ['run', 'test:unit']],
      ['test-integration', ['run', 'test:integration']],
      ['test-slow', ['run', 'test:slow']],
    ].map(([classification, args]) => ({
      classification,
      command: 'npm',
      args,
      durationMs: 1_000,
      exitCode: 0,
    })),
  });
  assert.doesNotThrow(() =>
    verificationEvidence(marker(canonical), {
      expectedIssue: 1091,
      expectedFinalSha: sha,
      expectedFingerprint: { commitSha: sha, environment },
    })
  );
});

test('same SHA command identity is waste even when display classifications differ', () => {
  const sha = 'c'.repeat(40);
  const body = [
    receipt({
      receiptId: '01J00000000000000000000915',
      stage: 'develop-final',
      commitSha: sha,
      commands: [
        {
          classification: 'test-focused',
          command: 'node',
          args: ['--test', 'same.test.mjs'],
          durationMs: 30_000,
          exitCode: 0,
        },
      ],
    }),
    receipt({
      receiptId: '01J00000000000000000000916',
      stage: 'review',
      commitSha: sha,
      commands: [
        {
          classification: 'review-probe',
          command: 'node',
          args: ['--test', 'same.test.mjs'],
          durationMs: 30_000,
          exitCode: 0,
        },
      ],
    }),
  ]
    .map(
      (value) =>
        `<!-- aitm-verification-receipt stage="${value.stage}" data="${Buffer.from(JSON.stringify(value)).toString('base64url')}" -->`
    )
    .join('\n');
  assert.deepEqual(costEvidence(verificationEvidence(body, { expectedIssue: 1091 })), {
    avoidableProcessWasteHours: 0.0083,
    drivers: [{ kind: 'repeated-command-same-sha', hours: 0.0083 }],
  });
});

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
  assert.deepEqual(recordCalls, [1067, 101, 102, 1067]);
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
