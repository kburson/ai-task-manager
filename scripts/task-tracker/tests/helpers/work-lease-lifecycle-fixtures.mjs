import { createHash } from 'node:crypto';

export const lifecycle = await import('../../lib/work-lease/lifecycle-orchestration.mjs');

const displayPath = '/project/.worktrees/1054-lifecycle-journal-core';
export const holder = Object.freeze({
  principalKind: 'worker',
  provider: 'codex',
  agentRunId: 'run-1054',
  sessionId: 'session-1054',
  hostId: 'host-1',
  pid: 1054,
  worktreeId: 'worktree-1054',
  pathHash: createHash('sha256').update(displayPath).digest('hex'),
  branch: 'feature/child/1054',
});
export const binding = Object.freeze({
  sessionId: holder.sessionId,
  issueId: '1054',
  worktreeId: holder.worktreeId,
  displayPath,
});
export const authority = Object.freeze({
  lease: Object.freeze({
    projectId: 'project-1',
    leaseId: 'lease-1054',
    fencingToken: '41',
    worktreeId: holder.worktreeId,
  }),
  holder,
  binding,
});

export function makeJournal(overrides = {}) {
  return lifecycle.createLifecycleJournal({
    operationId: 'lifecycle:1054:pause:1',
    action: 'pause',
    issueId: '1054',
    authority,
    projections: [
      { name: 'timing', input: { event: 'pause:other' } },
      { name: 'session', input: { paused: true } },
    ],
    ...overrides,
  });
}

export function pauseRequest(overrides = {}) {
  return {
    projectId: authority.lease.projectId,
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
    idempotencyKey: 'lifecycle:1054:pause:request:1',
    requestedAt: '2026-08-01T02:00:00.000Z',
    ttlMs: 86_400_000,
    lifecycle: { expectedState: 'active', nextState: 'paused' },
    holder,
    binding,
    ...overrides,
  };
}

export function pausedReceipt(overrides = {}) {
  return {
    projectId: authority.lease.projectId,
    issueId: '1054',
    mode: 'write',
    leaseId: authority.lease.leaseId,
    fencingToken: authority.lease.fencingToken,
    state: 'paused',
    holder,
    acquiredAt: '2026-08-01T01:45:00.000Z',
    heartbeatAt: '2026-08-01T02:00:00.000Z',
    expiresAt: '2026-08-02T02:00:00.000Z',
    audit: {},
    ...overrides,
  };
}

export function readyJournal() {
  return lifecycle.checkpointLifecycleProjection(
    lifecycle.checkpointLifecycleProjection(makeJournal(), 'timing', { applied: true }),
    'session',
    { applied: true }
  );
}

export function journalWithReceipt() {
  const request = pauseRequest();
  const receipt = pausedReceipt();
  const journal = lifecycle.attachLifecycleReceipt(
    lifecycle.attachLifecycleRequest(readyJournal(), 'renew', request),
    receipt
  );
  return { request, receipt, journal };
}

export function committedReplayStore(receipt, observe = () => {}) {
  return {
    async replayMutation(selector) {
      observe(selector);
      return { selector, outcome: 'committed', statusCode: 200, result: receipt };
    },
  };
}
