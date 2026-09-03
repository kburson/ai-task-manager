import { randomUUID } from 'node:crypto';
import { pexec as closePexec } from '../../gh/lib/gh-client.mjs';

import { loadState, saveState, clearActive, stateFullWordMarker } from '../state.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { resolveGate, resolveReviewAuthorization } from '../lib/gate-resolve.mjs';
import { rawProjectConfig } from '../config.mjs';
import { currentSessionId } from '../word-counter.mjs';
import {
  inspectTerminalIssueBindingRelease,
  releaseTerminalIssueBinding,
  resumeTerminalIssueBindingRelease,
} from '../lib/worktree-binding-lifecycle.mjs';
import {
  checkDirty,
  formatSummary,
  shortAuditDescription,
  resolveWorkspaceForIssue,
  CLEANUP_GUIDANCE,
} from '../../gh/lib/dirty-workspace.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { assertVerbHomeState } from '../lib/verb-home-state-guard.mjs';
import { parseDisposition, runDispose } from '../lib/close-disposition.mjs';
import { readTerminalDisposition, writeTerminalDisposition } from '../lib/terminal-disposition.mjs';
import {
  hasReviewApprovedMarker,
  parseReviewApprovedMarker,
  readPlanApprovedForecastRecordId,
} from '../lib/markers.mjs';
import { isAgentReviewComplete } from '../lib/agent-review/review-gate.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import {
  detectLinkedWorktree,
  makeCloseTrunkRefResolver,
} from '../lib/full-auto-merge-execute.mjs';
import { fetchParentIssueStrict } from '../lib/fetch-parent-issue.mjs';
import {
  canonicalVerificationCommandSet,
  parseVerificationReceipt,
  parseValidatedVerificationReceipts,
  requiredTestReceiptClassifications,
  validateVerificationReceipt,
} from '../lib/verification-receipt.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import {
  parseDeliveryCommentForPullRequest,
  projectDeliveryRecords,
} from '../lib/delivery-records.mjs';
import { isNoCommitKind } from '../lib/issue-kind.mjs';
import {
  parseNoCommitDeliveryComment,
  projectNoCommitDeliveryRecords,
} from '../lib/no-commit-delivery-record.mjs';
import {
  requireDeliveryReceipt,
  resolveAcceptedDeliveryHead,
  verifyCloseDeliveryReceipt,
} from '../lib/close-delivery-receipt.mjs';
import { attributingCommits as defaultAttributingCommits } from '../lib/commit-attribution.mjs';
import { resolveAcceptedDeliveryAuthority } from '../lib/delivery-authority.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { resolveProjectDir } from '../lib/project-dir.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { resolveDocsOnlyLaneSkipProof } from '../lib/docs-only-lane-skip-proof.mjs';
import { closeLabelRemoveArgs } from '../lib/close-labels.mjs';
import {
  decideCloseConvergence,
  decideBoardMoveFailure,
  decideGateEvalFailure,
  readDeliveredCloseTransactions,
  resolveDeliveredCloseTransaction,
  shouldEmitReviewApprovedRow,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
  resolveBoardStateForClose,
} from '../lib/close-convergence.mjs';
import {
  authorizeDeliveredCloseRestart,
  ensureDeliveredCloseSupersession,
  parseDeliveredCloseSupersessionComment,
  replaceStaleDeliveredCloseTransaction,
} from '../lib/delivered-close-supersession.mjs';
import {
  authorizeReopenedCloseRestart,
  classifyRecoveryProgress,
  createReopenedCloseRecoveryRecord,
  oldTransactionFromRecord,
  findRecoveryBackedReplacement,
  authorizeTerminalBindingRelease,
  renderReopenedCloseRecoveryComment,
  replaceCompletedDeliveredCloseTransaction,
  resolveReopenedBindingOwnership,
  resolveReopenedCloseRecovery,
} from '../lib/reopened-close-recovery.mjs';
import {
  deriveClosedIssueIntegrity,
  readUnauthorizedCloseRecovery,
  runClosedIssueConvergence,
  upsertUnauthorizedCloseRecovery,
} from '../lib/closed-issue-convergence.mjs';
import { resolveTailProfile } from '../lib/move-state/tail-profiles.mjs';
import { createEstimationOutcomeRuntime } from '../lib/estimation/runtime-adapter.mjs';
import { reconcileReviewApprovedTiming } from '../lib/review-approval-timing.mjs';
import { locateAuthoritySource } from '../lib/github-records/authority-locator.mjs';
import { normalizeGitHubInstant } from '../lib/github-records/github-comment-store.mjs';
import { createDefaultDeliverDeps, parsedDeliveryRecords } from './deliver.mjs';
import {
  hasAcceptedApprovalEvidence,
  hasAcceptedReviewEvidence,
  resolveLifecycleGateEvidence,
} from '../lib/github-records/lifecycle-gate-source.mjs';
import { gql, projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { parseBlockedByStrict } from '../lib/blocked-marker.mjs';
import { writeTerminalStatusDone } from '../lib/terminal-disposition.mjs';
import {
  authorizeIncorporatedClose,
  projectExactDeliveryReceipt,
  projectIncorporatedCloseReviewAuthority,
  runIncorporatedClose,
} from '../lib/incorporated-close.mjs';
import {
  authorizeIncidentEpicClose,
  INCIDENT_EPIC_TERMINAL_ISSUES,
  parseCloseOfAssertion,
} from '../lib/incident-epic-close.mjs';
import {
  readIssueDeliveryAuthority,
  resolveApprovedIncidentLedger,
} from '../lib/delivery-incident-reconciliation.mjs';
import { createProductionRuntime } from './incident-ledger.mjs';
import { selectEvidenceProtocol } from '../lib/evidence-v2/protocol.mjs';
import { resumeClose } from '../lib/evidence-v2/close-runner.mjs';

export async function runEvidenceV2CloseService({
  issue,
  issueNumber,
  repository,
  protocol,
  state,
  ports,
} = {}) {
  if (!ports || typeof ports.project !== 'function') {
    throw new Error('close-v2:ports capability is required');
  }
  return resumeClose({
    context: { issue, issueNumber, repository, protocol, state },
    ports,
  });
}

export async function dispatchEvidenceV2Close({
  ctx,
  issueNumber,
  cfg,
  pexec,
  state,
  skipNetwork = false,
} = {}) {
  if (!Number.isSafeInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    return { handled: false, result: null };
  }
  let issue;
  if (typeof ctx.fetchEvidenceV2CloseIssue === 'function') {
    issue = await ctx.fetchEvidenceV2CloseIssue({
      issueNumber: Number(issueNumber),
      repository: cfg.repo,
    });
  } else if (typeof ctx.closeBody === 'string') {
    issue = { number: Number(issueNumber), body: ctx.closeBody };
  } else if (skipNetwork) {
    return { handled: false, result: null };
  } else {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'number,body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    issue = JSON.parse(stdout);
  }
  const protocol = selectEvidenceProtocol({ body: issue.body, context: ctx.executionContext });
  if (protocol.protocol !== 'v2') return { handled: false, result: null };
  const runEvidenceV2Close = ctx.runEvidenceV2Close ?? runEvidenceV2CloseService;
  const result = await runEvidenceV2Close({
    issue,
    issueNumber: Number(issueNumber),
    repository: cfg.repo,
    protocol,
    state,
    ports: ctx.evidenceV2ClosePorts,
  });
  return { handled: true, result };
}

const INCIDENT_AUTHORITY_TYPES = new Set([
  'delivery-incident-ledger',
  'delivery-incident-ledger-approval-grant',
  'delivery-incident-ledger-approval',
  'delivery-incident-ledger-owner',
  'delivery-incident-incorporated',
]);

function closeAuditMarker(recordId) {
  return `<!-- aitm-incorporated-close-audit record-id="${recordId}" -->`;
}

async function readProjectCloseValues({ cfg, issueNumber, read = projectValuesForIssue }) {
  return read({
    cfg,
    fieldDefs: [
      { key: 'disposition', type: 'single_select' },
      { key: 'blockedBy', type: 'text' },
    ],
    issueNumber,
  });
}

function normalizeIncorporatedReviewAuthorization(value, { requireStanding } = {}) {
  const coherent =
    (value?.mode === 'full-auto' && ['session', 'project'].includes(value.source)) ||
    (value?.mode === 'human' &&
      ['human-evidence', 'directory-human-evidence'].includes(value.source));
  if (!coherent || (requireStanding === true && value.standing !== true)) {
    throw new Error('incorporated-close:review-authorization');
  }
  return Object.freeze({ mode: value.mode, source: value.source });
}

export function resolveIncorporatedReviewEvidence({
  body,
  issueNumber,
  expectedSha,
  session = loadSession(currentSessionId()),
  projectConfig = rawProjectConfig(),
  durableReviewAuthority = null,
  reviewAuthorizationResolver = resolveReviewAuthorization,
  projectDir = process.cwd(),
} = {}) {
  let receipts;
  try {
    receipts = parseValidatedVerificationReceipts(body, { expectedIssue: issueNumber });
  } catch {
    throw new Error('incorporated-close:accepted-evidence');
  }
  const byStage = (stage) => receipts.filter((receipt) => receipt.stage === stage);
  const testReceipts = byStage('test');
  const reviewReceipts = byStage('review');
  if (testReceipts.length !== 1 || reviewReceipts.length !== 1) {
    throw new Error('incorporated-close:accepted-evidence');
  }
  let verificationCommands;
  try {
    verificationCommands = canonicalVerificationCommandSet(parseVerificationCommands(body), {
      projectDir,
    });
  } catch {
    throw new Error('incorporated-close:accepted-evidence');
  }
  const validateExact = (receipt, stage, required = []) => {
    if (receipt.commitSha !== expectedSha) return false;
    return validateVerificationReceipt({
      receipt,
      expectedIssue: issueNumber,
      expectedStage: stage,
      fingerprint: {
        commitSha: expectedSha,
        verificationCommands,
        environment: receipt.environment,
      },
      required,
    }).ok;
  };
  if (
    !validateExact(testReceipts[0], 'test', requiredTestReceiptClassifications(testReceipts[0])) ||
    !validateExact(reviewReceipts[0], 'review')
  ) {
    throw new Error('incorporated-close:accepted-evidence');
  }
  let acceptedSha;
  try {
    acceptedSha = resolveAcceptedDeliveryHead({
      localHeadSha: expectedSha,
      testReceiptSha: testReceipts[0].commitSha,
      reviewReceiptSha: reviewReceipts[0].commitSha,
      agentReviewPassed: isAgentReviewComplete(body || ''),
    });
  } catch {
    throw new Error('incorporated-close:accepted-evidence');
  }
  let authorization;
  if (durableReviewAuthority !== null) {
    if (durableReviewAuthority.acceptedSha !== acceptedSha) {
      throw new Error('incorporated-close:review-authorization');
    }
    authorization = normalizeIncorporatedReviewAuthorization(
      durableReviewAuthority.reviewAuthorization
    );
  } else {
    const approval = parseReviewApprovedMarker(body || '');
    authorization = reviewAuthorizationResolver({
      session,
      projectConfig,
      acceptedHeadSha: acceptedSha,
      humanApprovalEvidence:
        approval && !approval.fullAuto
          ? { accepted: true, approvedSha: approval.approvedSha }
          : null,
      fullAutoApprovalEvidence: approval?.fullAuto
        ? { accepted: true, approvedSha: approval.approvedSha }
        : null,
    });
    authorization = normalizeIncorporatedReviewAuthorization(authorization, {
      requireStanding: true,
    });
  }
  return Object.freeze({
    acceptedSha,
    reviewAuthorizationValid: true,
    reviewAuthorization: authorization,
  });
}

export function resolveIncorporatedLedgerReviewAuthorization(authority) {
  const approval = authority?.projection?.approvedLedgerApproval;
  const payload = approval?.envelope?.payload;
  if (
    typeof approval?.authorLogin !== 'string' ||
    approval.authorLogin.length === 0 ||
    payload?.approvedBy !== approval.authorLogin ||
    approval.envelope.recordId !== authority?.approvalRecordId ||
    payload?.ledgerId !== authority?.ledgerId ||
    payload?.ledgerDigest !== authority?.ledgerDigest
  ) {
    throw new Error('incorporated-close:review-authorization');
  }
  return Object.freeze({ mode: 'human', source: 'directory-human-evidence' });
}

export async function prepareIncorporatedCloseAuthorization({
  ctx,
  issueNumber,
  convergenceIssue,
} = {}) {
  const { cfg, projectDir } = ctx.projectConfig ?? ctx;
  const runtime =
    ctx.incidentRuntime ||
    createProductionRuntime({
      cfg,
      projectDir,
      getIssueBoardState: (number) => (ctx.githubClient ?? ctx).getIssueBoardState(number),
    });
  const [convergenceRecords, ownerRecords, issueRecords] = await Promise.all([
    runtime.listConvergenceRecords(),
    runtime.listOwnerRecords(),
    runtime.listIssueRecords(issueNumber),
  ]);
  const records = [...convergenceRecords, ...ownerRecords, ...issueRecords].filter(({ envelope }) =>
    INCIDENT_AUTHORITY_TYPES.has(envelope.recordType)
  );
  const resolve = ctx.resolveApprovedIncidentLedger || resolveApprovedIncidentLedger;
  const authority = resolve({
    records,
    repository: cfg.repo,
    convergenceIssue,
    incidentIssue: 939,
  });
  const row = authority.ledgerPayload.rows.find(
    (candidate) => candidate.issueNumber === issueNumber
  );
  if (!row) throw new Error('incorporated-close:approved-row');
  const durableReviewAuthority = projectIncorporatedCloseReviewAuthority({
    records: issueRecords,
    repository: cfg.repo,
    issueNumber,
    convergenceIssue,
    ledgerId: authority.ledgerId,
    acceptedSha: row.acceptedSha,
  });
  const trunkSha = await runtime.liveObservationDeps.readTrunkSha();
  const [issue, pullRequest, sourceOnTrunk, comments, values] = await Promise.all([
    runtime.liveObservationDeps.fetchIssue(issueNumber),
    runtime.liveObservationDeps.fetchPullRequest(row.prNumber),
    runtime.liveObservationDeps.isOnTrunk(row.mergeSha ?? row.acceptedSha),
    runtime.liveObservationDeps.listComments(issueNumber),
    readProjectCloseValues({
      cfg,
      issueNumber,
      read: ctx.projectValuesForIssue || projectValuesForIssue,
    }),
  ]);
  const receiptProjection = projectExactDeliveryReceipt({
    comments,
    repository: cfg.repo,
    issueNumber,
    prNumber: row.prNumber,
    acceptedSha: row.acceptedSha,
  });
  const observedAuthority = readIssueDeliveryAuthority(issue.body || '', {
    expectedIssue: issueNumber,
  });
  let reviewAuthorization;
  if (durableReviewAuthority !== null) {
    if (durableReviewAuthority.acceptedSha !== row.acceptedSha) {
      throw new Error('incorporated-close:review-authorization');
    }
    reviewAuthorization = normalizeIncorporatedReviewAuthorization(
      durableReviewAuthority.reviewAuthorization
    );
  } else {
    reviewAuthorization = resolveIncorporatedLedgerReviewAuthorization(authority);
  }
  return (ctx.authorizeIncorporatedClose || authorizeIncorporatedClose)({
    repository: cfg.repo,
    issueNumber,
    convergenceIssue,
    records,
    live: {
      issueNumber,
      issueState: String(issue.state || '').toUpperCase(),
      issueStateReason: String(issue.stateReason || '').toUpperCase(),
      closeTransactionPresent: issueRecords.some(
        ({ envelope }) => envelope.recordType === 'delivery-incident-incorporated-close'
      ),
      acceptedEvidenceValid: observedAuthority.acceptedSha === row.acceptedSha,
      acceptedSha: observedAuthority.acceptedSha,
      reviewAuthorizationValid: true,
      reviewAuthorization,
      pullRequest,
      sourceOnTrunk,
      trunkSha,
      deliveryReceiptStatus: receiptProjection.status,
      blockerCarriers: {
        labelCleared: !(issue.labels || []).some(
          (label) => String(label?.name || label).toUpperCase() === 'BLOCKED'
        ),
        fieldCleared: String(values.blockedBy || '') === '',
        bodyCleared: parseBlockedByStrict(issue.body || '').length === 0,
      },
    },
    deps: { resolveApprovedIncidentLedger: () => authority },
  });
}

function incorporatedProductionDeps({ ctx, issueNumber, runtime }) {
  const { cfg, projectDir, pexec } = ctx.projectConfig ?? ctx;
  const githubClient = ctx.githubClient ?? ctx;
  const issueRef = `#${issueNumber}`;
  const listComments = () => runtime.liveObservationDeps.listComments(issueNumber);
  return {
    listIssueRecords: () => runtime.listIssueRecords(issueNumber),
    appendIssueRecord: ({ body }) => runtime.appendIssueRecord({ issueNumber, body }),
    appendCheckpointRecord: ({ body }) => runtime.appendIssueRecord({ issueNumber, body }),
    flushTiming: () =>
      (ctx.timingRecorder ?? ctx).flushAndForgetQueueFor?.(issueRef) ?? Promise.resolve(),
    readDisposition: () =>
      (ctx.readTerminalDisposition || readTerminalDisposition)({ cfg, issueNumber }),
    writeDisposition: ({ disposition }) =>
      (ctx.writeTerminalDisposition || writeTerminalDisposition)({
        cfg,
        issueNumber,
        disposition,
      }),
    readStatus: async () => {
      const status = await githubClient.getIssueBoardState(issueNumber);
      return String(status || '').toLowerCase() === 'done' ? 'Done' : status;
    },
    writeStatusDone: () =>
      (ctx.writeTerminalStatusDone || writeTerminalStatusDone)({ cfg, issueNumber }),
    readIssueCloseState: async () => {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'state,stateReason'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(stdout);
    },
    closeIssueCompleted: async () => {
      await pexec('gh', ['issue', 'close', String(issueNumber), '-R', cfg.repo], {
        timeout: GH_API_TIMEOUT_MS,
      });
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'state,stateReason'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const readback = JSON.parse(stdout);
      if (
        String(readback.state).toUpperCase() !== 'CLOSED' ||
        String(readback.stateReason).toUpperCase() !== 'COMPLETED'
      ) {
        throw new Error('incorporated-close:issue-readback');
      }
    },
    hasAudit: async ({ recordId }) =>
      (await listComments()).some((comment) => comment.body.includes(closeAuditMarker(recordId))),
    postAudit: ({ authorization, recordId }) =>
      pexec(
        'gh',
        [
          'issue',
          'comment',
          String(issueNumber),
          '-R',
          cfg.repo,
          '--body',
          `${closeAuditMarker(recordId)}\nClosed as Incorporated under approved convergence ledger ${authorization.ledgerId} on #${authorization.convergenceIssue}.`,
        ],
        { timeout: GH_API_TIMEOUT_MS }
      ),
    isBindingReleased: async () => {
      const result = (ctx.inspectTerminalIssueBindingRelease || inspectTerminalIssueBindingRelease)(
        {
          projectDir,
          issue: issueRef,
        }
      );
      if (result.status === 'conflict') throw new Error('incorporated-close:binding-conflict');
      return result.status === 'released';
    },
    releaseBinding: async () => {
      const inspect = (
        ctx.inspectTerminalIssueBindingRelease || inspectTerminalIssueBindingRelease
      )({
        projectDir,
        issue: issueRef,
      });
      if (inspect.status === 'incomplete') {
        (ctx.resumeTerminalIssueBindingRelease || resumeTerminalIssueBindingRelease)({
          projectDir,
          issue: issueRef,
        });
      } else if (inspect.status === 'pending') {
        releaseClosedBinding({ ctx, projectDir, issue: issueRef });
      } else if (inspect.status !== 'released') {
        throw new Error('incorporated-close:binding-conflict');
      }
    },
  };
}

export async function runCloseIncorporatedLane({ ctx, issueNumber, convergenceIssue } = {}) {
  const prepare =
    ctx.prepareIncorporatedCloseAuthorization || prepareIncorporatedCloseAuthorization;
  const authorization = await prepare({ ctx, issueNumber, convergenceIssue });
  let mutationDeps = ctx.incorporatedCloseDeps;
  if (!mutationDeps) {
    const runtime =
      ctx.incidentRuntime ||
      createProductionRuntime({
        cfg: (ctx.projectConfig ?? ctx).cfg,
        projectDir: (ctx.projectConfig ?? ctx).projectDir,
        getIssueBoardState: (number) => (ctx.githubClient ?? ctx).getIssueBoardState(number),
      });
    mutationDeps = incorporatedProductionDeps({ ctx, issueNumber, runtime });
  }
  return (ctx.runIncorporatedClose || runIncorporatedClose)({
    authorization,
    deps: mutationDeps,
  });
}

export async function authorizeIncidentEpicCloseForCommand({
  ctx,
  issueNumber,
  explicitConvergenceIssue = null,
} = {}) {
  const { cfg, projectDir } = ctx.projectConfig ?? ctx;
  const githubClient = ctx.githubClient ?? ctx;
  const runtime =
    ctx.incidentRuntime ||
    createProductionRuntime({
      cfg,
      projectDir,
      getIssueBoardState: (number) => githubClient.getIssueBoardState(number),
    });
  const ownerRecords = (await runtime.listIssueRecords(issueNumber)).filter(
    ({ envelope }) => envelope.recordType === 'delivery-incident-ledger-owner'
  );
  if (ownerRecords.length === 0) {
    if (issueNumber === 939) throw new Error('incident-epic-close:missing-owner');
    if (explicitConvergenceIssue !== null) throw new Error('incident-epic-close:non-incident-of');
    return null;
  }
  const [convergenceRecords, incorporatedSets, liveEntries] = await Promise.all([
    runtime.listConvergenceRecords(),
    Promise.all(INCIDENT_EPIC_TERMINAL_ISSUES.map((number) => runtime.listIssueRecords(number))),
    Promise.all(
      INCIDENT_EPIC_TERMINAL_ISSUES.map(async (number) => {
        const [issue, boardState, values] = await Promise.all([
          runtime.liveObservationDeps.fetchIssue(number),
          githubClient.getIssueBoardState(number),
          readProjectCloseValues({
            cfg,
            issueNumber: number,
            read: ctx.projectValuesForIssue || projectValuesForIssue,
          }),
        ]);
        return [
          number,
          {
            issueState: String(issue.state || '').toUpperCase(),
            issueStateReason: String(issue.stateReason || '').toUpperCase(),
            boardState: String(boardState || '').toLowerCase() === 'done' ? 'Done' : boardState,
            disposition: values.disposition || '',
          },
        ];
      })
    ),
  ]);
  return (ctx.authorizeIncidentEpicClose || authorizeIncidentEpicClose)({
    repository: cfg.repo,
    incidentIssue: issueNumber,
    explicitConvergenceIssue,
    ownerRecords,
    records: [...convergenceRecords, ...ownerRecords, ...incorporatedSets.flat()].filter(
      ({ envelope }) => INCIDENT_AUTHORITY_TYPES.has(envelope.recordType)
    ),
    liveOutcomes: Object.fromEntries(liveEntries),
    deps: {
      resolveApprovedIncidentLedger:
        ctx.resolveApprovedIncidentLedger || resolveApprovedIncidentLedger,
    },
  });
}

function closeBaseRef(cfg) {
  return (
    String(cfg?.trunkRef || 'trunk')
      .split('/')
      .at(-1) || 'trunk'
  );
}

export async function loadCloseDeliveryGateInput({
  issueNumber,
  cfg,
  projectDir,
  pexec,
  body,
  lifecycleEvidence,
  ctx,
}) {
  const [{ stdout: branchOut }, { stdout: headOut }, parentIssueNumber] = await Promise.all([
    pexec('git', ['branch', '--show-current'], { cwd: projectDir }),
    pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir }),
    (ctx.resolveCloseParentIssue || fetchParentIssueStrict)({
      issueNumber,
      repo: cfg.repo,
    }),
  ]);
  const branch = String(branchOut || '').trim();
  const localHeadSha = String(headOut || '').trim();
  const directoryLane = lifecycleEvidence !== null;
  const testReceiptSha = parseVerificationReceipt(body, 'test')?.commitSha ?? null;
  const reviewReceiptSha = directoryLane
    ? lifecycleEvidence.expectedSha
    : (parseVerificationReceipt(body, 'review')?.commitSha ?? null);
  const agentReviewPassed = directoryLane
    ? hasAcceptedReviewEvidence(lifecycleEvidence)
    : isAgentReviewComplete(body);
  const { stdout: prOut } = await pexec(
    'gh',
    [
      'pr',
      'list',
      '-R',
      cfg.repo,
      '--head',
      branch,
      '--state',
      'all',
      '--json',
      'number,state,mergedAt,mergeCommit,headRefName,headRefOid,baseRefName',
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const pullRequests = JSON.parse(String(prOut || '[]')).map((pr) => {
    const merged = String(pr.state || '').toUpperCase() === 'MERGED';
    const mergedAt = merged ? normalizeGitHubInstant(pr.mergedAt) : pr.mergedAt;
    if (merged && mergedAt === null) throw new TypeError('close-delivery-pr-merged-at');
    return {
      ...pr,
      merged,
      mergedAt,
      mergeCommitSha: pr.mergeCommit?.oid ?? null,
    };
  });
  const baseRef = closeBaseRef(cfg);
  const lineage = {
    parentIssueNumber,
    deliveryTarget: parentIssueNumber === null ? baseRef : `epic/${parentIssueNumber}`,
    localTrunkLaneAuthorized:
      cfg.fullAutoMerge?.mechanism === 'local-trunk-lane' &&
      cfg.fullAutoMerge?.operatorAuthorized === true,
  };
  const authority =
    parentIssueNumber === null && pullRequests.length > 0
      ? resolveAcceptedDeliveryAuthority({
          issueNumber,
          branch,
          localHeadSha,
          testReceiptSha,
          reviewReceiptSha,
          agentReviewPassed,
          pullRequests,
        })
      : null;
  const acceptedSha =
    authority?.acceptedSha ??
    resolveAcceptedDeliveryHead({
      localHeadSha,
      testReceiptSha,
      reviewReceiptSha,
      agentReviewPassed,
    });
  let selectedPullRequest = authority?.pullRequest ?? null;
  let records = null;
  let noCommitRecords = null;
  const noCommitKind = isNoCommitKind(body);
  let comments = null;
  if (parentIssueNumber === null && (pullRequests.length > 0 || noCommitKind)) {
    const { stdout: commentsOut } = await pexec(
      'gh',
      ['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${issueNumber}/comments`],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const pages = JSON.parse(String(commentsOut || '[]'));
    comments = (Array.isArray(pages) ? pages.flat() : []).map((comment) => {
      const createdAt = normalizeGitHubInstant(comment.created_at);
      if (createdAt === null) throw new TypeError('close-delivery-comment-created-at');
      return {
        id: String(comment.id),
        body: comment.body,
        createdAt,
      };
    });
  }
  if (parentIssueNumber === null && pullRequests.length > 0) {
    const context = { repository: cfg.repo, issueNumber, prNumber: selectedPullRequest.number };
    records = projectDeliveryRecords(
      comments
        .map((comment) => parseDeliveryCommentForPullRequest(comment, context))
        .filter(Boolean)
    );
    if (records.liveIntent?.record?.provider === 'external') {
      const fetchEvidence =
        ctx.fetchClosePullRequestEvidence ??
        createDefaultDeliverDeps({ cfg, projectDir }).fetchPullRequest;
      const evidenced = await fetchEvidence({ prNumber: selectedPullRequest.number });
      if (
        evidenced?.number !== selectedPullRequest.number ||
        evidenced?.headRefOid !== selectedPullRequest.headRefOid ||
        evidenced?.headRefName !== selectedPullRequest.headRefName ||
        evidenced?.baseRefName !== selectedPullRequest.baseRefName
      ) {
        throw new TypeError('close-delivery-pr-evidence');
      }
      selectedPullRequest = {
        ...selectedPullRequest,
        sourceCommits: evidenced.sourceCommits,
        sourceCommitEvidence: evidenced.sourceCommitEvidence,
        sourceCommitSubjects: evidenced.sourceCommitSubjects,
        sourceCommitsComplete: evidenced.sourceCommitsComplete,
        sourceCommitsHeadSha: evidenced.sourceCommitsHeadSha,
      };
    }
  }
  if (parentIssueNumber === null && noCommitKind && pullRequests.length === 0) {
    noCommitRecords = projectNoCommitDeliveryRecords(
      comments.map(parseNoCommitDeliveryComment).filter(Boolean)
    );
  }
  return {
    issueNumber,
    repository: cfg.repo,
    body,
    lineage,
    branch,
    acceptedSha,
    observedLocalHeadSha: authority?.observedLocalHeadSha ?? localHeadSha,
    headRelation: authority?.headRelation ?? 'current',
    pullRequest: selectedPullRequest,
    pullRequests,
    records,
    noCommitRecords,
  };
}

function defaultLifecycleGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

async function defaultCloseHeadSha({ projectDir }) {
  const { stdout } = await closePexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
  return String(stdout || '').trim();
}

export async function inspectCloseMergeCommit({ pexec, projectDir, mergeCommitSha }) {
  const { stdout } = await pexec('git', ['cat-file', 'commit', mergeCommitSha], {
    cwd: projectDir,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  const raw = String(stdout || '');
  const separator = raw.indexOf('\n\n');
  if (separator < 0) throw new Error('close-delivery-commit-object');
  const headers = raw.slice(0, separator).split('\n');
  const trees = headers.filter((line) => line.startsWith('tree ')).map((line) => line.slice(5));
  if (trees.length !== 1 || !/^[0-9a-f]{40}$/.test(trees[0])) {
    throw new Error('close-delivery-commit-object');
  }
  const message = raw.slice(separator + 2).replace(/\n$/, '');
  const [commitTitle, ...bodyLines] = message.split('\n');
  return {
    tree: trees[0],
    parents: headers
      .filter((line) => line.startsWith('parent '))
      .map((line) => line.slice('parent '.length)),
    commitTitle,
    commitMessage: bodyLines[0] === '' ? bodyLines.slice(1).join('\n') : bodyLines.join('\n'),
  };
}

export async function resolveCloseLifecycleEvidence({
  body,
  issueNumber,
  repository,
  projectDir,
  deps = {},
} = {}) {
  const source = (deps.locateAuthoritySource || locateAuthoritySource)({ issueBody: body });
  if (source.kind !== 'github-records/v1') return null;
  const testReceiptSha = parseVerificationReceipt(body, 'test')?.commitSha ?? null;
  const expectedSha =
    testReceiptSha ?? (await (deps.getHeadSha || defaultCloseHeadSha)({ projectDir }));
  const lifecycleEvidence = await (deps.resolveLifecycleEvidence || resolveLifecycleGateEvidence)({
    repository,
    issue: Number(issueNumber),
    issueBody: body,
    expectedSha,
    graphql: deps.graphql || defaultLifecycleGraphql,
    readContractRecord: deps.readContractRecord,
    deps: deps.listIssueRecords ? { listIssueRecords: deps.listIssueRecords } : undefined,
  });
  if (!hasAcceptedReviewEvidence(lifecycleEvidence)) {
    throw new Error('directory-review-evidence-missing');
  }
  const approvalAccepted =
    hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'human' }) ||
    hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'full-auto' });
  if (!approvalAccepted) throw new Error('directory-approval-evidence-missing');
  return lifecycleEvidence;
}

export function releaseClosedBinding({ ctx, projectDir, issue }) {
  return releaseTerminalIssueBinding({
    projectDir,
    issue,
    deps: {
      releaseIssueBindings: ctx.releaseIssueBindings,
      deregisterTask: ctx.deregisterTask,
      releaseBindingOccupancy: ctx.releaseBindingOccupancy,
      releaseOccupancy: ctx.releaseOccupancy,
    },
  }).occupancy;
}

// #705 — best-effort: a label-strip failure must never block or fail the
// close itself, mirroring the deregisterTask cleanup calls below.
async function stripCloseLabels({ pexec, cfg, issueNum }) {
  try {
    await pexec('gh', [...closeLabelRemoveArgs(issueNum), '-R', cfg.repo], {
      timeout: GH_API_TIMEOUT_MS,
    });
    return true;
  } catch (err) {
    console.error(
      `[task-tracker] warn: failed to strip ToDo/BLOCKED labels on #${issueNum}: ${err.message}`
    );
    return false;
  }
}

async function readCloseLabels({ pexec, cfg, issueNum }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'labels'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed?.labels)) throw new Error('close labels response was malformed');
  return parsed.labels.map((label) => label?.name).filter((name) => typeof name === 'string');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timingAuditHasExactTransaction(body, tx) {
  const exactTxField = new RegExp(`(?:^|[;\\s])tx=${escapeRegExp(tx)}(?=;|\\s|$)`);
  return String(body || '')
    .split('\n')
    .some((line) => {
      const cells = line.split('|');
      return String(cells[2] || '').trim() === 'unauthorized-close' && exactTxField.test(line);
    });
}

// #801 — emit the terminal `review:approved → issue:wrap` close pair, shared by
// BOTH the full close pipeline and the converge/no-op fast-path so the two can
// never drift apart. Historically only the full pipeline emitted the pair; an
// issue closed out-of-band (GitHub UI / Projects auto-close) then converged via
// `/task close` took the noop branch and returned before this block, leaving the
// per-issue Timing Log without its closing audit rows.
//
// Emission is idempotent (`pendingClosePairState` skips a half already present,
// so a re-run or a converge-after-normal-close is a no-op) and anti-fabrication
// safe: `review:approved` is emitted only when the caller reports a real approval
// marker OR an explicitly-bypassed review gate (`shouldEmitReviewApprovedRow`);
// `issue:wrap` is unconditional — it records the terminal close, not an approval.
async function emitReviewToDoneClosePair({
  closeTarget,
  closeIssueNum,
  cfg,
  hasApprovalMarker,
  issueBody,
  reviewGateBypassed,
  lastWordMarker,
  lastFullWordMarker,
  ctx,
  SKIP_NETWORK,
  nowIso,
  safePostTiming,
}) {
  const postRequiredTiming = async (row, event) => {
    const result = await safePostTiming(closeTarget, row);
    if (result?.ok === false || result?.queued === true) {
      throw new Error(
        `terminal timing ${event} was not durably posted${result?.err ? `: ${result.err}` : ''}`
      );
    }
  };
  const { deriveStateMoveDelta } = await import('../lib/timing-rows.mjs');
  const ts = nowIso();
  // #692 — the prior timing ROWS live in the ⏱ comment, NOT the issue body, so
  // the delta must be derived from the comment. Fetch it once; it also drives the
  // retry-idempotency guard below. Gated on `!SKIP_NETWORK`; tests inject
  // `ctx.readTimingCommentBody` to exercise both paths offline.
  let timingBody = '';
  let timingRead = { status: 'absent', body: '', error: null };
  const { readTimingCommentBody, bodyOf } = await import('../gh-timing-comment.mjs');
  const readTiming = ctx.readTimingCommentBody || (SKIP_NETWORK ? null : readTimingCommentBody);
  if (readTiming && closeIssueNum) {
    try {
      timingRead = await readTiming({
        issueNumber: closeIssueNum,
        repo: cfg.repo,
        timeoutMs: GH_API_TIMEOUT_MS,
      });
      timingBody = bodyOf(timingRead);
    } catch (err) {
      process.stderr.write(`⚠ timing-comment read for close pair failed: ${err.message}\n`);
    }
  }
  let approvalReconciled = false;
  if (hasApprovalMarker && readTiming) {
    const reconcile = ctx.reconcileReviewApprovedTiming || reconcileReviewApprovedTiming;
    await reconcile({
      issueNumber: closeIssueNum,
      repo: cfg.repo,
      issueBody,
      wordMarker: lastWordMarker ?? 0,
      fullWordMarker: lastFullWordMarker ?? 0,
      readTimingCommentBody: async () => timingRead,
      postTimingEvent: async ({ row }) => postRequiredTiming(row, 'review:approved'),
    });
    approvalReconciled = true;
  }
  const delta = deriveStateMoveDelta(timingBody, ts);
  // #540 — emit in canonical order (`review:approved → issue:wrap`), both sharing
  // `ts`. The approval row carries the real review→close active/idle delta; the
  // wrap row is the zero-delta paired half.
  const { buildReviewToDoneClosePair } = await import('../gh-timing-comment.mjs');
  const [reviewApprovedRow, issueWrapRow] = buildReviewToDoneClosePair({
    ts,
    activeSec: delta.activeSec,
    idleSec: delta.idleSec,
    // #475 AC1 — carried-forward durable marker (timing flushed at Review; close audit row)
    wordMarker: lastWordMarker ?? 0,
    fullWordMarker: lastFullWordMarker ?? 0,
  });
  const { pendingClosePairState } = await import('../timing-rollup.mjs');
  const pending = pendingClosePairState(timingBody);
  if (
    !pending.reviewApproved &&
    !approvalReconciled &&
    shouldEmitReviewApprovedRow({ hasApprovalMarker, reviewGateBypassed })
  ) {
    await postRequiredTiming(reviewApprovedRow, 'review:approved');
  }
  if (!pending.issueWrap) {
    await postRequiredTiming(issueWrapRow, 'issue:wrap');
  }
}

async function flushCloseTimingOrThrow({ closeTarget, flushQueueFor }) {
  const result = await flushQueueFor(closeTarget);
  if (result === false || result?.pending > 0 || result?.discarded > 0) {
    throw new Error(
      `terminal timing queue did not synchronize for ${closeTarget} ` +
        `(pending ${result?.pending ?? 0}, discarded ${result?.discarded ?? 0})`
    );
  }
  return result ?? { delivered: 0, pending: 0 };
}

const ESTIMATION_FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

export async function ensureCloseEstimationOutcome({ issueNumber, body, writer } = {}) {
  const readyForecastRecordId = String(body ?? '').match(ESTIMATION_FORECAST_READY_RE)?.[1] ?? null;
  const frozenForecastRecordId = readPlanApprovedForecastRecordId(body);
  if (readyForecastRecordId !== null && frozenForecastRecordId === null) {
    throw new Error('adaptive outcome requires a frozen Plan forecast');
  }
  if (
    frozenForecastRecordId !== null &&
    readyForecastRecordId !== null &&
    frozenForecastRecordId !== readyForecastRecordId
  ) {
    throw new Error('forecast lineage diverged from the frozen Plan approval');
  }
  const forecastRecordId = frozenForecastRecordId;
  const ensure = typeof writer === 'function' ? writer : writer?.ensure;
  if (typeof ensure !== 'function') {
    if (forecastRecordId === null) return { status: 'legacy-no-forecast' };
    throw new Error('estimation-outcome-writer capability is required for a v1 forecast');
  }
  const result = await ensure({ issueNumber: Number(issueNumber), forecastRecordId, body });
  if (forecastRecordId === null && result?.status === 'legacy-no-forecast') return result;
  if (!['written', 'existing'].includes(result?.status)) {
    throw new Error(`estimation outcome did not converge (status ${result?.status ?? 'missing'})`);
  }
  return result;
}

export function resolveEstimationOutcomeProjectDir({
  issueNumber,
  projectDir,
  issueWorkspaceResolver,
  requireDedicated = false,
} = {}) {
  const issueRef = `#${issueNumber}`;
  const resolved = issueWorkspaceResolver({ issueRef, projectDir });
  if (typeof resolved !== 'string' || resolved.length === 0) {
    throw new Error(`issue workspace evidence is unavailable for ${issueRef}`);
  }
  if (requireDedicated && resolved === projectDir) {
    throw new Error(
      `dedicated worktree evidence is unavailable for ${issueRef}; refusing to record the parent diff as child evidence`
    );
  }
  return resolved;
}

export async function resolvePreCloseCheckboxes({
  body,
  issueNumber,
  projectDir,
  scan,
  resolveLaneSkipProof = resolveDocsOnlyLaneSkipProof,
  proofDeps,
}) {
  const docsOnlyLaneSkipProven = await resolveLaneSkipProof({
    body,
    issueNumber,
    projectDir,
    deps: proofDeps,
  });
  return scan(body, { docsOnlyLaneSkipProven });
}

// #1490 — durable, read-back-verified supersession of a COMPLETED delivered-close
// transaction that survived a reopen, followed by atomic replacement of the active
// marker with a fresh zero-step transaction.
//
// Ordering is the whole point: evidence is persisted and re-read from the live
// comment store BEFORE the body marker is touched, so a crash between the two steps
// leaves recoverable evidence rather than an unexplained replacement. The recovery
// id is derived from the intent, so a retry after a lost response resolves to the
// same recovery instead of minting a second one.
export async function runReopenedCloseRecovery({
  closeIssueNum,
  convergeBody,
  ensureDeliveryAuthorized,
  resolvedDeliveryGateRef,
  terminalReviewAuthority,
  dispositionReader,
  inspectDirty,
  resolveWorkspaceForIssue,
  projectDir,
  cfg,
  ctx,
  mutateBody,
  closeSnapshot,
  boardState,
  // #1490 — binding OWNERSHIP, not release progress. See `validateLive`.
  resolveBindingOwnership = resolveReopenedBindingOwnership,
}) {
  const closeTarget = `#${closeIssueNum}`;

  const listDeliveryRecordComments =
    ctx.listReopenedCloseDeliveryComments ??
    (async () => {
      const { stdout } = await closePexec(
        'gh',
        ['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${closeIssueNum}/comments`],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(String(stdout || '[]')).flat();
    });
  const listComments =
    ctx.listReopenedCloseRecoveryComments ??
    (async () => {
      const { stdout } = await closePexec(
        'gh',
        ['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${closeIssueNum}/comments`],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(String(stdout || '[]')).flat();
    });
  const createComment =
    ctx.createReopenedCloseRecoveryComment ??
    (async (body) => {
      const { stdout } = await closePexec(
        'gh',
        [
          'api',
          `repos/${cfg.repo}/issues/${closeIssueNum}/comments`,
          '--method',
          'POST',
          '-f',
          `body=${body}`,
        ],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(String(stdout || '{}'));
    });

  await ensureDeliveryAuthorized();
  const gate = resolvedDeliveryGateRef();
  const newAcceptedSha = gate?.gateInput?.acceptedSha;

  // #1490 — two-phase resolution. The active transaction is read from the BODY,
  // never from a caller-supplied decision input, because on a retry after the
  // marker was replaced the active transaction is the zero-step replacement and
  // the completed original is only recoverable from durable evidence.
  const activeTransactions = readDeliveredCloseTransactions(convergeBody);
  if (activeTransactions.length !== 1) throw new Error('reopened-close-recovery:ambiguous-body');
  const activeTransaction = activeTransactions[0];
  const priorComments = await listComments();

  // #1490 item 3 — resume by transaction IDENTITY, at any valid completed-step
  // prefix. The first implementation keyed this on
  // `activeTransaction.completedSteps.length === 0`, which is only true at the
  // instant the replacement is minted. Once the saga marked even one step, a retry
  // fell into the mint branch and treated the REPLACEMENT as though it were the
  // completed original — so partial progress was unresumable by construction.
  //
  // The identity lookup is self-discriminating and needs no step-count condition:
  // on a fresh mint no durable record names the (old, completed) active
  // transaction as its replacement, so there are zero candidates; on a resume
  // there is exactly one, whatever the prefix.
  const backed = findRecoveryBackedReplacement({
    body: convergeBody,
    comments: priorComments,
    repository: cfg.repo,
    issueNumber: Number(closeIssueNum),
  });
  // Ambiguity refuses rather than silently minting a second recovery.
  if (backed.status === 'ambiguous') throw new Error('reopened-close-recovery:resume-evidence');
  if (backed.transaction === null) throw new Error('reopened-close-recovery:ambiguous-body');
  const resumeRecord = backed.record;
  // On a mint the active transaction IS the completed original; on a resume the
  // original is reconstructed from the durable record.
  const oldTransaction = resumeRecord ? oldTransactionFromRecord(resumeRecord) : activeTransaction;
  if (!oldTransaction) throw new Error('reopened-close-recovery:no-transaction');
  // The replacement's own prefix: empty on a mint, the observed steps on a resume.
  const replacementCompletedSteps = resumeRecord ? activeTransaction.completedSteps : [];
  // A replacement that already ran every step is finished. Returning it unchanged
  // keeps the retry idempotent instead of refusing (its binding is released, so
  // ownership no longer resolves) or minting a second recovery.
  if (resumeRecord && replacementCompletedSteps.length >= TERMINAL_CLOSE_STEPS.length) {
    return { body: convergeBody, transaction: activeTransaction, record: resumeRecord };
  }

  // #1490 — resolve a correlated delivery bundle for one accepted SHA using the
  // gate's own live PR inventory as the SHA-keyed selector, then the existing
  // PR-scoped parser. No new marker grammar and no broadening of
  // `delivery-records.mjs`.
  const resolveDeliveryBundle = async (acceptedSha, category) => {
    const inventory = Array.isArray(gate?.gateInput?.pullRequests)
      ? gate.gateInput.pullRequests
      : [];
    const matches = inventory.filter((pullRequest) => pullRequest?.headRefOid === acceptedSha);
    if (matches.length !== 1) throw new Error(`reopened-close-recovery:${category}`);
    const pullRequest = matches[0];
    // Normalize GitHub's raw REST comments into the exact parser shape.
    const normalized = (await listDeliveryRecordComments())
      .map((comment) => ({
        id: comment?.id == null ? '' : String(comment.id),
        body: typeof comment?.body === 'string' ? comment.body : '',
        createdAt: normalizeGitHubInstant(comment?.created_at),
      }))
      .filter((comment) => comment.id.length > 0 && comment.createdAt !== null);
    const parsed = parsedDeliveryRecords(normalized, {
      repository: cfg.repo,
      issueNumber: Number(closeIssueNum),
      prNumber: pullRequest.number,
    });
    const projected = projectDeliveryRecords(parsed);
    // Exactly one correlated live intent and its matching receipt.
    const intent = projected?.liveIntent?.record ?? null;
    const receipt = projected?.matchingReceipt?.record ?? null;
    if (!intent || !receipt) throw new Error(`reopened-close-recovery:${category}`);
    return { pullRequest, intent, receipt };
  };

  const historical = await resolveDeliveryBundle(oldTransaction.acceptedSha, 'historical-evidence');
  const currentBundle = await resolveDeliveryBundle(newAcceptedSha, 'current-evidence');

  const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
  const dirty = await inspectDirty({ cwd });
  const terminalDisposition = await dispositionReader({
    cfg,
    issueNumber: Number(closeIssueNum),
  });
  // #1490 — observe ownership explicitly instead of reading a release-progress
  // status. `cwd` is the issue's governed worktree, so a claim naming any other
  // path is not this recovery's binding.
  const bindingOwnership = resolveBindingOwnership({
    projectDir,
    issue: closeTarget,
    sessionId: (ctx.sessionId ?? currentSessionId)(),
    recordedWorktreePath: cwd,
  });

  const authorization = authorizeReopenedCloseRestart({
    repository: cfg.repo,
    issueNumber: Number(closeIssueNum),
    oldTransaction,
    newAcceptedSha,
    newReviewAuthority: terminalReviewAuthority(),
    actor: (ctx.reopenedCloseActor ?? cfg.assignee ?? '').replace(/^@/, ''),
    live: {
      boardState,
      issueClosed: closeSnapshot.issueClosed,
      stateReason: closeSnapshot.stateReason ?? null,
      terminalDisposition: terminalDisposition || null,
      dirty: dirty?.dirty ?? true,
      // #1490 — explicit ownership observation, not a release-progress status.
      bindingOwnership,
    },
    // Every value below is gate-resolved or record-parsed. Nothing is asserted,
    // and nothing is copied from a record then compared back to that same record.
    completedSteps: replacementCompletedSteps,
    evidence: {
      historical,
      current: {
        ...currentBundle,
        testReceiptSha: gate?.testReceiptSha ?? null,
        reviewApprovedSha: gate?.recoveryReviewApprovedSha ?? null,
        // The verifier's OWN output, not a value lifted from the receipt.
        verifiedDelivery: gate?.receipt?.verification?.receiptInput ?? null,
      },
    },
  });

  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: (ctx.reopenedCloseNow ?? (() => new Date().toISOString()))(),
    randomUUIDFn: ctx.randomUUIDFn ?? randomUUID,
  });

  // Durable evidence is resolved through the strict codec, never by substring.
  // A retry reuses the DURABLE record — including its replacement UUID — so a lost
  // response cannot mint a second recovery.
  const resolved = resolveReopenedCloseRecovery({
    authorization,
    comments: priorComments,
    record: resumeRecord ?? record,
  });
  let durableRecord = resolved.record;
  if (!durableRecord) {
    await createComment(renderReopenedCloseRecoveryComment(record));
    const readBack = resolveReopenedCloseRecovery({
      authorization,
      comments: await listComments(),
      record,
    });
    if (readBack.status !== 'present') {
      throw new Error('reopened-close-recovery:evidence-read-back');
    }
    durableRecord = readBack.record;
  }

  // Interruption point two: the body may already carry the replacement from a
  // previous attempt. Classify against durable evidence and resume rather than
  // re-running a completed step.
  const progress = classifyRecoveryProgress(convergeBody, authorization, durableRecord);
  if (progress.phase === 'body-replaced') {
    return { body: convergeBody, transaction: progress.transaction, record: durableRecord };
  }

  if (typeof mutateBody !== 'function') throw new Error('reopened-close-recovery:body-write');
  const mutation = await mutateBody({
    issueNumber: Number(closeIssueNum),
    repo: cfg.repo,
    mutate: (base) =>
      replaceCompletedDeliveredCloseTransaction(base, authorization, durableRecord).body,
  });
  if (typeof mutation?.body !== 'string') throw new Error('reopened-close-recovery:body-write');
  // Verify the ACTUAL mutation read-back, not the captured pre-mutation body.
  const applied = classifyRecoveryProgress(mutation.body, authorization, durableRecord);
  if (applied.phase !== 'body-replaced') {
    throw new Error('reopened-close-recovery:mutation-readback');
  }
  return { body: mutation.body, transaction: applied.transaction, record: durableRecord };
}

export async function verbClose(ctx) {
  const convergenceTailProfile = resolveTailProfile(
    ctx.convergenceTailProfile === undefined ? 'task-owner' : ctx.convergenceTailProfile
  ).name;
  // #561 — verbClose reads its collaborators from the grouped capability
  // objects assembled by buildContext (the narrow dependency interface) rather
  // than from a flat 18-member destructure. Each `?? ctx` fallback keeps the
  // verb runnable against a flat ctx (back-compat) and lets a fixture supply
  // only the capabilities a given code path actually touches.
  const projectConfig = ctx.projectConfig ?? ctx;
  const timingRecorder = ctx.timingRecorder ?? ctx;
  const stateRunner = ctx.stateRunner ?? ctx;
  const githubClient = ctx.githubClient ?? ctx;
  const issueBodyMutator = ctx.issueBodyMutator;
  const { cfg, statePath, projectDir, SKIP_NETWORK, pexec, uncheckedPreCloseCheckboxes, nowIso } =
    projectConfig;
  const { rest } = ctx;
  const { drainQueueIfAny, flushAndForgetQueueFor, safePostTiming } = timingRecorder;
  let queueDrained = false;
  const drainQueueOnce = async () => {
    if (queueDrained) return;
    await drainQueueIfAny();
    queueDrained = true;
  };
  const flushQueueFor =
    timingRecorder.flushQueueFor ??
    flushAndForgetQueueFor ??
    (async () => ({ delivered: 0, pending: 0 }));
  const { runMoveState, runMoveStateDone, runLogIssueTime } = stateRunner;
  const {
    fetchSubIssueBoardSnapshot,
    fetchSubIssues,
    getIssueBoardState,
    getIssueCloseSnapshot,
    getIssueClosedState,
  } = githubClient;
  const mutateBody = issueBodyMutator?.mutate;
  const loadCurrentSession = ctx.loadCurrentSession || (() => loadSession(currentSessionId()));
  const loadCurrentProjectConfig = ctx.loadRawProjectConfig || rawProjectConfig;
  const dispositionWriter = ctx.writeTerminalDisposition || writeTerminalDisposition;
  const dispositionReader = ctx.readTerminalDisposition || readTerminalDisposition;
  const closeLabelsReader = ctx.readCloseLabels || readCloseLabels;
  const bindingReleaseInspector =
    ctx.inspectTerminalIssueBindingRelease || inspectTerminalIssueBindingRelease;
  const inspectDirty = ctx.checkDirtyWorkspace || checkDirty;
  const bindingReleaseResumer =
    ctx.resumeTerminalIssueBindingRelease || resumeTerminalIssueBindingRelease;
  const writeDeliveredOrRefuse = async ({ issueNumber, targetRef }) => {
    try {
      await dispositionWriter({
        cfg,
        issueNumber,
        disposition: 'Delivered',
      });
      return true;
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${targetRef}: ${err.message}\n` +
          `   Issue left OPEN — run \`node scripts/gh/init-repair.mjs\` and retry.`
      );
      process.exitCode = 1;
      return false;
    }
  };
  // #753 — the lifecycle-box reconcile is invoked from BOTH the converge/no-op
  // fast-path and the full close pipeline, through one seam so a fixture can
  // observe it and the two call sites can never drift apart. Falls back to the
  // module helper when the ctx does not inject one (production).
  const reconcileLifecycleBoxes = ctx.tickLifecycleOnClose || tickLifecycleOnClose;
  const initialState = loadState(statePath);
  const target = rest.find((a) => /^#\d+$/.test(a));
  let s = initialState;

  const closeTarget = target || s.active || '';
  const closeIssueNum = closeTarget.replace(/^#/, '');
  const v2Dispatch = await dispatchEvidenceV2Close({
    ctx,
    issueNumber: closeIssueNum,
    cfg,
    pexec,
    state: s,
    skipNetwork: SKIP_NETWORK,
  });
  if (v2Dispatch.handled) return v2Dispatch.result;
  const force = rest.includes('--force');
  // #708 — `--repair` forces the full atomic close pipeline even when the board
  // is already Done / the issue already CLOSED (e.g. a PR closing-reference
  // auto-closed it out-of-band), so the timing flush, lifecycle-box ticking, and
  // audit rows that the noop/close-issue short-circuits skip get replayed.
  const repair = rest.includes('--repair');
  const restartStaleTransaction = rest.includes('--restart-stale-transaction');
  if (
    restartStaleTransaction &&
    (force || repair || rest.includes('--as') || rest.includes('--answer'))
  ) {
    throw new Error('delivered-close-supersession:incompatible-flags');
  }
  // #1490 — recovery for a COMPLETED close transaction that survived a reopen.
  // Deliberately a separate flag: `--restart-stale-transaction` covers reversible
  // PRE-terminal progress and must not be broadened to cover a finished close.
  const restartReopenedTransaction = rest.includes('--restart-reopened-transaction');
  if (
    restartReopenedTransaction &&
    (force ||
      repair ||
      restartStaleTransaction ||
      rest.includes('--as') ||
      rest.includes('--answer'))
  ) {
    throw new Error('reopened-close-recovery:incompatible-flags');
  }
  if (!closeTarget) {
    await drainQueueOnce();
    console.log('no active task');
    return;
  }

  const explicitOf = parseCloseOfAssertion(rest);

  // #761 — disposition close-lane. `close --as duplicate --of <M>` /
  // `close --as not-planned` close the issue WITHOUT the Done DoD/commit-trace
  // gate: the issue is un-tracked from the board (it does NOT land in Done) and
  // an `aitm-closed-as` audit marker + comment record the disposition. Branch
  // and return here, before any shared gate state below is read.
  const asIdx = rest.indexOf('--as');
  if (asIdx !== -1) {
    const disposition = rest[asIdx + 1];
    const parsedDisposition = parseDisposition({ reason: disposition, of: explicitOf });
    if (parsedDisposition.key === 'incorporated') {
      const result = await runCloseIncorporatedLane({
        ctx,
        issueNumber: Number(closeIssueNum),
        convergenceIssue: explicitOf,
      });
      try {
        clearActive(statePath);
      } catch {
        /* terminal binding ledger remains authoritative */
      }
      console.log(
        `Closed ${closeTarget} as Incorporated under #${result.convergenceIssue} ` +
          `(ledger ${result.ledgerId}, record ${result.recordId}).`
      );
      return result;
    }
    await drainQueueOnce();
    const result = await runDispose({
      issueNumber: closeIssueNum,
      reason: parsedDisposition.key,
      of: parsedDisposition.of,
      repo: cfg.repo,
      projectId: cfg.projectId,
      cfg,
      deps: {
        mutateIssueBody: mutateBody,
        pexec: (bin, argv) => pexec(bin, argv, { timeout: GH_API_TIMEOUT_MS }),
        postComment: ({ issueNumber, repo, body }) =>
          pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
            timeout: GH_API_TIMEOUT_MS,
          }),
        flushTiming: (n) =>
          flushAndForgetQueueFor ? flushAndForgetQueueFor(`#${n}`) : Promise.resolve(),
        now: nowIso,
        warn: (msg) => console.error(`[task-tracker] warn: ${msg}`),
      },
    });
    releaseClosedBinding({ ctx, projectDir, issue: closeTarget });
    // Clear local active-task state so a subsequent bind is clean.
    try {
      clearActive(statePath);
    } catch {
      /* best-effort; a residual active pointer is harmless */
    }
    console.log(
      `Closed ${closeTarget} as ${result.reason}` +
        (result.of ? ` (duplicate of ${result.of})` : '') +
        ` — retained in Done, stateReason=${result.stateReason}.`
    );
    return;
  }

  // Incident-epic terminal authority is additive to the native child guard.
  // Discover it from the target's owner record before local state, timing,
  // board, issue, label, or binding mutation. A bare ordinary close is allowed
  // only when no owner exists; an explicit --of is an exact assertion.
  if (Number(closeIssueNum) === 939 || explicitOf !== null) {
    await (ctx.authorizeIncidentEpicCloseForCommand || authorizeIncidentEpicCloseForCommand)({
      ctx,
      issueNumber: Number(closeIssueNum),
      explicitConvergenceIssue: explicitOf,
    });
  }

  // #208 — bind-mismatch check moved to shared preflight (dispatcher).
  let explicitBindingPending = false;
  if (!s.active && target) {
    s = {
      ...s,
      active: target,
      lastActive: target,
      entryStartTs: nowIso(),
      wordsAtEntryStart: 0,
    };
    explicitBindingPending = true;
  }
  const persistExplicitBinding = () => {
    if (!explicitBindingPending) return;
    saveState(s, statePath);
    explicitBindingPending = false;
  };

  const configuredReviewToDoneGate = resolveGate('reviewToDone', {
    session: loadCurrentSession(),
    projectConfig: loadCurrentProjectConfig(),
  });
  const configuredReviewAuthority = configuredReviewToDoneGate ? 'human-gate' : 'gate-bypassed';
  let resolvedReviewAuthorization = null;
  let resolvedDeliveryGate = null;
  let closeLifecycleEvidenceLoaded = false;
  let cachedCloseLifecycleEvidence = null;
  const loadCloseLifecycleEvidence = async (body) => {
    if (closeLifecycleEvidenceLoaded) return cachedCloseLifecycleEvidence;
    cachedCloseLifecycleEvidence = await resolveCloseLifecycleEvidence({
      body,
      issueNumber: closeIssueNum,
      repository: cfg.repo,
      projectDir,
      deps: {
        locateAuthoritySource: ctx.locateAuthoritySource,
        getHeadSha: ctx.getHeadSha,
        resolveLifecycleEvidence: ctx.resolveLifecycleEvidence,
        graphql: ctx.graphql,
        readContractRecord: ctx.readContractRecord,
        listIssueRecords: ctx.listIssueRecords,
      },
    });
    closeLifecycleEvidenceLoaded = true;
    return cachedCloseLifecycleEvidence;
  };
  const terminalReviewAuthority = () => {
    if (resolvedReviewAuthorization?.mode === 'human') return 'human-gate';
    if (resolvedReviewAuthorization?.mode === 'full-auto') return 'gate-bypassed';
    return configuredReviewAuthority;
  };
  const terminalReviewGateBypassed = () => terminalReviewAuthority() === 'gate-bypassed';

  // #939 — resolve the receipt gate lazily after non-terminal convergence
  // inspection, but before any path performs a new terminal mutation.
  const ensureDeliveryAuthorized = async ({ durableTransaction = null } = {}) => {
    if (SKIP_NETWORK || !closeIssueNum) return resolvedDeliveryGate;
    if (resolvedDeliveryGate) return resolvedDeliveryGate;
    const deliveryBody = ctx.loadCloseDeliveryBody
      ? await ctx.loadCloseDeliveryBody({
          issueNumber: Number(closeIssueNum),
          repository: cfg.repo,
        })
      : await (async () => {
          const { stdout } = await pexec(
            'gh',
            ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
            { timeout: GH_API_TIMEOUT_MS }
          );
          return JSON.parse(String(stdout || '{}')).body ?? '';
        })();
    const lifecycleEvidence = await loadCloseLifecycleEvidence(deliveryBody);
    const gateInput = await (ctx.loadCloseDeliveryGateInput || loadCloseDeliveryGateInput)({
      issueNumber: Number(closeIssueNum),
      cfg,
      projectDir,
      pexec,
      body: deliveryBody,
      lifecycleEvidence,
      ctx,
    });
    const approval = parseReviewApprovedMarker(deliveryBody);
    const directoryLane = lifecycleEvidence !== null;
    if (durableTransaction && durableTransaction.acceptedSha !== gateInput.acceptedSha) {
      throw new Error('delivered-close-transaction-accepted-sha-mismatch');
    }
    const authorization = durableTransaction
      ? resolvedReviewAuthorization
      : (ctx.resolveReviewAuthorization || resolveReviewAuthorization)({
          session: loadCurrentSession(),
          projectConfig: loadCurrentProjectConfig(),
          acceptedHeadSha: gateInput.acceptedSha,
          humanApprovalEvidence:
            directoryLane && hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'human' })
              ? {
                  accepted: true,
                  approvedSha: lifecycleEvidence.expectedSha,
                  source: 'directory-human-evidence',
                }
              : !directoryLane && approval && !approval.fullAuto
                ? { accepted: true, approvedSha: approval.approvedSha }
                : null,
          fullAutoApprovalEvidence:
            directoryLane &&
            hasAcceptedApprovalEvidence(lifecycleEvidence, { provenance: 'full-auto' })
              ? { accepted: true, approvedSha: lifecycleEvidence.expectedSha }
              : !directoryLane && approval?.fullAuto
                ? { accepted: true, approvedSha: approval.approvedSha }
                : null,
        });
    if (authorization.mode === 'missing') {
      throw new Error('review-authorization-missing');
    }
    const receiptGate = ctx.requireDeliveryReceipt || requireDeliveryReceipt;
    const receipt = receiptGate(gateInput);
    const freshReceiptVerifier = ctx.verifyCloseDeliveryReceipt || verifyCloseDeliveryReceipt;
    // #1490 — capture the EXACT values this gate validates. The reopened-close
    // recovery authorizes on them, and must never substitute its own defaults for
    // evidence the gate actually resolved.
    const resolvedTestReceiptSha =
      parseVerificationReceipt(deliveryBody, 'test')?.commitSha ?? null;
    const resolvedAcceptedReviewSha =
      lifecycleEvidence?.expectedSha ??
      parseVerificationReceipt(deliveryBody, 'review')?.commitSha ??
      gateInput.acceptedSha;
    // #1490 — the reopened-close recovery must not accept an accepted-SHA
    // substitution as review evidence. Resolve the Review SHA from the authority
    // actually accepted: the directory lane's expected SHA, or the exact body
    // marker's approved SHA. Never a fallback.
    const recoveryReviewApprovedSha =
      lifecycleEvidence?.expectedSha ?? approval?.approvedSha ?? null;
    const freshReceipt = await freshReceiptVerifier({
      gateInput,
      receiptGate: receipt,
      testReceiptSha: resolvedTestReceiptSha,
      acceptedReviewSha: resolvedAcceptedReviewSha,
      deps: {
        fetchOriginTrunk:
          ctx.fetchOriginTrunk ??
          (async ({ remote, branch }) => {
            await pexec('git', ['fetch', remote, branch], {
              cwd: projectDir,
              timeout: GIT_TIMEOUT_MS,
            });
          }),
        isAncestor:
          ctx.isAncestor ??
          (async ({ ancestor, descendant }) => {
            try {
              await pexec('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
                cwd: projectDir,
                timeout: GIT_TIMEOUT_MS,
              });
              return true;
            } catch (error) {
              if (Number(error?.code) === 1) return false;
              throw error;
            }
          }),
        inspectMergeCommit:
          ctx.inspectMergeCommit ??
          (({ mergeCommitSha }) => inspectCloseMergeCommit({ pexec, projectDir, mergeCommitSha })),
        attributingCommits:
          ctx.attributingCommits ??
          ((issueNumber, options) =>
            defaultAttributingCommits(issueNumber, { cwd: projectDir, ...options })),
      },
    });
    resolvedReviewAuthorization = authorization;
    resolvedDeliveryGate = {
      authorization,
      gateInput,
      receipt: freshReceipt,
      // #1490 — concrete, gate-resolved evidence for the reopened-close recovery.
      testReceiptSha: resolvedTestReceiptSha,
      acceptedReviewSha: resolvedAcceptedReviewSha,
      recoveryReviewApprovedSha,
      deliveryBody,
    };
    return resolvedDeliveryGate;
  };
  const refuseDeliveryGate = async (options) => {
    try {
      await ensureDeliveryAuthorized(options);
      return false;
    } catch (error) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: ${error.message}. ` +
          'Run `/task deliver` until a verified exact-head receipt exists, then retry.'
      );
      process.exitCode = 1;
      return true;
    }
  };

  const outcomeRuntimeFactory = ctx.createEstimationOutcomeWriter ?? createEstimationOutcomeRuntime;
  const issueWorkspaceResolver =
    ctx.resolveIssueWorkspace ??
    (({ issueRef, projectDir: invokingDir }) =>
      resolveProjectDir({ issue: issueRef, deps: { invokingDir } }));
  const outcomeWriterForIssue = (
    issueNumber,
    { requireDedicated = false, resolveVerificationSha } = {}
  ) => {
    if (ctx.estimationOutcomeWriter) return ctx.estimationOutcomeWriter;
    if (
      typeof ctx.createEstimationOutcomeWriter !== 'function' &&
      (!Number.isInteger(cfg.estimationRubricIssue) || cfg.estimationRubricIssue <= 0)
    ) {
      return null;
    }
    const outcomeProjectDir = resolveEstimationOutcomeProjectDir({
      issueNumber,
      projectDir,
      issueWorkspaceResolver,
      requireDedicated,
    });
    return outcomeRuntimeFactory({
      cfg,
      projectDir: outcomeProjectDir,
      ...(resolveVerificationSha === undefined ? {} : { resolveVerificationSha }),
    });
  };
  const estimationOutcomeWriter = outcomeWriterForIssue(closeIssueNum, {
    resolveVerificationSha: ({ issueNumber }) => {
      if (Number(issueNumber) !== Number(closeIssueNum)) {
        throw new TypeError('close-estimation-verification-sha:issue-mismatch');
      }
      const acceptedSha = resolvedDeliveryGate?.gateInput?.acceptedSha;
      if (typeof acceptedSha !== 'string' || !/^[0-9a-f]{40}$/.test(acceptedSha)) {
        throw new TypeError('close-estimation-verification-sha:delivery-authority-missing');
      }
      return acceptedSha;
    },
  });

  const ensureConvergenceOutcome = async ({ body, targetRef = closeTarget } = {}) => {
    let outcomeBody = String(body ?? '');
    try {
      if (estimationOutcomeWriter && outcomeBody.length === 0) {
        const { stdout } = await pexec(
          'gh',
          ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
          { timeout: GH_API_TIMEOUT_MS }
        );
        outcomeBody = JSON.parse(stdout).body ?? '';
      }
      await ensureCloseEstimationOutcome({
        issueNumber: closeIssueNum,
        body: outcomeBody,
        writer: estimationOutcomeWriter,
      });
      return true;
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to finalize ${targetRef}: ${err.message}. ` +
          'Completion outcome evidence did not converge; local state remains active for retry.'
      );
      process.exitCode = 1;
      return false;
    }
  };

  // #425 / #925 — converge the independent GitHub issue and project-board
  // signals. The additive close snapshot lets a CLOSED + not-Done issue be
  // classified as delivered, dead, or unauthorized before any mutation.
  let resumeDeliveredCloseTransaction = null;
  let restartedDeliveredCloseTransaction = false;
  let resumeMarkerlessOpenDone = false;
  let resumeConvergeBody = null;
  if (!SKIP_NETWORK && closeIssueNum) {
    const hasExpandedCloseSnapshot = typeof getIssueCloseSnapshot === 'function';
    const [boardState, closeSnapshot] = await Promise.all([
      getIssueBoardState(closeIssueNum),
      hasExpandedCloseSnapshot
        ? getIssueCloseSnapshot(closeIssueNum)
        : Promise.resolve(
            getIssueClosedState
              ? getIssueClosedState(closeIssueNum).then((issueClosed) => ({
                  issueClosed,
                  stateReason: undefined,
                }))
              : { issueClosed: null, stateReason: undefined }
          ),
    ]);
    const decisionInput = {
      boardState,
      issueClosed: closeSnapshot.issueClosed,
      repair,
    };
    let convergeBody = ctx.closeBody ?? '';
    let integrity = { allTicked: false, unticked: [], childrenDone: true };
    let fullAuto = false;
    let recovery = null;
    let authoritativeDoneBodyInspected = false;
    const configuredFullAuto = configuredReviewAuthority === 'gate-bypassed';
    const readConvergenceBody = async () => {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(stdout).body ?? '';
    };
    const failInspection = (failedStep, error, message) => {
      const detail = error?.message || String(error);
      console.error(`${message}: ${detail}\nNo convergence mutation was attempted; retry later.`);
      process.exitCode = 1;
      return {
        action: 'inspect',
        status: 'failed',
        failedStep,
        error: detail,
      };
    };

    let decision;
    if (repair || !hasExpandedCloseSnapshot) {
      // Explicit repair is the highest authority and runs the existing full
      // pipeline without integrity inspection. Legacy callers retain their
      // pre-#925 two-signal decision contract.
      decision = decideCloseConvergence(decisionInput);
    } else if (closeSnapshot.issueClosed === true) {
      Object.assign(decisionInput, {
        stateReason: closeSnapshot.stateReason,
      });

      if (closeSnapshot.stateReason !== 'completed') {
        // A close-for-cause is dead before any issue-body or child read.
        decision = decideCloseConvergence(decisionInput);
      } else if (boardState === 'done') {
        // Completed + Done is already authoritative, but a durable terminal
        // transaction can still have a pending suffix. Its body is therefore
        // required authority rather than best-effort housekeeping.
        fullAuto = configuredFullAuto;
        authoritativeDoneBodyInspected = true;
        let closeTransactions = [];
        try {
          convergeBody = await readConvergenceBody();
          const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
          recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
          Object.assign(decisionInput, {
            recoveryPhase: inspectedRecovery?.phase ?? null,
          });
          closeTransactions = readDeliveredCloseTransactions(convergeBody);
        } catch (error) {
          if (/close-convergence:.*terminal-transaction/.test(error?.message || '')) {
            return failInspection(
              'readDeliveredCloseTransaction',
              error,
              `${closeTarget} has invalid delivered-close transaction authority`
            );
          }
          return failInspection(
            'readIssueBody',
            error,
            `${closeTarget} is closed and Done but its body could not be read for transaction inspection`
          );
        }
        if (closeTransactions.length > 0) {
          let terminalDisposition;
          try {
            terminalDisposition = await dispositionReader({
              cfg,
              issueNumber: Number(closeIssueNum),
            });
          } catch (error) {
            return failInspection(
              'readTerminalDisposition',
              error,
              `${closeTarget} terminal disposition could not be read after transaction discovery`
            );
          }
          Object.assign(decisionInput, {
            terminalDisposition,
            expectedIssueNumber: Number(closeIssueNum),
            expectedAcceptedSha: closeTransactions[0].acceptedSha,
            closeTransactions,
          });
        }
        decision = decideCloseConvergence(decisionInput);
      } else {
        // Only completed, closed, not-Done issues require strict integrity.
        try {
          convergeBody = await readConvergenceBody();
        } catch (error) {
          return failInspection(
            'readIssueBody',
            error,
            `${closeTarget} is closed on GitHub but its body could not be read for integrity checking`
          );
        }
        const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
        recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
        Object.assign(decisionInput, {
          recoveryPhase: inspectedRecovery?.phase ?? null,
        });

        let closeTransactions;
        try {
          closeTransactions = readDeliveredCloseTransactions(convergeBody);
          if (closeTransactions.length > 0) {
            const terminalDisposition = await dispositionReader({
              cfg,
              issueNumber: Number(closeIssueNum),
            });
            Object.assign(decisionInput, {
              terminalDisposition,
              expectedIssueNumber: Number(closeIssueNum),
              expectedAcceptedSha: closeTransactions[0].acceptedSha,
              closeTransactions,
            });
          }
        } catch (error) {
          return failInspection(
            error?.message?.includes('terminal-transaction')
              ? 'readDeliveredCloseTransaction'
              : 'readTerminalDisposition',
            error,
            `${closeTarget} terminal transaction authority could not be inspected`
          );
        }

        if (closeTransactions?.length > 0) {
          decision = decideCloseConvergence(decisionInput);
        } else if (recovery) {
          // A durable pending transaction has already established recovery
          // authority. Resume it before unrelated child inventory can fail.
          decision = decideCloseConvergence(decisionInput);
        } else {
          if (typeof fetchSubIssueBoardSnapshot !== 'function') {
            return failInspection(
              'fetchSubIssueBoardSnapshot',
              new Error('strict child snapshot capability is unavailable'),
              `${closeTarget} child inventory is unknown`
            );
          }
          const childSnapshot = await fetchSubIssueBoardSnapshot(closeIssueNum);
          if (childSnapshot?.status !== 'ok') {
            return failInspection(
              'fetchSubIssueBoardSnapshot',
              new Error(childSnapshot?.error || 'strict child snapshot returned unknown'),
              `${closeTarget} child inventory is unknown`
            );
          }

          if (await refuseDeliveryGate()) return;
          fullAuto = terminalReviewGateBypassed();
          integrity = deriveClosedIssueIntegrity({
            body: convergeBody,
            fullAuto,
            childBoardStates: childSnapshot.children.map(({ number, boardState: childState }) => ({
              number,
              state: childState,
            })),
          });
          Object.assign(decisionInput, {
            nonLifecycleBoxesAllTicked: integrity.allTicked,
            fullAuto,
          });
          decision = decideCloseConvergence(decisionInput);
        }
      }
    } else if (closeSnapshot.issueClosed === false) {
      // Reopen is an intermediate recovery phase, not evidence that the
      // transaction disappeared. Read the protected marker before allowing
      // normal open-state policy to proceed.
      try {
        convergeBody = await readConvergenceBody();
      } catch (error) {
        return failInspection(
          'readIssueBody',
          error,
          `${closeTarget} is open but its body could not be read for recovery inspection`
        );
      }
      const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
      recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
      Object.assign(decisionInput, {
        recoveryPhase: inspectedRecovery?.phase ?? null,
      });
      try {
        const closeTransactions = readDeliveredCloseTransactions(convergeBody);
        if (closeTransactions.length > 0) {
          const terminalDisposition = await dispositionReader({
            cfg,
            issueNumber: Number(closeIssueNum),
          });
          Object.assign(decisionInput, {
            terminalDisposition,
            expectedIssueNumber: Number(closeIssueNum),
            expectedAcceptedSha: closeTransactions[0].acceptedSha,
            closeTransactions,
          });
        }
      } catch (error) {
        return failInspection(
          'readDeliveredCloseTransaction',
          error,
          `${closeTarget} has invalid delivered-close transaction authority`
        );
      }
      // #1490 — a COMPLETED close transaction that survived a reopen. Without the
      // explicit flag this falls through to the existing `terminal-state-conflict`
      // refusal, which stays the default. With it, supersede the completed
      // transaction (durable evidence first, read-back verified) and replace the
      // active marker with a fresh zero-step transaction so the normal saga runs.
      if (restartReopenedTransaction) {
        try {
          const recovered = await runReopenedCloseRecovery({
            closeTarget,
            closeIssueNum,
            convergeBody,
            ensureDeliveryAuthorized,
            resolvedDeliveryGateRef: () => resolvedDeliveryGate,
            terminalReviewAuthority,
            dispositionReader,
            inspectDirty,
            resolveWorkspaceForIssue,
            projectDir,
            cfg,
            ctx,
            mutateBody,
            closeSnapshot,
            boardState,
          });
          convergeBody = recovered.body;
          Object.assign(decisionInput, {
            expectedAcceptedSha: recovered.transaction.acceptedSha,
            closeTransactions: [recovered.transaction],
          });
        } catch (error) {
          return failInspection(
            'authorizeReopenedCloseRestart',
            error,
            `${closeTarget} could not recover its reopened delivered-close transaction`
          );
        }
      }
      decision = decideCloseConvergence(decisionInput);
    } else {
      decision = decideCloseConvergence(decisionInput);
    }

    if (restartStaleTransaction && decision.action !== 'resume-delivered-close') {
      return failInspection(
        'authorizeDeliveredCloseRestart',
        new Error('delivered-close-supersession:no-stale-transaction'),
        `${closeTarget} does not have a restartable Delivered close transaction`
      );
    }

    if (restartStaleTransaction && decision.action === 'resume-delivered-close') {
      try {
        const activeTransaction = decisionInput.closeTransactions[0];
        const supersessionDeps = {
          listComments:
            ctx.listDeliveredCloseSupersessionComments ??
            (async () => {
              const { stdout } = await pexec(
                'gh',
                [
                  'api',
                  '--paginate',
                  '--slurp',
                  `repos/${cfg.repo}/issues/${closeIssueNum}/comments`,
                ],
                { timeout: GH_API_TIMEOUT_MS }
              );
              return JSON.parse(String(stdout || '[]')).flat();
            }),
          createComment:
            ctx.createDeliveredCloseSupersessionComment ??
            (async (body) => {
              const { stdout } = await pexec(
                'gh',
                [
                  'api',
                  `repos/${cfg.repo}/issues/${closeIssueNum}/comments`,
                  '--method',
                  'POST',
                  '-f',
                  `body=${body}`,
                ],
                { timeout: GH_API_TIMEOUT_MS }
              );
              return JSON.parse(String(stdout || '{}'));
            }),
          readComment:
            ctx.readDeliveredCloseSupersessionComment ??
            (async (id) => {
              const { stdout } = await pexec(
                'gh',
                ['api', `repos/${cfg.repo}/issues/comments/${id}`],
                { timeout: GH_API_TIMEOUT_MS }
              );
              return JSON.parse(String(stdout || '{}'));
            }),
          randomUUIDFn: ctx.randomUUIDFn ?? randomUUID,
        };
        await ensureDeliveryAuthorized();
        const comments = await supersessionDeps.listComments();
        let oldTransaction = activeTransaction;
        if (
          activeTransaction.acceptedSha === resolvedDeliveryGate.gateInput.acceptedSha &&
          activeTransaction.completedSteps.length === 0
        ) {
          const replacementEvidence = comments
            .map((comment) =>
              parseDeliveredCloseSupersessionComment(comment, {
                repository: cfg.repo,
                issueNumber: Number(closeIssueNum),
              })
            )
            .filter(
              (evidence) =>
                evidence?.record.replacementTransactionId === activeTransaction.transactionId
            );
          if (replacementEvidence.length !== 1) {
            throw new Error('delivered-close-supersession:replacement-evidence');
          }
          const record = replacementEvidence[0].record;
          if (
            record.newAcceptedSha !== activeTransaction.acceptedSha ||
            record.newReviewAuthority !== activeTransaction.reviewAuthority
          ) {
            throw new Error('delivered-close-supersession:replacement-evidence');
          }
          oldTransaction = {
            schema: 'aitm.delivered-close/v1',
            transactionId: record.oldTransactionId,
            issueNumber: record.issueNumber,
            acceptedSha: record.oldAcceptedSha,
            reviewAuthority: record.newReviewAuthority,
            completedSteps: [...record.completedSteps],
          };
        }
        const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
        const dirty = await inspectDirty({ cwd });
        if (!dirty || dirty.dirty !== false) {
          throw new Error('delivered-close-supersession:dirty-worktree');
        }
        const [terminalDisposition, labels, binding] = await Promise.all([
          dispositionReader({ cfg, issueNumber: Number(closeIssueNum) }),
          closeLabelsReader({ pexec, cfg, issueNum: closeIssueNum }),
          bindingReleaseInspector({ projectDir, issue: closeTarget }),
        ]);
        const authorization = authorizeDeliveredCloseRestart({
          repository: cfg.repo,
          issueNumber: Number(closeIssueNum),
          oldTransaction,
          newAcceptedSha: resolvedDeliveryGate.gateInput.acceptedSha,
          newReviewAuthority: terminalReviewAuthority(),
          live: {
            boardState,
            issueClosed: closeSnapshot.issueClosed,
            terminalDisposition: terminalDisposition || null,
            labels,
            bindingStatus: binding?.status,
          },
        });
        const evidence = await ensureDeliveredCloseSupersession({
          authorization,
          deps: { ...supersessionDeps, listComments: async () => comments },
        });
        if (typeof mutateBody !== 'function') {
          throw new Error('delivered-close-supersession:body-write');
        }
        const mutation = await mutateBody({
          issueNumber: Number(closeIssueNum),
          repo: cfg.repo,
          mutate: (base) =>
            replaceStaleDeliveredCloseTransaction(base, authorization, evidence.record).body,
        });
        if (mutation?.status !== 'ok' || typeof mutation.body !== 'string') {
          throw new Error('delivered-close-supersession:body-write');
        }
        const replaced = replaceStaleDeliveredCloseTransaction(
          mutation.body,
          authorization,
          evidence.record
        );
        if (replaced.status !== 'already-replaced') {
          throw new Error('delivered-close-supersession:body-readback');
        }
        resumeDeliveredCloseTransaction = replaced.transaction;
        resumeConvergeBody = mutation.body;
        convergeBody = mutation.body;
        restartedDeliveredCloseTransaction = true;
      } catch (error) {
        return failInspection(
          'restartDeliveredCloseTransaction',
          error,
          `${closeTarget} stale Delivered close transaction could not be restarted`
        );
      }
    }

    if (decision.action === 'close-issue') {
      resumeMarkerlessOpenDone = true;
      resumeConvergeBody = convergeBody;
    }

    if (decision.action === 'resume-delivered-close') {
      if (!restartedDeliveredCloseTransaction) {
        resumeDeliveredCloseTransaction = decisionInput.closeTransactions[0];
        resumeConvergeBody = convergeBody;
        resolvedReviewAuthorization = {
          mode:
            resumeDeliveredCloseTransaction.reviewAuthority === 'human-gate'
              ? 'human'
              : 'full-auto',
          standing: true,
          source: 'delivered-close-transaction',
        };
      }
    }

    if (decision.action === 'already-closed') {
      console.log(`${closeTarget} is already fully closed; no terminal writes were repeated.`);
      return decision;
    }

    if (['dead', 'finalize', 'aberration', 'noop'].includes(decision.action)) {
      if (['finalize', 'noop'].includes(decision.action) && (await refuseDeliveryGate())) return;
      if (['finalize', 'noop'].includes(decision.action)) {
        fullAuto = terminalReviewGateBypassed();
      }
      persistExplicitBinding();
      await drainQueueOnce();
      const convergence = await runClosedIssueConvergence(
        {
          decision,
          issueNumber: closeIssueNum,
          issueClosed: closeSnapshot.issueClosed,
          boardState,
          stateReason: recovery?.stateReason ?? closeSnapshot.stateReason,
          unticked: recovery?.unticked ?? integrity.unticked,
          actor: recovery?.actor ?? 'unknown',
          ts: recovery?.ts ?? nowIso(),
          recovery,
        },
        {
          moveToDone: async () => {
            const moveResult = await runMoveStateDone(closeTarget, {
              silent: true,
              tailProfile: convergenceTailProfile,
              reviewAuthority: terminalReviewAuthority(),
            });
            if (!moveResult.ok && !moveResult.benign) {
              const postBoardState = await getIssueBoardState(closeTarget);
              if (decideBoardMoveFailure({ moveResult, boardState: postBoardState }).surface) {
                return moveResult;
              }
            }
            return { ok: true };
          },
          emitClosePair: async () => {
            if (!authoritativeDoneBodyInspected) {
              try {
                const { stdout } = await pexec(
                  'gh',
                  ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
                  { timeout: GH_API_TIMEOUT_MS }
                );
                convergeBody = JSON.parse(stdout).body ?? convergeBody;
              } catch (err) {
                process.stderr.write(
                  `⚠ body read for converge close pair failed: ${err.message}\n`
                );
              }
            }
            await emitReviewToDoneClosePair({
              closeTarget,
              closeIssueNum,
              cfg,
              hasApprovalMarker: hasReviewApprovedMarker(convergeBody),
              issueBody: convergeBody,
              reviewGateBypassed: fullAuto,
              lastWordMarker: s.lastWordMarker,
              lastFullWordMarker: stateFullWordMarker(s),
              ctx,
              SKIP_NETWORK,
              nowIso,
              safePostTiming,
            });
            await flushCloseTimingOrThrow({ closeTarget, flushQueueFor });
            return { ok: true };
          },
          ensureOutcome: async () =>
            (await ensureConvergenceOutcome({ body: convergeBody }))
              ? { ok: true }
              : { ok: false, error: 'completion outcome evidence did not converge' },
          reconcileLifecycle: async () => {
            if (
              reconcileLifecycleBoxes === tickLifecycleOnClose &&
              typeof issueBodyMutator?.mutate !== 'function'
            ) {
              throw new Error(
                'issueBodyMutator.mutate capability is required for lifecycle reconciliation'
              );
            }
            return reconcileLifecycleBoxes({
              cfg,
              issueNum: closeIssueNum,
              pexec,
              deps: { mutateIssueBody: issueBodyMutator?.mutate },
            });
          },
          cleanup: async () => {
            releaseClosedBinding({ ctx, projectDir, issue: closeTarget });
            if (!ctx.preserveActiveOnConvergence) clearActive(statePath);
            return { ok: true };
          },
          reopenIssue: async () => {
            await pexec('gh', ['issue', 'reopen', closeIssueNum, '-R', cfg.repo], {
              timeout: GH_API_TIMEOUT_MS,
            });
            return { ok: true };
          },
          moveToReview: async () => {
            const extraArgs = ['--force'];
            if (boardState) extraArgs.push('--from', boardState);
            return runMoveState(closeTarget, 'review', {
              silent: true,
              extraArgs,
              tailProfile: convergenceTailProfile,
            });
          },
          postTimingAudit: async ({ recovery: activeRecovery }) => {
            const { buildRow } = await import('../gh-timing-comment.mjs');
            return safePostTiming(
              closeTarget,
              buildRow({
                ts: nowIso(),
                event: 'unauthorized-close',
                // This out-of-band recovery has no active session segment;
                // honest 0/0 records audit occurrence without fabricating work.
                activeSec: 0,
                idleSec: 0,
                deltaWords: 0,
                wordMarker: s.lastWordMarker ?? 0,
                fullWordMarker: stateFullWordMarker(s),
                description:
                  `closed without authorization — reopened and restored to Review; ` +
                  `tx=${activeRecovery.tx}; ` +
                  `stateReason=${activeRecovery.stateReason || 'unknown'}; ` +
                  `unticked=${activeRecovery.unticked.join(', ') || 'unknown'}`,
              })
            );
          },
          createTransactionId: () => randomUUID(),
          timingAuditPresent: async (tx) => {
            const { readTimingCommentBody, bodyOf } = await import('../gh-timing-comment.mjs');
            const readTiming = ctx.readTimingCommentBody || readTimingCommentBody;
            const result = await readTiming({
              issueNumber: closeIssueNum,
              repo: cfg.repo,
              timeoutMs: GH_API_TIMEOUT_MS,
            });
            if (result?.status === 'error') {
              throw result.error || new Error('timing audit read failed');
            }
            return timingAuditHasExactTransaction(bodyOf(result), tx);
          },
          writeRecoveryPhase: async (phase, activeRecovery) => {
            if (typeof issueBodyMutator?.mutate !== 'function') {
              throw new Error(
                'issueBodyMutator.mutate capability is required for recovery persistence'
              );
            }
            const mutation = await issueBodyMutator.mutate({
              issueNumber: closeIssueNum,
              repo: cfg.repo,
              mutate: (base) =>
                upsertUnauthorizedCloseRecovery(base, {
                  ...activeRecovery,
                  phase,
                }),
            });
            const mutationSucceeded =
              mutation &&
              mutation !== false &&
              mutation.ok !== false &&
              (mutation.status === 'ok' || mutation.status === 'no-op') &&
              typeof mutation.body === 'string';
            if (!mutationSucceeded) {
              throw new Error(
                `recovery marker mutation failed for phase ${phase}: expected status ok/no-op with verified body`
              );
            }
            const persisted = readUnauthorizedCloseRecovery(mutation.body);
            if (!persisted) {
              throw new Error(`recovery marker readback failed for phase ${phase}`);
            }
            if (persisted.tx !== activeRecovery.tx) {
              throw new Error(
                `recovery marker readback mismatch for transaction: expected ${activeRecovery.tx}, got ${persisted.tx}`
              );
            }
            if (persisted.phase !== phase) {
              throw new Error(
                `recovery marker readback mismatch for phase: expected ${phase}, got ${persisted.phase}`
              );
            }
            return persisted;
          },
        }
      );

      if (convergence.status === 'failed') {
        if (decision.action === 'noop' && convergence.failedStep === 'moveToDone') {
          console.error(
            `${closeTarget} is closed on GitHub but the board move to Done failed: ${convergence.error}\n` +
              `Local state left intact — re-run \`/task close ${closeTarget}\` to retry the board move.`
          );
        } else {
          console.error(
            `${closeTarget} closed-issue ${decision.action} failed at ${convergence.failedStep}: ` +
              `${convergence.error}. Local task state was retained for retry.`
          );
        }
        process.exitCode = 1;
        return convergence;
      }
      if (convergence.status === 'untouched') {
        console.log(
          `${closeTarget} is closed for ${closeSnapshot.stateReason || 'an unknown non-delivery reason'} — left issue and board untouched.`
        );
        return convergence;
      }
      if (convergence.status === 'recovered') {
        console.log(`${closeTarget} ${convergence.message}.`);
        return convergence;
      }

      console.log(
        decision.action === 'finalize' || decision.boardDrift
          ? `${closeTarget} was already closed on GitHub — finalized housekeeping and converged the board to Done.`
          : `${closeTarget} is already fully closed — reconciled housekeeping and cleaned local state.`
      );
      return convergence;
    }
    // decision.action === 'proceed' → fall through to the full close pipeline.
  }

  if (closeTarget === 'discover') {
    await drainQueueOnce();
    console.log('Discarded discovery bucket.');
    saveState({ ...s, active: null, discoverBucket: null }, statePath);
    return;
  }

  if (
    await refuseDeliveryGate(
      resumeDeliveredCloseTransaction
        ? { durableTransaction: resumeDeliveredCloseTransaction }
        : undefined
    )
  ) {
    return;
  }

  persistExplicitBinding();

  let dirtyAuditRow = null;
  const terminalResume =
    resumeDeliveredCloseTransaction !== null || resumeMarkerlessOpenDone === true;
  // #655 — `?? ctx.closeBody` lets a SKIP_NETWORK fixture seed the live body the
  // `!SKIP_NETWORK` block would otherwise fetch, so the review:approved emission
  // gate (which predicates on the approval marker) is exercisable in-process.
  let closeBody = resumeConvergeBody ?? ctx.closeBody ?? '';
  let closeLifecycleEvidence = null;
  // #655 — hoisted out of the `!SKIP_NETWORK` gate-evaluation block (where
  // `_resolvedReviewGate` is scoped) so the later `review:approved` timing-row
  // emission can predicate on it. True iff the review→done gate was explicitly
  // disabled (session/project override), which carries its own
  // `aitm-gate-bypassed` audit row.
  let reviewGateBypassed = terminalReviewGateBypassed();
  if (!terminalResume && process.env.TT_SKIP_DIRTY_CHECK !== '1') {
    const answerIdx = rest.indexOf('--answer');
    const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
    const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
    const dirty = await inspectDirty({ cwd });
    if (dirty.dirty) {
      if (!answerArg) {
        if (process.env.CI === '1') {
          console.error(
            `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)) and running headless.`
          );
          console.error(formatSummary(dirty));
          console.error('');
          console.error('Headless mode requires --answer yes|no|cancel.');
          console.error('   yes    — refuse close, show cleanup flow (recommended)');
          console.error('   no     — close with `closed-with-dirty-tree` audit row');
          console.error('   cancel — abort, leave in Review');
          process.exit(5);
        } else {
          console.error(`⚠ Workspace is dirty (${dirty.total} path(s)) for ${closeTarget}:`);
          console.error(formatSummary(dirty));
          console.log(`PROMPT_REQUIRED: dirty-close-confirm ${closeTarget}`);
          // #710 — exit non-zero so callers (e.g. `promote`) can distinguish a
          // blocked prompt from a completed close. Every sibling PROMPT_REQUIRED
          // emitter (CI dirty branch above → exit 5, review-approval → exit 7,
          // preflightVerb prompts) exits non-zero; the bare `return` here (exit 0)
          // was the lone anomaly that let `promote` report a false `✓ promoted`.
          // The PROMPT_REQUIRED stdout line is emitted first, so the interactive
          // skill loop still surfaces the prompt and re-invokes with --answer.
          process.exit(5);
        }
      } else if (answerArg === 'yes') {
        console.error(
          `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)).`
        );
        console.error(formatSummary(dirty));
        console.error('');
        console.error(CLEANUP_GUIDANCE);
        process.exit(6);
      } else if (answerArg === 'cancel') {
        console.log(
          `Cancelled close of ${closeTarget}; left in Review (workspace dirty: ${dirty.total} path(s)).`
        );
        return;
      } else if (answerArg === 'no') {
        console.warn(
          `[task-tracker] Closing ${closeTarget} with dirty workspace (${dirty.total} path(s)) — appending audit row.`
        );
        const { buildRow: dbr } = await import('../gh-timing-comment.mjs');
        const { deriveStateMoveDelta: _dsm1 } = await import('../lib/timing-rows.mjs');
        const _ts1 = nowIso();
        const _d1 = _dsm1(closeBody, _ts1);
        dirtyAuditRow = dbr({
          ts: _ts1,
          event: 'closed-with-dirty-tree',
          activeSec: _d1.activeSec,
          idleSec: _d1.idleSec,
          deltaWords: 0,
          // #475 AC1 — carried-forward durable marker (closed-with-dirty-tree audit, no active session)
          wordMarker: s.lastWordMarker ?? 0,
          fullWordMarker: stateFullWordMarker(s),
          description: shortAuditDescription(dirty),
        });
      } else {
        console.error(`Invalid --answer "${answerArg}". Expected yes|no|cancel.`);
        process.exit(1);
      }
    }
  }

  if (!SKIP_NETWORK && !terminalResume) {
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const data = JSON.parse(stdout);
      let body = data.body ?? '';
      closeBody = body;

      // #931 — refuse before any gate-bypass marker write / DoD derivation if
      // the issue isn't in `review` (close's home state — it's review's exit
      // action). Thrown here so it's caught by the fail-closed `catch` below
      // (still bypassable via `--force`, same as every other guard exception
      // in this block).
      assertVerbHomeState({
        verb: 'close',
        currentState: readLastKnownState(body).state,
        issueNumber: closeIssueNum,
      });

      // #279 — review→done close-gates migrated into the guard registry.
      // The marker regex and runCloseGates bundle that used to live inline
      // here now run as `reviewExitReviewApprovedGuard` and
      // `reviewExitCloseGatesGuard` on `states/review.mjs`. We invoke them
      // via `runGuards('review', 'done', ctx)` below — once, after
      // derived-DoD stamping so chain-integrity sees the freshly-ticked
      // keys. The session/project `gateReviewToDone` toggle still lives in
      // close.mjs because it controls audit emission, not guard logic.
      reviewGateBypassed = terminalReviewGateBypassed(); // #655 — hoist for the row gate
      if (reviewGateBypassed) {
        // #516 — the review-gate bypass is recorded as a body audit marker
        // (`aitm-gate-bypassed`), not a ⏱ Timing Log row. The bypass consumes no
        // distinct wall-clock; its time is already counted inside Review. The
        // marker is written during the close transaction so the audit trail
        // survives in the issue body.
        const { appendAuditMarker } = await import('../lib/markers.mjs');
        const _ts2 = nowIso();
        await mutateBody({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          mutate: (base) =>
            appendAuditMarker(base, {
              kind: 'gate-bypassed',
              ts: _ts2,
              detail: 'gateReviewToDone=false (session/project override) — bypassing human review',
            }),
        });
      }

      // #303 / #315 — Derived Functional DoD keys (`acs`, `checkboxes`) are
      // computed and stamped here, immediately before the close gate, via the
      // shared `deriveAndStampFunctionalDod` helper (also called from
      // verbs/review.mjs so review and close have identical derived-key
      // behavior). `checkboxes` is derived after `acs` inside the helper so the
      // newly-ticked `acs` box is counted. Atomic single push via mutateIssueBody.
      try {
        let derivedHeadSha = 'unknown';
        try {
          const { stdout: shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {});
          derivedHeadSha = String(shaOut || '').trim() || 'unknown';
        } catch {
          // best-effort — sha=unknown is acceptable in the evidence marker
        }
        const mutated = await deriveAndStampFunctionalDod({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          sha: derivedHeadSha,
          ts: nowIso(),
          deps: { pexec },
        });
        // Re-fetch body so the rest of the close gate sees the post-derivation
        // state. Skipped on no-op.
        if (mutated?.status === 'ok') {
          const { stdout: refetched } = await pexec(
            'gh',
            ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
            { timeout: GH_API_TIMEOUT_MS }
          );
          body = String(refetched || body);
          closeBody = body;
        }
      } catch (err) {
        // Derivation is best-effort. If it fails, the existing
        // uncheckedPreCloseCheckboxes / lifecycle gate will surface the issue
        // through the normal blocker path. Log and continue.
        console.warn(`[task-tracker] Functional DoD derivation skipped: ${err.message}`);
      }

      closeLifecycleEvidence = await loadCloseLifecycleEvidence(body);

      const unchecked = await resolvePreCloseCheckboxes({
        body,
        issueNumber: closeIssueNum,
        projectDir,
        scan: uncheckedPreCloseCheckboxes,
        resolveLaneSkipProof: ctx.resolveDocsOnlyLaneSkipProof,
        proofDeps: ctx.docsOnlyLaneSkipProofDeps,
      });
      const reasons = [];
      if (unchecked.length > 0) {
        reasons.push(
          `${unchecked.length} unchecked checkbox${unchecked.length === 1 ? '' : 'es'} in issue body`
        );
      }

      // #179 — Hard Review→Done lifecycle gate. When required, blocks close unless
      // each lifecycle key is ticked, audited (Full-Auto), or per-key opt-out marker
      // present. When toggled off, downgrade to a WARN timing-log row.
      const lifecycleRequired = cfg.lifecycleCheckboxesRequired !== false;
      const lifecycleGate = assertLifecycleSatisfied({
        body,
        required: lifecycleRequired,
        lifecycleEvidence: closeLifecycleEvidence,
      });
      if (lifecycleGate.block) {
        reasons.push(lifecycleGate.reason);
      } else if (!lifecycleRequired && lifecycleGate.missing.length > 0) {
        try {
          const { buildRow: gbrL } = await import('../gh-timing-comment.mjs');
          const { deriveStateMoveDelta: _dsmL } = await import('../lib/timing-rows.mjs');
          const _tsL = nowIso();
          const _dL = _dsmL(body, _tsL);
          const missLabels = lifecycleGate.missing.map((m) => m.key).join(', ');
          await safePostTiming(
            closeTarget,
            gbrL({
              ts: _tsL,
              event: 'lifecycle-warn',
              activeSec: _dL.activeSec,
              idleSec: _dL.idleSec,
              deltaWords: 0,
              // #475 AC1 — carried-forward durable marker (lifecycle WARN bypass, no active session work)
              wordMarker: s.lastWordMarker ?? 0,
              fullWordMarker: stateFullWordMarker(s),
              description: `WARN: lifecycle-incomplete (lifecycleCheckboxesRequired=false): ${missLabels}`,
            })
          );
        } catch {
          // best-effort
        }
      }
      if (!force) {
        // #279 — single guard-registry call covers review→done exit:
        // blocked-by, review-approved marker, close-gates bundle,
        // child-cannot-lead-epic. The session/project gateReviewToDone
        // toggle filters the review-approved refusal post-hoc so the
        // existing bypass-audit row stays the only side-effect of disabling
        // human review.
        // #908 — desync-safe trunk-ref for the close-attribution gate. When close
        // runs inside a linked worktree, `lineageDoneGate` must attribute against
        // `origin/trunk` (a remote-tracking ref that is never checked out) so the
        // shared local `trunk` ref is never touched. Injected via the existing
        // `deps.closeGates.resolveTrunkRef` override hook. cfg.trunkRef still wins.
        const inWorktree = await detectLinkedWorktree({ pexec, cwd: projectDir });
        const guardResult = await runGuards('review', 'done', {
          issueNumber: Number(closeIssueNum),
          repo: cfg.repo,
          fromState: 'review',
          toState: 'done',
          body,
          lifecycleEvidence: closeLifecycleEvidence,
          cfg,
          projectDir,
          deps: { closeGates: { resolveTrunkRef: makeCloseTrunkRefResolver({ inWorktree }) } },
        });

        const refusals = (guardResult.refusals || []).filter(
          (r) => !(r.id === 'review-exit-review-approved' && reviewGateBypassed)
        );

        const approvedRefusal = refusals.find((r) => r.id === 'review-exit-review-approved');
        if (approvedRefusal) {
          const answerIdx = rest.indexOf('--answer');
          const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
          if (answerArg === 'yes' || answerArg === 'no') {
            console.error(
              `⛔ \`--answer ${answerArg}\` cannot satisfy a human-gate prompt (review-approval).`
            );
            console.error(
              `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
            );
            process.exit(8);
          }
          console.error(`⛔ Refusing to close ${closeTarget} — no human review approval recorded.`);
          console.log(`PROMPT_REQUIRED: review-approval ${closeTarget}`);
          console.error(
            `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
          );
          process.exit(7);
        }

        const closeGatesRefusal = refusals.find((r) => r.id === 'review-exit-close-gates');
        if (closeGatesRefusal) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          (closeGatesRefusal.blockers && closeGatesRefusal.blockers.length
            ? closeGatesRefusal.blockers
            : [closeGatesRefusal.reason]
          ).forEach((b) => console.error(`   • ${b}`));
          console.error('');
          process.exit(3);
        }

        const otherRefusals = refusals.filter(
          (r) => r.id !== 'review-exit-review-approved' && r.id !== 'review-exit-close-gates'
        );
        if (otherRefusals.length > 0) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          otherRefusals.forEach((r) => console.error(`   • ${r.reason}`));
          console.error('');
          process.exit(3);
        }

        const closeGatesWarn = (guardResult.warns || []).find(
          (w) => w.id === 'review-exit-close-gates'
        );
        if (closeGatesWarn?.warn?.dirtyCheckSkipped) {
          console.warn(
            `[task-tracker] issue-scoped dirty check skipped (${closeGatesWarn.warn.dirtyCheckSkipped}).`
          );
        }
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(`[task-tracker] ⚠ --force — bypassing close gate for ${closeTarget}`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`--force\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
            await pexec('gh', ['issue', 'comment', closeIssueNum, '-R', cfg.repo, '--body', note], {
              timeout: GH_API_TIMEOUT_MS,
            });
          } catch {
            /* best-effort: GitHub/telemetry side effect; core flow proceeds */
          }
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/templates/pickup-directive.md Hard Rules.');
          console.error(
            'Verify each item, check its box (`/task ensureChecked "<label>"`), then retry.'
          );
          process.exit(3);
        }
      }
    } catch (err) {
      // #510 — fail CLOSED. The entire review→done close-gate evaluation ran
      // inside this try; a transient body-fetch blip, JSON.parse error, or a
      // guard exception must NOT silently skip the gates and fall through to the
      // terminal `gh issue close` below. Refuse the close (exit non-zero) before
      // any mutation, leaving local state intact so a re-run recovers. `--force`
      // remains the deliberate, audited bypass.
      const decision = decideGateEvalFailure({ error: err, force });
      if (decision.failClosed) {
        console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
        console.error(`   • ${decision.message}`);
        process.exit(decision.exitCode);
      }
      console.warn(
        `[task-tracker] ⚠ --force — close-gate evaluation failed but bypassing: ${err.message}`
      );
    }
  }

  let deliveredCloseTransaction = null;
  const persistDeliveredCloseTransaction = async (transaction) => {
    if (typeof mutateBody !== 'function') {
      throw new Error('delivered close transaction requires issueBodyMutator.mutate');
    }
    const mutation = await mutateBody({
      issueNumber: Number(closeIssueNum),
      repo: cfg.repo,
      mutate: (base) => upsertDeliveredCloseTransaction(base, transaction),
    });
    if (mutation?.status !== 'ok' || typeof mutation.body !== 'string') {
      throw new Error('delivered close transaction write did not return authoritative body');
    }
    const readback = readDeliveredCloseTransactions(mutation.body);
    const resolved = resolveDeliveredCloseTransaction({
      issueNumber: Number(closeIssueNum),
      acceptedSha: transaction.acceptedSha,
      transactions: readback,
    });
    if (
      resolved.transaction === null ||
      JSON.stringify(resolved.transaction) !== JSON.stringify(transaction)
    ) {
      throw new Error('delivered close transaction readback mismatch');
    }
    closeBody = mutation.body;
    deliveredCloseTransaction = resolved.transaction;
  };
  const markDeliveredCloseStep = async (step) => {
    if (!deliveredCloseTransaction) return;
    const nextIndex = deliveredCloseTransaction.completedSteps.length;
    if (TERMINAL_CLOSE_STEPS[nextIndex] !== step) {
      throw new Error(
        `delivered close transaction expected ${TERMINAL_CLOSE_STEPS[nextIndex] ?? 'completion'}, got ${step}`
      );
    }
    await persistDeliveredCloseTransaction({
      ...deliveredCloseTransaction,
      completedSteps: [...deliveredCloseTransaction.completedSteps, step],
    });
  };
  const needsDeliveredCloseStep = (step) =>
    deliveredCloseTransaction === null || !deliveredCloseTransaction.completedSteps.includes(step);
  if (!SKIP_NETWORK && closeIssueNum) {
    const acceptedSha = resolvedDeliveryGate?.gateInput?.acceptedSha;
    const existing = readDeliveredCloseTransactions(closeBody);
    const resolved = resolveDeliveredCloseTransaction({
      issueNumber: Number(closeIssueNum),
      acceptedSha,
      transactions: existing,
    });
    deliveredCloseTransaction = resolved.transaction;
    if (deliveredCloseTransaction === null) {
      await persistDeliveredCloseTransaction({
        schema: 'aitm.delivered-close/v1',
        transactionId: randomUUID(),
        issueNumber: Number(closeIssueNum),
        acceptedSha,
        reviewAuthority: terminalReviewAuthority(),
        completedSteps: [],
      });
    }
  }
  if (needsDeliveredCloseStep('timing')) {
    await drainQueueOnce();

    if (!SKIP_NETWORK && closeIssueNum) {
      const subNums = await fetchSubIssues(closeIssueNum);
      if (subNums.length > 0) {
        const childStates = await Promise.all(
          subNums.map(async (n) => ({ num: n, state: await getIssueBoardState(n) }))
        );
        const notReady = childStates.filter((c) => c.state !== 'review' && c.state !== 'done');
        if (notReady.length > 0 && !force) {
          console.error(
            `[task-tracker] ⛔ Cannot close epic #${closeIssueNum} — ${notReady.length} child issue(s) not in Review:`
          );
          notReady.forEach((c) => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
          console.error('All sub-issues must reach Review before the epic can close.');
          process.exit(3);
        }
        const reviewChildren = childStates.filter((c) => c.state === 'review');
        if (reviewChildren.length > 0) {
          console.log(`[task-tracker] Cascade closing ${reviewChildren.length} child issue(s)...`);
          const { buildRow: br } = await import('../gh-timing-comment.mjs');
          const { PHASE_EVENTS: _PEcascade } = await import('../phase-events.mjs');
          for (const child of reviewChildren) {
            try {
              // Cascade close: per-child body not fetched here; activeSec=0 is
              // honest because no per-child timing context is loaded.
              const childTarget = `#${child.num}`;
              const terminalTiming = await safePostTiming(
                childTarget,
                br({
                  ts: nowIso(),
                  event: _PEcascade.done.enter.event,
                  activeSec: 0,
                  idleSec: 0,
                  deltaWords: 0,
                  // #475 AC1 — stamp the epic session's durable marker (the session
                  // performing the cascade); the per-log monotonic-max in
                  // rollupTotals protects each child's own running total.
                  wordMarker: s.lastWordMarker ?? 0,
                  fullWordMarker: stateFullWordMarker(s),
                  description: `${_PEcascade.done.enter.description} (cascade closed by epic)`,
                })
              );
              if (
                terminalTiming === false ||
                terminalTiming?.ok === false ||
                terminalTiming?.queued
              ) {
                console.error(
                  `  ⛔ Could not prepare #${child.num} for close: terminal timing issue:wrap was not durably posted`
                );
                process.exitCode = 1;
                return;
              }
              let childFlush;
              try {
                childFlush = await flushCloseTimingOrThrow({
                  closeTarget: childTarget,
                  flushQueueFor,
                });
              } catch (err) {
                console.error(`  ⛔ Could not prepare #${child.num} for close: ${err.message}`);
                process.exitCode = 1;
                return;
              }
              // Cascaded children are independently estimated stories. Freeze
              // their completion outcome after the close-time timing row and
              // before any terminal board/disposition/issue mutation, exactly as
              // the primary close path does.
              let childBody;
              try {
                const { stdout } = await pexec(
                  'gh',
                  [
                    'issue',
                    'view',
                    String(child.num),
                    '-R',
                    cfg.repo,
                    '--json',
                    'body',
                    '--jq',
                    '.body',
                  ],
                  { timeout: GH_API_TIMEOUT_MS }
                );
                childBody = String(stdout ?? '');
                await ensureCloseEstimationOutcome({
                  issueNumber: child.num,
                  body: childBody,
                  writer: outcomeWriterForIssue(child.num, { requireDedicated: true }),
                });
              } catch (err) {
                console.error(
                  `  ⛔ Could not create completion outcome for #${child.num}: ${err.message}`
                );
                process.exitCode = 1;
                return;
              }
              // #385 — structured result; a genuine per-child board-move failure
              // is surfaced (with its real stderr) but does not abort the cascade.
              // The benign `done → done` no-op stays silent.
              const childMove = await runMoveState(child.num, 'done', {
                env: { AITM_CASCADE: '1' },
                silent: true,
              });
              // #512 — fail CLOSED: a genuine non-benign board-move failure must NOT
              // be followed by `gh issue close`, or the child is left CLOSED while
              // its board card is not Done (split-brain). The benign done→done no-op
              // still closes. One stuck child must not abort the cascade, so skip it
              // and continue with actionable recovery guidance.
              const { decideCascadeChildClose } = await import('../lib/cascade-child-close.mjs');
              const childCloseDecision = decideCascadeChildClose({ childMove });
              if (!childCloseDecision.shouldClose) {
                console.warn(
                  `  ⚠ #${child.num} NOT closed — board move to "done" failed: ${childCloseDecision.detail}`
                );
                console.warn(
                  `     Recovery: retry \`/task close ${child.num}\` after the board is reachable.`
                );
                continue;
              }
              // #1041 — Delivered is terminal classification for cascaded
              // children too. Write it only after the board move has succeeded,
              // matching the primary close path and avoiding an OPEN child that
              // is classified Delivered when its Done move fails.
              if (
                !(await writeDeliveredOrRefuse({
                  issueNumber: child.num,
                  targetRef: `#${child.num}`,
                }))
              ) {
                return;
              }
              await pexec('gh', ['issue', 'close', String(child.num), '-R', cfg.repo], {
                timeout: GH_API_TIMEOUT_MS,
              });
              releaseClosedBinding({ ctx, projectDir, issue: `#${child.num}` });
              const childSuffix = childFlush?.delivered
                ? ` (queue: delivered ${childFlush.delivered})`
                : '';
              console.log(`  ✓ #${child.num} closed${childSuffix}`);
            } catch (err) {
              console.warn(`  ⚠ Could not close #${child.num}: ${err.message}`);
              process.exitCode = 1;
              return;
            }
          }
        }
      }
    }
    if (!SKIP_NETWORK && closeIssueNum) {
      try {
        const { applyReviewDelta: defaultApplyReviewDelta } =
          await import('../lib/apply-review-delta.mjs');
        const applyReviewDelta = ctx.applyReviewDelta || defaultApplyReviewDelta;
        await applyReviewDelta({ cfg, issueNumber: closeIssueNum, body: closeBody });
      } catch (err) {
        process.stderr.write(`⚠ review-delta hook failed: ${err.message}\n`);
      }
    }
    if (dirtyAuditRow) {
      await safePostTiming(closeTarget, dirtyAuditRow);
    }
    // #801 — emit the review→done close pair through the shared helper (also
    // invoked by the converge/no-op fast-path). `review:approved` is gated on the
    // live approval marker in the fetched body, OR an explicitly-bypassed review
    // gate (`aitm-gate-bypassed` already logged); `issue:wrap` is unconditional.
    try {
      await emitReviewToDoneClosePair({
        closeTarget,
        closeIssueNum,
        cfg,
        hasApprovalMarker:
          hasReviewApprovedMarker(closeBody) ||
          hasAcceptedApprovalEvidence(closeLifecycleEvidence, { provenance: 'human' }) ||
          hasAcceptedApprovalEvidence(closeLifecycleEvidence, { provenance: 'full-auto' }),
        issueBody: closeBody,
        reviewGateBypassed,
        lastWordMarker: s.lastWordMarker,
        lastFullWordMarker: stateFullWordMarker(s),
        ctx,
        SKIP_NETWORK,
        nowIso,
        safePostTiming,
      });
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: ${err.message}. ` +
          'Issue left OPEN; retry after timing evidence is reachable.'
      );
      process.exitCode = 1;
      return;
    }
    if (runLogIssueTime) await runLogIssueTime(closeTarget);
    // Post-close board/body agreement check (#180 defect 1 guard). After
    // runLogIssueTime, the `<!-- aitm-fields -->` body marker should have
    // non-null engagedTime. If it's still null, board fields almost certainly
    // were not written either — refuse to clear active so the user can recover.
    if (!SKIP_NETWORK && closeIssueNum) {
      await (ctx.assertFieldsPersisted || assertFieldsPersisted)({
        cfg,
        pexec,
        issueNum: closeIssueNum,
      });
    }
    let flushResult;
    try {
      flushResult = await flushCloseTimingOrThrow({ closeTarget, flushQueueFor });
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: ${err.message}. ` +
          'Issue left OPEN; queued timing evidence was retained for retry.'
      );
      process.exitCode = 1;
      return;
    }
    if (flushResult.delivered) {
      console.log(
        `[task-tracker] queue: delivered ${flushResult.delivered}, pending 0 for ${closeTarget}.`
      );
    }
    await markDeliveredCloseStep('timing');
  }
  if (needsDeliveredCloseStep('estimation')) {
    try {
      await ensureCloseEstimationOutcome({
        issueNumber: closeIssueNum,
        body: closeBody,
        writer: estimationOutcomeWriter,
      });
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: ${err.message}. ` +
          'Issue left OPEN; repair outcome evidence and retry.'
      );
      process.exitCode = 1;
      return;
    }
    await markDeliveredCloseStep('estimation');
  }
  let lifecycleTickResult = { ok: true };
  if (needsDeliveredCloseStep('lifecycle')) {
    lifecycleTickResult = SKIP_NETWORK
      ? { ok: true, skipped: true }
      : await reconcileLifecycleBoxes({
          cfg,
          issueNum: closeIssueNum,
          pexec,
        });
    if (lifecycleTickResult && lifecycleTickResult.ok === false) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: lifecycle checkboxes did not converge. ` +
          'Issue left OPEN; repair the body mutation and retry.'
      );
      process.exitCode = 1;
      return;
    }
    await markDeliveredCloseStep('lifecycle');
  }
  // #505 — atomic forced close. A `--force` close deliberately bypasses the
  // close gate (above), but the *terminal board move* used to run only AFTER
  // `gh issue close` (see ~line 580) and delegated to move-state.mjs, whose
  // one-step matrix refuses any non-`review` → `done` transition. From a
  // non-review column that left the issue CLOSED on GitHub but the board
  // stranded at the source column — a split-brain needing a manual UI drag +
  // `reconcile accept-live`. Fix: on the force path, pre-walk the board to
  // Done *before* closing the issue, using the move-state `--force` flag so the
  // matrix + guards are bypassed for this terminal move only. If the forced
  // move cannot land the board at Done, refuse here and leave the issue OPEN —
  // so the outcome is always board=Done-then-closed, or untouched, never
  // closed-but-not-Done. (The post-close move below then degrades to a benign
  // `done → done` no-op on this path; the non-force path is unchanged.)
  if (force && !SKIP_NETWORK && closeIssueNum) {
    if (needsDeliveredCloseStep('board')) {
      const observedBoardState = await getIssueBoardState(closeIssueNum);
      if (observedBoardState === 'done') await markDeliveredCloseStep('board');
    }
    if (needsDeliveredCloseStep('board')) {
      const forcedMove = await runMoveStateDone(s.active, {
        silent: true,
        extraArgs: ['--force'],
        reviewAuthority: terminalReviewAuthority(),
      });
      // Same swallow-vs-surface rule as the post-close move (#435): re-read the
      // board and only refuse when the move genuinely failed AND the board is not
      // Done. A benign `done → done` (board already converged out-of-band) passes.
      const forcedBoardState =
        forcedMove && !forcedMove.ok && !forcedMove.benign
          ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
          : 'done';
      if (
        decideBoardMoveFailure({ moveResult: forcedMove, boardState: forcedBoardState }).surface
      ) {
        const detail =
          (forcedMove.stderr || '').trim() ||
          `move-state.mjs exited ${forcedMove.status ?? 'non-zero'}`;
        console.error(
          `[task-tracker] ⛔ Refusing to close ${closeTarget}: forced board move to "done" failed (${detail}). ` +
            `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move and re-run \`/task close ${closeTarget} --force\`.`
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  // #654 — fail-closed close ordering on the NON-force path. The force path
  // (#505, above) already pre-walks the board to Done BEFORE `gh issue close`
  // so a refused terminal move can never strand the issue CLOSED-but-not-Done.
  // The non-force path used to mutate in the opposite order: `gh issue close`
  // first (below), THEN the guarded `runMoveStateDone` (#385, further down).
  // When that terminal move-state review→done was refused — board drifted off
  // `review`, or move-state's own `review-approval-missing` guard fired because
  // the `aitm-review-approved` marker never persisted (the #652 incident) — the
  // issue was already CLOSED on GitHub while the board stayed stranded at the
  // source column. The pre-close `runGuards('review','done', …)` block above
  // narrows but does not eliminate this: it filters the review-approved refusal
  // when the session review gate is off, and move-state re-evaluates its own
  // guards independently, so the two passes can legitimately disagree after the
  // close has already fired. Fix: mirror the #505 pre-walk here — land the board
  // at Done first; if it genuinely fails (and the board is not already Done),
  // refuse, leave the issue OPEN, and do NOT clear local state so a re-run
  // recovers. The post-close move (#385) then degrades to a benign `done → done`
  // no-op, exactly as on the force path.
  if (!force && !SKIP_NETWORK && closeIssueNum) {
    if (needsDeliveredCloseStep('board')) {
      const observedBoardState = await getIssueBoardState(closeIssueNum);
      if (observedBoardState === 'done') await markDeliveredCloseStep('board');
    }
    if (needsDeliveredCloseStep('board')) {
      const preMove = await runMoveStateDone(s.active, {
        silent: true,
        reviewAuthority: terminalReviewAuthority(),
      });
      const preBoardState =
        preMove && !preMove.ok && !preMove.benign
          ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
          : 'done';
      if (decideBoardMoveFailure({ moveResult: preMove, boardState: preBoardState }).surface) {
        const detail =
          (preMove.stderr || '').trim() || `move-state.mjs exited ${preMove.status ?? 'non-zero'}`;
        console.error(
          `[task-tracker] ⛔ Refusing to close ${closeTarget}: board move to "done" failed (${detail}). ` +
            `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move ` +
            `(e.g. record review approval with \`/task approve ${closeTarget}\`) and re-run \`/task close ${closeTarget}\`.`
        );
        process.exitCode = 1;
        return;
      }
    }
  }
  if (needsDeliveredCloseStep('board') && SKIP_NETWORK) {
    const offlineMove = await runMoveStateDone(s.active, {
      silent: true,
      ...(force ? { extraArgs: ['--force'] } : {}),
      reviewAuthority: terminalReviewAuthority(),
    });
    if (offlineMove && !offlineMove.ok && !offlineMove.benign) {
      const detail =
        (offlineMove.stderr || '').trim() ||
        `move-state.mjs exited ${offlineMove.status ?? 'non-zero'}`;
      console.error(`[task-tracker] ⛔ Refusing offline close ${closeTarget}: ${detail}.`);
      process.exitCode = 1;
      return;
    }
  }
  if (needsDeliveredCloseStep('board')) await markDeliveredCloseStep('board');

  // #1035 — Delivered is terminal classification, so write it only after the
  // board has verifiably reached Done. This prevents a failed outcome or move
  // from leaving an open issue classified as delivered.
  if (needsDeliveredCloseStep('disposition') && !SKIP_NETWORK && closeIssueNum) {
    let observedDisposition;
    try {
      observedDisposition = String(
        (await dispositionReader({ cfg, issueNumber: Number(closeIssueNum) })) || ''
      ).trim();
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: terminal disposition could not be read (${err.message}).`
      );
      process.exitCode = 1;
      return;
    }
    if (observedDisposition === 'Delivered') {
      await markDeliveredCloseStep('disposition');
    } else if (observedDisposition) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: terminal disposition is already ${observedDisposition}; refusing to overwrite it with Delivered.`
      );
      process.exitCode = 1;
      return;
    }
  }
  if (needsDeliveredCloseStep('disposition') && !SKIP_NETWORK && closeIssueNum) {
    if (
      !(await writeDeliveredOrRefuse({
        issueNumber: closeIssueNum,
        targetRef: closeTarget,
      }))
    ) {
      return;
    }
  }
  if (needsDeliveredCloseStep('disposition')) await markDeliveredCloseStep('disposition');

  // #425 — explicitly close the primary issue rather than relying on the
  // GitHub Projects auto-close workflow firing off the board move below. The
  // workflow is best-effort; when it misses, board=Done + issue-OPEN drift
  // results (see close-convergence.mjs). Closing here makes issue-close a
  // first-class, separately-recoverable step: on failure we surface it and
  // exit non-zero WITHOUT clearing local state, so a re-run finishes the job
  // (and the short-circuit above will converge the lagging side). `gh issue
  // close` is idempotent — closing an already-closed issue is a no-op.
  if (needsDeliveredCloseStep('issue') && !SKIP_NETWORK && closeIssueNum) {
    const observedIssue = getIssueCloseSnapshot
      ? await getIssueCloseSnapshot(closeIssueNum)
      : { issueClosed: await getIssueClosedState(closeIssueNum), stateReason: null };
    if (observedIssue?.issueClosed === true) {
      if (
        observedIssue.stateReason !== null &&
        String(observedIssue.stateReason || '').toLowerCase() !== 'completed'
      ) {
        console.error(
          `[task-tracker] ⛔ Refusing to close ${closeTarget}: GitHub reports a non-completed close reason.`
        );
        process.exitCode = 1;
        return;
      }
      await markDeliveredCloseStep('issue');
    }
  }
  if (needsDeliveredCloseStep('issue') && !SKIP_NETWORK && closeIssueNum) {
    try {
      await pexec('gh', ['issue', 'close', closeIssueNum, '-R', cfg.repo], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } catch (err) {
      console.error(
        `[task-tracker] ✗ Failed to close ${closeTarget} on GitHub: ${err.message}\n` +
          `Local state left intact — re-run \`/task close ${closeTarget}\` once GitHub is reachable.`
      );
      process.exitCode = 1;
      return;
    }
    await markDeliveredCloseStep('issue');
  }
  if (needsDeliveredCloseStep('labels') && !SKIP_NETWORK && closeIssueNum) {
    let observedLabels;
    try {
      observedLabels = await closeLabelsReader({ pexec, cfg, issueNum: closeIssueNum });
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to finalize ${closeTarget}: labels could not be inspected (${err.message}).`
      );
      process.exitCode = 1;
      return;
    }
    if (!observedLabels.some((label) => label === 'ToDo' || label === 'BLOCKED')) {
      await markDeliveredCloseStep('labels');
    }
  }
  if (needsDeliveredCloseStep('labels') && !SKIP_NETWORK && closeIssueNum) {
    const labelsRemoved = await stripCloseLabels({ pexec, cfg, issueNum: closeIssueNum });
    if (!labelsRemoved) {
      process.exitCode = 1;
      return;
    }
    await markDeliveredCloseStep('labels');
  }
  if (needsDeliveredCloseStep('binding')) {
    let bindingRelease;
    try {
      bindingRelease = await bindingReleaseInspector({ projectDir, issue: s.active });
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to finalize ${closeTarget}: binding release could not be inspected (${err.message}).`
      );
      process.exitCode = 1;
      return;
    }
    // #1490 item 2 — a recovery-backed replacement legitimately owns the binding it
    // rebound after the OLD close, so the inspector's `conflict` is expected for it.
    // Policy lives in `authorizeTerminalBindingRelease`; "recovery-backed" is proven
    // from DURABLE evidence (the body's active transaction named as a durable
    // record's replacement), never an in-memory flag, so an interrupted retry
    // reaches the same verdict. Any failure to prove it falls through to the
    // ordinary refusal.
    let bindingAuthority = { authorized: bindingRelease?.status !== 'conflict', reason: null };
    if (bindingRelease?.status === 'conflict') {
      let replacement = null;
      if (!SKIP_NETWORK && closeIssueNum) {
        try {
          const liveBody = await (
            ctx.readReopenedCloseBody ??
            (async () => {
              const { stdout } = await pexec(
                'gh',
                ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
                { timeout: GH_API_TIMEOUT_MS }
              );
              return String(JSON.parse(String(stdout || '{}')).body ?? '');
            })
          )();
          replacement = findRecoveryBackedReplacement({
            body: liveBody,
            comments: await (
              ctx.listReopenedCloseRecoveryComments ??
              (async () => {
                const { stdout } = await pexec(
                  'gh',
                  [
                    'api',
                    '--paginate',
                    '--slurp',
                    `repos/${cfg.repo}/issues/${closeIssueNum}/comments`,
                  ],
                  { timeout: GH_API_TIMEOUT_MS }
                );
                return JSON.parse(String(stdout || '[]')).flat();
              })
            )(),
            repository: cfg.repo,
            issueNumber: Number(closeIssueNum),
          });
        } catch {
          replacement = null;
        }
      }
      bindingAuthority = authorizeTerminalBindingRelease({
        bindingRelease,
        replacement: replacement?.status === 'found' ? replacement.record : null,
        ownership:
          replacement?.status !== 'found'
            ? null
            : (ctx.resolveReopenedBindingOwnership ?? resolveReopenedBindingOwnership)({
                projectDir,
                issue: s.active,
                sessionId: (ctx.sessionId ?? currentSessionId)(),
                recordedWorktreePath: resolveWorkspaceForIssue({ issueRef: s.active, projectDir }),
              }),
      });
    }
    if (!bindingAuthority.authorized) {
      console.error(
        `[task-tracker] ⛔ Refusing to finalize ${closeTarget}: a newer binding or occupancy claim supersedes the terminal cleanup authority (${bindingAuthority.reason}).`
      );
      process.exitCode = 1;
      return;
    }
    // NOTE: this must be the HEAD of the status chain below, not a standalone `if`.
    // As a separate statement, an authorized `conflict` fell through to the chain's
    // `else if (status !== 'pending')` arm and was refused as an "unknown state" —
    // the authorization would have been granted and then discarded one branch later.
    if (bindingRelease?.status === 'conflict') {
      // The replacement's own post-close rebind: release it and record the step.
      releaseClosedBinding({ ctx, projectDir, issue: s.active });
      await markDeliveredCloseStep('binding');
    } else if (bindingRelease?.status === 'incomplete') {
      try {
        await bindingReleaseResumer({ projectDir, issue: s.active });
      } catch (err) {
        console.error(
          `[task-tracker] ⛔ Refusing to finalize ${closeTarget}: stale binding cleanup could not be resumed (${err.message}).`
        );
        process.exitCode = 1;
        return;
      }
      await markDeliveredCloseStep('binding');
    } else if (bindingRelease?.status === 'released') {
      await markDeliveredCloseStep('binding');
    } else if (bindingRelease?.status !== 'pending') {
      console.error(
        `[task-tracker] ⛔ Refusing to finalize ${closeTarget}: binding release inspection returned an unknown state.`
      );
      process.exitCode = 1;
      return;
    }
  }
  if (needsDeliveredCloseStep('binding')) {
    releaseClosedBinding({ ctx, projectDir, issue: s.active });
    await markDeliveredCloseStep('binding');
  }
  clearActive(statePath);
  // #672 — a lifecycle-tick failure that exhausts its retries previously
  // only surfaced on stderr, easy to miss among the surrounding console.log
  // lines. Fold it
  // into the terminal success line so it's visible in the same output the
  // operator is already reading, without turning close itself into a failure.
  if (lifecycleTickResult && !lifecycleTickResult.ok) {
    console.log(
      `Closed ${s.active}. ⚠ Lifecycle checkboxes could not be auto-ticked — see stderr.`
    );
  } else {
    console.log(`Closed ${s.active}.`);
  }
}

// Caller-side assertion that runLogIssueTime actually persisted fields to
// both the board AND the `<!-- aitm-fields -->` body marker. Guards against
// the silent-swallow class of bug that produced #180 / #165. No env override
// exists.
//
// #300 — delegates to `parseIssueFieldDb`, which uses a line-anchored,
// last-match regex (`NEW_BLOCK_RE`). The previous inline regex (first-match,
// no line anchor) caught literal `<!-- aitm-fields: {...} -->` placeholders
// inside body prose and failed `JSON.parse` on the `{...}` capture. See #298
// for the production case that surfaced this.
export async function assertFieldsPersisted({ cfg, pexec, issueNum }) {
  let body = '';
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    body = String(stdout || '');
  } catch (err) {
    throw new Error(
      `assertFieldsPersisted: could not re-read body for #${issueNum}: ${err.message}. ` +
        `Retry when GitHub is reachable.`
    );
  }
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) {
    if (parsed.reason === 'missing') {
      throw new Error(
        `assertFieldsPersisted: <!-- aitm-fields --> marker missing on #${issueNum} after runLogIssueTime. ` +
          `Board fields almost certainly were not written.`
      );
    }
    // 'invalid-json' | 'invalid-fence' — preserve the legacy "malformed" wording.
    throw new Error(
      `assertFieldsPersisted: malformed aitm-fields JSON on #${issueNum}: ${parsed.reason}`
    );
  }
  const values = parsed.values || {};
  if (values.engagedTime == null) {
    throw new Error(
      `assertFieldsPersisted: aitm-fields.engagedTime is still null on #${issueNum} after runLogIssueTime — ` +
        `field write silently failed.`
    );
  }
}

// #672 — content-integrity guard errors (marker loss, checkbox-proof, etc.)
// are deliberate refusals: re-running the same mutate against the same body
// will fail the same way, so retrying wastes attempts and delays the real
// stderr signal. Only network-class failures (timeouts, dropped connections,
// transient GraphQL 5xx) are worth retrying — those come from `fetchBody`/
// `pushBody` inside `versionedWriteBody`, which has no retry of its own for
// this failure class (see #672 deep-dive), and are not instances of the
// named guard-error classes `issue-body-mutate.mjs` exports.
const LIFECYCLE_TICK_GUARD_ERRORS = new Set([
  'MarkerLossError',
  'CheckboxProofMissingError',
  'MalformedDeclarationCmdError',
  'FabricatedProofError',
  'IncompleteProofError',
  'BodyWriteRefusalError',
]);

const LIFECYCLE_TICK_MAX_ATTEMPTS = 3;
const LIFECYCLE_TICK_RETRY_DELAY_MS = 500;

// Tick the Lifecycle DoD items the close verb is responsible for. Best-effort:
// missing section or already-ticked items are no-ops; a bounded number of
// network-class failures are retried (#672 — the underlying GraphQL calls
// have no retry of their own and this environment has observed transient TLS
// timeouts), but the close path is never blocked — on final failure the
// caller is told via the returned `{ ok: false, message }` so it can surface
// a warning in the close summary instead of only writing to stderr.
export async function tickLifecycleOnClose({ cfg, issueNum, pexec, deps = {} }) {
  const mutateBody =
    deps.mutateIssueBody || (await import('../lib/issue-body-mutate.mjs')).mutateIssueBody;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = null;
  for (let attempt = 1; attempt <= LIFECYCLE_TICK_MAX_ATTEMPTS; attempt++) {
    try {
      await mutateBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        mutate: (base) => {
          let next = tickLifecycleItem(base, 'story-closed');
          next = tickLifecycleItem(next, 'timing-flushed');
          return next;
        },
        // These two lifecycle checkboxes (`story-closed`, `timing-flushed`) are
        // ticked by the close verb itself — the close action is the verifier, not
        // an agent pre-tick. The #362 checkbox-proof gate would otherwise refuse
        // them for lacking an adjacent proof marker. Mirror the #363 precedent in
        // approve.mjs and bypass the gate scoped to this single call site only;
        // every other mutateIssueBody call in this file keeps the gate enforced.
        allowUnverifiedTicks: true,
        deps: { pexec },
      });
      return { ok: true };
    } catch (err) {
      lastErr = err;
      const isGuardError = LIFECYCLE_TICK_GUARD_ERRORS.has(err.name);
      if (isGuardError || attempt === LIFECYCLE_TICK_MAX_ATTEMPTS) break;
      await sleep(LIFECYCLE_TICK_RETRY_DELAY_MS * attempt);
    }
  }
  const message = `lifecycle-tick best-effort failed: ${lastErr.message}`;
  process.stderr.write(`⚠ ${message}\n`);
  return { ok: false, message };
}
