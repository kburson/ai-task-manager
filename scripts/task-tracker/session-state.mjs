import { assertRevisionStageHostEffect } from './lib/criteria-revision/transport-quarantine.mjs';
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
import { normalizeStateId } from './lib/lifecycle-policy/index.mjs';
import { withLock } from './fleet-registry.mjs';

function normalizeCachedKanbanState(record) {
  if (!record || typeof record !== 'object' || typeof record.kanbanState !== 'string') {
    return record;
  }
  return { ...record, kanbanState: normalizeStateId(record.kanbanState) };
}

function readJson(p) {
  if (!existsSync(p)) return null;
  try {
    return parseActiveTaskBytes(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function parseActiveTaskBytes(raw) {
  if (raw === null || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function atomicWrite(p, payload) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

// Returns the active-task record for `sid` or null when none is bound.
// Shape: { issue, entryStartTs, wordsAtStart, kanbanState, boundAt,
// worktreePath, worktreeBranch, worktreeResolvedAt, bindingGenerationId,
// cycleId, closedAt } — any field may
// be missing on a partially-populated or legacy file.
export function getActiveTask(sid, projDir) {
  const p = activeTaskPath(sid, projDir);
  return normalizeCachedKanbanState(readJson(p));
}

// Closed source DATA only; actual read selection and absence remain the
// native collector's responsibility. Shares the ordinary read normalization.
export function deriveRecordedActiveTaskRead(input) {
  if (
    !input ||
    Object.keys(input).join(',') !== 'bytes' ||
    (input.bytes !== null && typeof input.bytes !== 'string')
  )
    throw new TypeError('recorded-active-task-read');
  if (input.bytes === null) return null;
  const parsed = JSON.parse(input.bytes);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('recorded-active-task-read');
  return normalizeCachedKanbanState(parsed);
}

function activeTaskPayload(record, existing, boundAt) {
  const { state: _droppedState, ...recordWithoutState } = record;
  void _droppedState;
  // Preserve the derived `kanbanState` cache (#218 follow-up) across saves
  // that don't carry it. Only setSessionKanbanState / explicit refreshers
  // should mutate this field; the generic state writer (state.mjs#saveState)
  // doesn't know about it and would otherwise blow it away on every bind.
  let stickySameIssue = {};
  if (record.issue != null) {
    if (existing && existing.issue === record.issue) {
      if (!('kanbanState' in recordWithoutState) && existing.kanbanState) {
        stickySameIssue.kanbanState = normalizeStateId(existing.kanbanState);
      }
      if (!('closedAt' in recordWithoutState) && existing.closedAt) {
        stickySameIssue.closedAt = existing.closedAt;
      }
    }
  }
  const payload = {
    issue: record.issue ?? null,
    entryStartTs: record.entryStartTs ?? null,
    wordsAtStart: record.wordsAtStart ?? 0,
    boundAt: record.boundAt ?? boundAt,
    ...stickySameIssue,
    ...recordWithoutState,
  };
  if (typeof payload.kanbanState === 'string') {
    payload.kanbanState = normalizeStateId(payload.kanbanState);
  }
  return payload;
}

// Closed historical data projection only. Null existing bytes means captured
// absence; this function cannot establish that a native read actually occurred.
export function deriveRecordedActiveTask(input) {
  const invalid = () => {
    throw new TypeError('recorded-active-task');
  };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(',') !== 'boundAt,existingBytes,recordBytes' ||
    typeof input.boundAt !== 'string' ||
    !Number.isFinite(Date.parse(input.boundAt))
  )
    invalid();
  const parse = (bytes) => {
    if (typeof bytes !== 'string') invalid();
    let value;
    try {
      value = JSON.parse(bytes);
    } catch {
      invalid();
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    return value;
  };
  const record = parse(input.recordBytes);
  const existing = input.existingBytes === null ? null : parse(input.existingBytes);
  const payload = activeTaskPayload(record, existing, input.boundAt);
  return { payload, bytes: JSON.stringify(payload, null, 2) + '\n' };
}

const nativeStageSessionWrites = new WeakMap();
export function assertNativeStageSessionWrite(invocation, intent) {
  const original = nativeStageSessionWrites.get(invocation);
  if (!original || JSON.stringify(original) !== JSON.stringify(intent))
    throw new TypeError('native-session-write');
}
// Only the original saveState program operation can enter this fixed memory
// leaf. The sticky read and fallback clock stay inside resource serialization.
export async function setNativeStageActorTask(invocation, operation) {
  const native = await import('./lib/move-state/move-state-core.mjs');
  const source = await native.beginNativeStageCheckpointSession(invocation, operation);
  try {
    const record = operation.record;
    if (!record || typeof record !== 'object')
      throw new Error('setActiveTask: record must be an object');
    const existing =
      record.issue != null && source.beforeBytes !== null ? JSON.parse(source.beforeBytes) : null;
    const boundAt = record.boundAt ?? new Date().toISOString();
    const payload = activeTaskPayload(record, existing, boundAt);
    const intent = {
      invocation: source.invocation,
      file: source.file,
      stateBytes: source.stateBytes,
      recordBytes: JSON.stringify(record),
      boundAt,
      bytes: JSON.stringify(payload, null, 2) + '\n',
    };
    nativeStageSessionWrites.set(invocation, intent);
    await native.persistNativeStageCheckpoint(invocation, intent);
    await native.writeNativeStageCheckpoint(invocation);
    await native.completeNativeStageCheckpoint(invocation);
    return payload;
  } finally {
    nativeStageSessionWrites.delete(invocation);
    native.endNativeStageCheckpointLeaf(invocation);
  }
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
  assertRevisionStageHostEffect();
  if (!record || typeof record !== 'object') {
    throw new Error('setActiveTask: record must be an object');
  }
  const p = activeTaskPath(sid, projDir);
  return withLock(p, () => {
    const existing = record.issue != null ? readJson(p) : null;
    const payload = activeTaskPayload(record, existing, record.boundAt ?? new Date().toISOString());
    atomicWrite(p, payload);
    return payload;
  });
}

function sessionKanbanPayload(rawExisting, kanbanState) {
  if (!rawExisting || typeof rawExisting !== 'object') return { payload: null, changed: false };
  const existing = normalizeCachedKanbanState(rawExisting);
  const canonicalState = normalizeStateId(kanbanState);
  if (existing.kanbanState === canonicalState && rawExisting.kanbanState === canonicalState)
    return { payload: existing, changed: false };
  return { payload: { ...existing, kanbanState: canonicalState }, changed: true };
}

// Data-only projection for the bounded recorded Develop-to-Test tail.
export function deriveRecordedSessionKanban(input) {
  const invalid = () => {
    throw new TypeError('recorded-session-kanban');
  };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(',') !== 'existingBytes,state' ||
    input.state !== 'test'
  )
    invalid();
  let existing = null;
  if (input.existingBytes !== null) {
    if (typeof input.existingBytes !== 'string') invalid();
    try {
      existing = JSON.parse(input.existingBytes);
    } catch {
      invalid();
    }
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) invalid();
  }
  const { payload, changed } = sessionKanbanPayload(existing, input.state);
  return {
    payload,
    changed,
    bytes:
      payload === null
        ? null
        : changed
          ? JSON.stringify(payload, null, 2) + '\n'
          : input.existingBytes,
  };
}

// #218 follow-up: stamps a derived `kanbanState` field onto the record. The
// issue body `aitm-last-known-state` marker remains the source of truth — this
// is a synchronous read-cache for the activity-guard hook, refreshed by the
// single state mutator (move-state.mjs) and by reconcile / bind. Idempotent
// no-op when the record is absent or `kanbanState` is already current.
export function setSessionKanbanState(sid, kanbanState, projDir) {
  assertRevisionStageHostEffect();
  const p = activeTaskPath(sid, projDir);
  return withLock(p, () => {
    const rawExisting = readJson(p);
    const { payload, changed } = sessionKanbanPayload(rawExisting, kanbanState);
    if (!changed) return payload;
    atomicWrite(p, payload);
    return payload;
  });
}

// Removes the active-task file for `sid`. Idempotent — silently succeeds when
// the file is already absent.
export function clearActiveTask(sid, projDir) {
  assertRevisionStageHostEffect();
  const p = activeTaskPath(sid, projDir);
  return withLock(p, () => {
    if (!existsSync(p)) return;
    rmSync(p);
  });
}

// Atomically re-read and clear one active-task record only when the caller's
// predicate still matches. All record writers share this lock, so a concurrent
// issue switch or reopen cannot be overwritten or deleted by terminal cleanup.
export function compareAndClearActiveTask(sid, projDir, predicate) {
  assertRevisionStageHostEffect();
  if (typeof predicate !== 'function') {
    throw new Error('compareAndClearActiveTask: predicate must be a function');
  }
  const p = activeTaskPath(sid, projDir);
  return withLock(p, () => {
    const record = normalizeCachedKanbanState(readJson(p));
    if (!record) return { status: 'absent', record: null };
    if (!predicate(record)) return { status: 'superseded', record };
    rmSync(p);
    return { status: 'cleared', record };
  });
}

// Re-export the path helpers so callers that already import session-state
// don't need a second import line for the directory layout.
export { sessionDir, activeTaskPath };

// #1913 — genuine original cache read/set leaves; no DATA grants membership.
const nativeStageKanbanWrites = new WeakMap();
const nativeStageCacheReads = new WeakMap();
export function assertOriginalNativeCacheRead(input, result) {
  const original = nativeStageCacheReads.get(input);
  if (!original || original.result !== result || canonicalRecordJson(result) !== original.bytes)
    throw new TypeError('native-cache-read-return');
}
export function assertOriginalNativeStageKanbanWrite(input, intent) {
  const original = nativeStageKanbanWrites.get(input);
  if (!original || original.intent !== intent || canonicalRecordJson(intent) !== original.bytes)
    throw new TypeError('native-cache-set-intent');
}
export async function getNativeStageCachedTask(input, operation) {
  const native = await import('./lib/move-state/move-state-core.mjs');
  const source = await native.readNativeStageTailCacheSource(input, operation);
  native.assertNativeStageTailCacheRead(input);
  const result = normalizeCachedKanbanState(parseActiveTaskBytes(source.beforeBytes));
  nativeStageCacheReads.set(input, { result, bytes: canonicalRecordJson(result) });
  return result;
}
export async function setNativeStageKanbanState(input, operation) {
  const native = await import('./lib/move-state/move-state-core.mjs');
  const source = await native.readNativeStageTailCacheSource(input, operation);
  native.assertNativeStageTailCacheSet(input, operation);
  const rawExisting = parseActiveTaskBytes(source.beforeBytes);
  const { payload, changed } = sessionKanbanPayload(rawExisting, operation.stateArg);
  const intent = {
    file: source.file,
    beforeBytes: source.beforeBytes,
    bytes: changed ? JSON.stringify(payload, null, 2) + '\n' : source.beforeBytes,
  };
  nativeStageKanbanWrites.set(input, { intent, bytes: canonicalRecordJson(intent) });
  try {
    await native.persistNativeStageTailCache(input, intent);
    native.assertNativeStageTailCacheSet(input, operation);
    if (changed) await native.writeNativeStageTailCache(input);
    native.assertNativeStageTailCacheSet(input, operation);
    await native.completeNativeStageTailCache(input);
    native.assertNativeStageTailCacheSet(input, operation);
    return payload;
  } finally {
    nativeStageKanbanWrites.delete(input);
  }
}

import { canonicalRecordJson } from './lib/github-records/canonical-json.mjs';
