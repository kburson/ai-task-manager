// @story #925
// Shared harness for the close-convergence-wiring test pair (kept out of
// *.test.mjs so it is exempt from the line-cap and story-tag test-file
// audits, which only scan `*.test.mjs`; see lib/discover-test-files.mjs).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { readDeliveredCloseTransactions } from '../../task-tracker/lib/close-convergence.mjs';
import { tickLifecycleOnClose, verbClose } from '../../task-tracker/verbs/close.mjs';

export function closeBody({ agentReview = 'x', finalReview = 'x' } = {}) {
  return [
    '## Acceptance Criteria',
    '',
    '- [x] Delivered behavior is verified',
    '',
    '### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass',
    '- [x] Lint and format checks pass',
    '',
    '### Lifecycle (verified at Review)',
    '',
    `- [${agentReview}] Agent Review Passed`,
    `- [${finalReview}] Final Review Passed`,
    '',
    '### Housekeeping (verified at Close)',
    '',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {"engagedTime":42,"idleTime":0} -->',
    '',
  ].join('\n');
}

export function baseState(issueNumber = 925) {
  return {
    active: `#${issueNumber}`,
    lastActive: `#${issueNumber}`,
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
  };
}

export async function runClose({
  issueNumber = 925,
  repository = 'o/r',
  boardState = 'review',
  closeSnapshot = { issueClosed: true, stateReason: 'completed' },
  body = closeBody(),
  bodyReadError = null,
  childSnapshot = { status: 'ok', children: [] },
  timingBody = '',
  timingResult = { ok: true },
  convergenceTailProfile,
  gateReviewToDone,
  mutationResult,
  omitIssueBodyMutator = false,
  delegateLifecycleHelper = false,
  captureCalls,
  captureFinalState,
  initialState = baseState(issueNumber),
  deliveryRefusal = null,
  deliveryGateInput = null,
  reviewAuthorization = { mode: 'human', standing: true, source: 'test-evidence' },
  reviewAuthorizationResolver = null,
  useInjectedReviewAuthorization = true,
  useInjectedDeliveryGateInput = true,
  useInjectedDeliveryReceipt = true,
  useInjectedFreshDeliveryVerification = useInjectedDeliveryReceipt,
  deliveryVerificationDeps = null,
  lifecycleEvidence = null,
  localHeadSha = 'a'.repeat(40),
  loadCurrentSession = null,
  loadRawProjectConfig = null,
  pexecOverride = null,
  terminalDisposition,
  terminalDispositionError = null,
  liveLabels = ['ToDo', 'BLOCKED'],
  labelReadError = null,
  labelWriteError = null,
  bindingReleased = false,
  bindingReleaseStatus = bindingReleased ? 'released' : 'pending',
  bindingReadError = null,
  bindingResumeError = null,
  force = false,
  extraRest = [],
  restartStaleTransaction = false,
  supersessionComments = [],
  supersessionCommentListError = null,
  supersessionCommentCreateError = null,
  supersessionCommentReadError = null,
  supersessionCommentReadTransform = null,
  replacementTransactionId = 'replacement-close-transaction',
  dirtyWorkspace = { dirty: false, total: 0, files: [] },
  acceptedSha = 'a'.repeat(40),
  createEstimationOutcomeWriter = null,
  trackEstimationOutcomes = false,
} = {}) {
  const dir = mkdtempSync(join(projectScratchDir('test'), `aitm-${issueNumber}-close-wiring-`));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(initialState));

  let liveBody = body;
  const calls = {
    boardReads: 0,
    bodyReads: 0,
    bindingReleases: 0,
    childSnapshots: 0,
    closeSnapshotReads: 0,
    drains: 0,
    flushes: 0,
    issueCloses: 0,
    labelReads: 0,
    labelWrites: 0,
    bindingReads: 0,
    bindingResumes: 0,
    lifecycleFallbacks: 0,
    lifecycleExpectedShas: [],
    lifecycleReconciles: 0,
    logIssueTime: 0,
    movesToDone: [],
    movesToReview: [],
    mutations: 0,
    networkCalls: 0,
    providerActions: 0,
    issueRecordCreates: 0,
    reopens: 0,
    timingReads: 0,
    timingRows: [],
    terminalDispositions: 0,
    estimationOutcomes: 0,
    freshDeliveryVerifications: 0,
    freshDeliveryInputs: [],
    order: [],
    supersessionCommentLists: 0,
    supersessionCommentCreates: 0,
    supersessionCommentReads: 0,
  };
  captureCalls?.(calls);
  const projectConfig = {
    cfg: {
      repo: repository,
      trunkRef: 'trunk',
      fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true },
    },
    statePath,
    projectDir: dir,
    SKIP_NETWORK: false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
    pexec: async (command, args = []) => {
      calls.networkCalls += 1;
      if (pexecOverride) {
        const overridden = await pexecOverride(command, args);
        if (overridden !== undefined) return overridden;
      }
      if (command === 'git' && args[0] === 'branch') {
        return { stdout: 'trunk\n', stderr: '' };
      }
      if (command === 'git' && args[0] === 'rev-parse') {
        return { stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        return { stdout: '[]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view' && args.includes('body')) {
        calls.bodyReads += 1;
        if (bodyReadError) throw bodyReadError;
        return {
          stdout: args.includes('--jq') ? liveBody : JSON.stringify({ body: liveBody }),
          stderr: '',
        };
      }
      if (args[0] === 'issue' && args[1] === 'close') calls.issueCloses += 1;
      if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--remove-label')) {
        if (labelWriteError) throw labelWriteError;
        calls.labelWrites += 1;
      }
      if (args[0] === 'issue' && args[1] === 'reopen') calls.reopens += 1;
      return { stdout: '{}', stderr: '' };
    },
  };
  const timingRecorder = {
    drainQueueIfAny: async () => {
      calls.drains += 1;
    },
    flushAndForgetQueueFor: async () => {
      calls.flushes += 1;
      return { delivered: 0, discarded: 0 };
    },
    safePostTiming: async (_target, row) => {
      calls.timingRows.push(row);
      return timingResult;
    },
  };
  const stateRunner = {
    runMoveState: async (target, state, options) => {
      calls.movesToReview.push({ target, state, options });
      return { ok: true, benign: false };
    },
    runMoveStateDone: async (target, options) => {
      calls.movesToDone.push({ target, options });
      return { ok: true, benign: false };
    },
    runLogIssueTime: async () => {
      calls.logIssueTime += 1;
    },
  };
  const githubClient = {
    getIssueBoardState: async () => {
      calls.boardReads += 1;
      return boardState;
    },
    getIssueCloseSnapshot: async () => {
      calls.closeSnapshotReads += 1;
      return closeSnapshot;
    },
    fetchSubIssues: async () => [],
    fetchSubIssueBoardSnapshot: async () => {
      calls.childSnapshots += 1;
      return childSnapshot;
    },
  };
  const issueBodyMutator = {
    mutate: async ({ mutate }) => {
      calls.mutations += 1;
      calls.order.push('body:mutate');
      const nextBody = mutate(liveBody);
      const result =
        typeof mutationResult === 'function'
          ? mutationResult({ currentBody: liveBody, nextBody })
          : mutationResult === undefined
            ? { status: 'ok', body: nextBody }
            : mutationResult;
      if (typeof result?.body === 'string') liveBody = result.body;
      else if (mutationResult === undefined) liveBody = nextBody;
      return result;
    },
  };
  const liveSupersessionComments = structuredClone(supersessionComments);
  const previousDirty = process.env.TT_SKIP_DIRTY_CHECK;
  const previousProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const previousExitCode = process.exitCode;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  if (gateReviewToDone !== undefined) {
    const configDir = join(dir, '.ai-task-manager');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'task-tracker.json'), JSON.stringify({ gateReviewToDone }));
  }
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  process.exitCode = 0;
  let result;
  try {
    result = await verbClose({
      rest: [
        `#${issueNumber}`,
        ...(restartStaleTransaction ? ['--restart-stale-transaction'] : []),
        ...(force ? ['--force'] : []),
        ...extraRest,
      ],
      projectConfig,
      timingRecorder,
      stateRunner,
      githubClient,
      ...(!omitIssueBodyMutator ? { issueBodyMutator } : {}),
      convergenceTailProfile,
      preserveActiveOnConvergence: true,
      checkDirtyWorkspace: async () => dirtyWorkspace,
      randomUUIDFn: () => replacementTransactionId,
      listDeliveredCloseSupersessionComments: async () => {
        calls.supersessionCommentLists += 1;
        calls.order.push('comment:list');
        if (supersessionCommentListError) throw supersessionCommentListError;
        return structuredClone(liveSupersessionComments);
      },
      createDeliveredCloseSupersessionComment: async (commentBody) => {
        calls.supersessionCommentCreates += 1;
        calls.order.push('comment:create');
        if (supersessionCommentCreateError) throw supersessionCommentCreateError;
        const comment = {
          id: 77,
          body: commentBody,
          user: { login: 'kburson' },
          created_at: '2026-08-31T21:00:00Z',
          updated_at: '2026-08-31T21:00:00Z',
          issue_url: `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
        };
        liveSupersessionComments.push(comment);
        return structuredClone(comment);
      },
      readDeliveredCloseSupersessionComment: async (id) => {
        calls.supersessionCommentReads += 1;
        calls.order.push('comment:read');
        if (supersessionCommentReadError) throw supersessionCommentReadError;
        const comment = structuredClone(
          liveSupersessionComments.find((candidate) => String(candidate.id) === String(id))
        );
        return supersessionCommentReadTransform
          ? supersessionCommentReadTransform(comment)
          : comment;
      },
      tickLifecycleOnClose: delegateLifecycleHelper
        ? async (args) =>
            tickLifecycleOnClose({
              ...args,
              deps: {
                ...args.deps,
                mutateIssueBody:
                  args.deps?.mutateIssueBody ??
                  (async () => {
                    calls.lifecycleFallbacks += 1;
                    const error = new Error('raw lifecycle mutator fallback would be reached');
                    error.name = 'BodyWriteRefusalError';
                    throw error;
                  }),
                sleep: async () => {},
              },
            })
        : async () => {
            calls.lifecycleReconciles += 1;
            return { ok: true };
          },
      readTimingCommentBody: async () => {
        calls.timingReads += 1;
        return {
          status: 'found',
          body: timingBody,
          error: null,
        };
      },
      reconcileReviewApprovedTiming: async () => ({ status: 'posted' }),
      writeTerminalDisposition: async () => {
        calls.terminalDispositions += 1;
        return { status: 'ok' };
      },
      readTerminalDisposition: async () => {
        if (terminalDispositionError) throw terminalDispositionError;
        if (terminalDisposition !== undefined) return terminalDisposition;
        const initial = readDeliveredCloseTransactions(body);
        return initial[0]?.completedSteps.includes('disposition') ? 'Delivered' : null;
      },
      readCloseLabels: async () => {
        calls.labelReads += 1;
        if (labelReadError) throw labelReadError;
        return [...liveLabels];
      },
      inspectTerminalIssueBindingRelease: async () => {
        calls.bindingReads += 1;
        if (bindingReadError) throw bindingReadError;
        return { status: bindingReleaseStatus, closedAt: '2026-08-28T00:00:00.000Z' };
      },
      resumeTerminalIssueBindingRelease: async () => {
        calls.bindingResumes += 1;
        if (bindingResumeError) throw bindingResumeError;
        return { status: 'released' };
      },
      applyReviewDelta: async () => ({ status: 'skipped' }),
      ...(createEstimationOutcomeWriter ? { createEstimationOutcomeWriter } : {}),
      ...(trackEstimationOutcomes
        ? {
            estimationOutcomeWriter: async () => {
              calls.estimationOutcomes += 1;
              return { status: 'existing' };
            },
          }
        : {}),
      releaseIssueBindings: () => {
        calls.bindingReleases += 1;
        return { released: [] };
      },
      deregisterTask: () => {},
      releaseBindingOccupancy: () => ({ status: 'released' }),
      loadCloseDeliveryBody: async () => liveBody,
      locateAuthoritySource: lifecycleEvidence
        ? () => ({ kind: 'github-records/v1' })
        : () => ({ kind: 'legacy-body/v1' }),
      getHeadSha: async () => localHeadSha,
      resolveLifecycleEvidence: async (input) => {
        calls.lifecycleExpectedShas.push(input.expectedSha);
        return lifecycleEvidence;
      },
      resolveCloseParentIssue: async () => null,
      ...(loadCurrentSession ? { loadCurrentSession } : {}),
      ...(loadRawProjectConfig ? { loadRawProjectConfig } : {}),
      ...(deliveryVerificationDeps ?? {}),
      ...(useInjectedDeliveryGateInput
        ? {
            loadCloseDeliveryGateInput: async () =>
              deliveryGateInput ?? {
                issueNumber,
                lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
                branch: `feature/${issueNumber}`,
                acceptedSha,
                localHeadSha: acceptedSha,
                pullRequests: [],
                records: null,
              },
          }
        : {}),
      ...(useInjectedReviewAuthorization
        ? {
            resolveReviewAuthorization: reviewAuthorizationResolver ?? (() => reviewAuthorization),
          }
        : {}),
      ...(useInjectedDeliveryReceipt
        ? {
            requireDeliveryReceipt: () => {
              if (deliveryRefusal) throw deliveryRefusal;
              return { skipped: false, receipt: {} };
            },
          }
        : {}),
      ...(useInjectedFreshDeliveryVerification
        ? {
            verifyCloseDeliveryReceipt: async ({ gateInput, receiptGate }) => {
              calls.freshDeliveryVerifications += 1;
              calls.freshDeliveryInputs.push(gateInput);
              return { skipped: false, receipt: receiptGate.receipt, gateInput };
            },
          }
        : {}),
    });
    return {
      result,
      calls,
      body: liveBody,
      supersessionComments: liveSupersessionComments,
      exitCode: process.exitCode,
    };
  } finally {
    if (previousDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = previousDirty;
    if (previousProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = previousProjectDir;
    process.exitCode = previousExitCode;
    captureFinalState?.(readFileSync(statePath, 'utf8'));
    rmSync(dir, { recursive: true, force: true });
  }
}
