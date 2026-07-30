import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { loadState, saveState, advanceWordMarker } from '../state.mjs';
import {
  setTaskStatus,
  registerTask,
  currentBranch,
  registerTaskProjection,
  readFleet,
  fleetRegistryPath,
  findMainWorktreePath,
} from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  loadMarker,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { verbSwitch } from './switch.mjs';
import { getActiveTask, setActiveTask } from '../session-state.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';
import { runReadOnlyBindPreflight } from '../lib/verb-preflight.mjs';
import {
  claimAssignee,
  formatClaimAuditComment,
  reconcileClaimAuditProjection,
} from '../lib/assignee-guard.mjs';
import {
  coordinateWorkLeaseAcquire,
  coordinateWorkLeaseResume,
  createWorkLeaseHeartbeat,
} from '../lib/work-lease/guard.mjs';
import { enqueueTimingProjection } from '../queue.mjs';
import {
  resolveBindEvent,
  timingCommentHasRows,
  assertPairedReengagement,
  detectUnmarkedDepartureGap,
  shouldSuppressActiveBindEvent,
} from '../lib/bind-event.mjs';
import {
  isPickupDirectiveEligible,
  formatPickupDirectiveDeferredBanner,
} from '../lib/pickup-directive-gate.mjs';
import { runMoveInvariantAudit } from '../lib/verify-move-invariants.mjs';

export async function renewWorkLeaseBeforeResume(ctx, { issue, sessionId } = {}) {
  if (typeof ctx?.getWorkLeaseStore !== 'function') {
    throw new Error('resume requires a lazy work-lease authority');
  }
  if (typeof ctx?.getWorkLeaseIdentity !== 'function') {
    throw new Error('resume requires trusted runtime holder identity');
  }
  const identity = ctx.getWorkLeaseIdentity();
  return ctx.verifyGovernedEffect({
    issueId: String(issue ?? '').replace(/^#/, ''),
    sessionId,
    projectDir: ctx.projectDir,
    hostId: identity.hostId,
    operation: 'task-bind',
    store: ctx.getWorkLeaseStore(),
    forceRenewal: true,
    holderIdentity: {
      provider: identity.provider,
      agentRunId: identity.agentRunId,
    },
  });
}

// #475 AC2 — idle span of a pause window in whole seconds. Returns 0 when no
// `pausedAtTs` was recorded (e.g. resuming after a stop rather than a pause, or
// a legacy state file predating the field) or when the clock would yield a
// negative span.
export function computePauseIdleSec(pausedAtTs, resumeTs) {
  if (!pausedAtTs) return 0;
  const a = new Date(pausedAtTs).getTime();
  const b = new Date(resumeTs).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

// #666 — the current session's own bound issue (normalized to `#N`), or null when
// this session holds no per-session record. Source of truth for the switch-vs-
// fresh-bind decision; the global pointer is only a cross-session cache.
function ownBoundIssue(projectDir) {
  let sid;
  try {
    sid = currentSessionId();
  } catch {
    return null;
  }
  if (!sid) return null;
  const session = getActiveTask(sid, projectDir);
  const issue = session?.issue ?? session?.leaseIssue;
  if (typeof issue !== 'string' || !issue) return null;
  return /^#/.test(issue) ? issue : `#${issue}`;
}

function durableJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function projectionProof(projectionName, projectionId) {
  return { reconciled: true, projectionName, projectionId };
}

function canonicalIssueRef(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  if (!match) throw new Error('resume requires a canonical issue number');
  return `#${match[1]}`;
}

function heartbeatOwnerKey(sessionId, lease) {
  return [sessionId, lease.projectId, lease.leaseId, lease.fencingToken, lease.worktreeId].join(
    ':'
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateSessionProjectionInput(input) {
  if (
    !isPlainObject(input) ||
    !isNonEmptyString(input.sessionId) ||
    !isPlainObject(input.state) ||
    !isPlainObject(input.activeTask) ||
    !/^#[1-9]\d*$/.test(input.activeTask.issue) ||
    !isNonEmptyString(input.activeTask.entryStartTs) ||
    !Number.isSafeInteger(input.activeTask.wordsAtStart) ||
    input.activeTask.wordsAtStart < 0 ||
    !isNonEmptyString(input.activeTask.boundAt) ||
    !isPlainObject(input.orphanFinalize) ||
    typeof input.orphanFinalize.enabled !== 'boolean' ||
    input.orphanFinalize.sessionId !== input.sessionId ||
    !isNonEmptyString(input.orphanFinalize.reason) ||
    (input.kanbanState !== null && !isNonEmptyString(input.kanbanState)) ||
    (input.reviewRemediationHint !== null && !isNonEmptyString(input.reviewRemediationHint))
  ) {
    throw new Error('persisted session projection is malformed');
  }
  if (
    input.marker !== null &&
    (!isPlainObject(input.marker) ||
      !isNonEmptyString(input.marker.path) ||
      !Number.isSafeInteger(input.marker.totalLines) ||
      input.marker.totalLines < 0 ||
      !Number.isSafeInteger(input.marker.words) ||
      input.marker.words < 0 ||
      input.marker.issue !== input.activeTask.issue)
  ) {
    throw new Error('persisted session marker projection is malformed');
  }
}

async function applySessionProjection(ctx, { input, lease }) {
  if (typeof ctx.applyWorkLeaseSessionProjection === 'function') {
    await ctx.applyWorkLeaseSessionProjection({ input, lease });
    return;
  }
  validateSessionProjectionInput(input);
  if (input.orphanFinalize?.enabled) {
    await finalizeOrphanPause({
      sid: input.orphanFinalize.sessionId,
      reason: input.orphanFinalize.reason,
      projDir: ctx.projectDir,
    });
  }
  if (input.marker) {
    saveMarker(input.marker.path, input.marker.totalLines, input.marker.words, input.marker.issue);
  }
  saveState(input.state, ctx.statePath);
  const current = getActiveTask(input.sessionId, ctx.projectDir) ?? {};
  setActiveTask(
    input.sessionId,
    {
      ...current,
      ...input.activeTask,
      lease,
      kanbanState: input.kanbanState,
    },
    ctx.projectDir
  );
  const persisted = getActiveTask(input.sessionId, ctx.projectDir);
  const expectedGlobal = { ...input.state };
  delete expectedGlobal.state;
  const persistedGlobal = JSON.parse(readFileSync(ctx.statePath, 'utf8'));
  if (
    persisted?.issue !== input.activeTask.issue ||
    persisted?.entryStartTs !== input.activeTask.entryStartTs ||
    persisted?.wordsAtStart !== input.activeTask.wordsAtStart ||
    persisted?.boundAt !== input.activeTask.boundAt ||
    persisted?.lease?.projectId !== lease.projectId ||
    persisted?.lease?.leaseId !== lease.leaseId ||
    persisted?.lease?.fencingToken !== lease.fencingToken ||
    persisted?.lease?.worktreeId !== lease.worktreeId ||
    persisted?.kanbanState !== input.kanbanState ||
    !isDeepStrictEqual(persistedGlobal, durableJson(expectedGlobal))
  ) {
    throw new Error('session projection read-back does not match');
  }
  if (input.marker) {
    const marker = loadMarker(input.marker.path);
    if (marker.line !== input.marker.totalLines || marker.words !== input.marker.words) {
      throw new Error('session marker projection read-back does not match');
    }
  }
}

async function applyFleetProjection(ctx, { input, projectionId }) {
  if (typeof ctx.applyWorkLeaseFleetProjection === 'function') {
    await ctx.applyWorkLeaseFleetProjection({ input, projectionId });
    return;
  }
  if (!input || typeof input !== 'object' || !input.issue || !input.branch) {
    throw new Error('persisted fleet projection is malformed');
  }
  registerTaskProjection(ctx.projectDir, input, projectionId);
  const registry = fleetRegistryPath(findMainWorktreePath(ctx.projectDir));
  const entry = readFleet(registry)[input.issue];
  if (
    !entry ||
    entry.worktreePath !== input.worktreePath ||
    entry.branch !== input.branch ||
    entry.status !== 'active' ||
    entry.projectionId !== projectionId
  ) {
    throw new Error('fleet projection read-back does not match');
  }
}

async function applyTimingProjection(ctx, { input, projectionId }) {
  if (typeof ctx.applyWorkLeaseTimingProjection === 'function') {
    await ctx.applyWorkLeaseTimingProjection({ input, projectionId });
    return;
  }
  if (
    !isPlainObject(input) ||
    !isNonEmptyString(input.issueNumber) ||
    !isPlainObject(input.decision) ||
    !['bind', 'resume', 'self'].includes(input.decision.mode) ||
    (input.decision.selectedEvent !== null && !isNonEmptyString(input.decision.selectedEvent)) ||
    (input.decision.emittedEvent !== null && !isNonEmptyString(input.decision.emittedEvent)) ||
    !Number.isSafeInteger(input.decision.idleSec) ||
    input.decision.idleSec < 0 ||
    typeof input.decision.suppressed !== 'boolean' ||
    (input.decision.syntheticGap !== null &&
      (!isPlainObject(input.decision.syntheticGap) ||
        !isNonEmptyString(input.decision.syntheticGap.syntheticTs) ||
        !Number.isFinite(input.decision.syntheticGap.gapSec) ||
        input.decision.syntheticGap.gapSec < 0 ||
        !Number.isSafeInteger(input.decision.syntheticGap.wordMarker) ||
        input.decision.syntheticGap.wordMarker < 0)) ||
    !Array.isArray(input.rows)
  ) {
    throw new Error('persisted timing projection is malformed');
  }
  for (const item of input.rows) {
    if (
      !isPlainObject(item) ||
      !isNonEmptyString(item.row) ||
      !isNonEmptyString(item.subOperationId) ||
      item.projectionId !== projectionId
    ) {
      throw new Error('persisted timing projection row is malformed');
    }
  }
  if (input.rows.length === 0) return;
  await ctx.drainQueueIfAny();
  const gh = await import('../gh-timing-comment.mjs');
  const post = ctx.postTimingProjection ?? gh.postTimingEvent;
  for (const item of input.rows) {
    try {
      await post({
        issueNumber: input.issueNumber,
        repo: input.repo,
        row: item.row,
        projectionId,
        subOperationId: item.subOperationId,
        projDir: ctx.projectDir,
      });
    } catch (error) {
      enqueueTimingProjection(
        {
          issue: input.issueNumber,
          row: item.row,
          projectionId,
          subOperationId: item.subOperationId,
        },
        ctx.queuePath
      );
      throw error;
    }
  }
  const readProjection = ctx.readTimingProjection ?? gh.readTimingProjection;
  const proof = await readProjection({
    issueNumber: input.issueNumber,
    repo: input.repo,
    projectionId,
    subOperationIds: input.rows.map((item) => item.subOperationId),
  });
  if (proof?.reconciled !== true || proof.projectionId !== projectionId) {
    throw new Error('timing projection remote read-back does not match');
  }
}

async function applyGithubProjection(ctx, { input, projectionId }) {
  if (typeof ctx.applyWorkLeaseGithubProjection === 'function') {
    await ctx.applyWorkLeaseGithubProjection({ input, projectionId });
    return;
  }
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.issueNumber !== 'string' ||
    typeof input.claimRequired !== 'boolean'
  ) {
    throw new Error('persisted GitHub projection is malformed');
  }
  if (!input.claimRequired) return;
  if (typeof input.auditBody !== 'string' || input.auditBody === '') {
    throw new Error('persisted GitHub claim audit is malformed');
  }
  const reconcile = ctx.reconcileClaimAuditProjection ?? reconcileClaimAuditProjection;
  const proof = await reconcile({
    issueNumber: input.issueNumber,
    repo: input.repo,
    projectionId,
    body: input.auditBody,
    listComments: ctx.listIssueComments,
    postComment: ctx.postIssueComment,
  });
  if (proof?.reconciled !== true || proof.projectionId !== projectionId) {
    throw new Error('GitHub projection remote read-back does not match');
  }
}

async function buildGovernedBindPlan(
  ctx,
  { target, state, sessionId, mode, operation, requestId }
) {
  const ts = ctx.nowIso();
  let wordsAtStart = state.wordsAtEntryStart ?? 0;
  let totalLines = 0;
  if (sessionId) {
    const counted = countWords(jsonlPath(sessionId), 0);
    totalLines = counted.totalLines;
    wordsAtStart = counted.count;
  }
  const carriedMarker = advanceWordMarker(state.lastWordMarker, wordsAtStart);
  const paused = mode === 'resume';
  const nextState =
    mode === 'self'
      ? { ...state }
      : {
          ...state,
          active: target,
          lastActive: target,
          entryStartTs: ts,
          wordsAtEntryStart: wordsAtStart,
          pausedAtTs: null,
          lastWordMarker: carriedMarker,
        };
  delete nextState.paused;
  delete nextState.pauseReasonSlug;
  delete nextState.pauseReasonText;

  const gh = await import('../gh-timing-comment.mjs');
  const { buildBackdatedDepartureRow, buildRow } = gh;
  const rows = [];
  let timingSelectedEvent = null;
  let timingSuppressed = false;
  let timingSyntheticGap = null;
  const timingIdleSec = computePauseIdleSec(state.pausedAtTs, ts);
  if (mode !== 'self') {
    let event = 'start';
    let description = ctx.role ?? 'task started';
    if (paused) {
      event = `resume:${state.pauseReasonSlug || 'other'}`;
      description = state.pauseReasonText || ctx.role || 'task resumed';
    } else if (ctx.cfg?.repo) {
      const read = ctx.readTimingCommentBody ?? gh.readTimingCommentBody;
      const result = await read({
        issueNumber: target.replace(/^#/, ''),
        repo: ctx.cfg.repo,
      });
      const body = gh.bodyOf(result);
      event = resolveBindEvent({
        hasTimingHistory: timingCommentHasRows(body),
        paused: !!state.pausedAtTs,
        timingBody: body,
        readStatus: result?.status ?? null,
      });
      const pairing = assertPairedReengagement(body, event);
      if (!pairing.ok && result?.status !== 'error' && !timingCommentHasRows(body)) {
        event = 'start';
      }
      if (event !== 'start' && result?.status !== 'error') {
        const gap = detectUnmarkedDepartureGap(body, ts);
        if (gap) {
          timingSyntheticGap = {
            syntheticTs: gap.syntheticTs,
            gapSec: gap.gapSec,
            wordMarker: gap.wordMarker,
          };
          rows.push({
            row: buildBackdatedDepartureRow({
              ts: gap.syntheticTs,
              event: 'pause:auto-detected-gap',
              wordMarker: gap.wordMarker,
              description: `resume after a ${Math.round(gap.gapSec / 3600)}h gap with no departure row — synthetic departure inserted per #981 so the gap reclassifies as idle`,
            }),
            subOperationId: 'synthetic-departure',
          });
        }
      }
      timingSelectedEvent = event;
      timingSuppressed = shouldSuppressActiveBindEvent({
        timingBody: body,
        readStatus: result?.status ?? null,
        paused: !!state.pausedAtTs,
        nowTs: ts,
      });
      if (timingSuppressed) {
        event = null;
      }
      description = ctx.role ?? (event === 'start' ? 'task started' : 'task resumed');
    }
    timingSelectedEvent ??= event;
    if (event) {
      rows.push({
        row: buildRow({
          ts,
          event: event,
          activeSec: 0,
          idleSec: timingIdleSec,
          deltaWords: 0,
          wordMarker: carriedMarker,
          description,
        }),
        subOperationId: 'bind',
      });
    }
  }

  const idempotencyKey = `${operation}:${sessionId}:${target.replace(/^#/, '')}:${requestId}`;
  const timingProjectionId = `${operation}:${idempotencyKey}:timing`;
  const projectionInputs = {
    session: durableJson({
      sessionId,
      state: nextState,
      activeTask: {
        issue: target,
        entryStartTs: nextState.entryStartTs,
        wordsAtStart: nextState.wordsAtEntryStart,
        boundAt: ts,
      },
      marker:
        mode === 'self'
          ? null
          : {
              path: markerPathFor(sessionId),
              totalLines,
              words: wordsAtStart,
              issue: target,
            },
      orphanFinalize: {
        enabled: mode !== 'self',
        sessionId,
        reason: 'orphan-finalize',
      },
      kanbanState: null,
      reviewRemediationHint: null,
    }),
    fleet: {
      issue: target,
      worktreePath: ctx.projectDir,
      branch: currentBranch(ctx.projectDir),
      kind: undefined,
      startedAt: ts,
      status: 'active',
    },
    timing: {
      issueNumber: target.replace(/^#/, ''),
      repo: ctx.cfg?.repo ?? '',
      decision: {
        mode,
        selectedEvent: timingSelectedEvent,
        emittedEvent: timingSuppressed ? null : timingSelectedEvent,
        idleSec: timingIdleSec,
        syntheticGap: timingSyntheticGap,
        suppressed: timingSuppressed,
      },
      rows: rows.map((item) => ({
        ...item,
        projectionId: timingProjectionId,
      })),
    },
    github: {
      issueNumber: target.replace(/^#/, ''),
      repo: ctx.cfg?.repo ?? '',
      claimRequired: false,
      currentUser: '',
      auditBody: null,
    },
  };
  projectionInputs.fleet = durableJson(projectionInputs.fleet);
  return { ts, requestId, idempotencyKey, projectionInputs };
}

async function verbResumeGoverned(ctx) {
  const rawTarget = ctx.rest[0];
  const state = loadState(ctx.statePath);
  const noArgument = !rawTarget || !/^#?\d+$/.test(String(rawTarget));
  if (noArgument && (!state.paused || !state.lastActive)) {
    console.log(
      !state.paused
        ? 'nothing to resume. Use "/task start <N>" to bind a task, or "/task resume <N>" to return to a specific paused/stopped issue.'
        : 'no previous task on record.'
    );
    return;
  }
  const target = canonicalIssueRef(noArgument ? state.lastActive : rawTarget);
  const identity = ctx.getWorkLeaseIdentity();
  const sessionId = identity.sessionId ?? currentSessionId();
  if (!sessionId) throw new Error('governed bind requires a session identity');
  const session = getActiveTask(sessionId, ctx.projectDir);
  const boundIssue = session?.issue ?? session?.leaseIssue;
  const preflight = ctx.runReadOnlyBindPreflight ?? runReadOnlyBindPreflight;
  const readEligibility = () =>
    preflight({
      stateBefore: state,
      target,
      cfg: ctx.cfg,
      allowIssueSwitch: true,
      deps: ctx.bindPreflightDeps,
    });
  const eligibility = await readEligibility();
  if (!eligibility?.ok) throw new Error(`bind preflight refused ${eligibility?.kind || 'unknown'}`);
  if (boundIssue && canonicalIssueRef(boundIssue) !== target) {
    throw new Error(
      `atomic work-lease switch is required before rebinding ${canonicalIssueRef(boundIssue)} to ${target}`
    );
  }

  const selfHeldLease =
    !noArgument && state.active === target && session?.lease && !session?.workLeaseIntent;
  if (selfHeldLease) {
    await renewWorkLeaseBeforeResume(ctx, { issue: target, sessionId });
    const startHeartbeat = ctx.createWorkLeaseHeartbeat ?? createWorkLeaseHeartbeat;
    startHeartbeat({
      ownerKey: heartbeatOwnerKey(sessionId, session.lease),
      verifyEffect: ctx.verifyGovernedEffect,
      issueId: target.replace(/^#/, ''),
      sessionId,
      projectDir: ctx.projectDir,
      hostId: identity.hostId,
      operation: 'task-bind',
      store: ctx.getWorkLeaseStore(),
      holderIdentity: {
        provider: identity.provider,
        agentRunId: identity.agentRunId,
      },
    });
    const audit = ctx.runMoveInvariantAudit ?? runMoveInvariantAudit;
    await audit({ issueNumber: target.replace(/^#/, ''), cfg: ctx.cfg });
    console.log(`already active: ${target}`);
    return;
  }

  const existingOperation = session?.workLeaseIntent?.operation;
  const operation = existingOperation ?? (session?.lease ? 'resume' : 'acquire');
  if (!['acquire', 'resume'].includes(operation)) {
    throw new Error(`cannot reconcile ${operation} intent in Task 5A`);
  }
  const mode =
    !noArgument && canonicalIssueRef(boundIssue ?? target) === target && state.active === target
      ? 'self'
      : noArgument
        ? 'resume'
        : 'bind';
  const requestId = randomUUID();
  const plan = await buildGovernedBindPlan(ctx, {
    target,
    state,
    sessionId,
    mode,
    operation,
    requestId,
  });
  plan.projectionInputs.github.claimRequired = eligibility.claimRequired === true;
  plan.projectionInputs.github.currentUser = eligibility.currentUser ?? '';
  plan.projectionInputs.session.kanbanState = eligibility.kanbanState ?? null;
  plan.projectionInputs.session.reviewRemediationHint = eligibility.reviewRemediationHint ?? null;
  if (plan.projectionInputs.github.claimRequired) {
    const githubProjectionId = `${operation}:${plan.idempotencyKey}:github`;
    plan.projectionInputs.github.auditBody = formatClaimAuditComment({
      verb: ctx.verb || (noArgument ? 'resume' : 'start'),
      issueNumber: target.replace(/^#/, ''),
      currentUser: plan.projectionInputs.github.currentUser,
      projectionId: githubProjectionId,
    });
  }
  const projections = Object.fromEntries(
    ['session', 'fleet', 'timing', 'github'].map((name) => [
      name,
      async ({ input, lease, projectionName, projectionId }) => {
        const apply = {
          session: applySessionProjection,
          fleet: applyFleetProjection,
          timing: applyTimingProjection,
          github: applyGithubProjection,
        }[name];
        await apply(ctx, { input, lease, projectionId });
        return projectionProof(projectionName, projectionId);
      },
    ])
  );
  const getStore = async () => ctx.getWorkLeaseStore();
  let result;
  if (operation === 'resume') {
    const coordinate = ctx.coordinateWorkLeaseResume ?? coordinateWorkLeaseResume;
    result = await coordinate({
      issueId: target,
      sessionId,
      projectDir: ctx.projectDir,
      hostId: identity.hostId,
      holderIdentity: {
        provider: identity.provider,
        agentRunId: identity.agentRunId,
      },
      getStore,
      projectionInputs: plan.projectionInputs,
      projections,
      now: () => new Date(plan.ts),
      randomUUID: () => plan.requestId,
    });
  } else {
    const coordinate = ctx.coordinateWorkLeaseAcquire ?? coordinateWorkLeaseAcquire;
    result = await coordinate({
      issueId: target,
      sessionId,
      projectDir: ctx.projectDir,
      hostId: identity.hostId,
      provider: identity.provider,
      agentRunId: identity.agentRunId,
      pid: identity.pid,
      branch: identity.branch,
      getStore,
      readEligibility,
      claim: () =>
        claimAssignee({
          issueNumber: target.replace(/^#/, ''),
          cfg: ctx.cfg,
          deps: ctx.claimAssigneeDeps,
        }),
      projectionInputs: plan.projectionInputs,
      projections,
      now: () => new Date(plan.ts),
      randomUUID: () => plan.requestId,
    });
  }
  const startHeartbeat = ctx.createWorkLeaseHeartbeat ?? createWorkLeaseHeartbeat;
  startHeartbeat({
    ownerKey: heartbeatOwnerKey(sessionId, result.lease),
    verifyEffect: ctx.verifyGovernedEffect,
    issueId: target.replace(/^#/, ''),
    sessionId,
    projectDir: ctx.projectDir,
    hostId: identity.hostId,
    operation: 'task-bind',
    store: ctx.getWorkLeaseStore(),
    holderIdentity: {
      provider: identity.provider,
      agentRunId: identity.agentRunId,
    },
  });
  const audit = ctx.runMoveInvariantAudit ?? runMoveInvariantAudit;
  await audit({ issueNumber: target.replace(/^#/, ''), cfg: ctx.cfg });
  const reviewHint = result.projectionInputs?.session?.reviewRemediationHint;
  if (reviewHint) console.log(reviewHint);
  console.log(mode === 'resume' ? `Resumed ${target}.` : `Started ${target}.`);
}

// `/task resume` — two paths:
//   no arg: only valid after `/task pause` (s.paused === true). Rebinds lastActive.
//   #N arg: unrestricted rebind to a specific issue (works after pause OR stop).
async function verbResumeLegacy(ctx) {
  const { cfg, statePath, projectDir, role, drainQueueIfAny, safePostTiming, nowIso } = ctx;
  const target = ctx.rest[0];

  if (!target || !/^#?\d+$/.test(String(target))) {
    // No-arg path: require s.paused === true
    await drainQueueIfAny();
    const s = loadState(statePath);
    if (!s.paused) {
      console.log(
        'nothing to resume. Use "/task start <N>" to bind a task, or "/task resume <N>" to return to a specific paused/stopped issue.'
      );
      return;
    }
    if (!s.lastActive) {
      console.log('no previous task on record.');
      return;
    }
    // Inline the lastActive-bind logic (previously in verbStart)
    try {
      const sidPre = currentSessionId();
      if (sidPre) {
        await finalizeOrphanPause({ sid: sidPre, reason: 'orphan-finalize', projDir: projectDir });
      }
    } catch {
      /* never block resume on finalize failure */
    }
    const ts = nowIso();
    const sid = currentSessionId();
    let wordsAtStart = 0;
    if (sid) {
      const { totalLines, count } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, count, s.lastActive);
      wordsAtStart = count;
    }
    // #475 AC2 — idle span of the pause window = resume_ts − pausedAtTs.
    const idleSec = computePauseIdleSec(s.pausedAtTs, ts);
    // #475 AC1 — carry the durable marker forward across the pause.
    const carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
    // #534 — pair the resume to the pause's canonical reason. The no-arg path
    // is gated on `s.paused`, so a matching open `pause:<slug>` always exists;
    // emit `resume:<slug>` and echo the operator's free text in Description.
    const reasonSlug = s.pauseReasonSlug || 'other';
    const resumeEvent = `resume:${reasonSlug}`;
    const resumeDesc = s.pauseReasonText || role || 'task resumed';
    saveState(
      {
        ...s,
        active: s.lastActive,
        entryStartTs: ts,
        wordsAtEntryStart: wordsAtStart,
        paused: undefined,
        pausedAtTs: null,
        // #534 — interruption closed; clear the persisted pause reason.
        pauseReasonSlug: null,
        pauseReasonText: null,
        lastWordMarker: carriedMarker,
      },
      statePath
    );
    try {
      setTaskStatus(projectDir, s.lastActive, 'active');
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
    if (sid && cfg?.repo) {
      const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
      try {
        const seeded = await seed({
          sid,
          issue: s.lastActive,
          projDir: projectDir,
          repo: cfg.repo,
        });
        // #673 — Pickup Directive only applies once an issue has reached
        // Plan; route earlier-state issues back to the state walk instead.
        if (seeded?.kanbanState && !isPickupDirectiveEligible(seeded.kanbanState)) {
          console.log(formatPickupDirectiveDeferredBanner(s.lastActive, seeded.kanbanState));
        }
        // #935 — warn when binding to a review-state issue whose Agent Review
        // has not been run; names `/task review` as the in-place remediation.
        if (seeded?.reviewRemediationHint) console.log(seeded.reviewRemediationHint);
      } catch (err) {
        process.stderr.write(
          `[resume] ${s.lastActive}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
        );
        process.stderr.write(
          `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${String(s.lastActive).replace(/^#/, '')}\n`
        );
      }
    }
    const { buildRow } = await import('../gh-timing-comment.mjs');
    const row = buildRow({
      ts,
      event: resumeEvent,
      activeSec: 0,
      idleSec,
      deltaWords: 0,
      wordMarker: carriedMarker,
      description: resumeDesc,
    });
    await safePostTiming(s.lastActive, row);
    // #758 — same out-of-band Status-drift audit on the no-arg resume path.
    await runMoveInvariantAudit({
      issueNumber: String(s.lastActive).replace(/^#/, ''),
      cfg,
    });
    console.log(`Resumed ${s.lastActive}.`);
    return;
  }

  // #N path: unrestricted rebind to a specific issue (pause OR stop, or fresh bind)
  const normalizedTarget = /^#/.test(String(target)) ? String(target) : `#${target}`;
  const s = loadState(statePath);

  // #666 — decide switch-vs-fresh-bind on THIS session's own per-session record,
  // not the global-overlaid `s.active`. The global pointer is a single-slot cache
  // that can hold a prior session's ghost; routing on it makes a fresh session
  // fabricate a `switch-out` row on the ghost issue. Only a genuine in-session
  // switch (this session itself already holds a different binding) goes through
  // verbSwitch; a fresh session whose only "active" is the inherited ghost falls
  // through to the fresh-bind path below.
  const switchVerb = ctx.verbSwitch ?? verbSwitch;
  const ownIssue = ownBoundIssue(projectDir);
  if (ownIssue && ownIssue !== normalizedTarget) {
    await switchVerb(ctx, normalizedTarget);
    return;
  }
  if (ownIssue === normalizedTarget) {
    console.log(`already active: ${normalizedTarget}`);
    return;
  }

  await drainQueueIfAny();
  try {
    const sidPre = currentSessionId();
    if (sidPre) {
      await finalizeOrphanPause({
        sid: sidPre,
        reason: 'orphan-finalize',
        projDir: projectDir,
      });
    }
  } catch {
    /* never block resume on a finalize failure */
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, normalizedTarget);
    wordsAtStart = count;
  }
  // #475 AC2 — idle span of the pause window (if this #N resume follows a pause).
  const idleSec = computePauseIdleSec(s.pausedAtTs, ts);
  // #475 AC1 — carry the durable marker forward across the rebind.
  const carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
  saveState(
    {
      ...s,
      active: normalizedTarget,
      lastActive: normalizedTarget,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      paused: undefined,
      pausedAtTs: null,
      lastWordMarker: carriedMarker,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, normalizedTarget, 'active');
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  try {
    registerTask(projectDir, normalizedTarget, projectDir, currentBranch(projectDir));
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  if (sid && cfg?.repo) {
    const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
    try {
      const seeded = await seed({
        sid,
        issue: normalizedTarget,
        projDir: projectDir,
        repo: cfg.repo,
      });
      // #673 — Pickup Directive only applies once an issue has reached
      // Plan; route earlier-state issues back to the state walk instead.
      if (seeded?.kanbanState && !isPickupDirectiveEligible(seeded.kanbanState)) {
        console.log(formatPickupDirectiveDeferredBanner(normalizedTarget, seeded.kanbanState));
      }
      // #935 — warn when binding to a review-state issue whose Agent Review has
      // not been run; names `/task review` as the in-place remediation.
      if (seeded?.reviewRemediationHint) console.log(seeded.reviewRemediationHint);
    } catch (err) {
      process.stderr.write(
        `[resume] ${normalizedTarget}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
      );
      process.stderr.write(
        `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${String(normalizedTarget).replace(/^#/, '')}\n`
      );
    }
  }
  // #482 — the first-ever bind of an issue must record a `start` row, not
  // `resumed` (you cannot resume without a prior start/pause). Discriminate by
  // whether the issue already has timing-log history; a genuine resume (history
  // present, or this #N resume follows a pause) keeps `resumed`.
  const gh = await import('../gh-timing-comment.mjs');
  const { buildRow } = gh;
  const readTimingCommentBody = ctx.readTimingCommentBody ?? gh.readTimingCommentBody;
  let hasTimingHistory = false;
  let tcBody = '';
  let readStatus = null;
  if (cfg?.repo) {
    // #568 — findTimingComment does `issueNumber.replace('#','')`, so it needs a
    // STRING. Passing a Number made `.replace` throw, so every #N-path read
    // returned `status:'error'` → fail-closed to `resumed` → the fresh-bind
    // downgrade never fired (the orphan-`resumed` half of the #480 bug this fix
    // exists to kill). Pass the bare issue string.
    const tcResult = await readTimingCommentBody({
      issueNumber: String(normalizedTarget).replace(/^#/, ''),
      repo: cfg.repo,
    });
    tcBody = gh.bodyOf(tcResult);
    readStatus = tcResult?.status ?? null;
    hasTimingHistory = timingCommentHasRows(tcBody);
  }
  // #534 — the #N path is the dominant cold-re-pickup orphan site. Resolve the
  // re-engagement against the issue's own open interruption so a return is never
  // emitted without a pair. #568 — `resumed` is the sole closer: an open
  // `pause:<r>`, `switch-out:#X`, or session-end `idle` all close to `resumed`.
  // Fresh issue → `start`; history-no-opener → benign `resumed`.
  let bindEvent = resolveBindEvent({
    hasTimingHistory,
    paused: !!s.pausedAtTs,
    timingBody: cfg?.repo ? tcBody : null,
    readStatus,
  });
  // #534 AC5/AC7 — orphan-pairing guard. Never post a re-engagement with no
  // open interruption AND no prior `start` to pair against.
  // #568 — downgrade to `start` ONLY on positive confirmation the log is empty
  // (a successful read of zero rows). On a read error, or whenever data rows
  // already exist, never manufacture a `start` — that is exactly the
  // duplicate-start the append guard now refuses (and would crash the bind).
  const guard = assertPairedReengagement(tcBody, bindEvent);
  if (!guard.ok && readStatus !== 'error' && !timingCommentHasRows(tcBody)) {
    process.stderr.write(`[resume] ${normalizedTarget}: ${guard.reason}; downgrading to start\n`);
    bindEvent = 'start';
  }
  const isStart = bindEvent === 'start';
  // #981 — a session that dies without running its exit path (timeout, closed
  // terminal, context end) leaves the prior row unclosed; writing `resumed`
  // straight over that gap makes `computePhaseCloseDelta` read the ENTIRE
  // elapsed span as active on the next `<phase>:completed` row (the #880/#879
  // defect class). Insert a synthetic departure row first so the gap
  // reclassifies as idle — `buildBackdatedDepartureRow` can only ever emit a
  // zero-delta marker row, never fabricate active time.
  if (cfg?.repo && !isStart && readStatus !== 'error') {
    const gap = detectUnmarkedDepartureGap(tcBody, ts);
    if (gap) {
      const departureRow = gh.buildBackdatedDepartureRow({
        ts: gap.syntheticTs,
        event: 'pause:auto-detected-gap',
        wordMarker: gap.wordMarker,
        description: `resume after a ${Math.round(gap.gapSec / 3600)}h gap with no departure row — synthetic departure inserted per #981 so the gap reclassifies as idle`,
      });
      await safePostTiming(normalizedTarget, departureRow);
    }
  }
  const suppressBindEvent = shouldSuppressActiveBindEvent({
    timingBody: tcBody,
    readStatus,
    paused: !!s.pausedAtTs,
    nowTs: ts,
  });
  if (!suppressBindEvent) {
    const row = buildRow({
      ts,
      event: bindEvent,
      activeSec: 0,
      idleSec,
      deltaWords: 0,
      wordMarker: carriedMarker,
      description: role ?? (isStart ? 'task started' : 'task resumed'),
    });
    await safePostTiming(normalizedTarget, row);
  }
  // #758 — audit the just-bound issue for out-of-band Status drift (a raw-API /
  // wrapper move that never wrote the move-complete sentinel). Best-effort: it
  // prints a warning + recommended reconcile on drift and never blocks the bind.
  await runMoveInvariantAudit({
    issueNumber: String(normalizedTarget).replace(/^#/, ''),
    cfg,
  });
  console.log(
    suppressBindEvent
      ? `Bound ${normalizedTarget} (live timing span already active; no duplicate reengagement row).`
      : `${isStart ? 'Started' : 'Resumed'} ${normalizedTarget}.`
  );
}

export { verbResumeLegacy as verbResumeLegacyForTests };

export async function verbResume(ctx) {
  if (typeof ctx?.getWorkLeaseStore !== 'function') {
    throw new Error('resume requires a lazy work-lease authority');
  }
  return verbResumeGoverned(ctx);
}
