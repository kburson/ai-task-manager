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
import { getProjectDir, SHARED_DIR } from './paths.mjs';
import { postTimingEvent, buildRow } from './gh-timing-comment.mjs';
import { enqueue } from './queue.mjs';
import { pendingPausePath } from './hooks/on-stop.mjs';
import { durableWordMarker } from './state.mjs';

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

async function postOrEnqueue({ cfg, projDir, marker, sid, reason, idleSeconds, nowIso, deps }) {
  const postFn = deps.postTimingEvent || postTimingEvent;
  const enqueueFn = deps.enqueue || enqueue;
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
  const baseDir = path.join(projDir, SHARED_DIR, 'sessions');
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
