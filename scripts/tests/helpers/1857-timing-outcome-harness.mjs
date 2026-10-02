// @story #1857
import { createEstimationOutcomeRuntime } from '../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { canonicalTestReceiptFixture } from '../fixtures/estimation-verification.mjs';
import { timingActorKey, timingActorMarker } from '../../task-tracker/lib/timing-actor.mjs';
import { buildNoCommitDeliveryRecord } from '../../task-tracker/lib/no-commit-delivery-record.mjs';
import { requireDeliveryReceipt } from '../../task-tracker/lib/close-delivery-receipt.mjs';
export const issue = 1857,
  repository = 'owner/repo',
  sha = 'a'.repeat(40),
  forecastId = '01J00000000000000000000800';

export function harness({
  isLineageAncestor,
  resolveDeliveryAuthority,
  onWrite,
  acceptedSha = sha,
  projectDir = process.cwd(),
  useDefaultDiff = false,
  children = [],
} = {}) {
  const key = timingActorKey({ provider: 'codex', sid: 'runtime-author' });
  let timingBody =
    '⏱ Timing Log\n\n' +
    [
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        timingActorMarker(key) +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
    ].join('\n') +
    '\n';
  const records = [
    {
      commentNodeId: 'IC_forecast',
      envelope: {
        recordType: 'estimation-forecast',
        recordId: forecastId,
        repository,
        issue,
        supersedes: null,
        payload: { issue, plan: { humanHours: 4 }, ai: { p50EngagedHours: 4, p80EngagedHours: 6 } },
      },
    },
  ];
  let sourceReads = 0;
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir,
    resolveVerificationSha: () => acceptedSha,
    resolveDeliveryAuthority,
    deps: {
      isLineageAncestor,
      readIssueBody: async () => canonicalTestReceiptFixture({ issue }).body,
      childOutcomeRecordIds: async () => ({ childCount: children.length, recordIds: children }),
      recordIo: {
        graphql: async () => {
          throw new Error('unexpected');
        },
        listIssueRecords: async () => structuredClone(records),
        write: async ({ envelope }) => {
          const record = { commentNodeId: 'IC_outcome', envelope };
          records.push(record);
          onWrite?.(records);
          return record;
        },
      },
      readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
      readCanonicalTimingSource: async () => {
        sourceReads++;
        return {
          status: 'found',
          source: { repository, issue, commentNodeId: 'IC_timing', body: timingBody },
        };
      },
      readDiffEvidence: useDefaultDiff
        ? undefined
        : async () => ({
            verificationSha: acceptedSha,
            commitSha: acceptedSha,
            filesChanged: 1,
            modules: ['timing'],
            lanes: ['unit'],
            dependencyBreadth: 0,
          }),
    },
  });
  return {
    runtime,
    records,
    setTiming: (value) => {
      timingBody = value;
    },
    getTiming: () => timingBody,
    getSourceReads: () => sourceReads,
  };
}

export function closeBody(receiptSha = sha) {
  return (
    canonicalTestReceiptFixture({ issue, sha: receiptSha }).body +
    '\n<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="' +
    forecastId +
    '" -->\n<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->\n'
  );
}

export function residentGate(kind = 'research', acceptedSha = sha) {
  let body =
    '## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="' +
    kind +
    '" -->\n<!-- aitm-deliverable-posted url="https://example.test/report" ts="2026-08-02T14:00:00.000Z" -->\n';
  const original = canonicalTestReceiptFixture({ issue }).body.match(
    new RegExp('data="([A-Za-z0-9_-]+)"')
  )[1];
  const testReceipt = JSON.parse(Buffer.from(original, 'base64url').toString());
  testReceipt.commitSha = acceptedSha;
  testReceipt.commands = [];
  testReceipt.verificationCommands = [];
  body +=
    String.fromCharCode(10) +
    '<!-- aitm-verification-receipt stage="test" data="' +
    Buffer.from(JSON.stringify(testReceipt)).toString('base64url') +
    '" -->' +
    String.fromCharCode(10);
  const record = buildNoCommitDeliveryRecord({
    recordId: '01J00000000000000000000841',
    repository,
    issueNumber: issue,
    issueKind: kind,
    deliverableUrl: 'https://example.test/report',
    acceptedSha,
    provider: 'fixture',
    sessionId: 'isolated-fixture',
    verifiedAt: '2026-08-02T14:00:00.000Z',
  });
  const gateInput = {
    repository,
    issueNumber: issue,
    body,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'codex/fixture',
    acceptedSha,
    pullRequests: [],
    noCommitRecords: { records: [{ record }], record: { record } },
  };
  return {
    gateInput,
    deliveryBody: body,
    receipt: requireDeliveryReceipt(gateInput),
    testReceiptSha: acceptedSha,
    acceptedReviewSha: acceptedSha,
  };
}
