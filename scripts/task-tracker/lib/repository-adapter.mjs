// @story #1117 #1453

import { readResidentActionLedger } from './resident-action-ledger-read.mjs';
import { readMoveCompleteState } from './move-state/sentinel.mjs';
import { createTaskSnapshot, provenance, reconcileCurrentState } from './task-snapshot.mjs';

const LAST_KNOWN_PROPERTY_RE =
  /<!--\s*aitm-last-known-state\s+state="([^"]+)"(?:\s+ts="[^"]*")?\s*-->/i;
const LAST_KNOWN_LEGACY_RE = /<!--\s*aitm-last-known-state:\s*([^>\s]+)\s*-->/i;

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

export class RepositoryAdapter {
  constructor(capabilities = {}) {
    this.capabilities = Object.freeze({ ...capabilities });
    this.mode = 'online';
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

  mutateActionEvidence(args) {
    const fn = this.capabilities.mutateActionEvidence;
    return typeof fn === 'function' ? fn(args) : unavailable('mutateActionEvidence');
  }

  now() {
    const fn = this.capabilities.now;
    return typeof fn === 'function' ? fn() : Date.now();
  }

  withIssueLock(args, operation) {
    const fn = this.capabilities.withIssueLock;
    return typeof fn === 'function' ? fn(args, operation) : operation();
  }

  withBoundaryLock(args, operation) {
    const fn = this.capabilities.withBoundaryLock;
    return typeof fn === 'function' ? fn(args, operation) : this.withIssueLock(args, operation);
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
