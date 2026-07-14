// Single orphan-finalize implementation. Shared by:
//   - hooks/on-user-prompt.mjs        (reason: 'natural')
//   - verbs/start.mjs, verbs/resume.mjs (reason: 'orphan-finalize')
//   - verbs/switch.mjs                 (reason: 'switch', forced)
//   - hook-handler.mjs onSessionStart  (reason: 'stale-session')
//
// EPIC #207 / #215 — Seq 4.
//
// Contract:
//   finalizeOrphanPause({sid, reason}) -> {finalized, issue, idleSeconds, reason} | null
//   finalizePauseForSwitch({sid, oldIssue}) -> {finalized, issue, idleSeconds, reason} | null
//
// Reads `.ai-task-manager/sessions/<sid>/pending-pause.json` (written by
// on-stop.mjs), validates the marker's `sessionId` matches `sid`, computes
// the gap against `Date.now()`, and (when above `pauseThresholdSeconds`)
// appends ONE idle row to the issue NAMED IN THE MARKER (not the currently-
// bound issue) marked `<!-- sess: <sid> reason: <reason> -->`, then deletes
// the marker file. Sub-threshold gaps delete the marker silently and return
// null.
//
// Foreign-session refusal: when `marker.sessionId !== sid`, logs a warning
// to stderr, returns `null`, and DOES NOT delete the file — the real owner
// can still recover it.
//
// All callers go through this module. The `pending-pause.json` literal must
// not appear in any other production source file (see AC8 of #215).

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { getProjectDir, sessionsDir } from './paths.mjs';
import { postTimingEvent, buildRow, readTimingCommentBody, bodyOf } from './gh-timing-comment.mjs';
import { enqueue } from './queue.mjs';
import { pendingPausePath } from './hooks/on-stop.mjs';
import { durableWordMarker } from './state.mjs';
import { lastRowTsFromBody } from './lib/timing-rows.mjs';
import { collectEventTimestamps, computeActiveAndIdleSeconds } from './active-time.mjs';
import { jsonlPath } from './word-counter.mjs';

const VALID_REASONS = new Set(['natural', 'orphan-finalize', 'switch', 'stale-session']);

function readMarker(p) {
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deleteMarker(p) {
  try {
    rmSync(p);
  } catch {
    /* tolerate */
  }
}

export function computeGapSeconds(stoppedAt, nowMs = Date.now()) {
  const t = Date.parse(stoppedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

// Post one row to the marker's issue, falling back to the durable queue on any
// network error. Shared by the active-segment and idle emitters so both honor
// the same never-break-a-hook contract.
async function postRowOrEnqueue({ cfg, projDir, marker, row, deps }) {
  const postFn = deps.postTimingEvent || postTimingEvent;
  const enqueueFn = deps.enqueue || enqueue;
  try {
    await postFn({
      issueNumber: marker.issue,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
  } catch {
    try {
      enqueueFn({ kind: 'timing', issue: marker.issue, row }, path.join(projDir, cfg.queuePath));
    } catch {
      /* drop on the floor; never break a hook */
    }
  }
}

// #802 — credit active work performed inside a non-transitioning state.
//
// Active-duration rows are otherwise emitted ONLY on state transitions (the
// `flushActiveToGH` path). Work done inside a state without transitioning —
// most visibly during `review` (PR push, CI wait, merge via raw git/gh) —
// produced no active row, so the eventual pause-finalize logged the entire
// stop→prompt gap as pure idle and the real effort evaporated.
//
// The fix splits the work turn out of the idle gap: before the idle row for
// `[stoppedAt → now]`, emit an active row crediting `[lastRowTs → stoppedAt]`,
// the interval whose active-vs-idle share we compute from the transcript's
// user/assistant turn timestamps (same machinery `flushActiveToGH` uses).
//
// Returns the credited active seconds (0 when nothing is credited). Skips —
// never fabricates — when there is no readable prior row to anchor the window
// (absent/error/unreadable body), when the window is empty/inverted, or when
// the transcript shows no active seconds in it. Each emitted active row lands
// at ~now and advances the issue's last-row timestamp, so a subsequent
// transition flush (anchored on `max(entryStartTs, lastRowTs)`) cannot
// double-count this same interval.
async function emitActiveWorkSegment({ cfg, projDir, marker, sid, reason, nowIso, deps }) {
  // Mirror runtime's `safeReadLastRowTs` contract: the SKIP_NETWORK escape
  // hatch suppresses the anchor read (and thus the active row) entirely. An
  // injected `readTimingCommentBody` dep overrides this so tests stay hermetic
  // without touching the wire.
  if (process.env.TT_SKIP_NETWORK === '1' && !deps.readTimingCommentBody) return 0;

  const stoppedMs = Date.parse(marker.stoppedAt);
  if (!Number.isFinite(stoppedMs)) return 0;

  const readBody = deps.readTimingCommentBody || readTimingCommentBody;
  let lastRowMs = NaN;
  try {
    const res = await readBody({
      issueNumber: String(marker.issue).replace(/^#/, ''),
      repo: cfg.repo,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
    const tsStr = lastRowTsFromBody(bodyOf(res));
    lastRowMs = tsStr ? Date.parse(tsStr) : NaN;
  } catch {
    return 0;
  }
  // No prior row (or an unreadable one) means the window has no anchor — we
  // cannot know when the work turn began, so we credit nothing rather than
  // inventing a start.
  if (!Number.isFinite(lastRowMs) || stoppedMs <= lastRowMs) return 0;

  const collect = deps.collectEventTimestamps || collectEventTimestamps;
  const events = collect(jsonlPath(marker.sessionId || sid), lastRowMs, stoppedMs);
  const { activeSec } = computeActiveAndIdleSeconds({
    startMs: lastRowMs,
    endMs: stoppedMs,
    events,
    idleThresholdMs: (Number(cfg.idleThresholdMinutes) || 5) * 60_000,
  });
  if (!(activeSec > 0)) return 0;

  const row = buildRow({
    ts: nowIso,
    event: 'active-work',
    activeSec,
    idleSec: 0,
    deltaWords: 0,
    // #475 AC1 — carried-forward durable marker, never null (no live session).
    wordMarker: durableWordMarker(projDir),
    description: `<!-- sess: ${sid} reason: ${reason}-active -->`,
  });
  await postRowOrEnqueue({ cfg, projDir, marker, row, deps });
  return activeSec;
}

async function postOrEnqueue({ cfg, projDir, marker, sid, reason, idleSeconds, nowIso, deps }) {
  // #802 — credit any active work in the [lastRowTs → stoppedAt] turn first,
  // so the idle row below no longer swallows it as pure idle.
  await emitActiveWorkSegment({ cfg, projDir, marker, sid, reason, nowIso, deps });
  const row = buildRow({
    ts: nowIso,
    event: 'idle',
    idleSec: idleSeconds,
    activeSec: 0,
    deltaWords: 0,
    // #475 AC1 — carried-forward durable marker, never null (idle finalize, no live session)
    wordMarker: durableWordMarker(projDir),
    description: `<!-- sess: ${sid} reason: ${reason} -->`,
  });
  await postRowOrEnqueue({ cfg, projDir, marker, row, deps });
  return row;
}

// Core finalize — used by hook, verbs start/resume, and the sweep.
// Returns null on: no sid, no marker, foreign session, or sub-threshold gap.
// Returns {finalized: true, issue, idleSeconds, reason} when a row is posted.
export async function finalizeOrphanPause({
  sid,
  reason,
  projDir = getProjectDir(),
  now = () => new Date(),
  deps = {},
} = {}) {
  if (!sid) return null;
  if (!VALID_REASONS.has(reason)) {
    throw new Error(`finalizeOrphanPause: invalid reason ${JSON.stringify(reason)}`);
  }
  const markerPath = pendingPausePath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return null;

  if (marker.sessionId && marker.sessionId !== sid) {
    process.stderr.write(
      `[task] refusing to consume pending-pause.json from foreign session ${marker.sessionId}\n`
    );
    return null;
  }
  if (!marker.issue) {
    deleteMarker(markerPath);
    return null;
  }

  const cfg = loadConfig();
  const threshold = Number(cfg.pauseThresholdSeconds) || 0;
  const nowDate = now();
  const idleSeconds = computeGapSeconds(marker.stoppedAt, nowDate.getTime());
  if (idleSeconds < threshold) {
    deleteMarker(markerPath);
    return null;
  }

  await postOrEnqueue({
    cfg,
    projDir,
    marker,
    sid,
    reason,
    idleSeconds,
    nowIso: nowDate.toISOString(),
    deps,
  });
  deleteMarker(markerPath);
  return { finalized: true, issue: marker.issue, idleSeconds, reason };
}

// Switch-path finalize — a `/task #N` switch IS a pause, even when the
// inter-turn gap is below threshold. This variant forces the row out
// regardless of `pauseThresholdSeconds`. The row is posted to the OLD
// issue (the one bound at pause time, named in the marker).
export async function finalizePauseForSwitch({
  sid,
  oldIssue: _oldIssue,
  projDir = getProjectDir(),
  now = () => new Date(),
  deps = {},
} = {}) {
  if (!sid) return null;
  const markerPath = pendingPausePath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return null;

  if (marker.sessionId && marker.sessionId !== sid) {
    process.stderr.write(
      `[task] refusing to consume pending-pause.json from foreign session ${marker.sessionId}\n`
    );
    return null;
  }
  if (!marker.issue) {
    deleteMarker(markerPath);
    return null;
  }

  const cfg = loadConfig();
  const nowDate = now();
  const idleSeconds = computeGapSeconds(marker.stoppedAt, nowDate.getTime());
  await postOrEnqueue({
    cfg,
    projDir,
    marker,
    sid,
    reason: 'switch',
    idleSeconds,
    nowIso: nowDate.toISOString(),
    deps,
  });
  deleteMarker(markerPath);
  return { finalized: true, issue: marker.issue, idleSeconds, reason: 'switch' };
}

// Session-dir sweep — finalizes any orphan `pending-pause.json` belonging
// to a stale session BEFORE removing that session's dir, then removes the
// dir. Stale = mtime older than `sessionRetentionDays`.
//
// Returns { swept, finalized } counts. Best-effort — never throws to the
// caller; per-dir errors are swallowed so hook startup is never blocked.
export async function sweepStaleSessionDirs({
  projDir = getProjectDir(),
  now = () => new Date(),
  maxAgeMs,
  deps = {},
} = {}) {
  const cfg = (() => {
    try {
      return loadConfig();
    } catch {
      return {};
    }
  })();
  const ageMs =
    Number.isFinite(maxAgeMs) && maxAgeMs > 0
      ? maxAgeMs
      : Number(cfg.sessionRetentionDays || 2) * 86_400_000;
  const baseDir = sessionsDir(projDir);
  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return { swept: 0, finalized: 0 };
  }
  const nowMs = now().getTime();
  let swept = 0;
  let finalized = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const sid = ent.name;
    const dirPath = path.join(baseDir, sid);
    let st;
    try {
      st = statSync(dirPath);
    } catch {
      continue;
    }
    if (nowMs - st.mtimeMs <= ageMs) continue;
    // Finalize any pending-pause first — under the swept session's own sid
    // so the foreign-session guard does not refuse it.
    try {
      const res = await finalizeOrphanPause({
        sid,
        reason: 'stale-session',
        projDir,
        now,
        deps,
      });
      if (res && res.finalized) finalized += 1;
    } catch {
      /* tolerate */
    }
    try {
      rmSync(dirPath, { recursive: true, force: true });
      swept += 1;
    } catch {
      /* tolerate */
    }
  }
  return { swept, finalized };
}
