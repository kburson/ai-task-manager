// @story #561
// Capability decomposition for the runtime context.
//
// `buildContext()` (runtime.mjs) historically returned a single flat object
// carrying ~25 unrelated members — argv, project config, timing recorders,
// state-mutation runners, and GitHub read helpers all on one surface. Verbs
// destructured whatever they liked from it, so the dependency surface of any
// one verb was invisible and a "narrow fixture" was impossible to construct.
//
// This module groups the flat members into named CAPABILITY OBJECTS without
// moving their implementations. `buildContext` still owns the function bodies
// (several #558-style characterization tests pin them textually to runtime.mjs);
// it calls `assembleCapabilities(ctx)` at the end and `Object.assign`s the
// grouped objects onto the same ctx. The flat members remain for back-compat,
// so no existing verb breaks, while migrated verbs (see verbs/close.mjs) can
// read a narrow `{ projectConfig, timingRecorder, stateRunner, githubClient }`
// interface and be exercised against a small hand-built fixture.

import { mutateIssueBody } from './issue-body-mutate.mjs';

// The member surface of each capability, in dependency-interface terms. Tests
// assert the assembled objects expose exactly these keys, so a member that
// migrates between capabilities (or a new collaborator) is a deliberate,
// reviewable change rather than a silent drift.
export const CAPABILITY_SURFACES = {
  projectConfig: [
    'cfg',
    'projectDir',
    'statePath',
    'queuePath',
    'SKIP_NETWORK',
    'pexec',
    'nowIso',
    'minutesBetween',
    'CLOSE_OWNED_CHECKBOXES',
    'uncheckedPreCloseCheckboxes',
  ],
  timingRecorder: [
    'safePostTiming',
    'safeRecordSessionRef',
    'drainQueueIfAny',
    'flushQueueFor',
    'flushAndForgetQueueFor',
    'flushActiveToGH',
  ],
  stateRunner: ['runLogIssueTime', 'runMigrate', 'runMoveState', 'runMoveStateDone'],
  githubClient: [
    'worktreeLabel',
    'buildStateOptionMap',
    'fetchSubIssueBoardSnapshot',
    'fetchSubIssues',
    'fetchParentIssue',
    'getIssueBoardState',
    'getIssueCloseSnapshot',
    'getIssueClosedState',
  ],
  issueBodyMutator: ['mutate'],
};

// Pluck the listed keys off the flat ctx into a fresh object. Functions are
// carried by reference, so the grouped surface and the flat member are the
// same callable — assembling is free and back-compat is exact.
function pick(ctx, keys) {
  const out = {};
  for (const k of keys) out[k] = ctx[k];
  return out;
}

// Build the grouped capability objects from a fully-populated flat ctx. The
// issueBodyMutator is the one capability that is not a straight re-grouping:
// it wraps `mutateIssueBody` so the caller's `pexec` is threaded in without the
// verb having to know the helper's `deps` shape — the narrow seam verbs migrate
// to instead of importing `mutateIssueBody` and `pexec` plumbing directly.
export function assembleCapabilities(ctx) {
  const projectConfig = pick(ctx, CAPABILITY_SURFACES.projectConfig);
  const timingRecorder = pick(ctx, CAPABILITY_SURFACES.timingRecorder);
  const stateRunner = pick(ctx, CAPABILITY_SURFACES.stateRunner);
  const githubClient = pick(ctx, CAPABILITY_SURFACES.githubClient);
  const issueBodyMutator = {
    mutate: (args) => mutateIssueBody({ deps: { pexec: ctx.pexec }, ...args }),
  };
  return { projectConfig, timingRecorder, stateRunner, githubClient, issueBodyMutator };
}
