import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { legacyPathFor } from './paths.mjs';
import { clearActiveTask, getActiveTask, setActiveTask } from './session-state.mjs';

export const EMPTY_STATE = {
  active: null,
  lastActive: null,
  entryStartTs: null,
  wordsAtEntryStart: 0,
  totalActiveMinutes: 0,
  discoverBucket: null,
};

// Fields owned by per-session active-task.json (#212). The authoritative copy
// lives under .ai-task-manager/sessions/<sid>/active-task.json. During the
// one-release transition window we ALSO mirror them in the global state file
// so legacy readers (and tests that inspect the JSON directly) keep working.
// Reads overlay per-session over the legacy fallback, so the session record
// always wins when present.
// #218: `state` removed — the issue body's `aitm-last-known-state` marker is
// now the single source of truth. Stale `state` fields on disk are silently
// dropped on read.
const PER_SESSION_FIELDS = ['active', 'entryStartTs', 'wordsAtEntryStart'];

function currentSid() {
  const env = process.env || {};
  return env.CLAUDE_SESSION_ID || env.AI_TASK_MANAGER_SESSION_ID || 'default-session';
}

function migrateLegacyFields(parsed) {
  const out = { ...parsed };
  if (out.planBucket != null && out.discoverBucket == null) {
    out.discoverBucket = out.planBucket;
  }
  delete out.planBucket;
  if (out.active === 'plan') out.active = 'discover';
  if (out.lastActive === 'plan') out.lastActive = 'discover';
  return out;
}

// Returns the project root from a state-file path. The state file lives at
// `<projDir>/.ai-task-manager/task-tracker-state.json` (or the legacy
// `<projDir>/.claude/task-tracker-state.json`). We derive `projDir` so the
// per-session active-task.json sits alongside, not in a stray location when
// callers pass an absolute path.
function projectDirForState(statePath) {
  const abs = path.isAbsolute(statePath) ? statePath : path.resolve(statePath);
  const norm = abs.split(path.sep).join('/');
  for (const marker of ['/.ai-task-manager/', '/.claude/']) {
    const idx = norm.indexOf(marker);
    if (idx !== -1) return abs.slice(0, idx);
  }
  return path.dirname(abs);
}

export function loadState(statePath) {
  let readPath = statePath;
  if (!existsSync(readPath)) {
    const legacy = legacyPathFor(statePath);
    if (legacy && existsSync(legacy)) readPath = legacy;
  }
  let parsed = {};
  if (existsSync(readPath)) {
    try {
      parsed = JSON.parse(readFileSync(readPath, 'utf8'));
    } catch {
      parsed = {};
    }
  }
  const base = { ...EMPTY_STATE, ...migrateLegacyFields(parsed) };
  // #218: silently drop any stale `state` field from on-disk JSON. The issue
  // body is now the single source of truth.
  delete base.state;
  // Per-session overlay (#212). When a session-scoped active-task.json exists,
  // its values take precedence over any legacy fields surfaced from the global
  // file. Missing-dir tolerated by getActiveTask (returns null).
  const sid = currentSid();
  const projDir = projectDirForState(statePath);
  const active = getActiveTask(sid, projDir);
  if (active && typeof active === 'object') {
    if (active.issue != null) {
      base.active = active.issue === 'plan' ? 'discover' : active.issue;
    }
    if (active.entryStartTs != null) base.entryStartTs = active.entryStartTs;
    if (active.wordsAtStart != null) base.wordsAtEntryStart = active.wordsAtStart;
  }
  return base;
}

export function saveState(state, statePath) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  const sid = currentSid();
  const projDir = projectDirForState(statePath);
  // Split: per-session triple goes to active-task.json; remainder stays in the
  // global ledger file.
  const hasActiveBinding =
    state.active != null ||
    state.entryStartTs != null ||
    (state.wordsAtEntryStart != null && state.wordsAtEntryStart !== 0);
  if (hasActiveBinding) {
    setActiveTask(
      sid,
      {
        issue: state.active ?? null,
        entryStartTs: state.entryStartTs ?? null,
        wordsAtStart: state.wordsAtEntryStart ?? 0,
      },
      projDir
    );
  } else {
    clearActiveTask(sid, projDir);
  }
  // Dual-write during transition (#212): mirror per-session fields in global.
  // Read-path overlays session record, so the session copy is authoritative.
  void PER_SESSION_FIELDS;
  const globalPayload = { ...state };
  // #218: never persist `state` to disk — issue body is the source of truth.
  delete globalPayload.state;
  writeFileSync(statePath, JSON.stringify(globalPayload, null, 2) + '\n', 'utf8');
}

export function clearActive(statePath) {
  const s = loadState(statePath);
  s.active = null;
  s.entryStartTs = null;
  s.wordsAtEntryStart = 0;
  s.discoverBucket = null;
  // keep lastActive; `state` is body-sourced (#218), not persisted here.
  saveState(s, statePath);
}
