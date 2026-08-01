// Per-session active-task state. Owns `<projectRoot>/.ai-task-manager/sessions/<sid>/active-task.json`.
//
// EPIC #207 carves per-session state out of the global `task-tracker-state.json`
// so two Claude Code sessions in the same repo don't clobber each other's bound
// issue or pause state. This module is the storage primitive for the bound-issue
// triple (`issue`, `entryStartTs`, `wordsAtStart`) plus optional `state` tag.
//
// Tolerates a missing session directory on read (returns null). Writes are
// atomic via tmp + rename to avoid partial-write tears under concurrent verbs.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { activeTaskPath, sessionDir } from './paths.mjs';
import {
  assertIntentTransition,
  attachIntentCompensation,
  attachIntentCompensationReceipt,
  attachIntentForwardPhase,
  attachIntentReceipt,
  checkpointIntentCompensationProjection,
  checkpointIntentProjection,
  createPriorSessionSnapshot,
  createWorkLeaseIntent,
  normalizePriorSessionSnapshot,
  normalizeLeaseContext,
  normalizeWorkLeaseAuthority,
  setIntentProjectionInput,
  validateWorkLeaseCompensation,
  workLeaseCompensationReconciled,
  workLeaseIntentReconciled,
  workLeaseIntentsEqual,
} from './lib/work-lease/context.mjs';
import {
  assertLifecycleJournalTransition,
  normalizeLifecycleJournal,
} from './lib/work-lease/lifecycle-orchestration.mjs';

function readJson(p) {
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseJsonForMutation(raw) {
  if (!raw.trim()) {
    throw new Error('active-task state is empty');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('active-task state is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('active-task state must be an object');
  }
  if (
    Object.hasOwn(parsed, 'workLeaseIntent') &&
    (!parsed.workLeaseIntent ||
      typeof parsed.workLeaseIntent !== 'object' ||
      Array.isArray(parsed.workLeaseIntent))
  ) {
    throw new Error('active-task workLeaseIntent is malformed');
  }
  if (
    Object.hasOwn(parsed, 'workLeaseLifecycleJournal') &&
    (!parsed.workLeaseLifecycleJournal ||
      typeof parsed.workLeaseLifecycleJournal !== 'object' ||
      Array.isArray(parsed.workLeaseLifecycleJournal))
  ) {
    throw new Error('active-task workLeaseLifecycleJournal is malformed');
  }
  return parsed;
}

function readJsonForMutation(p) {
  if (!existsSync(p)) return null;
  return parseJsonForMutation(readFileSync(p, 'utf8'));
}

function readActiveTaskWithSnapshot(p) {
  if (!existsSync(p)) {
    return {
      existing: null,
      snapshot: createPriorSessionSnapshot({ present: false, bytes: null }),
    };
  }
  const bytes = Buffer.from(readFileSync(p));
  return {
    existing: parseJsonForMutation(bytes.toString('utf8')),
    snapshot: createPriorSessionSnapshot({ present: true, bytes }),
  };
}

function atomicWrite(p, payload) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

function atomicWriteBytes(p, bytes) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, p);
}

function authorityIssue(record) {
  return record?.issue ?? record?.leaseIssue ?? null;
}

function canonicalIssue(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  return match?.[1] ?? null;
}

function mutateActiveTask(sid, projDir, mutate) {
  const p = activeTaskPath(sid, projDir);
  const existing = readJsonForMutation(p);
  const next = mutate(existing);
  if (next == null) return existing;
  atomicWrite(p, next);
  return next;
}

// Returns the active-task record for `sid` or null when none is bound.
// Shape: { issue, entryStartTs, wordsAtStart, state, boundAt } — any field
// may be missing on a partially-populated file.
export function getActiveTask(sid, projDir) {
  const p = activeTaskPath(sid, projDir);
  return readJson(p);
}

// Capture the active-task file before a write-ahead acquire intent is persisted.
// The raw bytes, including whitespace and final-newline choice, are retained so
// a deterministic loser can restore the exact pre-attempt state. setWorkLeaseIntent
// converts this process-local form into the durable digest-checked intent form.
export function captureActiveTaskSnapshot(sid, projDir) {
  const p = activeTaskPath(sid, projDir);
  if (!existsSync(p)) return Object.freeze({ present: false, bytes: null });
  return Object.freeze({ present: true, bytes: Buffer.from(readFileSync(p)) });
}

// Restore only while the file still contains the acquire intent created by this
// attempt. The conditional guard prevents a delayed loser from overwriting a
// newer session write. Exact prior absence is restored by removing the file.
export function restoreActiveTaskSnapshot(sid, snapshot, expectedIdempotencyKey, projDir) {
  if (typeof expectedIdempotencyKey !== 'string' || expectedIdempotencyKey.trim() === '') {
    throw new Error('restoreActiveTaskSnapshot: invalid snapshot or idempotency key');
  }
  const persistedSnapshot = Object.hasOwn(snapshot ?? {}, 'bytes')
    ? createPriorSessionSnapshot(snapshot)
    : normalizePriorSessionSnapshot(snapshot);
  const normalizedSnapshot = {
    present: persistedSnapshot.present,
    bytes: persistedSnapshot.present ? Buffer.from(persistedSnapshot.bytesBase64, 'base64') : null,
  };
  const p = activeTaskPath(sid, projDir);
  const current = readJsonForMutation(p);
  if (
    current?.workLeaseIntent?.idempotencyKey !== expectedIdempotencyKey ||
    current.workLeaseIntent.priorSessionSnapshot?.digest !== persistedSnapshot.digest
  ) {
    return false;
  }
  if (!normalizedSnapshot.present) {
    if (existsSync(p)) rmSync(p);
    return true;
  }
  if (!Buffer.isBuffer(normalizedSnapshot.bytes)) {
    throw new Error('restoreActiveTaskSnapshot: present snapshot must contain raw bytes');
  }
  atomicWriteBytes(p, normalizedSnapshot.bytes);
  return true;
}

// Persists the active-task record for `sid`. Stamps `boundAt` to the current
// ISO timestamp if the caller did not supply one. Unknown extra keys are
// preserved on the record so downstream EPIC #207 sub-issues can extend the
// schema without breaking this writer.
//
// #218: `state` is no longer part of the canonical schema (the issue body's
// `aitm-last-known-state` marker is the source of truth). The field is
// stripped on write; legacy files with `state` present continue to load.
export function setActiveTask(sid, record, projDir) {
  if (!record || typeof record !== 'object') {
    throw new Error('setActiveTask: record must be an object');
  }
  const { state: _droppedState, ...recordWithoutState } = record;
  void _droppedState;
  const suppliedAuthorityKeys = ['lease', 'holder', 'binding'].filter((key) =>
    Object.hasOwn(recordWithoutState, key)
  );
  if (suppliedAuthorityKeys.length > 0) {
    if (suppliedAuthorityKeys.length !== 3) {
      throw new TypeError('work-lease authority must contain exactly lease, holder, and binding');
    }
    const authority = normalizeWorkLeaseAuthority(
      {
        lease: recordWithoutState.lease,
        holder: recordWithoutState.holder,
        binding: recordWithoutState.binding,
      },
      { issueId: authorityIssue(recordWithoutState) }
    );
    Object.assign(recordWithoutState, authority);
  }
  const existing = readJsonForMutation(activeTaskPath(sid, projDir));
  if (Object.hasOwn(recordWithoutState, 'workLeaseLifecycleJournal')) {
    const suppliedJournal = normalizeLifecycleJournal(recordWithoutState.workLeaseLifecycleJournal);
    if (
      !existing?.workLeaseLifecycleJournal ||
      JSON.stringify(normalizeLifecycleJournal(existing.workLeaseLifecycleJournal)) !==
        JSON.stringify(suppliedJournal)
    ) {
      throw new Error('generic session write cannot create or replace lifecycle journal');
    }
    recordWithoutState.workLeaseLifecycleJournal = suppliedJournal;
  }
  const existingAuthorityIssue = canonicalIssue(authorityIssue(existing));
  const recordAuthorityIssue = canonicalIssue(authorityIssue(record));
  const sameAuthorityIssue =
    existingAuthorityIssue != null && existingAuthorityIssue === recordAuthorityIssue;
  // `kanbanState` and fenced authority are issue-scoped sticky fields. Generic
  // timing/session saves preserve them only while they still describe the same
  // issue. A different issue starts without either projection.
  const stickyIssueState = {};
  if (sameAuthorityIssue && !('kanbanState' in recordWithoutState) && existing.kanbanState) {
    stickyIssueState.kanbanState = existing.kanbanState;
  }
  if (
    sameAuthorityIssue &&
    !('lease' in recordWithoutState) &&
    !('holder' in recordWithoutState) &&
    !('binding' in recordWithoutState) &&
    existing.lease
  ) {
    if (existing.holder === undefined && existing.binding === undefined) {
      // Read-only compatibility for a pre-6B1 session. Governed use must
      // backfill this lease from authoritative project observation before it
      // can construct any request.
      stickyIssueState.lease = normalizeLeaseContext(existing.lease);
    } else {
      Object.assign(
        stickyIssueState,
        normalizeWorkLeaseAuthority(
          { lease: existing.lease, holder: existing.holder, binding: existing.binding },
          { issueId: authorityIssue(existing) }
        )
      );
    }
  }
  // An incomplete intent is a crash-recovery record, not granted authority.
  // Keep it through generic projections (including an issue switch) until the
  // reconciler positively clears it.
  const stickyIntent = {};
  if (!('workLeaseIntent' in recordWithoutState) && existing?.workLeaseIntent) {
    stickyIntent.workLeaseIntent = existing.workLeaseIntent;
  }
  const stickyLifecycleJournal = {};
  if (!('workLeaseLifecycleJournal' in recordWithoutState) && existing?.workLeaseLifecycleJournal) {
    stickyLifecycleJournal.workLeaseLifecycleJournal = existing.workLeaseLifecycleJournal;
  }
  const payload = {
    issue: record.issue ?? null,
    entryStartTs: record.entryStartTs ?? null,
    wordsAtStart: record.wordsAtStart ?? 0,
    boundAt: record.boundAt ?? new Date().toISOString(),
    ...stickyIssueState,
    ...stickyIntent,
    ...stickyLifecycleJournal,
    ...recordWithoutState,
  };
  atomicWrite(activeTaskPath(sid, projDir), payload);
  return payload;
}

// #218 follow-up: stamps a derived `kanbanState` field onto the record. The
// issue body `aitm-last-known-state` marker remains the source of truth — this
// is a synchronous read-cache for the activity-guard hook, refreshed by the
// single state mutator (move-state.mjs) and by reconcile / bind. Idempotent
// no-op when the record is absent or `kanbanState` is already current.
export function setSessionKanbanState(sid, kanbanState, projDir) {
  const existing = getActiveTask(sid, projDir);
  if (!existing || typeof existing !== 'object') return null;
  if (existing.kanbanState === kanbanState) return existing;
  const next = { ...existing, kanbanState };
  atomicWrite(activeTaskPath(sid, projDir), next);
  return next;
}

// Removes the active-task file for `sid`. Idempotent — silently succeeds when
// the file is already absent.
export function clearActiveTask(sid, projDir) {
  const p = activeTaskPath(sid, projDir);
  if (!existsSync(p)) return;
  try {
    rmSync(p);
  } catch {
    /* tolerate race with another writer */
  }
}

// Removes granted authority only when the caller still holds the exact lease and fence.
// A delayed cleanup from an older holder is therefore an idempotent no-op.
export function clearActiveTaskLease(sid, expectedLeaseId, expectedFencingToken, projDir) {
  let cleared = false;
  mutateActiveTask(sid, projDir, (existing) => {
    if (
      !existing?.lease ||
      existing.workLeaseLifecycleJournal ||
      existing.lease.leaseId !== expectedLeaseId ||
      existing.lease.fencingToken !== expectedFencingToken
    ) {
      return null;
    }
    const next = { ...existing };
    delete next.lease;
    delete next.holder;
    delete next.binding;
    if (next.issue == null && !next.workLeaseIntent) delete next.leaseIssue;
    cleared = true;
    return next;
  });
  return cleared;
}

export function setWorkLeaseLifecycleJournal(sid, journalInput, projDir) {
  const journal = normalizeLifecycleJournal(journalInput);
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.lease) throw new Error('lifecycle journal requires persisted session authority');
    const authority = normalizeWorkLeaseAuthority(
      { lease: existing.lease, holder: existing.holder, binding: existing.binding },
      { issueId: authorityIssue(existing) }
    );
    if (JSON.stringify(authority) !== JSON.stringify(journal.authority)) {
      throw new Error('lifecycle journal authority does not match the current session authority');
    }
    if (existing.workLeaseLifecycleJournal) {
      const current = normalizeLifecycleJournal(existing.workLeaseLifecycleJournal);
      if (JSON.stringify(current) === JSON.stringify(journal)) return existing;
      throw new Error('session has an unreconciled lifecycle journal');
    }
    return { ...existing, workLeaseLifecycleJournal: journal };
  });
}

export function updateWorkLeaseLifecycleJournal(sid, expectedOperationId, journalInput, projDir) {
  const journal = normalizeLifecycleJournal(journalInput);
  return mutateActiveTask(sid, projDir, (existing) => {
    const current = existing?.workLeaseLifecycleJournal;
    if (
      !current ||
      current.operationId !== expectedOperationId ||
      journal.operationId !== expectedOperationId
    ) {
      throw new Error('lifecycle journal operation identity does not match');
    }
    if (JSON.stringify(current) === JSON.stringify(journal)) return existing;
    return {
      ...existing,
      workLeaseLifecycleJournal: assertLifecycleJournalTransition(current, journal),
    };
  });
}

export function clearWorkLeaseLifecycleJournal(
  sid,
  expectedOperationId,
  expectedLeaseId,
  expectedFencingToken,
  projDir
) {
  let cleared = false;
  mutateActiveTask(sid, projDir, (existing) => {
    if (
      existing?.workLeaseLifecycleJournal?.operationId !== expectedOperationId ||
      existing?.lease?.leaseId !== expectedLeaseId ||
      existing?.lease?.fencingToken !== expectedFencingToken
    ) {
      return null;
    }
    const next = { ...existing };
    delete next.workLeaseLifecycleJournal;
    delete next.lease;
    delete next.holder;
    delete next.binding;
    if (next.issue == null && !next.workLeaseIntent) delete next.leaseIssue;
    cleared = true;
    return next;
  });
  return cleared;
}

// Persists the exact canonical acquire/switch request before authority mutation.
// The helper validates all content before touching the session record.
export function setWorkLeaseIntent(sid, input, projDir) {
  const p = activeTaskPath(sid, projDir);
  const { existing: existingBeforeMutation, snapshot: capturedSnapshot } =
    readActiveTaskWithSnapshot(p);
  const suppliedSnapshot = input?.priorSessionSnapshot;
  const priorSessionSnapshot = suppliedSnapshot
    ? Object.hasOwn(suppliedSnapshot, 'bytes')
      ? createPriorSessionSnapshot(suppliedSnapshot)
      : suppliedSnapshot
    : (existingBeforeMutation?.workLeaseIntent?.priorSessionSnapshot ?? capturedSnapshot);
  const intent = createWorkLeaseIntent({ ...input, priorSessionSnapshot });
  const request = JSON.parse(intent.canonicalRequest);
  const base = existingBeforeMutation ?? {
    issue: null,
    entryStartTs: null,
    wordsAtStart: 0,
    boundAt: new Date().toISOString(),
  };
  if (base.workLeaseIntent) {
    if (workLeaseIntentsEqual(base.workLeaseIntent, intent)) return base;
    throw new Error('session has an unreconciled work-lease intent');
  }
  const currentIssue = authorityIssue(base);
  const intentIssue = intent.operation === 'resume' ? intent.issueId : request.issueId;
  if (
    (intent.operation === 'resume' && currentIssue == null) ||
    (currentIssue != null && canonicalIssue(currentIssue) !== intentIssue)
  ) {
    throw new Error('work-lease intent issue does not match the current session authority');
  }
  if (intent.operation === 'resume') {
    let lease;
    try {
      lease = normalizeLeaseContext(base.lease);
    } catch {
      throw new Error('resume intent requires the current session authority lease');
    }
    if (
      lease.projectId !== request.projectId ||
      lease.leaseId !== request.leaseId ||
      lease.fencingToken !== request.fencingToken
    ) {
      throw new Error('resume intent request does not match the current session authority lease');
    }
  }
  if (intent.operation === 'switchLease') {
    let lease;
    try {
      lease = normalizeLeaseContext(base.lease);
    } catch {
      throw new Error('switch intent requires the current session source lease');
    }
    if (
      lease.projectId !== request.projectId ||
      lease.leaseId !== request.leaseId ||
      lease.fencingToken !== request.fencingToken
    ) {
      throw new Error('switch intent request does not match the current session source lease');
    }
    if (lease.worktreeId !== request.target.holder.worktreeId) {
      throw new Error('switch intent target holder does not match the source worktree');
    }
  }
  const next = {
    ...base,
    ...(currentIssue == null ? { leaseIssue: `#${intentIssue}` } : {}),
    workLeaseIntent: intent,
  };
  atomicWrite(p, next);
  return next;
}

export function attachWorkLeaseIntentReceipt(sid, receipt, projDir) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent) {
      throw new Error('work-lease intent is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: attachIntentReceipt(existing.workLeaseIntent, receipt),
    };
  });
}

export function commitWorkLeaseForwardPhase(sid, forwardPhase, projDir) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent) {
      throw new Error('work-lease intent is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: attachIntentForwardPhase(existing.workLeaseIntent, forwardPhase),
    };
  });
}

export function setWorkLeaseCompensation(sid, compensation, projDir) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent) {
      throw new Error('work-lease intent is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: attachIntentCompensation(existing.workLeaseIntent, compensation),
    };
  });
}

export function attachWorkLeaseCompensationReceipt(sid, receipt, projDir) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent?.compensation) {
      throw new Error('work-lease compensation is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: attachIntentCompensationReceipt(existing.workLeaseIntent, receipt),
    };
  });
}

export function checkpointWorkLeaseCompensationProjection(
  sid,
  projection,
  reconciliationProof,
  expectedTransitionId,
  completedAt,
  projDir
) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent?.compensation) {
      throw new Error('work-lease compensation is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: checkpointIntentCompensationProjection(
        existing.workLeaseIntent,
        projection,
        reconciliationProof,
        expectedTransitionId,
        completedAt
      ),
    };
  });
}

export function restoreCompensatedActiveTask(
  sid,
  compensatedLease,
  expectedTransitionId,
  expectedProjectionId,
  projDir
) {
  const p = activeTaskPath(sid, projDir);
  const existing = readJsonForMutation(p);
  const intent = existing?.workLeaseIntent;
  const compensationRequest = validateWorkLeaseCompensation(intent, {
    requireAllProjections: true,
  });
  const compensation = intent.compensation;
  if (
    compensation.transitionId !== expectedTransitionId ||
    compensation.projections.session?.projectionId !== expectedProjectionId
  ) {
    throw new Error('work-lease compensation session projection identity does not match');
  }
  const lease = normalizeLeaseContext(compensatedLease);
  const receiptLease = compensation.receipt?.lease;
  if (
    lease.projectId !== receiptLease?.projectId ||
    lease.leaseId !== receiptLease?.leaseId ||
    lease.fencingToken !== receiptLease?.fencingToken ||
    lease.worktreeId !== compensationRequest.target.holder.worktreeId
  ) {
    throw new Error('work-lease compensation session lease does not match receipt');
  }
  const snapshot = normalizePriorSessionSnapshot(intent.priorSessionSnapshot);
  if (!snapshot.present) {
    throw new Error('work-lease compensation source snapshot is missing');
  }
  let prior;
  try {
    prior = parseJsonForMutation(Buffer.from(snapshot.bytesBase64, 'base64').toString('utf8'));
  } catch {
    throw new Error('work-lease compensation source snapshot is malformed');
  }
  if (canonicalIssue(authorityIssue(prior)) !== compensationRequest.target.issueId) {
    throw new Error('work-lease compensation source snapshot issue does not match');
  }
  let priorLease;
  try {
    priorLease = normalizeLeaseContext(prior.lease);
  } catch {
    throw new Error('work-lease compensation source snapshot lease is malformed');
  }
  const next = {
    ...prior,
    lease,
    workLeaseIntent: intent,
  };
  atomicWrite(p, next);
  const readback = readJsonForMutation(p);
  const priorNonAuthority = { ...prior };
  const readbackNonAuthority = { ...readback };
  delete priorNonAuthority.lease;
  delete priorNonAuthority.workLeaseIntent;
  delete readbackNonAuthority.lease;
  delete readbackNonAuthority.workLeaseIntent;
  if (
    canonicalIssue(authorityIssue(readback)) !== compensationRequest.target.issueId ||
    JSON.stringify(readbackNonAuthority) !== JSON.stringify(priorNonAuthority) ||
    JSON.stringify(readback.lease) !== JSON.stringify(lease) ||
    readback.workLeaseIntent?.compensation?.transitionId !== expectedTransitionId ||
    readback.lease.leaseId === priorLease.leaseId ||
    readback.lease.fencingToken === priorLease.fencingToken
  ) {
    throw new Error('work-lease compensation session readback does not match');
  }
  return readback;
}

export function setWorkLeaseProjectionInput(sid, projection, input, expectedTransitionId, projDir) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent) {
      throw new Error('work-lease intent is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: setIntentProjectionInput(
        existing.workLeaseIntent,
        projection,
        input,
        expectedTransitionId
      ),
    };
  });
}

export function checkpointWorkLeaseProjection(
  sid,
  projection,
  reconciliationProof,
  expectedTransitionId,
  completedAt,
  projDir
) {
  return mutateActiveTask(sid, projDir, (existing) => {
    if (!existing?.workLeaseIntent) {
      throw new Error('work-lease intent is not persisted');
    }
    return {
      ...existing,
      workLeaseIntent: checkpointIntentProjection(
        existing.workLeaseIntent,
        projection,
        reconciliationProof,
        expectedTransitionId,
        completedAt
      ),
    };
  });
}

export function clearWorkLeaseIntent(sid, expectedTransitionId, projDir) {
  let cleared = false;
  mutateActiveTask(sid, projDir, (existing) => {
    const intent = existing?.workLeaseIntent;
    if (!intent) return null;
    const compensated = workLeaseCompensationReconciled(intent);
    if (!compensated && !workLeaseIntentReconciled(intent)) return null;
    try {
      if (compensated) {
        if (intent.compensation.transitionId !== expectedTransitionId) return null;
      } else {
        assertIntentTransition(intent, expectedTransitionId);
      }
    } catch {
      return null;
    }
    const next = { ...existing };
    delete next.workLeaseIntent;
    if (next.issue == null && !next.lease) delete next.leaseIssue;
    cleared = true;
    return next;
  });
  return cleared;
}

// Re-export the path helpers so callers that already import session-state
// don't need a second import line for the directory layout.
export { sessionDir, activeTaskPath };
