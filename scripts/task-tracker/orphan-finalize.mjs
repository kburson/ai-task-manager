// Orphan pending-pause cleanup. Shared by:
//   - hooks/on-user-prompt.mjs        (reason: 'natural')
//   - verbs/start.mjs, verbs/resume.mjs (reason: 'orphan-finalize')
//   - verbs/switch.mjs                 (reason: 'switch', forced)
//   - hook-handler.mjs onSessionStart  (reason: 'stale-session')
//
// EPIC #207 / #215 — Seq 4. Emission RETIRED by EPIC #823 (timing model v2) C1.
//
// History: this module used to append `idle` and `active-work` rows to the
// bound issue's `⏱ Timing Log` whenever a Stop-hook natural-gap marker was
// found. Timing model v2 removes the auto-manufacture of idle time entirely —
// idle now exists ONLY inside an explicit `/task pause` (or `switch-out`) →
// `/task resume` bracket. So this module no longer emits any timing row; it
// retains only the marker-cleanup contract so a stale `pending-pause.json`
// left by an older session (or a session sweep) is still removed.
//
// Contract (v2):
//   finalizeOrphanPause({sid, reason}) -> null   (marker read + deleted, no row)
//   finalizePauseForSwitch({sid})      -> null   (marker read + deleted, no row)
//
// Foreign-session refusal is preserved: when `marker.sessionId !== sid`, logs a
// warning to stderr, returns `null`, and DOES NOT delete the file — the real
// owner can still recover it.

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { getProjectDir, sessionsDir } from './paths.mjs';
import { pendingPausePath } from './hooks/on-stop.mjs';

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

// Consume (delete) a stale pending-pause marker without emitting any timing
// row. Preserves the foreign-session refusal so a marker owned by a different
// session is left untouched for its real owner. Always returns null in v2 —
// there is no idle finalization anymore. Callers (on-user-prompt, resume,
// sweep) already tolerate a null return.
function consumeMarker({ sid, projDir }) {
  const markerPath = pendingPausePath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return null;
  if (marker.sessionId && marker.sessionId !== sid) {
    process.stderr.write(
      `[task] refusing to consume pending-pause.json from foreign session ${marker.sessionId}\n`
    );
    return null;
  }
  deleteMarker(markerPath);
  return null;
}

// Natural / orphan / stale-session finalize. v2: no row is posted; the stale
// marker is simply cleaned up. Retained for caller compatibility.
export async function finalizeOrphanPause({ sid, reason, projDir = getProjectDir() } = {}) {
  if (!sid) return null;
  if (!VALID_REASONS.has(reason)) {
    throw new Error(`finalizeOrphanPause: invalid reason ${JSON.stringify(reason)}`);
  }
  return consumeMarker({ sid, projDir });
}

// Switch-path finalize. v2: no row is posted; the outgoing issue's switch-out
// bracket is recorded by the switch verb itself, not here. Retained for caller
// compatibility (verbs/switch.mjs).
export async function finalizePauseForSwitch({
  sid,
  oldIssue: _oldIssue,
  projDir = getProjectDir(),
} = {}) {
  if (!sid) return null;
  return consumeMarker({ sid, projDir });
}

// Session-dir sweep — removes stale session dirs (mtime older than
// `sessionRetentionDays`), cleaning up any orphan `pending-pause.json` under
// each before removal. Best-effort — never throws to the caller.
//
// Returns { swept } counts. (The `finalized` count is gone in v2: no session
// dir sweep can emit a timing row anymore.)
export async function sweepStaleSessionDirs({
  projDir = getProjectDir(),
  now = () => new Date(),
  maxAgeMs,
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
    return { swept: 0 };
  }
  const nowMs = now().getTime();
  let swept = 0;
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
    try {
      rmSync(dirPath, { recursive: true, force: true });
      swept += 1;
    } catch {
      /* tolerate */
    }
  }
  return { swept };
}
