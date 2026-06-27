// #281 — shared bound-issue + kanban-state reader. Lifted from
// activity-guard.mjs so bash-guard can ask the same question without
// importing the hook script (which has top-level side effects).
//
// Source of truth: per-session `active-task.json#kanbanState`, mirrored by
// every state mutator from the live body's `aitm-last-known-state` marker.
// Legacy fallback: pre-#218 `task-tracker-state.json#state`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { STATE_MATRIX } from '../activity-policy.mjs';
import { sessionsDir as resolveSessionsDir, statePath as resolveStatePath } from '../paths.mjs';

export function readBoundState(root) {
  // #573: state lives under `.tmp/aitm/state/` now — read it through the resolver
  // rather than a hardcoded `.ai-task-manager/` path.
  const statePath = resolveStatePath(root);
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    /* missing or malformed */
  }
  const activeIssue =
    parsed && typeof parsed === 'object' && typeof parsed.active === 'string'
      ? parsed.active
      : null;

  const sessionState = readSessionKanbanState(root, activeIssue);
  if (sessionState != null) return { activeIssue, state: sessionState };

  if (parsed && typeof parsed === 'object' && typeof parsed.state === 'string') {
    const legacy = parsed.state;
    if (Object.prototype.hasOwnProperty.call(STATE_MATRIX, legacy)) {
      return { activeIssue, state: legacy };
    }
  }
  return { activeIssue, state: null };
}

function readSessionKanbanState(root, activeIssue) {
  if (!activeIssue) return null;
  const sessionsDir = resolveSessionsDir(root);
  let entries;
  try {
    entries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let best = null;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const p = path.join(sessionsDir, ent.name, 'active-task.json');
    let raw, parsed, mtimeMs;
    try {
      mtimeMs = statSync(p).mtimeMs;
      raw = readFileSync(p, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    if (parsed.issue !== activeIssue) continue;
    const k = typeof parsed.kanbanState === 'string' ? parsed.kanbanState : null;
    if (!k || !Object.prototype.hasOwnProperty.call(STATE_MATRIX, k)) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { mtimeMs, state: k };
  }
  return best ? best.state : null;
}
