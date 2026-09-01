// @story #1117 #1453 #1456

import { readResidentActionLedger } from './resident-action-ledger-read.mjs';
import { readMoveCompleteState } from './move-state/sentinel.mjs';
import { createTaskSnapshot, provenance, reconcileCurrentState } from './task-snapshot.mjs';
import { IssueLockError } from '../issue-mutator-lock.mjs';

const LAST_KNOWN_PROPERTY_RE =
  /<!--\s*aitm-last-known-state\s+state="([^"]+)"(?:\s+ts="[^"]*")?\s*-->/i;
const LAST_KNOWN_LEGACY_RE = /<!--\s*aitm-last-known-state:\s*([^>\s]+)\s*-->/i;
const BOUNDARY_LOCK_SAMPLE_LIMIT = 128;
const BOUNDARY_LOCK_DEFAULT_RETRY_MS = 500;
const BOUNDARY_LOCK_DEFAULT_JITTER_MS = 100;
const BOUNDARY_LOCK_DEFAULT_MAX_WAIT_MS = 30_000;

function lastKnownState(body) {
  return (
    LAST_KNOWN_PROPERTY_RE.exec(String(body || ''))?.[1] ??
    LAST_KNOWN_LEGACY_RE.exec(String(body || ''))?.[1] ??
    null
  );
}

function unavailable(name) {
  throw new Error(`repository-capability-unavailable:${name}`);
}

function positiveNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function percentile(samples, fraction) {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

export class BoundaryLockAcquireError extends Error {
  constructor(message = 'boundary lock acquisition refused', details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'BoundaryLockAcquireError';
    Object.assign(this, details);
  }
}

function freezeAdapter(value) {
  if (!value || typeof value !== 'object') return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        nested && typeof nested === 'object' ? freezeAdapter(nested) : nested,
      ])
    )
  );
}

export function createActionCapabilityContext({ repository, actionContext = {} } = {}) {
  if (!repository) throw new TypeError('createActionCapabilityContext: repository is required');
  const context = {
    now: () => repository.now(),
    hydrateTask: (args) => repository.hydrateTask(args),
    resolveCorrelation: (args) => repository.resolveCorrelation(args),
    withCorrelationIntent: (args, operation) => repository.withCorrelationIntent(args, operation),
    appendActionEvent: (args) => repository.appendActionEvent(args),
    advanceActionLedgerHead: (args) => repository.advanceActionLedgerHead(args),
    recordLedgerDamageCarry: (args) => repository.recordLedgerDamageCarry(args),
    mutateActionEvidence: (args) => repository.mutateActionEvidence(args),
    git: freezeAdapter(actionContext.git),
    pullRequests: freezeAdapter(actionContext.pullRequests),
    checks: freezeAdapter(actionContext.checks),
    receipts: freezeAdapter(actionContext.receipts),
    instructions: freezeAdapter(actionContext.instructions),
    review: freezeAdapter(actionContext.review),
    develop: freezeAdapter(actionContext.develop),
    test: freezeAdapter(actionContext.test),
  };
  return Object.freeze(context);
}

export class RepositoryAdapter {
  constructor(capabilities = {}) {
    this.capabilities = Object.freeze({ ...capabilities });
    this.mode = 'online';
    this.boundaryLockSamples = [];
  }

  async resolveLiveState({ issue }) {
    const fn = this.capabilities.resolveLiveState;
    if (typeof fn !== 'function') return this.capabilities.statusState ?? null;
    return fn({ issue });
  }

  async readIssueBody({ issue }) {
    const fn = this.capabilities.readIssueBody;
    if (typeof fn !== 'function') return this.capabilities.body ?? '';
    return fn({ issue });
  }

  async readComment({ issue, commentId }) {
    const fn = this.capabilities.readComment;
    if (typeof fn !== 'function') return null;
    return fn({ issue, commentId });
  }

  async readActionLedger({ issue, body, stateVisitId, actionId, maxLinks = 3 }) {
    return readResidentActionLedger({
      body,
      stateVisitId,
      actionId,
      maxLinks,
      readComment: (commentId) => this.readComment({ issue, commentId }),
      rereadBody: () => this.readIssueBody({ issue }),
    });
  }

  async readGitSnapshot({ cwd }) {
    const fn = this.capabilities.readGitSnapshot;
    if (typeof fn !== 'function') return this.capabilities.gitSnapshot ?? null;
    return fn({ cwd });
  }

  async readChecks({ issue, headSha }) {
    const fn = this.capabilities.readChecks;
    if (typeof fn !== 'function') return this.capabilities.checks ?? null;
    return fn({ issue, headSha });
  }

  async readBoundWorktree({ issue, cwd }) {
    const fn = this.capabilities.readBoundWorktree;
    if (typeof fn !== 'function') return this.capabilities.worktree ?? null;
    return fn({ issue, cwd });
  }

  async readMoveSignals({ issue, body, statusState, mode }) {
    const fn = this.capabilities.readMoveSignals;
    if (typeof fn === 'function') return fn({ issue, body, statusState, mode });
    const seeded =
      mode === 'offline'
        ? (this.capabilities.offlineMoveSignals ?? this.capabilities.moveSignals)
        : this.capabilities.moveSignals;
    if (seeded) return seeded;
    return {
      sentinelState: readMoveCompleteState(body),
      statusState,
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    };
  }

  async hydrateTask({ issue, cwd, mode = 'online', actionId, maxLinks = 3 }) {
    this.mode = mode;
    const offline = mode === 'offline';
    const body = offline
      ? (this.capabilities.offlineBody ?? this.capabilities.body ?? '')
      : await this.readIssueBody({ issue });
    const statusState = offline
      ? (this.capabilities.offlineStatusState ?? this.capabilities.statusState ?? null)
      : await this.resolveLiveState({ issue });
    const recordedState = lastKnownState(body);
    const signals = await this.readMoveSignals({ issue, body, statusState, mode });
    const target =
      signals?.target ?? statusState ?? recordedState ?? readMoveCompleteState(body) ?? null;
    const reconciliation = target
      ? reconcileCurrentState({ target, signals, lastKnownState: recordedState ?? target })
      : Object.freeze({ status: 'drift', state: null, recovery: '/task reconcile accept-live #N' });
    const state = reconciliation.state;
    const stateVisitId =
      this.capabilities.stateVisitId ?? (state ? `legacy:${state}:1:1` : 'legacy:unknown:1:1');

    const gitSnapshot = await this.readGitSnapshot({ cwd });
    const worktree = await this.readBoundWorktree({ issue, cwd });
    const checks = offline
      ? (this.capabilities.offlineChecks ?? null)
      : await this.readChecks({ issue, headSha: gitSnapshot?.headSha });
    const actionLedger = offline
      ? await readResidentActionLedger({
          body,
          stateVisitId,
          actionId: actionId ?? this.capabilities.actionId,
          maxLinks,
          readComment: async () => null,
        })
      : await this.readActionLedger({
          issue,
          body,
          stateVisitId,
          actionId: actionId ?? this.capabilities.actionId,
          maxLinks,
        });

    return createTaskSnapshot({
      issue: provenance(issue, 'invocation', { fresh: true }),
      currentState: provenance(state, offline ? 'offline-record' : 'repository-records', {
        fresh: reconciliation.status === 'current',
        reconciliation,
        signals,
        statusState,
        lastKnownState: recordedState,
        sentinelState: readMoveCompleteState(body),
      }),
      stateVisitId,
      body: provenance(body, offline ? 'offline-record' : 'issue-body', { fresh: true }),
      headSha: provenance(gitSnapshot?.headSha ?? null, 'git-head', {
        fresh: gitSnapshot?.headSha != null,
      }),
      checks: provenance(checks, offline ? 'offline-record' : 'check-runs', {
        fresh: checks != null,
      }),
      worktree: provenance(worktree, 'bound-worktree', { fresh: worktree != null }),
      actionLedger,
      invocation: { issue, cwd, mode, maxLinks },
    });
  }

  appendActionEvent(args) {
    const fn = this.capabilities.appendActionEvent;
    return typeof fn === 'function' ? fn(args) : unavailable('appendActionEvent');
  }

  advanceActionLedgerHead(args) {
    const fn = this.capabilities.advanceActionLedgerHead;
    return typeof fn === 'function' ? fn(args) : unavailable('advanceActionLedgerHead');
  }

  recordLedgerDamageCarry(args) {
    const fn = this.capabilities.recordLedgerDamageCarry;
    return typeof fn === 'function' ? fn(args) : unavailable('recordLedgerDamageCarry');
  }

  withCorrelationIntent(args, operation) {
    const fn = this.capabilities.withCorrelationIntent;
    return typeof fn === 'function' ? fn(args, operation) : unavailable('withCorrelationIntent');
  }

  resolveCorrelation(args) {
    const fn = this.capabilities.resolveCorrelation;
    return typeof fn === 'function' ? fn(args) : unavailable('resolveCorrelation');
  }

  mutateActionEvidence(args) {
    const fn = this.capabilities.mutateActionEvidence;
    return typeof fn === 'function' ? fn(args) : unavailable('mutateActionEvidence');
  }

  now() {
    const fn = this.capabilities.now;
    return typeof fn === 'function' ? fn() : Date.now();
  }

  checkpoint(point, details) {
    const fn = this.capabilities.checkpoint;
    return typeof fn === 'function' ? fn(point, details) : undefined;
  }

  withIssueLock(args, operation) {
    const fn = this.capabilities.withIssueLock;
    return typeof fn === 'function' ? fn(args, operation) : operation();
  }

  supportsFinalBoundary() {
    return (
      typeof (this.capabilities.withBoundaryLock ?? this.capabilities.withIssueLock) ===
        'function' &&
      typeof this.capabilities.runPreMutationGate === 'function' &&
      typeof this.capabilities.requestTransition === 'function'
    );
  }

  async withBoundaryLock(args, operation) {
    const fn = this.capabilities.withBoundaryLock ?? this.capabilities.withIssueLock;
    if (typeof fn !== 'function') return operation();
    let callbackBegan = false;
    const profile = this.boundaryLockTimings();
    const lockArgs = { timeoutMs: profile.retryBudgetMs, retries: 1, ...args };
    try {
      return await fn(lockArgs, async () => {
        callbackBegan = true;
        const startedAt = this.now();
        try {
          return await operation();
        } finally {
          this.boundaryLockSamples.push(Math.max(0, this.now() - startedAt));
          if (this.boundaryLockSamples.length > BOUNDARY_LOCK_SAMPLE_LIMIT) {
            this.boundaryLockSamples.splice(
              0,
              this.boundaryLockSamples.length - BOUNDARY_LOCK_SAMPLE_LIMIT
            );
          }
        }
      });
    } catch (error) {
      if (!callbackBegan && error instanceof IssueLockError) {
        throw new BoundaryLockAcquireError(error.message, {
          cause: error,
          issue: error.issue ?? args?.issue,
          holder: error.holder ?? null,
          retry: error.retry ?? null,
        });
      }
      throw error;
    }
  }

  boundaryLockTimings() {
    const maxWaitMs = positiveNumber(
      this.capabilities.boundaryLockMaxWaitMs,
      BOUNDARY_LOCK_DEFAULT_MAX_WAIT_MS
    );
    const jitterMs = positiveNumber(
      this.capabilities.boundaryLockJitterMs,
      BOUNDARY_LOCK_DEFAULT_JITTER_MS
    );
    const p50Ms = percentile(this.boundaryLockSamples, 0.5);
    const p95Ms = percentile(this.boundaryLockSamples, 0.95);
    const p99Ms = percentile(this.boundaryLockSamples, 0.99);
    return Object.freeze({
      count: this.boundaryLockSamples.length,
      p50Ms,
      p95Ms,
      p99Ms,
      retryBudgetMs: Math.min(
        maxWaitMs,
        Math.max(BOUNDARY_LOCK_DEFAULT_RETRY_MS, Math.ceil(p95Ms + jitterMs))
      ),
      maxWaitMs,
    });
  }

  runPreMutationGate(args) {
    const fn = this.capabilities.runPreMutationGate;
    return typeof fn === 'function' ? fn(args) : unavailable('runPreMutationGate');
  }

  async requestTransition(args) {
    if (this.mode === 'offline') throw new Error('offline-boundary-refused');
    const fn = this.capabilities.requestTransition;
    return typeof fn === 'function' ? await fn(args) : unavailable('requestTransition');
  }
}
