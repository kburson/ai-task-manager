// @story #2007
// The default Close factory is real; only external record/timing IO is isolated.
import { mock } from 'node:test';
import * as adapter from '../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { timingActorKey, timingActorMarker } from '../../task-tracker/lib/timing-actor.mjs';
import { residentGate, issue, repository, sha } from './1857-timing-outcome-harness.mjs';

import {
  upsertDeliveredCloseTransaction,
  readDeliveredCloseTransactions,
} from '../../task-tracker/lib/close-convergence.mjs';

const scenario = process.argv[2];
const records = [];
let sourceReads = 0;
let body;
let inRetry = false;
let seeded;
let seedSourceReads;
const actor = timingActorKey({ provider: 'codex', sid: 'isolated-2007-fixture' });
const timingBody =
  [
    '⏱ Timing Log',
    '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
    '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
    '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
      timingActorMarker(actor) +
      ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
  ].join('\n') + '\n';
if (scenario === 'conflicting-forecast')
  records.push({
    commentNodeId: 'IC_forecast',
    envelope: {
      recordType: 'estimation-forecast',
      recordId: '01J00000000000000000000800',
      repository,
      issue,
      supersedes: null,
      payload: { issue, plan: { humanHours: 4 }, ai: { p50EngagedHours: 4, p80EngagedHours: 6 } },
    },
  });
mock.module(
  new URL('../../task-tracker/lib/estimation/runtime-adapter.mjs', import.meta.url).href,
  {
    namedExports: {
      ...adapter,
      createEstimationOutcomeRuntime: (options) =>
        adapter.createEstimationOutcomeRuntime({
          ...options,
          deps: {
            readIssueBody: async () => body,
            childOutcomeRecordIds: async () => ({ childCount: 0, recordIds: [] }),
            recordIo: {
              graphql: async () => {
                throw new Error('unexpected external request');
              },
              listIssueRecords: async () => structuredClone(records),
              write: async ({ envelope }) => {
                const record = { commentNodeId: 'IC_outcome', envelope };
                records.push(record);
                return record;
              },
            },
            readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
            readCanonicalTimingSource: async () => {
              sourceReads++;
              if (scenario === 'missing-source') return { status: 'missing' };
              return {
                status: 'found',
                source: {
                  repository,
                  issue,
                  commentNodeId:
                    (scenario === 'stale-source' && records.length) ||
                    (inRetry && scenario.includes('stale-source'))
                      ? 'IC_changed'
                      : 'IC_timing',
                  body: timingBody,
                },
              };
            },
            readDiffEvidence: async () => ({
              verificationSha: sha,
              commitSha: sha,
              filesChanged: 0,
              modules: ['issue-resident-delivery'],
              lanes: [],
              dependencyBreadth: 0,
            }),
          },
        }),
    },
  }
);
const { runClose, closeBody } = await import('./close-convergence-wiring-helpers.mjs');
const gate = residentGate();
const values = {
  engagedTime: scenario === 'complete' ? 42 : null,
  sessionTime: null,
  reviewTime: null,
  planTime: null,
};
body = closeBody().replace(/<!-- aitm-fields:.*?-->/, '') + '\n' + gate.deliveryBody;
body += '\n<!-- aitm-fields: ' + JSON.stringify({ schema: 1, values }) + ' -->\n';
body +=
  '\n<!-- aitm-review-approved ts="2026-10-01T00:00:00.000Z" approved-sha="' +
  sha +
  '" full-auto="yes" -->\n';
// Match the consumer's authorized Close journal before its first timing step.
body = upsertDeliveredCloseTransaction(body, {
  schema: 'aitm.delivered-close/v1',
  transactionId: '2007-close-fixture',
  issueNumber: issue,
  acceptedSha: sha,
  reviewAuthority: 'human-gate',
  completedSteps: [],
});
if (scenario === 'missing-test') body = body.replace(/<!-- aitm-verification-receipt.*?-->/, '');
let calls;
let result;
let error = null;
const stderr = [];
const originalError = console.error;
const originalExit = process.exit;
process.exit = (code) => {
  throw new Error('fixture-process-exit:' + code);
};
console.error = (...args) => stderr.push(args.join(' '));
const invoke = () =>
  runClose({
    issueNumber: issue,
    repository,
    body,
    timingBody,
    timingProjection:
      scenario === 'missing-projection'
        ? undefined
        : { status: scenario === 'complete' ? 'complete' : 'incomplete' },
    boardState: inRetry && scenario.startsWith('legacy-closed') ? 'done' : 'review',
    closeSnapshot:
      inRetry && scenario.startsWith('legacy-closed')
        ? { issueClosed: true, stateReason: 'completed' }
        : { issueClosed: false, stateReason: null },
    captureCalls: (value) => {
      calls = value;
    },
    useInjectedDeliveryReceipt: false,
    useInjectedFreshDeliveryVerification: false,
    deliveryGateInput: { ...gate.gateInput, body },
    contextOverrides: {
      loadCloseDeliveryGateInput: async ({ body: currentBody }) => ({
        ...gate.gateInput,
        body: currentBody,
        acceptedSha: scenario === 'stale-delivery' ? 'b'.repeat(40) : sha,
      }),
    },
  });
try {
  result = await invoke();
  if (scenario.startsWith('retry-') || scenario.startsWith('legacy-closed')) {
    seeded = result;
    seedSourceReads = sourceReads;
    body = upsertDeliveredCloseTransaction(seeded.body, {
      ...readDeliveredCloseTransactions(seeded.body)[0],
      completedSteps: scenario.includes('after-estimation') ? ['timing', 'estimation'] : ['timing'],
    });
    if (scenario === 'retry-missing-fields') body = body.replace(/<!-- aitm-fields:.*?-->/, '');
    if (scenario.startsWith('legacy-closed')) {
      body = body.replace(new RegExp('<!--\\s*aitm-delivered-close\\b[^>]*-->', 'gi'), '');
    }
    inRetry = true;
    result = await invoke();
  }
} catch (caught) {
  error = caught.message;
} finally {
  console.error = originalError;
  process.exit = originalExit;
}
console.log(
  'RESULT:' +
    JSON.stringify({
      error,
      stderr: stderr.join('\n'),
      exitCode: result?.exitCode,
      calls,
      body: result?.body ?? body,
      records,
      sourceReads,
      timingBody,
      seeded,
      seedSourceReads,
    })
);
