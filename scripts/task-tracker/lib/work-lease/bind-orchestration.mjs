import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { loadState, saveState, advanceWordMarker } from '../../state.mjs';
import { rawProjectConfig } from '../../config.mjs';
import {
  registerTaskProjection,
  switchTaskProjection,
  readFleet,
  fleetRegistryPath,
  findMainWorktreePath,
} from '../../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  loadMarker,
  markerPathFor,
  saveMarker,
  countWords,
} from '../../word-counter.mjs';
import {
  getActiveTask,
  restoreCompensatedActiveTask,
  setActiveTask,
} from '../../session-state.mjs';
import { consumePendingPauseForBind } from '../../orphan-finalize.mjs';
import { bothGatesExplicit } from '../gate-resolve.mjs';
import { loadSession as loadRuntimeSession } from '../session-store.mjs';
import { refuseReadOnlyBindPreflight, runReadOnlyBindPreflight } from '../verb-preflight.mjs';
import {
  formatClaimAuditComment,
  reconcilePreparedAssigneeClaim,
  reconcileClaimAuditProjection,
} from '../assignee-guard.mjs';
import {
  buildTrustedWorkLeaseBinding,
  coordinateWorkLeaseAcquire,
  coordinateWorkLeaseResume,
  createWorkLeaseHeartbeat,
} from './guard.mjs';
import {
  coordinateWorkLeaseSwitch,
  validateSwitchGithubProjectionInput,
} from './switch-orchestration.mjs';
import { enqueueTimingProjection } from '../../queue.mjs';
import {
  resolveBindEvent,
  timingCommentHasRows,
  assertPairedReengagement,
  detectUnmarkedDepartureGap,
  shouldSuppressActiveBindEvent,
} from '../bind-event.mjs';
import { runMoveInvariantAudit } from '../verify-move-invariants.mjs';
import {
  formatPickupDirectiveDeferredBanner,
  isPickupDirectiveEligible,
} from '../pickup-directive-gate.mjs';

export async function renewWorkLeaseBeforeResume(ctx, { issue, sessionId, holderIdentity } = {}) {
  if (typeof ctx?.getWorkLeaseStore !== 'function') {
    throw new Error('resume requires a lazy work-lease authority');
  }
  if (!holderIdentity || typeof holderIdentity !== 'object') {
    throw new Error('resume requires a complete trusted holder binding');
  }
  return ctx.verifyGovernedEffect({
    issueId: String(issue ?? '').replace(/^#/, ''),
    sessionId,
    projectDir: ctx.projectDir,
    hostId: holderIdentity.hostId,
    operation: 'task-bind',
    store: ctx.getWorkLeaseStore(),
    forceRenewal: true,
    holderIdentity,
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

function durableJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function projectionProof(projectionName, projectionId) {
  return { reconciled: true, projectionName, projectionId };
}

function requireProjectionProof(proof, projectionName, projectionId) {
  if (
    proof?.reconciled !== true ||
    proof.projectionName !== projectionName ||
    proof.projectionId !== projectionId
  ) {
    throw new Error(`${projectionName} projection override proof does not match`);
  }
  return proof;
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
      !Number.isSafeInteger(input.marker.line) ||
      input.marker.line < 0 ||
      !Number.isSafeInteger(input.marker.words) ||
      input.marker.words < 0 ||
      !Number.isSafeInteger(input.marker.wordsFull) ||
      input.marker.wordsFull < input.marker.words ||
      input.marker.task !== input.activeTask.issue ||
      !isNonEmptyString(input.marker.ts))
  ) {
    throw new Error('persisted session marker projection is malformed');
  }
}

async function applySessionProjection(ctx, { input, lease, projectionId }) {
  validateSessionProjectionInput(input);
  if (typeof ctx.applyWorkLeaseSessionProjection === 'function') {
    return requireProjectionProof(
      await ctx.applyWorkLeaseSessionProjection({ input, lease, projectionId }),
      'session',
      projectionId
    );
  }
  if (input.orphanFinalize?.enabled) {
    await consumePendingPauseForBind({
      sid: input.orphanFinalize.sessionId,
      projDir: ctx.projectDir,
    });
  }
  if (input.marker) {
    saveMarker(
      input.marker.path,
      input.marker.line,
      input.marker.words,
      input.marker.task,
      input.marker.wordsFull,
      input.marker.ts
    );
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
    if (
      marker.line !== input.marker.line ||
      marker.words !== input.marker.words ||
      marker.wordsFull !== input.marker.wordsFull ||
      marker.task !== input.marker.task ||
      marker.ts !== input.marker.ts
    ) {
      throw new Error('session marker projection read-back does not match');
    }
  }
  return projectionProof('session', projectionId);
}

async function applyFleetProjection(ctx, { input, projectionId }) {
  if (
    !input ||
    typeof input !== 'object' ||
    !input.issue ||
    !input.branch ||
    !isPlainObject(input.binding)
  ) {
    throw new Error('persisted fleet projection is malformed');
  }
  if (typeof ctx.applyWorkLeaseFleetProjection === 'function') {
    return requireProjectionProof(
      await ctx.applyWorkLeaseFleetProjection({ input, projectionId }),
      'fleet',
      projectionId
    );
  }
  registerTaskProjection(ctx.projectDir, input, projectionId);
  const registry = fleetRegistryPath(findMainWorktreePath(ctx.projectDir));
  const entry = readFleet(registry)[input.issue];
  if (
    !entry ||
    entry.worktreePath !== input.worktreePath ||
    entry.branch !== input.branch ||
    entry.status !== 'active' ||
    !isDeepStrictEqual(entry.binding, input.binding) ||
    entry.projectionId !== projectionId
  ) {
    throw new Error('fleet projection read-back does not match');
  }
  return projectionProof('fleet', projectionId);
}

async function applyTimingProjection(ctx, { input, projectionId }) {
  if (
    !isPlainObject(input) ||
    !isNonEmptyString(input.issueNumber) ||
    typeof input.skippedNetwork !== 'boolean' ||
    !isPlainObject(input.decision) ||
    !['bind', 'resume', 'self', 'switch'].includes(input.decision.mode) ||
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
      (item.issueNumber !== undefined && !/^[1-9]\d*$/.test(item.issueNumber)) ||
      item.projectionId !== projectionId
    ) {
      throw new Error('persisted timing projection row is malformed');
    }
  }
  if (input.skippedNetwork) {
    if (input.rows.length !== 0) {
      throw new Error('offline timing projection must not contain network rows');
    }
    return projectionProof('timing', projectionId);
  }
  if (typeof ctx.applyWorkLeaseTimingProjection === 'function') {
    return requireProjectionProof(
      await ctx.applyWorkLeaseTimingProjection({ input, projectionId }),
      'timing',
      projectionId
    );
  }
  if (input.rows.length === 0) return projectionProof('timing', projectionId);
  await ctx.drainQueueIfAny();
  const gh = await import('../../gh-timing-comment.mjs');
  const post = ctx.postTimingProjection ?? gh.postTimingEvent;
  for (const item of input.rows) {
    const issueNumber = item.issueNumber ?? input.issueNumber;
    try {
      await post({
        issueNumber,
        repo: input.repo,
        row: item.row,
        projectionId,
        subOperationId: item.subOperationId,
        projDir: ctx.projectDir,
      });
    } catch (error) {
      enqueueTimingProjection(
        {
          issue: item.issueNumber ?? input.issueNumber,
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
  const operationsByIssue = new Map();
  for (const item of input.rows) {
    const issueNumber = item.issueNumber ?? input.issueNumber;
    const operations = operationsByIssue.get(issueNumber) ?? [];
    operations.push(item.subOperationId);
    operationsByIssue.set(issueNumber, operations);
  }
  for (const [issueNumber, subOperationIds] of operationsByIssue) {
    const proof = await readProjection({
      issueNumber,
      repo: input.repo,
      projectionId,
      subOperationIds,
    });
    if (proof?.reconciled !== true || proof.projectionId !== projectionId) {
      throw new Error('timing projection remote read-back does not match');
    }
  }
  return projectionProof('timing', projectionId);
}

async function applyGithubProjection(ctx, { input, projectionId }) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.issueNumber !== 'string' ||
    typeof input.claimRequired !== 'boolean' ||
    typeof input.skippedNetwork !== 'boolean' ||
    !['enforced', 'disabled', 'offline'].includes(input.assigneePolicy) ||
    typeof input.currentUser !== 'string' ||
    typeof input.preparedKind !== 'string' ||
    !Array.isArray(input.preparedAssignees) ||
    !Object.hasOwn(input, 'auditBody')
  ) {
    throw new Error('persisted GitHub projection is malformed');
  }
  if ((input.assigneePolicy === 'offline') !== input.skippedNetwork) {
    throw new Error('persisted GitHub offline policy is inconsistent');
  }
  if (input.switch || String(projectionId).startsWith('switchLease:')) {
    validateSwitchGithubProjectionInput(input, {
      sourceIssueId: input.switch?.sourceIssue,
      targetIssueId: input.issueNumber,
      sessionId: input.switch?.sessionId,
      projectionId,
    });
  }
  if (input.skippedNetwork) return projectionProof('github', projectionId);
  if (typeof ctx.applyWorkLeaseGithubProjection === 'function') {
    return requireProjectionProof(
      await ctx.applyWorkLeaseGithubProjection({ input, projectionId }),
      'github',
      projectionId
    );
  }
  if (input.claimRequired) {
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
  if (input.switch) {
    if (
      !isPlainObject(input.switch) ||
      !/^#[1-9]\d*$/.test(input.switch.sourceIssue) ||
      !isNonEmptyString(input.switch.sessionId) ||
      !isNonEmptyString(input.switch.jsonlPath) ||
      !isNonEmptyString(input.switch.ts)
    ) {
      throw new Error('persisted GitHub switch projection is malformed');
    }
    const sessionRef = await ctx.safeRecordSessionRef(input.switch.sourceIssue, {
      sid: input.switch.sessionId,
      jsonlPath: input.switch.jsonlPath,
      ts: input.switch.ts,
    });
    if (sessionRef?.ok !== true) {
      throw new Error('GitHub switch session reference did not reconcile');
    }
    await ctx.runLogIssueTime(input.switch.sourceIssue);
  }
  return projectionProof('github', projectionId);
}

async function buildGovernedSwitchPlan(
  ctx,
  { source, target, state, sessionId, requestId, eligibility, binding }
) {
  const plan = await buildGovernedBindPlan(ctx, {
    target,
    state,
    sessionId,
    mode: 'bind',
    operation: 'switchLease',
    requestId,
    eligibility,
    binding,
  });
  const idempotencyKey = `switch:${sessionId}:${source.replace(/^#/, '')}:${target.replace(/^#/, '')}:${requestId}`;
  const projectionIds = Object.fromEntries(
    ['session', 'fleet', 'timing', 'github'].map((name) => [
      name,
      `switchLease:${idempotencyKey}:${name}`,
    ])
  );
  const sourceFleet =
    readFleet(fleetRegistryPath(findMainWorktreePath(ctx.projectDir)))[source] ?? {};
  const sourceInput = {
    issue: source,
    worktreePath: binding.displayPath,
    branch: binding.branch,
    kind: sourceFleet.kind,
    startedAt: sourceFleet.startedAt ?? state.entryStartTs ?? plan.ts,
    status: 'active',
    binding,
  };
  const sourceLastRow =
    eligibility.skippedNetwork === true || typeof ctx.safeReadLastRow !== 'function'
      ? null
      : await ctx.safeReadLastRow(source);
  const outgoing =
    eligibility.skippedNetwork === true
      ? null
      : await ctx.flushActiveToGH(
          durableJson(state),
          `switch-out:${target}`,
          `Switching out to task ${target}`,
          undefined,
          { suppressRowWords: true, computeOnly: true, precomputedLastRow: sourceLastRow }
        );
  const incomingRows = plan.projectionInputs.timing.rows.map((item) => ({
    ...item,
    issueNumber: target.replace(/^#/, ''),
    subOperationId: `incoming:${item.subOperationId}`,
    projectionId: projectionIds.timing,
  }));
  const outgoingPrecedingRows = outgoing?.precedingRows ?? [];
  if (
    !Array.isArray(outgoingPrecedingRows) ||
    outgoingPrecedingRows.length > 1 ||
    outgoingPrecedingRows.some((row) => !isNonEmptyString(row))
  ) {
    throw new Error('computed outgoing switch timing prelude is malformed');
  }
  plan.projectionInputs.session.switch = { sourceIssue: source, targetIssue: target };
  plan.projectionInputs.fleet = {
    sourceIssue: source,
    targetIssue: target,
    source: sourceInput,
    target: plan.projectionInputs.fleet,
  };
  plan.projectionInputs.timing = {
    ...plan.projectionInputs.timing,
    decision: {
      ...plan.projectionInputs.timing.decision,
      mode: 'switch',
    },
    sourceIssue: source,
    targetIssue: target,
    rows: eligibility.skippedNetwork
      ? []
      : [
          ...outgoingPrecedingRows.map((row) => ({
            issueNumber: source.replace(/^#/, ''),
            row,
            subOperationId: 'outgoing:reengage',
            projectionId: projectionIds.timing,
          })),
          {
            issueNumber: source.replace(/^#/, ''),
            row: outgoing.row,
            subOperationId: 'outgoing:switch-out',
            projectionId: projectionIds.timing,
          },
          ...incomingRows,
        ],
  };
  plan.projectionInputs.github.switch = {
    sourceIssue: source,
    targetIssue: target,
    sessionId,
    jsonlPath: jsonlPath(sessionId),
    ts: plan.ts,
  };
  plan.projectionInputs = durableJson(plan.projectionInputs);
  return { ...plan, idempotencyKey, projectionIds };
}

async function applySwitchProjection(
  ctx,
  { phase, input, lease, transitionId, projectionName, projectionId, sessionId }
) {
  if (phase === 'compensation') {
    const forwardInput = input?.forwardInput;
    if (projectionName === 'session') {
      if (typeof ctx.applyWorkLeaseSwitchCompensationSessionProjection === 'function') {
        return requireProjectionProof(
          await ctx.applyWorkLeaseSwitchCompensationSessionProjection({
            input,
            lease,
            transitionId,
            projectionId,
          }),
          'session',
          projectionId
        );
      }
      restoreCompensatedActiveTask(sessionId, lease, transitionId, projectionId, ctx.projectDir);
      return projectionProof('session', projectionId);
    }
    if (projectionName === 'fleet') {
      if (typeof ctx.applyWorkLeaseSwitchCompensationFleetProjection === 'function') {
        return requireProjectionProof(
          await ctx.applyWorkLeaseSwitchCompensationFleetProjection({
            input,
            lease,
            transitionId,
            projectionId,
          }),
          'fleet',
          projectionId
        );
      }
      switchTaskProjection(ctx.projectDir, forwardInput, lease, projectionId, 'compensation');
      return projectionProof('fleet', projectionId);
    }
    return projectionProof(projectionName, projectionId);
  }
  if (projectionName === 'fleet') {
    if (typeof ctx.applyWorkLeaseSwitchFleetProjection === 'function') {
      return requireProjectionProof(
        await ctx.applyWorkLeaseSwitchFleetProjection({
          input,
          lease,
          transitionId,
          projectionId,
        }),
        'fleet',
        projectionId
      );
    }
    switchTaskProjection(ctx.projectDir, input, lease, projectionId, 'forward');
    return projectionProof('fleet', projectionId);
  }
  const apply = {
    session: applySessionProjection,
    timing: applyTimingProjection,
    github: applyGithubProjection,
  }[projectionName];
  return apply(ctx, { input, lease, projectionId, projectionName });
}

async function verbSwitchGoverned(
  ctx,
  { source, target, state, session, sessionId, identity, eligibility, readEligibility, binding }
) {
  const persistedIntent =
    session?.workLeaseIntent?.operation === 'switchLease' ? session.workLeaseIntent : null;
  const requestId = persistedIntent ? 'persisted-switch-replay' : randomUUID();
  const plan = persistedIntent
    ? {
        ts: JSON.parse(persistedIntent.canonicalRequest).switchedAt,
        requestId,
        idempotencyKey: persistedIntent.idempotencyKey,
        projectionIds: Object.fromEntries(
          Object.entries(persistedIntent.projections).map(([name, projection]) => [
            name,
            projection.projectionId,
          ])
        ),
        projectionInputs: Object.fromEntries(
          Object.entries(persistedIntent.projections).map(([name, projection]) => [
            name,
            durableJson(projection.input),
          ])
        ),
      }
    : await buildGovernedSwitchPlan(ctx, {
        source,
        target,
        state,
        sessionId,
        requestId,
        eligibility,
        binding,
      });
  plan.projectionInputs.session.kanbanState = eligibility.kanbanState ?? null;
  plan.projectionInputs.session.reviewRemediationHint = eligibility.reviewRemediationHint ?? null;
  if (plan.projectionInputs.github.claimRequired) {
    plan.projectionInputs.github.auditBody = formatClaimAuditComment({
      verb: ctx.verb || 'start',
      issueNumber: target.replace(/^#/, ''),
      currentUser: plan.projectionInputs.github.currentUser,
      projectionId: plan.projectionIds.github,
    });
  }
  const projections = Object.fromEntries(
    ['session', 'fleet', 'timing', 'github'].map((name) => [
      name,
      (options) =>
        applySwitchProjection(ctx, {
          ...options,
          sessionId,
          projectionName: name,
        }),
    ])
  );
  const coordinate = ctx.coordinateWorkLeaseSwitch ?? coordinateWorkLeaseSwitch;
  const result = await coordinate({
    sourceIssueId: source,
    targetIssueId: target,
    sessionId,
    projectDir: ctx.projectDir,
    hostId: identity.hostId,
    provider: identity.provider,
    agentRunId: identity.agentRunId,
    pid: identity.pid,
    branch: identity.branch,
    getStore: async () => ctx.getWorkLeaseStore(),
    preparedEligibility: eligibility,
    readEligibility,
    reconcileClaim: ({ input, projectionId, liveEligibility }) =>
      reconcilePreparedAssigneeClaim({
        input,
        projectionId,
        liveEligibility,
        deps: ctx.claimAssigneeDeps,
      }),
    projectionInputs: plan.projectionInputs,
    projections,
    resolveWorktreeIdentity: ctx.resolveWorktreeIdentity,
    now: () => new Date(plan.ts),
    randomUUID: () => requestId,
  });
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
    holderIdentity: { ...binding },
  });
  if (!eligibility.skippedNetwork) {
    const audit = ctx.runMoveInvariantAudit ?? runMoveInvariantAudit;
    await audit({ issueNumber: target.replace(/^#/, ''), cfg: ctx.cfg });
  }
  const reviewHint = result.projectionInputs?.session?.reviewRemediationHint;
  const kanbanState = result.projectionInputs?.session?.kanbanState;
  if (kanbanState && !isPickupDirectiveEligible(kanbanState)) {
    console.log(formatPickupDirectiveDeferredBanner(target, kanbanState));
  }
  if (reviewHint) console.log(reviewHint);
  console.log(`Active: ${target}. Previous: ${source} ended.`);
  if (ctx.cfg?.repo && !eligibility.skippedNetwork) {
    try {
      const { reconcileDiscuss } = await import('../discuss-label.mjs');
      const { formatDiscussStartBanner } = await import('../discuss-marker.mjs');
      const { pending } = await reconcileDiscuss({
        issueNumber: Number(target.replace(/^#/, '')),
        repo: ctx.cfg.repo,
        cfg: ctx.cfg,
      });
      if (pending) console.log(formatDiscussStartBanner(target));
    } catch {
      // Advisory-only reconciliation never invalidates an authoritative switch.
    }
  }
  try {
    if (eligibility.skippedNetwork) return result;
    if (!bothGatesExplicit(rawProjectConfig())) {
      const runtimeSession = loadRuntimeSession(sessionId);
      const issueNumber = target.replace(/^#/, '');
      const parent = await ctx.fetchParentIssue(issueNumber);
      const rootKey = parent == null ? issueNumber : String(parent);
      if (runtimeSession.lastPromptedParent !== rootKey) {
        console.log(`PROMPT_REQUIRED: auto-mode #${rootKey}`);
        const { saveSession } = await import('../session-store.mjs');
        saveSession({ ...runtimeSession, lastPromptedParent: rootKey });
      }
    }
  } catch {
    // Prompting is advisory and occurs only after durable reconciliation.
  }
  return result;
}

async function buildGovernedBindPlan(
  ctx,
  { target, state, sessionId, mode, operation, requestId, eligibility, binding }
) {
  const ts = ctx.nowIso();
  let wordsAtStart = state.wordsAtEntryStart ?? 0;
  let wordsFullAtStart = wordsAtStart;
  let totalLines = 0;
  if (sessionId) {
    const counted = countWords(jsonlPath(sessionId), 0);
    totalLines = counted.totalLines;
    wordsAtStart = counted.count;
    wordsFullAtStart = counted.fullExpansion;
  }
  const carriedMarker = advanceWordMarker(state.lastWordMarker, wordsAtStart);
  const paused = mode === 'resume';
  const nextState =
    mode === 'self'
      ? {
          ...state,
          active: target,
          lastActive: target,
          entryStartTs: state.entryStartTs ?? ts,
          wordsAtEntryStart: state.wordsAtEntryStart ?? wordsAtStart,
          pausedAtTs: null,
        }
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

  const gh = await import('../../gh-timing-comment.mjs');
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
    } else if (ctx.cfg?.repo && !eligibility.skippedNetwork) {
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
              line: totalLines,
              words: wordsAtStart,
              wordsFull: wordsFullAtStart,
              task: target,
              ts,
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
      worktreePath: binding.displayPath,
      branch: binding.branch,
      kind: undefined,
      startedAt: ts,
      status: 'active',
      binding,
    },
    timing: {
      issueNumber: target.replace(/^#/, ''),
      repo: ctx.cfg?.repo ?? '',
      skippedNetwork: eligibility.skippedNetwork === true,
      decision: {
        mode,
        selectedEvent: timingSelectedEvent,
        emittedEvent: timingSuppressed ? null : timingSelectedEvent,
        idleSec: timingIdleSec,
        syntheticGap: timingSyntheticGap,
        suppressed: timingSuppressed,
      },
      rows: (eligibility.skippedNetwork ? [] : rows).map((item) => ({
        ...item,
        projectionId: timingProjectionId,
      })),
    },
    github: {
      issueNumber: target.replace(/^#/, ''),
      repo: ctx.cfg?.repo ?? '',
      skippedNetwork: eligibility.skippedNetwork === true,
      assigneePolicy: eligibility.skippedNetwork
        ? 'offline'
        : (ctx.cfg?.preferences?.gateAssigneeMatch ?? true)
          ? 'enforced'
          : 'disabled',
      claimRequired: eligibility.claimRequired === true,
      currentUser: eligibility.currentUser ?? '',
      preparedKind:
        eligibility.assigneeKind ??
        (eligibility.skippedNetwork ? 'network-skipped' : 'assignment-disabled'),
      preparedAssignees: [...(eligibility.assignees ?? [])],
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
  const persistedSwitch =
    session?.workLeaseIntent?.operation === 'switchLease'
      ? JSON.parse(session.workLeaseIntent.canonicalRequest)
      : null;
  if (persistedSwitch && canonicalIssueRef(persistedSwitch.target.issueId) !== target) {
    throw new Error(
      `unreconciled atomic switch targets ${canonicalIssueRef(persistedSwitch.target.issueId)}, not ${target}`
    );
  }
  if (
    !persistedSwitch &&
    boundIssue &&
    canonicalIssueRef(boundIssue) !== target &&
    ctx.cfg?.autoEndOnSwitch === false
  ) {
    throw new Error(
      `autoEndOnSwitch=false: finish ${canonicalIssueRef(boundIssue)} manually or enable autoEndOnSwitch before binding ${target}`
    );
  }
  const preflight = ctx.runReadOnlyBindPreflight ?? runReadOnlyBindPreflight;
  const readEligibility = () =>
    preflight({
      stateBefore: state,
      target,
      cfg: ctx.cfg,
      allowIssueSwitch: true,
      deps: ctx.bindPreflightDeps,
    });
  const eligibility = persistedSwitch
    ? {
        ok: true,
        ...session.workLeaseIntent.projections.github.input,
        assignees: session.workLeaseIntent.projections.github.input.preparedAssignees,
        assigneeKind: session.workLeaseIntent.projections.github.input.preparedKind,
      }
    : await readEligibility();
  if (!eligibility?.ok) {
    const refuse = ctx.refuseReadOnlyBindPreflight ?? refuseReadOnlyBindPreflight;
    refuse({
      verdict: eligibility,
      verb: ctx.verb || (noArgument ? 'resume' : 'start'),
    });
    return;
  }
  const binding = await buildTrustedWorkLeaseBinding({
    projectDir: ctx.projectDir,
    hostId: identity.hostId,
    provider: identity.provider,
    agentRunId: identity.agentRunId,
    sessionId,
    pid: identity.pid,
    branch: identity.branch,
    resolveWorktreeIdentity: ctx.resolveWorktreeIdentity,
  });
  if (persistedSwitch || (boundIssue && canonicalIssueRef(boundIssue) !== target)) {
    const runSwitch = ctx.verbSwitchGoverned ?? verbSwitchGoverned;
    return runSwitch(ctx, {
      source: canonicalIssueRef(persistedSwitch?.issueId ?? boundIssue),
      target,
      state,
      session,
      sessionId,
      identity,
      eligibility,
      readEligibility,
      binding,
    });
  }

  const selfHeldLease =
    !noArgument && state.active === target && session?.lease && !session?.workLeaseIntent;
  if (selfHeldLease && eligibility.claimRequired !== true) {
    await renewWorkLeaseBeforeResume(ctx, {
      issue: target,
      sessionId,
      holderIdentity: binding,
    });
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
      holderIdentity: { ...binding },
    });
    if (!eligibility.skippedNetwork) {
      const audit = ctx.runMoveInvariantAudit ?? runMoveInvariantAudit;
      await audit({ issueNumber: target.replace(/^#/, ''), cfg: ctx.cfg });
    }
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
    eligibility,
    binding,
  });
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
        return apply(ctx, { input, lease, projectionId, projectionName });
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
        ...binding,
      },
      getStore,
      readEligibility,
      reconcileClaim: ({ input, projectionId, liveEligibility }) =>
        reconcilePreparedAssigneeClaim({
          input,
          projectionId,
          liveEligibility,
          deps: ctx.claimAssigneeDeps,
        }),
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
      preparedEligibility: eligibility,
      readEligibility,
      reconcileClaim: ({ input, projectionId, liveEligibility }) =>
        reconcilePreparedAssigneeClaim({
          input,
          projectionId,
          liveEligibility,
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
    holderIdentity: { ...binding },
  });
  if (!eligibility.skippedNetwork) {
    const audit = ctx.runMoveInvariantAudit ?? runMoveInvariantAudit;
    await audit({ issueNumber: target.replace(/^#/, ''), cfg: ctx.cfg });
  }
  const reviewHint = result.projectionInputs?.session?.reviewRemediationHint;
  const kanbanState = result.projectionInputs?.session?.kanbanState;
  if (kanbanState && !isPickupDirectiveEligible(kanbanState)) {
    console.log(formatPickupDirectiveDeferredBanner(target, kanbanState));
  }
  if (reviewHint) console.log(reviewHint);
  console.log(mode === 'resume' ? `Resumed ${target}.` : `Started ${target}.`);
}

export async function verbResume(ctx) {
  if (typeof ctx?.getWorkLeaseStore !== 'function') {
    throw new Error('resume requires a lazy work-lease authority');
  }
  return verbResumeGoverned(ctx);
}
