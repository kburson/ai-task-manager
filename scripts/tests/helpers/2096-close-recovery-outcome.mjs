// @story #2096
// Real Close, timing persistence and outcome writer; authority/remote IO use explicit test boundaries.
import { createEstimationOutcomeRuntime } from '../../task-tracker/lib/estimation/runtime-adapter.mjs';
import {
  createReopenedCloseRecoveryRecord,
  renderReopenedCloseRecoveryComment,
} from '../../task-tracker/lib/reopened-close-recovery.mjs';
import { ensureDeliveredCloseSupersession } from '../../task-tracker/lib/delivered-close-supersession.mjs';
import {
  readDeliveredCloseTransactions,
  upsertDeliveredCloseTransaction,
  TERMINAL_CLOSE_STEPS,
} from '../../task-tracker/lib/close-convergence.mjs';
import { timingActorKey, timingActorMarker } from '../../task-tracker/lib/timing-actor.mjs';
import { canonicalTestReceiptFixture } from '../fixtures/estimation-verification.mjs';
import { runClose, closeBody } from './close-convergence-wiring-helpers.mjs';

export const issue = 2096;
export const repository = 'owner/repo';
export const OLD_SHA = 'd'.repeat(40);
export const ROOT_SHA = 'b'.repeat(40);
export const CURRENT_SHA = 'c'.repeat(40);
export const NEXT_SHA = 'e'.repeat(40);
const instant = '2026-10-01T00:02:00.000Z';
const transaction = (transactionId, acceptedSha, completedSteps = []) => ({
  schema: 'aitm.delivered-close/v1',
  transactionId,
  issueNumber: issue,
  acceptedSha,
  reviewAuthority: 'human-gate',
  completedSteps,
});
const comment = (body, id) => ({
  id,
  body,
  user: { login: 'owner' },
  created_at: instant,
  updated_at: instant,
  issue_url: `https://api.github.com/repos/${repository}/issues/${issue}`,
});

export async function fixture({ depth = 2 } = {}) {
  const records = [];
  const comments = [];
  const root = createReopenedCloseRecoveryRecord(
    {
      repository,
      issueNumber: issue,
      actor: 'owner',
      oldTransaction: transaction('completed-old', OLD_SHA, [...TERMINAL_CLOSE_STEPS]),
      newAcceptedSha: ROOT_SHA,
      newReviewAuthority: 'human-gate',
      reason: 'completed-close-reopened-corrective-delivery',
    },
    { now: instant, randomUUIDFn: () => 'recovery-root' }
  );
  comments.push(comment(renderReopenedCloseRecoveryComment(root), 10));
  let active = transaction('recovery-root', ROOT_SHA);
  for (const [index, sha] of [CURRENT_SHA, NEXT_SHA].slice(0, depth).entries()) {
    const evidence = await ensureDeliveredCloseSupersession({
      authorization: {
        repository,
        issueNumber: issue,
        oldTransaction: active,
        newAcceptedSha: sha,
        newReviewAuthority: 'human-gate',
        reason: 'accepted-sha-corrective-amend',
      },
      deps: {
        randomUUIDFn: () => `replacement-${index}`,
        listComments: async () => structuredClone(comments),
        createComment: async (body) => {
          const created = comment(body, 20 + index);
          comments.push(created);
          return created;
        },
        readComment: async (id) => comments.find((entry) => String(entry.id) === String(id)),
      },
    });
    active = transaction(evidence.record.replacementTransactionId, sha);
  }
  const actor = timingActorKey({ provider: 'codex', sid: 'isolated-recovery-2096' });
  let timingBody =
    [
      'Timing Log',
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        timingActorMarker(actor) +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
    ].join('\n') + '\n';
  let selectedSha = OLD_SHA;
  const bodyFor = (sha) =>
    closeBody().replace(/<!-- aitm-fields:.*?-->/, '') +
    '\n' +
    canonicalTestReceiptFixture({ issue, sha }).body +
    '\n' +
    '<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null,"sessionTime":null,"reviewTime":null,"planTime":null}} -->\n' +
    `<!-- aitm-review-approved ts="${instant}" approved-sha="${sha}" -->\n`;
  let body = bodyFor(OLD_SHA);
  const writer = (options = {}) =>
    createEstimationOutcomeRuntime({
      cfg: { repo: repository },
      projectDir: process.cwd(),
      resolveVerificationSha: () => selectedSha,
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
            const record = { commentNodeId: `IC_outcome_${records.length}`, envelope };
            records.push(record);
            return record;
          },
        },
        readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
        readCanonicalTimingSource: async () => ({
          status: 'found',
          source: {
            repository,
            issue,
            commentNodeId: 'IC_timing',
            body: timingBody,
          },
        }),
        readDiffEvidence: async () => ({
          verificationSha: selectedSha,
          commitSha: selectedSha,
          filesChanged: 1,
          modules: ['close'],
          lanes: ['unit'],
          dependencyBreadth: 0,
        }),
      },
    });
  await writer().ensure({ issueNumber: issue, forecastRecordId: null, body });
  const original = structuredClone(records[0]);
  selectedSha = active.acceptedSha;
  body = upsertDeliveredCloseTransaction(bodyFor(selectedSha), active);
  const checkpoints = [];
  const invoke = async ({
    prefixBody = body,
    restart = false,
    acceptedSha = selectedSha,
    evidence = comments,
    ownership = { authorized: true, disposition: 'own-post-close-claim' },
    staleTiming = false,
    staleNumeric = false,
  } = {}) => {
    body = restart
      ? upsertDeliveredCloseTransaction(
          bodyFor(acceptedSha),
          readDeliveredCloseTransactions(prefixBody)[0]
        )
      : prefixBody;
    selectedSha = acceptedSha;
    if (staleNumeric) body = body.replace('"engagedTime":null', '"engagedTime":42');
    if (staleTiming) timingBody = 'changed timing source\n' + timingBody;
    const steps = readDeliveredCloseTransactions(body)[0].completedSteps;
    const liveEvidence = structuredClone(evidence);
    return runClose({
      issueNumber: issue,
      repository,
      body,
      acceptedSha,
      localHeadSha: acceptedSha,
      boardState: steps.includes('board') ? 'done' : 'review',
      closeSnapshot: {
        issueClosed: steps.includes('issue'),
        stateReason: steps.includes('issue') ? 'completed' : 'reopened',
      },
      timingBody,
      timingProjection: { status: 'incomplete' },
      terminalDisposition: 'Delivered',
      liveLabels: [],
      bindingReleaseStatus: steps.includes('binding') ? 'released' : 'conflict',
      bindingOwnership: ownership,
      gateReviewToDone: false,
      restartStaleTransaction: restart,
      supersessionComments: liveEvidence,
      onSupersessionCommentCreated: (created) => liveEvidence.push(created),
      replacementTransactionId: 'next-replacement',
      createEstimationOutcomeWriter: writer,
      mutationResult: ({ nextBody }) => {
        body = nextBody;
        const current = readDeliveredCloseTransactions(body)[0];
        checkpoints.push({
          body,
          steps: [...current.completedSteps],
          records: structuredClone(records),
        });
        return { status: 'ok', body };
      },
      contextOverrides: {
        loadCloseDeliveryGateInput: async ({ body: currentBody }) => ({
          repository,
          issueNumber: issue,
          acceptedSha,
          localHeadSha: acceptedSha,
          body: currentBody,
          lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
          branch: 'codex/2096',
          pullRequests: [],
          records: null,
        }),
        verifyCloseDeliveryReceipt: async () => ({
          skipped: false,
          receipt: { expectedHeadSha: acceptedSha },
          verification: { receiptInput: { expectedHeadSha: acceptedSha } },
        }),
        listReopenedCloseRecoveryComments: async () => structuredClone(liveEvidence),
        readReopenedCloseBody: async () => body,
      },
    });
  };
  return {
    invoke,
    records,
    comments,
    root,
    original,
    active,
    checkpoints,
    body: () => body,
    restoreRecords: (snapshot) => records.splice(0, records.length, ...structuredClone(snapshot)),
  };
}
