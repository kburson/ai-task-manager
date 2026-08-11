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

function normalizeCachedKanbanState(record) {
  if (!record || typeof record !== 'object' || typeof record.kanbanState !== 'string') {
    return record;
  }
  return { ...record, kanbanState: normalizeStateId(record.kanbanState) };
}

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

function atomicWrite(p, payload) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

// Returns the active-task record for `sid` or null when none is bound.
// Shape: { issue, entryStartTs, wordsAtStart, kanbanState, boundAt,
// worktreePath, worktreeBranch, worktreeResolvedAt } — any field may be missing
// on a partially-populated or legacy file.
export function getActiveTask(sid, projDir) {
  const p = activeTaskPath(sid, projDir);
  return normalizeCachedKanbanState(readJson(p));
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
  // Preserve the derived `kanbanState` cache (#218 follow-up) across saves
  // that don't carry it. Only setSessionKanbanState / explicit refreshers
  // should mutate this field; the generic state writer (state.mjs#saveState)
  // doesn't know about it and would otherwise blow it away on every bind.
  let stickyKanban = {};
  if (!('kanbanState' in recordWithoutState) && record.issue != null) {
    const existing = readJson(activeTaskPath(sid, projDir));
    if (existing && existing.issue === record.issue && existing.kanbanState) {
      stickyKanban = { kanbanState: normalizeStateId(existing.kanbanState) };
    }
  }
  const payload = {
    issue: record.issue ?? null,
    entryStartTs: record.entryStartTs ?? null,
    wordsAtStart: record.wordsAtStart ?? 0,
    boundAt: record.boundAt ?? new Date().toISOString(),
    ...stickyKanban,
    ...recordWithoutState,
  };
  if (typeof payload.kanbanState === 'string') {
    payload.kanbanState = normalizeStateId(payload.kanbanState);
  }
  atomicWrite(activeTaskPath(sid, projDir), payload);
  return payload;
}

// #218 follow-up: stamps a derived `kanbanState` field onto the record. The
// issue body `aitm-last-known-state` marker remains the source of truth — this
// is a synchronous read-cache for the activity-guard hook, refreshed by the
// single state mutator (move-state.mjs) and by reconcile / bind. Idempotent
// no-op when the record is absent or `kanbanState` is already current.
export function setSessionKanbanState(sid, kanbanState, projDir) {
  const p = activeTaskPath(sid, projDir);
  const rawExisting = readJson(p);
  if (!rawExisting || typeof rawExisting !== 'object') return null;
  const existing = normalizeCachedKanbanState(rawExisting);
  const canonicalState = normalizeStateId(kanbanState);
  if (existing.kanbanState === canonicalState && rawExisting.kanbanState === canonicalState) {
    return existing;
  }
  const next = { ...existing, kanbanState: canonicalState };
  atomicWrite(p, next);
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

// Re-export the path helpers so callers that already import session-state
// don't need a second import line for the directory layout.
export { sessionDir, activeTaskPath };
