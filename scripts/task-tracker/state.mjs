import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  legacyPathFor,
  statePath as resolveStatePath,
  SHARED_DIR_SEGMENT,
  TMP_AITM_SEGMENT,
} from './paths.mjs';
import { clearActiveTask, getActiveTask, setActiveTask } from './session-state.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
} from './word-counter.mjs';

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
    const sp = resolveStatePath(projDir);
    return loadState(sp).lastWordMarker ?? 0;
  } catch {
    return 0;
  }
}

// EPIC #823 (C8, #832) — bank the UNINTERRUPTED transcript tail into the durable
// marker + per-sid cursor. The promote verbs (`develop`/`test`/`review`) never
// call `flushActiveToGH`, so context-words accrued since the last flush sit
// un-counted in the per-sid cursor when a phase closes. Called by the phase-pair
// writer (`emitPhasePairRows`) BEFORE it stamps the `<phase>:completed` row, so
// the completed row's Word-Marker cell — and the own-issue Δwords the close
// walker derives from it — include this trailing tail (Case 4: an uninterrupted
// develop span). Advancing the cursor makes the bank idempotent: a second close
// with no further words counts 0. Best-effort: any failure (no sid, unreadable
// transcript) returns the unchanged durable marker and never throws.
export function bankTranscriptTail(projDir) {
  const fallback = () => ({ banked: 0, marker: durableWordMarker(projDir) });
  try {
    const sid = currentSessionId();
    if (!sid) return fallback();
    const markerPath = markerPathFor(sid);
    const marker = loadMarker(markerPath);
    const counted = countWords(jsonlPath(sid), marker.line);
    const tail = Math.max(0, Number(counted.count) || 0);
    const sp = resolveStatePath(projDir);
    const state = loadState(sp);
    const prior = state.lastWordMarker ?? 0;
    const nextMarker = advanceWordMarker(prior, prior + tail);
    if (tail > 0) {
      state.lastWordMarker = nextMarker;
      saveState(state, sp);
      const priorFull = marker.wordsFull ?? marker.words ?? 0;
      const tailFull = Math.max(0, Number(counted.fullExpansion ?? counted.count) || 0);
      const nextFull = advanceWordMarker(priorFull, priorFull + tailFull);
      saveMarker(markerPath, counted.totalLines, nextMarker, state.active, nextFull);
    }
    return { banked: tail, marker: nextMarker };
  } catch {
    return fallback();
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
const WORKTREE_SESSION_FIELDS = ['worktreePath', 'worktreeBranch', 'worktreeResolvedAt'];

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
  // #573: the state file now lives under `<projDir>/.tmp/aitm/state/`. Anchor on
  // the rightmost `/.tmp/aitm/` segment first (worktree-local wins over main, per
  // #332). Checked before the legacy `.ai-task-manager/`/`.claude/` containers so
  // a relocated state path resolves to its true project root.
  const tmpIdx = norm.lastIndexOf(TMP_AITM_SEGMENT);
  if (tmpIdx !== -1) return abs.slice(0, tmpIdx);
  // `.ai-task-manager/` is always a real state container — anchor on the
  // rightmost one (worktree-local wins over main, per #332).
  const aimIdx = norm.lastIndexOf(SHARED_DIR_SEGMENT);
  if (aimIdx !== -1) return abs.slice(0, aimIdx);
  // `.claude/` is trickier: `<main>/.claude/worktrees/<wt>/…` uses `.claude`
  // as a worktree HOST, not a state container. A state file living deeper
  // under such a worktree (e.g. a test sandbox at `<wt>/.tmp/test/…/state.json`)
  // must NOT mis-anchor to `<main>`. Walk `.claude/` matches right-to-left and
  // skip any whose next segment is `worktrees/` (the host marker); the first
  // real container wins. Legacy inner state (`…/<wt>/.claude/state.json`) is
  // followed by the state file, so it still anchors correctly. (#486 follow-up)
  for (let from = norm.length; ;) {
    const idx = norm.lastIndexOf('/.claude/', from);
    if (idx === -1) break;
    const after = norm.slice(idx + '/.claude/'.length);
    if (!after.startsWith('worktrees/')) return abs.slice(0, idx);
    from = idx - 1;
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
  // #1163 — checkout identity is per-session authority. Never inherit it from
  // the global compatibility ledger if an older writer happened to mirror it.
  for (const field of WORKTREE_SESSION_FIELDS) delete base[field];
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
    for (const field of WORKTREE_SESSION_FIELDS) {
      if (active[field] != null) base[field] = active[field];
    }
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
    const worktreeFields = Object.fromEntries(
      WORKTREE_SESSION_FIELDS.filter((field) => state[field] != null).map((field) => [
        field,
        state[field],
      ])
    );
    setActiveTask(
      sid,
      {
        issue: state.active ?? null,
        entryStartTs: state.entryStartTs ?? null,
        wordsAtStart: state.wordsAtEntryStart ?? 0,
        ...worktreeFields,
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
  for (const field of WORKTREE_SESSION_FIELDS) delete globalPayload[field];
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
