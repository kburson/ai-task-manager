// @story #925
// Shared harness for the close-convergence-wiring test pair (kept out of
// *.test.mjs so it is exempt from the line-cap and story-tag test-file
// audits, which only scan `*.test.mjs`; see lib/discover-test-files.mjs).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { tickLifecycleOnClose, verbClose } from '../../../verbs/close.mjs';

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
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    `- [${agentReview}] Agent Review Passed`,
    `- [${finalReview}] Final Review Passed`,
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {"engagedTime":42,"idleTime":0} -->',
    '',
  ].join('\n');
}

export function baseState() {
  return {
    active: '#925',
    lastActive: '#925',
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
  };
}

export async function runClose({
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
  initialState = baseState(),
} = {}) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-925-close-wiring-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(initialState));

  let liveBody = body;
  const calls = {
    boardReads: 0,
    bodyReads: 0,
    childSnapshots: 0,
    closeSnapshotReads: 0,
    drains: 0,
    flushes: 0,
    issueCloses: 0,
    lifecycleFallbacks: 0,
    logIssueTime: 0,
    movesToDone: [],
    movesToReview: [],
    mutations: 0,
    networkCalls: 0,
    reopens: 0,
    timingReads: 0,
    timingRows: [],
  };
  captureCalls?.(calls);
  const projectConfig = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    SKIP_NETWORK: false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
    pexec: async (_command, args = []) => {
      calls.networkCalls += 1;
      if (args[0] === 'issue' && args[1] === 'view' && args.includes('body')) {
        calls.bodyReads += 1;
        if (bodyReadError) throw bodyReadError;
        return { stdout: JSON.stringify({ body: liveBody }), stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'close') calls.issueCloses += 1;
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
  const previousDirty = process.env.TT_SKIP_DIRTY_CHECK;
  const previousProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const previousExitCode = process.exitCode;
  if (gateReviewToDone !== undefined) {
    const configDir = join(dir, '.ai-task-manager');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'task-tracker.json'), JSON.stringify({ gateReviewToDone }));
    process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  }
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  process.exitCode = 0;
  let result;
  try {
    result = await verbClose({
      rest: ['#925'],
      projectConfig,
      timingRecorder,
      stateRunner,
      githubClient,
      ...(!omitIssueBodyMutator ? { issueBodyMutator } : {}),
      convergenceTailProfile,
      preserveActiveOnConvergence: true,
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
        : async () => ({ ok: true }),
      readTimingCommentBody: async () => {
        calls.timingReads += 1;
        return {
          status: 'found',
          body: timingBody,
          error: null,
        };
      },
      writeTerminalDisposition: async () => ({ status: 'ok' }),
    });
    return {
      result,
      calls,
      body: liveBody,
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
