// @story #1200
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEstimationOutcomeRuntime,
  verificationEvidence,
} from '../../../../task-tracker/lib/estimation/runtime-adapter.mjs';

const ISSUE = 1200;
const SHA = 'a'.repeat(40);
const ENVIRONMENT = {
  node: 'v22.11.0',
  platform: 'darwin-arm64',
  lockfileHash: `sha256:${'1'.repeat(64)}`,
  configHashes: {},
  sandbox: { kind: 'worktree', identity: '/tmp/aitm-1200', clean: true },
};
const FINGERPRINT = { commitSha: SHA, environment: ENVIRONMENT };

function command(classification) {
  const identities = {
    'lint-full': ['npm', ['run', 'lint']],
    'format-full': ['npm', ['run', 'format:check']],
    'test-unit': ['npm', ['run', 'test:unit']],
    'test-integration': ['npm', ['run', 'test:integration']],
    'test-slow': ['npm', ['run', 'test:slow']],
  };
  const [executable, args] = identities[classification];
  return { classification, command: executable, args, exitCode: 0, durationMs: 1 };
}

function receipt({
  receiptId = '01J00000000000000000001200',
  commands = ['lint-full', 'format-full'].map(command),
  laneSkip,
} = {}) {
  return {
    schema: 'aitm.verification-receipt/v1',
    receiptId,
    issue: ISSUE,
    stage: 'test',
    commitSha: SHA,
    startedAt: '2026-08-10T04:00:00.000Z',
    completedAt: '2026-08-10T04:01:00.000Z',
    environment: ENVIRONMENT,
    commands,
    supersedes: null,
    ...(laneSkip === undefined ? {} : { laneSkip }),
  };
}

function marker(value) {
  const data = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
}

function verify(body) {
  return verificationEvidence(body, {
    expectedIssue: ISSUE,
    expectedFinalSha: SHA,
    expectedFingerprint: FINGERPRINT,
  });
}

test('close evidence accepts a docs-only Test receipt with three recorded lane skips', () => {
  const docsOnly = receipt({
    laneSkip: {
      reason: 'docs-only-diff',
      kind: 'docs-only',
      lanes: ['test-unit', 'test-integration', 'test-slow'],
      changedPaths: ['docs/DESIGN.md'],
    },
  });

  assert.doesNotThrow(() => verify(marker(docsOnly)));
});

test('close evidence keeps all five classifications required without a valid lane skip', () => {
  assert.throws(
    () => verify(marker(receipt())),
    /missing required classifications: test-unit, test-integration, test-slow/i
  );
});

test('close evidence distinguishes no Test receipt for the exact final SHA', () => {
  assert.throws(() => verify(''), /no Test receipt for exact final SHA/i);
});

test('close evidence distinguishes multiple Test receipts for the exact final SHA', () => {
  const body = [
    marker(receipt()),
    marker(receipt({ receiptId: '01J00000000000000000001201' })),
  ].join('\n');
  assert.throws(() => verify(body), /multiple Test receipts for exact final SHA/i);
});

test('the close outcome runtime needs no override for the #1146-equivalent fixture', async () => {
  const fixture = receipt({
    laneSkip: {
      reason: 'docs-only-diff',
      kind: 'docs-only',
      lanes: ['test-unit', 'test-integration', 'test-slow'],
      changedPaths: ['docs/DESIGN.md'],
    },
  });
  const forecast = {
    commentNodeId: 'IC_forecast_1200',
    envelope: {
      recordType: 'estimation-forecast',
      recordId: '01J00000000000000000001202',
      payloadHash: `sha256:${'2'.repeat(64)}`,
      supersedes: null,
      payload: {
        issue: ISSUE,
        plan: { humanHours: 3 },
        ai: { p50EngagedHours: 1, p80EngagedHours: 1.5 },
      },
    },
  };
  const written = [];
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: 'kburson/ai-task-manager' },
    projectDir: '/tmp/aitm-1200',
    deps: {
      childOutcomeRecordIds: async () => [],
      recordIo: {
        listIssueRecords: async () => [forecast, ...written],
        write: async ({ envelope }) => {
          const record = { commentNodeId: 'IC_outcome_1200', envelope };
          written.push(record);
          return record;
        },
      },
      readTimingCommentBody: async () => ({
        status: 'found',
        body: [
          '| 2026-08-10 00:00:00 -05:00 | plan:stopped | | | | | | <!-- row-sec: a=1 i=0 -->',
          '| 2026-08-10 00:00:01 -05:00 | develop:stopped | | | | | | <!-- row-sec: a=1 i=0 -->',
          '| 2026-08-10 00:00:02 -05:00 | test:stopped | | | | | | <!-- row-sec: a=1 i=0 -->',
          '| 2026-08-10 00:00:03 -05:00 | review:stopped | | | | | | <!-- row-sec: a=1 i=0 -->',
        ].join('\n'),
      }),
      readDiffEvidence: async () => ({
        commitSha: SHA,
        verificationSha: SHA,
        filesChanged: 1,
        modules: ['docs'],
        lanes: ['sandbox'],
        dependencyBreadth: 1,
      }),
    },
  });

  const result = await runtime.ensure({
    issueNumber: ISSUE,
    forecastRecordId: forecast.envelope.recordId,
    body: marker(fixture),
  });

  assert.equal(result.status, 'written');
  assert.equal(written.length, 1);
  assert.deepEqual(
    written[0].envelope.payload.actual.commands.map(({ classification }) => classification).sort(),
    ['format-full', 'lint-full']
  );
});
