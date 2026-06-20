import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { legacyPathFor, existingRuntimePath, SHARED_DIR } from './paths.mjs';
import { clearActiveTask, getActiveTask, setActiveTask } from './session-state.mjs';
import { currentSessionId } from './word-counter.mjs';

export const EMPTY_STATE = {
  active: null,
  lastActive: null,
  entryStartTs: null,
  wordsAtEntryStart: 0,
  totalActiveMinutes: 0,
  discoverBucket: null,
  // #475 AC1 — durable monotonic Word Marker. Carried across bindings and
  // stamped on EVERY timing row (including audit/lifecycle rows that have no
  // live session) so the cumulative total never collapses to 0. Lives in the
  // global ledger, not the per-session overlay, so it survives rebinds.
  lastWordMarker: 0,
  // #475 AC2 — timestamp of the most recent `/task pause`. `resume` uses it to
  // compute the idle span of the pause window, then clears it.
  pausedAtTs: null,
};

// #475 AC1 — monotonic advance of the durable Word Marker. Never decreases:
// returns the larger of the prior durable value and the freshly-computed
// candidate. Non-numeric / negative inputs floor to 0.
export function advanceWordMarker(prev, candidate) {
  const p = Number.isFinite(Number(prev)) ? Math.max(0, Number(prev)) : 0;
  const c = Number.isFinite(Number(candidate)) ? Math.max(0, Number(candidate)) : 0;
  return Math.max(p, c);
}

// #475 AC1 — read the durable Word Marker for audit/lifecycle rows emitted by
// verbs that hold a `projDir` (or nothing) rather than a loaded `state`/`statePath`
// (approve, reconcile, promote, hook events). Returns 0 on any failure so a row
// is still emitted. Callers that already have a loaded state should use
// `state.lastWordMarker ?? 0` directly instead of reloading.
export function durableWordMarker(projDir) {
  try {
    const sp = existingRuntimePath(projDir, `${SHARED_DIR}/task-tracker-state.json`);
    return loadState(sp).lastWordMarker ?? 0;
  } catch {
    return 0;
  }
}

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
  // #273 — delegate to the lone resolver so this writer agrees with the
  // activity-guard / move-state readers on which sid represents "this session".
  // Pre-#273 this branch returned `'default-session'` while readers used a
  // mtime-sorted .jsonl basename; the disagreement wedged sessions on bind.
  return currentSessionId();
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
//
// #332: use `lastIndexOf`, not `indexOf`. For worktrees rooted under
// `<main>/.claude/worktrees/<wt>/`, the path contains TWO `/.claude/`
// segments — the outer worktree-host one and the inner per-worktree legacy
// state dir. The rightmost anchor is the one closest to the state file and is
// always the correct project root. `indexOf` returned the outer (`<main>`)
// segment, contaminating worktree session state into main.
export function projectDirForState(statePath) {
  const abs = path.isAbsolute(statePath) ? statePath : path.resolve(statePath);
  const norm = abs.split(path.sep).join('/');
  for (const marker of ['/.ai-task-manager/', '/.claude/']) {
    const idx = norm.lastIndexOf(marker);
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

// #407 — next-state for a successful NON-terminal verb (test, review) that
// closes the open timing session but MUST keep the issue bound. Resets
// `entryStartTs`/`wordsAtEntryStart` (session closed) and records `lastActive`,
// while preserving `active` so the following verb needs no intervening
// `start <N>` re-bind. Contrast `pause` (the sole explicit unbind), which
// nulls `active`. Pure; exported for the #407 regression test.
export function pauseTimingKeepBinding(state, ref) {
  return {
    ...state,
    active: ref,
    entryStartTs: null,
    wordsAtEntryStart: 0,
    lastActive: ref,
  };
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
